import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/support_api_service.dart';
import '../../state/session_provider.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

const _blue = Color(0xFF3946C5);
const _greeting = SupportMessage(
  'bot',
  'Hi! I’m the AcademiX Help Assistant. Ask me how to use the website or app. For a bug or a question I cannot solve, you can report an issue or connect to a technician. Never share passwords, verification codes or private records.',
);

class SupportScreen extends ConsumerStatefulWidget {
  final bool teacher;
  const SupportScreen({super.key, this.teacher = false});

  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen>
    with WidgetsBindingObserver {
  final _input = TextEditingController();
  final _subject = TextEditingController();
  final _description = TextEditingController();
  final _form = GlobalKey<FormState>();
  final _cancel = CancelToken();
  final _scroll = ScrollController();
  final _botMessages = <SupportMessage>[_greeting];
  List<String> _suggestions = [
    'How do I submit homework?',
    'How do I use Sam?',
    'My microphone is not working',
  ];
  List<SupportTicket> _tickets = [];
  SupportThread? _thread;
  String? _selected;
  String? _category;
  String? _reportId;
  String? _replyId;
  String? _replyText;
  String? _error;
  String? _listError;
  String? _warning;
  int? _nextOffset;
  int _epoch = 0;
  bool _busy = false;
  bool _listBusy = false;
  bool _threadBusy = false;
  bool _threadPending = false;
  bool _needsTechnician = false;
  Timer? _listTimer;
  Timer? _threadTimer;

  SupportApiService get _api => ref.read(supportApiServiceProvider);

  @override
  void initState() {
    super.initState();
    if (widget.teacher) {
      _botMessages[0] = const SupportMessage(
        'bot',
        'Hi! I’m the AcademiX Teacher Help Assistant. Ask me about using the teacher website or app: announcements, homework, tests, students and progress. Report an issue or connect to a technician if you need more help. Never share passwords, verification codes or private student records. I cannot provide internal technical information or academic answers.',
      );
      _suggestions = [
        'How do I assign homework?',
        'How do I create a test?',
        'How do I use AI Assistant?',
      ];
    }
    WidgetsBinding.instance.addObserver(this);
    _refreshList();
    _startTimers();
  }

  void _startTimers() {
    _listTimer?.cancel();
    _threadTimer?.cancel();
    _listTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _refreshList(),
    );
    _threadTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _refreshThread(),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refreshList();
      _refreshThread();
      _startTimers();
    } else {
      _listTimer?.cancel();
      _threadTimer?.cancel();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _listTimer?.cancel();
    _threadTimer?.cancel();
    _cancel.cancel();
    _input.dispose();
    _subject.dispose();
    _description.dispose();
    _scroll.dispose();
    super.dispose();
  }

  bool _cancelled(Object e) => e is DioException && CancelToken.isCancel(e);

  void _scrollToConversationEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _refreshList({bool more = false}) async {
    if (_listBusy || (more && _nextOffset == null)) return;
    _listBusy = true;
    try {
      final page = await _api.list(
        offset: more ? _nextOffset! : 0,
        cancelToken: _cancel,
      );
      if (!mounted) return;
      setState(() {
        // Preserve loaded older requests when the first page polls again.
        final incomingIds = page.tickets.map((t) => t.id).toSet();
        _tickets = more
            ? [
                ..._tickets,
                ...page.tickets.where(
                  (t) => !_tickets.any((old) => old.id == t.id),
                ),
              ]
            : [
                ...page.tickets,
                ..._tickets.skip(50).where(
                  (t) => !incomingIds.contains(t.id) && !t.expired,
                ),
              ];
        if (more || _tickets.length <= 50) _nextOffset = page.nextOffset;
        _listError = null;
      });
    } catch (e) {
      if (mounted && !_cancelled(e)) setState(() => _listError = e.toString());
    } finally {
      _listBusy = false;
    }
  }

  Future<void> _refreshThread() async {
    final id = _selected;
    if (id == null || _cancel.isCancelled) return;
    if (_threadBusy) {
      _threadPending = true;
      return;
    }
    _threadBusy = true;
    try {
      final thread = await _api.thread(id, cancelToken: _cancel);
      if (mounted && _selected == id) {
        setState(() {
          _thread = thread;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted && _selected == id && !_cancelled(e)) {
        setState(() {
          if (e is SupportApiException && e.statusCode == 404) {
            _thread = null;
            _tickets.removeWhere((ticket) => ticket.id == id);
          }
          _error = e.toString();
        });
      }
    } finally {
      _threadBusy = false;
      if (mounted &&
          !_cancel.isCancelled &&
          (_threadPending || _selected != id)) {
        _threadPending = false;
        _refreshThread();
      }
    }
  }

  void _select(String? id) {
    if (_busy && (_category != null || _selected != null)) return;
    setState(() {
      _epoch++;
      _busy = false;
      _selected = id;
      _category = null;
      _thread = null;
      _error = null;
      _warning = null;
      _input.clear();
      _replyId = null;
      _replyText = null;
    });
    _refreshThread();
  }

  void _report(String category) {
    if (_busy && (_category != null || _selected != null)) return;
    setState(() {
      _epoch++;
      _busy = false;
      _selected = null;
      _category = category;
      _reportId = newSupportId();
      _subject.clear();
      _description.text =
          _botMessages.where((m) => m.role == 'user').lastOrNull?.content ?? '';
      _error = null;
      _warning = null;
    });
  }

  Future<void> _ask([String? suggestion]) async {
    final text = (suggestion ?? _input.text).trim();
    if (text.isEmpty || _busy) return;
    if (text == 'Report an issue' || text == 'Report a glitch') {
      _report('glitch');
      return;
    }
    if (text == 'Connect to a technician') {
      _report('technician');
      return;
    }
    final epoch = _epoch;
    final questions = _botMessages
        .where((message) => message.role == 'user')
        .map((message) => message.content)
        .toList();
    final previousQuestions = questions.length > 4
        ? questions.sublist(questions.length - 4)
        : questions;
    setState(() {
      _busy = true;
      _error = null;
      _input.clear();
      _botMessages.add(SupportMessage('user', text));
    });
    try {
      final data = await _api.ask(
        text,
        previousQuestions: previousQuestions,
        cancelToken: _cancel,
      );
      if (!mounted || epoch != _epoch) return;
      setState(() {
        _botMessages.add(SupportMessage('bot', data.reply));
        _suggestions = data.suggestions;
        _needsTechnician = data.needsTechnician;
      });
      _scrollToConversationEnd();
    } catch (e) {
      if (mounted && epoch == _epoch && !_cancelled(e)) {
        setState(() => _error = e.toString());
      }
    } finally {
      if (mounted && epoch == _epoch) setState(() => _busy = false);
    }
  }

  Future<void> _submitReport() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await _api.create(
        id: _reportId!,
        category: _category!,
        subject: _subject.text.trim(),
        description: _description.text.trim(),
        recentMessages: _botMessages,
        cancelToken: _cancel,
      );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _category = null;
      });
      _select(data.ticket.id);
      setState(() => _warning = data.notificationWarning);
      _refreshList();
    } catch (e) {
      if (mounted && !_cancelled(e)) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendReply() async {
    final text = _input.text.trim();
    final id = _selected;
    if (_busy || text.isEmpty || id == null || _thread == null) return;
    if (_replyText != text) {
      _replyText = text;
      _replyId = newSupportId();
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final warning = await _api.reply(
        id,
        _replyId!,
        text,
        cancelToken: _cancel,
      );
      if (!mounted || _selected != id) return;
      setState(() {
        _input.clear();
        _replyId = null;
        _replyText = null;
        _warning = warning;
      });
      await _refreshThread();
      _refreshList();
    } catch (e) {
      if (mounted && _selected == id && !_cancelled(e)) {
        setState(() => _error = e.toString());
      }
    } finally {
      if (mounted && _selected == id) setState(() => _busy = false);
    }
  }

  Future<void> _retryEmail() async {
    if (_busy || _selected == null) return;
    final id = _selected!;
    setState(() => _busy = true);
    try {
      final warning = await _api.retryNotification(id, cancelToken: _cancel);
      if (mounted && _selected == id) setState(() => _warning = warning);
    } catch (e) {
      if (mounted && _selected == id && !_cancelled(e)) {
        setState(() => _error = e.toString());
      }
    } finally {
      if (mounted && _selected == id) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(sessionProvider, (previous, next) {
      if (previous?.value?.userId != null &&
          previous?.value?.userId != next.value?.userId) {
        _cancel.cancel();
        _listTimer?.cancel();
        _threadTimer?.cancel();
        if (Navigator.of(context).canPop()) Navigator.of(context).pop();
      }
    });
    final saving = _busy && (_category != null || _selected != null);
    return PopScope(
      canPop: !saving,
      child: Theme(
        data: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: _blue,
            brightness: Theme.of(context).brightness,
            surface: AppColors.of(context).card,
          ),
          scaffoldBackgroundColor: AppColors.of(context).background,
          textTheme: Theme.of(
            context,
          ).textTheme.apply(bodyColor: AppColors.of(context).text, displayColor: AppColors.of(context).text),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: AppColors.of(context).card,
            border: OutlineInputBorder(),
          ),
        ),
        child: Scaffold(
          appBar: AppBar(
            title: Text(widget.teacher ? 'Teacher Support' : 'Technical Query'),
          ),
          body: RefreshIndicator(
            onRefresh: () async {
              await _refreshList();
              await _refreshThread();
            },
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.all(16),
              children: [
                _card(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'WEBSITE & APP HELP',
                        style: TextStyle(
                          color: AppColors.of(context).accent,
                          fontWeight: FontWeight.w800,
                          fontSize: 11,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Get help with AcademiX, report an issue, or speak with a technician.',
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton(
                            onPressed: saving ? null : () => _report('glitch'),
                            child: const Text('Report an issue'),
                          ),
                          FilledButton(
                            onPressed: saving
                                ? null
                                : () => _report('technician'),
                            child: const Text('Connect to a technician'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                _card(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      OutlinedButton.icon(
                        onPressed: saving ? null : () => _select(null),
                        icon: const Icon(Icons.support_agent),
                        label: const Text('Help Assistant'),
                      ),
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Your requests',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ),
                          TextButton(
                            onPressed: () => _refreshList(),
                            child: const Text('Refresh'),
                          ),
                        ],
                      ),
                      if (_tickets.isEmpty && _listError == null)
                        const Text(
                          'Your reports and technician chats appear here.',
                        ),
                      for (final ticket in _tickets)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          selected: _selected == ticket.id,
                          title: Text(ticket.subject),
                          subtitle: Text(
                            '${ticket.category == 'glitch' ? 'Issue report' : 'Technician chat'} · ${ticket.status == 'resolved' ? 'Resolved' : 'Open'} · #${ticket.id.substring(0, 8)}',
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: saving
                              ? null
                              : () => _select(
                                  _selected == ticket.id ? null : ticket.id,
                                ),
                        ),
                      if (_listError != null) ErrorInline(message: _listError!),
                      if (_nextOffset != null)
                        TextButton(
                          onPressed: () => _refreshList(more: true),
                          child: const Text('Show more requests'),
                        ),
                    ],
                  ),
                ),
                _card(_category != null ? _reportForm() : _conversation()),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _card(Widget child) => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: AppColors.of(context).card,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: AppColors.of(context).line),
    ),
    child: Material(color: AppColors.of(context).card, child: child),
  );

  Widget _reportForm() => Form(
    key: _form,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _category == 'glitch' ? 'Report an issue' : 'Connect to a technician',
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
        ),
        const SizedBox(height: 10),
        const Text(
          'Your account role, name, school and class identify this request automatically. Your recent questions are included; do not include passwords or private records.',
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _subject,
          maxLength: 120,
          enabled: !_busy,
          decoration: const InputDecoration(
            labelText: 'Short title',
            hintText: 'For example: Homework submit button is not responding',
          ),
          validator: (text) => text == null || text.trim().isEmpty
              ? 'Please enter a short title.'
              : null,
        ),
        TextFormField(
          controller: _description,
          maxLength: 4000,
          minLines: 4,
          maxLines: 8,
          enabled: !_busy,
          decoration: const InputDecoration(
            labelText: 'What happened?',
            hintText:
                'Which feature? What did you try, and what happened instead?',
          ),
          validator: (text) => text == null || text.trim().isEmpty
              ? 'Please describe the issue.'
              : null,
        ),
        const Text(
          'A technician receives an email notification and replies here. This is not an instant live-chat guarantee—return to Your requests to check replies.',
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: ErrorInline(message: _error!),
          ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton(
              onPressed: _busy ? null : () => _select(null),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: _busy ? null : _submitReport,
              child: _busy ? _spinner() : const Text('Send to technician'),
            ),
          ],
        ),
      ],
    ),
  );

  Widget _conversation() {
    final bot = _selected == null;
    final messages = bot
        ? _botMessages
        : _thread?.messages ?? <SupportMessage>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!bot) ...[
          Text(
            _thread?.ticket.subject ?? 'Your request',
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(
            _thread?.ticket.status == 'resolved'
                ? 'Resolved. This request and its messages are automatically deleted 48 hours after resolution. Sending another message before then reopens it.'
                : 'Sent to the technician. Replies appear here.',
          ),
          TextButton(
            onPressed: _busy ? null : _refreshThread,
            child: const Text('Check replies'),
          ),
        ],
        for (final message in messages) _message(message),
        if (_busy && bot)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Semantics(
              label: 'Assistant is replying',
              child: Text(
                '•••',
                style: TextStyle(color: AppColors.of(context).accent, fontSize: 22),
              ),
            ),
          ),
        if (bot && _needsTechnician)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text('Still need help? Use Connect to a technician above.'),
          ),
        if (bot)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final suggestion in _suggestions)
                OutlinedButton(
                  onPressed: _busy ? null : () => _ask(suggestion),
                  child: Text(suggestion),
                ),
            ],
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: ErrorInline(message: _error!),
          ),
        if (_warning != null)
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.symmetric(vertical: 12),
            color: const Color(0xFFFFF3D6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _warning!,
                  style: const TextStyle(color: Color(0xFF704800)),
                ),
                TextButton(
                  onPressed: _busy ? null : _retryEmail,
                  child: const Text('Retry email notification'),
                ),
              ],
            ),
          ),
        const SizedBox(height: 12),
        TextField(
          controller: _input,
          maxLength: 2000,
          minLines: 2,
          maxLines: 5,
          enabled: !_busy && (bot || _thread != null),
          decoration: InputDecoration(
            labelText: 'Message',
            hintText: bot
                ? 'Ask how to use AcademiX…'
                : 'Message the technician…',
          ),
          onChanged: (_) => setState(() {}),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton.icon(
            onPressed:
                _busy || _input.text.trim().isEmpty || (!bot && _thread == null)
                ? null
                : bot
                ? () => _ask()
                : _sendReply,
            icon: _busy ? _spinner() : const Icon(Icons.send_rounded, size: 18),
            label: const Text('Send'),
          ),
        ),
        Text(
          bot
              ? 'The assistant gives verified feature guidance, not academic answers. Only questions you send to a technician are saved.'
              : 'Never share passwords, verification codes or confidential records. Replies refresh automatically while this chat is open.',
          style: const TextStyle(fontSize: 12),
        ),
      ],
    );
  }

  Widget _spinner() => const SizedBox(
    width: 18,
    height: 18,
    child: CircularProgressIndicator(strokeWidth: 2),
  );

  Widget _message(SupportMessage message) {
    final student =
        message.role == 'user' ||
        message.role == 'student' ||
        message.role == 'teacher';
    final owner = message.role == 'owner';
    return Align(
      alignment: student ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        constraints: const BoxConstraints(maxWidth: 600),
        decoration: BoxDecoration(
          color: student
              ? _blue
              : owner
              ? Color.alphaBlend(AppColors.ok.withValues(alpha: 0.12), AppColors.of(context).card)
              : AppColors.of(context).brandSoft,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              student
                  ? (message.role == 'teacher' ||
                            (message.role == 'user' && widget.teacher)
                        ? 'Teacher'
                        : 'Student')
                  : owner
                  ? 'Technician'
                  : 'Help Assistant',
              style: TextStyle(
                color: student ? Colors.white : AppColors.of(context).text,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            SelectableText(
              message.content,
              style: TextStyle(color: student ? Colors.white : AppColors.of(context).text),
            ),
          ],
        ),
      ),
    );
  }
}

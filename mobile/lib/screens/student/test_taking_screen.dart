import 'package:flutter/material.dart';
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'homework/homework_history_calendar.dart';
import '../../models/test_item.dart';
import '../../models/test_question.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../state/exam_access_provider.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';
import '../../widgets/shimmer_wave.dart';

/// One-question-at-a-time mobile test-taking flow (per the mobile design
/// brief — not a copy of web's layout, which doesn't have this at all yet).
/// Requires an explicit confirmation before the final submit so a stray tap
/// can't accidentally end the attempt.
class TestTakingScreen extends ConsumerStatefulWidget {
  final TestItem test;

  const TestTakingScreen({super.key, required this.test});

  @override
  ConsumerState<TestTakingScreen> createState() => _TestTakingScreenState();
}

class _TestTakingScreenState extends ConsumerState<TestTakingScreen>
    with WidgetsBindingObserver {
  bool _loading = true;
  String? _error;
  String? _attemptId;
  List<TestQuestion> _questions = [];
  int _index = 0;
  final Map<String, int> _answers = {};
  final Map<String, int> _pendingAnswers = {};
  bool _submitting = false;
  Map<String, dynamic>? _result;
  bool _strict = false;
  bool _paused = false;
  bool _saving = false;
  bool _syncing = false;
  String? _controlError;
  DateTime? _endAt;
  Duration _serverOffset = Duration.zero;
  int? _secondsLeft;
  Timer? _timer;
  Timer? _heartbeat;
  int _revision = -1;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _prepare());
  }

  Future<void> _prepare() async {
    if (widget.test.strictMode) {
      final accepted = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('Strict mock exam'),
          content: const Text(
            'AI Tutor is unavailable during the scheduled exam. Switching apps, leaving this test or losing connection pauses your answers. The clock keeps running. Only your assigning teacher can resume you. System interruptions may also be recorded for review.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Start exam'),
            ),
          ],
        ),
      );
      if (!mounted) return;
      if (accepted != true) {
        Navigator.pop(context);
        return;
      }
    }
    await _start();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _heartbeat?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_strict && _result == null && state != AppLifecycleState.resumed) {
      _pause('app_background');
    } else if (_strict && state == AppLifecycleState.resumed) {
      _sync();
    }
  }

  void _applyControl(Map<String, dynamic> data) {
    final control = Map<String, dynamic>.from(data['control'] as Map);
    final revision = (control['revision'] as num?)?.toInt() ?? 0;
    if (revision < _revision) return;
    _revision = revision;
    final serverNow = DateTime.tryParse(control['serverNow']?.toString() ?? '');
    if (serverNow != null) _serverOffset = serverNow.difference(DateTime.now());
    _endAt = DateTime.tryParse(control['endAt']?.toString() ?? '') ?? _endAt;
    final status = control['status']?.toString();
    final service = ref.read(studentApiServiceProvider);
    if (status != 'active') service.pendingExamIncidents.remove(_attemptId);
    setState(() {
      _paused =
          status != 'active' ||
          service.pendingExamIncidents.containsKey(_attemptId);
      _controlError = null;
      if (status != 'active') {
        _pendingAnswers.clear();
        _answers
          ..clear()
          ..addAll(
            (control['answers'] as Map? ?? {}).map(
              (key, value) => MapEntry(key.toString(), (value as num).toInt()),
            ),
          );
      }
      if (data['result'] is Map) {
        _result = Map<String, dynamic>.from(data['result'] as Map);
      }
    });
    if (_result != null) {
      _heartbeat?.cancel();
      _timer?.cancel();
      ref.invalidate(examAccessProvider);
      ref.invalidate(testsProvider);
    }
  }

  Future<void> _sync({Map<String, int>? answers}) async {
    if (!_strict || _attemptId == null || _result != null || _syncing) return;
    _syncing = true;
    final service = ref.read(studentApiServiceProvider);
    try {
      final reason = service.pendingExamIncidents[_attemptId];
      final toSave = Map<String, int>.from(_pendingAnswers);
      final data = await service.controlExam(
        _attemptId!,
        action: reason != null
            ? 'pause'
            : toSave.isNotEmpty
            ? 'save'
            : 'heartbeat',
        reason: reason,
        answers: toSave.isNotEmpty ? toSave : null,
      );
      if ((data['control'] as Map)['status'] == 'active' && reason == null) {
        for (final entry in toSave.entries) {
          if (_pendingAnswers[entry.key] == entry.value) {
            _pendingAnswers.remove(entry.key);
          }
        }
      }
      if (mounted) _applyControl(data);
    } catch (error) {
      if (mounted) {
        setState(
          () => _controlError =
              'Unable to synchronize your exam: $error. Answers are locked while reconnecting.',
        );
      }
    } finally {
      _syncing = false;
    }
  }

  Future<void> _pause(String reason) async {
    if (!_strict || _attemptId == null || _result != null) return;
    final service = ref.read(studentApiServiceProvider);
    service.pendingExamIncidents[_attemptId!] = reason;
    if (mounted) setState(() => _paused = true);
    // Send independently of a heartbeat/save already in flight.
    try {
      final data = await service.controlExam(
        _attemptId!,
        action: 'pause',
        reason: reason,
      );
      if (mounted) _applyControl(data);
    } catch (error) {
      if (mounted) {
        setState(
          () => _controlError =
              'Unable to notify your teacher: $error. Retrying automatically.',
        );
      }
    }
  }

  Future<void> _select(String id, int value) async {
    if (_paused ||
        _saving ||
        _controlError != null ||
        _syncing ||
        _submitting) {
      return;
    }
    setState(() {
      _answers[id] = value;
      if (_strict) _pendingAnswers[id] = value;
      _saving = _strict;
    });
    if (_strict) {
      await _sync(answers: {id: value});
      if (mounted) setState(() => _saving = false);
    }
  }

  void _tick() {
    if (!mounted || _endAt == null || _result != null) return;
    final seconds = _endAt!
        .difference(DateTime.now().add(_serverOffset))
        .inSeconds
        .clamp(0, 2147483647);
    setState(() => _secondsLeft = seconds);
    if (seconds == 0) {
      if (_strict) {
        _sync();
      } else if (!_submitting) {
        _submit();
      }
    }
  }

  Future<void> _start() async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ref
          .read(studentApiServiceProvider)
          .startTest(widget.test.id, studentId);
      if (!mounted) return;
      if (widget.test.strictMode && res['strictMode'] != true) {
        throw Exception(
          'Strict exam controls are unavailable. Please update the backend.',
        );
      }
      final list = (res['questions'] as List? ?? [])
          .map(
            (q) => TestQuestion.fromJson(Map<String, dynamic>.from(q as Map)),
          )
          .toList();
      setState(() {
        _attemptId = res['attemptId']?.toString();
        _questions = list;
        _strict = res['strictMode'] == true;
        _endAt = widget.test.endAt;
        _answers
          ..clear()
          ..addAll(
            (res['answers'] as Map? ?? {}).map(
              (key, value) => MapEntry(key.toString(), (value as num).toInt()),
            ),
          );
        _loading = false;
      });
      if (_strict) {
        _applyControl(res);
        await _sync();
        if (!mounted) return;
        _heartbeat?.cancel();
        _heartbeat = Timer.periodic(const Duration(seconds: 5), (_) => _sync());
      }
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
      _tick();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _confirmAndSubmit() async {
    if (_strict && (_paused || _saving || _controlError != null)) return;
    final unanswered = _questions
        .where((q) => !_answers.containsKey(q.id))
        .length;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Submit test?'),
        content: Text(
          unanswered > 0
              ? 'You have $unanswered unanswered question${unanswered == 1 ? '' : 's'}. Submit anyway?'
              : 'This will finish your attempt. You cannot change your answers after submitting.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _submit();
  }

  Future<void> _submit() async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    final attemptId = _attemptId;
    if (attemptId == null) return;
    setState(() => _submitting = true);
    try {
      final res = await ref
          .read(studentApiServiceProvider)
          .submitTestAttempt(attemptId, studentId, _answers);
      if (!mounted) return;
      setState(() {
        _result = res;
        _submitting = false;
      });
      _heartbeat?.cancel();
      _timer?.cancel();
      ref.invalidate(examAccessProvider);
      ref.invalidate(testsProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Submit failed: $e')));
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_strict || _result != null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _pause('left_test');
      },
      child: Scaffold(
        appBar: AppBar(title: Text(widget.test.title)),
        body: SafeArea(
          child: Column(
            children: [
              if (_secondsLeft != null && _result == null)
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text(
                    'Time remaining: ${_secondsLeft! ~/ 60}:${(_secondsLeft! % 60).toString().padLeft(2, '0')}',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              Expanded(child: _buildBody()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return ShimmerGroup(
        child: ListView(
          padding: const EdgeInsets.all(16),
          physics: const NeverScrollableScrollPhysics(),
          children: [
            const SkeletonBlock(height: 8, radius: 4),
            const SizedBox(height: 20),
            const SkeletonCard(child: SkeletonBlock(height: 60, radius: 10)),
            const SizedBox(height: 14),
            for (var i = 0; i < 4; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: const SkeletonBlock(height: 46, radius: 12),
              ),
          ],
        ),
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ErrorInline(message: _error!),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _start, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    if (_result != null) {
      return _ResultView(
        result: _result!,
        onDone: () => Navigator.of(context).pop(),
      );
    }
    if (_strict && (_paused || _controlError != null)) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Icon(
            Icons.pause_circle_outline_rounded,
            size: 48,
            color: AppColors.of(context).accent,
          ),
          const SizedBox(height: 12),
          const Text(
            'Test paused',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22),
          ),
          const SizedBox(height: 12),
          const Text(
            'Only your assigning teacher can resume your answers. The clock continues. At the scheduled end, your saved answers are submitted automatically.',
            textAlign: TextAlign.center,
          ),
          if (_controlError != null) ErrorInline(message: _controlError!),
        ],
      );
    }
    if (_questions.isEmpty) {
      return Center(
        child: Text(
          'No questions available for this test.',
          style: TextStyle(color: AppColors.of(context).muted),
        ),
      );
    }

    final question = _questions[_index];
    final selected = _answers[question.id];

    return Column(
      children: [
        LinearProgressIndicator(
          value: (_index + 1) / _questions.length,
          backgroundColor: AppColors.of(context).line,
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Text(
            'Question ${_index + 1} of ${_questions.length}',
            style: TextStyle(color: AppColors.of(context).muted, fontSize: 12),
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                question.text,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              RadioGroup<int>(
                groupValue: selected,
                onChanged: (v) {
                  if (v != null) _select(question.id, v);
                },
                child: Column(
                  children: [
                    for (var i = 0; i < question.options.length; i++)
                      RadioListTile<int>(
                        value: i,
                        title: Text(question.options[i]),
                        enabled: !_saving && !_submitting,
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              if (_index > 0)
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => setState(() => _index -= 1),
                    child: const Text('Previous'),
                  ),
                ),
              if (_index > 0) const SizedBox(width: 12),
              Expanded(
                child: _index < _questions.length - 1
                    ? ElevatedButton(
                        onPressed: () => setState(() => _index += 1),
                        child: const Text('Next'),
                      )
                    : ElevatedButton(
                        onPressed: _submitting || _saving
                            ? null
                            : _confirmAndSubmit,
                        child: _submitting
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Review & Submit'),
                      ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ResultView extends StatelessWidget {
  final Map<String, dynamic> result;
  final VoidCallback onDone;

  const _ResultView({required this.result, required this.onDone});

  @override
  Widget build(BuildContext context) {
    final score = (result['score'] as num?)?.toInt() ?? 0;
    final feedback = result['feedback']?.toString() ?? '';
    final perQuestionFeedback = (result['perQuestionFeedback'] as List? ?? [])
        .map((f) => Map<String, dynamic>.from(f as Map))
        .toList();
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 12),
          Center(
            child: Column(
              children: [
                Text(
                  '$score%',
                  style: TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.w800,
                    color: AppColors.of(context).accent,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  feedback,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.of(context).muted,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
          if (perQuestionFeedback.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text(
              'Question breakdown',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: HomeworkColors.of(context).text(Color(0xFF1F2347)),
              ),
            ),
            const SizedBox(height: 8),
            for (var i = 0; i < perQuestionFeedback.length; i++)
              _QuestionFeedbackCard(index: i, feedback: perQuestionFeedback[i]),
          ],
          const SizedBox(height: 20),
          Center(
            child: ElevatedButton(onPressed: onDone, child: const Text('Done')),
          ),
        ],
      ),
    );
  }
}

class _QuestionFeedbackCard extends StatelessWidget {
  final int index;
  final Map<String, dynamic> feedback;

  const _QuestionFeedbackCard({required this.index, required this.feedback});

  @override
  Widget build(BuildContext context) {
    final isCorrect = feedback['isCorrect'] == true;
    final text = feedback['text']?.toString() ?? '';
    final options =
        (feedback['options'] as List?)?.map((o) => o.toString()).toList() ??
        const <String>[];
    final selected = (feedback['selectedOption'] as num?)?.toInt() ?? -1;
    final correct = (feedback['correctOption'] as num?)?.toInt() ?? -1;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: isCorrect
            ? const Color(0xFF22C55E).withValues(alpha: 0.08)
            : const Color(0xFFEF4444).withValues(alpha: 0.08),
        border: Border.all(
          color: (isCorrect ? const Color(0xFF22C55E) : const Color(0xFFEF4444))
              .withValues(alpha: 0.25),
        ),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${index + 1}. $text',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: HomeworkColors.of(context).text(Color(0xFF1F2347)),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Your answer: ${selected >= 0 && selected < options.length ? options[selected] : 'Not answered'} ${isCorrect ? '\u2713' : '\u2717'}',
            style: TextStyle(
              fontSize: 12,
              color: HomeworkColors.of(context).text(Color(0xFF374151)),
            ),
          ),
          if (!isCorrect)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                'Correct answer: ${correct >= 0 && correct < options.length ? options[correct] : '\u2014'}',
                style: TextStyle(
                  fontSize: 12,
                  color: HomeworkColors.of(context).accent(Color(0xFF047857)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

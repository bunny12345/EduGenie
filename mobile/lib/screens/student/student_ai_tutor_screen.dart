import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/chat_message.dart';
import '../../models/curriculum_lesson.dart';
import '../../state/student_providers.dart';
import '../../state/tutor_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

/// AI Tutor — full-screen chat. Same conversationId format, lesson context
/// and follow-up suggestions as web (`StudentDashboard.jsx`'s tutor panel).
/// Voice/TTS playback is deferred to a later increment (text chat first).
class StudentAiTutorScreen extends ConsumerStatefulWidget {
  const StudentAiTutorScreen({super.key});

  @override
  ConsumerState<StudentAiTutorScreen> createState() => _StudentAiTutorScreenState();
}

class _StudentAiTutorScreenState extends ConsumerState<StudentAiTutorScreen> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      _scrollCtrl.animateTo(_scrollCtrl.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  Future<void> _send([String? overrideText]) async {
    final text = overrideText ?? _inputCtrl.text;
    if (text.trim().isEmpty) return;
    _inputCtrl.clear();
    await ref.read(tutorProvider.notifier).sendMessage(text);
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(studentSubjectsProvider);
    final tutorState = ref.watch(tutorProvider);

    // Default to the first subject once the class's subject list resolves —
    // mirrors the equivalent effect in StudentDashboard.jsx.
    if (tutorState.subject.isEmpty && subjects.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(tutorProvider.notifier).ensureSubject(subjects.first);
      });
    }

    final lessonsAsync = tutorState.subject.isEmpty
        ? const AsyncValue<List<CurriculumLesson>>.data([])
        : ref.watch(curriculumLessonsProvider(tutorState.subject));

    return Scaffold(
      appBar: AppBar(title: const Text('AI Tutor')),
      body: SafeArea(
        child: Column(
          children: [
            _ContextHeader(subjects: subjects, tutorState: tutorState, lessonsAsync: lessonsAsync),
            Expanded(
              child: tutorState.lesson == null
                  ? const _SelectLessonPrompt()
                  : _ChatArea(tutorState: tutorState, scrollCtrl: _scrollCtrl, onFollowupTap: _send),
            ),
            if (tutorState.lesson != null) _InputRow(controller: _inputCtrl, sending: tutorState.sending, onSend: _send),
          ],
        ),
      ),
    );
  }
}

class _ContextHeader extends ConsumerWidget {
  final List<String> subjects;
  final TutorState tutorState;
  final AsyncValue<List<CurriculumLesson>> lessonsAsync;

  const _ContextHeader({required this.subjects, required this.tutorState, required this.lessonsAsync});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lessons = lessonsAsync.value ?? const <CurriculumLesson>[];
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.line))),
      child: Row(
        children: [
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                isExpanded: true,
                value: subjects.contains(tutorState.subject) ? tutorState.subject : null,
                hint: const Text('Subject', style: TextStyle(fontSize: 13)),
                items: subjects.map((s) => DropdownMenuItem(value: s, child: Text(s, style: const TextStyle(fontSize: 13)))).toList(),
                onChanged: (s) {
                  if (s != null) ref.read(tutorProvider.notifier).setSubject(s);
                },
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                isExpanded: true,
                value: tutorState.lesson?.id,
                hint: const Text('Select a lesson', style: TextStyle(fontSize: 13)),
                items: lessons
                    .map((l) => DropdownMenuItem(value: l.id, child: Text(l.title, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13))))
                    .toList(),
                onChanged: (id) {
                  final lesson = lessons.where((l) => l.id == id).firstOrNull;
                  ref.read(tutorProvider.notifier).selectLesson(lesson);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SelectLessonPrompt extends StatelessWidget {
  const _SelectLessonPrompt();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('📚', style: TextStyle(fontSize: 40)),
            const SizedBox(height: 12),
            const Text('Select a lesson to get started', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 6),
            const Text(
              "Choose a subject and lesson above — Sam will start a focused session just for that lesson.",
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.muted, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatArea extends StatelessWidget {
  final TutorState tutorState;
  final ScrollController scrollCtrl;
  final void Function(String) onFollowupTap;

  const _ChatArea({required this.tutorState, required this.scrollCtrl, required this.onFollowupTap});

  @override
  Widget build(BuildContext context) {
    if (tutorState.error != null && tutorState.messages.isEmpty) {
      return Center(child: Padding(padding: const EdgeInsets.all(24), child: ErrorInline(message: tutorState.error!)));
    }
    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            controller: scrollCtrl,
            padding: const EdgeInsets.all(16),
            itemCount: tutorState.messages.length + (tutorState.sending ? 1 : 0),
            itemBuilder: (context, i) {
              if (i >= tutorState.messages.length) return const _TypingBubble();
              return _MessageBubble(message: tutorState.messages[i]);
            },
          ),
        ),
        if (tutorState.followups.isNotEmpty && !tutorState.sending)
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: tutorState.followups.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) => ActionChip(
                label: Text(tutorState.followups[i], style: const TextStyle(fontSize: 12)),
                onPressed: () => onFollowupTap(tutorState.followups[i]),
              ),
            ),
          ),
        const SizedBox(height: 6),
      ],
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(14)),
        child: const SizedBox(
          width: 30,
          height: 12,
          child: Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))),
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage message;

  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isUser ? AppColors.brand : AppColors.brandSoft,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(message.text, style: TextStyle(color: isUser ? Colors.white : AppColors.text, fontSize: 14)),
      ),
    );
  }
}

class _InputRow extends StatelessWidget {
  final TextEditingController controller;
  final bool sending;
  final void Function([String?]) onSend;

  const _InputRow({required this.controller, required this.sending, required this.onSend});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.line))),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              enabled: !sending,
              decoration: const InputDecoration(hintText: 'Ask anything about this lesson...', isDense: true),
              onSubmitted: (_) => onSend(),
              textInputAction: TextInputAction.send,
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: sending ? null : () => onSend(),
            icon: sending
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send_rounded),
          ),
        ],
      ),
    );
  }
}

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../models/chat_message.dart';
import '../../models/curriculum_lesson.dart';
import '../../state/student_providers.dart';
import '../../state/talk_to_sam_provider.dart';
import '../../state/tutor_providers.dart';
import '../../theme/ai_tutor_colors.dart';
import '../../widgets/section_card.dart';

/// AI Tutor — full mirror of the web app's tutor panel (StudentDashboard.jsx
/// `tutorPanel`): subject/lesson selectors, speed control, chat, follow-up
/// suggestions, Quiz Me / Explain Back / Quiz Rush / Story Mode, due-review
/// nudge, and Talk to Sam voice loop. Sidebar dropped, everything sized for
/// mobile per the redesign brief.
class StudentAiTutorScreen extends ConsumerStatefulWidget {
  const StudentAiTutorScreen({super.key});

  @override
  ConsumerState<StudentAiTutorScreen> createState() => _StudentAiTutorScreenState();
}

class _StudentAiTutorScreenState extends ConsumerState<StudentAiTutorScreen> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final _explainBackCtrl = TextEditingController();
  double _speed = 1.0;
  bool _showActions = false;

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    _explainBackCtrl.dispose();
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
    if (text.trim().isEmpty && ref.read(tutorProvider).chatImages.isEmpty) return;
    _inputCtrl.clear();
    setState(() => _showActions = false);
    await ref.read(tutorProvider.notifier).sendMessage(text);
    _scrollToBottom();
  }

  Future<void> _pickImages() async {
    final picker = ImagePicker();
    final files = await picker.pickMultiImage(imageQuality: 80, limit: 6);
    if (files.isEmpty) return;
    final images = <PendingImage>[];
    for (final file in files) {
      final bytes = await file.readAsBytes();
      final mimeType = file.mimeType ?? 'image/jpeg';
      images.add(PendingImage(name: file.name, dataUrl: 'data:$mimeType;base64,${base64Encode(bytes)}'));
    }
    ref.read(tutorProvider.notifier).addImages(images);
  }

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(studentSubjectsProvider);
    final tutorState = ref.watch(tutorProvider);
    final talkState = ref.watch(talkToSamProvider);

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
      backgroundColor: const Color(0xFF0A1345),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B154E),
        foregroundColor: AiTutorColors.headText,
        title: const Text('AI Tutor'),
        titleTextStyle: const TextStyle(color: AiTutorColors.headText, fontSize: 18, fontWeight: FontWeight.w700),
        iconTheme: const IconThemeData(color: AiTutorColors.headText),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 10),
            padding: const EdgeInsets.symmetric(horizontal: 6),
            height: 30,
            decoration: BoxDecoration(
              color: const Color(0x8D0E1D60),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AiTutorColors.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Speed', style: TextStyle(color: AiTutorColors.selectText, fontSize: 9, fontWeight: FontWeight.w600)),
                SizedBox(
                  width: 60,
                  child: SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      trackHeight: 1.5,
                      thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
                      overlayShape: const RoundSliderOverlayShape(overlayRadius: 10),
                    ),
                    child: Slider(
                      value: _speed,
                      min: 0.6,
                      max: 1.8,
                      divisions: 12,
                      activeColor: AiTutorColors.userBubbleStart,
                      onChanged: (v) => setState(() => _speed = v),
                    ),
                  ),
                ),
                Text('${_speed.toStringAsFixed(1)}x', style: const TextStyle(color: AiTutorColors.selectText, fontSize: 10, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ],
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: AiTutorColors.panelGradient),
        child: SafeArea(
          child: Column(
            children: [
              _ContextHeader(subjects: subjects, tutorState: tutorState, lessonsAsync: lessonsAsync),
              if (tutorState.dueReviewNudge?.nudgeMessage != null) _DueReviewBanner(message: tutorState.dueReviewNudge!.nudgeMessage!),
              Expanded(
                child: tutorState.lesson == null
                    ? const _SelectLessonPrompt()
                    : Stack(
                        children: [
                          _ChatArea(tutorState: tutorState, scrollCtrl: _scrollCtrl, onFollowupTap: _send, speed: _speed),
                          if (tutorState.checkQuestion != null)
                            Align(alignment: Alignment.bottomCenter, child: _CheckQuestionCard()),
                          if (tutorState.explainBackActive)
                            Align(
                              alignment: Alignment.bottomCenter,
                              child: _ExplainBackPanel(controller: _explainBackCtrl),
                            ),
                          if (tutorState.storyActive) Align(alignment: Alignment.bottomCenter, child: _StoryPanel()),
                        ],
                      ),
              ),
              if (tutorState.quizRushActive) _QuizRushPanel(),
              if (tutorState.lesson != null &&
                  !tutorState.sending &&
                  tutorState.messages.isNotEmpty &&
                  !tutorState.quizRushActive &&
                  !tutorState.explainBackActive &&
                  !tutorState.storyActive)
                _ActionsToggle(
                  expanded: _showActions,
                  onToggle: () => setState(() => _showActions = !_showActions),
                  followups: tutorState.followups,
                  onFollowupTap: _send,
                ),
              if (tutorState.lesson != null)
                _InputRow(
                  controller: _inputCtrl,
                  sending: tutorState.sending,
                  onSend: _send,
                  talkState: talkState,
                  chatImages: tutorState.chatImages,
                  onPickImages: _pickImages,
                ),
            ],
          ),
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
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AiTutorColors.border))),
      child: Row(
        children: [
          Expanded(
            child: _DarkDropdown<String>(
              value: subjects.contains(tutorState.subject) ? tutorState.subject : null,
              hint: 'Subject',
              items: subjects.map((s) => DropdownMenuItem(value: s, child: Text(s, style: const TextStyle(fontSize: 13, color: AiTutorColors.selectText)))).toList(),
              onChanged: (s) {
                if (s != null) ref.read(tutorProvider.notifier).setSubject(s);
              },
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _DarkDropdown<String>(
              value: tutorState.lesson?.id,
              hint: 'Select a lesson',
              items: lessons
                  .map((l) => DropdownMenuItem(
                      value: l.id, child: Text(l.title, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: AiTutorColors.selectText))))
                  .toList(),
              onChanged: (id) {
                final lesson = lessons.where((l) => l.id == id).firstOrNull;
                ref.read(tutorProvider.notifier).selectLesson(lesson);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _DarkDropdown<T> extends StatelessWidget {
  final T? value;
  final String hint;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;

  const _DarkDropdown({required this.value, required this.hint, required this.items, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: AiTutorColors.selectBg,
        border: Border.all(color: AiTutorColors.border),
        borderRadius: BorderRadius.circular(9),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: true,
          isDense: true,
          dropdownColor: const Color(0xFF12205E),
          icon: const Icon(Icons.keyboard_arrow_down_rounded, color: AiTutorColors.selectText, size: 16),
          hint: Text(hint, style: const TextStyle(fontSize: 12.5, color: AiTutorColors.mutedText)),
          items: items,
          onChanged: onChanged,
        ),
      ),
    );
  }
}

class _DueReviewBanner extends ConsumerWidget {
  final String message;

  const _DueReviewBanner({required this.message});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      width: double.infinity,
      color: AiTutorColors.nudgeBg,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Expanded(child: Text('📋 $message', style: const TextStyle(fontSize: 12, color: AiTutorColors.nudgeText))),
          TextButton(
            onPressed: () {
              ref.read(tutorProvider.notifier).dismissDueReviewNudge();
              ref.read(tutorProvider.notifier).sendMessage('Review my due flashcards');
            },
            child: const Text('Start Review', style: TextStyle(fontSize: 12, color: AiTutorColors.nudgeText)),
          ),
          IconButton(
            icon: const Icon(Icons.close_rounded, size: 16, color: AiTutorColors.nudgeText),
            onPressed: () => ref.read(tutorProvider.notifier).dismissDueReviewNudge(),
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
            const Text('Select a lesson to get started', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17, color: AiTutorColors.headText)),
            const SizedBox(height: 6),
            const Text(
              "Choose a subject and lesson above — Sam will start a focused session just for that lesson.",
              textAlign: TextAlign.center,
              style: TextStyle(color: AiTutorColors.panelSubText, fontSize: 13, height: 1.6),
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
  final double speed;

  const _ChatArea({required this.tutorState, required this.scrollCtrl, required this.onFollowupTap, required this.speed});

  @override
  Widget build(BuildContext context) {
    if (tutorState.error != null && tutorState.messages.isEmpty) {
      return Center(child: Padding(padding: const EdgeInsets.all(24), child: ErrorInline(message: tutorState.error!)));
    }
    return Container(
      margin: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AiTutorColors.chatBgTop, AiTutorColors.chatBgBottom],
        ),
        border: Border.all(color: AiTutorColors.chatBorder),
        borderRadius: BorderRadius.circular(14),
      ),
      child: ListView.builder(
        controller: scrollCtrl,
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 100),
        itemCount: tutorState.messages.length + (tutorState.sending ? 1 : 0),
        itemBuilder: (context, i) {
          if (i >= tutorState.messages.length) return const _TypingBubble();
          return _MessageBubble(message: tutorState.messages[i], speed: speed);
        },
      ),
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
        decoration: BoxDecoration(
          color: AiTutorColors.botBubble,
          border: Border.all(color: AiTutorColors.botBubbleBorder),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('AcademiX is thinking', style: TextStyle(color: AiTutorColors.botText, fontSize: 13)),
            SizedBox(width: 8),
            SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AiTutorColors.botText)),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends ConsumerWidget {
  final ChatMessage message;
  final double speed;

  const _MessageBubble({required this.message, required this.speed});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isUser = message.isUser;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Column(
        crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
            margin: const EdgeInsets.only(top: 4),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              gradient: isUser
                  ? const LinearGradient(colors: [AiTutorColors.userBubbleStart, AiTutorColors.userBubbleEnd])
                  : null,
              color: isUser ? null : AiTutorColors.botBubble,
              border: Border.all(color: isUser ? Colors.transparent : AiTutorColors.botBubbleBorder),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (message.imageDataUrls.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: message.imageDataUrls
                          .map((url) => ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.memory(base64Decode(url.split(',').last), width: 90, height: 90, fit: BoxFit.cover),
                              ))
                          .toList(),
                    ),
                  ),
                Text(message.text, style: TextStyle(color: isUser ? Colors.white : AiTutorColors.botText, fontSize: 14, height: 1.5)),
              ],
            ),
          ),
          if (!isUser)
            Consumer(builder: (context, ref, _) {
              final talkState = ref.watch(talkToSamProvider);
              final speaking = talkState.speaking;
              return TextButton.icon(
                onPressed: speaking ? null : () => ref.read(talkToSamProvider.notifier).speak(message.text),
                icon: const Icon(Icons.volume_up_rounded, size: 13, color: Color(0xFFD8FFF3)),
                label: Text(speaking ? 'Sam is talking…' : 'Play Voice', style: const TextStyle(fontSize: 11, color: Color(0xFFD8FFF3), fontWeight: FontWeight.w700)),
                style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 4), minimumSize: const Size(0, 26)),
              );
            }),
        ],
      ),
    );
  }
}

/// Collapsible "Suggestions & Actions" bar — mirrors the web toggle that
/// reveals follow-up chips + Quiz Me / Explain Back / Quiz Rush / Story Mode.
class _ActionsToggle extends ConsumerWidget {
  final bool expanded;
  final VoidCallback onToggle;
  final List<String> followups;
  final void Function(String) onFollowupTap;

  const _ActionsToggle({required this.expanded, required this.onToggle, required this.followups, required this.onFollowupTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            decoration: BoxDecoration(
              color: AiTutorColors.actionsToggleBg,
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: TextButton.icon(
              onPressed: onToggle,
              icon: const Text('💡'),
              label: Text(expanded ? 'Hide suggestions' : 'Suggestions & Actions',
                  style: const TextStyle(fontSize: 12, color: AiTutorColors.actionsToggleText, fontWeight: FontWeight.w600)),
              style: TextButton.styleFrom(foregroundColor: AiTutorColors.actionsToggleText),
            ),
          ),
          if (expanded)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (followups.isNotEmpty)
                    Wrap(
                      spacing: 7,
                      runSpacing: 7,
                      children: followups
                          .map((f) => _FollowupChip(label: f, onTap: () => onFollowupTap(f)))
                          .toList(),
                    ),
                  if (followups.isNotEmpty) const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _ActionButton(
                        label: '🧠 Quiz Me',
                        color: AiTutorColors.quizAction,
                        onPressed: () => ref.read(tutorProvider.notifier).requestCheckQuestion(),
                      ),
                      _ActionButton(
                        label: '🗣️ Explain Back',
                        color: AiTutorColors.explainAction,
                        onPressed: () => ref.read(tutorProvider.notifier).startExplainBack(),
                      ),
                      _ActionButton(
                        label: '⚡ Quiz Rush',
                        color: AiTutorColors.rushAction,
                        onPressed: () => ref.read(tutorProvider.notifier).startQuizRush(),
                      ),
                      _ActionButton(
                        label: '📖 Story Mode',
                        color: AiTutorColors.storyAction,
                        onPressed: () => ref.read(tutorProvider.notifier).startStory(),
                      ),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _FollowupChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _FollowupChip({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AiTutorColors.followupBg,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
          decoration: BoxDecoration(border: Border.all(color: AiTutorColors.followupBorder), borderRadius: BorderRadius.circular(999)),
          child: Text(label, style: const TextStyle(fontSize: 12.5, color: AiTutorColors.followupText, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback? onPressed;

  const _ActionButton({required this.label, required this.color, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class _CheckQuestionCard extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tutorState = ref.watch(tutorProvider);
    final question = tutorState.checkQuestion!;
    final result = tutorState.checkQuestionResult;
    final bg = result == null ? AiTutorColors.checkCardBg : (result.correct ? AiTutorColors.checkCorrectBg : AiTutorColors.checkWrongBg);
    final border = result == null ? AiTutorColors.checkCardBorder : (result.correct ? AiTutorColors.checkCorrectBorder : AiTutorColors.checkWrongBorder);

    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: border, width: 1.5)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(result == null ? '🧠 Quick Check' : (result.correct ? '✅ Correct!' : '❌ Not quite'),
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AiTutorColors.panelText)),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, size: 18, color: Colors.white54),
                onPressed: () => ref.read(tutorProvider.notifier).dismissCheckQuestion(),
              ),
            ],
          ),
          if (result == null) ...[
            Text(question.question, style: const TextStyle(fontSize: 13, color: AiTutorColors.panelText, height: 1.5)),
            const SizedBox(height: 10),
            for (var i = 0; i < question.options.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => ref.read(tutorProvider.notifier).answerCheckQuestion(i),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
                      backgroundColor: Colors.white.withValues(alpha: 0.04),
                    ),
                    child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(question.options[i], style: const TextStyle(fontSize: 12.5, color: AiTutorColors.panelText))),
                  ),
                ),
              ),
          ] else
            Text(result.explanation, style: const TextStyle(fontSize: 12.5, color: Color(0xFFCBD5E1), height: 1.5)),
        ],
      ),
    );
  }
}

class _ExplainBackPanel extends ConsumerWidget {
  final TextEditingController controller;

  const _ExplainBackPanel({required this.controller});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tutorState = ref.watch(tutorProvider);
    final result = tutorState.explainBackResult;

    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AiTutorColors.explainPanelBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AiTutorColors.explainPanelBorder, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                  child: Text('🗣️ Explain Back: ${tutorState.explainBackTopic}',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AiTutorColors.panelText))),
              IconButton(
                  icon: const Icon(Icons.close_rounded, size: 18, color: Colors.white54),
                  onPressed: () => ref.read(tutorProvider.notifier).closeExplainBack()),
            ],
          ),
          if (result == null) ...[
            const Text('Explain in your own words what you learned about this topic.',
                style: TextStyle(color: AiTutorColors.panelSubText, fontSize: 12, height: 1.5)),
            const SizedBox(height: 10),
            TextField(
              controller: controller,
              maxLines: 3,
              style: const TextStyle(color: AiTutorColors.panelText, fontSize: 13),
              decoration: InputDecoration(
                hintText: 'Type your explanation...',
                hintStyle: const TextStyle(color: AiTutorColors.panelSubText),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.04),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15))),
              ),
            ),
            const SizedBox(height: 10),
            ElevatedButton(
              onPressed: tutorState.explainBackLoading ? null : () => ref.read(tutorProvider.notifier).submitExplainBack(controller.text),
              style: ElevatedButton.styleFrom(backgroundColor: AiTutorColors.explainAction, foregroundColor: Colors.white),
              child: Text(tutorState.explainBackLoading ? 'Evaluating...' : '📤 Submit Explanation'),
            ),
          ] else ...[
            Text('Score: ${result.score}/5', style: const TextStyle(fontWeight: FontWeight.w700, color: AiTutorColors.panelText, fontSize: 14)),
            const SizedBox(height: 4),
            Text(result.feedback, style: const TextStyle(fontSize: 13, color: AiTutorColors.panelText)),
            if (result.strengths.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('✅ ${result.strengths.join(', ')}', style: const TextStyle(fontSize: 12, color: Color(0xFF4ADE80))),
              ),
            if (result.gaps.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('📝 Work on: ${result.gaps.join(', ')}', style: const TextStyle(fontSize: 12, color: Color(0xFFFBBF24))),
              ),
            const SizedBox(height: 10),
            ElevatedButton(
              onPressed: () => ref.read(tutorProvider.notifier).closeExplainBack(),
              style: ElevatedButton.styleFrom(backgroundColor: AiTutorColors.explainAction, foregroundColor: Colors.white),
              child: const Text('Done'),
            ),
          ],
        ],
      ),
    );
  }
}

class _QuizRushPanel extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tutorState = ref.watch(tutorProvider);
    final data = tutorState.quizRushData;
    if (data == null) return const SizedBox.shrink();

    final isDone = tutorState.quizRushCurrentIndex >= data.questions.length - 1 && tutorState.quizRushAnswers.length == data.questions.length;

    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AiTutorColors.rushPanelBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AiTutorColors.rushPanelBorder, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                  child: Text('⚡ Quiz Rush — ${data.subject ?? 'General'}',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AiTutorColors.panelText))),
              IconButton(
                  icon: const Icon(Icons.close_rounded, size: 18, color: Colors.white54),
                  onPressed: () => ref.read(tutorProvider.notifier).closeQuizRush()),
            ],
          ),
          if (!isDone) ...[
            Text('Question ${tutorState.quizRushCurrentIndex + 1} of ${data.questions.length}',
                style: const TextStyle(color: AiTutorColors.nudgeText, fontSize: 11, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(data.questions[tutorState.quizRushCurrentIndex].question, style: const TextStyle(fontSize: 14, color: AiTutorColors.panelText)),
            const SizedBox(height: 10),
            for (var i = 0; i < data.questions[tutorState.quizRushCurrentIndex].options.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => ref.read(tutorProvider.notifier).answerQuizRush(i),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
                      backgroundColor: Colors.white.withValues(alpha: 0.04),
                    ),
                    child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(data.questions[tutorState.quizRushCurrentIndex].options[i],
                            style: const TextStyle(fontSize: 12.5, color: AiTutorColors.panelText))),
                  ),
                ),
              ),
          ] else ...[
            Builder(builder: (context) {
              final score = tutorState.quizRushAnswers.where((a) => a.correct).length;
              final total = tutorState.quizRushAnswers.length;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$score/$total', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22, color: AiTutorColors.nudgeText)),
                  Text(score >= (total / 2).ceil() ? '🎉 Passed! Orchard watered!' : '💪 Keep practicing!',
                      style: const TextStyle(fontSize: 12, color: AiTutorColors.panelText)),
                  const SizedBox(height: 10),
                  ElevatedButton(
                    onPressed: () => ref.read(tutorProvider.notifier).closeQuizRush(),
                    style: ElevatedButton.styleFrom(backgroundColor: AiTutorColors.rushAction, foregroundColor: Colors.white),
                    child: const Text('Done'),
                  ),
                ],
              );
            }),
          ],
        ],
      ),
    );
  }
}

class _StoryPanel extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tutorState = ref.watch(tutorProvider);
    final story = tutorState.storyData;

    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(14),
      constraints: const BoxConstraints(maxHeight: 400),
      decoration: BoxDecoration(
        color: AiTutorColors.storyPanelBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AiTutorColors.storyPanelBorder, width: 1.5),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                  child: Text('📖 ${story?.title ?? 'Story Mode'}',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AiTutorColors.panelText))),
              IconButton(
                  icon: const Icon(Icons.close_rounded, size: 18, color: Colors.white54),
                  onPressed: () => ref.read(tutorProvider.notifier).closeStory()),
            ],
          ),
          if (tutorState.storyLoading)
            const Padding(padding: EdgeInsets.symmetric(vertical: 20), child: Center(child: CircularProgressIndicator(color: AiTutorColors.storyAction)))
          else if (story != null) ...[
            Flexible(
                child: SingleChildScrollView(
                    child: Text(story.story, style: const TextStyle(fontSize: 13.5, color: AiTutorColors.panelText, height: 1.7)))),
            const SizedBox(height: 10),
            if (!tutorState.storyCompleted)
              ElevatedButton(
                onPressed: () => ref.read(tutorProvider.notifier).finishStory(),
                style: ElevatedButton.styleFrom(backgroundColor: AiTutorColors.storyAction, foregroundColor: Colors.white),
                child: const Text('✅ I finished the story!'),
              )
            else
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('🌳 Orchard watered!', style: TextStyle(fontWeight: FontWeight.w700, color: AiTutorColors.panelText)),
                  const SizedBox(height: 10),
                  ElevatedButton(
                    onPressed: () => ref.read(tutorProvider.notifier).closeStory(),
                    style: ElevatedButton.styleFrom(backgroundColor: AiTutorColors.storyAction, foregroundColor: Colors.white),
                    child: const Text('Done'),
                  ),
                ],
              ),
          ] else
            const Text('Could not write a story right now — try again in a moment.', style: TextStyle(color: AiTutorColors.panelSubText, fontSize: 13)),
        ],
      ),
    );
  }
}

class _InputRow extends ConsumerWidget {
  final TextEditingController controller;
  final bool sending;
  final void Function([String?]) onSend;
  final TalkToSamState talkState;
  final List<PendingImage> chatImages;
  final VoidCallback onPickImages;

  const _InputRow({
    required this.controller,
    required this.sending,
    required this.onSend,
    required this.talkState,
    required this.chatImages,
    required this.onPickImages,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (talkState.open) _TalkToSamPanel(talkState: talkState),
        if (chatImages.isNotEmpty)
          Container(
            height: 64,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: AiTutorColors.border))),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: chatImages.length,
              separatorBuilder: (_, _) => const SizedBox(width: 6),
              itemBuilder: (context, i) => Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(
                      base64Decode(chatImages[i].dataUrl.split(',').last),
                      width: 52,
                      height: 52,
                      fit: BoxFit.cover,
                    ),
                  ),
                  Positioned(
                    top: -4,
                    right: -4,
                    child: GestureDetector(
                      onTap: () => ref.read(tutorProvider.notifier).removeImage(i),
                      child: Container(
                        width: 18,
                        height: 18,
                        decoration: const BoxDecoration(color: Colors.black87, shape: BoxShape.circle),
                        alignment: Alignment.center,
                        child: const Icon(Icons.close_rounded, size: 12, color: Colors.white),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: AiTutorColors.border))),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  enabled: !sending,
                  style: const TextStyle(color: AiTutorColors.text, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Ask anything about this lesson...',
                    hintStyle: const TextStyle(color: Color(0xB8D9E4FF)),
                    isDense: true,
                    filled: true,
                    fillColor: AiTutorColors.inputBg,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(11), borderSide: const BorderSide(color: AiTutorColors.inputBorder)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(11), borderSide: const BorderSide(color: AiTutorColors.inputBorder)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(11), borderSide: const BorderSide(color: Color(0xFFA8BEFF), width: 1.5)),
                  ),
                  onSubmitted: (_) => onSend(),
                  textInputAction: TextInputAction.send,
                ),
              ),
              const SizedBox(width: 2),
              _AttachButton(onTap: onPickImages),
              const SizedBox(width: 2),
              _TalkToSamMicButton(talkState: talkState),
              const SizedBox(width: 6),
              _SendButton(sending: sending, onSend: onSend),
            ],
          ),
        ),
      ],
    );
  }
}

class _AttachButton extends StatelessWidget {
  final VoidCallback onTap;

  const _AttachButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: const SizedBox(
          width: 34,
          height: 42,
          child: Icon(Icons.attach_file_rounded, color: Color(0xFFEAF1FF), size: 20),
        ),
      ),
    );
  }
}

class _TalkToSamMicButton extends ConsumerWidget {
  final TalkToSamState talkState;

  const _TalkToSamMicButton({required this.talkState});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final disabled = !talkState.open && (talkState.speaking || talkState.busy);
    return GestureDetector(
      onTap: disabled ? null : () => ref.read(talkToSamProvider.notifier).togglePopup(),
      child: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: talkState.recording
              ? const LinearGradient(colors: [Color(0xFFDC3C50), Color(0xFFB4283C)])
              : const LinearGradient(colors: [Color(0xFF4A7CF7), Color(0xFF2D5FD4)]),
          border: Border.all(color: const Color(0xB278A0FF), width: 2),
        ),
        alignment: Alignment.center,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(talkState.open ? Icons.close_rounded : Icons.mic_rounded, color: Colors.white, size: 16),
            const Text('SAM', style: TextStyle(color: Colors.white, fontSize: 6, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  final bool sending;
  final void Function([String?]) onSend;

  const _SendButton({required this.sending, required this.onSend});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: sending ? null : () => onSend(),
      child: Container(
        height: 42,
        padding: const EdgeInsets.symmetric(horizontal: 18),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: sending
                ? [AiTutorColors.stopGradientStart, AiTutorColors.stopGradientEnd]
                : [AiTutorColors.sendGradientStart, AiTutorColors.sendGradientEnd],
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: sending
            ? const Text('Stop', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13))
            : const Icon(Icons.send_rounded, color: Colors.white, size: 18),
      ),
    );
  }
}

/// Talk to Sam status panel — shown above the input row while open. Mirrors
/// the web popup's status bar + transcript + Send Now button, without the
/// floating-bubble positioning (not needed once it's inline on mobile).
class _TalkToSamPanel extends ConsumerWidget {
  final TalkToSamState talkState;

  const _TalkToSamPanel({required this.talkState});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusLabel = talkState.recording
        ? "🎙️ Listening... (speak, I'll auto-detect when you stop)"
        : talkState.speaking
            ? '🔊 Sam is talking...'
            : talkState.busy
                ? '💭 Sam is thinking...'
                : '✨ Sam is ready';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFA121E55), Color(0xFC0C1641)],
        ),
        border: Border.all(color: const Color(0x59788FFF)),
        borderRadius: BorderRadius.circular(14),
      ),
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Text('🎓', style: TextStyle(fontSize: 18)),
              const SizedBox(width: 8),
              const Expanded(child: Text('Sam', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
              if (talkState.speaking)
                IconButton(
                    icon: const Icon(Icons.volume_off_rounded, color: Colors.white70, size: 18),
                    onPressed: () => ref.read(talkToSamProvider.notifier).stopSpeaking()),
              IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white70, size: 18),
                  onPressed: () => ref.read(talkToSamProvider.notifier).togglePopup()),
            ],
          ),
          const SizedBox(height: 6),
          Text(statusLabel, style: const TextStyle(color: Colors.white70, fontSize: 12)),
          if (talkState.transcript.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('You said: "${talkState.transcript}"', style: const TextStyle(color: Colors.white, fontSize: 12, fontStyle: FontStyle.italic)),
            ),
          if (talkState.error?.isNotEmpty == true)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(talkState.error!, style: const TextStyle(color: Color(0xFFFFB0C0), fontSize: 12)),
            ),
          if (talkState.recording)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: ElevatedButton.icon(
                onPressed: () => ref.read(talkToSamProvider.notifier).stopRecordingAndSend(),
                icon: const Icon(Icons.stop_rounded),
                label: const Text('Send Now'),
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC3C50), foregroundColor: Colors.white),
              ),
            )
          else if (!talkState.speaking && !talkState.busy)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: ElevatedButton.icon(
                onPressed: () => ref.read(talkToSamProvider.notifier).startRecording(),
                icon: const Icon(Icons.mic_rounded),
                label: const Text('Start speaking'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0x661E3278),
                  foregroundColor: const Color(0xFFF0F6FF),
                  side: const BorderSide(color: Color(0x66788FFF)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

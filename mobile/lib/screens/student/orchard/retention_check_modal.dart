import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/interactive_learning.dart';
import '../../../models/orchard_data.dart';
import '../../../state/student_providers.dart';
import '../../../state/tutor_providers.dart';
import '../../../theme/app_colors.dart';

/// Blossom/Fruit retention check — mirrors
/// `web/src/components/orchard/RetentionCheckModal.jsx`: a quick 3-question
/// quiz grounded in the chapter's own lesson content, shown on demand when a
/// week/month review is due. Passing calls `completeOrchardReview` to
/// advance the tree. Returns `true` via `onDone` when the check passed.
Future<void> showRetentionCheckModal(
  BuildContext context, {
  required String studentId,
  required String subjectKey,
  required String subjectLabel,
  required OrchardChapter chapter,
  required String reviewType, // 'week' | 'month'
  required VoidCallback onDone,
}) {
  return showDialog(
    context: context,
    barrierDismissible: true,
    builder: (_) => _RetentionCheckDialog(
      studentId: studentId,
      subjectKey: subjectKey,
      subjectLabel: subjectLabel,
      chapter: chapter,
      reviewType: reviewType,
      onDone: onDone,
    ),
  );
}

class _RetentionCheckDialog extends ConsumerStatefulWidget {
  final String studentId;
  final String subjectKey;
  final String subjectLabel;
  final OrchardChapter chapter;
  final String reviewType;
  final VoidCallback onDone;

  const _RetentionCheckDialog({
    required this.studentId,
    required this.subjectKey,
    required this.subjectLabel,
    required this.chapter,
    required this.reviewType,
    required this.onDone,
  });

  @override
  ConsumerState<_RetentionCheckDialog> createState() => _RetentionCheckDialogState();
}

class _RetentionCheckDialogState extends ConsumerState<_RetentionCheckDialog> {
  bool _loading = true;
  String _error = '';
  List<QuizRushQuestion> _questions = const [];
  final Map<String, int> _answers = {};
  bool _submitting = false;
  _Result? _result;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final data = await ref.read(chatApiServiceProvider).generateQuizRush(widget.studentId, {
        if (widget.chapter.lessonId != null) 'lessonId': widget.chapter.lessonId,
        'lessonTitle': widget.chapter.title,
        'subject': widget.subjectLabel,
        'count': 3,
      });
      if (data == null || data.questions.isEmpty) {
        setState(() => _error = 'Could not prepare the memory check. Please try again later.');
      } else {
        setState(() => _questions = data.questions);
      }
    } catch (_) {
      setState(() => _error = 'Could not prepare the memory check. Please try again later.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _select(String qId, int idx) {
    if (_result != null) return;
    setState(() => _answers[qId] = idx);
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      final total = _questions.length;
      var score = 0;
      for (final q in _questions) {
        if (_answers[q.id] == q.correctIndex) score++;
      }
      final passed = total > 0 && score >= (total / 2).ceil();
      await ref.read(studentApiServiceProvider).completeOrchardReview(
            studentId: widget.studentId,
            chapterId: widget.chapter.chapterId,
            reviewType: widget.reviewType,
            passed: passed,
          );
      setState(() => _result = _Result(score: score, total: total, passed: passed));
    } catch (_) {
      setState(() => _error = 'Could not submit the memory check. Please try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final allAnswered = _questions.isNotEmpty && _questions.every((q) => _answers.containsKey(q.id));
    final label = widget.reviewType == 'month' ? '1-Month Memory Check' : '1-Week Memory Check';

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(18),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480, maxHeight: 560),
        child: Container(
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 10, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text('🧠 $label · ${widget.chapter.title}',
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    ),
                    IconButton(onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
                  ],
                ),
              ),
              const Divider(height: 1),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(18),
                  child: _loading
                      ? const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Center(child: Text('Preparing your memory check…', style: TextStyle(color: AppColors.muted))),
                        )
                      : _error.isNotEmpty && _result == null
                          ? Text(_error, style: const TextStyle(color: AppColors.danger))
                          : _result != null
                              ? Container(
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: _result!.passed ? const Color(0xFFECFDF3) : const Color(0xFFFFF7ED),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    _result!.passed
                                        ? '✅ Nice! You got ${_result!.score}/${_result!.total} — this chapter\'s memory check is passed.'
                                        : 'You got ${_result!.score}/${_result!.total}. That\'s below the pass mark — review the lesson and try again soon.',
                                    style: const TextStyle(fontSize: 13.5),
                                  ),
                                )
                              : Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    for (var i = 0; i < _questions.length; i++) ...[
                                      _QuestionBlock(
                                        index: i,
                                        question: _questions[i],
                                        selected: _answers[_questions[i].id],
                                        onSelect: (idx) => _select(_questions[i].id, idx),
                                      ),
                                      const SizedBox(height: 14),
                                    ],
                                  ],
                                ),
                ),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (_result != null)
                      ElevatedButton(
                        onPressed: () {
                          Navigator.of(context).pop();
                          widget.onDone();
                        },
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.brand, foregroundColor: Colors.white),
                        child: const Text('Done'),
                      )
                    else ...[
                      TextButton(
                        onPressed: _submitting ? null : () => Navigator.of(context).pop(),
                        child: const Text('Cancel'),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: (!allAnswered || _submitting || _loading || _error.isNotEmpty) ? null : _submit,
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.brand, foregroundColor: Colors.white),
                        child: Text(_submitting ? 'Submitting…' : 'Submit'),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuestionBlock extends StatelessWidget {
  final int index;
  final QuizRushQuestion question;
  final int? selected;
  final ValueChanged<int> onSelect;

  const _QuestionBlock({required this.index, required this.question, required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RichText(
          text: TextSpan(
            style: const TextStyle(color: AppColors.text, fontSize: 13.5),
            children: [
              TextSpan(text: 'Q${index + 1}. ', style: const TextStyle(fontWeight: FontWeight.w800)),
              TextSpan(text: question.question),
            ],
          ),
        ),
        const SizedBox(height: 8),
        for (var i = 0; i < question.options.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => onSelect(i),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: selected == i ? AppColors.brandSoft : const Color(0xFFF7F7FB),
                  border: Border.all(color: selected == i ? AppColors.brand : Colors.transparent),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Text(selected == i ? '●' : '○', style: const TextStyle(color: AppColors.brand)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(question.options[i], style: const TextStyle(fontSize: 13))),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Result {
  final int score;
  final int total;
  final bool passed;
  const _Result({required this.score, required this.total, required this.passed});
}

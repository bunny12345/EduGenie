import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/test_item.dart';
import '../../models/test_question.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

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

class _TestTakingScreenState extends ConsumerState<TestTakingScreen> {
  bool _loading = true;
  String? _error;
  String? _attemptId;
  List<TestQuestion> _questions = [];
  int _index = 0;
  final Map<String, int> _answers = {};
  bool _submitting = false;
  Map<String, dynamic>? _result;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ref.read(studentApiServiceProvider).startTest(widget.test.id, studentId);
      final list = (res['questions'] as List? ?? []).map((q) => TestQuestion.fromJson(Map<String, dynamic>.from(q as Map))).toList();
      setState(() {
        _attemptId = res['attemptId']?.toString();
        _questions = list;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _confirmAndSubmit() async {
    final unanswered = _questions.where((q) => !_answers.containsKey(q.id)).length;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Submit test?'),
        content: Text(unanswered > 0
            ? 'You have $unanswered unanswered question${unanswered == 1 ? '' : 's'}. Submit anyway?'
            : 'This will finish your attempt. You cannot change your answers after submitting.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Submit')),
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
      final res = await ref.read(studentApiServiceProvider).submitTestAttempt(attemptId, studentId, _answers);
      setState(() {
        _result = res;
        _submitting = false;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Submit failed: $e')));
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.test.title)),
      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
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
    if (_result != null) return _ResultView(result: _result!, onDone: () => Navigator.of(context).pop());
    if (_questions.isEmpty) {
      return const Center(child: Text('No questions available for this test.', style: TextStyle(color: AppColors.muted)));
    }

    final question = _questions[_index];
    final selected = _answers[question.id];

    return Column(
      children: [
        LinearProgressIndicator(value: (_index + 1) / _questions.length, backgroundColor: AppColors.line),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Text('Question ${_index + 1} of ${_questions.length}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(question.text, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              RadioGroup<int>(
                groupValue: selected,
                onChanged: (v) => setState(() => _answers[question.id] = v!),
                child: Column(
                  children: [
                    for (var i = 0; i < question.options.length; i++)
                      RadioListTile<int>(value: i, title: Text(question.options[i])),
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
                  child: OutlinedButton(onPressed: () => setState(() => _index -= 1), child: const Text('Previous')),
                ),
              if (_index > 0) const SizedBox(width: 12),
              Expanded(
                child: _index < _questions.length - 1
                    ? ElevatedButton(onPressed: () => setState(() => _index += 1), child: const Text('Next'))
                    : ElevatedButton(
                        onPressed: _submitting ? null : _confirmAndSubmit,
                        child: _submitting
                            ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
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
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('$score%', style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w800, color: AppColors.brand)),
            const SizedBox(height: 8),
            Text(feedback, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 14)),
            const SizedBox(height: 20),
            ElevatedButton(onPressed: onDone, child: const Text('Done')),
          ],
        ),
      ),
    );
  }
}

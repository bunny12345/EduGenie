import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/homework_item.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

/// Homework detail + text-based submission. Image attachment upload is
/// deferred to a later increment (see /memories/repo/mobile-app-plan.md).
class HomeworkDetailScreen extends ConsumerStatefulWidget {
  final HomeworkItem homework;

  const HomeworkDetailScreen({super.key, required this.homework});

  @override
  ConsumerState<HomeworkDetailScreen> createState() => _HomeworkDetailScreenState();
}

class _HomeworkDetailScreenState extends ConsumerState<HomeworkDetailScreen> {
  final _answerCtrl = TextEditingController();
  bool _submitting = false;
  String? _info;

  @override
  void dispose() {
    _answerCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty || _answerCtrl.text.trim().isEmpty) return;
    setState(() {
      _submitting = true;
      _info = null;
    });
    try {
      final res = await ref.read(studentApiServiceProvider).submitHomeworkText(
            widget.homework.id,
            studentId,
            _answerCtrl.text.trim(),
          );
      ref.invalidate(homeworkProvider);
      if (!mounted) return;
      setState(() => _info = 'Submitted successfully. Grade: ${res['grade'] ?? '-'}');
    } catch (e) {
      if (!mounted) return;
      setState(() => _info = 'Submit failed: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.homework;
    final canSubmit = !h.submitted && !h.expired;

    return Scaffold(
      appBar: AppBar(title: Text(h.title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(h.subject, style: const TextStyle(color: AppColors.muted, fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(h.title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Icon(Icons.event_rounded, size: 16, color: AppColors.muted),
                    const SizedBox(width: 6),
                    Text(_formatDate(h.dueAt), style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: _statusColor(h).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                  child: Text(h.remark, style: TextStyle(color: _statusColor(h), fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
          if (canSubmit) ...[
            SectionCard(
              title: 'Your Answer',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _answerCtrl,
                    maxLines: 6,
                    decoration: const InputDecoration(hintText: 'Type your answer here...'),
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Submit'),
                  ),
                ],
              ),
            ),
          ] else
            SectionCard(
              child: Text(
                h.submitted ? 'You already submitted this homework.' : 'This homework is expired and can no longer be submitted.',
                style: const TextStyle(color: AppColors.muted, fontSize: 13),
              ),
            ),
          if (_info != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(_info!, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }

  Color _statusColor(HomeworkItem h) {
    if (h.submitted) return AppColors.ok;
    if (h.overdue || h.expired) return AppColors.danger;
    return AppColors.warn;
  }

  String _formatDate(String? iso) {
    if (iso == null) return 'No due date';
    final d = DateTime.tryParse(iso);
    if (d == null) return 'No due date';
    return 'Due ${d.day}/${d.month}/${d.year}';
  }
}

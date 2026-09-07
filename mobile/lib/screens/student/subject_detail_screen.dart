import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/homework_item.dart';
import '../../models/test_item.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

/// Per-subject screen — homework, tests and progress scoped to one subject,
/// plus an AI Tutor entry point (wired once the AI Tutor tab is built).
class SubjectDetailScreen extends ConsumerWidget {
  final String subject;

  const SubjectDetailScreen({super.key, required this.subject});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final color = SubjectPalette.colorFor(subject);
    final homeworkAsync = ref.watch(homeworkProvider);
    final testsAsync = ref.watch(testsProvider);
    final progressAsync = ref.watch(progressProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(subject),
        backgroundColor: color.withValues(alpha: 0.08),
        foregroundColor: color,
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(homeworkProvider);
          ref.invalidate(testsProvider);
          ref.invalidate(progressProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            progressAsync.when(
              loading: () => const SectionCard(title: '📈 Progress', child: SkeletonBox(height: 40)),
              error: (e, _) => SectionCard(title: '📈 Progress', child: ErrorInline(message: 'Unable to load progress: $e')),
              data: (scores) {
                final matches = scores.where((s) => s.subject == subject);
                if (matches.isEmpty) {
                  return const SectionCard(
                      title: '📈 Progress', child: Text('No progress recorded yet.', style: TextStyle(color: AppColors.muted, fontSize: 13)));
                }
                final score = matches.first;
                return SectionCard(
                  title: '📈 Progress',
                  child: Row(
                    children: [
                      Text('${score.score}%', style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 24)),
                      const SizedBox(width: 8),
                      Text('Average score', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                    ],
                  ),
                );
              },
            ),
            homeworkAsync.when(
              loading: () => const SectionCard(title: '📝 Homework', child: SkeletonBox(height: 60)),
              error: (e, _) => SectionCard(title: '📝 Homework', child: ErrorInline(message: 'Unable to load homework: $e')),
              data: (items) => _HomeworkSection(items: items.where((h) => h.subject == subject).toList(), color: color),
            ),
            testsAsync.when(
              loading: () => const SectionCard(title: '🧪 Mock Tests', child: SkeletonBox(height: 60)),
              error: (e, _) => SectionCard(title: '🧪 Mock Tests', child: ErrorInline(message: 'Unable to load tests: $e')),
              data: (items) => _TestsSection(items: items.where((t) => t.subject == subject).toList(), color: color),
            ),
            SectionCard(
              child: Row(
                children: [
                  Icon(Icons.smart_toy_rounded, color: color),
                  const SizedBox(width: 10),
                  Expanded(child: Text('Ask the AI Tutor about $subject', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                  TextButton(
                    onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('AI Tutor lands in the next phase.')),
                    ),
                    child: const Text('Open'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HomeworkSection extends StatelessWidget {
  final List<HomeworkItem> items;
  final Color color;

  const _HomeworkSection({required this.items, required this.color});

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: '📝 Homework',
      child: items.isEmpty
          ? const Text('No homework for this subject.', style: TextStyle(color: AppColors.muted, fontSize: 13))
          : Column(
              children: items
                  .map((h) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(h.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(color: _statusColor(h).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                              child: Text(h.remark, style: TextStyle(color: _statusColor(h), fontSize: 11, fontWeight: FontWeight.w700)),
                            ),
                          ],
                        ),
                      ))
                  .toList(),
            ),
    );
  }

  Color _statusColor(HomeworkItem h) {
    if (h.submitted) return AppColors.ok;
    if (h.overdue || h.expired) return AppColors.danger;
    return AppColors.warn;
  }
}

class _TestsSection extends StatelessWidget {
  final List<TestItem> items;
  final Color color;

  const _TestsSection({required this.items, required this.color});

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: '🧪 Mock Tests',
      child: items.isEmpty
          ? const Text('No tests available for this subject.', style: TextStyle(color: AppColors.muted, fontSize: 13))
          : Column(
              children: items
                  .map((t) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(
                          children: [
                            Expanded(child: Text(t.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                            Text('${t.durationMinutes} min', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                          ],
                        ),
                      ))
                  .toList(),
            ),
    );
  }
}

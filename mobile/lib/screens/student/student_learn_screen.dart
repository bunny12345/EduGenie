import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/homework_item.dart';
import '../../models/subject_score.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';
import 'subject_detail_screen.dart';

/// "Learn" tab — subject grid derived from the class's registered teachers
/// (see `studentSubjectsProvider`). Tapping a subject opens its detail screen
/// (homework/tests/progress/AI Tutor entry).
class StudentLearnScreen extends ConsumerWidget {
  const StudentLearnScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(dashboardProvider);
    final homeworkAsync = ref.watch(homeworkProvider);
    final progressAsync = ref.watch(progressProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Learn')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardProvider);
          ref.invalidate(homeworkProvider);
          ref.invalidate(progressProvider);
        },
        child: dashboardAsync.when(
          loading: () => const _LoadingGrid(),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(16),
            children: [ErrorInline(message: 'Unable to load subjects: $e')],
          ),
          data: (dashboard) {
            final seen = <String>{};
            for (final t in dashboard.classTeachers) {
              final subject = t.subject.trim();
              if (subject.isNotEmpty && subject.toLowerCase() != 'general') seen.add(subject);
            }
            final subjects = seen.toList()..sort();

            if (subjects.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: const [
                  Text("No subjects yet — your school hasn't registered a teacher for your class.",
                      style: TextStyle(color: AppColors.muted, fontSize: 13)),
                ],
              );
            }

            final homeworkItems = homeworkAsync.value ?? const <HomeworkItem>[];
            final scores = progressAsync.value ?? const <SubjectScore>[];

            return GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.3,
              ),
              itemCount: subjects.length,
              itemBuilder: (context, i) {
                final subject = subjects[i];
                final pending = homeworkItems.where((h) => h.subject == subject && !h.submitted && !h.expired).length;
                final matches = scores.where((s) => s.subject == subject);
                final score = matches.isEmpty ? null : matches.first.score;
                return _SubjectCard(subject: subject, pendingCount: pending, score: score);
              },
            );
          },
        ),
      ),
    );
  }
}

class _LoadingGrid extends StatelessWidget {
  const _LoadingGrid();

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.3,
      ),
      itemCount: 4,
      itemBuilder: (context, i) => Container(
        decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(14)),
      ),
    );
  }
}

class _SubjectCard extends StatelessWidget {
  final String subject;
  final int pendingCount;
  final int? score;

  const _SubjectCard({required this.subject, required this.pendingCount, this.score});

  @override
  Widget build(BuildContext context) {
    final color = SubjectPalette.colorFor(subject);
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => SubjectDetailScreen(subject: subject))),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Icon(Icons.menu_book_rounded, color: color, size: 26),
            Text(subject,
                maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 14)),
            Row(
              children: [
                if (score != null) Text('$score%', style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 13)),
                const Spacer(),
                if (pendingCount > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: AppColors.danger, borderRadius: BorderRadius.circular(10)),
                    child: Text('$pendingCount', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

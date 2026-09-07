import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/dashboard.dart';
import '../../models/homework_item.dart';
import '../../models/subject_score.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';
import 'student_rewards_screen.dart';

/// Student Home — Phase 3. Surfaces the most useful info first: streak,
/// homework due, subject progress, announcements. Mirrors the content of
/// `StudentDashboard.jsx`'s home view, redesigned as stacked mobile cards
/// instead of a multi-column desktop grid.
class StudentHomeScreen extends ConsumerWidget {
  const StudentHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).value;
    final dashboardAsync = ref.watch(dashboardProvider);
    final homeworkAsync = ref.watch(homeworkProvider);
    final progressAsync = ref.watch(progressProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('Hi, ${session?.name.isNotEmpty == true ? session!.name : 'Student'} 👋'),
        actions: const [_RewardsChip(), SizedBox(width: 12)],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardProvider);
          ref.invalidate(homeworkProvider);
          ref.invalidate(progressProvider);
          ref.invalidate(rewardsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            dashboardAsync.when(
              loading: () => const SectionCard(child: SkeletonBox(height: 90)),
              error: (e, _) => SectionCard(child: ErrorInline(message: 'Unable to load streak: $e')),
              data: (d) => _StreakCard(streak: d.streak),
            ),
            homeworkAsync.when(
              loading: () => const SectionCard(title: '📝 Homework', child: SkeletonBox(height: 60)),
              error: (e, _) => SectionCard(title: '📝 Homework', child: ErrorInline(message: 'Unable to load homework: $e')),
              data: (items) => _HomeworkSummaryCard(items: items),
            ),
            progressAsync.when(
              loading: () => const SectionCard(title: '📈 Subjects', child: SkeletonBox(height: 60)),
              error: (e, _) => SectionCard(title: '📈 Subjects', child: ErrorInline(message: 'Unable to load progress: $e')),
              data: (scores) => _SubjectsRow(scores: scores),
            ),
            dashboardAsync.maybeWhen(
              data: (d) => _AnnouncementsCard(dashboard: d),
              orElse: () => const SizedBox.shrink(),
            ),
            dashboardAsync.maybeWhen(
              data: (d) => _MyTeachersCard(dashboard: d),
              orElse: () => const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }
}

class _RewardsChip extends ConsumerWidget {
  const _RewardsChip();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rewardsAsync = ref.watch(rewardsProvider);
    final coins = rewardsAsync.value?.coins ?? 0;
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StudentRewardsScreen())),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(20)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('⭐', style: TextStyle(fontSize: 13)),
            const SizedBox(width: 4),
            Text('$coins', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.brand, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

class _StreakCard extends StatelessWidget {
  final StreakInfo streak;

  const _StreakCard({required this.streak});

  @override
  Widget build(BuildContext context) {
    final weeklyGoalPct = ((streak.days.clamp(0, 7)) / 7 * 100).round();
    return SectionCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Text('🔥', style: TextStyle(fontSize: 22)),
                    const SizedBox(width: 6),
                    Text('${streak.days}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                    const SizedBox(width: 4),
                    Text('day${streak.days == 1 ? '' : 's'}', style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 6),
                if (streak.atRisk)
                  const Text("⚠️ Study today or you'll lose your streak!",
                      style: TextStyle(color: AppColors.warn, fontSize: 12, fontWeight: FontWeight.w600))
                else if (streak.activeToday)
                  const Text('✅ Done for today', style: TextStyle(color: AppColors.ok, fontSize: 12, fontWeight: FontWeight.w600)),
                if (streak.milestones.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: streak.milestones
                        .map((m) => Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: Opacity(
                                opacity: m.earned ? 1 : 0.35,
                                child: Column(
                                  children: [
                                    Text(m.earned ? m.icon : '🔒', style: const TextStyle(fontSize: 16)),
                                    Text('${m.days}d', style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                                  ],
                                ),
                              ),
                            ))
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
          SizedBox(
            width: 56,
            height: 56,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: weeklyGoalPct / 100,
                  strokeWidth: 5,
                  backgroundColor: AppColors.line,
                  color: AppColors.warn,
                ),
                Text('$weeklyGoalPct%', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeworkSummaryCard extends StatelessWidget {
  final List<HomeworkItem> items;

  const _HomeworkSummaryCard({required this.items});

  @override
  Widget build(BuildContext context) {
    final pendingBySubject = <String, int>{};
    for (final h in items) {
      if (h.submitted || h.expired) continue;
      pendingBySubject[h.subject] = (pendingBySubject[h.subject] ?? 0) + 1;
    }

    return SectionCard(
      title: '📝 Homework',
      child: pendingBySubject.isEmpty
          ? const Text('🎉 No homework assigned for today. Have fun!', style: TextStyle(color: AppColors.muted, fontSize: 13))
          : Column(
              children: pendingBySubject.entries
                  .map((e) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('📚 ${e.key}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration:
                                  BoxDecoration(color: AppColors.danger.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                              child: Text('${e.value} pending',
                                  style: const TextStyle(color: AppColors.danger, fontSize: 11, fontWeight: FontWeight.w700)),
                            ),
                          ],
                        ),
                      ))
                  .toList(),
            ),
    );
  }
}

class _SubjectsRow extends StatelessWidget {
  final List<SubjectScore> scores;

  const _SubjectsRow({required this.scores});

  @override
  Widget build(BuildContext context) {
    if (scores.isEmpty) {
      return const SectionCard(
          title: '📈 Subjects', child: Text('No subjects yet.', style: TextStyle(color: AppColors.muted, fontSize: 13)));
    }
    return SectionCard(
      title: '📈 Subjects',
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: SizedBox(
        height: 84,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: scores.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (context, i) => _SubjectChip(score: scores[i]),
        ),
      ),
    );
  }
}

class _SubjectChip extends StatelessWidget {
  final SubjectScore score;

  const _SubjectChip({required this.score});

  @override
  Widget build(BuildContext context) {
    final color = SubjectPalette.colorFor(score.subject);
    return Container(
      width: 100,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(score.subject,
              maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
          Text('${score.score}%', style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 18)),
        ],
      ),
    );
  }
}

class _AnnouncementsCard extends StatelessWidget {
  final DashboardData dashboard;

  const _AnnouncementsCard({required this.dashboard});

  @override
  Widget build(BuildContext context) {
    final items = dashboard.announcements.take(4).toList();
    return SectionCard(
      title: '📣 Announcements',
      child: items.isEmpty
          ? const Text('No announcements yet.', style: TextStyle(color: AppColors.muted, fontSize: 13))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: items
                  .map((a) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: RichText(
                          text: TextSpan(
                            style: const TextStyle(fontSize: 13, color: AppColors.text),
                            children: [
                              TextSpan(text: '${a.title}: ', style: const TextStyle(fontWeight: FontWeight.w700)),
                              TextSpan(text: a.message),
                            ],
                          ),
                        ),
                      ))
                  .toList(),
            ),
    );
  }
}

class _MyTeachersCard extends StatelessWidget {
  final DashboardData dashboard;

  const _MyTeachersCard({required this.dashboard});

  @override
  Widget build(BuildContext context) {
    if (dashboard.classTeachers.isEmpty) return const SizedBox.shrink();
    return SectionCard(
      title: '👩‍🏫 My Teachers',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: dashboard.classTeachers
            .map((t) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Text('${t.subject} — ${t.name}', style: const TextStyle(fontSize: 13)),
                ))
            .toList(),
      ),
    );
  }
}


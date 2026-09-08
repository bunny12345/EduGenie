import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/dashboard.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';
import 'student_ai_tutor_screen.dart';
import 'student_calendar_screen.dart';
import 'student_games_screen.dart';
import 'student_library_screen.dart';
import 'student_orchard_screen.dart';
import 'student_progress_screen.dart';
import 'student_rewards_screen.dart';
import 'student_tasks_screen.dart';

/// Student Home — mirrors the web app's home page content (streak + weekly
/// goal + the "Academics" quick-access icon grid) with the sidebar dropped
/// and everything sized down for mobile. Other home sections (homework
/// summary, subjects row, announcements, teachers) are intentionally left
/// off per the current redesign scope — other pages are being redesigned
/// separately next.
class StudentHomeScreen extends ConsumerWidget {
  const StudentHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).value;
    final dashboardAsync = ref.watch(dashboardProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('Hi, ${session?.name.isNotEmpty == true ? session!.name : 'Student'} 👋'),
        actions: const [_RewardsChip(), SizedBox(width: 12)],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardProvider);
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
            const SizedBox(height: 4),
            const _AcademicsGrid(),
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

class _AcademicItem {
  final String gifAsset;
  final String label;
  final Color background;
  final WidgetBuilder builder;

  const _AcademicItem({
    required this.gifAsset,
    required this.label,
    required this.background,
    required this.builder,
  });
}

/// Mirrors the web home page's "Academics" quick-access grid
/// (`eg-academ-grid`/`eg-academ-card`/`eg-academ-icon` in
/// `StudentDashboard.jsx`/`App.css`) exactly — same 9 destinations, same
/// bundled GIF icons, same white bordered card panel and icon-tile
/// background tints, and a press-down "3D button" tactile effect standing in
/// for web's hover-lift/active-flatten (mobile has no hover).
class _AcademicsGrid extends StatelessWidget {
  const _AcademicsGrid();

  static final _items = <_AcademicItem>[
    _AcademicItem(
      gifAsset: 'assets/gifs/ai-tutor.gif',
      label: 'AI Tutor',
      background: const Color(0xFFEEF0FF),
      builder: (_) => const StudentAiTutorScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/homework.gif',
      label: 'Homework',
      background: const Color(0xFFFEF3E2),
      builder: (_) => const StudentTasksScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/my-orchard.gif',
      label: 'My Orchard',
      background: const Color(0xFFE8F8EE),
      builder: (_) => const StudentOrchardScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/mock-tests.gif',
      label: 'Mock Tests',
      background: const Color(0xFFFDE8EE),
      builder: (_) => const StudentTasksScreen(initialTabIndex: 1),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/progress.gif',
      label: 'Progress',
      background: const Color(0xFFE0F2FE),
      builder: (_) => const StudentProgressScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/games.gif',
      label: 'Games',
      background: const Color(0xFFFEF9E7),
      builder: (_) => const StudentGamesScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/calendar.gif',
      label: 'Calendar',
      background: const Color(0xFFF0E6FF),
      builder: (_) => const StudentCalendarScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/rewards.gif',
      label: 'Rewards',
      background: const Color(0xFFFFF7ED),
      builder: (_) => const StudentRewardsScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/library.gif',
      label: 'Library',
      background: const Color(0xFFECFDF5),
      builder: (_) => const StudentLibraryScreen(),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'Academics',
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 0.82,
        ),
        itemCount: _items.length,
        itemBuilder: (context, i) => _AcademicCard(item: _items[i]),
      ),
    );
  }
}

/// One "eg-academ-card" tile — white bordered panel, colored icon tile with
/// the bundled GIF, label below, and a tactile press-down scale/border effect.
class _AcademicCard extends StatefulWidget {
  final _AcademicItem item;

  const _AcademicCard({required this.item});

  @override
  State<_AcademicCard> createState() => _AcademicCardState();
}

class _AcademicCardState extends State<_AcademicCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapCancel: () => setState(() => _pressed = false),
      onTapUp: (_) => setState(() => _pressed = false),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: widget.item.builder)),
      child: AnimatedScale(
        scale: _pressed ? 0.94 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 110),
          curve: Curves.easeOut,
          padding: const EdgeInsets.fromLTRB(8, 14, 8, 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _pressed ? const Color(0xFFC7C0FF) : const Color(0xFFECE8FF)),
            boxShadow: _pressed
                ? const [BoxShadow(color: Color(0x21636EF1), blurRadius: 10, offset: Offset(0, 2))]
                : const [],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 52,
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: widget.item.background, borderRadius: BorderRadius.circular(14)),
                child: Image.asset(widget.item.gifAsset, width: 36, height: 36, fit: BoxFit.contain),
              ),
              const SizedBox(height: 6),
              Text(
                widget.item.label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF374151)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}


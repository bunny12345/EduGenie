import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/dashboard.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';
import 'student_ai_tutor_screen.dart';
import 'student_announcements_screen.dart';
import 'student_calendar_screen.dart';
import 'student_games_screen.dart';
import 'student_library_screen.dart';
import 'student_orchard_screen.dart';
import 'student_progress_screen.dart';
import 'student_rewards_screen.dart';
import 'homework/homework_screen.dart';

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
    final dashboardAsync = ref.watch(dashboardProvider);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        centerTitle: false,
        title: const _ProfileChip(),
        actions: const [
          _StreakTopChip(),
          SizedBox(width: 6),
          _CoinsTopChip(),
          SizedBox(width: 6),
          _AnnouncementBell(),
          SizedBox(width: 12),
        ],
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

/// Mirrors `.eg-streak-chip` — the flame + day-count pill from the website's
/// top bar, sized down for the mobile app bar. Same at-risk/done-today/zero
/// color states as `.eg-streak-chip.at-risk`/`.done-today`/`.is-zero`.
class _StreakTopChip extends ConsumerWidget {
  const _StreakTopChip();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final streak = ref.watch(dashboardProvider).value?.streak;
    final days = streak?.days ?? 0;
    final atRisk = streak?.atRisk ?? false;
    final doneToday = streak?.activeToday ?? false;

    late final Gradient gradient;
    late final Color textColor;
    if (days == 0) {
      gradient = const LinearGradient(colors: [Color(0xFFF4F5FF), Color(0xFFF4F5FF)]);
      textColor = const Color(0xFF6B7090);
    } else if (atRisk) {
      gradient = const LinearGradient(colors: [Color(0xFFFFD9D0), Color(0xFFFF8A6B)]);
      textColor = const Color(0xFF7A1500);
    } else if (doneToday) {
      gradient = const LinearGradient(colors: [Color(0xFFFFD88A), Color(0xFFFF9D3C)]);
      textColor = const Color(0xFF5C2200);
    } else {
      gradient = const LinearGradient(colors: [Color(0xFFFFE9C7), Color(0xFFFFCF8F)]);
      textColor = const Color(0xFF7A2E00);
    }

    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StudentRewardsScreen())),
      child: Container(
        height: 28,
        padding: const EdgeInsets.fromLTRB(8, 0, 9, 0),
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0x4D28282D), width: 1.5),
          boxShadow: days > 0 ? const [BoxShadow(color: Color(0x47FF9500), blurRadius: 8, offset: Offset(0, 2))] : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('🔥', style: TextStyle(fontSize: 14, color: days == 0 ? textColor.withValues(alpha: 0.5) : null)),
            const SizedBox(width: 4),
            Text('$days', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: textColor)),
            const SizedBox(width: 2),
            Text('d', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: textColor.withValues(alpha: 0.8))),
          ],
        ),
      ),
    );
  }
}

/// Mirrors `.eg-coins-chip` — the golden 3D coin medallion pill from the
/// website's top bar, sized down for the mobile app bar.
class _CoinsTopChip extends ConsumerWidget {
  const _CoinsTopChip();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rewardsAsync = ref.watch(rewardsProvider);
    final coins = rewardsAsync.value?.coins ?? 0;
    final isZero = coins <= 0;

    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StudentRewardsScreen())),
      child: Container(
        height: 28,
        padding: const EdgeInsets.fromLTRB(7, 0, 10, 0),
        decoration: BoxDecoration(
          gradient: isZero
              ? const LinearGradient(colors: [Color(0xFFF6EFD6), Color(0xFFECDFB4)])
              : const LinearGradient(colors: [Color(0xFFFFF4C2), Color(0xFFFFD85E), Color(0xFFF5B010)]),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: isZero ? const Color(0xFFDCC98E) : const Color(0x4D28282D), width: 1.5),
          boxShadow: isZero ? null : const [BoxShadow(color: Color(0x6AD8A014), blurRadius: 10, offset: Offset(0, 2))],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 18,
              height: 18,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: isZero
                    ? const LinearGradient(colors: [Color(0xFFF3ECD6), Color(0xFFBFA870)])
                    : const RadialGradient(colors: [Color(0xFFFFF7D4), Color(0xFFFFE17A), Color(0xFFF7B731)]),
                border: Border.all(color: isZero ? const Color(0xFFB7A375) : const Color(0xFFB9791A), width: 1.2),
              ),
              child: Text('★', style: TextStyle(fontSize: 9, color: isZero ? const Color(0xFF8A7134) : const Color(0xFFA86A08))),
            ),
            const SizedBox(width: 5),
            Text('$coins', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: isZero ? const Color(0xFF8A7134) : const Color(0xFF6A4200))),
          ],
        ),
      ),
    );
  }
}

/// The bell that mirrors the website's "Announcements" home panel — every
/// announcement the teacher/school posted lives behind this icon instead of
/// a mini list card, since mobile has no room for it on the home page itself.
class _AnnouncementBell extends ConsumerWidget {
  const _AnnouncementBell();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(dashboardProvider).value?.announcements.length ?? 0;

    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StudentAnnouncementsScreen())),
      child: Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: const Color(0x4D28282D), width: 1.5),
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            const Icon(Icons.notifications_outlined, size: 16, color: AppColors.text),
            if (count > 0)
              Positioned(
                top: -4,
                right: -4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  constraints: const BoxConstraints(minWidth: 14),
                  decoration: BoxDecoration(color: AppColors.danger, borderRadius: BorderRadius.circular(999)),
                  child: Text(
                    count > 9 ? '9+' : '$count',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Mirrors `.eg-profile-chip` — avatar + "Hi, {name}" / "Student · {class}"
/// pill in the top-left, opening the `.eg-profile-dropdown` details card
/// (avatar, school badge, class/gender/login-id) anchored right below it.
class _ProfileChip extends ConsumerStatefulWidget {
  const _ProfileChip();

  @override
  ConsumerState<_ProfileChip> createState() => _ProfileChipState();
}

class _ProfileChipState extends ConsumerState<_ProfileChip> {
  final LayerLink _link = LayerLink();
  OverlayEntry? _entry;

  static String _avatarEmoji(String? gender) {
    switch (gender?.toLowerCase()) {
      case 'female':
        return '👩';
      case 'male':
        return '👦';
      default:
        return '🧑';
    }
  }

  void _toggle(String name, String className, DashboardData? dashboard) {
    if (_entry != null) {
      _close();
      return;
    }
    _entry = _buildOverlay(name, className, dashboard);
    Overlay.of(context).insert(_entry!);
  }

  void _close() {
    _entry?.remove();
    _entry = null;
  }

  @override
  void dispose() {
    _close();
    super.dispose();
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF1F2340))),
          const SizedBox(width: 4),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 11, color: Color(0xFF475569), fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }

  OverlayEntry _buildOverlay(String name, String className, DashboardData? dashboard) {
    final emoji = _avatarEmoji(dashboard?.gender);
    final schoolName = dashboard?.schoolName ?? '';
    final gender = dashboard?.gender ?? '';
    final loginId = dashboard?.loginId ?? '';
    final hasDetails = className.isNotEmpty || gender.isNotEmpty || loginId.isNotEmpty;

    return OverlayEntry(
      builder: (context) => Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: _close, child: const SizedBox.expand()),
          ),
          CompositedTransformFollower(
            link: _link,
            showWhenUnlinked: false,
            offset: const Offset(0, 44),
            child: Material(
              color: Colors.transparent,
              child: Container(
                width: 230,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE4E8F8)),
                  boxShadow: const [BoxShadow(color: Color(0x29272D64), blurRadius: 32, offset: Offset(0, 10))],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(colors: [Color(0xFFF0EDFF), Color(0xFFE8F0FF)]),
                      ),
                      alignment: Alignment.center,
                      child: Text(emoji, style: const TextStyle(fontSize: 30)),
                    ),
                    const SizedBox(height: 8),
                    Text(name, style: const TextStyle(fontSize: 14, color: Color(0xFF1E293B), fontWeight: FontWeight.w700)),
                    if (schoolName.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(color: const Color(0xFFEEF0FF), borderRadius: BorderRadius.circular(999)),
                        child: Text('🏫 $schoolName', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF6366F1))),
                      ),
                    ],
                    if (hasDetails) ...[
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.only(top: 8),
                        decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0xFFF0F2FF)))),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (className.isNotEmpty) _detailRow('Class:', className),
                            if (gender.isNotEmpty) _detailRow('Gender:', gender[0].toUpperCase() + gender.substring(1)),
                            if (loginId.isNotEmpty) _detailRow('Login ID:', loginId),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final dashboard = ref.watch(dashboardProvider).value;
    final name = session?.name.isNotEmpty == true ? session!.name : 'Student';
    final className = dashboard?.className ?? session?.className ?? '';

    return CompositedTransformTarget(
      link: _link,
      child: GestureDetector(
        onTap: () => _toggle(name, className, dashboard),
        child: Container(
          constraints: const BoxConstraints(minHeight: 30),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: const Color(0x4D28282D), width: 1.5),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFFDDE2FF)),
                  gradient: const LinearGradient(colors: [Color(0xFFF3F5FF), Color(0xFFE8ECFF)]),
                ),
                alignment: Alignment.center,
                child: Text(_avatarEmoji(dashboard?.gender), style: const TextStyle(fontSize: 12)),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Hi, $name', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, height: 1.1, color: AppColors.text)),
                  Text(
                    className.isNotEmpty ? 'Student · $className' : 'Student',
                    style: const TextStyle(fontSize: 10, color: Color(0xFF7C82A7), height: 1.1),
                  ),
                ],
              ),
              const SizedBox(width: 6),
              const Text('▾', style: TextStyle(fontSize: 10, color: Color(0xFF7C82A7))),
            ],
          ),
        ),
      ),
    );
  }
}

/// Mirrors `.eg-streak-box` in `web/src/App.css` — golden glow ring by
/// default, peach gradient when done-today, salmon gradient + pulsing nudge
/// banner when at-risk, milestone badges row, and the gold gradient progress
/// bar toward the next badge.
class _StreakCard extends StatelessWidget {
  final StreakInfo streak;

  const _StreakCard({required this.streak});

  @override
  Widget build(BuildContext context) {
    final days = streak.days;
    final atRisk = streak.atRisk;
    final doneToday = streak.activeToday;

    late final Color ringColor;
    late final Gradient bgGradient;
    if (atRisk) {
      ringColor = const Color(0xFFFFB4A0);
      bgGradient = const LinearGradient(colors: [Color(0xFFFFF5F2), Color(0xFFFFE6DE)], begin: Alignment.topLeft, end: Alignment.bottomRight);
    } else if (doneToday) {
      ringColor = const Color(0xFFFFD08A);
      bgGradient = const LinearGradient(colors: [Color(0xFFFFFAF0), Color(0xFFFFF2D9)], begin: Alignment.topLeft, end: Alignment.bottomRight);
    } else {
      ringColor = const Color(0xFFF5B942);
      bgGradient = const LinearGradient(colors: [Color(0xFFFAFBFF), Color(0xFFFAFBFF)]);
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 9),
      decoration: BoxDecoration(
        gradient: bgGradient,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ringColor, width: 1.5),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 16, offset: const Offset(0, 6)),
          BoxShadow(color: ringColor.withValues(alpha: 0.4), blurRadius: 8),
        ],
      ),
      child: Column(
        children: [
          Text(
            'Current Streak${doneToday ? ' ✅' : ''}',
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.text),
          ),
          const SizedBox(height: 2),
          Text('$days', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.brand, height: 1)),
          Text('Day${days == 1 ? '' : 's'} 🔥', style: const TextStyle(fontSize: 9, color: Color(0xFF6F76A2))),
          if (atRisk) ...[
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: const Color(0xFFFFECE6),
                borderRadius: BorderRadius.circular(7),
                border: Border.all(color: const Color(0xFFFFC4B3)),
              ),
              child: Text(
                streak.freezesAvailable > 0
                    ? 'Study today to keep your streak! ❄️ A freeze will protect it once.'
                    : 'Study today or your streak resets!',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFFB23C17), height: 1.25),
              ),
            ),
          ] else if (days > 0 && (streak.freezeUsed || streak.freezesAvailable > 0)) ...[
            const SizedBox(height: 4),
            Text(
              streak.freezeUsed ? '❄️ A freeze saved a missed day' : '❄️ Freeze ready — one missed day is protected',
              style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w700, color: Color(0xFF2F7FB0)),
            ),
          ],
          if (streak.milestones.isNotEmpty) ...[
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: streak.milestones.map((m) {
                final badgeGradient = m.earned
                    ? const LinearGradient(colors: [Color(0xFFFFF6E6), Color(0xFFFFE9C7)], begin: Alignment.topLeft, end: Alignment.bottomRight)
                    : const LinearGradient(colors: [Color(0xFFFAFBFF), Color(0xFFFAFBFF)]);
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 26),
                    padding: const EdgeInsets.fromLTRB(4, 3, 4, 2),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(6),
                      gradient: badgeGradient,
                      border: Border.all(color: m.earned ? const Color(0xFFFFCF8F) : const Color(0xFFECEFF9)),
                      boxShadow: m.earned ? const [BoxShadow(color: Color(0x2EFF9500), blurRadius: 5, offset: Offset(0, 1))] : null,
                    ),
                    child: Opacity(
                      opacity: m.earned ? 1 : 0.65,
                      child: Column(
                        children: [
                          Text(m.earned ? m.icon : '🔒', style: const TextStyle(fontSize: 12, height: 1)),
                          Text(
                            '${m.days}d',
                            style: TextStyle(fontSize: 7, fontWeight: FontWeight.w700, color: m.earned ? const Color(0xFFA15C00) : const Color(0xFF6B7090)),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
          if (streak.nextMilestone != null) ...[
            const SizedBox(height: 5),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: Container(
                width: double.infinity,
                height: 8,
                color: const Color(0xFFECECF6),
                child: FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: (days / streak.nextMilestone!).clamp(0, 1),
                  child: Container(
                    decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFFFFD23F), Color(0xFFFFB200)])),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 3),
            Text(
              '${streak.daysToNextMilestone} day${streak.daysToNextMilestone == 1 ? '' : 's'} to your ${streak.nextMilestone}-day badge',
              style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w600, color: Color(0xFF7F86AE)),
            ),
          ],
          if (streak.longest > 0) ...[
            const SizedBox(height: 2),
            Text(
              '🏆 Best: ${streak.longest} day${streak.longest == 1 ? '' : 's'}',
              style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w600, color: Color(0xFF8A6D3B)),
            ),
          ],
        ],
      ),
    );
  }
}

/// The site-wide "3D button" frame — a light-black ring border + soft drop
/// shadow, ported from `.eg-subject-hw-card button` in `App.css`.
const Color _frame3dColor = Color(0xFF46464E);

Border _frame3dBorder({double alpha = 0.35, double width = 1.5}) => Border.all(color: _frame3dColor.withValues(alpha: alpha), width: width);

List<BoxShadow> _frame3dShadow({double alpha = 0.18, double blur = 10}) =>
    [BoxShadow(color: Colors.black.withValues(alpha: alpha), blurRadius: blur, offset: const Offset(0, 4))];

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
      builder: (_) => const HomeworkScreen(),
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
      builder: (_) => const HomeworkScreen(),
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
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: _frame3dBorder(),
        boxShadow: _frame3dShadow(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Academics', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          GridView.builder(
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
        ],
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
          padding: const EdgeInsets.fromLTRB(6, 10, 6, 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: _pressed ? _frame3dBorder() : Border.all(color: const Color(0xFFECE8FF)),
            boxShadow: _pressed ? _frame3dShadow() : const [],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: widget.item.background, borderRadius: BorderRadius.circular(14)),
                child: Image.asset(widget.item.gifAsset, width: 32, height: 32, fit: BoxFit.contain),
              ),
              const SizedBox(height: 5),
              Text(
                widget.item.label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: Color(0xFF374151), height: 1.15),
              ),
            ],
          ),
        ),
      ),
    );
  }
}


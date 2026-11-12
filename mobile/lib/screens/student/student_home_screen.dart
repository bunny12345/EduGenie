import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/dashboard.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/student_shortcut_tile.dart';
import '../../widgets/quick_sam_bubble.dart';
import '../../widgets/rank_badge.dart';
import '../../widgets/section_card.dart';
import 'student_ai_tutor_screen.dart';
import 'student_announcements_screen.dart';
import 'student_calendar_screen.dart';
import 'student_games_screen.dart';
import 'student_library_screen.dart';
import 'student_orchard_screen.dart';
import 'student_progress_screen.dart';
import 'student_rewards_screen.dart';
import 'student_report_card_screen.dart';
import 'homework/homework_screen.dart';

/// Home-only presentation; destinations and shared portal styling stay intact.
class StudentHomeScreen extends ConsumerWidget {
  const StudentHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(dashboardProvider);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        toolbarHeight:
            64 +
            (MediaQuery.textScalerOf(context).scale(1) - 1).clamp(0, 2) * 24,
        centerTitle: false,
        title: const _ProfileChip(),
        actions: const [
          _CoinsTopChip(),
          SizedBox(width: 8),
          _AnnouncementBell(),
          SizedBox(width: 16),
        ],
      ),
      floatingActionButton: const QuickSamBubble(),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardProvider);
          ref.invalidate(rewardsProvider);
        },
        child: ListView(
          // Extra bottom room so the floating Sam bubble never covers the Academics grid.
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 96),
          children: [
            // Left out entirely until the dashboard has loaded a school name.
            _SchoolBanner(name: dashboardAsync.value?.schoolName),
            dashboardAsync.when(
              loading: () => const SectionCard(child: SkeletonBox(height: 90)),
              error: (e, _) => SectionCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ErrorInline(message: 'Unable to load streak: $e'),
                    TextButton(
                      onPressed: () => ref.invalidate(dashboardProvider),
                      child: const Text('Try again'),
                    ),
                  ],
                ),
              ),
              data: (d) => _StreakCard(streak: d.streak),
            ),
            const SizedBox(height: 12),
            const _AcademicsGrid(),
          ],
        ),
      ),
    );
  }
}

/// The student's school name, shown between the app bar and the streak card so
/// each school sees its own name on the app. Mirrors the banner that replaced
/// the search box in the website's top bar.
class _SchoolBanner extends StatelessWidget {
  final String? name;

  const _SchoolBanner({required this.name});

  @override
  Widget build(BuildContext context) {
    final school = name?.trim() ?? '';
    if (school.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.sidebar, AppColors.sidebar2, AppColors.brand2],
        ),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x242B3BE0),
            blurRadius: 24,
            offset: Offset(0, 10),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            right: -35,
            top: -70,
            child: _BannerCircle(size: 200, alpha: 0.06),
          ),
          Positioned(
            right: -55,
            bottom: -90,
            child: _BannerCircle(size: 190, alpha: 0.06),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                Image.asset(
                  'assets/branding/logo.png',
                  width: 38,
                  height: 38,
                  excludeFromSemantics: true,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        'AcademiX · YOUR SCHOOL',
                        style: TextStyle(
                          color: Color(0xFFBFC8FF),
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        school,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          height: 1.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BannerCircle extends StatelessWidget {
  final double size;
  final double alpha;

  const _BannerCircle({required this.size, required this.alpha});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: alpha),
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

    return Semantics(
      button: true,
      label: '$coins coins. Open rewards',
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => Navigator.of(
          context,
        ).push(MaterialPageRoute(builder: (_) => const StudentRewardsScreen())),
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.fromLTRB(7, 0, 10, 0),
          decoration: BoxDecoration(
            gradient: isZero
                ? const LinearGradient(
                    colors: [Color(0xFFF6EFD6), Color(0xFFECDFB4)],
                  )
                : const LinearGradient(
                    colors: [
                      Color(0xFFFFF4C2),
                      Color(0xFFFFD85E),
                      Color(0xFFF5B010),
                    ],
                  ),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: isZero ? const Color(0xFFDCC98E) : const Color(0x4D28282D),
              width: 1.5,
            ),
            boxShadow: isZero
                ? null
                : const [
                    BoxShadow(
                      color: Color(0x6AD8A014),
                      blurRadius: 10,
                      offset: Offset(0, 2),
                    ),
                  ],
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
                      ? const LinearGradient(
                          colors: [Color(0xFFF3ECD6), Color(0xFFBFA870)],
                        )
                      : const RadialGradient(
                          colors: [
                            Color(0xFFFFF7D4),
                            Color(0xFFFFE17A),
                            Color(0xFFF7B731),
                          ],
                        ),
                  border: Border.all(
                    color: isZero
                        ? const Color(0xFFB7A375)
                        : const Color(0xFFB9791A),
                    width: 1.2,
                  ),
                ),
                child: Text(
                  '★',
                  style: TextStyle(
                    fontSize: 9,
                    color: isZero
                        ? const Color(0xFF8A7134)
                        : const Color(0xFFA86A08),
                  ),
                ),
              ),
              const SizedBox(width: 5),
              Text(
                '$coins',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                  color: isZero
                      ? const Color(0xFF8A7134)
                      : const Color(0xFF6A4200),
                ),
              ),
            ],
          ),
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

    return Semantics(
      button: true,
      label:
          'Announcements, $count ${count == 1 ? 'announcement' : 'announcements'}',
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const StudentAnnouncementsScreen()),
        ),
        child: Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(15),
            border: Border.all(color: AppColors.line),
          ),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Icon(
                Icons.notifications_none_rounded,
                size: 22,
                color: AppColors.text,
              ),
              if (count > 0)
                Positioned(
                  top: -4,
                  right: -4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 1,
                    ),
                    constraints: const BoxConstraints(minWidth: 14),
                    decoration: BoxDecoration(
                      color: AppColors.danger,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      count > 9 ? '9+' : '$count',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 8,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
            ],
          ),
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
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: Color(0xFF1F2340),
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 11,
                color: Color(0xFF475569),
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  OverlayEntry _buildOverlay(
    String name,
    String className,
    DashboardData? dashboard,
  ) {
    final emoji = _avatarEmoji(dashboard?.gender);
    final schoolName = dashboard?.schoolName ?? '';
    final gender = dashboard?.gender ?? '';
    final loginId = dashboard?.loginId ?? '';
    final hasDetails =
        className.isNotEmpty || gender.isNotEmpty || loginId.isNotEmpty;
    final badge = ref.read(reportCardsProvider).value?.badge;

    return OverlayEntry(
      builder: (context) => Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _close,
              child: const SizedBox.expand(),
            ),
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
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x29272D64),
                      blurRadius: 32,
                      offset: Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [Color(0xFFF0EDFF), Color(0xFFE8F0FF)],
                        ),
                      ),
                      alignment: Alignment.center,
                      child: Text(emoji, style: const TextStyle(fontSize: 30)),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      name,
                      style: const TextStyle(
                        fontSize: 14,
                        color: Color(0xFF1E293B),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (schoolName.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEEF0FF),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          '🏫 $schoolName',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF6366F1),
                          ),
                        ),
                      ),
                    ],
                    if (badge != null &&
                        badge.rank >= 1 &&
                        badge.rank <= 3) ...[
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xFFFFF9DF), Colors.white],
                          ),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: const Color(0xFFF3D36B),
                            width: 1.5,
                          ),
                        ),
                        child: Column(
                          children: [
                            RankBadge(rank: badge.rank, size: 64),
                            const SizedBox(height: 4),
                            Text(
                              '${rankOrdinal(badge.rank)} in class · ${badge.examName}',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF6B4A00),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (hasDetails) ...[
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.only(top: 8),
                        decoration: const BoxDecoration(
                          border: Border(
                            top: BorderSide(color: Color(0xFFF0F2FF)),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (className.isNotEmpty)
                              _detailRow('Class:', className),
                            if (gender.isNotEmpty)
                              _detailRow(
                                'Gender:',
                                gender[0].toUpperCase() + gender.substring(1),
                              ),
                            if (loginId.isNotEmpty)
                              _detailRow('Login ID:', loginId),
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
    final badge = ref.watch(reportCardsProvider).value?.badge;

    return CompositedTransformTarget(
      link: _link,
      child: Semantics(
        button: true,
        label: 'Open student profile',
        child: GestureDetector(
          onTap: () => _toggle(name, className, dashboard),
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(vertical: 5),
            decoration: BoxDecoration(color: Colors.transparent),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: const Color(0xFFDDE2FF)),
                        gradient: const LinearGradient(
                          colors: [Color(0xFFF3F5FF), Color(0xFFE8ECFF)],
                        ),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        _avatarEmoji(dashboard?.gender),
                        style: const TextStyle(fontSize: 22),
                      ),
                    ),
                    if (badge != null && badge.rank >= 1 && badge.rank <= 3)
                      Positioned(
                        right: -9,
                        bottom: -11,
                        child: RankBadge(
                          rank: badge.rank,
                          size: 22,
                          animated: false,
                        ),
                      ),
                  ],
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Hi, $name',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          height: 1.3,
                          color: AppColors.text,
                        ),
                      ),
                      Text(
                        className.isNotEmpty
                            ? 'Student · $className'
                            : 'Student',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          color: AppColors.muted,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                const Text(
                  '▾',
                  style: TextStyle(fontSize: 10, color: Color(0xFF7C82A7)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StreakCard extends StatefulWidget {
  final StreakInfo streak;

  const _StreakCard({required this.streak});

  @override
  State<_StreakCard> createState() => _StreakCardState();
}

class _StreakCardState extends State<_StreakCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final streak = widget.streak;
    final days = streak.days;
    final atRisk = streak.atRisk;
    final doneToday = streak.activeToday;

    final accent = atRisk ? const Color(0xFFE26735) : const Color(0xFFD58A16);
    final next = streak.nextMilestone;

    return Container(
      width: double.infinity,
      key: const ValueKey('student-home-streak'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.line),
        boxShadow: [
          BoxShadow(
            color: AppColors.sidebar.withValues(alpha: 0.04),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  Icons.local_fire_department_rounded,
                  color: accent,
                  size: 30,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Current Streak',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.muted,
                      ),
                    ),
                    Text(
                      '$days ${days == 1 ? 'day' : 'days'}',
                      style: TextStyle(
                        fontSize: 23,
                        fontWeight: FontWeight.w800,
                        color: AppColors.text,
                        height: 1.2,
                      ),
                    ),
                  ],
                ),
              ),
              if (doneToday)
                Tooltip(
                  message: 'Learning activity completed today',
                  child: Icon(
                    Icons.check_circle_rounded,
                    color: AppColors.ok,
                    size: 26,
                  ),
                ),
              IconButton(
                tooltip: _expanded
                    ? 'Hide streak details'
                    : 'Show streak details',
                onPressed: () => setState(() => _expanded = !_expanded),
                icon: Icon(
                  _expanded
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                  color: AppColors.muted,
                ),
              ),
            ],
          ),
          if (!_expanded) ...[
            const SizedBox(height: 8),
            if (next != null && next > 0) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: (days / next).clamp(0, 1),
                  minHeight: 5,
                  backgroundColor: AppColors.line,
                  color: accent,
                  semanticsLabel: 'Progress to $next-day badge',
                ),
              ),
              const SizedBox(height: 6),
            ],
            Text(
              atRisk
                  ? 'Study today to protect your streak.'
                  : doneToday
                  ? 'Today’s learning complete. Keep it up!'
                  : days == 0
                  ? 'One small step starts your streak.'
                  : next != null
                  ? '$days / $next days toward your next badge'
                  : 'Keep your learning rhythm going.',
              style: TextStyle(
                fontSize: 11,
                height: 1.3,
                color: AppColors.muted,
              ),
            ),
          ],
          if (_expanded) ...[
            if (!atRisk && (doneToday || days == 0)) ...[
              const SizedBox(height: 8),
              Text(
                doneToday
                    ? 'A little effort today. A stronger you tomorrow.'
                    : 'Your next chapter starts with one small step.',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: AppColors.muted,
                ),
              ),
            ],
            if (atRisk) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  streak.freezesAvailable > 0
                      ? 'Study today to keep your streak! ❄️ A freeze will protect it once.'
                      : 'Study today or your streak resets!',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.isDark
                        ? const Color(0xFFFFBB9D)
                        : const Color(0xFF9B401B),
                    height: 1.4,
                  ),
                ),
              ),
            ] else if (days > 0 &&
                (streak.freezeUsed || streak.freezesAvailable > 0)) ...[
              const SizedBox(height: 10),
              Text(
                streak.freezeUsed
                    ? '❄️ A freeze saved a missed day'
                    : '❄️ Freeze ready — one missed day is protected',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.muted,
                ),
              ),
            ],
            if (streak.milestones.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: streak.milestones.map((m) {
                  return Semantics(
                    label:
                        '${m.days}-day badge, ${m.earned ? 'earned' : 'locked'}',
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        color: m.earned
                            ? accent.withValues(alpha: 0.12)
                            : AppColors.background,
                        border: Border.all(
                          color: m.earned
                              ? accent.withValues(alpha: 0.25)
                              : AppColors.line,
                        ),
                      ),
                      child: ExcludeSemantics(
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              m.earned
                                  ? Icons.workspace_premium_rounded
                                  : Icons.lock_outline_rounded,
                              size: 14,
                              color: m.earned ? accent : AppColors.muted,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${m.days}d',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppColors.text,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
            if (next != null && next > 0) ...[
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: (days / next).clamp(0, 1),
                  minHeight: 6,
                  backgroundColor: AppColors.line,
                  color: accent,
                  semanticsLabel: 'Progress to $next-day badge',
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${streak.daysToNextMilestone} day${streak.daysToNextMilestone == 1 ? '' : 's'} to your ${streak.nextMilestone}-day badge',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: AppColors.muted,
                ),
              ),
            ],
            if (streak.longest > 0) ...[
              const SizedBox(height: 8),
              Text(
                'Personal best: ${streak.longest} day${streak.longest == 1 ? '' : 's'}',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.muted,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _AcademicItem {
  final String gifAsset;
  final String label;
  final String subtitle;
  final Color accent;
  final WidgetBuilder builder;

  const _AcademicItem({
    required this.gifAsset,
    required this.label,
    required this.subtitle,
    required this.accent,
    required this.builder,
  });
}

class _AcademicsGrid extends StatelessWidget {
  const _AcademicsGrid();

  static final _items = <_AcademicItem>[
    _AcademicItem(
      gifAsset: 'assets/gifs/ai-tutor.gif',
      label: 'AI Tutor',
      subtitle: 'Ask & discover',
      accent: AppColors.brand,
      builder: (_) => const StudentAiTutorScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/homework.gif',
      label: 'Homework',
      subtitle: 'Your daily tasks',
      accent: const Color(0xFFD58A16),
      builder: (_) => const HomeworkScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/my-orchard.gif',
      label: 'My Orchard',
      subtitle: 'Watch it grow',
      accent: const Color(0xFF10B981),
      builder: (_) => const StudentOrchardScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/mock-tests.gif',
      label: 'Report Card',
      subtitle: 'Every milestone',
      accent: const Color(0xFFEC4899),
      builder: (_) => const StudentReportCardScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/progress.gif',
      label: 'Progress',
      subtitle: 'See your growth',
      accent: const Color(0xFF3B82F6),
      builder: (_) => const StudentProgressScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/games.gif',
      label: 'Games',
      subtitle: 'Play & learn',
      accent: const Color(0xFFF97316),
      builder: (_) => const StudentGamesScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/calendar.gif',
      label: 'Calendar',
      subtitle: 'Plan your days',
      accent: const Color(0xFF8B5CF6),
      builder: (_) => const StudentCalendarScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/rewards.gif',
      label: 'Rewards',
      subtitle: 'Celebrate effort',
      accent: const Color(0xFFD58A16),
      builder: (_) => const StudentRewardsScreen(),
    ),
    _AcademicItem(
      gifAsset: 'assets/gifs/library.gif',
      label: 'Library',
      subtitle: 'Explore more',
      accent: const Color(0xFF06B6D4),
      builder: (_) => const StudentLibraryScreen(),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('student-home-academics'),
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: AppColors.line),
        boxShadow: [
          BoxShadow(
            color: AppColors.sidebar.withValues(alpha: 0.04),
            blurRadius: 24,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.brandSoft,
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(
                  Icons.grid_view_rounded,
                  color: AppColors.brand,
                  size: 19,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Academics',
                      style: TextStyle(
                        color: AppColors.text,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      'Your world of learning',
                      style: TextStyle(color: AppColors.muted, fontSize: 11),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, constraints) {
              final scale = MediaQuery.textScalerOf(context).scale(1);
              final columns = constraints.maxWidth < 280 || scale > 1.25
                  ? 2
                  : 3;
              return GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: EdgeInsets.zero,
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  mainAxisExtent: 116 + (scale - 1).clamp(0, 3) * 70,
                ),
                itemCount: _items.length,
                itemBuilder: (context, i) => _AcademicCard(item: _items[i]),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _AcademicCard extends StatelessWidget {
  final _AcademicItem item;

  const _AcademicCard({required this.item});

  @override
  Widget build(BuildContext context) {
    return StudentShortcutTile(
      label: item.label,
      hint: item.subtitle,
      asset: item.gifAsset,
      accent: item.accent,
      onTap: () =>
          Navigator.of(context).push(MaterialPageRoute(builder: item.builder)),
    );
  }
}

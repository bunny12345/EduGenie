import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../screens/teacher/teacher_ai_assistant_tab.dart';
import '../screens/teacher/teacher_home_tab.dart';
import '../screens/teacher/teacher_progress_tab.dart';
import '../screens/teacher/teacher_students_tab.dart';
import '../state/session_provider.dart';
import '../state/teacher_providers.dart';
import '../theme/app_colors.dart';
import '../theme/subject_background.dart';

/// The site-wide "3D button" frame — a light-black ring border + soft drop
/// shadow, ported from `.eg-subject-hw-card button`/the Academics panel.
const Color _frame3dColor = Color(0xFF46464E);

Border _frame3dBorder({double alpha = 0.35, double width = 1.5}) => Border.all(
  color: _frame3dColor.withValues(alpha: alpha),
  width: width,
);

List<BoxShadow> _frame3dShadow({double alpha = 0.18, double blur = 10}) => [
  BoxShadow(
    color: Colors.black.withValues(alpha: alpha),
    blurRadius: blur,
    offset: const Offset(0, 4),
  ),
];

class _TeacherNavItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final IconData comingSoonIcon;
  final String comingSoonSubtitle;

  const _TeacherNavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.comingSoonIcon,
    required this.comingSoonSubtitle,
  });
}

/// Teacher portal shell — bottom navigation mirrors the website teacher
/// sidebar's four sections (Teacher / AI Assistant / Students / Student
/// Progress in `TeacherDashboard.jsx`'s `navItems`), using the same floating
/// pill nav pattern as the student portal (`student_nav_shell.dart`). Full
/// per-tab content lands in later phases — each tab is a placeholder for now.
class TeacherShell extends ConsumerStatefulWidget {
  const TeacherShell({super.key});

  @override
  ConsumerState<TeacherShell> createState() => _TeacherShellState();
}

class _TeacherShellState extends ConsumerState<TeacherShell> {
  int _index = 0;
  bool _compact = false;

  static const _navItems = [
    _TeacherNavItem(
      icon: Icons.assignment_outlined,
      selectedIcon: Icons.assignment_rounded,
      label: 'Teacher',
      comingSoonIcon: Icons.assignment_rounded,
      comingSoonSubtitle: 'Announcements, homework and tests land here next.',
    ),
    _TeacherNavItem(
      icon: Icons.smart_toy_outlined,
      selectedIcon: Icons.smart_toy_rounded,
      label: 'AI Assistant',
      comingSoonIcon: Icons.smart_toy_rounded,
      comingSoonSubtitle: 'A subject-locked AI assistant lands here next.',
    ),
    _TeacherNavItem(
      icon: Icons.people_outline_rounded,
      selectedIcon: Icons.people_rounded,
      label: 'Students',
      comingSoonIcon: Icons.people_rounded,
      comingSoonSubtitle: 'Your class roster and bulk actions land here next.',
    ),
    _TeacherNavItem(
      icon: Icons.show_chart_rounded,
      selectedIcon: Icons.trending_up_rounded,
      label: 'Student Progress',
      comingSoonIcon: Icons.trending_up_rounded,
      comingSoonSubtitle: 'Per-student progress reports land here next.',
    ),
  ];

  bool _onScrollNotification(ScrollNotification notification) {
    if (notification is ScrollUpdateNotification) {
      final delta = notification.scrollDelta ?? 0;
      if (delta > 6 && !_compact) {
        setState(() => _compact = true);
      } else if (delta < -6 && _compact) {
        setState(() => _compact = false);
      }
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final item = _navItems[_index];
    final subject = ref
        .watch(teacherProfileProvider)
        .value?['subject']
        ?.toString();
    final palette = subjectBgPalette(subject);
    return Scaffold(
      backgroundColor: palette.bg,
      appBar: AppBar(
        title: Text(
          _index == 0
              ? 'Hi, ${session?.name.isNotEmpty == true ? session!.name : 'Teacher'}'
              : item.label,
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert_rounded),
            onSelected: (_) => ref.read(sessionProvider.notifier).logout(),
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'logout',
                child: ListTile(
                  leading: Icon(Icons.logout_rounded),
                  title: Text('Logout'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
      body: Stack(
        children: [
          SubjectBackground(subject: subject),
          NotificationListener<ScrollNotification>(
            onNotification: _onScrollNotification,
            child: IndexedStack(
              index: _index,
              children: [
                TeacherHomeTab(
                  activeClassBanner: _ActiveClassBanner(
                    classOptions:
                        ref.watch(teacherClassOptionsProvider).value ??
                        const <String>[],
                    targetClass: ref.watch(teacherTargetClassProvider),
                    onChanged: (value) => ref
                        .read(teacherTargetClassProvider.notifier)
                        .set(value),
                  ),
                ),
                const TeacherAiAssistantTab(),
                const TeacherStudentsTab(),
                const TeacherProgressTab(),
              ],
            ),
          ),
        ],
      ),

      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        child: _FloatingNavBar(
          compact: _compact,
          selectedIndex: _index,
          items: _navItems,
          onSelected: (i) => setState(() => _index = i),
        ),
      ),
    );
  }
}

/// The floating pill frame — curvy borderRadius, light-black 3D ring border
/// (matching the Academics panel), and an `AnimatedContainer` height that
/// shrinks in compact mode. Mirrors `_FloatingNavBar` in `student_nav_shell.dart`.
class _FloatingNavBar extends StatelessWidget {
  final bool compact;
  final int selectedIndex;
  final List<_TeacherNavItem> items;
  final ValueChanged<int> onSelected;

  const _FloatingNavBar({
    required this.compact,
    required this.selectedIndex,
    required this.items,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
      height: compact ? 56 : 76,
      padding: EdgeInsets.symmetric(horizontal: compact ? 10 : 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: _frame3dBorder(),
        boxShadow: _frame3dShadow(),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          for (var i = 0; i < items.length; i++)
            _NavIconButton(
              item: items[i],
              selected: i == selectedIndex,
              compact: compact,
              onTap: () => onSelected(i),
            ),
        ],
      ),
    );
  }
}

/// One nav destination — icon + label, with the site's press-down 3D frame
/// effect (dark ring border + shadow) layered on while the finger is down.
class _NavIconButton extends StatefulWidget {
  final _TeacherNavItem item;
  final bool selected;
  final bool compact;
  final VoidCallback onTap;

  const _NavIconButton({
    required this.item,
    required this.selected,
    required this.compact,
    required this.onTap,
  });

  @override
  State<_NavIconButton> createState() => _NavIconButtonState();
}

class _NavIconButtonState extends State<_NavIconButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final size = widget.compact ? 36.0 : 44.0;
    final iconSize = widget.compact ? 20.0 : 22.0;
    final color = widget.selected ? AppColors.brand : AppColors.muted;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapCancel: () => setState(() => _pressed = false),
      onTapUp: (_) => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? 0.92 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              curve: Curves.easeOut,
              width: size,
              height: size,
              decoration: BoxDecoration(
                color: widget.selected
                    ? AppColors.brandSoft
                    : Colors.transparent,
                shape: BoxShape.circle,
                border: _pressed ? _frame3dBorder(alpha: 0.4) : null,
                boxShadow: _pressed ? _frame3dShadow(blur: 6) : null,
              ),
              alignment: Alignment.center,
              child: Icon(
                widget.selected ? widget.item.selectedIcon : widget.item.icon,
                size: iconSize,
                color: color,
              ),
            ),
            if (!widget.compact) ...[
              const SizedBox(height: 2),
              Text(
                widget.item.label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Mirrors the website's "Active Class" banner exactly (`.td-class-banner`
/// in `App.css` / the `<div className="td-class-banner td-framed">` block
/// in `TeacherDashboard.jsx`) — same dark gradient, uppercase label, class
/// dropdown, selected-class badge, and scoping hint text.
class _ActiveClassBanner extends StatelessWidget {
  final List<String> classOptions;
  final String targetClass;
  final ValueChanged<String> onChanged;

  const _ActiveClassBanner({
    required this.classOptions,
    required this.targetClass,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final hasClass = targetClass != 'all';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        // web: .td-class-banner { background: linear-gradient(120deg, #1b1e3c 0%, #2f3478 100%); }
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1B1E3C), Color(0xFF2F3478)],
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Wrap(
        spacing: 12,
        runSpacing: 10,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          const Text(
            '📚 ACTIVE CLASS',
            style: TextStyle(
              color: Colors.white70,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.0,
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(9),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.25),
                width: 1.5,
              ),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: targetClass,
                dropdownColor: const Color(0xFF1B1E3C),
                iconEnabledColor: Colors.white,
                isDense: true,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
                items: [
                  const DropdownMenuItem(
                    value: 'all',
                    child: Text('— Select a class —'),
                  ),
                  for (final className in classOptions)
                    DropdownMenuItem(value: className, child: Text(className)),
                ],
                onChanged: (value) {
                  if (value != null) onChanged(value);
                },
              ),
            ),
          ),
          if (hasClass)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                // web: .td-class-banner-badge { background: linear-gradient(120deg, #5764c9, #7c5be6); }
                gradient: const LinearGradient(
                  colors: [Color(0xFF5764C9), Color(0xFF7C5BE6)],
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                targetClass,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          Text(
            hasClass
                ? 'All announcements, homework and tests below go to $targetClass.'
                : 'Select a class — all actions below will apply to it.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.5),
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

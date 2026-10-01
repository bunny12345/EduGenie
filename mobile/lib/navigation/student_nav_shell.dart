import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../screens/student/student_ai_tutor_screen.dart';
import '../screens/student/student_home_screen.dart';
import '../screens/student/student_more_screen.dart';
import '../screens/student/student_services_screen.dart';
import '../state/focus_lock_provider.dart';
import '../theme/app_colors.dart';

/// The site-wide "3D button" frame — a light-black ring border + soft drop
/// shadow, ported from `.eg-subject-hw-card button`/the Academics panel.
const Color _frame3dColor = Color(0xFF46464E);

Border _frame3dBorder({double alpha = 0.35, double width = 1.5}) => Border.all(color: _frame3dColor.withValues(alpha: alpha), width: width);

List<BoxShadow> _frame3dShadow({double alpha = 0.18, double blur = 10}) =>
    [BoxShadow(color: Colors.black.withValues(alpha: alpha), blurRadius: blur, offset: const Offset(0, 4))];

/// Student portal shell — native bottom navigation (NOT the desktop sidebar).
/// 4 primary destinations per the agreed IA: Home / Services / AI Tutor / More.
/// The nav bar is a floating rounded "pill" with the site's light-black 3D
/// frame, which shrinks (compacts) while the active tab's content is
/// scrolled down and expands back to full size once you scroll back up.
class StudentShell extends StatefulWidget {
  const StudentShell({super.key});

  @override
  State<StudentShell> createState() => _StudentShellState();
}

class _NavItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;

  const _NavItem({required this.icon, required this.selectedIcon, required this.label});
}

class _StudentShellState extends State<StudentShell> {
  int _index = 0;
  bool _compact = false;

  static const _screens = [
    StudentHomeScreen(),
    StudentServicesScreen(),
    StudentAiTutorScreen(),
    StudentMoreScreen(),
  ];

  static const _navItems = [
    _NavItem(icon: Icons.home_outlined, selectedIcon: Icons.home_rounded, label: 'Home'),
    _NavItem(icon: Icons.miscellaneous_services_outlined, selectedIcon: Icons.miscellaneous_services_rounded, label: 'Services'),
    _NavItem(icon: Icons.smart_toy_outlined, selectedIcon: Icons.smart_toy_rounded, label: 'AI Tutor'),
    _NavItem(icon: Icons.more_horiz_rounded, selectedIcon: Icons.more_horiz_rounded, label: 'More'),
  ];

  // Any meaningful scroll-down compacts the pill; scrolling back up expands it —
  // mirrors the "shrink on scroll" pill nav pattern from the reference design.
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
    return Consumer(
      builder: (context, ref, _) {
        final focusLock = ref.watch(focusLockProvider);
        return PopScope(
          canPop: !focusLock.enabled,
          onPopInvokedWithResult: (didPop, result) async {
            if (didPop) return;
            final unlocked = await _requestFocusModePinToExit(context, ref);
            if (unlocked && context.mounted) SystemNavigator.pop();
          },
          child: Scaffold(
            body: NotificationListener<ScrollNotification>(
              onNotification: _onScrollNotification,
              child: IndexedStack(index: _index, children: _screens),
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
          ),
        );
      },
    );
  }
}

/// While Focus Mode is on, the system/app back button is intercepted here —
/// entering the correct parent PIN both unlocks AND exits in one step.
Future<bool> _requestFocusModePinToExit(BuildContext context, WidgetRef ref) async {
  final controller = TextEditingController();
  final pin = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Enter parent PIN to exit Focus Mode'),
      content: TextField(
        controller: controller,
        autofocus: true,
        obscureText: true,
        keyboardType: TextInputType.number,
        maxLength: 6,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        decoration: const InputDecoration(labelText: '6-digit PIN', border: OutlineInputBorder(), counterText: ''),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
        ElevatedButton(onPressed: () => Navigator.of(ctx).pop(controller.text.trim()), child: const Text('Confirm')),
      ],
    ),
  );
  if (pin == null) return false;
  final correct = await ref.read(focusLockProvider.notifier).verifyPin(pin);
  if (!correct) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Incorrect PIN.')));
    return false;
  }
  await ref.read(focusLockProvider.notifier).disable();
  return true;
}

/// The floating pill frame — curvy borderRadius, light-black 3D ring border
/// (matching the Academics panel), and an `AnimatedContainer` height that
/// shrinks in compact mode.
class _FloatingNavBar extends StatelessWidget {
  final bool compact;
  final int selectedIndex;
  final List<_NavItem> items;
  final ValueChanged<int> onSelected;

  const _FloatingNavBar({required this.compact, required this.selectedIndex, required this.items, required this.onSelected});

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
            _NavIconButton(item: items[i], selected: i == selectedIndex, compact: compact, onTap: () => onSelected(i)),
        ],
      ),
    );
  }
}

/// One nav destination — icon + label, with the site's press-down 3D frame
/// effect (dark ring border + shadow) layered on while the finger is down.
class _NavIconButton extends StatefulWidget {
  final _NavItem item;
  final bool selected;
  final bool compact;
  final VoidCallback onTap;

  const _NavIconButton({required this.item, required this.selected, required this.compact, required this.onTap});

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
                color: widget.selected ? AppColors.brandSoft : Colors.transparent,
                shape: BoxShape.circle,
                border: _pressed ? _frame3dBorder(alpha: 0.4) : null,
                boxShadow: _pressed ? _frame3dShadow(blur: 6) : null,
              ),
              alignment: Alignment.center,
              child: Icon(widget.selected ? widget.item.selectedIcon : widget.item.icon, size: iconSize, color: color),
            ),
            if (!widget.compact) ...[
              const SizedBox(height: 2),
              Text(widget.item.label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color)),
            ],
          ],
        ),
      ),
    );
  }
}

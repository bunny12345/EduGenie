import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// A brief visual cue that remains visible without motion after pulsing.
class GuidedHighlight extends StatefulWidget {
  final bool active;
  final int pulseVersion;
  final Widget child;

  const GuidedHighlight({super.key, required this.active, this.pulseVersion = 0, required this.child});

  @override
  State<GuidedHighlight> createState() => _GuidedHighlightState();
}

class _GuidedHighlightState extends State<GuidedHighlight> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
  bool? _animating;

  void _syncAnimation({bool restart = false}) {
    final media = MediaQuery.of(context);
    final animate = widget.active && !media.disableAnimations && !media.accessibleNavigation;
    if (!restart && animate == _animating) return;
    _animating = animate;
    _pulse.stop();
    if (animate) {
      _pulse.value = 0;
      _pulse.repeat(reverse: true, count: 4);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncAnimation();
  }

  @override
  void didUpdateWidget(covariant GuidedHighlight oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncAnimation(restart: widget.active && oldWidget.pulseVersion != widget.pulseVersion);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = AppColors.of(context).isDark ? const Color(0xFF82D8FF) : const Color(0xFF147BB6);
    return AnimatedBuilder(
      animation: _pulse,
      child: widget.child,
      builder: (context, child) {
        final glow = _animating == true ? _pulse.value : 0.5;
        return Container(
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(13),
            border: Border.all(color: widget.active ? color.withValues(alpha: 0.65 + 0.35 * glow) : Colors.transparent, width: 1.5),
            boxShadow: widget.active
                ? [BoxShadow(color: color.withValues(alpha: 0.12 + 0.2 * glow), blurRadius: 5 + 7 * glow)]
                : null,
          ),
          child: child,
        );
      },
    );
  }
}

void showGuidedTarget(GlobalKey key, {bool Function()? canShow}) {
  WidgetsBinding.instance.addPostFrameCallback((_) {
    if (canShow != null && !canShow()) return;
    final target = key.currentContext;
    if (target == null || !target.mounted) return;
    Scrollable.ensureVisible(target, alignment: 0.2, duration: guidedScrollDuration(target), curve: Curves.easeInOut);
  });
}

Duration guidedScrollDuration(BuildContext context, {Duration duration = const Duration(milliseconds: 350)}) {
  final media = MediaQuery.maybeOf(context);
  return media?.disableAnimations == true || media?.accessibleNavigation == true ? Duration.zero : duration;
}

import 'package:flutter/material.dart';

/// Generic tactile "press down" wrapper — the site-wide "3D button" effect
/// (mirrors `_AcademicCard`'s press animation): scales down slightly on
/// press and springs back on release, standing in for web's hover-lift
/// since touch has no hover state.
class PressableScale extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final double pressedScale;

  const PressableScale({super.key, required this.child, this.onTap, this.pressedScale = 0.94});

  @override
  State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: widget.onTap == null ? null : (_) => setState(() => _pressed = true),
      onTapCancel: widget.onTap == null ? null : () => setState(() => _pressed = false),
      onTapUp: widget.onTap == null ? null : (_) => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? widget.pressedScale : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}

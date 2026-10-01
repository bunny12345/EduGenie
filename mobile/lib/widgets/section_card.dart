import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Shared card wrapper for Home-screen sections — mirrors the web app's
/// "cardish" card style (white, subtle border, soft shadow).
class SectionCard extends StatelessWidget {
  final String? title;
  final Widget child;
  final EdgeInsets padding;

  const SectionCard({super.key, this.title, required this.child, this.padding = const EdgeInsets.all(16)});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
        boxShadow: const [BoxShadow(color: Color(0x12272D64), blurRadius: 16, offset: Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(title!, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
          ],
          child,
        ],
      ),
    );
  }
}

/// Skeleton placeholder — never a bare "Loading..." string, per AcademiX's
/// silent-loading convention. Self-animates a light "wave" sweep across
/// itself (Teams/YouTube-style skeleton), so every existing call site gets
/// the shimmer effect for free.
class SkeletonBox extends StatefulWidget {
  final double height;

  const SkeletonBox({super.key, this.height = 16});

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1300))..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: widget.height,
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) {
          return ShaderMask(
            blendMode: BlendMode.srcATop,
            shaderCallback: (bounds) {
              final sweep = -0.6 + _c.value * 2.2;
              return LinearGradient(
                begin: Alignment(-1, sweep - 0.5),
                end: Alignment(1, sweep + 0.5),
                colors: const [Color(0xFFE2E2EE), Color(0xFFF8F8FC), Color(0xFFE2E2EE)],
                stops: const [0.35, 0.5, 0.65],
              ).createShader(bounds);
            },
            child: child,
          );
        },
        child: DecoratedBox(decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(6))),
      ),
    );
  }
}

/// Inline error line — mirrors the web app's `panelError.*` treatment.
class ErrorInline extends StatelessWidget {
  final String message;

  const ErrorInline({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return Text(message, style: const TextStyle(color: AppColors.danger, fontSize: 12));
  }
}

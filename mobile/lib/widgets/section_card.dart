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
/// silent-loading convention.
class SkeletonBox extends StatelessWidget {
  final double height;

  const SkeletonBox({super.key, this.height = 16});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(6)),
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

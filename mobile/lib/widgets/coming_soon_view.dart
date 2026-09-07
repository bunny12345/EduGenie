import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Friendly placeholder for screens not yet built out (Phase 3+). Never shows
/// a bare "Loading..." — matches the AcademiX silent-loading / no-ugly-state
/// principle even for scaffolding.
class ComingSoonView extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const ComingSoonView({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle = 'This section is being built next.',
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(18)),
              child: Icon(icon, color: AppColors.brand, size: 30),
            ),
            const SizedBox(height: 16),
            Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(subtitle, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

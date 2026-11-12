import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'pressable_scale.dart';

class StudentShortcutTile extends StatelessWidget {
  final String label;
  final String asset;
  final Color accent;
  final String? hint;
  final bool? selected;
  final VoidCallback onTap;

  const StudentShortcutTile({
    super.key,
    required this.label,
    required this.asset,
    required this.accent,
    required this.onTap,
    this.hint,
    this.selected,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      hint: hint,
      selected: selected,
      onTap: onTap,
      child: ExcludeSemantics(
        child: PressableScale(
          onTap: onTap,
          pressedScale: 0.96,
          child: Container(
            padding: const EdgeInsets.fromLTRB(5, 8, 5, 6),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  accent.withValues(alpha: AppColors.isDark ? 0.14 : 0.055),
                  AppColors.card,
                ],
              ),
              borderRadius: BorderRadius.circular(19),
              border: Border.all(
                color: accent.withValues(alpha: selected == true ? 0.65 : 0.15),
                width: selected == true ? 1.5 : 1,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color.alphaBlend(
                          accent.withValues(alpha: 0.08),
                          AppColors.card,
                        ),
                        Color.alphaBlend(
                          accent.withValues(alpha: 0.24),
                          AppColors.card,
                        ),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: Colors.white.withValues(
                        alpha: AppColors.isDark ? 0.15 : 0.9,
                      ),
                      width: 1.5,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: accent.withValues(alpha: 0.25),
                        blurRadius: 10,
                        offset: const Offset(0, 5),
                      ),
                      BoxShadow(
                        color: accent.withValues(alpha: 0.18),
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                  child: Image.asset(
                    asset,
                    width: 40,
                    height: 40,
                    fit: BoxFit.contain,
                    excludeFromSemantics: true,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.text,
                    height: 1.2,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

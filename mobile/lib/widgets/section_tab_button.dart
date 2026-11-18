import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class SectionTabButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onPressed;
  final bool compact;

  const SectionTabButton({
    super.key,
    required this.label,
    required this.icon,
    required this.selected,
    required this.onPressed,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final palette = AppColors.of(context);
    final text = Text(
      label,
      textAlign: TextAlign.center,
      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
    );
    return Semantics(
      selected: selected,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          elevation: selected ? 5 : 1,
          backgroundColor: selected ? AppColors.brand : palette.card,
          foregroundColor: selected ? Colors.white : palette.muted,
          minimumSize: const Size.fromHeight(48),
          padding: EdgeInsets.symmetric(
            horizontal: 8,
            vertical: compact ? 7 : 12,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          side: BorderSide(color: selected ? AppColors.brand : palette.line),
        ),
        child: compact
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 18),
                  const SizedBox(height: 3),
                  text,
                ],
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 20),
                  const SizedBox(width: 8),
                  Flexible(child: text),
                ],
              ),
      ),
    );
  }
}

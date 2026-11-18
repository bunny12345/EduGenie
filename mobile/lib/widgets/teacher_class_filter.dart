import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class TeacherClassFilter extends StatelessWidget {
  const TeacherClassFilter({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final List<String> options;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final selected = options.contains(value) ? value : 'all';
    const label = 'Filter by class';
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 2),
      decoration: BoxDecoration(
        color: colors.brandSoft,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.accent.withValues(alpha: 0.55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(color: colors.accent, fontWeight: FontWeight.w800),
          ),
          Semantics(
            label: label,
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: selected,
                isExpanded: true,
                icon: const Icon(Icons.expand_more_rounded),
                iconEnabledColor: colors.accent,
                dropdownColor: colors.card,
                style: TextStyle(
                  color: colors.text,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
                items: [
                  const DropdownMenuItem(
                    value: 'all',
                    child: Text('All classes'),
                  ),
                  for (final option in options)
                    DropdownMenuItem(
                      value: option,
                      child: Text(option, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (next) {
                  if (next != null && next != selected) onChanged(next);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

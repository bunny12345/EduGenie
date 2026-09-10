import 'package:flutter/material.dart';

import '../../../models/homework_item.dart';
import 'homework_state.dart';

class DayStatus {
  int all = 0;
  int submitted = 0;
}

/// Mini color-coded month calendar for "View history by date" — mirrors the
/// custom calendar in `StudentDashboard.jsx`'s homework history panel exactly
/// (green = all submitted, red = some not submitted, grey = no homework).
class HomeworkHistoryCalendar extends StatelessWidget {
  final List<HomeworkItem> allHomework;
  final int year;
  final int month; // 0-based
  final String? selectedDate; // yyyy-MM-dd
  final VoidCallback onPrevMonth;
  final VoidCallback onNextMonth;
  final void Function(String iso) onSelectDate;

  const HomeworkHistoryCalendar({
    super.key,
    required this.allHomework,
    required this.year,
    required this.month,
    required this.selectedDate,
    required this.onPrevMonth,
    required this.onNextMonth,
    required this.onSelectDate,
  });

  Map<String, DayStatus> _buildDateStatusMap() {
    final map = <String, DayStatus>{};
    for (final h in allHomework) {
      final raw = h.startAt ?? h.dueAt;
      final d = raw == null ? null : DateTime.tryParse(raw);
      if (d == null) continue;
      final iso = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      final status = map.putIfAbsent(iso, DayStatus.new);
      status.all += 1;
      if (homeworkState(h).submitted) status.submitted += 1;
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
    final dateStatusMap = _buildDateStatusMap();
    final firstDay = DateTime(year, month + 1, 1);
    final startOffset = (firstDay.weekday - 1) % 7; // Mon=0..Sun=6
    final daysInMonth = DateTime(year, month + 2, 0).day;
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    final monthLabel = '${monthNames[month]} $year';
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    final cells = <int?>[
      for (var i = 0; i < startOffset; i++) null,
      for (var d = 1; d <= daysInMonth; d++) d,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(onPressed: onPrevMonth, icon: const Icon(Icons.chevron_left_rounded), color: const Color(0xFF475569), visualDensity: VisualDensity.compact),
            Text(monthLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF334155))),
            IconButton(onPressed: onNextMonth, icon: const Icon(Icons.chevron_right_rounded), color: const Color(0xFF475569), visualDensity: VisualDensity.compact),
          ],
        ),
        Row(
          children: [
            for (final l in dayLabels)
              Expanded(child: Center(child: Text(l, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF94A3B8))))),
          ],
        ),
        const SizedBox(height: 2),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: cells.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, mainAxisSpacing: 2, crossAxisSpacing: 2, childAspectRatio: 1.3),
          itemBuilder: (context, i) {
            final day = cells[i];
            if (day == null) return const SizedBox.shrink();
            final iso = '$year-${(month + 1).toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
            final info = dateStatusMap[iso];
            final isSelected = selectedDate == iso;
            Color bg = Colors.transparent;
            Color color = const Color(0xFF374151);
            FontWeight weight = FontWeight.normal;
            if (info != null) {
              if (info.submitted == info.all) {
                bg = isSelected ? const Color(0xFF15803D) : const Color(0xFFDCFCE7);
                color = isSelected ? Colors.white : const Color(0xFF15803D);
              } else {
                bg = isSelected ? const Color(0xFFB91C1C) : const Color(0xFFFEE2E2);
                color = isSelected ? Colors.white : const Color(0xFFB91C1C);
              }
              weight = FontWeight.w700;
            } else if (isSelected) {
              bg = const Color(0xFF3B82F6);
              color = Colors.white;
              weight = FontWeight.w700;
            }
            return InkWell(
              borderRadius: BorderRadius.circular(6),
              onTap: () => onSelectDate(iso),
              child: Container(
                decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
                alignment: Alignment.center,
                child: Text('$day', style: TextStyle(fontSize: 12, color: color, fontWeight: weight)),
              ),
            );
          },
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 4,
          children: [
            _legendDot(const Color(0xFFDCFCE7), const Color(0xFF15803D), 'All submitted'),
            _legendDot(const Color(0xFFFEE2E2), const Color(0xFFB91C1C), 'Not submitted'),
            _legendDot(const Color(0xFFF3F4F6), const Color(0xFF374151), 'No homework'),
          ],
        ),
      ],
    );
  }

  Widget _legendDot(Color bg, Color border, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: bg, border: Border.all(color: border), borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 11, color: border)),
      ],
    );
  }
}

import 'package:flutter/material.dart';

/// Per-subject colour theme for report cards — a 1:1 port of
/// `web/src/components/reportCardTheme.js`, so a subject looks the same on web
/// and mobile, and in the teacher's marks entry and the student's report card.
class ReportSubjectTheme {
  final Color color;
  final Color dark;
  final Color soft;
  final String emoji;

  const ReportSubjectTheme(this.color, this.dark, this.soft, this.emoji);

  LinearGradient get gradient => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [color, dark],
  );
}

const _themes = <(List<String>, ReportSubjectTheme)>[
  (['math'], ReportSubjectTheme(Color(0xFFF59E0B), Color(0xFFB45309), Color(0xFFFFF6DC), '📐')),
  (['physics'], ReportSubjectTheme(Color(0xFF6366F1), Color(0xFF4338CA), Color(0xFFECECFF), '⚛️')),
  (['chemistry'], ReportSubjectTheme(Color(0xFF0EA5E9), Color(0xFF0369A1), Color(0xFFE1F4FD), '🧪')),
  (['bio'], ReportSubjectTheme(Color(0xFF22C55E), Color(0xFF15803D), Color(0xFFE6FAE9), '🌿')),
  (['english', 'literature'], ReportSubjectTheme(Color(0xFFEC4899), Color(0xFFBE185D), Color(0xFFFDE8F3), '📖')),
  (['hindi', 'sanskrit', 'urdu'], ReportSubjectTheme(Color(0xFFF97316), Color(0xFFC2410C), Color(0xFFFFEEE0), '🪔')),
  (['telugu', 'tamil', 'malayalam'], ReportSubjectTheme(Color(0xFF14B8A6), Color(0xFF0F766E), Color(0xFFDCF8F4), '🌺')),
  (['kannada'], ReportSubjectTheme(Color(0xFFEF4444), Color(0xFFB91C1C), Color(0xFFFFE8E8), '🏵️')),
  (['history'], ReportSubjectTheme(Color(0xFFA855F7), Color(0xFF7E22CE), Color(0xFFF3E8FF), '🏛️')),
  (['geo'], ReportSubjectTheme(Color(0xFF06B6D4), Color(0xFF0E7490), Color(0xFFDCF7FC), '🗺️')),
  (['social'], ReportSubjectTheme(Color(0xFF8B5CF6), Color(0xFF6D28D9), Color(0xFFEFE9FF), '🌍')),
  (['computer', 'coding'], ReportSubjectTheme(Color(0xFF3B82F6), Color(0xFF1D4ED8), Color(0xFFE3EEFF), '💻')),
  (['science', 'evs', 'environment'], ReportSubjectTheme(Color(0xFF10B981), Color(0xFF047857), Color(0xFFE0FAF0), '🔬')),
  (['draw', 'art'], ReportSubjectTheme(Color(0xFFF43F5E), Color(0xFFBE123C), Color(0xFFFFE6EB), '🎨')),
  (['music', 'rhyme'], ReportSubjectTheme(Color(0xFFD946EF), Color(0xFFA21CAF), Color(0xFFFBE7FF), '🎵')),
  (['story'], ReportSubjectTheme(Color(0xFFEAB308), Color(0xFFA16207), Color(0xFFFDF6D0), '📚')),
];

const _fallbacks = <ReportSubjectTheme>[
  ReportSubjectTheme(Color(0xFF5B47FF), Color(0xFF3B2FC9), Color(0xFFEEEAFF), '⭐'),
  ReportSubjectTheme(Color(0xFF0891B2), Color(0xFF155E75), Color(0xFFDFF6FB), '⭐'),
  ReportSubjectTheme(Color(0xFFE11D48), Color(0xFF9F1239), Color(0xFFFFE4EA), '⭐'),
  ReportSubjectTheme(Color(0xFF65A30D), Color(0xFF3F6212), Color(0xFFECFAD1), '⭐'),
];

ReportSubjectTheme reportSubjectTheme(String subject) {
  final s = subject.toLowerCase();
  for (final (keys, theme) in _themes) {
    if (keys.any(s.contains)) return theme;
  }
  final sum = s.codeUnits.fold<int>(0, (a, b) => a + b);
  return _fallbacks[sum % _fallbacks.length];
}

Color reportGradeColor(String grade) {
  switch (grade) {
    case 'A+':
      return const Color(0xFF16A34A);
    case 'A':
      return const Color(0xFF22C55E);
    case 'B+':
      return const Color(0xFF0EA5E9);
    case 'B':
      return const Color(0xFF3B82F6);
    case 'C':
      return const Color(0xFFF59E0B);
    case 'D':
      return const Color(0xFFF97316);
    default:
      return const Color(0xFFEF4444);
  }
}

/// `78`, `78.5` — never `78.0`.
String formatMarks(num? n) {
  if (n == null) return '';
  if (n == n.roundToDouble()) return n.toInt().toString();
  return n.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

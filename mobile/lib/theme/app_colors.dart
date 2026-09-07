import 'package:flutter/material.dart';

/// Design tokens ported from `web/src/App.css` (`:root` custom properties).
/// Keep these in sync with the web palette — do not invent new brand colors.
class AppColors {
  AppColors._();

  static const Color background = Color(0xFFEEF1FF);
  static const Color text = Color(0xFF10153A);
  static const Color muted = Color(0xFF68709A);
  static const Color brand = Color(0xFF5B47FF);
  static const Color brand2 = Color(0xFF2B3BE0);
  static const Color brandSoft = Color(0xFFECE9FF);
  static const Color card = Color(0xFFFFFFFF);
  static const Color line = Color(0xFFE8E9F5);

  // Web sidebar gradient — kept only for reference/brand recognition (e.g. the
  // AI Tutor header); mobile uses native nav, not a reproduced sidebar.
  static const Color sidebar = Color(0xFF0A0F3A);
  static const Color sidebar2 = Color(0xFF121856);

  static const Color ok = Color(0xFF2FBF71);
  static const Color warn = Color(0xFFFFB020);
  static const Color danger = Color(0xFFFF5D6C);
}

/// Per-subject accent colors — mirrors the `SubjectIcon` stroke colors in
/// `web/src/components/StudentDashboard.jsx`. Keep subject → color mapping
/// identical to web so a subject looks the same on both platforms.
class SubjectPalette {
  SubjectPalette._();

  static const Color _fallback = Color(0xFF5B47FF);

  static Color colorFor(String subject) {
    final s = subject.trim().toLowerCase();
    if (s.contains('math')) return const Color(0xFF5B47FF);
    if (s.contains('science') || s.contains('physics') || s.contains('chemistry')) {
      return const Color(0xFF10B981);
    }
    if (s.contains('bio')) return const Color(0xFF22C55E);
    if (s.contains('english') || s.contains('language') || s.contains('literature')) {
      return const Color(0xFFF59E0B);
    }
    if (s.contains('history') || s.contains('social')) return const Color(0xFF8B5CF6);
    if (s.contains('hindi') ||
        s.contains('telugu') ||
        s.contains('sanskrit') ||
        s.contains('urdu') ||
        s.contains('tamil') ||
        s.contains('kannada')) {
      return const Color(0xFFEC4899);
    }
    if (s.contains('geo')) return const Color(0xFF06B6D4);
    if (s.contains('computer') || s.contains('coding') || s.contains('programming')) {
      return const Color(0xFF3B82F6);
    }
    if (s.contains('art') || s.contains('draw')) return const Color(0xFFF97316);
    if (s.contains('music')) return const Color(0xFFA855F7);
    return _fallback;
  }
}

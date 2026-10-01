import 'package:flutter/material.dart';

/// Design tokens ported from `web/src/App.css` (`:root` custom properties).
/// Keep these in sync with the web palette — do not invent new brand colors.
///
/// Surface/text tokens (`background`/`text`/`muted`/`card`/`line`/`brandSoft`)
/// are dynamic — they flip when [AppColors.isDark] changes (set by
/// `themeModeProvider`, driven by the student app's Settings > Toggle Theme).
/// Brand/status accent colors stay the same in both modes, same as web.
class AppColors {
  AppColors._();

  /// Kept in sync with `themeModeProvider` — do not set directly, use
  /// `ref.read(themeModeProvider.notifier).set(...)` instead so the rest of
  /// the app (MaterialApp's ThemeData) stays consistent with this flag.
  static bool isDark = false;

  static Color get background => isDark ? backgroundDark : backgroundLight;
  static Color get text => isDark ? textDark : textLight;
  static Color get muted => isDark ? mutedDark : mutedLight;
  static Color get brandSoft => isDark ? brandSoftDark : brandSoftLight;
  static Color get card => isDark ? cardDark : cardLight;
  static Color get line => isDark ? lineDark : lineLight;

  // Exposed individually (not just via the dynamic getters above) so
  // AppTheme.light()/dark() can build two fixed ThemeData objects regardless
  // of the current value of `isDark`.
  static const Color backgroundLight = Color(0xFFEEF1FF);
  static const Color backgroundDark = Color(0xFF12131F);

  static const Color textLight = Color(0xFF10153A);
  static const Color textDark = Color(0xFFF1F2FA);

  static const Color mutedLight = Color(0xFF68709A);
  static const Color mutedDark = Color(0xFFA6ACCB);

  static const Color brandSoftLight = Color(0xFFECE9FF);
  static const Color brandSoftDark = Color(0xFF2A2554);

  static const Color cardLight = Color(0xFFFFFFFF);
  static const Color cardDark = Color(0xFF1C1E30);

  static const Color lineLight = Color(0xFFE8E9F5);
  static const Color lineDark = Color(0xFF2B2E45);

  static const Color brand = Color(0xFF5B47FF);
  static const Color brand2 = Color(0xFF2B3BE0);

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

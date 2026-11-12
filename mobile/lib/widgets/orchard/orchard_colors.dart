import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';

/// Orchard panels follow the app theme; the decorative sky keeps its own
/// day/night palette and must not inherit the app's foreground colors.
class OrchardColors {
  OrchardColors(this.context);

  final BuildContext context;
  AppPalette get _palette => AppColors.of(context);

  List<Color> get hero => _palette.isDark
      ? [_palette.brandSoft, _palette.card]
      : const [Color(0xFFF4F0FF), Color(0xFFEEFAF1)];

  Color get inset =>
      _palette.isDark ? _palette.background : const Color(0xFFF7F7FB);
  Color get golden =>
      _palette.isDark ? const Color(0xFF42351C) : const Color(0xFFFEF3C7);
  Color get positive =>
      _palette.isDark ? const Color(0xFF173B2C) : const Color(0xFFECFDF3);
  Color get caution =>
      _palette.isDark ? const Color(0xFF44301D) : const Color(0xFFFFF7ED);

  Color accentText(Color accent, {Color? surface}) {
    final background = surface ?? _palette.card;
    var foreground = accent;
    // Subject colors also decorate artwork, but their text needs 4.5:1.
    for (var i = 0; i < 20; i++) {
      final a = foreground.computeLuminance();
      final b = background.computeLuminance();
      final ratio = a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05);
      if (ratio >= 4.5) return foreground;
      foreground = Color.lerp(foreground, _palette.text, 0.2)!;
    }
    return _palette.text;
  }
}

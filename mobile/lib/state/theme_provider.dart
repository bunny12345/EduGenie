import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/app_colors.dart';

/// Drives the student app's light/dark theme — Settings > Toggle Theme.
/// Keeps `AppColors.isDark` in sync so the many plain `AppColors.x`
/// references throughout the app (not just Theme-aware widgets) pick up the
/// right colors too.
class ThemeModeNotifier extends Notifier<ThemeMode> {
  bool _hydratedFromPrefs = false;

  @override
  ThemeMode build() => ThemeMode.light;

  void setDark(bool dark) {
    AppColors.isDark = dark;
    state = dark ? ThemeMode.dark : ThemeMode.light;
  }

  void toggle() => setDark(state != ThemeMode.dark);

  /// One-time sync from the backend `settings.prefs.theme` value once it
  /// loads, so a returning user's saved preference is actually applied (not
  /// just displayed as text). A manual toggle afterwards always takes
  /// precedence over this for the rest of the session.
  void hydrateFromPrefs(String? theme) {
    if (_hydratedFromPrefs) return;
    _hydratedFromPrefs = true;
    if (theme == 'Dark') setDark(true);
  }
}

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

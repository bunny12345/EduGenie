import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'session_provider.dart';

/// Independent student and teacher preferences, retained for this app session.
class ThemeModeNotifier extends Notifier<ThemeMode> {
  bool _hydratedFromPrefs = false;

  @override
  ThemeMode build() => ThemeMode.light;

  void setDark(bool dark) {
    _hydratedFromPrefs = true;
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

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(
  ThemeModeNotifier.new,
);

final teacherThemeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(
  ThemeModeNotifier.new,
);

/// Signed-out and unsupported-role screens never inherit a portal's theme.
final activeThemeModeProvider = Provider<ThemeMode>((ref) {
  final session = ref.watch(sessionProvider).value;
  if (session?.isTeacher == true) return ref.watch(teacherThemeModeProvider);
  if (session?.isStudent == true) return ref.watch(themeModeProvider);
  return ThemeMode.light;
});

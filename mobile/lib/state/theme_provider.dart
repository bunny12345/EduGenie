import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/secure_storage_service.dart';
import 'session_provider.dart';

final storedThemePreferencesProvider = FutureProvider<StoredThemePreferences>(
  (ref) => ref.read(secureStorageServiceProvider).readThemePreferences(),
);

/// Independent student and teacher preferences, persisted across app restarts.
class ThemeModeNotifier extends Notifier<ThemeMode> {
  ThemeModeNotifier({this.teacher = false});

  final bool teacher;
  bool _hydratedFromPrefs = false;
  Future<void> _pendingWrite = Future<void>.value();

  @override
  ThemeMode build() {
    final saved = ref.watch(storedThemePreferencesProvider).value;
    if (_hydratedFromPrefs) return state;
    final dark = teacher ? saved?.teacherDark : saved?.studentDark;
    _hydratedFromPrefs = dark != null;
    return dark == false ? ThemeMode.light : ThemeMode.dark;
  }

  Future<void> setDark(bool dark) {
    _hydratedFromPrefs = true;
    state = dark ? ThemeMode.dark : ThemeMode.light;
    final storage = ref.read(secureStorageServiceProvider);
    final write = _pendingWrite.then((_) => storage.writeThemePreference(dark, teacher: teacher));
    // Preserve the order of rapid toggles, even if an earlier save fails.
    // The returned future still reports that failure to the settings UI.
    _pendingWrite = write.then<void>((_) {}, onError: (Object error, StackTrace stack) {
      debugPrint('Theme preference save failed: $error\n$stack');
    });
    return write;
  }

  Future<void> toggle() => setDark(state != ThemeMode.dark);

  /// One-time sync from the backend `settings.prefs.theme` value once it
  /// loads, only if this device has no saved/manual choice. Local choices
  /// take precedence over older backend preferences.
  Future<void> hydrateFromPrefs(String? theme) async {
    if (_hydratedFromPrefs || (theme != 'Dark' && theme != 'Light')) return;
    await setDark(theme == 'Dark');
  }
}

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(
  ThemeModeNotifier.new,
);

final teacherThemeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(
  () => ThemeModeNotifier(teacher: true),
);

/// Signed-out and unsupported-role screens never inherit a portal's theme.
final activeThemeModeProvider = Provider<ThemeMode>((ref) {
  final role = ref.watch(sessionProvider.select((session) => session.value?.role));
  if (role == 'teacher') return ref.watch(teacherThemeModeProvider);
  if (role == 'student') return ref.watch(themeModeProvider);
  return ThemeMode.light;
});

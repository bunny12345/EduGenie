import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/main.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/screens/student/student_more_screen.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/secure_storage_service.dart';
import 'package:mobile/services/student_api_service.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/state/theme_provider.dart';
import 'package:mobile/theme/app_theme.dart';

class _SignedOut extends SessionNotifier {
  @override
  Future<Session?> build() async => null;
}

class _Student extends SessionNotifier {
  @override
  Future<Session?> build() async => const Session(role: 'student', userId: 'student', token: 'fixture');
}

class _OfflineApi extends StudentApiService {
  _OfflineApi() : super(ApiClient());
  @override
  Future<Map<String, dynamic>> saveSettings(String studentId, Map<String, dynamic> prefs) async {
    throw StateError('Offline');
  }
}

class _SettingsApi extends StudentApiService {
  _SettingsApi() : super(ApiClient());

  @override
  Future<Map<String, dynamic>> saveSettings(String studentId, Map<String, dynamic> prefs) async => {};
}

class _DelayedStorage extends SecureStorageService {
  final ready = Completer<StoredThemePreferences>();
  final writes = <bool>[];
  Completer<void>? firstWrite;
  bool failWrite = false;
  bool failRead = false;

  @override
  Future<StoredThemePreferences> readThemePreferences() async {
    if (failRead) throw StateError('Storage unavailable');
    return ready.future;
  }

  @override
  Future<void> writeThemePreference(bool dark, {bool teacher = false}) async {
    writes.add(dark);
    if (writes.length == 1 && firstWrite != null) await firstWrite!.future;
    if (failWrite) throw StateError('Storage unavailable');
    await super.writeThemePreference(dark, teacher: teacher);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  for (final teacher in [false, true]) {
    test('${teacher ? 'teacher' : 'student'} defaults to dark without a saved choice', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      await container.read(storedThemePreferencesProvider.future);
      expect(container.read(teacher ? teacherThemeModeProvider : themeModeProvider), ThemeMode.dark);
    });

    test('${teacher ? 'teacher' : 'student'} dark and light choices survive cold restarts', () async {
      final provider = teacher ? teacherThemeModeProvider : themeModeProvider;
      final first = ProviderContainer();
      await first.read(storedThemePreferencesProvider.future);
      await first.read(provider.notifier).setDark(true);
      first.dispose();

      final reopened = ProviderContainer();
      await reopened.read(storedThemePreferencesProvider.future);
      expect(reopened.read(provider), ThemeMode.dark);
      expect(reopened.read(teacher ? themeModeProvider : teacherThemeModeProvider), ThemeMode.dark);
      await reopened.read(provider.notifier).setDark(false);
      reopened.dispose();

      final nextOpen = ProviderContainer();
      addTearDown(nextOpen.dispose);
      await nextOpen.read(storedThemePreferencesProvider.future);
      expect(nextOpen.read(provider), ThemeMode.light);
    });
  }

  test('a backend light preference is respected when there is no device choice', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    await container.read(storedThemePreferencesProvider.future);
    await container.read(themeModeProvider.notifier).hydrateFromPrefs('Light');
    expect(container.read(themeModeProvider), ThemeMode.light);
  });

  test('a saved device choice wins over stale backend settings and session logout', () async {
    final storage = SecureStorageService();
    await storage.writeThemePreference(true);
    await storage.writeThemePreference(false, teacher: true);
    await storage.writeSessionJson('fixture');
    await storage.clearSession();
    final container = ProviderContainer();
    addTearDown(container.dispose);
    await container.read(storedThemePreferencesProvider.future);
    await container.read(themeModeProvider.notifier).hydrateFromPrefs('Light');
    expect(container.read(themeModeProvider), ThemeMode.dark);
    expect(container.read(teacherThemeModeProvider), ThemeMode.light);
    expect(await storage.readSessionJson(), isNull);
  });

  test('rapid toggles persist in order with the final choice on disk', () async {
    final storage = _DelayedStorage()..firstWrite = Completer<void>();
    storage.ready.complete((studentDark: null, teacherDark: null));
    final container = ProviderContainer(overrides: [secureStorageServiceProvider.overrideWithValue(storage)]);
    addTearDown(container.dispose);
    await container.read(storedThemePreferencesProvider.future);
    final notifier = container.read(themeModeProvider.notifier);
    final dark = notifier.setDark(true);
    final light = notifier.setDark(false);
    await Future<void>.delayed(Duration.zero);
    expect(storage.writes, [true]);
    expect(container.read(themeModeProvider), ThemeMode.light);
    storage.firstWrite!.complete();
    await Future.wait([dark, light]);
    expect(storage.writes, [true, false]);
    expect((await SecureStorageService().readThemePreferences()).studentDark, isFalse);
  });

  test('a late storage read cannot undo a manual selection', () async {
    final storage = _DelayedStorage();
    final container = ProviderContainer(overrides: [secureStorageServiceProvider.overrideWithValue(storage)]);
    addTearDown(container.dispose);
    final notifier = container.read(themeModeProvider.notifier);
    await notifier.setDark(false);
    storage.ready.complete((studentDark: true, teacherDark: null));
    await container.read(storedThemePreferencesProvider.future);
    expect(container.read(themeModeProvider), ThemeMode.light);
  });

  test('failed writes are reported and do not block saving a later choice', () async {
    final storage = _DelayedStorage()..failWrite = true;
    storage.ready.complete((studentDark: null, teacherDark: null));
    final container = ProviderContainer(overrides: [secureStorageServiceProvider.overrideWithValue(storage)]);
    addTearDown(container.dispose);
    await container.read(storedThemePreferencesProvider.future);
    final notifier = container.read(teacherThemeModeProvider.notifier);
    await expectLater(notifier.setDark(true), throwsStateError);
    storage.failWrite = false;
    await notifier.setDark(false);
    expect((await SecureStorageService().readThemePreferences()).teacherDark, isFalse);
  });

  testWidgets('startup waits for saved themes and offers retry on storage errors', (tester) async {
    final storage = _DelayedStorage()..failRead = true;
    await tester.pumpWidget(ProviderScope(
      overrides: [
        secureStorageServiceProvider.overrideWithValue(storage),
        sessionProvider.overrideWith(_SignedOut.new),
      ],
      child: const ThemeBootstrap(),
    ));
    await tester.pumpAndSettle();
    expect(find.byType(AcademiXApp), findsNothing);
    expect(find.text('Could not restore your saved theme. Please try again.'), findsOneWidget);
    storage.failRead = false;
    await tester.tap(find.text('Retry'));
    await tester.pump();
    expect(find.byType(AcademiXApp), findsNothing);
    storage.ready.complete((studentDark: true, teacherDark: false));
    await tester.pumpAndSettle();
    expect(find.byType(AcademiXApp), findsOneWidget);
    expect(find.text('Teacher'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('student theme remains saved locally when backend synchronization fails', (tester) async {
    final container = ProviderContainer(overrides: [
      sessionProvider.overrideWith(_Student.new),
      studentApiServiceProvider.overrideWithValue(_OfflineApi()),
      settingsProvider.overrideWith((ref) async => {'prefs': {'theme': 'Light'}}),
    ]);
    await container.read(storedThemePreferencesProvider.future);
    await container.read(sessionProvider.future);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(theme: AppTheme.light(), home: const StudentMoreScreen()),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(find.textContaining('Theme saved on this device, but could not sync'), findsOneWidget);
    expect((await SecureStorageService().readThemePreferences()).studentDark, isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
    container.dispose();
    final reopened = ProviderContainer();
    addTearDown(reopened.dispose);
    await reopened.read(storedThemePreferencesProvider.future);
    expect(reopened.read(themeModeProvider), ThemeMode.dark);
    expect(tester.takeException(), isNull);
  });

  testWidgets('student can switch from the default dark theme to light and back', (tester) async {
    final container = ProviderContainer(overrides: [
      sessionProvider.overrideWith(_Student.new),
      studentApiServiceProvider.overrideWithValue(_SettingsApi()),
      settingsProvider.overrideWith((ref) async => {'prefs': {}}),
    ]);
    addTearDown(container.dispose);
    await container.read(storedThemePreferencesProvider.future);
    await container.read(sessionProvider.future);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const _StudentThemeHost(),
    ));
    await tester.pumpAndSettle();
    expect(container.read(themeModeProvider), ThemeMode.dark);
    expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(container.read(themeModeProvider), ThemeMode.light);
    expect((await SecureStorageService().readThemePreferences()).studentDark, isFalse);
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(container.read(themeModeProvider), ThemeMode.dark);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

class _StudentThemeHost extends ConsumerWidget {
  const _StudentThemeHost();

  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp(
    theme: AppTheme.light(),
    darkTheme: AppTheme.dark(),
    themeMode: ref.watch(themeModeProvider),
    home: const StudentMoreScreen(),
  );
}

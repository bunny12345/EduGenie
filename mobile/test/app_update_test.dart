import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/navigation/teacher_shell.dart';
import 'package:mobile/screens/student/student_more_screen.dart';
import 'package:mobile/services/app_update_service.dart';
import 'package:mobile/state/app_update_provider.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/state/teacher_providers.dart';
import 'package:mobile/theme/app_theme.dart';
import 'package:mobile/widgets/app_update_tile.dart';
import 'package:package_info_plus/package_info_plus.dart';

AppUpdateInfo _info(UpdateAvailability availability, {int? build = 23}) =>
    AppUpdateInfo(
      availability: availability,
      immediateAllowed: true,
      availableVersionCode: build,
      packageName: 'now.academix.app',
    );

class _Updates extends AppUpdateService {
  AppUpdateInfo? info;
  bool failCheck = false;
  bool failUpdate = false;
  int checks = 0;
  int updates = 0;

  @override
  Future<PackageInfo> installedVersion() async => PackageInfo(
    appName: 'AcademiX',
    packageName: 'now.academix.app',
    version: '1.2.0',
    buildNumber: '22',
  );

  @override
  Future<AppUpdateInfo?> checkForUpdate() async {
    checks++;
    if (failCheck) throw StateError('Offline');
    return info;
  }

  @override
  Future<UpdateActionResult> update() async {
    updates++;
    if (failUpdate) throw StateError('Play unavailable');
    return UpdateActionResult.started;
  }
}

class _Student extends SessionNotifier {
  @override
  Future<Session?> build() async =>
      const Session(role: 'student', userId: 'student', token: 'fixture');
}

class _Teacher extends SessionNotifier {
  @override
  Future<Session?> build() async =>
      const Session(role: 'teacher', userId: 'teacher', token: 'fixture');

  @override
  Future<void> logout() async => state = const AsyncData(null);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets(
    'student More displays versions only offers updates when available and refreshes on resume',
    (tester) async {
      final service = _Updates()..info = _info(UpdateAvailability.notAvailable);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appUpdateServiceProvider.overrideWithValue(service),
            sessionProvider.overrideWith(_Student.new),
            settingsProvider.overrideWith((ref) async => {'prefs': {}}),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const StudentMoreScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Current: 1.2.0 (build 22)'), findsOneWidget);
      expect(find.text('Update'), findsNothing);
      service.info = _info(UpdateAvailability.available);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(find.textContaining('New build: 23'), findsOneWidget);
      await tester.tap(find.text('Update'));
      await tester.pumpAndSettle();
      expect(service.updates, 1);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'update check failures can be retried and update failures are reported',
    (tester) async {
      final service = _Updates()
        ..failCheck = true
        ..info = _info(UpdateAvailability.available);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appUpdateServiceProvider.overrideWithValue(service),
            sessionProvider.overrideWith(_Student.new),
            settingsProvider.overrideWith((ref) async => {'prefs': {}}),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const StudentMoreScreen(),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(
        find.textContaining('Could not check Google Play'),
        findsOneWidget,
      );
      service.failCheck = false;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.textContaining('New build: 23'), findsOneWidget);
      service.failUpdate = true;
      await tester.tap(find.text('Update'));
      await tester.pump();
      expect(find.textContaining('Could not start the update'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'teacher menu displays a compact update and keeps theme and logout controls',
    (tester) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final service = _Updates()..info = _info(UpdateAvailability.available);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appUpdateServiceProvider.overrideWithValue(service),
            sessionProvider.overrideWith(_Teacher.new),
            teacherProfileProvider.overrideWith(
              (ref) async => {'subject': 'Math'},
            ),
            teacherClassOptionsProvider.overrideWith((ref) async => []),
            teacherAnnouncementsProvider.overrideWith((ref) async => []),
            teacherHomeworkProvider.overrideWith((ref) async => []),
            teacherTestsProvider.overrideWith((ref) async => []),
            teacherLessonsProvider.overrideWith((ref) async => []),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const TeacherShell(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull);
      await tester.tap(find.byIcon(Icons.more_vert_rounded));
      await tester.pumpAndSettle();
      expect(find.text('Current: 1.2.0 (build 22)'), findsOneWidget);
      expect(find.text('New build: 23'), findsOneWidget);
      expect(find.text('Dark theme'), findsOneWidget);
      expect(find.text('Logout'), findsOneWidget);
      await tester.tap(find.text('Update'));
      await tester.pumpAndSettle();
      expect(service.updates, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('compact update fits a narrow menu', (tester) async {
    final service = _Updates()..info = _info(UpdateAvailability.available);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appUpdateServiceProvider.overrideWithValue(service)],
        child: MaterialApp(
          home: Scaffold(
            body: Align(
              alignment: Alignment.topLeft,
              child: SizedBox(width: 180, child: AppUpdateTile(compact: true)),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('New build: 23'), findsOneWidget);
    expect(find.text('Update'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test(
    'Android update rechecks Play and handles cancellation, failure and stale availability',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      const channel = MethodChannel('academix/app_update');
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      var availability = 2;
      var immediateAllowed = true;
      String updateResult = 'started';
      final calls = <String>[];
      String? openedUrl;
      const urlChannel = MethodChannel('plugins.flutter.io/url_launcher');
      messenger.setMockMethodCallHandler(urlChannel, (call) async {
        openedUrl = (call.arguments as Map)['url'] as String;
        return true;
      });
      addTearDown(() => messenger.setMockMethodCallHandler(urlChannel, null));
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call.method);
        if (call.method == 'checkForUpdate') {
          return {
            'availability': availability,
            'immediateAllowed': immediateAllowed,
            'availableVersionCode': 23,
            'packageName': 'now.academix.app',
          };
        }
        if (updateResult == 'failed') {
          throw PlatformException(code: 'UPDATE_FAILED');
        }
        return updateResult;
      });
      addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
      final service = AppUpdateService();
      expect(await service.update(), UpdateActionResult.started);
      expect(calls, ['checkForUpdate', 'performImmediateUpdate']);
      updateResult = 'cancelled';
      expect(await service.update(), UpdateActionResult.cancelled);
      updateResult = 'failed';
      await expectLater(service.update(), throwsA(isA<PlatformException>()));
      immediateAllowed = false;
      expect(await service.update(), UpdateActionResult.started);
      expect(
        openedUrl,
        'https://play.google.com/store/apps/details?id=now.academix.app',
      );
      availability = 1;
      expect(await service.update(), UpdateActionResult.noLongerAvailable);
      availability = 0;
      await expectLater(service.update(), throwsStateError);
    },
  );
}

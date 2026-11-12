import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/main.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/navigation/teacher_shell.dart';
import 'package:mobile/screens/teacher/teacher_home_tab.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/teacher_api_service.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/teacher_providers.dart';
import 'package:mobile/state/theme_provider.dart';
import 'package:mobile/theme/app_colors.dart';

class _Session extends SessionNotifier {
  @override
  Future<Session?> build() async => const Session(
    role: 'teacher',
    userId: 'teacher',
    token: 'fixture',
    name: 'Teacher',
  );

  void selectRole(String? role) => state = AsyncData(
    role == null ? null : Session(role: role, userId: role, token: 'fixture'),
  );

  @override
  Future<void> logout() async => state = const AsyncData(null);
}

class _TeacherApi extends TeacherApiService {
  _TeacherApi() : super(ApiClient());

  @override
  Future<List<Map<String, dynamic>>> getStudents({
    String search = '',
    String className = '',
  }) async => [];
}

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  tearDown(() => AppColors.isDark = false);

  test(
    'student, teacher and login themes remain independent across role changes',
    () async {
      final container = ProviderContainer(
        overrides: [sessionProvider.overrideWith(_Session.new)],
      );
      addTearDown(container.dispose);
      await container.read(sessionProvider.future);
      container.read(themeModeProvider.notifier).setDark(true);
      expect(container.read(activeThemeModeProvider), ThemeMode.light);
      container.read(teacherThemeModeProvider.notifier).setDark(true);
      expect(container.read(activeThemeModeProvider), ThemeMode.dark);
      final session = container.read(sessionProvider.notifier) as _Session;
      session.selectRole(null);
      expect(container.read(activeThemeModeProvider), ThemeMode.light);
      session.selectRole('student');
      expect(container.read(activeThemeModeProvider), ThemeMode.dark);
      container.read(teacherThemeModeProvider.notifier).setDark(false);
      expect(container.read(activeThemeModeProvider), ThemeMode.dark);
      session.selectRole('teacher');
      expect(container.read(activeThemeModeProvider), ThemeMode.light);
    },
  );

  testWidgets(
    'menu switch changes teacher theme, preserves tab, and leaves Logout working',
    (tester) async {
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final container = ProviderContainer(
        overrides: [
          sessionProvider.overrideWith(_Session.new),
          teacherApiServiceProvider.overrideWithValue(_TeacherApi()),
          teacherProfileProvider.overrideWith(
            (ref) async => {'subject': 'Mathematics'},
          ),
          teacherClassOptionsProvider.overrideWith((ref) async => []),
          teacherAnnouncementsProvider.overrideWith((ref) async => []),
          teacherHomeworkProvider.overrideWith((ref) async => []),
          teacherTestsProvider.overrideWith((ref) async => []),
          teacherLessonsProvider.overrideWith((ref) async => []),
        ],
      );
      addTearDown(container.dispose);
      container.read(themeModeProvider.notifier).setDark(true);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const AcademiXApp(),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      final shell = tester.state(find.byType(TeacherShell));
      final home = tester.element(find.byType(TeacherHomeTab));
      expect(Theme.of(home).brightness, Brightness.light);
      expect(AppColors.isDark, isFalse);

      await tester.tap(find.text('Students'));
      await tester.pump(const Duration(milliseconds: 250));
      await tester.tap(find.byIcon(Icons.more_vert_rounded));
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('Dark theme')).dy,
        lessThan(tester.getTopLeft(find.text('Logout')).dy),
      );
      await tester.tap(find.byType(SwitchListTile));
      await tester.pumpAndSettle();
      expect(container.read(teacherThemeModeProvider), ThemeMode.dark);
      expect(container.read(sessionProvider).value?.isTeacher, isTrue);
      expect(Theme.of(home).brightness, Brightness.dark);
      expect(AppColors.isDark, isTrue);
      expect(identical(tester.state(find.byType(TeacherShell)), shell), isTrue);
      await tester.tapAt(const Offset(10, 500));
      await tester.pumpAndSettle();

      final nav = find.byWidgetPredicate(
        (widget) =>
            widget is AnimatedContainer &&
            widget.decoration is BoxDecoration &&
            (widget.decoration as BoxDecoration).borderRadius ==
                BorderRadius.circular(999),
      );
      expect(
        (tester.widget<AnimatedContainer>(nav).decoration as BoxDecoration)
            .color,
        AppColors.cardDark,
      );
      expect(
        tester.widget<Icon>(find.byIcon(Icons.people_rounded)).color,
        const AppPalette(true).accent,
      );
      expect(
        tester.widget<Icon>(find.byIcon(Icons.assignment_outlined)).color,
        AppColors.mutedDark,
      );

      await tester.tap(find.byIcon(Icons.more_vert_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(SwitchListTile));
      await tester.pumpAndSettle();
      expect(container.read(teacherThemeModeProvider), ThemeMode.light);
      expect(container.read(themeModeProvider), ThemeMode.dark);
      await tester.tap(find.text('Logout'));
      await tester.pumpAndSettle();
      expect(container.read(sessionProvider).value, isNull);
      expect(find.byType(TeacherShell), findsNothing);
      expect(AppColors.isDark, isFalse);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}

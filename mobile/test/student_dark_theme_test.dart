import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/models/dashboard.dart';
import 'package:mobile/models/report_card.dart';
import 'package:mobile/models/rewards_data.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/navigation/student_nav_shell.dart';
import 'package:mobile/screens/student/student_calendar_screen.dart';
import 'package:mobile/state/focus_lock_provider.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/state/theme_provider.dart';
import 'package:mobile/theme/app_colors.dart';
import 'package:mobile/theme/app_theme.dart';

class _UnlockedFocus extends FocusLockNotifier {
  @override
  FocusLockState build() => const FocusLockState();
}

class _FixtureSession extends SessionNotifier {
  @override
  Future<Session?> build() async => const Session(
    role: 'student',
    token: 'fixture',
    userId: 'student',
    name: 'Alex',
    className: 'Class 8',
  );
}

class _ThemeHost extends ConsumerWidget {
  final Widget child;
  const _ThemeHost({required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp(
    theme: AppTheme.light(),
    darkTheme: AppTheme.dark(),
    themeMode: ref.watch(themeModeProvider),
    home: child,
  );
}

double _contrast(Color foreground, Color background) {
  final a = foreground.computeLuminance();
  final b = background.computeLuminance();
  return (math.max(a, b) + 0.05) / (math.min(a, b) + 0.05);
}

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  tearDown(() => AppColors.isDark = false);

  test('dark palette normal text and accent meet 4.5:1 contrast', () {
    const palette = AppPalette(true);
    for (final background in [
      palette.background,
      palette.card,
      palette.brandSoft,
    ]) {
      for (final foreground in [palette.text, palette.muted, palette.accent]) {
        expect(_contrast(foreground, background), greaterThanOrEqualTo(4.5));
      }
    }
  });

  test('a manual theme selection wins over late saved preferences', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(themeModeProvider.notifier);
    notifier.setDark(false);
    notifier.hydrateFromPrefs('Dark');
    expect(container.read(themeModeProvider), ThemeMode.light);
  });

  test('saved dark preference is hydrated only once', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final notifier = container.read(themeModeProvider.notifier);
    notifier.hydrateFromPrefs('Dark');
    notifier.hydrateFromPrefs('Light');
    expect(container.read(themeModeProvider), ThemeMode.dark);
  });

  testWidgets(
    'live toggle updates const Home, profile, Services and navigation without remounting',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final container = ProviderContainer(
        overrides: [
          focusLockProvider.overrideWith(_UnlockedFocus.new),
          sessionProvider.overrideWith(_FixtureSession.new),
          dashboardProvider.overrideWith(
            (ref) async => DashboardData(
              greetingName: 'Alex',
              schoolName: 'Fixture School',
              className: 'Class 8',
            ),
          ),
          rewardsProvider.overrideWith(
            (ref) async => const RewardsData(coins: 20),
          ),
          reportCardsProvider.overrideWith(
            (ref) async => ReportCardsData.fromJson({}),
          ),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const _ThemeHost(child: StudentShell()),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      final shellState = tester.state(find.byType(StudentShell));
      expect(
        tester.widget<Text>(find.text('Hi, Alex')).style?.color,
        AppColors.textLight,
      );
      container.read(themeModeProvider.notifier).setDark(true);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(
        identical(tester.state(find.byType(StudentShell)), shellState),
        isTrue,
      );
      expect(
        tester.widget<Text>(find.text('Hi, Alex')).style?.color,
        AppColors.textDark,
      );
      await tester.tap(find.text('Hi, Alex'));
      await tester.pump();
      expect(find.text('Alex'), findsOneWidget);
      for (final text in tester.widgetList<Text>(find.text('Alex'))) {
        expect(text.style?.color, AppColors.textDark);
      }
      await tester.tapAt(const Offset(380, 400));
      await tester.pump();
      await tester.tap(find.text('Services'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(
        tester.widget<Text>(find.text('School Services')).style?.color,
        AppColors.textDark,
      );
      final serviceImage = find.byWidgetPredicate(
        (widget) =>
            widget is Image &&
            widget.image is AssetImage &&
            (widget.image as AssetImage).assetName ==
                'assets/branding/services.png',
      );
      expect(
        tester.widget<Image>(serviceImage).color,
        const AppPalette(true).accent,
      );
      container.read(themeModeProvider.notifier).setDark(false);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('School Services'), findsOneWidget);
      expect(
        tester.widget<Text>(find.text('School Services')).style?.color,
        AppColors.textLight,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final width in [320.0, 390.0]) {
    testWidgets('dark Calendar text and fields stay readable at width $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [calendarEventsProvider.overrideWith((ref) async => [])],
          child: MaterialApp(
            theme: AppTheme.dark(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(2)),
              child: child!,
            ),
            home: const StudentCalendarScreen(),
          ),
        ),
      );
      await tester.pump();
      expect(
        tester.widget<Text>(find.text('Mon')).style?.color,
        AppColors.mutedDark,
      );
      final field = tester.widget<TextField>(find.byType(TextField).first);
      expect(field.decoration?.fillColor, AppColors.backgroundDark);
      expect(field.decoration?.hintStyle?.color, AppColors.mutedDark);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}

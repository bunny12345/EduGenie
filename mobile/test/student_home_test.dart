import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/dashboard.dart';
import 'package:mobile/models/report_card.dart';
import 'package:mobile/models/rewards_data.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/screens/student/student_announcements_screen.dart';
import 'package:mobile/screens/student/student_calendar_screen.dart';
import 'package:mobile/screens/student/student_home_screen.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/theme/app_colors.dart';

class _StudentSession extends SessionNotifier {
  @override
  Future<Session?> build() async => const Session(
    role: 'student',
    token: 'fixture',
    userId: 'student',
    name: 'Alexandra',
    className: 'Class 8',
  );
}

const _streak = StreakInfo(
  days: 4,
  longest: 9,
  atRisk: true,
  freezesAvailable: 1,
  nextMilestone: 7,
  daysToNextMilestone: 3,
  milestones: [
    Milestone(days: 7, label: 'One week', icon: '', earned: false),
    Milestone(days: 30, label: 'One month', icon: '', earned: false),
    Milestone(days: 100, label: 'One hundred', icon: '', earned: false),
  ],
);

Widget _home({
  double scale = 1,
  bool dark = false,
  StreakInfo streak = _streak,
  bool reserveNavigation = false,
}) {
  return ProviderScope(
    overrides: [
      sessionProvider.overrideWith(_StudentSession.new),
      dashboardProvider.overrideWith(
        (ref) async => DashboardData(
          schoolName: 'Green Valley International School',
          className: 'Class 8',
          streak: streak,
          announcements: const [
            AnnouncementItem(
              id: 'notice',
              title: 'Science fair',
              message: 'Bring your ideas on Friday.',
            ),
          ],
        ),
      ),
      rewardsProvider.overrideWith(
        (ref) async => const RewardsData(coins: 450),
      ),
      reportCardsProvider.overrideWith(
        (ref) async => ReportCardsData.fromJson({}),
      ),
      calendarEventsProvider.overrideWith((ref) async => []),
    ],
    child: MaterialApp(
      theme: ThemeData(
        brightness: dark ? Brightness.dark : Brightness.light,
        colorSchemeSeed: AppColors.brand,
        scaffoldBackgroundColor: AppColors.background,
      ),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(scale),
          padding: reserveNavigation
              ? const EdgeInsets.symmetric(vertical: 24)
              : EdgeInsets.zero,
        ),
        child: child!,
      ),
      home: reserveNavigation
          ? const Scaffold(
              body: SafeArea(child: StudentHomeScreen()),
              bottomNavigationBar: SizedBox(height: 88),
            )
          : const StudentHomeScreen(),
    ),
  );
}

void main() {
  tearDown(() => AppColors.isDark = false);

  testWidgets(
    'most of Academics is visible immediately after the school and streak',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(_home(reserveNavigation: true));
      await tester.pump(const Duration(milliseconds: 300));
      final panel = tester.getRect(
        find.byKey(const ValueKey('student-home-academics')),
      );
      final viewport = tester.getRect(find.byType(RefreshIndicator));
      final visibleHeight = panel.intersect(viewport).height;
      expect(visibleHeight / panel.height, greaterThanOrEqualTo(0.7));
      final streak = tester.getRect(
        find.byKey(const ValueKey('student-home-streak')),
      );
      final school = tester.getRect(
        find.text('Green Valley International School'),
      );
      expect(streak.top, greaterThan(school.bottom));
      expect(streak.bottom, lessThan(panel.top));
      expect(find.text('4 days').hitTestable(), findsOneWidget);
      expect(find.text('Academics').hitTestable(), findsOneWidget);
      expect(find.text('AI Tutor').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final width in [320.0, 390.0, 600.0]) {
    for (final scale in [1.0, 1.5, 2.0]) {
      testWidgets(
        'Home fits $width with text scale $scale and retains all destinations',
        (tester) async {
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await tester.pumpWidget(_home(scale: scale));
          await tester.pump(const Duration(milliseconds: 300));
          expect(
            find.text('Green Valley International School'),
            findsOneWidget,
          );
          await tester.tap(find.byTooltip('Show streak details'));
          await tester.pump();
          expect(find.text('4 days'), findsOneWidget);
          expect(
            find.textContaining('A freeze will protect it once.'),
            findsOneWidget,
          );
          expect(find.text('Personal best: 9 days'), findsOneWidget);
          expect(find.text('3 days to your 7-day badge'), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.tap(find.byTooltip('Hide streak details'));
          await tester.pump();
          expect(find.text('Personal best: 9 days'), findsNothing);
          for (final label in [
            'AI Tutor',
            'Homework',
            'My Orchard',
            'Report Card',
            'Progress',
            'Games',
            'Calendar',
            'Rewards',
            'Library',
          ]) {
            await tester.scrollUntilVisible(
              find.text(label),
              100,
              scrollable: find.byType(Scrollable).first,
            );
            await tester.pump(const Duration(milliseconds: 100));
            final rect = tester.getRect(find.text(label));
            expect(rect.left, greaterThanOrEqualTo(0));
            expect(rect.right, lessThanOrEqualTo(width));
            expect(tester.takeException(), isNull);
          }
          if (width == 390 && scale == 1) {
            await tester.ensureVisible(find.text('Calendar'));
            await tester.pump(const Duration(milliseconds: 600));
            await tester.tap(find.text('Calendar'));
            await tester.pump();
            await tester.pump(const Duration(milliseconds: 400));
            expect(find.byType(StudentCalendarScreen), findsOneWidget);
            expect(tester.takeException(), isNull);
          }
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }

  testWidgets(
    'dark Home uses dark surfaces and keeps profile and notices accessible',
    (tester) async {
      AppColors.isDark = true;
      await tester.pumpWidget(
        _home(dark: true, streak: const StreakInfo(days: 7, activeToday: true)),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.scrollUntilVisible(
        find.text('7 days'),
        100,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('7 days'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
      expect(
        find.text('Today’s learning complete. Keep it up!'),
        findsOneWidget,
      );
      expect(find.text('Hi, Alexandra'), findsOneWidget);
      await tester.tap(find.bySemanticsLabel(RegExp('Open student profile')));
      await tester.pump();
      expect(find.text('Alexandra'), findsOneWidget);
      await tester.tapAt(const Offset(700, 500));
      await tester.pump();
      await tester.tap(find.bySemanticsLabel(RegExp('Announcements,')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(StudentAnnouncementsScreen), findsOneWidget);
      expect(find.text('Science fair'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'new learners see an honest zero streak without invented achievements',
    (tester) async {
      await tester.pumpWidget(_home(streak: const StreakInfo()));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.scrollUntilVisible(
        find.text('0 days'),
        100,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('0 days'), findsOneWidget);
      expect(find.text('One small step starts your streak.'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_rounded), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/dashboard.dart';
import 'package:mobile/models/report_card.dart';
import 'package:mobile/models/rewards_data.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/navigation/student_nav_shell.dart';
import 'package:mobile/screens/student/student_services_screen.dart';
import 'package:mobile/state/focus_lock_provider.dart';
import 'package:mobile/state/exam_access_provider.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/theme/app_colors.dart';
import 'package:mobile/theme/app_theme.dart';

class _UnlockedFocus extends FocusLockNotifier {
  @override
  FocusLockState build() => const FocusLockState();
}

class _SignedOutSession extends SessionNotifier {
  @override
  Future<Session?> build() async => null;
}

void main() {
  for (final dark in [false, true]) {
    testWidgets(
      'Services filled icon matches Home selection and compact sizing in ${dark ? 'dark' : 'light'} mode',
      (tester) async {
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              focusLockProvider.overrideWith(_UnlockedFocus.new),
              examAccessProvider.overrideWith(
                (ref) => Stream.value(const ExamAccess()),
              ),
              sessionProvider.overrideWith(_SignedOutSession.new),
              dashboardProvider.overrideWith(
                (ref) async => DashboardData.fromJson({}),
              ),
              rewardsProvider.overrideWith(
                (ref) async => RewardsData.fromJson({}),
              ),
              reportCardsProvider.overrideWith(
                (ref) async => ReportCardsData.fromJson({}),
              ),
            ],
            child: MaterialApp(
              theme: dark ? AppTheme.dark() : AppTheme.light(),
              home: const StudentShell(),
            ),
          ),
        );
        await tester.pump();

        final palette = AppPalette(dark);
        Finder servicesIcon() => find.byIcon(Icons.grid_view_rounded);
        Icon icon() => tester.widget<Icon>(servicesIcon());

        expect(find.byIcon(Icons.grid_view_outlined), findsOneWidget);
        expect(
          tester.widget<Icon>(find.byIcon(Icons.grid_view_outlined)).color,
          palette.muted,
        );
        expect(find.byIcon(Icons.home_rounded), findsOneWidget);
        await tester.tap(find.text('Services'));
        await tester.pump(const Duration(milliseconds: 250));
        expect(servicesIcon(), findsOneWidget);
        expect(icon().size, 22);
        expect(icon().color, palette.accent);
        expect(find.byIcon(Icons.home_outlined), findsOneWidget);
        final selectedCircle = tester.widget<AnimatedContainer>(
          find
              .ancestor(
                of: servicesIcon(),
                matching: find.byType(AnimatedContainer),
              )
              .first,
        );
        expect(
          (selectedCircle.decoration as BoxDecoration).color,
          palette.brandSoft,
        );
        expect(find.byType(StudentServicesScreen), findsOneWidget);
        expect(find.text('Services'), findsNWidgets(2));

        ScrollUpdateNotification(
          metrics: FixedScrollMetrics(
            minScrollExtent: 0,
            maxScrollExtent: 100,
            pixels: 20,
            viewportDimension: 400,
            axisDirection: AxisDirection.down,
            devicePixelRatio: 1,
          ),
          context: tester.element(find.byType(StudentServicesScreen)),
          scrollDelta: 20,
        ).dispatch(tester.element(find.byType(StudentServicesScreen)));
        await tester.pump(const Duration(milliseconds: 250));
        expect(icon().size, 20);
        expect(icon().color, palette.accent);
        expect(find.text('Services'), findsOneWidget);
        await tester.tap(find.byIcon(Icons.home_outlined));
        await tester.pump(const Duration(milliseconds: 250));
        expect(find.byIcon(Icons.home_rounded), findsOneWidget);
        expect(find.byIcon(Icons.grid_view_outlined), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}

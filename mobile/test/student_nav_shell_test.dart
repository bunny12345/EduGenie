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
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/theme/app_colors.dart';

class _UnlockedFocus extends FocusLockNotifier {
  @override
  FocusLockState build() => const FocusLockState();
}

class _SignedOutSession extends SessionNotifier {
  @override
  Future<Session?> build() async => null;
}

void main() {
  testWidgets('Services PNG keeps selection, navigation and compact sizing', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          focusLockProvider.overrideWith(_UnlockedFocus.new),
          sessionProvider.overrideWith(_SignedOutSession.new),
          dashboardProvider.overrideWith(
            (ref) async => DashboardData.fromJson({}),
          ),
          rewardsProvider.overrideWith((ref) async => RewardsData.fromJson({})),
          reportCardsProvider.overrideWith(
            (ref) async => ReportCardsData.fromJson({}),
          ),
        ],
        child: const MaterialApp(home: StudentShell()),
      ),
    );
    await tester.pump();

    final servicesIcon = find.byWidgetPredicate(
      (widget) =>
          widget is Image &&
          widget.image is AssetImage &&
          (widget.image as AssetImage).assetName ==
              'assets/branding/services.png',
    );
    Image icon() => tester.widget<Image>(servicesIcon);

    expect(servicesIcon, findsOneWidget);
    expect(icon().width, 22);
    expect(icon().color, AppColors.muted);
    expect(find.byIcon(Icons.miscellaneous_services_outlined), findsNothing);
    await tester.tap(find.text('Services'));
    await tester.pump(const Duration(milliseconds: 250));
    expect(icon().color, AppColors.brand);
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
    expect(icon().width, 20);
    expect(icon().color, AppColors.brand);
    expect(find.text('Services'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

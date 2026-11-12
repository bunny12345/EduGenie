import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/screens/student/student_services_screen.dart';
import 'package:mobile/theme/app_colors.dart';
import 'package:mobile/widgets/student_shortcut_tile.dart';

void main() {
  tearDown(() => AppColors.isDark = false);

  for (final width in [320.0, 390.0, 600.0]) {
    for (final scale in [1.0, 1.5, 2.0]) {
      testWidgets(
        'Services fits $width at text scale $scale and preserves previews',
        (tester) async {
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await tester.pumpWidget(
            MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
              home: const StudentServicesScreen(),
            ),
          );
          await tester.pump();
          for (final label in [
            'Student Info',
            'Fee',
            'Transport',
            'Attendance',
            'Medical Info',
            'My Room',
            'Leaves',
            'Technical Query',
          ]) {
            await tester.scrollUntilVisible(
              find.text(label),
              100,
              scrollable: find.byType(Scrollable).first,
            );
            final rect = tester.getRect(find.text(label));
            expect(rect.left, greaterThanOrEqualTo(0));
            expect(rect.right, lessThanOrEqualTo(width));
            expect(tester.takeException(), isNull);
          }
          await tester.ensureVisible(find.text('Student Info'));
          await tester.tap(find.text('Student Info'));
          await tester.pump();
          expect(
            tester
                .widgetList<StudentShortcutTile>(
                  find.byType(StudentShortcutTile),
                )
                .where((tile) => tile.selected == true)
                .single
                .label,
            'Student Info',
          );
          await tester.scrollUntilVisible(
            find.byTooltip('Close service preview'),
            100,
            scrollable: find.byType(Scrollable).first,
          );
          expect(
            find.text(
              'This school service is ready to be customized for your school requirements.',
            ),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
          await tester.ensureVisible(find.byTooltip('Close service preview'));
          await tester.pump();
          await tester.tap(find.byTooltip('Close service preview'));
          await tester.pump();
          expect(
            find.text(
              'This school service is ready to be customized for your school requirements.',
            ),
            findsNothing,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('Services follows dark surfaces using the same raised Home tile', (
    tester,
  ) async {
    AppColors.isDark = true;
    await tester.pumpWidget(
      MaterialApp(theme: ThemeData.dark(), home: const StudentServicesScreen()),
    );
    expect(find.byType(StudentShortcutTile), findsNWidgets(8));
    final tiles = tester.widgetList<StudentShortcutTile>(
      find.byType(StudentShortcutTile),
    );
    expect(tiles.first.asset, 'assets/gifs/student-info.gif');
    await tester.tap(find.text('Fee'));
    await tester.pump();
    expect(
      find.text(
        'This school service is ready to be customized for your school requirements.',
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}

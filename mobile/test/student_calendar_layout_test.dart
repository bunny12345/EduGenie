import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/calendar_event.dart';
import 'package:mobile/screens/student/student_calendar_screen.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/widgets/guided_highlight.dart';

void main() {
  testWidgets('empty calendar title is highlighted and brought into view', (tester) async {
    tester.view.physicalSize = const Size(320, 650);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(ProviderScope(
      overrides: [calendarEventsProvider.overrideWith((ref) async => [])],
      child: const MaterialApp(home: StudentCalendarScreen()),
    ));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Add Event'));
    await tester.tap(find.text('Add Event'));
    await tester.pumpAndSettle();
    expect(find.text('Enter an event title.'), findsOneWidget);
    final title = find.byWidgetPredicate((w) => w is TextField && w.decoration?.hintText == 'Event title');
    expect(title.hitTestable(), findsOneWidget);
    expect(tester.widget<GuidedHighlight>(find.ancestor(of: title, matching: find.byType(GuidedHighlight)).first).active, isTrue);
    await tester.enterText(title, 'Exam day');
    await tester.pumpAndSettle();
    expect(find.text('Enter an event title.'), findsNothing);
  });

  for (final dark in [false, true]) {
    for (final width in [320.0, 390.0]) {
      for (final scale in [1.0, 1.5, 2.0]) {
        testWidgets('event dots stay below dates ($dark, $width, $scale)', (
          tester,
        ) async {
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final now = DateTime.now();
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                calendarEventsProvider.overrideWith(
                  (ref) async => [
                    CalendarEvent(
                      id: 'event',
                      title: 'School event',
                      startsAt: DateTime(
                        now.year,
                        now.month,
                        14,
                      ).toIso8601String(),
                    ),
                  ],
                ),
              ],
              child: MaterialApp(
                theme: ThemeData(
                  brightness: dark ? Brightness.dark : Brightness.light,
                ),
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(
                    context,
                  ).copyWith(textScaler: TextScaler.linear(scale)),
                  child: child!,
                ),
                home: const StudentCalendarScreen(),
              ),
            ),
          );
          await tester.pump();
          final date = find.text('14');
          final dot = find.byKey(const ValueKey('calendar-event-dot-14'));
          final neighbour = find.text('15');
          void checkSpacing() {
            final dateRect = tester.getRect(date);
            final dotRect = tester.getRect(dot);
            expect(dotRect.top - dateRect.bottom, greaterThanOrEqualTo(3));
            expect(dotRect.center.dx, closeTo(dateRect.center.dx, 0.1));
            final cell = find
                .ancestor(of: date, matching: find.byType(InkWell))
                .first;
            expect(tester.getRect(cell).contains(dotRect.bottomCenter), isTrue);
            expect(dateRect.top, closeTo(tester.getRect(neighbour).top, 0.1));
          }

          checkSpacing();
          await tester.ensureVisible(date);
          await tester.tap(date);
          await tester.pump();
          checkSpacing();
          expect(
            tester.widget<DecoratedBox>(dot).decoration,
            const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
          );
          expect(find.text('• School event'), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
        });
      }
    }
  }
}

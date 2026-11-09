import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/homework_item.dart';
import 'package:mobile/screens/student/homework/homework_screen.dart';
import 'package:mobile/state/student_providers.dart';

void main() {
  for (final width in [320.0, 390.0, 600.0]) {
    for (final scale in [1.0, 1.5, 2.0]) {
      testWidgets('homework feedback fits $width at text scale $scale', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              studentSubjectsProvider.overrideWith((ref) => ['Mathematics']),
              homeworkProvider.overrideWith(
                (ref) async => const [
                  HomeworkItem(
                    id: 'homework',
                    title: 'rational numbers',
                    subject: 'Mathematics',
                    status: 'submitted',
                    submitted: true,
                    submittedAt: '2026-01-01T10:00:00Z',
                    dueStatus: 'submitted',
                    grade: 85,
                    feedback: 'Good work. Explain the final step.',
                    latestAnswerText: 'My completed homework answer.',
                  ),
                ],
              ),
              testsProvider.overrideWith((ref) async => []),
            ],
            child: MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
              home: const HomeworkScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.text('Show feedback'),
          150,
          scrollable: find.byType(Scrollable).last,
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final button = tester.getRect(find.text('Show feedback'));
        expect(button.left, greaterThanOrEqualTo(0));
        expect(button.right, lessThanOrEqualTo(width));
        await tester.tap(find.text('Show feedback'));
        await tester.pumpAndSettle();
        expect(find.text('Good work. Explain the final step.'), findsOneWidget);
        expect(find.text('Grade: 85/100'), findsOneWidget);
        expect(find.text('Hide feedback'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.tap(find.text('Hide feedback'));
        await tester.pumpAndSettle();
        expect(find.text('Good work. Explain the final step.'), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/orchard_data.dart';
import 'package:mobile/screens/student/orchard/orchard_tree_detail_screen.dart';
import 'package:mobile/state/student_providers.dart';

void main() {
  for (final width in [320.0, 390.0, 600.0]) {
    for (final scale in [1.0, 1.5, 2.0]) {
      testWidgets(
        'Orchard detail stats fit at width $width and text scale $scale',
        (tester) async {
          tester.view.physicalSize = Size(width, 1000);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                orchardTreeProvider('science').overrideWith(
                  (ref) async => OrchardTreeDetailData.fromJson({
                    'subjectKey': 'science',
                    'subject': 'Science',
                    'treeType': 'crystal',
                    'tree': {
                      'stage': 'seed',
                      'stageLabel': 'Seed',
                      'rootsPct': 6,
                      'totalChapters': 1,
                      'masteredChapters': 0,
                    },
                  }),
                ),
              ],
              child: MaterialApp(
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(
                    context,
                  ).copyWith(textScaler: TextScaler.linear(scale)),
                  child: child!,
                ),
                home: const OrchardTreeDetailScreen(
                  studentId: 'student-1',
                  subjectKey: 'science',
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          final roots = find.text('Roots (understanding)');
          await tester.ensureVisible(roots);
          await tester.pumpAndSettle();
          expect(roots, findsOneWidget);
          expect(find.text('6%'), findsOneWidget);
          expect(find.text('Overall growth'), findsOneWidget);
          expect(tester.takeException(), isNull);
          final labelRect = tester.getRect(roots);
          final card = find
              .ancestor(of: roots, matching: find.byType(Container))
              .first;
          final cardRect = tester.getRect(card);
          expect(labelRect.bottom, lessThanOrEqualTo(cardRect.bottom));
          expect(labelRect.right, lessThanOrEqualTo(cardRect.right));
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }
}

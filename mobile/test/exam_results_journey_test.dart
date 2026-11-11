import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/report_card.dart';
import 'package:mobile/screens/student/progress/exam_journey_data.dart';
import 'package:mobile/screens/student/progress/exam_results_journey.dart';

ReportCard card(
  String id,
  String name,
  int maximum,
  List<int> marks,
  String date,
) => ReportCard.fromJson({
  'examId': id,
  'examName': name,
  'createdAt': date,
  'subjects': [
    {'subject': 'Mathematics', 'marks': marks[0], 'maxMarks': maximum},
    {'subject': 'Science', 'marks': marks[1], 'maxMarks': maximum},
  ],
});

void main() {
  final first = card('q', 'Quarterly exam', 25, [15, 20], '2026-07-01');
  final second = card('h', 'Half-yearly exam', 50, [45, 40], '2026-09-01');
  final third = card('a', 'Annual exam', 100, [60, 80], '2026-11-01');

  test(
    'normalizes exam marks, preserves creation order and calculates rise, fall and steady',
    () {
      final points = examJourney([second, first, third]);
      expect(points.map((p) => p.value('')), [70, 85, 70]);
      expect(points.map((p) => p.value('mathematics')), [60, 90, 60]);
      expect(examChange(70, 85), -15);
      expect(examChange(85, 70), 15);
      expect(examChange(80, 80), 0);
      expect(examPercentage(20, 25), examPercentage(40, 50));
      expect(examPercentage(40, 50), examPercentage(80, 100));
      expect(points.first.value('missing'), isNull);
      expect(examPercentage(0, 25), 0);
      expect(() => examPercentage(30, 25), throwsFormatException);
      expect(() => examPercentage(0, 0), throwsFormatException);
      expect(
        examJourney([
          ReportCard.fromJson({
            'examId': 'mixed',
            'subjects': [
              {'subject': 'Mathematics', 'marks': 20, 'maxMarks': 25},
              {'subject': 'Science', 'marks': 50, 'maxMarks': 100},
            ],
          }),
        ]).single.value(''),
        closeTo(56, 1e-10),
      );
    },
  );

  testWidgets(
    'one panel shows the direction, subject percentages and selected exam marks on a phone',
    (tester) async {
      tester.view.physicalSize = const Size(390, 1800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ExamResultsJourney(
                points: examJourney([third, second, first]),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Exam Results Journey'), findsOneWidget);
      expect(find.text('↓ Down 15 pp'), findsWidgets);
      final chart = tester.widget<ExamJourneyChart>(
        find.byType(ExamJourneyChart),
      );
      expect(chart.points.map((p) => p.value('')), [70, 85, 70]);
      await tester.tap(find.widgetWithText(ChoiceChip, 'Mathematics'));
      await tester.pumpAndSettle();
      final subjectChart = tester.widget<ExamJourneyChart>(
        find.byType(ExamJourneyChart),
      );
      expect(subjectChart.subject, 'mathematics');
      subjectChart.onSelect(1);
      await tester.pumpAndSettle();
      expect(find.text('↑ Up 30 pp'), findsWidgets);
      expect(find.text('Mathematics · 45/50 marks'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'zero result is shown and empty cards wait for real released marks',
    (tester) async {
      Future<void> render(List<ReportCard> cards) => tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ExamResultsJourney(points: examJourney(cards)),
            ),
          ),
        ),
      );
      await render([]);
      expect(find.text('Your exam story starts here'), findsOneWidget);
      await render([
        card('z', 'First exam', 25, [0, 0], '2026-01-01'),
      ]);
      expect(find.text('0%'), findsWidgets);
      expect(find.text('One real result. No predictions.'), findsOneWidget);
      expect(find.byType(ExamJourneyChart), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

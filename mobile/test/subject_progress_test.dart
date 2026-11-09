import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/learning_score.dart';
import 'package:mobile/screens/student/progress/progress_charts.dart';
import 'package:mobile/screens/student/progress/subject_progress_detail_screen.dart';
import 'package:mobile/screens/student/student_progress_screen.dart';

void main() {
  testWidgets(
    'overall graph preserves the backend /1000 scores in both ranges',
    (tester) async {
      tester.view.physicalSize = const Size(600, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final data = LearningScoreData.fromJson({
        'success': true,
        'hasData': true,
        'score': 546,
        'dailyTrend': [
          {'label': '1', 'score': 400, 'value': 40},
          {'label': '2', 'score': 546, 'value': 55},
        ],
        'trend': [
          {'label': 'Oct', 'score': 480, 'value': 48},
          {'label': 'Nov', 'score': 546, 'value': 55},
          {'label': 'Dec', 'score': null, 'value': null, 'future': true},
        ],
      });
      Future<void> renderRange(String range) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: LearningReportBody(
                  data: data,
                  greetingName: null,
                  trendView: range,
                  subjView: 'daily',
                  onTrendViewChange: (_) {},
                  onSubjViewChange: (_) {},
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
      }

      await renderRange('daily');
      final daily = tester.widget<GrowthLineChart>(
        find.byType(GrowthLineChart).first,
      );
      expect(daily.points.map((p) => p.value), [400, 546]);
      expect(daily.maxY, 1000);
      await renderRange('monthly');
      final monthly = tester.widget<GrowthLineChart>(
        find.byType(GrowthLineChart).first,
      );
      expect(monthly.points.map((p) => p.value), [480, 546, null]);
      expect(monthly.points.last.future, isTrue);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'subject report displays all five components and shared history without games',
    (tester) async {
      tester.view.physicalSize = const Size(390, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final subject = SubjectProgress.fromJson({
        'subjectKey': 'science',
        'name': 'Science',
        'score': 85,
        'score1000': 850,
        'status': 'strong',
        'statusLabel': 'Great!',
        'metrics': [
          for (final metric in [
            ('understanding', 'Understanding', 90),
            ('tests', 'Test Scores', 80),
            ('practice', 'Practice', 60),
            ('growth', 'Tree Growth', 100),
            ('homework', 'Homework', 100),
          ])
            {'key': metric.$1, 'label': metric.$2, 'value': metric.$3},
        ],
        'stats': [
          {'label': 'Homework completed', 'value': 8},
        ],
        'daily': [
          {'label': '1', 'value': 10},
          {'label': '2', 'value': 85},
        ],
        'monthly': [
          {'label': 'Oct', 'value': 10},
          {'label': 'Nov', 'value': 85},
          {'label': 'Dec', 'value': null, 'future': true},
        ],
      });
      await tester.pumpWidget(
        MaterialApp(home: SubjectProgressDetailScreen(subject: subject)),
      );
      await tester.pumpAndSettle();
      final chart = tester.widget<GrowthLineChart>(
        find.byType(GrowthLineChart),
      );
      expect(chart.points.map((p) => p.value), [10, 85]);
      await tester.tap(find.text('Month by month'));
      await tester.pumpAndSettle();
      final monthly = tester.widget<GrowthLineChart>(
        find.byType(GrowthLineChart),
      );
      expect(monthly.points.map((p) => p.value), [10, 85, null]);
      expect(monthly.points.last.future, isTrue);
      await tester.scrollUntilVisible(
        find.text('Homework'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.text('Homework'), findsOneWidget);
      expect(subject.metrics.length, 5);
      await tester.scrollUntilVisible(
        find.text('Homework completed'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.text('Homework completed'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

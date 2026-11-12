import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/learning_score.dart';
import 'package:mobile/models/report_card.dart';
import 'package:mobile/screens/student/progress/exam_journey_data.dart';
import 'package:mobile/screens/student/progress/exam_results_journey.dart';
import 'package:mobile/screens/student/progress/progress_charts.dart';
import 'package:mobile/screens/student/progress/progress_helpers.dart';
import 'package:mobile/screens/student/progress/subject_progress_detail_screen.dart';
import 'package:mobile/screens/student/student_progress_screen.dart';
import 'package:mobile/theme/app_colors.dart';

double contrast(Color a, Color b) {
  final first = a.computeLuminance();
  final second = b.computeLuminance();
  return ((first > second ? first : second) + 0.05) /
      ((first > second ? second : first) + 0.05);
}

final _subject = SubjectProgress.fromJson({
  'subjectKey': 'science',
  'name': 'Science',
  'score': 85,
  'score1000': 850,
  'status': 'strong',
  'statusLabel': 'Great!',
  'trend': -4,
  'tip': 'Keep practising every day.',
  'daily': [
    {'label': '1', 'value': 50},
    {'label': '2', 'value': 85},
  ],
  'monthly': [
    {'label': 'Oct', 'value': 50},
    {'label': 'Nov', 'value': 85},
    {'label': 'Dec', 'future': true},
  ],
  'metrics': [
    for (final value in [0, 20, 40, 60, 85])
      {'label': 'Skill $value', 'value': value},
  ],
  'stats': [
    {'label': 'Homework completed', 'value': 8},
  ],
  'bestTest': 90,
  'strength': {'label': 'Understanding', 'value': 85},
  'focus': {'label': 'Revision', 'value': 20},
});

final _points = examJourney([
  for (var i = 0; i < 3; i++)
    ReportCard.fromJson({
      'examId': '$i',
      'examName': 'Exam $i',
      'createdAt': '2026-0${i + 1}-01',
      'subjects': [
        {'subject': 'Science', 'marks': 60 + i * 10, 'maxMarks': 100},
      ],
    }),
]);

Widget _host(Widget child, {required bool dark}) => MaterialApp(
  theme: ThemeData(brightness: dark ? Brightness.dark : Brightness.light),
  home: child,
);

void main() {
  setUp(() {
    // Intentionally keep the legacy flag out of sync: Theme is authoritative.
    AppColors.isDark = false;
  });
  tearDown(() => AppColors.isDark = false);

  testWidgets('report palette preserves light colors and readable dark pairs', (
    tester,
  ) async {
    for (final dark in [false, true]) {
      late ProgressColors colors;
      await tester.pumpWidget(
        _host(
          Builder(
            builder: (context) {
              colors = ProgressColors.of(context);
              return const SizedBox();
            },
          ),
          dark: dark,
        ),
      );
      await tester.pumpAndSettle();
      final surface = colors.surface(Colors.white);
      if (!dark) {
        expect(surface, Colors.white);
        expect(colors.text(const Color(0xFF1E2140)), const Color(0xFF1E2140));
        expect(colors.muted(const Color(0xFF8B90AD)), const Color(0xFF8B90AD));
        expect(colors.tint(const Color(0xFFDCFCE7)), const Color(0xFFDCFCE7));
        expect(colors.accent(const Color(0xFF15803D)), const Color(0xFF15803D));
        continue;
      }
      expect(surface, AppColors.cardDark);
      expect(
        contrast(colors.text(Colors.black), surface),
        greaterThanOrEqualTo(4.5),
      );
      expect(
        contrast(colors.muted(Colors.grey), surface),
        greaterThanOrEqualTo(4.5),
      );
      expect(
        contrast(colors.guide(Colors.white), surface),
        greaterThanOrEqualTo(3),
      );
      for (final bg in [
        ...kStatusChipBg.values,
        const Color(0xFFFEF3C7),
        const Color(0xFFF3F0FF),
        const Color(0xFFF4FCF9),
      ]) {
        for (final ink in [
          ...kStatusChipText.values,
          ...kSkillWordColors.values,
          const Color(0xFF6355DC),
          const Color(0xFFA55316),
          const Color(0xFF087C5D),
          const Color(0xFFDC2626),
        ]) {
          expect(
            contrast(colors.accent(ink), colors.tint(bg)),
            greaterThanOrEqualTo(4.5),
            reason: '$ink on $bg',
          );
        }
      }
    }
  });

  testWidgets('cached report updates labels and all chart painters on toggle', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final points = [
      ChartPoint(label: 'Oct', value: 400),
      ChartPoint(label: 'Nov', value: 600),
      ChartPoint(label: 'Dec', future: true),
    ];
    final data = LearningScoreData(
      hasData: true,
      score: 600,
      maxScore: 1000,
      color: const Color(0xFF6355DC),
      momentumDelta: -4,
      dimensions: [
        ScoreDimension(key: 'revision', label: 'Revision', value: 60),
        ScoreDimension(key: 'tests', label: 'Tests', value: 80),
        ScoreDimension(key: 'homework', label: 'Homework', value: 40),
      ],
      trend: points,
      dailyTrend: points,
      subjects: [_subject],
      strengths: [ScoreDimension(key: 'tests', label: 'Tests', value: 80)],
      focusAreas: [
        ScoreDimension(key: 'revision', label: 'Revision', value: 20),
      ],
      improvements: ['Revise a little every day'],
      alert: ScoreAlert(
        level: 'alert',
        title: 'Time to practise',
        message: 'A little revision helps.',
        dropped: [DroppedDimension(key: 'tests', label: 'Tests', delta: -4)],
      ),
    );
    final child = Scaffold(
      body: SingleChildScrollView(
        child: LearningReportBody(
          data: data,
          greetingName: null,
          trendView: 'monthly',
          subjView: 'monthly',
          onTrendViewChange: (_) {},
          onSubjViewChange: (_) {},
          examResultsPanel: ExamResultsJourney(points: _points),
        ),
      ),
    );
    Map<String, CustomPainter> painters() => {
      for (final widget in tester.widgetList<CustomPaint>(
        find.byType(CustomPaint),
      ))
        if (widget.painter != null &&
            [
              '_RingGaugePainter',
              '_GrowthLinePainter',
              '_RadarChartPainter',
              '_ExamPainter',
            ].contains(widget.painter.runtimeType.toString()))
          widget.painter.runtimeType.toString(): widget.painter!,
    };
    await tester.pumpWidget(_host(child, dark: false));
    await tester.pumpAndSettle();
    tester
        .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Science'))
        .onSelected!(true);
    tester.widget<ExamJourneyChart>(find.byType(ExamJourneyChart)).onSelect(0);
    await tester.pumpAndSettle();
    final before = painters();
    expect(before.length, 4);
    expect(
      tester.widget<Text>(find.text('🌟 What makes up my score')).style!.color,
      const Color(0xFF1E2140),
    );
    await tester.pumpWidget(_host(child, dark: true));
    await tester.pumpAndSettle();
    expect(
      tester.widget<Text>(find.text('🌟 What makes up my score')).style!.color,
      AppColors.textDark,
    );
    expect(
      tester.widget<Text>(find.text('Exam Results Journey')).style!.color,
      AppColors.textDark,
    );
    final examChart = tester.widget<ExamJourneyChart>(
      find.byType(ExamJourneyChart),
    );
    expect(examChart.subject, 'science');
    expect(examChart.selectedIndex, 0);
    for (final entry in painters().entries) {
      expect(
        entry.value.shouldRepaint(before[entry.key]!),
        isTrue,
        reason: entry.key,
      );
    }
    await tester.scrollUntilVisible(
      find.text('Exam Results Journey'),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(data.score, 600);
    expect(data.color, const Color(0xFF6355DC));
  });

  for (final dark in [false, true]) {
    testWidgets('subject detail and empty exam layout at 390px (dark=$dark)', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        _host(SubjectProgressDetailScreen(subject: _subject), dark: dark),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<Scaffold>(find.byType(Scaffold)).backgroundColor,
        dark ? AppColors.backgroundDark : const Color(0xFFF7F7FC),
      );
      await tester.tap(find.text('Month by month'));
      await tester.pumpAndSettle();
      final chart = tester.widget<GrowthLineChart>(
        find.byType(GrowthLineChart),
      );
      expect(chart.points.last.future, isTrue);
      await tester.scrollUntilVisible(
        find.text('Homework completed'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(
        _host(
          const Scaffold(
            body: SingleChildScrollView(child: ExamResultsJourney(points: [])),
          ),
          dark: dark,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Your exam story starts here'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}

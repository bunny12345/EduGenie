import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/models/report_card.dart';
import 'package:mobile/screens/student/student_report_card_screen.dart';
import 'package:mobile/widgets/rank_badge.dart';
import 'package:mobile/widgets/rank_celebration.dart';

Map<String, dynamic> _cardJson({int? rank, bool pending = false}) => {
  'examId': 'e1',
  'examName': 'Annual Exam',
  'className': 'Class 8',
  'maxMarks': 100,
  'subjects': [
    {'subject': 'Mathematics', 'marks': 90, 'maxMarks': 100, 'percentage': 90, 'grade': 'A+', 'remarks': 'Great', 'teacherName': 'M'},
    {'subject': 'Telugu', 'marks': 80, 'maxMarks': 100, 'percentage': 80, 'grade': 'A', 'remarks': '', 'teacherName': 'T'},
  ],
  'total': 170,
  'maxTotal': 200,
  'percentage': 85,
  'grade': 'A',
  'rank': rank,
  'classSize': 5,
  'toppers': [
    {'rank': 1, 'name': 'Anu'},
    {'rank': 2, 'name': 'Bannu'},
  ],
  'celebrationPending': pending,
};

void main() {
  test('ReportCardsData parses rank, toppers, celebration flag and badge', () {
    final data = ReportCardsData.fromJson({
      'reportCards': [_cardJson(rank: 1, pending: true)],
      'badge': {'rank': 1, 'examId': 'e1', 'examName': 'Annual Exam'},
    });
    expect(data.cards.single.rank, 1);
    expect(data.cards.single.celebrationPending, isTrue);
    expect(data.cards.single.toppers.map((t) => t.name), ['Anu', 'Bannu']);
    expect(data.badge?.rank, 1);
    expect(ReportCardsData.fromJson({'reportCards': []}).badge, isNull);
  });

  testWidgets('RankBadge renders all three ranks and animates without errors', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Row(children: [RankBadge(rank: 1), RankBadge(rank: 2), RankBadge(rank: 3, animated: false)]),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byType(RankBadge), findsNWidgets(3));
    expect(tester.takeException(), isNull);
  });

  testWidgets('RankCelebration runs its particle show and closes on tap', (tester) async {
    var closed = false;
    await tester.binding.setSurfaceSize(const Size(400, 800));
    await tester.pumpWidget(
      MaterialApp(
        home: RankCelebration(rank: 1, name: 'Bunny', className: 'Class 9', examName: 'Annual Exam', onClose: () => closed = true),
      ),
    );
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.textContaining('Congratulations, Bunny'), findsOneWidget);
    expect(find.textContaining('1st Rank'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.textContaining('Yay!'));
    expect(closed, isTrue);
    // Let the ticker finish before teardown.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.binding.setSurfaceSize(null);
  });

  testWidgets('ReportCardSheet shows the rank pill for students and real rank for teachers', (tester) async {
    await tester.binding.setSurfaceSize(const Size(420, 1600));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(child: ReportCardSheet(card: ReportCard.fromJson(_cardJson(rank: 2)), studentName: 'Bannu')),
        ),
      ),
    );
    expect(find.text('2nd in Class 8'), findsOneWidget);
    expect(find.textContaining('Class Toppers'), findsOneWidget);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ReportCardSheet(card: ReportCard.fromJson(_cardJson(rank: 4)), studentName: 'Dee', teacherView: true),
          ),
        ),
      ),
    );
    expect(find.text('4 of 5'), findsOneWidget);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(child: ReportCardSheet(card: ReportCard.fromJson(_cardJson()), studentName: 'Dee')),
        ),
      ),
    );
    expect(find.textContaining('in Class 8'), findsNothing);
    await tester.binding.setSurfaceSize(null);
  });
}

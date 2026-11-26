import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/models/learning_score.dart';
import 'package:mobile/screens/teacher/teacher_home_tab.dart';
import 'package:mobile/screens/teacher/teacher_progress_tab.dart';
import 'package:mobile/screens/teacher/teacher_report_cards_tab.dart';
import 'package:mobile/screens/teacher/teacher_students_tab.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/teacher_api_service.dart';
import 'package:mobile/state/teacher_providers.dart';
import 'package:mobile/theme/app_colors.dart';
import 'package:mobile/theme/app_theme.dart';
import 'package:mobile/widgets/guided_highlight.dart';

class _Api extends TeacherApiService {
  _Api() : super(ApiClient());
  String? savedHomework;
  int? savedGrade;
  String? savedFeedback;
  List<Map<String, dynamic>>? savedMarks;

  @override
  Future<List<Map<String, dynamic>>> getStudents({String search = '', String className = ''}) async => [
    {'id': 'student', 'name': 'Alex', 'className': 'Class 8'},
  ];

  @override
  Future<List<Map<String, dynamic>>> getStudentHomework(String studentId) async => [
    {'id': 'hw', 'title': 'Plant worksheet', 'subject': 'Science', 'dueStatus': 'submitted', 'grade': 80, 'latestAnswerText': 'My work'},
  ];

  @override
  Future<Map<String, dynamic>?> getStudentSubjectProgress(String studentId) async => null;

  @override
  Future<Map<String, dynamic>> gradeHomework(String hwId, {int? grade, String? feedback}) async {
    savedHomework = hwId;
    savedGrade = grade;
    savedFeedback = feedback;
    return {'success': true};
  }

  @override
  Future<List<Map<String, dynamic>>> listTestQuestions(String testId) async => [];

  @override
  Future<Map<String, dynamic>> getExamStudents(String testId) async => {
    'students': [],
    'ended': false,
    'serverNow': DateTime.now().toIso8601String(),
    'endAt': DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
  };

  @override
  Future<Map<String, dynamic>> getReportCardExams(String className) async => {
    'exams': [
      {
        'id': 'exam',
        'name': 'Annual Exam',
        'className': 'Class 8',
        'isOwner': true,
        'maxMarks': 100,
        'studentsReleased': 0,
        'studentsTotal': 1,
        'subjects': [
          {'subject': 'Mathematics', 'isMine': true, 'entered': 1, 'total': 1},
        ],
      },
    ],
  };

  @override
  Future<Map<String, dynamic>> getReportCardMarks(String examId) async => {
    'canEdit': true,
    'students': [
      {'id': 'student', 'name': 'Alex', 'marks': 80, 'remarks': 'Good work'},
    ],
  };

  @override
  Future<Map<String, dynamic>> saveReportCardMarks(String examId, List<Map<String, dynamic>> entries) async {
    savedMarks = entries;
    final response = await getReportCardExams('Class 8');
    return {'success': true, 'exam': (response['exams'] as List).single};
  }
}

class _ProgressApi extends _Api {
  final scoreStudents = <String>[];
  final examStudents = <String>[];
  final classFilters = <String>[];

  @override
  Future<List<Map<String, dynamic>>> getStudents({
    String search = '',
    String className = '',
  }) async {
    classFilters.add(className);
    return [
      {'id': 'student', 'name': 'Alex', 'className': 'Class 8'},
      {'id': 'second', 'name': 'Morgan', 'className': 'Class 8'},
    ].where((student) => student['name']!.toLowerCase().contains(search.toLowerCase())).toList();
  }

  @override
  Future<LearningScoreData> getStudentLearningScore(String studentId) async {
    scoreStudents.add(studentId);
    return LearningScoreData.fromJson({
      'hasData': true,
      'score': 600,
      'subjects': [{'name': 'Science', 'score': 60}],
    });
  }

  @override
  Future<Map<String, dynamic>> getStudentReportCards(String studentId) async {
    examStudents.add(studentId);
    return {
      'reportCards': [],
      'pending': [
        {'examName': 'Autumn Exam', 'entered': 1, 'total': 2, 'missingSubjects': ['Science']},
      ],
    };
  }
}

double _contrast(Color foreground, Color background) {
  final a = foreground.computeLuminance();
  final b = background.computeLuminance();
  return (math.max(a, b) + 0.05) / (math.min(a, b) + 0.05);
}

void _readable(WidgetTester tester, Finder finder) {
  final element = tester.element(finder);
  final text = tester.widget<Text>(finder);
  final color = text.style?.color ?? DefaultTextStyle.of(element).style.color!;
  var background = Theme.of(element).scaffoldBackgroundColor;
  element.visitAncestorElements((ancestor) {
    final widget = ancestor.widget;
    final decoration = widget is Container
        ? widget.decoration
        : widget is DecoratedBox
        ? widget.decoration
        : null;
    final fill = widget is Container
        ? widget.color
        : widget is ColoredBox
        ? widget.color
        : decoration is BoxDecoration
        ? decoration.color
        : null;
    if (fill != null && fill.a == 1) {
      background = fill;
      return false;
    }
    return true;
  });
  expect(_contrast(color, background), greaterThanOrEqualTo(4.5), reason: 'Unreadable ${text.data}');
}

void _readableField(WidgetTester tester, Finder finder) {
  final editable = tester.widget<EditableText>(find.descendant(of: finder, matching: find.byType(EditableText)));
  final element = tester.element(finder);
  final field = tester.widget<TextField>(finder);
  final theme = Theme.of(element).inputDecorationTheme;
  final background = field.decoration?.fillColor ?? theme.fillColor!;
  expect(_contrast(editable.style.color!, background), greaterThanOrEqualTo(4.5));
  final hint = field.decoration?.hintStyle?.color ?? theme.hintStyle!.color!;
  expect(_contrast(hint, background), greaterThanOrEqualTo(4.5));
}

Widget _app(Widget child, _Api api, ValueNotifier<bool> dark) => ProviderScope(
  overrides: [
    teacherApiServiceProvider.overrideWithValue(api),
    teacherClassOptionsProvider.overrideWith((ref) async => ['Class 8']),
    teacherProfileProvider.overrideWith((ref) async => {'subject': 'Mathematics'}),
    teacherAnnouncementsProvider.overrideWith((ref) async => []),
    teacherHomeworkProvider.overrideWith((ref) async => []),
    teacherLessonsProvider.overrideWith((ref) async => []),
    teacherTestsProvider.overrideWith(
      (ref) async => [
        {'id': 'draft', 'title': 'Draft exam', 'status': 'draft', 'subject': 'Mathematics'},
        {'id': 'strict', 'title': 'Strict exam', 'status': 'assigned', 'strictMode': true, 'subject': 'Mathematics'},
      ],
    ),
  ],
  child: ValueListenableBuilder<bool>(
    valueListenable: dark,
    builder: (_, isDark, child) => MaterialApp(
      theme: isDark ? AppTheme.dark() : AppTheme.light(),
      home: Scaffold(body: child),
    ),
    child: child,
  ),
);

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);
  tearDown(() => AppColors.isDark = false);

  for (final (label, screen) in const [
    ('Students', TeacherStudentsTab()),
    ('Student Progress', TeacherProgressTab()),
  ]) {
    testWidgets('$label puts the class filter above name search', (tester) async {
      final dark = ValueNotifier(false);
      addTearDown(dark.dispose);
      final api = _ProgressApi();
      await tester.pumpWidget(_app(screen, api, dark));
      await tester.pumpAndSettle();
      final filter = find.text('Filter by class').hitTestable();
      expect(tester.getTopLeft(filter).dy, lessThan(tester.getTopLeft(find.byType(TextField)).dy));
      await tester.tap(find.text('All classes').hitTestable());
      await tester.pumpAndSettle();
      await tester.tap(find.text('Class 8').hitTestable().last);
      await tester.pumpAndSettle();
      expect(api.classFilters, ['all', 'Class 8']);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('teacher home tabs open forms directly and keep drafts', (tester) async {
    tester.view.physicalSize = const Size(320, 680);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final dark = ValueNotifier(false);
    addTearDown(dark.dispose);
    await tester.pumpWidget(_app(const TeacherHomeTab(activeClassBanner: Text('Active class')), _Api(), dark));
    await tester.pumpAndSettle();
    expect(find.text('Post an announcement').hitTestable(), findsOneWidget);
    final title = find.widgetWithText(TextField, 'Announcement title').hitTestable();
    await tester.enterText(title, 'Assembly reminder');
    await tester.tap(find.text('Homework').hitTestable());
    await tester.pumpAndSettle();
    expect(find.text('Assign Homework').hitTestable(), findsOneWidget);
    await tester.tap(find.text('Mock Tests').hitTestable());
    await tester.pumpAndSettle();
    expect(find.text('Create a mock test').hitTestable(), findsOneWidget);
    await tester.tap(find.text('Announcements').hitTestable());
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(title).controller!.text, 'Assembly reminder');
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('teacher can search, switch students and browse report views', (tester) async {
    tester.view.physicalSize = const Size(320, 680);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final dark = ValueNotifier(true);
    addTearDown(dark.dispose);
    final api = _ProgressApi();
    await tester.pumpWidget(_app(const TeacherProgressTab(), api, dark));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alex'));
    await tester.pumpAndSettle();
    expect(find.text('Learning Power').hitTestable(), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.text('Subjects'));
    await tester.pumpAndSettle();
    expect(find.text('Progress by subject').hitTestable(), findsOneWidget);
    expect(find.text('Learning Power'), findsNothing);
    await tester.tap(find.text('Exam Results'));
    await tester.pumpAndSettle();
    expect(find.text('Exam Results Journey').hitTestable(), findsOneWidget);
    expect(find.textContaining('Autumn Exam'), findsOneWidget);
    expect(api.examStudents, ['student']);
    await tester.tap(find.text('Change student'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Morgan');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(find.text('Alex'), findsNothing);
    await tester.tap(find.text('Morgan', findRichText: false).last);
    await tester.pumpAndSettle();
    expect(find.text('Learning Power').hitTestable(), findsOneWidget);
    expect(api.scoreStudents, ['student', 'second']);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('student roster returns to Snapshot when picking for that view', (tester) async {
    final dark = ValueNotifier(false);
    addTearDown(dark.dispose);
    await tester.pumpWidget(_app(const TeacherStudentsTab(), _Api(), dark));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Snapshot'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open student roster'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alex'));
    await tester.pumpAndSettle();
    expect(find.text('Progress Snapshot'), findsOneWidget);
    expect(find.text('Homework Status'), findsNothing);
    await tester.tap(find.text('Homework'));
    await tester.pumpAndSettle();
    expect(find.text('Plant worksheet'), findsOneWidget);
    expect(find.text('Progress Snapshot'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('mock-test actions have 4.5:1 contrast in both themes and still open editing and questions', (tester) async {
    tester.view.physicalSize = const Size(430, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final dark = ValueNotifier(true);
    addTearDown(dark.dispose);
    await tester.pumpWidget(_app(const TeacherHomeTab(activeClassBanner: SizedBox.shrink()), _Api(), dark));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mock Tests'));
    await tester.pumpAndSettle();
    final list = find.textContaining('View tests');
    await tester.ensureVisible(list);
    await tester.tap(list);
    await tester.pumpAndSettle();
    for (final isDark in [true, false, true]) {
      dark.value = isDark;
      await tester.pumpAndSettle();
      for (final label in ['Add Questions', 'Edit', 'Reuse']) {
        _readable(tester, find.text(label).first);
      }
      final lockedEdit = tester.widget<GestureDetector>(
        find.ancestor(of: find.text('Edit').last, matching: find.byType(GestureDetector)).first,
      );
      expect(lockedEdit.onTap, isNull);
    }
    await tester.ensureVisible(find.text('Edit').first);
    await tester.tap(find.text('Edit').first);
    await tester.pumpAndSettle();
    expect(find.text('Save Changes'), findsOneWidget);
    await tester.tap(find.text('Cancel').first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Add Questions').first);
    await tester.tap(find.text('Add Questions').first);
    await tester.pumpAndSettle();
    expect(find.text('Add Question to "Draft exam"'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('student grading fields use dark surfaces and preserve draft and grading behavior', (tester) async {
    tester.view.physicalSize = const Size(390, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final dark = ValueNotifier(true);
    addTearDown(dark.dispose);
    final api = _Api();
    await tester.pumpWidget(_app(const TeacherStudentsTab(), api, dark));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alex').first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Grade'));
    await tester.tap(find.text('Grade'));
    await tester.pumpAndSettle();
    final score = find.byWidgetPredicate((w) => w is TextField && w.decoration?.hintText == 'Score (0-100)');
    final feedback = find.byWidgetPredicate((w) => w is TextField && w.decoration?.hintText == 'Feedback for student');
    expect(tester.widget<TextField>(score).decoration!.fillColor, AppColors.cardDark);
    expect(tester.widget<TextField>(feedback).decoration!.fillColor, AppColors.cardDark);
    _readableField(tester, score);
    _readableField(tester, feedback);
    await tester.enterText(score, '91');
    await tester.enterText(feedback, 'Detailed teacher feedback');
    dark.value = false;
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(score).decoration!.fillColor, AppColors.cardLight);
    _readableField(tester, score);
    _readableField(tester, feedback);
    dark.value = true;
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(score).controller!.text, '91');
    expect(tester.widget<TextField>(feedback).controller!.text, 'Detailed teacher feedback');
    await tester.ensureVisible(find.text('Submit'));
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();
    expect(api.savedHomework, 'hw');
    expect(api.savedGrade, 91);
    expect(api.savedFeedback, 'Detailed teacher feedback');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('invalid marks are targeted and empty marks still clear the entry', (tester) async {
    tester.view.physicalSize = const Size(390, 750);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final dark = ValueNotifier(false);
    addTearDown(dark.dispose);
    final api = _Api();
    await tester.pumpWidget(_app(const TeacherReportCardsTab(), api, dark));
    await tester.pumpAndSettle();
    final marks = find.byWidgetPredicate((w) => w is TextField && w.style?.fontSize == 28);
    await tester.scrollUntilVisible(marks, 200, scrollable: find.byType(Scrollable).first);
    await tester.enterText(marks, '101');
    final save = find.text('Save marks');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(api.savedMarks, isNull);
    expect(marks.hitTestable(), findsOneWidget);
    expect(tester.widget<GuidedHighlight>(find.ancestor(of: marks, matching: find.byType(GuidedHighlight)).first).active, isTrue);
    await tester.enterText(marks, '');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(api.savedMarks!.single['marks'], '');
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('report card heading, marks and remarks remain readable and edits survive theme changes', (tester) async {
    tester.view.physicalSize = const Size(430, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final dark = ValueNotifier(true);
    addTearDown(dark.dispose);
    final api = _Api();
    await tester.pumpWidget(_app(const TeacherReportCardsTab(), api, dark));
    await tester.pumpAndSettle();
    _readable(tester, find.text('Annual Exam').last);
    _readable(tester, find.text('Class 8 · out of 100 per subject'));
    _readable(tester, find.text('Visible to students: 0 of 1'));
    final remarks = find.byWidgetPredicate((w) => w is TextField && w.decoration?.labelText == 'Remark (optional)');
    final marks = find.byWidgetPredicate((w) => w is TextField && w.style?.fontSize == 28);
    expect(tester.widget<TextField>(remarks).decoration!.fillColor, AppColors.cardDark);
    expect(tester.widget<TextField>(marks).style!.color, AppColors.textDark);
    _readableField(tester, marks);
    _readableField(tester, remarks);
    await tester.ensureVisible(remarks);
    await tester.enterText(remarks, 'Excellent progress');
    for (final isDark in [false, true]) {
      dark.value = isDark;
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(remarks).controller!.text, 'Excellent progress');
      expect(tester.widget<TextField>(remarks).decoration!.fillColor, AppPalette(isDark).card);
    }
    await tester.ensureVisible(find.text('Save marks'));
    await tester.tap(find.text('Save marks'));
    await tester.pumpAndSettle();
    expect(api.savedMarks?.single['remarks'], 'Excellent progress');
    expect(api.savedMarks?.single['marks'], '80');
    expect(find.text("Saved Alex's marks."), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

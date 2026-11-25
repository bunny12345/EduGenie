import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/screens/teacher/teacher_home_tab.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/teacher_api_service.dart';
import 'package:mobile/state/teacher_providers.dart';
import 'package:mobile/theme/app_theme.dart';

class _Class8 extends TeacherTargetClassNotifier {
  @override
  String build() => 'Class 8';
}

class _TestApi extends TeacherApiService {
  _TestApi() : super(ApiClient());

  final tests = <Map<String, dynamic>>[];
  Map<String, dynamic>? question;
  Map<String, dynamic>? assignment;

  @override
  Future<List<Map<String, dynamic>>> getTests() async => List.of(tests);

  @override
  Future<Map<String, dynamic>> createTest({
    required String title,
    required String subject,
    required String className,
    int durationMinutes = 30,
  }) async {
    final test = {
      'id': 'test-1',
      'title': title,
      'subject': subject,
      'className': className,
      'durationMinutes': durationMinutes,
      'status': 'draft',
    };
    tests.add(test);
    return {'test': test};
  }

  @override
  Future<Map<String, dynamic>> addTestQuestion(
    String testId, {
    required String text,
    required List<String> options,
    required int correctOption,
  }) async {
    question = {'testId': testId, 'text': text, 'options': options, 'correctOption': correctOption};
    return {'question': {'id': 'q1', 'text': text, 'options': options, 'correctOption': correctOption}};
  }

  @override
  Future<Map<String, dynamic>> assignTest(
    String testId, {
    required String startAt,
    required String endAt,
    bool strictMode = false,
  }) async {
    assignment = {'testId': testId, 'startAt': startAt, 'endAt': endAt, 'strictMode': strictMode};
    tests.single['status'] = 'assigned';
    return {'success': true};
  }
}

Future<void> _visibleTap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _chooseDateTime(WidgetTester tester, Finder field, int hour) async {
  await _visibleTap(tester, field);
  await tester.tap(find.text('OK'));
  await tester.pumpAndSettle();
  final picker = tester.widget<CupertinoDatePicker>(find.byType(CupertinoDatePicker));
  picker.onDateTimeChanged(DateTime(2026, 1, 1, hour));
  await tester.tap(find.text('Done'));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  for (final dark in [false, true]) {
    testWidgets('draft, questions and strict assignment remain usable in ${dark ? 'dark' : 'light'} mode', (tester) async {
      tester.view.physicalSize = const Size(320, 680);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = _TestApi();
      await tester.pumpWidget(ProviderScope(
        overrides: [
          teacherApiServiceProvider.overrideWithValue(api),
          teacherTargetClassProvider.overrideWith(_Class8.new),
          teacherProfileProvider.overrideWith((ref) async => {'subject': 'Science'}),
          teacherAnnouncementsProvider.overrideWith((ref) async => []),
          teacherHomeworkProvider.overrideWith((ref) async => []),
          teacherLessonsProvider.overrideWith((ref) async => []),
          teacherTestsProvider.overrideWith((ref) => api.getTests()),
        ],
        child: MaterialApp(
          theme: dark ? AppTheme.dark() : AppTheme.light(),
          home: const Scaffold(body: TeacherHomeTab(activeClassBanner: SizedBox.shrink())),
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mock Tests'));
      await tester.pumpAndSettle();
      expect(find.text('Create a draft'), findsOneWidget);
      expect(find.text('A draft is not visible to students.'), findsOneWidget);
      final create = find.text('Create Test for Class 8');
      await _visibleTap(tester, create);
      expect(find.text('Please enter a test title.'), findsOneWidget);

      final title = find.byWidgetPredicate((w) => w is TextField && w.decoration?.labelText == 'Test title');
      await tester.enterText(title, 'Fractions quiz');
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await _visibleTap(tester, create);
      expect(api.tests.single['status'], 'draft');
      expect(api.tests.single['durationMinutes'], 30);
      expect(find.text('Add Question to "Fractions quiz"').hitTestable(), findsOneWidget);

      await _visibleTap(tester, find.text('Add Question'));
      expect(find.text('Please enter a question.'), findsOneWidget);
      final question = find.byWidgetPredicate((w) => w is TextField && w.decoration?.labelText == 'Question');
      await _visibleTap(tester, question);
      await tester.enterText(question, 'What is one half?');
      final option1 = find.byWidgetPredicate((w) => w is TextField && w.decoration?.labelText == 'Option 1 (correct)');
      final option2 = find.byWidgetPredicate((w) => w is TextField && w.decoration?.labelText == 'Option 2');
      await tester.ensureVisible(option1);
      await tester.enterText(option1, '1/2');
      await tester.ensureVisible(option2);
      await tester.enterText(option2, '1/3');
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await _visibleTap(tester, find.text('Add Question'));
      expect(api.question, {'testId': 'test-1', 'text': 'What is one half?', 'options': ['1/2', '1/3'], 'correctOption': 0});
      expect(find.text('Question added (1 total).'), findsOneWidget);

      await _visibleTap(tester, find.text('View tests & assign'));
      expect(find.text('Selected test').hitTestable(), findsOneWidget);
      expect(find.text('Strict exam'), findsNothing);
      await _visibleTap(tester, find.text('3. Schedule & assign'));
      await _visibleTap(tester, find.text('Assign'));
      expect(find.text('Set both an opens-at and closes-at time before assigning this test.'), findsOneWidget);
      await _visibleTap(tester, find.text('Strict exam'));
      await _chooseDateTime(tester, find.text('dd/mm/yyyy, --:--').first, 9);
      await _chooseDateTime(tester, find.text('dd/mm/yyyy, --:--').last, 10);
      await _visibleTap(tester, find.text('3. Schedule & assign'));
      await _visibleTap(tester, find.text('3. Schedule & assign'));
      expect(tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value, isTrue);
      await _visibleTap(tester, find.text('Assign'));
      expect(api.assignment!['testId'], 'test-1');
      expect(api.assignment!['strictMode'], isTrue);
      expect(DateTime.parse(api.assignment!['startAt'] as String).hour, 9);
      expect(DateTime.parse(api.assignment!['endAt'] as String).hour, 10);
      expect(find.text('Test assigned.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}

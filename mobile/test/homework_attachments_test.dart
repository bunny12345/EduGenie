import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/config/env.dart';
import 'package:mobile/models/homework_item.dart';
import 'package:mobile/screens/student/homework/homework_screen.dart';
import 'package:mobile/screens/student/homework/lightbox.dart';
import 'package:mobile/screens/teacher/teacher_home_tab.dart';
import 'package:mobile/screens/teacher/teacher_students_tab.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/attachment_url.dart';
import 'package:mobile/services/save_attachment_native.dart' as native;
import 'package:mobile/services/teacher_api_service.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/state/teacher_providers.dart';
import 'package:mobile/theme/app_theme.dart';

const _urls = ['/uploads/homework/one.png', '/uploads/homework/two.png'];

class _TeacherApi extends TeacherApiService {
  _TeacherApi() : super(ApiClient());
  int? savedGrade;
  String? savedFeedback;
  String? assignedGradingGuidance;
  bool failAi = false;
  bool twoStudents = false;
  Completer<Map<String, dynamic>>? pendingAi;
  @override
  Future<List<Map<String, dynamic>>> getStudents({String search = '', String className = ''}) async => [
    {'id': 'student', 'name': 'Alex', 'className': 'Class 8'},
    if (twoStudents) {'id': 'other', 'name': 'Blair', 'className': 'Class 8'},
  ];
  @override
  Future<List<Map<String, dynamic>>> getStudentHomework(String studentId) async => studentId == 'other' ? [
    {'id': 'other-hw', 'title': 'Blair homework', 'status': 'pending'},
  ] : [
    {
      'id': 'submitted', 'title': 'Submitted worksheet', 'subject': 'Science', 'status': 'submitted',
      'latestAnswerText': 'Plants need sunlight and water.', 'latestAttachmentUrls': _urls,
      'grade': savedGrade, 'feedback': savedFeedback,
    },
    {
      'id': 'pending', 'title': 'Pending worksheet', 'status': 'pending',
      'attachmentUrls': ['/uploads/teacher-question.png'],
    },
  ];
  @override
  Future<Map<String, dynamic>?> getStudentSubjectProgress(String studentId) async => null;
  @override
  Future<Map<String, dynamic>> aiGradeHomework(String hwId) async {
    expect(hwId, 'submitted');
    if (pendingAi != null) return pendingAi!.future;
    if (failAi) throw Exception('The handwriting is unreadable. Please review manually.');
    return {'success': true, 'score': 87, 'feedback': 'Good explanation. Add how roots absorb water.'};
  }
  @override
  Future<Map<String, dynamic>> assignHomework({
    required String title,
    required String subject,
    String? note,
    String? gradingGuidance,
    List<String> attachmentUrls = const [],
    String? startAt,
    String? dueAt,
    required String className,
    List<String> lessonIds = const [],
    List<String> lessonTitles = const [],
  }) async {
    assignedGradingGuidance = gradingGuidance;
    return {'success': true, 'created': 3};
  }

  @override
  Future<Map<String, dynamic>> gradeHomework(String hwId, {int? grade, String? feedback}) async {
    expect(hwId, 'submitted');
    savedGrade = grade;
    savedFeedback = feedback;
    return {'success': true};
  }
}

class _Class8TargetClassNotifier extends TeacherTargetClassNotifier {
  @override
  String build() => 'Class 8';
}

Widget _teacherStudentApp(_TeacherApi api, {bool dark = false}) => ProviderScope(
  overrides: [
    teacherApiServiceProvider.overrideWithValue(api),
    teacherClassOptionsProvider.overrideWith((ref) async => ['Class 8']),
  ],
  child: MaterialApp(
    theme: dark ? AppTheme.dark() : AppTheme.light(),
    home: const Scaffold(body: TeacherStudentsTab()),
  ),
);

Future<void> _selectTeacherStudent(WidgetTester tester) async {
  await tester.tap(find.text('Alex'));
  await tester.pumpAndSettle();
}

Finder _thumbnail(int index, double size) => find.byWidgetPredicate(
  (w) => w is Image && w.width == size && w.image is NetworkImage && (w.image as NetworkImage).url == resolveAttachmentUrl(_urls[index]),
);

Future<void> _checkViewer(WidgetTester tester) async {
  expect(find.text('2 / 2'), findsOneWidget);
  expect(find.byTooltip('Download image'), findsOneWidget);
  expect(find.byTooltip('Download all'), findsOneWidget);
  await tester.tap(find.byIcon(Icons.chevron_left_rounded).last);
  await tester.pumpAndSettle();
  expect(find.text('1 / 2'), findsOneWidget);
  await tester.drag(find.byType(PageView), const Offset(-500, 0));
  await tester.pumpAndSettle();
  expect(find.text('2 / 2'), findsOneWidget);
  await tester.tap(find.byTooltip('Close image viewer'));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  test('attachment paths resolve consistently without breaking local HTTP', () {
    expect(resolveAttachmentUrl(_urls.first), '${Env.apiBaseUrl}${_urls.first}');
    expect(resolveAttachmentUrl('uploads/homework/one.png'), '${Env.apiBaseUrl}${_urls.first}');
    expect(resolveAttachmentUrl('http://academix.now/uploads/pic.png'), 'https://academix.now/uploads/pic.png');
    expect(resolveAttachmentUrl('http://localhost:3000/pic.png'), 'http://localhost:3000/pic.png');
    expect(resolveAttachmentUrl('https://cdn.example/pic.png?token=abc'), 'https://cdn.example/pic.png?token=abc');
  });

  for (final dark in [false, true]) {
    testWidgets('teacher student grading shows submitted text/photos and reuses the image viewer in ${dark ? 'dark' : 'light'} mode', (tester) async {
      tester.view.physicalSize = const Size(430, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(_teacherStudentApp(_TeacherApi(), dark: dark));
      await tester.pumpAndSettle();
      await _selectTeacherStudent(tester);
      final submission = find.text('View student submission');
      await tester.ensureVisible(submission);
      await tester.tap(submission);
      await tester.pumpAndSettle();
      expect(find.text('Plants need sunlight and water.'), findsOneWidget);
      expect(find.text('No student submission yet'), findsOneWidget);
      expect(find.text('✨ Autocorrect'), findsOneWidget);
      expect(find.byWidgetPredicate((w) => w is Image && w.image is NetworkImage && (w.image as NetworkImage).url.contains('teacher-question')), findsNothing);
      await tester.ensureVisible(_thumbnail(1, 72));
      await tester.tap(_thumbnail(1, 72));
      await tester.pumpAndSettle();
      await _checkViewer(tester);
      expect(find.text('Plants need sunlight and water.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('teacher assignment history opens the selected photo and supports swiping in ${dark ? 'dark' : 'light'} mode', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(430, 1100);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            teacherProfileProvider.overrideWith((ref) async => {'subject': 'Science'}),
            teacherAnnouncementsProvider.overrideWith((ref) async => []),
            teacherLessonsProvider.overrideWith((ref) async => []),
            teacherTestsProvider.overrideWith((ref) async => []),
            teacherHomeworkProvider.overrideWith(
              (ref) async => [
                {
                  'id': 'assignment',
                  'title': 'Plant worksheet',
                  'subject': 'Science',
                  'note': 'Read both images',
                  'startAt': DateTime.now().toIso8601String(),
                  'attachmentUrls': _urls,
                },
              ],
            ),
          ],
          child: MaterialApp(
            theme: dark ? AppTheme.dark() : AppTheme.light(),
            home: const Scaffold(body: TeacherHomeTab(activeClassBanner: SizedBox.shrink())),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Homework'));
      await tester.pumpAndSettle();
      final history = find.text('View History');
      await tester.ensureVisible(history);
      await tester.pumpAndSettle();
      await tester.tap(history);
      await tester.pumpAndSettle();
      expect(find.text('Assigned Homework History'), findsOneWidget);
      final details = find.text('Show details');
      await tester.scrollUntilVisible(details, 200, scrollable: find.byType(Scrollable).last);
      await tester.pumpAndSettle();
      await tester.tap(details);
      await tester.pumpAndSettle();
      await tester.ensureVisible(_thumbnail(1, 56));
      await tester.pumpAndSettle();
      await tester.tap(_thumbnail(1, 56));
      await tester.pumpAndSettle();
      await _checkViewer(tester);
      expect(find.text('Read both images'), findsOneWidget);
      expect(find.text('Assigned Homework History'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets(
      'student subject homework history keeps attachment viewing and saved submission previews in ${dark ? 'dark' : 'light'} mode',
      (tester) async {
        tester.view.physicalSize = const Size(430, 1100);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              studentSubjectsProvider.overrideWith((ref) => ['Science']),
              homeworkProvider.overrideWith(
                (ref) async => [
                  HomeworkItem(
                    id: 'hw',
                    title: 'Plant worksheet',
                    subject: 'Science',
                    note: 'Read both images',
                    status: 'submitted',
                    startAt: DateTime.now().toIso8601String(),
                    submittedAt: DateTime.now().toIso8601String(),
                    attachmentUrls: _urls,
                    latestAttachmentUrls: _urls,
                  ),
                ],
              ),
              testsProvider.overrideWith((ref) async => []),
            ],
            child: MaterialApp(theme: dark ? AppTheme.dark() : AppTheme.light(), home: const HomeworkScreen()),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Open history'));
        await tester.pumpAndSettle();
        expect(find.text('📅 View history by date'), findsOneWidget);
        final instructions = find.text('View instructions');
        await tester.scrollUntilVisible(instructions, 200, scrollable: find.byType(Scrollable).first);
        await tester.pumpAndSettle();
        await tester.tap(instructions);
        await tester.pumpAndSettle();
        await tester.ensureVisible(_thumbnail(1, 64));
        await tester.pumpAndSettle();
        await tester.tap(_thumbnail(1, 64));
        await tester.pumpAndSettle();
        await _checkViewer(tester);
        await tester.ensureVisible(find.text('View submission'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('View submission'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(_thumbnail(1, 64).last);
        await tester.pumpAndSettle();
        await tester.tap(_thumbnail(1, 64).last);
        await tester.pumpAndSettle();
        await _checkViewer(tester);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('teacher can assign private AI marking guidance separately from student instructions', (tester) async {
    tester.view.physicalSize = const Size(430, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = _TeacherApi();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          teacherApiServiceProvider.overrideWithValue(api),
          teacherTargetClassProvider.overrideWith(_Class8TargetClassNotifier.new),
          teacherProfileProvider.overrideWith((ref) async => {'subject': 'Science'}),
          teacherLessonsProvider.overrideWith((ref) async => []),
          teacherHomeworkProvider.overrideWith((ref) async => []),
          teacherAnnouncementsProvider.overrideWith((ref) async => []),
          teacherTestsProvider.overrideWith((ref) async => []),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const Scaffold(body: TeacherHomeTab(activeClassBanner: SizedBox.shrink())),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Homework'));
    await tester.pumpAndSettle();

    final title = find.byWidgetPredicate((widget) =>
        widget is TextField && widget.decoration?.hintText?.startsWith('Homework title') == true);
    final guidance = find.widgetWithText(TextField, 'AI marking guidance (prefilled, teacher-only)');
    final prefilledGuidance = tester.widget<TextField>(guidance).controller!.text;
    expect(prefilledGuidance, startsWith('Grade as a strict but fair teacher for school-age learners.'));
    expect(prefilledGuidance, contains('For mathematics, check the method'));
    await tester.ensureVisible(title);
    await tester.enterText(title, 'Plant worksheet');
    await tester.ensureVisible(guidance);
    final customGuidance =
        '$prefilledGuidance\nUse Unit 5; accept equivalent wording for root water absorption.';
    await tester.enterText(guidance, customGuidance);

    final assign = find.text('✅ Assign to Class 8');
    await tester.ensureVisible(assign);
    await tester.tap(assign);
    await tester.pumpAndSettle();

    expect(api.assignedGradingGuidance, customGuidance);
    expect(tester.takeException(), isNull);
  });

  testWidgets('teacher reviews and edits AI suggestions before publishing a grade', (tester) async {
    tester.view.physicalSize = const Size(430, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = _TeacherApi();
    await tester.pumpWidget(_teacherStudentApp(api));
    await tester.pumpAndSettle();
    await _selectTeacherStudent(tester);
    final ai = find.text('✨ Autocorrect');
    await tester.ensureVisible(ai);
    await tester.tap(ai);
    await tester.pumpAndSettle();
    expect(api.savedGrade, isNull);
    final score = find.widgetWithText(TextField, 'Score (0-100)');
    final feedback = find.widgetWithText(TextField, 'Feedback for student');
    expect(tester.widget<TextField>(score).controller!.text, '87');
    expect(tester.widget<TextField>(feedback).controller!.text, contains('roots absorb water'));
    await tester.enterText(score, '90');
    await tester.enterText(feedback, 'Reviewed by teacher.');
    final submit = find.text('Submit');
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();
    expect(api.savedGrade, 90);
    expect(api.savedFeedback, 'Reviewed by teacher.');
    expect(find.text('Grade: 90/100'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('AI correction errors remain visible and never publish a grade', (tester) async {
    tester.view.physicalSize = const Size(430, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = _TeacherApi()..failAi = true;
    await tester.pumpWidget(_teacherStudentApp(api));
    await tester.pumpAndSettle();
    await _selectTeacherStudent(tester);
    final ai = find.text('✨ Autocorrect');
    await tester.ensureVisible(ai);
    await tester.tap(ai);
    await tester.pumpAndSettle();
    expect(find.textContaining('handwriting is unreadable'), findsOneWidget);
    expect(api.savedGrade, isNull);
    expect(find.widgetWithText(TextField, 'Score (0-100)'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a late AI suggestion cannot populate another student grading form', (tester) async {
    tester.view.physicalSize = const Size(430, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final pending = Completer<Map<String, dynamic>>();
    final api = _TeacherApi()..twoStudents = true..pendingAi = pending;
    await tester.pumpWidget(_teacherStudentApp(api));
    await tester.pumpAndSettle();
    await _selectTeacherStudent(tester);
    final ai = find.text('✨ Autocorrect');
    await tester.ensureVisible(ai);
    await tester.tap(ai);
    await tester.pumpAndSettle();
    final next = find.text('Next \u2192');
    await tester.ensureVisible(next);
    await tester.tap(next);
    await tester.pumpAndSettle();
    pending.complete({'score': 87, 'feedback': 'Alex feedback'});
    await tester.pumpAndSettle();
    expect(find.text('Blair homework'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Score (0-100)'), findsNothing);
    expect(api.savedGrade, isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('viewer exposes image errors instead of failing silently', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showImageLightbox(context, const ['https://invalid.example/photo.png'], 0),
              child: const Text('Open image'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open image'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Unable to display this image'), findsOneWidget);
    await tester.tap(find.byTooltip('Download image'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Saved 0 of 1 images.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  }, skip: kIsWeb);

  test('native download sends original bytes and filename to Photos', () async {
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('gal'), (call) async {
      calls.add(call);
      return call.method == 'putImageBytes' ? null : true;
    });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('gal'), null),
    );
    final bytes = Uint8List.fromList([1, 2, 3]);
    await native.saveAttachment(bytes, 'photo.png', 'image/png');
    final saved = calls.singleWhere((c) => c.method == 'putImageBytes');
    expect(saved.arguments['bytes'], bytes);
    expect(saved.arguments['name'], 'photo.png');
    expect(saved.arguments['album'], 'AcademiX');
  }, skip: kIsWeb);

  test('native download explicitly rejects denied photo access', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('gal'),
      (call) async => false,
    );
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('gal'), null),
    );
    await expectLater(native.saveAttachment(Uint8List(1), 'photo.png', 'image/png'), throwsStateError);
  }, skip: kIsWeb);
}

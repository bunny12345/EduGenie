import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/models/test_item.dart';
import 'package:mobile/screens/student/test_taking_screen.dart';
import 'package:mobile/screens/student/student_ai_tutor_screen.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/student_api_service.dart';
import 'package:mobile/services/teacher_api_service.dart';
import 'package:mobile/state/exam_access_provider.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/state/teacher_providers.dart';
import 'package:mobile/theme/app_colors.dart';
import 'package:mobile/widgets/strict_exam_students.dart';

class _Session extends SessionNotifier {
  @override
  Future<Session?> build() async =>
      const Session(role: 'student', userId: 'student-a', token: 'fixture');
}

class _Api extends StudentApiService {
  _Api() : super(ApiClient());
  String status = 'active';
  int revision = 0;
  final answers = <String, int>{};
  final calls = <String>[];
  bool offline = false;
  Map<String, dynamic> response() => {
    'control': {
      'status': status,
      'revision': revision++,
      'answers': Map<String, int>.from(answers),
      'serverNow': DateTime.now().toIso8601String(),
      'endAt': DateTime.now().add(const Duration(minutes: 5)).toIso8601String(),
    },
    if (status == 'closed')
      'result': {
        'score': 100,
        'feedback': 'Saved answers submitted',
        'perQuestionFeedback': [],
      },
  };
  @override
  Future<Map<String, dynamic>> startTest(
    String testId,
    String studentId,
  ) async => {
    ...response(),
    'strictMode': true,
    'attemptId': 'attempt-a',
    'answers': answers,
    'questions': [
      {
        'id': 'q',
        'text': '1 + 1?',
        'options': ['Two', 'Three'],
      },
    ],
  };
  @override
  Future<Map<String, dynamic>> controlExam(
    String attemptId, {
    required String action,
    String? reason,
    Map<String, int>? answers,
  }) async {
    calls.add('$action:${reason ?? ''}');
    if (offline) throw Exception('Offline');
    if (action == 'pause') status = 'paused';
    if (action == 'save' && status == 'active') {
      this.answers.addAll(answers ?? {});
    }
    return response();
  }
}

class _TeacherApi extends TeacherApiService {
  _TeacherApi() : super(ApiClient());
  String? resumed;
  @override
  Future<Map<String, dynamic>> getExamStudents(String testId) async => {
    'students': [
      {
        'studentId': 'a',
        'name': 'Asha',
        'status': resumed == 'a' ? 'active' : 'paused',
        'incidentCount': 1,
        'lastReason': 'app_background',
      },
      {
        'studentId': 'b',
        'name': 'Banu',
        'status': 'active',
        'incidentCount': 0,
      },
    ],
  };
  @override
  Future<Map<String, dynamic>> resumeExamStudent(
    String testId,
    String studentId,
  ) async {
    resumed = studentId;
    return {'success': true};
  }
}

void main() {
  tearDown(() => AppColors.isDark = false);
  Future<void> start(WidgetTester tester, _Api api, {bool dark = false}) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith(_Session.new),
          studentApiServiceProvider.overrideWithValue(api),
        ],
        child: MaterialApp(
          theme: dark ? ThemeData.dark() : ThemeData.light(),
          initialRoute: '/exam',
          routes: {
            '/': (_) => const Scaffold(body: Text('Student home')),
            '/exam': (_) => const TestTakingScreen(
              test: TestItem(
                id: 'test-a',
                title: 'Maths exam',
                subject: 'Mathematics',
                strictMode: true,
              ),
            ),
          },
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('Strict mock exam'), findsOneWidget);
    await tester.tap(find.text('Start exam'));
    await tester.pumpAndSettle();
  }

  for (final dark in [false, true]) {
    testWidgets(
      'background pause blocks answers, retains saved work and teacher resume restores input ($dark)',
      (tester) async {
        final api = _Api();
        await start(tester, api, dark: dark);
        await tester.tap(find.text('Two'));
        await tester.pumpAndSettle();
        expect(api.answers, {'q': 0});
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.inactive,
        );
        await tester.pumpAndSettle();
        expect(find.text('Test paused'), findsOneWidget);
        expect(find.text('Three'), findsNothing);
        expect(api.calls, contains('pause:app_background'));
        expect(find.textContaining('Time remaining:'), findsOneWidget);
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
        await tester.pumpAndSettle();
        expect(find.text('Test paused'), findsOneWidget);
        api.status = 'active';
        await tester.pump(const Duration(seconds: 5));
        await tester.pumpAndSettle();
        expect(find.text('Three'), findsOneWidget);
        expect(api.answers, {'q': 0});
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
  testWidgets(
    'back navigation records an individual incident and cannot bypass the test',
    (tester) async {
      final api = _Api();
      await start(tester, api);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Test paused'), findsOneWidget);
      expect(api.calls, contains('pause:left_test'));
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'offline answers remain locked until pending pause reaches the server',
    (tester) async {
      final api = _Api();
      await start(tester, api);
      api.offline = true;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      expect(api.pendingExamIncidents['attempt-a'], 'app_background');
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(find.text('Test paused'), findsOneWidget);
      api.offline = false;
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      expect(api.status, 'paused');
      expect(api.pendingExamIncidents, isEmpty);
      expect(find.text('Test paused'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('scheduled Tutor lock applies without starting a test', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          examAccessProvider.overrideWith(
            (ref) => Stream.value(
              const ExamAccess(
                exams: [
                  {'title': 'Annual practice'},
                ],
              ),
            ),
          ),
        ],
        child: const MaterialApp(home: StudentAiTutorScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('AI Tutor is unavailable'), findsOneWidget);
    expect(find.text('Annual practice'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'teacher monitor identifies the paused student and resumes only that account on a narrow dark screen',
    (tester) async {
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = _TeacherApi();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [teacherApiServiceProvider.overrideWithValue(api)],
          child: MaterialApp(
            theme: ThemeData.dark(),
            home: const Scaffold(
              body: SingleChildScrollView(
                child: StrictExamStudents(testId: 'test-a'),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Exam monitor · 1 paused'));
      await tester.pumpAndSettle();
      expect(find.textContaining('not proof of cheating'), findsOneWidget);
      expect(find.text('Resume Banu'), findsNothing);
      await tester.tap(find.text('Resume Asha'));
      await tester.pumpAndSettle();
      expect(api.resumed, 'a');
      expect(find.text('Exam monitor · 0 paused'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}

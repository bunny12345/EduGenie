import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/homework_item.dart';
import 'package:mobile/models/test_item.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/screens/student/homework/homework_screen.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/student_api_service.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/theme/app_theme.dart';

class _Session extends SessionNotifier {
  @override
  Future<Session?> build() async =>
      const Session(role: 'student', userId: 'student-a', token: 'fixture');
}

class _HomeworkApi extends StudentApiService {
  _HomeworkApi() : super(ApiClient());
  String? submittedId;
  String? answer;
  String? startedTest;
  String? reviewedTest;

  @override
  Future<Map<String, dynamic>> startTest(
    String testId,
    String studentId,
  ) async {
    startedTest = testId;
    return {
      'attemptId': 'attempt-a',
      'questions': [
        {
          'id': 'q',
          'text': 'What is one half of four?',
          'options': ['Two', 'Three'],
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> getTestReview(
    String testId,
    String studentId,
  ) async {
    reviewedTest = testId;
    return {
      'perQuestionFeedback': [
        {
          'text': 'Earlier question',
          'options': ['Two', 'Three'],
          'selectedOption': 0,
          'correctOption': 0,
          'isCorrect': true,
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> submitHomework(
    String homeworkId,
    String studentId, {
    String? answerText,
    List<String> attachmentUrls = const [],
  }) async {
    submittedId = homeworkId;
    answer = answerText;
    return {'success': true, 'grade': 80};
  }
}

void main() {
  testWidgets(
    'Mock Tests keeps scheduled, expired, completed review and Start behavior',
    (tester) async {
      tester.view.physicalSize = const Size(390, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = _HomeworkApi();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            sessionProvider.overrideWith(_Session.new),
            studentApiServiceProvider.overrideWithValue(api),
            studentSubjectsProvider.overrideWith((ref) => ['Mathematics']),
            homeworkProvider.overrideWith((ref) async => []),
            testsProvider.overrideWith(
              (ref) async => [
                const TestItem(
                  id: 'done',
                  title: 'Completed exam',
                  subject: 'Mathematics',
                  attempted: true,
                  lastScore: 100,
                ),
                TestItem(
                  id: 'future',
                  title: 'Future exam',
                  subject: 'Mathematics',
                  windowStatus: 'scheduled',
                  startAt: DateTime(2030),
                ),
                const TestItem(
                  id: 'past',
                  title: 'Past exam',
                  subject: 'Mathematics',
                  windowStatus: 'expired',
                ),
                const TestItem(
                  id: 'open',
                  title: 'Open exam',
                  subject: 'Mathematics',
                  windowStatus: 'open',
                ),
              ],
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.dark(),
            home: const HomeworkScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await ProviderScope.containerOf(
        tester.element(find.byType(HomeworkScreen)),
      ).read(sessionProvider.future);
      await tester.tap(find.widgetWithText(ElevatedButton, 'Mock Tests'));
      await tester.pumpAndSettle();
      expect(find.text('Expired'), findsOneWidget);
      expect(find.textContaining('Opens '), findsOneWidget);
      final review = find.text('Completed (100%) ▾ Review');
      await tester.scrollUntilVisible(
        review,
        120,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(review);
      await tester.pumpAndSettle();
      expect(api.reviewedTest, 'done');
      expect(find.text('1. Earlier question'), findsOneWidget);
      expect(find.text('Start'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Start'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Start'));
      await tester.pumpAndSettle();
      expect(api.startedTest, 'open');
      expect(find.text('Two'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  for (final dark in [false, true]) {
    for (final width in [320.0, 390.0]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets(
          'task tabs, actions and drafts work at $width / $scale / dark=$dark',
          (tester) async {
            tester.view.physicalSize = Size(width, 844);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            await tester.pumpWidget(
              ProviderScope(
                overrides: [
                  studentSubjectsProvider.overrideWith(
                    (ref) => ['Mathematics', 'Science'],
                  ),
                  homeworkProvider.overrideWith(
                    (ref) async => const [
                      HomeworkItem(
                        id: 'pending',
                        title: 'Fractions practice',
                        subject: 'Mathematics',
                        note: 'Explain each step.',
                      ),
                      HomeworkItem(
                        id: 'science',
                        title: 'Plant worksheet',
                        subject: 'Science',
                      ),
                    ],
                  ),
                  testsProvider.overrideWith(
                    (ref) async => [
                      TestItem(
                        id: 'test',
                        title: 'Fractions mock exam',
                        subject: 'Mathematics',
                        windowStatus: 'scheduled',
                        startAt: DateTime(2030),
                      ),
                    ],
                  ),
                ],
                child: MaterialApp(
                  theme: dark ? AppTheme.dark() : AppTheme.light(),
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
            expect(find.text('Fractions practice'), findsOneWidget);
            expect(find.text('Fractions mock exam'), findsNothing);
            final homeworkTab = find.widgetWithText(ElevatedButton, 'Homework');
            final testsTab = find.widgetWithText(ElevatedButton, 'Mock Tests');
            expect(tester.getRect(testsTab).right, lessThanOrEqualTo(width));
            expect(
              tester.widget<ElevatedButton>(testsTab).onPressed,
              isNotNull,
            );
            await tester.scrollUntilVisible(
              find.text('View instructions'),
              100,
              scrollable: find.byType(Scrollable).first,
            );
            await tester.pumpAndSettle();
            await tester.tap(find.text('View instructions'));
            await tester.pumpAndSettle();
            expect(find.text('Explain each step.'), findsOneWidget);
            await tester.scrollUntilVisible(
              find.byType(TextField),
              100,
              scrollable: find.byType(Scrollable).first,
            );
            await tester.pumpAndSettle();
            await tester.enterText(find.byType(TextField), 'Keep this draft');
            await tester.tap(testsTab);
            await tester.pumpAndSettle();
            expect(find.text('Fractions mock exam'), findsOneWidget);
            expect(find.text('Fractions practice'), findsNothing);
            expect(find.byType(TextField), findsNothing);
            await tester.tap(homeworkTab);
            await tester.pumpAndSettle();
            expect(
              tester.widget<TextField>(find.byType(TextField)).controller!.text,
              'Keep this draft',
            );
            expect(find.text('Hide instructions'), findsOneWidget);
            expect(tester.takeException(), isNull);
            await tester.pumpWidget(const SizedBox.shrink());
          },
        );
      }
    }
  }

  testWidgets(
    'filters, history, subject selection and submission retain their behavior',
    (tester) async {
      tester.view.physicalSize = const Size(390, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = _HomeworkApi();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            sessionProvider.overrideWith(_Session.new),
            studentApiServiceProvider.overrideWithValue(api),
            studentSubjectsProvider.overrideWith(
              (ref) => ['Mathematics', 'Science'],
            ),
            homeworkProvider.overrideWith(
              (ref) async => const [
                HomeworkItem(
                  id: 'pending',
                  title: 'Fractions practice',
                  subject: 'Mathematics',
                  note: 'Explain each step.',
                ),
                HomeworkItem(
                  id: 'done',
                  title: 'Submitted worksheet',
                  subject: 'Mathematics',
                  status: 'submitted',
                  submittedAt: '2026-01-01T10:00:00Z',
                  latestAnswerText: 'Saved answer',
                ),
                HomeworkItem(
                  id: 'science',
                  title: 'Plant worksheet',
                  subject: 'Science',
                ),
              ],
            ),
            testsProvider.overrideWith((ref) async => []),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const HomeworkScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await ProviderScope.containerOf(
        tester.element(find.byType(HomeworkScreen)),
      ).read(sessionProvider.future);
      await tester.tap(find.text('Submitted: 1'));
      await tester.pumpAndSettle();
      expect(find.text('Fractions practice'), findsNothing);
      await tester.scrollUntilVisible(
        find.text('View submission'),
        100,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('View submission'));
      await tester.pumpAndSettle();
      expect(find.text('Saved answer'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('All: 2'),
        -150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('All: 2'));
      await tester.tap(find.text('Open history'));
      await tester.pumpAndSettle();
      expect(find.text('📅 View history by date'), findsOneWidget);
      await tester.tap(find.text('Hide history'));
      await tester.pumpAndSettle();
      expect(find.text('📅 View history by date'), findsNothing);
      await tester.tap(find.text('Science').first);
      await tester.pumpAndSettle();
      expect(find.text('Plant worksheet'), findsOneWidget);
      expect(find.text('Fractions practice'), findsNothing);
      await tester.tap(find.text('Mathematics').first);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byType(TextField),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'My complete answer');
      await tester.scrollUntilVisible(
        find.text('Submit'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();
      expect(api.submittedId, 'pending');
      expect(api.answer, 'My complete answer');
      expect(tester.takeException(), isNull);
    },
  );

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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/dashboard.dart';
import 'package:mobile/models/flashcard_models.dart';
import 'package:mobile/models/game_catalog_entry.dart';
import 'package:mobile/models/homework_item.dart';
import 'package:mobile/models/quiz_rush_models.dart';
import 'package:mobile/models/test_item.dart';
import 'package:mobile/screens/student/games/flashcards_screen.dart';
import 'package:mobile/screens/student/games/game_widgets.dart';
import 'package:mobile/screens/student/games/memory_maze_screen.dart';
import 'package:mobile/screens/student/games/quiz_rush_screen.dart';
import 'package:mobile/screens/student/homework/homework_history_calendar.dart';
import 'package:mobile/screens/student/homework/homework_screen.dart';
import 'package:mobile/screens/student/student_games_screen.dart';
import 'package:mobile/screens/student/test_taking_screen.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/student_api_service.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/theme/app_colors.dart';
import 'package:mobile/theme/subject_background.dart';

const _subject = 'Science';
const _chapter = 'Plants';

class _Api extends StudentApiService {
  _Api() : super(ApiClient());

  @override
  Future<List<FlashcardSubject>> getFlashcardOverview(String studentId) async =>
      [
        FlashcardSubject.fromJson({
          'subjectKey': 'science',
          'displayName': 'Sci',
          'accent': '#10B981',
          'totalCards': 3,
          'chapters': [
            {'deckId': 'deck', 'title': _chapter, 'cardCount': 3},
          ],
        }),
      ];

  @override
  Future<List<FlashcardCard>> getFlashcardCards(
    String studentId, {
    required String subject,
    String? deckId,
    String scope = 'all',
    String mode = 'review',
    int limit = 20,
  }) async => [
    for (var i = 0; i < 3; i++)
      FlashcardCard(
        flashcardId: '$i',
        deckId: 'deck',
        front: 'Question $i?',
        back: 'Answer $i',
        hint: 'Think of plants',
        difficulty: 'easy',
      ),
  ];

  @override
  Future<List<QuizRushSubject>> getQuizRushOverview(String studentId) async => [
    QuizRushSubject.fromJson({
      'subjectKey': 'science',
      'displayName': 'Sci',
      'accent': '#10B981',
      'totalQuestions': 3,
      'empty': true,
      'chapters': [
        {'deckId': 'deck', 'title': _chapter, 'questionCount': 3},
      ],
    }),
  ];

  @override
  Future<List<QuizRushQuestion>> getQuizRushQuestions(
    String studentId, {
    required String subject,
    String? deckId,
    String scope = 'all',
    int limit = 10,
  }) async => [
    for (var i = 0; i < 3; i++)
      QuizRushQuestion(
        questionId: '$i',
        deckId: 'deck',
        question: 'Quiz question $i?',
        options: ['Correct', 'Wrong'],
        correctIndex: 0,
        explanation: 'Plants need sunlight.',
        difficulty: 'easy',
      ),
  ];

  @override
  Future<Map<String, dynamic>> startTest(
    String testId,
    String studentId,
  ) async => {
    'attemptId': 'attempt',
    'questions': [
      {
        'id': 'q',
        'text': 'Test question?',
        'options': ['One', 'Two'],
      },
    ],
  };

  @override
  Future<Map<String, dynamic>> submitTestAttempt(
    String attemptId,
    String studentId,
    Map<String, int> answers,
  ) async => {
    'score': 0,
    'feedback': 'Keep practising.',
    'perQuestionFeedback': [
      {
        'text': 'Test question?',
        'options': ['One', 'Two'],
        'selectedOption': 1,
        'correctOption': 0,
        'isCorrect': false,
      },
    ],
  };
}

ThemeData _theme(bool dark) {
  final palette = AppPalette(dark);
  return ThemeData(
    brightness: dark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: palette.background,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.brand,
      brightness: dark ? Brightness.dark : Brightness.light,
      surface: palette.card,
    ),
  );
}

Widget _app(Widget child, ValueNotifier<bool> dark) => ProviderScope(
  overrides: [
    studentApiServiceProvider.overrideWithValue(_Api()),
    studentSubjectsProvider.overrideWith((ref) => [_subject]),
    homeworkProvider.overrideWith(
      (ref) async => const [
        HomeworkItem(
          id: 'hw',
          title: 'Plant homework',
          subject: _subject,
          status: 'pending',
          note: 'Explain photosynthesis.',
          grade: 80,
          feedback: 'Explain the final step.',
        ),
      ],
    ),
    testsProvider.overrideWith((ref) async => []),
    dashboardProvider.overrideWith((ref) async => const DashboardData()),
    gamesCatalogProvider.overrideWith(
      (ref) async => [
        GameCatalogEntry(
          gameKey: 'flashcards',
          title: 'AI Flashcards',
          tagline: 'Learn with cards.',
          icon: '🃏',
          accent: const Color(0xFF10B981),
          status: 'live',
        ),
      ],
    ),
  ],
  child: ValueListenableBuilder<bool>(
    valueListenable: dark,
    child: child,
    builder: (context, isDark, child) =>
        MaterialApp(theme: _theme(isDark), home: child),
  ),
);

double _contrast(Color foreground, Color background) {
  final a = foreground.computeLuminance();
  final b = background.computeLuminance();
  return (a > b ? a + .05 : b + .05) / (a > b ? b + .05 : a + .05);
}

void _readable(WidgetTester tester, Finder finder) {
  expect(finder, findsWidgets);
  for (final element in finder.evaluate()) {
    final text = element.widget as Text;
    final foreground = DefaultTextStyle.of(
      element,
    ).style.merge(text.style).color!;
    var backgrounds = <Color>[Colors.transparent];
    element.visitAncestorElements((ancestor) {
      final widget = ancestor.widget;
      final decoration = widget is Container ? widget.decoration : null;
      final surfaces = decoration is BoxDecoration
          ? decoration.gradient?.colors ??
                (decoration.color == null ? null : [decoration.color!])
          : widget is Material && widget.color != null
          ? [widget.color!]
          : widget is Scaffold
          ? [
              widget.backgroundColor ??
                  Theme.of(ancestor).scaffoldBackgroundColor,
            ]
          : null;
      if (surfaces != null) {
        backgrounds = [
          for (final inner in backgrounds)
            for (final outer in surfaces) Color.alphaBlend(inner, outer),
        ];
      }
      return backgrounds.any((c) => c.a < 1);
    });
    for (final background in backgrounds) {
      expect(
        _contrast(foreground, background),
        greaterThanOrEqualTo(4.5),
        reason: '${text.data}: $foreground on $background',
      );
    }
  }
}

Future<void> _toggle(
  WidgetTester tester,
  ValueNotifier<bool> dark,
  bool value,
) async {
  dark.value = value;
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => AppColors.isDark = false);

  testWidgets('hub and const game controls respond to inherited brightness', (
    tester,
  ) async {
    final dark = ValueNotifier(false);
    addTearDown(dark.dispose);
    await tester.pumpWidget(_app(const StudentGamesScreen(), dark));
    await tester.pumpAndSettle();
    expect(
      tester.widget<Text>(find.text('AI Flashcards')).style!.color,
      const Color(0xFF26224F),
    );
    await _toggle(tester, dark, true);
    for (final text in [
      'Learning Arcade 🎮',
      'AI Flashcards',
      'Learn with cards.',
      '▶ Play',
    ]) {
      _readable(tester, find.text(text));
    }
    expect(
      tester.widget<Scaffold>(find.byType(Scaffold)).backgroundColor,
      AppColors.backgroundDark,
    );
    await tester.pumpWidget(
      _app(
        Scaffold(
          body: Column(
            children: [
              const GamePickerHeader(title: 'Choose', subtitle: 'A chapter'),
              GameChapterRow(
                accent: const Color(0xFF10B981),
                title: 'Plants',
                chapterNumber: 1,
                badges: [GameBadge(text: 'Due', kind: GameBadgeKind.due)],
                onTap: () {},
              ),
              GameGhostButton(label: 'Exit', onTap: () {}),
            ],
          ),
        ),
        dark,
      ),
    );
    await tester.pumpAndSettle();
    for (final text in ['Choose', 'A chapter', 'Plants', '1', 'Due', 'Exit']) {
      _readable(tester, find.text(text));
    }
    await _toggle(tester, dark, false);
    expect(
      tester.widget<Text>(find.text('Choose')).style!.color,
      const Color(0xFF2A2652),
    );
  });

  testWidgets('calendar keeps selected white text and readable neutral days', (
    tester,
  ) async {
    final dark = ValueNotifier(true);
    addTearDown(dark.dispose);
    await tester.pumpWidget(
      _app(
        Scaffold(
          body: HomeworkHistoryCalendar(
            allHomework: const [
              HomeworkItem(
                id: 'done',
                title: 'Done',
                subject: _subject,
                status: 'submitted',
                submitted: true,
                submittedAt: '2026-01-01',
                startAt: '2026-01-01',
              ),
              HomeworkItem(
                id: 'pending',
                title: 'Pending',
                subject: _subject,
                status: 'pending',
                startAt: '2026-01-02',
              ),
            ],
            year: 2026,
            month: 0,
            selectedDate: '2026-01-01',
            onPrevMonth: () {},
            onNextMonth: () {},
            onSelectDate: (_) {},
          ),
        ),
        dark,
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.widget<Text>(find.text('1')).style!.color, Colors.white);
    for (final text in [
      'January 2026',
      '1',
      '2',
      '3',
      'All submitted',
      'Not submitted',
      'No homework',
    ]) {
      _readable(tester, find.text(text));
    }
    await _toggle(tester, dark, false);
    expect(
      tester.widget<Text>(find.text('3')).style!.color,
      const Color(0xFF374151),
    );
  });

  testWidgets(
    'homework retains draft and expanded feedback across theme toggle',
    (tester) async {
      tester.view.physicalSize = const Size(650, 2000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final dark = ValueNotifier(false);
      addTearDown(dark.dispose);
      await tester.pumpWidget(_app(const HomeworkScreen(), dark));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'My draft answer');
      await tester.tap(find.text('Show feedback'));
      await _toggle(tester, dark, true);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'My draft answer',
      );
      for (final text in [
        'Plant homework',
        'Your written answer',
        'Teacher feedback',
        'Explain the final step.',
        'Grade: 80/100',
        'Submit',
      ]) {
        _readable(tester, find.text(text));
      }
      await _toggle(tester, dark, false);
      expect(find.text('Hide feedback'), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'My draft answer',
      );
    },
  );

  testWidgets(
    'flashcard faces and ratings stay readable without resetting play',
    (tester) async {
      final dark = ValueNotifier(false);
      addTearDown(dark.dispose);
      await tester.pumpWidget(_app(const FlashcardsScreen(), dark));
      await tester.pumpAndSettle();
      await tester.tap(find.text(_chapter));
      await tester.pumpAndSettle();
      await _toggle(tester, dark, true);
      for (final text in [
        'Question 0?',
        'QUESTION',
        'EASY',
        '💡 Think of plants',
        'Tap to reveal',
      ]) {
        _readable(tester, find.text(text));
      }
      await tester.tap(find.text('Show answer'));
      await tester.pumpAndSettle();
      for (final text in [
        'Answer 0',
        'ANSWER',
        '🤖 Ask AI to explain',
        'Again',
        'Got it',
        'Easy',
      ]) {
        _readable(tester, find.text(text));
      }
      await _toggle(tester, dark, false);
      expect(find.text('Answer 0'), findsOneWidget);
      expect(
        tester.widget<Text>(find.text('Answer 0')).style!.color,
        const Color(0xFF26224F),
      );
    },
  );

  testWidgets('Quiz Rush pairs correct and wrong colors on dark surfaces', (
    tester,
  ) async {
    final dark = ValueNotifier(true);
    addTearDown(dark.dispose);
    await tester.pumpWidget(_app(const QuizRushScreen(), dark));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_chapter));
    await tester.pumpAndSettle();
    _readable(tester, find.text('Quiz question 0?'));
    await tester.tap(find.text('Wrong'));
    await tester.pump();
    _readable(tester, find.text('Correct'));
    _readable(tester, find.text('Wrong'));
    _readable(tester, find.text('💡 Plants need sunlight.'));
    dark.value = false;
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    expect(find.text('Quiz question 0?'), findsOneWidget);
    expect(
      tester.widget<Text>(find.text('Wrong')).style!.color,
      const Color(0xFFB33A32),
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Memory Maze keeps saturated hidden tiles and revealed state', (
    tester,
  ) async {
    final dark = ValueNotifier(false);
    addTearDown(dark.dispose);
    await tester.pumpWidget(_app(const MemoryMazeScreen(), dark));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_chapter));
    await tester.pumpAndSettle();
    final hiddenTile = find.text('🌀').first;
    BoxDecoration tileDecoration() =>
        tester
                .widget<Container>(
                  find
                      .ancestor(
                        of: hiddenTile,
                        matching: find.byType(Container),
                      )
                      .first,
                )
                .decoration!
            as BoxDecoration;
    final gradient = tileDecoration().gradient!.colors;
    await _toggle(tester, dark, true);
    expect(tileDecoration().gradient!.colors, gradient);
    await tester.tap(hiddenTile);
    await tester.pumpAndSettle();
    final revealed = find.textContaining(
      RegExp(r'^(Question \d\?|Answer \d)$'),
    );
    _readable(tester, revealed);
    final text = tester.widget<Text>(revealed).data;
    await _toggle(tester, dark, false);
    expect(find.text(text!), findsOneWidget);
  });

  testWidgets('test answers survive toggle and result breakdown is readable', (
    tester,
  ) async {
    final dark = ValueNotifier(false);
    addTearDown(dark.dispose);
    await tester.pumpWidget(
      _app(
        const TestTakingScreen(
          test: TestItem(id: 'test', title: 'Practice', subject: _subject),
        ),
        dark,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Two'));
    await _toggle(tester, dark, true);
    _readable(tester, find.text('Test question?'));
    expect(
      tester.widget<RadioGroup<int>>(find.byType(RadioGroup<int>)).groupValue,
      1,
    );
    await tester.tap(find.text('Review & Submit'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();
    for (final text in [
      '0%',
      'Keep practising.',
      'Question breakdown',
      '1. Test question?',
      'Your answer: Two ✗',
      'Correct answer: One',
    ]) {
      _readable(tester, find.text(text));
    }
  });

  testWidgets('subject wash repaints only when its visual palette changes', (
    tester,
  ) async {
    final dark = ValueNotifier(false);
    addTearDown(dark.dispose);
    await tester.pumpWidget(
      _app(
        const Scaffold(
          body: Stack(children: [SubjectBackground(subject: _subject)]),
        ),
        dark,
      ),
    );
    final painterFinder = find.descendant(
      of: find.byType(SubjectBackground),
      matching: find.byType(CustomPaint),
    );
    final lightPainter = tester.widget<CustomPaint>(painterFinder).painter!;
    await _toggle(tester, dark, true);
    final darkPainter = tester.widget<CustomPaint>(painterFinder).painter!;
    expect(darkPainter.shouldRepaint(lightPainter), isTrue);
    await _toggle(tester, dark, false);
    expect(
      tester
          .widget<CustomPaint>(painterFinder)
          .painter!
          .shouldRepaint(lightPainter),
      isFalse,
    );
    expect(subjectBgPalette(_subject).bg, const Color(0xFFEEFBF3));
  });
}

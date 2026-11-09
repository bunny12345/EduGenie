import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/dashboard.dart';
import 'package:mobile/models/flashcard_models.dart';
import 'package:mobile/models/game_catalog_entry.dart';
import 'package:mobile/screens/student/games/flashcards_screen.dart';
import 'package:mobile/screens/student/games/game_widgets.dart';
import 'package:mobile/screens/student/student_games_screen.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/student_api_service.dart';
import 'package:mobile/state/student_providers.dart';

const chapterTitle = 'Exploring the Investigative World of Science';
final longQuestion = List.filled(
  12,
  'How can a scientist investigate a surprising observation?',
).join(' ');
final longAnswer =
    '${List.filled(20, 'Investigation involves designing experiments, recording observations, and improving explanations.').join(' ')} END OF ANSWER';

class _Api extends StudentApiService {
  _Api() : super(ApiClient());

  @override
  Future<List<FlashcardSubject>> getFlashcardOverview(String studentId) async =>
      [
        FlashcardSubject.fromJson({
          'subjectKey': 'science',
          'displayName': 'Science',
          'totalCards': 1,
          'dueCount': 1,
          'chapters': [
            {
              'deckId': 'deck',
              'chapterId': 'chapter',
              'title': chapterTitle,
              'chapterNumber': 1,
              'cardCount': 1,
              'dueCount': 1,
            },
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
    FlashcardCard(
      flashcardId: 'card',
      deckId: 'deck',
      front: longQuestion,
      back: longAnswer,
      hint: 'Consider a controlled experiment.',
      difficulty: 'medium',
    ),
  ];
}

void main() {
  for (final width in [320.0, 390.0]) {
    for (final scale in [1.0, 1.5, 2.0]) {
      testWidgets('game hub and play header fit $width at scale $scale', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        Widget app(Widget child) => MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: child,
        );
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              dashboardProvider.overrideWith(
                (ref) async => DashboardData.fromJson({}),
              ),
              gamesCatalogProvider.overrideWith(
                (ref) async => [
                  for (final title in [
                    'AI Flashcards',
                    'Quiz Rush',
                    'Match Up',
                    'Memory Maze',
                  ])
                    GameCatalogEntry(
                      gameKey: title,
                      title: title,
                      tagline:
                          'Play a learning challenge with detailed questions and explanations.',
                      icon: '🎮',
                      accent: Colors.purple,
                      status: title == 'Match Up' ? 'soon' : 'live',
                    ),
                ],
              ),
            ],
            child: app(const StudentGamesScreen()),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(
          app(
            Scaffold(
              body: Padding(
                padding: const EdgeInsets.all(16),
                child: GamePlayHeader(
                  treeEmoji: '🌳',
                  subjectName: 'Science',
                  chapterTitle: chapterTitle,
                  onExit: () {},
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text(chapterTitle), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets(
        'long flashcards scroll without covering controls at $width scale $scale',
        (tester) async {
          tester.view.physicalSize = Size(width, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          await tester.pumpWidget(
            ProviderScope(
              overrides: [studentApiServiceProvider.overrideWithValue(_Api())],
              child: MaterialApp(
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(
                    context,
                  ).copyWith(textScaler: TextScaler.linear(scale)),
                  child: child!,
                ),
                home: const FlashcardsScreen(),
              ),
            ),
          );
          await tester.pumpAndSettle();
          await tester.scrollUntilVisible(
            find.text(chapterTitle),
            150,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.pumpAndSettle();
          await tester.tap(find.text(chapterTitle));
          await tester.pumpAndSettle();
          expect(find.text(longQuestion), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.scrollUntilVisible(
            find.text('Show answer'),
            150,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.pumpAndSettle();
          await tester.tap(find.text('Show answer'));
          await tester.pumpAndSettle();
          expect(find.text(longAnswer), findsOneWidget);
          final scroll = find.ancestor(
            of: find.text(longAnswer),
            matching: find.byType(SingleChildScrollView),
          );
          expect(scroll, findsOneWidget);
          await tester.drag(scroll, const Offset(0, -250));
          await tester.pumpAndSettle();
          final scrollState = tester.state<ScrollableState>(
            find.descendant(of: scroll, matching: find.byType(Scrollable)),
          );
          expect(scrollState.position.pixels, greaterThan(0));
          scrollState.position.jumpTo(scrollState.position.maxScrollExtent);
          await tester.pumpAndSettle();
          final answerArea = tester.getRect(scroll);
          expect(
            tester.getRect(find.text(longAnswer)).bottom,
            lessThanOrEqualTo(answerArea.bottom + 1),
          );
          final help = tester.getRect(find.text('🤖 Ask AI to explain'));
          expect(answerArea.bottom, lessThanOrEqualTo(help.top));
          expect(find.text('Again'), findsOneWidget);
          expect(find.text('Got it'), findsOneWidget);
          expect(find.text('Easy'), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }
  }
}

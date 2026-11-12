import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/dashboard.dart';
import 'package:mobile/models/interactive_learning.dart';
import 'package:mobile/models/orchard_data.dart';
import 'package:mobile/screens/student/orchard/orchard_tree_detail_screen.dart';
import 'package:mobile/screens/student/orchard/retention_check_modal.dart';
import 'package:mobile/screens/student/student_orchard_screen.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/chat_api_service.dart';
import 'package:mobile/services/student_api_service.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/state/tutor_providers.dart';
import 'package:mobile/theme/app_colors.dart';
import 'package:mobile/widgets/orchard/orchard_colors.dart';

final _chapter = OrchardChapter.fromJson({
  'chapterId': 'plants',
  'title': 'Plants',
  'stageLabel': 'Blossom',
  'dueReview': 'week',
  'milestones': {
    'lesson_watched': true,
    'question_asked': true,
    'story_done': true,
  },
});

final _trees = [
  for (final (subject, health, stage, accent) in [
    ('Science', 'healthy', 'golden_fruit', '#10B981'),
    ('Maths', 'thirsty', 'sprout', '#5B47FF'),
    ('English', 'wilting', 'seed', '#F59E0B'),
  ])
    OrchardTree.fromJson({
      'subjectKey': subject.toLowerCase(),
      'subject': subject,
      'health': health,
      'stage': stage,
      'accentColor': accent,
      'progressPct': 60,
      'dueReviewCount': 1,
    }),
];

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
    textTheme: ThemeData(
      brightness: dark ? Brightness.dark : Brightness.light,
    ).textTheme.apply(bodyColor: palette.text, displayColor: palette.text),
  );
}

Widget _app(Widget home, ValueNotifier<bool> dark, {bool empty = false}) {
  return ProviderScope(
    overrides: [
      dashboardProvider.overrideWith((ref) async => const DashboardData()),
      orchardProvider.overrideWith(
        (ref) async => OrchardData(
          profile: const OrchardProfile(waterDrops: 123, harvest: 17),
          overallProgress: 64,
          trees: empty ? [] : _trees,
        ),
      ),
      orchardTreeProvider('science').overrideWith(
        (ref) async => OrchardTreeDetailData(
          subjectKey: 'science',
          subject: 'Science',
          accentColor: const Color(0xFF10B981),
          chapters: empty
              ? []
              : [
                  _chapter,
                  OrchardChapter.fromJson({
                    'chapterId': 'gold',
                    'title': 'Golden lesson',
                    'chapterNumber': 2,
                    'isGolden': true,
                    'stageLabel': 'Golden Fruit',
                  }),
                ],
        ),
      ),
      chatApiServiceProvider.overrideWithValue(_Chat()),
      studentApiServiceProvider.overrideWithValue(_Student()),
    ],
    child: ValueListenableBuilder<bool>(
      valueListenable: dark,
      child: home,
      builder: (context, isDark, child) =>
          MaterialApp(theme: _theme(isDark), home: child),
    ),
  );
}

double _contrast(Color a, Color b) {
  final x = a.computeLuminance();
  final y = b.computeLuminance();
  return x > y ? (x + .05) / (y + .05) : (y + .05) / (x + .05);
}

void _expectContrast(WidgetTester tester, Finder finder) {
  expect(finder, findsWidgets);
  for (final element in finder.evaluate()) {
    final text = element.widget as Text;
    final foreground = DefaultTextStyle.of(
      element,
    ).style.merge(text.style).color!;
    List<Color>? surfaces;
    element.visitAncestorElements((ancestor) {
      final widget = ancestor.widget;
      final decoration = widget is Container ? widget.decoration : null;
      if (decoration is BoxDecoration) {
        if (decoration.gradient != null) {
          surfaces = decoration.gradient!.colors;
        } else if (decoration.color != null) {
          surfaces = [decoration.color!];
        }
      }
      return surfaces == null;
    });
    final backgrounds = surfaces ?? [Theme.of(element).scaffoldBackgroundColor];
    for (final background in backgrounds) {
      // The only translucent text panel is a white health badge.
      final opaque = Color.alphaBlend(background, AppColors.cardLight);
      expect(
        _contrast(foreground, opaque),
        greaterThanOrEqualTo(4.5),
        reason: '${text.data}: $foreground on $opaque',
      );
    }
  }
}

Future<void> _pump(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
  await tester.pump(const Duration(milliseconds: 350));
}

void main() {
  tearDown(() => AppColors.isDark = false);

  testWidgets('Orchard surfaces update on a live theme toggle', (tester) async {
    tester.view.physicalSize = const Size(600, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final dark = ValueNotifier(false);
    addTearDown(dark.dispose);
    await tester.pumpWidget(_app(const StudentOrchardScreen(), dark));
    await _pump(tester);
    for (final isDark in [false, true, false]) {
      // Deliberately stale: inherited Theme, not the global, must drive colors.
      AppColors.isDark = !isDark;
      dark.value = isDark;
      await _pump(tester);
      for (final label in [
        'Water Drops',
        'Sunshine',
        'Harvest',
        '123',
        '17',
        'Your Learning Orchard',
        'Overall Progress',
        '64%',
        '🌳 Science',
        '🌳 Maths',
        '🌳 English',
        '💧 Thirsty',
        '🍂 Needs care',
        'Explore tree →',
        'Tree Needs',
        'Water',
        'Sunlight',
        'Fertilizer',
        'Orchard Calendar',
        "Today's Missions",
        'Orchard Growth',
        '📝 Take a mock test',
        '+20 💧',
        '● Science',
      ]) {
        _expectContrast(tester, find.text(label));
      }
      final counter = find
          .ancestor(
            of: find.text('Water Drops'),
            matching: find.byType(Container),
          )
          .first;
      expect(
        (tester.widget<Container>(counter).decoration! as BoxDecoration).color,
        AppPalette(isDark).card,
      );
      final context = tester.element(find.byType(StudentOrchardScreen));
      final palette = AppColors.of(context);
      final orchard = OrchardColors(context);
      for (final surface in [
        palette.card,
        palette.brandSoft,
        orchard.inset,
        orchard.golden,
        orchard.positive,
        orchard.caution,
        ...orchard.hero,
      ]) {
        expect(_contrast(palette.text, surface), greaterThanOrEqualTo(4.5));
        expect(
          _contrast(
            orchard.accentText(palette.muted, surface: surface),
            surface,
          ),
          greaterThanOrEqualTo(4.5),
        );
      }
      for (final accent in [
        AppColors.brand,
        const Color(0xFF10B981),
        const Color(0xFFF59E0B),
      ]) {
        expect(
          _contrast(orchard.accentText(accent), palette.card),
          greaterThanOrEqualTo(4.5),
        );
      }
    }
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final isDark in [false, true]) {
    testWidgets('Tree detail and milestones contrast (dark=$isDark)', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(600, 4000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final dark = ValueNotifier(isDark);
      addTearDown(dark.dispose);
      AppColors.isDark = !isDark;
      await tester.pumpWidget(
        _app(
          const OrchardTreeDetailScreen(
            studentId: 'student',
            subjectKey: 'science',
          ),
          dark,
        ),
      );
      await _pump(tester);
      await tester.tap(find.text('1. Plants'));
      await _pump(tester);
      for (final label in [
        '🌳 Science Tree',
        'Lessons fruited',
        'Golden fruits',
        'Roots (understanding)',
        'Overall growth',
        '1. Plants',
        'Golden Fruit',
        '2. Golden lesson',
        'Blossom · Roots 0%',
        '🌱 Sprout · Understand',
        'Watch the AI lesson',
        '🌿 Young Plant · Practice',
        'Do the homework',
        'Take the check →',
      ]) {
        _expectContrast(tester, find.text(label));
      }
      dark.value = !isDark;
      await _pump(tester);
      _expectContrast(tester, find.text('Blossom · Roots 0%'));
      _expectContrast(tester, find.text('Take the check →'));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });

    for (final passed in [false, true]) {
      testWidgets(
        'Retention options and result contrast (dark=$isDark, pass=$passed)',
        (tester) async {
          final dark = ValueNotifier(isDark);
          addTearDown(dark.dispose);
          AppColors.isDark = !isDark;
          await tester.pumpWidget(
            _app(
              Builder(
                builder: (context) => Scaffold(
                  body: TextButton(
                    onPressed: () => showRetentionCheckModal(
                      context,
                      studentId: 'student',
                      subjectKey: 'science',
                      subjectLabel: 'Science',
                      chapter: _chapter,
                      reviewType: 'week',
                      onDone: () {},
                    ),
                    child: const Text('Open'),
                  ),
                ),
              ),
              dark,
            ),
          );
          await tester.tap(find.text('Open'));
          await tester.pumpAndSettle();
          _expectContrast(tester, find.text('🧠 1-Week Memory Check · Plants'));
          _expectContrast(tester, find.text('Leaves'));
          _expectContrast(tester, find.text('Roots'));
          final rich = tester.widget<RichText>(
            find.byWidgetPredicate(
              (w) => w is RichText && w.text.toPlainText().startsWith('Q1.'),
            ),
          );
          expect(
            _contrast(rich.text.style!.color!, AppPalette(isDark).card),
            greaterThanOrEqualTo(4.5),
          );
          await tester.tap(find.text(passed ? 'Roots' : 'Leaves'));
          await tester.pump();
          _expectContrast(tester, find.text(passed ? 'Roots' : 'Leaves'));
          dark.value = !isDark;
          await _pump(tester);
          _expectContrast(tester, find.text(passed ? 'Roots' : 'Leaves'));
          await tester.tap(find.text('Submit'));
          await tester.pumpAndSettle();
          _expectContrast(
            tester,
            find.textContaining(passed ? '✅ Nice!' : 'below the pass mark'),
          );
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
        },
      );
    }

    testWidgets('Empty Orchard detail remains readable (dark=$isDark)', (
      tester,
    ) async {
      final dark = ValueNotifier(isDark);
      addTearDown(dark.dispose);
      await tester.pumpWidget(
        _app(
          const OrchardTreeDetailScreen(
            studentId: 'student',
            subjectKey: 'science',
          ),
          dark,
          empty: true,
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('No Science lessons yet'));
      _expectContrast(tester, find.text('No Science lessons yet'));
      _expectContrast(tester, find.textContaining('Your school hasn'));
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}

class _Chat extends ChatApiService {
  _Chat() : super(ApiClient());

  @override
  Future<QuizRushSet?> generateQuizRush(
    String studentId,
    Map<String, dynamic> payload,
  ) async => const QuizRushSet(
    quizId: 'retention',
    questions: [
      QuizRushQuestion(
        id: 'q1',
        question: 'Which part absorbs water?',
        options: ['Roots', 'Leaves'],
        correctIndex: 0,
      ),
    ],
  );
}

class _Student extends StudentApiService {
  _Student() : super(ApiClient());

  @override
  Future<Map<String, dynamic>> completeOrchardReview({
    required String studentId,
    required String chapterId,
    required String reviewType,
    required bool passed,
  }) async => {'success': true};
}

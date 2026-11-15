import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/dashboard.dart';
import 'package:mobile/models/homework_item.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/screens/student/homework/homework_screen.dart';
import 'package:mobile/state/quick_sam_provider.dart';
import 'package:mobile/state/exam_access_provider.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/student_navigation_provider.dart';
import 'package:mobile/widgets/quick_sam_bubble.dart';

class _QuickSamStub extends QuickSamNotifier {
  String? sent;
  int closeCalls = 0;

  @override
  void open({String firstName = '', String? homeworkId}) {
    state = QuickSamState(open: true, homeworkId: homeworkId);
  }

  @override
  QuickSamState build() => const QuickSamState(
    open: true,
    followups: ['Explain that in simpler words', 'Give me a real-life example'],
  );

  @override
  Future<void> send(String raw) async {
    sent = raw;
  }

  @override
  Future<void> setSpeechRate(int rate) async {
    state = state.copyWith(speechRate: rate);
  }

  @override
  Future<void> close() async {
    closeCalls++;
    state = const QuickSamState();
  }
}

class _Session extends SessionNotifier {
  @override
  Future<Session?> build() async => const Session(role: 'student', userId: 'student', token: 'fixture', name: 'Learner');
}

void main() {
  for (final blocked in [false, true]) {
    testWidgets('homework help returns to Home and opens Sam only when exam access permits (blocked=$blocked)', (tester) async {
      final notifier = _QuickSamStub();
      await tester.pumpWidget(ProviderScope(
        overrides: [
          sessionProvider.overrideWith(_Session.new),
          quickSamProvider.overrideWith(() => notifier),
          examAccessProvider.overrideWith((ref) => Stream.value(blocked ? const ExamAccess(exams: [{'testId': 'strict'}]) : const ExamAccess())),
          dashboardProvider.overrideWith((ref) async => const DashboardData()),
          studentSubjectsProvider.overrideWith((ref) => ['Mathematics']),
          homeworkProvider.overrideWith((ref) async => const [
            HomeworkItem(id: 'pending', title: 'Fractions practice', subject: 'Mathematics'),
            HomeworkItem(id: 'done', title: 'Completed worksheet', subject: 'Mathematics', status: 'submitted'),
          ]),
          testsProvider.overrideWith((ref) async => []),
        ],
        child: MaterialApp(home: Consumer(builder: (context, ref, _) => Scaffold(
          body: Column(children: [
            Text('Home tab ${ref.watch(studentNavigationProvider)}'),
            ElevatedButton(onPressed: () {
              ref.read(studentNavigationProvider.notifier).select(1);
              Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const HomeworkScreen()));
            }, child: const Text('Open homework from Services')),
          ]),
        ))),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open homework from Services'));
      await tester.pumpAndSettle();
      final help = find.widgetWithText(ElevatedButton, 'Ask Sam');
      expect(help, findsOneWidget);
      expect(tester.widget<ElevatedButton>(help).onPressed != null, !blocked);
      if (blocked) {
        await tester.tap(help);
        await tester.pump();
        expect(find.byType(QuickSamScreen), findsNothing);
        expect(notifier.sent, isNull);
      } else {
        await tester.tap(help);
        await tester.pump(const Duration(milliseconds: 300));
        await tester.pump();
        expect(find.byType(QuickSamScreen), findsOneWidget);
        expect(notifier.sent, homeworkHelpPrompt);
        final container = ProviderScope.containerOf(tester.element(find.byType(QuickSamScreen)));
        expect(container.read(quickSamProvider).homeworkId, 'pending');
        expect(container.read(studentNavigationProvider), 0);
        Navigator.of(tester.element(find.byType(QuickSamScreen))).pop();
        await tester.pump(const Duration(milliseconds: 300));
        await tester.pump();
        expect(find.byType(HomeworkScreen), findsNothing);
        expect(find.text('Home tab 0'), findsOneWidget);
        expect(notifier.closeCalls, greaterThanOrEqualTo(1));
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('a scheduled exam closes an already-open Quick Sam session', (
    tester,
  ) async {
    final access = StreamController<ExamAccess>();
    addTearDown(access.close);
    final notifier = _QuickSamStub();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          examAccessProvider.overrideWith((ref) => access.stream),
          quickSamProvider.overrideWith(() => notifier),
          dashboardProvider.overrideWith(
            (ref) async => DashboardData.fromJson({}),
          ),
        ],
        child: const MaterialApp(home: QuickSamScreen()),
      ),
    );
    access.add(const ExamAccess());
    await tester.pump();
    await tester.pump();
    expect(find.text('Explain that in simpler words'), findsOneWidget);
    access.add(
      const ExamAccess(
        exams: [
          {'testId': 'a', 'title': 'Science exam'},
        ],
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(notifier.closeCalls, 1);
    expect(find.text('AI Tutor is unavailable'), findsOneWidget);
    expect(find.text('Explain that in simpler words'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final textScale in [1.0, 1.5]) {
    testWidgets(
      'Quick Sam suggestions stay readable at text scale $textScale and send their text',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final notifier = _QuickSamStub();
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              examAccessProvider.overrideWith(
                (ref) => Stream.value(const ExamAccess()),
              ),
              quickSamProvider.overrideWith(() => notifier),
              dashboardProvider.overrideWith(
                (ref) async => DashboardData.fromJson({}),
              ),
            ],
            child: MaterialApp(
              theme: ThemeData(
                useMaterial3: true,
                colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
              ),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(textScale)),
                child: child!,
              ),
              home: const QuickSamScreen(),
            ),
          ),
        );
        await tester.pump();

        final chipFinder = find.widgetWithText(
          ActionChip,
          'Explain that in simpler words',
        );
        final chip = tester.widget<ActionChip>(chipFinder);
        final background = chip.color!.resolve({});
        final foreground = chip.labelStyle!.color!;
        final luminances = [
          background!.computeLuminance(),
          foreground.computeLuminance(),
        ]..sort();
        expect(
          (luminances.last + 0.05) / (luminances.first + 0.05),
          greaterThanOrEqualTo(4.5),
        );
        expect(chip.color!.resolve({WidgetState.pressed}), background);
        expect(
          tester.getRect(find.text('Explain that in simpler words')).height,
          lessThan(tester.getRect(chipFinder).height),
        );
        expect(tester.takeException(), isNull);

        await tester.tap(find.byTooltip('Sam speaking speed'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        expect(find.byType(PopupMenuItem<int>), findsNWidgets(2));
        for (final rate in [1, 2]) {
          expect(find.widgetWithText(PopupMenuItem<int>, '$rate×'), findsOneWidget);
        }
        expect(find.text('3×'), findsNothing);
        expect(find.text('4×'), findsNothing);
        await tester.tap(find.widgetWithText(PopupMenuItem<int>, '2×'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        expect(ProviderScope.containerOf(tester.element(find.byType(QuickSamScreen))).read(quickSamProvider).speechRate, 2);
        expect(find.text('2×'), findsOneWidget);
        expect(tester.takeException(), isNull);

        await tester.tap(chipFinder);
        expect(notifier.sent, 'Explain that in simpler words');
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}

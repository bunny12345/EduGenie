import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/dashboard.dart';
import 'package:mobile/state/quick_sam_provider.dart';
import 'package:mobile/state/student_providers.dart';
import 'package:mobile/widgets/quick_sam_bubble.dart';

class _QuickSamStub extends QuickSamNotifier {
  String? sent;

  @override
  QuickSamState build() => const QuickSamState(
    open: true,
    followups: ['Explain that in simpler words', 'Give me a real-life example'],
  );

  @override
  Future<void> send(String raw) async {
    sent = raw;
  }
}

void main() {
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

        await tester.tap(chipFinder);
        expect(notifier.sent, 'Explain that in simpler words');
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}

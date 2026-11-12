import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/theme/app_colors.dart';
import 'package:mobile/theme/app_theme.dart';
import 'package:mobile/widgets/cupertino_time_picker_sheet.dart';

double _contrast(Color a, Color b) {
  final first = a.computeLuminance();
  final second = b.computeLuminance();
  return (math.max(first, second) + 0.05) / (math.min(first, second) + 0.05);
}

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  for (final dark in [false, true]) {
    for (final textScale in [1.0, 2.0]) {
      testWidgets('time picker is readable and retains selection in ${dark ? 'dark' : 'light'} mode at $textScale', (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        TimeOfDay? result;
        var completed = false;
        await tester.pumpWidget(
          MaterialApp(
            theme: dark ? AppTheme.dark() : AppTheme.light(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
              child: child!,
            ),
            home: Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () async {
                    completed = false;
                    result = await showCupertinoTimePicker(context, initialTime: const TimeOfDay(hour: 14, minute: 25));
                    completed = true;
                  },
                  child: const Text('Choose time'),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Choose time'));
        await tester.pumpAndSettle();
        final picker = tester.widget<CupertinoDatePicker>(find.byType(CupertinoDatePicker));
        final palette = AppPalette(dark);
        final cupertino = CupertinoTheme.of(tester.element(find.byType(CupertinoDatePicker)));
        final sheet = tester.widget<BottomSheet>(find.byType(BottomSheet));
        expect(sheet.backgroundColor, palette.card);
        expect(picker.backgroundColor, palette.card);
        expect(cupertino.brightness, dark ? Brightness.dark : Brightness.light);
        expect(_contrast(cupertino.textTheme.dateTimePickerTextStyle.color!, palette.card), greaterThanOrEqualTo(4.5));
        expect(_contrast(cupertino.primaryColor, palette.card), greaterThanOrEqualTo(4.5));
        expect(_contrast(tester.widget<Text>(find.text('Select time')).style!.color!, palette.card), greaterThanOrEqualTo(4.5));
        expect(picker.initialDateTime.hour, 14);
        expect(picker.initialDateTime.minute, 25);
        expect(picker.use24hFormat, isFalse);
        picker.onDateTimeChanged(DateTime(2026, 11, 12, 17, 40));
        await tester.tap(find.text('Done'));
        await tester.pumpAndSettle();
        expect(completed, isTrue);
        expect(result, const TimeOfDay(hour: 17, minute: 40));

        await tester.tap(find.text('Choose time'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();
        expect(completed, isTrue);
        expect(result, isNull);
        expect(tester.takeException(), isNull);
      });
    }
  }
}

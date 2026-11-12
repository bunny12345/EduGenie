import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Shared spinning-wheel time picker for teacher scheduling.
Future<TimeOfDay?> showCupertinoTimePicker(BuildContext context, {required TimeOfDay initialTime}) {
  final now = DateTime.now();
  var selected = DateTime(now.year, now.month, now.day, initialTime.hour, initialTime.minute);

  return showModalBottomSheet<TimeOfDay>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.of(context).card,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) {
      final palette = AppColors.of(ctx);
      return CupertinoTheme(
        data: CupertinoThemeData(
          brightness: Theme.of(ctx).brightness,
          primaryColor: palette.accent,
          scaffoldBackgroundColor: palette.card,
          textTheme: CupertinoTextThemeData(dateTimePickerTextStyle: TextStyle(color: palette.text, fontSize: 21)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.all(4),
                  child: Column(
                    children: [
                      Text(
                        'Select time',
                        style: TextStyle(color: palette.text, fontWeight: FontWeight.w700, fontSize: 15),
                      ),
                      Row(
                        children: [
                          Expanded(
                            child: CupertinoButton(
                              padding: const EdgeInsets.all(8),
                              onPressed: () => Navigator.pop(ctx),
                              child: const Text('Cancel'),
                            ),
                          ),
                          Expanded(
                            child: CupertinoButton(
                              padding: const EdgeInsets.all(8),
                              onPressed: () => Navigator.pop(ctx, TimeOfDay(hour: selected.hour, minute: selected.minute)),
                              child: const Text('Done'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                SizedBox(
                  height: 216,
                  child: CupertinoDatePicker(
                    mode: CupertinoDatePickerMode.time,
                    backgroundColor: palette.card,
                    initialDateTime: selected,
                    use24hFormat: false,
                    onDateTimeChanged: (dt) => selected = dt,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// Shows an iOS-style spinning-wheel time picker in a bottom sheet instead of
/// Material's clock-dial `showTimePicker` — used for homework/test/
/// announcement scheduling in the teacher portal so time selection matches
/// native iPhone UI on both platforms.
Future<TimeOfDay?> showCupertinoTimePicker(
  BuildContext context, {
  required TimeOfDay initialTime,
}) {
  final now = DateTime.now();
  var selected = DateTime(now.year, now.month, now.day, initialTime.hour, initialTime.minute);

  return showModalBottomSheet<TimeOfDay>(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) {
      return SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CupertinoButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                  const Text('Select time', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  CupertinoButton(
                    onPressed: () => Navigator.pop(ctx, TimeOfDay(hour: selected.hour, minute: selected.minute)),
                    child: const Text('Done'),
                  ),
                ],
              ),
            ),
            SizedBox(
              height: 216,
              child: CupertinoDatePicker(
                mode: CupertinoDatePickerMode.time,
                initialDateTime: selected,
                use24hFormat: false,
                onDateTimeChanged: (dt) => selected = dt,
              ),
            ),
          ],
        ),
      );
    },
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/screens/student/student_notifications_screen.dart';
import 'package:mobile/services/push_notification_service.dart';

Map<String, dynamic> _preview({
  int devices = 1,
  bool pushConfigured = true,
  Map<String, bool>? prefs,
}) => {
  'success': true,
  'devices': devices,
  'pushConfigured': pushConfigured,
  'timezone': 'Asia/Kolkata',
  'preferences':
      prefs ??
      {
        'eveningPlan': true,
        'nightRecap': true,
        'testReminders': true,
        'schoolUpdates': true,
      },
  'summary': {
    'pendingHomework': 2,
    'dueToday': 1,
    'testsTomorrow': 1,
    'streakDays': 4,
  },
  'eveningPlan': {
    'title': '📚 Asha, 2 homework tasks today',
    'body': 'Start with Maths – due today ⏰',
  },
  'testTomorrow': {
    'title': '📝 Science mock test tomorrow',
    'body': 'Quick revision tonight 💪',
  },
  'nightRecap': {'title': '🌟 Great job today, Asha!', 'body': 'Keep going 🚀'},
};

Future<void> _pump(WidgetTester tester, Map<String, dynamic> preview) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        notificationPreviewProvider.overrideWith((ref) async => preview),
        pushPermissionProvider.overrideWith(
          (ref) async => PushPermission.granted,
        ),
      ],
      child: const MaterialApp(home: StudentNotificationsScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'shows personalised previews and enabled toggles for a registered phone',
    (tester) async {
      await _pump(tester, _preview());

      expect(find.text('🔔 Permission allowed'), findsOneWidget);
      expect(find.text('Reconnect'), findsOneWidget);
      expect(find.text('📚 Asha, 2 homework tasks today'), findsOneWidget);
      expect(find.text('📝 Science mock test tomorrow'), findsOneWidget);
      expect(find.text('🌟 Great job today, Asha!'), findsOneWidget);
      final switches = tester.widgetList<Switch>(find.byType(Switch));
      expect(switches.length, 4);
      expect(switches.every((s) => s.onChanged != null), isTrue);
    },
  );

  testWidgets(
    'hides paused reminders and locks toggles until the phone registers',
    (tester) async {
      await _pump(
        tester,
        _preview(
          devices: 0,
          prefs: {
            'eveningPlan': true,
            'nightRecap': false,
            'testReminders': false,
            'schoolUpdates': true,
          },
        ),
      );

      expect(find.text('📚 Asha, 2 homework tasks today'), findsOneWidget);
      expect(find.text('📝 Science mock test tomorrow'), findsNothing);
      expect(find.text('🌟 Great job today, Asha!'), findsNothing);
      expect(
        tester
            .widgetList<Switch>(find.byType(Switch))
            .every((s) => s.onChanged == null),
        isTrue,
      );
      expect(
        find.text('Connect this phone above to customise your reminders.'),
        findsOneWidget,
      );
    },
  );

  testWidgets('shows when server delivery is unavailable', (tester) async {
    await _pump(tester, _preview(pushConfigured: false));
    expect(
      find.text('Push delivery is not configured on the server yet.'),
      findsOneWidget,
    );
    final button = tester.widget<ButtonStyleButton>(find.widgetWithText(
      OutlinedButton, 'Send me a test notification',
    ));
    expect(button.onPressed, isNull);
  });
}

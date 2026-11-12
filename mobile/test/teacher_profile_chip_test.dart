import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/state/teacher_providers.dart';
import 'package:mobile/widgets/teacher_profile_chip.dart';

class _Session extends SessionNotifier {
  @override
  Future<Session?> build() async =>
      const Session(role: 'teacher', token: 'fixture', name: 'Session Teacher');
}

void main() {
  for (final entry in {
    'male': '👨‍🏫',
    'female': '👩‍🏫',
    '': '🧑‍🏫',
  }.entries) {
    for (final dark in [false, true]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets(
          'profile shows assigned account details (${entry.key}, $dark, $scale)',
          (tester) async {
            tester.view.physicalSize = const Size(320, 740);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            await tester.pumpWidget(
              ProviderScope(
                overrides: [
                  sessionProvider.overrideWith(_Session.new),
                  teacherProfileProvider.overrideWith(
                    (ref) async => {
                      'name': 'Registered Teacher With A Long Name',
                      'gender': entry.key,
                      'subject': 'Mathematics',
                      'loginId': 'teacher-42',
                      'grades': ['Class 6', 'Class 9'],
                      'schoolName': 'Fixture School',
                    },
                  ),
                ],
                child: MaterialApp(
                  theme: ThemeData(
                    brightness: dark ? Brightness.dark : Brightness.light,
                  ),
                  builder: (context, child) => MediaQuery(
                    data: MediaQuery.of(
                      context,
                    ).copyWith(textScaler: TextScaler.linear(scale)),
                    child: child!,
                  ),
                  home: Scaffold(
                    appBar: AppBar(
                      title: const TeacherProfileChip(section: 'Teacher'),
                      actions: const [Icon(Icons.more_vert_rounded)],
                    ),
                  ),
                ),
              ),
            );
            await tester.pump();
            expect(find.text(entry.value), findsOneWidget);
            await tester.tap(find.byTooltip('Open teacher profile'));
            await tester.pumpAndSettle();
            expect(find.text(entry.value), findsNWidgets(2));
            expect(
              find.text('Registered Teacher With A Long Name'),
              findsOneWidget,
            );
            expect(find.text('Fixture School'), findsOneWidget);
            for (final text in [
              'Subject: Mathematics',
              'Login ID: teacher-42',
              'Classes: Class 6, Class 9',
            ]) {
              final finder = find.text(text, findRichText: true);
              expect(finder, findsOneWidget);
              await tester.ensureVisible(finder);
              expect(tester.getRect(finder).right, lessThanOrEqualTo(320));
            }
            expect(tester.takeException(), isNull);
            await tester.tapAt(const Offset(310, 730));
            await tester.pumpAndSettle();
            expect(
              find.text('Registered Teacher With A Long Name'),
              findsNothing,
            );
            await tester.pumpWidget(const SizedBox.shrink());
          },
        );
      }
    }
  }

  testWidgets('profile failures are visible and retryable', (tester) async {
    var fail = true;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith(_Session.new),
          teacherProfileProvider.overrideWith((ref) async {
            if (fail) throw StateError('Offline');
            return {'name': 'Restored Teacher', 'grades': <String>[]};
          }),
        ],
        child: const MaterialApp(
          home: Scaffold(body: TeacherProfileChip(section: 'Teacher')),
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.byTooltip('Open teacher profile'));
    await tester.pumpAndSettle();
    expect(find.text('Unable to retrieve teacher profile.'), findsOneWidget);
    fail = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(
      find.text('Classes: No classes assigned', findRichText: true),
      findsOneWidget,
    );
    expect(
      find.text('Login ID: Not available', findRichText: true),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

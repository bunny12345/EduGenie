import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/navigation/role_router.dart';
import 'package:mobile/navigation/student_nav_shell.dart';
import 'package:mobile/navigation/teacher_shell.dart';
import 'package:mobile/services/secure_storage_service.dart';
import 'package:mobile/state/session_provider.dart';

class _MemoryStorage extends SecureStorageService {
  _MemoryStorage(this.session);

  String? session;
  bool failLogout = false;

  @override
  Future<String?> readSessionJson() async => session;

  @override
  Future<void> clearSession() async {
    if (failLogout) throw StateError('Storage unavailable');
    session = null;
  }
}

void main() {
  test('missing roles never become student sessions', () {
    expect(Session.fromJson({'token': 'fixture'}).isStudent, isFalse);
    for (final role in ['student', 'teacher', 'school_admin']) {
      final session = Session(role: role, token: 'fixture', userId: 'fixture');
      expect(Session.fromJson(session.toJson()).role, role);
    }
  });

  for (final role in ['school_admin', 'owner', '']) {
    testWidgets('restored "$role" session cannot open a mobile portal', (
      tester,
    ) async {
      final storage = _MemoryStorage(
        jsonEncode(Session(role: role, token: 'fixture').toJson()),
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [secureStorageServiceProvider.overrideWithValue(storage)],
          child: const MaterialApp(home: RoleRouter()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(StudentShell), findsNothing);
      expect(find.byType(TeacherShell), findsNothing);
      expect(find.text('Sign out'), findsOneWidget);
      if (role == 'school_admin') {
        expect(
          find.text(
            'School administration is available on the AcademiX website only.',
          ),
          findsOneWidget,
        );
      }

      storage.failLogout = true;
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(
        find.text('Could not sign out. Please try again.'),
        findsOneWidget,
      );

      storage.failLogout = false;
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(storage.session, isNull);
      expect(find.text('Student'), findsOneWidget);
      expect(find.text('Teacher'), findsOneWidget);
      expect(find.text('School Admin'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/screens/auth/role_gateway_screen.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/auth_service.dart';
import 'package:mobile/services/secure_storage_service.dart';
import 'package:mobile/state/session_provider.dart';
import 'package:mobile/widgets/guided_highlight.dart';

class _MemoryStorage extends SecureStorageService {
  final saved = <String, SavedLogin>{};
  String? lastRole;
  String? session;

  @override
  Future<SavedLogin?> readSavedLogin(String role) async => saved[role];
  @override
  Future<void> writeSavedLogin(String role, String loginId, String password) async =>
      saved[role] = (loginId: loginId, password: password);
  @override
  Future<void> clearSavedLogin(String role) async => saved.remove(role);
  @override
  Future<String?> readLastLoginRole() async => lastRole;
  @override
  Future<void> writeLastLoginRole(String role) async => lastRole = role;
  @override
  Future<String?> readSessionJson() async => session;
  @override
  Future<void> writeSessionJson(String json) async => session = json;
  @override
  Future<void> clearSession() async => session = null;
}

class _FakeAuth extends AuthService {
  _FakeAuth() : super(ApiClient());

  @override
  Future<Map<String, dynamic>> studentLogin(String loginId, String password) async => password == 'Right#Pass1'
      ? {'success': true, 'token': _token(), 'student': {'id': 's1', 'name': 'Stu', 'className': 'Class 7'}}
      : {'success': false, 'error': 'Invalid password'};
}

String _token() {
  final payload = base64Url.encode(utf8.encode(jsonEncode({
    'sub': 's1', 'role': 'student',
    'exp': DateTime.now().add(const Duration(hours: 48)).millisecondsSinceEpoch ~/ 1000,
  }))).replaceAll('=', '');
  return 'header.$payload.signature';
}

Future<void> _pump(WidgetTester tester, _MemoryStorage storage) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.6;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      authServiceProvider.overrideWithValue(_FakeAuth()),
      secureStorageServiceProvider.overrideWithValue(storage),
    ],
    child: const MaterialApp(home: RoleGatewayScreen()),
  ));
  await tester.pumpAndSettle();
}

String _text(WidgetTester tester, String key) => tester.widget<TextField>(find.byKey(Key(key))).controller!.text;

void main() {
  for (final role in ['Student', 'Teacher']) {
    testWidgets('$role password visibility toggles and remains visible while editing', (tester) async {
      await _pump(tester, _MemoryStorage());
      if (role == 'Teacher') {
        await tester.tap(find.text('Teacher'));
        await tester.pumpAndSettle();
      }

      final login = find.byKey(const Key('login-id'));
      final password = find.byKey(const Key('login-password'));
      expect(tester.widget<GuidedHighlight>(find.ancestor(of: login, matching: find.byType(GuidedHighlight)).first).active, isTrue);
      await tester.enterText(login, 'user1');
      await tester.pump();
      expect(tester.widget<GuidedHighlight>(find.ancestor(of: password, matching: find.byType(GuidedHighlight)).first).active, isTrue);
      await tester.enterText(password, 'Sample#Pass1');
      expect(tester.widget<TextField>(password).obscureText, isTrue);

      await tester.tap(find.byTooltip('Show password'));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 1));
      expect(tester.widget<TextField>(password).obscureText, isFalse);
      expect(_text(tester, 'login-password'), 'Sample#Pass1');

      await tester.enterText(password, 'Sample#Pass2');
      await tester.pump();
      expect(tester.widget<TextField>(password).obscureText, isFalse);

      await tester.tap(find.byTooltip('Hide password'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(password).obscureText, isTrue);
      expect(_text(tester, 'login-password'), 'Sample#Pass2');
    });
  }

  testWidgets('switching roles preserves password visibility state', (tester) async {
    await _pump(tester, _MemoryStorage());
    await tester.tap(find.byTooltip('Show password'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Teacher'));
    await tester.pumpAndSettle();

    expect(tester.widget<TextField>(find.byKey(const Key('login-password'))).obscureText, isFalse);
    await tester.tap(find.byTooltip('Hide password'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byKey(const Key('login-password'))).obscureText, isTrue);
  });

  testWidgets('prefills the last remembered role and login, per role', (tester) async {
    final storage = _MemoryStorage()
      ..lastRole = 'teacher'
      ..saved['teacher'] = (loginId: 'teach1', password: 'Saved#Pass1');
    await _pump(tester, storage);

    expect(find.text('Teacher Log In'), findsOneWidget);
    expect(_text(tester, 'login-id'), 'teach1');
    expect(_text(tester, 'login-password'), 'Saved#Pass1');

    await tester.tap(find.text('Student'));
    await tester.pumpAndSettle();
    expect(_text(tester, 'login-id'), isEmpty);
    expect(_text(tester, 'login-password'), isEmpty);

    await tester.tap(find.text('Teacher'));
    await tester.pumpAndSettle();
    expect(_text(tester, 'login-id'), 'teach1');
  });

  testWidgets('remembers a successful login only, and forgets it when Remember me is off', (tester) async {
    final storage = _MemoryStorage();
    await _pump(tester, storage);

    await tester.enterText(find.byKey(const Key('login-id')), 'stu1');
    await tester.enterText(find.byKey(const Key('login-password')), 'Wrong#Pass1');
    await tester.tap(find.text('Student Log In'));
    await tester.pumpAndSettle();
    expect(storage.saved, isEmpty);

    await tester.enterText(find.byKey(const Key('login-password')), 'Right#Pass1');
    await tester.tap(find.text('Student Log In'));
    await tester.pumpAndSettle();
    expect(storage.saved['student'], (loginId: 'stu1', password: 'Right#Pass1'));
    expect(storage.lastRole, 'student');

    await tester.tap(find.byKey(const Key('remember-me')));
    await tester.tap(find.text('Student Log In'));
    await tester.pumpAndSettle();
    expect(storage.saved, isEmpty);
  });
}

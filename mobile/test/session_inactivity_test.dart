import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';
import 'package:mobile/models/session.dart';
import 'package:mobile/services/api_client.dart';
import 'package:mobile/services/auth_service.dart';
import 'package:mobile/services/secure_storage_service.dart';
import 'package:mobile/state/session_provider.dart';

String _token(DateTime expiry) {
  final payload = base64Url.encode(utf8.encode(jsonEncode({
    'sub': 'teacher', 'role': 'teacher',
    'exp': expiry.millisecondsSinceEpoch ~/ 1000,
  }))).replaceAll('=', '');
  return 'header.$payload.signature';
}

class _MemoryStorage extends SecureStorageService {
  _MemoryStorage(this.value);
  String? value;
  @override
  Future<String?> readSessionJson() async => value;
  @override
  Future<void> writeSessionJson(String json) async => value = json;
  @override
  Future<void> clearSession() async => value = null;
}

class _Auth extends AuthService {
  _Auth(this.now) : super(ApiClient());
  final DateTime Function() now;
  int renewals = 0;
  Completer<String>? pending;
  Object? failure;

  @override
  Future<String> renewSession(String token) {
    renewals++;
    if (failure != null) return Future.error(failure!);
    return pending?.future ?? Future.value(_token(now().add(const Duration(hours: 48))));
  }
}

void main() {
  test('an expired stored session is cleared on startup', () async {
    final now = DateTime.utc(2026, 1, 1);
    final session = Session(role: 'teacher', userId: 'teacher', token: _token(now));
    final storage = _MemoryStorage(jsonEncode(session.toJson()));
    final container = ProviderContainer(overrides: [
      secureStorageServiceProvider.overrideWithValue(storage),
      sessionClockProvider.overrideWithValue(() => now),
    ]);
    addTearDown(container.dispose);
    expect(await container.read(sessionProvider.future), isNull);
    expect(storage.value, isNull);
    expect(container.read(sessionNoticeProvider), contains('expired'));
  });

  testWidgets('interaction renews the token and inactivity expires it after 48 hours', (tester) async {
    var now = DateTime.utc(2026, 1, 1);
    final storage = _MemoryStorage(jsonEncode(Session(
      role: 'teacher', userId: 'teacher', token: _token(now.add(const Duration(hours: 48))),
    ).toJson()));
    final api = ApiClient();
    final auth = _Auth(() => now);
    final container = ProviderContainer(overrides: [
      secureStorageServiceProvider.overrideWithValue(storage),
      apiClientProvider.overrideWithValue(api),
      authServiceProvider.overrideWithValue(auth),
      sessionClockProvider.overrideWithValue(() => now),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: SessionActivityMonitor(child: Scaffold(body: Consumer(
          builder: (context, ref, _) => TextButton(
            onPressed: () {},
            child: Text(ref.watch(sessionProvider).value == null ? 'Login' : 'Portal'),
          ),
        ))),
      ),
    ));
    await tester.pump();
    expect(find.text('Portal'), findsOneWidget);
    now = now.add(const Duration(hours: 47));
    await tester.pump(const Duration(hours: 47));
    expect(auth.renewals, 0);
    await tester.tap(find.text('Portal'));
    now = now.add(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(auth.renewals, 1);
    final renewed = container.read(sessionProvider).value!;
    expect(renewed.expiresAt, now.add(const Duration(hours: 48)));
    expect(api.authToken, renewed.token);
    expect(Session.fromJson(jsonDecode(storage.value!) as Map<String, dynamic>).token, renewed.token);

    now = now.add(const Duration(hours: 48) - const Duration(seconds: 1));
    await tester.pump(const Duration(hours: 48) - const Duration(seconds: 1));
    expect(find.text('Portal'), findsOneWidget);
    now = now.add(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(find.text('Login'), findsOneWidget);
    expect(storage.value, isNull);
    expect(api.authToken, isNull);
    expect(find.text('Session expired. Please sign in again.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a late renewal cannot restore a signed-out session', (tester) async {
    final now = DateTime.utc(2026, 1, 1);
    final storage = _MemoryStorage(jsonEncode(Session(
      role: 'teacher', userId: 'teacher', token: _token(now.add(const Duration(hours: 48))),
    ).toJson()));
    final auth = _Auth(() => now)..pending = Completer<String>();
    final api = ApiClient();
    final container = ProviderContainer(overrides: [
      secureStorageServiceProvider.overrideWithValue(storage),
      apiClientProvider.overrideWithValue(api),
      authServiceProvider.overrideWithValue(auth),
      sessionClockProvider.overrideWithValue(() => now),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(home: SessionActivityMonitor(child: Scaffold(body: Consumer(
        builder: (context, ref, _) => TextButton(
          onPressed: () {},
          child: Text(ref.watch(sessionProvider).value == null ? 'Login' : 'Portal'),
        ),
      )))),
    ));
    await tester.pump();
    await tester.tap(find.text('Portal'));
    await tester.pump(const Duration(seconds: 1));
    expect(auth.renewals, 1);
    await container.read(sessionProvider.notifier).logout();
    auth.pending!.complete(_token(now.add(const Duration(hours: 48))));
    await tester.pump();
    expect(container.read(sessionProvider).value, isNull);
    expect(storage.value, isNull);
    expect(api.authToken, isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('activity in a new session is not lost behind an old renewal', (tester) async {
    final now = DateTime.utc(2026, 1, 1);
    final oldSession = Session(role: 'teacher', userId: 'teacher', token: _token(now.add(const Duration(hours: 12))));
    final storage = _MemoryStorage(jsonEncode(oldSession.toJson()));
    final pending = Completer<String>();
    final auth = _Auth(() => now)..pending = pending;
    final container = ProviderContainer(overrides: [
      secureStorageServiceProvider.overrideWithValue(storage),
      authServiceProvider.overrideWithValue(auth),
      sessionClockProvider.overrideWithValue(() => now),
    ]);
    addTearDown(container.dispose);
    await container.read(sessionProvider.future);
    final notifier = container.read(sessionProvider.notifier);
    notifier.recordActivity();
    await tester.pump(const Duration(seconds: 1));
    expect(auth.renewals, 1);
    await notifier.logout();
    await notifier.login(Session(role: 'teacher', userId: 'teacher', token: _token(now.add(const Duration(hours: 24)))));
    notifier.recordActivity();
    auth.pending = null;
    pending.complete(_token(now.add(const Duration(hours: 48))));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(auth.renewals, 2);
    expect(container.read(sessionProvider).value!.expiresAt, now.add(const Duration(hours: 48)));
    await notifier.logout();
  });

  testWidgets('resuming checks expiry even if the background timer was suspended', (tester) async {
    var now = DateTime.utc(2026, 1, 1);
    final storage = _MemoryStorage(jsonEncode(Session(
      role: 'teacher', userId: 'teacher', token: _token(now.add(const Duration(hours: 48))),
    ).toJson()));
    final container = ProviderContainer(overrides: [
      secureStorageServiceProvider.overrideWithValue(storage),
      sessionClockProvider.overrideWithValue(() => now),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: SessionActivityMonitor(child: Scaffold(body: Text('Portal')))),
    ));
    await container.read(sessionProvider.future);
    now = now.add(const Duration(hours: 48));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(container.read(sessionProvider).value, isNull);
    expect(storage.value, isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('accessibility actions count as user activity', (tester) async {
    final now = DateTime.utc(2026, 1, 1);
    final storage = _MemoryStorage(jsonEncode(Session(
      role: 'teacher', userId: 'teacher', token: _token(now.add(const Duration(hours: 48))),
    ).toJson()));
    final auth = _Auth(() => now);
    final container = ProviderContainer(overrides: [
      secureStorageServiceProvider.overrideWithValue(storage),
      authServiceProvider.overrideWithValue(auth),
      sessionClockProvider.overrideWithValue(() => now),
    ]);
    addTearDown(container.dispose);
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp(home: SessionActivityMonitor(child: Scaffold(
        body: TextButton(onPressed: () {}, child: const Text('Portal')),
      ))),
    ));
    await container.read(sessionProvider.future);
    await tester.pump();
    final node = tester.getSemantics(find.byType(TextButton));
    tester.binding.platformDispatcher.onSemanticsActionEvent?.call(
      ui.SemanticsActionEvent(viewId: tester.view.viewId, nodeId: node.id, type: ui.SemanticsAction.tap),
    );
    await tester.pump(const Duration(seconds: 1));
    expect(auth.renewals, 1);
    await container.read(sessionProvider.notifier).logout();
    semantics.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('connection failures are visible and rejected sessions sign out', (tester) async {
    final now = DateTime.utc(2026, 1, 1);
    final storage = _MemoryStorage(jsonEncode(Session(
      role: 'teacher', userId: 'teacher', token: _token(now.add(const Duration(hours: 48))),
    ).toJson()));
    final auth = _Auth(() => now);
    final container = ProviderContainer(overrides: [
      secureStorageServiceProvider.overrideWithValue(storage),
      authServiceProvider.overrideWithValue(auth),
      sessionClockProvider.overrideWithValue(() => now),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: SessionActivityMonitor(child: Scaffold(body: Text('Portal')))),
    ));
    await container.read(sessionProvider.future);
    auth.failure = DioException(requestOptions: RequestOptions(path: '/auth/session/refresh'));
    container.read(sessionProvider.notifier).recordActivity();
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(container.read(sessionProvider).value, isNotNull);
    expect(container.read(sessionNoticeProvider), contains('Unable to renew'));
    auth.failure = null;
    container.read(sessionProvider.notifier).recordActivity();
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    expect(container.read(sessionProvider).value, isNotNull);
    expect(container.read(sessionNoticeProvider), isNull);
    auth.failure = DioException(
      requestOptions: RequestOptions(path: '/auth/session/refresh'),
      response: Response(requestOptions: RequestOptions(path: '/auth/session/refresh'), statusCode: 401),
    );
    container.read(sessionProvider.notifier).recordActivity();
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    expect(container.read(sessionProvider).value, isNull);
    expect(storage.value, isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

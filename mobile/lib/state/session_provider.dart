import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/session.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/push_notification_service.dart';
import '../services/secure_storage_service.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final authServiceProvider = Provider<AuthService>(
  (ref) => AuthService(ref.read(apiClientProvider)),
);

final secureStorageServiceProvider = Provider<SecureStorageService>(
  (ref) => SecureStorageService(),
);

class SessionNotice extends Notifier<String?> {
  @override
  String? build() => null;
  void set(String? message) => state = message;
}

final sessionNoticeProvider = NotifierProvider<SessionNotice, String?>(SessionNotice.new);
final sessionClockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// Holds the signed-in session (or null when logged out). Mirrors the
/// session `useState` + localStorage persistence in `web/src/App.js`.
class SessionNotifier extends AsyncNotifier<Session?> {
  Timer? _expiryTimer;
  Timer? _activityTimer;
  Future<void> _storageQueue = Future.value();
  Future<void> _expiryCleanup = Future.value();
  bool _refreshing = false;
  bool _activityWhileRefreshing = false;
  int _generation = 0;
  DateTime? _lastAttempt;
  DateTime get _now => ref.read(sessionClockProvider)();

  Future<void> _persist(Future<void> Function() action) {
    final operation = _storageQueue.then((_) => action());
    _storageQueue = operation.then<void>((_) {}, onError: (Object error, StackTrace stack) {
      debugPrint('Session storage operation failed: $error');
    });
    return operation;
  }

  void _cancelTimers() {
    _expiryTimer?.cancel();
    _activityTimer?.cancel();
    _expiryTimer = null;
    _activityTimer = null;
  }

  void _scheduleExpiry(Session session) {
    _expiryTimer?.cancel();
    final expiry = session.expiresAt;
    if (expiry == null) return;
    final remaining = expiry.difference(_now);
    _expiryTimer = Timer(remaining.isNegative ? Duration.zero : remaining, checkExpiry);
  }

  @override
  Future<Session?> build() async {
    ref.onDispose(() {
      _generation++;
      _cancelTimers();
      _activityWhileRefreshing = false;
    });
    final storage = ref.read(secureStorageServiceProvider);
    final raw = await storage.readSessionJson();
    if (raw == null || raw.isEmpty) return null;
    try {
      final session = Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      final expiry = session.expiresAt;
      if (expiry == null || !expiry.isAfter(_now)) {
        await storage.clearSession();
        ref.read(sessionNoticeProvider.notifier).set('Session expired. Please sign in again.');
        return null;
      }
      ref.read(apiClientProvider).authToken = session.token;
      _scheduleExpiry(session);
      _registerPush(session);
      return session;
    } catch (_) {
      await storage.clearSession();
      return null;
    }
  }

  Future<void> login(Session session) async {
    final expiry = session.expiresAt;
    if (expiry == null || !expiry.isAfter(_now)) {
      throw const FormatException('The server returned an invalid session. Please try signing in again.');
    }
    final generation = ++_generation;
    _cancelTimers();
    _activityWhileRefreshing = false;
    await _expiryCleanup;
    final storage = ref.read(secureStorageServiceProvider);
    await _persist(() => storage.writeSessionJson(jsonEncode(session.toJson())));
    if (generation != _generation) return;
    ref.read(apiClientProvider).authToken = session.token;
    state = AsyncData(session);
    ref.read(sessionNoticeProvider.notifier).set(null);
    _lastAttempt = null;
    _scheduleExpiry(session);
    _registerPush(session);
  }

  void checkExpiry() {
    final session = state.value;
    if (session == null) return;
    final expiry = session.expiresAt;
    if (expiry != null && !expiry.isAfter(_now)) {
      _expire(session);
    } else if (expiry != null) {
      _scheduleExpiry(session);
    }
  }

  void recordActivity() {
    final session = state.value;
    final expiry = session?.expiresAt;
    if (session == null || expiry == null) return;
    if (!expiry.isAfter(_now)) {
      _expire(session);
      return;
    }
    if (_refreshing) {
      _activityWhileRefreshing = true;
      return;
    }
    if (_activityTimer != null) return;
    final sinceAttempt = _lastAttempt == null ? null : _now.difference(_lastAttempt!);
    final retryDelay = sinceAttempt == null ? Duration.zero : const Duration(seconds: 5) - sinceAttempt;
    final untilExpiry = expiry.difference(_now) - const Duration(milliseconds: 1500);
    var delay = sinceAttempt == null ? Duration.zero :
        retryDelay > const Duration(seconds: 1) ? retryDelay : const Duration(seconds: 1);
    if (delay > untilExpiry) delay = untilExpiry;
    if (delay.isNegative) delay = Duration.zero;
    _activityTimer = Timer(delay, () {
      _activityTimer = null;
      unawaited(_renew(session));
    });
  }

  void flushPendingActivity() {
    if (_activityTimer == null) return;
    _activityTimer!.cancel();
    _activityTimer = null;
    final session = state.value;
    if (session != null) unawaited(_renew(session));
  }

  Future<void> _renew(Session session) async {
    if (_refreshing || state.value?.token != session.token) return;
    if (session.expiresAt == null || !session.expiresAt!.isAfter(_now)) {
      _expire(session);
      return;
    }
    final generation = _generation;
    _refreshing = true;
    _lastAttempt = _now;
    try {
      final token = await ref.read(authServiceProvider).renewSession(session.token);
      final updated = session.withToken(token);
      final oldClaims = session.tokenClaims;
      final newClaims = updated.tokenClaims;
      if (newClaims == null || newClaims['sub'] != oldClaims?['sub'] ||
          newClaims['role'] != oldClaims?['role'] ||
          updated.expiresAt == null || !updated.expiresAt!.isAfter(_now)) {
        throw const FormatException('The server returned an invalid session.');
      }
      if (generation != _generation || state.value?.token != session.token) return;
      await _persist(() async {
        if (generation == _generation && state.value?.token == session.token) {
          await ref.read(secureStorageServiceProvider).writeSessionJson(jsonEncode(updated.toJson()));
        }
      });
      if (generation != _generation || state.value?.token != session.token) return;
      ref.read(apiClientProvider).authToken = token;
      state = AsyncData(updated);
      ref.read(sessionNoticeProvider.notifier).set(null);
      _scheduleExpiry(updated);
    } on DioException catch (error) {
      if (generation != _generation || state.value?.token != session.token) return;
      if (error.response?.statusCode == 401 || error.response?.statusCode == 403) {
        _expire(session);
      } else {
        ref.read(sessionNoticeProvider.notifier).set('Unable to renew your session. Check your connection and try again.');
      }
    } catch (error, stack) {
      if (generation != _generation || state.value?.token != session.token) return;
      debugPrint('Session renewal failed: $error\n$stack');
      ref.read(sessionNoticeProvider.notifier).set('Unable to renew your session. Please try again.');
    } finally {
      _refreshing = false;
      if (_activityWhileRefreshing) {
        _activityWhileRefreshing = false;
        if (state.value != null) recordActivity();
      }
    }
  }

  void _expire(Session session) {
    if (state.value?.token != session.token) return;
    final generation = ++_generation;
    _cancelTimers();
    _activityWhileRefreshing = false;
    final api = ref.read(apiClientProvider);
    api.authToken = null;
    state = const AsyncData(null);
    ref.read(sessionNoticeProvider.notifier).set('Session expired. Please sign in again.');
    _expiryCleanup = () async {
      if (session.isStudent) {
        try {
          await PushNotificationService.instance.unregister(api).timeout(const Duration(seconds: 8));
        } on TimeoutException {
          debugPrint('Timed out while unregistering push notifications for the expired session.');
        }
      }
      try {
        await _persist(() async {
          if (generation == _generation) await ref.read(secureStorageServiceProvider).clearSession();
        });
      } catch (error, stack) {
        debugPrint('Could not clear the expired session: $error\n$stack');
        if (generation == _generation) {
          ref.read(sessionNoticeProvider.notifier).set('Session expired, but device storage could not be cleared.');
        }
      }
    }();
  }

  /// Students get the 6:30 PM plan / 9:00 PM recap pushes on this phone.
  void _registerPush(Session session) {
    if (!session.isStudent) return;
    unawaited(PushNotificationService.instance.registerStudent(ref.read(apiClientProvider)));
  }

  Future<void> logout() async {
    ++_generation;
    _cancelTimers();
    _activityWhileRefreshing = false;
    final storage = ref.read(secureStorageServiceProvider);
    if (state.value?.isStudent ?? false) {
      await PushNotificationService.instance.unregister(ref.read(apiClientProvider));
    }
    try {
      await _persist(storage.clearSession);
    } catch (_) {
      final current = state.value;
      if (current != null) _scheduleExpiry(current);
      rethrow;
    }
    ref.read(apiClientProvider).authToken = null;
    state = const AsyncData(null);
    ref.read(sessionNoticeProvider.notifier).set(null);
  }
}

final sessionProvider = AsyncNotifierProvider<SessionNotifier, Session?>(
  SessionNotifier.new,
);

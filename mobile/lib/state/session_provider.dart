import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/session.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/secure_storage_service.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final authServiceProvider = Provider<AuthService>(
  (ref) => AuthService(ref.read(apiClientProvider)),
);

final secureStorageServiceProvider = Provider<SecureStorageService>(
  (ref) => SecureStorageService(),
);

/// Holds the signed-in session (or null when logged out). Mirrors the
/// session `useState` + localStorage persistence in `web/src/App.js`.
class SessionNotifier extends AsyncNotifier<Session?> {
  @override
  Future<Session?> build() async {
    final storage = ref.read(secureStorageServiceProvider);
    final raw = await storage.readSessionJson();
    if (raw == null || raw.isEmpty) return null;
    try {
      final session = Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      ref.read(apiClientProvider).authToken = session.token;
      return session;
    } catch (_) {
      await storage.clearSession();
      return null;
    }
  }

  Future<void> login(Session session) async {
    final storage = ref.read(secureStorageServiceProvider);
    await storage.writeSessionJson(jsonEncode(session.toJson()));
    ref.read(apiClientProvider).authToken = session.token;
    state = AsyncData(session);
  }

  Future<void> logout() async {
    final storage = ref.read(secureStorageServiceProvider);
    await storage.clearSession();
    ref.read(apiClientProvider).authToken = null;
    state = const AsyncData(null);
  }
}

final sessionProvider = AsyncNotifierProvider<SessionNotifier, Session?>(
  SessionNotifier.new,
);

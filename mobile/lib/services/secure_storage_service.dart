import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wraps flutter_secure_storage for the single persisted session blob —
/// mobile equivalent of the web app's `localStorage['AcademiX.session']`.
class SecureStorageService {
  static const _sessionKey = 'academix_session';

  final FlutterSecureStorage _storage;

  SecureStorageService({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  Future<void> writeSessionJson(String json) => _storage.write(key: _sessionKey, value: json);

  Future<String?> readSessionJson() => _storage.read(key: _sessionKey);

  Future<void> clearSession() => _storage.delete(key: _sessionKey);
}

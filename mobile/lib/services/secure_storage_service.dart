import 'package:flutter_secure_storage/flutter_secure_storage.dart';

typedef StoredThemePreferences = ({bool? studentDark, bool? teacherDark});

/// Wraps flutter_secure_storage for the persisted session and device preferences —
/// mobile equivalent of the web app's `localStorage['AcademiX.session']`.
class SecureStorageService {
  static const _sessionKey = 'academix_session';
  static const _focusPinKey = 'academix_focus_lock_pin';
  static const _focusEnabledKey = 'academix_focus_lock_enabled';
  static const _focusUnlockAtKey = 'academix_focus_lock_unlock_at';
  static const _studentThemeKey = 'academix_theme_student';
  static const _teacherThemeKey = 'academix_theme_teacher';

  final FlutterSecureStorage _storage;

  SecureStorageService({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  Future<void> writeSessionJson(String json) => _storage.write(key: _sessionKey, value: json);

  Future<String?> readSessionJson() => _storage.read(key: _sessionKey);

  Future<void> clearSession() => _storage.delete(key: _sessionKey);

  Future<StoredThemePreferences> readThemePreferences() async {
    bool? parse(String? value) => switch (value) {
      null => null,
      'dark' => true,
      'light' => false,
      _ => throw const FormatException('The saved theme preference is invalid.'),
    };
    final student = await _storage.read(key: _studentThemeKey);
    final teacher = await _storage.read(key: _teacherThemeKey);
    return (studentDark: parse(student), teacherDark: parse(teacher));
  }

  Future<void> writeThemePreference(bool dark, {bool teacher = false}) =>
      _storage.write(key: teacher ? _teacherThemeKey : _studentThemeKey, value: dark ? 'dark' : 'light');

  // ─── Parental "Focus Mode" lock ──────────────────────────────────────────
  Future<void> writeFocusLockPin(String pin) => _storage.write(key: _focusPinKey, value: pin);

  Future<String?> readFocusLockPin() => _storage.read(key: _focusPinKey);

  Future<void> clearFocusLockPin() => _storage.delete(key: _focusPinKey);

  Future<void> writeFocusLockEnabled(bool enabled) => _storage.write(key: _focusEnabledKey, value: enabled ? '1' : '0');

  Future<bool> readFocusLockEnabled() async => (await _storage.read(key: _focusEnabledKey)) == '1';

  /// When Focus Mode should automatically unlock — persisted so the
  /// countdown survives an app/phone restart while still locked.
  Future<void> writeFocusLockUnlockAt(DateTime? at) =>
      at == null ? _storage.delete(key: _focusUnlockAtKey) : _storage.write(key: _focusUnlockAtKey, value: at.toIso8601String());

  Future<DateTime?> readFocusLockUnlockAt() async {
    final raw = await _storage.read(key: _focusUnlockAtKey);
    if (raw == null) return null;
    return DateTime.tryParse(raw);
  }
}

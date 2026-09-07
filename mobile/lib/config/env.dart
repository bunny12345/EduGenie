/// API base URL — override at build/run time with:
///   flutter run --dart-define=API_BASE_URL=http://localhost:3000
/// Defaults to the production backend (same one the web app talks to).
class Env {
  Env._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://academix.now',
  );
}

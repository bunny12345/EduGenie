/// API base URL — override at build/run time with:
///   flutter run --dart-define=API_BASE_URL=https://academix.now
///
/// Defaults to the LOCAL backend (http://localhost:3000) so the mobile app
/// always talks to the exact same backend/database as the web dev server
/// (see `web/.env.local`'s `REACT_APP_API_URL`) — this avoids the two
/// clients silently reading from different databases during local testing.
/// Switch the default back to the production URL once local testing is done
/// and web's own `.env.local` override is removed.
class Env {
  Env._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
}

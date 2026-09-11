/// API base URL — override at build/run time with:
///   flutter run --dart-define=API_BASE_URL=http://localhost:3000
///
/// Defaults to the production AWS backend (https://academix.now, same origin
/// CloudFront proxies to the ALB/EC2 backend — see /memories/repo/aws-deployment.md)
/// so the app works out of the box against live data. Override with the flag
/// above only when running the backend locally for development.
class Env {
  Env._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    // defaultValue: 'http://localhost:3000',
    defaultValue: 'https://academix.now',
  );
}

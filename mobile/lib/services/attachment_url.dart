import '../config/env.dart';

String resolveAttachmentUrl(String url) {
  final uri = Uri.parse(url.trim());
  if (uri.hasScheme) {
    final isLocal = uri.host == 'localhost' || uri.host == '127.0.0.1' || uri.host == '::1';
    return uri.scheme == 'http' && !isLocal ? uri.replace(scheme: 'https').toString() : uri.toString();
  }
  final base = Env.apiBaseUrl.replaceFirst(RegExp(r'/$'), '');
  return '$base/${url.replaceFirst(RegExp(r'^/'), '')}';
}

import 'package:dio/dio.dart';

import '../config/env.dart';

/// Thin Dio wrapper — single place that knows the base URL and injects the
/// bearer token. Mirrors `authHeaders()` in `web/src/api.js`.
class ApiClient {
  final Dio dio;

  /// Set by the session layer whenever the signed-in user's token changes.
  /// Mirrors `setRuntimeDevToken()` in web/src/api.js.
  String? authToken;

  ApiClient({Dio? dio})
      : dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: Env.apiBaseUrl,
                connectTimeout: const Duration(seconds: 20),
                receiveTimeout: const Duration(seconds: 30),
                contentType: 'application/json',
              ),
            ) {
    this.dio.interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              final token = authToken;
              if (token != null && token.isNotEmpty) {
                options.headers['Authorization'] = 'Bearer $token';
              }
              handler.next(options);
            },
          ),
        );
  }
}

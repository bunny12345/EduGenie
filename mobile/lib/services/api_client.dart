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

  Future<Map<String, dynamic>> notificationRequest(
        String path, {
        String method = 'GET',
        Map<String, dynamic>? data,
  }) async {
        try {
          final response = await dio.request<dynamic>(
            '/notifications/$path',
            data: data,
            options: Options(method: method),
          );
          final body = response.data;
          if (body is! Map<String, dynamic> || body['success'] is! bool) {
            throw Exception('The notification service returned an unexpected response. Please try again later.');
          }
          return body;
        } on DioException catch (error) {
          final status = error.response?.statusCode;
          if (status == 401) {
            throw Exception('Sign in again to manage notifications.');
          }
          if (status == 403 || status == 404 || status == 405 || (status != null && status >= 500)) {
            throw Exception('The notification service is unavailable. Please try again later.');
          }
          throw Exception('Could not complete the notification request. Please try again.');
        }
  }
}

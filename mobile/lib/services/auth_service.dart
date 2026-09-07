import 'package:dio/dio.dart';

import 'api_client.dart';

/// Auth API calls — mirrors the login/register/invite functions in
/// `web/src/api.js`. Every method returns the raw backend JSON as a Map,
/// normalizing network failures into `{success: false, error: ...}` so the
/// UI never has to deal with Dio exceptions directly.
class AuthService {
  final ApiClient _client;

  AuthService(this._client);

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    try {
      final res = await _client.dio.post(path, data: body);
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      return {'success': false, 'error': _errorMessage(e)};
    }
  }

  Future<Map<String, dynamic>> _get(String path) async {
    try {
      final res = await _client.dio.get(path);
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      return {'success': false, 'error': _errorMessage(e)};
    }
  }

  String _errorMessage(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] != null) return data['error'].toString();
    if (data is Map && data['message'] != null) return data['message'].toString();
    return e.message ?? 'Network error';
  }

  Future<Map<String, dynamic>> studentLogin(String loginId, String password) =>
      _post('/auth/student/login', {'loginId': loginId, 'password': password});

  Future<Map<String, dynamic>> teacherLogin(String loginId, String password) =>
      _post('/auth/teacher/login', {'loginId': loginId, 'password': password});

  Future<Map<String, dynamic>> schoolLogin(String email, String password) =>
      _post('/auth/school/login', {'email': email, 'password': password});

  Future<Map<String, dynamic>> schoolRegisterRequestOtp({
    required String email,
    required String schoolName,
    required String branch,
    required String location,
    required String password,
  }) =>
      _post('/auth/school/register/request-otp', {
        'email': email,
        'schoolName': schoolName,
        'branch': branch,
        'location': location,
        'password': password,
      });

  Future<Map<String, dynamic>> schoolRegisterVerifyOtp(String email, String otp) =>
      _post('/auth/school/register/verify-otp', {'email': email, 'otp': otp});

  Future<Map<String, dynamic>> getInviteInfo(String token) =>
      _get('/auth/invite/${Uri.encodeComponent(token)}');

  Future<Map<String, dynamic>> acceptInvite(Map<String, dynamic> payload) =>
      _post('/auth/invite/accept', payload);
}

import 'package:dio/dio.dart';

import '../models/chat_message.dart';
import '../models/curriculum_lesson.dart';
import 'api_client.dart';

/// AI Tutor chat + curriculum lessons — mirrors `sendChat`, `getChatHistory`
/// and `listCurriculumLessons` in `web/src/api.js`. Same conversationId
/// format, same lesson-context fields — do not diverge from the web contract.
class ChatApiService {
  final ApiClient _client;

  ChatApiService(this._client);

  String _errorMessage(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] != null) return data['error'].toString();
    if (data is Map && data['message'] != null) return data['message'].toString();
    return e.message ?? 'Network error';
  }

  Future<List<ChatMessage>> getChatHistory(String studentId, String conversationId) async {
    try {
      final res = await _client.dio.get('/chat/history', queryParameters: {
        'studentId': studentId,
        'conversationId': conversationId,
      });
      final data = Map<String, dynamic>.from(res.data as Map);
      if (data['success'] == false) throw Exception(data['error']?.toString() ?? 'getChatHistory failed');
      final list = data['messages'] as List? ?? [];
      return list.map((m) => ChatMessage.fromJson(Map<String, dynamic>.from(m as Map))).toList();
    } on DioException catch (e) {
      throw Exception(_errorMessage(e));
    }
  }

  /// Returns `{reply, followups, conversationId}` — see `handleMessage()` in
  /// `backend/src/chat/chat.service.ts`.
  Future<Map<String, dynamic>> sendChat({
    required String studentId,
    required String message,
    required String conversationId,
    List<Map<String, String>> recentMessages = const [],
    String? lessonId,
    String? lessonTitle,
    String? lessonSubject,
  }) async {
    try {
      final res = await _client.dio.post('/chat', data: {
        'studentId': studentId,
        'message': message,
        'personality': 'Friendly',
        'conversationId': conversationId,
        'recentMessages': recentMessages,
        'lessonId': lessonId,
        'lessonTitle': lessonTitle,
        'lessonSubject': lessonSubject,
      });
      final data = Map<String, dynamic>.from(res.data as Map);
      if (data['success'] == false || data['reply'] == null) {
        throw Exception(data['error']?.toString() ?? data['message']?.toString() ?? 'Chat request failed');
      }
      return data;
    } on DioException catch (e) {
      throw Exception(_errorMessage(e));
    }
  }

  Future<List<CurriculumLesson>> listLessons({String? subject}) async {
    try {
      final res = await _client.dio.get('/curriculum/lessons', queryParameters: {
        if (subject != null && subject.isNotEmpty) 'subject': subject,
      });
      final data = Map<String, dynamic>.from(res.data as Map);
      if (data['success'] == false) throw Exception(data['error']?.toString() ?? 'listCurriculumLessons failed');
      final list = data['lessons'] as List? ?? [];
      return list.map((l) => CurriculumLesson.fromJson(Map<String, dynamic>.from(l as Map))).toList();
    } on DioException catch (e) {
      throw Exception(_errorMessage(e));
    }
  }
}

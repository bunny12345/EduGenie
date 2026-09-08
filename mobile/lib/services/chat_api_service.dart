import 'package:dio/dio.dart';

import '../models/chat_message.dart';
import '../models/curriculum_lesson.dart';
import '../models/interactive_learning.dart';
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
    List<String> imageDataUrls = const [],
    List<String> imageNames = const [],
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
        if (imageDataUrls.isNotEmpty) 'imageDataUrl': imageDataUrls.first,
        if (imageDataUrls.isNotEmpty) 'imageDataUrls': imageDataUrls,
        if (imageNames.isNotEmpty) 'imageNames': imageNames,
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

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    try {
      final res = await _client.dio.post(path, data: body);
      return Map<String, dynamic>.from(res.data as Map);
    } on DioException catch (e) {
      throw Exception(_errorMessage(e));
    }
  }

  Future<CheckQuestion?> generateCheckQuestion({
    required String studentId,
    required String conversationId,
    String? lessonId,
    String? lessonTitle,
    String? lessonSubject,
  }) async {
    final data = await _post('/chat/check-question', {
      'studentId': studentId,
      'conversationId': conversationId,
      'lessonId': lessonId,
      'lessonTitle': lessonTitle,
      'lessonSubject': lessonSubject,
    });
    if (data['checkQuestion'] == null) return null;
    return CheckQuestion.fromJson(Map<String, dynamic>.from(data['checkQuestion'] as Map));
  }

  Future<Map<String, dynamic>> answerCheckQuestion(String studentId, Map<String, dynamic> payload) {
    return _post('/chat/answer-check', {'studentId': studentId, ...payload});
  }

  Future<ExplainBackEvaluation?> evaluateExplainBack(String studentId, Map<String, dynamic> payload) async {
    final data = await _post('/chat/explain-back', {'studentId': studentId, ...payload});
    if (data['evaluation'] == null) return null;
    return ExplainBackEvaluation.fromJson(Map<String, dynamic>.from(data['evaluation'] as Map));
  }

  Future<LessonStory?> generateLessonStory(String studentId, Map<String, dynamic> payload) async {
    final data = await _post('/chat/story/generate', {'studentId': studentId, ...payload});
    if (data['success'] == false) return null;
    return LessonStory.fromJson(data);
  }

  Future<void> completeLessonStory(String studentId, Map<String, dynamic> payload) {
    return _post('/chat/story/complete', {'studentId': studentId, ...payload});
  }

  Future<QuizRushSet?> generateQuizRush(String studentId, Map<String, dynamic> payload) async {
    final data = await _post('/chat/quiz-rush/generate', {'studentId': studentId, ...payload});
    if (data['success'] == false || (data['questions'] as List? ?? []).isEmpty) return null;
    return QuizRushSet.fromJson(data);
  }

  Future<Map<String, dynamic>> submitQuizRush(String studentId, Map<String, dynamic> payload) {
    return _post('/chat/quiz-rush/submit', {'studentId': studentId, ...payload});
  }

  Future<DueReviewNudge> getDueReviewNudge(String studentId, {String? subject}) async {
    try {
      final res = await _client.dio.get('/chat/due-review', queryParameters: {
        'studentId': studentId,
        if (subject != null && subject.isNotEmpty) 'subject': subject,
      });
      return DueReviewNudge.fromJson(Map<String, dynamic>.from(res.data as Map));
    } on DioException {
      return const DueReviewNudge();
    }
  }

  /// Returns `{audioBase64, mimeType}` for local server-generated TTS.
  Future<Map<String, dynamic>> generateLocalTtsAudio(String text, String studentId, {String targetLanguage = 'en-US', String? voice, double speed = 1}) {
    return _post('/chat/tts-audio', {
      'text': text,
      'targetLanguage': targetLanguage,
      'studentId': studentId,
      'voice': voice,
      'speed': speed,
    });
  }

  /// Returns `{success, text}` — transcribed speech from a recorded clip.
  Future<Map<String, dynamic>> transcribeTutorAudio(String studentId, Map<String, dynamic> payload) {
    return _post('/chat/transcribe', {'studentId': studentId, ...payload});
  }
}

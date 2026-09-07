import 'package:dio/dio.dart';

import '../models/calendar_event.dart';
import '../models/dashboard.dart';
import '../models/homework_item.dart';
import '../models/library_resource.dart';
import '../models/orchard_data.dart';
import '../models/rewards_data.dart';
import '../models/subject_score.dart';
import '../models/test_item.dart';
import 'api_client.dart';

/// Student-facing GET endpoints — mirrors `getDashboard`/`getHomework`/
/// `getProgress`/`getRewards` in `web/src/api.js`. Throws a plain
/// [Exception] on failure so Riverpod `FutureProvider`s surface it as
/// `AsyncError` automatically.
class StudentApiService {
  final ApiClient _client;

  StudentApiService(this._client);

  Future<Map<String, dynamic>> _get(String path, Map<String, dynamic> query) async {
    try {
      final res = await _client.dio.get(path, queryParameters: query);
      final data = Map<String, dynamic>.from(res.data as Map);
      if (data['success'] == false) {
        throw Exception(data['error']?.toString() ?? '$path failed');
      }
      return data;
    } on DioException catch (e) {
      final data = e.response?.data;
      final msg = (data is Map && data['error'] != null) ? data['error'].toString() : (e.message ?? 'Network error');
      throw Exception(msg);
    }
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    try {
      final res = await _client.dio.post(path, data: body);
      final data = Map<String, dynamic>.from(res.data as Map);
      if (data['success'] == false) {
        throw Exception(data['error']?.toString() ?? '$path failed');
      }
      return data;
    } on DioException catch (e) {
      final data = e.response?.data;
      final msg = (data is Map && data['error'] != null) ? data['error'].toString() : (e.message ?? 'Network error');
      throw Exception(msg);
    }
  }

  Future<DashboardData> getDashboard(String studentId) async {
    final json = await _get('/dashboard', {'studentId': studentId});
    return DashboardData.fromJson(json);
  }

  Future<List<HomeworkItem>> getHomework(String studentId) async {
    final json = await _get('/homework', {'studentId': studentId});
    final list = json['homework'] as List? ?? [];
    return list.map((h) => HomeworkItem.fromJson(Map<String, dynamic>.from(h as Map))).toList();
  }

  Future<List<SubjectScore>> getProgress(String studentId, {String period = 'week'}) async {
    final json = await _get('/progress', {'studentId': studentId, 'period': period});
    final list = json['subjectScores'] as List? ?? [];
    return list.map((s) => SubjectScore.fromJson(Map<String, dynamic>.from(s as Map))).toList();
  }

  Future<RewardsData> getRewards(String studentId) async {
    final json = await _get('/rewards', {'studentId': studentId});
    return RewardsData.fromJson(json);
  }

  Future<List<TestItem>> getTests(String studentId, {String filter = 'upcoming'}) async {
    final json = await _get('/tests', {'studentId': studentId, 'filter': filter});
    final list = json['tests'] as List? ?? [];
    return list.map((t) => TestItem.fromJson(Map<String, dynamic>.from(t as Map))).toList();
  }

  /// Text-only submission for this MVP pass — mirrors `submitHomework()` in
  /// web/src/api.js minus attachment uploads (deferred, see mobile-app-plan memory).
  Future<Map<String, dynamic>> submitHomeworkText(String homeworkId, String studentId, String answerText) {
    return _post('/homework/${Uri.encodeComponent(homeworkId)}/submit', {
      'studentId': studentId,
      'answers': {'summary': 'Completed in mobile app', 'text': answerText},
      'attachmentUrls': const [],
    });
  }

  /// Returns `{attemptId, questions: [...]}` — see `start()` in
  /// `backend/src/controllers/tests.controller.ts`.
  Future<Map<String, dynamic>> startTest(String testId, String studentId) {
    return _post('/tests/${Uri.encodeComponent(testId)}/start', {'studentId': studentId});
  }

  /// `answers` is `{questionId: selectedOptionIndex}`. Returns
  /// `{score, feedback, perQuestionFeedback}`.
  Future<Map<String, dynamic>> submitTestAttempt(String attemptId, String studentId, Map<String, int> answers) {
    return _post('/tests/attempts/${Uri.encodeComponent(attemptId)}/submit', {
      'studentId': studentId,
      'answers': answers,
    });
  }

  Future<OrchardData> getOrchard(String studentId) async {
    final json = await _get('/orchard', {'studentId': studentId});
    return OrchardData.fromJson(json);
  }

  Future<Map<String, dynamic>> checkInReward(String studentId) {
    return _post('/rewards/checkin', {'studentId': studentId});
  }

  Future<List<CalendarEvent>> getCalendar(String studentId) async {
    final json = await _get('/calendar', {'studentId': studentId});
    final list = json['events'] as List? ?? [];
    return list.map((e) => CalendarEvent.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<Map<String, dynamic>> createCalendarEvent(String studentId, String title, DateTime date) {
    final iso = date.toIso8601String();
    return _post('/calendar', {'studentId': studentId, 'title': title, 'start': iso, 'end': iso, 'type': 'study'});
  }

  Future<void> deleteCalendarEvent(String eventId, String studentId) async {
    try {
      await _client.dio.delete('/calendar/${Uri.encodeComponent(eventId)}', queryParameters: {'studentId': studentId});
    } on DioException catch (e) {
      throw Exception(e.message ?? 'deleteCalendarEvent failed');
    }
  }

  Future<List<LibraryResource>> getLibrary({String topic = '', int page = 1}) async {
    final json = await _get('/library', {'topic': topic, 'page': page});
    final list = json['resources'] as List? ?? [];
    return list.map((r) => LibraryResource.fromJson(Map<String, dynamic>.from(r as Map))).toList();
  }

  Future<Map<String, dynamic>> getSettings(String studentId) => _get('/settings', {'studentId': studentId});

  Future<Map<String, dynamic>> saveSettings(String studentId, Map<String, dynamic> prefs) {
    return _post('/settings', {'studentId': studentId, 'prefs': prefs});
  }
}

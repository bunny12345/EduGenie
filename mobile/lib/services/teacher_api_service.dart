import 'package:dio/dio.dart';

import 'api_client.dart';

/// Teacher-facing GET endpoints — mirrors the teacher calls in `web/src/api.js`.
class TeacherApiService {
  final ApiClient _client;

  TeacherApiService(this._client);

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

  Future<void> _delete(String path) async {
    try {
      await _client.dio.delete(path);
    } on DioException catch (e) {
      final data = e.response?.data;
      final msg = (data is Map && data['error'] != null) ? data['error'].toString() : (e.message ?? 'Network error');
      throw Exception(msg);
    }
  }

  /// Distinct, sorted class names across this teacher's students — mirrors
  /// `allKnownClasses` (built from `getTeacherStudents`) in `TeacherDashboard.jsx`.
  Future<List<String>> getClassOptions() async {
    final json = await _get('/teacher/students', const {});
    final list = json['students'] as List? ?? [];
    final classes = <String>{};
    for (final entry in list) {
      final className = (entry as Map)['className']?.toString().trim() ?? '';
      if (className.isNotEmpty) classes.add(className);
    }
    final sorted = classes.toList()..sort();
    return sorted;
  }

  /// `{name, subject, schoolName, avatarUrl, ...}` — mirrors `getTeacherProfile()`
  /// in `web/src/api.js`. `subject` is used to lock the Homework/Test subject
  /// field, same as web.
  Future<Map<String, dynamic>> getProfile() async {
    final json = await _get('/teacher/profile', const {});
    return Map<String, dynamic>.from(json['profile'] as Map? ?? {});
  }

  Future<List<Map<String, dynamic>>> getAnnouncements() async {
    final json = await _get('/teacher/announcements', const {});
    final list = json['announcements'] as List? ?? [];
    return list.map((a) => Map<String, dynamic>.from(a as Map)).toList();
  }

  Future<Map<String, dynamic>> postAnnouncement({
    required String title,
    required String message,
    required String className,
    String? startAt,
    String? endAt,
  }) {
    return _post('/teacher/announcements', {
      'title': title,
      'message': message,
      'audience': 'students',
      'className': className,
      'startAt': startAt,
      'endAt': endAt,
    });
  }

  Future<List<Map<String, dynamic>>> getHomework() async {
    final json = await _get('/teacher/homework', const {});
    final raw = json['assignments'] ?? json['homework'] ?? json['items'] ?? json['data'];
    final list = raw is List ? raw : const [];
    return list.map((h) => Map<String, dynamic>.from(h as Map)).toList();
  }

  Future<Map<String, dynamic>> assignHomework({
    required String title,
    required String subject,
    String? note,
    List<String> attachmentUrls = const [],
    String? startAt,
    String? dueAt,
    required String className,
    List<String> lessonIds = const [],
    List<String> lessonTitles = const [],
  }) {
    return _post('/teacher/homework/assign', {
      'title': title,
      'subject': subject,
      'note': note,
      'attachmentUrls': attachmentUrls,
      'attachmentUrl': attachmentUrls.isNotEmpty ? attachmentUrls.first : null,
      'startAt': startAt,
      'dueAt': dueAt,
      'className': className,
      'lessonIds': lessonIds.isNotEmpty ? lessonIds : null,
      'lessonTitles': lessonTitles.isNotEmpty ? lessonTitles : null,
    });
  }

  /// Edits an already-assigned homework (updates every student's copy in the
  /// same assignment group) — mirrors `updateTeacherHomework()` in
  /// `web/src/api.js` / `POST /teacher/homework/:id/update`.
  Future<Map<String, dynamic>> updateHomework(
    String homeworkId, {
    required String title,
    required String subject,
    String? note,
    List<String> attachmentUrls = const [],
    String? startAt,
    String? dueAt,
    String? className,
    List<String> lessonIds = const [],
    List<String> lessonTitles = const [],
  }) {
    return _post('/teacher/homework/${Uri.encodeComponent(homeworkId)}/update', {
      'title': title,
      'subject': subject,
      'note': note,
      'attachmentUrls': attachmentUrls,
      'attachmentUrl': attachmentUrls.isNotEmpty ? attachmentUrls.first : null,
      'startAt': startAt,
      'dueAt': dueAt,
      'className': className,
      'lessonIds': lessonIds.isNotEmpty ? lessonIds : null,
      'lessonTitles': lessonTitles.isNotEmpty ? lessonTitles : null,
    });
  }

  /// Deletes an assigned homework (removes every student's copy in the same
  /// assignment group) — backend-only capability added for the mobile app;
  /// the website currently has no delete option for homework assignments.
  Future<void> deleteHomework(String homeworkId) => _delete('/teacher/homework/${Uri.encodeComponent(homeworkId)}');

  /// Uploads one image (base64 data URL) — mirrors `uploadHomeworkImage()` in
  /// `web/src/api.js`. Returns the hosted URL.
  Future<String> uploadHomeworkImage({required String fileName, required String mimeType, required String dataUrl}) async {
    final json = await _post('/homework/upload', {
      'fileName': fileName,
      'mimeType': mimeType,
      'data': dataUrl,
    });
    return json['url']?.toString() ?? '';
  }

  /// Chapters/lessons available for the assign-homework chapter picker —
  /// mirrors `listCurriculumLessons()` in `web/src/api.js`.
  Future<List<Map<String, dynamic>>> getLessons({required String className, required String subject}) async {
    final json = await _get('/curriculum/lessons', {
      if (className.isNotEmpty) 'className': className,
      if (subject.isNotEmpty) 'subject': subject,
    });
    final list = json['lessons'] as List? ?? [];
    return list.map((l) => Map<String, dynamic>.from(l as Map)).toList();
  }

  Future<List<Map<String, dynamic>>> getTests() async {
    final json = await _get('/tests', const {'studentId': '', 'filter': 'all'});
    final list = json['tests'] as List? ?? [];
    return list.map((t) => Map<String, dynamic>.from(t as Map)).toList();
  }

  Future<Map<String, dynamic>> createTest({
    required String title,
    required String subject,
    required String className,
    int durationMinutes = 30,
  }) {
    return _post('/tests/create', {
      'title': title,
      'subject': subject,
      'className': className,
      'durationMinutes': durationMinutes,
    });
  }

  Future<Map<String, dynamic>> addTestQuestion(
    String testId, {
    required String text,
    required List<String> options,
    required int correctOption,
  }) {
    return _post('/tests/${Uri.encodeComponent(testId)}/questions', {
      'text': text,
      'options': options,
      'correctOption': correctOption,
      'marks': 1,
    });
  }

  Future<void> deleteTest(String testId) => _delete('/tests/${Uri.encodeComponent(testId)}');
}

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/teacher_api_service.dart';
import 'session_provider.dart';

final teacherApiServiceProvider = Provider<TeacherApiService>(
  (ref) => TeacherApiService(ref.read(apiClientProvider)),
);

final teacherClassOptionsProvider = FutureProvider.autoDispose<List<String>>((ref) {
  return ref.watch(teacherApiServiceProvider).getClassOptions();
});

final teacherProfileProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) {
  return ref.watch(teacherApiServiceProvider).getProfile();
});

final teacherAnnouncementsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  return ref.watch(teacherApiServiceProvider).getAnnouncements();
});

final teacherHomeworkProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  return ref.watch(teacherApiServiceProvider).getHomework();
});

final teacherTestsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  return ref.watch(teacherApiServiceProvider).getTests();
});

/// Chapters/lessons for the assign-homework picker — re-fetches whenever the
/// active class or the teacher's (locked) subject changes, mirroring the web
/// `useEffect` keyed on `[teacherTargetClass, assignSubject]`.
final teacherLessonsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final targetClass = ref.watch(teacherTargetClassProvider);
  final subject = ref.watch(teacherProfileProvider).value?['subject']?.toString() ?? '';
  final className = targetClass == 'all' ? '' : targetClass;
  return ref.watch(teacherApiServiceProvider).getLessons(className: className, subject: subject);
});

/// The teacher's currently active class, scoping announcements/homework/tests
/// below it — mirrors `teacherTargetClass` in `TeacherDashboard.jsx`. Starts
/// at 'all' ("— Select a class —"), same as web.
class TeacherTargetClassNotifier extends Notifier<String> {
  @override
  String build() => 'all';

  void set(String value) => state = value;
}

final teacherTargetClassProvider = NotifierProvider.autoDispose<TeacherTargetClassNotifier, String>(
  TeacherTargetClassNotifier.new,
);

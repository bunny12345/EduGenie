import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/teacher_api_service.dart';
import 'session_provider.dart';

final teacherApiServiceProvider = Provider<TeacherApiService>(
  (ref) => TeacherApiService(ref.read(apiClientProvider)),
);

final teacherProfileProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) {
  return ref.watch(teacherApiServiceProvider).getProfile();
});

List<String> assignedTeacherClasses(Map<String, dynamic>? profile) {
  final grades = profile?['grades'];
  if (grades is! List) return [];
  return grades.whereType<String>().map((grade) => grade.trim()).where((grade) => grade.isNotEmpty).toSet().toList();
}

final teacherClassOptionsProvider = FutureProvider.autoDispose<List<String>>((ref) async {
  final profile = await ref.watch(teacherProfileProvider.future);
  final assigned = assignedTeacherClasses(profile);
  return assigned.isNotEmpty ? assigned : ref.watch(teacherApiServiceProvider).getClassOptions();
});

final teacherSingleClassProvider = Provider.autoDispose<String?>((ref) {
  final classes = assignedTeacherClasses(ref.watch(teacherProfileProvider).value);
  return classes.length == 1 ? classes.single : null;
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

/// One student's released report cards (+ pending exams) for the teacher's
/// Student Progress tab, keyed by student id.
final teacherStudentReportCardsProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, studentId) {
  return ref.watch(teacherApiServiceProvider).getStudentReportCards(studentId);
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
/// at 'all' until a single registered class is known.
class TeacherTargetClassNotifier extends Notifier<String> {
  bool _chosen = false;

  @override
  String build() {
    ref.listen<String?>(teacherSingleClassProvider, (previous, next) {
      if (!_chosen && state == 'all' && next != null) state = next;
    });
    return ref.read(teacherSingleClassProvider) ?? 'all';
  }

  void set(String value) {
    _chosen = true;
    state = value;
  }
}

final teacherTargetClassProvider = NotifierProvider.autoDispose<TeacherTargetClassNotifier, String>(
  TeacherTargetClassNotifier.new,
);

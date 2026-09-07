import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/calendar_event.dart';
import '../models/dashboard.dart';
import '../models/homework_item.dart';
import '../models/library_resource.dart';
import '../models/orchard_data.dart';
import '../models/rewards_data.dart';
import '../models/subject_score.dart';
import '../models/test_item.dart';
import '../services/student_api_service.dart';
import 'session_provider.dart';

final studentApiServiceProvider = Provider<StudentApiService>(
  (ref) => StudentApiService(ref.read(apiClientProvider)),
);

/// Throws if called while signed out — every provider below is only ever
/// watched from inside the student portal shell, where a session is guaranteed.
String _requireStudentId(Ref ref) {
  final id = ref.watch(sessionProvider).value?.userId ?? '';
  if (id.isEmpty) throw Exception('No signed-in student');
  return id;
}

final dashboardProvider = FutureProvider.autoDispose<DashboardData>((ref) {
  final id = _requireStudentId(ref);
  return ref.watch(studentApiServiceProvider).getDashboard(id);
});

final homeworkProvider = FutureProvider.autoDispose<List<HomeworkItem>>((ref) {
  final id = _requireStudentId(ref);
  return ref.watch(studentApiServiceProvider).getHomework(id);
});

final progressProvider = FutureProvider.autoDispose<List<SubjectScore>>((ref) {
  final id = _requireStudentId(ref);
  return ref.watch(studentApiServiceProvider).getProgress(id);
});

final rewardsProvider = FutureProvider.autoDispose<RewardsData>((ref) {
  final id = _requireStudentId(ref);
  return ref.watch(studentApiServiceProvider).getRewards(id);
});

final testsProvider = FutureProvider.autoDispose<List<TestItem>>((ref) {
  final id = _requireStudentId(ref);
  return ref.watch(studentApiServiceProvider).getTests(id);
});

/// The student's subject list — mirrors `subjects` in `StudentDashboard.jsx`:
/// derived strictly from the class's registered teachers (excluding
/// "general"), not from leftover progress/homework rows. A class with no
/// teacher for a subject has no subject, full stop.
final studentSubjectsProvider = Provider.autoDispose<List<String>>((ref) {
  final dashboard = ref.watch(dashboardProvider).value;
  if (dashboard == null) return const [];
  final seen = <String>{};
  for (final t in dashboard.classTeachers) {
    final subject = t.subject.trim();
    if (subject.isNotEmpty && subject.toLowerCase() != 'general') seen.add(subject);
  }
  final list = seen.toList()..sort();
  return list;
});

final orchardProvider = FutureProvider.autoDispose<OrchardData>((ref) {
  final id = _requireStudentId(ref);
  return ref.watch(studentApiServiceProvider).getOrchard(id);
});

final calendarEventsProvider = FutureProvider.autoDispose<List<CalendarEvent>>((ref) {
  final id = _requireStudentId(ref);
  return ref.watch(studentApiServiceProvider).getCalendar(id);
});

final libraryProvider = FutureProvider.autoDispose<List<LibraryResource>>((ref) {
  _requireStudentId(ref); // library isn't per-student, but still auth-gated
  return ref.watch(studentApiServiceProvider).getLibrary();
});

final settingsProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) {
  final id = _requireStudentId(ref);
  return ref.watch(studentApiServiceProvider).getSettings(id);
});

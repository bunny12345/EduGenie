import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'session_provider.dart';
import 'student_providers.dart';

class ExamAccess {
  final List<Map<String, dynamic>> exams;
  final String? error;
  const ExamAccess({this.exams = const [], this.error});
  bool get blocked => error != null || exams.isNotEmpty;
}

final examAccessProvider = StreamProvider.autoDispose<ExamAccess>((ref) {
  ref.watch(sessionProvider.select((session) => session.value?.userId));
  final service = ref.watch(studentApiServiceProvider);
  final controller = StreamController<ExamAccess>();
  var disposed = false;
  var busy = false;
  Future<void> check() async {
    if (busy) return;
    busy = true;
    try {
      final data = await service.getExamAccess();
      final exams = (data['exams'] as List)
          .map((row) => Map<String, dynamic>.from(row as Map))
          .toList();
      if (!disposed) controller.add(ExamAccess(exams: exams));
    } catch (error) {
      if (!disposed) {
        controller.add(
          ExamAccess(error: 'Unable to verify exam access: $error'),
        );
      }
    } finally {
      busy = false;
    }
  }

  check();
  final timer = Timer.periodic(const Duration(seconds: 5), (_) => check());
  ref.onDispose(() {
    disposed = true;
    timer.cancel();
    controller.close();
  });
  return controller.stream;
});

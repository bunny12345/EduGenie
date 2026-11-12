import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../state/teacher_providers.dart';
import '../theme/app_colors.dart';
import 'section_card.dart';

class StrictExamStudents extends ConsumerStatefulWidget {
  final String testId;
  const StrictExamStudents({super.key, required this.testId});
  @override
  ConsumerState<StrictExamStudents> createState() => _StrictExamStudentsState();
}

class _StrictExamStudentsState extends ConsumerState<StrictExamStudents> {
  List<Map<String, dynamic>> _students = [];
  String? _error;
  String? _resuming;
  bool _busy = false;
  bool _open = false;
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    if (_busy) return;
    _busy = true;
    try {
      final data = await ref
          .read(teacherApiServiceProvider)
          .getExamStudents(widget.testId);
      if (mounted) {
        setState(() {
          _students = (data['students'] as List)
              .map((row) => Map<String, dynamic>.from(row as Map))
              .toList();
          _error = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      _busy = false;
    }
  }

  Future<void> _resume(String id) async {
    setState(() => _resuming = id);
    try {
      await ref
          .read(teacherApiServiceProvider)
          .resumeExamStudent(widget.testId, id);
      await _load();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _resuming = null);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      TextButton.icon(
        onPressed: () => setState(() => _open = !_open),
        icon: Icon(_open ? Icons.expand_less : Icons.expand_more),
        label: Text(
          'Exam monitor · ${_students.where((row) => row['status'] == 'paused').length} paused',
        ),
      ),
      if (_error != null) ErrorInline(message: _error!),
      if (_open) ...[
        Text(
          'Interruptions need review; they are not proof of cheating. Only the affected student is paused. The clock keeps running.',
          style: TextStyle(fontSize: 12, color: AppColors.of(context).muted),
        ),
        if (_students.isEmpty)
          const Padding(
            padding: EdgeInsets.all(8),
            child: Text('No students have started this test.'),
          ),
        for (final student in _students)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  student['name']?.toString() ?? 'Student',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  '${student['status']} · ${student['incidentCount']} incident(s)',
                  style: TextStyle(
                    color: AppColors.of(context).muted,
                    fontSize: 12,
                  ),
                ),
                if (student['lastReason'] != null)
                  Text(
                    _reason(student['lastReason'].toString()),
                    style: const TextStyle(fontSize: 12),
                  ),
                if (student['pausedAt'] != null)
                  Text(
                    DateTime.parse(
                      student['pausedAt'].toString(),
                    ).toLocal().toString(),
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.of(context).muted,
                    ),
                  ),
                if (student['status'] == 'paused')
                  OutlinedButton(
                    onPressed: _resuming != null
                        ? null
                        : () => _resume(student['studentId'].toString()),
                    child: Text(
                      _resuming == student['studentId']
                          ? 'Resuming…'
                          : 'Resume ${student['name']}',
                    ),
                  ),
              ],
            ),
          ),
      ],
    ],
  );
}

String _reason(String reason) => switch (reason) {
  'tab_hidden' => 'Switched tab / hid test',
  'window_blur' => 'Left test window',
  'left_test' => 'Left test page',
  'app_background' => 'App moved to background',
  'connection_lost' => 'Connection interrupted',
  'another_device' => 'Opened on another device',
  _ => reason,
};

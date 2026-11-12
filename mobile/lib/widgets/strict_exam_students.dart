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
  bool _ended = false;
  Timer? _timer;
  Timer? _expiryTimer;
  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _expiryTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    if (_busy || _ended) return;
    _busy = true;
    try {
      final data = await ref
          .read(teacherApiServiceProvider)
          .getExamStudents(widget.testId);
      if (mounted) {
        _expiryTimer?.cancel();
        final remaining = data['endAt'] != null && data['serverNow'] != null
            ? DateTime.parse(
                data['endAt'] as String,
              ).difference(DateTime.parse(data['serverNow'] as String))
            : null;
        setState(() {
          _ended =
              _ended ||
              data['ended'] == true ||
              (remaining != null && remaining <= Duration.zero);
          _students = _ended
              ? []
              : (data['students'] as List)
                    .map((row) => Map<String, dynamic>.from(row as Map))
                    .toList();
          if (_ended) _open = false;
          _error = null;
        });
        if (_ended) _timer?.cancel();
        if (!_ended && remaining != null) {
          _expiryTimer = Timer(remaining, () {
            if (mounted) {
              setState(() {
                _ended = true;
                _students = [];
                _open = false;
              });
              _timer?.cancel();
            }
          });
        }
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
      final service = ref.read(teacherApiServiceProvider);
      if (id == 'all') {
        await service.resumeAllExamStudents(widget.testId);
      } else {
        await service.resumeExamStudent(widget.testId, id);
      }
      await _load();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _resuming = null);
    }
  }

  @override
  Widget build(BuildContext context) => _ended
      ? const SizedBox.shrink()
      : Column(
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
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.of(context).muted,
                ),
              ),
              OutlinedButton(
                onPressed:
                    _resuming != null ||
                        !_students.any((row) => row['status'] == 'paused')
                    ? null
                    : () => _resume('all'),
                child: Text(
                  _resuming == 'all' ? 'Resuming all…' : 'Resume all',
                ),
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

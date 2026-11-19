import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../state/teacher_providers.dart';
import '../../widgets/section_card.dart';
import '../../widgets/section_tab_button.dart';
import 'teacher_report_cards_tab.dart';

class TeacherClassRecordsTab extends StatefulWidget {
  const TeacherClassRecordsTab({super.key});

  @override
  State<TeacherClassRecordsTab> createState() => _TeacherClassRecordsTabState();
}

class _TeacherClassRecordsTabState extends State<TeacherClassRecordsTab> {
  int _section = 0;
  bool _openedAttendance = false;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            for (final (index, label, icon) in [
              (0, 'Report Cards', Icons.badge_outlined),
              (1, 'Attendance', Icons.fact_check_outlined),
              (2, 'Timetable', Icons.calendar_month_outlined),
            ])
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: SectionTabButton(
                    label: label,
                    icon: icon,
                    selected: _section == index,
                    compact: true,
                    onPressed: () => setState(() {
                      _section = index;
                      if (index == 1) _openedAttendance = true;
                    }),
                  ),
                ),
              ),
          ],
        ),
      ),
      Expanded(
        child: IndexedStack(
          index: _section,
          children: [
            const TeacherReportCardsTab(),
            if (_openedAttendance)
              const TeacherAttendanceTab()
            else
              const SizedBox.shrink(),
            const Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: EdgeInsets.all(16),
                child: SectionCard(
                  child: Material(
                    type: MaterialType.transparency,
                    child: ListTile(
                      leading: Icon(Icons.calendar_month_outlined),
                      title: Text('Timetable'),
                      subtitle: Text('Class timetables are not available yet.'),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class TeacherAttendanceTab extends ConsumerStatefulWidget {
  const TeacherAttendanceTab({super.key});

  @override
  ConsumerState<TeacherAttendanceTab> createState() =>
      _TeacherAttendanceTabState();
}

class _TeacherAttendanceTabState extends ConsumerState<TeacherAttendanceTab> {
  Map<String, dynamic>? _register;
  Map<String, bool> _marks = {};
  String? _className;
  String? _date;
  String? _error;
  String? _notice;
  bool _saving = false;
  bool _loading = true;

  List<Map> get _students =>
      (_register?['students'] as List? ?? []).cast<Map>();
  List<Map<String, Object>> get _entries => [
    for (final row in _students)
      if (row['recorded'] != true || row['present'] != _marks[row['id']])
        {'studentId': row['id'] as String, 'present': _marks[row['id']]!},
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({String? className, String? date}) async {
    setState(() {
      _loading = true;
      _error = _notice = null;
      _className = className;
      _date = date;
    });
    try {
      final result = await ref
          .read(teacherApiServiceProvider)
          .getAttendance(className: className, date: date);
      if (!mounted) return;
      setState(() {
        _register = result;
        _className = result['className'] as String?;
        _date = result['date'] as String?;
        _marks = {
          for (final row in _students)
            row['id'] as String: row['present'] as bool,
        };
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _register = null;
        _error = error.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _change({String? className, String? date}) async {
    if (_students.any((row) => row['present'] != _marks[row['id']])) {
      final discard = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Discard unsaved attendance?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep editing'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Discard'),
            ),
          ],
        ),
      );
      if (discard != true || !mounted) return;
    }
    await _load(className: className, date: date);
  }

  Future<void> _pickDate(Map period, String today) async {
    final end = period['endDate'] as String;
    final selected = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_date!),
      firstDate: DateTime.parse(period['startDate'] as String),
      lastDate: DateTime.parse(end.compareTo(today) < 0 ? end : today),
    );
    if (selected != null && mounted) {
      await _change(
        className: _className,
        date: DateFormat('yyyy-MM-dd', 'en').format(selected),
      );
    }
  }

  Future<void> _edit(Map student) async {
    final present = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Edit attendance · ${student['name']}'),
        content: Text(_displayDate(_date!)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Mark absent'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Mark present'),
          ),
        ],
      ),
    );
    if (present != null && mounted) {
      setState(() => _marks[student['id'] as String] = present);
    }
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = _notice = null;
    });
    try {
      await ref
          .read(teacherApiServiceProvider)
          .saveAttendance(
            className: _className!,
            date: _date!,
            saved: _register!['saved'] as bool,
            entries: _entries,
          );
      if (!mounted) return;
      setState(() {
        _register = {
          ..._register!,
          'saved': true,
          'students': [
            for (final row in _students)
              {...row, 'recorded': true, 'present': _marks[row['id']]},
          ],
        };
        _notice = 'Attendance saved.';
      });
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _displayDate(String value) =>
      DateFormat.yMMMd().format(DateTime.parse(value));

  @override
  Widget build(BuildContext context) {
    final register = _register;
    final period = register?['period'] as Map?;
    final classes = (register?['classes'] as List? ?? []).cast<String>();
    final present = _marks.values.where((value) => value).length;
    final all = present == _students.length;
    final mixed = present > 0 && !all;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Class attendance',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const Text(
                'Everyone starts marked present on a new day. Uncheck absent students, then save.',
              ),
              if (period != null) ...[
                const SizedBox(height: 8),
                Text(
                  'School period: ${_displayDate(period['startDate'])} – ${_displayDate(period['endDate'])}',
                ),
              ],
            ],
          ),
        ),
        if (_error != null) ...[
          ErrorInline(message: _error!),
          TextButton(
            onPressed: _loading || _saving
                ? null
                : () => _change(className: _className, date: _date),
            child: const Text('Refresh register'),
          ),
        ],
        if (_loading) ...[
          const SizedBox(height: 12),
          const SkeletonBox(height: 140),
        ] else if (register != null) ...[
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                DropdownButtonFormField<String>(
                  key: ValueKey(_className),
                  initialValue: _className,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Class'),
                  hint: const Text('No assigned classes'),
                  items: [
                    for (final name in classes)
                      DropdownMenuItem(value: name, child: Text(name)),
                  ],
                  onChanged: _saving
                      ? null
                      : (value) => _change(className: value, date: _date),
                ),
                if (_date != null && period != null)
                  OutlinedButton.icon(
                    onPressed: _saving
                        ? null
                        : () => _pickDate(period, register['today'] as String),
                    icon: const Icon(Icons.event_outlined),
                    label: Text(_displayDate(_date!)),
                  ),
                if (period == null)
                  const Text(
                    'Ask your school admin to set the Progress Graph dates first.',
                  )
                else if (_date == null)
                  const Text(
                    'The school attendance period has not started yet.',
                  )
                else if (_students.isEmpty)
                  const Text('No students in this class register.'),
              ],
            ),
          ),
          if (_students.isNotEmpty) ...[
            const SizedBox(height: 10),
            SectionCard(
              child: Material(
                type: MaterialType.transparency,
                child: CheckboxListTile(
                  title: const Text('Select all present'),
                  subtitle: Text(
                    '$present present · ${_students.length - present} absent',
                  ),
                  tristate: true,
                  value: mixed ? null : all,
                  onChanged: _saving
                      ? null
                      : (_) => setState(() {
                          _marks = {
                            for (final row in _students)
                              row['id'] as String: !all,
                          };
                        }),
                ),
              ),
            ),
            for (final row in _students)
              ListTile(
                title: Text(row['name'] as String),
                subtitle: Text(_marks[row['id']]! ? 'Present' : 'Absent'),
                onTap: _saving ? null : () => _edit(row),
                trailing: Checkbox(
                  semanticLabel: 'Present: ${row['name']}',
                  value: _marks[row['id']],
                  onChanged: _saving
                      ? null
                      : (checked) => setState(
                          () => _marks[row['id'] as String] = checked!,
                        ),
                ),
              ),
            FilledButton(
              onPressed: _saving || _entries.isEmpty ? null : _save,
              child: Text(
                _saving
                    ? 'Saving…'
                    : register['saved'] == true
                    ? 'Save corrections'
                    : 'Save attendance',
              ),
            ),
            if (_notice != null)
              Semantics(liveRegion: true, child: Text(_notice!)),
          ],
        ],
      ],
    );
  }
}

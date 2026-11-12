import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../theme/app_colors.dart';
import '../../theme/report_card_theme.dart';
import '../../state/teacher_providers.dart';
import '../../widgets/section_card.dart';

const Color _frame3dColor = Color(0xFF46464E);

Border _frame3dBorder({double alpha = 0.35, double width = 1.5}) =>
    Border.all(color: _frame3dColor.withValues(alpha: alpha), width: width);

List<BoxShadow> _frame3dShadow({double alpha = 0.18, double blur = 10}) =>
    [BoxShadow(color: Colors.black.withValues(alpha: alpha), blurRadius: blur, offset: const Offset(0, 4))];

/// Teacher "Report Cards" tab — mirrors `web/src/components/TeacherReportCards.jsx`:
/// pick a class, "+" creates (or reuses) a shared exam template, then the
/// teacher enters marks for their own subject only. A tracker shows how many
/// students are fully released to the student app.
class TeacherReportCardsTab extends ConsumerStatefulWidget {
  const TeacherReportCardsTab({super.key});

  @override
  ConsumerState<TeacherReportCardsTab> createState() => _TeacherReportCardsTabState();
}

class _TeacherReportCardsTabState extends ConsumerState<TeacherReportCardsTab> {
  String _className = '';
  String _search = '';
  List<Map<String, dynamic>> _students = [];
  List<Map<String, dynamic>> _exams = [];
  bool _examsLoaded = false;
  String? _selectedExamId;
  Map<String, dynamic>? _marksData;
  String? _selectedStudentId;
  final _marksCtrl = TextEditingController();
  final _remarksCtrl = TextEditingController();
  bool _saving = false;
  String _noticeType = '';
  String _noticeText = '';
  bool _renaming = false;
  final _renameCtrl = TextEditingController();
  String _renameError = '';

  @override
  void dispose() {
    _marksCtrl.dispose();
    _remarksCtrl.dispose();
    _renameCtrl.dispose();
    super.dispose();
  }

  Map<String, dynamic>? get _exam {
    try {
      return _exams.firstWhere((e) => e['id'] == _selectedExamId);
    } catch (_) {
      return null;
    }
  }

  List<Map<String, dynamic>> get _visibleStudents {
    final q = _search.trim().toLowerCase();
    if (q.isEmpty) return _students;
    return _students.where((s) => (s['name']?.toString() ?? '').toLowerCase().contains(q)).toList();
  }

  Map<String, dynamic>? get _savedRow {
    final students = (_marksData?['students'] as List? ?? []).cast<Map<String, dynamic>>();
    try {
      return students.firstWhere((s) => s['id'] == _selectedStudentId);
    } catch (_) {
      return null;
    }
  }

  Future<void> _loadStudents() async {
    if (_className.isEmpty) {
      setState(() => _students = []);
      return;
    }
    try {
      final list = await ref.read(teacherApiServiceProvider).getStudents(className: _className);
      if (!mounted) return;
      setState(() => _students = list);
    } catch (_) {
      if (mounted) setState(() => _students = []);
    }
  }

  Future<void> _loadExams({String? preferId}) async {
    if (_className.isEmpty) return;
    try {
      final res = await ref.read(teacherApiServiceProvider).getReportCardExams(_className);
      final list = (res['exams'] as List? ?? []).cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _exams = list;
        final wanted = preferId ?? _selectedExamId;
        _selectedExamId = list.any((e) => e['id'] == wanted) ? wanted : (list.isNotEmpty ? list.first['id']?.toString() : null);
        _examsLoaded = true;
      });
      await _loadMarks(_selectedExamId);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _exams = [];
        _examsLoaded = true;
        _notice('error', e.toString().replaceFirst('Exception: ', ''));
      });
    }
  }

  Future<void> _loadMarks(String? examId) async {
    if (examId == null) {
      setState(() => _marksData = null);
      return;
    }
    try {
      final res = await ref.read(teacherApiServiceProvider).getReportCardMarks(examId);
      if (!mounted) return;
      setState(() {
        _marksData = res;
        _renaming = false;
        final students = (res['students'] as List? ?? []).cast<Map<String, dynamic>>();
        if (students.isNotEmpty && !students.any((s) => s['id'] == _selectedStudentId)) {
          _selectedStudentId = students.first['id']?.toString();
        }
        _fillEntryForm();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _marksData = null;
        _notice('error', e.toString().replaceFirst('Exception: ', ''));
      });
    }
  }

  void _fillEntryForm() {
    final row = _savedRow;
    _marksCtrl.text = row == null || row['marks'] == null ? '' : row['marks'].toString();
    _remarksCtrl.text = row?['remarks']?.toString() ?? '';
  }

  void _notice(String type, String text) {
    setState(() {
      _noticeType = type;
      _noticeText = text;
    });
  }

  Future<void> _openCreateDialog() async {
    final nameCtrl = TextEditingController();
    final maxCtrl = TextEditingController(text: '100');
    String error = '';
    bool creating = false;
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text('New exam for $_className'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Every teacher of this class will use this same exam. Only you can rename it later.', style: TextStyle(fontSize: 12, color: Color(0xFF68709A))),
              const SizedBox(height: 12),
              TextField(controller: nameCtrl, autofocus: true, maxLength: 60, decoration: const InputDecoration(labelText: 'Exam name', hintText: 'e.g. Annual Exam')),
              TextField(controller: maxCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Maximum marks per subject')),
              if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(error, style: const TextStyle(color: AppColors.danger, fontSize: 12))),
            ],
          ),
          actions: [
            TextButton(onPressed: creating ? null : () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
            FilledButton(
              onPressed: creating
                  ? null
                  : () async {
                      setDialogState(() => creating = true);
                      try {
                        final res = await ref.read(teacherApiServiceProvider).createReportCardExam(
                              className: _className,
                              name: nameCtrl.text,
                              maxMarks: num.tryParse(maxCtrl.text) ?? 100,
                            );
                        if (ctx.mounted) Navigator.of(ctx).pop();
                        final exam = res['exam'] as Map<String, dynamic>;
                        _notice('ok', '"${exam['name']}" created. Add your subject marks below.');
                        await _loadExams(preferId: exam['id']?.toString());
                      } catch (e) {
                        setDialogState(() {
                          creating = false;
                          error = e.toString().replaceFirst('Exception: ', '');
                        });
                      }
                    },
              child: Text(creating ? 'Creating…' : 'Create exam'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _rename() async {
    final exam = _exam;
    if (exam == null) return;
    try {
      final res = await ref.read(teacherApiServiceProvider).updateReportCardExam(exam['id'].toString(), name: _renameCtrl.text);
      final updated = res['exam'] as Map<String, dynamic>;
      setState(() {
        _exams = _exams.map((e) => e['id'] == updated['id'] ? updated : e).toList();
        _renaming = false;
        _renameError = '';
      });
    } catch (e) {
      setState(() => _renameError = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _save({required bool goNext}) async {
    final exam = _exam;
    final students = (_marksData?['students'] as List? ?? []).cast<Map<String, dynamic>>();
    Map<String, dynamic>? student;
    try {
      student = students.firstWhere((s) => s['id'] == _selectedStudentId);
    } catch (_) {
      student = null;
    }
    if (exam == null || student == null || _saving) return;
    final trimmed = _marksCtrl.text.trim();
    if (trimmed.isNotEmpty) {
      final n = num.tryParse(trimmed);
      final maxMarks = exam['maxMarks'] as num? ?? 100;
      if (n == null || n < 0 || n > maxMarks) {
        _notice('error', 'Marks must be between 0 and ${formatMarks(maxMarks)}.');
        return;
      }
    }
    setState(() => _saving = true);
    _notice('', '');
    try {
      final res = await ref.read(teacherApiServiceProvider).saveReportCardMarks(exam['id'].toString(), [
        {'studentId': student['id'], 'marks': trimmed, 'remarks': _remarksCtrl.text},
      ]);
      final updated = res['exam'] as Map<String, dynamic>;
      setState(() => _exams = _exams.map((e) => e['id'] == updated['id'] ? updated : e).toList());
      await _loadMarks(exam['id'].toString());
      _notice('ok', trimmed.isEmpty ? 'Marks cleared.' : "Saved ${student['name']}'s marks.");
      if (goNext) {
        final visible = _visibleStudents;
        final i = visible.indexWhere((s) => s['id'] == _selectedStudentId);
        if (i >= 0 && i < visible.length - 1) {
          setState(() {
            _selectedStudentId = visible[i + 1]['id']?.toString();
            _fillEntryForm();
          });
        }
      }
    } catch (e) {
      _notice('error', e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final classOptionsAsync = ref.watch(teacherClassOptionsProvider);
    final mySubject = ref.watch(teacherProfileProvider).value?['subject']?.toString() ?? '';
    final theme = reportSubjectTheme(mySubject);

    return classOptionsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: ErrorInline(message: 'Unable to load classes: $e')),
      data: (classOptions) {
        if (_className.isEmpty && classOptions.isNotEmpty) {
          _className = classOptions.first;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _loadStudents();
            _loadExams();
          });
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _Frame3dCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: classOptions.contains(_className) ? _className : null,
                          decoration: const InputDecoration(labelText: 'Class', isDense: true),
                          items: [for (final c in classOptions) DropdownMenuItem(value: c, child: Text(c))],
                          onChanged: (v) {
                            if (v == null) return;
                            setState(() {
                              _className = v;
                              _examsLoaded = false;
                              _exams = [];
                              _selectedExamId = null;
                              _marksData = null;
                            });
                            _loadStudents();
                            _loadExams();
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      _PlusButton(onTap: _className.isEmpty ? null : _openCreateDialog, color: theme.color),
                    ],
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    decoration: const InputDecoration(labelText: 'Search students', isDense: true, prefixIcon: Icon(Icons.search_rounded)),
                    onChanged: (v) => setState(() => _search = v),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (_exams.isNotEmpty || _examsLoaded)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final e in _exams)
                    ChoiceChip(
                      label: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text(e['name']?.toString() ?? ''),
                        if (e['released'] == true) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.check_circle, size: 14, color: Colors.white)),
                      ]),
                      selected: e['id'] == _selectedExamId,
                      selectedColor: theme.color,
                      labelStyle: TextStyle(color: e['id'] == _selectedExamId ? Colors.white : AppColors.of(context).text, fontWeight: FontWeight.w700),
                      onSelected: (_) {
                        setState(() => _selectedExamId = e['id']?.toString());
                        _loadMarks(_selectedExamId);
                      },
                    ),
                  ActionChip(
                    label: const Text('+ New exam'),
                    onPressed: _className.isEmpty ? null : _openCreateDialog,
                  ),
                ],
              ),
            if (_noticeText.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: _noticeType == 'error' ? const Color(0xFFFEE2E2) : const Color(0xFFDCFCE7),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(_noticeText, style: TextStyle(color: _noticeType == 'error' ? const Color(0xFF991B1B) : const Color(0xFF166534), fontWeight: FontWeight.w600)),
                ),
              ),
            if (_examsLoaded && _exams.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 24),
                child: Column(
                  children: [
                    const Text('🧾', style: TextStyle(fontSize: 40)),
                    const SizedBox(height: 8),
                    Text('No exams for $_className yet', style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    const Text(
                      'Tap + to add an exam such as "Annual Exam". Every teacher of the class then adds marks for their own subject.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: Color(0xFF68709A)),
                    ),
                  ],
                ),
              ),
            if (_exam != null) ..._buildExamBody(theme),
          ],
        );
      },
    );
  }

  List<Widget> _buildExamBody(ReportSubjectTheme theme) {
    final exam = _exam!;
    final subjects = (exam['subjects'] as List? ?? []).cast<Map<String, dynamic>>();
    final canEdit = _marksData?['canEdit'] == true;
    final mySubject = ref.watch(teacherProfileProvider).value?['subject']?.toString() ?? '';
    final students = (_marksData?['students'] as List? ?? []).cast<Map<String, dynamic>>();
    final studentsById = {for (final s in students) s['id']?.toString(): s};
    final isOwner = exam['isOwner'] == true;

    return [
      const SizedBox(height: 16),
      Row(
        children: [
          Expanded(
            child: _renaming
                ? Row(
                    children: [
                      Expanded(child: TextField(controller: _renameCtrl, maxLength: 60, decoration: const InputDecoration(isDense: true))),
                      TextButton(onPressed: _rename, child: const Text('Save')),
                      TextButton(onPressed: () => setState(() => _renaming = false), child: const Text('Cancel')),
                    ],
                  )
                : Row(
                    children: [
                      Flexible(child: Text(exam['name']?.toString() ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF23275C)))),
                      const SizedBox(width: 8),
                      if (isOwner)
                        TextButton(
                          onPressed: () {
                            _renameCtrl.text = exam['name']?.toString() ?? '';
                            _renameError = '';
                            setState(() => _renaming = true);
                          },
                          child: const Text('Rename'),
                        )
                      else
                        Flexible(
                          child: Text(
                            exam['createdByName'] != null ? '🔒 Created by ${exam['createdByName']}' : '🔒 Name locked',
                            style: const TextStyle(fontSize: 11, color: Color(0xFF68709A)),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
      if (_renameError.isNotEmpty) Text(_renameError, style: const TextStyle(color: AppColors.danger, fontSize: 12)),
      Text('${exam['className']} · out of ${formatMarks(exam['maxMarks'] as num? ?? 100)} per subject', style: const TextStyle(fontSize: 12, color: Color(0xFF68709A))),
      const SizedBox(height: 12),

      // Subject ownership banner
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(gradient: theme.gradient, borderRadius: BorderRadius.circular(16)),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.25), borderRadius: BorderRadius.circular(12)),
              alignment: Alignment.center,
              child: Text(theme.emoji, style: const TextStyle(fontSize: 22)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(mySubject.isEmpty ? 'No subject assigned' : 'Your subject: $mySubject', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                  Text(
                    mySubject.isEmpty
                        ? 'Ask your school admin to assign a subject to your account before entering marks.'
                        : 'You can add and edit $mySubject marks only. Other subjects are filled in by their own teachers.',
                    style: const TextStyle(color: Colors.white, fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),

      // Release tracker
      _Frame3dCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Visible to students: ${exam['studentsReleased']} of ${exam['studentsTotal']}', style: const TextStyle(fontWeight: FontWeight.w800)),
            Text(
              exam['released'] == true ? 'All students can see this report card.' : 'A student sees it once every subject below has their marks.',
              style: const TextStyle(fontSize: 12, color: Color(0xFF68709A)),
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: (exam['studentsTotal'] as num? ?? 0) > 0 ? (exam['studentsReleased'] as num) / (exam['studentsTotal'] as num) : 0,
                minHeight: 8,
                backgroundColor: const Color(0xFFEDF0FB),
                color: const Color(0xFF22C55E),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final s in subjects)
                  Builder(builder: (context) {
                    final t = reportSubjectTheme(s['subject']?.toString() ?? '');
                    final mine = s['isMine'] == true;
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: t.soft,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: t.color, width: mine ? 2 : 1),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('${t.emoji} ${s['subject']}', style: TextStyle(color: t.dark, fontWeight: FontWeight.w700, fontSize: 12)),
                          const SizedBox(width: 4),
                          Text('${s['entered']}/${s['total']}', style: TextStyle(color: t.dark, fontSize: 11, fontWeight: FontWeight.w800)),
                          if (s['done'] == true) const Icon(Icons.check_circle, size: 14, color: Color(0xFF22C55E)),
                        ],
                      ),
                    );
                  }),
                if (subjects.isEmpty) const Text('No subject teachers are registered for this class yet.', style: TextStyle(fontSize: 12, color: Color(0xFF68709A))),
              ],
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),

      // Student picker (compact list) + marks entry
      if (canEdit) ...[
        SizedBox(
          height: 44,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _visibleStudents.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final s = _visibleStudents[i];
              final row = studentsById[s['id']?.toString()];
              final done = row != null && row['marks'] != null;
              final active = s['id'] == _selectedStudentId;
              return ChoiceChip(
                label: Text(s['name']?.toString() ?? 'Student'),
                avatar: done ? const Icon(Icons.check_circle, size: 16, color: Colors.white) : null,
                selected: active,
                selectedColor: theme.color,
                labelStyle: TextStyle(color: active ? Colors.white : AppColors.of(context).text, fontWeight: FontWeight.w700),
                onSelected: (_) {
                  setState(() {
                    _selectedStudentId = s['id']?.toString();
                    _fillEntryForm();
                  });
                },
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        if (_selectedStudentId != null)
          Container(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: theme.color, width: 2)),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  color: theme.color,
                  child: Row(
                    children: [
                      Text(theme.emoji, style: const TextStyle(fontSize: 24)),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(studentsById[_selectedStudentId]?['name']?.toString() ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                          Text('$mySubject marks', style: const TextStyle(color: Colors.white, fontSize: 11)),
                        ],
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.all(16),
                  color: theme.soft,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          SizedBox(
                            width: 120,
                            child: TextField(
                              controller: _marksCtrl,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: theme.dark),
                              decoration: InputDecoration(filled: true, fillColor: Colors.white, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Text('/ ${formatMarks(exam['maxMarks'] as num? ?? 100)}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: theme.dark)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _remarksCtrl,
                        maxLength: 200,
                        decoration: const InputDecoration(labelText: 'Remark (optional)', filled: true, fillColor: Colors.white),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          FilledButton(
                            style: FilledButton.styleFrom(backgroundColor: theme.color),
                            onPressed: _saving ? null : () => _save(goNext: false),
                            child: Text(_saving ? 'Saving…' : 'Save marks'),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: _saving ? null : () => _save(goNext: true),
                            child: const Text('Save & next →'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ] else if (_marksData != null)
        const Padding(
          padding: EdgeInsets.only(top: 8),
          child: Text('You can only enter marks for the subject registered to your account in this class.', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
        ),
    ];
  }
}

class _Frame3dCard extends StatelessWidget {
  final Widget child;

  const _Frame3dCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.of(context).card,
        borderRadius: BorderRadius.circular(14),
        border: _frame3dBorder(alpha: 0.18),
        boxShadow: _frame3dShadow(alpha: 0.08, blur: 8),
      ),
      child: child,
    );
  }
}

class _PlusButton extends StatelessWidget {
  final VoidCallback? onTap;
  final Color color;

  const _PlusButton({required this.onTap, required this.color});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: onTap == null ? color.withValues(alpha: 0.4) : color,
          shape: BoxShape.circle,
          boxShadow: _frame3dShadow(alpha: 0.2, blur: 8),
        ),
        alignment: Alignment.center,
        child: const Icon(Icons.add_rounded, color: Colors.white, size: 26),
      ),
    );
  }
}

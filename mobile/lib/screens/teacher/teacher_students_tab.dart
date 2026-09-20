import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/learning_score.dart';
import '../../state/teacher_providers.dart';
import '../../theme/app_colors.dart';
import '../student/progress/progress_charts.dart';

/// The site-wide "3D button/card" frame — a light-black ring border + soft
/// drop shadow, duplicated per-file per this codebase's convention (see
/// `teacher_shell.dart`).
const Color _frame3dColor = Color(0xFF46464E);

Border _frame3dBorder({double alpha = 0.35, double width = 1.5}) => Border.all(color: _frame3dColor.withValues(alpha: alpha), width: width);

List<BoxShadow> _frame3dShadow({double alpha = 0.18, double blur = 10}) =>
    [BoxShadow(color: Colors.black.withValues(alpha: alpha), blurRadius: blur, offset: const Offset(0, 4))];

DateTime? _parseDate(dynamic value) {
  if (value == null) return null;
  return DateTime.tryParse(value.toString());
}

String _shortDate(dynamic value) {
  final d = _parseDate(value);
  return d == null ? 'TBD' : DateFormat('MMM d').format(d);
}

/// A framed, 3D-bordered card container — mirrors `.td-card.td-card-framed`
/// on web, translated into the mobile app's existing 3D-frame visual language.
class _Frame3dCard extends StatelessWidget {
  final Widget child;

  const _Frame3dCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: _frame3dBorder(alpha: 0.18),
        boxShadow: _frame3dShadow(alpha: 0.08, blur: 8),
      ),
      child: child,
    );
  }
}

/// A small pill button with the site's press-down 3D frame effect — mirrors
/// the "3D button" treatment used across the teacher app (`_NavIconButton`).
class _Frame3dButton extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final Color background;
  final Color foreground;

  const _Frame3dButton({
    required this.child,
    required this.onTap,
    this.background = AppColors.card,
    this.foreground = AppColors.text,
  });

  @override
  State<_Frame3dButton> createState() => _Frame3dButtonState();
}

class _Frame3dButtonState extends State<_Frame3dButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final disabled = widget.onTap == null;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: disabled ? null : (_) => setState(() => _pressed = true),
      onTapCancel: disabled ? null : () => setState(() => _pressed = false),
      onTapUp: disabled ? null : (_) => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? 0.95 : 1.0,
        duration: const Duration(milliseconds: 100),
        curve: Curves.easeOut,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: disabled ? widget.background.withValues(alpha: 0.5) : widget.background,
            borderRadius: BorderRadius.circular(999),
            border: _frame3dBorder(alpha: _pressed ? 0.45 : 0.25),
            boxShadow: _pressed ? [] : _frame3dShadow(alpha: 0.12, blur: 6),
          ),
          child: DefaultTextStyle(
            style: TextStyle(color: widget.foreground, fontSize: 12, fontWeight: FontWeight.w700),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}

const int _studentsPageSize = 5;

/// Teacher tab body for the "Students" bottom-nav icon — mirrors the
/// website's `activeSection === 'students'` block in `TeacherDashboard.jsx`:
/// the Students roster (search + class filter + selection) and the Homework
/// Status panel for whichever student is selected. Progress Snapshot and
/// Delivery Status land in a later pass.
class TeacherStudentsTab extends ConsumerStatefulWidget {
  const TeacherStudentsTab({super.key});

  @override
  ConsumerState<TeacherStudentsTab> createState() => _TeacherStudentsTabState();
}

class _TeacherStudentsTabState extends ConsumerState<TeacherStudentsTab> {
  final _searchCtrl = TextEditingController();
  String _classFilter = 'all';
  int _page = 0;
  Timer? _searchDebounce;

  List<Map<String, dynamic>> _students = [];
  bool _loadingStudents = true;
  String? _studentsError;

  String? _selectedStudentId;
  String? _selectedStudentName;
  List<Map<String, dynamic>> _homework = [];
  bool _loadingHomework = false;
  String? _homeworkError;
  String _homeworkStatusFilter = 'all'; // all | submitted | not-submitted | overdue

  String? _expandedGradeId;
  final _gradeValueCtrl = TextEditingController();
  final _gradeFeedbackCtrl = TextEditingController();
  bool _gradingBusy = false;

  SubjectProgress? _subjectProgress;
  bool _progressHasData = true;
  bool _loadingProgress = false;
  String? _progressError;
  String _progressView = 'daily'; // daily | monthly

  @override
  void initState() {
    super.initState();
    _loadStudents();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchCtrl.dispose();
    _gradeValueCtrl.dispose();
    _gradeFeedbackCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadStudents() async {
    setState(() {
      _loadingStudents = true;
      _studentsError = null;
    });
    try {
      final list = await ref.read(teacherApiServiceProvider).getStudents(search: _searchCtrl.text, className: _classFilter);
      if (!mounted) return;
      setState(() {
        _students = list;
        _page = 0;
        if (_selectedStudentId != null && !list.any((s) => s['id']?.toString() == _selectedStudentId)) {
          _selectedStudentId = null;
          _selectedStudentName = null;
          _homework = [];
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _studentsError = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loadingStudents = false);
    }
  }

  void _onSearchChanged(String _) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), _loadStudents);
  }

  void _clearSelection() {
    setState(() {
      _selectedStudentId = null;
      _selectedStudentName = null;
      _homework = [];
      _homeworkStatusFilter = 'all';
      _expandedGradeId = null;
      _subjectProgress = null;
      _progressHasData = true;
      _progressError = null;
    });
  }

  Future<void> _selectStudent(Map<String, dynamic> s) async {
    setState(() {
      _selectedStudentId = s['id']?.toString();
      _selectedStudentName = s['name']?.toString() ?? 'Student';
      _homeworkStatusFilter = 'all';
      _expandedGradeId = null;
    });
    await Future.wait([_loadHomework(), _loadSubjectProgress()]);
  }

  Future<void> _loadHomework() async {
    final id = _selectedStudentId;
    if (id == null) return;
    setState(() {
      _loadingHomework = true;
      _homeworkError = null;
    });
    try {
      final list = await ref.read(teacherApiServiceProvider).getStudentHomework(id);
      list.sort((a, b) {
        final aTs = _parseDate(a['startAt'] ?? a['createdAt'] ?? a['dueAt']) ?? DateTime(0);
        final bTs = _parseDate(b['startAt'] ?? b['createdAt'] ?? b['dueAt']) ?? DateTime(0);
        return bTs.compareTo(aTs);
      });
      if (!mounted) return;
      setState(() => _homework = list);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _homeworkError = e.toString().replaceFirst('Exception: ', '');
        _homework = [];
      });
    } finally {
      if (mounted) setState(() => _loadingHomework = false);
    }
  }

  Future<void> _loadSubjectProgress() async {
    final id = _selectedStudentId;
    if (id == null) return;
    setState(() {
      _loadingProgress = true;
      _progressError = null;
    });
    try {
      final json = await ref.read(teacherApiServiceProvider).getStudentSubjectProgress(id);
      if (!mounted) return;
      setState(() {
        _subjectProgress = json == null ? null : SubjectProgress.fromJson(json);
        _progressHasData = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _progressError = e.toString().replaceFirst('Exception: ', '');
        _subjectProgress = null;
        _progressHasData = false;
      });
    } finally {
      if (mounted) setState(() => _loadingProgress = false);
    }
  }


  void _startGrade(Map<String, dynamic> hw) {
    final id = hw['id']?.toString();
    setState(() {
      if (_expandedGradeId == id) {
        _expandedGradeId = null;
        return;
      }
      _expandedGradeId = id;
      _gradeValueCtrl.text = hw['grade'] != null ? hw['grade'].toString() : '';
      _gradeFeedbackCtrl.text = hw['feedback']?.toString() ?? '';
    });
  }

  Future<void> _submitGrade(String hwId) async {
    if (_gradeValueCtrl.text.trim().isEmpty && _gradeFeedbackCtrl.text.trim().isEmpty) return;
    setState(() => _gradingBusy = true);
    try {
      await ref.read(teacherApiServiceProvider).gradeHomework(
            hwId,
            grade: int.tryParse(_gradeValueCtrl.text.trim()),
            feedback: _gradeFeedbackCtrl.text.trim().isEmpty ? null : _gradeFeedbackCtrl.text.trim(),
          );
      _gradeValueCtrl.clear();
      _gradeFeedbackCtrl.clear();
      if (mounted) setState(() => _expandedGradeId = null);
      await _loadHomework();
    } catch (e) {
      if (!mounted) return;
      setState(() => _homeworkError = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _gradingBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final classOptions = ref.watch(teacherClassOptionsProvider).value ?? const <String>[];
    final int pageCount = _students.isEmpty ? 1 : (_students.length / _studentsPageSize).ceil();
    final int clampedPage = _page < 0 ? 0 : (_page > pageCount - 1 ? pageCount - 1 : _page);
    final paged = _students.skip(clampedPage * _studentsPageSize).take(_studentsPageSize).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Frame3dCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Students', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
                const SizedBox(height: 4),
                const Text('Filter by class, select a student, and view their homework status.', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                const SizedBox(height: 12),
                TextField(
                  controller: _searchCtrl,
                  onChanged: _onSearchChanged,
                  decoration: const InputDecoration(hintText: 'Search students by name', prefixIcon: Icon(Icons.search_rounded, size: 18)),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        decoration: BoxDecoration(border: Border.all(color: AppColors.line), borderRadius: BorderRadius.circular(8)),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _classFilter,
                            isExpanded: true,
                            items: [
                              const DropdownMenuItem(value: 'all', child: Text('All classes', style: TextStyle(fontSize: 13))),
                              for (final c in classOptions) DropdownMenuItem(value: c, child: Text(c, style: const TextStyle(fontSize: 13))),
                            ],
                            onChanged: (v) {
                              if (v == null) return;
                              setState(() => _classFilter = v);
                              _loadStudents();
                            },
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    _Frame3dButton(onTap: _clearSelection, child: const Text('Clear Selection')),
                  ],
                ),
                const SizedBox(height: 10),
                if (_studentsError != null)
                  Text(_studentsError!, style: const TextStyle(fontSize: 12, color: AppColors.danger))
                else if (!_loadingStudents && paged.isEmpty)
                  const Text('No students available yet for this class.', style: TextStyle(fontSize: 12, color: AppColors.muted))
                else
                  for (final s in paged) _StudentRow(student: s, selected: _selectedStudentId == s['id']?.toString(), onTap: () => _selectStudent(s)),
                if (_students.length > _studentsPageSize) ...[
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _Frame3dButton(
                        onTap: clampedPage == 0 ? null : () => setState(() => _page = clampedPage - 1),
                        child: const Text('\u2190 Previous'),
                      ),
                      Text('Page ${clampedPage + 1} of $pageCount', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                      _Frame3dButton(
                        onTap: clampedPage >= pageCount - 1 ? null : () => setState(() => _page = clampedPage + 1),
                        child: const Text('Next \u2192'),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),
          _Frame3dCard(
            child: _HomeworkStatusPanel(
              students: _students,
              selectedStudentId: _selectedStudentId,
              selectedStudentName: _selectedStudentName,
              onSelectStudent: (id) {
                final s = _students.firstWhere((s) => s['id']?.toString() == id, orElse: () => const {});
                if (s.isNotEmpty) _selectStudent(s);
              },
              homework: _homework,
              loading: _loadingHomework,
              error: _homeworkError,
              statusFilter: _homeworkStatusFilter,
              onStatusFilterChanged: (v) => setState(() => _homeworkStatusFilter = v),
              expandedGradeId: _expandedGradeId,
              onStartGrade: _startGrade,
              gradeValueCtrl: _gradeValueCtrl,
              gradeFeedbackCtrl: _gradeFeedbackCtrl,
              gradingBusy: _gradingBusy,
              onSubmitGrade: _submitGrade,
              onCancelGrade: () => setState(() => _expandedGradeId = null),
            ),
          ),
          const SizedBox(height: 14),
          _Frame3dCard(
            child: _ProgressSnapshotPanel(
              selectedStudentId: _selectedStudentId,
              selectedStudentName: _selectedStudentName,
              subject: _subjectProgress,
              hasData: _progressHasData,
              loading: _loadingProgress,
              error: _progressError,
              view: _progressView,
              onViewChanged: (v) => setState(() => _progressView = v),
            ),
          ),
        ],
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  final Map<String, dynamic> student;
  final bool selected;
  final VoidCallback onTap;

  const _StudentRow({required this.student, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = student['name']?.toString() ?? 'Student';
    final className = student['className']?.toString() ?? 'Class';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? AppColors.brandSoft : AppColors.background,
            borderRadius: BorderRadius.circular(10),
            border: selected ? Border.all(color: AppColors.brand, width: 1.5) : null,
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                    Text(className, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                  ],
                ),
              ),
              Checkbox(value: selected, onChanged: (_) => onTap()),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeworkStatusPanel extends StatelessWidget {
  final List<Map<String, dynamic>> students;
  final String? selectedStudentId;
  final String? selectedStudentName;
  final ValueChanged<String> onSelectStudent;
  final List<Map<String, dynamic>> homework;
  final bool loading;
  final String? error;
  final String statusFilter;
  final ValueChanged<String> onStatusFilterChanged;
  final String? expandedGradeId;
  final ValueChanged<Map<String, dynamic>> onStartGrade;
  final TextEditingController gradeValueCtrl;
  final TextEditingController gradeFeedbackCtrl;
  final bool gradingBusy;
  final ValueChanged<String> onSubmitGrade;
  final VoidCallback onCancelGrade;

  const _HomeworkStatusPanel({
    required this.students,
    required this.selectedStudentId,
    required this.selectedStudentName,
    required this.onSelectStudent,
    required this.homework,
    required this.loading,
    required this.error,
    required this.statusFilter,
    required this.onStatusFilterChanged,
    required this.expandedGradeId,
    required this.onStartGrade,
    required this.gradeValueCtrl,
    required this.gradeFeedbackCtrl,
    required this.gradingBusy,
    required this.onSubmitGrade,
    required this.onCancelGrade,
  });

  bool _isSubmitted(Map<String, dynamic> h) {
    final due = (h['dueStatus']?.toString() ?? '').toLowerCase();
    final status = (h['status']?.toString() ?? '').toLowerCase();
    return due == 'submitted' || status == 'submitted' || status == 'graded';
  }

  bool _isOverdue(Map<String, dynamic> h) => (h['dueStatus']?.toString() ?? '').toLowerCase() == 'overdue';

  /// Steps to the previous/next student in `students` — mirrors web's
  /// `goToAdjacentStudent(delta)` exactly (clamped, no wraparound).
  void _goToAdjacent(int delta) {
    if (students.isEmpty) return;
    final currentIndex = students.indexWhere((s) => s['id']?.toString() == selectedStudentId);
    final baseIndex = currentIndex == -1 ? 0 : currentIndex;
    final nextIndex = (baseIndex + delta).clamp(0, students.length - 1);
    final id = students[nextIndex]['id']?.toString();
    if (id != null) onSelectStudent(id);
  }

  @override
  Widget build(BuildContext context) {
    final selectedIndex = students.indexWhere((s) => s['id']?.toString() == selectedStudentId);
    final submitted = homework.where(_isSubmitted).length;
    final notSubmitted = homework.length - submitted;
    final overdue = homework.where(_isOverdue).length;

    final filtered = homework.where((h) {
      if (statusFilter == 'submitted') return _isSubmitted(h);
      if (statusFilter == 'not-submitted') return !_isSubmitted(h);
      if (statusFilter == 'overdue') return _isOverdue(h);
      return true;
    }).toList();
    final visible = statusFilter == 'all' ? filtered.take(5).toList() : filtered;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Homework Status', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(border: Border.all(color: AppColors.line), borderRadius: BorderRadius.circular(8)),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: selectedStudentId,
              isExpanded: true,
              hint: const Text('Select a student to view homework', style: TextStyle(fontSize: 13, color: AppColors.muted)),
              items: [
                for (final s in students)
                  DropdownMenuItem(
                    value: s['id']?.toString(),
                    child: Text('${s['name'] ?? 'Student'} \u00b7 ${s['className'] ?? ''}', style: const TextStyle(fontSize: 13)),
                  ),
              ],
              onChanged: (v) {
                if (v != null) onSelectStudent(v);
              },
            ),
          ),
        ),
        if (students.length > 1) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _Frame3dButton(onTap: selectedIndex <= 0 ? null : () => _goToAdjacent(-1), child: const Text('\u2190 Prev')),
              const SizedBox(width: 10),
              Text('${selectedIndex + 1}/${students.length}', style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700)),
              const SizedBox(width: 10),
              _Frame3dButton(
                onTap: (selectedIndex == -1 || selectedIndex >= students.length - 1) ? null : () => _goToAdjacent(1),
                child: const Text('Next \u2192'),
              ),
            ],
          ),
        ],
        const SizedBox(height: 10),
        Text(
          selectedStudentId != null ? '\ud83d\udcdd All homework for ${selectedStudentName ?? 'student'}' : 'Select a student to view homework.',
          style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
        ),
        if (error != null) ...[
          const SizedBox(height: 8),
          Text(error!, style: const TextStyle(fontSize: 12, color: AppColors.danger)),
        ],
        if (selectedStudentId != null && homework.isNotEmpty) ...[
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatusChip(label: 'Submitted', count: submitted, on: statusFilter == 'submitted', onColor: AppColors.ok, onTap: () => onStatusFilterChanged(statusFilter == 'submitted' ? 'all' : 'submitted')),
              _StatusChip(label: 'Not submitted', count: notSubmitted, on: statusFilter == 'not-submitted', onColor: AppColors.danger, onTap: () => onStatusFilterChanged(statusFilter == 'not-submitted' ? 'all' : 'not-submitted')),
              _StatusChip(label: 'Overdue', count: overdue, on: statusFilter == 'overdue', onColor: AppColors.warn, onTap: () => onStatusFilterChanged(statusFilter == 'overdue' ? 'all' : 'overdue')),
            ],
          ),
        ],
        const SizedBox(height: 10),
        if (selectedStudentId == null)
          const SizedBox()
        else if (!loading && homework.isEmpty)
          const Text('No homework assigned to this student yet.', style: TextStyle(fontSize: 12, color: AppColors.muted))
        else
          for (final hw in visible)
            _HomeworkStatusTile(
              homework: hw,
              expanded: expandedGradeId == hw['id']?.toString(),
              onToggleGrade: () => onStartGrade(hw),
              gradeValueCtrl: gradeValueCtrl,
              gradeFeedbackCtrl: gradeFeedbackCtrl,
              busy: gradingBusy,
              onSubmit: () => onSubmitGrade(hw['id']?.toString() ?? ''),
              onCancel: onCancelGrade,
            ),
      ],
    );
  }
}

/// Mirrors web's "Progress Snapshot" card: same shared `selectedStudentId`
/// (here via its own dropdown, matching Homework Status's pattern), the
/// score ring + Daily/Monthly toggle + growth line from
/// `TeacherSubjectProgressChart.jsx`, reusing the Student portal's existing
/// chart widgets (`RingGauge`/`GrowthLineChart`) since web explicitly mirrors
/// that same chart for the teacher view.
class _ProgressSnapshotPanel extends StatelessWidget {
  final String? selectedStudentId;
  final String? selectedStudentName;
  final SubjectProgress? subject;
  final bool hasData;
  final bool loading;
  final String? error;
  final String view;
  final ValueChanged<String> onViewChanged;

  const _ProgressSnapshotPanel({
    required this.selectedStudentId,
    required this.selectedStudentName,
    required this.subject,
    required this.hasData,
    required this.loading,
    required this.error,
    required this.view,
    required this.onViewChanged,
  });

  @override
  Widget build(BuildContext context) {
    final series = view == 'monthly' ? subject?.monthly ?? const [] : subject?.daily ?? const [];
    final active = series.any((p) => (p.value ?? 0) > 0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Progress Snapshot', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: Text(
                selectedStudentId != null ? '\ud83d\udcca ${selectedStudentName ?? 'student'}' : 'Select a student to see metrics.',
                style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
              ),
            ),
            if (subject != null)
              Row(
                children: [
                  _Frame3dButton(
                    onTap: () => onViewChanged('daily'),
                    background: view == 'daily' ? AppColors.brand : AppColors.background,
                    foreground: view == 'daily' ? Colors.white : AppColors.muted,
                    child: const Text('Daily'),
                  ),
                  const SizedBox(width: 6),
                  _Frame3dButton(
                    onTap: () => onViewChanged('monthly'),
                    background: view == 'monthly' ? AppColors.brand : AppColors.background,
                    foreground: view == 'monthly' ? Colors.white : AppColors.muted,
                    child: const Text('Monthly'),
                  ),
                ],
              ),
          ],
        ),
        if (error != null) ...[
          const SizedBox(height: 8),
          Text(error!, style: const TextStyle(fontSize: 12, color: AppColors.danger)),
        ],
        if (selectedStudentId != null && subject != null) ...[
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              RingGauge(
                diameter: 76,
                strokeWidth: 8,
                fraction: subject!.score / 100,
                color: subject!.accent,
                child: Text.rich(
                  TextSpan(
                    text: '${subject!.score}',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: subject!.accent),
                    children: const [TextSpan(text: '%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700))],
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${subject!.emoji} ${subject!.name}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: subject!.accent.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(999)),
                      child: Text(subject!.statusLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: subject!.accent)),
                    ),
                    if (subject!.status != 'not-started' && subject!.trend != 0) ...[
                      const SizedBox(height: 4),
                      Text(
                        '${subject!.trend > 0 ? '\u25b2' : '\u25bc'} ${subject!.trend.abs()}% this month',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: subject!.trend > 0 ? AppColors.ok : AppColors.danger),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (series.isEmpty || !active)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 24),
              alignment: Alignment.center,
              child: const Column(
                children: [
                  Text('\ud83d\udcc8', style: TextStyle(fontSize: 32)),
                  SizedBox(height: 8),
                  Text(
                    'No activity yet \u2014 the growth line appears here once this student studies the subject.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ],
              ),
            )
          else
            GrowthLineChart(points: series, maxY: 100, gridVals: const [25, 50, 75, 100], color: subject!.accent, mode: view, percentSuffix: true),
          if (subject!.tip.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text('\ud83d\udca1 ${subject!.tip}', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ],
        ] else if (selectedStudentId != null && !loading) ...[
          const SizedBox(height: 10),
          const Text('No progress data yet.', style: TextStyle(fontSize: 12, color: AppColors.muted)),
        ],
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final int count;
  final bool on;
  final Color onColor;
  final VoidCallback onTap;

  const _StatusChip({required this.label, required this.count, required this.on, required this.onColor, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return _Frame3dButton(
      onTap: onTap,
      background: on ? onColor : onColor.withValues(alpha: 0.15),
      foreground: on ? Colors.white : onColor,
      child: Text('$label: $count'),
    );
  }
}

class _HomeworkStatusTile extends StatelessWidget {
  final Map<String, dynamic> homework;
  final bool expanded;
  final VoidCallback onToggleGrade;
  final TextEditingController gradeValueCtrl;
  final TextEditingController gradeFeedbackCtrl;
  final bool busy;
  final VoidCallback onSubmit;
  final VoidCallback onCancel;

  const _HomeworkStatusTile({
    required this.homework,
    required this.expanded,
    required this.onToggleGrade,
    required this.gradeValueCtrl,
    required this.gradeFeedbackCtrl,
    required this.busy,
    required this.onSubmit,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final title = homework['title']?.toString() ?? 'Homework';
    final subject = homework['subject']?.toString() ?? '';
    final dueStatus = (homework['dueStatus']?.toString() ?? homework['status']?.toString() ?? '').toLowerCase();
    final grade = homework['grade'];
    final attemptCount = (homework['attemptCount'] as num?)?.toInt() ?? 0;
    final remark = homework['remark']?.toString();
    final canGrade = dueStatus == 'submitted' || dueStatus == 'overdue' || dueStatus == 'pending';
    final badgeColor = dueStatus == 'submitted' ? AppColors.ok : (dueStatus == 'overdue' ? AppColors.danger : AppColors.warn);

    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(10)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                    Text('$subject \u00b7 Due ${_shortDate(homework['dueAt'])}', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: badgeColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(999)),
                child: Text(dueStatus.isEmpty ? 'pending' : dueStatus, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: badgeColor)),
              ),
            ],
          ),
          if (remark != null && remark.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(remark, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
          ],
          const SizedBox(height: 6),
          Row(
            children: [
              Text('Grade: ${grade != null ? '$grade/100' : '\u2014'}', style: const TextStyle(fontSize: 11, color: AppColors.text)),
              const SizedBox(width: 12),
              Text('Attempts: $attemptCount', style: const TextStyle(fontSize: 11, color: AppColors.text)),
              const Spacer(),
              if (canGrade) _Frame3dButton(onTap: onToggleGrade, child: Text(expanded ? 'Cancel' : 'Grade')),
            ],
          ),
          if (expanded) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: const Color(0xFFFEF3C7), border: Border.all(color: const Color(0xFFFCD34D)), borderRadius: BorderRadius.circular(8)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: gradeValueCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(hintText: 'Score (0-100)', isDense: true, filled: true, fillColor: Colors.white),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: gradeFeedbackCtrl,
                    maxLines: 2,
                    decoration: const InputDecoration(hintText: 'Feedback for student', isDense: true, filled: true, fillColor: Colors.white),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      _Frame3dButton(onTap: onCancel, background: AppColors.danger, foreground: Colors.white, child: const Text('Cancel')),
                      const SizedBox(width: 8),
                      _Frame3dButton(onTap: busy ? null : onSubmit, background: AppColors.ok, foreground: Colors.white, child: Text(busy ? 'Submitting...' : 'Submit')),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

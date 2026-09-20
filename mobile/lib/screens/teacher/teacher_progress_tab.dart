import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/learning_score.dart';
import '../../state/teacher_providers.dart';
import '../../theme/app_colors.dart';
import '../student/student_progress_screen.dart';

/// The site-wide "3D button/card" frame — duplicated per-file per this
/// codebase's convention (see `teacher_shell.dart`/`teacher_students_tab.dart`).
const Color _frame3dColor = Color(0xFF46464E);

Border _frame3dBorder({double alpha = 0.35, double width = 1.5}) => Border.all(
  color: _frame3dColor.withValues(alpha: alpha),
  width: width,
);

List<BoxShadow> _frame3dShadow({double alpha = 0.18, double blur = 10}) => [
  BoxShadow(
    color: Colors.black.withValues(alpha: alpha),
    blurRadius: blur,
    offset: const Offset(0, 4),
  ),
];

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

class _Frame3dButton extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;

  const _Frame3dButton({required this.child, required this.onTap});

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
            color: disabled
                ? AppColors.card.withValues(alpha: 0.5)
                : AppColors.card,
            borderRadius: BorderRadius.circular(999),
            border: _frame3dBorder(alpha: _pressed ? 0.45 : 0.25),
            boxShadow: _pressed ? [] : _frame3dShadow(alpha: 0.12, blur: 6),
          ),
          child: DefaultTextStyle(
            style: const TextStyle(
              color: AppColors.text,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}

const int _studentsPageSize = 5;

/// Teacher tab body for the "Student Progress" bottom-nav icon — mirrors
/// web's `activeSection === 'progress'` block in `TeacherDashboard.jsx`: a
/// Students picker on one side, and the exact same "My Learning Report"
/// (`StudentProgress.jsx`) on the other for whichever student is selected,
/// fetched via the teacher-scoped learning-score endpoint.
class TeacherProgressTab extends ConsumerStatefulWidget {
  const TeacherProgressTab({super.key});

  @override
  ConsumerState<TeacherProgressTab> createState() => _TeacherProgressTabState();
}

class _TeacherProgressTabState extends ConsumerState<TeacherProgressTab> {
  final _searchCtrl = TextEditingController();
  String _classFilter = 'all';
  int _page = 0;
  Timer? _searchDebounce;

  List<Map<String, dynamic>> _students = [];
  bool _loadingStudents = true;
  String? _studentsError;

  String? _selectedStudentId;
  String? _selectedStudentName;
  LearningScoreData? _report;
  bool _loadingReport = false;
  String? _reportError;
  String _trendView = 'daily';
  String _subjView = 'daily';

  @override
  void initState() {
    super.initState();
    _loadStudents();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadStudents() async {
    setState(() {
      _loadingStudents = true;
      _studentsError = null;
    });
    try {
      final list = await ref
          .read(teacherApiServiceProvider)
          .getStudents(search: _searchCtrl.text, className: _classFilter);
      if (!mounted) return;
      setState(() {
        _students = list;
        _page = 0;
        if (_selectedStudentId != null &&
            !list.any((s) => s['id']?.toString() == _selectedStudentId)) {
          _selectedStudentId = null;
          _selectedStudentName = null;
          _report = null;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(
        () => _studentsError = e.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      if (mounted) setState(() => _loadingStudents = false);
    }
  }

  void _onSearchChanged(String _) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), _loadStudents);
  }

  Future<void> _selectStudent(Map<String, dynamic> s) async {
    setState(() {
      _selectedStudentId = s['id']?.toString();
      _selectedStudentName = s['name']?.toString() ?? 'Student';
      _reportError = null;
    });
    await _loadReport();
  }

  Future<void> _loadReport() async {
    final id = _selectedStudentId;
    if (id == null) return;
    setState(() {
      _loadingReport = true;
      _reportError = null;
    });
    try {
      final data = await ref
          .read(teacherApiServiceProvider)
          .getStudentLearningScore(id);
      if (!mounted) return;
      setState(() => _report = data);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _reportError = e.toString().replaceFirst('Exception: ', '');
        _report = null;
      });
    } finally {
      if (mounted) setState(() => _loadingReport = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final classOptions =
        ref.watch(teacherClassOptionsProvider).value ?? const <String>[];
    final int pageCount = _students.isEmpty
        ? 1
        : (_students.length / _studentsPageSize).ceil();
    final int clampedPage = _page < 0
        ? 0
        : (_page > pageCount - 1 ? pageCount - 1 : _page);
    final paged = _students
        .skip(clampedPage * _studentsPageSize)
        .take(_studentsPageSize)
        .toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Frame3dCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Students',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Select a student to see their full progress report \u2014 every subject, just like they see it.',
                  style: TextStyle(fontSize: 12, color: AppColors.muted),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _searchCtrl,
                  onChanged: _onSearchChanged,
                  decoration: const InputDecoration(
                    hintText: 'Search students by name',
                    prefixIcon: Icon(Icons.search_rounded, size: 18),
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.line),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _classFilter,
                      isExpanded: true,
                      items: [
                        const DropdownMenuItem(
                          value: 'all',
                          child: Text(
                            'All classes',
                            style: TextStyle(fontSize: 13),
                          ),
                        ),
                        for (final c in classOptions)
                          DropdownMenuItem(
                            value: c,
                            child: Text(
                              c,
                              style: const TextStyle(fontSize: 13),
                            ),
                          ),
                      ],
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => _classFilter = v);
                        _loadStudents();
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                if (_studentsError != null)
                  Text(
                    _studentsError!,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.danger,
                    ),
                  )
                else if (!_loadingStudents && paged.isEmpty)
                  const Text(
                    'No students available yet for this class.',
                    style: TextStyle(fontSize: 12, color: AppColors.muted),
                  )
                else
                  for (final s in paged)
                    _ProgressStudentRow(
                      student: s,
                      selected: _selectedStudentId == s['id']?.toString(),
                      onTap: () => _selectStudent(s),
                    ),
                if (_students.length > _studentsPageSize) ...[
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _Frame3dButton(
                        onTap: clampedPage == 0
                            ? null
                            : () => setState(() => _page = clampedPage - 1),
                        child: const Text('\u2190 Previous'),
                      ),
                      Text(
                        'Page ${clampedPage + 1} of $pageCount',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.muted,
                        ),
                      ),
                      _Frame3dButton(
                        onTap: clampedPage >= pageCount - 1
                            ? null
                            : () => setState(() => _page = clampedPage + 1),
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
            child: _selectedStudentId == null
                ? const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Text(
                      'Select a student above to see their full progress report.',
                      style: TextStyle(fontSize: 13, color: AppColors.muted),
                    ),
                  )
                : _loadingReport && _report == null
                ? const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(child: CircularProgressIndicator()),
                  )
                : _reportError != null
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Column(
                      children: [
                        Text(
                          _reportError!,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.danger,
                          ),
                        ),
                        const SizedBox(height: 10),
                        _Frame3dButton(
                          onTap: _loadReport,
                          child: const Text('Try again'),
                        ),
                      ],
                    ),
                  )
                : _report == null
                ? const SizedBox()
                : Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: LearningReportBody(
                      data: _report!,
                      greetingName: _selectedStudentName,
                      trendView: _trendView,
                      subjView: _subjView,
                      onTrendViewChange: (v) => setState(() => _trendView = v),
                      onSubjViewChange: (v) => setState(() => _subjView = v),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _ProgressStudentRow extends StatelessWidget {
  final Map<String, dynamic> student;
  final bool selected;
  final VoidCallback onTap;

  const _ProgressStudentRow({
    required this.student,
    required this.selected,
    required this.onTap,
  });

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
            border: selected
                ? Border.all(color: AppColors.brand, width: 1.5)
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
              Text(
                className,
                style: const TextStyle(fontSize: 11, color: AppColors.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

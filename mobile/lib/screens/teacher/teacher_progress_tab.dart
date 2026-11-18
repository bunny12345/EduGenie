import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/learning_score.dart';
import '../../models/report_card.dart';
import '../../state/teacher_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';
import '../../widgets/teacher_class_filter.dart';
import '../student/student_progress_screen.dart';
import '../student/progress/exam_results_journey.dart';
import '../student/student_report_card_screen.dart' show ReportCardSheet;

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
        color: AppColors.of(context).card,
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
                ? AppColors.of(context).card.withValues(alpha: 0.5)
                : AppColors.of(context).card,
            borderRadius: BorderRadius.circular(999),
            border: _frame3dBorder(alpha: _pressed ? 0.45 : 0.25),
            boxShadow: _pressed ? [] : _frame3dShadow(alpha: 0.12, blur: 6),
          ),
          child: DefaultTextStyle(
            style: TextStyle(
              color: AppColors.of(context).text,
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

/// A searchable student picker and a teacher-scoped learning report.
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
  Timer? _progressRefresh;

  List<Map<String, dynamic>> _students = [];
  bool _loadingStudents = true;
  String? _studentsError;

  String? _selectedStudentId;
  String? _selectedStudentName;
  LearningScoreData? _report;
  bool _loadingReport = false;
  int _reportRequest = 0;
  int _studentsRequest = 0;
  String? _reportError;
  String _trendView = 'daily';
  String _subjView = 'daily';
  bool _choosingStudent = true;
  LearningReportSection _section = LearningReportSection.score;

  @override
  void initState() {
    super.initState();
    _loadStudents();
    _progressRefresh = Timer.periodic(const Duration(minutes: 1), (_) {
      if (!_loadingReport) _loadReport();
    });
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _progressRefresh?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadStudents() async {
    final request = ++_studentsRequest;
    setState(() {
      _loadingStudents = true;
      _studentsError = null;
    });
    try {
      final list = await ref
          .read(teacherApiServiceProvider)
          .getStudents(search: _searchCtrl.text, className: _classFilter);
      if (!mounted || request != _studentsRequest) return;
      setState(() {
        _students = list;
        _page = 0;
        if (_selectedStudentId != null &&
            !list.any((s) => s['id']?.toString() == _selectedStudentId)) {
          _selectedStudentId = null;
          _selectedStudentName = null;
          _report = null;
          _choosingStudent = true;
        }
      });
    } catch (e) {
      if (!mounted || request != _studentsRequest) return;
      setState(
        () => _studentsError = e.toString().replaceFirst('Exception: ', ''),
      );
    } finally {
      if (mounted && request == _studentsRequest) {
        setState(() => _loadingStudents = false);
      }
    }
  }

  void _onSearchChanged(String _) {
    _searchDebounce?.cancel();
    ++_studentsRequest;
    setState(() {
      _loadingStudents = true;
      _studentsError = null;
    });
    _searchDebounce = Timer(const Duration(milliseconds: 350), _loadStudents);
  }

  Future<void> _selectStudent(Map<String, dynamic> s) async {
    FocusScope.of(context).unfocus();
    setState(() {
      _choosingStudent = false;
      _section = LearningReportSection.score;
      _selectedStudentId = s['id']?.toString();
      _selectedStudentName = s['name']?.toString() ?? 'Student';
      _reportError = null;
      _report = null;
    });
    await _loadReport();
  }

  Future<void> _loadReport() async {
    final id = _selectedStudentId;
    if (id == null) return;
    final request = ++_reportRequest;
    setState(() {
      _loadingReport = true;
      _reportError = null;
    });
    try {
      final data = await ref
          .read(teacherApiServiceProvider)
          .getStudentLearningScore(id);
      if (!mounted || request != _reportRequest || id != _selectedStudentId) {
        return;
      }
      setState(() => _report = data);
    } catch (e) {
      if (!mounted || request != _reportRequest || id != _selectedStudentId) {
        return;
      }
      setState(() {
        _reportError = e.toString().replaceFirst('Exception: ', '');
        _report = null;
      });
    } finally {
      if (mounted && request == _reportRequest) {
        setState(() => _loadingReport = false);
      }
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

    final studentId = _selectedStudentId;
    if (!_choosingStudent && studentId != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: SectionCard(
              padding: EdgeInsets.zero,
              child: Material(
                type: MaterialType.transparency,
                child: ListTile(
                  leading: const Icon(Icons.person_outline_rounded),
                  title: Text(_selectedStudentName ?? 'Student'),
                  subtitle: const Text('Change student'),
                  trailing: const Icon(Icons.swap_horiz_rounded),
                  onTap: () => setState(() => _choosingStudent = true),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: LearningReportTabs(
              selected: _section,
              onChanged: (section) => setState(() => _section = section),
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              key: ValueKey((studentId, _section)),
              child: _section == LearningReportSection.exams
                  ? Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          ExamResultsJourneyPanel(studentId: studentId),
                          _StudentReportCardsSection(
                            studentId: studentId,
                            studentName: _selectedStudentName ?? 'Student',
                          ),
                        ],
                      ),
                    )
                  : _reportError != null
                  ? Padding(
                      padding: const EdgeInsets.all(16),
                      child: SectionCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            ErrorInline(message: _reportError!),
                            TextButton(
                              onPressed: _loadReport,
                              child: const Text('Try again'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : _report == null
                  ? const Padding(
                      padding: EdgeInsets.all(16),
                      child: Column(
                        children: [
                          SkeletonBox(height: 110),
                          SkeletonBox(height: 240),
                        ],
                      ),
                    )
                  : LearningReportBody(
                      data: _report!,
                      greetingName: _selectedStudentName,
                      trendView: _trendView,
                      subjView: _subjView,
                      onTrendViewChange: (v) => setState(() => _trendView = v),
                      onSubjViewChange: (v) => setState(() => _subjView = v),
                      section: _section,
                    ),
            ),
          ),
        ],
      );
    }

    return SingleChildScrollView(
      key: const PageStorageKey('teacher-progress-roster'),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Frame3dCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Choose a student',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.of(context).text,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Choose a class or search by name to open a learning report.',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.of(context).muted,
                  ),
                ),
                const SizedBox(height: 12),
                TeacherClassFilter(
                  options: classOptions,
                  value: _classFilter,
                  onChanged: (value) {
                    _searchDebounce?.cancel();
                    setState(() => _classFilter = value);
                    _loadStudents();
                  },
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _searchCtrl,
                  onChanged: _onSearchChanged,
                  decoration: const InputDecoration(
                    hintText: 'Search students by name',
                    prefixIcon: Icon(Icons.search_rounded, size: 18),
                  ),
                ),
                if (studentId != null)
                  TextButton(
                    onPressed: () {
                      FocusScope.of(context).unfocus();
                      setState(() => _choosingStudent = false);
                    },
                    child: const Text('Back to report'),
                  ),
                const SizedBox(height: 10),
                if (_studentsError != null) ...[
                  ErrorInline(message: _studentsError!),
                  TextButton(
                    onPressed: _loadStudents,
                    child: const Text('Try again'),
                  ),
                ] else if (_loadingStudents) ...[
                  const SkeletonBox(height: 44),
                  const SkeletonBox(height: 44),
                  const SkeletonBox(height: 44),
                ] else if (!_loadingStudents && paged.isEmpty)
                  Text(
                    'No students match your search and class filter.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.of(context).muted,
                    ),
                  )
                else
                  for (final s in paged)
                    _ProgressStudentRow(
                      student: s,
                      selected: _selectedStudentId == s['id']?.toString(),
                      onTap: () => _selectStudent(s),
                    ),
                if (!_loadingStudents &&
                    _studentsError == null &&
                    _students.length > _studentsPageSize) ...[
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
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.of(context).muted,
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
        ],
      ),
    );
  }
}

/// Released report cards for the selected student, under their progress
/// report — mirrors the embedded `StudentReportCard` block in web's
/// `TeacherDashboard.jsx`. Also lists exams still waiting on subjects, so a
/// teacher knows what is outstanding before a parent-teacher meeting.
class _StudentReportCardsSection extends ConsumerStatefulWidget {
  final String studentId;
  final String studentName;

  const _StudentReportCardsSection({
    required this.studentId,
    required this.studentName,
  });

  @override
  ConsumerState<_StudentReportCardsSection> createState() =>
      _StudentReportCardsSectionState();
}

class _StudentReportCardsSectionState
    extends ConsumerState<_StudentReportCardsSection> {
  String? _selectedExamId;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(
      teacherStudentReportCardsProvider(widget.studentId),
    );
    return _Frame3dCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            '🎓 Report Cards',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 2),
          Text(
            "${widget.studentName}'s released exam results \u2014 handy for parent-teacher meetings.",
            style: TextStyle(fontSize: 12, color: AppColors.of(context).muted),
          ),
          const SizedBox(height: 12),
          async.when(
            loading: () => const SkeletonBox(height: 220),
            error: (e, _) => ErrorInline(
              message: e.toString().replaceFirst('Exception: ', ''),
            ),
            data: (data) {
              final cards = (data['reportCards'] as List? ?? [])
                  .map(
                    (r) => ReportCard.fromJson(
                      Map<String, dynamic>.from(r as Map),
                    ),
                  )
                  .toList();
              final pending = (data['pending'] as List? ?? []).cast<Map>();
              final card = cards.isEmpty
                  ? null
                  : cards.firstWhere(
                      (c) => c.examId == _selectedExamId,
                      orElse: () => cards.first,
                    );
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (pending.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF8E6),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFF5B942)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (final p in pending)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 2),
                              child: Text(
                                '\u23F3 ${p['examName']} \u2014 ${p['entered']} of ${p['total']} subjects entered \u00b7 waiting for ${(p['missingSubjects'] as List).join(', ')}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Color(0xFF7A5200),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  if (card == null)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Text(
                        'No report card has been released for this student yet. It appears once every subject teacher has added marks.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.of(context).muted,
                        ),
                      ),
                    )
                  else ...[
                    if (cards.length > 1)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final c in cards)
                              ChoiceChip(
                                label: Text(c.examName),
                                selected: c.examId == card.examId,
                                selectedColor: AppColors.brand,
                                labelStyle: TextStyle(
                                  color: c.examId == card.examId
                                      ? Colors.white
                                      : AppColors.of(context).text,
                                  fontWeight: FontWeight.w700,
                                ),
                                onSelected: (_) =>
                                    setState(() => _selectedExamId = c.examId),
                              ),
                          ],
                        ),
                      ),
                    ReportCardSheet(
                      card: card,
                      studentName: widget.studentName,
                      teacherView: true,
                    ),
                  ],
                ],
              );
            },
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
            color: selected
                ? AppColors.of(context).brandSoft
                : AppColors.of(context).background,
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
                style: TextStyle(
                  fontSize: 11,
                  color: AppColors.of(context).muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

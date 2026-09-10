import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/homework_item.dart';
import '../../../state/session_provider.dart';
import '../../../state/student_providers.dart';
import '../../../theme/app_colors.dart';
import '../test_taking_screen.dart';
import 'homework_history_calendar.dart';
import 'homework_state.dart';
import 'lightbox.dart';
import '../../../widgets/pressable_scale.dart';

enum _HwFilter { all, submitted, notSubmitted, overdue }

/// Muted per-subject header/border theme — ports `getSubjectTheme()` in
/// `StudentDashboard.jsx` (kept separate from `SubjectPalette`, which mirrors
/// the brighter `SubjectIcon` stroke colors instead).
class _SubjectTheme {
  final Color color;
  final Color border;
  const _SubjectTheme({required this.color, required this.border});
}

_SubjectTheme _subjectTheme(String subject) {
  final s = subject.toLowerCase();
  if (s.contains('math')) return const _SubjectTheme(color: Color(0xFF7A6B1A), border: Color(0xFFE8D89A));
  if (s.contains('science') || s.contains('physics') || s.contains('chemistry')) {
    return const _SubjectTheme(color: Color(0xFF0A7550), border: Color(0xFFA7F3D0));
  }
  if (s.contains('bio')) return const _SubjectTheme(color: Color(0xFF166534), border: Color(0xFFBBF7D0));
  if (s.contains('english') || s.contains('language') || s.contains('literature')) {
    return const _SubjectTheme(color: Color(0xFF9B1D5D), border: Color(0xFFF5C0D5));
  }
  if (s.contains('history') || s.contains('social')) return const _SubjectTheme(color: Color(0xFF5B21B6), border: Color(0xFFDDD6FE));
  if (s.contains('hindi') || s.contains('telugu') || s.contains('sanskrit') || s.contains('urdu') || s.contains('tamil') || s.contains('kannada')) {
    final warm = s.contains('hindi') || s.contains('sanskrit') || s.contains('urdu');
    return warm
        ? const _SubjectTheme(color: Color(0xFF92400E), border: Color(0xFFE8C49E))
        : const _SubjectTheme(color: Color(0xFF065F46), border: Color(0xFFA7F3D0));
  }
  if (s.contains('geo')) return const _SubjectTheme(color: Color(0xFF5B21B6), border: Color(0xFFD1C8F0));
  if (s.contains('computer') || s.contains('coding') || s.contains('programming')) {
    return const _SubjectTheme(color: Color(0xFF1E40AF), border: Color(0xFFBFDBFE));
  }
  return const _SubjectTheme(color: Color(0xFF3B3080), border: Color(0xFFD4CCFF));
}

IconData _subjectIconData(String subject) {
  final s = subject.toLowerCase();
  if (s.contains('math')) return Icons.calculate_rounded;
  if (s.contains('science') || s.contains('physics') || s.contains('chemistry')) return Icons.science_rounded;
  if (s.contains('bio')) return Icons.eco_rounded;
  if (s.contains('english') || s.contains('language') || s.contains('literature')) return Icons.menu_book_rounded;
  if (s.contains('history') || s.contains('social')) return Icons.account_balance_rounded;
  if (s.contains('hindi') || s.contains('telugu') || s.contains('sanskrit') || s.contains('urdu') || s.contains('tamil') || s.contains('kannada')) {
    return Icons.translate_rounded;
  }
  if (s.contains('geo')) return Icons.public_rounded;
  if (s.contains('computer') || s.contains('coding') || s.contains('programming')) return Icons.code_rounded;
  if (s.contains('art') || s.contains('draw')) return Icons.palette_rounded;
  if (s.contains('music')) return Icons.music_note_rounded;
  return Icons.menu_book_rounded;
}

/// Bright per-subject glow color — ports the `accent` field of `PALETTES` in
/// `SubjectBackground.jsx` (the `--subject-glow` CSS var used for the 3D
/// button frame's colored glow on hover/active/selected chips).
Color _subjectAccent(String subject) {
  final s = subject.toLowerCase();
  if (s.contains('math')) return const Color(0xFFB8860B);
  if (s.contains('physics')) return const Color(0xFF5B6ABF);
  if (s.contains('chemistry')) return const Color(0xFF3B82C4);
  if (s.contains('science')) return const Color(0xFF10B981);
  if (s.contains('bio')) return const Color(0xFF22C55E);
  if (s.contains('english') || s.contains('language') || s.contains('literature')) return const Color(0xFFD63384);
  if (s.contains('hindi') || s.contains('sanskrit') || s.contains('urdu')) return const Color(0xFFD97706);
  if (s.contains('telugu') || s.contains('tamil') || s.contains('kannada')) return const Color(0xFF0D9E6B);
  if (s.contains('history') || s.contains('social') || s.contains('geo')) return const Color(0xFF7C5BE6);
  if (s.contains('computer') || s.contains('coding') || s.contains('programming')) return const Color(0xFF3B82F6);
  return const Color(0xFF5B47FF);
}

/// Homework — mirrors web's per-subject Homework tab in `StudentDashboard.jsx`
/// exactly: subject switcher, submitted/not-submitted/overdue filter chips,
/// "View history by date" mini calendar, expandable teacher instructions +
/// attachments, submission form (text + images) with a resubmit window, and
/// expandable teacher feedback.
class HomeworkScreen extends ConsumerStatefulWidget {
  const HomeworkScreen({super.key});

  @override
  ConsumerState<HomeworkScreen> createState() => _HomeworkScreenState();
}

class _HomeworkScreenState extends ConsumerState<HomeworkScreen> {
  String? _selectedSubject;
  _HwFilter _filter = _HwFilter.all;
  bool _showHistory = false;
  String? _historyFromDate;
  late int _historyYear;
  late int _historyMonth;

  final Set<String> _expandedTeacherInfo = {};
  final Set<String> _expandedSubmission = {};
  final Set<String> _expandedFeedback = {};
  final Set<String> _editingResubmit = {};

  final Map<String, TextEditingController> _answerControllers = {};
  final Map<String, List<String>> _attachmentUrls = {};
  final Map<String, bool> _uploading = {};
  final Map<String, bool> _submitting = {};
  final Map<String, String> _infoById = {};

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _historyYear = now.year;
    _historyMonth = now.month - 1;
  }

  @override
  void dispose() {
    for (final c in _answerControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _answerCtrlFor(HomeworkItem h) {
    return _answerControllers.putIfAbsent(h.id, () => TextEditingController(text: h.latestAnswerText ?? ''));
  }

  List<String> _attachmentsFor(HomeworkItem h) {
    return _attachmentUrls.putIfAbsent(h.id, () => List<String>.from(h.latestAttachmentUrls));
  }

  Future<void> _pickAndUploadImages(HomeworkItem h) async {
    final picked = await ImagePicker().pickMultiImage(imageQuality: 80, limit: 6);
    if (picked.isEmpty) return;
    setState(() {
      _uploading[h.id] = true;
      _infoById[h.id] = 'Uploading ${picked.length} image${picked.length == 1 ? '' : 's'}...';
    });
    final urls = <String>[];
    for (final file in picked) {
      try {
        final bytes = await file.readAsBytes();
        final mimeType = file.mimeType ?? 'image/jpeg';
        final dataUrl = 'data:$mimeType;base64,${base64Encode(bytes)}';
        final url = await ref.read(studentApiServiceProvider).uploadHomeworkImage(fileName: file.name, mimeType: mimeType, dataUrl: dataUrl);
        if (url.isNotEmpty) urls.add(url);
      } catch (_) {
        // best-effort — keep going with remaining images
      }
    }
    if (!mounted) return;
    setState(() {
      _uploading[h.id] = false;
      if (urls.isNotEmpty) {
        _attachmentsFor(h).addAll(urls);
        _infoById[h.id] = urls.length == picked.length ? 'Uploaded ${urls.length} image${urls.length == 1 ? '' : 's'}.' : 'Uploaded ${urls.length}/${picked.length} image(s).';
      } else {
        _infoById[h.id] = 'Image upload failed. Please try again.';
      }
    });
  }

  void _removeAttachment(HomeworkItem h, String url) {
    setState(() => _attachmentsFor(h).remove(url));
  }

  Future<void> _submit(HomeworkItem h) async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;
    if (_uploading[h.id] == true) {
      setState(() => _infoById[h.id] = 'Please wait for image upload to finish before submitting.');
      return;
    }
    setState(() {
      _submitting[h.id] = true;
      _infoById[h.id] = 'Submitting homework...';
    });
    try {
      final res = await ref.read(studentApiServiceProvider).submitHomework(
            h.id,
            studentId,
            answerText: _answerCtrlFor(h).text.trim(),
            attachmentUrls: _attachmentsFor(h),
          );
      ref.invalidate(homeworkProvider);
      if (!mounted) return;
      setState(() {
        _infoById[h.id] = 'Submitted successfully. Grade: ${res['grade'] ?? '-'}';
        _editingResubmit.remove(h.id);
        _expandedSubmission.remove(h.id);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _infoById[h.id] = 'Submit failed: $e');
    } finally {
      if (mounted) setState(() => _submitting[h.id] = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(studentSubjectsProvider);
    final homeworkAsync = ref.watch(homeworkProvider);
    final testsAsync = ref.watch(testsProvider);
    _selectedSubject ??= subjects.isNotEmpty ? subjects.first : null;
    final theme = _subjectTheme(_selectedSubject ?? '');
    final iconColor = SubjectPalette.colorFor(_selectedSubject ?? '');

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7FC),
      appBar: AppBar(title: const Text('Homework')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(homeworkProvider);
          ref.invalidate(testsProvider);
        },
        child: subjects.isEmpty
            ? ListView(padding: const EdgeInsets.all(16), children: const [Text('No subjects yet.', style: TextStyle(color: Color(0xFF6B7280), fontSize: 13))])
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  SizedBox(
                    height: 48,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: subjects.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, i) {
                        final s = subjects[i];
                        final active = s == _selectedSubject;
                        final pendingCount = homeworkAsync.value == null
                            ? 0
                            : homeworkAsync.value!.where((h) => h.subject == s && !homeworkState(h).submitted && !homeworkState(h).hide).length;
                        return _SubjectPillChip(
                          label: s,
                          active: active,
                          notifyCount: pendingCount,
                          onTap: () => setState(() {
                            _selectedSubject = s;
                            _filter = _HwFilter.all;
                            _showHistory = false;
                            _historyFromDate = null;
                          }),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: theme.border, width: 1.5),
                      boxShadow: [BoxShadow(color: theme.color.withValues(alpha: 0.16), blurRadius: 14, offset: const Offset(0, 4))],
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(color: theme.color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14)),
                          alignment: Alignment.center,
                          child: Icon(_subjectIconData(_selectedSubject ?? ''), size: 26, color: iconColor),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(_selectedSubject ?? '', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: theme.color)),
                              const SizedBox(height: 2),
                              Text('Homework & Tests', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: theme.color.withValues(alpha: 0.65))),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  homeworkAsync.when(
                    loading: () => const SizedBox.shrink(),
                    error: (e, _) => Text('Unable to load homework: $e', style: const TextStyle(color: Colors.red, fontSize: 12)),
                    data: (all) {
                      final subjectHomework = all.where((h) => h.subject == _selectedSubject).toList();
                      final visible = subjectHomework.where((h) => !homeworkState(h).hide).toList();
                      final latestFive = visible.take(5).toList();

                      final submittedCount = visible.where((h) => homeworkState(h).submitted).length;
                      final notSubmittedCount = visible.where((h) => !homeworkState(h).submitted).length;
                      final overdueCount = visible.where((h) => homeworkState(h).overdue && !homeworkState(h).submitted).length;

                      final filtered = visible.where((h) {
                        final st = homeworkState(h);
                        switch (_filter) {
                          case _HwFilter.submitted:
                            return st.submitted;
                          case _HwFilter.notSubmitted:
                            return !st.submitted;
                          case _HwFilter.overdue:
                            return st.overdue && !st.submitted;
                          case _HwFilter.all:
                            return true;
                        }
                      }).toList();
                      final cardsToShow = _filter == _HwFilter.all ? latestFive : filtered;

                      return Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: theme.border, width: 1.5),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text('${_selectedSubject ?? ''} Homework', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Color(0xFF111827))),
                                ),
                                TextButton(
                                  onPressed: () => setState(() => _showHistory = !_showHistory),
                                  child: Text(_showHistory ? 'Hide history' : 'Open history'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 10,
                              runSpacing: 8,
                              children: [
                                _FilterPill(
                                  label: 'Submitted: $submittedCount',
                                  active: _filter == _HwFilter.submitted,
                                  activeColor: const Color(0xFF16A34A),
                                  inactiveBg: const Color(0xFFDCFCE7),
                                  inactiveColor: const Color(0xFF166534),
                                  onTap: () => setState(() => _filter = _filter == _HwFilter.submitted ? _HwFilter.all : _HwFilter.submitted),
                                ),
                                _FilterPill(
                                  label: 'Not submitted: $notSubmittedCount',
                                  active: _filter == _HwFilter.notSubmitted,
                                  activeColor: const Color(0xFFDC2626),
                                  inactiveBg: const Color(0xFFFEE2E2),
                                  inactiveColor: const Color(0xFF991B1B),
                                  onTap: () => setState(() => _filter = _filter == _HwFilter.notSubmitted ? _HwFilter.all : _HwFilter.notSubmitted),
                                ),
                                _FilterPill(
                                  label: 'Overdue: $overdueCount',
                                  active: _filter == _HwFilter.overdue,
                                  activeColor: const Color(0xFFC2410C),
                                  inactiveBg: const Color(0xFFFFEDD5),
                                  inactiveColor: const Color(0xFF9A3412),
                                  onTap: () => setState(() => _filter = _filter == _HwFilter.overdue ? _HwFilter.all : _HwFilter.overdue),
                                ),
                              ],
                            ),
                            if (_showHistory) ...[
                              const SizedBox(height: 12),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(border: Border.all(color: const Color(0xFFE5E7EB)), borderRadius: BorderRadius.circular(10), color: const Color(0xFFFAFAFA)),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        const Text('📅 View history by date', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF334155))),
                                        TextButton(
                                          onPressed: () => setState(() {
                                            _showHistory = false;
                                            _historyFromDate = null;
                                          }),
                                          child: const Text('Close'),
                                        ),
                                      ],
                                    ),
                                    HomeworkHistoryCalendar(
                                      allHomework: subjectHomework,
                                      year: _historyYear,
                                      month: _historyMonth,
                                      selectedDate: _historyFromDate,
                                      onPrevMonth: () => setState(() {
                                        final d = DateTime(_historyYear, _historyMonth, 1);
                                        _historyYear = d.year;
                                        _historyMonth = d.month - 1;
                                      }),
                                      onNextMonth: () => setState(() {
                                        final d = DateTime(_historyYear, _historyMonth + 2, 1);
                                        _historyYear = d.year;
                                        _historyMonth = d.month - 1;
                                      }),
                                      onSelectDate: (iso) => setState(() => _historyFromDate = _historyFromDate == iso ? null : iso),
                                    ),
                                    const SizedBox(height: 10),
                                    if (_historyFromDate == null)
                                      const Padding(
                                        padding: EdgeInsets.symmetric(vertical: 12),
                                        child: Center(child: Text('Pick a date above to see homework assigned on that day.', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)))),
                                      )
                                    else
                                      ..._historyResultsFor(subjectHomework),
                                  ],
                                ),
                              ),
                            ],
                            const SizedBox(height: 12),
                            if (cardsToShow.isEmpty)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Text(
                                  switch (_filter) {
                                    _HwFilter.submitted => 'No submitted homework in this panel.',
                                    _HwFilter.notSubmitted => 'No not-submitted homework in this panel.',
                                    _HwFilter.overdue => 'No overdue homework in this panel.',
                                    _HwFilter.all => 'No homework in this panel.',
                                  },
                                  style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                                ),
                              )
                            else
                              for (final h in cardsToShow) _HomeworkCard(
                                homework: h,
                                expandedTeacherInfo: _expandedTeacherInfo.contains(h.id),
                                expandedSubmission: _expandedSubmission.contains(h.id),
                                expandedFeedback: _expandedFeedback.contains(h.id),
                                editingResubmit: _editingResubmit.contains(h.id),
                                answerCtrl: _answerCtrlFor(h),
                                pendingAttachments: _attachmentsFor(h),
                                uploading: _uploading[h.id] == true,
                                submitting: _submitting[h.id] == true,
                                info: _infoById[h.id],
                                onToggleTeacherInfo: () => setState(() => _toggle(_expandedTeacherInfo, h.id)),
                                onToggleSubmission: () => setState(() => _toggle(_expandedSubmission, h.id)),
                                onToggleFeedback: () => setState(() => _toggle(_expandedFeedback, h.id)),
                                onStartEditResubmit: () => setState(() => _editingResubmit.add(h.id)),
                                onCancelEditResubmit: () => setState(() {
                                  _editingResubmit.remove(h.id);
                                  _attachmentUrls[h.id] = [];
                                }),
                                onPickImages: () => _pickAndUploadImages(h),
                                onRemoveImage: (url) => _removeAttachment(h, url),
                                onSubmit: () => _submit(h),
                              ),
                            if (visible.isEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text('No homework assigned for this subject.', style: const TextStyle(color: Color(0xFF999999), fontSize: 13)),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                  testsAsync.when(
                    loading: () => const SizedBox.shrink(),
                    error: (e, _) => Text('Unable to load tests: $e', style: const TextStyle(color: Colors.red, fontSize: 12)),
                    data: (tests) {
                      final subjectTests = tests.where((t) => t.subject == _selectedSubject).toList();
                      return Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: theme.border, width: 1.5),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(Icons.assignment_turned_in_rounded, size: 18, color: iconColor),
                                const SizedBox(width: 8),
                                Text('${_selectedSubject ?? ''} Mock Tests', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF111827))),
                              ],
                            ),
                            const SizedBox(height: 10),
                            if (subjectTests.isEmpty)
                              const Text('No tests available for this subject.', style: TextStyle(color: Color(0xFF64748B), fontSize: 13))
                            else
                              for (final t in subjectTests)
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 6),
                                  child: Row(
                                    children: [
                                      Expanded(child: Text(t.title, style: const TextStyle(fontSize: 13, color: Color(0xFF334155)))),
                                      const SizedBox(width: 10),
                                      PressableScale(
                                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TestTakingScreen(test: t))),
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                                          decoration: BoxDecoration(color: iconColor, borderRadius: BorderRadius.circular(999)),
                                          child: const Text('Start', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                          ],
                        ),
                      );
                    },
                  ),
                ],
              ),
      ),
    );
  }

  void _toggle(Set<String> set, String id) {
    if (set.contains(id)) {
      set.remove(id);
    } else {
      set.add(id);
    }
  }

  List<Widget> _historyResultsFor(List<HomeworkItem> subjectHomework) {
    final filtered = subjectHomework.where((h) {
      final raw = h.startAt ?? h.dueAt;
      final d = raw == null ? null : DateTime.tryParse(raw);
      if (d == null) return false;
      final iso = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      return iso == _historyFromDate;
    }).toList();
    if (filtered.isEmpty) {
      return [Text('No homework assigned on $_historyFromDate.', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)))];
    }
    return [for (final h in filtered) _HistoryResultCard(homework: h)];
  }
}

class _SubjectPillChip extends StatelessWidget {
  final String label;
  final bool active;
  final int notifyCount;
  final VoidCallback onTap;

  const _SubjectPillChip({required this.label, required this.active, this.notifyCount = 0, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = _subjectTheme(label);
    final accent = _subjectAccent(label);
    final iconColor = SubjectPalette.colorFor(label);
    final frameColor = active ? accent.withValues(alpha: 0.8) : const Color(0xFF46464E).withValues(alpha: 0.4);
    return PressableScale(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
        decoration: BoxDecoration(
          color: active ? Color.alphaBlend(theme.color.withValues(alpha: 0.08), Colors.white) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: frameColor, width: 1.5),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: active ? 0.1 : 0.16), blurRadius: 10, offset: const Offset(0, 4)),
            if (active) BoxShadow(color: accent.withValues(alpha: 0.32), blurRadius: 8),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: active ? theme.color.withValues(alpha: 0.1) : const Color(0xFFF3F4F6),
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: Icon(_subjectIconData(label), size: 16, color: iconColor),
            ),
            const SizedBox(width: 8),
            Text(label, style: TextStyle(fontSize: 13, fontWeight: active ? FontWeight.w700 : FontWeight.w600, color: active ? theme.color : const Color(0xFF4B5563))),
            if (notifyCount > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: const BoxDecoration(color: Color(0xFFEF4444), shape: BoxShape.circle),
                constraints: const BoxConstraints(minWidth: 18),
                alignment: Alignment.center,
                child: Text('$notifyCount', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  final String label;
  final bool active;
  final Color activeColor;
  final Color inactiveBg;
  final Color inactiveColor;
  final VoidCallback onTap;

  const _FilterPill({required this.label, required this.active, required this.activeColor, required this.inactiveBg, required this.inactiveColor, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(color: active ? activeColor : inactiveBg, borderRadius: BorderRadius.circular(999)),
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: active ? Colors.white : inactiveColor)),
      ),
    );
  }
}

class _HistoryResultCard extends StatelessWidget {
  final HomeworkItem homework;

  const _HistoryResultCard({required this.homework});

  @override
  Widget build(BuildContext context) {
    final st = homeworkState(homework);
    final isSubmitted = st.submitted;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isSubmitted ? const Color(0xFFF0FDF4) : const Color(0xFFFFF1F2),
        border: Border.all(color: isSubmitted ? const Color(0xFF16A34A) : const Color(0xFFDC2626), width: 2),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(homework.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Color(0xFF111827)))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(color: isSubmitted ? const Color(0xFFDCFCE7) : const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(999)),
                child: Text(isSubmitted ? '✅ Submitted' : '❌ Not submitted', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: isSubmitted ? const Color(0xFF16A34A) : const Color(0xFFDC2626))),
              ),
            ],
          ),
          if (homework.note != null && homework.note!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: Colors.white, border: Border.all(color: const Color(0xFFE5E7EB)), borderRadius: BorderRadius.circular(6)),
              child: Text(homework.note!, style: const TextStyle(fontSize: 12, color: Color(0xFF374151))),
            ),
          ],
        ],
      ),
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  final HomeworkItem homework;
  final bool expandedTeacherInfo;
  final bool expandedSubmission;
  final bool expandedFeedback;
  final bool editingResubmit;
  final TextEditingController answerCtrl;
  final List<String> pendingAttachments;
  final bool uploading;
  final bool submitting;
  final String? info;
  final VoidCallback onToggleTeacherInfo;
  final VoidCallback onToggleSubmission;
  final VoidCallback onToggleFeedback;
  final VoidCallback onStartEditResubmit;
  final VoidCallback onCancelEditResubmit;
  final VoidCallback onPickImages;
  final void Function(String) onRemoveImage;
  final VoidCallback onSubmit;

  const _HomeworkCard({
    required this.homework,
    required this.expandedTeacherInfo,
    required this.expandedSubmission,
    required this.expandedFeedback,
    required this.editingResubmit,
    required this.answerCtrl,
    required this.pendingAttachments,
    required this.uploading,
    required this.submitting,
    required this.info,
    required this.onToggleTeacherInfo,
    required this.onToggleSubmission,
    required this.onToggleFeedback,
    required this.onStartEditResubmit,
    required this.onCancelEditResubmit,
    required this.onPickImages,
    required this.onRemoveImage,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    final h = homework;
    final st = homeworkState(h);

    DateTime? lastSubmittedAt = h.lastAttemptAt != null ? DateTime.tryParse(h.lastAttemptAt!) : (h.submittedAt != null ? DateTime.tryParse(h.submittedAt!) : null);
    const resubmitWindow = Duration(hours: 1);
    final remainingResubmit = lastSubmittedAt != null
        ? (lastSubmittedAt.add(resubmitWindow).difference(DateTime.now()))
        : (st.submitted ? resubmitWindow : Duration.zero);
    final canResubmitWindow = st.submitted && remainingResubmit > Duration.zero;
    final canResubmit = canResubmitWindow && editingResubmit;
    final showForm = !st.submitted || canResubmit;

    // NOTE: a single BoxDecoration can't mix a borderRadius with per-side
    // border colors ("A borderRadius can only be given on borders with
    // uniform colors."). Fix: put the radius+shadow on the OUTER container
    // (uniform light border) and the colored accent stripe on an INNER
    // container's left BorderSide only (no radius there, so no restriction).
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFECE8FF)),
        boxShadow: const [BoxShadow(color: Color(0x0F272D64), blurRadius: 12, offset: Offset(0, 4))],
      ),
      child: Container(
        padding: const EdgeInsets.fromLTRB(18, 14, 14, 14),
        decoration: BoxDecoration(
                color: st.overdue && !st.submitted ? const Color(0xFFFFF1F2) : const Color(0xFFF8F8FF),
                border: Border(left: BorderSide(color: st.color, width: 4)),
              ),
                child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: onToggleTeacherInfo,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 8,
                runSpacing: 4,
                children: [
                  Text(h.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  for (final lt in h.lessonTitles)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(999)),
                      child: Text('📖 $lt', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF4338CA))),
                    ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: st.bg, borderRadius: BorderRadius.circular(999)),
                    child: Text(st.label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: st.color)),
                  ),
                  Text(expandedTeacherInfo ? 'Hide homework instructions' : '...', style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
          if (expandedTeacherInfo && h.note != null && h.note!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(h.note!, style: const TextStyle(color: Color(0xFF444444), fontSize: 14, height: 1.5)),
          ],
          if (expandedTeacherInfo && h.attachmentUrls.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Text('📎 Teacher attachment:', style: TextStyle(fontSize: 11, color: Color(0xFF888888))),
            const SizedBox(height: 4),
            _ImageThumbRow(urls: h.attachmentUrls, borderColor: const Color(0xFFDDDDDD)),
          ],
          if (st.submitted && (h.latestAttachmentUrls.isNotEmpty || (h.latestAnswerText ?? '').isNotEmpty)) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(color: const Color(0xFFF8FAFC), border: Border.all(color: const Color(0xFFE2E8F0)), borderRadius: BorderRadius.circular(8)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextButton(onPressed: onToggleSubmission, child: Text(expandedSubmission ? 'Hide your submission homework' : 'Show your submission homework')),
                  if (expandedSubmission) ...[
                    if (h.latestAttachmentUrls.isNotEmpty) ...[
                      const Text('✅ Submitted images:', style: TextStyle(fontSize: 11, color: Color(0xFF166534))),
                      const SizedBox(height: 6),
                      _ImageThumbRow(urls: h.latestAttachmentUrls, borderColor: const Color(0xFF16A34A), borderWidth: 2),
                    ],
                    if ((h.latestAnswerText ?? '').isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(h.latestAnswerText!, style: const TextStyle(fontSize: 12, color: Color(0xFF334155), height: 1.5)),
                    ],
                  ],
                ],
              ),
            ),
          ],
          if (showForm) ...[
            const SizedBox(height: 10),
            const Text('Your written answer', style: TextStyle(fontSize: 12, color: Color(0xFF475569), fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            TextField(
              controller: answerCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'Write your answer here (this will be visible to your teacher).',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                filled: true,
                fillColor: Colors.white,
              ),
            ),
            const SizedBox(height: 10),
            PressableScale(
              onTap: uploading ? null : onPickImages,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: const Color(0xFFECE8FF)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.add_photo_alternate_outlined, size: 18, color: Color(0xFF5B47FF)),
                    const SizedBox(width: 6),
                    Text(uploading ? 'Uploading…' : 'Add photos', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF5B47FF))),
                  ],
                ),
              ),
            ),
            if (pendingAttachments.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('${pendingAttachments.length} image(s) selected', style: const TextStyle(fontSize: 12, color: Color(0xFF666666))),
                  TextButton(onPressed: () {
                    for (final u in List<String>.from(pendingAttachments)) {
                      onRemoveImage(u);
                    }
                  }, child: const Text('Remove all')),
                ],
              ),
              _ImageThumbRow(urls: pendingAttachments, borderColor: const Color(0xFF7C3AED), borderWidth: 2, onRemove: onRemoveImage),
            ],
            if (canResubmitWindow && editingResubmit) ...[
              const SizedBox(height: 6),
              Align(alignment: Alignment.centerRight, child: TextButton(onPressed: onCancelEditResubmit, child: const Text('Cancel edit'))),
            ],
            const SizedBox(height: 10),
            PressableScale(
              onTap: submitting ? null : onSubmit,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 13),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  gradient: const LinearGradient(colors: [Color(0xFF6D5EFC), Color(0xFF4B3FB8)]),
                  boxShadow: const [BoxShadow(color: Color(0x3D5A46C8), blurRadius: 16, offset: Offset(0, 6))],
                ),
                child: submitting
                    ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(canResubmit ? 'Resubmit' : 'Submit', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14)),
              ),
            ),
          ] else if (canResubmitWindow) ...[
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    'Resubmit available for ${remainingResubmit.inMinutes} more minute${remainingResubmit.inMinutes == 1 ? '' : 's'}',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF1D4ED8), fontWeight: FontWeight.w600),
                  ),
                ),
                TextButton(onPressed: onStartEditResubmit, child: const Text('Edit resubmission')),
              ],
            ),
          ],
          if (info != null && info!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(info!, style: const TextStyle(fontSize: 12, color: Color(0xFF475569))),
          ],
          if ((h.grade != null || (h.feedback ?? '').isNotEmpty)) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: const Color(0xFFEEF6FF), border: Border.all(color: const Color(0xFFCFE0FF)), borderRadius: BorderRadius.circular(8)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Teacher feedback', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF1D4ED8))),
                      TextButton(onPressed: onToggleFeedback, child: Text(expandedFeedback ? 'Hide feedback' : 'Show feedback')),
                    ],
                  ),
                  if (expandedFeedback) ...[
                    if (h.grade != null) Text('Grade: ${h.grade}/100', style: const TextStyle(fontSize: 12, color: Color(0xFF1F2937))),
                    if ((h.feedback ?? '').isNotEmpty) Text(h.feedback!, style: const TextStyle(fontSize: 12, color: Color(0xFF374151), height: 1.4)),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            [
              if (h.startAt != null) '📅 Start: ${_fmt(h.startAt)}',
              if (h.dueAt != null) '⏰ Due: ${_fmt(h.dueAt)}',
            ].join('   '),
            style: const TextStyle(fontSize: 11, color: Color(0xFF888888)),
          ),
          if (!st.submitted && st.overdue) ...[
            const SizedBox(height: 6),
            Text(
              '⚠ Not submitted yet — ${st.expired ? 'hidden after 3 overdue days' : 'submit before it disappears'}',
              style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ],
        ],
              ),
      ),
    );
  }

  String _fmt(String? iso) {
    final d = iso == null ? null : DateTime.tryParse(iso);
    if (d == null) return '-';
    return '${d.day}/${d.month}/${d.year}';
  }
}

class _ImageThumbRow extends StatelessWidget {
  final List<String> urls;
  final Color borderColor;
  final double borderWidth;
  final void Function(String)? onRemove;

  const _ImageThumbRow({required this.urls, required this.borderColor, this.borderWidth = 1, this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final url in urls)
          Stack(
            clipBehavior: Clip.none,
            children: [
              GestureDetector(
                onTap: () => showImageLightbox(context, url),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Container(
                    decoration: BoxDecoration(border: Border.all(color: borderColor, width: borderWidth)),
                    child: Image.network(url, width: 64, height: 64, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(width: 64, height: 64, color: const Color(0xFFEEEEEE))),
                  ),
                ),
              ),
              if (onRemove != null)
                Positioned(
                  top: -6,
                  right: -6,
                  child: GestureDetector(
                    onTap: () => onRemove!(url),
                    child: Container(
                      width: 18,
                      height: 18,
                      decoration: const BoxDecoration(color: Color(0xFFEF4444), shape: BoxShape.circle),
                      alignment: Alignment.center,
                      child: const Icon(Icons.close_rounded, size: 12, color: Colors.white),
                    ),
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

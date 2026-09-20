import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../state/teacher_providers.dart';
import '../../theme/app_colors.dart';

String _normalizeClassName(String value) => value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

bool _sameClass(dynamic value, String targetClass) => _normalizeClassName(value?.toString() ?? '') == _normalizeClassName(targetClass);

DateTime? _parseDate(dynamic value) {
  if (value == null) return null;
  return DateTime.tryParse(value.toString());
}

/// yyyy-MM-dd bucket for a homework row — mirrors `getHomeworkHistoryDate()`
/// in `TeacherDashboard.jsx` (start date, falling back to created date).
String _dateKey(Map<String, dynamic> item) {
  final d = _parseDate(item['startAt'] ?? item['start_at']) ?? _parseDate(item['createdAt'] ?? item['created_at']);
  return d == null ? '' : DateFormat('yyyy-MM-dd').format(d);
}

/// Sort key for a homework row — mirrors `getHomeworkHistoryLabel()`.
DateTime? _historyLabel(Map<String, dynamic> item) {
  return _parseDate(item['startAt'] ?? item['start_at']) ?? _parseDate(item['createdAt'] ?? item['created_at']) ?? _parseDate(item['dueAt'] ?? item['due_at']);
}

List<String> _asUrlList(dynamic value, dynamic fallbackSingle) {
  if (value is List) {
    final list = value.map((v) => v?.toString().trim() ?? '').where((v) => v.isNotEmpty).toList();
    if (list.isNotEmpty) return list;
  }
  final single = fallbackSingle?.toString().trim() ?? '';
  return single.isNotEmpty ? [single] : [];
}

/// Stable identity for one assignment *group* (all students who received the
/// same homework) — mirrors `assignmentStableKey()` in `TeacherDashboard.jsx`.
String _assignmentStableKey(Map<String, dynamic> item) {
  final groupId = item['assignmentGroupId']?.toString().trim() ?? '';
  if (groupId.isNotEmpty) return groupId;
  return [
    item['subject']?.toString() ?? '',
    item['title']?.toString() ?? '',
    item['className'] ?? item['class_name'] ?? '',
    item['startAt'] ?? item['start_at'] ?? '',
    item['dueAt'] ?? item['due_at'] ?? '',
    item['createdAt'] ?? item['created_at'] ?? '',
  ].join('|');
}

/// The backend returns one homework row per student; collapse those into one
/// card per assignment group, keeping the most recently created row as the
/// representative — mirrors web's `loadHomeworkHistory()` dedup step.
List<Map<String, dynamic>> _dedupeAssignments(List<Map<String, dynamic>> items) {
  final byKey = <String, Map<String, dynamic>>{};
  for (final item in items) {
    final key = _assignmentStableKey(item);
    byKey[key] = item;
  }
  return byKey.values.toList();
}

/// True while the assignment is still active (mirrors web's auto-vanish rule:
/// once `dueAt` passes, it drops out of "Recently assigned" and only remains
/// visible via "View History").
bool _isAssignmentActive(Map<String, dynamic> item) {
  final due = _parseDate(item['dueAt'] ?? item['due_at']);
  return due == null || due.isAfter(DateTime.now());
}

/// Mirrors `announcementScheduleLabel()` in `TeacherDashboard.jsx`.
String _announcementScheduleLabel(Map<String, dynamic> a) {
  final start = _parseDate(a['startAt'] ?? a['start_at']);
  final end = _parseDate(a['endAt'] ?? a['end_at']);
  final fmt = DateFormat('MMM d, h:mm a');
  if (start != null && end != null) return 'Visible ${fmt.format(start)} \u2192 ${fmt.format(end)}';
  if (start != null) return 'Visible from ${fmt.format(start)}';
  if (end != null) return 'Visible until ${fmt.format(end)}';
  return 'Always visible';
}

Future<DateTime?> _pickDateTime(BuildContext context, {DateTime? initial}) async {
  final date = await showDatePicker(
    context: context,
    initialDate: initial ?? DateTime.now(),
    firstDate: DateTime.now().subtract(const Duration(days: 1)),
    lastDate: DateTime.now().add(const Duration(days: 365)),
  );
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(
    context: context,
    initialTime: initial != null ? TimeOfDay.fromDateTime(initial) : TimeOfDay.now(),
  );
  if (time == null) return date;
  return DateTime(date.year, date.month, date.day, time.hour, time.minute);
}

/// Teacher tab body — mirrors the website teacher sidebar's "Teacher" section
/// (`TeacherDashboard.jsx`'s `activeSection === 'teacher'` block): the Active
/// Class banner, then Announcements / Assign Homework / Mock Tests as
/// collapsible panels with the same fields and behavior as the website.
class TeacherHomeTab extends ConsumerWidget {
  const TeacherHomeTab({super.key, required this.activeClassBanner});

  final Widget activeClassBanner;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final targetClass = ref.watch(teacherTargetClassProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          activeClassBanner,
          const SizedBox(height: 20),
          _AnnouncementsPanel(targetClass: targetClass),
          const SizedBox(height: 14),
          _AssignHomeworkPanel(targetClass: targetClass),
          const SizedBox(height: 14),
          _MockTestsPanel(targetClass: targetClass),
        ],
      ),
    );
  }
}

/// Collapsible card frame shared by all three panels — tap the header to
/// expand/collapse, mirroring the website's card layout in a mobile-friendly
/// accordion form.
class _SectionCard extends StatefulWidget {
  final String title;
  final Widget child;

  const _SectionCard({required this.title, required this.child});

  @override
  State<_SectionCard> createState() => _SectionCardState();
}

class _SectionCardState extends State<_SectionCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(widget.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.text)),
                  ),
                  AnimatedRotation(
                    turns: _expanded ? 0.5 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: const Icon(Icons.keyboard_arrow_down_rounded, color: AppColors.muted),
                  ),
                ],
              ),
            ),
          ),
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity, height: 0),
            secondChild: Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), child: widget.child),
            crossFadeState: _expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 180),
            sizeCurve: Curves.easeOut,
          ),
        ],
      ),
    );
  }
}

class _DateTimeField extends StatelessWidget {
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;

  const _DateTimeField({required this.label, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
        const SizedBox(height: 4),
        InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: () async {
            final picked = await _pickDateTime(context, initial: value);
            if (picked != null) onChanged(picked);
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            decoration: BoxDecoration(border: Border.all(color: AppColors.line), borderRadius: BorderRadius.circular(8)),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    value != null ? DateFormat('d MMM, h:mm a').format(value!) : 'dd/mm/yyyy, --:--',
                    style: TextStyle(fontSize: 12, color: value != null ? AppColors.text : AppColors.muted),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const Icon(Icons.calendar_today_rounded, size: 14, color: AppColors.muted),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ── Announcements ───────────────────────────────────────────────────────

class _AnnouncementsPanel extends ConsumerStatefulWidget {
  final String targetClass;

  const _AnnouncementsPanel({required this.targetClass});

  @override
  ConsumerState<_AnnouncementsPanel> createState() => _AnnouncementsPanelState();
}

class _AnnouncementsPanelState extends ConsumerState<_AnnouncementsPanel> {
  final _titleCtrl = TextEditingController();
  final _messageCtrl = TextEditingController();
  DateTime? _visibleFrom;
  DateTime? _visibleUntil;
  bool _posting = false;
  String? _error;

  String? _editingAnnId;
  final _editingTitleCtrl = TextEditingController();
  final _editingMessageCtrl = TextEditingController();
  DateTime? _editingVisibleFrom;
  DateTime? _editingVisibleUntil;
  bool _editingSaving = false;
  String? _editingError;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _messageCtrl.dispose();
    _editingTitleCtrl.dispose();
    _editingMessageCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_titleCtrl.text.trim().isEmpty || _messageCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Please enter both a title and a message.');
      return;
    }
    if (widget.targetClass == 'all') {
      setState(() => _error = 'Please select a class at the top of the page before posting an announcement.');
      return;
    }
    if (_visibleFrom != null && _visibleUntil != null && !_visibleUntil!.isAfter(_visibleFrom!)) {
      setState(() => _error = 'End time must be after the start time.');
      return;
    }
    setState(() {
      _posting = true;
      _error = null;
    });
    try {
      await ref.read(teacherApiServiceProvider).postAnnouncement(
            title: _titleCtrl.text.trim(),
            message: _messageCtrl.text.trim(),
            className: widget.targetClass,
            startAt: _visibleFrom?.toIso8601String(),
            endAt: _visibleUntil?.toIso8601String(),
          );
      _titleCtrl.clear();
      _messageCtrl.clear();
      setState(() {
        _visibleFrom = null;
        _visibleUntil = null;
      });
      ref.invalidate(teacherAnnouncementsProvider);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  void _startEdit(Map<String, dynamic> a) {
    setState(() {
      _editingAnnId = a['id']?.toString();
      _editingTitleCtrl.text = a['title']?.toString() ?? '';
      _editingMessageCtrl.text = a['message']?.toString() ?? '';
      _editingVisibleFrom = _parseDate(a['startAt'] ?? a['start_at']);
      _editingVisibleUntil = _parseDate(a['endAt'] ?? a['end_at']);
      _editingError = null;
    });
  }

  void _cancelEdit() {
    setState(() {
      _editingAnnId = null;
      _editingTitleCtrl.clear();
      _editingMessageCtrl.clear();
      _editingVisibleFrom = null;
      _editingVisibleUntil = null;
      _editingError = null;
    });
  }

  Future<void> _saveEdit() async {
    final id = _editingAnnId;
    if (id == null || _editingTitleCtrl.text.trim().isEmpty || _editingMessageCtrl.text.trim().isEmpty) return;
    if (_editingVisibleFrom != null && _editingVisibleUntil != null && !_editingVisibleUntil!.isAfter(_editingVisibleFrom!)) {
      setState(() => _editingError = 'End time must be after the start time.');
      return;
    }
    setState(() {
      _editingSaving = true;
      _editingError = null;
    });
    try {
      await ref.read(teacherApiServiceProvider).updateAnnouncement(
            id,
            title: _editingTitleCtrl.text.trim(),
            message: _editingMessageCtrl.text.trim(),
            className: widget.targetClass == 'all' ? null : widget.targetClass,
            startAt: _editingVisibleFrom?.toIso8601String(),
            endAt: _editingVisibleUntil?.toIso8601String(),
          );
      ref.invalidate(teacherAnnouncementsProvider);
      _cancelEdit();
    } catch (e) {
      setState(() => _editingError = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _editingSaving = false);
    }
  }

  Future<void> _deleteAnnouncement(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete announcement?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete', style: TextStyle(color: AppColors.danger))),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(teacherApiServiceProvider).deleteAnnouncement(id);
      if (_editingAnnId == id) _cancelEdit();
      ref.invalidate(teacherAnnouncementsProvider);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Unlike other panels, announcements have no useful "all classes" view —
    // show nothing until a specific class is selected.
    // Web only ever shows the 5 most recent per class — mirror that here too.
    final announcements = widget.targetClass == 'all'
        ? const <Map<String, dynamic>>[]
        : (ref.watch(teacherAnnouncementsProvider).value ?? const <Map<String, dynamic>>[])
            .where((a) => _sameClass(a['className'] ?? a['class_name'], widget.targetClass))
            .take(5)
            .toList();

    return _SectionCard(
      title: 'Announcements',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text.rich(
            TextSpan(
              text: 'Broadcast an update to ',
              style: const TextStyle(fontSize: 13, color: AppColors.muted),
              children: [
                TextSpan(
                  text: widget.targetClass == 'all' ? 'the selected class' : widget.targetClass,
                  style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text),
                ),
                const TextSpan(text: '.'),
              ],
            ),
          ),
          const SizedBox(height: 10),
          TextField(controller: _titleCtrl, decoration: const InputDecoration(hintText: 'Announcement title')),
          const SizedBox(height: 8),
          TextField(controller: _messageCtrl, maxLines: 3, decoration: const InputDecoration(hintText: 'Type announcement message')),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _DateTimeField(label: 'VISIBLE FROM (OPTIONAL)', value: _visibleFrom, onChanged: (v) => setState(() => _visibleFrom = v))),
              const SizedBox(width: 10),
              Expanded(child: _DateTimeField(label: 'VISIBLE UNTIL (OPTIONAL)', value: _visibleUntil, onChanged: (v) => setState(() => _visibleUntil = v))),
            ],
          ),
          const SizedBox(height: 6),
          const Text('Leave blank to post immediately and keep it visible indefinitely.', style: TextStyle(fontSize: 11, color: AppColors.muted)),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _posting ? null : _submit,
              child: Text(_posting
                  ? 'Posting...'
                  : widget.targetClass == 'all'
                      ? 'Select a class first'
                      : 'Post to ${widget.targetClass}'),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12)),
          ],
          const SizedBox(height: 14),
          if (announcements.isEmpty)
            Text(
              widget.targetClass == 'all' ? 'Select a class to see its announcements.' : 'No announcements posted yet.',
              style: const TextStyle(fontSize: 12, color: AppColors.muted),
            )
          else
            for (final a in announcements)
              _AnnouncementTile(
                announcement: a,
                onEdit: () => _startEdit(a),
                onDelete: () => _deleteAnnouncement(a['id']?.toString() ?? ''),
              ),
          if (_editingAnnId != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.brandSoft,
                border: Border.all(color: AppColors.brand, width: 2),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Edit Announcement', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  TextField(controller: _editingTitleCtrl, decoration: const InputDecoration(hintText: 'Announcement title')),
                  const SizedBox(height: 8),
                  TextField(controller: _editingMessageCtrl, maxLines: 3, decoration: const InputDecoration(hintText: 'Type announcement message')),
                  const SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: _DateTimeField(label: 'VISIBLE FROM (OPTIONAL)', value: _editingVisibleFrom, onChanged: (v) => setState(() => _editingVisibleFrom = v))),
                      const SizedBox(width: 10),
                      Expanded(child: _DateTimeField(label: 'VISIBLE UNTIL (OPTIONAL)', value: _editingVisibleUntil, onChanged: (v) => setState(() => _editingVisibleUntil = v))),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _editingSaving ? null : _cancelEdit,
                          child: const Text('Cancel'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 2,
                        child: ElevatedButton(
                          onPressed: _editingSaving ? null : _saveEdit,
                          child: Text(_editingSaving ? 'Saving...' : 'Save Changes'),
                        ),
                      ),
                    ],
                  ),
                  if (_editingError != null) ...[
                    const SizedBox(height: 8),
                    Text(_editingError!, style: const TextStyle(fontSize: 12, color: AppColors.danger)),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AnnouncementTile extends StatefulWidget {
  final Map<String, dynamic> announcement;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _AnnouncementTile({required this.announcement, required this.onEdit, required this.onDelete});

  @override
  State<_AnnouncementTile> createState() => _AnnouncementTileState();
}

class _AnnouncementTileState extends State<_AnnouncementTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final title = widget.announcement['title']?.toString() ?? '';
    final message = widget.announcement['message']?.toString() ?? '';
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: InkWell(
              onTap: () => setState(() => _expanded = !_expanded),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(_expanded ? Icons.keyboard_arrow_down_rounded : Icons.chevron_right_rounded, size: 16, color: AppColors.muted),
                      Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
                    ],
                  ),
                  if (_expanded) ...[
                    const SizedBox(height: 2),
                    Text(message, style: const TextStyle(fontSize: 12, color: AppColors.text)),
                    const SizedBox(height: 4),
                    Text(_announcementScheduleLabel(widget.announcement), style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                  ],
                ],
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.edit_outlined, color: AppColors.brand, size: 20),
            tooltip: 'Edit',
            onPressed: widget.onEdit,
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger, size: 20),
            tooltip: 'Delete',
            onPressed: widget.onDelete,
          ),
        ],
      ),
    );
  }
}

// ── Assign Homework ──────────────────────────────────────────────────────

class _AssignHomeworkPanel extends ConsumerStatefulWidget {
  final String targetClass;

  const _AssignHomeworkPanel({required this.targetClass});

  @override
  ConsumerState<_AssignHomeworkPanel> createState() => _AssignHomeworkPanelState();
}

class _AssignHomeworkPanelState extends ConsumerState<_AssignHomeworkPanel> {
  final _titleCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  DateTime? _startAt;
  DateTime? _dueAt;
  final List<String> _attachmentUrls = [];
  final List<String> _lessonIds = [];
  bool _showLessonPicker = false;
  bool _uploading = false;
  bool _assigning = false;
  String? _info;

  // ── Edit-homework state — mirrors web's separate `editingHw*` state
  // (`onStartEditHomework` / `onSaveHomeworkEdit` / `onCancelEditHomework` in
  // `TeacherDashboard.jsx`). Populated when the teacher taps "Edit" on an
  // item in "Recently assigned".
  String? _editingHwId;
  final _editingTitleCtrl = TextEditingController();
  final _editingNoteCtrl = TextEditingController();
  DateTime? _editingStartAt;
  DateTime? _editingDueAt;
  final List<String> _editingAttachmentUrls = [];
  final List<String> _editingLessonIds = [];
  bool _editingShowLessonPicker = false;
  bool _editingUploading = false;
  bool _editingSaving = false;
  String? _editingInfo;

  // Re-checks due dates every minute so an assignment quietly drops out of
  // "Recently assigned" once it expires, without needing a manual refresh —
  // mirrors the web's `setInterval(..., 60000)` active-assignment pruning.
  Timer? _pruneTimer;

  @override
  void initState() {
    super.initState();
    _pruneTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _pruneTimer?.cancel();
    _titleCtrl.dispose();
    _noteCtrl.dispose();
    _editingTitleCtrl.dispose();
    _editingNoteCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickImages() async {
    final picked = await ImagePicker().pickMultiImage(imageQuality: 80, limit: 6);
    if (picked.isEmpty) return;
    setState(() {
      _uploading = true;
      _info = 'Uploading ${picked.length} image${picked.length == 1 ? '' : 's'}...';
    });
    final uploaded = <String>[];
    for (final file in picked) {
      try {
        final bytes = await file.readAsBytes();
        final mimeType = file.mimeType ?? 'image/jpeg';
        final dataUrl = 'data:$mimeType;base64,${base64Encode(bytes)}';
        final url = await ref.read(teacherApiServiceProvider).uploadHomeworkImage(fileName: file.name, mimeType: mimeType, dataUrl: dataUrl);
        if (url.isNotEmpty) uploaded.add(url);
      } catch (_) {
        // best-effort — keep going with remaining images
      }
    }
    if (!mounted) return;
    setState(() {
      _uploading = false;
      _attachmentUrls.addAll(uploaded);
      _info = uploaded.length == picked.length ? 'Uploaded ${uploaded.length} image${uploaded.length == 1 ? '' : 's'}.' : 'Uploaded ${uploaded.length}/${picked.length} image(s).';
    });
  }

  Future<void> _submit() async {
    if (_titleCtrl.text.trim().isEmpty) return;
    if (widget.targetClass == 'all') {
      setState(() => _info = 'Please select a class at the top of the page before assigning homework.');
      return;
    }
    if (_uploading) {
      setState(() => _info = 'Please wait for image upload to finish before assigning homework.');
      return;
    }
    setState(() {
      _assigning = true;
      _info = null;
    });
    final subject = ref.read(teacherProfileProvider).value?['subject']?.toString() ?? 'General';
    final lessons = ref.read(teacherLessonsProvider).value ?? const <Map<String, dynamic>>[];
    final lessonTitles = _lessonIds
        .map((id) => lessons.firstWhere((l) => l['id']?.toString() == id, orElse: () => const {})['title']?.toString() ?? '')
        .where((t) => t.isNotEmpty)
        .toList();
    try {
      final res = await ref.read(teacherApiServiceProvider).assignHomework(
            title: _titleCtrl.text.trim(),
            subject: subject,
            note: _noteCtrl.text.trim().isEmpty ? null : _noteCtrl.text.trim(),
            attachmentUrls: _attachmentUrls,
            startAt: _startAt?.toIso8601String(),
            dueAt: _dueAt?.toIso8601String(),
            className: widget.targetClass,
            lessonIds: _lessonIds,
            lessonTitles: lessonTitles,
          );
      final created = (res['created'] as num?)?.toInt() ?? 0;
      if (created > 0) {
        _titleCtrl.clear();
        _noteCtrl.clear();
        setState(() {
          _attachmentUrls.clear();
          _lessonIds.clear();
          _startAt = null;
          _dueAt = null;
          _info = '✅ Assigned to ${widget.targetClass} | Students: $created';
        });
        ref.invalidate(teacherHomeworkProvider);
      } else {
        setState(() => _info = res['error']?.toString() ?? 'No assignments created.');
      }
    } catch (e) {
      setState(() => _info = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _assigning = false);
    }
  }

  /// Populates the edit form from a "Recently assigned" row — mirrors
  /// `onStartEditHomework(homework)` in `TeacherDashboard.jsx`.
  void _startEdit(Map<String, dynamic> hw) {
    setState(() {
      _editingHwId = hw['id']?.toString();
      _editingTitleCtrl.text = hw['title']?.toString() ?? '';
      _editingNoteCtrl.text = hw['note']?.toString() ?? '';
      _editingStartAt = _parseDate(hw['startAt'] ?? hw['start_at']);
      _editingDueAt = _parseDate(hw['dueAt'] ?? hw['due_at']);
      _editingAttachmentUrls
        ..clear()
        ..addAll(_asUrlList(hw['attachmentUrls'] ?? hw['attachment_urls'], hw['attachmentUrl'] ?? hw['attachment_url']));
      _editingLessonIds
        ..clear()
        ..addAll(((hw['lessonIds'] ?? hw['lesson_ids']) as List?)?.map((v) => v.toString()) ?? const <String>[]);
      _editingShowLessonPicker = false;
      _editingInfo = null;
    });
  }

  /// Mirrors `onCancelEditHomework()`.
  void _cancelEdit() {
    setState(() {
      _editingHwId = null;
      _editingTitleCtrl.clear();
      _editingNoteCtrl.clear();
      _editingStartAt = null;
      _editingDueAt = null;
      _editingAttachmentUrls.clear();
      _editingLessonIds.clear();
      _editingShowLessonPicker = false;
      _editingInfo = null;
    });
  }

  /// Mirrors `onEditHomeworkFilesSelected(files)` — uploads new images and
  /// appends them to the editable attachment list.
  Future<void> _pickEditImages() async {
    final picked = await ImagePicker().pickMultiImage(imageQuality: 80, limit: 6);
    if (picked.isEmpty) return;
    setState(() {
      _editingUploading = true;
      _editingInfo = 'Uploading ${picked.length} image${picked.length == 1 ? '' : 's'}...';
    });
    final uploaded = <String>[];
    for (final file in picked) {
      try {
        final bytes = await file.readAsBytes();
        final mimeType = file.mimeType ?? 'image/jpeg';
        final dataUrl = 'data:$mimeType;base64,${base64Encode(bytes)}';
        final url = await ref.read(teacherApiServiceProvider).uploadHomeworkImage(fileName: file.name, mimeType: mimeType, dataUrl: dataUrl);
        if (url.isNotEmpty) uploaded.add(url);
      } catch (_) {
        // best-effort — keep going with remaining images
      }
    }
    if (!mounted) return;
    setState(() {
      _editingUploading = false;
      _editingAttachmentUrls.addAll(uploaded);
      _editingInfo = uploaded.length == picked.length ? 'Uploaded ${uploaded.length} image${uploaded.length == 1 ? '' : 's'}.' : 'Uploaded ${uploaded.length}/${picked.length} image(s).';
    });
  }

  /// Mirrors `onSaveHomeworkEdit(e)` — calls `updateTeacherHomework` and shows
  /// "✅ Homework updated and resent to all students." on success.
  Future<void> _saveEdit() async {
    final id = _editingHwId;
    if (id == null || _editingTitleCtrl.text.trim().isEmpty) return;
    if (_editingUploading) {
      setState(() => _editingInfo = 'Please wait for image upload to finish before saving.');
      return;
    }
    setState(() {
      _editingSaving = true;
      _editingInfo = null;
    });
    final subject = ref.read(teacherProfileProvider).value?['subject']?.toString() ?? 'General';
    final lessons = ref.read(teacherLessonsProvider).value ?? const <Map<String, dynamic>>[];
    final lessonTitles = _editingLessonIds
        .map((lid) => lessons.firstWhere((l) => l['id']?.toString() == lid, orElse: () => const {})['title']?.toString() ?? '')
        .where((t) => t.isNotEmpty)
        .toList();
    try {
      await ref.read(teacherApiServiceProvider).updateHomework(
            id,
            title: _editingTitleCtrl.text.trim(),
            subject: subject,
            note: _editingNoteCtrl.text.trim().isEmpty ? null : _editingNoteCtrl.text.trim(),
            attachmentUrls: _editingAttachmentUrls,
            startAt: _editingStartAt?.toIso8601String(),
            dueAt: _editingDueAt?.toIso8601String(),
            className: widget.targetClass == 'all' ? null : widget.targetClass,
            lessonIds: _editingLessonIds,
            lessonTitles: lessonTitles,
          );
      ref.invalidate(teacherHomeworkProvider);
      _cancelEdit();
      setState(() => _info = '✅ Homework updated and resent to all students.');
    } catch (e) {
      setState(() => _editingInfo = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _editingSaving = false);
    }
  }

  /// Deletes a whole assignment group (backend removes every student's copy).
  /// The website has no delete option for homework — this is a mobile-only
  /// addition on top of the backend's new `DELETE /teacher/homework/:id`.
  Future<void> _deleteHomework(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete homework?'),
        content: const Text('This removes it for every student it was assigned to. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete', style: TextStyle(color: AppColors.danger))),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(teacherApiServiceProvider).deleteHomework(id);
      if (_editingHwId == id) _cancelEdit();
      ref.invalidate(teacherHomeworkProvider);
    } catch (e) {
      if (!mounted) return;
      setState(() => _info = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    final subject = ref.watch(teacherProfileProvider).value?['subject']?.toString() ?? '';
    final lessons = ref.watch(teacherLessonsProvider).value ?? const <Map<String, dynamic>>[];
    // Backend returns one row per student; collapse to one card per assignment
    // group, same as web's `loadHomeworkHistory()` — this feeds both "View
    // History" (full list) and "Recently assigned" (active-only, below).
    final classScoped = _dedupeAssignments(
      (ref.watch(teacherHomeworkProvider).value ?? const <Map<String, dynamic>>[])
          .where((h) => widget.targetClass == 'all' || _sameClass(h['className'] ?? h['class_name'], widget.targetClass))
          .toList(),
    );
    // "Recently assigned" only shows still-active assignments (due date not yet
    // passed, or no due date), newest first — mirrors web's `activeAssignments`.
    final recent = classScoped.where(_isAssignmentActive).toList()
      ..sort((a, b) {
        final aCreated = _parseDate(a['createdAt'] ?? a['created_at']) ?? DateTime(0);
        final bCreated = _parseDate(b['createdAt'] ?? b['created_at']) ?? DateTime(0);
        return bCreated.compareTo(aCreated);
      });
    final recentTop2 = recent.take(2).toList();

    return _SectionCard(
      title: '📝 Assign Homework',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton.icon(
                onPressed: () => ref.invalidate(teacherHomeworkProvider),
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: const Text('Refresh', style: TextStyle(fontSize: 12)),
                style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 6)),
              ),
              TextButton.icon(
                onPressed: () => showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => _HistoryCalendarSheet(history: classScoped),
                ),
                icon: const Icon(Icons.event_note_rounded, size: 16),
                label: const Text('View History', style: TextStyle(fontSize: 12)),
                style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 6)),
              ),
            ],
          ),
          Text.rich(
            TextSpan(
              text: 'Send homework to every student in ',
              style: const TextStyle(fontSize: 13, color: AppColors.muted),
              children: [
                TextSpan(
                  text: widget.targetClass == 'all' ? 'the selected class' : widget.targetClass,
                  style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text),
                ),
                const TextSpan(text: '.'),
              ],
            ),
          ),
          const SizedBox(height: 10),
          TextField(controller: _titleCtrl, decoration: const InputDecoration(hintText: 'Homework title (e.g. Chapter 5 – Photosynthesis)')),
          const SizedBox(height: 8),
          IgnorePointer(
            child: TextField(
              controller: TextEditingController(text: subject),
              decoration: const InputDecoration(hintText: 'Subject', filled: true, fillColor: AppColors.background),
            ),
          ),
          const SizedBox(height: 8),
          _LessonPicker(
            lessons: lessons,
            selectedIds: _lessonIds,
            expanded: _showLessonPicker,
            classSelected: widget.targetClass != 'all',
            targetClass: widget.targetClass,
            onToggle: () => setState(() => _showLessonPicker = !_showLessonPicker),
            onChanged: (ids) => setState(() {
              _lessonIds
                ..clear()
                ..addAll(ids);
            }),
          ),
          const SizedBox(height: 8),
          TextField(controller: _noteCtrl, maxLines: 4, decoration: const InputDecoration(hintText: 'Homework instructions / notes for students...')),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _uploading ? null : _pickImages,
            icon: const Icon(Icons.attach_file_rounded, size: 18),
            label: Text(_uploading ? 'Uploading...' : 'Choose Files'),
          ),
          if (_attachmentUrls.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final url in _attachmentUrls)
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: Image.network(
                          url,
                          width: 56,
                          height: 56,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => Container(width: 56, height: 56, color: AppColors.background),
                        ),
                      ),
                      Positioned(
                        top: -6,
                        right: -6,
                        child: GestureDetector(
                          onTap: () => setState(() => _attachmentUrls.remove(url)),
                          child: Container(
                            width: 18,
                            height: 18,
                            decoration: const BoxDecoration(color: AppColors.danger, shape: BoxShape.circle),
                            alignment: Alignment.center,
                            child: const Icon(Icons.close_rounded, size: 12, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ],
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _DateTimeField(label: 'START DATE & TIME', value: _startAt, onChanged: (v) => setState(() => _startAt = v))),
              const SizedBox(width: 10),
              Expanded(child: _DateTimeField(label: 'END / DUE DATE & TIME', value: _dueAt, onChanged: (v) => setState(() => _dueAt = v))),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: (_assigning || _uploading) ? null : _submit,
              child: Text(_assigning
                  ? 'Assigning...'
                  : _uploading
                      ? 'Uploading image...'
                      : widget.targetClass == 'all'
                          ? 'Select a class first'
                          : '✅ Assign to ${widget.targetClass}'),
            ),
          ),
          if (_info != null) ...[
            const SizedBox(height: 8),
            Text(_info!, style: TextStyle(fontSize: 12, color: _info!.startsWith('✅') ? AppColors.ok : AppColors.danger)),
          ],
          if (recentTop2.isNotEmpty) ...[
            const SizedBox(height: 14),
            const Text('Recently assigned', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.muted)),
            for (final h in recentTop2)
              _HomeworkTile(
                homework: h,
                onEdit: () => _startEdit(h),
                onDelete: () => _deleteHomework(h['id']?.toString() ?? ''),
              ),
          ],
          if (_editingHwId != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.brandSoft,
                border: Border.all(color: AppColors.brand, width: 2),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Edit Homework', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  TextField(controller: _editingTitleCtrl, decoration: const InputDecoration(hintText: 'Homework title')),
                  const SizedBox(height: 8),
                  IgnorePointer(
                    child: TextField(
                      controller: TextEditingController(text: subject),
                      decoration: const InputDecoration(hintText: 'Subject', filled: true, fillColor: AppColors.card),
                    ),
                  ),
                  const SizedBox(height: 8),
                  _LessonPicker(
                    lessons: lessons,
                    selectedIds: _editingLessonIds,
                    expanded: _editingShowLessonPicker,
                    classSelected: widget.targetClass != 'all',
                    targetClass: widget.targetClass,
                    onToggle: () => setState(() => _editingShowLessonPicker = !_editingShowLessonPicker),
                    onChanged: (ids) => setState(() {
                      _editingLessonIds
                        ..clear()
                        ..addAll(ids);
                    }),
                  ),
                  const SizedBox(height: 8),
                  TextField(controller: _editingNoteCtrl, maxLines: 4, decoration: const InputDecoration(hintText: 'Homework instructions / notes for students...')),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: _editingUploading ? null : _pickEditImages,
                    icon: const Icon(Icons.attach_file_rounded, size: 18),
                    label: Text(_editingUploading ? 'Uploading...' : 'Add / Replace Images'),
                  ),
                  if (_editingAttachmentUrls.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final url in _editingAttachmentUrls)
                          Stack(
                            clipBehavior: Clip.none,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(6),
                                child: Image.network(
                                  url,
                                  width: 56,
                                  height: 56,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) => Container(width: 56, height: 56, color: AppColors.background),
                                ),
                              ),
                              Positioned(
                                top: -6,
                                right: -6,
                                child: GestureDetector(
                                  onTap: () => setState(() => _editingAttachmentUrls.remove(url)),
                                  child: Container(
                                    width: 18,
                                    height: 18,
                                    decoration: const BoxDecoration(color: AppColors.danger, shape: BoxShape.circle),
                                    alignment: Alignment.center,
                                    child: const Icon(Icons.close_rounded, size: 12, color: Colors.white),
                                  ),
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: _DateTimeField(label: 'START DATE & TIME', value: _editingStartAt, onChanged: (v) => setState(() => _editingStartAt = v))),
                      const SizedBox(width: 10),
                      Expanded(child: _DateTimeField(label: 'END / DUE DATE & TIME', value: _editingDueAt, onChanged: (v) => setState(() => _editingDueAt = v))),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: (_editingSaving || _editingUploading) ? null : _cancelEdit,
                          child: const Text('Cancel'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 2,
                        child: ElevatedButton(
                          onPressed: (_editingSaving || _editingUploading) ? null : _saveEdit,
                          child: Text(_editingSaving ? 'Saving...' : 'Update & Resend to All Students'),
                        ),
                      ),
                    ],
                  ),
                  if (_editingInfo != null) ...[
                    const SizedBox(height: 8),
                    Text(_editingInfo!, style: TextStyle(fontSize: 12, color: _editingInfo!.startsWith('✅') ? AppColors.ok : AppColors.danger)),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HomeworkTile extends StatelessWidget {
  final Map<String, dynamic> homework;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _HomeworkTile({required this.homework, required this.onEdit, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final title = homework['title']?.toString() ?? '';
    final subject = homework['subject']?.toString() ?? '';
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8)),
      child: Row(
        children: [
          Expanded(
            child: Text('$subject: $title', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
          IconButton(
            icon: const Icon(Icons.edit_outlined, color: AppColors.brand, size: 20),
            tooltip: 'Edit',
            onPressed: onEdit,
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger, size: 20),
            tooltip: 'Delete',
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}

/// Mirrors the website's chapter/lesson picker (`td-lesson-picker-btn` /
/// `td-lesson-picker-dropdown` / `td-lesson-tag` in `TeacherDashboard.jsx`) —
/// a toggle button that reveals checkboxes for "All chapters / General" plus
/// each available lesson, with selected lessons shown as removable chips.
class _LessonPicker extends StatelessWidget {
  final List<Map<String, dynamic>> lessons;
  final List<String> selectedIds;
  final bool expanded;
  final bool classSelected;
  final String targetClass;
  final VoidCallback onToggle;
  final ValueChanged<List<String>> onChanged;

  const _LessonPicker({
    required this.lessons,
    required this.selectedIds,
    required this.expanded,
    required this.classSelected,
    required this.targetClass,
    required this.onToggle,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onToggle,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              border: Border.all(color: selectedIds.isNotEmpty ? AppColors.brand : AppColors.line),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.menu_book_outlined, size: 16, color: AppColors.muted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    selectedIds.isNotEmpty ? '${selectedIds.length} chapter${selectedIds.length > 1 ? 's' : ''} selected' : 'Select chapters (optional)',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
                AnimatedRotation(
                  turns: expanded ? 0.5 : 0,
                  duration: const Duration(milliseconds: 150),
                  child: const Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: AppColors.muted),
                ),
              ],
            ),
          ),
        ),
        if (expanded)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(top: 6),
            constraints: const BoxConstraints(maxHeight: 220),
            decoration: BoxDecoration(border: Border.all(color: AppColors.line), borderRadius: BorderRadius.circular(8)),
            child: !classSelected
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: Text('Select a class to see chapters, or no lessons uploaded yet.', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                  )
                : lessons.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text('No lessons uploaded for this subject in $targetClass yet. Upload lessons from the school portal first.', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                      )
                    : ListView(
                        shrinkWrap: true,
                        children: [
                          CheckboxListTile(
                            dense: true,
                            controlAffinity: ListTileControlAffinity.leading,
                            value: selectedIds.isEmpty,
                            onChanged: (_) => onChanged(const []),
                            title: const Text('All chapters / General', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          ),
                          for (var i = 0; i < lessons.length; i++)
                            CheckboxListTile(
                              dense: true,
                              controlAffinity: ListTileControlAffinity.leading,
                              value: selectedIds.contains(lessons[i]['id']?.toString()),
                              onChanged: (checked) {
                                final id = lessons[i]['id']?.toString() ?? '';
                                final next = List<String>.from(selectedIds);
                                if (checked == true) {
                                  next.add(id);
                                } else {
                                  next.remove(id);
                                }
                                onChanged(next);
                              },
                              title: Text('${i + 1}. ${lessons[i]['title'] ?? ''}', style: const TextStyle(fontSize: 13)),
                            ),
                        ],
                      ),
          ),
        if (selectedIds.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final id in selectedIds)
                if (lessons.any((l) => l['id']?.toString() == id))
                  Chip(
                    label: Text('📖 ${lessons.firstWhere((l) => l['id']?.toString() == id)['title'] ?? ''}', style: const TextStyle(fontSize: 11)),
                    onDeleted: () => onChanged(selectedIds.where((x) => x != id).toList()),
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Mirrors the website's "View History" dropdown exactly (the calendar +
/// history list block in `TeacherDashboard.jsx`) as a mobile bottom sheet:
/// month calendar highlighting days with homework, tap a day to filter the
/// list below, each row expandable to show instructions + attachments.
class _HistoryCalendarSheet extends StatefulWidget {
  final List<Map<String, dynamic>> history;

  const _HistoryCalendarSheet({required this.history});

  @override
  State<_HistoryCalendarSheet> createState() => _HistoryCalendarSheetState();
}

class _HistoryCalendarSheetState extends State<_HistoryCalendarSheet> {
  late DateTime _calMonth = DateTime(DateTime.now().year, DateTime.now().month);
  String? _filterDate;
  final Set<int> _expanded = {};

  @override
  Widget build(BuildContext context) {
    final dateStatusMap = <String, int>{};
    for (final h in widget.history) {
      final key = _dateKey(h);
      if (key.isEmpty) continue;
      dateStatusMap[key] = (dateStatusMap[key] ?? 0) + 1;
    }

    final firstDay = DateTime(_calMonth.year, _calMonth.month, 1);
    final startOffset = (firstDay.weekday - 1) % 7; // Monday-first, mirrors web
    final daysInMonth = DateTime(_calMonth.year, _calMonth.month + 1, 0).day;
    final monthLabel = DateFormat('MMMM yyyy').format(firstDay);

    final visibleBase = widget.history.where((h) => _filterDate == null || _dateKey(h) == _filterDate).toList()
      ..sort((a, b) => (_historyLabel(b) ?? DateTime(0)).compareTo(_historyLabel(a) ?? DateTime(0)));
    final visible = _filterDate != null ? visibleBase : visibleBase.take(2).toList();

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Assigned Homework History', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => Navigator.of(context).pop()),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(Icons.chevron_left_rounded),
                    onPressed: () => setState(() => _calMonth = DateTime(_calMonth.year, _calMonth.month - 1)),
                  ),
                  Text(monthLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                  IconButton(
                    icon: const Icon(Icons.chevron_right_rounded),
                    onPressed: () => setState(() => _calMonth = DateTime(_calMonth.year, _calMonth.month + 1)),
                  ),
                ],
              ),
              Row(
                children: [
                  for (final l in const ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
                    Expanded(child: Center(child: Text(l, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)))),
                ],
              ),
              GridView.count(
                crossAxisCount: 7,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  for (var i = 0; i < startOffset; i++) const SizedBox.shrink(),
                  for (var day = 1; day <= daysInMonth; day++) _buildDayCell(day, dateStatusMap),
                ],
              ),
              if (_filterDate != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text('Selected: ${DateFormat('d MMM yyyy').format(DateTime.parse(_filterDate!))}', style: const TextStyle(fontSize: 12)),
                    const SizedBox(width: 8),
                    TextButton(onPressed: () => setState(() => _filterDate = null), child: const Text('Clear')),
                  ],
                ),
              ],
              const Divider(height: 24),
              if (widget.history.isEmpty)
                const Text('No homework assigned yet.', style: TextStyle(fontSize: 13, color: AppColors.muted))
              else if (visible.isEmpty)
                Text(
                  _filterDate != null ? 'No homework found for the selected date.' : 'No homework assigned yet.',
                  style: const TextStyle(fontSize: 13, color: AppColors.muted),
                )
              else
                for (var i = 0; i < visible.length; i++) _buildHistoryRow(visible[i], i),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDayCell(int day, Map<String, int> dateStatusMap) {
    final iso = DateFormat('yyyy-MM-dd').format(DateTime(_calMonth.year, _calMonth.month, day));
    final hasHomework = dateStatusMap.containsKey(iso);
    final isSelected = _filterDate == iso;
    var bg = Colors.transparent;
    var fg = AppColors.text;
    if (hasHomework) {
      bg = isSelected ? const Color(0xFF15803D) : const Color(0xFFDCFCE7);
      fg = isSelected ? Colors.white : const Color(0xFF15803D);
    } else if (isSelected) {
      bg = AppColors.brand;
      fg = Colors.white;
    }
    return Padding(
      padding: const EdgeInsets.all(2),
      child: InkWell(
        borderRadius: BorderRadius.circular(6),
        onTap: () => setState(() => _filterDate = isSelected ? null : iso),
        child: Container(
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
          alignment: Alignment.center,
          child: Text('$day', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fg)),
        ),
      ),
    );
  }

  Widget _buildHistoryRow(Map<String, dynamic> h, int index) {
    final expanded = _expanded.contains(index);
    final title = h['title']?.toString() ?? '';
    final subject = h['subject']?.toString() ?? '';
    final note = h['note']?.toString() ?? '';
    final attachments = _asUrlList(h['attachmentUrls'] ?? h['attachment_urls'], h['attachmentUrl'] ?? h['attachment_url']);
    final startAt = _parseDate(h['startAt'] ?? h['start_at']);
    final dueAt = _parseDate(h['dueAt'] ?? h['due_at']);
    final createdAt = _parseDate(h['createdAt'] ?? h['created_at']);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(8),
        border: const Border(left: BorderSide(color: AppColors.brand, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('$subject: $title', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
              TextButton(
                onPressed: () => setState(() {
                  if (expanded) {
                    _expanded.remove(index);
                  } else {
                    _expanded.add(index);
                  }
                }),
                child: Text(expanded ? 'Hide details' : 'Show details', style: const TextStyle(fontSize: 11)),
              ),
            ],
          ),
          Text(
            startAt != null
                ? 'Start: ${DateFormat('d MMM, h:mm a').format(startAt)}${dueAt != null ? ' · Due: ${DateFormat('d MMM, h:mm a').format(dueAt)}' : ''}'
                : (dueAt != null ? 'Due: ${DateFormat('d MMM, h:mm a').format(dueAt)}' : (createdAt != null ? 'Assigned: ${DateFormat('d MMM yyyy').format(createdAt)}' : '–')),
            style: const TextStyle(fontSize: 11, color: AppColors.muted),
          ),
          if (expanded) ...[
            const SizedBox(height: 8),
            if (note.isNotEmpty) ...[
              const Text('Instructions', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
              Text(note, style: const TextStyle(fontSize: 12)),
              const SizedBox(height: 6),
            ],
            if (attachments.isNotEmpty) ...[
              const Text('Teacher attachments', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final url in attachments)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Image.network(url, width: 44, height: 44, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(width: 44, height: 44, color: AppColors.line)),
                    ),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }
}

// ── Mock Tests ────────────────────────────────────────────────────────────

class _MockTestsPanel extends ConsumerStatefulWidget {
  final String targetClass;

  const _MockTestsPanel({required this.targetClass});

  @override
  ConsumerState<_MockTestsPanel> createState() => _MockTestsPanelState();
}

class _MockTestsPanelState extends ConsumerState<_MockTestsPanel> {
  final _titleCtrl = TextEditingController();
  final _durationCtrl = TextEditingController(text: '30');
  bool _creating = false;
  String? _note;
  String? _createdTestId;
  String? _createdTestTitle;

  final _questionCtrl = TextEditingController();
  final List<TextEditingController> _optionCtrls = List.generate(4, (_) => TextEditingController());
  int _correctOption = 0;
  bool _addingQuestion = false;
  final List<Map<String, dynamic>> _questions = [];

  @override
  void dispose() {
    _titleCtrl.dispose();
    _durationCtrl.dispose();
    _questionCtrl.dispose();
    for (final c in _optionCtrls) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _createTest() async {
    if (_titleCtrl.text.trim().isEmpty) return;
    if (widget.targetClass == 'all') {
      setState(() => _note = 'Please select a class at the top of the page before creating a test.');
      return;
    }
    setState(() {
      _creating = true;
      _note = null;
    });
    final subject = ref.read(teacherProfileProvider).value?['subject']?.toString() ?? 'General';
    try {
      final res = await ref.read(teacherApiServiceProvider).createTest(
            title: _titleCtrl.text.trim(),
            subject: subject,
            className: widget.targetClass,
            durationMinutes: int.tryParse(_durationCtrl.text.trim()) ?? 30,
          );
      final test = res['test'] as Map?;
      final createdTitle = test?['title']?.toString() ?? _titleCtrl.text.trim();
      setState(() {
        _createdTestId = test?['id']?.toString();
        _createdTestTitle = createdTitle;
        _questions.clear();
        _note = 'Test "$createdTitle" created. Now add questions below.';
        _titleCtrl.clear();
      });
      ref.invalidate(teacherTestsProvider);
    } catch (e) {
      setState(() => _note = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _addQuestion() async {
    if (_createdTestId == null || _questionCtrl.text.trim().isEmpty) return;
    final options = _optionCtrls.map((c) => c.text.trim()).where((t) => t.isNotEmpty).toList();
    if (options.length < 2) {
      setState(() => _note = 'Add at least 2 non-empty options.');
      return;
    }
    if (_correctOption < 0 || _correctOption >= options.length) {
      setState(() => _note = 'Select a correct option among the filled options.');
      return;
    }
    setState(() {
      _addingQuestion = true;
      _note = null;
    });
    try {
      final res = await ref.read(teacherApiServiceProvider).addTestQuestion(
            _createdTestId!,
            text: _questionCtrl.text.trim(),
            options: options,
            correctOption: _correctOption,
          );
      final question = Map<String, dynamic>.from(
        res['question'] as Map? ?? {'text': _questionCtrl.text.trim(), 'options': options, 'correctOption': _correctOption},
      );
      setState(() {
        _questions.add(question);
        _questionCtrl.clear();
        for (final c in _optionCtrls) {
          c.clear();
        }
        _correctOption = 0;
        _note = 'Question added (${_questions.length} total).';
      });
    } catch (e) {
      setState(() => _note = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _addingQuestion = false);
    }
  }

  Future<void> _deleteTest(String testId) async {
    try {
      await ref.read(teacherApiServiceProvider).deleteTest(testId);
      ref.invalidate(teacherTestsProvider);
      if (_createdTestId == testId) {
        setState(() {
          _createdTestId = null;
          _createdTestTitle = null;
          _questions.clear();
        });
      }
    } catch (_) {
      // best-effort — list refresh will reflect the real state either way
    }
  }

  @override
  Widget build(BuildContext context) {
    final tests = (ref.watch(teacherTestsProvider).value ?? const <Map<String, dynamic>>[])
        .where((t) => widget.targetClass == 'all' || _sameClass(t['className'] ?? t['class_name'], widget.targetClass))
        .toList();

    return _SectionCard(
      title: 'Mock Tests',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Create tests and add questions for your students.', style: TextStyle(fontSize: 13, color: AppColors.muted)),
          const SizedBox(height: 10),
          if (tests.isEmpty)
            const Text('No tests yet. Create one below.', style: TextStyle(fontSize: 12, color: AppColors.muted))
          else
            for (final t in tests) _TestTile(test: t, onDelete: () => _deleteTest(t['id']?.toString() ?? '')),
          const SizedBox(height: 14),
          const Text('New Test', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          TextField(controller: _titleCtrl, decoration: const InputDecoration(hintText: 'Test title')),
          const SizedBox(height: 8),
          TextField(controller: _durationCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: 'Duration (minutes)')),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _creating ? null : _createTest,
              child: Text(_creating ? 'Creating...' : (widget.targetClass == 'all' ? 'Select a class first' : 'Create Test for ${widget.targetClass}')),
            ),
          ),
          if (_createdTestId != null) ...[
            const SizedBox(height: 16),
            Text('Add Question to "$_createdTestTitle"', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            TextField(controller: _questionCtrl, maxLines: 2, decoration: const InputDecoration(hintText: 'Question text')),
            const SizedBox(height: 8),
            RadioGroup<int>(
              groupValue: _correctOption,
              onChanged: (v) => setState(() => _correctOption = v ?? 0),
              child: Column(
                children: [
                  for (var i = 0; i < 4; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Radio<int>(value: i),
                          Expanded(
                            child: TextField(
                              controller: _optionCtrls[i],
                              decoration: InputDecoration(hintText: 'Option ${i + 1}${_correctOption == i ? ' (correct)' : ''}'),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: _addingQuestion ? null : _addQuestion,
                child: Text(_addingQuestion ? 'Adding...' : 'Add Question'),
              ),
            ),
            if (_questions.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('${_questions.length} question(s) added so far.', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
              for (var i = 0; i < _questions.length; i++) _QuestionTile(index: i, question: _questions[i]),
            ],
          ],
          if (_note != null) ...[
            const SizedBox(height: 8),
            Text(_note!, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ],
        ],
      ),
    );
  }
}

class _TestTile extends StatelessWidget {
  final Map<String, dynamic> test;
  final VoidCallback onDelete;

  const _TestTile({required this.test, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final title = test['title']?.toString() ?? '';
    final subject = test['subject']?.toString() ?? 'General';
    final status = test['status']?.toString() ?? 'upcoming';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(8)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                Text('$subject · $status', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
              ],
            ),
          ),
          IconButton(icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger, size: 20), onPressed: onDelete),
        ],
      ),
    );
  }
}

class _QuestionTile extends StatelessWidget {
  final int index;
  final Map<String, dynamic> question;

  const _QuestionTile({required this.index, required this.question});

  @override
  Widget build(BuildContext context) {
    final text = question['text']?.toString() ?? '';
    final options = (question['options'] as List?)?.map((o) => o.toString()).join(' • ') ?? '';
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text('${index + 1}. $text\n$options', style: const TextStyle(fontSize: 12)),
    );
  }
}

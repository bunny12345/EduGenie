import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/calendar_event.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

/// The site-wide "3D button" frame — a light-black ring border + soft drop
/// shadow, ported from `.eg-calendar-layout button:not(.eg-cal-cell)` in
/// `App.css`. Day-grid cells stay flat, exactly like on web.
const Color _frame3dColor = Color(0xFF46464E);

Border _frame3dBorder({double alpha = 0.45, double width = 1.5}) => Border.all(color: _frame3dColor.withValues(alpha: alpha), width: width);

List<BoxShadow> _frame3dShadow({double alpha = 0.22, double blur = 8}) =>
    [BoxShadow(color: Colors.black.withValues(alpha: alpha), blurRadius: blur, offset: const Offset(0, 3))];

String _isoDate(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String _monthYearLabel(DateTime d) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return '${months[d.month - 1]} ${d.year}';
}

String _slashDate(DateTime d) => '${d.day}/${d.month}/${d.year}';

String _weekdayShortLabel(DateTime d) {
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${wd[d.weekday - 1]}, ${mo[d.month - 1]} ${d.day}';
}

String _weekdayDateLabel(DateTime d) {
  const wd = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${wd[d.weekday - 1]}, ${mo[d.month - 1]} ${d.day}';
}

InputDecoration _fieldDecoration(String hint) => InputDecoration(
      hintText: hint,
      isDense: true,
      hintStyle: const TextStyle(fontSize: 12, color: Color(0xFF9AA1C7)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      filled: true,
      fillColor: const Color(0xFFF7F8FF),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFDFE5F7))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFDFE5F7))),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.brand)),
    );

/// Calendar — mirrors the web app's month-grid Calendar page exactly
/// (`.eg-calendar-layout`/`.eg-cal-*` in `App.css`): dynamic month grid with
/// prev/next + Today navigation, a day's event list below the grid, an add
/// event form, and a separate "Upcoming Events" card with inline edit/delete —
/// every button carries the site's light-black 3D frame, same as web.
class StudentCalendarScreen extends ConsumerStatefulWidget {
  const StudentCalendarScreen({super.key});

  @override
  ConsumerState<StudentCalendarScreen> createState() => _StudentCalendarScreenState();
}

class _StudentCalendarScreenState extends ConsumerState<StudentCalendarScreen> {
  late DateTime _viewMonth;
  late String _selectedDate;

  final _newTitleCtrl = TextEditingController();
  DateTime? _newDate;
  bool _adding = false;
  String? _note;

  String? _editingEventId;
  final _editTitleCtrl = TextEditingController();
  DateTime? _editDate;
  String? _busyEventId;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _viewMonth = DateTime(now.year, now.month, 1);
    _selectedDate = _isoDate(now);
    _newDate = now;
  }

  @override
  void dispose() {
    _newTitleCtrl.dispose();
    _editTitleCtrl.dispose();
    super.dispose();
  }

  void _goToToday() {
    final now = DateTime.now();
    setState(() {
      _viewMonth = DateTime(now.year, now.month, 1);
      _selectedDate = _isoDate(now);
    });
  }

  void _shiftMonth(int delta) => setState(() => _viewMonth = DateTime(_viewMonth.year, _viewMonth.month + delta, 1));

  void _selectDate(String iso, DateTime date) {
    setState(() {
      _selectedDate = iso;
      _newDate = date;
    });
  }

  Future<void> _addEvent() async {
    final title = _newTitleCtrl.text.trim();
    final date = _newDate;
    if (title.isEmpty || date == null) return;
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;
    setState(() {
      _adding = true;
      _note = null;
    });
    try {
      await ref.read(studentApiServiceProvider).createCalendarEvent(studentId, title, date);
      ref.invalidate(calendarEventsProvider);
      _newTitleCtrl.clear();
      if (mounted) setState(() => _note = 'Event added.');
    } catch (e) {
      if (mounted) setState(() => _note = 'Failed to add event: $e');
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  void _startEdit(CalendarEvent event) {
    final d = event.startsAt != null ? DateTime.tryParse(event.startsAt!) : null;
    setState(() {
      _editingEventId = event.id;
      _editTitleCtrl.text = event.title;
      _editDate = d ?? DateTime.now();
    });
  }

  void _cancelEdit() => setState(() => _editingEventId = null);

  Future<void> _saveEdit(CalendarEvent event) async {
    final title = _editTitleCtrl.text.trim();
    final date = _editDate;
    if (title.isEmpty || date == null) return;
    setState(() => _busyEventId = event.id);
    try {
      await ref.read(studentApiServiceProvider).updateCalendarEvent(event.id, title, date);
      ref.invalidate(calendarEventsProvider);
      if (mounted) setState(() => _editingEventId = null);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to save: $e')));
    } finally {
      if (mounted) setState(() => _busyEventId = null);
    }
  }

  Future<void> _deleteEvent(CalendarEvent event) async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;
    setState(() => _busyEventId = event.id);
    try {
      await ref.read(studentApiServiceProvider).deleteCalendarEvent(event.id, studentId);
      ref.invalidate(calendarEventsProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to delete: $e')));
    } finally {
      if (mounted) setState(() => _busyEventId = null);
    }
  }

  Future<void> _pickDate({required bool forEdit}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: (forEdit ? _editDate : _newDate) ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
    );
    if (picked == null) return;
    setState(() {
      if (forEdit) {
        _editDate = picked;
      } else {
        _newDate = picked;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final eventsAsync = ref.watch(calendarEventsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Calendar')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(calendarEventsProvider),
        child: eventsAsync.when(
          loading: () => ListView(padding: const EdgeInsets.all(16), children: const [SkeletonBox(height: 340)]),
          error: (e, _) => ListView(padding: const EdgeInsets.all(16), children: [ErrorInline(message: 'Unable to load calendar: $e')]),
          data: (events) {
            final eventsByDate = <String, List<CalendarEvent>>{};
            for (final e in events) {
              final d = e.startsAt != null ? DateTime.tryParse(e.startsAt!) : null;
              if (d == null) continue;
              eventsByDate.putIfAbsent(_isoDate(d), () => []).add(e);
            }
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _MonthCard(
                  viewMonth: _viewMonth,
                  selectedDate: _selectedDate,
                  eventsByDate: eventsByDate,
                  onPrev: () => _shiftMonth(-1),
                  onNext: () => _shiftMonth(1),
                  onToday: _goToToday,
                  onSelectDay: _selectDate,
                  titleCtrl: _newTitleCtrl,
                  newDate: _newDate,
                  onPickDate: () => _pickDate(forEdit: false),
                  adding: _adding,
                  onAdd: _addEvent,
                  note: _note,
                ),
                const SizedBox(height: 12),
                _UpcomingEventsCard(
                  events: events,
                  editingEventId: _editingEventId,
                  editTitleCtrl: _editTitleCtrl,
                  editDate: _editDate,
                  busyEventId: _busyEventId,
                  onStartEdit: _startEdit,
                  onCancelEdit: _cancelEdit,
                  onSaveEdit: _saveEdit,
                  onDelete: _deleteEvent,
                  onPickEditDate: () => _pickDate(forEdit: true),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Mirrors `.eg-calendar-page` — month grid, day-events list, add-event form.
class _MonthCard extends StatelessWidget {
  final DateTime viewMonth;
  final String selectedDate;
  final Map<String, List<CalendarEvent>> eventsByDate;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onToday;
  final void Function(String iso, DateTime date) onSelectDay;
  final TextEditingController titleCtrl;
  final DateTime? newDate;
  final VoidCallback onPickDate;
  final bool adding;
  final VoidCallback onAdd;
  final String? note;

  const _MonthCard({
    required this.viewMonth,
    required this.selectedDate,
    required this.eventsByDate,
    required this.onPrev,
    required this.onNext,
    required this.onToday,
    required this.onSelectDay,
    required this.titleCtrl,
    required this.newDate,
    required this.onPickDate,
    required this.adding,
    required this.onAdd,
    required this.note,
  });

  @override
  Widget build(BuildContext context) {
    final todayIso = _isoDate(DateTime.now());
    final firstDay = DateTime(viewMonth.year, viewMonth.month, 1);
    final startOffset = (firstDay.weekday + 6) % 7; // Mon=0 … Sun=6
    final daysInMonth = DateTime(viewMonth.year, viewMonth.month + 1, 0).day;
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    final cells = <int?>[
      for (var i = 0; i < startOffset; i++) null,
      for (var d = 1; d <= daysInMonth; d++) d,
    ];

    final selectedEvents = eventsByDate[selectedDate] ?? const <CalendarEvent>[];
    final isSelectedToday = selectedDate == todayIso;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _NavButton(icon: Icons.chevron_left_rounded, onTap: onPrev),
              Column(
                children: [
                  Text(_monthYearLabel(viewMonth), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF1F2340))),
                  const SizedBox(height: 4),
                  _TodayButton(onTap: onToday),
                ],
              ),
              _NavButton(icon: Icons.chevron_right_rounded, onTap: onNext),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (final l in dayLabels)
                Expanded(child: Center(child: Text(l, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF8A8FAE))))),
            ],
          ),
          const SizedBox(height: 4),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, mainAxisSpacing: 4, crossAxisSpacing: 4, childAspectRatio: 1),
            itemCount: cells.length,
            itemBuilder: (context, i) {
              final day = cells[i];
              if (day == null) return const SizedBox.shrink();
              final date = DateTime(viewMonth.year, viewMonth.month, day);
              final iso = _isoDate(date);
              final dayEvents = eventsByDate[iso] ?? const <CalendarEvent>[];
              return _DayCell(
                day: day,
                isToday: iso == todayIso,
                isSelected: iso == selectedDate,
                hasEvents: dayEvents.isNotEmpty,
                onTap: () => onSelectDay(iso, date),
              );
            },
          ),
          const SizedBox(height: 10),
          const Divider(height: 1, color: AppColors.line),
          const SizedBox(height: 10),
          Text(
            isSelectedToday ? 'Today' : _weekdayDateLabel(DateTime.parse(selectedDate)),
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.text),
          ),
          const SizedBox(height: 6),
          if (selectedEvents.isEmpty)
            const Text('No events on this day.', style: TextStyle(color: AppColors.muted, fontSize: 12))
          else
            for (final e in selectedEvents)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text('• ${e.title}', style: const TextStyle(fontSize: 12, color: Color(0xFF374151))),
              ),
          const SizedBox(height: 12),
          TextField(controller: titleCtrl, decoration: _fieldDecoration('Event title')),
          const SizedBox(height: 6),
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: onPickDate,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              decoration: BoxDecoration(color: const Color(0xFFF7F8FF), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFDFE5F7))),
              child: Text(
                newDate != null ? _slashDate(newDate!) : 'Select date',
                style: const TextStyle(fontSize: 12, color: Color(0xFF42528A)),
              ),
            ),
          ),
          const SizedBox(height: 8),
          _FramedButton(label: adding ? 'Adding...' : 'Add Event', onTap: adding ? null : onAdd, fullWidth: true),
          if (note != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(note!, style: const TextStyle(fontSize: 10, color: Color(0xFF5F6790)))),
        ],
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _NavButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: const Color(0xFFF5F3FF), borderRadius: BorderRadius.circular(10), border: _frame3dBorder(), boxShadow: _frame3dShadow()),
        child: Icon(icon, size: 18, color: const Color(0xFF4B3FA8)),
      ),
    );
  }
}

class _TodayButton extends StatelessWidget {
  final VoidCallback onTap;

  const _TodayButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: const Color(0xFFF5F3FF), borderRadius: BorderRadius.circular(999), border: _frame3dBorder(), boxShadow: _frame3dShadow()),
        child: const Text('Today', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF4B3FA8))),
      ),
    );
  }
}

/// Mirrors `.eg-cal-cell` — day cells stay flat, no 3D frame, exactly like web.
class _DayCell extends StatelessWidget {
  final int day;
  final bool isToday;
  final bool isSelected;
  final bool hasEvents;
  final VoidCallback onTap;

  const _DayCell({required this.day, required this.isToday, required this.isSelected, required this.hasEvents, required this.onTap});

  @override
  Widget build(BuildContext context) {
    Color bg = const Color(0xFFF7F7FB);
    Color fg = const Color(0xFF374151);
    FontWeight weight = FontWeight.w600;
    if (isSelected) {
      bg = AppColors.brand;
      fg = Colors.white;
    } else if (isToday) {
      bg = const Color(0xFFEEF0FF);
      fg = const Color(0xFF4338CA);
      weight = FontWeight.w800;
    }
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
        alignment: Alignment.center,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Text('$day', style: TextStyle(fontSize: 12, fontWeight: weight, color: fg)),
            if (hasEvents)
              Positioned(
                bottom: 4,
                child: Container(width: 5, height: 5, decoration: BoxDecoration(shape: BoxShape.circle, color: isSelected ? Colors.white : const Color(0xFFFF9D3C))),
              ),
          ],
        ),
      ),
    );
  }
}

/// Mirrors `.eg-cal-upcoming` — the side "Upcoming Events" card with inline
/// edit/delete, stacked below the month card on mobile's narrower width.
class _UpcomingEventsCard extends StatelessWidget {
  final List<CalendarEvent> events;
  final String? editingEventId;
  final TextEditingController editTitleCtrl;
  final DateTime? editDate;
  final String? busyEventId;
  final void Function(CalendarEvent) onStartEdit;
  final VoidCallback onCancelEdit;
  final void Function(CalendarEvent) onSaveEdit;
  final void Function(CalendarEvent) onDelete;
  final VoidCallback onPickEditDate;

  const _UpcomingEventsCard({
    required this.events,
    required this.editingEventId,
    required this.editTitleCtrl,
    required this.editDate,
    required this.busyEventId,
    required this.onStartEdit,
    required this.onCancelEdit,
    required this.onSaveEdit,
    required this.onDelete,
    required this.onPickEditDate,
  });

  @override
  Widget build(BuildContext context) {
    final todayIso = _isoDate(DateTime.now());
    final upcoming = events.where((e) {
      final d = e.startsAt != null ? DateTime.tryParse(e.startsAt!) : null;
      if (d == null) return false;
      return _isoDate(d).compareTo(todayIso) >= 0;
    }).toList()
      ..sort((a, b) => (a.startsAt ?? '').compareTo(b.startsAt ?? ''));

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('📌 Upcoming Events', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          if (upcoming.isEmpty)
            const Text('No upcoming events. Add one from the calendar!', style: TextStyle(color: AppColors.muted, fontSize: 12))
          else
            for (final e in upcoming) ...[
              _UpcomingEventRow(
                event: e,
                editing: editingEventId == e.id,
                busy: busyEventId == e.id,
                editTitleCtrl: editTitleCtrl,
                editDate: editDate,
                onEdit: () => onStartEdit(e),
                onCancel: onCancelEdit,
                onSave: () => onSaveEdit(e),
                onDelete: () => onDelete(e),
                onPickDate: onPickEditDate,
              ),
              const SizedBox(height: 8),
            ],
        ],
      ),
    );
  }
}

class _UpcomingEventRow extends StatelessWidget {
  final CalendarEvent event;
  final bool editing;
  final bool busy;
  final TextEditingController editTitleCtrl;
  final DateTime? editDate;
  final VoidCallback onEdit;
  final VoidCallback onCancel;
  final VoidCallback onSave;
  final VoidCallback onDelete;
  final VoidCallback onPickDate;

  const _UpcomingEventRow({
    required this.event,
    required this.editing,
    required this.busy,
    required this.editTitleCtrl,
    required this.editDate,
    required this.onEdit,
    required this.onCancel,
    required this.onSave,
    required this.onDelete,
    required this.onPickDate,
  });

  @override
  Widget build(BuildContext context) {
    if (editing) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: const Color(0xFFF0EDFF), borderRadius: BorderRadius.circular(12)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(controller: editTitleCtrl, decoration: _fieldDecoration('Event title')),
            const SizedBox(height: 6),
            InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: onPickDate,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFDFE5F7))),
                child: Text(editDate != null ? _slashDate(editDate!) : 'Select date', style: const TextStyle(fontSize: 12, color: Color(0xFF42528A))),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: _FramedButton(label: busy ? 'Saving…' : 'Save', onTap: busy ? null : onSave)),
                const SizedBox(width: 8),
                Expanded(child: _FramedButton(label: 'Cancel', onTap: busy ? null : onCancel)),
              ],
            ),
          ],
        ),
      );
    }

    final d = event.startsAt != null ? DateTime.tryParse(event.startsAt!) : null;
    final isToday = d != null && _isoDate(d) == _isoDate(DateTime.now());

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: const Color(0xFFF7F7FB), borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(event.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF1F2340))),
                const SizedBox(height: 2),
                Text(
                  isToday ? 'Today' : (d != null ? _weekdayShortLabel(d) : ''),
                  style: TextStyle(
                    fontSize: 11,
                    color: isToday ? const Color(0xFF4338CA) : const Color(0xFF8A8FAE),
                    fontWeight: isToday ? FontWeight.w700 : FontWeight.normal,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _FramedIconButton(icon: Icons.edit_rounded, onTap: busy ? null : onEdit),
          const SizedBox(width: 6),
          _FramedIconButton(icon: Icons.delete_outline_rounded, onTap: busy ? null : onDelete, busy: busy),
        ],
      ),
    );
  }
}

/// Mirrors `.eg-inline-btn` layered with the site's 3D button frame.
class _FramedButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  final bool fullWidth;

  const _FramedButton({required this.label, required this.onTap, this.fullWidth = false});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: Container(
        width: fullWidth ? double.infinity : null,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFECEBFF),
          borderRadius: BorderRadius.circular(8),
          border: _frame3dBorder(),
          boxShadow: onTap == null ? null : _frame3dShadow(),
        ),
        child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF3F41A8))),
      ),
    );
  }
}

/// Mirrors `.eg-icon-btn` layered with the site's 3D button frame.
class _FramedIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final bool busy;

  const _FramedIconButton({required this.icon, required this.onTap, this.busy = false});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(9),
      onTap: onTap,
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(9),
          border: _frame3dBorder(),
          boxShadow: onTap == null ? null : _frame3dShadow(),
        ),
        child: busy
            ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
            : Icon(icon, size: 15, color: const Color(0xFF3F41A8)),
      ),
    );
  }
}

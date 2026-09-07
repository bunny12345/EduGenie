import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/calendar_event.dart';
import '../../state/session_provider.dart';
import '../../state/student_providers.dart';
import '../../theme/app_colors.dart';
import '../../widgets/section_card.dart';

/// Calendar — mobile-first agenda list (chronological upcoming events) rather
/// than a reproduction of the web app's month grid, per the mobile design
/// brief. Add/delete events; a full month view can be added later if wanted.
class StudentCalendarScreen extends ConsumerWidget {
  const StudentCalendarScreen({super.key});

  Future<void> _addEvent(BuildContext context, WidgetRef ref) async {
    final titleCtrl = TextEditingController();
    DateTime selectedDate = DateTime.now();
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom, left: 16, right: 16, top: 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Add Event', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Event title')),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: selectedDate,
                    firstDate: DateTime.now().subtract(const Duration(days: 1)),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (picked != null) setSheetState(() => selectedDate = picked);
                },
                child: Text('${selectedDate.day}/${selectedDate.month}/${selectedDate.year}'),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Add Event'),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );

    if (result == true && titleCtrl.text.trim().isNotEmpty) {
      final studentId = ref.read(sessionProvider).value?.userId ?? '';
      if (studentId.isEmpty) return;
      await ref.read(studentApiServiceProvider).createCalendarEvent(studentId, titleCtrl.text.trim(), selectedDate);
      ref.invalidate(calendarEventsProvider);
    }
  }

  Future<void> _deleteEvent(WidgetRef ref, CalendarEvent event) async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;
    await ref.read(studentApiServiceProvider).deleteCalendarEvent(event.id, studentId);
    ref.invalidate(calendarEventsProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eventsAsync = ref.watch(calendarEventsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Calendar')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _addEvent(context, ref),
        child: const Icon(Icons.add),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(calendarEventsProvider),
        child: eventsAsync.when(
          loading: () => ListView(padding: const EdgeInsets.all(16), children: const [SkeletonBox(height: 300)]),
          error: (e, _) => ListView(padding: const EdgeInsets.all(16), children: [ErrorInline(message: 'Unable to load calendar: $e')]),
          data: (events) {
            final todayIso = DateTime.now().toIso8601String().substring(0, 10);
            final upcoming = events.where((e) {
              final d = e.startsAt;
              return d == null || d.substring(0, 10).compareTo(todayIso) >= 0;
            }).toList()
              ..sort((a, b) => (a.startsAt ?? '').compareTo(b.startsAt ?? ''));

            if (upcoming.isEmpty) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: const [Text('No upcoming events. Tap + to add one!', style: TextStyle(color: AppColors.muted, fontSize: 13))],
              );
            }

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [for (final e in upcoming) _EventCard(event: e, onDelete: () => _deleteEvent(ref, e))],
            );
          },
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  final CalendarEvent event;
  final VoidCallback onDelete;

  const _EventCard({required this.event, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final date = event.startsAt != null ? DateTime.tryParse(event.startsAt!) : null;
    final isToday = date != null && date.toIso8601String().substring(0, 10) == DateTime.now().toIso8601String().substring(0, 10);
    return SectionCard(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(10)),
            child: Text(date != null ? '${date.day}' : '?', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.brand)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(event.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                Text(
                  isToday ? 'Today' : (date != null ? '${date.day}/${date.month}/${date.year}' : ''),
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
          IconButton(icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger), onPressed: onDelete),
        ],
      ),
    );
  }
}

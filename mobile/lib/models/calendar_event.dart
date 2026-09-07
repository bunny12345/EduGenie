/// Mirrors the `events` table shape returned by `GET /calendar` in
/// `backend/src/controllers/calendar.controller.ts` (fixed to use
/// starts_at/ends_at/event_type — see /memories/repo/aws-deployment.md).
class CalendarEvent {
  final String id;
  final String title;
  final String? startsAt;
  final String eventType;

  const CalendarEvent({required this.id, required this.title, this.startsAt, this.eventType = 'study'});

  factory CalendarEvent.fromJson(Map<String, dynamic> json) => CalendarEvent(
        id: json['id']?.toString() ?? '',
        title: json['title'] as String? ?? 'Study Session',
        startsAt: json['starts_at'] as String?,
        eventType: json['event_type'] as String? ?? 'study',
      );
}

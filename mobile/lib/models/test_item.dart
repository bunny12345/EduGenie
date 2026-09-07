/// Raw test row shape returned by `GET /tests` in
/// `backend/src/controllers/tests.controller.ts` (no camelCase mapping is
/// done server-side for this endpoint — keep snake_case field reads).
class TestItem {
  final String id;
  final String title;
  final String subject;
  final String status;
  final int durationMinutes;

  const TestItem({
    required this.id,
    required this.title,
    required this.subject,
    this.status = 'upcoming',
    this.durationMinutes = 30,
  });

  factory TestItem.fromJson(Map<String, dynamic> json) => TestItem(
        id: json['id']?.toString() ?? '',
        title: json['title'] as String? ?? 'Mock Test',
        subject: json['subject'] as String? ?? 'General',
        status: json['status'] as String? ?? 'upcoming',
        durationMinutes: (json['duration_minutes'] as num?)?.toInt() ?? 30,
      );
}

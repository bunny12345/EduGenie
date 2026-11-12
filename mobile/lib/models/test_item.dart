/// Raw test row shape returned by `GET /tests` in
/// `backend/src/controllers/tests.controller.ts` (no camelCase mapping is
/// done server-side for this endpoint — keep snake_case field reads).
class TestItem {
  final String id;
  final String title;
  final String subject;
  final String status;
  final int durationMinutes;
  // Only populated when fetched with filter=upcoming (the student's own
  // view) — mirrors attachAttemptStatus() in tests.controller.ts.
  final String windowStatus; // none | scheduled | open | expired
  final DateTime? startAt;
  final DateTime? endAt;
  final bool attempted;
  final int? lastScore;
  final String? attemptId;
  final bool strictMode;

  const TestItem({
    required this.id,
    required this.title,
    required this.subject,
    this.status = 'upcoming',
    this.durationMinutes = 30,
    this.windowStatus = 'none',
    this.startAt,
    this.endAt,
    this.attempted = false,
    this.lastScore,
    this.attemptId,
    this.strictMode = false,
  });

  factory TestItem.fromJson(Map<String, dynamic> json) => TestItem(
    id: json['id']?.toString() ?? '',
    title: json['title'] as String? ?? 'Mock Test',
    subject: json['subject'] as String? ?? 'General',
    status: json['status'] as String? ?? 'upcoming',
    durationMinutes: (json['duration_minutes'] as num?)?.toInt() ?? 30,
    windowStatus: json['windowStatus']?.toString() ?? 'none',
    startAt: DateTime.tryParse(
      (json['startAt'] ?? json['start_at'])?.toString() ?? '',
    ),
    endAt: DateTime.tryParse(
      (json['endAt'] ?? json['end_at'])?.toString() ?? '',
    ),
    attempted: json['attempted'] == true,
    lastScore: (json['lastScore'] as num?)?.toInt(),
    attemptId: json['attemptId']?.toString(),
    strictMode: json['strictMode'] == true,
  );
}

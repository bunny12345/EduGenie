/// Mirrors the `lessons` table row shape (verified directly against the live
/// Supabase table) returned by `GET /curriculum/lessons`.
class CurriculumLesson {
  final String id;
  final String title;
  final String subject;
  final String? description;
  final int orderIndex;

  const CurriculumLesson({
    required this.id,
    required this.title,
    required this.subject,
    this.description,
    this.orderIndex = 0,
  });

  factory CurriculumLesson.fromJson(Map<String, dynamic> json) => CurriculumLesson(
        id: json['id']?.toString() ?? '',
        title: json['title'] as String? ?? 'Lesson',
        subject: json['subject'] as String? ?? 'General',
        description: json['description'] as String?,
        orderIndex: (json['order_index'] as num?)?.toInt() ?? 0,
      );
}

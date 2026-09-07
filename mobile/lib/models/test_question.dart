/// Mirrors each item in the `questions` array from `POST /tests/:testId/start`
/// in `backend/src/controllers/tests.controller.ts`.
class TestQuestion {
  final String id;
  final String text;
  final List<String> options;

  const TestQuestion({required this.id, required this.text, this.options = const []});

  factory TestQuestion.fromJson(Map<String, dynamic> json) => TestQuestion(
        id: json['id']?.toString() ?? '',
        text: json['text'] as String? ?? 'Question',
        options: (json['options'] as List? ?? []).map((o) => o.toString()).toList(),
      );
}

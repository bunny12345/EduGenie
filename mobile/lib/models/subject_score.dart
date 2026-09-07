/// Mirrors `subjectScores[]` from `GET /progress` in
/// `backend/src/controllers/progress.controller.ts`.
class SubjectScore {
  final String subject;
  final int score;
  final int trend;

  const SubjectScore({required this.subject, required this.score, this.trend = 0});

  factory SubjectScore.fromJson(Map<String, dynamic> json) => SubjectScore(
        subject: json['subject'] as String? ?? 'General',
        score: (json['score'] as num?)?.toInt() ?? 0,
        trend: (json['trend'] as num?)?.toInt() ?? 0,
      );
}

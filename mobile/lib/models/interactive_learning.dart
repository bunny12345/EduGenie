// Models for the AI Tutor's interactive learning features — mirror the
// exact response shapes from `backend/src/chat/chat.service.ts` for
// check-question, explain-back, quiz-rush, story-mode, and due-review.

class CheckQuestion {
  final String id;
  final String question;
  final List<String> options;
  final int correctIndex;
  final String explanation;

  const CheckQuestion({
    required this.id,
    required this.question,
    this.options = const [],
    this.correctIndex = -1,
    this.explanation = '',
  });

  factory CheckQuestion.fromJson(Map<String, dynamic> json) => CheckQuestion(
        id: json['id']?.toString() ?? '',
        question: json['question'] as String? ?? '',
        options: (json['options'] as List? ?? []).map((o) => o.toString()).toList(),
        correctIndex: (json['correctIndex'] as num?)?.toInt() ?? -1,
        explanation: json['explanation'] as String? ?? '',
      );
}

class ExplainBackEvaluation {
  final int score;
  final String feedback;
  final List<String> strengths;
  final List<String> gaps;
  final bool passedCheck;

  const ExplainBackEvaluation({
    this.score = 3,
    this.feedback = '',
    this.strengths = const [],
    this.gaps = const [],
    this.passedCheck = true,
  });

  factory ExplainBackEvaluation.fromJson(Map<String, dynamic> json) => ExplainBackEvaluation(
        score: (json['score'] as num?)?.toInt() ?? 3,
        feedback: json['feedback'] as String? ?? '',
        strengths: (json['strengths'] as List? ?? []).map((s) => s.toString()).toList(),
        gaps: (json['gaps'] as List? ?? []).map((s) => s.toString()).toList(),
        passedCheck: json['passedCheck'] as bool? ?? true,
      );
}

class QuizRushQuestion {
  final String id;
  final String question;
  final List<String> options;
  final int correctIndex;
  final String explanation;

  const QuizRushQuestion({
    required this.id,
    required this.question,
    this.options = const [],
    this.correctIndex = -1,
    this.explanation = '',
  });

  factory QuizRushQuestion.fromJson(Map<String, dynamic> json) => QuizRushQuestion(
        id: json['id']?.toString() ?? '',
        question: json['question'] as String? ?? '',
        options: (json['options'] as List? ?? []).map((o) => o.toString()).toList(),
        correctIndex: (json['correctIndex'] as num?)?.toInt() ?? -1,
        explanation: json['explanation'] as String? ?? '',
      );
}

class QuizRushSet {
  final String quizId;
  final String? subject;
  final String? lessonId;
  final List<QuizRushQuestion> questions;

  const QuizRushSet({required this.quizId, this.subject, this.lessonId, this.questions = const []});

  factory QuizRushSet.fromJson(Map<String, dynamic> json) => QuizRushSet(
        quizId: json['quizId']?.toString() ?? '',
        subject: json['subject'] as String?,
        lessonId: json['lessonId'] as String?,
        questions: (json['questions'] as List? ?? []).map((q) => QuizRushQuestion.fromJson(Map<String, dynamic>.from(q as Map))).toList(),
      );
}

class DueReviewNudge {
  final int dueCount;
  final String? nudgeMessage;

  const DueReviewNudge({this.dueCount = 0, this.nudgeMessage});

  factory DueReviewNudge.fromJson(Map<String, dynamic> json) => DueReviewNudge(
        dueCount: (json['dueCount'] as num?)?.toInt() ?? 0,
        nudgeMessage: json['nudgeMessage'] as String?,
      );
}

class LessonStory {
  final String title;
  final String story;
  final bool completed;

  const LessonStory({required this.title, required this.story, this.completed = false});

  factory LessonStory.fromJson(Map<String, dynamic> json) => LessonStory(
        title: json['title'] as String? ?? '',
        story: json['story'] as String? ?? '',
        completed: json['completed'] as bool? ?? false,
      );
}

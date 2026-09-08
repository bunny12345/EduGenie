import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/chat_message.dart';
import '../models/curriculum_lesson.dart';
import '../models/interactive_learning.dart';
import '../services/chat_api_service.dart';
import 'session_provider.dart';

final chatApiServiceProvider = Provider<ChatApiService>(
  (ref) => ChatApiService(ref.read(apiClientProvider)),
);

final curriculumLessonsProvider = FutureProvider.autoDispose.family<List<CurriculumLesson>, String>((ref, subject) {
  return ref.watch(chatApiServiceProvider).listLessons(subject: subject);
});

/// Same format as `getCurrentTutorConversationId()` in `StudentDashboard.jsx`
/// — do not change, chat history is scoped by this exact string on the backend.
String conversationIdFor(String studentId, String subject, String? lessonId) {
  final normalized = subject.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
  if (lessonId != null && lessonId.isNotEmpty) {
    return 'conv-$studentId:subject-$normalized:lesson-$lessonId';
  }
  return 'conv-$studentId:subject-$normalized:all-lessons';
}

class CheckQuestionResult {
  final bool correct;
  final String explanation;

  const CheckQuestionResult({required this.correct, required this.explanation});
}

class QuizRushAnswer {
  final String questionId;
  final int selectedIndex;
  final bool correct;

  const QuizRushAnswer({required this.questionId, required this.selectedIndex, required this.correct});
}

/// A picked-but-not-yet-sent chat image — mirrors web's `chatImages` state
/// (`{ id, name, dataUrl }` in StudentDashboard.jsx).
class PendingImage {
  final String name;
  final String dataUrl;

  const PendingImage({required this.name, required this.dataUrl});
}

class TutorState {
  final String subject;
  final CurriculumLesson? lesson;
  final List<ChatMessage> messages;
  final bool loadingHistory;
  final bool sending;
  final String? error;
  final List<String> followups;

  // Interactive learning — mirrors the equivalent state in StudentDashboard.jsx.
  final DueReviewNudge? dueReviewNudge;
  final CheckQuestion? checkQuestion;
  final bool checkQuestionLoading;
  final CheckQuestionResult? checkQuestionResult;
  final bool explainBackActive;
  final String explainBackTopic;
  final bool explainBackLoading;
  final ExplainBackEvaluation? explainBackResult;
  final bool quizRushActive;
  final bool quizRushLoading;
  final QuizRushSet? quizRushData;
  final int quizRushCurrentIndex;
  final List<QuizRushAnswer> quizRushAnswers;
  final bool storyActive;
  final bool storyLoading;
  final LessonStory? storyData;
  final bool storyCompleted;
  final List<PendingImage> chatImages;

  const TutorState({
    this.subject = '',
    this.lesson,
    this.messages = const [],
    this.loadingHistory = false,
    this.sending = false,
    this.error,
    this.followups = const [],
    this.dueReviewNudge,
    this.checkQuestion,
    this.checkQuestionLoading = false,
    this.checkQuestionResult,
    this.explainBackActive = false,
    this.explainBackTopic = '',
    this.explainBackLoading = false,
    this.explainBackResult,
    this.quizRushActive = false,
    this.quizRushLoading = false,
    this.quizRushData,
    this.quizRushCurrentIndex = 0,
    this.quizRushAnswers = const [],
    this.storyActive = false,
    this.storyLoading = false,
    this.storyData,
    this.storyCompleted = false,
    this.chatImages = const [],
  });

  TutorState copyWith({
    List<ChatMessage>? messages,
    bool? loadingHistory,
    bool? sending,
    String? error,
    List<String>? followups,
    DueReviewNudge? dueReviewNudge,
    CheckQuestion? checkQuestion,
    bool clearCheckQuestion = false,
    bool? checkQuestionLoading,
    CheckQuestionResult? checkQuestionResult,
    bool clearCheckQuestionResult = false,
    bool? explainBackActive,
    String? explainBackTopic,
    bool? explainBackLoading,
    ExplainBackEvaluation? explainBackResult,
    bool clearExplainBackResult = false,
    bool? quizRushActive,
    bool? quizRushLoading,
    QuizRushSet? quizRushData,
    bool clearQuizRushData = false,
    int? quizRushCurrentIndex,
    List<QuizRushAnswer>? quizRushAnswers,
    bool? storyActive,
    bool? storyLoading,
    LessonStory? storyData,
    bool clearStoryData = false,
    bool? storyCompleted,
    List<PendingImage>? chatImages,
  }) =>
      TutorState(
        subject: subject,
        lesson: lesson,
        messages: messages ?? this.messages,
        loadingHistory: loadingHistory ?? this.loadingHistory,
        sending: sending ?? this.sending,
        error: error,
        followups: followups ?? this.followups,
        dueReviewNudge: dueReviewNudge ?? this.dueReviewNudge,
        checkQuestion: clearCheckQuestion ? null : (checkQuestion ?? this.checkQuestion),
        checkQuestionLoading: checkQuestionLoading ?? this.checkQuestionLoading,
        checkQuestionResult: clearCheckQuestionResult ? null : (checkQuestionResult ?? this.checkQuestionResult),
        explainBackActive: explainBackActive ?? this.explainBackActive,
        explainBackTopic: explainBackTopic ?? this.explainBackTopic,
        explainBackLoading: explainBackLoading ?? this.explainBackLoading,
        explainBackResult: clearExplainBackResult ? null : (explainBackResult ?? this.explainBackResult),
        quizRushActive: quizRushActive ?? this.quizRushActive,
        quizRushLoading: quizRushLoading ?? this.quizRushLoading,
        quizRushData: clearQuizRushData ? null : (quizRushData ?? this.quizRushData),
        quizRushCurrentIndex: quizRushCurrentIndex ?? this.quizRushCurrentIndex,
        quizRushAnswers: quizRushAnswers ?? this.quizRushAnswers,
        storyActive: storyActive ?? this.storyActive,
        storyLoading: storyLoading ?? this.storyLoading,
        storyData: clearStoryData ? null : (storyData ?? this.storyData),
        storyCompleted: storyCompleted ?? this.storyCompleted,
        chatImages: chatImages ?? this.chatImages,
      );
}

/// Drives the AI Tutor screen: subject/lesson selection, chat history load,
/// and sending messages. Mirrors the relevant state/handlers in
/// `StudentDashboard.jsx` (getCurrentTutorConversationId, loadChatPanel,
/// onSendTutorMessage) but scoped to a single notifier for mobile.
class TutorNotifier extends Notifier<TutorState> {
  @override
  TutorState build() => const TutorState();

  /// Called once the student's subject list resolves, to pick a default —
  /// mirrors the "reset to first subject" effect in StudentDashboard.jsx.
  void ensureSubject(String defaultSubject) {
    if (state.subject.isNotEmpty || defaultSubject.isEmpty) return;
    state = TutorState(subject: defaultSubject);
  }

  void setSubject(String subject) {
    if (subject == state.subject) return;
    state = TutorState(subject: subject);
    loadDueReviewNudge();
  }

  Future<void> selectLesson(CurriculumLesson? lesson) async {
    state = TutorState(subject: state.subject, lesson: lesson);
    if (lesson != null) await loadHistory();
    loadDueReviewNudge();
  }

  Future<void> loadHistory() async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    final lesson = state.lesson;
    if (studentId.isEmpty || lesson == null) return;
    state = state.copyWith(loadingHistory: true, error: null);
    try {
      final convId = conversationIdFor(studentId, state.subject, lesson.id);
      final messages = await ref.read(chatApiServiceProvider).getChatHistory(studentId, convId);
      state = state.copyWith(messages: messages, loadingHistory: false);
    } catch (e) {
      state = state.copyWith(loadingHistory: false, error: e.toString());
    }
  }

  void addImages(List<PendingImage> images) {
    if (images.isEmpty) return;
    final merged = [...state.chatImages, ...images];
    state = state.copyWith(chatImages: merged.length > 6 ? merged.sublist(merged.length - 6) : merged);
  }

  void removeImage(int index) {
    final next = [...state.chatImages]..removeAt(index);
    state = state.copyWith(chatImages: next);
  }

  void clearImages() {
    state = state.copyWith(chatImages: const []);
  }

  Future<void> sendMessage(String text) async {
    final trimmed = text.trim();
    final lesson = state.lesson;
    final images = state.chatImages;
    if ((trimmed.isEmpty && images.isEmpty) || lesson == null || state.sending) return;
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;

    final convId = conversationIdFor(studentId, state.subject, lesson.id);
    final messageText = trimmed.isNotEmpty ? trimmed : 'Please explain these ${images.length} image${images.length == 1 ? '' : 's'}.';
    final userMsg = ChatMessage.optimisticUser(messageText, imageDataUrls: images.map((i) => i.dataUrl).toList());
    final historyBeforeSend = state.messages;
    state = state.copyWith(messages: [...historyBeforeSend, userMsg], sending: true, error: null, followups: const [], chatImages: const []);

    try {
      final recent = historyBeforeSend
          .skip(historyBeforeSend.length > 20 ? historyBeforeSend.length - 20 : 0)
          .map((m) => {'role': m.isUser ? 'user' : 'assistant', 'content': m.text})
          .toList();
      final res = await ref.read(chatApiServiceProvider).sendChat(
            studentId: studentId,
            message: messageText,
            conversationId: convId,
            recentMessages: recent,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            lessonSubject: state.subject,
            imageDataUrls: images.map((i) => i.dataUrl).toList(),
            imageNames: images.map((i) => i.name).toList(),
          );
      final aiMsg = ChatMessage.ai(res['reply'].toString());
      final followups = (res['followups'] as List? ?? []).map((f) => f.toString()).toList();
      state = state.copyWith(messages: [...state.messages, aiMsg], sending: false, followups: followups);
    } catch (e) {
      final message = e.toString().replaceFirst('Exception: ', '');
      final errMsg = ChatMessage.ai('⚠️ $message');
      state = state.copyWith(messages: [...state.messages, errMsg], sending: false, error: message);
    }
  }

  Future<void> loadDueReviewNudge() async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;
    try {
      final nudge = await ref.read(chatApiServiceProvider).getDueReviewNudge(studentId, subject: state.subject);
      state = state.copyWith(dueReviewNudge: nudge.nudgeMessage != null ? nudge : null);
    } catch (_) {
      /* best-effort */
    }
  }

  void dismissDueReviewNudge() {
    state = TutorState(
      subject: state.subject,
      lesson: state.lesson,
      messages: state.messages,
      followups: state.followups,
    );
  }

  // ── Quiz Me (inline check question) ──────────────────────────────────────
  Future<void> requestCheckQuestion() async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    final lesson = state.lesson;
    if (studentId.isEmpty || lesson == null || state.checkQuestionLoading) return;
    state = state.copyWith(checkQuestionLoading: true, clearCheckQuestionResult: true);
    try {
      final convId = conversationIdFor(studentId, state.subject, lesson.id);
      final q = await ref.read(chatApiServiceProvider).generateCheckQuestion(
            studentId: studentId,
            conversationId: convId,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            lessonSubject: state.subject,
          );
      state = state.copyWith(checkQuestion: q, checkQuestionLoading: false);
    } catch (_) {
      state = state.copyWith(checkQuestionLoading: false);
    }
  }

  Future<void> answerCheckQuestion(int selectedIndex) async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    final question = state.checkQuestion;
    if (studentId.isEmpty || question == null) return;
    final correct = selectedIndex == question.correctIndex;
    state = state.copyWith(checkQuestionResult: CheckQuestionResult(correct: correct, explanation: question.explanation));
    try {
      await ref.read(chatApiServiceProvider).answerCheckQuestion(studentId, {
        'questionId': question.id,
        'selectedIndex': selectedIndex,
        'correctIndex': question.correctIndex,
        'question': question.question,
        'correctAnswer': question.options.isNotEmpty && question.correctIndex >= 0 && question.correctIndex < question.options.length
            ? question.options[question.correctIndex]
            : '',
        'explanation': question.explanation,
        'lessonId': state.lesson?.id,
        'subject': state.subject,
      });
    } catch (_) {
      /* best-effort */
    }
    final resultText = correct
        ? '✅ Correct! ${question.explanation.isNotEmpty ? question.explanation : 'Great job!'}'
        : '❌ Not quite. ${question.explanation}';
    state = state.copyWith(messages: [...state.messages, ChatMessage.ai(resultText)]);
  }

  void dismissCheckQuestion() {
    state = state.copyWith(clearCheckQuestion: true, clearCheckQuestionResult: true);
  }

  // ── Explain Back ───────────────────────────────────────────────────────
  void startExplainBack([String? topic]) {
    state = state.copyWith(
      explainBackActive: true,
      explainBackTopic: topic ?? state.lesson?.title ?? 'what we just covered',
      clearExplainBackResult: true,
    );
  }

  Future<void> submitExplainBack(String explanation) async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    final trimmed = explanation.trim();
    if (studentId.isEmpty || trimmed.isEmpty || state.explainBackLoading) return;
    state = state.copyWith(explainBackLoading: true);
    try {
      final evaluation = await ref.read(chatApiServiceProvider).evaluateExplainBack(studentId, {
        'explanation': trimmed,
        'topic': state.explainBackTopic,
        'conversationId': state.lesson != null ? conversationIdFor(studentId, state.subject, state.lesson!.id) : null,
        'lessonId': state.lesson?.id,
        'subject': state.subject,
      });
      state = state.copyWith(explainBackResult: evaluation, explainBackLoading: false);
      if (evaluation != null) {
        final emoji = evaluation.passedCheck ? '🌟' : '💪';
        final msg = '$emoji Explain Back Result: ${evaluation.feedback}';
        state = state.copyWith(messages: [...state.messages, ChatMessage.ai(msg)]);
      }
    } catch (_) {
      state = state.copyWith(explainBackLoading: false);
    }
  }

  void closeExplainBack() {
    state = state.copyWith(explainBackActive: false, clearExplainBackResult: true);
  }

  // ── Quiz Rush ──────────────────────────────────────────────────────────
  Future<void> startQuizRush() async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty || state.quizRushLoading) return;
    state = state.copyWith(quizRushLoading: true, quizRushCurrentIndex: 0, quizRushAnswers: const []);
    try {
      final data = await ref.read(chatApiServiceProvider).generateQuizRush(studentId, {
        'lessonId': state.lesson?.id,
        'lessonTitle': state.lesson?.title,
        'subject': state.subject,
        'count': 5,
      });
      if (data != null) {
        state = state.copyWith(quizRushData: data, quizRushActive: true, quizRushLoading: false);
      } else {
        state = state.copyWith(quizRushLoading: false);
      }
    } catch (_) {
      state = state.copyWith(quizRushLoading: false);
    }
  }

  Future<void> answerQuizRush(int selectedIndex) async {
    final data = state.quizRushData;
    if (data == null) return;
    final question = data.questions[state.quizRushCurrentIndex];
    final correct = selectedIndex == question.correctIndex;
    final answer = QuizRushAnswer(questionId: question.id, selectedIndex: selectedIndex, correct: correct);
    final nextAnswers = [...state.quizRushAnswers, answer];

    if (state.quizRushCurrentIndex < data.questions.length - 1) {
      state = state.copyWith(quizRushAnswers: nextAnswers, quizRushCurrentIndex: state.quizRushCurrentIndex + 1);
      return;
    }

    state = state.copyWith(quizRushAnswers: nextAnswers);
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;
    final score = nextAnswers.where((a) => a.correct).length;
    try {
      await ref.read(chatApiServiceProvider).submitQuizRush(studentId, {
        'quizId': data.quizId,
        'subject': data.subject ?? state.subject,
        'lessonId': data.lessonId ?? state.lesson?.id,
        'score': score,
        'total': nextAnswers.length,
      });
    } catch (_) {
      /* best-effort */
    }
  }

  void closeQuizRush() {
    state = state.copyWith(
      quizRushActive: false,
      clearQuizRushData: true,
      quizRushCurrentIndex: 0,
      quizRushAnswers: const [],
    );
  }

  // ── Story Mode ─────────────────────────────────────────────────────────
  Future<void> startStory() async {
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty || state.storyLoading) return;
    state = state.copyWith(storyActive: true, clearStoryData: true, storyLoading: true, storyCompleted: false);
    try {
      final story = await ref.read(chatApiServiceProvider).generateLessonStory(studentId, {
        'lessonId': state.lesson?.id,
        'lessonTitle': state.lesson?.title,
        'subject': state.subject,
      });
      state = state.copyWith(storyData: story, storyLoading: false, storyCompleted: story?.completed ?? false);
    } catch (_) {
      state = state.copyWith(storyLoading: false);
    }
  }

  Future<void> finishStory() async {
    state = state.copyWith(storyCompleted: true);
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;
    try {
      await ref.read(chatApiServiceProvider).completeLessonStory(studentId, {
        'lessonId': state.lesson?.id,
        'subject': state.subject,
      });
    } catch (_) {
      /* best-effort */
    }
  }

  void closeStory() {
    state = state.copyWith(storyActive: false, clearStoryData: true, storyCompleted: false);
  }
}

final tutorProvider = NotifierProvider.autoDispose<TutorNotifier, TutorState>(TutorNotifier.new);

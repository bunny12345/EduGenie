import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/chat_message.dart';
import '../models/curriculum_lesson.dart';
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

class TutorState {
  final String subject;
  final CurriculumLesson? lesson;
  final List<ChatMessage> messages;
  final bool loadingHistory;
  final bool sending;
  final String? error;
  final List<String> followups;

  const TutorState({
    this.subject = '',
    this.lesson,
    this.messages = const [],
    this.loadingHistory = false,
    this.sending = false,
    this.error,
    this.followups = const [],
  });

  TutorState copyWith({
    List<ChatMessage>? messages,
    bool? loadingHistory,
    bool? sending,
    String? error,
    List<String>? followups,
  }) =>
      TutorState(
        subject: subject,
        lesson: lesson,
        messages: messages ?? this.messages,
        loadingHistory: loadingHistory ?? this.loadingHistory,
        sending: sending ?? this.sending,
        error: error,
        followups: followups ?? this.followups,
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
  }

  Future<void> selectLesson(CurriculumLesson? lesson) async {
    state = TutorState(subject: state.subject, lesson: lesson);
    if (lesson != null) await loadHistory();
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

  Future<void> sendMessage(String text) async {
    final trimmed = text.trim();
    final lesson = state.lesson;
    if (trimmed.isEmpty || lesson == null || state.sending) return;
    final studentId = ref.read(sessionProvider).value?.userId ?? '';
    if (studentId.isEmpty) return;

    final convId = conversationIdFor(studentId, state.subject, lesson.id);
    final userMsg = ChatMessage.optimisticUser(trimmed);
    final historyBeforeSend = state.messages;
    state = state.copyWith(messages: [...historyBeforeSend, userMsg], sending: true, error: null, followups: const []);

    try {
      final recent = historyBeforeSend
          .skip(historyBeforeSend.length > 20 ? historyBeforeSend.length - 20 : 0)
          .map((m) => {'role': m.isUser ? 'user' : 'assistant', 'content': m.text})
          .toList();
      final res = await ref.read(chatApiServiceProvider).sendChat(
            studentId: studentId,
            message: trimmed,
            conversationId: convId,
            recentMessages: recent,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            lessonSubject: state.subject,
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
}

final tutorProvider = NotifierProvider.autoDispose<TutorNotifier, TutorState>(TutorNotifier.new);

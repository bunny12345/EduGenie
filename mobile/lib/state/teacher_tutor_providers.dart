import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/chat_message.dart';
import 'session_provider.dart';
import 'teacher_providers.dart';
import 'tutor_providers.dart';

/// Teacher AI Assistant state — mirrors the (simpler, non-gamified) subset of
/// `TutorState`/`TutorNotifier` that `TeacherDashboard.jsx`'s AI Assistant
/// section actually uses: lesson selection, chat history, sending, images,
/// and follow-up chips. No due-review nudge / Quiz Rush / Explain Back /
/// Story Mode / Talk to Sam — the teacher section doesn't have those on web.
class TeacherTutorState {
  final Map<String, dynamic>? lesson;
  final List<ChatMessage> messages;
  final bool loadingHistory;
  final bool sending;
  final String? error;
  final List<String> followups;
  final List<PendingImage> chatImages;

  const TeacherTutorState({
    this.lesson,
    this.messages = const [],
    this.loadingHistory = false,
    this.sending = false,
    this.error,
    this.followups = const [],
    this.chatImages = const [],
  });

  TeacherTutorState copyWith({
    Map<String, dynamic>? lesson,
    bool clearLesson = false,
    List<ChatMessage>? messages,
    bool? loadingHistory,
    bool? sending,
    String? error,
    bool clearError = false,
    List<String>? followups,
    List<PendingImage>? chatImages,
  }) => TeacherTutorState(
    lesson: clearLesson ? null : (lesson ?? this.lesson),
    messages: messages ?? this.messages,
    loadingHistory: loadingHistory ?? this.loadingHistory,
    sending: sending ?? this.sending,
    error: clearError ? null : (error ?? this.error),
    followups: followups ?? this.followups,
    chatImages: chatImages ?? this.chatImages,
  );
}

class TeacherTutorNotifier extends Notifier<TeacherTutorState> {
  @override
  TeacherTutorState build() => const TeacherTutorState();

  String get _actorId {
    final id = ref.read(sessionProvider).value?.userId ?? '';
    return 'teacher-$id';
  }

  String _subject() =>
      ref.read(teacherProfileProvider).value?['subject']?.toString() ?? '';

  Future<void> selectLesson(Map<String, dynamic>? lesson) async {
    state = TeacherTutorState(lesson: lesson);
    if (lesson != null) await loadHistory();
  }

  Future<void> loadHistory() async {
    final lesson = state.lesson;
    if (lesson == null) return;
    state = state.copyWith(loadingHistory: true, clearError: true);
    try {
      final convId = conversationIdFor(
        _actorId,
        _subject(),
        lesson['id']?.toString(),
      );
      final messages = await ref
          .read(chatApiServiceProvider)
          .getChatHistory(_actorId, convId);
      state = state.copyWith(messages: messages, loadingHistory: false);
    } catch (e) {
      state = state.copyWith(
        loadingHistory: false,
        error: e.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  void addImages(List<PendingImage> images) {
    if (images.isEmpty) return;
    final merged = [...state.chatImages, ...images];
    state = state.copyWith(
      chatImages: merged.length > 6
          ? merged.sublist(merged.length - 6)
          : merged,
    );
  }

  void removeImage(int index) {
    final next = [...state.chatImages]..removeAt(index);
    state = state.copyWith(chatImages: next);
  }

  void clearImages() {
    state = state.copyWith(chatImages: const []);
  }

  /// Mirrors `onStopTutorMessageSend()` — web aborts the in-flight fetch; here
  /// we just stop treating it as "sending" so the UI unblocks immediately
  /// (the eventual reply, if any, is discarded when it lands).
  void stopSending() {
    state = state.copyWith(sending: false);
  }

  Future<void> sendMessage(String text) async {
    final trimmed = text.trim();
    final lesson = state.lesson;
    final images = state.chatImages;
    if ((trimmed.isEmpty && images.isEmpty) ||
        lesson == null ||
        state.sending) {
      return;
    }

    final convId = conversationIdFor(
      _actorId,
      _subject(),
      lesson['id']?.toString(),
    );
    final messageText = trimmed.isNotEmpty
        ? trimmed
        : 'Please explain these ${images.length} image${images.length == 1 ? '' : 's'}.';
    final userMsg = ChatMessage.optimisticUser(
      messageText,
      imageDataUrls: images.map((i) => i.dataUrl).toList(),
    );
    final historyBeforeSend = state.messages;
    state = state.copyWith(
      messages: [...historyBeforeSend, userMsg],
      sending: true,
      clearError: true,
      followups: const [],
      chatImages: const [],
    );

    try {
      final recent = historyBeforeSend
          .skip(
            historyBeforeSend.length > 20 ? historyBeforeSend.length - 20 : 0,
          )
          .map(
            (m) => {'role': m.isUser ? 'user' : 'assistant', 'content': m.text},
          )
          .toList();
      final res = await ref
          .read(chatApiServiceProvider)
          .sendChat(
            studentId: _actorId,
            message: messageText,
            conversationId: convId,
            recentMessages: recent,
            lessonId: lesson['id']?.toString(),
            lessonTitle: lesson['title']?.toString(),
            lessonSubject: _subject(),
            imageDataUrls: images.map((i) => i.dataUrl).toList(),
            imageNames: images.map((i) => i.name).toList(),
          );
      if (!state.sending) return; // stopped by the user in the meantime
      final aiMsg = ChatMessage.ai(res['reply'].toString());
      final followups = (res['followups'] as List? ?? [])
          .map((f) => f.toString())
          .toList();
      state = state.copyWith(
        messages: [...state.messages, aiMsg],
        sending: false,
        followups: followups,
      );
    } catch (e) {
      if (!state.sending) return;
      final message = e.toString().replaceFirst('Exception: ', '');
      final errMsg = ChatMessage.ai('⚠️ $message');
      state = state.copyWith(
        messages: [...state.messages, errMsg],
        sending: false,
        error: message,
      );
    }
  }
}

final teacherTutorProvider =
    NotifierProvider.autoDispose<TeacherTutorNotifier, TeacherTutorState>(
      TeacherTutorNotifier.new,
    );

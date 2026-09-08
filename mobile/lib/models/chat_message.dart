/// Mirrors `getHistory()`'s per-message shape in `backend/src/chat/chat.service.ts`
/// and the optimistic message shape used by `sendChat` in `web/src/api.js`.
class ChatMessage {
  final String id;
  final String role; // 'user' | 'ai'
  final String text;
  final String ts;
  final List<String> imageDataUrls;

  const ChatMessage({required this.id, required this.role, required this.text, required this.ts, this.imageDataUrls = const []});

  bool get isUser => role == 'user';

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final urls = (json['imageDataUrls'] as List? ?? []).map((u) => u.toString()).where((u) => u.isNotEmpty).toList();
    final singleUrl = json['imageDataUrl'] as String?;
    return ChatMessage(
      id: json['id']?.toString() ?? '',
      role: json['role'] as String? ?? 'user',
      text: (json['text'] ?? json['message'])?.toString() ?? '',
      ts: json['ts'] as String? ?? DateTime.now().toIso8601String(),
      imageDataUrls: urls.isNotEmpty ? urls : (singleUrl != null && singleUrl.isNotEmpty ? [singleUrl] : const []),
    );
  }

  factory ChatMessage.optimisticUser(String text, {List<String> imageDataUrls = const []}) => ChatMessage(
        id: 'tmp-${DateTime.now().millisecondsSinceEpoch}',
        role: 'user',
        text: text,
        ts: DateTime.now().toIso8601String(),
        imageDataUrls: imageDataUrls,
      );

  factory ChatMessage.ai(String text) => ChatMessage(
        id: 'ai-${DateTime.now().millisecondsSinceEpoch}',
        role: 'ai',
        text: text,
        ts: DateTime.now().toIso8601String(),
      );
}

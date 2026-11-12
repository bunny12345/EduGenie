List<String> splitSamSpeech(String text) {
  final chunks = <String>[];
  var rest = text.trim();
  while (rest.isNotEmpty) {
    final limit = chunks.isEmpty ? 240 : 600;
    final prefix = rest.substring(0, rest.length.clamp(0, limit));
    final ends = RegExp(r'[.!?](?=\s)').allMatches(prefix).toList();
    var end = ends.isNotEmpty ? (chunks.isEmpty ? ends.first.end : ends.last.end) : prefix.length;
    if (ends.isEmpty && rest.length > limit) {
      final space = rest.lastIndexOf(' ', limit);
      if (space > 0) end = space;
    }
    chunks.add(rest.substring(0, end).trim());
    rest = rest.substring(end).trim();
  }
  return chunks;
}

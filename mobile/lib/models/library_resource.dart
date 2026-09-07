/// Mirrors each resource shape returned by `GET /library` in
/// `backend/src/controllers/library.controller.ts`.
class LibraryResource {
  final String id;
  final String title;
  final String type;
  final String url;
  final String summary;

  const LibraryResource({required this.id, required this.title, this.type = 'article', this.url = '', this.summary = ''});

  factory LibraryResource.fromJson(Map<String, dynamic> json) => LibraryResource(
        id: json['id']?.toString() ?? '',
        title: json['title'] as String? ?? 'Learning resource',
        type: json['type'] as String? ?? 'article',
        url: json['url'] as String? ?? '',
        summary: json['summary'] as String? ?? '',
      );
}

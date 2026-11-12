import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../services/attachment_url.dart';
import '../../../services/save_attachment.dart';

void showImageLightbox(BuildContext context, List<String> urls, int initialIndex) {
  if (urls.isEmpty) return;
  showDialog(
    context: context,
    barrierColor: Colors.black87,
    useSafeArea: false,
    builder: (_) => ScaffoldMessenger(
      child: _LightboxView(urls: urls.map(resolveAttachmentUrl).toList(), initialIndex: initialIndex.clamp(0, urls.length - 1)),
    ),
  );
}

class _LightboxView extends StatefulWidget {
  final List<String> urls;
  final int initialIndex;

  const _LightboxView({required this.urls, required this.initialIndex});

  @override
  State<_LightboxView> createState() => _LightboxViewState();
}

class _LightboxViewState extends State<_LightboxView> {
  late final PageController _controller = PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;
  bool _downloading = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _goTo(int index) {
    if (index < 0 || index >= widget.urls.length) return;
    _controller.animateToPage(index, duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
  }

  Future<void> _download({required bool all}) async {
    if (_downloading) return;
    setState(() => _downloading = true);
    final messenger = ScaffoldMessenger.of(context);
    final urls = all ? widget.urls : [widget.urls[_index]];
    var saved = 0;
    final failures = <String>[];
    final dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 20), receiveTimeout: const Duration(seconds: 30)));
    try {
      for (var i = 0; i < urls.length; i++) {
        try {
          final response = await dio.get<List<int>>(urls[i], options: Options(responseType: ResponseType.bytes));
          final bytes = response.data;
          if (bytes == null || bytes.isEmpty) throw StateError('The image file is empty.');
          final mime = response.headers.value('content-type')?.split(';').first ?? 'application/octet-stream';
          if (!mime.startsWith('image/') && mime != 'application/octet-stream') throw StateError('The attachment is not an image.');
          final extension = switch (mime) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            _ => 'jpg',
          };
          await saveAttachment(
            Uint8List.fromList(bytes),
            'academix-attachment-${DateTime.now().microsecondsSinceEpoch}-$i.$extension',
            mime,
          );
          saved++;
        } catch (error, stack) {
          debugPrint('Attachment download failed: $error\n$stack');
          failures.add(
            error is DioException
                ? 'The image could not be downloaded. Check your connection and try again.'
                : error is StateError
                ? error.message
                : 'Could not save to Photos. Check photo access and available storage, then try again.',
          );
        }
      }
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            failures.isEmpty
                ? (kIsWeb ? 'Downloaded $saved image${saved == 1 ? '' : 's'}.' : 'Saved $saved image${saved == 1 ? '' : 's'} to Photos.')
                : 'Saved $saved of ${urls.length} images. Could not save ${failures.length}. ${failures.first}',
          ),
        ),
      );
    } finally {
      dio.close();
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canPrev = _index > 0;
    final canNext = _index < widget.urls.length - 1;
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${_index + 1} / ${widget.urls.length}',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                    ),
                    _CircleIconButton(
                      icon: Icons.download_rounded,
                      busy: _downloading,
                      tooltip: 'Download image',
                      onTap: () => _download(all: false),
                    ),
                    if (widget.urls.length > 1) ...[
                      const SizedBox(width: 8),
                      _CircleIconButton(
                        icon: Icons.download_for_offline_outlined,
                        busy: _downloading,
                        tooltip: 'Download all',
                        onTap: () => _download(all: true),
                      ),
                    ],
                    const SizedBox(width: 8),
                    _CircleIconButton(icon: Icons.close_rounded, tooltip: 'Close image viewer', onTap: () => Navigator.of(context).pop()),
                  ],
                ),
              ),
              Expanded(
                child: Stack(
                  children: [
                    PageView.builder(
                      controller: _controller,
                      itemCount: widget.urls.length,
                      onPageChanged: (i) => setState(() => _index = i),
                      itemBuilder: (_, i) => GestureDetector(
                        onTap: () {}, // swallow taps on the image so it doesn't close the dialog
                        child: Center(
                          child: InteractiveViewer(
                            child: Image.network(
                              widget.urls[i],
                              fit: BoxFit.contain,
                              errorBuilder: (_, _, _) => const Padding(
                                padding: EdgeInsets.all(48),
                                child: Text(
                                  'Unable to display this image. You can try downloading it or close and reopen the viewer.',
                                  style: TextStyle(color: Colors.white),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    if (canPrev)
                      Positioned(
                        left: 8,
                        top: 0,
                        bottom: 0,
                        child: Center(
                          child: _NavArrowButton(icon: Icons.chevron_left_rounded, onTap: () => _goTo(_index - 1)),
                        ),
                      ),
                    if (canNext)
                      Positioned(
                        right: 8,
                        top: 0,
                        bottom: 0,
                        child: Center(
                          child: _NavArrowButton(icon: Icons.chevron_right_rounded, onTap: () => _goTo(_index + 1)),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavArrowButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _NavArrowButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: icon == Icons.chevron_left_rounded ? 'Previous image' : 'Next image',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), shape: BoxShape.circle),
          alignment: Alignment.center,
          child: Icon(icon, color: Colors.white, size: 28),
        ),
      ),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  final IconData icon;
  final bool busy;
  final String? tooltip;
  final VoidCallback onTap;

  const _CircleIconButton({required this.icon, this.busy = false, this.tooltip, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final button = Semantics(
      button: true,
      label: tooltip,
      enabled: !busy,
      child: GestureDetector(
        onTap: busy ? null : onTap,
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), shape: BoxShape.circle),
          alignment: Alignment.center,
          child: busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Icon(icon, color: Colors.white, size: 22),
        ),
      ),
    );
    return tooltip != null ? Tooltip(message: tooltip!, child: button) : button;
  }
}

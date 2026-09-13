import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:gal/gal.dart';

/// Full-screen image viewer — mirrors web's click-to-expand lightbox with
/// prev/next navigation across an attachment group (`lightboxImages` /
/// `moveLightbox` in StudentDashboard.jsx), plus swipe support and a
/// mobile-only "download all" action for the whole group.
void showImageLightbox(BuildContext context, List<String> urls, int initialIndex) {
  if (urls.isEmpty) return;
  showDialog(
    context: context,
    barrierColor: Colors.black87,
    builder: (_) => _LightboxView(urls: urls, initialIndex: initialIndex.clamp(0, urls.length - 1)),
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

  Future<void> _downloadAll() async {
    if (_downloading) return;
    setState(() => _downloading = true);
    final messenger = ScaffoldMessenger.of(context);
    var saved = 0;
    try {
      final hasAccess = await Gal.hasAccess() || await Gal.requestAccess();
      if (!hasAccess) {
        messenger.showSnackBar(const SnackBar(content: Text('Permission to save photos was denied.')));
        return;
      }
      for (var i = 0; i < widget.urls.length; i++) {
        try {
          final tempPath = '${Directory.systemTemp.path}/academix-attachment-${DateTime.now().millisecondsSinceEpoch}-$i.jpg';
          await Dio().download(widget.urls[i], tempPath);
          await Gal.putImage(tempPath, album: 'AcademiX');
          saved++;
        } catch (_) {
          // best-effort — keep going with the remaining images
        }
      }
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(
        content: Text(saved == widget.urls.length
            ? 'Saved $saved image${saved == 1 ? '' : 's'} to Photos.'
            : 'Saved $saved of ${widget.urls.length} image(s).'),
      ));
    } finally {
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
        backgroundColor: Colors.transparent,
        body: Stack(
          children: [
            PageView.builder(
              controller: _controller,
              itemCount: widget.urls.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (_, i) => GestureDetector(
                onTap: () {}, // swallow taps on the image so it doesn't close the dialog
                child: Center(
                  child: InteractiveViewer(
                    child: Image.network(widget.urls[i], fit: BoxFit.contain),
                  ),
                ),
              ),
            ),
            if (canPrev)
              Positioned(
                left: 8,
                top: 0,
                bottom: 0,
                child: Center(child: _NavArrowButton(icon: Icons.chevron_left_rounded, onTap: () => _goTo(_index - 1))),
              ),
            if (canNext)
              Positioned(
                right: 8,
                top: 0,
                bottom: 0,
                child: Center(child: _NavArrowButton(icon: Icons.chevron_right_rounded, onTap: () => _goTo(_index + 1))),
              ),
            if (widget.urls.length > 1)
              Positioned(
                top: 44,
                left: 0,
                right: 0,
                child: Center(
                  child: Text(
                    '${_index + 1} / ${widget.urls.length}',
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            Positioned(
              top: 36,
              right: 12,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _CircleIconButton(
                    icon: Icons.download_rounded,
                    busy: _downloading,
                    tooltip: 'Download all',
                    onTap: _downloadAll,
                  ),
                  const SizedBox(width: 8),
                  _CircleIconButton(icon: Icons.close_rounded, onTap: () => Navigator.of(context).pop()),
                ],
              ),
            ),
          ],
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), shape: BoxShape.circle),
        alignment: Alignment.center,
        child: Icon(icon, color: Colors.white, size: 28),
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
    final button = GestureDetector(
      onTap: busy ? null : onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), shape: BoxShape.circle),
        alignment: Alignment.center,
        child: busy
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : Icon(icon, color: Colors.white, size: 22),
      ),
    );
    return tooltip != null ? Tooltip(message: tooltip!, child: button) : button;
  }
}


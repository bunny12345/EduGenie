import 'package:flutter/material.dart';

/// Full-screen image viewer — mirrors web's click-to-expand lightbox for
/// homework attachment/submission images (`lightboxUrl` in StudentDashboard.jsx).
void showImageLightbox(BuildContext context, String url) {
  showDialog(
    context: context,
    barrierColor: Colors.black87,
    builder: (ctx) => GestureDetector(
      onTap: () => Navigator.of(ctx).pop(),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Stack(
          children: [
            Center(
              child: InteractiveViewer(
                child: Image.network(url, fit: BoxFit.contain),
              ),
            ),
            Positioned(
              top: 40,
              right: 16,
              child: IconButton(
                onPressed: () => Navigator.of(ctx).pop(),
                icon: const Icon(Icons.close_rounded, color: Colors.white, size: 28),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

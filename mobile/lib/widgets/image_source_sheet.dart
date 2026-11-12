import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../theme/app_colors.dart';

/// Shows a "Take Photo" / "Choose from Gallery" action sheet and returns the
/// picked image(s) — shared by homework submission (student) and homework
/// assignment (teacher, create + edit) so camera capture is available
/// anywhere a photo can be attached, not just gallery picks. Returns an
/// empty list if the sheet is dismissed or no image is picked.
Future<List<XFile>> pickImagesWithSourceChoice(
  BuildContext context, {
  int limit = 6,
}) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('Add a photo', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.of(ctx).muted)),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Take Photo'),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Choose from Gallery'),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
  if (source == null) return [];

  final picker = ImagePicker();
  if (source == ImageSource.camera) {
    final file = await picker.pickImage(source: ImageSource.camera, imageQuality: 80);
    return file != null ? [file] : [];
  }
  return picker.pickMultiImage(imageQuality: 80, limit: limit);
}

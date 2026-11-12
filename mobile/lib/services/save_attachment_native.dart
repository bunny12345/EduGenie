import 'dart:typed_data';

import 'package:gal/gal.dart';

Future<void> saveAttachment(Uint8List bytes, String filename, String mimeType) async {
  if (!await Gal.hasAccess(toAlbum: true) && !await Gal.requestAccess(toAlbum: true)) {
    throw StateError('Permission to save photos was denied.');
  }
  await Gal.putImageBytes(bytes, album: 'AcademiX', name: filename);
}

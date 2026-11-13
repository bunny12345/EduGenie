import 'dart:convert';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';

BytesSource samAudioSource(Map<String, dynamic> tts) {
  final encoded = (tts['audioBase64'] as String? ?? '').trim();
  if (encoded.isEmpty) throw const FormatException('Sam returned empty voice audio.');
  final bytes = base64Decode(encoded);
  final isWav = bytes.length >= 12 &&
      ascii.decode(bytes.sublist(0, 4), allowInvalid: true) == 'RIFF' &&
      ascii.decode(bytes.sublist(8, 12), allowInvalid: true) == 'WAVE';
  if (!isWav) {
    final mime = (tts['mimeType'] as String? ?? '').trim();
    return BytesSource(bytes, mimeType: mime.isEmpty ? 'audio/mpeg' : mime);
  }

  // Streamed TTS WAVs can use unknown lengths. Native decoders need the
  // completed clip's actual RIFF/data sizes, unlike browser audio playback.
  final data = ByteData.sublistView(bytes);
  data.setUint32(4, bytes.length - 8, Endian.little);
  var offset = 12;
  while (offset + 8 <= bytes.length) {
    final id = ascii.decode(bytes.sublist(offset, offset + 4), allowInvalid: true);
    final size = data.getUint32(offset + 4, Endian.little);
    final body = offset + 8;
    if (id == 'data') {
      if (size == 0 || size > bytes.length - body) {
        data.setUint32(offset + 4, bytes.length - body, Endian.little);
      }
      return BytesSource(bytes, mimeType: 'audio/wav');
    }
    if (size > bytes.length - body) {
      throw const FormatException('Sam returned a truncated WAV chunk.');
    }
    offset = body + size + (size.isOdd ? 1 : 0);
  }
  throw const FormatException('Sam returned WAV audio without a data chunk.');
}

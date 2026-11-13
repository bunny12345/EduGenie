import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/utils/sam_audio_source.dart';
import 'package:mobile/utils/voice_envelope.dart';
import 'package:mobile/utils/wav_encoder.dart';

void main() {
  for (final length in [0, 0xffffffff]) {
    test('finalizes streamed WAV lengths ($length) without changing PCM', () {
      final pcm = Uint8List.fromList(List.generate(480, (i) => i % 256));
      final wav = wrapPcm16AsWav(pcm, sampleRate: 24000);
      final header = ByteData.sublistView(wav);
      header.setUint32(4, length, Endian.little);
      header.setUint32(40, length, Endian.little);
      final source = samAudioSource({'audioBase64': base64Encode(wav), 'mimeType': 'audio/wav'});
      final result = ByteData.sublistView(source.bytes);
      expect(source.mimeType, 'audio/wav');
      expect(result.getUint32(4, Endian.little), wav.length - 8);
      expect(result.getUint32(40, Endian.little), pcm.length);
      expect(source.bytes.sublist(44), pcm);
      expect(VoiceEnvelope.fromWav(source.bytes), isNotNull);
    });
  }

  test('finds data after padded metadata and preserves a valid data length', () {
    final wav = wrapPcm16AsWav(Uint8List(480), sampleRate: 24000);
    final withMetadata = Uint8List.fromList([
      ...wav.sublist(0, 36),
      ...ascii.encode('JUNK'), 1, 0, 0, 0, 7, 0,
      ...wav.sublist(36),
      0, 0,
    ]);
    final source = samAudioSource({'audioBase64': base64Encode(withMetadata)});
    final result = ByteData.sublistView(source.bytes);
    expect(source.mimeType, 'audio/wav');
    expect(result.getUint32(4, Endian.little), withMetadata.length - 8);
    expect(result.getUint32(50, Endian.little), 480);
  });

  test('retains older MP3 replies and provides a missing MIME type', () {
    final mp3 = Uint8List.fromList([0x49, 0x44, 0x33, 1, 2]);
    final source = samAudioSource({'audioBase64': base64Encode(mp3)});
    expect(source.bytes, mp3);
    expect(source.mimeType, 'audio/mpeg');
  });

  test('rejects empty and malformed WAV audio explicitly', () {
    expect(() => samAudioSource({'audioBase64': ''}), throwsFormatException);
    final wav = wrapPcm16AsWav(Uint8List(480));
    ByteData.sublistView(wav).setUint32(16, 0xffffffff, Endian.little);
    expect(() => samAudioSource({'audioBase64': base64Encode(wav)}), throwsFormatException);
  });
}

import 'dart:typed_data';

/// Wraps raw 16-bit PCM audio bytes in a minimal WAV (RIFF) container so it
/// can be sent to the backend's Whisper-based transcription endpoint, which
/// expects a real audio file format (not raw PCM).
Uint8List wrapPcm16AsWav(Uint8List pcmBytes, {int sampleRate = 16000, int numChannels = 1}) {
  const bitsPerSample = 16;
  final byteRate = sampleRate * numChannels * bitsPerSample ~/ 8;
  final blockAlign = numChannels * bitsPerSample ~/ 8;
  final dataLength = pcmBytes.length;

  final header = BytesBuilder();
  void writeString(String s) => header.add(s.codeUnits);
  void writeUint32(int v) => header.add([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
  void writeUint16(int v) => header.add([v & 0xff, (v >> 8) & 0xff]);

  writeString('RIFF');
  writeUint32(36 + dataLength);
  writeString('WAVE');
  writeString('fmt ');
  writeUint32(16);
  writeUint16(1); // PCM
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(byteRate);
  writeUint16(blockAlign);
  writeUint16(bitsPerSample);
  writeString('data');
  writeUint32(dataLength);

  final builder = BytesBuilder();
  builder.add(header.toBytes());
  builder.add(pcmBytes);
  return builder.toBytes();
}

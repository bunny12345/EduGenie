import 'dart:math' as math;
import 'dart:typed_data';

/// Loudness / brightness timeline of a spoken clip, used to drive Sam's mouth
/// in exact step with the audio. Built once per reply from the 16-bit PCM WAV
/// the TTS endpoint returns, then sampled by playback position.
///
/// `level` is 0..1 loudness; `bright` is 0 (dark "oo") … 1 (bright "ee"/"ss"),
/// estimated from the zero-crossing rate. Both use the same scaling as the
/// web avatar's analyser (`getSamMouthLevel`) so the mouth looks identical.
class VoiceEnvelope {
  static const double frameSeconds = 0.01;
  // Loudness most voiced frames are mapped to (≈ a relaxed, half-open mouth).
  static const double _typicalLevel = 0.26;

  final Float32List _level;
  final Float32List _bright;

  VoiceEnvelope._(this._level, this._bright);

  int get frames => _level.length;
  Duration get duration => Duration(milliseconds: (frames * frameSeconds * 1000).round());

  ({double level, double bright}) at(Duration position) {
    if (_level.isEmpty) return (level: 0, bright: 0.4);
    final f = position.inMicroseconds / (frameSeconds * 1e6);
    final i = f.floor().clamp(0, _level.length - 1);
    final j = math.min(i + 1, _level.length - 1);
    final t = (f - i).clamp(0.0, 1.0);
    return (
      level: _level[i] + (_level[j] - _level[i]) * t,
      bright: _bright[i] + (_bright[j] - _bright[i]) * t,
    );
  }

  /// Returns null when [wav] isn't a 16-bit PCM RIFF/WAVE file.
  static VoiceEnvelope? fromWav(Uint8List wav) {
    if (wav.length < 44) return null;
    final data = ByteData.sublistView(wav);
    if (String.fromCharCodes(wav.sublist(0, 4)) != 'RIFF' || String.fromCharCodes(wav.sublist(8, 12)) != 'WAVE') return null;

    var pos = 12;
    int? channels;
    int? sampleRate;
    int? bits;
    int? dataStart;
    int? dataLen;
    while (pos + 8 <= wav.length) {
      final id = String.fromCharCodes(wav.sublist(pos, pos + 4));
      var size = data.getUint32(pos + 4, Endian.little);
      final body = pos + 8;
      if (id == 'fmt ' && body + 16 <= wav.length) {
        channels = data.getUint16(body + 2, Endian.little);
        sampleRate = data.getUint32(body + 4, Endian.little);
        bits = data.getUint16(body + 14, Endian.little);
      } else if (id == 'data') {
        dataStart = body;
        // Streamed WAVs may carry a 0/0xFFFFFFFF length: use what is there.
        if (size == 0 || size == 0xFFFFFFFF || body + size > wav.length) size = wav.length - body;
        dataLen = size;
        break;
      }
      pos = body + size + (size.isOdd ? 1 : 0);
    }
    if (channels == null || sampleRate == null || bits != 16 || dataStart == null || dataLen == null || channels < 1) return null;

    final frameSamples = math.max(1, (sampleRate * frameSeconds).round());
    final totalSamples = dataLen ~/ (2 * channels);
    final frameCount = totalSamples ~/ frameSamples;
    if (frameCount == 0) return null;

    final level = Float32List(frameCount);
    final bright = Float32List(frameCount);
    for (var f = 0; f < frameCount; f++) {
      var sumSq = 0.0;
      var crossings = 0;
      var prev = 0.0;
      for (var s = 0; s < frameSamples; s++) {
        final offset = dataStart + ((f * frameSamples + s) * channels) * 2;
        final v = data.getInt16(offset, Endian.little) / 32768.0;
        sumSq += v * v;
        if (s > 0 && ((v >= 0) != (prev >= 0))) crossings++;
        prev = v;
      }
      final rms = math.sqrt(sumSq / frameSamples);
      level[f] = math.min(1.0, rms * 5);
      // Crossings per sample at 24 kHz: ~0.04 for vowels, 0.3+ for "s"/"sh".
      final zcr = crossings / frameSamples * (sampleRate / 24000);
      bright[f] = ((zcr - 0.03) / 0.2).clamp(0.0, 1.0);
    }

    // TTS clips are mastered loud, so raw RMS keeps the jaw wide open. Rescale
    // each clip so its typical voiced loudness lands at a natural, moderate
    // opening, then soften peaks; also smooth over ±10 ms to remove flapping.
    final voiced = <double>[for (final v in level) if (v > 0.04) v]..sort();
    final p85 = voiced.isEmpty ? 0.0 : voiced[(voiced.length * 0.85).floor().clamp(0, voiced.length - 1)];
    final gain = p85 > 0 ? (_typicalLevel / p85).clamp(0.2, 1.5) : 1.0;
    final smoothLevel = Float32List(frameCount);
    for (var f = 0; f < frameCount; f++) {
      final a = level[math.max(0, f - 1)];
      final b = level[f];
      final c = level[math.min(frameCount - 1, f + 1)];
      final v = (a + 2 * b + c) / 4 * gain;
      smoothLevel[f] = v <= _typicalLevel ? v : _typicalLevel + (v - _typicalLevel) * 0.35;
    }

    // Light smoothing: raw zero-crossing / RMS frames are jittery.
    final smoothBright = Float32List(frameCount);
    for (var f = 0; f < frameCount; f++) {
      var sum = 0.0;
      var weight = 0.0;
      for (var k = -3; k <= 3; k++) {
        final i = f + k;
        if (i < 0 || i >= frameCount) continue;
        // Quiet frames carry no pitch information — don't let them drag brightness around.
        final w = (4 - k.abs()) * (0.15 + level[i]);
        sum += bright[i] * w;
        weight += w;
      }
      smoothBright[f] = weight > 0 ? sum / weight : 0.4;
    }
    return VoiceEnvelope._(smoothLevel, smoothBright);
  }
}

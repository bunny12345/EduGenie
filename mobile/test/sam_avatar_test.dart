import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/utils/tutor_text.dart';
import 'package:mobile/utils/voice_envelope.dart';
import 'package:mobile/widgets/sam_avatar.dart';

void main() {
  testWidgets('SamAvatar paints in every mode without errors', (tester) async {
    for (final mode in SamMode.values) {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 360,
                height: 420,
                child: SamAvatar(mode: mode, schoolName: 'Nagarjuna model school', viewTop: 96, viewHeight: 590),
              ),
            ),
          ),
        ),
      );
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(tester.takeException(), isNull);
    }
  });

  test('tutorDisplayText turns LaTeX into readable symbols', () {
    final out = tutorDisplayText(r'A number is \( \frac{p}{q} \), where \( q \neq 0 \). **Example**: x^2');
    expect(out.contains(r'\'), isFalse);
    expect(out, contains('p/q'));
    expect(out, contains('≠'));
    expect(out, contains('x²'));
    expect(out.contains('**'), isFalse);
  });

  test('tutorDisplayText cleans a typical tutor reply', () {
    final out = tutorDisplayText(r'Yes, \( \frac{4}{5} \) is a rational number! Use \( \frac{p}{q} \), where \( q = 5 \).');
    expect(out, 'Yes, 4/5 is a rational number! Use p/q, where q = 5.');
  });

  test('tutorSpeechText reads maths as words', () {
    final out = tutorSpeechText('- Concept:\n- \\( \\frac{p}{q} \\) where \\( q \\neq 0 \\)..');
    expect(out, contains('p over q'));
    expect(out, contains('not equal to'));
    expect(out.contains(r'\'), isFalse);
    expect(out.contains('..'), isFalse);
  });

  test('VoiceEnvelope follows loudness of a WAV clip', () {
    const rate = 24000;
    // 0.5s silence, then 0.5s of a loud 300 Hz tone.
    final samples = Int16List(rate);
    for (var i = rate ~/ 2; i < rate; i++) {
      samples[i] = (math.sin(2 * math.pi * 300 * i / rate) * 16000).round();
    }
    final header = ByteData(44)
      ..setUint32(4, 36 + samples.lengthInBytes, Endian.little)
      ..setUint32(16, 16, Endian.little)
      ..setUint16(20, 1, Endian.little)
      ..setUint16(22, 1, Endian.little)
      ..setUint32(24, rate, Endian.little)
      ..setUint32(28, rate * 2, Endian.little)
      ..setUint16(32, 2, Endian.little)
      ..setUint16(34, 16, Endian.little)
      ..setUint32(40, samples.lengthInBytes, Endian.little);
    final wav = Uint8List(44 + samples.lengthInBytes)
      ..setAll(0, header.buffer.asUint8List())
      ..setAll(0, 'RIFF'.codeUnits)
      ..setAll(8, 'WAVEfmt '.codeUnits)
      ..setAll(36, 'data'.codeUnits)
      ..setAll(44, samples.buffer.asUint8List());

    final env = VoiceEnvelope.fromWav(wav)!;
    expect(env.duration.inMilliseconds, closeTo(1000, 20));
    expect(env.at(const Duration(milliseconds: 250)).level, lessThan(0.01));
    expect(env.at(const Duration(milliseconds: 750)).level, inInclusiveRange(0.2, 0.32));
    expect(VoiceEnvelope.fromWav(Uint8List(100)), isNull);
  });
}

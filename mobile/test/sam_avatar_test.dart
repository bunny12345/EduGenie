import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/utils/tutor_text.dart';
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
}

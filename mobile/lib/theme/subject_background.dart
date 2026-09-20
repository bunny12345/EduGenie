import 'package:flutter/material.dart';

/// Per-subject page-background theme — ported 1:1 from the `PALETTES` map and
/// `getPalette()` in `web/src/components/SubjectBackground.jsx`, so the
/// teacher app's background tint/accent matches the website exactly for
/// whichever subject the signed-in teacher teaches.
class SubjectBgPalette {
  final Color bg;
  final Color fill;
  final Color stroke;
  final Color accent;

  const SubjectBgPalette({
    required this.bg,
    required this.fill,
    required this.stroke,
    required this.accent,
  });
}

const _science = SubjectBgPalette(
  bg: Color(0xFFEEFBF3),
  fill: Color(0xFFC6EDD8),
  stroke: Color(0xFF8DD5AA),
  accent: Color(0xFF10B981),
);
const _biology = SubjectBgPalette(
  bg: Color(0xFFEEFBF3),
  fill: Color(0xFFC6EDD8),
  stroke: Color(0xFF8DD5AA),
  accent: Color(0xFF22C55E),
);
const _english = SubjectBgPalette(
  bg: Color(0xFFFDF2F6),
  fill: Color(0xFFF5D0DF),
  stroke: Color(0xFFE8A6C0),
  accent: Color(0xFFD63384),
);
const _hindi = SubjectBgPalette(
  bg: Color(0xFFFEF6EE),
  fill: Color(0xFFF5DDC4),
  stroke: Color(0xFFE8C49E),
  accent: Color(0xFFD97706),
);
const _telugu = SubjectBgPalette(
  bg: Color(0xFFEEFBF3),
  fill: Color(0xFFC6EDD8),
  stroke: Color(0xFF8DD5AA),
  accent: Color(0xFF0D9E6B),
);
const _math = SubjectBgPalette(
  bg: Color(0xFFFEFAED),
  fill: Color(0xFFF5E6B8),
  stroke: Color(0xFFD4BE7A),
  accent: Color(0xFFB8860B),
);
const _physics = SubjectBgPalette(
  bg: Color(0xFFEEF0FB),
  fill: Color(0xFFC8CEF0),
  stroke: Color(0xFF99A4DD),
  accent: Color(0xFF5B6ABF),
);
const _chemistry = SubjectBgPalette(
  bg: Color(0xFFEEF5FB),
  fill: Color(0xFFC2DDF0),
  stroke: Color(0xFF8EC0DD),
  accent: Color(0xFF3B82C4),
);
const _social = SubjectBgPalette(
  bg: Color(0xFFF0EDFB),
  fill: Color(0xFFD1C8F0),
  stroke: Color(0xFFA99DDD),
  accent: Color(0xFF7C5BE6),
);
const _computer = SubjectBgPalette(
  bg: Color(0xFFEEF0FB),
  fill: Color(0xFFC8CEF0),
  stroke: Color(0xFF99A4DD),
  accent: Color(0xFF3B82F6),
);
const _defaultPalette = SubjectBgPalette(
  bg: Color(0xFFF0EEFF),
  fill: Color(0xFFD8D2F5),
  stroke: Color(0xFFB0A6E0),
  accent: Color(0xFF5B47FF),
);

/// Mirrors `getPalette(subject)` exactly (same substring checks, same order).
SubjectBgPalette subjectBgPalette(String? subject) {
  final s = (subject ?? '').toLowerCase();
  if (s.contains('math')) return _math;
  if (s.contains('physics')) return _physics;
  if (s.contains('chemistry')) return _chemistry;
  if (s.contains('science')) return _science;
  if (s.contains('bio')) return _biology;
  if (s.contains('english') ||
      s.contains('language') ||
      s.contains('literature')) {
    return _english;
  }
  if (s.contains('hindi') || s.contains('sanskrit') || s.contains('urdu')) {
    return _hindi;
  }
  if (s.contains('telugu') ||
      s.contains('tamil') ||
      s.contains('kannada') ||
      s.contains('malayalam')) {
    return _telugu;
  }
  if (s.contains('history') || s.contains('social')) return _social;
  if (s.contains('geo')) return _social;
  if (s.contains('computer') || s.contains('coding')) return _computer;
  return _defaultPalette;
}

/// The soft two-blob wash shared by every per-subject illustration on web
/// (each one has a large `fill`-colored circle top-left and another
/// bottom-right at the same rough proportions) — the page-wide "theme" look,
/// ported without needing every subject's unique motif (math symbols,
/// chemistry flask, etc.) which wouldn't read at phone scale anyway.
class SubjectBackground extends StatelessWidget {
  final String? subject;

  const SubjectBackground({super.key, required this.subject});

  @override
  Widget build(BuildContext context) {
    final palette = subjectBgPalette(subject);
    return IgnorePointer(
      child: Positioned.fill(
        child: CustomPaint(painter: _SubjectBackgroundPainter(palette)),
      ),
    );
  }
}

class _SubjectBackgroundPainter extends CustomPainter {
  final SubjectBgPalette palette;

  _SubjectBackgroundPainter(this.palette);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = palette.bg);

    final topLeft = Offset(
      size.width * (140 / 1400),
      size.height * (120 / 760),
    );
    canvas.drawCircle(
      topLeft,
      size.width * (115 / 1400),
      Paint()..color = palette.fill.withValues(alpha: 0.42),
    );

    final bottomRight = Offset(
      size.width * (1280 / 1400),
      size.height * (610 / 760),
    );
    canvas.drawCircle(
      bottomRight,
      size.width * (128 / 1400),
      Paint()..color = palette.fill.withValues(alpha: 0.32),
    );
  }

  @override
  bool shouldRepaint(covariant _SubjectBackgroundPainter old) =>
      old.palette != palette;
}

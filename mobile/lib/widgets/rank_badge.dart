import 'dart:math' as math;

import 'package:flutter/material.dart';

class _RankStyle {
  final String label;
  final Color c1, c2, c3, ring, text, ribbonA, ribbonB, laurel;

  const _RankStyle({
    required this.label,
    required this.c1,
    required this.c2,
    required this.c3,
    required this.ring,
    required this.text,
    required this.ribbonA,
    required this.ribbonB,
    required this.laurel,
  });
}

const _styles = <int, _RankStyle>{
  1: _RankStyle(
    label: '1st Rank',
    c1: Color(0xFFFFF6B0),
    c2: Color(0xFFFFD21F),
    c3: Color(0xFFE39A00),
    ring: Color(0xFFB36B00),
    text: Color(0xFF7A4600),
    ribbonA: Color(0xFFEF4444),
    ribbonB: Color(0xFFB91C1C),
    laurel: Color(0xFFF5B700),
  ),
  2: _RankStyle(
    label: '2nd Rank',
    c1: Color(0xFFFFFFFF),
    c2: Color(0xFFDFE5F0),
    c3: Color(0xFF8E9BB5),
    ring: Color(0xFF66738E),
    text: Color(0xFF47526B),
    ribbonA: Color(0xFF3B82F6),
    ribbonB: Color(0xFF1D4ED8),
    laurel: Color(0xFFAAB4C8),
  ),
  3: _RankStyle(
    label: '3rd Rank',
    c1: Color(0xFFFFE2C2),
    c2: Color(0xFFDC8F52),
    c3: Color(0xFF9A5524),
    ring: Color(0xFF7A3F14),
    text: Color(0xFF5C2C0C),
    ribbonA: Color(0xFF22C55E),
    ribbonB: Color(0xFF15803D),
    laurel: Color(0xFFC98040),
  ),
};

String rankLabel(int rank) => _styles[rank]?.label ?? '';

String rankOrdinal(int rank) => const ['', '1st', '2nd', '3rd'][rank.clamp(0, 3)];

/// Medal badge for the class's top 3 — mirrors `RankBadge.jsx` on web.
/// Rank 1 is the grandest (crown, laurel wreath, sparkles, shine sweep),
/// rank 2 a silver medal, rank 3 a bronze medal.
class RankBadge extends StatefulWidget {
  final int rank;
  final double size;
  final bool animated;

  const RankBadge({super.key, required this.rank, this.size = 96, this.animated = true});

  @override
  State<RankBadge> createState() => _RankBadgeState();
}

class _RankBadgeState extends State<RankBadge> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 3200));
    if (widget.animated) _c.repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final style = _styles[widget.rank];
    if (style == null) return const SizedBox.shrink();
    return Semantics(
      label: style.label,
      child: SizedBox(
        width: widget.size,
        height: widget.size * (142 / 120),
        child: CustomPaint(painter: _BadgePainter(widget.rank, style, widget.animated, _c)),
      ),
    );
  }
}

class _BadgePainter extends CustomPainter {
  final int rank;
  final _RankStyle st;
  final bool animated;
  final Animation<double> anim;

  _BadgePainter(this.rank, this.st, this.animated, this.anim) : super(repaint: anim);

  void _sparkle(Canvas canvas, double x, double y, double s, double delay, double t) {
    final phase = animated ? (t * 2 + delay) % 1.0 : 0.6;
    final k = 0.4 + 0.75 * math.sin(math.pi * phase);
    final r = 7 * s * k;
    final path = Path()
      ..moveTo(x, y - r)
      ..lineTo(x + r * 0.28, y - r * 0.28)
      ..lineTo(x + r, y)
      ..lineTo(x + r * 0.28, y + r * 0.28)
      ..lineTo(x, y + r)
      ..lineTo(x - r * 0.28, y + r * 0.28)
      ..lineTo(x - r, y)
      ..lineTo(x - r * 0.28, y - r * 0.28)
      ..close();
    canvas.drawPath(path, Paint()..color = Colors.white);
    canvas.drawPath(path, Paint()..style = PaintingStyle.stroke..strokeWidth = 0.6..color = const Color(0xFFFFD21F));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final t = animated ? anim.value : 0.0;
    canvas.save();
    canvas.scale(size.width / 120);
    // Rank 1 gently floats.
    if (rank == 1 && animated) canvas.translate(0, -2 * math.sin(t * 2 * math.pi));

    const cx = 60.0, cy = 64.0;

    if (rank == 1) {
      final leaf = Paint()..color = st.laurel.withValues(alpha: 0.95);
      for (final side in [1, -1]) {
        for (var i = 0; i < 7; i++) {
          final a = (150 + i * 14) * math.pi / 180;
          final x = cx + math.cos(a) * 44 * side;
          final y = cy + math.sin(a) * 44;
          canvas.save();
          canvas.translate(x, y);
          canvas.rotate((i * 14 + 60) * side * math.pi / 180);
          canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: 8.4, height: 18), leaf);
          canvas.restore();
        }
      }
    }

    // ribbon tails
    final ribbonShader = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [st.ribbonA, st.ribbonB],
    ).createShader(const Rect.fromLTWH(28, 88, 64, 50));
    final ribbonPaint = Paint()..shader = ribbonShader;
    canvas.drawPath(
      Path()
        ..moveTo(40, 88)
        ..lineTo(28, 134)
        ..lineTo(42, 126)
        ..lineTo(52, 138)
        ..lineTo(58, 92)
        ..close(),
      ribbonPaint,
    );
    canvas.drawPath(
      Path()
        ..moveTo(80, 88)
        ..lineTo(92, 134)
        ..lineTo(78, 126)
        ..lineTo(68, 138)
        ..lineTo(62, 92)
        ..close(),
      ribbonPaint,
    );

    // medal
    canvas.drawCircle(const Offset(cx, cy), 34, Paint()..color = st.ring);
    final medalShader = RadialGradient(
      center: const Alignment(-0.3, -0.4),
      radius: 0.95,
      colors: [st.c1, st.c2, st.c3],
      stops: const [0, 0.55, 1],
    ).createShader(Rect.fromCircle(center: const Offset(cx, cy), radius: 31));
    canvas.drawCircle(const Offset(cx, cy), 31, Paint()..shader = medalShader);
    canvas.drawCircle(
      const Offset(cx, cy),
      25,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..color = Colors.white.withValues(alpha: 0.55),
    );

    final tp = TextPainter(
      text: TextSpan(
        text: '$rank',
        style: TextStyle(fontSize: 34, fontWeight: FontWeight.w900, color: st.text),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(cx - tp.width / 2, cy - tp.height / 2 + 1));

    // shine sweep (clipped to the medal)
    if (animated && t < 0.45) {
      canvas.save();
      canvas.clipPath(Path()..addOval(Rect.fromCircle(center: const Offset(cx, cy), radius: 31)));
      canvas.translate(cx, cy);
      canvas.rotate(25 * math.pi / 180);
      canvas.translate(-cx, -cy);
      final x = -20 + 130 * (t / 0.45);
      canvas.drawRect(Rect.fromLTWH(x, 20, 14, 90), Paint()..color = Colors.white.withValues(alpha: 0.55));
      canvas.restore();
    }

    if (rank == 1) {
      final crown = Path()
        ..moveTo(38, 36)
        ..lineTo(42, 16)
        ..lineTo(51, 27)
        ..lineTo(60, 10)
        ..lineTo(69, 27)
        ..lineTo(78, 16)
        ..lineTo(82, 36)
        ..close();
      canvas.drawPath(crown, Paint()..color = const Color(0xFFFFD21F));
      canvas.drawPath(
        crown,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6
          ..strokeJoin = StrokeJoin.round
          ..color = const Color(0xFFB36B00),
      );
      canvas.drawCircle(const Offset(42, 16), 2.6, Paint()..color = const Color(0xFFEF4444));
      canvas.drawCircle(const Offset(60, 10), 3, Paint()..color = const Color(0xFF3B82F6));
      canvas.drawCircle(const Offset(78, 16), 2.6, Paint()..color = const Color(0xFFEF4444));
      _sparkle(canvas, 18, 30, 1.1, 0, t);
      _sparkle(canvas, 104, 26, 0.9, 0.33, t);
      _sparkle(canvas, 100, 96, 0.8, 0.66, t);
    } else if (rank == 2) {
      _sparkle(canvas, 24, 28, 0.9, 0.2, t);
      _sparkle(canvas, 98, 34, 0.8, 0.6, t);
    } else {
      _sparkle(canvas, 26, 30, 0.8, 0.4, t);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _BadgePainter old) => old.rank != rank || old.animated != animated;
}

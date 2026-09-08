import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../models/learning_score.dart';

/// Custom-painted charts ported 1:1 (same shapes/colors, scaled to fit a
/// phone) from the SVGs in `web/src/components/StudentProgress.jsx`
/// (`ScoreGauge`, `TrendChart`/`SubjectTrendChart`/`SubjectGraph`, `RadarChart`).

/// Circular ring gauge — track + gradient value arc starting at 12 o'clock,
/// going clockwise. Reused for the big overall gauge, the subject-card ring,
/// and the subject-detail gauge (just different diameter/stroke/child).
class RingGauge extends StatelessWidget {
  final double diameter;
  final double strokeWidth;
  final double fraction; // 0..1
  final Color color;
  final Widget? child;

  const RingGauge({super.key, required this.diameter, required this.strokeWidth, required this.fraction, required this.color, this.child});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: diameter,
      height: diameter,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size(diameter, diameter),
            painter: _RingGaugePainter(strokeWidth: strokeWidth, fraction: fraction, color: color),
          ),
          ?child,
        ],
      ),
    );
  }
}

class _RingGaugePainter extends CustomPainter {
  final double strokeWidth;
  final double fraction;
  final Color color;

  _RingGaugePainter({required this.strokeWidth, required this.fraction, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = (size.width - strokeWidth) / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);

    final track = Paint()
      ..color = const Color(0xFFEEF0FA)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;
    canvas.drawCircle(center, radius, track);

    final valuePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..shader = SweepGradient(
        startAngle: 0,
        endAngle: 6.28318530718 * fraction.clamp(0.0001, 1.0),
        colors: [color, const Color(0xFFA78BFA)],
        transform: const GradientRotation(-1.5707963268),
      ).createShader(rect);
    canvas.drawArc(rect, -1.5707963268, 6.28318530718 * fraction.clamp(0.0, 1.0), false, valuePaint);
  }

  @override
  bool shouldRepaint(covariant _RingGaugePainter old) => old.fraction != fraction || old.color != color || old.strokeWidth != strokeWidth;
}

/// Growth line chart — area fill + line + dots, with grid/axis labels in
/// "full" mode (overall / subject-detail trend) or a compact label-only
/// style in "mini" mode (subject-card mini graph).
class GrowthLineChart extends StatelessWidget {
  final List<ChartPoint> points;
  final double maxY;
  final List<double> gridVals;
  final Color color;
  final String mode; // 'daily' | 'monthly'
  final bool mini;
  final double miniHeight;
  final bool percentSuffix;

  const GrowthLineChart({
    super.key,
    required this.points,
    required this.maxY,
    required this.gridVals,
    required this.color,
    required this.mode,
    this.mini = false,
    this.miniHeight = 64,
    this.percentSuffix = false,
  });

  @override
  Widget build(BuildContext context) {
    final real = points.where((p) => p.value != null).toList();
    final active = real.any((p) => (p.value ?? 0) > 0);
    if (points.isEmpty || !active) {
      return SizedBox(
        height: mini ? miniHeight : 170,
        child: Center(
          child: Text(
            mini ? 'No activity yet — start to see the graph grow 🌱' : 'Your growth line shows up here as you learn.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: mini ? 9.5 : 12.5, color: const Color(0xFF8B90AD), height: 1.3),
          ),
        ),
      );
    }
    return SizedBox(
      height: mini ? miniHeight : 190,
      width: double.infinity,
      child: CustomPaint(
        painter: _GrowthLinePainter(
          points: points,
          maxY: maxY,
          gridVals: mini ? const [] : gridVals,
          color: color,
          mode: mode,
          mini: mini,
          percentSuffix: percentSuffix,
        ),
      ),
    );
  }
}

class _GrowthLinePainter extends CustomPainter {
  final List<ChartPoint> points;
  final double maxY;
  final List<double> gridVals;
  final Color color;
  final String mode;
  final bool mini;
  final bool percentSuffix;

  _GrowthLinePainter({
    required this.points,
    required this.maxY,
    required this.gridVals,
    required this.color,
    required this.mode,
    required this.mini,
    required this.percentSuffix,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final padL = mini ? 4.0 : 38.0;
    final padR = mini ? 4.0 : 16.0;
    final padT = mini ? 6.0 : 18.0;
    final padB = mini ? 16.0 : (mode == 'daily' ? 36.0 : 30.0);
    final innerW = size.width - padL - padR;
    final innerH = size.height - padT - padB;

    double x(int i) => padL + (i / (points.length - 1).clamp(1, 1 << 30)) * innerW;
    double y(double v) => padT + innerH - (v.clamp(0, maxY) / maxY) * innerH;

    final real = <MapEntry<int, ChartPoint>>[];
    for (var i = 0; i < points.length; i++) {
      if (points[i].value != null) real.add(MapEntry(i, points[i]));
    }
    if (real.isEmpty) return;

    // Grid lines + y-axis labels (full mode only).
    for (final g in gridVals) {
      final gy = y(g);
      final gridPaint = Paint()
        ..color = const Color(0xFFEEF0FA)
        ..strokeWidth = 1;
      canvas.drawLine(Offset(padL, gy), Offset(size.width - padR, gy), gridPaint);
      _drawText(canvas, '${g.toInt()}${percentSuffix ? '%' : ''}', Offset(padL - 6, gy), fontSize: 9.5, color: const Color(0xFFB6BAD2), align: TextAlign.right, anchorRight: true);
    }

    final lastRealIdx = real.last.key;
    final hasFuture = mode == 'monthly' && real.length < points.length;

    // "Road ahead" shading + goal dashed line (monthly mode with future buckets).
    if (hasFuture && !mini) {
      final futureRect = Rect.fromLTRB(x(lastRealIdx), padT, x(points.length - 1), padT + innerH);
      canvas.drawRect(futureRect, Paint()..color = const Color(0xFFF5F6FF));
      final nowLinePaint = Paint()
        ..color = const Color(0xFFD7D9EE)
        ..strokeWidth = 1.5;
      _drawDashedLine(canvas, Offset(x(lastRealIdx), padT), Offset(x(lastRealIdx), padT + innerH), nowLinePaint);
      final goalY = y(real.last.value.value!);
      final goalPaint = Paint()
        ..color = color.withValues(alpha: 0.45)
        ..strokeWidth = 2;
      _drawDashedLine(canvas, Offset(x(lastRealIdx), goalY), Offset(x(points.length - 1), goalY), goalPaint);
      _drawText(canvas, '🎯 keep going', Offset(x(points.length - 1), goalY - 14), fontSize: 10, color: const Color(0xFF9AA0BD), align: TextAlign.right, anchorRight: true);
    }

    // Area fill.
    final areaPath = Path()..moveTo(x(real.first.key), padT + innerH);
    for (final e in real) {
      areaPath.lineTo(x(e.key), y(e.value.value!));
    }
    areaPath.lineTo(x(real.last.key), padT + innerH);
    areaPath.close();
    canvas.drawPath(
      areaPath,
      Paint()
        ..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [color.withValues(alpha: mini ? 0.28 : 0.34), color.withValues(alpha: 0)])
            .createShader(Rect.fromLTWH(0, padT, size.width, innerH)),
    );

    // Line.
    final linePath = Path()..moveTo(x(real.first.key), y(real.first.value.value!));
    for (final e in real.skip(1)) {
      linePath.lineTo(x(e.key), y(e.value.value!));
    }
    canvas.drawPath(
      linePath,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = mini ? 2.4 : 3
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // Dots + x-axis labels + value labels.
    final last = points.length - 1;
    final labelEvery = mode == 'daily' && points.length > (mini ? 7 : 8) ? (mini ? 3 : 2) : (mini && mode == 'daily' ? 2 : 1);
    for (var i = 0; i < points.length; i++) {
      final p = points[i];
      final isFuture = p.value == null;
      final showLabel = i % labelEvery == 0 || i == last;
      if (!mini && showLabel) {
        final text = mode == 'daily' && p.weekday != null ? p.weekday! : p.label;
        _drawText(canvas, text, Offset(x(i), size.height - padB + 12), fontSize: 11, color: isFuture ? const Color(0xFFC2C6DC) : const Color(0xFF6B7194), align: TextAlign.center, bold: true);
        if (mode == 'daily') {
          _drawText(canvas, p.label, Offset(x(i), size.height - padB + 24), fontSize: 9.5, color: const Color(0xFFB6BAD2), align: TextAlign.center);
        }
      } else if (mini && showLabel) {
        _drawText(canvas, p.label, Offset(x(i), size.height - 4), fontSize: 8, color: isFuture ? const Color(0xFFC2C6DC) : const Color(0xFFB6BAD2), align: TextAlign.center);
      }
      if (!isFuture) {
        final isLastReal = i == lastRealIdx;
        final dotRadius = isLastReal ? (mini ? 4.0 : 6.0) : (mini ? 2.5 : 4.0);
        final dotPos = Offset(x(i), y(p.value!));
        if (mini) {
          // Compact mode only shows a single solid dot on the most recent point.
          if (isLastReal) canvas.drawCircle(dotPos, dotRadius, Paint()..color = color);
        } else {
          canvas.drawCircle(dotPos, dotRadius, Paint()..color = Colors.white);
          canvas.drawCircle(dotPos, dotRadius, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 3);
        }
        final showVal = !mini && (isLastReal || mode == 'monthly');
        if (showVal) {
          _drawText(canvas, '${p.value!.round()}${percentSuffix ? '%' : ''}', Offset(x(i), y(p.value!) - 14), fontSize: 10.5, color: const Color(0xFF6B7194), align: TextAlign.center, bold: true);
        }
      }
    }
  }

  void _drawDashedLine(Canvas canvas, Offset a, Offset b, Paint paint) {
    const dashLen = 4.0;
    const gapLen = 4.0;
    final total = (b - a).distance;
    final dir = (b - a) / (total == 0 ? 1 : total);
    var covered = 0.0;
    var draw = true;
    var cursor = a;
    while (covered < total) {
      final step = draw ? dashLen : gapLen;
      final next = cursor + dir * step;
      if (draw) canvas.drawLine(cursor, next, paint);
      cursor = next;
      covered += step;
      draw = !draw;
    }
  }

  void _drawText(Canvas canvas, String text, Offset anchor, {required double fontSize, required Color color, TextAlign align = TextAlign.left, bool anchorRight = false, bool bold = false}) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: TextStyle(fontSize: fontSize, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
      textAlign: align,
      textDirection: TextDirection.ltr,
    )..layout();
    double dx = anchor.dx;
    if (align == TextAlign.center) {
      dx -= tp.width / 2;
    } else if (anchorRight || align == TextAlign.right) {
      dx -= tp.width;
    }
    tp.paint(canvas, Offset(dx, anchor.dy - tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _GrowthLinePainter old) => old.points != points || old.mode != mode || old.color != color;
}

/// 9-axis radar/spider chart (rings + axis lines + emoji labels + filled
/// value polygon) — mirrors `RadarChart` in `StudentProgress.jsx`.
class RadarChart extends StatelessWidget {
  final List<ScoreDimension> dimensions;
  final List<String> emojis;
  final Color color;
  final double diameter;

  const RadarChart({super.key, required this.dimensions, required this.emojis, required this.color, this.diameter = 220});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: diameter,
      height: diameter,
      child: CustomPaint(painter: _RadarChartPainter(dimensions: dimensions, emojis: emojis, color: color)),
    );
  }
}

class _RadarChartPainter extends CustomPainter {
  final List<ScoreDimension> dimensions;
  final List<String> emojis;
  final Color color;

  _RadarChartPainter({required this.dimensions, required this.emojis, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final n = dimensions.isEmpty ? 1 : dimensions.length;
    final center = size.center(Offset.zero);
    final r = size.width * 0.32;

    Offset point(int i, double frac) {
      final angle = (2 * math.pi * i) / n - math.pi / 2;
      return Offset(center.dx + math.cos(angle) * r * frac, center.dy + math.sin(angle) * r * frac);
    }

    final ringPaint = Paint()
      ..color = const Color(0xFFEEF0FA)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (final ring in [0.25, 0.5, 0.75, 1.0]) {
      final path = Path();
      for (var i = 0; i < n; i++) {
        final p = point(i, ring);
        if (i == 0) {
          path.moveTo(p.dx, p.dy);
        } else {
          path.lineTo(p.dx, p.dy);
        }
      }
      path.close();
      canvas.drawPath(path, ringPaint);
    }

    for (var i = 0; i < dimensions.length; i++) {
      final axisEnd = point(i, 1);
      canvas.drawLine(center, axisEnd, ringPaint);
      final labelPos = point(i, 1.18);
      final emoji = i < emojis.length ? emojis[i] : '⭐';
      final tp = TextPainter(text: TextSpan(text: emoji, style: const TextStyle(fontSize: 15)), textDirection: TextDirection.ltr)..layout();
      tp.paint(canvas, Offset(labelPos.dx - tp.width / 2, labelPos.dy - tp.height / 2));
    }

    if (dimensions.isEmpty) return;
    final valuePath = Path();
    for (var i = 0; i < dimensions.length; i++) {
      final frac = (dimensions[i].value / 100).clamp(0.02, 1.0);
      final p = point(i, frac);
      if (i == 0) {
        valuePath.moveTo(p.dx, p.dy);
      } else {
        valuePath.lineTo(p.dx, p.dy);
      }
    }
    valuePath.close();
    canvas.drawPath(valuePath, Paint()..color = color.withValues(alpha: 0.22));
    canvas.drawPath(valuePath, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 2);
    for (var i = 0; i < dimensions.length; i++) {
      final frac = (dimensions[i].value / 100).clamp(0.02, 1.0);
      final p = point(i, frac);
      canvas.drawCircle(p, 3, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(covariant _RadarChartPainter old) => old.dimensions != dimensions || old.color != color;
}

import 'dart:math' as math;
import 'package:flutter/material.dart';

/// OrchardAmbience — the living backdrop for the Knowledge Orchard. Mirrors
/// `web/src/components/orchard/OrchardAmbience.jsx` + its CSS keyframes:
/// season-aware sky, sun/moon, drifting clouds, ambient life (birds/
/// butterflies/fireflies), seasonal falling particles, and a cosy treehouse.
/// Purely decorative — wrapped in `IgnorePointer` so it never intercepts taps.
class OrchardAmbience extends StatefulWidget {
  final String season; // spring | summer | autumn | winter
  final bool night;
  final double vibrancy; // 0..1 share of healthy trees
  final int golden; // count of golden-fruit trees
  final bool treehouse;

  const OrchardAmbience({
    super.key,
    this.season = 'spring',
    this.night = false,
    this.vibrancy = 0.5,
    this.golden = 0,
    this.treehouse = false,
  });

  @override
  State<OrchardAmbience> createState() => _OrchardAmbienceState();
}

class _OrchardAmbienceState extends State<OrchardAmbience> with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  static const double _loopSeconds = 60;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(seconds: 60))..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  double _phase(double periodSec, [double offsetSec = 0]) {
    final t = (_c.value * _loopSeconds + offsetSec) / periodSec;
    return t - t.floorToDouble();
  }

  List<Color> _skyColors() {
    if (widget.night) return const [Color(0xFF1B2350), Color(0xFF26315F), Color(0xFF33406E)];
    switch (widget.season) {
      case 'summer':
        return const [Color(0xFFCDEEFF), Color(0xFFE6F9EF), Color(0xFFF2FCE9)];
      case 'autumn':
        return const [Color(0xFFFFEEDE), Color(0xFFFDF1E0), Color(0xFFFBF5E9)];
      case 'winter':
        return const [Color(0xFFE8F1FB), Color(0xFFEEF4FB), Color(0xFFF6F9FD)];
      case 'spring':
      default:
        return const [Color(0xFFDFF3FF), Color(0xFFEAFBF0), Color(0xFFF4FBEF)];
    }
  }

  _Particle? _particleSpec() {
    switch (widget.season) {
      case 'spring':
        return const _Particle(glyph: '🌸', count: 8, fontSize: 16);
      case 'autumn':
        return const _Particle(glyph: '🍂', count: 9, fontSize: 16);
      case 'winter':
        return const _Particle(glyph: '❄️', count: 12, fontSize: 13);
      default:
        return null; // summer: clear skies
    }
  }

  @override
  Widget build(BuildContext context) {
    final butterflyCount = widget.night ? 0 : (widget.vibrancy * 3).round();
    final fireflyCount = widget.night ? (4 + math.min(4, widget.golden * 2)) : math.min(4, widget.golden * 2);
    final birdCount = widget.night ? 0 : 2;
    final particle = _particleSpec();

    return IgnorePointer(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, _) {
            return LayoutBuilder(builder: (context, constraints) {
              final w = constraints.maxWidth.isFinite ? constraints.maxWidth : 400.0;
              final h = constraints.maxHeight.isFinite ? constraints.maxHeight : 420.0;
              return Stack(
                children: [
                  // Sky
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: _skyColors()),
                      ),
                    ),
                  ),
                  // Sun / moon, gentle pulse
                  Positioned(
                    top: 14,
                    right: 28,
                    child: Transform.scale(
                      scale: 1 + 0.08 * math.sin(_phase(6) * 2 * math.pi),
                      child: Text(widget.night ? '🌙' : '☀️', style: const TextStyle(fontSize: 38)),
                    ),
                  ),
                  // Clouds drifting left -> right
                  _drift(w, top: 36, size: 32, period: 46, opacity: widget.night ? 0.35 : 0.85, glyph: '☁️'),
                  _drift(w, top: 86, size: 24, period: 62, offset: 15, opacity: widget.night ? 0.35 : 0.85, glyph: '☁️'),
                  _drift(w, top: 18, size: 28, period: 74, offset: 30, opacity: widget.night ? 0.35 : 0.85, glyph: '⛅'),
                  // Birds
                  for (var i = 0; i < birdCount; i++) _bird(w, i),
                  // Butterflies
                  for (var i = 0; i < butterflyCount; i++) _butterfly(w, h, i),
                  // Fireflies
                  for (var i = 0; i < fireflyCount; i++) _firefly(w, h, i),
                  // Seasonal particles
                  if (particle != null)
                    for (var i = 0; i < particle.count; i++) _fallingParticle(w, h, i, particle),
                  // Treehouse
                  if (widget.treehouse)
                    Positioned(
                      bottom: 18 + 5 * math.sin(_phase(5) * 2 * math.pi).abs(),
                      right: 22,
                      child: const Text('🛖', style: TextStyle(fontSize: 36)),
                    ),
                  // Ground
                  Positioned(
                    left: -20,
                    right: -20,
                    bottom: -40,
                    height: 140,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: RadialGradient(
                          center: const Alignment(0, -1),
                          radius: 1.3,
                          colors: widget.night
                              ? [const Color(0xFF286E50).withValues(alpha: 0.35), const Color(0xFF1E503C).withValues(alpha: 0.12), Colors.transparent]
                              : [const Color(0xFF4ABE78).withValues(alpha: 0.28), const Color(0xFF4ABE78).withValues(alpha: 0.08), Colors.transparent],
                          stops: const [0, 0.7, 1],
                        ),
                      ),
                    ),
                  ),
                ],
              );
            });
          },
        ),
      ),
    );
  }

  Widget _drift(double w, {required double top, required double size, required double period, double offset = 0, required double opacity, required String glyph}) {
    final t = _phase(period, offset);
    final x = -0.2 * w + t * 1.3 * w;
    return Positioned(top: top, left: x, child: Opacity(opacity: opacity, child: Text(glyph, style: TextStyle(fontSize: size))));
  }

  Widget _bird(double w, int i) {
    final period = i == 0 ? 24.0 : 32.0;
    final offset = i == 0 ? 3.0 : 12.0;
    final t = _phase(period, offset);
    final x = -0.08 * w + t * 1.22 * w;
    final y = (i == 0 ? 60.0 : 120.0) + 10 * math.sin(t * 2 * math.pi * 2);
    return Positioned(top: y, left: x, child: Text('🐦', style: TextStyle(fontSize: i == 0 ? 20 : 16)));
  }

  Widget _butterfly(double w, double h, int i) {
    final period = 14.0 + i * 4;
    final t = _phase(period, i * 4.0);
    final baseLeft = [0.12, 0.48, 0.78][i % 3] * w;
    final baseBottom = [60.0, 100.0, 74.0][i % 3];
    final angle = t * 2 * math.pi;
    final dx = 40 * math.sin(angle) + 20 * math.cos(angle * 2);
    final dy = -20 * math.cos(angle);
    return Positioned(
      bottom: baseBottom + dy,
      left: baseLeft + dx,
      child: Text('🦋', style: TextStyle(fontSize: [20.0, 17.0, 22.0][i % 3])),
    );
  }

  Widget _firefly(double w, double h, int i) {
    final glowPeriod = 4.0 + (i % 5) * 0.4;
    final wanderPeriod = 12.0 + (i % 5) * 1.2;
    final glowT = _phase(glowPeriod, i * 0.6);
    final wanderT = _phase(wanderPeriod, i * 0.9);
    final opacity = 0.15 + 0.85 * (0.5 - 0.5 * math.cos(glowT * 2 * math.pi));
    final baseLeft = [0.20, 0.40, 0.60, 0.76, 0.88][i % 5] * w;
    final baseBottom = [70.0, 110.0, 90.0, 130.0, 60.0][i % 5];
    final angle = wanderT * 2 * math.pi;
    final dx = 26 * math.sin(angle);
    final dy = -30 * math.cos(angle * 0.7).abs();
    return Positioned(
      bottom: baseBottom + dy,
      left: baseLeft + dx,
      child: Opacity(
        opacity: opacity.clamp(0.0, 1.0),
        child: Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(colors: [const Color(0xFFFFF6B0), const Color(0xFFFFE066), const Color(0x00FFE066)], stops: const [0, 0.45, 0.7]),
            boxShadow: const [BoxShadow(color: Color(0xB3FFE066), blurRadius: 10, spreadRadius: 3)],
          ),
        ),
      ),
    );
  }

  Widget _fallingParticle(double w, double h, int i, _Particle particle) {
    final period = 11.0 + (i % 6) * 1.0;
    final offset = (i % 6) * 2.0;
    final t = _phase(period, offset);
    final left = ([0.08, 0.24, 0.42, 0.58, 0.74, 0.90][i % 6]) * w;
    final y = -10 + t * (h + 60);
    final opacity = t < 0.1 ? t / 0.1 : (t > 0.9 ? (1 - t) / 0.1 : 1.0);
    return Positioned(
      top: y,
      left: left + t * 40,
      child: Opacity(
        opacity: (0.85 * opacity).clamp(0.0, 0.85),
        child: Transform.rotate(
          angle: t * 320 * math.pi / 180,
          child: Text(particle.glyph, style: TextStyle(fontSize: particle.fontSize)),
        ),
      ),
    );
  }
}

class _Particle {
  final String glyph;
  final int count;
  final double fontSize;
  const _Particle({required this.glyph, required this.count, required this.fontSize});
}

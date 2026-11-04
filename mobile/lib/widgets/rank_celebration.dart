import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'rank_badge.dart';

class _Confetti {
  double x, y, vx, vy, w, h, rot, vr, drag;
  Color color;
  _Confetti(this.x, this.y, this.vx, this.vy, this.w, this.h, this.rot, this.vr, this.drag, this.color);
}

class _Spark {
  double x, y, px, py, vx, vy, life, decay;
  Color color;
  _Spark(this.x, this.y, this.vx, this.vy, this.decay, this.color)
    : px = x,
      py = y,
      life = 1;
}

class _Rocket {
  double x, y, vy, targetY;
  final List<Offset> trail = [];
  _Rocket(this.x, this.y, this.vy, this.targetY);
}

class _Balloon {
  final double x, speed, size, sway, phase;
  double y;
  final TextPainter painter;
  _Balloon(this.x, this.y, this.speed, this.size, this.sway, this.phase, this.painter);
}

class _Show {
  final double seconds, confettiRate, fireworks;
  final int rockets, balloons;
  final List<Color> colors;
  const _Show(this.seconds, this.confettiRate, this.rockets, this.fireworks, this.balloons, this.colors);
}

const _shows = <int, _Show>{
  1: _Show(10, 5, 7, 0.9, 12, [Color(0xFFFFD21F), Color(0xFFFFB300), Color(0xFFFF6B6B), Color(0xFF5B47FF), Color(0xFF22C55E), Color(0xFF00C2FF), Color(0xFFFF4FD8)]),
  2: _Show(8, 3.4, 4, 0.6, 8, [Color(0xFFE5E9F2), Color(0xFFB8C4DC), Color(0xFF5B8DEF), Color(0xFF9B8CFF), Color(0xFF22D3EE), Color(0xFFFF9ECB)]),
  3: _Show(7, 2.4, 2, 0.4, 6, [Color(0xFFFFB27A), Color(0xFFE08A4C), Color(0xFF22C55E), Color(0xFF7DD3FC), Color(0xFFFCD34D), Color(0xFFFDA4AF)]),
};

/// Full-screen top-3 celebration — confetti, firework bursts, 🚀 rockets,
/// balloons and a congratulations card. Rank 1 gets the biggest show. Mirrors
/// `RankCelebration.jsx` on web. Show it once per exam (the caller records it).
class RankCelebration extends StatefulWidget {
  final int rank;
  final String name;
  final String className;
  final String examName;
  final VoidCallback onClose;

  const RankCelebration({
    super.key,
    required this.rank,
    required this.name,
    required this.className,
    required this.examName,
    required this.onClose,
  });

  @override
  State<RankCelebration> createState() => _RankCelebrationState();
}

class _RankCelebrationState extends State<RankCelebration> with SingleTickerProviderStateMixin {
  final _rand = math.Random();
  late final _Show _show = _shows[widget.rank] ?? _shows[3]!;
  late final Ticker _ticker;
  final _repaint = ValueNotifier<int>(0);

  final _confetti = <_Confetti>[];
  final _sparks = <_Spark>[];
  final _rockets = <_Rocket>[];
  final _balloons = <_Balloon>[];
  late final TextPainter _rocketPainter;

  Size _size = Size.zero;
  Duration _last = Duration.zero;
  double _t = 0;
  double _rain = 0;
  double _nextRocket = 0.4;
  double _nextFirework = 0.8;
  int _rocketsLaunched = 0;
  bool _seeded = false;

  double _r(double a, double b) => a + _rand.nextDouble() * (b - a);
  Color _pick() => _show.colors[_rand.nextInt(_show.colors.length)];

  @override
  void initState() {
    super.initState();
    _rocketPainter = TextPainter(
      text: const TextSpan(text: '🚀', style: TextStyle(fontSize: 32)),
      textDirection: TextDirection.ltr,
    )..layout();
    _ticker = createTicker(_tick)..start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _repaint.dispose();
    super.dispose();
  }

  void _seed(Size s) {
    _seeded = true;
    // Party poppers from both bottom corners.
    final n = (70 * (_show.confettiRate / 3)).round();
    for (var i = 0; i < n; i++) {
      _confetti.add(_newConfetti(0, s.height, _r(250, 700), _r(-1100, -500)));
      _confetti.add(_newConfetti(s.width, s.height, _r(-700, -250), _r(-1100, -500)));
    }
    const emojis = ['🎈', '🎈', '🎈', '🎊', '✨'];
    for (var i = 0; i < _show.balloons; i++) {
      final size = _r(26, 44);
      final tp = TextPainter(
        text: TextSpan(text: emojis[_rand.nextInt(emojis.length)], style: TextStyle(fontSize: size)),
        textDirection: TextDirection.ltr,
      )..layout();
      _balloons.add(_Balloon(_r(0.03, 0.97) * s.width, s.height + _r(20, 500), _r(50, 90), size, _r(6, 18), _r(0, 6), tp));
    }
  }

  _Confetti _newConfetti(double x, double y, double vx, double vy) =>
      _Confetti(x, y, vx, vy, _r(6, 11), _r(8, 16), _r(0, math.pi * 2), _r(-8, 8), _r(0.985, 0.995), _pick());

  void _burst(double x, double y, int count) {
    final color = _pick();
    for (var i = 0; i < count; i++) {
      final a = (i / count) * math.pi * 2 + _r(-0.1, 0.1);
      final sp = _r(80, 260);
      _sparks.add(_Spark(x, y, math.cos(a) * sp, math.sin(a) * sp, _r(0.5, 0.9), _rand.nextDouble() < 0.25 ? Colors.white : color));
    }
  }

  void _tick(Duration elapsed) {
    if (_size == Size.zero) return;
    if (!_seeded) _seed(_size);
    final dt = math.min((elapsed - _last).inMicroseconds / 1e6, 0.05);
    _last = elapsed;
    _t += dt;
    final active = _t < _show.seconds;
    final w = _size.width, h = _size.height;

    if (active) {
      _rain += _show.confettiRate * 60 * dt;
      while (_rain >= 1) {
        _rain -= 1;
        _confetti.add(_newConfetti(_r(0, w), -20, _r(-60, 60), _r(120, 260)));
      }
      if (_t > _nextRocket && _rocketsLaunched < _show.rockets) {
        _rocketsLaunched++;
        _nextRocket = _t + _r(0.5, 1.2);
        _rockets.add(_Rocket(_r(w * 0.1, w * 0.9), h + 20, -_r(520, 760), _r(h * 0.12, h * 0.42)));
      }
      if (_t > _nextFirework) {
        _nextFirework = _t + _r(0.35, 1.1) / _show.fireworks;
        _burst(_r(w * 0.1, w * 0.9), _r(h * 0.1, h * 0.5), _r(34, 56).round());
      }
    }

    for (var i = _rockets.length - 1; i >= 0; i--) {
      final r = _rockets[i];
      r.y += r.vy * dt;
      r.trail.add(Offset(r.x + _r(-2, 2), r.y + 18));
      if (r.trail.length > 18) r.trail.removeAt(0);
      if (r.y <= r.targetY) {
        _burst(r.x, r.y, 70);
        _burst(r.x, r.y, 36);
        _rockets.removeAt(i);
      }
    }

    for (var i = _sparks.length - 1; i >= 0; i--) {
      final s = _sparks[i];
      s.px = s.x;
      s.py = s.y;
      s.vy += 260 * dt;
      s.vx *= 0.985;
      s.vy *= 0.985;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= s.decay * dt;
      if (s.life <= 0) _sparks.removeAt(i);
    }

    for (var i = _confetti.length - 1; i >= 0; i--) {
      final c = _confetti[i];
      c.vy += 520 * dt;
      c.vx *= c.drag;
      c.vy *= c.drag;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.y > h + 30 || c.x < -60 || c.x > w + 60) _confetti.removeAt(i);
    }

    for (final b in _balloons) {
      b.y -= b.speed * dt;
      if (b.y < -80 && active) b.y = h + _r(20, 200);
    }

    _repaint.value++;
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    final rank = widget.rank;
    final borderColor = rank == 1 ? const Color(0xFFFFD21F) : rank == 2 ? const Color(0xFFC5CDE0) : const Color(0xFFE0A06A);
    final glow = rank == 1 ? const Color(0x99FFD21F) : rank == 2 ? const Color(0xB3BECDEB) : const Color(0x99E0A06A);
    final title = rank == 1 ? 'You are the CLASS TOPPER!' : rank == 2 ? 'Brilliant! 2nd Rank in class!' : 'Fantastic! 3rd Rank in class!';

    return Material(
      color: Colors.transparent,
      child: LayoutBuilder(
        builder: (context, box) {
          _size = Size(box.maxWidth, box.maxHeight);
          return Stack(
            fit: StackFit.expand,
            children: [
              Container(
                decoration: const BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment(0, -0.2),
                    radius: 1.1,
                    colors: [Color(0x8C14103C), Color(0xD10A0823)],
                  ),
                ),
              ),
              if (!reduce) IgnorePointer(child: CustomPaint(painter: _BalloonPainter(_balloons, _repaint))),
              Center(
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0.5, end: 1),
                  duration: const Duration(milliseconds: 650),
                  curve: Curves.elasticOut,
                  builder: (context, v, child) => Transform.scale(scale: v, child: Opacity(opacity: v.clamp(0, 1), child: child)),
                  child: Container(
                    width: math.min(box.maxWidth - 32, 360),
                    padding: const EdgeInsets.fromLTRB(22, 22, 22, 20),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: borderColor, width: 5),
                      boxShadow: [BoxShadow(color: glow, blurRadius: 50), const BoxShadow(color: Color(0x80000000), blurRadius: 40, offset: Offset(0, 16))],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        RankBadge(rank: rank, size: rank == 1 ? 150 : 130),
                        const SizedBox(height: 8),
                        Text('🎉 Congratulations, ${widget.name}!', textAlign: TextAlign.center, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900, color: Color(0xFF23275C))),
                        const SizedBox(height: 6),
                        ShaderMask(
                          shaderCallback: (r) => const LinearGradient(colors: [Color(0xFFFF6B6B), Color(0xFFFFB300), Color(0xFF5B47FF)]).createShader(r),
                          child: Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Colors.white)),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'You secured ${rankOrdinal(rank)} Rank in ${widget.className.isEmpty ? 'your class' : widget.className}${widget.examName.isEmpty ? '' : ' — ${widget.examName}'}.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13, color: Color(0xFF4A4F7C)),
                        ),
                        const SizedBox(height: 14),
                        GestureDetector(
                          onTap: widget.onClose,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 34, vertical: 12),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(colors: [Color(0xFFFF6B6B), Color(0xFFFFB300)]),
                              borderRadius: BorderRadius.circular(999),
                              boxShadow: const [BoxShadow(color: Color(0x73FF6B6B), blurRadius: 18, offset: Offset(0, 8))],
                            ),
                            child: const Text('Yay! 🎉', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (!reduce) IgnorePointer(child: CustomPaint(painter: _ShowPainter(this, _repaint))),
            ],
          );
        },
      ),
    );
  }
}

class _BalloonPainter extends CustomPainter {
  final List<_Balloon> balloons;

  _BalloonPainter(this.balloons, Listenable repaint) : super(repaint: repaint);

  @override
  void paint(Canvas canvas, Size size) {
    for (final b in balloons) {
      final dx = math.sin(b.y / 60 + b.phase) * b.sway;
      b.painter.paint(canvas, Offset(b.x + dx, b.y));
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}

class _ShowPainter extends CustomPainter {
  final _RankCelebrationState s;

  _ShowPainter(this.s, Listenable repaint) : super(repaint: repaint);

  @override
  void paint(Canvas canvas, Size size) {
    // rocket trails + rockets
    for (final r in s._rockets) {
      for (var i = 0; i < r.trail.length; i++) {
        final k = i / r.trail.length;
        canvas.drawCircle(
          r.trail[i],
          1 + i / 6,
          Paint()..color = (i.isOdd ? const Color(0xFFFFD21F) : const Color(0xFFFF7A3D)).withValues(alpha: k * 0.8),
        );
      }
      canvas.save();
      canvas.translate(r.x, r.y);
      canvas.rotate(-math.pi / 4);
      s._rocketPainter.paint(canvas, Offset(-s._rocketPainter.width / 2, -s._rocketPainter.height / 2));
      canvas.restore();
    }

    final line = Paint()
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round;
    for (final sp in s._sparks) {
      line.color = sp.color.withValues(alpha: sp.life.clamp(0, 1));
      canvas.drawLine(Offset(sp.px, sp.py), Offset(sp.x, sp.y), line);
    }

    final fill = Paint();
    for (final c in s._confetti) {
      canvas.save();
      canvas.translate(c.x, c.y);
      canvas.rotate(c.rot);
      canvas.scale(1, math.cos(c.rot * 1.3).abs() * 0.8 + 0.2);
      fill.color = c.color;
      canvas.drawRect(Rect.fromCenter(center: Offset.zero, width: c.w, height: c.h), fill);
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}

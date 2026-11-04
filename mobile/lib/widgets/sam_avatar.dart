import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

// Animated AI tutor "Sam" — Flutter port of web/src/components/SamAvatar.jsx.
// Same school-girl character, rig and gesture logic, drawn with one
// CustomPainter in the web SVG's 520x800 coordinate space.
//
// She only talks and gestures while [SamMode.speaking] is passed, i.e. from
// the moment the voice is audible until it ends.

enum SamMode { idle, speaking, listening, thinking }

/// Loudness and brightness of the voice (0..1), or null when not measured —
/// the avatar then animates believable syllables instead.
typedef SamVoiceLevel = ({double level, double bright});

const _skin = Color(0xFFFFDCBF);
const _skinShade = Color(0xFFE9A888);
const _skinLight = Color(0xFFFFEADB);
const _hair = Color(0xFF2A1A1F);
const _hairHi = Color(0xFF5A3A44);
const _lip = Color(0xFFE8647C);
const _bow = Color(0xFFE5384F);
const _handEdge = Color(0xFFE8B093);

class _HandShape {
  final List<double> c;
  final double th;
  final double sp;
  const _HandShape(this.c, this.th, this.sp);
}

const _hands = <String, _HandShape>{
  'relaxed': _HandShape([0.35, 0.4, 0.45, 0.5], 0.6, 0.12),
  'open': _HandShape([0, 0, 0, 0.05], 0, 0.75),
  'openSoft': _HandShape([0.1, 0.1, 0.15, 0.2], 0.1, 0.4),
  'point': _HandShape([0, 0.95, 0.95, 0.95], 0.75, 0),
};

class _Pose {
  final double rs, re, ls, le;
  final String rh, lh;
  final List<double>? oscR, oscL;
  const _Pose(this.rs, this.re, this.ls, this.le, this.rh, this.lh, {this.oscR, this.oscL});
}

// Degrees clockwise from "hanging down" for the right arm; the left mirrors.
const _poses = <String, _Pose>{
  'idle': _Pose(-12, 25, -12, 25, 'relaxed', 'relaxed'),
  'wave': _Pose(-80, -100, -12, 25, 'open', 'relaxed', oscR: [22, 3.2]),
  'explainR': _Pose(-45, -95, -12, 25, 'open', 'relaxed', oscR: [9, 1.6]),
  'explainL': _Pose(-12, 25, -45, -95, 'relaxed', 'open', oscL: [9, 1.6]),
  'explainBoth': _Pose(-50, -85, -50, -85, 'openSoft', 'openSoft', oscR: [8, 1.5], oscL: [8, 1.5]),
  'pointR': _Pose(-75, -100, -12, 25, 'point', 'relaxed', oscR: [4, 2.2]),
  'pointL': _Pose(-12, 25, -75, -100, 'relaxed', 'point', oscL: [4, 2.2]),
  'listen': _Pose(-115, -85, -12, 25, 'openSoft', 'relaxed'),
  'think': _Pose(-12, 25, -12, 25, 'relaxed', 'relaxed'),
  'celebrate': _Pose(-150, -10, -150, -10, 'open', 'open', oscR: [10, 2.4], oscL: [10, 2.4]),
};
const _talkGestures = ['explainR', 'explainL', 'pointR', 'explainBoth', 'pointL'];

class _Finger {
  final double x, len, w0, w1;
  const _Finger(this.x, this.len, this.w0, this.w1);
}

const _fingers = [
  _Finger(-11.8, 29, 8.6, 6.8),
  _Finger(-3.9, 34, 8.8, 6.8),
  _Finger(3.9, 31, 8.6, 6.6),
  _Finger(11.8, 24, 7.6, 5.8),
];

double _clamp(double v, double a, double b) => math.min(b, math.max(a, v));
double _lerp(double a, double b, double t) => a + (b - a) * t;

// ── SVG path data (absolute M L C Q Z only) → Path, cached ──
final Map<String, Path> _pathCache = {};

Path _svg(String d) {
  return _pathCache.putIfAbsent(d, () {
    final tokens = RegExp(r'[MLCQZ]|-?\d*\.?\d+').allMatches(d).map((m) => m.group(0)!).toList();
    final path = Path();
    var i = 0;
    var cmd = '';
    double n() => double.parse(tokens[i++]);
    while (i < tokens.length) {
      if (RegExp(r'[MLCQZ]').hasMatch(tokens[i])) cmd = tokens[i++];
      switch (cmd) {
        case 'M':
          path.moveTo(n(), n());
          cmd = 'L';
        case 'L':
          path.lineTo(n(), n());
        case 'C':
          path.cubicTo(n(), n(), n(), n(), n(), n());
        case 'Q':
          path.quadraticBezierTo(n(), n(), n(), n());
        case 'Z':
          path.close();
        default:
          i++;
      }
    }
    return path;
  });
}

Path _capsule(double w0, double w1, double len) {
  final r = w1 / 2;
  final y = math.max(len - r, 0.1);
  return Path()
    ..moveTo(-w0 / 2, 0)
    ..lineTo(-r, y)
    ..arcToPoint(Offset(r, y), radius: Radius.circular(r), clockwise: false)
    ..lineTo(w0 / 2, 0);
}

List<String> _shirtLines(String name) {
  final clean = name.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (clean.isEmpty) return const [];
  if (clean.length <= 12) return [clean];
  final words = clean.split(' ');
  if (words.length == 1) return [clean];
  var best = 1;
  var bestDiff = double.infinity;
  for (var i = 1; i < words.length; i++) {
    final diff = (words.sublist(0, i).join(' ').length - words.sublist(i).join(' ').length).abs().toDouble();
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return [words.sublist(0, best).join(' '), words.sublist(best).join(' ')];
}

class _HandState {
  List<double> c;
  double th;
  double sp;
  _HandState(_HandShape s)
      : c = List.of(s.c),
        th = s.th,
        sp = s.sp;
}

/// Animation state + gesture logic (the web component's rAF loop).
class _SamRig extends ChangeNotifier {
  SamMode mode = SamMode.idle;
  bool celebrate = false;
  SamVoiceLevel? Function()? getLevel;

  final _rand = math.Random();
  double _last = 0;

  double rs = -12, re = 25, ls = -12, le = 25, ar = 0, al = 0, fr = 3, fl = 3;
  final _HandState rh = _HandState(_hands['relaxed']!);
  final _HandState lh = _HandState(_hands['relaxed']!);
  String gesture = 'idle';
  double gestureUntil = 0;
  double lastSpokeAt = -99;
  bool wasSpeaking = false;
  double nextBlink = 1.5;
  double blinkAt = -1;
  double level = 0;
  double bright = 0.4;
  double baseline = 0;
  double beat = 0;
  double lastBeatAt = -1;
  double quietSince = 0;

  // Outputs read by the painter.
  double rUpDeg = -12, rForeDeg = 25, lUpDeg = -12, lForeDeg = 25;
  double rWrist = 0, lWrist = 0, rFlip = 1, lFlip = -1;
  double mouthOpen = 0, mouthW = 20, mouthH = 3, mouthBright = 0.4;
  bool mouthIsOpen = false;
  bool thinking = false;
  double blink = 1;
  double lookX = 0, lookY = 0;
  double browLiftL = 0, browLiftR = 0;
  double headTilt = 0, headBob = 0, bodyBob = 0;
  final List<double> dots = [0, 0, 0];

  double _randRange(double a, double b) => a + _rand.nextDouble() * (b - a);

  void tick(double t) {
    final dt = math.min(t - _last, 0.05);
    _last = t;
    if (dt <= 0) return;

    final sinceSpoke = t - lastSpokeAt;
    if (mode == SamMode.speaking) lastSpokeAt = t;
    final speaking = mode == SamMode.speaking || (t - lastSpokeAt) < 0.6;

    // voice → mouth level, brightness, beats
    var raw = 0.0;
    var rawBright = 0.4;
    if (mode == SamMode.speaking) {
      final m = getLevel?.call();
      if (m == null) {
        final syll = math.pow(math.sin(t * 9.5).abs(), 0.8) * (0.55 + 0.45 * math.sin(t * 2.7));
        final phrase = math.sin(t * 0.9) > -0.55 ? 1.0 : 0.05;
        raw = _clamp(syll.toDouble() * phrase, 0, 1);
        rawBright = 0.5 + 0.4 * math.sin(t * 4.1);
      } else {
        raw = m.level;
        rawBright = m.bright;
      }
    }
    level += (raw - level) * math.min(1, dt * (raw > level ? 24 : 14));
    bright += (rawBright - bright) * math.min(1, dt * 12);
    baseline += (level - baseline) * math.min(1, dt * 3);
    if (speaking && level > baseline * 1.5 + 0.09 && t - lastBeatAt > 0.28) {
      beat = 1;
      lastBeatAt = t;
    }
    beat *= math.exp(-dt * 6);
    if (level > 0.04) quietSince = t;
    final pausing = mode == SamMode.speaking && t - quietSince > 0.55;

    // choose a gesture
    if (celebrate) {
      gesture = 'celebrate';
    } else if (speaking && !pausing) {
      if (!wasSpeaking) {
        gesture = sinceSpoke > 8 ? 'wave' : 'explainR';
        gestureUntil = t + (gesture == 'wave' ? 2.2 : _randRange(2.4, 4));
      } else if (t > gestureUntil) {
        var next = gesture;
        while (next == gesture) {
          next = _talkGestures[_rand.nextInt(_talkGestures.length)];
        }
        gesture = next;
        gestureUntil = t + _randRange(2.4, 4.4);
      }
    } else if (pausing) {
      gesture = 'idle';
    } else {
      gesture = mode == SamMode.listening ? 'listen' : (mode == SamMode.thinking ? 'think' : 'idle');
    }
    wasSpeaking = speaking && !pausing;

    // arms ease toward the pose
    final target = _poses[gesture] ?? _poses['idle']!;
    final k = math.min(1.0, dt * 5);
    rs += (target.rs - rs) * k;
    re += (target.re - re) * k;
    ls += (target.ls - ls) * k;
    le += (target.le - le) * k;
    final oR = target.oscR ?? [0.0, fr];
    final oL = target.oscL ?? [0.0, fl];
    ar += (oR[0] - ar) * k;
    fr = oR[1];
    al += (oL[0] - al) * k;
    fl = oL[1];
    final swayR = math.sin(t * fr * math.pi * 2) * ar - beat * 12;
    final swayL = math.sin(t * fl * math.pi * 2 + 1) * al - beat * 12;
    final idleSway = math.sin(t * 1.3) * 2;
    rUpDeg = rs + idleSway;
    rForeDeg = re + swayR;
    lUpDeg = -(ls - idleSway);
    lForeDeg = -(le + swayL);

    // hands ease toward their shapes
    void easeHand(_HandState h, String name, double cumulative, double side, double sway, bool isRight) {
      final want = _hands[name] ?? _hands['relaxed']!;
      for (var i = 0; i < 4; i++) {
        h.c[i] += (want.c[i] - h.c[i]) * k;
      }
      h.th += (want.th - h.th) * k;
      h.sp += (want.sp - h.sp) * k;
      final turn = _clamp((cumulative.abs() - 70) / 50, 0, 1);
      final flip = side * (1 - 2 * turn);
      final wrist = (gesture == 'wave' && isRight) ? sway * 0.5 : sway * 0.25;
      if (isRight) {
        rWrist = wrist;
        rFlip = flip;
      } else {
        lWrist = wrist;
        lFlip = flip;
      }
    }

    easeHand(rh, target.rh, rs + re, 1, swayR, true);
    easeHand(lh, target.lh, ls + le, -1, swayL, false);

    // mouth
    mouthOpen = _clamp(level * 1.9, 0, 1);
    mouthBright = bright;
    mouthW = _lerp(16, 27, bright) - mouthOpen * 2 + (speaking ? math.sin(t * 9) * 0.8 : 0);
    mouthH = (3 + mouthOpen * 31) * _lerp(1.15, 0.7, bright);
    mouthIsOpen = mouthOpen > 0.07;
    thinking = mode == SamMode.thinking;

    // blink
    if (t > nextBlink && blinkAt < 0) {
      blinkAt = t;
      nextBlink = t + _randRange(2.2, 5.5);
    }
    blink = 1;
    if (blinkAt >= 0) {
      final p = (t - blinkAt) / 0.16;
      if (p >= 1) {
        blinkAt = -1;
      } else {
        blink = 1 - math.sin(math.pi * p) * 0.93;
      }
    }

    // gaze + brows
    lookX = mode == SamMode.thinking ? -4 : math.sin(t * 0.7) * 1.8;
    lookY = mode == SamMode.thinking ? -5 : math.sin(t * 0.5) * 1;
    final browLift = mode == SamMode.thinking ? 6.0 : (speaking ? level * 4 + beat * 3 : (mode == SamMode.listening ? 3.0 : 0.0));
    browLiftL = browLift;
    browLiftR = browLift + (mode == SamMode.thinking ? 4 : 0);

    // head & body
    headTilt = mode == SamMode.listening
        ? 5
        : mode == SamMode.thinking
            ? -6
            : math.sin(t * 0.9) * 1.1 + (speaking && !pausing ? math.sin(t * 2.2) * 1.8 + beat * 2.5 : 0);
    headBob = speaking ? -level * 2.5 + beat * 1.5 : 0;
    bodyBob = math.sin(t * 1.7) * 2;

    for (var i = 0; i < 3; i++) {
      dots[i] = mode == SamMode.thinking ? (math.sin(t * 4 - i * 1.1) > 0 ? 1.0 : 0.25) : 0.0;
    }
    notifyListeners();
  }
}

class SamAvatar extends StatefulWidget {
  final SamMode mode;
  final String schoolName;
  final Color shirtColor;
  final bool celebrate;
  final SamVoiceLevel? Function()? getLevel;

  /// Visible slice of the 520x800 canvas (crop to bust/knee on small screens).
  final double viewTop;
  final double viewHeight;

  const SamAvatar({
    super.key,
    this.mode = SamMode.idle,
    this.schoolName = '',
    this.shirtColor = const Color(0xFF23318F),
    this.celebrate = false,
    this.getLevel,
    this.viewTop = 0,
    this.viewHeight = 800,
  });

  @override
  State<SamAvatar> createState() => _SamAvatarState();
}

class _SamAvatarState extends State<SamAvatar> with SingleTickerProviderStateMixin {
  final _rig = _SamRig();
  late final Ticker _ticker;
  late final _SamPainter _painter;

  @override
  void initState() {
    super.initState();
    _syncRig();
    _painter = _SamPainter(_rig, widget.shirtColor, widget.viewTop, widget.viewHeight)..setSchool(widget.schoolName);
    _ticker = createTicker((elapsed) => _rig.tick(elapsed.inMicroseconds / 1e6))..start();
  }

  void _syncRig() {
    _rig
      ..mode = widget.mode
      ..celebrate = widget.celebrate
      ..getLevel = widget.getLevel;
  }

  @override
  void didUpdateWidget(covariant SamAvatar oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncRig();
    if (oldWidget.schoolName != widget.schoolName) _painter.setSchool(widget.schoolName);
  }

  @override
  void dispose() {
    _ticker.dispose();
    _rig.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Sam, your AI tutor',
      child: AspectRatio(
        aspectRatio: 520 / widget.viewHeight,
        child: RepaintBoundary(child: CustomPaint(painter: _painter)),
      ),
    );
  }
}

class _SamPainter extends CustomPainter {
  final _SamRig rig;
  final Color shirtColor;
  final double viewTop;
  final double viewHeight;

  List<TextPainter> _nameLines = const [];
  late final TextPainter _crest;
  double _nameFont = 17;
  List<String> _lines = const [];

  _SamPainter(this.rig, this.shirtColor, this.viewTop, this.viewHeight) : super(repaint: rig) {
    _crest = TextPainter(
      text: const TextSpan(text: '🎓', style: TextStyle(fontSize: 15)),
      textDirection: TextDirection.ltr,
    )..layout();
  }

  void setSchool(String name) {
    _lines = _shirtLines(name);
    final longest = _lines.fold<int>(1, (m, l) => math.max(m, l.length));
    _nameFont = _clamp(122 / (longest * 0.62), 9, 17);
    _nameLines = [
      for (final line in _lines)
        TextPainter(
          text: TextSpan(
            text: line,
            style: TextStyle(color: Colors.white, fontSize: _nameFont, fontWeight: FontWeight.w800, letterSpacing: 0.3),
          ),
          textDirection: TextDirection.ltr,
        )..layout(),
    ];
  }

  Paint _fill(Color c, [double opacity = 1]) => Paint()
    ..style = PaintingStyle.fill
    ..isAntiAlias = true
    ..color = c.withValues(alpha: c.a * opacity);

  Paint _stroke(Color c, double w, {StrokeCap cap = StrokeCap.butt, StrokeJoin join = StrokeJoin.miter, double opacity = 1}) => Paint()
    ..style = PaintingStyle.stroke
    ..isAntiAlias = true
    ..strokeWidth = w
    ..strokeCap = cap
    ..strokeJoin = join
    ..color = c.withValues(alpha: c.a * opacity);

  void _fillStroke(Canvas canvas, Path p, Color fill, Color stroke, double w, {StrokeJoin join = StrokeJoin.miter}) {
    canvas.drawPath(p, _fill(fill));
    canvas.drawPath(p, _stroke(stroke, w, join: join));
  }

  void _ellipse(Canvas canvas, double cx, double cy, double rx, double ry, Paint paint) {
    canvas.drawOval(Rect.fromCenter(center: Offset(cx, cy), width: rx * 2, height: ry * 2), paint);
  }

  void _withTransform(Canvas canvas, void Function() body, {double tx = 0, double ty = 0, double rotateDeg = 0, double sx = 1, double sy = 1}) {
    canvas.save();
    canvas.translate(tx, ty);
    if (rotateDeg != 0) canvas.rotate(rotateDeg * math.pi / 180);
    if (sx != 1 || sy != 1) canvas.scale(sx, sy);
    body();
    canvas.restore();
  }

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 520;
    canvas.save();
    canvas.scale(s);
    canvas.translate(0, -viewTop);
    canvas.clipRect(Rect.fromLTWH(0, viewTop, 520, viewHeight));

    canvas.drawOval(Rect.fromCenter(center: const Offset(260, 786), width: 300, height: 22), _fill(Colors.black, 0.25));

    canvas.translate(60, rig.bodyBob);
    _legs(canvas);
    _torso(canvas);
    _arm(canvas, 122, 372, rig.lUpDeg, rig.lForeDeg, rig.lh, rig.lWrist, rig.lFlip);
    _arm(canvas, 278, 372, rig.rUpDeg, rig.rForeDeg, rig.rh, rig.rWrist, rig.rFlip);

    // head (tilt around the neck, then the static scale-down)
    canvas.save();
    canvas.translate(0, rig.headBob);
    canvas.translate(200, 338);
    canvas.rotate(rig.headTilt * math.pi / 180);
    canvas.translate(-200, -338);
    canvas.translate(200, 322);
    canvas.scale(0.88);
    canvas.translate(-200, -296);
    _head(canvas);
    canvas.restore();

    canvas.restore();
  }

  void _legs(Canvas canvas) {
    for (final leg in const [(173.0, -1.0), (227.0, 1.0)]) {
      final cx = leg.$1;
      final sd = leg.$2;
      canvas.drawPath(
        Path()
          ..moveTo(cx - 14, 660)
          ..quadraticBezierTo(cx - 13, 700, cx - 10, 722)
          ..lineTo(cx + 10, 722)
          ..quadraticBezierTo(cx + 13, 700, cx + 14, 660)
          ..close(),
        _fill(_skin),
      );
      _fillStroke(
        canvas,
        Path()
          ..moveTo(cx - 11, 712)
          ..quadraticBezierTo(cx - 12, 740, cx - 10, 768)
          ..lineTo(cx + 10, 768)
          ..quadraticBezierTo(cx + 12, 740, cx + 11, 712)
          ..close(),
        Colors.white,
        const Color(0xFFDFE3F5),
        1.2,
      );
      canvas.drawPath(
        Path()
          ..moveTo(cx - 11.5, 716)
          ..quadraticBezierTo(cx, 721, cx + 11.5, 716),
        _stroke(const Color(0xFFC9D0EE), 2),
      );
      canvas.drawPath(
        Path()
          ..moveTo(cx - 12, 768)
          ..quadraticBezierTo(cx - 14, 784, cx - 4 + sd * 8, 784)
          ..lineTo(cx + 14 + sd * 6, 784)
          ..quadraticBezierTo(cx + 17 + sd * 6, 772, cx + 12, 768)
          ..close(),
        _fill(const Color(0xFF1D1F33)),
      );
    }
  }

  void _torso(Canvas canvas) {
    // neck
    canvas.drawPath(_svg('M185 290 L185 338 Q183 350 170 358 L230 358 Q217 350 215 338 L215 290 Z'), _fill(_skin));
    canvas.drawPath(_svg('M185 306 Q200 326 215 306 L215 290 L185 290 Z'), _fill(_skinShade, 0.35));

    // blouse
    _fillStroke(canvas, _svg('M136 480 Q118 446 106 410 Q106 372 150 360 L250 360 Q294 372 294 410 Q282 446 264 480 Z'), Colors.white, const Color(0xFFDFE3F5), 1.5);

    // pleated skirt
    _fillStroke(canvas, _svg('M116 548 L284 548 L306 668 Q200 684 94 668 Z'), const Color(0xFF2B3A8C), const Color(0xFF101A58), 1.5);
    for (final dx in const [-72, -48, -24, 0, 24, 48, 72]) {
      canvas.drawLine(Offset(200 + dx * 0.78, 556), Offset(200 + dx * 1.2, 672), _stroke(const Color(0xFF4656B3), 2, opacity: 0.7));
    }

    // vest
    final vest = _svg('M124 558 Q130 482 124 410 Q126 380 152 368 L186 360 L200 412 L214 360 L248 368 Q274 380 276 410 Q270 482 276 558 Z');
    final vb = vest.getBounds();
    canvas.drawPath(
      vest,
      Paint()
        ..isAntiAlias = true
        ..shader = ui.Gradient.linear(Offset(0, vb.top), Offset(0, vb.bottom), [shirtColor, const Color(0xFF141F66)]),
    );
    canvas.drawPath(vest, _stroke(const Color(0xFF101A58), 1.5));
    const gold = Color(0xFFF2C94C);
    canvas.drawPath(_svg('M124 558 Q200 566 276 558'), _stroke(gold, 2.5, cap: StrokeCap.round));
    canvas.drawPath(_svg('M186 360 L200 412 L214 360'), _stroke(gold, 2.5, join: StrokeJoin.round));

    // collar + bow
    const collarEdge = Color(0xFFCDD3EC);
    _fillStroke(canvas, _svg('M184 350 Q160 350 150 372 Q176 384 198 366 Z'), Colors.white, collarEdge, 1.6, join: StrokeJoin.round);
    _fillStroke(canvas, _svg('M216 350 Q240 350 250 372 Q224 384 202 366 Z'), Colors.white, collarEdge, 1.6, join: StrokeJoin.round);
    const bowEdge = Color(0xFFB5243A);
    _fillStroke(canvas, _svg('M200 372 Q176 352 170 372 Q176 392 200 376 Z'), _bow, bowEdge, 1.2, join: StrokeJoin.round);
    _fillStroke(canvas, _svg('M200 372 Q224 352 230 372 Q224 392 200 376 Z'), _bow, bowEdge, 1.2, join: StrokeJoin.round);
    canvas.drawPath(_svg('M196 378 L188 408 L200 400 Z'), _fill(const Color(0xFFC92D44)));
    canvas.drawPath(_svg('M204 378 L212 408 L200 400 Z'), _fill(const Color(0xFFC92D44)));
    final knot = RRect.fromRectAndRadius(const Rect.fromLTWH(193, 365, 14, 14), const Radius.circular(5));
    canvas.drawRRect(knot, _fill(const Color(0xFFF0485E)));
    canvas.drawRRect(knot, _stroke(bowEdge, 1.2));

    // crest + school name
    if (_nameLines.isNotEmpty) {
      _fillStroke(canvas, _svg('M200 436 L216 442 Q216 462 200 470 Q184 462 184 442 Z'), const Color(0xFFFFD54A), Colors.white, 2, join: StrokeJoin.round);
      _paintText(canvas, _crest, 200, 460);
      final y0 = _nameLines.length == 2 ? 484.0 : 494.0;
      for (var i = 0; i < _nameLines.length; i++) {
        _paintText(canvas, _nameLines[i], 200, y0 + i * (_nameFont + 3));
      }
    }
  }

  // Draws [tp] centered on [cx] with its alphabetic baseline at [baselineY].
  void _paintText(Canvas canvas, TextPainter tp, double cx, double baselineY) {
    final base = tp.computeDistanceToActualBaseline(TextBaseline.alphabetic);
    tp.paint(canvas, Offset(cx - tp.width / 2, baselineY - base));
  }

  void _arm(Canvas canvas, double px, double py, double upDeg, double foreDeg, _HandState hand, double wrist, double flip) {
    _withTransform(canvas, tx: px, ty: py, rotateDeg: upDeg, () {
      canvas.drawPath(_svg('M-12 0 Q-13.5 44 -9.5 90 L9.5 90 Q13.5 44 12 0 Z'), _fill(_skin));
      // short blouse sleeve
      const sleeveEdge = Color(0xFFDFE3F5);
      canvas.drawCircle(Offset.zero, 21, _fill(Colors.white));
      canvas.drawCircle(Offset.zero, 21, _stroke(sleeveEdge, 1.4));
      _fillStroke(canvas, _svg('M-21 -4 Q-25 28 -20 54 Q0 60 20 54 Q25 28 21 -4 Z'), Colors.white, sleeveEdge, 1.4);
      canvas.drawPath(_svg('M-20 50 Q0 57 20 50'), _stroke(const Color(0xFFC9D0EE), 2));

      _withTransform(canvas, ty: 88, rotateDeg: foreDeg, () {
        canvas.drawPath(_svg('M-9.5 -2 Q-11 28 -6.4 78 L6.4 78 Q11 28 9.5 -2 Z'), _fill(_skin));
        canvas.drawCircle(Offset.zero, 9.6, _fill(_skin));
        canvas.drawPath(_svg('M-8.5 14 Q-9.5 40 -6 74 L-3 74 Q-5.5 40 -5 14 Z'), _fill(_skinShade, 0.16));
        _withTransform(canvas, ty: 76, () => _hand(canvas, hand, wrist, flip));
      });
    });
  }

  void _hand(Canvas canvas, _HandState h, double wrist, double flip) {
    _withTransform(canvas, rotateDeg: wrist, () {
      _withTransform(canvas, sx: flip, () {
        canvas.drawPath(_svg('M-9 -4 C-14 8 -17 22 -16 34 L16 34 C17 22 14 8 9 -4 Z'), _fill(_skin));
        final edge = _stroke(_handEdge, 1.1, cap: StrokeCap.round);
        canvas.drawPath(_svg('M-16 34 C-17 22 -14 8 -9 -4'), edge);
        canvas.drawPath(_svg('M16 34 C17 22 14 8 9 -4'), edge);
        canvas.drawPath(_svg('M-8 16 Q-1 21 8 17'), _stroke(_handEdge, 1, cap: StrokeCap.round, opacity: 0.6));

        // thumb
        final tl = 22 * (1 - 0.5 * h.th);
        _withTransform(canvas, tx: 14, ty: 14, rotateDeg: -(22 + 42 * (1 - h.th)), () {
          _fillStroke(canvas, _capsule(11, 8, tl), _skin, _handEdge, 1.1, join: StrokeJoin.round);
        });

        // fingers
        for (var i = 0; i < _fingers.length; i++) {
          final f = _fingers[i];
          final c = h.c[i];
          final len = f.len * (1 - 0.62 * c);
          final spread = -(i - 1.5) * 13 * h.sp;
          _withTransform(canvas, tx: f.x, ty: 30, rotateDeg: spread, () {
            _fillStroke(canvas, _capsule(f.w0, f.w1, len), _skin, _handEdge, 1.1, join: StrokeJoin.round);
            if (c <= 0.7) _ellipse(canvas, 0, len - 6, 2.2, 3, _fill(const Color(0xFFFFD2CC), 0.8));
          });
        }
      });
    });
  }

  void _head(Canvas canvas) {
    // back hair, pigtails, ties
    canvas.drawPath(_svg('M108 200 C100 112 150 80 200 80 C250 80 300 112 292 200 L288 286 Q200 288 112 286 Z'), _fill(_hair));
    canvas.drawPath(_svg('M114 148 C82 150 58 192 58 252 C58 304 72 340 94 356 C116 346 126 304 126 254 C126 212 124 178 120 150 Z'), _fill(_hair));
    canvas.drawPath(_svg('M286 148 C318 150 342 192 342 252 C342 304 328 340 306 356 C284 346 274 304 274 254 C274 212 276 178 280 150 Z'), _fill(_hair));
    canvas.drawPath(_svg('M76 200 Q70 270 90 336'), _stroke(_hairHi, 4, cap: StrokeCap.round, opacity: 0.7));
    canvas.drawPath(_svg('M324 200 Q330 270 310 336'), _stroke(_hairHi, 4, cap: StrokeCap.round, opacity: 0.7));
    for (final x in const [106.0, 272.0]) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x, 146, 22, 12), const Radius.circular(5)), _fill(const Color(0xFFB5243A)));
    }

    // ears
    for (final cx in const [121.0, 279.0]) {
      _ellipse(canvas, cx, 204, 10, 14, _fill(_skin));
      _ellipse(canvas, cx, 204, 10, 14, _stroke(_skinShade, 1.2));
    }

    // face
    final face = _svg('M120 190 C120 122 158 92 200 92 C242 92 280 122 280 190 C280 242 252 290 200 298 C148 290 120 242 120 190 Z');
    final fb = face.getBounds();
    canvas.drawPath(
      face,
      Paint()
        ..isAntiAlias = true
        ..shader = ui.Gradient.radial(
          Offset(fb.left + fb.width * 0.42, fb.top + fb.height * 0.34),
          (fb.width + fb.height) / 2 * 0.8,
          [_skinLight, _skin],
        ),
    );
    canvas.drawPath(face, _stroke(_skinShade, 1.4));

    // cheeks
    _ellipse(canvas, 146, 234, 15, 9, _fill(const Color(0xFFFF8FA3), 0.4));
    _ellipse(canvas, 254, 234, 15, 9, _fill(const Color(0xFFFF8FA3), 0.4));

    // brows
    _withTransform(canvas, ty: -rig.browLiftL, () {
      canvas.drawPath(_svg('M139 172 Q165 160 190 170'), _stroke(_hair, 5, cap: StrokeCap.round));
    });
    _withTransform(canvas, ty: -rig.browLiftR, () {
      canvas.drawPath(_svg('M210 170 Q235 160 261 172'), _stroke(_hair, 5, cap: StrokeCap.round));
    });

    // eyes
    _eye(canvas, 165, true);
    _eye(canvas, 235, false);

    // nose
    canvas.drawPath(_svg('M196 226 Q200 232 204 226'), _stroke(const Color(0xFFD99A7C), 2.6, cap: StrokeCap.round));

    _mouth(canvas);

    // bangs
    canvas.drawPath(_svg('M116 176 C112 108 158 82 204 84 C252 84 292 112 284 176 C268 146 244 136 222 142 C198 108 156 120 116 176 Z'), _fill(_hair));
    canvas.drawPath(_svg('M136 132 Q168 108 206 112'), _stroke(_hairHi, 4.5, cap: StrokeCap.round, opacity: 0.8));
    canvas.drawPath(_svg('M232 112 Q262 120 274 150'), _stroke(_hairHi, 3.5, cap: StrokeCap.round, opacity: 0.6));

    // ribbons
    const bowEdge = Color(0xFFB5243A);
    for (final r in const [(117.0, 152.0, -1.0), (283.0, 152.0, 1.0)]) {
      final x = r.$1;
      final y = r.$2;
      final sd = r.$3;
      for (final dir in const [1.0, -1.0]) {
        final p = Path()
          ..moveTo(x, y)
          ..quadraticBezierTo(x + sd * dir * 18, y - 16, x + sd * dir * 26, y - 2)
          ..quadraticBezierTo(x + sd * dir * 18, y + 14, x, y)
          ..close();
        _fillStroke(canvas, p, _bow, bowEdge, 1.2);
      }
      canvas.drawCircle(Offset(x, y), 5, _fill(const Color(0xFFF0485E)));
      canvas.drawCircle(Offset(x, y), 5, _stroke(bowEdge, 1.2));
    }

    // thinking bubbles
    const bubbles = [(318.0, 112.0, 5.0), (338.0, 92.0, 7.0), (366.0, 62.0, 10.0)];
    for (var i = 0; i < bubbles.length; i++) {
      final o = rig.dots[i];
      if (o <= 0) continue;
      final b = bubbles[i];
      canvas.drawCircle(Offset(b.$1, b.$2), b.$3, _fill(Colors.white, o));
      canvas.drawCircle(Offset(b.$1, b.$2), b.$3, _stroke(const Color(0xFFC7D2FE), 2, opacity: o));
    }
  }

  void _eye(Canvas canvas, double cx, bool left) {
    _withTransform(canvas, tx: cx, ty: 198, sy: rig.blink, () {
      canvas.translate(-cx, -198);
      _ellipse(canvas, cx, 198, 17, 20, _fill(Colors.white));
      _ellipse(canvas, cx, 198, 17, 20, _stroke(const Color(0xFFC9A28A), 1.2));

      canvas.save();
      canvas.translate(rig.lookX, rig.lookY);
      final irisRect = Rect.fromCircle(center: Offset(cx, 200), radius: 12.5);
      canvas.drawCircle(
        Offset(cx, 200),
        12.5,
        Paint()
          ..isAntiAlias = true
          ..shader = ui.Gradient.radial(
            Offset(irisRect.left + irisRect.width * 0.5, irisRect.top + irisRect.height * 0.4),
            irisRect.width * 0.7,
            const [Color(0xFFB07A3C), Color(0xFF6B4220), Color(0xFF3A2312)],
            const [0, 0.6, 1],
          ),
      );
      canvas.drawCircle(Offset(cx, 200), 6.4, _fill(const Color(0xFF150C07)));
      canvas.drawCircle(Offset(cx + 4.8, 194), 4.2, _fill(Colors.white));
      canvas.drawCircle(Offset(cx - 4.2, 206), 2.2, _fill(Colors.white, 0.85));
      canvas.restore();

      const lash = Color(0xFF1D1115);
      canvas.drawPath(
        Path()
          ..moveTo(cx - 18, 192)
          ..quadraticBezierTo(cx, 174, cx + 18, 192),
        _stroke(lash, 3.6, cap: StrokeCap.round),
      );
      final ox = left ? cx - 18 : cx + 18;
      final dx = left ? -6.0 : 6.0;
      canvas.drawLine(Offset(ox, 192), Offset(ox + dx, 186), _stroke(lash, 2.6, cap: StrokeCap.round));
      final ox2 = left ? cx - 14 : cx + 14;
      final dx2 = left ? -5.0 : 5.0;
      canvas.drawLine(Offset(ox2, 187), Offset(ox2 + dx2, 180), _stroke(lash, 2.2, cap: StrokeCap.round));
    });
  }

  void _mouth(Canvas canvas) {
    const mx = 200.0;
    const my = 252.0;
    final w = rig.mouthW;
    final h2 = rig.mouthH;
    final open = rig.mouthIsOpen;
    final shape = Path()
      ..moveTo(mx - w, my)
      ..quadraticBezierTo(mx - w * 0.4, my - 4, mx, my - 2.5)
      ..quadraticBezierTo(mx + w * 0.4, my - 4, mx + w, my)
      ..quadraticBezierTo(mx + w * 0.85, my + h2, mx, my + h2 * 1.12)
      ..quadraticBezierTo(mx - w * 0.85, my + h2, mx - w, my)
      ..close();

    if (!open) {
      final smile = rig.thinking ? 3.0 : 7.0;
      canvas.drawPath(
        Path()
          ..moveTo(mx - 19, my - 1)
          ..quadraticBezierTo(mx, my + smile, mx + 19, my - 1),
        _stroke(_lip, 4.6, cap: StrokeCap.round),
      );
    } else {
      canvas.drawPath(shape, _fill(const Color(0xFF74202F)));
      canvas.drawPath(shape, _stroke(_lip, 3.6, join: StrokeJoin.round));
    }

    canvas.save();
    canvas.clipPath(shape);
    _ellipse(canvas, mx, my + h2 * 0.88, w * 0.55, math.max(1, h2 * 0.3), _fill(const Color(0xFFF0808F)));
    final th = math.min(9.0, 2.5 + h2 * 0.3 + rig.mouthBright * 3);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(mx - w, my - 3, w * 2, th), const Radius.circular(2)), _fill(Colors.white));
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _SamPainter oldDelegate) => false;
}

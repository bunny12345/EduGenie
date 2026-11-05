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

const _skin = Color(0xFFD29A6E);
const _skinShade = Color(0xFFB67A52);
const _skinLight = Color(0xFFE2AE82);
const _skinDeep = Color(0xFF9C6440);
const _palm = Color(0xFFE4B28A);
const _hair = Color(0xFF2A1A1F);
const _hairHi = Color(0xFF5A3A44);
const _lip = Color(0xFFC24D63);
const _bow = Color(0xFFE5384F);
const _handEdge = Color(0xFFB07548);

class _HandShape {
  final List<double> c;
  final double th;
  final double sp;
  const _HandShape(this.c, this.th, this.sp);
}

const _hands = <String, _HandShape>{
  'relaxed': _HandShape([0.35, 0.42, 0.5, 0.58], 0.55, 0.1),
  'open': _HandShape([0.04, 0.02, 0.06, 0.12], 0.05, 0.6),
  'openSoft': _HandShape([0.14, 0.16, 0.22, 0.3], 0.2, 0.32),
  'point': _HandShape([0, 0.92, 0.95, 0.97], 0.7, 0),
  'curled': _HandShape([0.62, 0.7, 0.76, 0.82], 0.75, 0.05),
};

/// One arm's pose, in the RIGHT arm's frame (the left arm mirrors it):
/// shoulder/elbow degrees clockwise from hanging down (negative = out/up,
/// positive = across the body), forearm length factor (< 1 = reaching toward
/// the viewer), resting wrist bend, and hand turn: 1 = back of the hand to the
/// viewer, 0 = side-on (thumb toward the viewer, how real hands hang), -1 = palm.
class _ArmPose {
  final double s, e, f, w, p;
  final String hand;
  final bool active;
  const _ArmPose(this.s, this.e, {this.f = 1, this.w = 0, this.p = 1, this.hand = 'relaxed', this.active = true});
}

// Arms hang relaxed with a soft elbow, hands side-on and loosely curled.
const _rest = _ArmPose(-6, 9, p: 0.06, w: 4, hand: 'relaxed', active: false);

class _Pose {
  final _ArmPose r, l;
  const _Pose(this.r, this.l);
}

// Real people gesture with the elbows close to the body and the forearms
// coming forward (foreshortened), so the hands stay in front of the torso.
const _poses = <String, _Pose>{
  'rest': _Pose(_rest, _rest),
  // hands loosely together in front of the tummy, like holding an idea
  'frontBoth': _Pose(
    _ArmPose(-8, 62, f: 0.5, w: 6, p: 0.2, hand: 'openSoft'),
    _ArmPose(-8, 62, f: 0.5, w: 6, p: 0.2, hand: 'openSoft'),
  ),
  // palm up, "here's the thing", just out from the body
  'offerR': _Pose(_ArmPose(-10, -30, f: 0.45, w: -18, p: -0.85, hand: 'openSoft'), _rest),
  'offerL': _Pose(_rest, _ArmPose(-10, -30, f: 0.45, w: -18, p: -0.85, hand: 'openSoft')),
  // open hand raised in front of the chest; the palm faces the body, as a
  // real hand there does, so the viewer sees the back of the hand
  'explainR': _Pose(_ArmPose(-12, 120, f: 0.55, w: -10, p: 0.75, hand: 'open'), _rest),
  'explainL': _Pose(_rest, _ArmPose(-12, 120, f: 0.55, w: -10, p: 0.75, hand: 'open')),
  // both palms open: "see?"
  'openBoth': _Pose(
    _ArmPose(-16, -24, f: 0.55, w: -18, p: -0.85, hand: 'open'),
    _ArmPose(-16, -24, f: 0.55, w: -18, p: -0.85, hand: 'open'),
  ),
  // index finger up: "one important thing"
  'pointUpR': _Pose(_ArmPose(-10, 150, f: 0.6, w: 6, p: 0.85, hand: 'point'), _rest),
  'pointUpL': _Pose(_rest, _ArmPose(-10, 150, f: 0.6, w: 6, p: 0.85, hand: 'point')),
  'wave': _Pose(_ArmPose(-38, -124, w: -6, p: -0.9, hand: 'open'), _rest),
  // hand resting on the chest while listening
  'listen': _Pose(_ArmPose(-10, 112, f: 0.5, w: -6, p: 0.15, hand: 'openSoft'), _rest),
  // loose fist under the chin, other arm across the waist
  'think': _Pose(_ArmPose(26, 140, f: 0.85, w: -20, p: 0.12, hand: 'curled'), _ArmPose(8, 78, f: 0.5, w: 6, p: 0.3)),
  'celebrate': _Pose(
    _ArmPose(-150, -10, p: -0.9, hand: 'open'),
    _ArmPose(-150, -10, p: -0.9, hand: 'open'),
  ),
};
// Big gestures for energetic speech, smaller close-to-the-body ones for calm speech.
const _bigGestures = ['offerR', 'offerL', 'explainR', 'explainL', 'openBoth', 'frontBoth', 'pointUpR', 'pointUpL'];
const _smallGestures = ['frontBoth', 'offerR', 'offerL', 'explainR', 'explainL'];

class _Finger {
  final double x, len, w0, w1;
  const _Finger(this.x, this.len, this.w0, this.w1);
}

const _fingers = [
  _Finger(-10.2, 24, 7.8, 6.2),
  _Finger(-3.4, 28, 8, 6.2),
  _Finger(3.4, 25.5, 7.8, 6),
  _Finger(10.2, 19.5, 7, 5.3),
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

/// One finger bone: tapered from [wTop] to [wBot] over [len], round at the tip
/// (and at the top too for middle/tip bones, which overlap like knuckles).
Path _phal(double wTop, double wBot, double len, {bool roundTop = true}) {
  final rb = wBot / 2;
  final rt = wTop / 2;
  final p = Path()
    ..moveTo(-rt, 0)
    ..lineTo(-rb, len)
    ..arcToPoint(Offset(rb, len), radius: Radius.circular(rb), clockwise: false)
    ..lineTo(rt, 0);
  // The base bone stays open at the top so it blends into the palm with no seam.
  if (roundTop) p.arcToPoint(Offset(-rt, 0), radius: Radius.circular(rt), clockwise: false);
  return p;
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
  final List<double> cv = [0, 0, 0, 0];
  double thv = 0, spv = 0;
  _HandState(_HandShape s)
      : c = List.of(s.c),
        th = s.th,
        sp = s.sp;
}

/// Critically damped spring step for finger joints: they ease in and out
/// (no instant velocity jumps), which is what makes fingers look alive.
(double, double) _fingerSpring(double x, double v, double target, double dt, double freq) {
  final w = freq * math.pi * 2;
  final nv = (v + dt * w * w * (target - x)) / (1 + 2 * 0.95 * w * dt + w * w * dt * dt);
  return (x + nv * dt, nv);
}

/// Damped spring: arms overshoot and settle slightly instead of sliding
/// linearly, which is what makes gestures look like muscle, not animation.
class _Spring {
  double x;
  double v = 0;
  _Spring(this.x);

  void step(double target, double dt, {double freq = 3.4, double damp = 0.72}) {
    final w = freq * math.pi * 2;
    // Implicit Euler: stays stable even when a frame is slow.
    v = (v + dt * w * w * (target - x)) / (1 + 2 * damp * w * dt + w * w * dt * dt);
    x += v * dt;
  }
}

// Smooth, non-repeating drift (sum of incommensurate sines) — keeps limbs
// alive without the metronome look of a single sine wave.
double _noise(double t, double seed) =>
    math.sin(t * 0.73 + seed) * 0.5 + math.sin(t * 1.37 + seed * 2.3) * 0.3 + math.sin(t * 2.21 + seed * 4.1) * 0.2;

class _Arm {
  final _Spring s = _Spring(_rest.s);
  final _Spring e = _Spring(_rest.e);
  final _Spring w = _Spring(_rest.w);
  double f = 1, p = _rest.p, kick = 0;
  double ts = _rest.s, te = _rest.e, tf = 1, tw = _rest.w, tp = _rest.p;
  double prevTe = _rest.e, prevTw = _rest.w, aimedAt = -9;
  String hand = 'relaxed';
  bool active = false;
  final _HandState shape = _HandState(_hands['relaxed']!);

  void aim(_ArmPose pose, double amount, double jitter, double t, double Function(double, double) rand) {
    prevTe = te;
    prevTw = tw;
    aimedAt = t;
    ts = _lerp(_rest.s, pose.s, amount) + rand(-4, 4) * jitter;
    te = _lerp(_rest.e, pose.e, amount) + rand(-7, 7) * jitter;
    tf = _lerp(1, pose.f, amount);
    tw = pose.w + rand(-5, 5) * jitter;
    // A forearm folded across the body keeps the palm toward the chest: never
    // show the palm there (only out to the side, where it can open to the viewer).
    tp = te > 60 ? math.max(pose.p, 0.15) : pose.p;
    hand = pose.hand;
    active = pose.active;
  }
}

/// Animation state + gesture logic (the web component's rAF loop).
class _SamRig extends ChangeNotifier {
  SamMode mode = SamMode.idle;
  bool celebrate = false;
  SamVoiceLevel? Function()? getLevel;

  final _rand = math.Random();
  double _last = 0;

  final _Arm rArm = _Arm();
  final _Arm lArm = _Arm();
  String gesture = 'rest';
  double gestureUntil = 0;
  double lastSpokeAt = -99;
  bool wasSpeaking = false;
  double nextBlink = 1.5;
  double blinkAt = -1;
  double level = 0;
  double bright = 0.4;
  double baseline = 0;
  double energy = 0.3;
  double beat = 0;
  double lastBeatAt = -1;
  double lastBeatAmp = 0;
  double quietSince = 0;
  double lean = 0;
  double gazeTX = 0, gazeTY = 0, nextSaccade = 1;

  // Outputs read by the painter.
  double rUpDeg = -6, rForeDeg = 9, lUpDeg = 6, lForeDeg = -9;
  double rForeLen = 1, lForeLen = 1;
  double rWrist = 0, lWrist = 0, rTurn = _rest.p, lTurn = _rest.p;
  _HandState get rh => rArm.shape;
  _HandState get lh => lArm.shape;
  double mouthOpen = 0, mouthW = 20, mouthH = 3, mouthBright = 0.4, mouthCorner = 0;
  bool mouthIsOpen = false;
  bool thinking = false;
  double blink = 1;
  double lookX = 0, lookY = 0;
  double browLiftL = 0, browLiftR = 0;
  double headTilt = 0, headBob = 0, bodyBob = 0, bodyShiftX = 0;
  final List<double> dots = [0, 0, 0];

  double _randRange(double a, double b) => a + _rand.nextDouble() * (b - a);

  String _pickGesture() {
    // People rest their hands between phrases a fair amount; constant gesturing looks fake.
    if (gesture != 'rest' && _rand.nextDouble() < (energy > 0.28 ? 0.15 : 0.3)) return 'rest';
    final pool = energy > 0.28 ? _bigGestures : _smallGestures;
    var next = gesture;
    while (next == gesture) {
      next = pool[_rand.nextInt(pool.length)];
    }
    return next;
  }

  void _setGesture(String name) {
    gesture = name;
    final pose = _poses[name] ?? _poses['rest']!;
    final scripted = name == 'wave' || name == 'celebrate' || name == 'think' || name == 'listen' || name == 'rest';
    // Bigger, more extended gestures when the voice is energetic; every repeat slightly different.
    final amount = scripted ? 1.0 : _clamp(0.72 + energy * 0.7 + _randRange(-0.08, 0.08), 0.7, 1.05);
    final jitter = scripted ? 0.3 : 1.0;
    rArm.aim(pose.r, amount, jitter, _last, _randRange);
    lArm.aim(pose.l, amount, jitter, _last, _randRange);
  }

  void _stepArm(_Arm a, double t, double dt, double seed, bool live) {
    final drift = a.active ? 1.0 : 0.4;
    final breath = math.sin(t * 1.6);
    // Proximal-to-distal timing: the shoulder starts the move, the elbow and
    // wrist join a moment later, like a real arm (not a puppet's single pivot).
    final since = t - a.aimedAt;
    var eTarget = (since < 0.07 ? a.prevTe : a.te) + _noise(t * 0.9, seed + 5) * 3 * drift;
    var wTarget = (since < 0.13 ? a.prevTw : a.tw) + _noise(t * 1.3, seed + 9) * 3 * drift;
    if (gesture == 'wave' && identical(a, rArm)) {
      eTarget += math.sin(t * math.pi * 2 * 1.9) * 8;
      wTarget += math.sin(t * math.pi * 2 * 1.9 - 0.9) * 16;
    } else if (gesture == 'celebrate') {
      eTarget += math.sin(t * math.pi * 2 * 2.2 + seed) * 10;
    }
    // Near-critically damped: arrives smoothly (bell-shaped speed) without the
    // rubbery bounce that made the old arms look like a marionette.
    a.s.step(a.ts + _noise(t * 0.8, seed) * 1.6 * drift - breath * 0.7, dt, freq: 1.25, damp: 1.0);
    a.e.step(eTarget, dt, freq: 1.45, damp: 0.95);
    // The hand trails the forearm slightly (follow-through), then catches up.
    final drag = _clamp(-a.e.v * 0.05, -14, 14);
    a.w.step(wTarget + drag, dt, freq: 1.9, damp: 0.85);
    a.f += (a.tf - a.f) * math.min(1, dt * 3.2);
    // The forearm rotates to turn the palm, so it eases across side-on.
    a.p += (a.tp - a.p) * math.min(1, dt * 3.6);

    // Hand shape: fingers settle one after another (index first), loosely alive while talking.
    final want = _hands[a.hand] ?? _hands['relaxed']!;
    final h = a.shape;
    // Bending the wrist back curls the fingers a little and flexing it opens
    // them (the tendons are shared), so the fingers react to the hand's motion.
    final tendon = _clamp(-a.w.x * 0.003, -0.08, 0.08);
    for (var i = 0; i < 4; i++) {
      final wobble = live && a.active ? _noise(t * 1.8, seed + i * 1.3) * 0.07 : 0.0;
      final target = _clamp(want.c[i] + wobble + tendon - (a.active ? beat * 0.12 : 0), 0, 1);
      final r = _fingerSpring(h.c[i], h.cv[i], target, dt, 2.6 - i * 0.3);
      h.c[i] = r.$1;
      h.cv[i] = r.$2;
    }
    final th = _fingerSpring(h.th, h.thv, want.th, dt, 2.3);
    h.th = th.$1;
    h.thv = th.$2;
    final sp = _fingerSpring(h.sp, h.spv, want.sp + (a.active ? beat * 0.25 : 0), dt, 2.4);
    h.sp = sp.$1;
    h.spv = sp.$2;
  }

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
    var procedural = false;
    if (mode == SamMode.speaking) {
      final m = getLevel?.call();
      if (m == null) {
        procedural = true;
        final syll = math.pow(math.sin(t * 9.5).abs(), 0.8) * (0.55 + 0.45 * math.sin(t * 2.7));
        final phrase = math.sin(t * 0.9) > -0.55 ? 1.0 : 0.05;
        // Scaled to the same relaxed range as a normalized real voice (see VoiceEnvelope).
        raw = _clamp(syll.toDouble() * phrase * 0.34, 0, 1);
        rawBright = 0.5 + 0.4 * math.sin(t * 4.1);
      } else {
        raw = m.level;
        rawBright = m.bright;
      }
    }
    // Fast attack / quick release so the lips track each syllable of the voice.
    level += (raw - level) * math.min(1, dt * (raw > level ? 38 : 20));
    bright += (rawBright - bright) * math.min(1, dt * 14);
    baseline += (level - baseline) * math.min(1, dt * 3);
    if (level > 0.04) quietSince = t;
    final quiet = t - quietSince;
    final holding = mode == SamMode.speaking && quiet > 0.28; // comma-length pause
    final pausing = mode == SamMode.speaking && quiet > 0.9; // sentence break: hands come down
    if (mode == SamMode.speaking && !holding) energy += (level - energy) * math.min(1, dt * 0.8);

    var beatNow = false;
    if (speaking && !holding && level > baseline * 1.5 + 0.09 && t - lastBeatAt > 0.3) {
      beat = 1;
      beatNow = true;
      lastBeatAt = t;
    }
    final beatAmp = _clamp(level - baseline, 0.15, 1);
    beat *= math.exp(-dt * 7);

    // choose a gesture: a new one at phrase boundaries, sized to the voice's energy
    String want;
    if (celebrate) {
      want = 'celebrate';
    } else if (speaking && !pausing) {
      want = gesture;
      if (!wasSpeaking) {
        want = sinceSpoke > 8 ? 'wave' : _pickGesture();
        gestureUntil = t + (want == 'wave' ? 2.0 : _randRange(1.6, 3.2));
      } else if (t > gestureUntil && (holding || t > gestureUntil + 1.5)) {
        want = _pickGesture();
        gestureUntil = t + _randRange(1.6, 3.4);
      } else if (gesture == 'listen' || gesture == 'think') {
        want = _pickGesture();
      }
    } else if (pausing) {
      want = 'rest';
    } else {
      want = mode == SamMode.listening ? 'listen' : (mode == SamMode.thinking ? 'think' : 'rest');
    }
    if (want != gesture || (!wasSpeaking && speaking && !pausing)) _setGesture(want);
    wasSpeaking = speaking && !pausing;

    // Stressed syllables: a short, smooth downward stroke of the gesturing
    // hand(s), led by the forearm with the hand flicking just after.
    if (beatNow) lastBeatAmp = beatAmp;
    final bx = (t - lastBeatAt) / 0.12;
    final pulse = bx < 0 || bx > 8 ? 0.0 : bx * math.exp(1 - bx);
    for (final a in [rArm, lArm]) {
      final total = a.s.x + a.e.x;
      final want = (!a.active || total.abs() < 25 || gesture == 'wave') ? 0.0 : -total.sign * (6 + 9 * lastBeatAmp) * pulse;
      a.kick += (want - a.kick) * math.min(1, dt * 30);
    }

    final live = speaking && !pausing;
    _stepArm(rArm, t, dt, 0.0, live);
    _stepArm(lArm, t, dt, 3.7, live);
    rUpDeg = rArm.s.x + rArm.kick * 0.15;
    rForeDeg = rArm.e.x + rArm.kick;
    rForeLen = rArm.f;
    rWrist = rArm.w.x + rArm.kick * 0.5;
    rTurn = rArm.p;
    lUpDeg = -(lArm.s.x + lArm.kick * 0.15);
    lForeDeg = -(lArm.e.x + lArm.kick);
    lForeLen = lArm.f;
    lWrist = -(lArm.w.x + lArm.kick * 0.5);
    lTurn = lArm.p;

    // mouth: loudness opens the jaw, brightness widens it ("ee") or rounds it ("oo")
    mouthOpen = math.pow(_clamp(level * 1.9, 0, 1), 0.9).toDouble();
    mouthBright = bright;
    mouthW = _lerp(15, 27, bright) - mouthOpen * 2 + (procedural ? math.sin(t * 9) * 0.8 : 0);
    mouthH = (3 + mouthOpen * 31) * _lerp(1.15, 0.7, bright);
    mouthCorner = -(bright - 0.4) * 4 * mouthOpen;
    mouthIsOpen = mouthOpen > 0.07;
    thinking = mode == SamMode.thinking;

    // blink (sometimes a quick double-blink)
    if (t > nextBlink && blinkAt < 0) {
      blinkAt = t;
      nextBlink = t + (_rand.nextDouble() < 0.2 ? 0.3 : _randRange(2.2, 5.5));
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

    // gaze: quick saccades between points near the viewer, glancing up while thinking
    if (t > nextSaccade) {
      gazeTX = _randRange(-3, 3);
      gazeTY = _randRange(-1.6, 1.6);
      if (speaking && _rand.nextDouble() < 0.2) gazeTY = -3;
      nextSaccade = t + _randRange(0.7, 2.6);
    }
    final gx = mode == SamMode.thinking ? -4.0 : gazeTX;
    final gy = mode == SamMode.thinking ? -5.0 : gazeTY;
    final gk = math.min(1.0, dt * 16);
    lookX += (gx - lookX) * gk;
    lookY += (gy - lookY) * gk;
    final browLift = mode == SamMode.thinking ? 6.0 : (speaking ? level * 4 + beat * 3.5 : (mode == SamMode.listening ? 3.0 : 0.0));
    browLiftL = browLift;
    browLiftR = browLift + (mode == SamMode.thinking ? 4 : 0);

    // head & body: lean toward the gesturing hand, nod on beats, breathe
    final rOut = rArm.active ? 1.4 : 0.0;
    final lOut = lArm.active ? 1.4 : 0.0;
    lean += ((rOut - lOut) - lean) * math.min(1, dt * 2.5);
    headTilt = mode == SamMode.listening
        ? 5
        : mode == SamMode.thinking
            ? -6
            : _noise(t * 0.8, 11) * 1.4 + (speaking && !holding ? _noise(t * 1.9, 17) * 1.6 + beat * 2.5 : 0) + (speaking ? lean : 0);
    headBob = speaking ? -level * 2.5 + beat * 2.2 : 0;
    bodyBob = math.sin(t * 1.6) * 1.6;
    bodyShiftX = speaking ? _noise(t * 0.9, 23) * 2 + lean : 0;

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

  /// Cylinder shading across a limb/finger of width [w] (lit from the front-left),
  /// so arms and fingers read as round 3D forms instead of flat paper.
  Paint _limb(double w, double len) => Paint()
    ..isAntiAlias = true
    ..shader = const LinearGradient(
      colors: [_skinDeep, _skinShade, _skinLight, _skin, _skinDeep],
      stops: [0, 0.14, 0.38, 0.66, 1],
    ).createShader(Rect.fromLTWH(-w / 2, 0, w, math.max(len, 1)));

  static const _limbColors = [_skinDeep, _skinShade, _skinLight, _skin, _skinDeep];
  static const _limbDarkColors = [Color(0xFF8A5634), _skinDeep, _skinShade, Color(0xFFC08660), Color(0xFF8A5634)];
  static const _limbStops = [0.0, 0.14, 0.38, 0.66, 1.0];

  /// One shading band in absolute arm space (±10), shared by the upper arm,
  /// elbow and forearm so the shading flows continuously around the bend.
  Paint _armPaint() => Paint()
    ..isAntiAlias = true
    ..shader = const LinearGradient(colors: _limbColors, stops: _limbStops).createShader(const Rect.fromLTWH(-10, 0, 20, 1));

  void _limbStroke(Canvas canvas, Path p, double w, double len, {bool dark = false}) {
    canvas.drawPath(
      p,
      dark
          ? (Paint()
            ..isAntiAlias = true
            ..shader = const LinearGradient(colors: _limbDarkColors, stops: _limbStops).createShader(Rect.fromLTWH(-w / 2, 0, w, math.max(len, 1))))
          : _limb(w, len),
    );
    canvas.drawPath(p, _stroke(_handEdge, 1.1, join: StrokeJoin.round));
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

    canvas.translate(60 + rig.bodyShiftX, rig.bodyBob);
    _legs(canvas);
    _torso(canvas);
    // Soft shadows the arms cast on the body (darker as an arm comes forward).
    canvas.save();
    canvas.clipPath(_torsoClip());
    canvas.translate(7, 11);
    _armShadow(canvas, 122, rig.lUpDeg, rig.lForeDeg, rig.lForeLen, -1);
    _armShadow(canvas, 278, rig.rUpDeg, rig.rForeDeg, rig.rForeLen, 1);
    canvas.restore();
    _arm(canvas, 122, 372, rig.lUpDeg, rig.lForeDeg, rig.lForeLen, rig.lh, rig.lWrist, rig.lTurn, -1);
    _arm(canvas, 278, 372, rig.rUpDeg, rig.rForeDeg, rig.rForeLen, rig.rh, rig.rWrist, rig.rTurn, 1);

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

  Path _torsoClip() => Path()
    ..addPath(_svg('M136 480 Q118 446 106 410 Q106 372 150 360 L250 360 Q294 372 294 410 Q282 446 264 480 Z'), Offset.zero)
    ..addPath(_svg('M124 558 Q130 482 124 410 Q126 380 152 368 L186 360 L200 412 L214 360 L248 368 Q274 380 276 410 Q270 482 276 558 Z'), Offset.zero)
    ..addPath(_svg('M116 548 L284 548 L306 668 Q200 684 94 668 Z'), Offset.zero);

  // Perspective: reaching toward the viewer brings the shoulder slightly
  // forward/in, shortens the forearm, and makes the (closer) hand bigger.
  void _armFrame(Canvas canvas, double px, double upDeg, double foreDeg, double foreLen, double side,
      void Function(double reach) upper, void Function(double reach) fore) {
    final reach = _clamp(1 - foreLen, 0, 1);
    _withTransform(canvas, tx: px - side * reach * 7, ty: 372 + reach * 3, rotateDeg: upDeg, () {
      upper(reach);
      _withTransform(canvas, ty: 88, rotateDeg: foreDeg, () => fore(reach));
    });
  }

  void _armShadow(Canvas canvas, double px, double upDeg, double foreDeg, double foreLen, double side) {
    final reach = _clamp(1 - foreLen, 0, 1);
    final paint = _fill(const Color(0xFF050A2C), _clamp(0.22 + reach * 1.1, 0, 0.7))
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    _armFrame(canvas, px, upDeg, foreDeg, foreLen, side, (_) {}, (reach) {
      _withTransform(canvas, sy: foreLen, () {
        canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(-9, -4, 18, 84), const Radius.circular(9)), paint);
      });
      final hs = 1 + reach * 0.42;
      _withTransform(canvas, ty: 76 * foreLen, sx: hs, sy: hs, () => _ellipse(canvas, 0, 22, 15, 22, paint));
    });
  }

  void _arm(Canvas canvas, double px, double py, double upDeg, double foreDeg, double foreLen, _HandState hand, double wrist, double turn, double side) {
    // The elbow bends like flesh, not like two sticks on a pin: the upper arm
    // and forearm are trimmed where the bend's bisector splits them, and a
    // rounded cap fills the outside of the joint. They share one shading band,
    // so the shading flows around the bend without a seam.
    final half = foreDeg / 2 * math.pi / 180;
    final arm = _armPaint();
    _armFrame(canvas, px, upDeg, foreDeg, foreLen, side, (_) {
      canvas.save();
      canvas.translate(0, 88);
      canvas.rotate(half);
      canvas.clipRect(const Rect.fromLTRB(-300, -600, 300, 0.6));
      canvas.rotate(-half);
      canvas.translate(0, -88);
      canvas.drawPath(_svg('M-12 0 Q-13.5 44 -9.5 90 L9.5 90 Q13.5 44 12 0 Z'), arm);
      canvas.drawCircle(const Offset(0, 88), 9.6, arm);
      canvas.restore();
      // contact shadow under the sleeve hem
      canvas.drawPath(
        _svg('M-13 48 Q0 56 13 48 L12.5 68 Q0 74 -12.5 68 Z'),
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [_skinDeep.withValues(alpha: 0.55), _skinDeep.withValues(alpha: 0)],
          ).createShader(const Rect.fromLTWH(-13, 48, 26, 24)),
      );
      // short blouse sleeve
      const sleeveEdge = Color(0xFFDFE3F5);
      canvas.drawCircle(Offset.zero, 21, _fill(Colors.white));
      canvas.drawCircle(Offset.zero, 21, _stroke(sleeveEdge, 1.4));
      _fillStroke(canvas, _svg('M-21 -4 Q-25 28 -20 54 Q0 60 20 54 Q25 28 21 -4 Z'), Colors.white, sleeveEdge, 1.4);
      canvas.drawPath(_svg('M-20 50 Q0 57 20 50'), _stroke(const Color(0xFFC9D0EE), 2));
    }, (reach) {
      canvas.save();
      canvas.rotate(-half);
      canvas.clipRect(const Rect.fromLTRB(-300, -0.6, 300, 600));
      canvas.rotate(half);
      // A forearm reaching toward the viewer looks shorter (foreshortening).
      _withTransform(canvas, sy: foreLen, () {
        canvas.drawPath(_svg('M-9.5 -2 Q-11 28 -6.4 78 L6.4 78 Q11 28 9.5 -2 Z'), arm);
      });
      canvas.drawCircle(Offset.zero, 9.6, arm);
      canvas.restore();
      // inner-elbow crease along the fold, deepens as the arm bends
      final bend = _clamp((foreDeg.abs() - 35) / 70, 0, 0.55);
      if (bend > 0) {
        final m = -foreDeg.sign * math.min(9.6 / math.cos(half.abs()), 26);
        _withTransform(canvas, rotateDeg: -foreDeg / 2, () {
          canvas.drawPath(
            Path()
              ..moveTo(m, 0)
              ..quadraticBezierTo(m * 0.72, 1.4, m * 0.42, 0.4),
            _stroke(_skinDeep, 1.3, cap: StrokeCap.round, opacity: bend),
          );
        });
      }
      final hs = 1 + reach * 0.42;
      _withTransform(canvas, ty: 76 * foreLen, sx: hs, sy: hs, () => _hand(canvas, hand, wrist, turn, side));
    });
  }

  void _layer(Canvas canvas, double alpha, void Function() body) {
    if (alpha >= 0.999) return body();
    canvas.saveLayer(null, Paint()..color = Color.fromRGBO(0, 0, 0, alpha));
    body();
    canvas.restore();
  }

  /// [turn] 1 = back of hand, 0 = side-on, -1 = palm (right-arm frame);
  /// the hand narrows and cross-fades to a profile view as it rotates.
  void _hand(Canvas canvas, _HandState h, double wrist, double turn, double side) {
    final a = turn.abs();
    final frontA = _clamp((a - 0.3) / 0.35, 0, 1);
    _withTransform(canvas, rotateDeg: wrist, () {
      // One view is always fully opaque, so the body never shows through mid-turn.
      final profileA = frontA < 0.5 ? 1.0 : 1 - (frontA - 0.5) * 2;
      final frontTop = math.min(1.0, frontA * 2);
      if (profileA > 0) _layer(canvas, profileA, () => _withTransform(canvas, sx: side, () => _profileHand(canvas, h)));
      if (frontTop > 0) {
        _layer(canvas, frontTop, () => _withTransform(canvas, sx: side * (turn < 0 ? -1 : 1) * math.max(a, 0.35), () => _frontHand(canvas, h, turn < 0)));
      }
    });
  }

  /// Side-on hand (right-arm frame: palm faces -x toward the body, thumb toward
  /// the viewer). Fingers stay together and curl as one, like a relaxed hand.
  /// Palm fill whose top fades into the wrist and whose knuckle edge fades
  /// into the finger roots, so the hand reads as one piece of skin.
  void _blendedPalm(Canvas canvas, Path path, Shader shader, double top, double knuckles) {
    final b = path.getBounds().inflate(2);
    canvas.saveLayer(b, Paint());
    canvas.drawPath(path, Paint()
      ..isAntiAlias = true
      ..shader = shader);
    final span = b.bottom - top;
    canvas.drawRect(
      b,
      Paint()
        ..blendMode = BlendMode.dstIn
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: const [Color(0x00000000), Color(0xFF000000), Color(0xFF000000), Color(0x00000000)],
          stops: [0, 3.5 / span, (knuckles - top) / span, (knuckles + 3 - top) / span],
        ).createShader(Rect.fromLTRB(b.left, top, b.right, b.bottom)),
    );
    canvas.restore();
  }

  /// The hand's side outline fades out toward the wrist, so the hand flows out of the forearm.
  Paint _fadedEdge(double top, {double opacity = 1}) => Paint()
    ..isAntiAlias = true
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.1
    ..strokeCap = StrokeCap.round
    ..shader = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [_handEdge.withValues(alpha: 0), _handEdge.withValues(alpha: opacity)],
    ).createShader(Rect.fromLTRB(-20, top, 20, top + 11));

  void _profileHand(Canvas canvas, _HandState h) {
    // Middle/ring/pinky peek out behind the index finger; every finger bends
    // at all three knuckles, so a curl rolls through the finger like a real one.
    _withTransform(canvas, tx: 3, ty: 27.5, () => _profileFinger(canvas, (h.c[1] + h.c[2] + h.c[3]) / 3, 12, 9, const [12, 8.5, 7.2], dark: true));
    _withTransform(canvas, tx: -2, ty: 26, () => _profileFinger(canvas, h.c[0], 12.6, 8.4, const [11.5, 8, 6.8]));
    // Thumb, painted under the palm block so its root is hidden inside the
    // hand and it emerges from the palm's edge with no gap.
    final tl = 20 * (1 - 0.25 * h.th);
    _withTransform(canvas, tx: -5, ty: 9, rotateDeg: 14 + 26 * h.th, () {
      _limbStroke(canvas, _capsule(10.5, 8, tl), 10.5, tl);
      _ellipse(canvas, 0, tl - 4.6, 2, 2.6, _fill(const Color(0xFFEBB4A0), 0.75));
    });
    // back of the hand / palm block
    _blendedPalm(
      canvas,
      _svg('M-5.2 -4 C-8.8 6 -9.6 18 -8.3 29.5 Q0.6 31.5 9.3 29.5 C10.6 18 8.8 6 5.2 -4 Z'),
      const LinearGradient(colors: _limbColors, stops: _limbStops).createShader(const Rect.fromLTWH(-10, 0, 20, 1)),
      -4,
      28,
    );
    final edge = _fadedEdge(-4, opacity: 0.8);
    canvas.drawPath(_svg('M5.2 -4 C8.8 6 10.6 18 9.3 29.5'), edge);
    canvas.drawPath(_svg('M-5.2 -4 C-8.8 6 -9.6 18 -8.3 29.5'), edge);
    canvas.drawPath(_svg('M3 6 Q6 17 5 25'), _stroke(_skinShade, 2.2, cap: StrokeCap.round, opacity: 0.18));
  }

  /// Paints a finger's bones as one piece: every bone's outline first, then
  /// every bone's fill on top, so only the finger's silhouette is outlined
  /// (no rings at the knuckles), with a faint crease at each joint.
  static const _palmFingerColors = [_skinDeep, _skinShade, _palm, _skinLight, _skinShade];

  void _fingerBones(Canvas canvas, List<(Matrix4, Path, double, double)> bones, {bool dark = false, bool palmSide = false}) {
    final edge = _stroke(_handEdge, 2.2, join: StrokeJoin.round, cap: StrokeCap.round);
    // The finger root is tucked under the palm: its outline fades in as the finger emerges.
    final rootEdge = _stroke(_handEdge, 2.2, join: StrokeJoin.round, cap: StrokeCap.round)
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [_handEdge.withValues(alpha: 0), _handEdge],
      ).createShader(const Rect.fromLTRB(-20, 2.5, 20, 6.5));
    for (var i = 0; i < bones.length; i++) {
      canvas.save();
      canvas.transform(bones[i].$1.storage);
      canvas.drawPath(bones[i].$2, i == 0 ? rootEdge : edge);
      canvas.restore();
    }
    for (final b in bones) {
      canvas.save();
      canvas.transform(b.$1.storage);
      canvas.drawPath(b.$2, (dark || palmSide) ? (Paint()
        ..isAntiAlias = true
        ..shader = LinearGradient(colors: dark ? _limbDarkColors : _palmFingerColors, stops: _limbStops).createShader(Rect.fromLTWH(-b.$3 / 2, 0, b.$3, math.max(b.$4, 1)))) : _limb(b.$3, b.$4));
      canvas.restore();
    }
    final crease = _stroke(_handEdge, 0.8, cap: StrokeCap.round, opacity: 0.35);
    for (var i = 1; i < bones.length; i++) {
      final b = bones[i];
      final r = b.$3 / 2 - 1.2;
      canvas.save();
      canvas.transform(b.$1.storage);
      canvas.drawPath(Path()..moveTo(-r, 0.6)..quadraticBezierTo(0, 2, r, 0.6), crease);
      canvas.restore();
    }
  }

  void _profileFinger(Canvas canvas, double c, double w0, double w1, List<double> segs, {bool dark = false}) {
    final widths = [w0, _lerp(w0, w1, 0.45), _lerp(w0, w1, 0.8), w1];
    final bends = [2 + 32 * c, 52 * c, 32 * c];
    final m = Matrix4.identity();
    final bones = <(Matrix4, Path, double, double)>[];
    for (var i = 0; i < 3; i++) {
      if (i > 0) m.translateByDouble(0, segs[i - 1], 0, 1);
      m.rotateZ(bends[i] * math.pi / 180);
      bones.add((m.clone(), _phal(widths[i], widths[i + 1], segs[i], roundTop: i > 0), widths[i], segs[i]));
    }
    _fingerBones(canvas, bones, dark: dark);
    if (!dark) {
      canvas.save();
      canvas.transform(m.storage);
      _ellipse(canvas, widths[3] / 2 - 1.7, segs[2] - 4, 1.5, 2.6, _fill(const Color(0xFFEBB4A0), 0.75));
      canvas.restore();
    }
  }

  /// A front-on finger as three bones. Curling a bone toward the palm turns it
  /// toward/away from the viewer, so its drawn length is len·cos(angle); past
  /// 90° it folds back over the palm (palm view) or disappears behind the hand.
  void _frontFinger(Canvas canvas, _Finger f, double c, bool palmSide) {
    final segs = [f.len * 0.45, f.len * 0.3, f.len * 0.25];
    final widths = [f.w0, _lerp(f.w0, f.w1, 0.45) + 0.3, f.w1 + 0.3, f.w1];
    final mcp = 65 * c;
    final pip = mcp + 90 * c;
    final angles = [mcp, pip, pip + 55 * c];
    final bones = <(Matrix4, Path, double, double)>[];
    var y = 0.0;
    var nailCo = 0.0;
    for (var i = 0; i < 3; i++) {
      final co = math.cos(angles[i] * math.pi / 180);
      if (!palmSide && co < 0.05) break;
      final dy = segs[i] * co;
      final m = Matrix4.identity()
        ..translateByDouble(0, y, 0, 1)
        ..scaleByDouble(1, dy < 0 ? -1 : 1, 1, 1);
      bones.add((m, _phal(widths[i], widths[i + 1], dy.abs(), roundTop: i > 0), widths[i], dy.abs()));
      y += dy;
      if (i == 2) nailCo = co;
    }
    _fingerBones(canvas, bones, palmSide: palmSide);
    if (!palmSide && nailCo > 0.35) _ellipse(canvas, 0, y - 5 * nailCo, 2.2, 3 * nailCo, _fill(const Color(0xFFEBB4A0), 0.8));
  }

  void _frontHand(Canvas canvas, _HandState h, bool palmSide) {
    // Fingers and thumb are painted first, under the palm, so their roots are
    // hidden inside the hand and they grow out of it with no seam.
    for (var i = 0; i < _fingers.length; i++) {
      final f = _fingers[i];
      final c = h.c[i];
      final spread = -(i - 1.5) * 13 * h.sp;
      _withTransform(canvas, tx: f.x, ty: 25.5, rotateDeg: spread, () => _frontFinger(canvas, f, c, palmSide));
    }
    // The thumb sits beside the index finger (x < 0), like a real hand.
    final tl = 19 * (1 - 0.5 * h.th);
    _withTransform(canvas, tx: -9.5, ty: 10, rotateDeg: 22 + 42 * (1 - h.th), () {
      _limbStroke(canvas, _capsule(10, 7.6, tl + 3), 10, tl + 3);
    });
    // Palms are lighter than the back of the hand; both are shaded as a rounded form.
    const box = Rect.fromLTWH(-14, -4, 28, 34);
    _blendedPalm(
      canvas,
      _svg('M-5 -4 C-8.5 1 -13.5 11 -13.8 20 C-14 24.5 -13.4 27 -12.4 28.5 Q0 31.5 12.4 28.5 C13.4 27 14 24.5 13.8 20 C13.5 11 8.5 1 5 -4 Z'),
      (palmSide
              ? const RadialGradient(center: Alignment(0, 0.1), radius: 0.75, colors: [_palm, _skinLight, _skinShade], stops: [0, 0.72, 1])
              : const RadialGradient(center: Alignment(-0.2, -0.3), radius: 0.8, colors: [_skinLight, _skin, _skinShade], stops: [0, 0.6, 1]))
          .createShader(box),
      -4,
      27,
    );
    final edge = _fadedEdge(-4);
    canvas.drawPath(_svg('M-5 -4 C-8.5 1 -13.5 11 -13.8 20 L-13.9 25'), edge);
    canvas.drawPath(_svg('M5 -4 C8.5 1 13.5 11 13.8 20 L13.9 25'), edge);
    if (palmSide) {
      // soft, shallow creases (real palm lines are subtle)
      canvas.drawPath(_svg('M-10 10 Q-2 15 9 8'), _stroke(_handEdge, 0.9, cap: StrokeCap.round, opacity: 0.4));
      canvas.drawPath(_svg('M-11 17.5 Q-1 21 11 15.5'), _stroke(_handEdge, 0.8, cap: StrokeCap.round, opacity: 0.32));
      canvas.drawPath(_svg('M5 3 Q-2 13 1.5 24'), _stroke(_handEdge, 0.8, cap: StrokeCap.round, opacity: 0.28));
    } else {
      // tendons and knuckles on the back of the hand
      final tendon = _stroke(_skinShade, 1.5, cap: StrokeCap.round, opacity: 0.16);
      canvas.drawPath(_svg('M-6 4 L-9.5 22'), tendon);
      canvas.drawPath(_svg('M-1 3 L-3 23'), tendon);
      canvas.drawPath(_svg('M4.5 4 L3.5 23'), tendon);
      final knuckle = _stroke(_skinShade, 1, cap: StrokeCap.round, opacity: 0.35);
      for (final k in const ['M-13.4 25.5 Q-10.2 23 -7 25.5', 'M-6.6 25.5 Q-3.4 23 -0.2 25.5', 'M0.2 25.5 Q3.4 23 6.6 25.5', 'M7 25.5 Q10.2 23 13.4 25.5']) {
        canvas.drawPath(_svg(k), knuckle);
      }
    }
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
    _ellipse(canvas, 146, 234, 15, 9, _fill(const Color(0xFFE0766E), 0.38));
    _ellipse(canvas, 254, 234, 15, 9, _fill(const Color(0xFFE0766E), 0.38));

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
    canvas.drawPath(_svg('M196 226 Q200 232 204 226'), _stroke(const Color(0xFFA8693F), 2.6, cap: StrokeCap.round));

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
      ..moveTo(mx - w, my + rig.mouthCorner)
      ..quadraticBezierTo(mx - w * 0.4, my - 4, mx, my - 2.5)
      ..quadraticBezierTo(mx + w * 0.4, my - 4, mx + w, my + rig.mouthCorner)
      ..quadraticBezierTo(mx + w * 0.85, my + h2, mx, my + h2 * 1.12)
      ..quadraticBezierTo(mx - w * 0.85, my + h2, mx - w, my + rig.mouthCorner)
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

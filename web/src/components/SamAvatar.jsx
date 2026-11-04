import React, { useEffect, useMemo, useRef } from 'react';

// Animated AI tutor "Sam": a school-girl character. Her mouth follows the loudness
// and brightness of the voice (so "oo" and "ee" look different), her hands
// gesture and beat in time with the speech, and the school's name is embroidered
// on her uniform vest. Everything is driven by one requestAnimationFrame loop that
// writes straight to SVG attributes (no React re-renders).
//
// She only talks and gestures while the voice is actually playing: the parent
// passes mode="speaking" from the moment audio starts until it ends.

const SKIN = '#ffdcbf';
const SKIN_SHADE = '#e9a888';
const SKIN_LIGHT = '#ffeadb';
const HAIR = '#2a1a1f';
const HAIR_HI = '#5a3a44';
const LIP = '#e8647c';
const BOW = '#e5384f';

// Hand shapes: curl (0 straight … 1 folded) for index→pinky, thumb curl, finger spread.
const HANDS = {
  relaxed: { c: [0.35, 0.4, 0.45, 0.5], th: 0.6, sp: 0.12 },
  open: { c: [0, 0, 0, 0.05], th: 0, sp: 0.75 },
  openSoft: { c: [0.1, 0.1, 0.15, 0.2], th: 0.1, sp: 0.4 },
  point: { c: [0, 0.95, 0.95, 0.95], th: 0.75, sp: 0 }
};

// Arm poses in degrees clockwise from "hanging down" for the RIGHT arm
// (negative = outward/up); the left arm mirrors the same numbers.
const POSES = {
  idle: { rs: -12, re: 25, ls: -12, le: 25, rh: 'relaxed', lh: 'relaxed' },
  wave: { rs: -80, re: -100, ls: -12, le: 25, rh: 'open', lh: 'relaxed', oscR: [22, 3.2] },
  explainR: { rs: -45, re: -95, ls: -12, le: 25, rh: 'open', lh: 'relaxed', oscR: [9, 1.6] },
  explainL: { rs: -12, re: 25, ls: -45, le: -95, rh: 'relaxed', lh: 'open', oscL: [9, 1.6] },
  explainBoth: { rs: -50, re: -85, ls: -50, le: -85, rh: 'openSoft', lh: 'openSoft', oscR: [8, 1.5], oscL: [8, 1.5] },
  pointR: { rs: -75, re: -100, ls: -12, le: 25, rh: 'point', lh: 'relaxed', oscR: [4, 2.2] },
  pointL: { rs: -12, re: 25, ls: -75, le: -100, rh: 'relaxed', lh: 'point', oscL: [4, 2.2] },
  listen: { rs: -115, re: -85, ls: -12, le: 25, rh: 'openSoft', lh: 'relaxed' },
  think: { rs: -12, re: 25, ls: -12, le: 25, rh: 'relaxed', lh: 'relaxed' },
  celebrate: { rs: -150, re: -10, ls: -150, le: -10, rh: 'open', lh: 'open', oscR: [10, 2.4], oscL: [10, 2.4] }
};
const TALK_GESTURES = ['explainR', 'explainL', 'pointR', 'explainBoth', 'pointL'];

const HAND_EDGE = '#e8b093';

const FINGERS = [
  { x: -11.8, len: 29, w0: 8.6, w1: 6.8 },
  { x: -3.9, len: 34, w0: 8.8, w1: 6.8 },
  { x: 3.9, len: 31, w0: 8.6, w1: 6.6 },
  { x: 11.8, len: 24, w0: 7.6, w1: 5.8 }
];

// Tapered, rounded-tip finger outline (open at the base so it blends into the palm).
const capsule = (w0, w1, len) => {
  const r = w1 / 2;
  const y = Math.max(len - r, 0.1);
  return `M${-w0 / 2} 0 L${-r} ${y} A${r} ${r} 0 0 0 ${r} ${y} L${w0 / 2} 0`;
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function shirtLines(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  if (clean.length <= 12) return [clean];
  const words = clean.split(' ');
  if (words.length === 1) return [clean];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (diff < bestDiff) { best = i; bestDiff = diff; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

function newHandStore() {
  return { root: null, flip: null, fingers: FINGERS.map(() => ({})), thumb: {} };
}

// One hand: palm, four fingers and a thumb. Fingers shorten to show curling
// (a front-view foreshortening), and fan out to show spread.
function Hand({ store }) {
  return (
    <g ref={(el) => { store.root = el; }}>
      <g ref={(el) => { store.flip = el; }}>
        <path d="M-9 -4 C-14 8 -17 22 -16 34 L16 34 C17 22 14 8 9 -4 Z" fill={SKIN} />
        <path d="M-16 34 C-17 22 -14 8 -9 -4" fill="none" stroke={HAND_EDGE} strokeWidth="1.1" strokeLinecap="round" />
        <path d="M16 34 C17 22 14 8 9 -4" fill="none" stroke={HAND_EDGE} strokeWidth="1.1" strokeLinecap="round" />
        <path d="M-8 16 Q-1 21 8 17" fill="none" stroke={HAND_EDGE} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
        <g ref={(el) => { store.thumb.g = el; }} transform="translate(14 14)">
          <path ref={(el) => { store.thumb.path = el; }} d={capsule(11, 8, 22)} fill={SKIN} stroke={HAND_EDGE} strokeWidth="1.1" strokeLinejoin="round" />
        </g>
        {FINGERS.map((f, i) => (
          <g key={i} ref={(el) => { store.fingers[i].g = el; }} transform={`translate(${f.x} 30)`}>
            <path ref={(el) => { store.fingers[i].path = el; }} d={capsule(f.w0, f.w1, f.len)} fill={SKIN} stroke={HAND_EDGE} strokeWidth="1.1" strokeLinejoin="round" />
            <ellipse ref={(el) => { store.fingers[i].nail = el; }} cx="0" cy={f.len - 6} rx="2.2" ry="3" fill="#ffd2cc" opacity="0.8" />
          </g>
        ))}
      </g>
    </g>
  );
}

function Arm({ upRef, foreRef, store }) {
  return (
    <g ref={upRef}>
      <path d="M-12 0 Q-13.5 44 -9.5 90 L9.5 90 Q13.5 44 12 0 Z" fill={SKIN} />
      {/* short blouse sleeve */}
      <circle r="21" fill="#fff" stroke="#dfe3f5" strokeWidth="1.4" />
      <path d="M-21 -4 Q-25 28 -20 54 Q0 60 20 54 Q25 28 21 -4 Z" fill="#fff" stroke="#dfe3f5" strokeWidth="1.4" />
      <path d="M-20 50 Q0 57 20 50" fill="none" stroke="#c9d0ee" strokeWidth="2" />
      <g ref={foreRef} transform="translate(0 88)">
        <path d="M-9.5 -2 Q-11 28 -6.4 78 L6.4 78 Q11 28 9.5 -2 Z" fill={SKIN} />
        <circle cx="0" cy="0" r="9.6" fill={SKIN} />
        <path d="M-8.5 14 Q-9.5 40 -6 74 L-3 74 Q-5.5 40 -5 14 Z" fill={SKIN_SHADE} opacity="0.16" />
        <g transform="translate(0 76)">
          <Hand store={store} />
        </g>
      </g>
    </g>
  );
}

export default function SamAvatar({ mode = 'idle', schoolName = '', shirtColor = '#23318f', getLevel, celebrate = false }) {
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const levelRef = useRef(getLevel);
  levelRef.current = getLevel;
  const celebrateRef = useRef(celebrate);
  celebrateRef.current = celebrate;

  const bodyRef = useRef(null);
  const headRef = useRef(null);
  const rUp = useRef(null); const rFore = useRef(null);
  const lUp = useRef(null); const lFore = useRef(null);
  const rStore = useRef(newHandStore()).current;
  const lStore = useRef(newHandStore()).current;
  const mouthFill = useRef(null); const mouthClip = useRef(null); const mouthLine = useRef(null);
  const tongue = useRef(null); const teeth = useRef(null);
  const eyeL = useRef(null); const eyeR = useRef(null);
  const irisL = useRef(null); const irisR = useRef(null);
  const browL = useRef(null); const browR = useRef(null);
  const dots = useRef([]);

  const lines = useMemo(() => shirtLines(schoolName), [schoolName]);
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const fontSize = clamp(122 / (longest * 0.62), 9, 17);

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const cur = {
      rs: -12, re: 25, ls: -12, le: 25, ar: 0, al: 0, fr: 3, fl: 3,
      rh: { c: [...HANDS.relaxed.c], th: HANDS.relaxed.th, sp: HANDS.relaxed.sp },
      lh: { c: [...HANDS.relaxed.c], th: HANDS.relaxed.th, sp: HANDS.relaxed.sp }
    };
    let gesture = 'idle';
    let gestureUntil = 0;
    let lastSpokeAt = -99;
    let wasSpeaking = false;
    let nextBlink = 1.5;
    let blinkAt = -1;
    let level = 0;
    let bright = 0.4;
    let baseline = 0;
    let beat = 0;
    let lastBeatAt = -1;
    let quietSince = 0;
    let raf = 0;
    const t0 = performance.now();
    let last = t0;

    const setT = (el, v) => { if (el) el.setAttribute('transform', v); };
    const ref = (r) => r.current;

    function applyHand(store, h, wristDeg, flipX) {
      setT(store.root, `rotate(${wristDeg.toFixed(2)})`);
      setT(store.flip, `scale(${flipX.toFixed(3)} 1)`);
      FINGERS.forEach((f, i) => {
        const fs = store.fingers[i];
        const c = h.c[i];
        const len = f.len * (1 - 0.62 * c);
        const spread = -(i - 1.5) * 13 * h.sp;
        setT(fs.g, `translate(${f.x} 30) rotate(${spread.toFixed(2)})`);
        if (fs.path) fs.path.setAttribute('d', capsule(f.w0, f.w1, len));
        if (fs.nail) { fs.nail.setAttribute('cy', (len - 6).toFixed(2)); fs.nail.style.opacity = c > 0.7 ? 0 : 0.8; }
      });
      const tl = 22 * (1 - 0.5 * h.th);
      setT(store.thumb.g, `translate(14 14) rotate(${(-(22 + 42 * (1 - h.th))).toFixed(2)})`);
      if (store.thumb.path) store.thumb.path.setAttribute('d', capsule(11, 8, tl));
    }

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = (now - t0) / 1000;
      const mode = modeRef.current;
      // Hold the speaking pose across tiny gaps between sentences.
      const sinceSpoke = t - lastSpokeAt;
      if (mode === 'speaking') lastSpokeAt = t;
      const speaking = mode === 'speaking' || (t - lastSpokeAt) < 0.6;

      // ── voice → mouth level, brightness, beats ──
      let raw = 0;
      let rawBright = 0.4;
      if (mode === 'speaking') {
        const m = levelRef.current ? levelRef.current() : null;
        if (m === null || m === undefined) {
          // No audio measurement available: believable syllables with phrase pauses.
          const syll = Math.pow(Math.abs(Math.sin(t * 9.5)), 0.8) * (0.55 + 0.45 * Math.sin(t * 2.7));
          const phrase = Math.sin(t * 0.9) > -0.55 ? 1 : 0.05;
          raw = clamp(syll * phrase, 0, 1);
          rawBright = 0.5 + 0.4 * Math.sin(t * 4.1);
        } else {
          raw = m.level;
          rawBright = m.bright;
        }
      }
      level += (raw - level) * Math.min(1, dt * (raw > level ? 24 : 14));
      bright += (rawBright - bright) * Math.min(1, dt * 12);
      baseline += (level - baseline) * Math.min(1, dt * 3);
      if (speaking && level > baseline * 1.5 + 0.09 && t - lastBeatAt > 0.28) { beat = 1; lastBeatAt = t; }
      beat *= Math.exp(-dt * 6);
      if (level > 0.04) quietSince = t;
      const pausing = mode === 'speaking' && t - quietSince > 0.55;

      // ── choose a gesture ──
      if (celebrateRef.current) {
        gesture = 'celebrate';
      } else if (speaking && !pausing) {
        if (!wasSpeaking) {
          // Wave hello on the first words after a quiet spell, otherwise just start explaining.
          gesture = sinceSpoke > 8 ? 'wave' : 'explainR';
          gestureUntil = t + (gesture === 'wave' ? 2.2 : rand(2.4, 4));
        } else if (t > gestureUntil) {
          let next = gesture;
          while (next === gesture) next = TALK_GESTURES[Math.floor(Math.random() * TALK_GESTURES.length)];
          gesture = next;
          gestureUntil = t + rand(2.4, 4.4);
        }
      } else if (pausing) {
        gesture = 'idle';
      } else {
        gesture = mode === 'listening' ? 'listen' : mode === 'thinking' ? 'think' : 'idle';
      }
      wasSpeaking = speaking && !pausing;

      // ── arms ease toward the pose ──
      const target = POSES[gesture] || POSES.idle;
      const k = Math.min(1, dt * 5);
      ['rs', 're', 'ls', 'le'].forEach((key) => { cur[key] += (target[key] - cur[key]) * k; });
      const oR = target.oscR || [0, cur.fr];
      const oL = target.oscL || [0, cur.fl];
      cur.ar += (oR[0] - cur.ar) * k; cur.fr = oR[1];
      cur.al += (oL[0] - cur.al) * k; cur.fl = oL[1];
      const swayR = Math.sin(t * cur.fr * Math.PI * 2) * cur.ar - beat * 12;
      const swayL = Math.sin(t * cur.fl * Math.PI * 2 + 1) * cur.al - beat * 12;
      const idleSway = reduce ? 0 : Math.sin(t * 1.3) * 2;
      setT(ref(rUp), `translate(278 372) rotate(${(cur.rs + idleSway).toFixed(2)})`);
      setT(ref(rFore), `translate(0 88) rotate(${(cur.re + swayR).toFixed(2)})`);
      setT(ref(lUp), `translate(122 372) rotate(${(-(cur.ls - idleSway)).toFixed(2)})`);
      setT(ref(lFore), `translate(0 88) rotate(${(-(cur.le + swayL)).toFixed(2)})`);

      // ── hands ease toward their shapes ──
      [['rh', rStore, cur.rs + cur.re, 1], ['lh', lStore, cur.ls + cur.le, -1]].forEach(([key, store, cumulative, side]) => {
        const want = HANDS[target[key]] || HANDS.relaxed;
        const h = cur[key];
        for (let i = 0; i < 4; i += 1) h.c[i] += (want.c[i] - h.c[i]) * k;
        h.th += (want.th - h.th) * k;
        h.sp += (want.sp - h.sp) * k;
        // Palm turns to face the viewer as the hand rises (thumb swaps sides).
        const turn = clamp((Math.abs(cumulative) - 70) / 50, 0, 1);
        const flipX = side * (1 - 2 * turn);
        const wave = key === 'rh' ? swayR : swayL;
        applyHand(store, h, (gesture === 'wave' && key === 'rh' ? wave * 0.5 : wave * 0.25), flipX);
      });

      // ── mouth ──
      const open = reduce ? 0 : clamp(level * 1.9, 0, 1);
      const mx = 200; const my = 252;
      const w = lerp(16, 27, bright) - open * 2 + (speaking ? Math.sin(t * 9) * 0.8 : 0);
      const h2 = (3 + open * 31) * lerp(1.15, 0.7, bright);
      const d = `M${mx - w} ${my} Q${mx - w * 0.4} ${my - 4} ${mx} ${my - 2.5} Q${mx + w * 0.4} ${my - 4} ${mx + w} ${my} Q${mx + w * 0.85} ${my + h2} ${mx} ${my + h2 * 1.12} Q${mx - w * 0.85} ${my + h2} ${mx - w} ${my} Z`;
      const isOpen = open > 0.07;
      const ml = mouthFill.current; const mc = mouthClip.current; const mline = mouthLine.current;
      if (ml) { ml.setAttribute('d', d); ml.style.opacity = isOpen ? 1 : 0; }
      if (mc) mc.setAttribute('d', d);
      if (mline) {
        const smile = mode === 'thinking' ? 3 : 7;
        mline.setAttribute('d', `M${mx - 19} ${my - 1} Q${mx} ${my + smile} ${mx + 19} ${my - 1}`);
        mline.style.opacity = isOpen ? 0 : 1;
      }
      if (tongue.current) {
        tongue.current.setAttribute('cy', (my + h2 * 0.88).toFixed(2));
        tongue.current.setAttribute('rx', (w * 0.55).toFixed(2));
        tongue.current.setAttribute('ry', Math.max(1, h2 * 0.3).toFixed(2));
      }
      if (teeth.current) {
        teeth.current.setAttribute('x', mx - w);
        teeth.current.setAttribute('y', my - 3);
        teeth.current.setAttribute('width', w * 2);
        teeth.current.setAttribute('height', Math.min(9, 2.5 + h2 * 0.3 + bright * 3).toFixed(2));
      }

      // ── blink ──
      if (t > nextBlink && blinkAt < 0) { blinkAt = t; nextBlink = t + rand(2.2, 5.5); }
      let blink = 1;
      if (blinkAt >= 0) {
        const p = (t - blinkAt) / 0.16;
        if (p >= 1) blinkAt = -1; else blink = 1 - Math.sin(Math.PI * p) * 0.93;
      }
      setT(eyeL.current, `translate(165 198) scale(1 ${blink.toFixed(3)}) translate(-165 -198)`);
      setT(eyeR.current, `translate(235 198) scale(1 ${blink.toFixed(3)}) translate(-235 -198)`);

      // ── gaze + brows ──
      const lookX = mode === 'thinking' ? -4 : Math.sin(t * 0.7) * 1.8;
      const lookY = mode === 'thinking' ? -5 : Math.sin(t * 0.5) * 1;
      setT(irisL.current, `translate(${lookX.toFixed(2)} ${lookY.toFixed(2)})`);
      setT(irisR.current, `translate(${lookX.toFixed(2)} ${lookY.toFixed(2)})`);
      const browLift = mode === 'thinking' ? 6 : speaking ? level * 4 + beat * 3 : mode === 'listening' ? 3 : 0;
      setT(browL.current, `translate(0 ${(-browLift).toFixed(2)})`);
      setT(browR.current, `translate(0 ${(-browLift - (mode === 'thinking' ? 4 : 0)).toFixed(2)})`);

      // ── head & body ──
      const tilt = mode === 'listening' ? 5 : mode === 'thinking' ? -6 : (reduce ? 0 : Math.sin(t * 0.9) * 1.1 + (speaking && !pausing ? Math.sin(t * 2.2) * 1.8 + beat * 2.5 : 0));
      const bob = speaking ? -level * 2.5 + beat * 1.5 : 0;
      setT(headRef.current, `translate(0 ${bob.toFixed(2)}) rotate(${tilt.toFixed(2)} 200 338)`);
      setT(bodyRef.current, `translate(0 ${(reduce ? 0 : Math.sin(t * 1.7) * 2).toFixed(2)})`);

      dots.current.forEach((el, i) => {
        if (el) el.style.opacity = mode === 'thinking' ? (Math.sin(t * 4 - i * 1.1) > 0 ? 1 : 0.25) : 0;
      });

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const textY0 = lines.length === 2 ? 484 : 494;

  return (
    <svg className="eg-sam-svg" viewBox="0 0 520 800" role="img" aria-label="Sam, your AI tutor" preserveAspectRatio="xMidYMax meet">
      <defs>
        <clipPath id="eg-sam-mouth-clip"><path ref={mouthClip} d="M184 252 Q200 247 216 252 Q214 268 200 272 Q186 268 184 252 Z" /></clipPath>
        <radialGradient id="eg-sam-face" cx="42%" cy="34%" r="80%">
          <stop offset="0%" stopColor={SKIN_LIGHT} />
          <stop offset="100%" stopColor={SKIN} />
        </radialGradient>
        <linearGradient id="eg-sam-vest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shirtColor} />
          <stop offset="100%" stopColor="#141f66" />
        </linearGradient>
        <radialGradient id="eg-sam-iris" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#b07a3c" />
          <stop offset="60%" stopColor="#6b4220" />
          <stop offset="100%" stopColor="#3a2312" />
        </radialGradient>
      </defs>

      <ellipse cx="260" cy="786" rx="150" ry="11" fill="rgba(0,0,0,0.25)" />

      <g transform="translate(60 0)">
        <g ref={bodyRef}>
          {/* legs, knee socks and shoes */}
          {[[173, -1], [227, 1]].map(([cx, s]) => (
            <g key={cx}>
              <path d={`M${cx - 14} 660 Q${cx - 13} 700 ${cx - 10} 722 L${cx + 10} 722 Q${cx + 13} 700 ${cx + 14} 660 Z`} fill={SKIN} />
              <path d={`M${cx - 11} 712 Q${cx - 12} 740 ${cx - 10} 768 L${cx + 10} 768 Q${cx + 12} 740 ${cx + 11} 712 Z`} fill="#fff" stroke="#dfe3f5" strokeWidth="1.2" />
              <path d={`M${cx - 11.5} 716 Q${cx} 721 ${cx + 11.5} 716`} fill="none" stroke="#c9d0ee" strokeWidth="2" />
              <path d={`M${cx - 12} 768 Q${cx - 14} 784 ${cx - 4 + s * 8} 784 L${cx + 14 + s * 6} 784 Q${cx + 17 + s * 6} 772 ${cx + 12} 768 Z`} fill="#1d1f33" />
            </g>
          ))}

          {/* neck */}
          <path d="M185 290 L185 338 Q183 350 170 358 L230 358 Q217 350 215 338 L215 290 Z" fill={SKIN} />
          <path d="M185 306 Q200 326 215 306 L215 290 L185 290 Z" fill={SKIN_SHADE} opacity="0.35" />

          {/* white blouse */}
          <path d="M136 480 Q118 446 106 410 Q106 372 150 360 L250 360 Q294 372 294 410 Q282 446 264 480 Z" fill="#fff" stroke="#dfe3f5" strokeWidth="1.5" />

          {/* pleated skirt */}
          <path d="M116 548 L284 548 L306 668 Q200 684 94 668 Z" fill="#2b3a8c" stroke="#101a58" strokeWidth="1.5" />
          {[-72, -48, -24, 0, 24, 48, 72].map((dx) => (
            <path key={dx} d={`M${200 + dx * 0.78} 556 L${200 + dx * 1.2} 672`} stroke="#4656b3" strokeWidth="2" opacity="0.7" />
          ))}

          {/* uniform vest */}
          <path d="M124 558 Q130 482 124 410 Q126 380 152 368 L186 360 L200 412 L214 360 L248 368 Q274 380 276 410 Q270 482 276 558 Z" fill="url(#eg-sam-vest)" stroke="#101a58" strokeWidth="1.5" />
          <path d="M124 558 Q200 566 276 558" fill="none" stroke="#f2c94c" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M186 360 L200 412 L214 360" fill="none" stroke="#f2c94c" strokeWidth="2.5" strokeLinejoin="round" />

          {/* collar + bow */}
          <path d="M184 350 Q160 350 150 372 Q176 384 198 366 Z" fill="#fff" stroke="#cdd3ec" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M216 350 Q240 350 250 372 Q224 384 202 366 Z" fill="#fff" stroke="#cdd3ec" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M200 372 Q176 352 170 372 Q176 392 200 376 Z" fill={BOW} stroke="#b5243a" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M200 372 Q224 352 230 372 Q224 392 200 376 Z" fill={BOW} stroke="#b5243a" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M196 378 L188 408 L200 400 Z" fill="#c92d44" />
          <path d="M204 378 L212 408 L200 400 Z" fill="#c92d44" />
          <rect x="193" y="365" width="14" height="14" rx="5" fill="#f0485e" stroke="#b5243a" strokeWidth="1.2" />

          {/* school crest + name embroidered on the vest */}
          {lines.length ? (
            <g>
              <path d="M200 436 L216 442 Q216 462 200 470 Q184 462 184 442 Z" fill="#ffd54a" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
              <text x="200" y="460" textAnchor="middle" fontSize="15">🎓</text>
              {lines.map((line, i) => (
                <text
                  key={`${line}-${i}`}
                  x="200"
                  y={textY0 + i * (fontSize + 3)}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fontWeight="800"
                  fill="#fff"
                  letterSpacing="0.3"
                  style={{ fontFamily: "'Poppins','Trebuchet MS',system-ui,sans-serif" }}
                >
                  {line}
                </text>
              ))}
            </g>
          ) : null}

          {/* arms */}
          <Arm upRef={lUp} foreRef={lFore} store={lStore} />
          <Arm upRef={rUp} foreRef={rFore} store={rStore} />

          {/* head */}
          <g ref={headRef}>
            <g transform="translate(200 322) scale(0.88) translate(-200 -296)">
            {/* back hair */}
            <path d="M108 200 C100 112 150 80 200 80 C250 80 300 112 292 200 L288 286 Q200 288 112 286 Z" fill={HAIR} />
            {/* pigtails */}
            <path d="M114 148 C82 150 58 192 58 252 C58 304 72 340 94 356 C116 346 126 304 126 254 C126 212 124 178 120 150 Z" fill={HAIR} />
            <path d="M286 148 C318 150 342 192 342 252 C342 304 328 340 306 356 C284 346 274 304 274 254 C274 212 276 178 280 150 Z" fill={HAIR} />
            <path d="M76 200 Q70 270 90 336" fill="none" stroke={HAIR_HI} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
            <path d="M324 200 Q330 270 310 336" fill="none" stroke={HAIR_HI} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
            {/* hair ties */}
            <rect x="106" y="146" width="22" height="12" rx="5" fill="#b5243a" />
            <rect x="272" y="146" width="22" height="12" rx="5" fill="#b5243a" />

            {/* ears */}
            <ellipse cx="121" cy="204" rx="10" ry="14" fill={SKIN} stroke={SKIN_SHADE} strokeWidth="1.2" />
            <ellipse cx="279" cy="204" rx="10" ry="14" fill={SKIN} stroke={SKIN_SHADE} strokeWidth="1.2" />

            {/* face */}
            <path d="M120 190 C120 122 158 92 200 92 C242 92 280 122 280 190 C280 242 252 290 200 298 C148 290 120 242 120 190 Z" fill="url(#eg-sam-face)" stroke={SKIN_SHADE} strokeWidth="1.4" />

            {/* cheeks */}
            <ellipse cx="146" cy="234" rx="15" ry="9" fill="#ff8fa3" opacity="0.4" />
            <ellipse cx="254" cy="234" rx="15" ry="9" fill="#ff8fa3" opacity="0.4" />

            {/* brows */}
            <g ref={browL}><path d="M139 172 Q165 160 190 170" fill="none" stroke={HAIR} strokeWidth="5" strokeLinecap="round" /></g>
            <g ref={browR}><path d="M210 170 Q235 160 261 172" fill="none" stroke={HAIR} strokeWidth="5" strokeLinecap="round" /></g>

            {/* eyes */}
            {[['l', 165, eyeL, irisL], ['r', 235, eyeR, irisR]].map(([key, cx, eyeRef, irisRef]) => (
              <g key={key} ref={eyeRef}>
                <ellipse cx={cx} cy="198" rx="17" ry="20" fill="#fff" stroke="#c9a28a" strokeWidth="1.2" />
                <g ref={irisRef}>
                  <circle cx={cx} cy="200" r="12.5" fill="url(#eg-sam-iris)" />
                  <circle cx={cx} cy="200" r="6.4" fill="#150c07" />
                  <circle cx={cx + 4.8} cy="194" r="4.2" fill="#fff" />
                  <circle cx={cx - 4.2} cy="206" r="2.2" fill="#fff" opacity="0.85" />
                </g>
                <path d={`M${cx - 18} 192 Q${cx} 174 ${cx + 18} 192`} fill="none" stroke="#1d1115" strokeWidth="3.6" strokeLinecap="round" />
                <path d={`M${key === 'l' ? cx - 18 : cx + 18} 192 L${key === 'l' ? cx - 24 : cx + 24} 186`} stroke="#1d1115" strokeWidth="2.6" strokeLinecap="round" />
                <path d={`M${key === 'l' ? cx - 14 : cx + 14} 187 L${key === 'l' ? cx - 19 : cx + 19} 180`} stroke="#1d1115" strokeWidth="2.2" strokeLinecap="round" />
              </g>
            ))}

            {/* nose */}
            <path d="M196 226 Q200 232 204 226" fill="none" stroke="#d99a7c" strokeWidth="2.6" strokeLinecap="round" />

            {/* mouth */}
            <path ref={mouthLine} d="M181 251 Q200 259 219 251" fill="none" stroke={LIP} strokeWidth="4.6" strokeLinecap="round" />
            <path ref={mouthFill} d="M184 252 Q200 247 216 252 Q214 268 200 272 Q186 268 184 252 Z" fill="#74202f" stroke={LIP} strokeWidth="3.6" strokeLinejoin="round" style={{ opacity: 0 }} />
            <g clipPath="url(#eg-sam-mouth-clip)">
              <ellipse ref={tongue} cx="200" cy="266" rx="11" ry="4" fill="#f0808f" />
              <rect ref={teeth} x="184" y="249" width="32" height="5" rx="2" fill="#fff" />
            </g>

            {/* bangs */}
            <path d="M116 176 C112 108 158 82 204 84 C252 84 292 112 284 176 C268 146 244 136 222 142 C198 108 156 120 116 176 Z" fill={HAIR} />
            <path d="M136 132 Q168 108 206 112" fill="none" stroke={HAIR_HI} strokeWidth="4.5" strokeLinecap="round" opacity="0.8" />
            <path d="M232 112 Q262 120 274 150" fill="none" stroke={HAIR_HI} strokeWidth="3.5" strokeLinecap="round" opacity="0.6" />

            {/* ribbons */}
            {[[117, 152, -1], [283, 152, 1]].map(([x, y, s]) => (
              <g key={x}>
                <path d={`M${x} ${y} Q${x + s * 18} ${y - 16} ${x + s * 26} ${y - 2} Q${x + s * 18} ${y + 14} ${x} ${y} Z`} fill={BOW} stroke="#b5243a" strokeWidth="1.2" />
                <path d={`M${x} ${y} Q${x - s * 18} ${y - 16} ${x - s * 26} ${y - 2} Q${x - s * 18} ${y + 14} ${x} ${y} Z`} fill={BOW} stroke="#b5243a" strokeWidth="1.2" />
                <circle cx={x} cy={y} r="5" fill="#f0485e" stroke="#b5243a" strokeWidth="1.2" />
              </g>
            ))}

            {/* thinking bubbles */}
            {[[318, 112, 5], [338, 92, 7], [366, 62, 10]].map(([x, y, r], i) => (
              <circle key={i} ref={(el) => { dots.current[i] = el; }} cx={x} cy={y} r={r} fill="#fff" stroke="#c7d2fe" strokeWidth="2" style={{ opacity: 0 }} />
            ))}
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

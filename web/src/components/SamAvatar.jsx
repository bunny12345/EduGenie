import React, { useEffect, useMemo, useRef } from 'react';

// Animated AI tutor "Sam": a school-girl character. Her mouth follows the loudness
// and brightness of the voice (so "oo" and "ee" look different), her hands
// gesture and beat in time with the speech, and the school's name is embroidered
// on her uniform vest. Everything is driven by one requestAnimationFrame loop that
// writes straight to SVG attributes (no React re-renders).
//
// She only talks and gestures while the voice is actually playing: the parent
// passes mode="speaking" from the moment audio starts until it ends.

const SKIN = '#d29a6e';
const SKIN_SHADE = '#b67a52';
const SKIN_LIGHT = '#e2ae82';
const HAIR = '#2a1a1f';
const HAIR_HI = '#5a3a44';
const LIP = '#c24d63';
const SKIN_DEEP = '#9c6440';
const PALM = '#e4b28a';
const BOW = '#e5384f';

// Hand shapes: curl (0 straight … 1 folded) for index→pinky, thumb curl, finger spread.
const HANDS = {
  relaxed: { c: [0.35, 0.42, 0.5, 0.58], th: 0.55, sp: 0.1 },
  open: { c: [0.04, 0.02, 0.06, 0.12], th: 0.05, sp: 0.6 },
  openSoft: { c: [0.14, 0.16, 0.22, 0.3], th: 0.2, sp: 0.32 },
  point: { c: [0, 0.92, 0.95, 0.97], th: 0.7, sp: 0 },
  curled: { c: [0.62, 0.7, 0.76, 0.82], th: 0.75, sp: 0.05 }
};

// One arm's pose, in the RIGHT arm's frame (the left arm mirrors it):
// s/e = shoulder/elbow degrees clockwise from hanging down (negative = out/up,
// positive = across the body), f = forearm length factor (< 1 = reaching toward
// the viewer), w = resting wrist bend, p = hand turn: 1 = back of the hand to the
// viewer, 0 = side-on (thumb toward the viewer, how real hands hang), -1 = palm.
const arm = (s, e, o = {}) => ({ s, e, f: 1, w: 0, p: 1, hand: 'relaxed', active: true, ...o });
// Arms hang relaxed with a soft elbow, hands side-on and loosely curled.
const REST = arm(-6, 9, { p: 0.06, w: 4, active: false });
// Real people gesture with the elbows close to the body and the forearms coming
// forward (foreshortened), so the hands stay in front of the torso.
const POSES = {
  rest: { r: REST, l: REST },
  // hands loosely together in front of the tummy, like holding an idea
  frontBoth: { r: arm(-8, 62, { f: 0.5, w: 6, p: 0.2, hand: 'openSoft' }), l: arm(-8, 62, { f: 0.5, w: 6, p: 0.2, hand: 'openSoft' }) },
  // palm up, "here's the thing", just out from the body
  offerR: { r: arm(-10, -30, { f: 0.45, w: -18, p: -0.85, hand: 'openSoft' }), l: REST },
  offerL: { r: REST, l: arm(-10, -30, { f: 0.45, w: -18, p: -0.85, hand: 'openSoft' }) },
  // open hand raised in front of the chest; the palm faces the body, as a
  // real hand there does, so the viewer sees the back of the hand
  explainR: { r: arm(-12, 120, { f: 0.55, w: -10, p: 0.75, hand: 'open' }), l: REST },
  explainL: { r: REST, l: arm(-12, 120, { f: 0.55, w: -10, p: 0.75, hand: 'open' }) },
  // both palms open: "see?"
  openBoth: { r: arm(-16, -24, { f: 0.55, w: -18, p: -0.85, hand: 'open' }), l: arm(-16, -24, { f: 0.55, w: -18, p: -0.85, hand: 'open' }) },
  // index finger up: "one important thing"
  pointUpR: { r: arm(-10, 150, { f: 0.6, w: 6, p: 0.85, hand: 'point' }), l: REST },
  pointUpL: { r: REST, l: arm(-10, 150, { f: 0.6, w: 6, p: 0.85, hand: 'point' }) },
  wave: { r: arm(-38, -124, { w: -6, p: -0.9, hand: 'open' }), l: REST },
  // hand resting on the chest while listening
  listen: { r: arm(-10, 112, { f: 0.5, w: -6, p: 0.15, hand: 'openSoft' }), l: REST },
  // loose fist under the chin, other arm across the waist
  think: { r: arm(26, 140, { f: 0.85, w: -20, p: 0.12, hand: 'curled' }), l: arm(8, 78, { f: 0.5, w: 6, p: 0.3 }) },
  celebrate: { r: arm(-150, -10, { p: -0.9, hand: 'open' }), l: arm(-150, -10, { p: -0.9, hand: 'open' }) }
};
// Big gestures for energetic speech, smaller close-to-the-body ones for calm speech.
const BIG_GESTURES = ['offerR', 'offerL', 'explainR', 'explainL', 'openBoth', 'frontBoth', 'pointUpR', 'pointUpL'];
const SMALL_GESTURES = ['frontBoth', 'offerR', 'offerL', 'explainR', 'explainL'];
const SCRIPTED = new Set(['wave', 'celebrate', 'think', 'listen', 'rest']);

const HAND_EDGE = '#b07548';
// Limbs and fingers are shaded as cylinders (lit from the front-left) so they
// read as round 3D forms instead of flat paper cut-outs.
const LIMB = 'url(#eg-sam-limb)';
const LIMB_DARK = 'url(#eg-sam-limb-dk)';
// Upper arm, elbow and forearm share one shading band in absolute arm space,
// so the shading flows continuously around the bend.
const ARM = 'url(#eg-sam-arm)';
let samCount = 0;

const FINGERS = [
  { x: -10.2, len: 24, w0: 7.8, w1: 6.2 },
  { x: -3.4, len: 28, w0: 8, w1: 6.2 },
  { x: 3.4, len: 25.5, w0: 7.8, w1: 6 },
  { x: 10.2, len: 19.5, w0: 7, w1: 5.3 }
];

// Tapered, rounded-tip finger outline (open at the base so it blends into the palm).
const capsule = (w0, w1, len) => {
  const r = w1 / 2;
  const y = Math.max(len - r, 0.1);
  return `M${-w0 / 2} 0 L${-r} ${y} A${r} ${r} 0 0 0 ${r} ${y} L${w0 / 2} 0`;
};

// One finger bone: tapered from wTop to wBot over len, round at the tip (and at
// the top too for middle/tip bones, which overlap like knuckles). The base bone
// is left open at the top so it blends into the palm with no seam.
const phal = (wTop, wBot, len, roundTop) => {
  const rb = wBot / 2;
  const rt = wTop / 2;
  const l = Math.max(len, 0.01);
  return `M${-rt} 0 L${-rb} ${l.toFixed(2)} A${rb} ${rb} 0 0 0 ${rb} ${l.toFixed(2)} L${rt} 0${roundTop ? ` A${rt} ${rt} 0 0 0 ${-rt} 0 Z` : ''}`;
};

// Side-view fingers: middle/ring/pinky peek out behind the index finger.
// Fingers are painted as one piece: all bone outlines first, then all fills on
// top, so only the silhouette is outlined (no rings at the knuckles).
const FINGER_EDGE = { fill: 'none', stroke: HAND_EDGE, strokeWidth: 2.2, strokeLinejoin: 'round', strokeLinecap: 'round' };
// The finger root is tucked under the palm: its outline fades in as the finger emerges.
const ROOT_EDGE = { ...FINGER_EDGE, stroke: 'url(#eg-sam-root-edge)' };
const creaseD = (w) => { const r = w / 2 - 1.2; return `M${-r} 0.6 Q0 2 ${r} 0.6`; };
const CREASE = { fill: 'none', stroke: HAND_EDGE, strokeWidth: 0.8, strokeLinecap: 'round', opacity: 0.35 };

const PROFILE_FINGERS = [
  { x: 3, y: 27.5, w0: 12, w1: 9, segs: [12, 8.5, 7.2], dark: true },
  { x: -2, y: 26, w0: 12.6, w1: 8.4, segs: [11.5, 8, 6.8], dark: false }
];

// Critically damped spring step for finger joints: they ease in and out (no
// instant velocity jumps), which is what makes fingers look alive.
function fingerSpring(x, v, target, dt, freq) {
  const w = freq * Math.PI * 2;
  const nv = (v + dt * w * w * (target - x)) / (1 + 2 * 0.95 * w * dt + w * w * dt * dt);
  return [x + nv * dt, nv];
}

// Damped spring (implicit Euler, stable on slow frames): arms overshoot and
// settle slightly instead of sliding linearly, so gestures look like muscle.
function makeSpring(x) {
  return {
    x,
    v: 0,
    step(target, dt, freq = 3.4, damp = 0.72) {
      const w = freq * Math.PI * 2;
      this.v = (this.v + dt * w * w * (target - this.x)) / (1 + 2 * damp * w * dt + w * w * dt * dt);
      this.x += this.v * dt;
    }
  };
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
// Smooth, non-repeating drift (sum of incommensurate sines): keeps limbs alive
// without the metronome look of a single sine wave.
const noise = (t, seed) => Math.sin(t * 0.73 + seed) * 0.5 + Math.sin(t * 1.37 + seed * 2.3) * 0.3 + Math.sin(t * 2.21 + seed * 4.1) * 0.2;

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
  return { root: null, flip: null, front: null, fore: null, pos: null, palm: null, palmLines: null, backLines: null, crease: null, clipU: null, clipF: null, fingers: FINGERS.map(() => ({ segs: [], outs: [], creases: [] })), thumb: {}, profile: { chains: PROFILE_FINGERS.map(() => []), outChains: PROFILE_FINGERS.map(() => []) }, shadow: {} };
}

function ProfileFinger({ spec, refs, outRefs }) {
  const { w0, w1, segs, dark } = spec;
  const widths = [w0, lerp(w0, w1, 0.45), lerp(w0, w1, 0.8), w1];
  const d = (i) => phal(widths[i], widths[i + 1], segs[i], i > 0);
  const chain = (r, outline) => (
    <g ref={(el) => { r[0] = el; }}>
      {outline ? <path d={d(0)} {...ROOT_EDGE} /> : <path d={d(0)} fill={dark ? LIMB_DARK : LIMB} />}
      <g ref={(el) => { r[1] = el; }}>
        {outline ? <path d={d(1)} {...FINGER_EDGE} /> : <><path d={d(1)} fill={dark ? LIMB_DARK : LIMB} /><path d={creaseD(widths[1])} {...CREASE} /></>}
        <g ref={(el) => { r[2] = el; }}>
          {outline ? <path d={d(2)} {...FINGER_EDGE} /> : <>
            <path d={d(2)} fill={dark ? LIMB_DARK : LIMB} />
            <path d={creaseD(widths[2])} {...CREASE} />
            {!dark && <ellipse cx={widths[3] / 2 - 1.7} cy={segs[2] - 4} rx="1.5" ry="2.6" fill="#ebb4a0" opacity="0.75" />}
          </>}
        </g>
      </g>
    </g>
  );
  return (
    <g transform={`translate(${spec.x} ${spec.y})`}>
      {chain(outRefs, true)}
      {chain(refs, false)}
    </g>
  );
}

// One hand, drawn two ways: side-on (fingers together, thumb toward the viewer,
// how a relaxed hand really hangs) and front-on (palm/back with four fingers).
// As the forearm rotates, the front view narrows and cross-fades with the
// profile. Fingers shorten to show curling and fan out to show spread.
function Hand({ store }) {
  const pr = store.profile;
  return (
    <g ref={(el) => { store.root = el; }}>
      <g ref={(el) => { pr.g = el; }}>
        {/* every finger bends at all three knuckles, so a curl rolls through it like a real finger */}
        {PROFILE_FINGERS.map((spec, k) => <ProfileFinger key={k} spec={spec} refs={pr.chains[k]} outRefs={pr.outChains[k]} />)}
        {/* thumb sits under the palm block so it emerges from the palm's edge with no gap */}
        <g ref={(el) => { pr.thumb = el; }} transform="translate(-5 9) rotate(28)">
          <path ref={(el) => { pr.thumbPath = el; }} d={capsule(10.5, 8, 17)} fill={LIMB} stroke={HAND_EDGE} strokeWidth="1.1" strokeLinejoin="round" />
          <ellipse ref={(el) => { pr.thumbNail = el; }} cx="0" cy="12.4" rx="2" ry="2.6" fill="#ebb4a0" opacity="0.75" />
        </g>
        {/* the block fades into the wrist at the top and into the finger roots at the knuckles */}
        <path d="M-5.2 -4 C-8.8 6 -9.6 18 -8.3 29.5 Q0.6 31.5 9.3 29.5 C10.6 18 8.8 6 5.2 -4 Z" fill={LIMB} mask="url(#eg-sam-profile-mask)" />
        <path d="M5.2 -4 C8.8 6 10.6 18 9.3 29.5" fill="none" stroke="url(#eg-sam-wrist-edge)" strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
        <path d="M-5.2 -4 C-8.8 6 -9.6 18 -8.3 29.5" fill="none" stroke="url(#eg-sam-wrist-edge)" strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
        <path d="M3 6 Q6 17 5 25" fill="none" stroke={SKIN_SHADE} strokeWidth="2.2" strokeLinecap="round" opacity="0.18" />
      </g>
      <g ref={(el) => { store.front = el; }} opacity="0">
        <g ref={(el) => { store.flip = el; }}>
          {/* fingers and thumb sit under the palm, so their roots are hidden inside the hand */}
          {FINGERS.map((f, i) => (
            <g key={i} ref={(el) => { store.fingers[i].g = el; }} transform={`translate(${f.x} 25.5)`}>
              {[0, 1, 2].map((k) => (
                <path key={`o${k}`} ref={(el) => { store.fingers[i].outs[k] = el; }} d={phal(f.w0, f.w1, f.len / 3, k > 0)} {...(k === 0 ? ROOT_EDGE : FINGER_EDGE)} />
              ))}
              {[0, 1, 2].map((k) => (
                <path key={k} ref={(el) => { store.fingers[i].segs[k] = el; }} d={phal(f.w0, f.w1, f.len / 3, k > 0)} fill={LIMB} />
              ))}
              {[1, 2].map((k) => (
                <path key={`c${k}`} ref={(el) => { store.fingers[i].creases[k] = el; }} d="" {...CREASE} />
              ))}
              <ellipse ref={(el) => { store.fingers[i].nail = el; }} cx="0" cy={f.len - 6} rx="2.2" ry="3" fill="#ebb4a0" opacity="0.8" />
            </g>
          ))}
          {/* the thumb sits beside the index finger (x < 0), like a real hand */}
          <g ref={(el) => { store.thumb.g = el; }} transform="translate(-9.5 10)">
            <path ref={(el) => { store.thumb.path = el; }} d={capsule(10, 7.6, 22)} fill={LIMB} stroke={HAND_EDGE} strokeWidth="1.1" strokeLinejoin="round" />
          </g>
          {/* the palm fades into the wrist at the top and into the finger roots at the knuckles */}
          <path ref={(el) => { store.palm = el; }} d="M-5 -4 C-8.5 1 -13.5 11 -13.8 20 C-14 24.5 -13.4 27 -12.4 28.5 Q0 31.5 12.4 28.5 C13.4 27 14 24.5 13.8 20 C13.5 11 8.5 1 5 -4 Z" fill="url(#eg-sam-hand)" mask="url(#eg-sam-palm-mask)" />
          <path d="M-5 -4 C-8.5 1 -13.5 11 -13.8 20 L-13.9 25" fill="none" stroke="url(#eg-sam-wrist-edge)" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M5 -4 C8.5 1 13.5 11 13.8 20 L13.9 25" fill="none" stroke="url(#eg-sam-wrist-edge)" strokeWidth="1.1" strokeLinecap="round" />
          {/* palm side: soft, shallow creases; back of the hand: knuckles and tendons */}
          <g ref={(el) => { store.palmLines = el; }} fill="none" stroke={HAND_EDGE} strokeLinecap="round" opacity="0">
            <path d="M-10 10 Q-2 15 9 8" strokeWidth="0.9" opacity="0.4" />
            <path d="M-11 17.5 Q-1 21 11 15.5" strokeWidth="0.8" opacity="0.32" />
            <path d="M5 3 Q-2 13 1.5 24" strokeWidth="0.8" opacity="0.28" />
          </g>
          <g ref={(el) => { store.backLines = el; }} fill="none" stroke={SKIN_SHADE} strokeLinecap="round">
            <path d="M-6 4 L-9.5 22 M-1 3 L-3 23 M4.5 4 L3.5 23" strokeWidth="1.5" opacity="0.16" />
            <path d="M-13.4 25.5 Q-10.2 23 -7 25.5 M-6.6 25.5 Q-3.4 23 -0.2 25.5 M0.2 25.5 Q3.4 23 6.6 25.5 M7 25.5 Q10.2 23 13.4 25.5" strokeWidth="1" opacity="0.35" />
          </g>
        </g>
      </g>
    </g>
  );
}

// Soft shadow the arm casts on the body; it darkens as the arm comes forward.
function ArmShadow({ store }) {
  const sh = store.shadow;
  return (
    <g ref={(el) => { sh.root = el; }} opacity="0">
      <g ref={(el) => { sh.up = el; }}>
        <g ref={(el) => { sh.fore = el; }} transform="translate(0 88)">
          <g ref={(el) => { sh.foreScale = el; }}><rect x="-9" y="-4" width="18" height="84" rx="9" /></g>
          <g ref={(el) => { sh.pos = el; }} transform="translate(0 76)"><ellipse cx="0" cy="22" rx="15" ry="22" /></g>
        </g>
      </g>
    </g>
  );
}

// The elbow bends like flesh, not like two sticks on a pin: the upper arm and
// forearm are clipped where the bend's bisector splits them, and a rounded cap
// fills the outside of the joint.
function Arm({ upRef, foreRef, store, uid }) {
  return (
    <g ref={upRef}>
      <clipPath id={`${uid}-u`}><rect ref={(el) => { store.clipU = el; }} x="-300" y="-600" width="600" height="600.6" transform="translate(0 88)" /></clipPath>
      <g clipPath={`url(#${uid}-u)`}>
        <path d="M-12 0 Q-13.5 44 -9.5 90 L9.5 90 Q13.5 44 12 0 Z" fill={ARM} />
        <circle cx="0" cy="88" r="9.6" fill={ARM} />
      </g>
      {/* contact shadow under the sleeve hem */}
      <path d="M-13 48 Q0 56 13 48 L12.5 68 Q0 74 -12.5 68 Z" fill="url(#eg-sam-occl)" />
      {/* short blouse sleeve */}
      <circle r="21" fill="#fff" stroke="#dfe3f5" strokeWidth="1.4" />
      <path d="M-21 -4 Q-25 28 -20 54 Q0 60 20 54 Q25 28 21 -4 Z" fill="#fff" stroke="#dfe3f5" strokeWidth="1.4" />
      <path d="M-20 50 Q0 57 20 50" fill="none" stroke="#c9d0ee" strokeWidth="2" />
      <g ref={foreRef} transform="translate(0 88)">
        <clipPath id={`${uid}-f`}><rect ref={(el) => { store.clipF = el; }} x="-300" y="-0.6" width="600" height="600.6" /></clipPath>
        <g clipPath={`url(#${uid}-f)`}>
          {/* a forearm reaching toward the viewer looks shorter (foreshortening) */}
          <g ref={(el) => { store.fore = el; }}>
            <path d="M-9.5 -2 Q-11 28 -6.4 78 L6.4 78 Q11 28 9.5 -2 Z" fill={ARM} />
          </g>
          <circle cx="0" cy="0" r="9.6" fill={ARM} />
        </g>
        {/* inner-elbow crease along the fold, deepens as the arm bends */}
        <path ref={(el) => { store.crease = el; }} d="M0 0" fill="none" stroke={SKIN_DEEP} strokeWidth="1.3" strokeLinecap="round" opacity="0" />
        <g ref={(el) => { store.pos = el; }} transform="translate(0 76)">
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
  const uidRef = useRef(null);
  if (uidRef.current === null) {
    samCount += 1;
    uidRef.current = `eg-sam-${samCount}`;
  }
  const uid = uidRef.current;
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
    const makeArm = () => ({
      s: makeSpring(REST.s), e: makeSpring(REST.e), w: makeSpring(REST.w),
      f: 1, p: REST.p, kick: 0, ts: REST.s, te: REST.e, tf: 1, tw: REST.w, tp: REST.p,
      prevTe: REST.e, prevTw: REST.w, aimedAt: -9, hand: 'relaxed', active: false,
      shape: { c: [...HANDS.relaxed.c], th: HANDS.relaxed.th, sp: HANDS.relaxed.sp, cv: [0, 0, 0, 0], thv: 0, spv: 0 }
    });
    const rArm = makeArm();
    const lArm = makeArm();
    const aim = (a, pose, amount, jitter, t) => {
      a.prevTe = a.te;
      a.prevTw = a.tw;
      a.aimedAt = t;
      a.ts = lerp(REST.s, pose.s, amount) + rand(-4, 4) * jitter;
      a.te = lerp(REST.e, pose.e, amount) + rand(-7, 7) * jitter;
      a.tf = lerp(1, pose.f, amount);
      a.tw = pose.w + rand(-5, 5) * jitter;
      // A forearm folded across the body keeps the palm toward the chest: never
      // show the palm there (only out to the side, where it can open to the viewer).
      a.tp = a.te > 60 ? Math.max(pose.p, 0.15) : pose.p;
      a.hand = pose.hand;
      a.active = pose.active;
    };
    let gesture = 'rest';
    let gestureUntil = 0;
    let lastSpokeAt = -99;
    let wasSpeaking = false;
    let nextBlink = 1.5;
    let blinkAt = -1;
    let level = 0;
    let bright = 0.4;
    let baseline = 0;
    let energy = 0.3;
    let beat = 0;
    let lastBeatAt = -1;
    let lastBeatAmp = 0;
    let quietSince = 0;
    let lean = 0;
    let gazeTX = 0;
    let gazeTY = 0;
    let nextSaccade = 1;
    let lookX = 0;
    let lookY = 0;
    let raf = 0;
    const t0 = performance.now();
    let last = t0;

    const setT = (el, v) => { if (el) el.setAttribute('transform', v); };
    const ref = (r) => r.current;

    // turn: 1 back of hand, 0 side-on, -1 palm (right-arm frame); side: 1 right, -1 left.
    function applyHand(store, h, wristDeg, turn, side) {
      setT(store.root, `rotate(${wristDeg.toFixed(2)})`);
      const a = Math.abs(turn);
      const frontA = clamp((a - 0.3) / 0.35, 0, 1);
      // One view is always fully opaque, so the body never shows through mid-turn.
      const profileA = frontA < 0.5 ? 1 : 1 - (frontA - 0.5) * 2;
      const frontTop = Math.min(1, frontA * 2);
      const pr = store.profile;
      if (pr.g) {
        pr.g.setAttribute('opacity', profileA.toFixed(3));
        pr.g.setAttribute('transform', `scale(${side} 1)`);
      }
      if (store.front) store.front.setAttribute('opacity', frontTop.toFixed(3));
      setT(store.flip, `scale(${(side * (turn < 0 ? -1 : 1) * Math.max(a, 0.35)).toFixed(3)} 1)`);
      if (profileA > 0) {
        PROFILE_FINGERS.forEach((spec, k) => {
          const c = spec.dark ? (h.c[1] + h.c[2] + h.c[3]) / 3 : h.c[0];
          [pr.chains[k], pr.outChains[k]].forEach((refs) => {
            setT(refs[0], `rotate(${(2 + 32 * c).toFixed(2)})`);
            setT(refs[1], `translate(0 ${spec.segs[0]}) rotate(${(52 * c).toFixed(2)})`);
            setT(refs[2], `translate(0 ${spec.segs[1]}) rotate(${(32 * c).toFixed(2)})`);
          });
        });
        const tl = 20 * (1 - 0.25 * h.th);
        setT(pr.thumb, `translate(-5 9) rotate(${(14 + 26 * h.th).toFixed(2)})`);
        if (pr.thumbPath) pr.thumbPath.setAttribute('d', capsule(10.5, 8, tl));
        if (pr.thumbNail) pr.thumbNail.setAttribute('cy', (tl - 4.6).toFixed(2));
      }
      if (frontTop > 0) {
        // Palms are lighter than the back of the hand; the turn shows which side faces us.
        const palmSide = turn < 0;
        if (store.palm) store.palm.setAttribute('fill', palmSide ? 'url(#eg-sam-palm)' : 'url(#eg-sam-hand)');
        const fingerFill = palmSide ? 'url(#eg-sam-limb-palm)' : LIMB;
        if (store.palmLines) store.palmLines.setAttribute('opacity', palmSide ? '1' : '0');
        if (store.backLines) store.backLines.setAttribute('opacity', palmSide ? '0' : '1');
        FINGERS.forEach((f, i) => {
          const fs = store.fingers[i];
          const c = h.c[i];
          const spread = -(i - 1.5) * 13 * h.sp;
          setT(fs.g, `translate(${f.x} 25.5) rotate(${spread.toFixed(2)})`);
          // Three bones; curling turns each toward/away from the viewer, so its drawn
          // length is len*cos(angle). Past 90 deg it folds back over the palm (palm
          // view) or disappears behind the back of the hand.
          const segLen = [f.len * 0.45, f.len * 0.3, f.len * 0.25];
          const widths = [f.w0, lerp(f.w0, f.w1, 0.45) + 0.3, f.w1 + 0.3, f.w1];
          const mcp = 65 * c;
          const pip = mcp + 90 * c;
          const angles = [mcp, pip, pip + 55 * c];
          let y = 0;
          let hidden = false;
          let nailCos = 0;
          for (let k = 0; k < 3; k += 1) {
            const els = [fs.segs[k], fs.outs[k], fs.creases[k]];
            const co = Math.cos((angles[k] * Math.PI) / 180);
            if (!palmSide && co < 0.05) hidden = true;
            if (!fs.segs[k]) continue;
            if (hidden) { els.forEach((el) => { if (el) el.style.display = 'none'; }); continue; }
            const dy = segLen[k] * co;
            const bone = phal(widths[k], widths[k + 1], Math.abs(dy), k > 0);
            const tf = `translate(0 ${y.toFixed(2)}) scale(1 ${dy < 0 ? -1 : 1})`;
            els.forEach((el, n) => {
              if (!el) return;
              el.style.display = '';
              el.setAttribute('d', n === 2 ? creaseD(widths[k]) : bone);
              if (n === 0) el.setAttribute('fill', fingerFill);
              el.setAttribute('transform', tf);
            });
            y += dy;
            if (k === 2) nailCos = co;
          }
          if (fs.nail) {
            const show = !palmSide && !hidden && nailCos > 0.35;
            fs.nail.style.opacity = show ? 0.8 : 0;
            if (show) {
              fs.nail.setAttribute('cy', (y - 5 * nailCos).toFixed(2));
              fs.nail.setAttribute('ry', (3 * nailCos).toFixed(2));
            }
          }
        });
        const tl = 19 * (1 - 0.5 * h.th);
        setT(store.thumb.g, `translate(-9.5 10) rotate(${(22 + 42 * (1 - h.th)).toFixed(2)})`);
        if (store.thumb.path) store.thumb.path.setAttribute('d', capsule(10, 7.6, tl + 3));
      }
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
      let procedural = false;
      if (mode === 'speaking') {
        const m = levelRef.current ? levelRef.current() : null;
        if (m === null || m === undefined) {
          procedural = true;
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
      // Fast attack / quick release so the lips track each syllable of the voice.
      level += (raw - level) * Math.min(1, dt * (raw > level ? 38 : 20));
      bright += (rawBright - bright) * Math.min(1, dt * 14);
      baseline += (level - baseline) * Math.min(1, dt * 3);
      if (level > 0.04) quietSince = t;
      const quiet = t - quietSince;
      const holding = mode === 'speaking' && quiet > 0.28; // comma-length pause: keep the pose, stop waving
      const pausing = mode === 'speaking' && quiet > 0.9; // sentence break: hands come down
      if (mode === 'speaking' && !holding) energy += (level - energy) * Math.min(1, dt * 0.8);
      let beatNow = false;
      if (speaking && !holding && level > baseline * 1.5 + 0.09 && t - lastBeatAt > 0.3) {
        beat = 1;
        beatNow = true;
        lastBeatAt = t;
      }
      const beatAmp = clamp(level - baseline, 0.15, 1);
      beat *= Math.exp(-dt * 7);

      // ── choose a gesture: a new one at phrase boundaries, sized to the voice's energy ──
      const pickGesture = () => {
        // People rest their hands between phrases a fair amount; constant gesturing looks fake.
        if (gesture !== 'rest' && Math.random() < (energy > 0.28 ? 0.15 : 0.3)) return 'rest';
        const pool = energy > 0.28 ? BIG_GESTURES : SMALL_GESTURES;
        let next = gesture;
        while (next === gesture) next = pool[Math.floor(Math.random() * pool.length)];
        return next;
      };
      let want;
      if (celebrateRef.current) {
        want = 'celebrate';
      } else if (speaking && !pausing) {
        want = gesture;
        if (!wasSpeaking) {
          // Wave hello on the first words after a quiet spell, otherwise just start explaining.
          want = sinceSpoke > 8 ? 'wave' : pickGesture();
          gestureUntil = t + (want === 'wave' ? 2.0 : rand(1.6, 3.2));
        } else if (t > gestureUntil && (holding || t > gestureUntil + 1.5)) {
          want = pickGesture();
          gestureUntil = t + rand(1.6, 3.4);
        } else if (gesture === 'listen' || gesture === 'think') {
          want = pickGesture();
        }
      } else if (pausing) {
        want = 'rest';
      } else {
        want = mode === 'listening' ? 'listen' : mode === 'thinking' ? 'think' : 'rest';
      }
      if (want !== gesture || (!wasSpeaking && speaking && !pausing)) {
        gesture = want;
        const pose = POSES[want] || POSES.rest;
        const scripted = SCRIPTED.has(want);
        // Bigger, more extended gestures when the voice is energetic; every repeat slightly different.
        const amount = scripted ? 1 : clamp(0.72 + energy * 0.7 + rand(-0.08, 0.08), 0.7, 1.05);
        const jitter = scripted ? 0.3 : 1;
        aim(rArm, pose.r, amount, jitter, t);
        aim(lArm, pose.l, amount, jitter, t);
      }
      wasSpeaking = speaking && !pausing;

      // Stressed syllables: a short, smooth downward stroke of the gesturing
      // hand(s), led by the forearm with the hand flicking just after.
      if (beatNow) lastBeatAmp = beatAmp;
      const bx = (t - lastBeatAt) / 0.12;
      const pulse = bx < 0 || bx > 8 ? 0 : bx * Math.exp(1 - bx);
      [rArm, lArm].forEach((a) => {
        const total = a.s.x + a.e.x;
        const want = (!a.active || Math.abs(total) < 25 || gesture === 'wave') ? 0 : -Math.sign(total) * (6 + 9 * lastBeatAmp) * pulse;
        a.kick += (want - a.kick) * Math.min(1, dt * 30);
      });

      // ── arms: shoulder, elbow and wrist on separate damped springs ──
      const live = speaking && !pausing;
      const stepArm = (a, seed) => {
        const drift = reduce ? 0 : a.active ? 1 : 0.4;
        const breath = reduce ? 0 : Math.sin(t * 1.6);
        // Proximal-to-distal timing: the shoulder starts the move, the elbow and
        // wrist join a moment later, like a real arm (not a puppet's single pivot).
        const since = t - a.aimedAt;
        let eTarget = (since < 0.07 ? a.prevTe : a.te) + noise(t * 0.9, seed + 5) * 3 * drift;
        let wTarget = (since < 0.13 ? a.prevTw : a.tw) + noise(t * 1.3, seed + 9) * 3 * drift;
        if (gesture === 'wave' && a === rArm) {
          eTarget += Math.sin(t * Math.PI * 2 * 1.9) * 8;
          wTarget += Math.sin(t * Math.PI * 2 * 1.9 - 0.9) * 16;
        } else if (gesture === 'celebrate') {
          eTarget += Math.sin(t * Math.PI * 2 * 2.2 + seed) * 10;
        }
        // Near-critically damped: arrives smoothly (bell-shaped speed) without the
        // rubbery bounce that makes arms look like a marionette.
        a.s.step(a.ts + noise(t * 0.8, seed) * 1.6 * drift - breath * 0.7, dt, 1.25, 1.0);
        a.e.step(eTarget, dt, 1.45, 0.95);
        // The hand trails the forearm slightly (follow-through), then catches up.
        const drag = clamp(-a.e.v * 0.05, -14, 14);
        a.w.step(wTarget + drag, dt, 1.9, 0.85);
        a.f += (a.tf - a.f) * Math.min(1, dt * 3.2);
        // The forearm rotates to turn the palm, so it eases across side-on.
        a.p += (a.tp - a.p) * Math.min(1, dt * 3.6);

        // Hand shape: fingers settle one after another (index first), loosely alive while talking.
        const wantHand = HANDS[a.hand] || HANDS.relaxed;
        const h = a.shape;
        // Bending the wrist back curls the fingers a little and flexing it opens
        // them (the tendons are shared), so the fingers react to the hand's motion.
        const tendon = clamp(-a.w.x * 0.003, -0.08, 0.08);
        for (let i = 0; i < 4; i += 1) {
          const wobble = live && a.active ? noise(t * 1.8, seed + i * 1.3) * 0.07 : 0;
          const target = clamp(wantHand.c[i] + wobble + tendon - (a.active ? beat * 0.12 : 0), 0, 1);
          [h.c[i], h.cv[i]] = fingerSpring(h.c[i], h.cv[i], target, dt, 2.6 - i * 0.3);
        }
        [h.th, h.thv] = fingerSpring(h.th, h.thv, wantHand.th, dt, 2.3);
        [h.sp, h.spv] = fingerSpring(h.sp, h.spv, wantHand.sp + (a.active ? beat * 0.25 : 0), dt, 2.4);
      };
      stepArm(rArm, 0);
      stepArm(lArm, 3.7);

      const placeArm = (a, side, upEl, foreEl, store, px) => {
        // Perspective: reaching toward the viewer brings the shoulder slightly
        // forward/in, shortens the forearm, and makes the (closer) hand bigger.
        const reach = clamp(1 - a.f, 0, 1);
        const up = `translate(${(px - side * reach * 7).toFixed(2)} ${(372 + reach * 3).toFixed(2)}) rotate(${(side * (a.s.x + a.kick * 0.15)).toFixed(2)})`;
        const ang = side * (a.e.x + a.kick);
        const half = ang / 2;
        const fore = `translate(0 88) rotate(${ang.toFixed(2)})`;
        const foreScale = `scale(1 ${a.f.toFixed(3)})`;
        setT(store.clipU, `translate(0 88) rotate(${half.toFixed(2)})`);
        setT(store.clipF, `rotate(${(-half).toFixed(2)})`);
        const hs = 1 + reach * 0.42;
        const pos = `translate(0 ${(76 * a.f).toFixed(2)}) scale(${hs.toFixed(3)})`;
        setT(upEl, up);
        setT(foreEl, fore);
        setT(store.fore, foreScale);
        setT(store.pos, pos);
        if (store.crease) {
          const bend = clamp((Math.abs(ang) - 35) / 70, 0, 0.55);
          store.crease.setAttribute('opacity', bend.toFixed(3));
          if (bend > 0) {
            const m = -Math.sign(ang) * Math.min(9.6 / Math.cos((Math.abs(half) * Math.PI) / 180), 26);
            store.crease.setAttribute('d', `M${m.toFixed(2)} 0 Q${(m * 0.72).toFixed(2)} 1.4 ${(m * 0.42).toFixed(2)} 0.4`);
            setT(store.crease, `rotate(${(-half).toFixed(2)})`);
          }
        }
        const sh = store.shadow;
        if (sh.root) {
          sh.root.setAttribute('opacity', clamp(0.22 + reach * 1.1, 0, 0.7).toFixed(3));
          setT(sh.up, up);
          setT(sh.fore, fore);
          setT(sh.foreScale, foreScale);
          setT(sh.pos, pos);
        }
        applyHand(store, a.shape, side * (a.w.x + a.kick * 0.5), a.p, side);
      };
      placeArm(rArm, 1, ref(rUp), ref(rFore), rStore, 278);
      placeArm(lArm, -1, ref(lUp), ref(lFore), lStore, 122);

      // ── mouth ──
      // loudness opens the jaw, brightness widens ("ee") or rounds ("oo") the lips
      const open = reduce ? 0 : Math.pow(clamp(level * 1.9, 0, 1), 0.9);
      const mx = 200; const my = 252;
      const w = lerp(15, 27, bright) - open * 2 + (procedural ? Math.sin(t * 9) * 0.8 : 0);
      const h2 = (3 + open * 31) * lerp(1.15, 0.7, bright);
      const cy = my - (bright - 0.4) * 4 * open;
      const d = `M${mx - w} ${cy} Q${mx - w * 0.4} ${my - 4} ${mx} ${my - 2.5} Q${mx + w * 0.4} ${my - 4} ${mx + w} ${cy} Q${mx + w * 0.85} ${my + h2} ${mx} ${my + h2 * 1.12} Q${mx - w * 0.85} ${my + h2} ${mx - w} ${cy} Z`;
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
      if (t > nextBlink && blinkAt < 0) { blinkAt = t; nextBlink = t + (Math.random() < 0.2 ? 0.3 : rand(2.2, 5.5)); } // sometimes a quick double-blink
      let blink = 1;
      if (blinkAt >= 0) {
        const p = (t - blinkAt) / 0.16;
        if (p >= 1) blinkAt = -1; else blink = 1 - Math.sin(Math.PI * p) * 0.93;
      }
      setT(eyeL.current, `translate(165 198) scale(1 ${blink.toFixed(3)}) translate(-165 -198)`);
      setT(eyeR.current, `translate(235 198) scale(1 ${blink.toFixed(3)}) translate(-235 -198)`);

      // ── gaze: quick saccades near the viewer, glancing up while thinking ──
      if (t > nextSaccade) {
        gazeTX = rand(-3, 3);
        gazeTY = rand(-1.6, 1.6);
        if (speaking && Math.random() < 0.2) gazeTY = -3;
        nextSaccade = t + rand(0.7, 2.6);
      }
      const gx = mode === 'thinking' ? -4 : gazeTX;
      const gy = mode === 'thinking' ? -5 : gazeTY;
      const gk = Math.min(1, dt * 16);
      lookX += (gx - lookX) * gk;
      lookY += (gy - lookY) * gk;
      setT(irisL.current, `translate(${lookX.toFixed(2)} ${lookY.toFixed(2)})`);
      setT(irisR.current, `translate(${lookX.toFixed(2)} ${lookY.toFixed(2)})`);
      const browLift = mode === 'thinking' ? 6 : speaking ? level * 4 + beat * 3.5 : mode === 'listening' ? 3 : 0;
      setT(browL.current, `translate(0 ${(-browLift).toFixed(2)})`);
      setT(browR.current, `translate(0 ${(-browLift - (mode === 'thinking' ? 4 : 0)).toFixed(2)})`);

      // ── head & body: lean toward the gesturing hand, nod on beats, breathe ──
      lean += (((rArm.active ? 1.4 : 0) - (lArm.active ? 1.4 : 0)) - lean) * Math.min(1, dt * 2.5);
      const tilt = mode === 'listening' ? 5 : mode === 'thinking' ? -6 : (reduce ? 0 : Math.sin(t * 0.9) * 1.1 + (speaking && !holding ? Math.sin(t * 2.2) * 1.4 + beat * 2.5 : 0) + (speaking ? lean : 0));
      const bob = speaking ? -level * 2.5 + beat * 2.2 : 0;
      const shiftX = !reduce && speaking ? Math.sin(t * 1.1) * 2 + lean : 0;
      setT(headRef.current, `translate(0 ${bob.toFixed(2)}) rotate(${tilt.toFixed(2)} 200 338)`);
      setT(bodyRef.current, `translate(${shiftX.toFixed(2)} ${(reduce ? 0 : Math.sin(t * 1.7) * 2).toFixed(2)})`);

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
        <linearGradient id="eg-sam-limb" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={SKIN_DEEP} />
          <stop offset="14%" stopColor={SKIN_SHADE} />
          <stop offset="38%" stopColor={SKIN_LIGHT} />
          <stop offset="66%" stopColor={SKIN} />
          <stop offset="100%" stopColor={SKIN_DEEP} />
        </linearGradient>
        <linearGradient id="eg-sam-arm" gradientUnits="userSpaceOnUse" x1="-10" y1="0" x2="10" y2="0">
          <stop offset="0%" stopColor={SKIN_DEEP} />
          <stop offset="14%" stopColor={SKIN_SHADE} />
          <stop offset="38%" stopColor={SKIN_LIGHT} />
          <stop offset="66%" stopColor={SKIN} />
          <stop offset="100%" stopColor={SKIN_DEEP} />
        </linearGradient>
        <linearGradient id="eg-sam-limb-dk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8a5634" />
          <stop offset="14%" stopColor={SKIN_DEEP} />
          <stop offset="38%" stopColor={SKIN_SHADE} />
          <stop offset="66%" stopColor="#c08660" />
          <stop offset="100%" stopColor="#8a5634" />
        </linearGradient>
        <linearGradient id="eg-sam-limb-palm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={SKIN_DEEP} />
          <stop offset="14%" stopColor={SKIN_SHADE} />
          <stop offset="38%" stopColor={PALM} />
          <stop offset="66%" stopColor={SKIN_LIGHT} />
          <stop offset="100%" stopColor={SKIN_SHADE} />
        </linearGradient>
        {/* finger roots and the hand's sides fade in, so the hand reads as one piece of skin */}
        <linearGradient id="eg-sam-root-edge" gradientUnits="userSpaceOnUse" x1="0" y1="2.5" x2="0" y2="6.5">
          <stop offset="0%" stopColor={HAND_EDGE} stopOpacity="0" />
          <stop offset="100%" stopColor={HAND_EDGE} />
        </linearGradient>
        <linearGradient id="eg-sam-wrist-edge" gradientUnits="userSpaceOnUse" x1="0" y1="-4" x2="0" y2="7">
          <stop offset="0%" stopColor={HAND_EDGE} stopOpacity="0" />
          <stop offset="100%" stopColor={HAND_EDGE} />
        </linearGradient>
        <linearGradient id="eg-sam-palm-fade" gradientUnits="userSpaceOnUse" x1="0" y1="-4" x2="0" y2="30">
          <stop offset="0%" stopColor="#000" />
          <stop offset={`${(3.5 / 34) * 100}%`} stopColor="#fff" />
          <stop offset={`${(31 / 34) * 100}%`} stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </linearGradient>
        <mask id="eg-sam-palm-mask" maskUnits="userSpaceOnUse" x="-20" y="-6" width="40" height="42">
          <rect x="-20" y="-6" width="40" height="42" fill="url(#eg-sam-palm-fade)" />
        </mask>
        <linearGradient id="eg-sam-profile-fade" gradientUnits="userSpaceOnUse" x1="0" y1="-4" x2="0" y2="31">
          <stop offset="0%" stopColor="#000" />
          <stop offset={`${(3.5 / 35) * 100}%`} stopColor="#fff" />
          <stop offset={`${(32 / 35) * 100}%`} stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </linearGradient>
        <mask id="eg-sam-profile-mask" maskUnits="userSpaceOnUse" x="-20" y="-6" width="40" height="42">
          <rect x="-20" y="-6" width="40" height="42" fill="url(#eg-sam-profile-fade)" />
        </mask>
        <radialGradient id="eg-sam-hand" cx="40%" cy="35%" r="80%">
          <stop offset="0%" stopColor={SKIN_LIGHT} />
          <stop offset="60%" stopColor={SKIN} />
          <stop offset="100%" stopColor={SKIN_SHADE} />
        </radialGradient>
        <radialGradient id="eg-sam-palm" cx="50%" cy="55%" r="75%">
          <stop offset="0%" stopColor={PALM} />
          <stop offset="72%" stopColor={SKIN_LIGHT} />
          <stop offset="100%" stopColor={SKIN_SHADE} />
        </radialGradient>
        <linearGradient id="eg-sam-occl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SKIN_DEEP} stopOpacity="0.55" />
          <stop offset="100%" stopColor={SKIN_DEEP} stopOpacity="0" />
        </linearGradient>
        <filter id="eg-sam-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        <clipPath id="eg-sam-torso">
          <path d="M136 480 Q118 446 106 410 Q106 372 150 360 L250 360 Q294 372 294 410 Q282 446 264 480 Z" />
          <path d="M124 558 Q130 482 124 410 Q126 380 152 368 L186 360 L200 412 L214 360 L248 368 Q274 380 276 410 Q270 482 276 558 Z" />
          <path d="M116 548 L284 548 L306 668 Q200 684 94 668 Z" />
        </clipPath>
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

          {/* arms (shadows on the body first, then the arms themselves) */}
          <g clipPath="url(#eg-sam-torso)">
            <g transform="translate(7 11)" fill="#050a2c" filter="url(#eg-sam-soft)">
              <ArmShadow store={lStore} />
              <ArmShadow store={rStore} />
            </g>
          </g>
          <Arm upRef={lUp} foreRef={lFore} store={lStore} uid={`${uid}-l`} />
          <Arm upRef={rUp} foreRef={rFore} store={rStore} uid={`${uid}-r`} />

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
            <ellipse cx="146" cy="234" rx="15" ry="9" fill="#e0766e" opacity="0.38" />
            <ellipse cx="254" cy="234" rx="15" ry="9" fill="#e0766e" opacity="0.38" />

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
            <path d="M196 226 Q200 232 204 226" fill="none" stroke="#a8693f" strokeWidth="2.6" strokeLinecap="round" />

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

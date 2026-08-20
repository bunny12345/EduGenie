import React from 'react';

/**
 * Full-page decorative SVG background for each subject.
 * Inspired by themed illustration cards with subject-specific motifs.
 * Renders behind content with position:absolute, pointer-events:none.
 */

/* ── colour palettes per subject ───────────────────────────────────── */
const PALETTES = {
  science:     { bg: '#eefbf3', fill: '#c6edd8', stroke: '#8dd5aa', accent: '#10b981' },
  biology:     { bg: '#eefbf3', fill: '#c6edd8', stroke: '#8dd5aa', accent: '#22c55e' },
  english:     { bg: '#fdf2f6', fill: '#f5d0df', stroke: '#e8a6c0', accent: '#d63384' },
  hindi:       { bg: '#fef6ee', fill: '#f5ddc4', stroke: '#e8c49e', accent: '#d97706' },
  telugu:      { bg: '#eefbf3', fill: '#c6edd8', stroke: '#8dd5aa', accent: '#0d9e6b' },
  math:        { bg: '#fefaed', fill: '#f5e6b8', stroke: '#d4be7a', accent: '#b8860b' },
  physics:     { bg: '#eef0fb', fill: '#c8cef0', stroke: '#99a4dd', accent: '#5b6abf' },
  chemistry:   { bg: '#eef5fb', fill: '#c2ddf0', stroke: '#8ec0dd', accent: '#3b82c4' },
  social:      { bg: '#f0edfb', fill: '#d1c8f0', stroke: '#a99ddd', accent: '#7c5be6' },
  geography:   { bg: '#f0edfb', fill: '#d1c8f0', stroke: '#a99ddd', accent: '#7c5be6' },
  computer:    { bg: '#eef0fb', fill: '#c8cef0', stroke: '#99a4dd', accent: '#3b82f6' },
  default:     { bg: '#f0eeff', fill: '#d8d2f5', stroke: '#b0a6e0', accent: '#5b47ff' },
};

function getPalette(subject) {
  const s = (subject || '').toLowerCase();
  if (s.includes('math'))                                                   return PALETTES.math;
  if (s.includes('physics'))                                                return PALETTES.physics;
  if (s.includes('chemistry'))                                              return PALETTES.chemistry;
  if (s.includes('science'))                                                return PALETTES.science;
  if (s.includes('bio'))                                                    return PALETTES.biology;
  if (s.includes('english') || s.includes('language') || s.includes('literature')) return PALETTES.english;
  if (s.includes('hindi') || s.includes('sanskrit') || s.includes('urdu')) return PALETTES.hindi;
  if (s.includes('telugu') || s.includes('tamil') || s.includes('kannada') || s.includes('malayalam')) return PALETTES.telugu;
  if (s.includes('history') || s.includes('social'))                       return PALETTES.social;
  if (s.includes('geo'))                                                    return PALETTES.geography;
  if (s.includes('computer') || s.includes('coding'))                      return PALETTES.computer;
  return PALETTES.default;
}

/* Each returns an SVG with viewBox="0 0 1400 760" rendered at full size */
const wrap = (children, palette) => (
  <svg
    viewBox="0 0 1400 760"
    xmlns="http://www.w3.org/2000/svg"
    style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 0,
    }}
    preserveAspectRatio="xMidYMid slice"
  >
    <rect width="1400" height="760" fill={palette.bg} />
    {children}
  </svg>
);

/* ── Science / Biology ─────────────────────────────────────────────── */
function ScienceBg({ palette: p }) {
  return wrap(
    <>
      {/* big circle top-left */}
      <circle cx="140" cy="120" r="110" fill={p.fill} opacity="0.5" />
      {/* cell/organism shape */}
      <ellipse cx="280" cy="470" rx="70" ry="80" fill={p.fill} opacity="0.45" />
      <circle cx="260" cy="450" r="8" fill={p.stroke} opacity="0.4" />
      <circle cx="300" cy="480" r="5" fill={p.stroke} opacity="0.35" />
      {/* lens/leaf shape top-right */}
      <g transform="translate(980,190)" opacity="0.3" stroke={p.stroke} fill="none" strokeWidth="2">
        <ellipse rx="50" ry="70" transform="rotate(30)" />
        <ellipse rx="50" ry="70" transform="rotate(-30)" />
        <line x1="-40" y1="0" x2="40" y2="0" />
        <line x1="-35" y1="-15" x2="35" y2="-15" />
        <line x1="-35" y1="15" x2="35" y2="15" />
      </g>
      {/* rainbow arc bottom-center */}
      <g transform="translate(740,580)" opacity="0.2" stroke={p.stroke} fill="none" strokeWidth="2.5">
        <path d="M-80,0 A80,80 0 0,1 80,0" />
        <path d="M-60,0 A60,60 0 0,1 60,0" />
      </g>
      {/* big circle bottom-right */}
      <circle cx="1280" cy="620" r="130" fill={p.fill} opacity="0.35" />
    </>,
    p
  );
}

/* ── English ───────────────────────────────────────────────────────── */
function EnglishBg({ palette: p }) {
  return wrap(
    <>
      {/* big circle top-left */}
      <circle cx="140" cy="110" r="110" fill={p.fill} opacity="0.45" />
      {/* open book top-right */}
      <g transform="translate(960,200)" opacity="0.35" fill={p.fill} stroke="none">
        <path d="M-80,0 Q-80,-50 0,-50 Q80,-50 80,0 L80,60 Q80,10 0,10 Q-80,10 -80,60 Z" />
      </g>
      {/* A B C letters */}
      <text x="110" y="480" fontSize="60" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.25" fontWeight="700">A</text>
      <text x="210" y="540" fontSize="50" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.2" fontWeight="700">B</text>
      <text x="300" y="470" fontSize="55" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.22" fontWeight="700">C</text>
      {/* quote */}
      <text x="400" y="530" fontSize="24" fontFamily="Georgia,serif" fontStyle="italic" fill={p.stroke} opacity="0.2">"Once upon a time..."</text>
      {/* arrow swoosh */}
      <g opacity="0.18" stroke={p.stroke} fill="none" strokeWidth="1.5">
        <path d="M900,540 Q960,400 1020,390" />
        <polygon points="1020,385 1035,390 1020,400" fill={p.stroke} />
      </g>
      {/* big circle bottom-right */}
      <circle cx="1280" cy="620" r="130" fill={p.fill} opacity="0.35" />
    </>,
    p
  );
}

/* ── Hindi ─────────────────────────────────────────────────────────── */
function HindiBg({ palette: p }) {
  return wrap(
    <>
      <circle cx="150" cy="120" r="120" fill={p.fill} opacity="0.4" />
      {/* open book outline */}
      <g transform="translate(920,210)" opacity="0.2" stroke={p.stroke} fill="none" strokeWidth="2.5">
        <path d="M-70,40 L-70,-30 Q0,-50 0,-30 Q0,-50 70,-30 L70,40 Q0,20 0,40 Q0,20 -70,40 Z" />
      </g>
      {/* Devanagari characters */}
      <text x="100" y="470" fontSize="65" fontFamily="'Noto Sans Devanagari',sans-serif" fill={p.stroke} opacity="0.22" fontWeight="700">अ</text>
      <text x="230" y="540" fontSize="55" fontFamily="'Noto Sans Devanagari',sans-serif" fill={p.stroke} opacity="0.18" fontWeight="700">आ</text>
      <text x="310" y="460" fontSize="55" fontFamily="'Noto Sans Devanagari',sans-serif" fill={p.stroke} opacity="0.2" fontWeight="700">क</text>
      <text x="420" y="530" fontSize="50" fontFamily="'Noto Sans Devanagari',sans-serif" fill={p.stroke} opacity="0.18" fontWeight="700">म</text>
      {/* decorative dots */}
      <circle cx="1100" cy="440" r="25" fill={p.fill} opacity="0.35" />
      <circle cx="1130" cy="480" r="12" fill={p.fill} opacity="0.3" />
      <circle cx="1080" cy="510" r="15" fill={p.fill} opacity="0.25" />
      <circle cx="1280" cy="600" r="130" fill={p.fill} opacity="0.35" />
    </>,
    p
  );
}

/* ── Telugu / Regional language ────────────────────────────────────── */
function TeluguBg({ palette: p }) {
  return wrap(
    <>
      <circle cx="150" cy="120" r="120" fill={p.fill} opacity="0.4" />
      {/* leaf / sprout motif top-right */}
      <g transform="translate(1100,160)" opacity="0.3" fill={p.fill} stroke={p.stroke} strokeWidth="1.5">
        <ellipse cx="0" cy="-20" rx="25" ry="40" transform="rotate(-25)" />
        <ellipse cx="20" cy="-10" rx="20" ry="35" transform="rotate(15)" />
      </g>
      {/* Telugu-like script characters */}
      <text x="100" y="470" fontSize="60" fontFamily="'Noto Sans Telugu',sans-serif" fill={p.stroke} opacity="0.2" fontWeight="700">అ</text>
      <text x="230" y="540" fontSize="50" fontFamily="'Noto Sans Telugu',sans-serif" fill={p.stroke} opacity="0.17" fontWeight="700">ఆ</text>
      <text x="320" y="460" fontSize="50" fontFamily="'Noto Sans Telugu',sans-serif" fill={p.stroke} opacity="0.19" fontWeight="700">క</text>
      <text x="420" y="530" fontSize="48" fontFamily="'Noto Sans Telugu',sans-serif" fill={p.stroke} opacity="0.16" fontWeight="700">మ</text>
      {/* chopstick / pen lines */}
      <g transform="translate(700,560)" opacity="0.15" stroke={p.stroke} fill="none" strokeWidth="3">
        <line x1="0" y1="0" x2="230" y2="-60" />
        <line x1="5" y1="10" x2="235" y2="-50" />
      </g>
      <circle cx="1280" cy="620" r="130" fill={p.fill} opacity="0.3" />
    </>,
    p
  );
}

/* ── Mathematics ───────────────────────────────────────────────────── */
function MathBg({ palette: p }) {
  return wrap(
    <>
      <circle cx="150" cy="110" r="120" fill={p.fill} opacity="0.4" />
      {/* geometric shapes top-right */}
      <g transform="translate(900,155)" opacity="0.2" stroke={p.stroke} fill="none" strokeWidth="2">
        <rect x="-20" y="-20" width="45" height="45" rx="8" />
        <circle cx="60" cy="0" r="22" />
        <polygon points="120,-22 145,22 95,22" />
      </g>
      {/* + and line */}
      <g transform="translate(860,310)" opacity="0.18" stroke={p.stroke} strokeWidth="2.5">
        <line x1="0" y1="-25" x2="0" y2="25" />
        <line x1="-25" y1="0" x2="25" y2="0" />
        <line x1="30" y1="0" x2="230" y2="0" />
      </g>
      {/* π √ x² Σ ∞ ÷ symbols */}
      <text x="100" y="470" fontSize="60" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.2" fontWeight="400">π</text>
      <text x="280" y="460" fontSize="55" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.18">√</text>
      <text x="190" y="540" fontSize="50" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.17">x²</text>
      <text x="380" y="540" fontSize="50" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.18">Σ</text>
      <text x="1080" y="470" fontSize="45" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.15">∞</text>
      <text x="1180" y="540" fontSize="45" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.14">÷</text>
      <circle cx="1270" cy="600" r="130" fill={p.fill} opacity="0.35" />
    </>,
    p
  );
}

/* ── Physics ───────────────────────────────────────────────────────── */
function PhysicsBg({ palette: p }) {
  return wrap(
    <>
      <circle cx="150" cy="120" r="120" fill={p.fill} opacity="0.4" />
      {/* arrow / velocity */}
      <g transform="translate(440,180)" opacity="0.2" stroke={p.stroke} fill="none" strokeWidth="2">
        <circle cx="0" cy="0" r="8" />
        <line x1="15" y1="0" x2="130" y2="0" />
        <polygon points="130,-6 145,0 130,6" fill={p.stroke} />
      </g>
      {/* dots */}
      <circle cx="640" cy="130" r="4" fill={p.stroke} opacity="0.3" />
      <circle cx="670" cy="120" r="3" fill={p.stroke} opacity="0.25" />
      <circle cx="690" cy="140" r="5" fill={p.stroke} opacity="0.2" />
      {/* atom top-right */}
      <g transform="translate(1020,230)" opacity="0.25" stroke={p.stroke} fill="none" strokeWidth="1.8">
        <circle cx="0" cy="0" r="8" fill={p.stroke} opacity="0.4" />
        <ellipse rx="55" ry="25" />
        <ellipse rx="55" ry="25" transform="rotate(60)" />
        <ellipse rx="55" ry="25" transform="rotate(-60)" />
      </g>
      {/* F=ma, E=mc² */}
      <text x="80" y="470" fontSize="42" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.2">F = ma</text>
      <text x="80" y="550" fontSize="42" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.18">E = mc²</text>
      {/* v=u+at, λ, Δt */}
      <text x="400" y="480" fontSize="32" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.16">v = u + at</text>
      <text x="730" y="440" fontSize="40" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.15">λ</text>
      <text x="810" y="510" fontSize="35" fontFamily="Georgia,serif" fill={p.stroke} opacity="0.15">Δt</text>
      {/* wave */}
      <path d="M560,580 Q610,530 660,580 Q710,630 760,580 Q810,530 860,580" stroke={p.stroke} fill="none" strokeWidth="2" opacity="0.15" />
      {/* magnet U shape */}
      <g transform="translate(1050,460)" opacity="0.2" stroke={p.stroke} fill="none" strokeWidth="5">
        <path d="M-25,-50 L-25,20 Q-25,60 0,60 Q25,60 25,20 L25,-50" />
        <line x1="-30" y1="-50" x2="-20" y2="-50" />
        <line x1="20" y1="-50" x2="30" y2="-50" />
      </g>
      <circle cx="1280" cy="600" r="120" fill={p.fill} opacity="0.3" />
    </>,
    p
  );
}

/* ── Chemistry ─────────────────────────────────────────────────────── */
function ChemistryBg({ palette: p }) {
  return wrap(
    <>
      <circle cx="150" cy="120" r="120" fill={p.fill} opacity="0.4" />
      {/* bubbles */}
      <circle cx="620" cy="130" r="6" fill={p.stroke} opacity="0.25" />
      <circle cx="660" cy="110" r="4" fill={p.stroke} opacity="0.2" />
      <circle cx="690" cy="145" r="5" fill={p.stroke} opacity="0.22" />
      {/* small circle top-right */}
      <circle cx="1150" cy="210" r="30" stroke={p.stroke} fill="none" strokeWidth="1.8" opacity="0.2" />
      {/* beaker / flask */}
      <g transform="translate(960,350)" opacity="0.2" stroke={p.stroke} fill="none" strokeWidth="2">
        <line x1="-15" y1="-60" x2="-15" y2="-20" />
        <line x1="15" y1="-60" x2="15" y2="-20" />
        <path d="M-15,-20 L-35,40 Q-35,60 0,60 Q35,60 35,40 L15,-20" />
      </g>
      {/* molecule circles bottom-left */}
      <circle cx="220" cy="470" r="25" stroke={p.stroke} fill="none" strokeWidth="1.8" opacity="0.2" />
      <circle cx="280" cy="440" r="15" stroke={p.stroke} fill="none" strokeWidth="1.5" opacity="0.18" />
      <circle cx="350" cy="480" r="18" stroke={p.stroke} fill="none" strokeWidth="1.5" opacity="0.18" />
      <line x1="240" y1="460" x2="270" y2="445" stroke={p.stroke} strokeWidth="1.5" opacity="0.15" />
      <line x1="292" y1="448" x2="338" y2="472" stroke={p.stroke} strokeWidth="1.5" opacity="0.15" />
      <circle cx="1280" cy="600" r="130" fill={p.fill} opacity="0.3" />
    </>,
    p
  );
}

/* ── Social Studies / Geography / History ──────────────────────────── */
function SocialBg({ palette: p }) {
  return wrap(
    <>
      <circle cx="150" cy="120" r="110" fill={p.fill} opacity="0.4" />
      {/* globe top-right */}
      <g transform="translate(1000,200)" opacity="0.25" stroke={p.stroke} fill="none" strokeWidth="2">
        <circle cx="0" cy="0" r="45" />
        <line x1="-45" y1="0" x2="45" y2="0" />
        <path d="M0,-45 Q15,0 0,45" />
        <path d="M0,-45 Q-15,0 0,45" />
        <ellipse rx="35" ry="12" />
      </g>
      {/* house bottom-left */}
      <g transform="translate(280,470)" opacity="0.3" fill={p.fill} stroke="none">
        <polygon points="0,-55 55,0 -55,0" />
        <rect x="-45" y="0" width="90" height="65" />
        <rect x="-12" y="30" width="24" height="35" fill={p.bg} />
      </g>
      {/* landscape line */}
      <path d="M100,610 Q400,570 700,600 Q1000,630 1200,590" stroke={p.stroke} fill="none" strokeWidth="1.8" opacity="0.15" />
      <circle cx="1280" cy="580" r="130" fill={p.fill} opacity="0.3" />
    </>,
    p
  );
}

/* ── Computer / IT ─────────────────────────────────────────────────── */
function ComputerBg({ palette: p }) {
  return wrap(
    <>
      <circle cx="150" cy="120" r="110" fill={p.fill} opacity="0.4" />
      {/* monitor */}
      <g transform="translate(1000,200)" opacity="0.2" stroke={p.stroke} fill="none" strokeWidth="2.5">
        <rect x="-60" y="-40" width="120" height="80" rx="8" />
        <line x1="0" y1="40" x2="0" y2="60" />
        <line x1="-30" y1="60" x2="30" y2="60" />
      </g>
      {/* code brackets */}
      <text x="120" y="460" fontSize="55" fontFamily="monospace" fill={p.stroke} opacity="0.18" fontWeight="700">&lt;/&gt;</text>
      <text x="320" y="530" fontSize="40" fontFamily="monospace" fill={p.stroke} opacity="0.15">{'{ }'}</text>
      {/* binary */}
      <text x="800" y="480" fontSize="20" fontFamily="monospace" fill={p.stroke} opacity="0.1">01001 10110</text>
      <text x="800" y="510" fontSize="20" fontFamily="monospace" fill={p.stroke} opacity="0.08">11010 01101</text>
      <circle cx="1280" cy="600" r="130" fill={p.fill} opacity="0.3" />
    </>,
    p
  );
}

/* ── Default / Generic ─────────────────────────────────────────────── */
function DefaultBg({ palette: p }) {
  return wrap(
    <>
      <circle cx="150" cy="120" r="110" fill={p.fill} opacity="0.4" />
      {/* book */}
      <g transform="translate(1000,200)" opacity="0.2" stroke={p.stroke} fill="none" strokeWidth="2.5">
        <path d="M-50,40 L-50,-30 Q0,-50 0,-30 Q0,-50 50,-30 L50,40 Q0,20 0,40 Q0,20 -50,40 Z" />
      </g>
      <circle cx="1280" cy="600" r="120" fill={p.fill} opacity="0.3" />
    </>,
    p
  );
}

/* ── Main exported component ───────────────────────────────────────── */
export default function SubjectBackground({ subject }) {
  const palette = getPalette(subject);
  const s = (subject || '').toLowerCase();

  if (s.includes('math'))                                                                    return <MathBg palette={palette} />;
  if (s.includes('physics'))                                                                 return <PhysicsBg palette={palette} />;
  if (s.includes('chemistry'))                                                               return <ChemistryBg palette={palette} />;
  if (s.includes('science'))                                                                 return <ScienceBg palette={palette} />;
  if (s.includes('bio'))                                                                     return <ScienceBg palette={palette} />;
  if (s.includes('english') || s.includes('language') || s.includes('literature'))           return <EnglishBg palette={palette} />;
  if (s.includes('hindi') || s.includes('sanskrit') || s.includes('urdu'))                   return <HindiBg palette={palette} />;
  if (s.includes('telugu') || s.includes('tamil') || s.includes('kannada') || s.includes('malayalam')) return <TeluguBg palette={palette} />;
  if (s.includes('history') || s.includes('social'))                                         return <SocialBg palette={palette} />;
  if (s.includes('geo'))                                                                     return <SocialBg palette={palette} />;
  if (s.includes('computer') || s.includes('coding'))                                        return <ComputerBg palette={palette} />;
  return <DefaultBg palette={palette} />;
}

export { getPalette };

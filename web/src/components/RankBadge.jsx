import React, { useId } from 'react';

// Medal badge for the class's top 3 on an exam. Rank 1 is the grandest (crown,
// laurel wreath, sparkles, shine), rank 2 a silver medal with stars, rank 3 a
// simpler bronze medal.
const STYLES = {
  1: { label: '1st Rank', c1: '#fff6b0', c2: '#ffd21f', c3: '#e39a00', ring: '#b36b00', text: '#7a4600', ribbonA: '#ef4444', ribbonB: '#b91c1c', laurel: '#f5b700' },
  2: { label: '2nd Rank', c1: '#ffffff', c2: '#dfe5f0', c3: '#8e9bb5', ring: '#66738e', text: '#47526b', ribbonA: '#3b82f6', ribbonB: '#1d4ed8', laurel: '#aab4c8' },
  3: { label: '3rd Rank', c1: '#ffe2c2', c2: '#dc8f52', c3: '#9a5524', ring: '#7a3f14', text: '#5c2c0c', ribbonA: '#22c55e', ribbonB: '#15803d', laurel: '#c98040' }
};

function leaves(side, color) {
  // Leaves along an arc beside the medal; mirrored for the right branch.
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const a = (150 + i * 14) * (Math.PI / 180);
    const x = 60 + Math.cos(a) * 44 * side;
    const y = 64 - Math.sin(a) * 44 * -1;
    const rot = (i * 14 + 60) * side;
    out.push(<ellipse key={`${side}-${i}`} cx={x} cy={y} rx="4.2" ry="9" fill={color} opacity="0.95" transform={`rotate(${rot} ${x} ${y})`} />);
  }
  return out;
}

function Sparkle({ x, y, s = 1, delay = 0 }) {
  return (
    <path
      className="eg-rank-twinkle"
      style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` }}
      d={`M${x} ${y - 7 * s} L${x + 2 * s} ${y - 2 * s} L${x + 7 * s} ${y} L${x + 2 * s} ${y + 2 * s} L${x} ${y + 7 * s} L${x - 2 * s} ${y + 2 * s} L${x - 7 * s} ${y} L${x - 2 * s} ${y - 2 * s} Z`}
      fill="#fff"
      stroke="#ffd21f"
      strokeWidth="0.6"
    />
  );
}

export default function RankBadge({ rank, size = 96, showLabel = false, animated = true }) {
  const uid = useId().replace(/:/g, '');
  const st = STYLES[rank];
  if (!st) return null;
  const grand = rank === 1;

  return (
    <span className={`eg-rank-badge eg-rank-badge-${rank}${animated ? ' is-animated' : ''}`} style={{ width: size }} title={st.label}>
      <svg viewBox="0 0 120 142" width={size} height={size * (142 / 120)} role="img" aria-label={st.label}>
        <defs>
          <radialGradient id={`m${uid}`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor={st.c1} />
            <stop offset="55%" stopColor={st.c2} />
            <stop offset="100%" stopColor={st.c3} />
          </radialGradient>
          <linearGradient id={`r${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={st.ribbonA} />
            <stop offset="100%" stopColor={st.ribbonB} />
          </linearGradient>
          <clipPath id={`c${uid}`}><circle cx="60" cy="64" r="31" /></clipPath>
        </defs>

        {grand ? <g>{leaves(1, st.laurel)}{leaves(-1, st.laurel)}</g> : null}

        {/* ribbon tails */}
        <polygon points="40,88 28,134 42,126 52,138 58,92" fill={`url(#r${uid})`} />
        <polygon points="80,88 92,134 78,126 68,138 62,92" fill={`url(#r${uid})`} />

        {/* medal */}
        <circle cx="60" cy="64" r="34" fill={st.ring} />
        <circle cx="60" cy="64" r="31" fill={`url(#m${uid})`} />
        <circle cx="60" cy="64" r="25" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray={grand ? '0' : '2 3'} />
        <text x="60" y="76" textAnchor="middle" fontSize="34" fontWeight="900" fontFamily="'Trebuchet MS', 'Arial Black', sans-serif" fill={st.text} stroke="#fff" strokeOpacity="0.45" strokeWidth="0.8">{rank}</text>
        <g clipPath={`url(#c${uid})`}>
          <rect x="-20" y="20" width="14" height="90" fill="#fff" opacity="0.55" transform="rotate(25 60 64)">
            {animated ? <animate attributeName="x" values="-20;110;110" keyTimes="0;0.45;1" dur="3.2s" repeatCount="indefinite" /> : null}
          </rect>
        </g>

        {grand ? (
          <g>
            <polygon points="38,36 42,16 51,27 60,10 69,27 78,16 82,36" fill="#ffd21f" stroke="#b36b00" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="42" cy="16" r="2.6" fill="#ef4444" />
            <circle cx="60" cy="10" r="3" fill="#3b82f6" />
            <circle cx="78" cy="16" r="2.6" fill="#ef4444" />
            <Sparkle x={18} y={30} s={1.1} />
            <Sparkle x={104} y={26} s={0.9} delay={0.5} />
            <Sparkle x={100} y={96} s={0.8} delay={1} />
          </g>
        ) : null}
        {rank === 2 ? (
          <g>
            <Sparkle x={24} y={28} s={0.9} delay={0.2} />
            <Sparkle x={98} y={34} s={0.8} delay={0.8} />
          </g>
        ) : null}
        {rank === 3 ? <Sparkle x={26} y={30} s={0.8} delay={0.4} /> : null}
      </svg>
      {showLabel ? <b className="eg-rank-badge-label" style={{ color: st.ring }}>{st.label}</b> : null}
    </span>
  );
}

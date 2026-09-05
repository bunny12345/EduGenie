import React from 'react';

const STATUS_LABEL = { strong: 'Great!', 'on-track': 'On track', 'needs-focus': 'Needs work', 'not-started': 'Not started' };

// Mirrors the Student portal's per-subject progress graph (same score ring +
// growth line shape/colors), scoped to a single subject for the Teacher portal.
export default function TeacherSubjectProgressChart({ subject, view }) {
  if (!subject) return null;
  const { name, emoji, accent, score, trend, status, tip } = subject;
  const series = view === 'monthly' ? subject.monthly : subject.daily;
  const statusLabel = STATUS_LABEL[status] || STATUS_LABEL['not-started'];
  const r = 30;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, (score || 0) / 100));

  return (
    <div className="td-progress-chart" style={{ '--sub-accent': accent }}>
      <div className="td-progress-chart-top">
        <div className="td-progress-ring">
          <svg viewBox="0 0 76 76">
            <circle cx="38" cy="38" r={r} className="td-progress-ring-track" />
            <circle
              cx="38" cy="38" r={r}
              className="td-progress-ring-value"
              stroke={accent}
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - frac)}
              transform="rotate(-90 38 38)"
            />
          </svg>
          <span className="td-progress-ring-num">{score}<em>%</em></span>
        </div>
        <div className="td-progress-chart-meta">
          <strong>{emoji} {name}</strong>
          <span className={`td-progress-status ${status}`}>{statusLabel}</span>
          {status !== 'not-started' && trend !== 0 && (
            <span className={`td-progress-trend ${trend > 0 ? 'up' : 'down'}`}>
              {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}% this month
            </span>
          )}
        </div>
      </div>
      <SubjectTrendChart series={series} accent={accent} mode={view} />
      {tip ? <p className="td-progress-tip">💡 {tip}</p> : null}
    </div>
  );
}

// Compact growth-line SVG chart, sized to fit inside a panel (not a full page).
function SubjectTrendChart({ series, accent, mode }) {
  const W = 520;
  const H = 190;
  const padL = 34;
  const padR = 14;
  const padT = 16;
  const padB = 36;
  const pts = Array.isArray(series) ? series : [];
  const real = pts.map((p, i) => ({ ...p, i })).filter((p) => p.value != null);
  const active = real.some((p) => p.value > 0);

  if (!pts.length || !active) {
    return (
      <div className="td-progress-empty">
        <div className="td-progress-empty-emoji">📈</div>
        <p>No activity yet — the growth line appears here once this student studies the subject.</p>
      </div>
    );
  }

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i) => padL + (i / Math.max(pts.length - 1, 1)) * innerW;
  const y = (v) => padT + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;
  const linePts = real.map((p) => `${x(p.i)},${y(p.value)}`).join(' ');
  const firstReal = real[0];
  const lastReal = real[real.length - 1];
  const areaPts = `${x(firstReal.i)},${padT + innerH} ${linePts} ${x(lastReal.i)},${padT + innerH}`;
  const gridVals = [25, 50, 75, 100];
  const labelEvery = mode === 'daily' && pts.length > 8 ? 2 : 1;
  const last = pts.length - 1;
  const gid = `tdSubjTrend-${String(accent || '').replace('#', '')}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="td-progress-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridVals.map((g) => (
        <g key={g}>
          <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} className="td-progress-gridline" />
          <text x={padL - 8} y={y(g) + 4} className="td-progress-axis-y">{g}%</text>
        </g>
      ))}
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={linePts} className="td-progress-line" stroke={accent} />
      {pts.map((p, i) => {
        const showLabel = i % labelEvery === 0 || i === last;
        const isFuture = p.value == null;
        const showVal = !isFuture && (i === lastReal.i || mode === 'monthly');
        return (
          <g key={p.key}>
            {showLabel && (
              <text x={x(i)} y={H - 18} className={`td-progress-axis-x${isFuture ? ' future' : ''}`}>
                {mode === 'daily' && p.weekday ? p.weekday : p.label}
              </text>
            )}
            {!isFuture && <circle cx={x(i)} cy={y(p.value)} r={i === lastReal.i ? 5 : 3.5} className="td-progress-dot" stroke={accent} />}
            {showVal && <text x={x(i)} y={y(p.value) - 10} className="td-progress-val">{p.value}%</text>}
          </g>
        );
      })}
    </svg>
  );
}

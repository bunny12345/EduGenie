import React, { useCallback, useEffect, useState } from 'react';
import { getLearningScore } from '../api';
import './StudentProgress.css';

/**
 * StudentProgress — a friendly, easy-to-read "Learning Power" report card built
 * for school students (grades 5–10).
 *
 * Everything is computed live from real activity on the backend — tests,
 * homework, flashcards/games, orchard growth, AI-tutor chats, streaks — so a
 * brand-new student starts at zero and it fills in automatically as they learn.
 * Students can flip every graph between a day-by-day and a month-by-month view.
 */

// Friendly names, emojis and a one-line "what this means" for each of the nine
// skills — so a 10-year-old instantly gets what the score is about.
const SKILL_META = {
  understanding: { emoji: '🧠', name: 'Understanding', desc: 'How well you get the lessons' },
  tests: { emoji: '📝', name: 'Tests & Quizzes', desc: 'How you do on tests' },
  homework: { emoji: '📒', name: 'Homework', desc: 'Finishing your work on time' },
  consistency: { emoji: '📅', name: 'Daily Habit', desc: 'Studying a little every day' },
  revision: { emoji: '🔁', name: 'Revision', desc: 'Going over things again to remember' },
  focus: { emoji: '🎯', name: 'Focus', desc: 'Concentrating while you study' },
  confidence: { emoji: '💪', name: 'Confidence', desc: 'Believing you can do it' },
  curiosity: { emoji: '🔍', name: 'Curiosity', desc: 'Asking questions & exploring' },
  speaking: { emoji: '🗣️', name: 'Speaking', desc: 'Explaining in your own words' },
};

const skillMeta = (key, fallbackLabel) =>
  SKILL_META[key] || { emoji: '⭐', name: fallbackLabel || key, desc: '' };

// Big friendly reaction based on the overall score (out of 1000).
function levelFace(score) {
  if (score >= 850) return { face: '🤩', word: 'Superstar', tone: 'excellent' };
  if (score >= 750) return { face: '😃', word: 'Doing great', tone: 'strong' };
  if (score >= 650) return { face: '🙂', word: 'Good going', tone: 'good' };
  if (score >= 500) return { face: '💪', word: 'Getting stronger', tone: 'developing' };
  if (score >= 300) return { face: '🌱', word: 'Just starting', tone: 'starting' };
  if (score > 0) return { face: '🐣', word: 'New learner', tone: 'beginning' };
  return { face: '👋', word: "Let's begin", tone: 'none' };
}

// One-word status + colour bucket for a single skill/subject value (0–100).
function levelWord(v) {
  if (v >= 75) return { word: 'Great!', klass: 'great' };
  if (v >= 50) return { word: 'Good', klass: 'good' };
  if (v >= 25) return { word: 'Keep going', klass: 'okay' };
  if (v > 0) return { word: 'Needs work', klass: 'low' };
  return { word: 'Not yet', klass: 'none' };
}

// Solid colour for a value (used on bars/rings) — traffic-light style so kids
// instantly read green = great, blue = good, amber/orange = needs work.
function valueColor(v) {
  if (v >= 75) return '#16a34a';
  if (v >= 50) return '#0ea5e9';
  if (v >= 25) return '#f59e0b';
  if (v > 0) return '#f97316';
  return '#cbd5e1';
}

export default function StudentProgress({ studentId, greetingName, fetchFn }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [trendView, setTrendView] = useState('daily'); // 'daily' | 'monthly'
  const [subjView, setSubjView] = useState('daily'); // 'daily' | 'monthly'
  const [openSubject, setOpenSubject] = useState(null); // subject object or null

  // The report loads in the background: nothing on screen says "loading". The
  // page simply stays blank for the moment it takes to arrive, then fills in.
  // A refresh keeps the current report visible until the new one replaces it.
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = fetchFn ? await fetchFn(studentId) : await getLearningScore(studentId);
      setData(res || null);
    } catch (e) {
      setError('Could not load your progress right now.');
    }
  }, [studentId, fetchFn]);

  // A different studentId (e.g. a teacher switching students) means the old
  // report is now for the wrong person — clear it instead of showing stale data.
  useEffect(() => { setData(null); }, [studentId]);
  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="eg-pg-error">
        <p>{error}</p>
        <button className="eg-pg-btn" onClick={load}>Try again</button>
      </div>
    );
  }
  if (!data) return null;

  const {
    score = 0, maxScore = 1000, color, momentumDelta = 0, dimensions = [],
    trend = [], dailyTrend = [], subjects = [], strengths = [], focusAreas = [],
    improvements = [], alert, hasData, trackingSince, academicEndLabel,
  } = data;

  const level = levelFace(score);
  const activeTrend = trendView === 'daily' ? dailyTrend : trend;

  return (
    <div className="eg-pg">
      <header className="eg-pg-head">
        <div>
          <h1>My Learning Report</h1>
          <p>A fun, simple picture of how {greetingName || 'you'} {greetingName ? 'is' : 'are'} growing — not just marks.</p>
        </div>
        <button className="eg-pg-refresh" onClick={load} title="Update with your latest activity">↻ Refresh</button>
      </header>

      {/* ── Friendly alert / notification banner ─────────────────────────── */}
      {alert && (
        <div className={`eg-pg-alert level-${alert.level}`}>
          <span className="eg-pg-alert-icon">
            {alert.level === 'alert' ? '⚠️' : alert.level === 'warn' ? '🔔' : alert.level === 'good' ? '🎉' : '🚀'}
          </span>
          <div className="eg-pg-alert-body">
            <strong>{alert.title}</strong>
            <p>{alert.message}</p>
            {Array.isArray(alert.dropped) && alert.dropped.length > 0 && (
              <div className="eg-pg-dropped">
                {alert.dropped.map((d) => {
                  const m = skillMeta(d.key, d.label);
                  return (
                    <span key={d.key} className="eg-pg-drop-chip">
                      {m.emoji} {m.name} <em>{d.delta > 0 ? '+' : ''}{d.delta}%</em>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="eg-pg-grid">
        {/* ── Headline "Learning Power" card ─────────────────────────────── */}
        <section className="eg-pg-card eg-pg-score-card">
          <div className="eg-pg-score-left">
            <ScoreGauge score={score} max={maxScore} color={color} face={level.face} />
          </div>
          <div className="eg-pg-score-meta">
            <span className="eg-pg-score-kicker">Your Learning Power</span>
            <div className={`eg-pg-level-badge tone-${level.tone}`}>{level.face} {level.word}</div>
            <div className={`eg-pg-momentum ${momentumDelta > 0 ? 'up' : momentumDelta < 0 ? 'down' : 'flat'}`}>
              {momentumDelta > 0 ? '▲ Up' : momentumDelta < 0 ? '▼ Down' : '— Same'} {Math.abs(momentumDelta)} points
              <span>in the last 30 days</span>
            </div>
            <p className="eg-pg-score-note">
              This <strong>407-style number is your ONE big score for everything</strong> — all subjects added
              together, out of {maxScore}. It counts tests, homework, reading, practice and asking questions.
              Do a little every day and watch it grow! 🌱
            </p>
          </div>
        </section>

        {/* ── Growth over time (daily / monthly toggle) ──────────────────── */}
        <section className="eg-pg-card eg-pg-trend-card">
          <div className="eg-pg-card-head">
            <div>
              <h3>📈 My total score over time</h3>
              <span className="eg-pg-sub">
                Everything added together (out of 1000){trackingSince ? ` · ${trackingSince}` : ''}{academicEndLabel ? ` → ${academicEndLabel}` : ''} — up means you’re learning more!
              </span>
            </div>
            <div className="eg-pg-toggle" role="tablist" aria-label="Choose time range">
              <button className={trendView === 'daily' ? 'on' : ''} onClick={() => setTrendView('daily')}>Day by day</button>
              <button className={trendView === 'monthly' ? 'on' : ''} onClick={() => setTrendView('monthly')}>Month by month</button>
            </div>
          </div>
          <TrendChart trend={activeTrend} color={color} hasData={hasData} mode={trendView} />
        </section>

        {/* ── The 9 skills — friendly cards + a simple skill shape ───────── */}
        <section className="eg-pg-card eg-pg-dims-card">
          <div className="eg-pg-card-head">
            <div>
              <h3>🌟 What makes up my score</h3>
              <span className="eg-pg-sub">Nine skills that show real learning</span>
            </div>
          </div>
          <div className="eg-pg-dims-body">
            <div className="eg-pg-radar-wrap">
              <RadarChart dimensions={dimensions} color={color} />
              <p className="eg-pg-radar-caption">The bigger the shape, the stronger you are all-round.</p>
            </div>
            <div className="eg-pg-skill-grid">
              {dimensions.map((d) => {
                const m = skillMeta(d.key, d.label);
                const lw = levelWord(d.value);
                return (
                  <div key={d.key} className={`eg-pg-skill klass-${lw.klass}`} title={m.desc}>
                    <div className="eg-pg-skill-top">
                      <span className="eg-pg-skill-emoji">{m.emoji}</span>
                      <span className="eg-pg-skill-name">{m.name}</span>
                      <span className="eg-pg-skill-val">{d.value}%</span>
                    </div>
                    <div className="eg-pg-skill-track">
                      <i style={{ width: `${Math.max(d.value, 2)}%`, background: valueColor(d.value) }} />
                    </div>
                    <span className={`eg-pg-skill-word ${lw.klass}`}>{lw.word}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── What you're great at / what to practise ────────────────────── */}
        <section className="eg-pg-card eg-pg-insights-card">
          <div className="eg-pg-insight-col">
            <h4>⭐ You’re great at</h4>
            {strengths.length ? strengths.map((s) => {
              const m = skillMeta(s.key, s.label);
              return <span key={s.key} className="eg-pg-tag strength">{m.emoji} {m.name} · {s.value}%</span>;
            }) : <p className="eg-pg-muted">Keep studying to reveal your superpowers!</p>}
          </div>
          <div className="eg-pg-insight-col">
            <h4>🎯 Practise next</h4>
            {focusAreas.length ? focusAreas.map((s) => {
              const m = skillMeta(s.key, s.label);
              return <span key={s.key} className="eg-pg-tag focus">{m.emoji} {m.name} · {s.value}%</span>;
            }) : <p className="eg-pg-muted">You’re nicely balanced right now!</p>}
          </div>
        </section>

        {/* ── Your next steps ────────────────────────────────────────────── */}
        {improvements.length > 0 && (
          <section className="eg-pg-card eg-pg-improve-card">
            <div className="eg-pg-card-head">
              <div>
                <h3>🚀 Your next steps</h3>
                <span className="eg-pg-sub">Small steps, big wins</span>
              </div>
            </div>
            <ol className="eg-pg-steps">
              {improvements.map((tip, i) => <li key={i}>{tip}</li>)}
            </ol>
          </section>
        )}

        {/* ── Subject by subject (with its own daily/monthly graph) ──────── */}
        <section className="eg-pg-card eg-pg-subjects-card">
          <div className="eg-pg-card-head">
            <div>
              <h3>📚 Each subject on its own</h3>
              <span className="eg-pg-sub">Here’s how every single subject is growing — spot which one needs more love</span>
            </div>
            <div className="eg-pg-toggle" role="tablist" aria-label="Choose subject time range">
              <button className={subjView === 'daily' ? 'on' : ''} onClick={() => setSubjView('daily')}>Day by day</button>
              <button className={subjView === 'monthly' ? 'on' : ''} onClick={() => setSubjView('monthly')}>Month by month</button>
            </div>
          </div>
          <div className="eg-pg-subject-grid">
            {subjects.map((s) => <SubjectCard key={s.subjectKey} subject={s} view={subjView} onOpen={() => setOpenSubject(s)} />)}
          </div>
        </section>
      </div>

      {openSubject && (
        <SubjectDetail subject={openSubject} onClose={() => setOpenSubject(null)} />
      )}
    </div>
  );
}

// ── Radial score gauge with a friendly face in the middle ───────────────────
function ScoreGauge({ score, max, color, face }) {
  const r = 84;
  const cx = 100;
  const cy = 100;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, (score || 0) / (max || 1000)));
  const [animFrac, setAnimFrac] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimFrac(frac));
    return () => cancelAnimationFrame(id);
  }, [frac]);
  const offset = circ * (1 - animFrac);
  return (
    <div className="eg-pg-gauge">
      <svg viewBox="0 0 200 200" className="eg-pg-gauge-svg">
        <defs>
          <linearGradient id="egGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color || '#6d5efc'} />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} className="eg-pg-gauge-track" />
        <circle
          cx={cx} cy={cy} r={r}
          className="eg-pg-gauge-value"
          stroke="url(#egGaugeGrad)"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div className="eg-pg-gauge-center">
        <span className="eg-pg-gauge-face">{face}</span>
        <strong style={{ color: color || '#6d5efc' }}>{score}</strong>
        <span className="eg-pg-gauge-max">out of {max}</span>
      </div>
    </div>
  );
}

// ── Growth line chart (SVG) — works for both daily and monthly data ─────────
function TrendChart({ trend, color, hasData, mode }) {
  const W = 640;
  const H = 250;
  const padL = 40;
  const padR = 18;
  const padT = 22;
  const padB = 44;
  const pts = Array.isArray(trend) ? trend : [];
  // Real (already-happened) points carry a numeric score; future months to
  // April are null and drawn as the "road ahead".
  const real = pts.map((p, i) => ({ ...p, i })).filter((p) => p.score != null);
  const active = real.some((p) => p.score > 0);
  if (!pts.length || !hasData || !active) {
    return (
      <div className="eg-pg-empty-chart">
        <div className="eg-pg-empty-emoji">📈</div>
        <p>Your growth line shows up here as you learn. Finish a chapter, play flashcards or take a quiz to add your first point!</p>
      </div>
    );
  }
  const maxY = 1000;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i) => padL + (i / Math.max(pts.length - 1, 1)) * innerW;
  const y = (v) => padT + innerH - (Math.max(0, Math.min(maxY, v)) / maxY) * innerH;
  const linePts = real.map((p) => `${x(p.i)},${y(p.score)}`).join(' ');
  const firstReal = real[0];
  const lastReal = real[real.length - 1];
  const areaPts = `${x(firstReal.i)},${padT + innerH} ${linePts} ${x(lastReal.i)},${padT + innerH}`;
  const gridVals = [250, 500, 750, 1000];
  // For the daily view, only label a few points so it doesn't get crowded.
  const labelEvery = mode === 'daily' && pts.length > 8 ? 2 : 1;
  const last = pts.length - 1;
  const hasFuture = mode === 'monthly' && real.length < pts.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="eg-pg-trend-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="egTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color || '#6d5efc'} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color || '#6d5efc'} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridVals.map((g) => (
        <g key={g}>
          <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} className="eg-pg-gridline" />
          <text x={padL - 8} y={y(g) + 4} className="eg-pg-axis-y">{g}</text>
        </g>
      ))}
      {/* Shade the "road ahead" from now to April */}
      {hasFuture && (
        <g>
          <rect x={x(lastReal.i)} y={padT} width={x(last) - x(lastReal.i)} height={innerH} className="eg-pg-future-zone" />
          <line x1={x(lastReal.i)} y1={padT} x2={x(lastReal.i)} y2={padT + innerH} className="eg-pg-now-line" />
          {/* Dashed "goal" line from now to the April finish */}
          <line x1={x(lastReal.i)} y1={y(lastReal.score)} x2={x(last)} y2={y(lastReal.score)} className="eg-pg-goal-line" stroke={color || '#6d5efc'} />
          <text x={x(last)} y={y(lastReal.score) - 12} className="eg-pg-goal-flag" textAnchor="end">🎯 keep going to April</text>
        </g>
      )}
      <polygon points={areaPts} fill="url(#egTrendFill)" />
      <polyline points={linePts} className="eg-pg-trend-line" stroke={color || '#6d5efc'} />
      {pts.map((p, i) => {
        const showLabel = i % labelEvery === 0 || i === last;
        const isFuture = p.score == null;
        const showVal = !isFuture && (i === lastReal.i || mode === 'monthly');
        return (
          <g key={p.key}>
            {showLabel && (
              <text x={x(i)} y={H - 24} className={`eg-pg-axis-x${isFuture ? ' future' : ''}`}>{mode === 'daily' && p.weekday ? p.weekday : p.label}</text>
            )}
            {showLabel && mode === 'daily' && (
              <text x={x(i)} y={H - 10} className="eg-pg-axis-x-sub">{p.label}</text>
            )}
            {!isFuture && (
              <circle cx={x(i)} cy={y(p.score)} r={i === lastReal.i ? 6 : 4} className="eg-pg-trend-dot" stroke={color || '#6d5efc'} />
            )}
            {showVal && <text x={x(i)} y={y(p.score) - 12} className="eg-pg-trend-val">{p.score}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ── 9-axis radar chart (SVG) with friendly emoji labels ─────────────────────
function RadarChart({ dimensions, color }) {
  const W = 300;
  const H = 300;
  const cx = W / 2;
  const cy = H / 2;
  const R = 92;
  const dims = Array.isArray(dimensions) ? dimensions : [];
  const n = dims.length || 1;
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i, frac) => {
    const a = angle(i);
    return [cx + Math.cos(a) * R * frac, cy + Math.sin(a) * R * frac];
  };
  const rings = [0.25, 0.5, 0.75, 1];
  const valuePts = dims.map((d, i) => point(i, Math.max(0.02, (d.value || 0) / 100))).map((p) => p.join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="eg-pg-radar-svg">
      {rings.map((rr) => (
        <polygon
          key={rr}
          points={dims.map((_, i) => point(i, rr).join(',')).join(' ')}
          className="eg-pg-radar-ring"
        />
      ))}
      {dims.map((d, i) => {
        const [px, py] = point(i, 1);
        const [lx, ly] = point(i, 1.16);
        const m = skillMeta(d.key, d.label);
        return (
          <g key={d.key}>
            <line x1={cx} y1={cy} x2={px} y2={py} className="eg-pg-radar-axis" />
            <text x={lx} y={ly + 5} className="eg-pg-radar-label" textAnchor="middle">{m.emoji}</text>
          </g>
        );
      })}
      <polygon points={valuePts} className="eg-pg-radar-value" fill={color || '#6d5efc'} stroke={color || '#6d5efc'} />
      {dims.map((d, i) => {
        const [px, py] = point(i, Math.max(0.02, (d.value || 0) / 100));
        return <circle key={d.key} cx={px} cy={py} r="3" className="eg-pg-radar-dot" fill={color || '#6d5efc'} />;
      })}
    </svg>
  );
}

// ── Per-subject card with score ring + a bigger day/month graph ─────────────
function SubjectCard({ subject, view, onOpen }) {
  const { name, accent, emoji, score, trend, status, tip } = subject;
  const series = view === 'daily' ? subject.daily : subject.monthly;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, (score || 0) / 100));
  const statusLabel = status === 'strong' ? 'Great!' : status === 'on-track' ? 'On track' : status === 'needs-focus' ? 'Needs work' : 'Not started';
  return (
    <button
      type="button"
      className={`eg-pg-subject status-${status}`}
      style={{ '--sub-accent': accent }}
      onClick={onOpen}
      title={`Open ${name} progress`}
    >
      <div className="eg-pg-subject-top">
        <div className="eg-pg-subject-ring">
          <svg viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={r} className="eg-pg-ring-track" />
            <circle
              cx="32" cy="32" r={r}
              className="eg-pg-ring-value"
              stroke={accent}
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - frac)}
              transform="rotate(-90 32 32)"
            />
          </svg>
          <span className="eg-pg-ring-num">{score}<em>%</em></span>
        </div>
        <div className="eg-pg-subject-meta">
          <strong>{emoji} {name}</strong>
          <span className={`eg-pg-status-chip ${status}`}>{statusLabel}</span>
          {status !== 'not-started' && trend !== 0 && (
            <span className={`eg-pg-subject-trend ${trend > 0 ? 'up' : 'down'}`}>
              {trend > 0 ? '▲ up' : '▼ down'} {Math.abs(trend)}%
            </span>
          )}
        </div>
      </div>
      <SubjectGraph series={series} accent={accent} mode={view} />
      <p className="eg-pg-subject-tip">{tip}</p>
      <span className="eg-pg-subject-open">Tap to see more →</span>
    </button>
  );
}

// A small-but-clear line graph for a single subject (day or month view).
function SubjectGraph({ series, accent, mode }) {
  const pts = Array.isArray(series) ? series : [];
  const real = pts.map((p, i) => ({ ...p, i })).filter((p) => p.value != null);
  const active = real.some((p) => p.value > 0);
  const W = 260;
  const H = 78;
  const padB = 16;
  if (!pts.length || !active) {
    return <div className="eg-pg-mini-empty">No activity yet — start to see the graph grow 🌱</div>;
  }
  const innerH = H - padB - 8;
  const x = (i) => (i / Math.max(pts.length - 1, 1)) * (W - 10) + 5;
  const y = (v) => 8 + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;
  const line = real.map((p) => `${x(p.i)},${y(p.value)}`).join(' ');
  const firstReal = real[0];
  const lastReal = real[real.length - 1];
  const area = `${x(firstReal.i)},${H - padB} ${line} ${x(lastReal.i)},${H - padB}`;
  const gid = `egSubjFill-${accent.replace('#', '')}`;
  const labelEvery = mode === 'daily' && pts.length > 7 ? 3 : mode === 'daily' ? 2 : 1;
  const last = pts.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="eg-pg-subj-graph" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="5" y1={H - padB} x2={W - 5} y2={H - padB} className="eg-pg-subj-base" />
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        (i % labelEvery === 0 || i === last)
          ? <text key={p.key} x={x(i)} y={H - 4} className={`eg-pg-subj-x${p.value == null ? ' future' : ''}`}>{p.label}</text>
          : null
      ))}
      <circle cx={x(lastReal.i)} cy={y(lastReal.value)} r="3" fill={accent} />
    </svg>
  );
}
// ── Full-screen subject detail — the overall report, but for ONE subject ────
function SubjectDetail({ subject, onClose }) {
  const [view, setView] = useState('daily'); // 'daily' | 'monthly'
  const {
    name, emoji, accent, score, score1000 = (score || 0) * 10, statusLabel, status,
    trend = 0, tip, metrics = [], stats = [], strength, focus, bestTest = 0,
  } = subject;
  const series = view === 'daily' ? subject.daily : subject.monthly;
  const lw = levelWord(score);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="eg-pg-modal-overlay" onClick={onClose}>
      <div className="eg-pg-modal" style={{ '--sub-accent': accent }} onClick={(e) => e.stopPropagation()}>
        <button className="eg-pg-modal-close" onClick={onClose} aria-label="Close">×</button>

        {/* Header */}
        <div className="eg-pg-modal-head">
          <span className="eg-pg-modal-emoji">{emoji}</span>
          <div>
            <h2>{name}</h2>
            <span className={`eg-pg-status-chip ${status}`}>{statusLabel}</span>
            {status !== 'not-started' && trend !== 0 && (
              <span className={`eg-pg-subject-trend ${trend > 0 ? 'up' : 'down'}`} style={{ marginLeft: 8 }}>
                {trend > 0 ? '▲ up' : '▼ down'} {Math.abs(trend)}% this month
              </span>
            )}
          </div>
        </div>

        {status === 'not-started' ? (
          <div className="eg-pg-modal-empty">
            <div className="eg-pg-empty-emoji">🌱</div>
            <p><strong>You haven’t started {name} yet.</strong></p>
            <p>{tip}</p>
          </div>
        ) : (
          <div className="eg-pg-modal-body">
            {/* Score gauge (subject, out of 1000, same style as overall) */}
            <div className="eg-pg-modal-score">
              <ScoreGauge score={score1000} max={1000} color={accent} face={lw.klass === 'great' ? '🤩' : lw.klass === 'good' ? '🙂' : '💪'} />
              <p className="eg-pg-modal-score-note">Your <strong>{name}</strong> power — out of 1000, just for this subject.</p>
            </div>

            {/* Trend over time with its own day/month toggle */}
            <div className="eg-pg-modal-trend">
              <div className="eg-pg-card-head">
                <div>
                  <h3>📈 {name} over time</h3>
                  <span className="eg-pg-sub">When the line goes up, you’re getting better at {name}!</span>
                </div>
                <div className="eg-pg-toggle">
                  <button className={view === 'daily' ? 'on' : ''} onClick={() => setView('daily')}>Day by day</button>
                  <button className={view === 'monthly' ? 'on' : ''} onClick={() => setView('monthly')}>Month by month</button>
                </div>
              </div>
              <SubjectTrendChart series={series} accent={accent} mode={view} />
            </div>

            {/* Subject skills */}
            <div className="eg-pg-modal-skills">
              <h3>🌟 What makes up your {name} score</h3>
              <div className="eg-pg-skill-grid">
                {metrics.map((m) => {
                  const mlw = levelWord(m.value);
                  return (
                    <div key={m.key} className={`eg-pg-skill klass-${mlw.klass}`} title={m.desc}>
                      <div className="eg-pg-skill-top">
                        <span className="eg-pg-skill-emoji">{m.emoji}</span>
                        <span className="eg-pg-skill-name">{m.label}</span>
                        <span className="eg-pg-skill-val">{m.value}%</span>
                      </div>
                      <div className="eg-pg-skill-track">
                        <i style={{ width: `${Math.max(m.value, 2)}%`, background: valueColor(m.value) }} />
                      </div>
                      <span className={`eg-pg-skill-word ${mlw.klass}`}>{mlw.word}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fun stat counters */}
            <div className="eg-pg-modal-stats">
              {stats.map((s) => (
                <div key={s.key} className="eg-pg-stat">
                  <span className="eg-pg-stat-emoji">{s.emoji}</span>
                  <strong>{s.value}</strong>
                  <span className="eg-pg-stat-label">{s.label}</span>
                </div>
              ))}
              {bestTest > 0 && (
                <div className="eg-pg-stat">
                  <span className="eg-pg-stat-emoji">🏆</span>
                  <strong>{bestTest}%</strong>
                  <span className="eg-pg-stat-label">Best test</span>
                </div>
              )}
            </div>

            {/* Strength / focus + tip */}
            <div className="eg-pg-modal-insights">
              {strength && <span className="eg-pg-tag strength">⭐ Best: {strength.emoji} {strength.label} · {strength.value}%</span>}
              {focus && <span className="eg-pg-tag focus">🎯 Practise: {focus.emoji} {focus.label} · {focus.value}%</span>}
            </div>
            <p className="eg-pg-modal-tip">💡 {tip}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Bigger subject trend chart (0–100%) for the detail window.
function SubjectTrendChart({ series, accent, mode }) {
  const W = 620;
  const H = 230;
  const padL = 38;
  const padR = 18;
  const padT = 20;
  const padB = 44;
  const pts = Array.isArray(series) ? series : [];
  const real = pts.map((p, i) => ({ ...p, i })).filter((p) => p.value != null);
  const active = real.some((p) => p.value > 0);
  if (!pts.length || !active) {
    return (
      <div className="eg-pg-empty-chart">
        <div className="eg-pg-empty-emoji">📈</div>
        <p>Study this subject to see your line grow here!</p>
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
  const hasFuture = mode === 'monthly' && real.length < pts.length;
  const gid = `egSubjTrend-${(accent || '').replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="eg-pg-trend-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridVals.map((g) => (
        <g key={g}>
          <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} className="eg-pg-gridline" />
          <text x={padL - 8} y={y(g) + 4} className="eg-pg-axis-y">{g}%</text>
        </g>
      ))}
      {hasFuture && (
        <g>
          <rect x={x(lastReal.i)} y={padT} width={x(last) - x(lastReal.i)} height={innerH} className="eg-pg-future-zone" />
          <line x1={x(lastReal.i)} y1={padT} x2={x(lastReal.i)} y2={padT + innerH} className="eg-pg-now-line" />
          <line x1={x(lastReal.i)} y1={y(lastReal.value)} x2={x(last)} y2={y(lastReal.value)} className="eg-pg-goal-line" stroke={accent} />
          <text x={x(last)} y={y(lastReal.value) - 12} className="eg-pg-goal-flag" textAnchor="end">🎯 to April</text>
        </g>
      )}
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={linePts} className="eg-pg-trend-line" stroke={accent} />
      {pts.map((p, i) => {
        const showLabel = i % labelEvery === 0 || i === last;
        const isFuture = p.value == null;
        const showVal = !isFuture && (i === lastReal.i || mode === 'monthly');
        return (
          <g key={p.key}>
            {showLabel && (
              <text x={x(i)} y={H - 24} className={`eg-pg-axis-x${isFuture ? ' future' : ''}`}>{mode === 'daily' && p.weekday ? p.weekday : p.label}</text>
            )}
            {showLabel && mode === 'daily' && (
              <text x={x(i)} y={H - 10} className="eg-pg-axis-x-sub">{p.label}</text>
            )}
            {!isFuture && (
              <circle cx={x(i)} cy={y(p.value)} r={i === lastReal.i ? 6 : 4} className="eg-pg-trend-dot" stroke={accent} />
            )}
            {showVal && <text x={x(i)} y={y(p.value) - 12} className="eg-pg-trend-val">{p.value}%</text>}
          </g>
        );
      })}
    </svg>
  );
}
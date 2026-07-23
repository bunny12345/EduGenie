import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getOrchard, getOrchardTree } from '../api';
import TreeSprite from './orchard/TreeSprite';
import OrchardTreeDetail from './orchard/OrchardTreeDetail';
import './StudentOrchard.css';

function ProgressRing({ value = 0, size = 56, stroke = 6, color = '#7c3aed', trackColor = '#ececf6' }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="eg-orch-ring">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="eg-orch-ring-label">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function NeedBar({ icon, label, value, color }) {
  return (
    <div className="eg-orch-need">
      <span className="eg-orch-need-icon" aria-hidden="true">{icon}</span>
      <span className="eg-orch-need-label">{label}</span>
      <span className="eg-orch-need-track">
        <span className="eg-orch-need-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </span>
      <span className="eg-orch-need-pct">{Math.round(value)}%</span>
    </div>
  );
}

function GrowthChart({ trees }) {
  const points = (trees || []).map((t) => t.progressPct || 0);
  const w = 280;
  const h = 110;
  const pad = 14;
  if (!points.length) return <div className="eg-orch-chart-empty">No growth yet</div>;
  const max = 100;
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - (p / max) * (h - pad * 2);
    return [x, y];
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${h - pad} L${coords[0][0].toFixed(1)},${h - pad} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="eg-orch-chart" preserveAspectRatio="none">
      <path d={area} fill="rgba(124,58,237,0.12)" />
      <path d={line} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#7c3aed" />
      ))}
    </svg>
  );
}

function WeekStrip({ dayStreak = 0 }) {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // Mon=0
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div className="eg-orch-week">
      {labels.map((lbl, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const isToday = d.toDateString() === today.toDateString();
        const isPast = d < today && !isToday;
        return (
          <div key={lbl} className={`eg-orch-day ${isToday ? 'today' : ''}`}>
            <span className="eg-orch-day-label">{lbl}</span>
            <span className="eg-orch-day-num">{d.getDate()}</span>
            <span className="eg-orch-day-mark">{isPast ? '✅' : isToday ? '💧' : '·'}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function StudentOrchard({ studentId, greetingName = 'there' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openKey, setOpenKey] = useState('');

  const loadOrchard = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError('');
    try {
      const res = await getOrchard(studentId);
      setData(res);
      const first = res?.trees?.[0]?.subjectKey || '';
      setSelectedKey((prev) => prev || first);
    } catch (e) {
      setError(String(e?.message || e || 'Failed to load orchard'));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadOrchard();
  }, [loadOrchard]);

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      if (!studentId || !selectedKey) return;
      setDetailLoading(true);
      try {
        const res = await getOrchardTree(studentId, selectedKey);
        if (!cancelled) setDetail(res);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [studentId, selectedKey]);

  const profile = data?.profile || {};
  const trees = useMemo(() => data?.trees || [], [data]);
  const overall = data?.overallProgress || 0;
  const selectedTree = trees.find((t) => t.subjectKey === selectedKey) || trees[0] || null;

  const missions = useMemo(() => buildMissions(trees), [trees]);

  if (loading) {
    return <div className="eg-orch-loading">🌱 Growing your orchard…</div>;
  }
  if (error) {
    return (
      <div className="eg-orch-error">
        <p>{error}</p>
        <button onClick={loadOrchard}>Retry</button>
      </div>
    );
  }

  if (openKey) {
    const initialTree = detail && detail.subjectKey === openKey ? detail : null;
    return (
      <div className="eg-orch">
        <OrchardTreeDetail
          studentId={studentId}
          subjectKey={openKey}
          initialTree={initialTree}
          onBack={() => {
            setOpenKey('');
            loadOrchard();
          }}
        />
      </div>
    );
  }

  return (
    <div className="eg-orch">
      {/* Header */}
      <div className="eg-orch-header">
        <div>
          <h1 className="eg-orch-greeting">Good day, {greetingName}! 👋</h1>
          <p className="eg-orch-sub">Water your trees daily, and success will be yours.</p>
        </div>
        <div className="eg-orch-counters">
          <div className="eg-orch-counter">
            <span className="eg-orch-counter-icon">💧</span>
            <div>
              <strong>{profile.waterDrops ?? 0}</strong>
              <span>Water Drops</span>
            </div>
          </div>
          <div className="eg-orch-counter">
            <span className="eg-orch-counter-icon">☀️</span>
            <div>
              <strong>{profile.sunshine ?? 0}</strong>
              <span>Sunshine</span>
            </div>
          </div>
          <div className="eg-orch-counter">
            <span className="eg-orch-counter-icon">💎</span>
            <div>
              <strong>{profile.gems ?? 0}</strong>
              <span>Gems</span>
            </div>
          </div>
        </div>
      </div>

      {/* Learning Orchard banner */}
      <div className="eg-orch-banner">
        <div className="eg-orch-banner-left">
          <span className="eg-orch-banner-emoji">🌳</span>
          <div>
            <h2>Your Learning Orchard</h2>
            <p>Each tree represents your growth in a subject.</p>
          </div>
        </div>
        <div className="eg-orch-banner-right">
          <ProgressRing value={overall} size={64} />
          <div className="eg-orch-banner-progress">
            <span>Overall Progress</span>
            <strong>{overall}%</strong>
          </div>
        </div>
      </div>

      {/* Main grid: trees + detail */}
      <div className="eg-orch-main">
        <div className="eg-orch-tree-grid">
          {trees.map((t) => (
            <button
              key={t.subjectKey}
              className={`eg-orch-tree-card ${selectedKey === t.subjectKey ? 'selected' : ''} health-${t.health}`}
              style={{ '--accent': t.accentColor }}
              onClick={() => setSelectedKey(t.subjectKey)}
            >
              <div className="eg-orch-tree-card-head">
                <span className="eg-orch-tree-name">
                  <span className="eg-orch-tree-emoji">{t.treeEmoji}</span> {t.subject}
                </span>
                <ProgressRing value={t.progressPct} size={44} stroke={5} color={t.accentColor} />
              </div>
              <div className="eg-orch-tree-art">
                <TreeSprite treeType={t.treeType} stage={t.stage} size={128} accentColor={t.accentColor} health={t.health} />
                {t.health !== 'healthy' && (
                  <span className="eg-orch-tree-health-badge">{t.health === 'thirsty' ? '💧 Thirsty' : '🍂 Needs care'}</span>
                )}
              </div>
              <div className="eg-orch-tree-foot">
                <span className="eg-orch-tree-stage">{t.stageLabel}</span>
                <span className="eg-orch-tree-chapters">{t.completedChapters} / {t.totalChapters} Chapters</span>
              </div>
              <div className="eg-orch-tree-bar">
                <span style={{ width: `${t.progressPct}%`, background: t.accentColor }} />
              </div>
              <span
                role="button"
                tabIndex={0}
                className="eg-orch-tree-explore"
                onClick={(e) => { e.stopPropagation(); setOpenKey(t.subjectKey); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setOpenKey(t.subjectKey); } }}
              >
                Explore tree →
              </span>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <aside className="eg-orch-detail" style={{ '--accent': selectedTree?.accentColor || '#7c3aed' }}>
          {selectedTree ? (
            <>
              <div className="eg-orch-detail-head">
                <span>{selectedTree.treeEmoji} {selectedTree.subject} Tree</span>
                <button className="eg-orch-detail-expand" onClick={() => setOpenKey(selectedTree.subjectKey)} title="Explore full tree">↗</button>
              </div>
              <div className="eg-orch-detail-art">
                <TreeSprite
                  treeType={selectedTree.treeType}
                  stage={selectedTree.stage}
                  size={200}
                  accentColor={selectedTree.accentColor}
                  health={selectedTree.health}
                />
              </div>
              <div className="eg-orch-detail-stage">
                <strong>{selectedTree.stageLabel}</strong>
                <span>Level {selectedTree.level} of {selectedTree.maxLevel}</span>
              </div>
              <div className="eg-orch-detail-chapters">
                {selectedTree.completedChapters} / {selectedTree.totalChapters} Chapters Completed
              </div>

              {/* Next chapter */}
              {detail?.nextChapter && (
                <div className="eg-orch-next">
                  <span className="eg-orch-next-label">Next Chapter</span>
                  <div className="eg-orch-next-row">
                    <div>
                      <strong>{detail.nextChapter.title}</strong>
                      <span>{detail.nextChapter.stageLabel === 'Seed' ? 'Ready to learn' : `In progress · ${detail.nextChapter.stageLabel}`}</span>
                    </div>
                    <button className="eg-orch-next-btn">Start</button>
                  </div>
                </div>
              )}

              {/* Tree needs */}
              <div className="eg-orch-needs">
                <span className="eg-orch-needs-title">Tree Needs</span>
                <NeedBar icon="💧" label="Water" value={selectedTree.waterPct} color="#38bdf8" />
                <NeedBar icon="☀️" label="Sunlight" value={selectedTree.sunlightPct} color="#fbbf24" />
                <NeedBar icon="🌱" label="Fertilizer" value={selectedTree.fertilizerPct} color="#34d399" />
                <NeedBar icon="🫚" label="Roots" value={selectedTree.rootsPct} color="#a78bfa" />
              </div>

              <div className="eg-orch-tip">
                <span>🤖</span>
                <p>{buildTip(selectedTree)}</p>
              </div>
            </>
          ) : (
            <div className="eg-orch-detail-empty">Select a tree to see details</div>
          )}
          {detailLoading && <div className="eg-orch-detail-loading">Updating…</div>}
        </aside>
      </div>

      {/* Bottom row: calendar / missions / growth */}
      <div className="eg-orch-bottom">
        <div className="eg-orch-panel">
          <h3>Orchard Calendar</h3>
          <WeekStrip dayStreak={profile.dayStreak} />
          <p className="eg-orch-streak">🔥 {profile.dayStreak || 0} day streak — keep it going!</p>
        </div>

        <div className="eg-orch-panel">
          <h3>Today's Missions</h3>
          <ul className="eg-orch-missions">
            {missions.map((m, i) => (
              <li key={i}>
                <span>{m.icon} {m.label}</span>
                <span className="eg-orch-mission-reward">{m.reward}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="eg-orch-panel">
          <h3>Orchard Growth</h3>
          <GrowthChart trees={trees} />
          <div className="eg-orch-chart-legend">
            {trees.map((t) => (
              <span key={t.subjectKey} style={{ color: t.accentColor }}>● {t.subject.split(' ')[0]}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildMissions(trees) {
  const missions = [];
  const thirsty = trees.find((t) => t.health !== 'healthy');
  if (thirsty) missions.push({ icon: '💧', label: `Water your ${thirsty.subject} tree`, reward: '+20 💧' });
  const inProgress = trees.find((t) => t.progressPct > 0 && t.progressPct < 100);
  if (inProgress) missions.push({ icon: '📖', label: `Revise a ${inProgress.subject} chapter`, reward: '+15 ☀️' });
  missions.push({ icon: '📝', label: 'Take a mock test', reward: '+20 💧' });
  missions.push({ icon: '🤖', label: 'Ask 3 doubts to the AI Tutor', reward: '+10 🌱' });
  return missions.slice(0, 4);
}

function buildTip(tree) {
  if (tree.health === 'wilting') return `Your ${tree.subject} tree is thirsty. A little revision today will bring it back to life.`;
  if (tree.health === 'thirsty') return `Your ${tree.subject} tree needs some water. Try a quick revision or quiz.`;
  if (tree.stage === 'golden_fruit') return `Amazing! Your ${tree.subject} tree is bearing golden fruit. You truly mastered this.`;
  if (tree.progressPct >= 60) return `Great progress! Keep nurturing your ${tree.subject} tree toward fruit.`;
  return `Plant more seeds — start the next ${tree.subject} chapter to grow your tree.`;
}

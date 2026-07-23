import React, { useEffect, useMemo, useState } from 'react';
import { getOrchardTree } from '../../api';
import TreeSprite from './TreeSprite';
import { STAGE_EMOJI } from './treeAssets';

// Milestone checklist grouped by the stage each requirement unlocks.
// Mirrors the Knowledge Orchard growth spec.
const MILESTONE_GROUPS = [
  {
    stage: 'sprout',
    emoji: '🌱',
    title: 'Sprout · Understand',
    items: [
      ['lesson_watched', 'Watch the AI lesson'],
      ['question_asked', 'Ask one question'],
      ['story_done', 'Complete the story'],
    ],
  },
  {
    stage: 'young_plant',
    emoji: '🌿',
    title: 'Young Plant · Practice',
    items: [
      ['homework', 'Do the homework'],
      ['quiz', 'Take the mini quiz'],
      ['flashcards', 'Review flashcards'],
    ],
  },
  {
    stage: 'growing_tree',
    emoji: '🌳',
    title: 'Growing Tree · Remember',
    items: [
      ['active_recall', 'Active recall (no hints)'],
      ['explain_back', 'Explain back to the AI'],
      ['memory_challenge', 'Beat the memory challenge'],
    ],
  },
  {
    stage: 'mature_tree',
    emoji: '🌲',
    title: 'Mature Tree · Apply',
    items: [
      ['word_problems', 'Solve word problems'],
      ['real_life', 'Give real-life examples'],
      ['projects', 'Finish a project'],
    ],
  },
  {
    stage: 'blossom',
    emoji: '🌸',
    title: 'Blossom · One week later',
    items: [['week_retention', 'Pass the 1-week memory check']],
  },
  {
    stage: 'fruit',
    emoji: '🍎',
    title: 'Fruit · One month later',
    items: [['month_retention', 'Pass the 1-month memory check']],
  },
];

// Emoji for a chapter tile based on its stage. Fruit stages use the subject fruit.
function chapterGlyph(chapter, fruitEmoji) {
  if (chapter.isGolden) return '✨';
  if (chapter.stage === 'golden_fruit') return '✨';
  if (chapter.stage === 'fruit') return fruitEmoji || '🍎';
  return STAGE_EMOJI[chapter.stage] || '🌰';
}

export default function OrchardTreeDetail({ studentId, subjectKey, initialTree, onBack }) {
  const [detail, setDetail] = useState(initialTree || null);
  const [loading, setLoading] = useState(!initialTree);
  const [activeChapterId, setActiveChapterId] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!studentId || !subjectKey) return;
      setLoading(true);
      try {
        const res = await getOrchardTree(studentId, subjectKey);
        if (!cancelled) setDetail(res);
      } catch {
        /* keep any initial data */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [studentId, subjectKey]);

  const chapters = useMemo(() => detail?.chapters || [], [detail]);
  const tree = detail?.tree || {};
  const accent = detail?.accentColor || '#7c3aed';
  const fruitEmoji = detail?.fruitEmoji || '🍎';

  const activeChapter = chapters.find((c) => c.chapterId === activeChapterId) || null;

  const fruited = chapters.filter((c) => c.stageIndex >= 6).length;
  const golden = chapters.filter((c) => c.isGolden).length;

  if (loading && !detail) {
    return <div className="eg-orch-loading">🌱 Loading your tree…</div>;
  }
  if (!detail) {
    return (
      <div className="eg-orch-error">
        <p>Could not load this tree.</p>
        <button onClick={onBack}>Back to orchard</button>
      </div>
    );
  }

  return (
    <div className="eg-tree-detail" style={{ '--accent': accent }}>
      <button className="eg-tree-detail-back" onClick={onBack}>← Back to Orchard</button>

      {/* Hero */}
      <div className="eg-tree-detail-hero">
        <div className="eg-tree-detail-hero-art">
          <TreeSprite treeType={detail.treeType} stage={tree.stage} size={220} accentColor={accent} health={tree.health} />
        </div>
        <div className="eg-tree-detail-hero-info">
          <h1>
            <span className="eg-tree-detail-emoji">{detail.treeEmoji}</span> {detail.subject} Tree
          </h1>
          <div className="eg-tree-detail-stage-row">
            <span className="eg-tree-detail-stage">{tree.stageLabel}</span>
            <span className="eg-tree-detail-level">Level {tree.level} of {tree.maxLevel}</span>
            <span className={`eg-tree-detail-health health-${tree.health}`}>
              {tree.health === 'healthy' ? '💚 Healthy' : tree.health === 'thirsty' ? '💧 Thirsty' : '🍂 Needs care'}
            </span>
            <span className="eg-tree-detail-season">{seasonLabel(tree.season)}</span>
          </div>

          <div className="eg-tree-detail-stats">
            <Stat label="Chapters fruited" value={`${fruited} / ${tree.totalChapters}`} />
            <Stat label="Golden fruits" value={golden} icon="✨" />
            <Stat label="Roots (understanding)" value={`${tree.rootsPct}%`} />
            <Stat label="Overall growth" value={`${tree.progressPct}%`} />
          </div>

          {/* Roots bar — the hidden foundation */}
          <div className="eg-tree-detail-roots">
            <span>🫚 Roots — how deeply you understand</span>
            <span className="eg-tree-detail-roots-track">
              <span className="eg-tree-detail-roots-fill" style={{ width: `${tree.rootsPct}%` }} />
            </span>
            <span className="eg-tree-detail-roots-hint">
              {tree.rootsPct >= 90 ? 'Deep roots — golden fruit ready!' : 'Deeper roots grow taller trees.'}
            </span>
          </div>
        </div>
      </div>

      {/* Chapters as seeds/fruits */}
      <div className="eg-tree-detail-chapters-wrap">
        <div className="eg-tree-detail-chapters-head">
          <h2>Chapters — every seed becomes a fruit</h2>
          <p>Each chapter grows on its own. Care for it and it ripens over weeks.</p>
        </div>
        <div className="eg-tree-detail-seedbed">
          {chapters.map((ch) => (
            <button
              key={ch.chapterId}
              className={`eg-seed ${activeChapterId === ch.chapterId ? 'active' : ''} ${ch.isGolden ? 'golden' : ''}`}
              onClick={() => setActiveChapterId(ch.chapterId === activeChapterId ? '' : ch.chapterId)}
              title={`${ch.title} · ${ch.stageLabel}`}
            >
              <span className="eg-seed-glyph">{chapterGlyph(ch, fruitEmoji)}</span>
              <span className="eg-seed-num">Ch {ch.chapterNumber}</span>
              <span className="eg-seed-stage">{ch.stageLabel}</span>
              <span className="eg-seed-bar">
                <span style={{ width: `${(ch.stageIndex / 7) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Selected chapter milestone checklist */}
      {activeChapter && (
        <div className="eg-chapter-panel">
          <div className="eg-chapter-panel-head">
            <div>
              <span className="eg-chapter-panel-glyph">{chapterGlyph(activeChapter, fruitEmoji)}</span>
              <div>
                <strong>{activeChapter.title}</strong>
                <span>{activeChapter.stageLabel} · Roots {activeChapter.rootsPct}%</span>
              </div>
            </div>
            <button className="eg-chapter-panel-close" onClick={() => setActiveChapterId('')}>✕</button>
          </div>

          <div className="eg-chapter-milestones">
            {MILESTONE_GROUPS.map((group) => {
              const done = group.items.filter(([key]) => activeChapter.milestones?.[key]).length;
              const complete = done === group.items.length;
              return (
                <div key={group.stage} className={`eg-mstone-group ${complete ? 'complete' : ''}`}>
                  <div className="eg-mstone-group-head">
                    <span>{group.emoji} {group.title}</span>
                    <span className="eg-mstone-count">{done}/{group.items.length}</span>
                  </div>
                  <ul>
                    {group.items.map(([key, label]) => {
                      const checked = Boolean(activeChapter.milestones?.[key]);
                      return (
                        <li key={key} className={checked ? 'checked' : ''}>
                          <span className="eg-mstone-check">{checked ? '✅' : '⭕️'}</span>
                          {label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }) {
  return (
    <div className="eg-tree-detail-stat">
      <strong>{icon ? `${icon} ` : ''}{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function seasonLabel(season) {
  switch (season) {
    case 'spring': return '🌱 Spring';
    case 'summer': return '☀️ Summer';
    case 'autumn': return '🍂 Autumn';
    case 'winter': return '❄️ Winter';
    default: return '🌱 Spring';
  }
}

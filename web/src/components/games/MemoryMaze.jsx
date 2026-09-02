import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getFlashcardOverview, getFlashcardCards, logGameSession } from '../../api';

const PAIR_COUNT = 8;
const MIN_PAIRS = 3;
const MISMATCH_DELAY_MS = 850;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Memory Maze — flip tiles to pair each question with its matching answer.
 * Reuses the same chapter content as AI Flashcards (no separate content
 * pipeline), so a chapter is playable the moment its flashcards exist.
 *
 * Props: studentId, onArcadeBackReady
 */
export default function MemoryMaze({ studentId, onArcadeBackReady }) {
  const [phase, setPhase] = useState('loading'); // loading | picker | playing | summary | empty
  const [subjects, setSubjects] = useState([]);
  const [activeSubjectKey, setActiveSubjectKey] = useState(null);
  const [error, setError] = useState(null);

  const [session, setSession] = useState(null); // { subjectKey, subjectName, accent, treeEmoji, scope, deckId, chapterId, chapterTitle, totalPairs }
  const [tiles, setTiles] = useState([]);
  const [flippedIds, setFlippedIds] = useState([]);
  const [matchedPairIds, setMatchedPairIds] = useState([]);
  const [cleanPairIds, setCleanPairIds] = useState([]); // pairs matched with no prior miss
  const [missedPairIds, setMissedPairIds] = useState([]);
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadOverview = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await getFlashcardOverview(studentId);
      const subs = (res && res.subjects) || [];
      setSubjects(subs);
      setActiveSubjectKey(subs[0] ? subs[0].subjectKey : null);
      setPhase(subs.length ? 'picker' : 'empty');
    } catch (e) {
      setError('Could not load Memory Maze chapters.');
      setPhase('empty');
    }
  }, [studentId]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (typeof onArcadeBackReady !== 'function') return undefined;
    onArcadeBackReady(() => {
      if (phase === 'playing' || phase === 'summary') {
        setPhase('picker');
        return true;
      }
      return false;
    });
    return () => onArcadeBackReady(null);
  }, [phase, onArcadeBackReady]);

  const activeSubject = useMemo(
    () => subjects.find((s) => s.subjectKey === activeSubjectKey) || null,
    [subjects, activeSubjectKey],
  );

  const startGame = useCallback(async (subject, chapter) => {
    const scope = chapter ? 'deck' : 'all';
    setPhase('loading');
    try {
      const res = await getFlashcardCards(studentId, {
        subject: subject.subjectKey,
        deckId: chapter ? chapter.deckId : undefined,
        scope,
        mode: 'all',
        limit: PAIR_COUNT,
      });
      const cards = (res && res.cards) || [];
      if (cards.length < MIN_PAIRS) {
        setError('Not enough cards here yet for a memory match — try another chapter.');
        setPhase('picker');
        return;
      }
      const pairTiles = shuffle(
        cards.flatMap((c) => [
          { id: `${c.flashcardId}-q`, pairId: c.flashcardId, text: c.front, side: 'q' },
          { id: `${c.flashcardId}-a`, pairId: c.flashcardId, text: c.back, side: 'a' },
        ]),
      );
      setSession({
        subjectKey: subject.subjectKey,
        subjectName: subject.displayName,
        accent: subject.accent,
        treeEmoji: subject.treeEmoji,
        scope,
        deckId: chapter ? chapter.deckId : null,
        chapterId: chapter ? chapter.chapterId : null,
        chapterTitle: chapter ? chapter.title : 'All chapters',
        totalPairs: cards.length,
      });
      setTiles(pairTiles);
      setFlippedIds([]);
      setMatchedPairIds([]);
      setCleanPairIds([]);
      setMissedPairIds([]);
      setMoves(0);
      setLocked(false);
      setStartedAt(Date.now());
      setError(null);
      setPhase('playing');
    } catch (e) {
      setError('Could not start Memory Maze.');
      setPhase('picker');
    }
  }, [studentId]);

  const finishGame = useCallback(async (finalCleanPairIds, finalMoves, sess) => {
    setPhase('summary');
    if (!sess) return;
    setSaving(true);
    try {
      await logGameSession({
        gameKey: 'memory_maze',
        subjectKey: sess.subjectKey,
        chapterId: sess.chapterId || undefined,
        chapterScope: sess.scope === 'deck' ? sess.chapterTitle : 'all',
        score: finalCleanPairIds.length,
        total: sess.totalPairs,
        durationMs: startedAt ? Date.now() - startedAt : undefined,
        meta: { moves: finalMoves, pairs: sess.totalPairs },
      });
    } catch { /* non-fatal */ }
    setSaving(false);
  }, [startedAt]);

  // Not wrapped in useCallback — always needs the freshest tiles/session/moves
  // state, and re-creating it each render is cheap for a small tile grid.
  const flipTile = (tile) => {
    if (locked) return;
    if (matchedPairIds.includes(tile.pairId)) return;
    if (flippedIds.includes(tile.id)) return;
    if (flippedIds.length === 2) return;

    const nextFlipped = [...flippedIds, tile.id];
    setFlippedIds(nextFlipped);
    if (nextFlipped.length < 2) return;

    const [firstId, secondId] = nextFlipped;
    const first = tiles.find((t) => t.id === firstId);
    const second = tiles.find((t) => t.id === secondId);
    const isMatch = Boolean(first && second && first.pairId === second.pairId && first.side !== second.side);
    const nextMoves = moves + 1;
    setMoves(nextMoves);

    if (isMatch) {
      const pairId = first.pairId;
      const wasClean = !missedPairIds.includes(pairId);
      const nextMatched = [...matchedPairIds, pairId];
      const nextClean = wasClean ? [...cleanPairIds, pairId] : cleanPairIds;
      setMatchedPairIds(nextMatched);
      setCleanPairIds(nextClean);
      setFlippedIds([]);
      if (nextMatched.length === session.totalPairs) {
        finishGame(nextClean, nextMoves, session);
      }
    } else {
      setLocked(true);
      setMissedPairIds((prev) => {
        const additions = [first?.pairId, second?.pairId].filter((id) => id && !prev.includes(id));
        return additions.length ? [...prev, ...additions] : prev;
      });
      setTimeout(() => {
        setFlippedIds([]);
        setLocked(false);
      }, MISMATCH_DELAY_MS);
    }
  };

  const playAgain = useCallback(() => {
    if (!session) { loadOverview(); return; }
    const subj = subjects.find((s) => s.subjectKey === session.subjectKey);
    if (!subj) { loadOverview(); return; }
    const chapter = session.deckId ? { deckId: session.deckId, chapterId: session.chapterId, title: session.chapterTitle } : null;
    startGame(subj, chapter);
  }, [session, subjects, startGame, loadOverview]);

  // ── render ────────────────────────────────────────────────────────────────
  if (phase === 'loading') return null;

  if (phase === 'empty') {
    return (
      <div className="eg-fc-empty">
        <div className="eg-fc-empty-emoji">🌀</div>
        <h3>No chapters ready yet</h3>
        <p>{error || 'Memory Maze uses the same chapters as AI Flashcards — check back once your teacher uploads content!'}</p>
        <button className="eg-fc-btn ghost" onClick={loadOverview}>Refresh</button>
      </div>
    );
  }

  if (phase === 'picker') {
    return (
      <div className="eg-fc-picker">
        <div className="eg-fc-picker-head">
          <div className="eg-fc-picker-intro">
            <h2>Choose a subject</h2>
            <p>Flip tiles to pair each question with its answer.</p>
          </div>
        </div>

        <div className="eg-fc-subject-tabs" role="tablist">
          {subjects.map((s) => (
            <button
              key={s.subjectKey}
              role="tab"
              aria-selected={s.subjectKey === activeSubjectKey}
              className={`eg-fc-subject-tab ${s.subjectKey === activeSubjectKey ? 'active' : ''} ${s.empty ? 'empty' : ''}`}
              style={{ '--fc-accent': s.accent }}
              onClick={() => { setActiveSubjectKey(s.subjectKey); setError(null); }}
            >
              <span className="eg-fc-subject-emoji">{s.treeEmoji}</span>
              <span className="eg-fc-subject-name">{s.displayName}</span>
              <span className="eg-fc-subject-meta">{s.empty ? 'Coming soon' : `${s.totalCards} cards`}</span>
            </button>
          ))}
        </div>

        {error && <div className="eg-fc-inline-note">{error}</div>}

        <section className="eg-fc-chapters" style={{ '--fc-accent': activeSubject ? activeSubject.accent : '#ec4899' }}>
          {activeSubject && activeSubject.chapters.length === 0 && (
            <div className="eg-fc-chapters-empty">
              <div className="eg-fc-chapters-empty-emoji">{activeSubject.treeEmoji}</div>
              <h3>No {activeSubject.displayName} chapters yet</h3>
              <p>Memory Maze appears automatically once flashcards exist for {activeSubject.displayName}.</p>
            </div>
          )}
          {activeSubject && activeSubject.chapters.length > 0 && (
            <>
              <div className="eg-fc-chapters-head">
                <h3>{activeSubject.treeEmoji} {activeSubject.displayName} chapters</h3>
                <span className="eg-fc-chapters-count">{activeSubject.chapters.length} uploaded</span>
              </div>
              <div className="eg-fc-chapters-scroll">
                <button
                  className="eg-fc-chapter all"
                  style={{ '--fc-accent': activeSubject.accent }}
                  onClick={() => startGame(activeSubject, null)}
                >
                  <span className="eg-fc-chapter-title">🎲 All chapters</span>
                  <span className="eg-fc-chapter-sub">Random mix from {activeSubject.displayName}</span>
                  <span className="eg-fc-chapter-badges">
                    <span className="eg-fc-badge">{activeSubject.totalCards} cards</span>
                  </span>
                </button>

                {activeSubject.chapters.map((ch) => (
                  <button
                    key={ch.deckId}
                    className="eg-fc-chapter"
                    style={{ '--fc-accent': activeSubject.accent }}
                    onClick={() => startGame(activeSubject, ch)}
                  >
                    <span className="eg-fc-chapter-title">
                      {ch.chapterNumber ? <em className="eg-fc-chnum">{ch.chapterNumber}</em> : null}
                      {ch.title}
                    </span>
                    <span className="eg-fc-chapter-badges">
                      <span className="eg-fc-badge">{ch.cardCount} cards</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  if (phase === 'summary') {
    const pairs = session?.totalPairs || 0;
    const pct = pairs ? Math.round((cleanPairIds.length / pairs) * 100) : 0;
    return (
      <div className="eg-fc-summary">
        <div className="eg-fc-summary-emoji">{pct >= 80 ? '🏆' : pct >= 50 ? '🌟' : '💪'}</div>
        <h3>Maze cleared!</h3>
        <p className="eg-fc-summary-sub">
          {session ? `${session.subjectName} · ${session.chapterTitle}` : ''}
        </p>
        <div className="eg-fc-summary-stats">
          <div><strong>{pairs}</strong><span>pairs matched</span></div>
          <div><strong>{pct}%</strong><span>clean matches</span></div>
          <div><strong>{moves}</strong><span>total flips</span></div>
        </div>
        <p className="eg-fc-summary-note">
          {saving ? 'Saving your progress…' : '✅ Progress saved to your Orchard tree.'}
        </p>
        <div className="eg-fc-summary-actions">
          <button className="eg-fc-btn ghost" onClick={playAgain}>🔁 Play again</button>
          <button className="eg-fc-btn" onClick={() => loadOverview()}>Pick another chapter</button>
        </div>
      </div>
    );
  }

  // phase === 'playing'
  const accent = session ? session.accent : '#ec4899';
  return (
    <div className="eg-mm-play" style={{ '--fc-accent': accent }}>
      <div className="eg-fc-play-head">
        <div className="eg-fc-play-title">
          <span className="eg-fc-play-emoji">{session?.treeEmoji}</span>
          <div>
            <strong>{session?.subjectName}</strong>
            <span className="eg-fc-play-chapter">{session?.chapterTitle}</span>
          </div>
        </div>
        <button className="eg-fc-btn ghost sm" onClick={() => setPhase('picker')}>Exit</button>
      </div>

      <div className="eg-mm-meta">
        <span>{matchedPairIds.length} / {session?.totalPairs} pairs</span>
        <span>{moves} flips</span>
      </div>

      <div className="eg-mm-grid">
        {tiles.map((tile) => {
          const isFlipped = flippedIds.includes(tile.id);
          const isMatched = matchedPairIds.includes(tile.pairId);
          return (
            <button
              key={tile.id}
              type="button"
              className={`eg-mm-tile ${isFlipped || isMatched ? 'revealed' : ''} ${isMatched ? 'matched' : ''} ${tile.side}`}
              onClick={() => flipTile(tile)}
              disabled={isMatched}
            >
              {isFlipped || isMatched ? (
                <span className="eg-mm-tile-text">{tile.text}</span>
              ) : (
                <span className="eg-mm-tile-glyph">🌀</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

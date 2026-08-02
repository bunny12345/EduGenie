import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getFlashcardOverview, getFlashcardCards, submitFlashcardReview, logGameSession, completeFlashcardChapter } from '../../api';

/**
 * AI Flashcards — pick a subject + chapter (or all chapters) and study a deck of
 * smart cards. Each answer feeds the spaced-repetition schedule on the backend
 * (1 / 3 / 7 / 14 / 30 days), so cards resurface exactly when they should.
 *
 * Props:
 *   studentId      – the learner
 *   onAskTutor({ subjectName, chapterTitle, question, answer }) – deep-link to AI Tutor
 *   onCoinsEarned(totalCoins) – bubble the new coin balance up to the top bar
 */
export default function Flashcards({ studentId, onAskTutor, onCoinsEarned }) {
  const [phase, setPhase] = useState('loading'); // loading | picker | playing | summary | empty
  const [subjects, setSubjects] = useState([]);
  const [activeSubjectKey, setActiveSubjectKey] = useState(null);
  const [mode, setMode] = useState('review'); // review | all
  const [error, setError] = useState(null);

  // session state
  const [session, setSession] = useState(null); // { subjectKey, subjectName, accent, scope, chapterId, chapterTitle }
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ attempts: 0, correct: 0, done: 0 });
  const [totalToStudy, setTotalToStudy] = useState(0);
  const [lastSchedule, setLastSchedule] = useState(null);
  const [startedAt, setStartedAt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [coinAward, setCoinAward] = useState(null); // { awarded, coins, alreadyEarned }

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
      setError('Could not load your flashcards.');
      setPhase('empty');
    }
  }, [studentId]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const activeSubject = useMemo(
    () => subjects.find((s) => s.subjectKey === activeSubjectKey) || null,
    [subjects, activeSubjectKey],
  );

  const startSession = useCallback(async (subject, chapter, modeOverride) => {
    const scope = chapter ? 'deck' : 'all';
    const useMode = modeOverride || mode;
    setPhase('loading');
    try {
      const res = await getFlashcardCards(studentId, {
        subject: subject.subjectKey,
        deckId: chapter ? chapter.deckId : undefined,
        scope,
        mode: useMode,
        limit: 20,
      });
      const cards = (res && res.cards) || [];
      if (!cards.length) {
        setError(useMode === 'review' ? 'Nothing due right now — try Practice all!' : 'No cards here yet.');
        setPhase('picker');
        return;
      }
      setSession({
        subjectKey: subject.subjectKey,
        subjectName: subject.displayName,
        accent: subject.accent,
        treeEmoji: subject.treeEmoji,
        scope,
        deckId: chapter ? chapter.deckId : null,
        chapterId: chapter ? chapter.chapterId : null,
        chapterTitle: chapter ? chapter.title : 'All chapters',
        chapter: chapter || null,
      });
      setQueue(cards);
      setCurrent(cards[0]);
      setTotalToStudy(cards.length);
      setStats({ attempts: 0, correct: 0, done: 0 });
      setFlipped(false);
      setLastSchedule(null);
      setCoinAward(null);
      setStartedAt(Date.now());
      setError(null);
      setPhase('playing');
    } catch (e) {
      setError('Could not start the session.');
      setPhase('picker');
    }
  }, [studentId, mode]);

  const finishSession = useCallback(async (finalStats, sess) => {
    setPhase('summary');
    if (!sess) return;
    setSaving(true);
    try {
      await logGameSession({
        gameKey: 'flashcards',
        subjectKey: sess.subjectKey,
        chapterId: sess.chapterId || undefined,
        chapterScope: sess.scope === 'deck' ? sess.chapterTitle : 'all',
        score: finalStats.correct,
        total: finalStats.attempts,
        durationMs: startedAt ? Date.now() - startedAt : undefined,
        meta: { cards: finalStats.done },
      });
      // Finishing every card in a single chapter earns a one-time 100-coin bonus.
      if (sess.scope === 'deck' && sess.deckId) {
        const res = await completeFlashcardChapter({
          studentId,
          deckId: sess.deckId,
          subjectKey: sess.subjectKey,
          chapterTitle: sess.chapterTitle,
        });
        if (res) {
          setCoinAward({
            awarded: Number(res.awarded || 0),
            coins: Number(res.coins || 0),
            alreadyEarned: Boolean(res.alreadyEarned),
          });
          if (typeof onCoinsEarned === 'function') onCoinsEarned(Number(res.coins || 0));
        }
      }
    } catch { /* non-fatal */ }
    setSaving(false);
  }, [startedAt, studentId, onCoinsEarned]);

  const rate = async (rating) => {
    if (!current) return;
    const card = current;
    const gotIt = rating !== 'again';

    // Advance the spaced-repetition schedule server-side.
    let schedule = null;
    try {
      const res = await submitFlashcardReview({ flashcardId: card.flashcardId, rating });
      schedule = res && res.schedule;
    } catch { /* keep the session flowing even if the write hiccups */ }
    setLastSchedule(gotIt ? schedule : null);

    const nextStats = {
      attempts: stats.attempts + 1,
      correct: stats.correct + (gotIt ? 1 : 0),
      done: stats.done + (gotIt ? 1 : 0),
    };
    setStats(nextStats);

    // "again" re-queues the card at the end so it comes back this session.
    const rest = queue.slice(1);
    const nextQueue = gotIt ? rest : [...rest, card];
    setQueue(nextQueue);

    if (!nextQueue.length) {
      setCurrent(null);
      finishSession(nextStats, session);
    } else {
      setCurrent(nextQueue[0]);
      setFlipped(false);
    }
  };

  // Replay the same chapter from the top — practise every card again.
  const repeatChapter = useCallback(() => {
    if (!session) { loadOverview(); return; }
    const subj = subjects.find((s) => s.subjectKey === session.subjectKey);
    if (!subj) { loadOverview(); return; }
    startSession(subj, session.chapter || null, 'all');
  }, [session, subjects, startSession, loadOverview]);

  // Send the current card into the AI Tutor for the matching subject + chapter.
  const askTutorForCard = useCallback((card) => {
    if (!card || typeof onAskTutor !== 'function' || !session) return;
    onAskTutor({
      subjectName: session.subjectName,
      subjectKey: session.subjectKey,
      chapterTitle: card.chapterTitle || session.chapterTitle,
      question: card.front,
      answer: card.back,
    });
  }, [onAskTutor, session]);

  const studied = stats.done;
  const progressPct = totalToStudy ? Math.min(100, Math.round((studied / totalToStudy) * 100)) : 0;

  // ── render ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return <div className="eg-fc-loading"><span className="eg-fc-spinner" /> Loading flashcards…</div>;
  }

  if (phase === 'empty') {
    return (
      <div className="eg-fc-empty">
        <div className="eg-fc-empty-emoji">🃏</div>
        <h3>No flashcards yet</h3>
        <p>{error || 'Flashcards appear automatically once your teacher uploads chapter content. Check back soon!'}</p>
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
            <p>Cards are built from your teacher's uploaded chapters.</p>
          </div>
          <div className="eg-fc-modetoggle" role="tablist">
            <button
              className={`eg-fc-modeopt ${mode === 'review' ? 'active' : ''}`}
              onClick={() => setMode('review')}
              title="Cards that are due, newest schedule first"
            >⏰ Review due</button>
            <button
              className={`eg-fc-modeopt ${mode === 'all' ? 'active' : ''}`}
              onClick={() => setMode('all')}
              title="Shuffle through every card, whether it's due or not"
            >🔀 Practice all</button>
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
              <span className="eg-fc-subject-meta">
                {s.empty ? 'Coming soon' : `${s.totalCards} cards`}
                {s.dueCount > 0 && <em className="eg-fc-due-dot">{s.dueCount} due</em>}
              </span>
            </button>
          ))}
        </div>

        {error && <div className="eg-fc-inline-note">{error}</div>}

        <section className="eg-fc-chapters" style={{ '--fc-accent': activeSubject ? activeSubject.accent : '#6d5efc' }}>
          {activeSubject && activeSubject.chapters.length === 0 && (
            <div className="eg-fc-chapters-empty">
              <div className="eg-fc-chapters-empty-emoji">{activeSubject.treeEmoji}</div>
              <h3>No {activeSubject.displayName} chapters yet</h3>
              <p>Flashcards are created automatically as soon as your teacher uploads {activeSubject.displayName} chapter content — just like Mathematics.</p>
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
                  onClick={() => startSession(activeSubject, null)}
                >
                  <span className="eg-fc-chapter-title">🎲 All chapters</span>
                  <span className="eg-fc-chapter-sub">Random mix from {activeSubject.displayName}</span>
                  <span className="eg-fc-chapter-badges">
                    <span className="eg-fc-badge">{activeSubject.totalCards} cards</span>
                    {activeSubject.dueCount > 0 && <span className="eg-fc-badge due">{activeSubject.dueCount} due</span>}
                  </span>
                </button>

                {activeSubject.chapters.map((ch) => (
                  <button
                    key={ch.deckId}
                    className="eg-fc-chapter"
                    style={{ '--fc-accent': activeSubject.accent }}
                    onClick={() => startSession(activeSubject, ch)}
                  >
                    <span className="eg-fc-chapter-title">
                      {ch.chapterNumber ? <em className="eg-fc-chnum">{ch.chapterNumber}</em> : null}
                      {ch.title}
                    </span>
                    <span className="eg-fc-chapter-badges">
                      <span className="eg-fc-badge">{ch.cardCount} cards</span>
                      {ch.dueCount > 0 && <span className="eg-fc-badge due">{ch.dueCount} due</span>}
                      {ch.newCount > 0 && <span className="eg-fc-badge new">{ch.newCount} new</span>}
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
    const pct = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0;
    return (
      <div className="eg-fc-summary">
        <div className="eg-fc-summary-emoji">{pct >= 80 ? '🏆' : pct >= 50 ? '🌟' : '💪'}</div>
        <h3>Session complete!</h3>
        <p className="eg-fc-summary-sub">
          {session ? `${session.subjectName} · ${session.chapterTitle}` : ''}
        </p>
        <div className="eg-fc-summary-stats">
          <div><strong>{stats.done}</strong><span>cards mastered</span></div>
          <div><strong>{pct}%</strong><span>accuracy</span></div>
          <div><strong>{stats.attempts}</strong><span>total flips</span></div>
        </div>
        {coinAward && coinAward.awarded > 0 && (
          <div className="eg-fc-coinburst" key="coin-award">
            <span className="eg-fc-coinburst-icon">🪙</span>
            <div>
              <strong>+{coinAward.awarded} coins!</strong>
              <span>Chapter complete — balance {coinAward.coins}</span>
            </div>
          </div>
        )}
        {coinAward && coinAward.awarded === 0 && coinAward.alreadyEarned && (
          <p className="eg-fc-coinnote">🪙 Chapter bonus already collected — nice revision!</p>
        )}
        <p className="eg-fc-summary-note">
          {saving ? 'Saving your progress…' : '✅ Progress saved — cards will return on their own schedule.'}
        </p>
        <div className="eg-fc-summary-actions">
          {session && session.scope === 'deck' && (
            <button className="eg-fc-btn ghost" onClick={repeatChapter}>🔁 Repeat chapter</button>
          )}
          <button className="eg-fc-btn" onClick={() => loadOverview()}>Pick another deck</button>
        </div>
      </div>
    );
  }

  // phase === 'playing'
  const accent = session ? session.accent : '#6d5efc';
  return (
    <div className="eg-fc-play" style={{ '--fc-accent': accent }}>
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

      <div className="eg-fc-progress">
        <div className="eg-fc-progress-bar" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="eg-fc-progress-label">{studied} / {totalToStudy} mastered · {queue.length} left</div>

      {current && (
        <div
          className={`eg-fc-card ${flipped ? 'flipped' : ''}`}
          onClick={() => setFlipped((f) => !f)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); } }}
        >
          <div className="eg-fc-card-inner">
            <div className="eg-fc-card-face front">
              <span className="eg-fc-card-tag">Question</span>
              {current.difficulty && (
                <span className={`eg-fc-difficulty ${current.difficulty}`}>{current.difficulty}</span>
              )}
              <p className="eg-fc-card-text">{current.front}</p>
              {current.hint && !flipped && <span className="eg-fc-card-hint">💡 {current.hint}</span>}
              <span className="eg-fc-flip-hint">Tap to reveal</span>
            </div>
            <div className="eg-fc-card-face back">
              <span className="eg-fc-card-tag answer">Answer</span>
              <p className="eg-fc-card-text">{current.back}</p>
              {onAskTutor && (
                <button
                  type="button"
                  className="eg-fc-askai"
                  onClick={(e) => { e.stopPropagation(); askTutorForCard(current); }}
                  title="Open the AI Tutor for this chapter and get a full explanation"
                >
                  🤖 Ask AI to explain
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!flipped ? (
        <div className="eg-fc-actions">
          <button className="eg-fc-reveal" onClick={() => setFlipped(true)}>Show answer</button>
        </div>
      ) : (
        <div className="eg-fc-rate">
          <button className="eg-fc-ratebtn again" onClick={() => rate('again')}>
            🔁 <span>Again</span>
          </button>
          <button className="eg-fc-ratebtn good" onClick={() => rate('good')}>
            ✅ <span>Got it</span>
          </button>
          <button className="eg-fc-ratebtn easy" onClick={() => rate('easy')}>
            ⚡ <span>Easy</span>
          </button>
        </div>
      )}

      {lastSchedule && (
        <div className="eg-fc-schedule-toast" key={lastSchedule.dueAt}>
          🗓️ Next review {lastSchedule.label}
        </div>
      )}
    </div>
  );
}

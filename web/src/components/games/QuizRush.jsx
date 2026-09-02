import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getQuizRushOverview, getQuizRushQuestions, logGameSession } from '../../api';

const QUESTION_COUNT = 10;
const MIN_QUESTIONS = 3;
const TIME_PER_QUESTION = 15; // seconds
const REVEAL_DELAY_MS = 1100;

/**
 * Quiz Rush (arcade) — beat the clock across a chapter's pre-generated MCQs.
 * Reuses the same "generate once per chapter" content model as AI Flashcards
 * and Memory Maze (via QuizRushService on the backend), so play never waits
 * on a live LLM call.
 *
 * Props: studentId, onArcadeBackReady
 */
export default function QuizRush({ studentId, onArcadeBackReady }) {
  const [phase, setPhase] = useState('loading'); // loading | picker | playing | summary | empty
  const [subjects, setSubjects] = useState([]);
  const [activeSubjectKey, setActiveSubjectKey] = useState(null);
  const [error, setError] = useState(null);

  const [session, setSession] = useState(null); // { subjectKey, subjectName, accent, treeEmoji, scope, deckId, chapterId, chapterTitle }
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [startedAt, setStartedAt] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadOverview = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await getQuizRushOverview(studentId);
      const subs = (res && res.subjects) || [];
      setSubjects(subs);
      setActiveSubjectKey(subs[0] ? subs[0].subjectKey : null);
      setPhase(subs.length ? 'picker' : 'empty');
    } catch (e) {
      setError('Could not load Quiz Rush chapters.');
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
      const res = await getQuizRushQuestions(studentId, {
        subject: subject.subjectKey,
        deckId: chapter ? chapter.deckId : undefined,
        scope,
        limit: QUESTION_COUNT,
      });
      const qs = (res && res.questions) || [];
      if (qs.length < MIN_QUESTIONS) {
        setError('Not enough questions here yet — try another chapter.');
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
      });
      setQuestions(qs);
      setCurrentIndex(0);
      setSelectedIndex(null);
      setRevealed(false);
      setScore(0);
      setTimeLeft(TIME_PER_QUESTION);
      setStartedAt(Date.now());
      setError(null);
      setPhase('playing');
    } catch (e) {
      setError('Could not start Quiz Rush.');
      setPhase('picker');
    }
  }, [studentId]);

  const finishGame = useCallback(async (finalScore, total, sess) => {
    setPhase('summary');
    if (!sess) return;
    setSaving(true);
    try {
      await logGameSession({
        gameKey: 'quiz_rush',
        subjectKey: sess.subjectKey,
        chapterId: sess.chapterId || undefined,
        chapterScope: sess.scope === 'deck' ? sess.chapterTitle : 'all',
        score: finalScore,
        total,
        durationMs: startedAt ? Date.now() - startedAt : undefined,
        meta: { questions: total },
      });
    } catch { /* non-fatal */ }
    setSaving(false);
  }, [startedAt]);

  // Not wrapped in useCallback — always needs the freshest question/session state.
  const advance = (nextScore) => {
    const isLast = currentIndex + 1 >= questions.length;
    if (isLast) {
      finishGame(nextScore, questions.length, session);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedIndex(null);
      setRevealed(false);
      setTimeLeft(TIME_PER_QUESTION);
    }
  };

  const selectAnswer = (idx) => {
    if (revealed || phase !== 'playing') return;
    const current = questions[currentIndex];
    if (!current) return;
    const isCorrect = idx === current.correctIndex;
    const nextScore = score + (isCorrect ? 1 : 0);
    setSelectedIndex(idx);
    setRevealed(true);
    setScore(nextScore);
    setTimeout(() => advance(nextScore), REVEAL_DELAY_MS);
  };

  // Countdown for the current question — restarts whenever a fresh question
  // appears, and stops itself (via cleanup) the moment an answer is revealed.
  useEffect(() => {
    if (phase !== 'playing' || revealed) return undefined;
    const id = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, currentIndex, revealed]);

  // Time ran out with no answer picked — counts as a miss, auto-advance.
  useEffect(() => {
    if (phase !== 'playing' || revealed || timeLeft > 0) return undefined;
    setRevealed(true);
    const t = setTimeout(() => advance(score), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase, revealed]);

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
        <div className="eg-fc-empty-emoji">⚡</div>
        <h3>No chapters ready yet</h3>
        <p>{error || 'Quiz Rush appears automatically once a chapter\'s questions are generated — check back soon!'}</p>
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
            <p>Beat the clock with rapid-fire questions from your chapters.</p>
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
              <span className="eg-fc-subject-meta">{s.empty ? 'Coming soon' : `${s.totalQuestions} questions`}</span>
            </button>
          ))}
        </div>

        {error && <div className="eg-fc-inline-note">{error}</div>}

        <section className="eg-fc-chapters" style={{ '--fc-accent': activeSubject ? activeSubject.accent : '#f59e0b' }}>
          {activeSubject && activeSubject.chapters.length === 0 && (
            <div className="eg-fc-chapters-empty">
              <div className="eg-fc-chapters-empty-emoji">{activeSubject.treeEmoji}</div>
              <h3>No {activeSubject.displayName} chapters yet</h3>
              <p>Quiz Rush appears automatically once questions are generated for {activeSubject.displayName}.</p>
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
                    <span className="eg-fc-badge">{activeSubject.totalQuestions} questions</span>
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
                      <span className="eg-fc-badge">{ch.questionCount} questions</span>
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
    const total = questions.length || 0;
    const pct = total ? Math.round((score / total) * 100) : 0;
    return (
      <div className="eg-fc-summary">
        <div className="eg-fc-summary-emoji">{pct >= 80 ? '🏆' : pct >= 50 ? '🌟' : '💪'}</div>
        <h3>Rush complete!</h3>
        <p className="eg-fc-summary-sub">
          {session ? `${session.subjectName} · ${session.chapterTitle}` : ''}
        </p>
        <div className="eg-fc-summary-stats">
          <div><strong>{score}</strong><span>correct</span></div>
          <div><strong>{pct}%</strong><span>accuracy</span></div>
          <div><strong>{total}</strong><span>questions</span></div>
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
  const accent = session ? session.accent : '#f59e0b';
  const current = questions[currentIndex];
  const timerPct = Math.round((timeLeft / TIME_PER_QUESTION) * 100);
  return (
    <div className="eg-qr-play" style={{ '--fc-accent': accent }}>
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

      <div className="eg-qr-meta">
        <span>Question {currentIndex + 1} of {questions.length}</span>
        <span>{score} correct</span>
      </div>

      <div className="eg-qr-timer">
        <span className={`eg-qr-timer-bar ${timeLeft <= 5 ? 'low' : ''}`} style={{ width: `${timerPct}%` }} />
      </div>

      {current && (
        <div className="eg-qr-question-card">
          {current.difficulty && <span className={`eg-fc-difficulty ${current.difficulty}`}>{current.difficulty}</span>}
          <p className="eg-qr-question-text">{current.question}</p>
          <div className="eg-qr-options">
            {(current.options || []).map((opt, i) => {
              const isCorrectOpt = i === current.correctIndex;
              const isSelected = i === selectedIndex;
              const cls = !revealed
                ? ''
                : isCorrectOpt ? 'correct' : (isSelected ? 'wrong' : 'dim');
              return (
                <button
                  key={i}
                  type="button"
                  className={`eg-qr-option ${cls}`}
                  onClick={() => selectAnswer(i)}
                  disabled={revealed}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {revealed && current.explanation && (
            <p className="eg-qr-explanation">💡 {current.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}

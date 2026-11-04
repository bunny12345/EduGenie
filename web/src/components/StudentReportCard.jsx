import React, { useEffect, useRef, useState } from 'react';
import { getStudentReportCards, markReportCardCelebrated } from '../api';
import { subjectTheme, gradeColor, formatMarks } from './reportCardTheme';
import RankBadge from './RankBadge';
import RankCelebration from './RankCelebration';

// Student-facing Report Card page. An exam only shows up here once every
// subject teacher of the class has entered this student's marks (enforced by
// the backend), so students never see a "pending" state.
//
// The teacher portal reuses it (embedded) under a student's progress report via
// `fetchFn`, and additionally shows which exams are still waiting on subjects.
export default function StudentReportCard({ greetingName, className, fetchFn, studentId, embedded = false }) {
  const [cards, setCards] = useState([]);
  const [pending, setPending] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [celebration, setCelebration] = useState(null);
  // Exams already celebrated in this session, so a refresh poll can't replay one.
  const celebratedRef = useRef(new Set());

  useEffect(() => {
    let active = true;
    setCards([]);
    setPending([]);
    setLoaded(false);
    setSelectedId('');
    async function load() {
      try {
        const res = await (fetchFn || getStudentReportCards)();
        if (!active) return;
        const list = Array.isArray(res?.reportCards) ? res.reportCards : [];
        setCards(list);
        setPending(Array.isArray(res?.pending) ? res.pending : []);
        setError('');
        // Top-3 celebration: once per exam, the first time the student opens the page.
        const toCelebrate = embedded ? null : list.find((c) => c.celebrationPending && !celebratedRef.current.has(c.examId));
        if (toCelebrate) {
          celebratedRef.current.add(toCelebrate.examId);
          setSelectedId(toCelebrate.examId);
          setCelebration(toCelebrate);
          markReportCardCelebrated(toCelebrate.examId).catch(() => {});
        }
      } catch (e) {
        if (active) setError(e?.message || 'Unable to load the report card.');
      } finally {
        if (active) setLoaded(true);
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const card = cards.find((c) => c.examId === selectedId) || cards[0] || null;
  const remarks = card ? card.subjects.filter((s) => s.remarks) : [];

  return (
    <section className={embedded ? 'eg-rc eg-rc-embedded' : 'eg-utility eg-rc'}>
      {embedded ? (
        <header className="eg-rc-embedded-head">
          <h3>🎓 Report Cards</h3>
          <p>{greetingName ? `${greetingName}'s` : 'Their'} released exam results — handy for parent-teacher meetings.</p>
        </header>
      ) : (
        <header className="eg-utility-head">
          <span className="eg-utility-icon" aria-hidden="true">🎓</span>
          <div>
            <h1>Report Card</h1>
            <p>Your exam results, subject by subject.</p>
          </div>
        </header>
      )}

      {error ? <p className="eg-loading">{error}</p> : null}

      {pending.length ? (
        <div className="eg-rc-pending">
          {pending.map((p) => (
            <p key={p.examId}>
              <b>⏳ {p.examName}</b> — {p.entered} of {p.total} subjects entered · waiting for {p.missingSubjects.join(', ')}
            </p>
          ))}
        </div>
      ) : null}

      {cards.length > 1 ? (
        <div className="eg-rc-tabs" role="tablist">
          {cards.map((c) => (
            <button
              key={c.examId}
              type="button"
              role="tab"
              aria-selected={card?.examId === c.examId}
              className={`eg-rc-tab ${card?.examId === c.examId ? 'active' : ''}`}
              onClick={() => setSelectedId(c.examId)}
            >
              {c.examName}
            </button>
          ))}
        </div>
      ) : null}

      {card ? (
        <article className="eg-rc-sheet">
          <span className="eg-rc-deco eg-rc-deco-sun" aria-hidden="true">☀️</span>
          <span className="eg-rc-deco eg-rc-deco-rainbow" aria-hidden="true">🌈</span>
          <span className="eg-rc-deco eg-rc-deco-star" aria-hidden="true">⭐</span>
          <span className="eg-rc-deco eg-rc-deco-flower" aria-hidden="true">🌼</span>

          <div className="eg-rc-title">
            <span className="eg-rc-logo"><img src="/logo.png" alt="" /></span>
            <h2>REPORT CARD</h2>
            <span className="eg-rc-exam">{card.examName}</span>
          </div>

          <div className="eg-rc-ident">
            <div><label>Student Name</label><strong>{greetingName || 'Student'}</strong></div>
            <div><label>Class</label><strong>{card.className || className || ''}</strong></div>
          </div>

          <div className="eg-rc-table">
            <div className="eg-rc-th">SUBJECT</div>
            <div className="eg-rc-th">MARKS</div>
            <div className="eg-rc-th eg-rc-col-score">SCORE</div>
            <div className="eg-rc-th">GRADE</div>
            {card.subjects.map((s) => {
              const theme = subjectTheme(s.subject);
              return (
                <React.Fragment key={s.subject}>
                  <div className="eg-rc-td eg-rc-subject" style={{ background: theme.soft, borderColor: theme.color }}>
                    <span className="eg-rc-subject-icon" style={{ background: theme.gradient }} aria-hidden="true">{theme.emoji}</span>
                    <span className="eg-rc-subject-name" style={{ color: theme.dark }}>{s.subject}</span>
                  </div>
                  <div className="eg-rc-td eg-rc-marks" style={{ color: theme.dark }}>
                    <strong>{formatMarks(s.marks)}</strong><span>/{formatMarks(s.maxMarks)}</span>
                  </div>
                  <div className="eg-rc-td eg-rc-col-score">
                    <div className="eg-rc-meter" style={{ background: theme.soft }}>
                      <span style={{ width: `${Math.max(0, Math.min(100, s.percentage))}%`, background: theme.gradient }} />
                    </div>
                    <em style={{ color: theme.dark }}>{formatMarks(s.percentage)}%</em>
                  </div>
                  <div className="eg-rc-td eg-rc-grade">
                    <span style={{ background: gradeColor(s.grade) }}>{s.grade}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          <div className="eg-rc-summary">
            <div className="eg-rc-stat"><label>Total</label><strong>{formatMarks(card.total)}<small>/{formatMarks(card.maxTotal)}</small></strong></div>
            <div className="eg-rc-stat"><label>Percentage</label><strong>{formatMarks(card.percentage)}%</strong></div>
            {card.rank && card.rank <= 3 ? (
              <div className={`eg-rc-rank eg-rc-rank-${card.rank}`}>
                <RankBadge rank={card.rank} size={card.rank === 1 ? 92 : 82} />
                <span>{embedded ? `Class rank ${card.rank} of ${card.classSize}` : `${['', '1st', '2nd', '3rd'][card.rank]} in ${card.className || 'class'}`}</span>
              </div>
            ) : null}
            {embedded && card.rank && card.rank > 3 ? (
              <div className="eg-rc-stat"><label>Class rank</label><strong>{card.rank}<small> of {card.classSize}</small></strong></div>
            ) : null}
            <div className="eg-rc-medal" style={{ background: gradeColor(card.grade) }}>
              <span>Overall</span>
              <strong>{card.grade}</strong>
            </div>
          </div>

          {card.toppers?.length ? (
            <div className="eg-rc-toppers">
              <b>🏆 Class Toppers</b>
              {card.toppers.map((t) => (
                <span key={`${t.rank}-${t.name}`}><i>{['', '🥇', '🥈', '🥉'][t.rank]}</i>{t.name}</span>
              ))}
            </div>
          ) : null}

          <div className="eg-rc-remarks">
            <div className="eg-rc-bar">FEEDBACK &amp; REMARKS</div>
            <div className="eg-rc-remarks-box">
              {remarks.length ? remarks.map((s) => {
                const theme = subjectTheme(s.subject);
                return (
                  <p key={s.subject}>
                    <b style={{ color: theme.dark }}>{theme.emoji} {s.subject}:</b> {s.remarks}
                  </p>
                );
              }) : <p className="eg-rc-muted">Keep up the great work! 🌟</p>}
            </div>
          </div>
        </article>
      ) : null}

      {loaded && !card && !error ? (
        <article className="cardish eg-utility-card eg-rc-empty">
          <span aria-hidden="true">📝</span>
          <strong>No report card yet</strong>
          <p>{embedded
            ? 'No report card has been released for this student yet. It appears once every subject teacher has added marks.'
            : 'Your results appear here as soon as every subject teacher has added their marks.'}</p>
        </article>
      ) : null}

      {celebration ? (
        <RankCelebration
          rank={celebration.rank}
          name={greetingName}
          className={celebration.className || className}
          examName={celebration.examName}
          onClose={() => setCelebration(null)}
        />
      ) : null}
    </section>
  );
}

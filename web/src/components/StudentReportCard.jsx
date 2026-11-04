import React, { useEffect, useState } from 'react';
import { getStudentReportCards } from '../api';
import { subjectTheme, gradeColor, formatMarks } from './reportCardTheme';

// Student-facing Report Card page. An exam only shows up here once every
// subject teacher of the class has entered this student's marks (enforced by
// the backend), so there is no "pending" state to render.
export default function StudentReportCard({ greetingName, className }) {
  const [cards, setCards] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await getStudentReportCards();
        if (!active) return;
        setCards(Array.isArray(res?.reportCards) ? res.reportCards : []);
        setError('');
      } catch (e) {
        if (active) setError(e?.message || 'Unable to load your report card.');
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
  }, []);

  const card = cards.find((c) => c.examId === selectedId) || cards[0] || null;
  const remarks = card ? card.subjects.filter((s) => s.remarks) : [];

  return (
    <section className="eg-utility eg-rc">
      <header className="eg-utility-head">
        <span className="eg-utility-icon" aria-hidden="true">🎓</span>
        <div>
          <h1>Report Card</h1>
          <p>Your exam results, subject by subject.</p>
        </div>
      </header>

      {error ? <p className="eg-loading">{error}</p> : null}

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
            <div className="eg-rc-medal" style={{ background: gradeColor(card.grade) }}>
              <span>Overall</span>
              <strong>{card.grade}</strong>
            </div>
          </div>

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
          <p>Your results appear here as soon as every subject teacher has added their marks.</p>
        </article>
      ) : null}
    </section>
  );
}

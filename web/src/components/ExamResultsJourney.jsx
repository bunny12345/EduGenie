import React, { useEffect, useId, useRef, useState } from 'react';
import { getStudentReportCards } from '../api';
import { examChange, examJourney, examValue } from './examJourney';
import { formatMarks, subjectTheme } from './reportCardTheme';

function Change({ value, baseline = 'previous exam', emptyLabel = 'First result' }) {
  const tone = value == null ? 'new' : value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return (
    <span className={`eg-exam-change ${tone}`}>
      {value == null ? emptyLabel : value > 0 ? `↑ Up ${formatMarks(value)} pp` : value < 0 ? `↓ Down ${formatMarks(Math.abs(value))} pp` : '→ No change'}
      {value != null && <small>vs {baseline}</small>}
    </span>
  );
}

export default function ExamResultsJourney({ studentId, fetchFn, refreshKey = 0 }) {
  const [state, setState] = useState({ cards: null, error: '' });
  const [subject, setSubject] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [retry, setRetry] = useState(0);
  const gradientId = useId();
  const chartRef = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(640);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    setState({ cards: null, error: '' });
    setSelectedId('');
    setSubject('');
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await (fetchFn ? fetchFn(studentId) : getStudentReportCards());
        if (res?.success === false) throw new Error(res.error || 'Unable to retrieve exam results.');
        if (!Array.isArray(res?.reportCards)) throw new Error('Unable to retrieve exam results.');
        const cards = examJourney(res.reportCards);
        if (active) setState({ cards, error: '' });
      } catch (e) {
        if (active) setState((old) => ({ ...old, error: e.message || 'Unable to retrieve exam results.' }));
      } finally {
        inFlight = false;
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [studentId, fetchFn, refreshKey, retry]);

  useEffect(() => {
    if (!chartRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [state.cards]);

  const cards = state.cards || [];
  const choices = [...new Map(cards.flatMap((card) => card.subjects).map((row) => [row.key, row.subject])).entries()];
  const activeSubject = choices.some(([key]) => key === subject) ? subject : '';
  const name = choices.find(([key]) => key === activeSubject)?.[1] || 'Overall';
  const color = activeSubject ? subjectTheme(name).color : '#6355dc';
  const found = cards.findIndex((card) => card.examId === selectedId);
  const selectedIndex = found >= 0 ? found : cards.length - 1;
  const selected = cards[selectedIndex];
  const values = cards.map((card) => examValue(card, activeSubject));
  const previous = selectedIndex > 0 ? values[selectedIndex - 1] : null;
  const latest = values[values.length - 1];
  const latestChange = examChange(latest, values[values.length - 2]);
  const firstChange = examChange(latest, values[0]);
  const width = Math.max(640, availableWidth, cards.length * 140 + 70);
  const x = (index) => cards.length === 1 ? width / 2 : 70 + index / Math.max(1, cards.length - 1) * (width - 140);
  const y = (value) => 235 - value / 100 * 180;
  const selectedRow = selected?.subjects.find((row) => row.key === activeSubject);

  return (
    <section className="eg-exam-journey" aria-label="Exam Results Journey">
      <header className="eg-exam-head">
        <div>
          <span className="eg-exam-eyebrow">YOUR REPORT-CARD STORY</span>
          <h3>Exam Results Journey</h3>
          <p>From one exam to the next — see what is improving and what needs a little practice.</p>
        </div>
        {state.cards && <span className="eg-exam-count">{cards.length} released {cards.length === 1 ? 'exam' : 'exams'}</span>}
      </header>
      {state.error && <div className="eg-exam-error" role="alert">{state.error} <button type="button" onClick={() => setRetry((n) => n + 1)}>Try again</button></div>}
      {!state.cards && !state.error && <div className="eg-exam-skeleton" aria-label="Retrieving exam results" />}
      {state.cards && !cards.length && (
        <div className="eg-exam-empty">
          <span aria-hidden="true">📈</span>
          <h4>Your exam story starts here</h4>
          <p>When all subject marks are ready and your report card is released, your first exam appears here. Each new exam adds a point.</p>
        </div>
      )}
      {!!cards.length && <>
        <div className="eg-exam-filters" role="group" aria-label="Choose exam result subject">
          <button type="button" aria-pressed={!activeSubject} onClick={() => setSubject('')}>All subjects</button>
          {choices.map(([key, label]) => (
            <button type="button" key={key} aria-pressed={activeSubject === key} onClick={() => setSubject(key)}>
              <i style={{ background: subjectTheme(label).color }} />{label}
            </button>
          ))}
        </div>
        <div className="eg-exam-summary">
          <div><small>Latest {name.toLowerCase()} result</small><strong>{latest == null ? 'Not included' : `${formatMarks(latest)}%`}</strong><span>{cards[cards.length - 1].examName}</span></div>
          <div><small>Since the previous exam</small><Change value={latestChange} emptyLabel={latest == null ? 'Not included' : 'First result'} /><span>{cards.length < 2 ? 'The next exam will show your direction.' : 'Compare percentages, not raw marks.'}</span></div>
          <div><small>Your journey so far</small><strong>{cards.length < 2 ? 'Just beginning' : firstChange == null ? 'Not comparable' : `${firstChange > 0 ? '+' : ''}${formatMarks(firstChange)} pp`}</strong><span>{cards.length > 1 ? 'Change from your first to latest exam' : 'One real result. No predictions.'}</span></div>
        </div>
        <div className="eg-exam-chart-heading"><b>{name} · score out of 100%</b><span>↑ Higher result · ↓ Lower result · → Same result</span></div>
        <div className="eg-exam-chart-scroll" ref={chartRef} tabIndex={0} role="region" aria-label="Scrollable exam results chart">
          <svg width={width} height="302" viewBox={`0 0 ${width} 302`} role="group" aria-label={`${name} exam results in exam creation order, from oldest to newest`}>
            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".15" /><stop offset="100%" stopColor={color} stopOpacity=".01" /></linearGradient></defs>
            {[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1="42" x2={width - 25} y1={y(value)} y2={y(value)} className="eg-exam-grid" /><text x="34" y={y(value) + 4} textAnchor="end" className="eg-exam-axis">{value}%</text></g>)}
            {values.map((value, index) => {
              if (!index || value == null || values[index - 1] == null) return null;
              const prior = values[index - 1];
              const change = examChange(value, prior);
              return <g key={`line-${cards[index].examId}`}>
                <polygon points={`${x(index - 1)},235 ${x(index - 1)},${y(prior)} ${x(index)},${y(value)} ${x(index)},235`} fill={`url(#${gradientId})`} />
                <line x1={x(index - 1)} y1={y(prior)} x2={x(index)} y2={y(value)} stroke={change > 0 ? '#159674' : change < 0 ? '#d97736' : color} strokeWidth="3" strokeLinecap="round" />
              </g>;
            })}
            {cards.map((card, index) => {
              const value = values[index];
              const label = card.examName.length > 18 ? `${card.examName.slice(0, 16)}…` : card.examName;
              return <g key={card.examId}>
                {index === selectedIndex && <line x1={x(index)} x2={x(index)} y1="42" y2="239" stroke={color} strokeOpacity=".2" strokeDasharray="4 5" />}
                <g role="button" tabIndex={0} aria-label={`${card.examName}: ${value == null ? 'subject not included' : `${formatMarks(value)}%`}. Show marks`} aria-pressed={selectedIndex === index}
                  className="eg-exam-point" onClick={() => setSelectedId(card.examId)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(card.examId); } }}>
                  <title>{card.examName}: {value == null ? 'Subject not included' : `${formatMarks(value)}%`}</title>
                  <circle cx={x(index)} cy={value == null ? 235 : y(value)} r="19" fill="transparent" />
                  {value != null ? <><circle cx={x(index)} cy={y(value)} r={index === selectedIndex ? 8 : 6} fill="white" stroke={color} strokeWidth="3" /><text x={x(index)} y={y(value) - 17} textAnchor="middle" className="eg-exam-point-label">{formatMarks(value)}%</text></> : <text x={x(index)} y="220" textAnchor="middle" className="eg-exam-axis">Not included</text>}
                  <text x={x(index)} y="268" textAnchor="middle" className="eg-exam-exam-label">{label}</text>
                  <text x={x(index)} y="287" textAnchor="middle" className="eg-exam-axis">Exam {index + 1}</text>
                </g>
              </g>;
            })}
          </svg>
        </div>
        <p className="eg-exam-help">Select a point to explore its marks. Exams follow their creation order, oldest to newest. New released results are checked every minute.</p>
        {selected && <div className="eg-exam-detail" aria-live="polite">
          <div className="eg-exam-detail-head"><div><small>EXAM {selectedIndex + 1} · SELECTED REPORT CARD</small><h4>{selected.examName}</h4><p>{activeSubject ? name : 'All subjects'} · {activeSubject && !selectedRow ? 'Subject not included' : `${formatMarks(selectedRow ? selectedRow.marks : selected.total)}/${formatMarks(selectedRow ? selectedRow.maxMarks : selected.maxTotal)} marks`}</p></div>
            <Change value={examChange(values[selectedIndex], previous)} emptyLabel={values[selectedIndex] == null ? 'Not included' : 'First result'} />
          </div>
          <div className="eg-exam-subjects">
            {selected.subjects.map((row) => {
              const before = cards[selectedIndex - 1]?.subjects.find((s) => s.key === row.key);
              const theme = subjectTheme(row.subject);
              const change = examChange(row.percentage, before?.percentage);
              return <div key={row.key} className="eg-exam-subject">
                <div><b style={{ color: theme.dark }}>{row.subject}</b><strong>{formatMarks(row.percentage)}%</strong></div>
                <div className="eg-exam-bar"><span style={{ width: `${row.percentage}%`, background: theme.color }} /></div>
                <small>{formatMarks(row.marks)}/{formatMarks(row.maxMarks)} marks <em>{change == null ? 'First result' : `${change > 0 ? '↑ +' : change < 0 ? '↓ ' : '→ '}${formatMarks(change)} pp`}</em></small>
              </div>;
            })}
          </div>
        </div>}
        <footer className="eg-exam-note"><b>Fair comparisons:</b> 20/25 = 40/50 = 80/100 = 80%. Overall = total marks earned ÷ total possible × 100. “pp” means percentage points. Missing subjects are gaps, never zero marks. This panel is separate from your Learning Power score.</footer>
      </>}
    </section>
  );
}

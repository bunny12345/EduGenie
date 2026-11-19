import React, { useEffect, useRef, useState } from 'react';
import { getStudentAttendance, getTeacherAttendance, saveTeacherAttendance } from '../api';

const formatDate = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
});

export function TeacherAttendance() {
  const [query, setQuery] = useState({});
  const [register, setRegister] = useState(null);
  const [marks, setMarks] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const allBox = useRef(null);
  const rows = register?.students || [];
  const present = rows.filter(({ id }) => marks[id]).length;

  useEffect(() => {
    let active = true;
    setRegister(null);
    setError('');
    getTeacherAttendance(query.className, query.date).then((data) => {
      if (!active) return;
      setRegister(data);
      setMarks(Object.fromEntries(data.students.map((student) => [student.id, student.present])));
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [query]);

  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = present > 0 && present < rows.length;
  }, [present, rows.length]);

  const entries = rows.filter((s) => !s.recorded || s.present !== marks[s.id])
    .map(({ id }) => ({ studentId: id, present: marks[id] }));

  function changeQuery(next) {
    if (entries.length && (register?.saved || present !== rows.length) && !window.confirm('Discard unsaved attendance changes?')) return;
    setNotice('');
    setSelected(null);
    setQuery(next);
  }

  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await saveTeacherAttendance({ className: register.className, date: register.date, saved: register.saved, entries });
      setRegister((previous) => ({
        ...previous, saved: true, students: previous.students.map((s) => ({ ...s, recorded: true, present: marks[s.id] })),
      }));
      setNotice('Attendance saved.');
    } catch (failure) {
      setError(failure.message);
    } finally { setBusy(false); }
  }

  return (
    <article className="td-card td-card-framed td-attendance" aria-label="Class attendance">
      <h3>Class attendance</h3>
      <p>Everyone starts marked present on a new day. Uncheck absent students, then save the register.</p>
      {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => changeQuery({ ...query })}>Refresh register</button></p>}
      {notice && <p role="status">{notice}</p>}
      {register && <>
        <div className="td-attendance-controls">
          <label>Class <select value={register.className || ''} disabled={busy || !register.classes.length}
            onChange={(e) => changeQuery({ className: e.target.value, date: register.date || undefined })}>
            {!register.classes.length && <option value="">No assigned classes</option>}
            {register.classes.map((name) => <option key={name}>{name}</option>)}
          </select></label>
          {register.date && <label>Roll-call date <input type="date" value={register.date} min={register.period.startDate}
            max={register.period.endDate < register.today ? register.period.endDate : register.today} disabled={busy}
            onChange={(e) => { if (e.target.value && e.target.validity.valid) changeQuery({ className: register.className, date: e.target.value }); }} /></label>}
        </div>
        {!register.period ? <p>Ask your school admin to set the Progress Graph dates to begin taking attendance.</p> :
          <p>School period: {formatDate(register.period.startDate)} – {formatDate(register.period.endDate)}.</p>}
        {register.period && !register.date && <p>The school attendance period has not started yet.</p>}
        {register.date && rows.length === 0 && <p>No students in this class register.</p>}
        {rows.length > 0 && <>
          <div className="td-attendance-totals">
            <label><input ref={allBox} type="checkbox" checked={present === rows.length} disabled={busy}
              onChange={() => setMarks(Object.fromEntries(rows.map(({ id }) => [id, present !== rows.length])))} /> Select all present</label>
            <strong>{present} present · {rows.length - present} absent</strong>
          </div>
          <ul className="td-attendance-list">
            {rows.map((student) => (
              <li key={student.id}>
                <button type="button" disabled={busy} onClick={() => setSelected(student)} aria-label={`Edit attendance for ${student.name}`}>{student.name}</button>
                <label><input type="checkbox" aria-label={`Present: ${student.name}`} checked={marks[student.id]} disabled={busy}
                  onChange={(e) => setMarks({ ...marks, [student.id]: e.target.checked })} /> {marks[student.id] ? 'Present' : 'Absent'}</label>
              </li>
            ))}
          </ul>
          {selected && <fieldset className="td-attendance-edit">
            <legend>Edit attendance · {selected.name}</legend>
            <p>{formatDate(register.date)}</p>
            <button type="button" disabled={busy} onClick={() => { setMarks({ ...marks, [selected.id]: true }); setSelected(null); }}>Mark present</button>
            <button type="button" disabled={busy} onClick={() => { setMarks({ ...marks, [selected.id]: false }); setSelected(null); }}>Mark absent</button>
            <button type="button" onClick={() => setSelected(null)}>Cancel</button>
          </fieldset>}
          <button type="button" className="td-attendance-save" disabled={busy || !entries.length} onClick={save}>
            {busy ? 'Saving…' : register.saved ? 'Save corrections' : 'Save attendance'}
          </button>
        </>}
      </>}
    </article>
  );
}

export function StudentAttendance() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    getStudentAttendance().then((data) => { if (active) setSnapshot(data); })
      .catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [revision]);
  return (
    <section className="eg-attendance" aria-label="My attendance">
      <h4>My attendance</h4>
      <button type="button" onClick={() => setRevision((value) => value + 1)}>Refresh attendance</button>
      {error && <p role="alert">{error}</p>}
      {snapshot && <>
        {snapshot.period && <p>{formatDate(snapshot.period.startDate)} – {formatDate(snapshot.period.endDate)}</p>}
        <strong className="eg-attendance-score">{snapshot.percentage == null ? '—' : `${snapshot.percentage}%`}</strong>
        <p>{snapshot.recordedDays ? `${snapshot.presentDays} present · ${snapshot.absentDays} absent · ${snapshot.recordedDays} recorded days` :
          snapshot.period ? 'No saved attendance for you in this period yet.' : 'Your school has not set the attendance period yet.'}</p>
        <small>Only saved roll-call days count.</small>
        {snapshot.records.length > 0 && <details>
          <summary>View attendance history</summary>
          <ul>{snapshot.records.map(({ date, present }) => <li key={date}><span>{formatDate(date)}</span><strong>{present ? 'Present' : 'Absent'}</strong></li>)}</ul>
        </details>}
      </>}
    </section>
  );
}

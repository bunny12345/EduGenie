import React, { useEffect, useRef, useState } from 'react';
import { getExamStudents, resumeAllExamStudents, resumeExamStudent } from '../api';

const reasons = { tab_hidden: 'Switched tab / hid test', window_blur: 'Left test window', left_test: 'Left test page',
  app_background: 'App moved to background', connection_lost: 'Connection interrupted', another_device: 'Opened on another device' };

export default function StrictExamStudents({ testId }) {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');
  const [resuming, setResuming] = useState('');
  const [ended, setEnded] = useState(false);
  const deadline = useRef(null);
  const expired = useRef(false);
  function applyRoster(data) {
    if (data.endAt && data.serverNow) {
      deadline.current = Date.now() + new Date(data.endAt).getTime() - new Date(data.serverNow).getTime();
    }
    expired.current = expired.current || data.ended === true || (deadline.current !== null && Date.now() >= deadline.current);
    setEnded(expired.current);
    setStudents(expired.current ? [] : data.students);
    if (expired.current) setOpen(false);
    setError('');
  }
  useEffect(() => {
    deadline.current = null;
    expired.current = false;
    setEnded(false);
    setStudents([]);
    setOpen(false);
    let alive = true;
    let busy = false;
    const load = async () => {
      if (busy || expired.current) return;
      busy = true;
      try {
        const data = await getExamStudents(testId);
        if (alive) applyRoster(data);
      } catch (e) { if (alive) setError(e.message); }
      finally { busy = false; }
    };
    load();
    const timer = setInterval(load, 5000);
    const expiryTimer = setInterval(() => {
      if (deadline.current !== null && Date.now() >= deadline.current) {
        expired.current = true;
        setEnded(true); setStudents([]); setOpen(false);
      }
    }, 1000);
    return () => { alive = false; clearInterval(timer); clearInterval(expiryTimer); };
  }, [testId]);
  async function resume(studentId) {
    setResuming(studentId);
    try {
      if (studentId === 'all') await resumeAllExamStudents(testId);
      else await resumeExamStudent(testId, studentId);
      const data = await getExamStudents(testId);
      applyRoster(data);
    } catch (e) { setError(e.message); }
    finally { setResuming(''); }
  }
  const paused = students.filter((student) => student.status === 'paused');
  if (ended) return null;
  return <div className="td-exam-monitor">
    <button type="button" className="td-inline-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? '▴' : '▾'} Exam monitor · {paused.length} paused
    </button>
    {error ? <p role="alert">{error}</p> : null}
    {open ? <section aria-label="Exam student status">
      <p>Leaving the test or losing connection pauses that student only. These events need review; they are not proof of cheating. The exam clock never stops.</p>
      <button type="button" disabled={!!resuming || !paused.length} onClick={() => resume('all')}>
        {resuming === 'all' ? 'Resuming all…' : 'Resume all'}
      </button>
      {!students.length ? <p>No students have started this test.</p> : null}
      {students.map((student) => <div key={student.studentId} className="td-exam-student">
        <div><strong>{student.name}</strong><span>{student.status} · {student.incidentCount} incident(s)</span>
          {student.lastReason ? <small>{reasons[student.lastReason] || student.lastReason}{student.pausedAt ? ` · ${new Date(student.pausedAt).toLocaleString()}` : ''}</small> : null}</div>
        {student.status === 'paused' ? <button type="button" disabled={!!resuming} onClick={() => resume(student.studentId)}>{resuming === student.studentId ? 'Resuming…' : `Resume ${student.name}`}</button> : null}
      </div>)}
    </section> : null}
  </div>;
}

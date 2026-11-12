import React, { useEffect, useState } from 'react';
import { getExamStudents, resumeExamStudent } from '../api';

const reasons = { tab_hidden: 'Switched tab / hid test', window_blur: 'Left test window', left_test: 'Left test page',
  app_background: 'App moved to background', connection_lost: 'Connection interrupted', another_device: 'Opened on another device' };

export default function StrictExamStudents({ testId }) {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');
  const [resuming, setResuming] = useState('');
  useEffect(() => {
    let alive = true;
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const data = await getExamStudents(testId);
        if (alive) { setStudents(data.students); setError(''); }
      } catch (e) { if (alive) setError(e.message); }
      finally { busy = false; }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [testId]);
  async function resume(studentId) {
    setResuming(studentId);
    try {
      await resumeExamStudent(testId, studentId);
      const data = await getExamStudents(testId);
      setStudents(data.students);
      setError('');
    } catch (e) { setError(e.message); }
    finally { setResuming(''); }
  }
  const paused = students.filter((student) => student.status === 'paused');
  return <div className="td-exam-monitor">
    <button type="button" className="td-inline-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? '▴' : '▾'} Exam monitor · {paused.length} paused
    </button>
    {error ? <p role="alert">{error}</p> : null}
    {open ? <section aria-label="Exam student status">
      <p>Leaving the test or losing connection pauses that student only. These events need review; they are not proof of cheating. The exam clock never stops.</p>
      {!students.length ? <p>No students have started this test.</p> : null}
      {students.map((student) => <div key={student.studentId} className="td-exam-student">
        <div><strong>{student.name}</strong><span>{student.status} · {student.incidentCount} incident(s)</span>
          {student.lastReason ? <small>{reasons[student.lastReason] || student.lastReason}{student.pausedAt ? ` · ${new Date(student.pausedAt).toLocaleString()}` : ''}</small> : null}</div>
        {student.status === 'paused' ? <button type="button" disabled={!!resuming} onClick={() => resume(student.studentId)}>{resuming === student.studentId ? 'Resuming…' : `Resume ${student.name}`}</button> : null}
      </div>)}
    </section> : null}
  </div>;
}

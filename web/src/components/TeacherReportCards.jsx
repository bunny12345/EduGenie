import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getTeacherStudents,
  getReportCardExams,
  createReportCardExam,
  updateReportCardExam,
  getReportCardMarks,
  saveReportCardMarks
} from '../api';
import { subjectTheme, formatMarks } from './reportCardTheme';

// Teacher "Report Cards" page. Teachers pick a class, create (or open) an exam
// template shared by every teacher of that class, then enter marks for their own
// subject only. The server enforces subject ownership and exam-name ownership;
// this UI just reflects it.
export default function TeacherReportCards({ classOptions = [], mySubject = '' }) {
  const [className, setClassName] = useState('');
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [examsLoaded, setExamsLoaded] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [markData, setMarkData] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [marksInput, setMarksInput] = useState('');
  const [remarksInput, setRemarksInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMax, setNewMax] = useState('100');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');

  const theme = subjectTheme(mySubject);
  const exam = exams.find((e) => e.id === selectedExamId) || null;

  useEffect(() => {
    if (!className && classOptions.length) setClassName(classOptions[0]);
  }, [classOptions, className]);

  // Roster for the chosen class.
  useEffect(() => {
    if (!className) { setStudents([]); return undefined; }
    let active = true;
    getTeacherStudents({ className })
      .then((res) => { if (active) setStudents(Array.isArray(res?.students) ? res.students : []); })
      .catch(() => { if (active) setStudents([]); });
    return () => { active = false; };
  }, [className]);

  const loadExams = useCallback(async (preferId) => {
    if (!className) return;
    try {
      const res = await getReportCardExams(className);
      const list = Array.isArray(res?.exams) ? res.exams : [];
      setExams(list);
      setSelectedExamId((prev) => {
        const wanted = preferId || prev;
        return list.some((e) => e.id === wanted) ? wanted : (list[0]?.id || '');
      });
    } catch (e) {
      setExams([]);
      setNotice({ type: 'error', text: e?.message || 'Unable to load exams.' });
    } finally {
      setExamsLoaded(true);
    }
  }, [className]);

  useEffect(() => {
    setExamsLoaded(false);
    setSelectedExamId('');
    setMarkData(null);
    setNotice({ type: '', text: '' });
    loadExams();
  }, [loadExams]);

  const loadMarks = useCallback(async (examId) => {
    if (!examId) { setMarkData(null); return; }
    try {
      const res = await getReportCardMarks(examId);
      setMarkData(res);
    } catch (e) {
      setMarkData(null);
      setNotice({ type: 'error', text: e?.message || 'Unable to load marks.' });
    }
  }, []);

  useEffect(() => {
    setRenaming(false);
    loadMarks(selectedExamId);
  }, [selectedExamId, loadMarks]);

  const marksByStudent = useMemo(() => {
    const map = new Map();
    (markData?.students || []).forEach((s) => map.set(s.id, s));
    return map;
  }, [markData]);

  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => !q || String(s.name || '').toLowerCase().includes(q));
  }, [students, search]);

  useEffect(() => {
    if (!visibleStudents.length) { setSelectedStudentId(''); return; }
    if (!visibleStudents.some((s) => s.id === selectedStudentId)) setSelectedStudentId(visibleStudents[0].id);
  }, [visibleStudents, selectedStudentId]);

  const selectedStudent = students.find((s) => s.id === selectedStudentId) || null;
  const savedRow = selectedStudent ? marksByStudent.get(selectedStudent.id) : null;

  // Refill the entry form whenever the student, exam or saved value changes.
  useEffect(() => {
    setMarksInput(savedRow?.marks === null || savedRow?.marks === undefined ? '' : String(savedRow.marks));
    setRemarksInput(savedRow?.remarks || '');
  }, [selectedStudentId, selectedExamId, savedRow?.marks, savedRow?.remarks]);

  function openCreate() {
    setNewName('');
    setNewMax('100');
    setCreateError('');
    setShowCreate(true);
  }

  async function onCreate(e) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await createReportCardExam({ className, name: newName, maxMarks: Number(newMax) });
      setShowCreate(false);
      setNotice({ type: 'ok', text: `"${res.exam.name}" created. Add your ${mySubject || 'subject'} marks below.` });
      await loadExams(res.exam.id);
    } catch (err) {
      setCreateError(err?.message || 'Unable to create exam.');
    } finally {
      setCreating(false);
    }
  }

  async function onRename(e) {
    e.preventDefault();
    if (!exam) return;
    setRenameError('');
    try {
      const res = await updateReportCardExam(exam.id, { name: renameValue });
      setExams((prev) => prev.map((x) => (x.id === exam.id ? res.exam : x)));
      setRenaming(false);
    } catch (err) {
      setRenameError(err?.message || 'Unable to rename exam.');
    }
  }

  const nextStudentId = (() => {
    const i = visibleStudents.findIndex((s) => s.id === selectedStudentId);
    return i >= 0 && i < visibleStudents.length - 1 ? visibleStudents[i + 1].id : '';
  })();

  async function onSave(goNext) {
    if (!exam || !selectedStudent || saving) return;
    const trimmed = String(marksInput).trim();
    if (trimmed !== '') {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0 || n > exam.maxMarks) {
        setNotice({ type: 'error', text: `Marks must be between 0 and ${formatMarks(exam.maxMarks)}.` });
        return;
      }
    }
    setSaving(true);
    setNotice({ type: '', text: '' });
    try {
      const res = await saveReportCardMarks(exam.id, [{ studentId: selectedStudent.id, marks: trimmed, remarks: remarksInput }]);
      setExams((prev) => prev.map((x) => (x.id === exam.id ? res.exam : x)));
      await loadMarks(exam.id);
      setNotice({ type: 'ok', text: trimmed === '' ? 'Marks cleared.' : `Saved ${selectedStudent.name}'s ${mySubject} marks.` });
      if (goNext && nextStudentId) setSelectedStudentId(nextStudentId);
    } catch (err) {
      setNotice({ type: 'error', text: err?.message || 'Unable to save marks.' });
    } finally {
      setSaving(false);
    }
  }

  const canEdit = !!markData?.canEdit;
  const rootStyle = { '--rc-color': theme.color, '--rc-dark': theme.dark, '--rc-soft': theme.soft };

  return (
    <section className="td-progress-layout td-rc" style={rootStyle}>
      {/* ── Students + plus button ── */}
      <article className="td-card td-card-framed td-progress-student-card">
        <div className="td-rc-head">
          <div>
            <h3>Students</h3>
            <p>Pick a class, then tap a student to add their marks.</p>
          </div>
          <button type="button" className="td-rc-plus" onClick={openCreate} disabled={!className} title="Create a new exam" aria-label="Create a new exam">+</button>
        </div>
        <div className="invite-toolbar">
          <input className="invite-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students by name" />
          <select className="invite-filter" value={className} onChange={(e) => setClassName(e.target.value)}>
            {!classOptions.length ? <option value="">No classes</option> : null}
            {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="td-student-list">
          {visibleStudents.map((s) => {
            const row = marksByStudent.get(s.id);
            const done = row && row.marks !== null && row.marks !== undefined;
            return (
              <button key={s.id} type="button" className={selectedStudentId === s.id ? 'active' : ''} onClick={() => setSelectedStudentId(s.id)}>
                <div>
                  <strong>{s.name || 'Student'}</strong>
                  <span>{s.className || className}</span>
                </div>
                {exam ? (
                  <span className={`td-rc-badge ${done ? 'done' : ''}`}>
                    {done ? `${formatMarks(row.marks)}/${formatMarks(exam.maxMarks)}` : 'Add'}
                  </span>
                ) : null}
              </button>
            );
          })}
          {!visibleStudents.length ? <p className="td-empty">No students available yet for this class.</p> : null}
        </div>
      </article>

      {/* ── Exam + marks entry ── */}
      <article className="td-card td-card-framed td-progress-page-card td-rc-main">
        <div className="td-rc-exams">
          {exams.map((x) => (
            <button key={x.id} type="button" className={`td-rc-exam-chip ${x.id === selectedExamId ? 'active' : ''}`} onClick={() => setSelectedExamId(x.id)}>
              {x.name}
              {x.released ? <span className="td-rc-chip-tick" title="Visible to all students">✓</span> : null}
            </button>
          ))}
          <button type="button" className="td-rc-exam-chip td-rc-exam-new" onClick={openCreate} disabled={!className}>+ New exam</button>
        </div>

        {notice.text ? <p className={`td-rc-notice ${notice.type}`}>{notice.text}</p> : null}

        {!exam && examsLoaded ? (
          <div className="td-rc-empty">
            <span aria-hidden="true">🧾</span>
            <strong>No exams for {className || 'this class'} yet</strong>
            <p>Tap the <b>+</b> button to add an exam such as “Annual Exam”. Every teacher of the class then adds marks for their own subject.</p>
          </div>
        ) : null}

        {exam ? (
          <>
            <header className="td-rc-exam-head">
              <div className="td-rc-exam-title">
                {renaming ? (
                  <form onSubmit={onRename} className="td-rc-rename">
                    <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={60} autoFocus />
                    <button type="submit" className="td-inline-btn">Save</button>
                    <button type="button" className="td-inline-btn" onClick={() => setRenaming(false)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <h2>{exam.name}</h2>
                    {exam.isOwner ? (
                      <button type="button" className="td-inline-btn" onClick={() => { setRenameValue(exam.name); setRenameError(''); setRenaming(true); }}>Rename</button>
                    ) : (
                      <span className="td-rc-lock" title="Only the teacher who created this exam can rename it">🔒 {exam.createdByName ? `Created by ${exam.createdByName}` : 'Name locked'}</span>
                    )}
                  </>
                )}
              </div>
              {renameError ? <p className="td-rc-notice error">{renameError}</p> : null}
              <p className="td-rc-exam-meta">{exam.className} · out of {formatMarks(exam.maxMarks)} per subject</p>
            </header>

            {/* Subject ownership banner */}
            <div className="td-rc-banner" style={{ background: theme.gradient }}>
              <span className="td-rc-banner-emoji" aria-hidden="true">{theme.emoji}</span>
              <div>
                <strong>{mySubject ? `Your subject: ${mySubject}` : 'No subject assigned'}</strong>
                <p>{mySubject
                  ? `You can add and edit ${mySubject} marks only. Other subjects are filled in by their own teachers.`
                  : 'Ask your school admin to assign a subject to your account before entering marks.'}</p>
              </div>
            </div>

            {/* Release tracker */}
            <div className="td-rc-tracker">
              <div className="td-rc-tracker-top">
                <strong>Visible to students: {exam.studentsReleased} of {exam.studentsTotal}</strong>
                <span>{exam.released ? 'All students can see this report card.' : 'A student sees it once every subject below has their marks.'}</span>
              </div>
              <div className="td-rc-tracker-bar">
                <span style={{ width: `${exam.studentsTotal ? Math.round((exam.studentsReleased / exam.studentsTotal) * 100) : 0}%` }} />
              </div>
              <div className="td-rc-subjects">
                {exam.subjects.map((s) => {
                  const t = subjectTheme(s.subject);
                  return (
                    <span key={s.subject} className={`td-rc-subject-chip ${s.isMine ? 'mine' : ''}`} style={{ background: t.soft, color: t.dark, borderColor: t.color }}>
                      <span aria-hidden="true">{t.emoji}</span> {s.subject}
                      <b>{s.entered}/{s.total}</b>
                      {s.done ? <i aria-label="complete">✓</i> : null}
                    </span>
                  );
                })}
                {!exam.subjects.length ? <span className="td-empty">No subject teachers are registered for this class yet.</span> : null}
              </div>
            </div>

            {/* Marks entry */}
            {selectedStudent && canEdit ? (
              <div className="td-rc-entry" style={{ borderColor: theme.color }}>
                <div className="td-rc-entry-head" style={{ background: theme.gradient }}>
                  <span aria-hidden="true">{theme.emoji}</span>
                  <div>
                    <strong>{selectedStudent.name}</strong>
                    <small>{mySubject} marks</small>
                  </div>
                </div>
                <div className="td-rc-entry-body">
                  <label className="td-rc-marks-field">
                    <span>Marks obtained</span>
                    <div>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={exam.maxMarks}
                        step="0.5"
                        value={marksInput}
                        onChange={(e) => setMarksInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave(true); } }}
                        placeholder="0"
                      />
                      <em>/ {formatMarks(exam.maxMarks)}</em>
                    </div>
                  </label>
                  <label className="td-rc-remarks-field">
                    <span>Remark (optional)</span>
                    <input value={remarksInput} maxLength={200} onChange={(e) => setRemarksInput(e.target.value)} placeholder="e.g. Excellent improvement!" />
                  </label>
                  <div className="td-rc-actions">
                    <button type="button" className="td-rc-save" style={{ background: theme.gradient }} disabled={saving} onClick={() => onSave(false)}>
                      {saving ? 'Saving…' : 'Save marks'}
                    </button>
                    {nextStudentId ? (
                      <button type="button" className="td-rc-save secondary" style={{ color: theme.dark, borderColor: theme.color }} disabled={saving} onClick={() => onSave(true)}>
                        Save &amp; next student →
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {selectedStudent && markData && !canEdit ? (
              <p className="td-rc-notice error">You can only enter marks for the subject registered to your account in this class.</p>
            ) : null}
            {!selectedStudent && markData ? <p className="td-empty">Select a student on the left to add marks.</p> : null}
          </>
        ) : null}
      </article>

      {showCreate ? (
        <div className="td-rc-modal-backdrop" onClick={() => !creating && setShowCreate(false)}>
          <form className="td-rc-modal" onClick={(e) => e.stopPropagation()} onSubmit={onCreate}>
            <h3>New exam for {className}</h3>
            <p>Every teacher of this class will use this same exam. Only you can rename it later.</p>
            <label>
              <span>Exam name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Annual Exam" maxLength={60} autoFocus required />
            </label>
            <label>
              <span>Maximum marks per subject</span>
              <input type="number" min="1" max="1000" value={newMax} onChange={(e) => setNewMax(e.target.value)} required />
            </label>
            {createError ? <p className="td-rc-notice error">{createError}</p> : null}
            <div className="td-rc-actions">
              <button type="submit" className="td-rc-save" disabled={creating}>{creating ? 'Creating…' : 'Create exam'}</button>
              <button type="button" className="td-rc-save secondary" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

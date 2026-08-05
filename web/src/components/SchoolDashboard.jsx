import React, { useEffect, useState } from 'react';
import {
  createCurriculumLesson,
  deleteCurriculumLesson,
  deleteCurriculumLessonDocument,
  listCurriculumLessonDocuments,
  listCurriculumLessons,
  listCurriculumSubjects,
  resendSchoolTeacherInvite,
  revokeSchoolTeacherInvite,
  schoolDashboard,
  schoolInviteTeacher,
  schoolInvites,
  schoolRegisterTeacher,
  schoolStudents,
  schoolTeachers,
  schoolUpdateTeacher,
  schoolResetTeacherPassword,
  schoolDeleteTeacher,
  updateCurriculumLesson,
  uploadCurriculumLessonDocument
} from '../api';
import './CurriculumContent.css';

function inviteStatusLabel(invite) {
  const status = String(invite?.status || '').toLowerCase();
  if (status) return status;
  if (invite?.revoked) return 'revoked';
  if (invite?.consumed) return 'used';
  const expiresAt = invite?.expiresAt ? new Date(invite.expiresAt).getTime() : null;
  if (expiresAt && Date.now() > expiresAt) return 'expired';
  return 'active';
}

function shortDate(value) {
  if (!value) return 'TBD';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'TBD';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const GRADE_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12];

function GradeMultiSelect({ selected, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const boxRef = React.useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const toggle = (grade) => {
    const set = new Set(selected);
    if (set.has(grade)) set.delete(grade);
    else set.add(grade);
    onChange(Array.from(set).sort((a, b) => a - b));
  };

  const label = selected.length
    ? selected.map((g) => `Class ${g}`).join(', ')
    : 'Select classes this teacher handles';

  return (
    <div className={`sd-grade-select ${open ? 'is-open' : ''}`} ref={boxRef}>
      <button
        type="button"
        className="sd-grade-trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title={label}
      >
        <span className={selected.length ? '' : 'sd-grade-placeholder'}>{label}</span>
        <span className="sd-grade-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="sd-grade-menu" role="listbox" aria-multiselectable="true">
          {GRADE_OPTIONS.map((grade) => {
            const checked = selected.includes(grade);
            return (
              <label key={grade} className={`sd-grade-option ${checked ? 'is-checked' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(grade)} />
                <span>Class {grade}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function SchoolDashboard({ session, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherSubject, setTeacherSubject] = useState('Mathematics');
  const [teacherLoginId, setTeacherLoginId] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherGrades, setTeacherGrades] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [createdTeacher, setCreatedTeacher] = useState(null);
  const [inviteLink, setInviteLink] = useState('');
  const [dashboard, setDashboard] = useState({ summary: { teachers: 0, students: 0, activeInvites: 0 } });
  const [teachers, setTeachers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [students, setStudents] = useState([]);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteStatusFilter, setInviteStatusFilter] = useState('all');
  const [invitePage, setInvitePage] = useState(1);
  const [inviteTotalPages, setInviteTotalPages] = useState(1);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherPage, setTeacherPage] = useState(1);
  const [teacherTotalPages, setTeacherTotalPages] = useState(1);
  // Teacher management (edit / reset password / delete)
  const [editingTeacherId, setEditingTeacherId] = useState('');
  const [editTeacherForm, setEditTeacherForm] = useState({ name: '', email: '', subject: '', grades: [] });
  const [resetTeacher, setResetTeacher] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [deleteTeacher, setDeleteTeacher] = useState(null);
  const [teacherActionBusy, setTeacherActionBusy] = useState('');
  const [teacherActionNote, setTeacherActionNote] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [studentTotalPages, setStudentTotalPages] = useState(1);
  const [curriculumSubject, setCurriculumSubject] = useState('');
  const [curriculumClassName, setCurriculumClassName] = useState('');
  const [curriculumLessonTitle, setCurriculumLessonTitle] = useState('');
  const [curriculumLessonDescription, setCurriculumLessonDescription] = useState('');
  const [curriculumLessons, setCurriculumLessons] = useState([]);
  const [curriculumDocumentsByLesson, setCurriculumDocumentsByLesson] = useState({});
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumPdfUploading, setCurriculumPdfUploading] = useState(false);
  // Subject → teacher map per class. A lesson can only be filed under a subject
  // that already has a teacher for the selected class.
  const [curriculumClassMap, setCurriculumClassMap] = useState([]);
  const [curriculumPdfFile, setCurriculumPdfFile] = useState(null);
  const [curriculumActiveSubject, setCurriculumActiveSubject] = useState('');
  const [curriculumEditing, setCurriculumEditing] = useState(null);
  const [curriculumRowBusy, setCurriculumRowBusy] = useState('');
  const [curriculumConfirmDelete, setCurriculumConfirmDelete] = useState(null);

  // New: Section-specific loading and refresh states
  const [refreshing, setRefreshing] = useState('');
  const [exportFormat, setExportFormat] = useState(null);

  const INVITES_PER_PAGE = 5;
  const TEACHERS_PER_PAGE = 6;
  const STUDENTS_PER_PAGE = 6;

  // Export data functions
  function exportTeachers(format) {
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `teachers-${session?.schoolId || 'school'}-${timestamp}`;

    if (format === 'csv') {
      const rows = [
        ['Name', 'Email', 'Subject', 'Login ID', 'Created At'],
        ...teachers.map((t) => [
          t?.name || '',
          t?.email || '',
          t?.subject || 'General',
          t?.loginId || '',
          shortDate(t?.createdAt)
        ])
      ];
      const csv = rows.map((r) => r.map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
    setExportFormat(null);
  }

  function exportStudents(format) {
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `students-${session?.schoolId || 'school'}-${timestamp}`;

    if (format === 'csv') {
      const rows = [
        ['Name', 'Class', 'Email', 'Status'],
        ...students.map((s) => [
          s?.name || '',
          s?.className || '',
          s?.email || '',
          s?.status || 'enrolled'
        ])
      ];
      const csv = rows.map((r) => r.map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
    setExportFormat(null);
  }

  // Refresh specific sections
  async function refreshTeachersSection() {
    setRefreshing('teachers');
    await loadTeachers({ q: teacherSearch, page: teacherPage, limit: TEACHERS_PER_PAGE });
    setRefreshing('');
  }

  async function refreshInvitesSection() {
    setRefreshing('invites');
    await loadInvites({ q: inviteSearch, status: inviteStatusFilter, page: invitePage, limit: INVITES_PER_PAGE });
    setRefreshing('');
  }

  async function refreshStudentsSection() {
    setRefreshing('students');
    try {
      const sRes = await schoolStudents({
        q: studentSearch,
        page: studentPage,
        limit: STUDENTS_PER_PAGE
      });
      applyStudents(Array.isArray(sRes?.students) ? sRes.students : [], sRes?.pagination || null);
    } catch (e) {
      setError(e?.message || 'Failed to refresh students');
    }
    setRefreshing('');
  }

  async function refreshAllSections() {
    setRefreshing('all');
    await Promise.all([
      refreshTeachersSection(),
      refreshInvitesSection(),
      refreshStudentsSection()
    ]);
    setRefreshing('');
  }

  function applyInvites(nextInvites, pagination) {
    const safeInvites = Array.isArray(nextInvites) ? nextInvites : [];
    setInvites(safeInvites);
    setInviteTotalPages(Math.max(1, Number(pagination?.totalPages || 1)));
  }

  function applyTeachers(nextTeachers, pagination) {
    const safeTeachers = Array.isArray(nextTeachers) ? nextTeachers : [];
    setTeachers(safeTeachers);
    setTeacherTotalPages(Math.max(1, Number(pagination?.totalPages || 1)));
  }

  function applyStudents(nextStudents, pagination) {
    const safeStudents = Array.isArray(nextStudents) ? nextStudents : [];
    setStudents(safeStudents);
    setStudentTotalPages(Math.max(1, Number(pagination?.totalPages || 1)));
  }

  useEffect(() => {
    if (invitePage > inviteTotalPages) {
      setInvitePage(inviteTotalPages);
    }
  }, [invitePage, inviteTotalPages]);

  useEffect(() => {
    if (teacherPage > teacherTotalPages) {
      setTeacherPage(teacherTotalPages);
    }
  }, [teacherPage, teacherTotalPages]);

  useEffect(() => {
    if (studentPage > studentTotalPages) {
      setStudentPage(studentTotalPages);
    }
  }, [studentPage, studentTotalPages]);

  async function loadInvites(params) {
    const iRes = await schoolInvites(params || {
      q: inviteSearch,
      status: inviteStatusFilter,
      page: invitePage,
      limit: INVITES_PER_PAGE
    });
    applyInvites(Array.isArray(iRes?.invites) ? iRes.invites : [], iRes?.pagination || null);
  }

  async function loadTeachers(params) {
    const tRes = await schoolTeachers(params || {
      q: teacherSearch,
      page: teacherPage,
      limit: TEACHERS_PER_PAGE
    });
    applyTeachers(Array.isArray(tRes?.teachers) ? tRes.teachers : [], tRes?.pagination || null);
    // The roster decides which subjects a class may receive lessons for, so the
    // curriculum panel has to follow every teacher add / edit / removal.
    loadCurriculumSubjectMap();
  }

  const classOptions = Array.from(new Set([
    ...(curriculumClassMap || []).map((entry) => String(entry?.className || '').trim()),
    ...(students || []).map((s) => String(s?.className || '').trim())
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // Subjects that already have a teacher for the selected class. Typing anything
  // else is rejected — the school must register that subject teacher first.
  const curriculumSubjectsForClass = (
    (curriculumClassMap || []).find(
      (entry) => String(entry?.className || '').toLowerCase() === String(curriculumClassName || '').toLowerCase()
    )?.subjects || []
  );

  const curriculumSubjectTyped = String(curriculumSubject || '').trim();
  const curriculumSubjectMatch = curriculumSubjectTyped
    ? curriculumSubjectsForClass.find(
        (s) => String(s.subject || '').toLowerCase() === curriculumSubjectTyped.toLowerCase()
      ) || null
    : null;
  const curriculumSubjectUnknown = Boolean(curriculumSubjectTyped) && !curriculumSubjectMatch;

  // Lessons already filed for the selected class, grouped into the subject tabs
  // shown under the form. Numbering is positional: 1, 2, 3 … per subject.
  const curriculumLessonsForClass = (curriculumLessons || []).filter(
    (lesson) => String(lesson?.class_name || '').toLowerCase() === String(curriculumClassName || '').toLowerCase()
  );

  const curriculumSubjectGroups = (() => {
    const groups = new Map();
    for (const lesson of curriculumLessonsForClass) {
      const subject = String(lesson?.subject || '').trim() || 'Unassigned';
      if (!groups.has(subject)) groups.set(subject, []);
      groups.get(subject).push(lesson);
    }
    return Array.from(groups.entries())
      .map(([subject, lessons]) => ({
        subject,
        lessons: lessons.slice().sort((a, b) => {
          const byOrder = Number(a.order_index || 0) - Number(b.order_index || 0);
          if (byOrder) return byOrder;
          return String(a.created_at || '').localeCompare(String(b.created_at || ''));
        })
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  })();

  const curriculumVisibleGroup =
    curriculumSubjectGroups.find((g) => g.subject === curriculumActiveSubject) || curriculumSubjectGroups[0] || null;

  // What number the lesson about to be uploaded will get.
  const curriculumNextNumber = curriculumSubjectMatch
    ? (curriculumSubjectGroups.find(
        (g) => g.subject.toLowerCase() === curriculumSubjectTyped.toLowerCase()
      )?.lessons.length || 0) + 1
    : null;

  async function loadCurriculumSubjectMap() {
    try {
      const res = await listCurriculumSubjects();
      const classes = Array.isArray(res?.classes) ? res.classes : [];
      setCurriculumClassMap(classes);
      return classes;
    } catch {
      setCurriculumClassMap([]);
      return [];
    }
  }

  async function loadCurriculumPanel({ className = curriculumClassName } = {}) {
    if (!className) {
      setCurriculumLessons([]);
      setCurriculumDocumentsByLesson({});
      return;
    }
    setCurriculumLoading(true);
    try {
      const res = await listCurriculumLessons({ className });
      const lessons = Array.isArray(res?.lessons) ? res.lessons : [];
      setCurriculumLessons(lessons);

      const lessonIds = lessons.map((lesson) => String(lesson.id || '')).filter(Boolean);
      const docEntries = await Promise.all(lessonIds.map(async (lessonId) => {
        try {
          const docsRes = await listCurriculumLessonDocuments(lessonId);
          return [lessonId, Array.isArray(docsRes?.documents) ? docsRes.documents : []];
        } catch {
          return [lessonId, []];
        }
      }));
      setCurriculumDocumentsByLesson(Object.fromEntries(docEntries));
    } catch (e) {
      setNote(e?.message || 'Unable to load curriculum lessons.');
      setCurriculumLessons([]);
      setCurriculumDocumentsByLesson({});
    } finally {
      setCurriculumLoading(false);
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * One action for the admin: create the lesson record and attach the PDF.
   * Numbering, orchard chapters, flashcards and the tutor index all follow from
   * this single upload, so there is no separate "create lesson" step.
   */
  async function onAddCurriculumLesson(e) {
    e.preventDefault();
    if (!curriculumClassName) {
      setNote('Select a class first.');
      return;
    }
    if (!curriculumSubjectMatch) {
      setNote(`No teacher is registered for "${curriculumSubjectTyped || 'that subject'}" in ${curriculumClassName}. Add the subject teacher for this class first, then upload the lesson.`);
      return;
    }
    if (!curriculumLessonTitle.trim()) {
      setNote('Enter a lesson name.');
      return;
    }
    if (!curriculumPdfFile) {
      setNote('Choose the lesson PDF to upload.');
      return;
    }

    setCurriculumPdfUploading(true);
    setNote('');
    let createdLessonId = '';
    try {
      const dataUrl = await readFileAsDataUrl(curriculumPdfFile);

      const created = await createCurriculumLesson({
        teacherId: curriculumSubjectMatch.teacherId,
        subject: curriculumSubjectMatch.subject,
        title: curriculumLessonTitle.trim(),
        description: curriculumLessonDescription.trim() || null,
        className: curriculumClassName,
        isActive: true,
        visibleClassNames: [curriculumClassName]
      });
      if (created?.success === false) throw new Error(created?.error || 'Unable to create the lesson');
      createdLessonId = String(created?.lesson?.id || '');
      if (!createdLessonId) throw new Error('Lesson was created without an id');

      const uploaded = await uploadCurriculumLessonDocument(createdLessonId, {
        fileName: curriculumPdfFile.name,
        mimeType: curriculumPdfFile.type || 'application/pdf',
        data: dataUrl
      });
      if (uploaded?.success === false) throw new Error(uploaded?.error || 'Upload failed');

      const lessonNumber = created?.lesson?.order_index;
      setNote(
        uploaded?.error
          ? `Lesson added with warnings: ${uploaded.error}`
          : `Lesson ${lessonNumber || ''} "${curriculumLessonTitle.trim()}" added to ${curriculumSubjectMatch.subject} · ${curriculumClassName}.`.replace('  ', ' ')
      );
      setCurriculumLessonTitle('');
      setCurriculumLessonDescription('');
      setCurriculumPdfFile(null);
      setCurriculumActiveSubject(curriculumSubjectMatch.subject);
      await loadCurriculumPanel();
    } catch (e2) {
      // Never leave a lesson behind with no content — that would show up as an
      // empty chapter in the orchard.
      if (createdLessonId) {
        try { await deleteCurriculumLesson(createdLessonId); } catch { /* best-effort */ }
        await loadCurriculumPanel();
      }
      setNote(e2?.message || 'Unable to add the lesson.');
    } finally {
      setCurriculumPdfUploading(false);
    }
  }

  async function onSaveCurriculumLessonEdit() {
    const editing = curriculumEditing;
    if (!editing?.lessonId) return;
    if (!String(editing.title || '').trim()) {
      setNote('Lesson name cannot be empty.');
      return;
    }
    setCurriculumRowBusy(editing.lessonId);
    try {
      const res = await updateCurriculumLesson(editing.lessonId, {
        title: editing.title.trim(),
        description: String(editing.description || '').trim() || null
      });
      if (res?.success === false) throw new Error(res?.error || 'Unable to update the lesson');

      if (editing.replacementFile) {
        const dataUrl = await readFileAsDataUrl(editing.replacementFile);
        for (const doc of curriculumDocumentsByLesson[String(editing.lessonId)] || []) {
          await deleteCurriculumLessonDocument(editing.lessonId, doc.id);
        }
        const uploaded = await uploadCurriculumLessonDocument(editing.lessonId, {
          fileName: editing.replacementFile.name,
          mimeType: editing.replacementFile.type || 'application/pdf',
          data: dataUrl
        });
        if (uploaded?.success === false) throw new Error(uploaded?.error || 'Replacement upload failed');
      }

      setNote(`Lesson "${editing.title.trim()}" updated.`);
      setCurriculumEditing(null);
      await loadCurriculumPanel();
    } catch (e2) {
      setNote(e2?.message || 'Unable to update the lesson.');
    } finally {
      setCurriculumRowBusy('');
    }
  }

  async function onDeleteCurriculumLesson(lesson) {
    if (!lesson?.id) return;
    setCurriculumRowBusy(lesson.id);
    try {
      const res = await deleteCurriculumLesson(lesson.id);
      if (res?.success === false) throw new Error(res?.error || 'Unable to delete the lesson');
      setNote(`Lesson "${lesson.title}" deleted. Remaining lessons were renumbered.`);
      setCurriculumConfirmDelete(null);
      await loadCurriculumPanel();
    } catch (e2) {
      setNote(e2?.message || 'Unable to delete the lesson.');
    } finally {
      setCurriculumRowBusy('');
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [dashRes, tRes, iRes, sRes] = await Promise.all([
          schoolDashboard(),
          schoolTeachers({ page: 1, limit: TEACHERS_PER_PAGE }),
          schoolInvites({ page: 1, limit: INVITES_PER_PAGE }),
          schoolStudents({ page: 1, limit: STUDENTS_PER_PAGE })
        ]);
        if (!active) return;
        setDashboard(dashRes || { summary: { teachers: 0, students: 0, activeInvites: 0 } });
        const loadedTeachers = Array.isArray(tRes?.teachers) ? tRes.teachers : [];
        applyTeachers(loadedTeachers, tRes?.pagination || null);
        applyInvites(Array.isArray(iRes?.invites) ? iRes.invites : [], iRes?.pagination || null);
        applyStudents(Array.isArray(sRes?.students) ? sRes.students : [], sRes?.pagination || null);
        // Which subjects exist per class drives the whole curriculum panel, so
        // it is loaded up front and the first class is pre-selected.
        const classes = await loadCurriculumSubjectMap();
        if (!active) return;
        const firstClass = classes[0]?.className
          || (Array.isArray(sRes?.students) ? sRes.students : []).map((s) => String(s?.className || '').trim()).filter(Boolean)[0]
          || '';
        if (firstClass) setCurriculumClassName(firstClass);
      } catch (e) {
        if (!active) return;
        setError(e?.message || 'Failed to load school dashboard data');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching class swaps the whole lesson list — and the subject tabs with it.
  useEffect(() => {
    loadCurriculumPanel({ className: curriculumClassName });
    setCurriculumActiveSubject('');
    setCurriculumEditing(null);
    setCurriculumConfirmDelete(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curriculumClassName]);

  useEffect(() => {
    let active = true;
    async function refreshInvites() {
      try {
        const iRes = await schoolInvites({
          q: inviteSearch,
          status: inviteStatusFilter,
          page: invitePage,
          limit: INVITES_PER_PAGE
        });
        if (!active) return;
        applyInvites(Array.isArray(iRes?.invites) ? iRes.invites : [], iRes?.pagination || null);
      } catch (e) {
        if (!active) return;
        setError(e?.message || 'Failed to refresh invites');
      }
    }
    refreshInvites();
    return () => {
      active = false;
    };
  }, [inviteSearch, inviteStatusFilter, invitePage]);

  useEffect(() => {
    let active = true;
    async function refreshTeachers() {
      try {
        const tRes = await schoolTeachers({
          q: teacherSearch,
          page: teacherPage,
          limit: TEACHERS_PER_PAGE
        });
        if (!active) return;
        applyTeachers(Array.isArray(tRes?.teachers) ? tRes.teachers : [], tRes?.pagination || null);
      } catch (e) {
        if (!active) return;
        setError(e?.message || 'Failed to refresh teachers');
      }
    }
    refreshTeachers();
    return () => {
      active = false;
    };
  }, [teacherSearch, teacherPage]);

  useEffect(() => {
    let active = true;
    async function refreshStudents() {
      try {
        const sRes = await schoolStudents({
          q: studentSearch,
          page: studentPage,
          limit: STUDENTS_PER_PAGE
        });
        if (!active) return;
        applyStudents(Array.isArray(sRes?.students) ? sRes.students : [], sRes?.pagination || null);
      } catch (e) {
        if (!active) return;
        setError(e?.message || 'Failed to refresh students');
      }
    }
    refreshStudents();
    return () => {
      active = false;
    };
  }, [studentSearch, studentPage]);

  async function onRegisterTeacher(e) {
    e.preventDefault();
    if (!teacherName.trim() || !teacherEmail.trim() || !teacherLoginId.trim() || !teacherPassword.trim()) {
      setNote('Name, email, login ID and password are required.');
      return;
    }
    setBusy('manual');
    setNote('');
    try {
      const res = await schoolRegisterTeacher({
        name: teacherName,
        email: teacherEmail,
        subject: teacherSubject,
        loginId: teacherLoginId,
        password: teacherPassword,
        grades: teacherGrades.map((g) => `Class ${g}`)
      });
      if (!res?.success) {
        setNote(res?.error || 'Teacher registration failed.');
        return;
      }
      setCreatedTeacher({
        ...res.teacher,
        password: teacherPassword
      });
      setTeachers((prev) => [res.teacher, ...prev]);
      setDashboard((prev) => ({
        ...prev,
        summary: {
          ...(prev.summary || {}),
          teachers: Number(prev?.summary?.teachers || 0) + 1
        }
      }));
      await loadTeachers({ q: teacherSearch, page: 1, limit: TEACHERS_PER_PAGE });
      setTeacherPage(1);
      setTeacherName('');
      setTeacherEmail('');
      setTeacherLoginId('');
      setTeacherPassword('');
      setTeacherGrades([]);
      setNote('Teacher account created. Share login credentials manually.');
    } catch (e2) {
      setNote('Unable to register teacher right now.');
    } finally {
      setBusy('');
    }
  }

  function startEditTeacher(t) {
    setTeacherActionNote('');
    setEditingTeacherId(t.id || t.loginId || '');
    setEditTeacherForm({
      name: t.name || '',
      email: t.email || '',
      subject: t.subject || '',
      grades: (Array.isArray(t.grades) ? t.grades : [])
        .map((g) => parseInt(String(g).replace(/\D/g, ''), 10))
        .filter((n) => Number.isInteger(n))
    });
  }

  function cancelEditTeacher() {
    setEditingTeacherId('');
    setTeacherActionNote('');
  }

  async function onSaveTeacherEdit(teacherId) {
    if (!editTeacherForm.name.trim()) {
      setTeacherActionNote('Teacher name is required.');
      return;
    }
    setTeacherActionBusy(`edit-${teacherId}`);
    setTeacherActionNote('');
    try {
      const res = await schoolUpdateTeacher(teacherId, {
        name: editTeacherForm.name,
        email: editTeacherForm.email,
        subject: editTeacherForm.subject,
        grades: editTeacherForm.grades.map((g) => `Class ${g}`)
      });
      if (!res?.success) {
        setTeacherActionNote(res?.error || 'Could not update teacher.');
        return;
      }
      setEditingTeacherId('');
      await loadTeachers({ q: teacherSearch, page: teacherPage, limit: TEACHERS_PER_PAGE });
      setNote('Teacher details updated.');
    } catch (e2) {
      setTeacherActionNote('Unable to update teacher right now.');
    } finally {
      setTeacherActionBusy('');
    }
  }

  async function onConfirmResetPassword() {
    if (!resetTeacher) return;
    if (!resetPasswordValue || resetPasswordValue.length < 8) {
      setTeacherActionNote('Password must be at least 8 characters.');
      return;
    }
    setTeacherActionBusy(`reset-${resetTeacher.id}`);
    setTeacherActionNote('');
    try {
      const res = await schoolResetTeacherPassword(resetTeacher.id, resetPasswordValue);
      if (!res?.success) {
        setTeacherActionNote(res?.error || 'Could not reset password.');
        return;
      }
      setCreatedTeacher({
        name: resetTeacher.name,
        email: resetTeacher.email,
        loginId: resetTeacher.loginId,
        password: resetPasswordValue,
        grades: resetTeacher.grades || []
      });
      setResetTeacher(null);
      setResetPasswordValue('');
      setNote('Password reset. Share the new credentials with the teacher.');
    } catch (e2) {
      setTeacherActionNote('Unable to reset password right now.');
    } finally {
      setTeacherActionBusy('');
    }
  }

  async function onConfirmDeleteTeacher() {
    if (!deleteTeacher) return;
    setTeacherActionBusy(`delete-${deleteTeacher.id}`);
    setTeacherActionNote('');
    try {
      const res = await schoolDeleteTeacher(deleteTeacher.id);
      if (!res?.success) {
        setTeacherActionNote(res?.error || 'Could not delete teacher.');
        return;
      }
      setDeleteTeacher(null);
      setDashboard((prev) => ({
        ...prev,
        summary: {
          ...(prev.summary || {}),
          teachers: Math.max(0, Number(prev?.summary?.teachers || 0) - 1)
        }
      }));
      await loadTeachers({ q: teacherSearch, page: 1, limit: TEACHERS_PER_PAGE });
      setTeacherPage(1);
      setNote('Teacher registration deleted.');
    } catch (e2) {
      setTeacherActionNote('Unable to delete teacher right now.');
    } finally {
      setTeacherActionBusy('');
    }
  }

  async function onCreateInvite() {
    setBusy('invite');
    setNote('');
    try {
      const res = await schoolInviteTeacher({ expiresHours: 72 });
      if (!res?.success) {
        setNote(res?.error || 'Could not create invite link.');
        return;
      }
      setInviteLink(res?.invite?.link || '');
      await loadInvites({ q: inviteSearch, status: inviteStatusFilter, page: 1, limit: INVITES_PER_PAGE });
      setInvitePage(1);
      setNote('Teacher invite link generated. Share this link with teacher.');
    } catch (e2) {
      setNote('Unable to create invite link right now.');
    } finally {
      setBusy('');
    }
  }

  async function onRevokeInvite(token) {
    if (!token) return;
    setBusy(`revoke-${token}`);
    setNote('');
    try {
      const res = await revokeSchoolTeacherInvite(token);
      if (!res?.success) {
        setNote(res?.error || 'Could not revoke invite.');
        return;
      }
      await loadInvites();
      setNote('Invite revoked. The old link can no longer be used.');
    } catch (e) {
      setNote('Unable to revoke invite right now.');
    } finally {
      setBusy('');
    }
  }

  async function onResendInvite(token) {
    if (!token) return;
    setBusy(`resend-${token}`);
    setNote('');
    try {
      const res = await resendSchoolTeacherInvite(token, { expiresHours: 72 });
      if (!res?.success || !res?.invite) {
        setNote(res?.error || 'Could not resend invite.');
        return;
      }
      await loadInvites({ q: inviteSearch, status: inviteStatusFilter, page: 1, limit: INVITES_PER_PAGE });
      setInvitePage(1);
      setInviteLink(res.invite.link || '');
      setNote('New invite generated. Previous link was revoked.');
    } catch (e) {
      setNote('Unable to resend invite right now.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="sd-shell">
      <header className="sd-topbar">
        <div>
          <p className="sd-kicker">School Admin Portal</p>
          <h1>{session?.schoolName || 'School'} Admin Workspace</h1>
          <p>Register school teachers manually or send them onboarding links.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="sd-inline-btn"
            onClick={refreshAllSections}
            disabled={refreshing === 'all'}
            title="Refresh all sections"
          >
            {refreshing === 'all' ? '⟳ ...' : '⟳ Refresh'} 
          </button>
          <div style={{ position: 'relative' }}>
            <button 
              className="sd-inline-btn"
              onClick={() => setExportFormat(exportFormat ? null : true)}
              title="Export data"
            >
              ⬇ Export
            </button>
            {exportFormat && (
              <div style={{ 
                position: 'absolute', 
                right: 0, 
                top: '100%', 
                backgroundColor: '#fff', 
                border: '1px solid #ccc',
                borderRadius: '4px',
                zIndex: 10,
                minWidth: '140px'
              }}>
                <button 
                  onClick={() => exportTeachers('csv')}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none' }}
                >
                  👨‍🏫 Teachers CSV
                </button>
                <button 
                  onClick={() => exportStudents('csv')}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none' }}
                >
                  👥 Students CSV
                </button>
              </div>
            )}
          </div>
          <button className="sd-logout" onClick={onLogout}>Logout</button>
        </div>
      </header>

      {loading ? <p className="sd-note">Loading school data...</p> : null}
      {error ? <p className="sd-note">{error}</p> : null}

      <section className="sd-grid">
        <article className="sd-card">
          <h3>School Overview</h3>
          <div className="sd-stats">
            <div><small>Teachers</small><strong>{dashboard?.summary?.teachers ?? 0}</strong></div>
            <div><small>Students</small><strong>{dashboard?.summary?.students ?? 0}</strong></div>
            <div><small>Active Invites</small><strong>{dashboard?.summary?.activeInvites ?? 0}</strong></div>
          </div>
        </article>

        <article className="sd-card">
          <h3>Manual Teacher Registration</h3>
          <form className="sd-form" onSubmit={onRegisterTeacher}>
            <input value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="Teacher name" />
            <input value={teacherEmail} onChange={(e) => setTeacherEmail(e.target.value)} placeholder="Teacher email" />
            <input value={teacherSubject} onChange={(e) => setTeacherSubject(e.target.value)} placeholder="Subject" />
            <input value={teacherLoginId} onChange={(e) => setTeacherLoginId(e.target.value)} placeholder="Teacher login ID" />
            <input type="password" value={teacherPassword} onChange={(e) => setTeacherPassword(e.target.value)} placeholder="Strong password" />
            <label className="sd-field-label">Classes (grades this teacher handles)</label>
            <GradeMultiSelect selected={teacherGrades} onChange={setTeacherGrades} disabled={busy === 'manual'} />
            <button type="submit" disabled={busy === 'manual'}>{busy === 'manual' ? 'Creating...' : 'Create Teacher Account'}</button>
          </form>
          {createdTeacher ? (
            <div className="sd-credential-box">
              <strong>Share with teacher:</strong>
              <p>Name: {createdTeacher.name}</p>
              <p>Email: {createdTeacher.email}</p>
              <p>Login ID: {createdTeacher.loginId}</p>
              <p>Password: {createdTeacher.password}</p>
              {Array.isArray(createdTeacher.grades) && createdTeacher.grades.length ? (
                <p>Classes: {createdTeacher.grades.join(', ')}</p>
              ) : null}
            </div>
          ) : null}
        </article>

        <article className="sd-card">
          <h3>Invite Teacher by Link</h3>
          <p>Teacher can self-register using the link below.</p>
          <button className="sd-invite-btn" onClick={onCreateInvite} disabled={busy === 'invite'}>
            {busy === 'invite' ? 'Generating...' : 'Generate Teacher Invite Link'}
          </button>
          {inviteLink ? (
            <div className="sd-link-box">
              <p>{inviteLink}</p>
            </div>
          ) : null}
        </article>

        <article className="sd-card eg-cc">
          <div className="eg-cc-head">
            <div>
              <h3>Curriculum Content</h3>
              <p>
                Upload a lesson PDF and everything follows automatically — lesson numbering,
                the student&apos;s orchard chapters, flashcard games and the AI tutor.
              </p>
            </div>
            <label className="eg-cc-class">
              <span>Class</span>
              <select
                value={curriculumClassName}
                onChange={(e) => setCurriculumClassName(e.target.value)}
                disabled={!classOptions.length}
              >
                {!classOptions.length ? <option value="">No classes yet</option> : null}
                {classOptions.map((className) => (
                  <option key={className} value={className}>{className}</option>
                ))}
              </select>
            </label>
          </div>

          {!classOptions.length ? (
            <div className="eg-cc-empty">
              <strong>No classes to work with yet</strong>
              <p>Register a teacher and assign them the classes they handle. Those classes appear here.</p>
            </div>
          ) : (
            <>
              <form className="eg-cc-form" onSubmit={onAddCurriculumLesson}>
                <div className="eg-cc-field">
                  <label htmlFor="cc-subject">Subject</label>
                  <input
                    id="cc-subject"
                    className={curriculumSubjectUnknown ? 'is-invalid' : (curriculumSubjectMatch ? 'is-valid' : '')}
                    list="cc-subject-options"
                    value={curriculumSubject}
                    onChange={(e) => setCurriculumSubject(e.target.value)}
                    placeholder={
                      curriculumSubjectsForClass.length
                        ? `e.g. ${curriculumSubjectsForClass[0].subject}`
                        : 'No subjects registered for this class yet'
                    }
                    autoComplete="off"
                  />
                  <datalist id="cc-subject-options">
                    {curriculumSubjectsForClass.map((s) => (
                      <option key={s.subject} value={s.subject} />
                    ))}
                  </datalist>

                  {curriculumSubjectMatch ? (
                    <p className="eg-cc-msg is-ok">
                      <span aria-hidden="true">✓</span>
                      <span>
                        <strong>{curriculumSubjectMatch.teacherName}</strong> teaches {curriculumSubjectMatch.subject} for{' '}
                        {curriculumClassName}. This lesson will be filed under them.
                      </span>
                    </p>
                  ) : curriculumSubjectUnknown ? (
                    <p className="eg-cc-msg is-error">
                      <span aria-hidden="true">!</span>
                      <span>
                        No <strong>{curriculumSubjectTyped}</strong> teacher exists for {curriculumClassName}. Make sure the
                        subject exists for that class first — register the subject teacher, then upload the lesson.
                      </span>
                    </p>
                  ) : (
                    <p className="eg-cc-msg">
                      {curriculumSubjectsForClass.length ? (
                        <>Available for {curriculumClassName}: {curriculumSubjectsForClass.map((s) => s.subject).join(', ')}</>
                      ) : (
                        <>No subjects are registered for {curriculumClassName} yet. Add a teacher for this class first.</>
                      )}
                    </p>
                  )}
                </div>

                <div className="eg-cc-field">
                  <label htmlFor="cc-title">Lesson name</label>
                  <input
                    id="cc-title"
                    value={curriculumLessonTitle}
                    onChange={(e) => setCurriculumLessonTitle(e.target.value)}
                    placeholder="e.g. The Best Christmas Present in the World"
                  />
                </div>

                <div className="eg-cc-field">
                  <label htmlFor="cc-desc">Description <em>(optional)</em></label>
                  <textarea
                    id="cc-desc"
                    rows={2}
                    value={curriculumLessonDescription}
                    onChange={(e) => setCurriculumLessonDescription(e.target.value)}
                    placeholder="A short note for teachers about this lesson"
                  />
                </div>

                <div className="eg-cc-field">
                  <label htmlFor="cc-pdf">Lesson PDF</label>
                  <input
                    id="cc-pdf"
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setCurriculumPdfFile(e.target.files?.[0] || null)}
                  />
                </div>

                <div className="eg-cc-submit">
                  <button
                    type="submit"
                    className="eg-cc-primary"
                    disabled={curriculumPdfUploading || !curriculumSubjectMatch || !curriculumLessonTitle.trim() || !curriculumPdfFile}
                  >
                    {curriculumPdfUploading ? 'Adding lesson…' : 'Add Lesson'}
                  </button>
                  {curriculumNextNumber ? (
                    <span className="eg-cc-nextnum">
                      Saves as lesson <strong>{curriculumNextNumber}</strong> of {curriculumSubjectMatch.subject} · {curriculumClassName}
                    </span>
                  ) : null}
                </div>
              </form>

              <div className="eg-cc-library">
                <div className="eg-cc-library-head">
                  <h4>Uploaded lessons · {curriculumClassName}</h4>
                  {curriculumLoading ? <span className="eg-cc-loading">Loading…</span> : null}
                </div>

                {!curriculumSubjectGroups.length ? (
                  <div className="eg-cc-empty">
                    <strong>Nothing uploaded for {curriculumClassName} yet</strong>
                    <p>Add the first lesson above and a subject tab will appear here.</p>
                  </div>
                ) : (
                  <>
                    <div className="eg-cc-tabs" role="tablist">
                      {curriculumSubjectGroups.map((group) => {
                        const active = curriculumVisibleGroup?.subject === group.subject;
                        return (
                          <button
                            key={group.subject}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            className={`eg-cc-tab ${active ? 'is-active' : ''}`}
                            onClick={() => setCurriculumActiveSubject(group.subject)}
                          >
                            {group.subject}
                            <span className="eg-cc-tab-count">{group.lessons.length}</span>
                          </button>
                        );
                      })}
                    </div>

                    <ul className="eg-cc-lessons">
                      {(curriculumVisibleGroup?.lessons || []).map((lesson, index) => {
                        const docs = curriculumDocumentsByLesson[String(lesson.id)] || [];
                        const isEditing = curriculumEditing?.lessonId === lesson.id;
                        const isConfirming = curriculumConfirmDelete === lesson.id;
                        const busyRow = curriculumRowBusy === lesson.id;
                        return (
                          <li key={lesson.id} className="eg-cc-lesson">
                            <span className="eg-cc-num">{index + 1}</span>
                            <div className="eg-cc-lesson-body">
                              {isEditing ? (
                                <div className="eg-cc-edit">
                                  <input
                                    value={curriculumEditing.title}
                                    onChange={(e) => setCurriculumEditing((c) => ({ ...c, title: e.target.value }))}
                                    placeholder="Lesson name"
                                  />
                                  <textarea
                                    rows={2}
                                    value={curriculumEditing.description}
                                    onChange={(e) => setCurriculumEditing((c) => ({ ...c, description: e.target.value }))}
                                    placeholder="Description (optional)"
                                  />
                                  <label className="eg-cc-replace">
                                    <span>Replace PDF (optional)</span>
                                    <input
                                      type="file"
                                      accept="application/pdf"
                                      onChange={(e) => setCurriculumEditing((c) => ({ ...c, replacementFile: e.target.files?.[0] || null }))}
                                    />
                                  </label>
                                  <div className="eg-cc-edit-actions">
                                    <button type="button" className="eg-cc-primary" onClick={onSaveCurriculumLessonEdit} disabled={busyRow}>
                                      {busyRow ? 'Saving…' : 'Save changes'}
                                    </button>
                                    <button type="button" className="eg-cc-ghost" onClick={() => setCurriculumEditing(null)} disabled={busyRow}>
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <strong className="eg-cc-lesson-title">{lesson.title}</strong>
                                  {lesson.description ? <p className="eg-cc-lesson-desc">{lesson.description}</p> : null}
                                  <ul className="eg-cc-docs">
                                    {docs.map((doc) => (
                                      <li key={doc.id} className={`eg-cc-doc is-${doc.extraction_status || 'pending'}`}>
                                        <a href={doc.file_url} target="_blank" rel="noreferrer">{doc.file_name}</a>
                                        <span className="eg-cc-doc-status">{doc.extraction_status || 'pending'}</span>
                                      </li>
                                    ))}
                                    {!docs.length ? <li className="eg-cc-doc is-missing">No PDF attached</li> : null}
                                  </ul>
                                </>
                              )}
                            </div>

                            {!isEditing ? (
                              <div className="eg-cc-actions">
                                {isConfirming ? (
                                  <>
                                    <button type="button" className="eg-cc-danger" onClick={() => onDeleteCurriculumLesson(lesson)} disabled={busyRow}>
                                      {busyRow ? 'Deleting…' : 'Confirm delete'}
                                    </button>
                                    <button type="button" className="eg-cc-ghost" onClick={() => setCurriculumConfirmDelete(null)} disabled={busyRow}>
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="eg-cc-ghost"
                                      onClick={() => setCurriculumEditing({
                                        lessonId: lesson.id,
                                        title: lesson.title || '',
                                        description: lesson.description || '',
                                        replacementFile: null
                                      })}
                                    >
                                      Edit
                                    </button>
                                    <button type="button" className="eg-cc-ghost is-danger" onClick={() => setCurriculumConfirmDelete(lesson.id)}>
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </>
          )}
        </article>

        <article className="sd-card">
          <h3>Teachers</h3>
          <button 
            className="sd-inline-btn" 
            onClick={refreshTeachersSection}
            disabled={refreshing === 'teachers'}
            style={{ float: 'right', fontSize: '12px' }}
          >
            {refreshing === 'teachers' ? '...' : '↻'}
          </button>
          <div className="invite-toolbar">
            <input
              className="invite-search"
              value={teacherSearch}
              onChange={(e) => {
                setTeacherSearch(e.target.value);
                setTeacherPage(1);
              }}
              placeholder="Search teachers by name/email/subject"
            />
          </div>
          <ul className="sd-list sd-teacher-list">
            {(teachers.length ? teachers : []).map((t) => {
              const tid = t.id || t.loginId;
              const isEditing = editingTeacherId === tid;
              return (
                <li key={tid} className="sd-teacher-item">
                  {isEditing ? (
                    <div className="sd-teacher-edit">
                      <input
                        value={editTeacherForm.name}
                        onChange={(e) => setEditTeacherForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Teacher name"
                      />
                      <input
                        value={editTeacherForm.email}
                        onChange={(e) => setEditTeacherForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="Teacher email"
                      />
                      <input
                        value={editTeacherForm.subject}
                        onChange={(e) => setEditTeacherForm((f) => ({ ...f, subject: e.target.value }))}
                        placeholder="Subject"
                      />
                      <GradeMultiSelect
                        selected={editTeacherForm.grades}
                        onChange={(grades) => setEditTeacherForm((f) => ({ ...f, grades }))}
                        disabled={teacherActionBusy === `edit-${tid}`}
                      />
                      {teacherActionNote ? <p className="sd-teacher-action-note">{teacherActionNote}</p> : null}
                      <div className="sd-teacher-edit-actions">
                        <button
                          type="button"
                          className="sd-inline-btn primary"
                          onClick={() => onSaveTeacherEdit(tid)}
                          disabled={teacherActionBusy === `edit-${tid}`}
                        >
                          {teacherActionBusy === `edit-${tid}` ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" className="sd-inline-btn" onClick={cancelEditTeacher}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="sd-teacher-row">
                      <div className="sd-teacher-info">
                        <strong>{t.name || 'Teacher'}</strong>
                        <span className="sd-teacher-meta">{t.subject || 'General'}</span>
                        {Array.isArray(t.grades) && t.grades.length ? (
                          <span className="sd-teacher-grades"> · {t.grades.join(', ')}</span>
                        ) : (
                          <span className="sd-teacher-grades sd-teacher-grades-none"> · No classes assigned</span>
                        )}
                      </div>
                      <div className="sd-teacher-actions">
                        <button type="button" className="sd-icon-btn" title="Edit teacher" onClick={() => startEditTeacher(t)}>✏️</button>
                        <button
                          type="button"
                          className="sd-icon-btn"
                          title="Reset password"
                          onClick={() => { setResetTeacher(t); setResetPasswordValue(''); setTeacherActionNote(''); }}
                        >🔑</button>
                        <button
                          type="button"
                          className="sd-icon-btn danger"
                          title="Delete teacher"
                          onClick={() => { setDeleteTeacher(t); setTeacherActionNote(''); }}
                        >🗑️</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            {!teachers.length ? <li>No teachers match the current search.</li> : null}
          </ul>
          <div className="invite-pager">
            <button
              type="button"
              className="sd-inline-btn"
              onClick={() => setTeacherPage((p) => Math.max(1, p - 1))}
              disabled={teacherPage === 1}
            >
              Previous
            </button>
            <span>Page {teacherPage} of {teacherTotalPages}</span>
            <button
              type="button"
              className="sd-inline-btn"
              onClick={() => setTeacherPage((p) => Math.min(teacherTotalPages, p + 1))}
              disabled={teacherPage >= teacherTotalPages}
            >
              Next
            </button>
          </div>
        </article>

        <article className="sd-card">
          <h3>Recent Teacher Invites</h3>
          <button 
            className="sd-inline-btn" 
            onClick={refreshInvitesSection}
            disabled={refreshing === 'invites'}
            style={{ float: 'right', fontSize: '12px' }}
          >
            {refreshing === 'invites' ? '...' : '↻'}
          </button>
          <div className="invite-toolbar">
            <input
              className="invite-search"
              value={inviteSearch}
              onChange={(e) => {
                setInviteSearch(e.target.value);
                setInvitePage(1);
              }}
              placeholder="Search by token or role"
            />
            <select
              className="invite-filter"
              value={inviteStatusFilter}
              onChange={(e) => {
                setInviteStatusFilter(e.target.value);
                setInvitePage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="used">Used</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <ul className="sd-invite-list">
            {(invites.length ? invites : []).map((i) => (
              <li key={i.token}>
                <div className="sd-invite-row">
                  <div>
                    <strong>{i.role} invite</strong>
                    <p>Expires: {shortDate(i.expiresAt)}</p>
                  </div>
                  <span className={`invite-badge ${inviteStatusLabel(i)}`}>{inviteStatusLabel(i)}</span>
                </div>
                <div className="sd-invite-actions">
                  <button
                    type="button"
                    className="sd-inline-btn"
                    onClick={() => onResendInvite(i.token)}
                    disabled={busy === `resend-${i.token}` || inviteStatusLabel(i) === 'used'}
                  >
                    {busy === `resend-${i.token}` ? 'Resending...' : 'Resend'}
                  </button>
                  <button
                    type="button"
                    className="sd-inline-btn danger"
                    onClick={() => onRevokeInvite(i.token)}
                    disabled={busy === `revoke-${i.token}` || inviteStatusLabel(i) !== 'active'}
                  >
                    {busy === `revoke-${i.token}` ? 'Revoking...' : 'Revoke'}
                  </button>
                </div>
              </li>
            ))}
            {!invites.length ? <li>No invites match the current filters.</li> : null}
          </ul>
          <div className="invite-pager">
            <button
              type="button"
              className="sd-inline-btn"
              onClick={() => setInvitePage((p) => Math.max(1, p - 1))}
              disabled={invitePage === 1}
            >
              Previous
            </button>
            <span>Page {invitePage} of {inviteTotalPages}</span>
            <button
              type="button"
              className="sd-inline-btn"
              onClick={() => setInvitePage((p) => Math.min(inviteTotalPages, p + 1))}
              disabled={invitePage >= inviteTotalPages}
            >
              Next
            </button>
          </div>
        </article>

        <article className="sd-card">
          <h3>Students (School-wide)</h3>
          <button 
            className="sd-inline-btn" 
            onClick={refreshStudentsSection}
            disabled={refreshing === 'students'}
            style={{ float: 'right', fontSize: '12px' }}
          >
            {refreshing === 'students' ? '...' : '↻'}
          </button>
          <div className="invite-toolbar">
            <input
              className="invite-search"
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                setStudentPage(1);
              }}
              placeholder="Search students by name/class"
            />
          </div>
          <ul className="sd-list">
            {(students.length ? students : []).map((s) => (
              <li key={s.id}>{s.name || 'Student'} - {s.className || 'Class'}</li>
            ))}
            {!students.length ? <li>No students match the current search.</li> : null}
          </ul>
          <div className="invite-pager">
            <button
              type="button"
              className="sd-inline-btn"
              onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
              disabled={studentPage === 1}
            >
              Previous
            </button>
            <span>Page {studentPage} of {studentTotalPages}</span>
            <button
              type="button"
              className="sd-inline-btn"
              onClick={() => setStudentPage((p) => Math.min(studentTotalPages, p + 1))}
              disabled={studentPage >= studentTotalPages}
            >
              Next
            </button>
          </div>
        </article>
      </section>

      {note ? <p className="sd-note">{note}</p> : null}

      {resetTeacher ? (
        <div className="sd-modal-overlay" onClick={() => { setResetTeacher(null); setTeacherActionNote(''); }}>
          <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reset password</h3>
            <p>Set a new password for <strong>{resetTeacher.name || 'this teacher'}</strong> (login ID: {resetTeacher.loginId || '—'}).</p>
            <input
              type="text"
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              placeholder="New password (min 8 characters)"
              autoFocus
            />
            {teacherActionNote ? <p className="sd-teacher-action-note">{teacherActionNote}</p> : null}
            <div className="sd-modal-actions">
              <button type="button" className="sd-inline-btn" onClick={() => { setResetTeacher(null); setTeacherActionNote(''); }}>Cancel</button>
              <button
                type="button"
                className="sd-inline-btn primary"
                onClick={onConfirmResetPassword}
                disabled={teacherActionBusy === `reset-${resetTeacher.id}`}
              >
                {teacherActionBusy === `reset-${resetTeacher.id}` ? 'Resetting...' : 'Reset password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTeacher ? (
        <div className="sd-modal-overlay" onClick={() => { setDeleteTeacher(null); setTeacherActionNote(''); }}>
          <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete teacher?</h3>
            <p className="sd-modal-warning">
              ⚠️ This will permanently delete <strong>{deleteTeacher.name || 'this teacher'}</strong>
              {deleteTeacher.subject ? ` (${deleteTeacher.subject})` : ''} and unlink their students.
              This action cannot be undone.
            </p>
            {teacherActionNote ? <p className="sd-teacher-action-note">{teacherActionNote}</p> : null}
            <div className="sd-modal-actions">
              <button type="button" className="sd-inline-btn" onClick={() => { setDeleteTeacher(null); setTeacherActionNote(''); }}>Cancel</button>
              <button
                type="button"
                className="sd-inline-btn danger"
                onClick={onConfirmDeleteTeacher}
                disabled={teacherActionBusy === `delete-${deleteTeacher.id}`}
              >
                {teacherActionBusy === `delete-${deleteTeacher.id}` ? 'Deleting...' : 'Delete teacher'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

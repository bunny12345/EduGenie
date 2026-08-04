import React, { useEffect, useState } from 'react';
import {
  createCurriculumLesson,
  listCurriculumLessonDocuments,
  listCurriculumLessons,
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
  uploadCurriculumLessonDocument
} from '../api';

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
  const [curriculumSubject, setCurriculumSubject] = useState('Mathematics');
  const [curriculumClassName, setCurriculumClassName] = useState('all');
  const [curriculumTeacherId, setCurriculumTeacherId] = useState('');
  const [curriculumLessonTitle, setCurriculumLessonTitle] = useState('');
  const [curriculumLessonDescription, setCurriculumLessonDescription] = useState('');
  const [curriculumLessonOrder, setCurriculumLessonOrder] = useState(0);
  const [curriculumVisibleClasses, setCurriculumVisibleClasses] = useState('');
  const [curriculumLessons, setCurriculumLessons] = useState([]);
  const [curriculumDocumentsByLesson, setCurriculumDocumentsByLesson] = useState({});
  const [curriculumSelectedLessonId, setCurriculumSelectedLessonId] = useState('');
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [curriculumLessonSaving, setCurriculumLessonSaving] = useState(false);
  const [curriculumPdfUploading, setCurriculumPdfUploading] = useState(false);

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
  }

  const classOptions = Array.from(new Set(
    (students || []).map((s) => String(s?.className || '').trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  // The lesson an uploaded chapter will be attached to — surfaced in the UI so
  // a PDF can never be filed against the wrong subject or grade unnoticed.
  const selectedCurriculumLesson = (curriculumLessons || []).find(
    (lesson) => String(lesson?.id || '') === String(curriculumSelectedLessonId || '')
  ) || null;

  async function loadCurriculumPanel({ className = curriculumClassName, subject = curriculumSubject } = {}) {
    setCurriculumLoading(true);
    try {
      const res = await listCurriculumLessons({ className: className === 'all' ? '' : className, subject: subject || '' });
      const lessons = Array.isArray(res?.lessons) ? res.lessons : [];
      setCurriculumLessons(lessons);
      // Keep the chosen lesson in step with the current subject/class filter.
      // Without this the previously selected lesson stays selected after the
      // filter changes, and an uploaded chapter would be attached to a lesson
      // from a different subject or grade.
      setCurriculumSelectedLessonId((current) => {
        const stillListed = lessons.some((lesson) => String(lesson.id || '') === String(current || ''));
        if (current && stillListed) return current;
        return lessons.length ? String(lessons[0].id || '') : '';
      });

      const lessonIds = lessons.map((lesson) => String(lesson.id || '')).filter(Boolean).slice(0, 20);
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

  async function onCreateCurriculumLesson(e) {
    e.preventDefault();
    const selectedTeacherId = String(curriculumTeacherId || '').trim();
    if (!selectedTeacherId) {
      setNote('Select a teacher owner for this lesson.');
      return;
    }
    if (!curriculumLessonTitle.trim() || !curriculumSubject.trim()) {
      setNote('Subject and lesson title are required.');
      return;
    }

    setCurriculumLessonSaving(true);
    setNote('');
    try {
      const visibleClassNames = curriculumVisibleClasses
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      const res = await createCurriculumLesson({
        teacherId: selectedTeacherId,
        subject: curriculumSubject.trim(),
        title: curriculumLessonTitle.trim(),
        description: curriculumLessonDescription.trim() || null,
        className: curriculumClassName !== 'all' ? curriculumClassName : null,
        orderIndex: Number(curriculumLessonOrder) || 0,
        isActive: true,
        visibleClassNames: Array.from(new Set([...visibleClassNames, ...(curriculumClassName !== 'all' ? [curriculumClassName] : [])]))
      });
      if (res?.success === false) throw new Error(res?.error || 'Unable to create lesson');
      setCurriculumLessonTitle('');
      setCurriculumLessonDescription('');
      setCurriculumLessonOrder(0);
      setCurriculumVisibleClasses('');
      setCurriculumSelectedLessonId(String(res?.lesson?.id || ''));
      setNote(`Lesson "${res?.lesson?.title || 'Lesson'}" created.`);
      await loadCurriculumPanel();
    } catch (e2) {
      setNote(e2?.message || 'Unable to create lesson.');
    } finally {
      setCurriculumLessonSaving(false);
    }
  }

  async function onUploadCurriculumPdf(e) {
    e.preventDefault();
    if (!curriculumSelectedLessonId) {
      setNote('Select a lesson first.');
      return;
    }
    const file = e.target?.pdf?.files?.[0];
    if (!file) {
      setNote('Choose a PDF file.');
      return;
    }

    setCurriculumPdfUploading(true);
    setNote('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
        reader.readAsDataURL(file);
      });

      const res = await uploadCurriculumLessonDocument(curriculumSelectedLessonId, {
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        data: dataUrl
      });
      if (res?.success === false) throw new Error(res?.error || 'Upload failed');
      setNote(res?.error ? `Uploaded with warnings: ${res.error}` : 'PDF uploaded and extraction started.');
      await loadCurriculumPanel();
      e.target.reset();
    } catch (e2) {
      setNote(e2?.message || 'Unable to upload PDF.');
    } finally {
      setCurriculumPdfUploading(false);
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
        if (!curriculumTeacherId && loadedTeachers[0]?.id) {
          setCurriculumTeacherId(String(loadedTeachers[0].id));
        }
        await loadCurriculumPanel({ className: curriculumClassName, subject: curriculumSubject });
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

  useEffect(() => {
    loadCurriculumPanel({ className: curriculumClassName, subject: curriculumSubject });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curriculumClassName, curriculumSubject]);

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

        <article className="sd-card">
          <h3>Curriculum Content (Admin)</h3>
          <p>Create lesson records and upload lesson PDFs. Teachers can only manage visibility.</p>
          <div className="invite-toolbar">
            <input
              className="invite-search"
              value={curriculumSubject}
              onChange={(e) => setCurriculumSubject(e.target.value)}
              placeholder="Subject (e.g. Mathematics)"
            />
            <select
              className="invite-filter"
              value={curriculumClassName}
              onChange={(e) => setCurriculumClassName(e.target.value)}
            >
              <option value="all">All classes</option>
              {classOptions.map((className) => (
                <option key={className} value={className}>{className}</option>
              ))}
            </select>
            <button className="sd-inline-btn" type="button" onClick={() => loadCurriculumPanel()} disabled={curriculumLoading}>
              {curriculumLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <form className="sd-form" onSubmit={onCreateCurriculumLesson}>
            <select value={curriculumTeacherId} onChange={(e) => setCurriculumTeacherId(e.target.value)} required>
              <option value="">Select lesson owner (teacher)</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name || t.email || t.loginId || t.id}</option>
              ))}
            </select>
            <input value={curriculumLessonTitle} onChange={(e) => setCurriculumLessonTitle(e.target.value)} placeholder="Lesson title" required />
            <textarea rows={3} value={curriculumLessonDescription} onChange={(e) => setCurriculumLessonDescription(e.target.value)} placeholder="Lesson description (optional)" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 8 }}>
              <input value={curriculumVisibleClasses} onChange={(e) => setCurriculumVisibleClasses(e.target.value)} placeholder="Visible classes (comma separated)" />
              <input type="number" value={curriculumLessonOrder} onChange={(e) => setCurriculumLessonOrder(e.target.value)} placeholder="Order" />
            </div>
            <button type="submit" disabled={curriculumLessonSaving}>{curriculumLessonSaving ? 'Creating...' : 'Create Lesson'}</button>
          </form>

          <div style={{ marginTop: 12 }}>
            <select
              value={curriculumSelectedLessonId}
              onChange={(e) => setCurriculumSelectedLessonId(e.target.value)}
              className="invite-filter"
              style={{ width: '100%' }}
            >
              <option value="">Select lesson to upload/view documents</option>
              {curriculumLessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title} · {lesson.subject} · {lesson.class_name || 'All classes'}
                </option>
              ))}
            </select>
          </div>

          <form className="sd-form" onSubmit={onUploadCurriculumPdf} style={{ marginTop: 10 }}>
            <input type="file" name="pdf" accept="application/pdf" />
            <button type="submit" disabled={curriculumPdfUploading || !curriculumSelectedLessonId}>
              {curriculumPdfUploading ? 'Uploading...' : 'Upload PDF to Lesson'}
            </button>
          </form>

          {selectedCurriculumLesson && (
            <p className="sd-hint" style={{ marginTop: 6 }}>
              Uploading to: <strong>{selectedCurriculumLesson.title}</strong> ·{' '}
              {selectedCurriculumLesson.subject} ·{' '}
              {selectedCurriculumLesson.class_name || 'All classes'}
            </p>
          )}

          {curriculumSelectedLessonId ? (
            <ul className="sd-list" style={{ marginTop: 10 }}>
              {(curriculumDocumentsByLesson[String(curriculumSelectedLessonId)] || []).map((doc) => (
                <li key={doc.id}>
                  <strong>{doc.file_name}</strong> - {doc.extraction_status || 'pending'}
                </li>
              ))}
              {!(curriculumDocumentsByLesson[String(curriculumSelectedLessonId)] || []).length ? (
                <li>No documents uploaded for this lesson yet.</li>
              ) : null}
            </ul>
          ) : null}
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

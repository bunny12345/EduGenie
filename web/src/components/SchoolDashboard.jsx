import React, { useEffect, useRef, useState } from 'react';
import {
  createCurriculumLesson,
  deleteCurriculumLesson,
  deleteCurriculumLessonDocument,
  listCurriculumLessonDocuments,
  listCurriculumLessons,
  listCurriculumSubjects,
  schoolDashboard,
  schoolDeleteStudent,
  schoolRegisterStudent,
  schoolRegisterTeacher,
  schoolResetStudentPassword,
  schoolStudents,
  schoolTeachers,
  schoolUpdateStudent,
  schoolUpdateTeacher,
  schoolResetTeacherPassword,
  schoolDeleteTeacher,
  schoolDeduplicateTeachers,
  updateCurriculumLesson,
  uploadCurriculumLessonDocument
} from '../api';
import './CurriculumContent.css';

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
  const [error, setError] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherSubject, setTeacherSubject] = useState('Mathematics');
  const [teacherLoginId, setTeacherLoginId] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherGrades, setTeacherGrades] = useState([]);
  const [teacherGender, setTeacherGender] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [createdTeacher, setCreatedTeacher] = useState(null);
  const [dashboard, setDashboard] = useState({ summary: { teachers: 0, students: 0, activeInvites: 0 } });
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherClassFilter, setTeacherClassFilter] = useState('');
  const [showTeacherClassFilter, setShowTeacherClassFilter] = useState(false);
  const teacherClassFilterRef = useRef(null);
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
  const [studentClassFilter, setStudentClassFilter] = useState('');
  const [showClassFilter, setShowClassFilter] = useState(false);
  const classFilterRef = useRef(null);
  const [studentPage, setStudentPage] = useState(1);
  const [studentTotalPages, setStudentTotalPages] = useState(1);
  // Student registration (moved here from the teacher portal — student accounts
  // belong to the school, not to whichever teacher happened to create them).
  const [studentName, setStudentName] = useState('');
  const [studentClassName, setStudentClassName] = useState('');
  const [studentLoginId, setStudentLoginId] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [studentGender, setStudentGender] = useState('');
  const [studentDob, setStudentDob] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [createdStudent, setCreatedStudent] = useState(null);
  // Student management (edit / reset password / delete) — mirrors the teacher list.
  const [editingStudentId, setEditingStudentId] = useState('');
  const [editStudentForm, setEditStudentForm] = useState({ name: '', className: '' });
  const [resetStudent, setResetStudent] = useState(null);
  const [resetStudentPasswordValue, setResetStudentPasswordValue] = useState('');
  const [deleteStudent, setDeleteStudent] = useState(null);
  const [studentActionBusy, setStudentActionBusy] = useState('');
  const [studentActionNote, setStudentActionNote] = useState('');
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
  // Every subject the school teaches, with the classes it is assigned to. Used
  // to explain a subject that is registered but not attached to this class.
  const [curriculumAllSubjects, setCurriculumAllSubjects] = useState([]);
  const [curriculumLoadError, setCurriculumLoadError] = useState('');
  const [curriculumPdfFiles, setCurriculumPdfFiles] = useState([]);
  const [curriculumEditing, setCurriculumEditing] = useState(null);
  const [curriculumRowBusy, setCurriculumRowBusy] = useState('');
  const [curriculumConfirmDelete, setCurriculumConfirmDelete] = useState(null);

  // New: Section-specific loading and refresh states
  const [refreshing, setRefreshing] = useState('');
  const [exportFormat, setExportFormat] = useState(null);

  // Which sidebar page is open.
  const [activeSection, setActiveSection] = useState(() => {
    const h = window.location.hash.replace('#', '');
    return h || 'overview';
  });

  useEffect(() => {
    window.location.hash = activeSection;
  }, [activeSection]);

  useEffect(() => {
    function onHashChange() {
      const h = window.location.hash.replace('#', '');
      if (h) setActiveSection(h);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
    await loadTeachers({ q: teacherSearch, className: teacherClassFilter || undefined, page: teacherPage, limit: TEACHERS_PER_PAGE });
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
      refreshStudentsSection()
    ]);
    setRefreshing('');
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
    if (teacherPage > teacherTotalPages) {
      setTeacherPage(teacherTotalPages);
    }
  }, [teacherPage, teacherTotalPages]);

  useEffect(() => {
    if (studentPage > studentTotalPages) {
      setStudentPage(studentTotalPages);
    }
  }, [studentPage, studentTotalPages]);

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

  // Registration must also offer classes nobody is enrolled in yet, otherwise
  // the first student of a brand-new class could never be created.
  const studentClassOptions = Array.from(new Set([
    ...classOptions,
    ...GRADE_OPTIONS.map((g) => `Class ${g}`)
  ])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // Subjects that already have a teacher for the selected class. Typing anything
  // else is rejected — the school must register that subject teacher first.
  const curriculumSubjectsForClass = (
    (curriculumClassMap || []).find(
      (entry) => String(entry?.className || '').toLowerCase() === String(curriculumClassName || '').toLowerCase()
    )?.subjects || []
  );

  // Lessons already filed for the selected class, grouped per subject.
  // Numbering is positional: 1, 2, 3 … per subject.
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

  // One button per subject the class actually has — exactly the set a student
  // of that class sees in their own portal. The backend supplies the core
  // subjects every class has plus the teacher-registered ones; a subject that
  // only survives through already-uploaded lessons is added here so those PDFs
  // stay reachable. Only subjects with a teacher can receive new uploads.
  const curriculumSubjectButtons = (() => {
    const byKey = new Map();
    for (const entry of curriculumSubjectsForClass) {
      const subject = String(entry?.subject || '').trim();
      if (!subject) continue;
      byKey.set(subject.toLowerCase(), {
        subject,
        teacherId: entry.teacherId || '',
        teacherName: entry.teacherName || '',
        source: entry.source || (entry.teacherId ? 'teacher' : 'core'),
        canUpload: entry.canUpload !== undefined ? !!entry.canUpload : !!entry.teacherId,
        lessonCount: 0
      });
    }
    for (const group of curriculumSubjectGroups) {
      const key = group.subject.toLowerCase();
      const existing = byKey.get(key);
      if (existing) existing.lessonCount = group.lessons.length;
      else {
        byKey.set(key, {
          subject: group.subject,
          teacherId: '',
          teacherName: '',
          source: 'lesson',
          canUpload: false,
          lessonCount: group.lessons.length
        });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.subject.localeCompare(b.subject));
  })();

  // Subjects the school already teaches that this class has not been given yet.
  // Listing them (with the reason) answers "why can't I see subject X here?"
  // instead of silently leaving it out.
  const curriculumMissingSubjects = (() => {
    const present = new Set(curriculumSubjectButtons.map((b) => b.subject.toLowerCase()));
    const byKey = new Map();
    for (const entry of curriculumAllSubjects || []) {
      const subject = String(entry?.subject || '').trim();
      if (!subject || present.has(subject.toLowerCase())) continue;
      const key = subject.toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, { subject, teachers: [], hasAnyClass: false });
      }
      const row = byKey.get(key);
      row.teachers.push(String(entry?.teacherName || 'Teacher'));
      if ((entry?.classes || []).length) row.hasAnyClass = true;
    }
    return Array.from(byKey.values()).sort((a, b) => a.subject.localeCompare(b.subject));
  })();

  // The picked subject drives both the upload form and the lesson list below.
  // Falling back to a sensible default keeps a subject selected without an extra
  // effect (and therefore without a render loop) when the class changes: prefer
  // a subject that already has lessons, then one that can accept uploads.
  const curriculumDefaultSubject =
    curriculumSubjectButtons.find((b) => b.lessonCount > 0) ||
    curriculumSubjectButtons.find((b) => b.canUpload) ||
    curriculumSubjectButtons[0] ||
    null;

  const curriculumSelectedSubject =
    curriculumSubjectButtons.find(
      (b) => b.subject.toLowerCase() === String(curriculumSubject || '').trim().toLowerCase()
    ) || curriculumDefaultSubject;

  const curriculumSubjectMatch = curriculumSelectedSubject?.canUpload ? curriculumSelectedSubject : null;

  const curriculumVisibleGroup = curriculumSelectedSubject
    ? curriculumSubjectGroups.find(
        (g) => g.subject.toLowerCase() === curriculumSelectedSubject.subject.toLowerCase()
      ) || { subject: curriculumSelectedSubject.subject, lessons: [] }
    : null;

  // What number the lesson about to be uploaded will get.
  const curriculumNextNumber = curriculumSubjectMatch
    ? (curriculumVisibleGroup?.lessons.length || 0) + 1
    : null;

  async function loadCurriculumSubjectMap() {
    try {
      const res = await listCurriculumSubjects();
      const classes = Array.isArray(res?.classes) ? res.classes : [];
      setCurriculumClassMap(classes);
      setCurriculumAllSubjects(Array.isArray(res?.allSubjects) ? res.allSubjects : []);
      return classes;
    } catch {
      setCurriculumClassMap([]);
      setCurriculumAllSubjects([]);
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
    setCurriculumLoadError('');
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
      // Without this the panel silently shows every subject with 0 lessons,
      // which reads as "the subjects are broken" rather than "the load failed".
      setCurriculumLoadError(e?.message || 'Unable to load curriculum lessons.');
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
      setNote(`No teacher is registered for "${curriculumSelectedSubject?.subject || 'that subject'}" in ${curriculumClassName}. Add the subject teacher for this class first, then upload the lesson.`);
      return;
    }
    if (!curriculumLessonTitle.trim()) {
      setNote('Enter a lesson name.');
      return;
    }
    if (!curriculumPdfFiles.length) {
      setNote('Choose at least one lesson PDF to upload.');
      return;
    }

    setCurriculumPdfUploading(true);
    setNote('');
    let createdLessonId = '';
    try {
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

      const errors = [];
      for (const file of curriculumPdfFiles) {
        const dataUrl = await readFileAsDataUrl(file);
        const uploaded = await uploadCurriculumLessonDocument(createdLessonId, {
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          data: dataUrl
        });
        if (uploaded?.success === false || uploaded?.error) errors.push(uploaded?.error || `Failed: ${file.name}`);
      }

      const lessonNumber = created?.lesson?.order_index;
      setNote(
        errors.length
          ? `Lesson added with warnings: ${errors.join('; ')}`
          : `Lesson ${lessonNumber || ''} "${curriculumLessonTitle.trim()}" added with ${curriculumPdfFiles.length} doc(s) to ${curriculumSubjectMatch.subject} · ${curriculumClassName}.`.replace('  ', ' ')
      );
      setCurriculumLessonTitle('');
      setCurriculumLessonDescription('');
      setCurriculumPdfFiles([]);
      setCurriculumSubject(curriculumSubjectMatch.subject);
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

      if (editing.additionalFiles && editing.additionalFiles.length) {
        for (const file of editing.additionalFiles) {
          const dataUrl = await readFileAsDataUrl(file);
          const uploaded = await uploadCurriculumLessonDocument(editing.lessonId, {
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
            data: dataUrl
          });
          if (uploaded?.success === false) throw new Error(uploaded?.error || 'Upload failed');
        }
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
    // The dashboard loads silently in the background: nothing on screen
    // announces the fetch, the panels simply fill in once the data arrives.
    async function load() {
      setError('');
      try {
        const [dashRes, tRes, sRes] = await Promise.all([
          schoolDashboard(),
          schoolTeachers({ page: 1, limit: TEACHERS_PER_PAGE }),
          schoolStudents({ page: 1, limit: STUDENTS_PER_PAGE })
        ]);
        if (!active) return;
        setDashboard(dashRes || { summary: { teachers: 0, students: 0, activeInvites: 0 } });
        const loadedTeachers = Array.isArray(tRes?.teachers) ? tRes.teachers : [];
        applyTeachers(loadedTeachers, tRes?.pagination || null);
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
      }
    }
    load();
    // Fire-and-forget: remove any legacy duplicate subject rows
    schoolDeduplicateTeachers().catch(() => {});
    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching class swaps the whole lesson list — and the subject buttons with
  // it. Clearing the picked subject makes the first subject of the new class
  // become the selected one.
  useEffect(() => {
    loadCurriculumPanel({ className: curriculumClassName });
    // The subject buttons must follow the roster, so re-read the per-class
    // subject map every time the class changes too.
    loadCurriculumSubjectMap();
    setCurriculumSubject('');
    setCurriculumEditing(null);
    setCurriculumConfirmDelete(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curriculumClassName]);

  // A class disappears when its last teacher is removed. Without this the
  // <select> silently falls back to its first option while the panel keeps
  // rendering the vanished class, showing no subjects at all.
  useEffect(() => {
    if (!classOptions.length) return;
    if (classOptions.includes(curriculumClassName)) return;
    setCurriculumClassName(classOptions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classOptions.join('|'), curriculumClassName]);

  useEffect(() => {
    if (!showClassFilter) return;
    function handleClick(e) {
      if (classFilterRef.current && !classFilterRef.current.contains(e.target)) setShowClassFilter(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showClassFilter]);

  useEffect(() => {
    if (!showTeacherClassFilter) return;
    function handleClick(e) {
      if (teacherClassFilterRef.current && !teacherClassFilterRef.current.contains(e.target)) setShowTeacherClassFilter(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTeacherClassFilter]);

  useEffect(() => {
    let active = true;
    async function refreshTeachers() {
      try {
        const tRes = await schoolTeachers({
          q: teacherSearch,
          className: teacherClassFilter || undefined,
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
  }, [teacherSearch, teacherClassFilter, teacherPage]);

  useEffect(() => {
    let active = true;
    async function refreshStudents() {
      try {
        const sRes = await schoolStudents({
          q: studentSearch,
          className: studentClassFilter || undefined,
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
  }, [studentSearch, studentClassFilter, studentPage]);

  async function onRegisterTeacher(e) {
    e.preventDefault();
    if (!teacherName.trim() || !teacherEmail.trim() || !teacherLoginId.trim() || !teacherPassword.trim()) {
      setNote('Name, email, login ID and password are required.');
      return;
    }
    if (!teacherSubject.trim()) {
      setNote('Subject is required — it becomes the subject button in Curriculum Upload.');
      return;
    }
    // Without at least one class the teacher's subject belongs to no class and
    // would never show up in the curriculum panel.
    if (!teacherGrades.length) {
      setNote('Pick at least one class — the subject only appears in Curriculum Upload for the classes you select.');
      return;
    }
    // Duplicate subject check: prevent registering the same subject for the same class
    const existingTeachers = Array.isArray(teachers) ? teachers : [];
    for (const grade of teacherGrades) {
      const className = `Class ${grade}`;
      const duplicate = existingTeachers.find(
        (t) => String(t.subject || '').toLowerCase() === teacherSubject.trim().toLowerCase()
          && (Array.isArray(t.grades) ? t.grades : []).some((g) => String(g).toLowerCase() === className.toLowerCase())
      );
      if (duplicate) {
        setNote(`${teacherSubject} already has a teacher (${duplicate.name}) for ${className}. Cannot register duplicate subjects for the same class.`);
        return;
      }
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
        gender: teacherGender || undefined,
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
      setTeacherGender('');
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
    if (!editTeacherForm.grades.length) {
      setTeacherActionNote('Pick at least one class — without it the subject disappears from Curriculum Upload.');
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

  // ─── student accounts (owned by the school) ───────────────────────────────

  async function onRegisterStudent(e) {
    e.preventDefault();
    if (!studentName.trim() || !studentLoginId.trim() || !studentPassword.trim()) {
      setNote('Student name, login ID and password are required.');
      return;
    }
    if (!studentClassName.trim()) {
      setNote('Pick a class — it decides which subjects and lessons the student sees.');
      return;
    }
    if (studentPassword.length < 8) {
      setNote('Password must be at least 8 characters.');
      return;
    }
    setBusy('student-manual');
    setNote('');
    try {
      const res = await schoolRegisterStudent({
        name: studentName,
        className: studentClassName,
        loginId: studentLoginId,
        password: studentPassword,
        gender: studentGender || undefined,
        dateOfBirth: studentDob || undefined,
        phone: studentPhone || undefined,
        email: studentEmail || undefined
      });
      if (!res?.success) {
        setNote(res?.error || 'Student registration failed.');
        return;
      }
      setCreatedStudent({
        ...res.student,
        className: studentClassName,
        password: studentPassword,
        dateOfBirth: studentDob || null,
        phone: studentPhone || null,
        email: studentEmail || null
      });
      setDashboard((prev) => ({
        ...prev,
        summary: {
          ...(prev.summary || {}),
          students: Number(prev?.summary?.students || 0) + 1
        }
      }));
      setStudentName('');
      setStudentLoginId('');
      setStudentPassword('');
      setStudentGender('');
      setStudentDob('');
      setStudentPhone('');
      setStudentEmail('');
      setStudentPage(1);
      await refreshStudentsSection();
      setNote('Student account created. Share the login credentials with the student.');
    } catch (e2) {
      setNote('Unable to register student right now.');
    } finally {
      setBusy('');
    }
  }

  function startEditStudent(s) {
    setStudentActionNote('');
    setEditingStudentId(s.id || '');
    setEditStudentForm({ name: s.name || '', className: s.className || '' });
  }

  function cancelEditStudent() {
    setEditingStudentId('');
    setStudentActionNote('');
  }

  async function onSaveStudentEdit(studentId) {
    if (!editStudentForm.name.trim()) {
      setStudentActionNote('Student name is required.');
      return;
    }
    if (!editStudentForm.className.trim()) {
      setStudentActionNote('Pick a class — it decides which lessons the student sees.');
      return;
    }
    setStudentActionBusy(`edit-${studentId}`);
    setStudentActionNote('');
    try {
      const res = await schoolUpdateStudent(studentId, {
        name: editStudentForm.name,
        className: editStudentForm.className
      });
      if (!res?.success) {
        setStudentActionNote(res?.error || 'Could not update student.');
        return;
      }
      setEditingStudentId('');
      await refreshStudentsSection();
      setNote('Student details updated.');
    } catch (e2) {
      setStudentActionNote('Unable to update student right now.');
    } finally {
      setStudentActionBusy('');
    }
  }

  async function onConfirmResetStudentPassword() {
    if (!resetStudent) return;
    if (!resetStudentPasswordValue || resetStudentPasswordValue.length < 8) {
      setStudentActionNote('Password must be at least 8 characters.');
      return;
    }
    setStudentActionBusy(`reset-${resetStudent.id}`);
    setStudentActionNote('');
    try {
      const res = await schoolResetStudentPassword(resetStudent.id, resetStudentPasswordValue);
      if (!res?.success) {
        setStudentActionNote(res?.error || 'Could not reset password.');
        return;
      }
      setCreatedStudent({
        name: resetStudent.name,
        className: resetStudent.className,
        loginId: res?.student?.loginId || resetStudent.loginId,
        password: resetStudentPasswordValue
      });
      setResetStudent(null);
      setResetStudentPasswordValue('');
      setNote('Password reset. Share the new credentials with the student.');
    } catch (e2) {
      setStudentActionNote('Unable to reset password right now.');
    } finally {
      setStudentActionBusy('');
    }
  }

  async function onConfirmDeleteStudent() {
    if (!deleteStudent) return;
    setStudentActionBusy(`delete-${deleteStudent.id}`);
    setStudentActionNote('');
    try {
      const res = await schoolDeleteStudent(deleteStudent.id);
      if (!res?.success) {
        setStudentActionNote(res?.error || 'Could not delete student.');
        return;
      }
      setDeleteStudent(null);
      setDashboard((prev) => ({
        ...prev,
        summary: {
          ...(prev.summary || {}),
          students: Math.max(0, Number(prev?.summary?.students || 0) - 1)
        }
      }));
      setStudentPage(1);
      await refreshStudentsSection();
      setNote('Student account deleted.');
    } catch (e2) {
      setStudentActionNote('Unable to delete student right now.');
    } finally {
      setStudentActionBusy('');
    }
  }

  const navItems = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'teachers', label: 'Teachers & Invites', icon: '👨‍🏫' },
    { key: 'curriculum', label: 'Curriculum Upload', icon: '📚' },
    { key: 'studentRegistration', label: 'Student Registration', icon: '🧑‍🎓' }
  ];

  const sectionMeta = {
    overview: {
      title: 'School Overview',
      subtitle: 'A snapshot of your teachers, students, classes and subjects.'
    },
    teachers: {
      title: 'Teachers & Invites',
      subtitle: 'Create teacher accounts manually, then search the roster, edit details and reset passwords.'
    },
    curriculum: {
      title: 'Curriculum Upload',
      subtitle: 'Pick a class, pick a subject, upload the lesson PDF. Everything else follows.'
    },
    studentRegistration: {
      title: 'Student Registration',
      subtitle: 'Create student accounts manually or send a self-registration link, and manage every enrolled student.'
    }
  };

  const meta = sectionMeta[activeSection] || sectionMeta.overview;
  const schoolLabel = session?.schoolName || 'School';

  return (
    <div className="td-shell sd-portal">
      {/* ── Sidebar ── */}
      <nav className="td-sidebar">
        <div className="td-sidebar-brand">
          <span className="td-sidebar-logo">🏫</span>
          <span className="td-sidebar-title">AcademiX</span>
        </div>

        <div className="td-sidebar-profile">
          <div className="td-profile-avatar">
            <span>{String(schoolLabel).charAt(0).toUpperCase()}</span>
          </div>
          <div className="td-profile-info">
            <strong>{schoolLabel}</strong>
            <span>School Admin</span>
          </div>
        </div>

        <div className="td-sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`td-nav-btn${activeSection === item.key ? ' active' : ''}`}
              onClick={() => setActiveSection(item.key)}
            >
              <span className="td-nav-icon">{item.icon}</span>
              <span className="td-nav-label">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="td-sidebar-footer">
          <button type="button" className="td-nav-logout" onClick={onLogout}>
            <span className="td-nav-icon">🚪</span>
            <span className="td-nav-label">Logout</span>
          </button>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div className="td-main">
        <header className="td-topbar sd-portal-topbar">
          <div>
            <p className="td-kicker">School Admin Portal</p>
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
          <div className="sd-portal-actions">
            <button
              className="sd-inline-btn"
              onClick={refreshAllSections}
              disabled={refreshing === 'all'}
              title="Refresh all sections"
            >
              {refreshing === 'all' ? '⟳ ...' : '⟳ Refresh'}
            </button>
            <div className="sd-export-wrap">
              <button
                className="sd-inline-btn"
                onClick={() => setExportFormat(exportFormat ? null : true)}
                title="Export data"
              >
                ⬇ Export
              </button>
              {exportFormat && (
                <div className="sd-export-menu">
                  <button onClick={() => exportTeachers('csv')}>👨‍🏫 Teachers CSV</button>
                  <button onClick={() => exportStudents('csv')}>👥 Students CSV</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {error ? <p className="sd-note">{error}</p> : null}

        <section className="td-stats">
          <article className="td-stat-card">
            <p>Total Teachers</p>
            <strong>{dashboard?.summary?.teachers ?? 0}</strong>
          </article>
          <article className="td-stat-card">
            <p>Total Students</p>
            <strong>{dashboard?.summary?.students ?? 0}</strong>
          </article>
          <article className="td-stat-card">
            <p>Active Invites</p>
            <strong>{dashboard?.summary?.activeInvites ?? 0}</strong>
          </article>
          <article className="td-stat-card">
            <p>Classes</p>
            <strong>{classOptions.length}</strong>
          </article>
        </section>

        {note ? <p className="sd-note">{note}</p> : null}

        {/* ══════════ OVERVIEW ══════════ */}
        {activeSection === 'overview' && (
          <section className="sd-grid">
            <article className="sd-card">
              <h3>Quick Actions</h3>
              <p>Jump straight to the page you need.</p>
              <div className="sd-quick-actions">
                {navItems.filter((item) => item.key !== 'overview').map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="sd-quick-action"
                    onClick={() => setActiveSection(item.key)}
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </article>

            <article className="sd-card">
              <h3>Classes &amp; Subjects</h3>
              <p>Subjects come from the classes each registered teacher handles.</p>
              <ul className="sd-class-map">
                {(curriculumClassMap || []).map((entry) => (
                  <li key={entry.className}>
                    <strong>{entry.className}</strong>
                    <span>
                      {(entry.subjects || []).length
                        ? (entry.subjects || []).map((s) => s.subject).join(', ')
                        : 'No subjects yet'}
                    </span>
                  </li>
                ))}
                {!(curriculumClassMap || []).length ? (
                  <li className="sd-class-map-empty">
                    Register a teacher and assign their classes to populate this list.
                  </li>
                ) : null}
              </ul>
            </article>
          </section>
        )}

        {/* ══════════ CURRICULUM UPLOAD ══════════ */}
        {activeSection === 'curriculum' && (
          <section className="sd-grid">
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
              {/* Subject buttons — one per subject this class already has. */}
              <div className="eg-cc-subjects">
                <div className="eg-cc-subjects-head">
                  <span className="eg-cc-subjects-label">Subjects in {curriculumClassName}</span>
                  {curriculumSubjectButtons.length ? (
                    <span className="eg-cc-subjects-hint">Pick a subject to upload into and to view its lessons</span>
                  ) : null}
                </div>

                {curriculumSubjectButtons.length ? (
                  <div className="eg-cc-subject-buttons" role="tablist" aria-label={`Subjects in ${curriculumClassName}`}>
                    {curriculumSubjectButtons.map((entry) => {
                      const active = curriculumSelectedSubject?.subject === entry.subject;
                      return (
                        <button
                          key={entry.subject}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={`eg-cc-subject-btn${active ? ' is-active' : ''}${entry.canUpload ? '' : ' is-orphan'}`}
                          onClick={() => {
                            setCurriculumSubject(entry.subject);
                            setCurriculumEditing(null);
                            setCurriculumConfirmDelete(null);
                          }}
                          title={
                            entry.canUpload
                              ? `${entry.teacherName} teaches ${entry.subject} for ${curriculumClassName}`
                              : `No ${entry.subject} teacher is registered for ${curriculumClassName} yet`
                          }
                        >
                          <span className="eg-cc-subject-name">{entry.subject}</span>
                          <span className="eg-cc-subject-count">{entry.lessonCount}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="eg-cc-empty">
                    <strong>No subjects registered for {curriculumClassName}</strong>
                    <p>
                      Subjects appear here as soon as a teacher is registered for this class. Add the subject teacher
                      first, then come back to upload lessons.
                    </p>
                  </div>
                )}

                {curriculumMissingSubjects.length ? (
                  <div className="eg-cc-missing">
                    <span className="eg-cc-missing-label">Not in {curriculumClassName} yet</span>
                    <div className="eg-cc-missing-list">
                      {curriculumMissingSubjects.map((entry) => (
                        <span key={entry.subject} className="eg-cc-missing-chip">
                          <strong>{entry.subject}</strong>
                          <em>
                            {entry.hasAnyClass
                              ? `${entry.teachers.join(', ')} — not assigned to ${curriculumClassName}`
                              : `${entry.teachers.join(', ')} — no classes assigned`}
                          </em>
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="eg-cc-missing-action"
                      onClick={() => setActiveSection('teachers')}
                    >
                      Assign classes on Teachers &amp; Invites →
                    </button>
                  </div>
                ) : null}

                {curriculumLoadError ? (
                  <div className="eg-cc-loaderr">
                    <span>
                      Lessons could not be loaded, so every subject shows 0. {curriculumLoadError}
                    </span>
                    <button
                      type="button"
                      onClick={() => loadCurriculumPanel({ className: curriculumClassName })}
                      disabled={curriculumLoading}
                    >
                      {curriculumLoading ? 'Retrying…' : 'Retry'}
                    </button>
                  </div>
                ) : null}
              </div>

              {curriculumSelectedSubject ? (
                <>
              <form className="eg-cc-form" onSubmit={onAddCurriculumLesson}>
                <div className="eg-cc-field">
                  <label>Subject</label>
                  {curriculumSubjectMatch ? (
                    <p className="eg-cc-msg is-ok">
                      <span aria-hidden="true">✓</span>
                      <span>
                        <strong>{curriculumSubjectMatch.teacherName}</strong> teaches {curriculumSubjectMatch.subject} for{' '}
                        {curriculumClassName}. This lesson will be filed under them.
                      </span>
                    </p>
                  ) : (
                    <p className="eg-cc-msg is-error">
                      <span aria-hidden="true">!</span>
                      <span>
                        Students in {curriculumClassName} see <strong>{curriculumSelectedSubject.subject}</strong>, but no{' '}
                        {curriculumSelectedSubject.subject} teacher is registered for this class yet. Register the subject
                        teacher for {curriculumClassName} first — then lessons can be uploaded here.
                      </span>
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
                  <label htmlFor="cc-pdf">Lesson PDFs (lesson content, revision notes, question banks, etc.)</label>
                  <input
                    id="cc-pdf"
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={(e) => setCurriculumPdfFiles(Array.from(e.target.files || []))}
                  />
                  {curriculumPdfFiles.length > 1 && (
                    <span className="eg-cc-file-count">{curriculumPdfFiles.length} files selected</span>
                  )}
                </div>

                <div className="eg-cc-submit">
                  <button
                    type="submit"
                    className="eg-cc-primary"
                    disabled={curriculumPdfUploading || !curriculumSubjectMatch || !curriculumLessonTitle.trim() || !curriculumPdfFiles.length}
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
                  <h4>
                    {curriculumSelectedSubject
                      ? `${curriculumSelectedSubject.subject} lessons · ${curriculumClassName}`
                      : `Uploaded lessons · ${curriculumClassName}`}
                  </h4>
                </div>

                {!(curriculumVisibleGroup?.lessons || []).length ? (
                  <div className="eg-cc-empty">
                    <strong>
                      {curriculumSelectedSubject
                        ? `No ${curriculumSelectedSubject.subject} lessons for ${curriculumClassName} yet`
                        : `Nothing uploaded for ${curriculumClassName} yet`}
                    </strong>
                    <p>Add the first lesson above — it will be saved as lesson 1 and appear here.</p>
                  </div>
                ) : (
                  <>
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
                                    <span>Add more documents (revision notes, question banks, etc.)</span>
                                    <input
                                      type="file"
                                      accept="application/pdf"
                                      multiple
                                      onChange={(e) => setCurriculumEditing((c) => ({ ...c, additionalFiles: Array.from(e.target.files || []) }))}
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
                                        <button
                                          type="button"
                                          className="eg-cc-doc-remove"
                                          title="Remove this document"
                                          disabled={!!curriculumRowBusy}
                                          onClick={async () => {
                                            setCurriculumRowBusy(lesson.id);
                                            try {
                                              await deleteCurriculumLessonDocument(lesson.id, doc.id);
                                              await loadCurriculumPanel();
                                            } catch (err) {
                                              setNote(err?.message || 'Failed to remove document');
                                            } finally {
                                              setCurriculumRowBusy('');
                                            }
                                          }}
                                        >✕</button>
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
                                        additionalFiles: []
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
              ) : null}
            </>
          )}
        </article>
          </section>
        )}

        {/* ══════════ TEACHERS & INVITES ══════════ */}
        {activeSection === 'teachers' && (
          <section className="sd-grid">
        <article className="sd-card">
              <h3>Manual Teacher Registration</h3>
          <form className="sd-form" onSubmit={onRegisterTeacher}>
            <input value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="Teacher name" />
            <input value={teacherEmail} onChange={(e) => setTeacherEmail(e.target.value)} placeholder="Teacher email" />
            <input value={teacherSubject} onChange={(e) => setTeacherSubject(e.target.value)} placeholder="Subject" />
            <label className="sd-field-label">Gender</label>
            <select value={teacherGender} onChange={(e) => setTeacherGender(e.target.value)}>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
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
            <div ref={teacherClassFilterRef} style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                className={`sd-inline-btn${teacherClassFilter ? ' primary' : ''}`}
                onClick={() => setShowTeacherClassFilter((v) => !v)}
                title="Filter by class"
                style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: '110px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                {teacherClassFilter || 'All Classes'}
              </button>
              {showTeacherClassFilter && (
                <div className="sd-class-filter-dropdown">
                  <button
                    type="button"
                    className={`sd-class-filter-option${!teacherClassFilter ? ' active' : ''}`}
                    onClick={() => { setTeacherClassFilter(''); setTeacherPage(1); setShowTeacherClassFilter(false); }}
                  >
                    All Classes
                  </button>
                  {classOptions.map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      className={`sd-class-filter-option${teacherClassFilter === cls ? ' active' : ''}`}
                      onClick={() => { setTeacherClassFilter(cls); setTeacherPage(1); setShowTeacherClassFilter(false); }}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="sd-student-scroll">
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
          </div>
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
          </section>
        )}

        {/* ══════════ STUDENT REGISTRATION ══════════ */}
        {activeSection === 'studentRegistration' && (
          <section className="sd-grid">
            <article className="sd-card">
              <h3>Manual Student Registration</h3>
              <form className="sd-form" onSubmit={onRegisterStudent}>
                <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Student name" />
                <label className="sd-field-label">Gender</label>
                <select value={studentGender} onChange={(e) => setStudentGender(e.target.value)}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                <label className="sd-field-label">Class</label>
                <select value={studentClassName} onChange={(e) => setStudentClassName(e.target.value)}>
                  <option value="">Select class</option>
                  {studentClassOptions.map((cls) => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
                <label className="sd-field-label">Date of Birth (optional)</label>
                <input type="date" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} />
                <label className="sd-field-label">Mobile Number (optional)</label>
                <input type="tel" value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} placeholder="Mobile number" />
                <label className="sd-field-label">Email Address (optional)</label>
                <input type="email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} placeholder="Email address" />
                <input value={studentLoginId} onChange={(e) => setStudentLoginId(e.target.value)} placeholder="Student login ID" />
                <input
                  type="password"
                  value={studentPassword}
                  onChange={(e) => setStudentPassword(e.target.value)}
                  placeholder="Strong password (min 8 characters)"
                />
                <button type="submit" disabled={busy === 'student-manual'}>
                  {busy === 'student-manual' ? 'Creating...' : 'Create Student Account'}
                </button>
              </form>
              {createdStudent ? (
                <div className="sd-credential-box">
                  <strong>Share with student:</strong>
                  <p>Name: {createdStudent.name}</p>
                  <p>Class: {createdStudent.className}</p>
                  <p>Login ID: {createdStudent.loginId}</p>
                  <p>Password: {createdStudent.password}</p>
                  {createdStudent.dateOfBirth ? <p>Date of Birth: {createdStudent.dateOfBirth}</p> : null}
                  {createdStudent.phone ? <p>Mobile: {createdStudent.phone}</p> : null}
                  {createdStudent.email ? <p>Email: {createdStudent.email}</p> : null}
                </div>
              ) : null}
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
            <div ref={classFilterRef} style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                className={`sd-inline-btn${studentClassFilter ? ' primary' : ''}`}
                onClick={() => setShowClassFilter((v) => !v)}
                title="Filter by class"
                style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: '110px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                {studentClassFilter || 'All Classes'}
              </button>
              {showClassFilter && (
                <div className="sd-class-filter-dropdown">
                  <button
                    type="button"
                    className={`sd-class-filter-option${!studentClassFilter ? ' active' : ''}`}
                    onClick={() => { setStudentClassFilter(''); setStudentPage(1); setShowClassFilter(false); }}
                  >
                    All Classes
                  </button>
                  {classOptions.map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      className={`sd-class-filter-option${studentClassFilter === cls ? ' active' : ''}`}
                      onClick={() => { setStudentClassFilter(cls); setStudentPage(1); setShowClassFilter(false); }}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="sd-student-scroll">
          <ul className="sd-list sd-teacher-list">
            {(students.length ? students : []).map((s) => {
              const sid = s.id || s.loginId;
              const isEditing = editingStudentId === sid;
              return (
                <li key={sid} className="sd-teacher-item">
                  {isEditing ? (
                    <div className="sd-teacher-edit">
                      <input
                        value={editStudentForm.name}
                        onChange={(e) => setEditStudentForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Student name"
                      />
                      <select
                        value={editStudentForm.className}
                        onChange={(e) => setEditStudentForm((f) => ({ ...f, className: e.target.value }))}
                        disabled={studentActionBusy === `edit-${sid}`}
                      >
                        <option value="">Select class</option>
                        {studentClassOptions.map((cls) => (
                          <option key={cls} value={cls}>{cls}</option>
                        ))}
                      </select>
                      {studentActionNote ? <p className="sd-teacher-action-note">{studentActionNote}</p> : null}
                      <div className="sd-teacher-edit-actions">
                        <button
                          type="button"
                          className="sd-inline-btn primary"
                          onClick={() => onSaveStudentEdit(sid)}
                          disabled={studentActionBusy === `edit-${sid}`}
                        >
                          {studentActionBusy === `edit-${sid}` ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" className="sd-inline-btn" onClick={cancelEditStudent}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="sd-teacher-row">
                      <div className="sd-teacher-info">
                        <strong>{s.name || 'Student'}</strong>
                        {s.className ? (
                          <span className="sd-teacher-meta">{s.className}</span>
                        ) : (
                          <span className="sd-teacher-grades sd-teacher-grades-none">No class assigned</span>
                        )}
                      </div>
                      <div className="sd-teacher-actions">
                        <button type="button" className="sd-icon-btn" title="Edit student" onClick={() => startEditStudent(s)}>✏️</button>
                        <button
                          type="button"
                          className="sd-icon-btn"
                          title="Reset password"
                          onClick={() => { setResetStudent(s); setResetStudentPasswordValue(''); setStudentActionNote(''); }}
                        >🔑</button>
                        <button
                          type="button"
                          className="sd-icon-btn danger"
                          title="Delete student"
                          onClick={() => { setDeleteStudent(s); setStudentActionNote(''); }}
                        >🗑️</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            {!students.length ? <li>No students match the current search.</li> : null}
          </ul>
          </div>
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
        )}
      </div>

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

      {resetStudent ? (
        <div className="sd-modal-overlay" onClick={() => { setResetStudent(null); setStudentActionNote(''); }}>
          <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reset password</h3>
            <p>Set a new password for <strong>{resetStudent.name || 'this student'}</strong> (login ID: {resetStudent.loginId || '—'}).</p>
            <input
              type="text"
              value={resetStudentPasswordValue}
              onChange={(e) => setResetStudentPasswordValue(e.target.value)}
              placeholder="New password (min 8 characters)"
              autoFocus
            />
            {studentActionNote ? <p className="sd-teacher-action-note">{studentActionNote}</p> : null}
            <div className="sd-modal-actions">
              <button type="button" className="sd-inline-btn" onClick={() => { setResetStudent(null); setStudentActionNote(''); }}>Cancel</button>
              <button
                type="button"
                className="sd-inline-btn primary"
                onClick={onConfirmResetStudentPassword}
                disabled={studentActionBusy === `reset-${resetStudent.id}`}
              >
                {studentActionBusy === `reset-${resetStudent.id}` ? 'Resetting...' : 'Reset password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteStudent ? (
        <div className="sd-modal-overlay" onClick={() => { setDeleteStudent(null); setStudentActionNote(''); }}>
          <div className="sd-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete student?</h3>
            <p className="sd-modal-warning">
              ⚠️ This will permanently delete <strong>{deleteStudent.name || 'this student'}</strong>
              {deleteStudent.className ? ` (${deleteStudent.className})` : ''} along with their login, progress and
              orchard history. This action cannot be undone.
            </p>
            {studentActionNote ? <p className="sd-teacher-action-note">{studentActionNote}</p> : null}
            <div className="sd-modal-actions">
              <button type="button" className="sd-inline-btn" onClick={() => { setDeleteStudent(null); setStudentActionNote(''); }}>Cancel</button>
              <button
                type="button"
                className="sd-inline-btn danger"
                onClick={onConfirmDeleteStudent}
                disabled={studentActionBusy === `delete-${deleteStudent.id}`}
              >
                {studentActionBusy === `delete-${deleteStudent.id}` ? 'Deleting...' : 'Delete student'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

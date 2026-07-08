import React, { useEffect, useMemo, useState } from 'react';
import {
  addTestQuestion,
  askTeacherAi,
  assignTeacherHomework,
  cloneTest,
  createTeacherStudentInvite,
  createTest,
  deleteTest,
  getTeacherAnnouncements,
  getTeacherDashboard,
  getTeacherStudentProgress,
  getTeacherStudents,
  getTests,
  listTeacherStudentInvites,
  listTestQuestions,
  postTeacherAnnouncement,
  registerTeacherStudent,
  resendTeacherStudentInvite,
  revokeTeacherStudentInvite,
  updateTest,
  deleteTestQuestion,
  updateTestQuestion
} from '../api';

function shortDate(value) {
  if (!value) return 'TBD';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'TBD';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function inviteStatusLabel(invite) {
  const status = String(invite?.status || '').toLowerCase();
  if (status) return status;
  if (invite?.revoked) return 'revoked';
  if (invite?.consumed) return 'used';
  const expiresAt = invite?.expiresAt ? new Date(invite.expiresAt).getTime() : null;
  if (expiresAt && Date.now() > expiresAt) return 'expired';
  return 'active';
}

const emptyProgress = { subjectScores: [], timeline: [] };

export default function TeacherDashboard({ session, onLogout }) {
  const [loading, setLoading] = useState(true);

  const [panelLoading, setPanelLoading] = useState({
    summary: false,
    students: false,
    invites: false,
    progress: false,
    announcements: false,
    tests: false
  });

  const [panelError, setPanelError] = useState({
    summary: '',
    students: '',
    invites: '',
    progress: '',
    announcements: '',
    tests: ''
  });

  const [dashboard, setDashboard] = useState({ summary: {} });
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedProgress, setSelectedProgress] = useState(emptyProgress);

  const [announcements, setAnnouncements] = useState([]);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');

  const [studentInvites, setStudentInvites] = useState([]);
  const [studentInviteSearch, setStudentInviteSearch] = useState('');
  const [studentInviteStatusFilter, setStudentInviteStatusFilter] = useState('all');
  const [studentInvitePage, setStudentInvitePage] = useState(1);
  const [studentInviteTotalPages, setStudentInviteTotalPages] = useState(1);

  const [studentName, setStudentName] = useState('');
  const [studentClassName, setStudentClassName] = useState('Class 8');
  const [studentLoginId, setStudentLoginId] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [latestCreatedAccount, setLatestCreatedAccount] = useState(null);

  const [studentInviteLink, setStudentInviteLink] = useState('');

  const [assignTitle, setAssignTitle] = useState('Worksheet Practice');
  const [assignSubject, setAssignSubject] = useState(session?.subject || 'Mathematics');
  const [assignDueAt, setAssignDueAt] = useState('');

  const [teacherPrompt, setTeacherPrompt] = useState('Plan a 30-minute revision session for Algebra basics.');
  const [teacherAi, setTeacherAi] = useState(null);

  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  // Test creation state
  const [tests, setTests] = useState([]);
  const [newTestTitle, setNewTestTitle] = useState('');
  const [newTestSubject, setNewTestSubject] = useState(session?.subject || 'Mathematics');
  const [newTestClass, setNewTestClass] = useState('Class 8');
  const [newTestDuration, setNewTestDuration] = useState(30);
  const [createdTestId, setCreatedTestId] = useState(null);
  const [createdTestTitle, setCreatedTestTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [questionOptions, setQuestionOptions] = useState(['', '', '', '']);
  const [questionCorrect, setQuestionCorrect] = useState(0);
  const [testQuestions, setTestQuestions] = useState([]);
  const [testsNote, setTestsNote] = useState('');
  const [editingTestId, setEditingTestId] = useState(null);
  const [editingTestTitle, setEditingTestTitle] = useState('');
  const [editingTestSubject, setEditingTestSubject] = useState('');
  const [editingTestClass, setEditingTestClass] = useState('');
  const [editingTestDuration, setEditingTestDuration] = useState(30);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editingQuestionText, setEditingQuestionText] = useState('');
  const [editingQuestionOptions, setEditingQuestionOptions] = useState(['', '', '', '']);
  const [editingQuestionCorrect, setEditingQuestionCorrect] = useState(0);

  const STUDENT_INVITES_PER_PAGE = 5;

  const setPanelLoadingKey = (key, value) => {
    setPanelLoading((prev) => ({ ...prev, [key]: value }));
  };

  const setPanelErrorKey = (key, value) => {
    setPanelError((prev) => ({ ...prev, [key]: value }));
  };

  async function loadSummaryPanel() {
    setPanelLoadingKey('summary', true);
    setPanelErrorKey('summary', '');
    try {
      const dashRes = await getTeacherDashboard();
      setDashboard(dashRes || { summary: {} });
    } catch (e) {
      setPanelErrorKey('summary', e?.message || 'Unable to load summary.');
    } finally {
      setPanelLoadingKey('summary', false);
    }
  }

  async function loadStudentsPanel(queryText) {
    setPanelLoadingKey('students', true);
    setPanelErrorKey('students', '');
    try {
      const studentsRes = await getTeacherStudents(queryText || '');
      const loadedStudents = Array.isArray(studentsRes?.students) ? studentsRes.students : [];
      setStudents(loadedStudents);

      if (!selectedStudentId && loadedStudents.length) {
        const firstId = loadedStudents[0].id;
        setSelectedStudentId(firstId);
        setSelectedStudentIds([firstId]);
      }

      if (selectedStudentId && !loadedStudents.some((s) => s.id === selectedStudentId)) {
        const nextId = loadedStudents[0]?.id || '';
        setSelectedStudentId(nextId);
        setSelectedStudentIds(nextId ? [nextId] : []);
      }
    } catch (e) {
      setPanelErrorKey('students', e?.message || 'Unable to load students.');
      setStudents([]);
    } finally {
      setPanelLoadingKey('students', false);
    }
  }

  async function loadInvitesPanel(params) {
    setPanelLoadingKey('invites', true);
    setPanelErrorKey('invites', '');
    try {
      const invRes = await listTeacherStudentInvites(params || {
        q: studentInviteSearch,
        status: studentInviteStatusFilter,
        page: studentInvitePage,
        limit: STUDENT_INVITES_PER_PAGE
      });
      const loadedInvites = Array.isArray(invRes?.invites) ? invRes.invites : [];
      setStudentInvites(loadedInvites);
      setStudentInviteTotalPages(Math.max(1, Number(invRes?.pagination?.totalPages || 1)));
    } catch (e) {
      setPanelErrorKey('invites', e?.message || 'Unable to load student invites.');
      setStudentInvites([]);
      setStudentInviteTotalPages(1);
    } finally {
      setPanelLoadingKey('invites', false);
    }
  }

  async function loadProgressPanel(studentId) {
    if (!studentId) {
      setSelectedProgress(emptyProgress);
      return;
    }

    setPanelLoadingKey('progress', true);
    setPanelErrorKey('progress', '');
    try {
      const res = await getTeacherStudentProgress(studentId);
      setSelectedProgress(res || emptyProgress);
    } catch (e) {
      setPanelErrorKey('progress', e?.message || 'Unable to load progress.');
      setSelectedProgress(emptyProgress);
    } finally {
      setPanelLoadingKey('progress', false);
    }
  }

  async function loadAnnouncementsPanel() {
    setPanelLoadingKey('announcements', true);
    setPanelErrorKey('announcements', '');
    try {
      const annRes = await getTeacherAnnouncements();
      setAnnouncements(Array.isArray(annRes?.announcements) ? annRes.announcements : []);
    } catch (e) {
      setPanelErrorKey('announcements', e?.message || 'Unable to load announcements.');
      setAnnouncements([]);
    } finally {
      setPanelLoadingKey('announcements', false);
    }
  }

  async function loadTestsPanel() {
    setPanelLoadingKey('tests', true);
    setPanelErrorKey('tests', '');
    try {
      const res = await getTests('', 'all');
      setTests(Array.isArray(res?.tests) ? res.tests : []);
    } catch (e) {
      setPanelErrorKey('tests', e?.message || 'Unable to load tests.');
      setTests([]);
    } finally {
      setPanelLoadingKey('tests', false);
    }
  }

  async function loadTestQuestions(testId) {
    if (!testId) {
      setTestQuestions([]);
      return;
    }
    setPanelLoadingKey('tests', true);
    setPanelErrorKey('tests', '');
    try {
      const res = await listTestQuestions(testId);
      setTestQuestions(Array.isArray(res?.questions) ? res.questions : []);
    } catch (e) {
      setPanelErrorKey('tests', e?.message || 'Unable to load test questions.');
      setTestQuestions([]);
    } finally {
      setPanelLoadingKey('tests', false);
    }
  }

  function resetQuestionEditor() {
    setEditingQuestionId(null);
    setEditingQuestionText('');
    setEditingQuestionOptions(['', '', '', '']);
    setEditingQuestionCorrect(0);
  }

  async function onCreateTest(e) {
    e.preventDefault();
    if (!newTestTitle.trim()) return;
    setBusy('createTest');
    setTestsNote('');
    try {
      const res = await createTest({
        title: newTestTitle.trim(),
        subject: newTestSubject,
        className: newTestClass,
        durationMinutes: Number(newTestDuration) || 30
      });
      const nextTestId = res.test?.id || null;
      setCreatedTestId(nextTestId);
      setCreatedTestTitle(res.test?.title || newTestTitle);
      setEditingTestId(null);
      setEditingTestTitle('');
      setEditingTestSubject('');
      setEditingTestClass('');
      setEditingTestDuration(30);
      await loadTestQuestions(nextTestId);
      setNewTestTitle('');
      setTestsNote(`Test "${res.test?.title}" created. Now add questions below.`);
      await loadTestsPanel();
    } catch (e2) {
      setTestsNote(e2?.message || 'Unable to create test.');
    } finally {
      setBusy('');
    }
  }

  async function onSaveTestEdit(e) {
    e.preventDefault();
    if (!editingTestId) return;
    setBusy('saveTest');
    setTestsNote('');
    try {
      const res = await updateTest(editingTestId, {
        title: editingTestTitle,
        subject: editingTestSubject,
        className: editingTestClass,
        durationMinutes: Number(editingTestDuration) || 30
      });
      setTestsNote(`Test "${res.test?.title || editingTestTitle}" updated.`);
      setCreatedTestId(editingTestId);
      setCreatedTestTitle(res.test?.title || editingTestTitle);
      await Promise.all([loadTestsPanel(), loadTestQuestions(editingTestId)]);
      setEditingTestId(null);
    } catch (e2) {
      setTestsNote(e2?.message || 'Unable to update test.');
    } finally {
      setBusy('');
    }
  }

  async function onReuseTest(test) {
    if (!test?.id) return;
    setBusy(`reuseTest-${test.id}`);
    setTestsNote('');
    try {
      const res = await cloneTest(test.id, {
        title: `Copy of ${test.title || 'Test'}`,
        subject: test.subject || 'General',
        className: test.className || test.class_name || '',
        durationMinutes: test.durationMinutes || test.duration_minutes || 30
      });
      setCreatedTestId(res.test?.id || null);
      setCreatedTestTitle(res.test?.title || `Copy of ${test.title || 'Test'}`);
      setEditingTestId(null);
      setEditingTestTitle('');
      setEditingTestSubject('');
      setEditingTestClass('');
      setEditingTestDuration(30);
      setQuestionText('');
      setQuestionOptions(['', '', '', '']);
      setQuestionCorrect(0);
      setTestQuestions(Array.isArray(res.questions) ? res.questions : []);
      setTestsNote(`Reused "${test.title}" as a new draft with ${Array.isArray(res.questions) ? res.questions.length : 0} question(s).`);
      await loadTestsPanel();
    } catch (e2) {
      setTestsNote(e2?.message || 'Unable to reuse test.');
    } finally {
      setBusy('');
    }
  }

  function onStartEdit(test) {
    if (!test?.id) return;
    setEditingTestId(test.id);
    setEditingTestTitle(test.title || '');
    setEditingTestSubject(test.subject || 'General');
    setEditingTestClass(test.className || test.class_name || '');
    setEditingTestDuration(Number(test.durationMinutes || test.duration_minutes || 30));
    setCreatedTestId(test.id);
    setCreatedTestTitle(test.title || 'Test');
    setTestsNote(`Editing "${test.title || 'Test'}".`);
  }

  async function onAddQuestion(e) {
    e.preventDefault();
    if (!createdTestId || !questionText.trim()) return;
    const opts = questionOptions.map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) {
      setTestsNote('Add at least 2 non-empty options.');
      return;
    }
    if (questionCorrect < 0 || questionCorrect >= opts.length) {
      setTestsNote('Select a correct option among the filled options.');
      return;
    }
    setBusy('addQuestion');
    setTestsNote('');
    try {
      const res = await addTestQuestion(createdTestId, {
        text: questionText.trim(),
        options: opts,
        correctOption: questionCorrect,
        marks: 1
      });
      setTestQuestions((prev) => [...prev, res.question]);
      setQuestionText('');
      setQuestionOptions(['', '', '', '']);
      setQuestionCorrect(0);
      setTestsNote(`Question added (${testQuestions.length + 1} total).`);
    } catch (e2) {
      setTestsNote(e2?.message || 'Unable to add question.');
    } finally {
      setBusy('');
    }
  }

  function onStartQuestionEdit(question) {
    if (!question?.id) return;
    setCreatedTestId(createdTestId || null);
    setEditingQuestionId(question.id);
    setEditingQuestionText(question.text || '');
    const nextOptions = Array.isArray(question.options) ? question.options.slice(0, 4) : [];
    while (nextOptions.length < 4) nextOptions.push('');
    setEditingQuestionOptions(nextOptions);
    const savedCorrect = Number(question.correctOption ?? question.correct_option ?? 0);
    setEditingQuestionCorrect(Number.isFinite(savedCorrect) && savedCorrect >= 0 ? savedCorrect : 0);
    setTestsNote(`Editing question ${question.id}.`);
  }

  async function onSaveQuestionEdit(e) {
    e.preventDefault();
    if (!createdTestId || !editingQuestionId) return;
    if (!editingQuestionText.trim()) {
      setTestsNote('Question text is required.');
      return;
    }
    const opts = editingQuestionOptions.map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) {
      setTestsNote('Add at least 2 non-empty options.');
      return;
    }
    if (editingQuestionCorrect < 0 || editingQuestionCorrect >= opts.length) {
      setTestsNote('Select a correct option among the filled options.');
      return;
    }
    setBusy('saveQuestion');
    setTestsNote('');
    try {
      const res = await updateTestQuestion(createdTestId, editingQuestionId, {
        text: editingQuestionText.trim(),
        options: opts,
        correctOption: editingQuestionCorrect,
        marks: 1
      });
      setTestQuestions((prev) => prev.map((q) => (q.id === editingQuestionId ? res.question : q)));
      resetQuestionEditor();
      setTestsNote('Question updated.');
      await loadTestQuestions(createdTestId);
    } catch (e2) {
      setTestsNote(e2?.message || 'Unable to update question.');
    } finally {
      setBusy('');
    }
  }

  async function onDeleteQuestion(questionId) {
    if (!createdTestId || !questionId) return;
    setBusy(`deleteQuestion-${questionId}`);
    setTestsNote('');
    try {
      await deleteTestQuestion(createdTestId, questionId);
      setTestQuestions((prev) => prev.filter((q) => q.id !== questionId));
      if (editingQuestionId === questionId) resetQuestionEditor();
      setTestsNote('Question deleted.');
      await loadTestQuestions(createdTestId);
    } catch (e2) {
      setTestsNote(e2?.message || 'Unable to delete question.');
    } finally {
      setBusy('');
    }
  }

  async function onDeleteTest(testId) {
    if (!testId) return;
    setBusy(`deleteTest-${testId}`);
    try {
      await deleteTest(testId);
      if (createdTestId === testId) {
        setCreatedTestId(null);
        setCreatedTestTitle('');
        setTestQuestions([]);
      }
      setTestsNote('Test deleted.');
      await loadTestsPanel();
    } catch (e2) {
      setTestsNote(e2?.message || 'Unable to delete test.');
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setLoading(true);
      await Promise.all([
        loadSummaryPanel(),
        loadStudentsPanel(''),
        loadInvitesPanel({ page: 1, limit: STUDENT_INVITES_PER_PAGE }),
        loadAnnouncementsPanel(),
        loadTestsPanel()
      ]);
      if (active) setLoading(false);
    }
    bootstrap();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (studentInvitePage > studentInviteTotalPages) {
      setStudentInvitePage(studentInviteTotalPages);
    }
  }, [studentInvitePage, studentInviteTotalPages]);

  useEffect(() => {
    loadStudentsPanel(studentSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentSearch]);

  useEffect(() => {
    loadInvitesPanel({
      q: studentInviteSearch,
      status: studentInviteStatusFilter,
      page: studentInvitePage,
      limit: STUDENT_INVITES_PER_PAGE
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentInviteSearch, studentInviteStatusFilter, studentInvitePage]);

  useEffect(() => {
    loadProgressPanel(selectedStudentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId]);

  useEffect(() => {
    loadTestQuestions(createdTestId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdTestId]);

  const topStats = useMemo(() => {
    const s = dashboard?.summary || {};
    return [
      { label: 'Students', value: panelLoading.summary ? '...' : (s.studentsCount ?? 0) },
      { label: 'Active Homework', value: panelLoading.summary ? '...' : (s.activeHomework ?? 0) },
      { label: 'Average Score', value: panelLoading.summary ? '...' : `${s.avgScore ?? 0}%` },
      { label: 'Announcements', value: panelLoading.summary ? '...' : (s.announcementsCount ?? 0) }
    ];
  }, [dashboard, panelLoading.summary]);

  function toggleStudent(id) {
    setSelectedStudentIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      return prev.concat(id);
    });
  }

  async function onAssignHomework(e) {
    e.preventDefault();
    if (!assignTitle.trim()) return;
    if (!selectedStudentIds.length) {
      setNote('Select at least one student to assign homework.');
      return;
    }

    setBusy('assign');
    setNote('');
    try {
      const res = await assignTeacherHomework({
        title: assignTitle,
        subject: assignSubject,
        dueAt: assignDueAt || null,
        studentIds: selectedStudentIds
      });
      const created = Number(res?.created || 0);
      setNote(created ? `Homework assigned to ${created} student(s).` : (res?.error || 'No assignments created.'));
      await loadSummaryPanel();
    } catch (e2) {
      setNote('Failed to assign homework.');
    } finally {
      setBusy('');
    }
  }

  async function onPostAnnouncement(e) {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementMessage.trim()) return;

    setBusy('announce');
    setNote('');
    try {
      const res = await postTeacherAnnouncement({
        title: announcementTitle,
        message: announcementMessage,
        audience: 'students'
      });
      if (!res?.announcement) {
        setNote(res?.error || 'Announcement could not be posted.');
        return;
      }

      setAnnouncementTitle('');
      setAnnouncementMessage('');
      setNote('Announcement posted for all students.');
      await Promise.all([loadAnnouncementsPanel(), loadSummaryPanel()]);
    } catch (e2) {
      setNote('Failed to post announcement.');
    } finally {
      setBusy('');
    }
  }

  async function onAskAi(e) {
    e.preventDefault();
    if (!teacherPrompt.trim()) return;

    setBusy('ai');
    setTeacherAi(null);
    try {
      const res = await askTeacherAi(teacherPrompt);
      setTeacherAi(res || null);
    } catch (e2) {
      setTeacherAi({ reply: 'AI request failed. Please retry.' });
    } finally {
      setBusy('');
    }
  }

  async function onRegisterStudent(e) {
    e.preventDefault();
    if (!studentName.trim() || !studentLoginId.trim() || !studentPassword.trim()) {
      setNote('Student name, login ID and password are required.');
      return;
    }

    setBusy('register');
    setNote('');
    try {
      const res = await registerTeacherStudent({
        name: studentName,
        className: studentClassName,
        loginId: studentLoginId,
        password: studentPassword
      });
      if (!res?.success || !res?.student) {
        setNote(res?.error || 'Student registration failed.');
        return;
      }

      setLatestCreatedAccount({
        name: res.student.name,
        className: res.student.className,
        studentId: res.student.id,
        loginId: res.student.loginId,
        password: studentPassword
      });

      setStudentName('');
      setStudentLoginId('');
      setStudentPassword('');
      setNote('Student account created. Share the login ID and password manually with the student.');
      await Promise.all([loadStudentsPanel(studentSearch), loadSummaryPanel()]);
    } catch (e2) {
      setNote('Unable to register student right now.');
    } finally {
      setBusy('');
    }
  }

  async function onCreateStudentInvite() {
    setBusy('student-invite');
    setNote('');
    try {
      const res = await createTeacherStudentInvite({ expiresHours: 72 });
      if (!res?.success) {
        setNote(res?.error || 'Could not create student invite.');
        return;
      }

      setStudentInviteLink(res?.invite?.link || '');
      setStudentInvitePage(1);
      await Promise.all([
        loadInvitesPanel({ q: studentInviteSearch, status: studentInviteStatusFilter, page: 1, limit: STUDENT_INVITES_PER_PAGE }),
        loadSummaryPanel()
      ]);
      setNote('Student self-registration link created. Share it with student.');
    } catch (e2) {
      setNote('Unable to create student invite right now.');
    } finally {
      setBusy('');
    }
  }

  async function onRevokeStudentInvite(token) {
    if (!token) return;

    setBusy(`student-revoke-${token}`);
    setNote('');
    try {
      const res = await revokeTeacherStudentInvite(token);
      if (!res?.success) {
        setNote(res?.error || 'Could not revoke invite.');
        return;
      }

      await Promise.all([loadInvitesPanel(), loadSummaryPanel()]);
      setNote('Student invite revoked.');
    } catch (e) {
      setNote('Unable to revoke student invite right now.');
    } finally {
      setBusy('');
    }
  }

  async function onResendStudentInvite(token) {
    if (!token) return;

    setBusy(`student-resend-${token}`);
    setNote('');
    try {
      const res = await resendTeacherStudentInvite(token, { expiresHours: 72 });
      if (!res?.success || !res?.invite) {
        setNote(res?.error || 'Could not resend invite.');
        return;
      }

      setStudentInviteLink(res.invite.link || '');
      setStudentInvitePage(1);
      await Promise.all([
        loadInvitesPanel({ q: studentInviteSearch, status: studentInviteStatusFilter, page: 1, limit: STUDENT_INVITES_PER_PAGE }),
        loadSummaryPanel()
      ]);
      setNote('New student invite generated. Previous link was revoked.');
    } catch (e) {
      setNote('Unable to resend student invite right now.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="td-shell">
      <header className="td-topbar">
        <div>
          <p className="td-kicker">Teacher Workspace</p>
          <h1>Welcome, {session?.name || 'Teacher'}</h1>
          <p>Manage class progress, assign homework, and communicate in one place.</p>
        </div>
        <button className="td-logout" onClick={onLogout}>Logout</button>
      </header>

      {panelError.summary ? <p className="td-note">{panelError.summary}</p> : null}

      <section className="td-stats">
        {topStats.map((item) => (
          <article key={item.label} className="td-stat-card">
            <p>{item.label}</p>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="td-grid">
        <article className="td-card">
          <h3>Register Student Account</h3>
          <p>Only teachers can create student credentials. Share them manually with the student.</p>
          <form className="td-form" onSubmit={onRegisterStudent}>
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Student name" />
            <input value={studentClassName} onChange={(e) => setStudentClassName(e.target.value)} placeholder="Class (ex: Class 8)" />
            <input value={studentLoginId} onChange={(e) => setStudentLoginId(e.target.value)} placeholder="Login ID (ex: aarav.8a)" />
            <input type="password" value={studentPassword} onChange={(e) => setStudentPassword(e.target.value)} placeholder="Temporary password" />
            <button type="submit" disabled={busy === 'register'}>{busy === 'register' ? 'Creating...' : 'Create Student Login'}</button>
          </form>
          {latestCreatedAccount ? (
            <div className="td-credential-box">
              <strong>Share these details with student:</strong>
              <p>Name: {latestCreatedAccount.name}</p>
              <p>Class: {latestCreatedAccount.className}</p>
              <p>Student ID: {latestCreatedAccount.studentId}</p>
              <p>Login ID: {latestCreatedAccount.loginId}</p>
              <p>Password: {latestCreatedAccount.password}</p>
            </div>
          ) : null}
          <div className="td-invite-box">
            <button className="td-form-invite-btn" onClick={onCreateStudentInvite} disabled={busy === 'student-invite'}>
              {busy === 'student-invite' ? 'Generating...' : 'Generate Student Invite Link'}
            </button>
            {studentInviteLink ? <p>{studentInviteLink}</p> : null}
          </div>
        </article>

        <article className="td-card">
          <h3>Students</h3>
          <p>Choose a student to view subject-level progress.</p>
          <div className="invite-toolbar">
            <input
              className="invite-search"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search students by name"
            />
          </div>
          {panelLoading.students ? <p className="td-empty">Loading students...</p> : null}
          {panelError.students ? <p className="td-empty">{panelError.students}</p> : null}
          <div className="td-student-list">
            {(students || []).map((s) => (
              <button
                key={s.id}
                className={selectedStudentId === s.id ? 'active' : ''}
                onClick={() => setSelectedStudentId(s.id)}
              >
                <div>
                  <strong>{s.name || 'Student'}</strong>
                  <span>{s.className || 'Class'}</span>
                </div>
                <input
                  type="checkbox"
                  checked={selectedStudentIds.includes(s.id)}
                  onChange={() => toggleStudent(s.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${s.name || 'student'} for homework assignment`}
                />
              </button>
            ))}
            {!panelLoading.students && !students.length ? <p className="td-empty">No students available yet.</p> : null}
          </div>
        </article>

        <article className="td-card">
          <h3>Student Invite History</h3>
          <div className="invite-toolbar">
            <input
              className="invite-search"
              value={studentInviteSearch}
              onChange={(e) => {
                setStudentInviteSearch(e.target.value);
                setStudentInvitePage(1);
              }}
              placeholder="Search by token or role"
            />
            <select
              className="invite-filter"
              value={studentInviteStatusFilter}
              onChange={(e) => {
                setStudentInviteStatusFilter(e.target.value);
                setStudentInvitePage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="used">Used</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          {panelLoading.invites ? <p className="td-empty">Loading invites...</p> : null}
          {panelError.invites ? <p className="td-empty">{panelError.invites}</p> : null}
          <ul className="td-announcements">
            {(studentInvites || []).map((i) => (
              <li key={i.token}>
                <div className="td-invite-row">
                  <div>
                    <strong>{i.role} invite</strong>
                    <p>Expires: {i.expiresAt ? shortDate(i.expiresAt) : 'TBD'}</p>
                  </div>
                  <span className={`invite-badge ${inviteStatusLabel(i)}`}>{inviteStatusLabel(i)}</span>
                </div>
                <div className="td-invite-actions">
                  <button
                    type="button"
                    className="td-inline-btn"
                    onClick={() => onResendStudentInvite(i.token)}
                    disabled={busy === `student-resend-${i.token}` || inviteStatusLabel(i) === 'used'}
                  >
                    {busy === `student-resend-${i.token}` ? 'Resending...' : 'Resend'}
                  </button>
                  <button
                    type="button"
                    className="td-inline-btn danger"
                    onClick={() => onRevokeStudentInvite(i.token)}
                    disabled={busy === `student-revoke-${i.token}` || inviteStatusLabel(i) !== 'active'}
                  >
                    {busy === `student-revoke-${i.token}` ? 'Revoking...' : 'Revoke'}
                  </button>
                </div>
              </li>
            ))}
            {!panelLoading.invites && !studentInvites.length ? <p className="td-empty">No student invites match the current filters.</p> : null}
          </ul>
          <div className="invite-pager">
            <button
              type="button"
              className="td-inline-btn"
              onClick={() => setStudentInvitePage((p) => Math.max(1, p - 1))}
              disabled={studentInvitePage === 1}
            >
              Previous
            </button>
            <span>Page {studentInvitePage} of {studentInviteTotalPages}</span>
            <button
              type="button"
              className="td-inline-btn"
              onClick={() => setStudentInvitePage((p) => Math.min(studentInviteTotalPages, p + 1))}
              disabled={studentInvitePage >= studentInviteTotalPages}
            >
              Next
            </button>
          </div>
        </article>

        <article className="td-card">
          <h3>Progress Snapshot</h3>
          <p>{selectedStudentId ? `Student ID: ${selectedStudentId}` : 'Pick a student to see metrics.'}</p>
          {panelLoading.progress ? <p className="td-empty">Loading progress...</p> : null}
          {panelError.progress ? <p className="td-empty">{panelError.progress}</p> : null}
          <div className="td-progress-grid">
            {(selectedProgress?.subjectScores || []).slice(0, 6).map((x) => (
              <div key={x.subject}>
                <span>{x.subject}</span>
                <strong>{x.avgScore}%</strong>
              </div>
            ))}
            {!panelLoading.progress && !selectedProgress?.subjectScores?.length ? <p className="td-empty">No progress data yet.</p> : null}
          </div>
          <ul className="td-timeline">
            {(selectedProgress?.timeline || []).slice(0, 5).map((t, idx) => (
              <li key={`${t.date || 'd'}-${idx}`}>
                <span>{shortDate(t.date)}</span>
                <span>{t.subject}</span>
                <strong>{t.score}%</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="td-card">
          <h3>Assign Homework</h3>
          <p>Create one assignment and send it to selected students.</p>
          <form className="td-form" onSubmit={onAssignHomework}>
            <input value={assignTitle} onChange={(e) => setAssignTitle(e.target.value)} placeholder="Homework title" />
            <input value={assignSubject} onChange={(e) => setAssignSubject(e.target.value)} placeholder="Subject" />
            <input type="date" value={assignDueAt} onChange={(e) => setAssignDueAt(e.target.value)} />
            <button type="submit" disabled={busy === 'assign'}>{busy === 'assign' ? 'Assigning...' : 'Assign Homework'}</button>
          </form>
        </article>

        <article className="td-card">
          <h3>Announcements</h3>
          <p>Broadcast updates to all students at once.</p>
          <form className="td-form" onSubmit={onPostAnnouncement}>
            <input value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} placeholder="Announcement title" />
            <textarea rows={3} value={announcementMessage} onChange={(e) => setAnnouncementMessage(e.target.value)} placeholder="Type announcement message" />
            <button type="submit" disabled={busy === 'announce'}>{busy === 'announce' ? 'Posting...' : 'Post Announcement'}</button>
          </form>
          {panelLoading.announcements ? <p className="td-empty">Loading announcements...</p> : null}
          {panelError.announcements ? <p className="td-empty">{panelError.announcements}</p> : null}
          <ul className="td-announcements">
            {(announcements || []).slice(0, 5).map((a) => (
              <li key={a.id || `${a.title}-${a.createdAt}`}>
                <strong>{a.title}</strong>
                <p>{a.message}</p>
              </li>
            ))}
            {!panelLoading.announcements && !announcements.length ? <p className="td-empty">No announcements posted yet.</p> : null}
          </ul>
        </article>

        <article className="td-card td-card-wide">
          <h3>Teacher AI Assistant</h3>
          <p>Get class strategy suggestions, topic recap plans, and activity ideas.</p>
          <form className="td-form td-ai-form" onSubmit={onAskAi}>
            <textarea rows={3} value={teacherPrompt} onChange={(e) => setTeacherPrompt(e.target.value)} />
            <button type="submit" disabled={busy === 'ai'}>{busy === 'ai' ? 'Thinking...' : 'Ask AI'}</button>
          </form>
          {teacherAi ? (
            <div className="td-ai-reply">
              <p>{teacherAi.reply}</p>
              <ul>
                {(teacherAi.tips || []).map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>

        <article className="td-card td-card-wide">
          <h3>Tests</h3>
          <p>Create tests and add questions for your students.</p>
          {panelLoading.tests ? <p className="td-empty">Loading tests...</p> : null}
          {panelError.tests ? <p className="td-empty">{panelError.tests}</p> : null}

          {/* Existing tests list */}
          {tests.length ? (
            <ul className="td-announcements">
              {tests.map((t) => (
                <li key={t.id} className="td-invite-row">
                  <div>
                    <strong>{t.title}</strong>
                    <span className="td-invite-status">{t.subject || 'General'} &middot; {t.status || 'upcoming'}</span>
                  </div>
                  <div className="td-invite-actions">
                    <button
                      type="button"
                      className="td-inline-btn"
                      onClick={() => { setCreatedTestId(t.id); setCreatedTestTitle(t.title); setTestsNote(`Adding questions to "${t.title}"`); }}
                    >Add Questions</button>
                    <button
                      type="button"
                      className="td-inline-btn"
                      onClick={() => onStartEdit(t)}
                    >Edit</button>
                    <button
                      type="button"
                      className="td-inline-btn"
                      onClick={() => onReuseTest(t)}
                      disabled={busy === `reuseTest-${t.id}`}
                    >{busy === `reuseTest-${t.id}` ? 'Reusing...' : 'Reuse'}</button>
                    <button
                      className="td-inline-btn danger"
                      type="button"
                      onClick={() => onDeleteTest(t.id)}
                      disabled={busy === `deleteTest-${t.id}`}
                    >Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (!panelLoading.tests ? <p className="td-empty">No tests yet. Create one below.</p> : null)}

          {/* Edit selected test */}
          {editingTestId ? (
            <form className="td-form" onSubmit={onSaveTestEdit} style={{ marginTop: 14 }}>
              <h4 style={{ margin: '0 0 8px' }}>Edit Test</h4>
              <input
                className="td-input"
                value={editingTestTitle}
                onChange={(e) => setEditingTestTitle(e.target.value)}
                placeholder="Test title"
                required
              />
              <input
                className="td-input"
                value={editingTestSubject}
                onChange={(e) => setEditingTestSubject(e.target.value)}
                placeholder="Subject"
              />
              <input
                className="td-input"
                value={editingTestClass}
                onChange={(e) => setEditingTestClass(e.target.value)}
                placeholder="Class name"
              />
              <input
                className="td-input"
                type="number"
                min={1}
                max={180}
                value={editingTestDuration}
                onChange={(e) => setEditingTestDuration(e.target.value)}
                placeholder="Duration (minutes)"
              />
              <div className="td-invite-actions">
                <button type="submit" disabled={busy === 'saveTest'}>{busy === 'saveTest' ? 'Saving...' : 'Save Changes'}</button>
                <button type="button" className="td-inline-btn danger" onClick={() => { setEditingTestId(null); setTestsNote('Edit cancelled.'); }}>Cancel</button>
              </div>
            </form>
          ) : null}

          {/* Create new test */}
          <form className="td-form" onSubmit={onCreateTest} style={{ marginTop: 14 }}>
            <h4 style={{ margin: '0 0 8px' }}>New Test</h4>
            <input
              className="td-input"
              value={newTestTitle}
              onChange={(e) => setNewTestTitle(e.target.value)}
              placeholder="Test title"
              required
            />
            <input
              className="td-input"
              value={newTestSubject}
              onChange={(e) => setNewTestSubject(e.target.value)}
              placeholder="Subject"
            />
            <input
              className="td-input"
              value={newTestClass}
              onChange={(e) => setNewTestClass(e.target.value)}
              placeholder="Class name"
            />
            <input
              className="td-input"
              type="number"
              min={1}
              max={180}
              value={newTestDuration}
              onChange={(e) => setNewTestDuration(e.target.value)}
              placeholder="Duration (minutes)"
            />
            <button type="submit" disabled={busy === 'createTest'}>{busy === 'createTest' ? 'Creating...' : 'Create Test'}</button>
          </form>

          {/* Add questions to a created/selected test */}
          {createdTestId ? (
            <form className="td-form" onSubmit={onAddQuestion} style={{ marginTop: 14 }}>
              <h4 style={{ margin: '0 0 8px' }}>Add Question to &ldquo;{createdTestTitle}&rdquo;</h4>
              <textarea
                className="td-input"
                rows={2}
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="Question text"
                required
              />
              {questionOptions.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="correctOption"
                    checked={questionCorrect === idx}
                    onChange={() => setQuestionCorrect(idx)}
                    title="Mark as correct"
                  />
                  <input
                    className="td-input"
                    style={{ flex: 1 }}
                    value={opt}
                    onChange={(e) => {
                      const next = [...questionOptions];
                      next[idx] = e.target.value;
                      setQuestionOptions(next);
                    }}
                    placeholder={`Option ${idx + 1}${questionCorrect === idx ? ' (correct)' : ''}`}
                  />
                </div>
              ))}
              <button type="submit" disabled={busy === 'addQuestion'}>{busy === 'addQuestion' ? 'Adding...' : 'Add Question'}</button>
              {testQuestions.length ? <p className="td-empty">{testQuestions.length} question(s) loaded/added so far.</p> : null}
              {testQuestions.length ? (
                <ul className="td-announcements">
                  {testQuestions.map((q, idx) => (
                    <li key={q.id || `${idx}-${q.text}`}>
                      <div className="td-invite-row">
                        <div>
                          <strong>{idx + 1}. {q.text}</strong>
                          <p>{Array.isArray(q.options) ? q.options.join(' • ') : ''}</p>
                          <p>Correct: {Array.isArray(q.options) && Number.isInteger(q.correctOption) && q.correctOption >= 0 && q.correctOption < q.options.length ? `Option ${q.correctOption + 1}` : 'Not set'}</p>
                        </div>
                        <div className="td-invite-actions">
                          <button type="button" className="td-inline-btn" onClick={() => onStartQuestionEdit(q)}>Edit</button>
                          <button type="button" className="td-inline-btn danger" disabled={busy === `deleteQuestion-${q.id}`} onClick={() => onDeleteQuestion(q.id)}>{busy === `deleteQuestion-${q.id}` ? 'Deleting...' : 'Delete'}</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </form>
          ) : null}

          {editingQuestionId ? (
            <form className="td-form" onSubmit={onSaveQuestionEdit} style={{ marginTop: 14 }}>
              <h4 style={{ margin: '0 0 8px' }}>Edit Question</h4>
              <textarea
                className="td-input"
                rows={2}
                value={editingQuestionText}
                onChange={(e) => setEditingQuestionText(e.target.value)}
                placeholder="Question text"
                required
              />
              {editingQuestionOptions.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="editingCorrectOption"
                    checked={editingQuestionCorrect === idx}
                    onChange={() => setEditingQuestionCorrect(idx)}
                    title="Mark as correct"
                  />
                  <input
                    className="td-input"
                    style={{ flex: 1 }}
                    value={opt}
                    onChange={(e) => {
                      const next = [...editingQuestionOptions];
                      next[idx] = e.target.value;
                      setEditingQuestionOptions(next);
                    }}
                    placeholder={`Option ${idx + 1}`}
                  />
                </div>
              ))}
              <div className="td-invite-actions">
                <button type="submit" disabled={busy === 'saveQuestion'}>{busy === 'saveQuestion' ? 'Saving...' : 'Save Question'}</button>
                <button type="button" className="td-inline-btn danger" onClick={resetQuestionEditor}>Cancel</button>
              </div>
            </form>
          ) : null}

          {testsNote ? <p className="td-note">{testsNote}</p> : null}
        </article>
      </section>

      {loading ? <p className="td-loading">Loading teacher workspace...</p> : null}
      {note ? <p className="td-note">{note}</p> : null}
    </div>
  );
}

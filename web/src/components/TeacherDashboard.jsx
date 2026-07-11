import React, { useEffect, useMemo, useState } from 'react';
import {
  addTestQuestion,
  askTeacherAi,
  assignTeacherHomework,
  getTeacherAssignedHomework,
  getTeacherHomeworkAttempts,
  uploadHomeworkImage,
  resyncTeacherHomework,
  bulkUpdateTeacherStudentsClass,
  cloneTest,
  createTeacherStudentInvite,
  createTest,
  deleteTest,
  getTeacherAnnouncements,
  getTeacherStudentActivity,
  getTeacherStudentHomework,
  getTeacherStudentTestAttempts,
  gradeTeacherHomework,
  getTeacherDashboard,
  getTeacherProfile,
  getTeacherStudentDeliveryStatus,
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
const emptyDeliveryStatus = {
  announcementsAvailable: 0,
  homeworkAssigned: 0,
  homeworkPending: 0,
  testsAvailable: 0,
  eventsScheduled: 0,
  rewardCoins: 0,
  recentAnnouncementTitle: null,
  recentHomeworkTitle: null,
  recentTestTitle: null,
  nextEventTitle: null
};
const emptyActivity = [];

function shortDateTime(value) {
  if (!value) return 'Just now';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'Just now';
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function parseSafeDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function assignmentStableKey(item) {
  return [
    item?.subject || '',
    item?.title || '',
    item?.className || '',
    item?.startAt || '',
    item?.dueAt || '',
    item?.createdAt || ''
  ].join('|');
}

function toLocalDateTimeInputValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function firstTwoParagraphs(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const parts = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return raw;
  return `${parts.slice(0, 2).join('\n\n')}...`;
}

export default function TeacherDashboard({ session, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [teacherProfile, setTeacherProfile] = useState(null);

  const [panelLoading, setPanelLoading] = useState({
    summary: false,
    students: false,
    invites: false,
    progress: false,
    delivery: false,
    activity: false,
    announcements: false,
    tests: false,
    homework: false,
    testAttempts: false
  });

  const [panelError, setPanelError] = useState({
    summary: '',
    students: '',
    invites: '',
    progress: '',
    delivery: '',
    activity: '',
    announcements: '',
    tests: '',
    homework: '',
    testAttempts: ''
  });

  const [dashboard, setDashboard] = useState({ summary: {} });
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('all');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedProgress, setSelectedProgress] = useState(emptyProgress);
  const [selectedDeliveryStatus, setSelectedDeliveryStatus] = useState(emptyDeliveryStatus);
  const [selectedActivity, setSelectedActivity] = useState(emptyActivity);
  const [activityTypeFilter, setActivityTypeFilter] = useState('all');
  const [selectedHomework, setSelectedHomework] = useState([]);
  const [selectedTestAttempts, setSelectedTestAttempts] = useState([]);
  const [gradingHwId, setGradingHwId] = useState(null);
  const [gradeValue, setGradeValue] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');

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
  const [bulkClassName, setBulkClassName] = useState('Class 8');
  const [studentLoginId, setStudentLoginId] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [latestCreatedAccount, setLatestCreatedAccount] = useState(null);

  const [studentInviteLink, setStudentInviteLink] = useState('');

  const [assignTitle, setAssignTitle] = useState('');
  const [assignSubject, setAssignSubject] = useState(session?.subject || 'Mathematics');
  const [assignNote, setAssignNote] = useState('');
  const [assignAttachmentUrl, setAssignAttachmentUrl] = useState('');
  const [assignAttachmentUploading, setAssignAttachmentUploading] = useState(false);
  const [assignStartAt, setAssignStartAt] = useState('');
  const [assignDueAt, setAssignDueAt] = useState('');
  const [activeAssignments, setActiveAssignments] = useState([]); // confirmed assignments shown at bottom
  const [homeworkHistory, setHomeworkHistory] = useState([]);     // all past assignments from backend
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [historyFilterDate, setHistoryFilterDate] = useState('');
  const [teacherTargetClass, setTeacherTargetClass] = useState('all');
  const [hwAttemptsByHwId, setHwAttemptsByHwId] = useState({});
  const [expandedHistoryNotes, setExpandedHistoryNotes] = useState({});

  const [teacherPrompt, setTeacherPrompt] = useState('Plan a 30-minute revision session for Algebra basics.');
  const [teacherAi, setTeacherAi] = useState(null);
  const [historyStorageKey] = useState(() => {
    const tId = String(session?.teacherId || session?.id || 'teacher-local');
    return `teacher-homework-history-${tId}`;
  });
  const [historyReady, setHistoryReady] = useState(false);

  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [activeSection, setActiveSection] = useState('teacher');

  // Test creation state
  const [tests, setTests] = useState([]);
  const [newTestTitle, setNewTestTitle] = useState('');
  const [newTestSubject, setNewTestSubject] = useState(session?.subject || 'Mathematics');
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

  async function loadStudentsPanel(queryText, classNameFilter = studentClassFilter) {
    setPanelLoadingKey('students', true);
    setPanelErrorKey('students', '');
    try {
      const studentsRes = await getTeacherStudents({
        q: queryText || '',
        className: classNameFilter || ''
      });
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

  async function loadDeliveryPanel(studentId) {
    if (!studentId) {
      setSelectedDeliveryStatus(emptyDeliveryStatus);
      return;
    }

    setPanelLoadingKey('delivery', true);
    setPanelErrorKey('delivery', '');
    try {
      const res = await getTeacherStudentDeliveryStatus(studentId);
      setSelectedDeliveryStatus(res?.status || emptyDeliveryStatus);
    } catch (e) {
      setPanelErrorKey('delivery', e?.message || 'Unable to load delivery status.');
      setSelectedDeliveryStatus(emptyDeliveryStatus);
    } finally {
      setPanelLoadingKey('delivery', false);
    }
  }

  async function loadActivityPanel(studentId) {
    if (!studentId) {
      setSelectedActivity(emptyActivity);
      return;
    }

    setPanelLoadingKey('activity', true);
    setPanelErrorKey('activity', '');
    try {
      const res = await getTeacherStudentActivity(studentId);
      setSelectedActivity(Array.isArray(res?.activity) ? res.activity : emptyActivity);
    } catch (e) {
      setPanelErrorKey('activity', e?.message || 'Unable to load recent activity.');
      setSelectedActivity(emptyActivity);
    } finally {
      setPanelLoadingKey('activity', false);
    }
  }

  async function loadHomeworkPanel(studentId) {
    if (!studentId) { setSelectedHomework([]); return; }
    setPanelLoadingKey('homework', true);
    setPanelErrorKey('homework', '');
    try {
      const res = await getTeacherStudentHomework(studentId);
      const list = Array.isArray(res?.homework) ? res.homework : [];
      setSelectedHomework(list);
      const attemptsMap = {};
      await Promise.all(list.map(async (h) => {
        try {
          const attRes = await getTeacherHomeworkAttempts(h.id);
          attemptsMap[h.id] = Array.isArray(attRes?.attempts) ? attRes.attempts : [];
        } catch {
          attemptsMap[h.id] = [];
        }
      }));
      setHwAttemptsByHwId(attemptsMap);
    } catch (e) {
      setPanelErrorKey('homework', e?.message || 'Unable to load homework.');
      setSelectedHomework([]);
      setHwAttemptsByHwId({});
    } finally {
      setPanelLoadingKey('homework', false);
    }
  }

  async function loadTestAttemptsPanel(studentId) {
    if (!studentId) { setSelectedTestAttempts([]); return; }
    setPanelLoadingKey('testAttempts', true);
    setPanelErrorKey('testAttempts', '');
    try {
      const res = await getTeacherStudentTestAttempts(studentId);
      setSelectedTestAttempts(Array.isArray(res?.attempts) ? res.attempts : []);
    } catch (e) {
      setPanelErrorKey('testAttempts', e?.message || 'Unable to load test attempts.');
      setSelectedTestAttempts([]);
    } finally {
      setPanelLoadingKey('testAttempts', false);
    }
  }

  async function onGradeHomework(e) {
    e.preventDefault();
    if (!gradingHwId) return;
    setBusy(`grade-${gradingHwId}`);
    try {
      await gradeTeacherHomework(gradingHwId, {
        status: 'graded',
        grade: gradeValue !== '' ? Number(gradeValue) : null,
        feedback: gradeFeedback || null
      });
      setNote(`Homework graded${gradeValue !== '' ? ` — ${gradeValue}/100` : ''}.`);
      setGradingHwId(null);
      setGradeValue('');
      setGradeFeedback('');
      await loadHomeworkPanel(selectedStudentId);
    } catch (e2) {
      setNote('Failed to save grade.');
    } finally {
      setBusy('');
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
    if (!teacherTargetClass || teacherTargetClass === 'all') {
      setTestsNote('Please select a class at the top of the page before creating a test.');
      return;
    }
    setBusy('createTest');
    setTestsNote('');
    try {
      const res = await createTest({
        title: newTestTitle.trim(),
        subject: newTestSubject,
        className: teacherTargetClass,
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
        loadTestsPanel(),
        getTeacherProfile().then((res) => { if (active && res?.profile) setTeacherProfile(res.profile); }).catch(() => {}),
        loadHomeworkHistory()
      ]);
      if (active) setLoading(false);
    }
    bootstrap();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(historyStorageKey);
      const cached = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(cached) ? cached : [];
      if (list.length) {
        const now = new Date();
        setHomeworkHistory(list);
        setActiveAssignments(
          list.filter((a) => {
            const due = parseSafeDate(a?.dueAt);
            return !due || due > now;
          }).slice(0, 40)
        );
      }
    } catch {
      // Ignore malformed local cache and continue with API source.
    } finally {
      setHistoryReady(true);
    }
  }, [historyStorageKey]);

  // Prune active assignments whose end date has passed
  useEffect(() => {
    if (!historyReady) return;
    const interval = setInterval(() => {
      const now = new Date();
      setActiveAssignments((prev) =>
        prev.filter((a) => {
          const due = parseSafeDate(a?.dueAt);
          return !due || due > now;
        })
      );
    }, 60000);
    return () => clearInterval(interval);
  }, [historyReady]);

  useEffect(() => {
    if (studentInvitePage > studentInviteTotalPages) {
      setStudentInvitePage(studentInviteTotalPages);
    }
  }, [studentInvitePage, studentInviteTotalPages]);

  useEffect(() => {
    loadStudentsPanel(studentSearch, studentClassFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentSearch, studentClassFilter]);

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
    loadDeliveryPanel(selectedStudentId);
    loadActivityPanel(selectedStudentId);
    loadHomeworkPanel(selectedStudentId);
    loadTestAttemptsPanel(selectedStudentId);
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

  function selectAllVisibleStudents() {
    setSelectedStudentIds((students || []).map((student) => student.id));
  }

  function clearSelectedStudents() {
    setSelectedStudentIds([]);
  }

  async function onBulkUpdateClass(e) {
    e.preventDefault();
    if (!selectedStudentIds.length) {
      setNote('Select at least one student for bulk class update.');
      return;
    }
    if (!bulkClassName.trim()) {
      setNote('Enter a class name for bulk update.');
      return;
    }

    setBusy('bulk-class');
    setNote('');
    try {
      const res = await bulkUpdateTeacherStudentsClass({
        studentIds: selectedStudentIds,
        className: bulkClassName.trim()
      });
      setNote(`Updated class to "${bulkClassName.trim()}" for ${Number(res?.updated || 0)} student(s).`);
      await Promise.all([
        loadStudentsPanel(studentSearch, studentClassFilter),
        loadSummaryPanel()
      ]);
    } catch (e2) {
      setNote(e2?.message || 'Unable to update classes in bulk right now.');
    } finally {
      setBusy('');
    }
  }

  const classOptions = useMemo(() => {
    const uniq = new Set();
    (students || []).forEach((student) => {
      const value = String(student?.className || '').trim();
      if (value) uniq.add(value);
    });
    return Array.from(uniq).sort((a, b) => a.localeCompare(b));
  }, [students]);

  const selectedHomeworkSummary = useMemo(() => {
    const submitted = (selectedHomework || []).filter((h) => String(h?.dueStatus || h?.status || '').toLowerCase() === 'submitted' || String(h?.status || '').toLowerCase() === 'graded').length;
    const notSubmitted = (selectedHomework || []).filter((h) => String(h?.dueStatus || h?.status || '').toLowerCase() !== 'submitted' && String(h?.status || '').toLowerCase() !== 'graded').length;
    const overdue = (selectedHomework || []).filter((h) => String(h?.dueStatus || '').toLowerCase() === 'overdue').length;
    return { submitted, notSubmitted, overdue };
  }, [selectedHomework]);

  async function onAssignHomework(e) {
    e.preventDefault();
    if (!assignTitle.trim()) return;
    if (!teacherTargetClass || teacherTargetClass === 'all') {
      setNote('Please select a class at the top of the page before assigning homework.');
      return;
    }

    const now = new Date();
    const startDate = parseSafeDate(assignStartAt);
    const dueDate = parseSafeDate(assignDueAt);
    if (startDate && startDate < now) {
      setNote('Start date/time cannot be in the past.');
      return;
    }
    if (dueDate && dueDate < now) {
      setNote('Due date/time cannot be in the past.');
      return;
    }
    if (startDate && dueDate && dueDate < startDate) {
      setNote('Due date/time must be after start date/time.');
      return;
    }

    setBusy('assign');
    setNote('');
    try {
      const res = await assignTeacherHomework({
        title: assignTitle,
        subject: assignSubject,
        note: assignNote || null,
        attachmentUrl: assignAttachmentUrl || null,
        startAt: assignStartAt || null,
        dueAt: assignDueAt || null,
        className: teacherTargetClass
      });
      const created = Number(res?.created || 0);
      if (created) {
        const newAssignment = {
          id: res.assignments?.[0]?.id || Date.now(),
          title: assignTitle,
          subject: assignSubject,
          note: assignNote,
          attachmentUrl: assignAttachmentUrl || null,
          startAt: assignStartAt || null,
          dueAt: assignDueAt || null,
          className: teacherTargetClass,
          createdAt: new Date().toISOString()
        };
        setActiveAssignments((prev) => [newAssignment, ...prev]);
        setHomeworkHistory((prev) => {
          const merged = [newAssignment, ...prev];
          const dedup = [];
          const seen = new Set();
          merged.forEach((item) => {
            const key = assignmentStableKey(item);
            if (!seen.has(key)) {
              seen.add(key);
              dedup.push(item);
            }
          });
          try {
            localStorage.setItem(historyStorageKey, JSON.stringify(dedup.slice(0, 200)));
          } catch {
            // Ignore storage errors.
          }
          return dedup;
        });
        setNote(`✅ Assigned "${assignTitle}" | Due: ${assignDueAt ? new Date(assignDueAt).toLocaleString() : 'Not set'} | Class: ${teacherTargetClass} | Students: ${created}`);
        // Clear form
        setAssignTitle('');
        setAssignNote('');
        setAssignAttachmentUrl('');
        setAssignStartAt('');
        setAssignDueAt('');
        // Refresh from backend in background; keep optimistic card visible.
        loadHomeworkHistory();
      } else {
        setNote(res?.error || 'No assignments created.');
      }
      await loadSummaryPanel();
    } catch (e2) {
      setNote('Failed to assign homework.');
    } finally {
      setBusy('');
    }
  }

  async function onTeacherHomeworkFileSelected(file) {
    if (!file) return;
    setAssignAttachmentUploading(true);
    setNote('Uploading homework image...');
    try {
      const res = await uploadHomeworkImage(file);
      if (!res?.url) throw new Error('Upload failed');
      setAssignAttachmentUrl(res.url);
      setNote('Homework image uploaded.');
    } catch (e) {
      setNote(e?.message || 'Homework image upload failed.');
    } finally {
      setAssignAttachmentUploading(false);
    }
  }

  async function loadHomeworkHistory() {
    try {
      const res = await getTeacherAssignedHomework();
      const apiList = Array.isArray(res?.assignments) ? res.assignments : [];
      const cachedRaw = localStorage.getItem(historyStorageKey);
      const cachedList = cachedRaw ? JSON.parse(cachedRaw) : [];
      const merged = [...apiList, ...(Array.isArray(cachedList) ? cachedList : [])];
      const dedup = [];
      const seen = new Set();
      merged.forEach((item) => {
        const key = assignmentStableKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          dedup.push(item);
        }
      });

      // ── Auto-resync: push cached items that aren't in the backend back in ──
      // This recovers homework after a server restart wiped in-memory data.
      const apiKeys = new Set(apiList.map(assignmentStableKey));
      const cachedNormalized = (Array.isArray(cachedList) ? cachedList : []).map((item) => ({
        ...item,
        className: item?.className || item?.class_name || '',
        startAt: item?.startAt || item?.start_at || null,
        dueAt: item?.dueAt || item?.due_at || null,
        attachmentUrl: item?.attachmentUrl || item?.attachment_url || null,
        createdAt: item?.createdAt || item?.created_at || null
      }));
      const needsResync = cachedNormalized.filter(
        (item) => item?.className && !apiKeys.has(assignmentStableKey(item))
      );
      if (needsResync.length) {
        // Fire-and-forget; don't block the UI update
        resyncTeacherHomework(needsResync).catch(() => {});
      }

      setHomeworkHistory(dedup);
      try {
        localStorage.setItem(historyStorageKey, JSON.stringify(dedup.slice(0, 300)));
      } catch {
        // Ignore storage errors.
      }
      const now = new Date();
      setActiveAssignments(
        dedup
          .filter((a) => {
            const due = parseSafeDate(a?.dueAt);
            return !due || due > now;
          })
          .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
          .slice(0, 40)
      );
    } catch {
      // Keep local view if API fails.
      try {
        const cachedRaw = localStorage.getItem(historyStorageKey);
        const cachedList = cachedRaw ? JSON.parse(cachedRaw) : [];
        const list = Array.isArray(cachedList) ? cachedList : [];
        setHomeworkHistory(list);
        const now = new Date();
        setActiveAssignments(
          list.filter((a) => {
            const due = parseSafeDate(a?.dueAt);
            return !due || due > now;
          }).slice(0, 40)
        );
      } catch {
        setHomeworkHistory([]);
        setActiveAssignments([]);
      }
    }
  }

  async function onPostAnnouncement(e) {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementMessage.trim()) return;
    if (!teacherTargetClass || teacherTargetClass === 'all') {
      setNote('Please select a class at the top of the page before posting an announcement.');
      return;
    }

    setBusy('announce');
    setNote('');
    try {
      const res = await postTeacherAnnouncement({
        title: announcementTitle,
        message: announcementMessage,
        audience: 'students',
        className: teacherTargetClass
      });
      if (!res?.announcement) {
        setNote(res?.error || 'Announcement could not be posted.');
        return;
      }

      setAnnouncementTitle('');
      setAnnouncementMessage('');
      setNote(`Announcement posted to ${teacherTargetClass}.`);
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

  function exportCSV(filename, headers, rows) {
    const lines = [
      headers.join(','),
      ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function activityIcon(type) {
    const map = { homework: '📝', test: '📊', calendar: '📅', reward: '🏅', library: '📚', chat: '💬' };
    return map[String(type || '').toLowerCase()] || '⚡';
  }

  function scoreColor(score) {
    const n = Number(score);
    if (n >= 80) return '#22c55e';
    if (n >= 60) return '#f59e0b';
    return '#ef4444';
  }

  const filteredActivity = activityTypeFilter === 'all'
    ? (selectedActivity || [])
    : (selectedActivity || []).filter((item) => String(item.type || '').toLowerCase() === activityTypeFilter);

  const selectedStudentName = (students.find((s) => s.id === selectedStudentId)?.name) || selectedStudentId || 'Student';

  const navItems = [
    { key: 'teacher', label: 'Teacher', icon: '📋' },
    { key: 'students', label: 'Students', icon: '👤' },
    { key: 'registration', label: 'Registration', icon: '✏️' }
  ];

  return (
    <div className="td-shell">
      {/* ── Sidebar ── */}
      <nav className="td-sidebar">
        <div className="td-sidebar-brand">
          <span className="td-sidebar-logo">🎓</span>
          <span className="td-sidebar-title">EduGenie</span>
        </div>

        {/* Teacher profile card */}
        <div className="td-sidebar-profile">
          <div className="td-profile-avatar">
            {teacherProfile?.avatarUrl
              ? <img src={teacherProfile.avatarUrl} alt="avatar" className="td-profile-avatar-img" />
              : <span>{String(teacherProfile?.name || session?.name || 'T').charAt(0).toUpperCase()}</span>
            }
          </div>
          <div className="td-profile-info">
            <strong>{teacherProfile?.name || session?.name || 'Teacher'}</strong>
            <span>{teacherProfile?.subject || session?.subject || 'General'}</span>
            {(teacherProfile?.schoolName) ? <span className="td-profile-school">🏫 {teacherProfile.schoolName}</span> : null}
          </div>
        </div>
        <div className="td-sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`td-nav-btn${activeSection === item.key ? ' active' : ''}`}
              onClick={() => setActiveSection(item.key)}
            >
              <span className="td-nav-icon">{item.icon}</span>
              <span className="td-nav-label">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="td-sidebar-footer">
          <button className="td-nav-logout" onClick={onLogout}>
            <span className="td-nav-icon">🚪</span>
            <span className="td-nav-label">Logout</span>
          </button>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div className="td-main">
        <header className="td-topbar">
          <div>
            <p className="td-kicker">Teacher Workspace</p>
            <h1>Welcome, {teacherProfile?.name || session?.name || 'Teacher'}</h1>
            <p>
              {teacherProfile?.subject || session?.subject
                ? <><strong>{teacherProfile?.subject || session?.subject}</strong>{' · '}</>  
                : null}
              {activeSection === 'teacher' ? 'Manage announcements, homework, and tests.' : activeSection === 'students' ? 'Monitor student progress, activity, and delivery.' : 'Register students and manage invitations.'}
            </p>
            {teacherProfile?.schoolName ? (
              <p style={{ fontSize: 11, color: '#8892c4', marginTop: 2 }}>🏫 {teacherProfile.schoolName}</p>
            ) : null}
          </div>
        </header>

        {panelError.summary ? <p className="td-note">{panelError.summary}</p> : null}

        {/* Stats bar — always visible */}
        <section className="td-stats">
          {topStats.map((item) => (
            <article key={item.label} className="td-stat-card">
              <p>{item.label}</p>
              <strong>{item.value}</strong>
            </article>
          ))}
        </section>

        {loading ? <p className="td-loading">Loading teacher workspace...</p> : null}
        {note ? <p className="td-note">{note}</p> : null}

        {/* ══════════ TEACHER SECTION ══════════ */}
        {activeSection === 'teacher' && (
          <section className="td-grid">

            {/* ── Global class selector ── */}
            <div className="td-class-banner">
              <span className="td-class-banner-label">📚 Active Class</span>
              <select
                className="td-class-banner-select"
                value={teacherTargetClass}
                onChange={(e) => setTeacherTargetClass(e.target.value)}
              >
                <option value="all">— Select a class —</option>
                {classOptions.map((cn) => (
                  <option key={cn} value={cn}>{cn}</option>
                ))}
              </select>
              {teacherTargetClass !== 'all' && (
                <span className="td-class-banner-badge">{teacherTargetClass}</span>
              )}
              <span className="td-class-banner-hint">
                {teacherTargetClass === 'all'
                  ? 'Select a class — all actions below will apply to it.'
                  : `All announcements, homework and tests below go to ${teacherTargetClass}.`}
              </span>
            </div>

            <article className="td-card">
              <h3>Announcements</h3>
              <p>Broadcast an update to <strong>{teacherTargetClass === 'all' ? 'the selected class' : teacherTargetClass}</strong>.</p>
              <form className="td-form" onSubmit={onPostAnnouncement}>
                <input value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} placeholder="Announcement title" />
                <textarea rows={3} value={announcementMessage} onChange={(e) => setAnnouncementMessage(e.target.value)} placeholder="Type announcement message" />
                <button type="submit" disabled={busy === 'announce'}>
                  {busy === 'announce' ? 'Posting...' : teacherTargetClass === 'all' ? 'Select a class first' : `Post to ${teacherTargetClass}`}
                </button>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0 }}>📝 Assign Homework</h3>
                  <span style={{ fontSize: '12px', color: '#666', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '999px', padding: '2px 8px' }}>
                    Active: {activeAssignments.length} | History: {homeworkHistory.length}
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    className="td-btn-outline"
                    onClick={() => loadHomeworkHistory()}
                    style={{ marginRight: '6px' }}
                  >
                    ↻ Refresh
                  </button>
                  <button
                    className="td-btn-outline"
                    onClick={() => {
                      if (!showHistoryDropdown) loadHomeworkHistory();
                      setShowHistoryDropdown((v) => !v);
                    }}
                  >
                    📋 View History ▾
                  </button>
                  {showHistoryDropdown && (
                    <div style={{
                      position: 'absolute', right: 0, top: '110%', zIndex: 50,
                      background: '#fff', border: '1px solid #ddd', borderRadius: '10px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '16px',
                      minWidth: '380px', maxHeight: '400px', overflowY: 'auto'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <strong>Assigned Homework History</strong>
                        <button onClick={() => setShowHistoryDropdown(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '13px', color: '#666' }}>Filter by date: </label>
                        <input
                          type="date"
                          value={historyFilterDate}
                          onChange={(e) => setHistoryFilterDate(e.target.value)}
                          style={{ marginLeft: '6px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}
                        />
                        {historyFilterDate && (
                          <button onClick={() => setHistoryFilterDate('')} style={{ marginLeft: '6px', background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '13px' }}>Clear</button>
                        )}
                      </div>
                      {homeworkHistory.length === 0 ? (
                        <p style={{ color: '#999', fontSize: '13px' }}>No homework assigned yet.</p>
                      ) : (
                        homeworkHistory
                          .filter((h) => {
                            const relevantDate = parseSafeDate(h.dueAt) || parseSafeDate(h.startAt) || parseSafeDate(h.createdAt);
                            if (!relevantDate) return false;
                            if (!historyFilterDate) return true;
                            return relevantDate.toISOString().slice(0, 10) === historyFilterDate;
                          })
                          .filter((h) => {
                            // Default view: only last 30 days. Older history requires date selection.
                            if (historyFilterDate) return true;
                            const d = parseSafeDate(h.dueAt) || parseSafeDate(h.startAt) || parseSafeDate(h.createdAt);
                            if (!d) return false;
                            const threshold = new Date();
                            threshold.setDate(threshold.getDate() - 30);
                            return d >= threshold;
                          })
                          .map((h) => (
                            <div key={h.id} style={{
                              padding: '10px 12px', marginBottom: '8px', background: '#f8f8ff',
                              borderRadius: '8px', borderLeft: '3px solid #5b47ff', fontSize: '13px'
                            }}>
                              <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{h.subject}: {h.title}</div>
                              {h.note && (
                                <div style={{ color: '#555', marginBottom: '4px', whiteSpace: 'pre-wrap' }}>
                                  {expandedHistoryNotes[h.id] ? h.note : firstTwoParagraphs(h.note)}
                                  {String(h.note).trim() !== firstTwoParagraphs(h.note) ? (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedHistoryNotes((prev) => ({ ...prev, [h.id]: !prev[h.id] }))}
                                      style={{
                                        marginLeft: '8px',
                                        background: 'none',
                                        border: 'none',
                                        color: '#4f46e5',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                      }}
                                    >
                                      {expandedHistoryNotes[h.id] ? 'Show less' : 'Show full'}
                                    </button>
                                  ) : null}
                                </div>
                              )}
                              <div style={{ color: '#888', fontSize: '12px' }}>
                                {parseSafeDate(h.startAt) && <span>Start: {parseSafeDate(h.startAt).toLocaleString()} · </span>}
                                {parseSafeDate(h.dueAt) && <span>Due: {parseSafeDate(h.dueAt).toLocaleString()}</span>}
                                {!h.startAt && !h.dueAt && <span>Assigned: {h.createdAt ? new Date(h.createdAt).toLocaleDateString() : '–'}</span>}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <p style={{ color: '#666', fontSize: '14px', marginBottom: '12px' }}>
                Send homework to every student in <strong>{teacherTargetClass === 'all' ? 'the selected class' : teacherTargetClass}</strong>.
              </p>

              <form className="td-form" onSubmit={onAssignHomework}>
                <input
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  placeholder="Homework title (e.g. Chapter 5 – Photosynthesis)"
                  required
                />
                <input
                  value={assignSubject}
                  onChange={(e) => setAssignSubject(e.target.value)}
                  placeholder="Subject (e.g. Science, Mathematics, Social)"
                />
                <textarea
                  rows={4}
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  placeholder="Homework instructions / notes for students (e.g. Read pages 45–52 and answer Q1–Q5...)"
                  style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '14px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' }}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onTeacherHomeworkFileSelected(e.target.files?.[0] || null)}
                  disabled={assignAttachmentUploading}
                />
                <input
                  value={assignAttachmentUrl}
                  readOnly
                  placeholder="Uploaded image URL will appear here"
                />
                {assignAttachmentUrl ? (
                  <div style={{ border: '1px dashed #ddd', borderRadius: '8px', padding: '8px' }}>
                    <img src={assignAttachmentUrl} alt="Homework preview" style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }} />
                  </div>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Start Date &amp; Time</label>
                    <input
                      type="datetime-local"
                      value={assignStartAt}
                      onChange={(e) => setAssignStartAt(e.target.value)}
                      min={toLocalDateTimeInputValue()}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>End / Due Date &amp; Time</label>
                    <input
                      type="datetime-local"
                      value={assignDueAt}
                      onChange={(e) => setAssignDueAt(e.target.value)}
                      min={toLocalDateTimeInputValue()}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                <button type="submit" disabled={busy === 'assign'}>
                  {busy === 'assign' ? 'Assigning...' : teacherTargetClass === 'all' ? 'Select a class first' : `✅ Assign to ${teacherTargetClass}`}
                </button>
              </form>

              {/* Active Acknowledgments — visible until due date passes */}
              {activeAssignments.length > 0 && (
                <div style={{ marginTop: '18px' }}>
                  <h4 style={{ fontSize: '14px', color: '#555', marginBottom: '8px' }}>✅ Recently Assigned (visible until due date)</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {activeAssignments.map((a) => (
                      <li key={a.id} style={{
                        padding: '10px 14px', marginBottom: '8px', background: '#eef9f0',
                        borderRadius: '8px', borderLeft: '4px solid #2ecc71', fontSize: '13px'
                      }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                          {a.subject}: {a.title}
                        </div>
                        {a.note && <div style={{ color: '#555', marginBottom: '4px' }}>{a.note}</div>}
                        <div style={{ color: '#888', fontSize: '12px' }}>
                          Class: {a.className}
                          {parseSafeDate(a.startAt) && <span> · Start: {parseSafeDate(a.startAt).toLocaleString()}</span>}
                          {parseSafeDate(a.dueAt) && <span> · Due: {parseSafeDate(a.dueAt).toLocaleString()}</span>}
                          {!a.dueAt && <span> · Due: Not set</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
              <h3>Mock Tests</h3>
              <p>Create tests and add questions for your students.</p>
              {panelLoading.tests ? <p className="td-empty">Loading tests...</p> : null}
              {panelError.tests ? <p className="td-empty">{panelError.tests}</p> : null}

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
                        <button type="button" className="td-inline-btn" onClick={() => onStartEdit(t)}>Edit</button>
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

              {editingTestId ? (
                <form className="td-form" onSubmit={onSaveTestEdit} style={{ marginTop: 14 }}>
                  <h4 style={{ margin: '0 0 8px' }}>Edit Test</h4>
                  <input className="td-input" value={editingTestTitle} onChange={(e) => setEditingTestTitle(e.target.value)} placeholder="Test title" required />
                  <input className="td-input" value={editingTestSubject} onChange={(e) => setEditingTestSubject(e.target.value)} placeholder="Subject" />
                  <input className="td-input" value={editingTestClass} onChange={(e) => setEditingTestClass(e.target.value)} placeholder="Class name" />
                  <input className="td-input" type="number" min={1} max={180} value={editingTestDuration} onChange={(e) => setEditingTestDuration(e.target.value)} placeholder="Duration (minutes)" />
                  <div className="td-invite-actions">
                    <button type="submit" disabled={busy === 'saveTest'}>{busy === 'saveTest' ? 'Saving...' : 'Save Changes'}</button>
                    <button type="button" className="td-inline-btn danger" onClick={() => { setEditingTestId(null); setTestsNote('Edit cancelled.'); }}>Cancel</button>
                  </div>
                </form>
              ) : null}

              <form className="td-form" onSubmit={onCreateTest} style={{ marginTop: 14 }}>
                <h4 style={{ margin: '0 0 8px' }}>New Test</h4>
                <input className="td-input" value={newTestTitle} onChange={(e) => setNewTestTitle(e.target.value)} placeholder="Test title" required />
                <input className="td-input" value={newTestSubject} onChange={(e) => setNewTestSubject(e.target.value)} placeholder="Subject" />
                <input className="td-input" value={newTestDuration} type="number" min={1} max={180} onChange={(e) => setNewTestDuration(e.target.value)} placeholder="Duration (minutes)" />
                <button type="submit" disabled={busy === 'createTest' || teacherTargetClass === 'all'}>{busy === 'createTest' ? 'Creating...' : teacherTargetClass === 'all' ? 'Select a class first' : `Create Test for ${teacherTargetClass}`}</button>
              </form>

              {createdTestId ? (
                <form className="td-form" onSubmit={onAddQuestion} style={{ marginTop: 14 }}>
                  <h4 style={{ margin: '0 0 8px' }}>Add Question to &ldquo;{createdTestTitle}&rdquo;</h4>
                  <textarea className="td-input" rows={2} value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Question text" required />
                  {questionOptions.map((opt, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="radio" name="correctOption" checked={questionCorrect === idx} onChange={() => setQuestionCorrect(idx)} title="Mark as correct" />
                      <input
                        className="td-input"
                        style={{ flex: 1 }}
                        value={opt}
                        onChange={(e) => { const next = [...questionOptions]; next[idx] = e.target.value; setQuestionOptions(next); }}
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
                  <textarea className="td-input" rows={2} value={editingQuestionText} onChange={(e) => setEditingQuestionText(e.target.value)} placeholder="Question text" required />
                  {editingQuestionOptions.map((opt, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="radio" name="editingCorrectOption" checked={editingQuestionCorrect === idx} onChange={() => setEditingQuestionCorrect(idx)} title="Mark as correct" />
                      <input
                        className="td-input"
                        style={{ flex: 1 }}
                        value={opt}
                        onChange={(e) => { const next = [...editingQuestionOptions]; next[idx] = e.target.value; setEditingQuestionOptions(next); }}
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
        )}

        {/* ══════════ STUDENTS SECTION ══════════ */}
        {activeSection === 'students' && (
          <section className="td-grid">
            <article className="td-card">
              <h3>Students</h3>
              <p>Filter by class, select students, and run bulk actions.</p>
              <div className="invite-toolbar">
                <input
                  className="invite-search"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search students by name"
                />
                <select
                  className="invite-filter"
                  value={studentClassFilter}
                  onChange={(e) => setStudentClassFilter(e.target.value)}
                >
                  <option value="all">All classes</option>
                  {classOptions.map((className) => (
                    <option key={className} value={className}>{className}</option>
                  ))}
                </select>
              </div>
              <div className="td-invite-actions">
                <button type="button" className="td-inline-btn" onClick={selectAllVisibleStudents}>Select Visible</button>
                <button type="button" className="td-inline-btn" onClick={clearSelectedStudents}>Clear Selection</button>
              </div>
              <form className="td-form" onSubmit={onBulkUpdateClass}>
                <input
                  value={bulkClassName}
                  onChange={(e) => setBulkClassName(e.target.value)}
                  placeholder="Bulk class name (ex: Class 8-B)"
                />
                <button type="submit" disabled={busy === 'bulk-class'}>
                  {busy === 'bulk-class' ? 'Updating...' : `Update Class for ${selectedStudentIds.length} Selected`}
                </button>
              </form>
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
                      aria-label={`Select ${s.name || 'student'}`}
                    />
                  </button>
                ))}
                {!panelLoading.students && !students.length ? <p className="td-empty">No students available yet.</p> : null}
              </div>
            </article>

            <article className="td-card">
              <h3>Progress Snapshot</h3>
              <div className="td-analytics-header">
                <p>{selectedStudentId ? `📊 ${selectedStudentName}` : 'Select a student to see metrics.'}</p>
                {selectedProgress?.subjectScores?.length > 0 && (
                  <button
                    type="button"
                    className="td-export-btn"
                    onClick={() => exportCSV(
                      `progress-${selectedStudentName}-${new Date().toISOString().slice(0,10)}.csv`,
                      ['Subject', 'Average Score', 'Date'],
                      [
                        ...(selectedProgress.subjectScores || []).map((x) => [x.subject, `${x.avgScore}%`, '']),
                        ...(selectedProgress.timeline || []).map((t) => [t.subject, `${t.score}%`, t.date])
                      ]
                    )}
                  >
                    ↓ Export CSV
                  </button>
                )}
              </div>
              {panelLoading.progress ? <p className="td-empty">Loading progress...</p> : null}
              {panelError.progress ? <p className="td-empty">{panelError.progress}</p> : null}

              {/* Subject score bars */}
              {(selectedProgress?.subjectScores || []).length > 0 && (
                <div className="td-score-bars">
                  {(selectedProgress.subjectScores || []).slice(0, 6).map((x) => (
                    <div key={x.subject} className="td-score-bar-row">
                      <span className="td-score-bar-label">{x.subject}</span>
                      <div className="td-score-bar-track">
                        <div
                          className="td-score-bar-fill"
                          style={{ width: `${Math.min(100, Number(x.avgScore) || 0)}%`, background: scoreColor(x.avgScore) }}
                        />
                      </div>
                      <span className="td-score-bar-value" style={{ color: scoreColor(x.avgScore) }}>{x.avgScore}%</span>
                    </div>
                  ))}
                </div>
              )}
              {!panelLoading.progress && !selectedProgress?.subjectScores?.length ? <p className="td-empty">No progress data yet.</p> : null}

              {/* Timeline */}
              {(selectedProgress?.timeline || []).length > 0 && (
                <>
                  <p className="td-section-subtitle">Recent Attempts</p>
                  <ul className="td-timeline">
                    {(selectedProgress.timeline || []).slice(0, 6).map((t, idx) => (
                      <li key={`${t.date || 'd'}-${idx}`}>
                        <span>{shortDate(t.date)}</span>
                        <span>{t.subject}</span>
                        <strong style={{ color: scoreColor(t.score) }}>{t.score}%</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </article>

            <article className="td-card">
              <h3>Delivery Status</h3>
              <p>{selectedStudentId ? `What ${selectedStudentName} can currently see.` : 'Select a student to inspect delivery.'}</p>
              {panelLoading.delivery ? <p className="td-empty">Loading delivery status...</p> : null}
              {panelError.delivery ? <p className="td-empty">{panelError.delivery}</p> : null}
              <div className="td-delivery-chips">
                <div className="td-delivery-chip">
                  <span className="td-chip-icon">📮</span>
                  <strong>{selectedDeliveryStatus.announcementsAvailable}</strong>
                  <span>Announcements</span>
                </div>
                <div className="td-delivery-chip">
                  <span className="td-chip-icon">📝</span>
                  <strong>{selectedDeliveryStatus.homeworkAssigned}</strong>
                  <span>Homework</span>
                </div>
                <div className="td-delivery-chip td-chip-warn">
                  <span className="td-chip-icon">⏳</span>
                  <strong>{selectedDeliveryStatus.homeworkPending}</strong>
                  <span>Pending</span>
                </div>
                <div className="td-delivery-chip">
                  <span className="td-chip-icon">📊</span>
                  <strong>{selectedDeliveryStatus.testsAvailable}</strong>
                  <span>Tests</span>
                </div>
                <div className="td-delivery-chip">
                  <span className="td-chip-icon">📅</span>
                  <strong>{selectedDeliveryStatus.eventsScheduled}</strong>
                  <span>Events</span>
                </div>
                <div className="td-delivery-chip td-chip-reward">
                  <span className="td-chip-icon">🏅</span>
                  <strong>{selectedDeliveryStatus.rewardCoins}</strong>
                  <span>Coins</span>
                </div>
              </div>
              <p className="td-section-subtitle">Latest Items</p>
              <ul className="td-timeline">
                <li><span>Announcement</span><strong>{selectedDeliveryStatus.recentAnnouncementTitle || '—'}</strong></li>
                <li><span>Homework</span><strong>{selectedDeliveryStatus.recentHomeworkTitle || '—'}</strong></li>
                <li><span>Test</span><strong>{selectedDeliveryStatus.recentTestTitle || '—'}</strong></li>
                <li><span>Next Event</span><strong>{selectedDeliveryStatus.nextEventTitle || '—'}</strong></li>
              </ul>
            </article>

            <article className="td-card">
              <h3>Recent Student Activity</h3>
              <div className="td-analytics-header">
                <p>{selectedStudentId ? `⚡ ${selectedStudentName}` : 'Select a student to inspect activity.'}</p>
                {filteredActivity.length > 0 && (
                  <button
                    type="button"
                    className="td-export-btn"
                    onClick={() => exportCSV(
                      `activity-${selectedStudentName}-${new Date().toISOString().slice(0,10)}.csv`,
                      ['Date', 'Type', 'Action', 'Title'],
                      filteredActivity.map((item) => [item.createdAt || '', item.type || '', item.action || '', item.title || ''])
                    )}
                  >
                    ↓ Export CSV
                  </button>
                )}
              </div>
              <div className="td-activity-filter">
                {['all', 'homework', 'test', 'calendar', 'reward', 'library', 'chat'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`td-filter-chip${activityTypeFilter === t ? ' active' : ''}`}
                    onClick={() => setActivityTypeFilter(t)}
                  >
                    {t === 'all' ? 'All' : `${activityIcon(t)} ${t}`}
                  </button>
                ))}
              </div>
              {panelLoading.activity ? <p className="td-empty">Loading activity...</p> : null}
              {panelError.activity ? <p className="td-empty">{panelError.activity}</p> : null}
              <ul className="td-activity-list">
                {filteredActivity.slice(0, 10).map((item) => (
                  <li key={item.id} className="td-activity-item">
                    <span className="td-activity-icon">{activityIcon(item.type)}</span>
                    <div className="td-activity-body">
                      <strong>{item.title || 'Activity'}</strong>
                      <span>{item.type} · {item.action}</span>
                    </div>
                    <span className="td-activity-time">{shortDateTime(item.createdAt)}</span>
                  </li>
                ))}
              </ul>
              {!panelLoading.activity && !filteredActivity.length ? (
                <p className="td-empty">{activityTypeFilter === 'all' ? 'No recent activity recorded yet.' : `No ${activityTypeFilter} activity yet.`}</p>
              ) : null}
            </article>

            {/* ── Homework Status ── */}
            <article className="td-card td-card-wide">
              <h3>Homework Status</h3>
              <div className="td-analytics-header">
                <p>{selectedStudentId ? `📝 All homework for ${selectedStudentName}` : 'Select a student to view homework.'}</p>
                {selectedHomework.length > 0 && (
                  <button
                    type="button"
                    className="td-export-btn"
                    onClick={() => exportCSV(
                      `homework-${selectedStudentName}-${new Date().toISOString().slice(0,10)}.csv`,
                      ['Title', 'Subject', 'Due Date', 'Status', 'Grade', 'Attempts', 'Submitted At'],
                      selectedHomework.map((h) => [h.title, h.subject, h.dueAt || '', h.status, h.grade ?? '', h.attemptCount, h.submittedAt || ''])
                    )}
                  >
                    ↓ Export CSV
                  </button>
                )}
              </div>
              {selectedHomework.length > 0 ? (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <span style={{ background: '#dcfce7', color: '#166534', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
                    Submitted: {selectedHomeworkSummary.submitted}
                  </span>
                  <span style={{ background: '#fee2e2', color: '#991b1b', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
                    Not submitted: {selectedHomeworkSummary.notSubmitted}
                  </span>
                  <span style={{ background: '#ffedd5', color: '#9a3412', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
                    Overdue: {selectedHomeworkSummary.overdue}
                  </span>
                </div>
              ) : null}
              {panelLoading.homework ? <p className="td-empty">Loading homework...</p> : null}
              {panelError.homework ? <p className="td-empty">{panelError.homework}</p> : null}
              {selectedHomework.length > 0 ? (
                <div className="td-hw-table-wrap">
                  <table className="td-hw-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Subject</th>
                        <th>Due</th>
                        <th>Status</th>
                        <th>Grade</th>
                        <th>Attempts</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedHomework.map((hw) => (
                        <tr key={hw.id} style={String(hw?.dueStatus || '').toLowerCase() === 'overdue' && String(hw?.status || '').toLowerCase() !== 'submitted' ? { background: '#fff1f2' } : undefined}>
                          <td><strong>{hw.title}</strong></td>
                          <td>{hw.subject}</td>
                          <td>{shortDate(hw.dueAt)}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span className={`td-hw-badge td-hw-${String(hw.dueStatus || hw.status || '').toLowerCase()}`}>{hw.dueStatus || hw.status}</span>
                              {hw.remark ? (
                                <span style={{ fontSize: '11px', color: String(hw.dueStatus || hw.status || '').toLowerCase() === 'overdue' ? '#b91c1c' : '#6b7280' }}>
                                  {hw.remark}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td>{hw.grade !== null && hw.grade !== undefined ? `${hw.grade}/100` : '—'}</td>
                          <td>{hw.attemptCount || 0}</td>
                          <td>
                            {hw.attachmentUrl ? (
                              <a href={hw.attachmentUrl} target="_blank" rel="noreferrer" className="td-inline-btn" style={{ marginRight: 8 }}>
                                Question Image
                              </a>
                            ) : null}
                            {(hwAttemptsByHwId[hw.id] || [])[0]?.attachmentUrl ? (
                              <a href={(hwAttemptsByHwId[hw.id] || [])[0].attachmentUrl} target="_blank" rel="noreferrer" className="td-inline-btn" style={{ marginRight: 8 }}>
                                Student Image
                              </a>
                            ) : null}
                            {hw.status === 'submitted' || hw.status === 'pending' ? (
                              <button
                                type="button"
                                className="td-inline-btn"
                                onClick={() => { setGradingHwId(hw.id); setGradeValue(''); setGradeFeedback(''); }}
                              >
                                Grade
                              </button>
                            ) : (
                              <span className="td-hw-done">✓</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (!panelLoading.homework ? <p className="td-empty">No homework assigned yet.</p> : null)}

              {gradingHwId ? (
                <form className="td-form td-grade-form" onSubmit={onGradeHomework}>
                  <h4 style={{ margin: '10px 0 6px' }}>
                    Grade: {selectedHomework.find((h) => h.id === gradingHwId)?.title || gradingHwId}
                  </h4>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={gradeValue}
                      onChange={(e) => setGradeValue(e.target.value)}
                      placeholder="Score out of 100 (optional)"
                      style={{ flex: 1 }}
                    />
                  </div>
                  <input
                    value={gradeFeedback}
                    onChange={(e) => setGradeFeedback(e.target.value)}
                    placeholder="Feedback for student (optional)"
                  />
                  <div className="td-invite-actions">
                    <button type="submit" disabled={busy === `grade-${gradingHwId}`}>
                      {busy === `grade-${gradingHwId}` ? 'Saving...' : 'Save Grade'}
                    </button>
                    <button type="button" className="td-inline-btn danger" onClick={() => setGradingHwId(null)}>Cancel</button>
                  </div>
                </form>
              ) : null}
            </article>

            {/* ── Test Attempt History ── */}
            <article className="td-card td-card-wide">
              <h3>Test Attempt History</h3>
              <div className="td-analytics-header">
                <p>{selectedStudentId ? `📊 All test attempts for ${selectedStudentName}` : 'Select a student to view test history.'}</p>
                {selectedTestAttempts.length > 0 && (
                  <button
                    type="button"
                    className="td-export-btn"
                    onClick={() => exportCSV(
                      `tests-${selectedStudentName}-${new Date().toISOString().slice(0,10)}.csv`,
                      ['Test', 'Subject', 'Started', 'Submitted', 'Score', 'Status'],
                      selectedTestAttempts.map((a) => [a.testTitle, a.subject, a.startedAt || '', a.submittedAt || '', a.score !== null ? `${a.score}${a.maxScore ? `/${a.maxScore}` : ''}` : '—', a.status])
                    )}
                  >
                    ↓ Export CSV
                  </button>
                )}
              </div>
              {panelLoading.testAttempts ? <p className="td-empty">Loading test attempts...</p> : null}
              {panelError.testAttempts ? <p className="td-empty">{panelError.testAttempts}</p> : null}
              {selectedTestAttempts.length > 0 ? (
                <div className="td-hw-table-wrap">
                  <table className="td-hw-table">
                    <thead>
                      <tr>
                        <th>Test</th>
                        <th>Subject</th>
                        <th>Started</th>
                        <th>Submitted</th>
                        <th>Score</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTestAttempts.map((a) => (
                        <tr key={a.id}>
                          <td><strong>{a.testTitle}</strong></td>
                          <td>{a.subject}</td>
                          <td>{shortDateTime(a.startedAt)}</td>
                          <td>{a.submittedAt ? shortDateTime(a.submittedAt) : '—'}</td>
                          <td>
                            {a.score !== null && a.score !== undefined
                              ? <strong style={{ color: scoreColor(a.maxScore ? (a.score / a.maxScore) * 100 : a.score) }}>{a.score}{a.maxScore ? `/${a.maxScore}` : ''}</strong>
                              : '—'}
                          </td>
                          <td><span className={`td-hw-badge td-hw-${a.status}`}>{a.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (!panelLoading.testAttempts ? <p className="td-empty">No test attempts recorded yet.</p> : null)}
            </article>
          </section>
        )}

        {/* ══════════ REGISTRATION SECTION ══════════ */}
        {activeSection === 'registration' && (
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
              <h3>Student Invite History</h3>
              <p>View, resend, or revoke self-registration links sent to students.</p>
              <div className="invite-toolbar">
                <input
                  className="invite-search"
                  value={studentInviteSearch}
                  onChange={(e) => { setStudentInviteSearch(e.target.value); setStudentInvitePage(1); }}
                  placeholder="Search by token or role"
                />
                <select
                  className="invite-filter"
                  value={studentInviteStatusFilter}
                  onChange={(e) => { setStudentInviteStatusFilter(e.target.value); setStudentInvitePage(1); }}
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
                <button type="button" className="td-inline-btn" onClick={() => setStudentInvitePage((p) => Math.max(1, p - 1))} disabled={studentInvitePage === 1}>Previous</button>
                <span>Page {studentInvitePage} of {studentInviteTotalPages}</span>
                <button type="button" className="td-inline-btn" onClick={() => setStudentInvitePage((p) => Math.min(studentInviteTotalPages, p + 1))} disabled={studentInvitePage >= studentInviteTotalPages}>Next</button>
              </div>
            </article>
          </section>
        )}
      </div>
    </div>
  );
}

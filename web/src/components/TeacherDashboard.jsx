import React, { useEffect, useMemo, useRef, useState } from 'react';
import SubjectBackground, { getPalette } from './SubjectBackground';
import TeacherSubjectProgressChart from './TeacherSubjectProgressChart';
import StudentProgress from './StudentProgress';
import {
  addTestQuestion,
  assignTeacherHomework,
  updateTeacherHomework,
  getTeacherAssignedHomework,
  getTeacherHomeworkAttempts,
  uploadHomeworkImage,
  resyncTeacherHomework,
  cloneTest,
  createTest,
  deleteTest,
  getTeacherAnnouncements,
  getTeacherStudentHomework,
  getTeacherStudentTestAttempts,
  gradeTeacherHomework,
  getTeacherDashboard,
  getTeacherProfile,
  getTeacherStudentDeliveryStatus,
  getTeacherStudentSubjectProgress,
  getTeacherStudentLearningScore,
  getTeacherStudents,
  listCurriculumLessons,
  getTests,
  listTestQuestions,
  postTeacherAnnouncement,
  updateTest,
  deleteTestQuestion,
  updateTestQuestion,
  sendChat,
  getChatHistory,
  generateLocalTtsAudio
} from '../api';

function shortDate(value) {
  if (!value) return 'TBD';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'TBD';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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

function shortDateTime(value) {
  if (!value) return 'Just now';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'Just now';
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function announcementScheduleLabel(a) {
  const startAt = a?.startAt || a?.start_at || null;
  const endAt = a?.endAt || a?.end_at || null;
  if (startAt && endAt) return `Visible ${shortDateTime(startAt)} → ${shortDateTime(endAt)}`;
  if (startAt) return `Visible from ${shortDateTime(startAt)}`;
  if (endAt) return `Visible until ${shortDateTime(endAt)}`;
  return 'Always visible';
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function parseSafeDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function toLocalDateKey(value) {
  const dt = parseSafeDate(value);
  if (!dt) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function assignmentStableKey(item) {
  if (item?.assignmentGroupId) return String(item.assignmentGroupId);
  return [
    item?.subject || '',
    item?.title || '',
    item?.className || '',
    item?.startAt || '',
    item?.dueAt || '',
    item?.createdAt || ''
  ].join('|');
}

function asUrlList(value, fallbackSingle) {
  const fromList = Array.isArray(value) ? value : [];
  const list = fromList.filter((u) => typeof u === 'string' && u.trim());
  if (list.length) return list;
  if (typeof fallbackSingle === 'string' && fallbackSingle.trim()) return [fallbackSingle.trim()];
  return [];
}

// Downscale large images before sending to the AI Assistant chat (mirrors the
// student AI Tutor's upload path) so payloads stay reasonable for inference.
async function fileToCompressedDataUrl(file) {
  if (!file) throw new Error('No file selected');

  const readDataUrl = () => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image'));
    reader.readAsDataURL(file);
  });

  if (file.size <= 1.8 * 1024 * 1024) {
    return readDataUrl();
  }

  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = (e) => { URL.revokeObjectURL(url); reject(e || new Error('Unable to load image')); };
    el.src = url;
  });

  const maxSide = 1440;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return readDataUrl();
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', 0.8);
}

function fileToRawDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image'));
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64, mimeType) {
  const raw = atob(String(base64 || ''));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
}

function clampSpeed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.8, Math.max(0.6, Number(n.toFixed(2))));
}

function getSpeedLabel(value) {
  const speed = Number(value || 1);
  if (speed < 0.9) return 'Slower';
  if (speed > 1.1) return 'Faster';
  return 'Normal';
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

function normalizeClassName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getClassNameFromItem(item) {
  return item?.className || item?.class_name || item?.studentClass || item?.student_class || '';
}

function isInTargetClass(item, targetClass) {
  if (!targetClass || targetClass === 'all') return true;
  return normalizeClassName(getClassNameFromItem(item)) === normalizeClassName(targetClass);
}

export default function TeacherDashboard({ session, onLogout }) {
  const [teacherProfile, setTeacherProfile] = useState(null);

  const [panelLoading, setPanelLoading] = useState({
    summary: false,
    students: false,
    progress: false,
    delivery: false,
    announcements: false,
    tests: false,
    homework: false,
    testAttempts: false,
    chat: false
  });

  const [panelError, setPanelError] = useState({
    summary: '',
    students: '',
    progress: '',
    delivery: '',
    announcements: '',
    tests: '',
    homework: '',
    testAttempts: '',
    chat: ''
  });

  const [dashboard, setDashboard] = useState({ summary: {} });
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('all');
  const [studentPage, setStudentPage] = useState(0);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [subjectProgress, setSubjectProgress] = useState(null);
  const [progressView, setProgressView] = useState('daily');
  const [selectedDeliveryStatus, setSelectedDeliveryStatus] = useState(emptyDeliveryStatus);
  const [selectedHomework, setSelectedHomework] = useState([]);
  const [homeworkStatusFilter, setHomeworkStatusFilter] = useState('all');
  const [selectedTestAttempts, setSelectedTestAttempts] = useState([]);
  const [gradingHwId, setGradingHwId] = useState(null);
  const [gradeValue, setGradeValue] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');

  // ── AI Assistant (mirrors the student AI Tutor, locked to the teacher's own subject) ──
  const [tutorLessons, setTutorLessons] = useState([]);
  const [selectedTutorLessonId, setSelectedTutorLessonId] = useState('');
  const [selectedTutorLesson, setSelectedTutorLesson] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatImages, setChatImages] = useState([]);
  const [chatImageError, setChatImageError] = useState('');
  const [chatFollowups, setChatFollowups] = useState([]);
  const [chatVoicePlayId, setChatVoicePlayId] = useState('');
  const [chatVoiceLoadingId, setChatVoiceLoadingId] = useState('');
  const [chatReadAloudSpeed, setChatReadAloudSpeed] = useState(1);
  const chatEndRef = useRef(null);
  const chatRequestAbortRef = useRef(null);
  const localAudioRef = useRef(null);
  const localAudioUrlRef = useRef('');
  const localVoiceCacheRef = useRef({});
  const [teacherActorId] = useState(() => {
    // Distinct per-teacher chat identity so conversations don't mix between teachers.
    const tId = String(session?.userId || session?.teacherId || session?.id || 'teacher-local');
    return `teacher-${tId}`;
  });

  const [announcements, setAnnouncements] = useState([]);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementStartAt, setAnnouncementStartAt] = useState('');
  const [announcementEndAt, setAnnouncementEndAt] = useState('');

  // Student accounts are created and managed by the school admin, so the
  // teacher portal only reads the roster — no registration or invite state here.

  const [assignTitle, setAssignTitle] = useState('');
  const [assignSubject, setAssignSubject] = useState(session?.subject || 'Mathematics');
  const [assignNote, setAssignNote] = useState('');
  const [assignAttachmentUrls, setAssignAttachmentUrls] = useState([]);
  const [assignAttachmentUploading, setAssignAttachmentUploading] = useState(false);
  const [assignPreviewUrls, setAssignPreviewUrls] = useState([]); // local object URLs for instant preview
  const [assignDropActive, setAssignDropActive] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(''); // image to show full-screen
  const [assignDraggedImageIndex, setAssignDraggedImageIndex] = useState(null);
  const [assignDragOverImageIndex, setAssignDragOverImageIndex] = useState(null);
  const [editingDraggedImageIndex, setEditingDraggedImageIndex] = useState(null);
  const [editingDragOverImageIndex, setEditingDragOverImageIndex] = useState(null);
  const [assignStartAt, setAssignStartAt] = useState('');
  const [assignDueAt, setAssignDueAt] = useState('');
  const [assignLessonIds, setAssignLessonIds] = useState([]);
  const [assignAvailableLessons, setAssignAvailableLessons] = useState([]);
  const [showLessonPicker, setShowLessonPicker] = useState(false);
  const lessonPickerRef = useRef(null);
  const [activeAssignments, setActiveAssignments] = useState([]); // confirmed assignments shown at bottom
  const [homeworkHistory, setHomeworkHistory] = useState([]);     // all past assignments from backend
  const [editingHwId, setEditingHwId] = useState(null);
  const [editingHwTitle, setEditingHwTitle] = useState('');
  const [editingHwNote, setEditingHwNote] = useState('');
  const [editingHwSubject, setEditingHwSubject] = useState('');
  const [editingHwStartAt, setEditingHwStartAt] = useState('');
  const [editingHwDueAt, setEditingHwDueAt] = useState('');
  const [editingHwLessonIds, setEditingHwLessonIds] = useState([]);
  const [showEditingLessonPicker, setShowEditingLessonPicker] = useState(false);
  const editingLessonPickerRef = useRef(null);
  const [editingHwAttachmentUrls, setEditingHwAttachmentUrls] = useState([]);
  const [editingHwUploading, setEditingHwUploading] = useState(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [historyFilterDate, setHistoryFilterDate] = useState('');
  const [historyCalMonth, setHistoryCalMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [teacherTargetClass, setTeacherTargetClass] = useState('all');
  const lastTeacherTargetClassRef = React.useRef('all');
  const [allKnownClasses, setAllKnownClasses] = useState([]);
  const [hwAttemptsByHwId, setHwAttemptsByHwId] = useState({});
  const [expandedHwSubmissionById, setExpandedHwSubmissionById] = useState({});
  const [expandedGradeById, setExpandedGradeById] = useState({});
  const [gradeSubmittedById, setGradeSubmittedById] = useState({});
  const [expandedHistoryDetailsById, setExpandedHistoryDetailsById] = useState({});

  const [busy, setBusy] = useState('');
  const [historyStorageKey] = useState(() => {
    // Use the signed-in teacher's id so each teacher keeps a distinct history
    // cache. Falling back to a shared key would leak one teacher's assignments
    // (and their subject) into another teacher's portal.
    const tId = String(session?.userId || session?.teacherId || session?.id || 'teacher-local');
    return `teacher-homework-history-${tId}`;
  });
  const [historyReady, setHistoryReady] = useState(false);

  const [note, setNote] = useState('');
  const [activeSection, setActiveSection] = useState(() => {
    const h = window.location.hash.replace('#', '');
    return h || 'teacher';
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

  const lockedSubject = String(teacherProfile?.subject || session?.subject || '').trim();

  // Panels load silently — nothing on screen ever announces "loading". The flag
  // below is kept only for the *first* fetch of each panel, so an empty-state
  // line ("No students available yet.") can't flash before the data has had a
  // chance to arrive. Once a panel has loaded once, every later refresh updates
  // it in place without flicker.
  const panelLoadedOnceRef = useRef({});
  const setPanelLoadingKey = (key, value) => {
    if (value && panelLoadedOnceRef.current[key]) return;
    if (!value) panelLoadedOnceRef.current[key] = true;
    setPanelLoading((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
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

      // Accumulate class names — never shrink the dropdown when a class filter is active
      setAllKnownClasses((prev) => {
        const merged = new Set(prev);
        loadedStudents.forEach((s) => {
          const v = String(s?.className || '').trim();
          if (v) merged.add(v);
        });
        const next = Array.from(merged).sort((a, b) => a.localeCompare(b));
        return next.length === prev.length && next.every((v, i) => v === prev[i]) ? prev : next;
      });

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

  async function loadProgressPanel(studentId) {
    if (!studentId) {
      setSubjectProgress(null);
      return;
    }

    setPanelLoadingKey('progress', true);
    setPanelErrorKey('progress', '');
    try {
      const res = await getTeacherStudentSubjectProgress(studentId);
      setSubjectProgress(res || null);
    } catch (e) {
      setPanelErrorKey('progress', e?.message || 'Unable to load progress.');
      setSubjectProgress(null);
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

  // ── AI Assistant (mirrors the student AI Tutor) ─────────────────────────
  async function loadTutorLessonsPanel() {
    const subject = lockedSubject || '';
    if (!subject) {
      setTutorLessons([]);
      return [];
    }
    const className = (!teacherTargetClass || teacherTargetClass === 'all') ? '' : teacherTargetClass;
    try {
      const res = await listCurriculumLessons({ className, subject });
      const lessons = Array.isArray(res?.lessons) ? res.lessons : [];
      setTutorLessons(lessons);
      setSelectedTutorLesson((prev) => {
        const prevId = String(prev?.id || selectedTutorLessonId || '');
        const next = lessons.find((lesson) => String(lesson.id || '') === prevId) || null;
        if (!next) setSelectedTutorLessonId('');
        return next;
      });
      return lessons;
    } catch {
      setTutorLessons([]);
      setSelectedTutorLessonId('');
      setSelectedTutorLesson(null);
      return [];
    }
  }

  function getCurrentTutorConversationId(lessonOverride) {
    const normalizedSubject = String(lockedSubject || 'general')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const lessonPart = String(lessonOverride?.id || selectedTutorLesson?.id || '').trim();
    return lessonPart
      ? `conv-${teacherActorId}:subject-${normalizedSubject}:lesson-${lessonPart}`
      : `conv-${teacherActorId}:subject-${normalizedSubject}:all-lessons`;
  }

  async function loadChatPanel(conversationId) {
    setPanelLoadingKey('chat', true);
    setPanelErrorKey('chat', '');
    try {
      const res = await getChatHistory(teacherActorId, conversationId);
      setChatHistory(safeArray(res?.messages));
    } catch (e) {
      setPanelErrorKey('chat', e?.message || 'Unable to load chat history.');
      setChatHistory([]);
    } finally {
      setPanelLoadingKey('chat', false);
    }
  }

  async function onSendTutorMessage(overrideMsg) {
    const msg = (typeof overrideMsg === 'string' ? overrideMsg : chatInput).trim();
    if (!msg && !chatImages.length) return;
    setChatFollowups([]);
    setChatImageError('');
    const conversationId = getCurrentTutorConversationId();
    const recentMessages = safeArray(chatHistory)
      .slice(-20)
      .map((m) => ({
        role: m?.role === 'ai' ? 'assistant' : 'user',
        content: String(m?.text || m?.message || '').trim(),
      }))
      .filter((m) => m.content);

    const tempUserMsg = {
      id: `tmp-u-${Date.now()}`,
      role: 'user',
      text: msg || (chatImages.length ? `Please explain these ${chatImages.length} image${chatImages.length === 1 ? '' : 's'}.` : ''),
      ts: new Date().toISOString(),
      imageDataUrls: chatImages.map((img) => img.dataUrl),
      imageNames: chatImages.map((img) => img.name),
    };
    setChatHistory((prev) => [...safeArray(prev), tempUserMsg]);

    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    chatRequestAbortRef.current = abortController;

    setChatInput('');
    setChatLoading(true);
    setPanelErrorKey('chat', '');
    try {
      const res = await sendChat(
        teacherActorId,
        msg || 'Please explain these images.',
        'Friendly',
        conversationId,
        recentMessages,
        chatImages[0]?.dataUrl || undefined,
        chatImages.map((img) => img.dataUrl),
        chatImages.map((img) => img.name),
        selectedTutorLesson?.id || undefined,
        selectedTutorLesson?.title || undefined,
        lockedSubject || undefined,
        abortController?.signal
      );
      if (!res?.reply && (res?.error || res?.message || res?.statusCode)) {
        throw new Error(res?.message || res?.error || 'Chat request failed');
      }
      const aiMsg = { id: `ai-${Date.now()}`, role: 'ai', text: res.reply || '…', ts: new Date().toISOString() };
      setChatHistory((prev) => [...safeArray(prev), aiMsg]);
      if (Array.isArray(res?.followups) && res.followups.length) {
        setChatFollowups(res.followups);
      }
      setChatImages([]);
    } catch (e) {
      const isAborted = e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('aborted');
      if (isAborted) { setPanelErrorKey('chat', ''); return; }
      const errMsg = { id: `tmp-err-${Date.now()}`, role: 'ai', text: `⚠️ ${e?.message || 'Unable to reach AI Assistant right now.'}`, ts: new Date().toISOString() };
      setChatHistory((prev) => [...safeArray(prev), errMsg]);
      setPanelErrorKey('chat', e?.message || 'Unable to send chat message.');
    } finally {
      chatRequestAbortRef.current = null;
      setChatLoading(false);
    }
  }

  function onStopTutorMessageSend() {
    if (!chatRequestAbortRef.current) return;
    chatRequestAbortRef.current.abort();
    chatRequestAbortRef.current = null;
    setChatLoading(false);
    setPanelErrorKey('chat', '');
  }

  async function onTutorImageSelected(files) {
    setChatImageError('');
    const picked = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!picked.length) return;

    const prepared = [];
    for (const file of picked) {
      if (!String(file.type || '').startsWith('image/')) {
        setChatImageError('Only image files are allowed.');
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        setChatImageError('Please upload images smaller than 20MB each.');
        continue;
      }
      try {
        let dataUrl = '';
        try { dataUrl = String(await fileToCompressedDataUrl(file)); }
        catch { dataUrl = String(await fileToRawDataUrl(file)); }
        if (!dataUrl) throw new Error('empty image');
        prepared.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, name: String(file.name || 'image'), dataUrl });
      } catch {
        setChatImageError('Some images could not be processed. Try PNG/JPG files.');
      }
    }
    if (!prepared.length) return;
    setChatImages((prev) => [...prev, ...prepared].slice(0, 6));
  }

  function removeChatImageById(id) {
    setChatImages((prev) => prev.filter((img) => img.id !== id));
  }

  function clearChatImages() {
    setChatImages([]);
  }

  function stopLocalVoicePlayback() {
    if (localAudioRef.current) {
      localAudioRef.current.pause();
      localAudioRef.current = null;
    }
    if (localAudioUrlRef.current) {
      URL.revokeObjectURL(localAudioUrlRef.current);
      localAudioUrlRef.current = '';
    }
    setChatVoicePlayId('');
  }

  async function onToggleLocalVoice(messageId, rawText) {
    const id = String(messageId || '').trim();
    if (!id) return;
    if (chatVoicePlayId === id) { stopLocalVoicePlayback(); return; }
    const cleanText = String(rawText || '').trim();
    if (!cleanText) return;

    setPanelErrorKey('chat', '');
    setChatVoiceLoadingId(id);
    try {
      const cacheKey = `${id}::${cleanText.slice(0, 160)}`;
      let cached = localVoiceCacheRef.current[cacheKey];
      if (!cached) {
        const tts = await generateLocalTtsAudio(cleanText, 'en-US', teacherActorId, undefined, chatReadAloudSpeed);
        const audioBase64 = String(tts?.audioBase64 || '').trim();
        if (!audioBase64) throw new Error('Local TTS returned empty audio.');
        cached = { audioBase64, mimeType: String(tts?.mimeType || 'audio/mpeg').trim() || 'audio/mpeg' };
        localVoiceCacheRef.current[cacheKey] = cached;
      }
      stopLocalVoicePlayback();
      const blob = base64ToBlob(cached.audioBase64, cached.mimeType);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.playbackRate = clampSpeed(chatReadAloudSpeed);
      audio.onended = () => { if (localAudioRef.current === audio) stopLocalVoicePlayback(); };
      audio.onerror = () => { if (localAudioRef.current === audio) stopLocalVoicePlayback(); };
      localAudioRef.current = audio;
      localAudioUrlRef.current = url;
      setChatVoicePlayId(id);
      await audio.play();
      if (localAudioRef.current === audio) localAudioRef.current.playbackRate = clampSpeed(chatReadAloudSpeed);
    } catch (e) {
      stopLocalVoicePlayback();
      setPanelErrorKey('chat', e?.message || 'Voice playback failed.');
    } finally {
      setChatVoiceLoadingId('');
    }
  }

  async function loadHomeworkPanel(studentId) {
    if (!studentId) { setSelectedHomework([]); return; }
    setPanelLoadingKey('homework', true);
    setPanelErrorKey('homework', '');
    try {
      const res = await getTeacherStudentHomework(studentId);
      const list = Array.isArray(res?.homework)
        ? res.homework
            .slice()
            .sort((a, b) => {
              const aTs = new Date(a?.startAt || a?.createdAt || a?.created_at || a?.dueAt || a?.due_at || 0).getTime() || 0;
              const bTs = new Date(b?.startAt || b?.createdAt || b?.created_at || b?.dueAt || b?.due_at || 0).getTime() || 0;
              return bTs - aTs;
            })
        : [];
      setSelectedHomework(list);
      const attemptsMap = {};
      await Promise.all(list.map(async (h) => {
        try {
          const attRes = await getTeacherHomeworkAttempts(h.id);
          const rawAttempts = Array.isArray(attRes?.attempts) ? attRes.attempts : [];
          const filteredAttempts = rawAttempts.filter((a) => String(a?.studentId || a?.student_id || '') === String(studentId));
          attemptsMap[h.id] = filteredAttempts.length ? filteredAttempts : rawAttempts;
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
      await Promise.all([
        loadSummaryPanel(),
        loadStudentsPanel(''),
        loadAnnouncementsPanel(),
        loadTestsPanel(),
        getTeacherProfile().then((res) => { if (active && res?.profile) setTeacherProfile(res.profile); }).catch(() => {}),
        loadHomeworkHistory()
      ]);
    }
    bootstrap();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock subject-bound fields to the teacher's own subject once the profile
  // loads, so a teacher only ever creates/edits content for their own subject.
  useEffect(() => {
    const subj = String(teacherProfile?.subject || '').trim();
    if (!subj || subj.toLowerCase() === 'general') return;
    setAssignSubject(subj);
    setNewTestSubject(subj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherProfile]);

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
            const due = parseSafeDate(a?.dueAt || a?.due_at);
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
          const due = parseSafeDate(a?.dueAt || a?.due_at);
          return !due || due > now;
        })
      );
    }, 60000);
    return () => clearInterval(interval);
  }, [historyReady]);

  useEffect(() => {
    loadStudentsPanel(studentSearch, studentClassFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentSearch, studentClassFilter]);

  // Jump back to page 1 whenever the roster being paged through changes shape.
  useEffect(() => {
    setStudentPage(0);
  }, [studentSearch, studentClassFilter]);

  // Auto-select the class when teacher only teaches one
  useEffect(() => {
    if (teacherTargetClass !== 'all') return;
    if (allKnownClasses.length === 1) setTeacherTargetClass(allKnownClasses[0]);
  }, [allKnownClasses, teacherTargetClass]);

  // Load available lessons for homework chapter picker
  useEffect(() => {
    let active = true;
    const cls = (!teacherTargetClass || teacherTargetClass === 'all') ? '' : teacherTargetClass;
    (async () => {
      try {
        const res = await listCurriculumLessons({ className: cls, subject: assignSubject || '' });
        const lessons = Array.isArray(res?.lessons) ? res.lessons : [];
        if (active) setAssignAvailableLessons(lessons);
      } catch { if (active) setAssignAvailableLessons([]); }
    })();
    return () => { active = false; };
  }, [teacherTargetClass, assignSubject]);

  // AI Assistant — load lessons for the teacher's own subject when that page is open.
  useEffect(() => {
    if (activeSection !== 'ai-assistant') return;
    loadTutorLessonsPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, teacherTargetClass, lockedSubject]);

  // AI Assistant — (re)load chat history once a lesson is selected. Skip while
  // a restored/selected lesson id hasn't resolved yet, to avoid a stray
  // "all-lessons" conversation briefly overwriting the correct one.
  useEffect(() => {
    if (activeSection !== 'ai-assistant') return;
    if (selectedTutorLessonId && !selectedTutorLesson) return;
    loadChatPanel(getCurrentTutorConversationId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, selectedTutorLesson?.id, tutorLessons]);

  // AI Assistant — scroll chat to bottom whenever messages change.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  useEffect(() => {
    if (!showLessonPicker && !showEditingLessonPicker) return;
    function handleClick(e) {
      if (showLessonPicker && lessonPickerRef.current && !lessonPickerRef.current.contains(e.target)) {
        setShowLessonPicker(false);
      }
      if (showEditingLessonPicker && editingLessonPickerRef.current && !editingLessonPickerRef.current.contains(e.target)) {
        setShowEditingLessonPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showLessonPicker, showEditingLessonPicker]);

  useEffect(() => {
    loadProgressPanel(selectedStudentId);
    loadDeliveryPanel(selectedStudentId);
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
    // Blank until the first load lands, so the tiles fill in quietly instead of
    // showing a "..." placeholder or a misleading zero.
    return [
      { label: 'Students', value: panelLoading.summary ? '' : (s.studentsCount ?? 0) },
      { label: 'Active Homework', value: panelLoading.summary ? '' : (s.activeHomework ?? 0) },
      { label: 'Average Score', value: panelLoading.summary ? '' : `${s.avgScore ?? 0}%` },
      { label: 'Announcements', value: panelLoading.summary ? '' : (s.announcementsCount ?? 0) }
    ];
  }, [dashboard, panelLoading.summary]);

  function toggleStudent(id) {
    setSelectedStudentIds((prev) => {
      if (prev.includes(id)) return [];
      // Only one student can be checked at a time for bulk class updates.
      return [id];
    });
  }

  function clearSelectedStudents() {
    setSelectedStudentIds([]);
  }

  const classOptions = allKnownClasses;

  const classScopedStudents = useMemo(
    () => {
      // The Students panel has its own class dropdown (studentClassFilter); the
      // roster must follow it. In other sections fall back to the teacher's
      // active class. This prevents an empty list when the Students dropdown and
      // the teacher-section active class point at different classes.
      const target = (activeSection === 'students' || activeSection === 'progress') ? studentClassFilter : teacherTargetClass;
      return safeArray(students).filter((s) => isInTargetClass(s, target));
    },
    [students, teacherTargetClass, studentClassFilter, activeSection]
  );

  const STUDENTS_PAGE_SIZE = 5;
  const studentPageCount = Math.max(1, Math.ceil(classScopedStudents.length / STUDENTS_PAGE_SIZE));
  const clampedStudentPage = Math.min(studentPage, studentPageCount - 1);
  const pagedStudents = classScopedStudents.slice(
    clampedStudentPage * STUDENTS_PAGE_SIZE,
    (clampedStudentPage + 1) * STUDENTS_PAGE_SIZE
  );

  const classScopedAnnouncements = useMemo(
    () => safeArray(announcements).filter((a) => isInTargetClass(a, teacherTargetClass)),
    [announcements, teacherTargetClass]
  );

  const classScopedActiveAssignments = useMemo(
    () => safeArray(activeAssignments).filter((a) => isInTargetClass(a, teacherTargetClass)),
    [activeAssignments, teacherTargetClass]
  );

  const classScopedHomeworkHistory = useMemo(
    () => safeArray(homeworkHistory).filter((h) => isInTargetClass(h, teacherTargetClass)),
    [homeworkHistory, teacherTargetClass]
  );

  const classScopedTests = useMemo(
    () => safeArray(tests).filter((t) => isInTargetClass(t, teacherTargetClass)),
    [tests, teacherTargetClass]
  );

  const classScopedSelectedHomework = useMemo(
    () => safeArray(selectedHomework).filter((h) => {
      // Homework status rows are already student-scoped; keep rows that don't carry class metadata.
      const itemClass = getClassNameFromItem(h);
      if (!itemClass) return true;
      return isInTargetClass(h, teacherTargetClass);
    }),
    [selectedHomework, teacherTargetClass]
  );

  const classScopedSelectedTestAttempts = useMemo(
    () => safeArray(selectedTestAttempts).filter((a) => {
      const itemClass = getClassNameFromItem(a);
      if (!itemClass) return true;
      return isInTargetClass(a, teacherTargetClass);
    }),
    [selectedTestAttempts, teacherTargetClass]
  );

  const selectedHomeworkSummary = useMemo(() => {
    const submitted = classScopedSelectedHomework.filter((h) => String(h?.dueStatus || h?.status || '').toLowerCase() === 'submitted' || String(h?.status || '').toLowerCase() === 'graded').length;
    const notSubmitted = classScopedSelectedHomework.filter((h) => String(h?.dueStatus || h?.status || '').toLowerCase() !== 'submitted' && String(h?.status || '').toLowerCase() !== 'graded').length;
    const overdue = classScopedSelectedHomework.filter((h) => String(h?.dueStatus || '').toLowerCase() === 'overdue').length;
    return { submitted, notSubmitted, overdue };
  }, [classScopedSelectedHomework]);

  const filteredSelectedHomework = useMemo(() => {
    return classScopedSelectedHomework.filter((h) => {
      const dueStatus = String(h?.dueStatus || '').toLowerCase();
      const status = String(h?.status || '').toLowerCase();
      const isSubmitted = dueStatus === 'submitted' || status === 'submitted' || status === 'graded';
      const isOverdue = dueStatus === 'overdue';
      if (homeworkStatusFilter === 'submitted') return isSubmitted;
      if (homeworkStatusFilter === 'not-submitted') return !isSubmitted;
      if (homeworkStatusFilter === 'overdue') return isOverdue;
      return true;
    });
  }, [classScopedSelectedHomework, homeworkStatusFilter]);

  const latestFiveSelectedHomework = useMemo(() => {
    return safeArray(classScopedSelectedHomework).slice(0, 5);
  }, [classScopedSelectedHomework]);

  // Prev/Next in the Homework Status panel step through students, not homework rows.
  const selectedStudentIndex = classScopedStudents.findIndex((s) => s.id === selectedStudentId);

  function goToAdjacentStudent(delta) {
    if (!classScopedStudents.length) return;
    const baseIndex = selectedStudentIndex === -1 ? 0 : selectedStudentIndex;
    const nextIndex = Math.min(classScopedStudents.length - 1, Math.max(0, baseIndex + delta));
    const nextStudent = classScopedStudents[nextIndex];
    if (!nextStudent) return;
    setSelectedStudentId(nextStudent.id);
    setSelectedStudentIds([nextStudent.id]);
  }

  const latestTwoActiveAssignments = useMemo(() => {
    return safeArray(classScopedActiveAssignments).slice(0, 2);
  }, [classScopedActiveAssignments]);

  const lightboxImages = useMemo(() => {
    if (!lightboxUrl) return [];

    const groups = [];

    safeArray(classScopedActiveAssignments).forEach((a) => {
      const group = asUrlList(a?.attachmentUrls || a?.attachment_urls, a?.attachmentUrl || a?.attachment_url);
      if (group.length) groups.push(group);
    });

    safeArray(classScopedHomeworkHistory).forEach((h) => {
      const group = asUrlList(h?.attachmentUrls || h?.attachment_urls, h?.attachmentUrl || h?.attachment_url);
      if (group.length) groups.push(group);
    });

    safeArray(classScopedSelectedHomework).forEach((h) => {
      const teacherImages = asUrlList(h?.attachmentUrls || h?.attachment_urls, h?.attachmentUrl || h?.attachment_url);
      const submittedImages = asUrlList(h?.latestAttachmentUrls || h?.latest_attachment_urls, h?.latestAttachmentUrl || h?.latest_attachment_url);
      const attemptImages = [];
      safeArray(hwAttemptsByHwId?.[h?.id]).forEach((attempt) => {
        attemptImages.push(...asUrlList(attempt?.attachmentUrls || attempt?.attachment_urls, attempt?.attachmentUrl || attempt?.attachment_url));
      });
      const group = Array.from(new Set([...teacherImages, ...submittedImages, ...attemptImages]));
      if (group.length) groups.push(group);
    });

    const assignGroup = Array.from(new Set([...asUrlList(assignAttachmentUrls), ...asUrlList(assignPreviewUrls)]));
    if (assignGroup.length) groups.push(assignGroup);

    const editGroup = asUrlList(editingHwAttachmentUrls);
    if (editGroup.length) groups.push(editGroup);

    const matchedGroup = groups.find((group) => group.includes(lightboxUrl));
    if (matchedGroup) return matchedGroup;

    return [lightboxUrl];
  }, [lightboxUrl, classScopedActiveAssignments, classScopedHomeworkHistory, classScopedSelectedHomework, hwAttemptsByHwId, assignAttachmentUrls, assignPreviewUrls, editingHwAttachmentUrls]);

  useEffect(() => {
    const previousTeacherTargetClass = lastTeacherTargetClassRef.current;
    if (teacherTargetClass !== 'all') {
      const studentMatchesPreviousTeacherClass =
        previousTeacherTargetClass !== 'all'
        && normalizeClassName(studentClassFilter) === normalizeClassName(previousTeacherTargetClass);
      // Keep student filter in sync until user manually diverges from the last teacher-selected class.
      const shouldAutoSyncStudentFilter = studentClassFilter === 'all' || studentMatchesPreviousTeacherClass;
      if (shouldAutoSyncStudentFilter && studentClassFilter !== teacherTargetClass) {
        setStudentClassFilter(teacherTargetClass);
      }
    }
    lastTeacherTargetClassRef.current = teacherTargetClass;
    if (!classScopedStudents.length) {
      setSelectedStudentId('');
      setSelectedStudentIds([]);
      return;
    }
    if (!classScopedStudents.some((s) => s.id === selectedStudentId)) {
      const nextStudentId = classScopedStudents[0]?.id || '';
      setSelectedStudentId(nextStudentId);
      setSelectedStudentIds(nextStudentId ? [nextStudentId] : []);
    }
  }, [teacherTargetClass, classScopedStudents, selectedStudentId, studentClassFilter]);

  useEffect(() => {
    if (!teacherTargetClass || teacherTargetClass === 'all') return;
    loadAnnouncementsPanel();
    loadHomeworkHistory();
    loadTestsPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherTargetClass]);

  const lightboxIndex = useMemo(() => {
    if (!lightboxImages.length || !lightboxUrl) return -1;
    return lightboxImages.indexOf(lightboxUrl);
  }, [lightboxImages, lightboxUrl]);

  const canPrevLightbox = lightboxIndex > 0;
  const canNextLightbox = lightboxIndex >= 0 && lightboxIndex < lightboxImages.length - 1;

  const moveLightbox = (direction) => {
    if (!lightboxImages.length || !lightboxUrl || lightboxIndex < 0) return;
    const nextIndex = lightboxIndex + direction;
    if (nextIndex < 0 || nextIndex >= lightboxImages.length) return;
    setLightboxUrl(lightboxImages[nextIndex]);
  };

  useEffect(() => {
    setHomeworkStatusFilter('all');
  }, [selectedStudentId]);

  async function onAssignHomework(e) {
    e.preventDefault();
    if (!assignTitle.trim()) return;
    if (assignAttachmentUploading) {
      setNote('Please wait for image upload to finish before assigning homework.');
      return;
    }
    const serverAttachmentUrls = asUrlList(assignAttachmentUrls);
    const localOnlyUrls = asUrlList(assignPreviewUrls).filter((u) => !serverAttachmentUrls.includes(u));
    const allAttachmentUrls = [...serverAttachmentUrls];
    const hasLocalOnlyPreview = localOnlyUrls.length > 0;
    if (!teacherTargetClass || teacherTargetClass === 'all') {
      setNote('Please select a class at the top of the page before assigning homework.');
      return;
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = parseSafeDate(assignStartAt);
    const dueDate = parseSafeDate(assignDueAt);
    if (startDate && startDate < startOfToday) {
      setNote('Start date cannot be in a past day.');
      return;
    }
    if (dueDate && dueDate < startOfToday) {
      setNote('Due date cannot be in a past day.');
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
        attachmentUrls: allAttachmentUrls,
        // Keep legacy single-url field for compatibility.
        attachmentUrl: allAttachmentUrls[0] || null,
        startAt: assignStartAt || null,
        dueAt: assignDueAt || null,
        className: teacherTargetClass,
        lessonIds: assignLessonIds.length ? assignLessonIds : undefined,
        lessonTitles: assignLessonIds.length
          ? assignLessonIds.map((id) => assignAvailableLessons.find((l) => l.id === id)?.title || '').filter(Boolean)
          : undefined
      });
      const created = Number(res?.created || 0);
      if (created) {
        const newAssignment = {
          id: res.assignments?.[0]?.id || Date.now(),
          assignmentGroupId: res.assignments?.[0]?.assignmentGroupId || `asg-local-${Date.now()}`,
          title: assignTitle,
          subject: assignSubject,
          note: assignNote,
          attachmentUrls: allAttachmentUrls,
          attachmentUrl: allAttachmentUrls[0] || null,
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
        setNote(`${hasLocalOnlyPreview ? '⚠ Some images were local-only and were not saved. ' : ''}✅ Assigned "${assignTitle}" | Due: ${assignDueAt ? new Date(assignDueAt).toLocaleString() : 'Not set'} | Class: ${teacherTargetClass} | Students: ${created}`);
        // Clear form
        setAssignTitle('');
        setAssignNote('');
        setAssignAttachmentUrls([]);
        setAssignPreviewUrls([]);
        setAssignStartAt('');
        setAssignDueAt('');
        setAssignLessonIds([]);
        setAssignLessonIds([]);
        // Refresh from backend in background; keep optimistic card visible.
        loadHomeworkHistory();
      } else {
        setNote(res?.error || 'No assignments created.');
      }
      await loadSummaryPanel();
    } catch (e2) {
      setNote(e2?.message || 'Failed to assign homework.');
    } finally {
      setBusy('');
    }
  }

  async function onTeacherHomeworkFilesSelected(files) {
    const picked = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!picked.length) return;

    const localPreviews = picked.map((file) => URL.createObjectURL(file));
    setAssignPreviewUrls((prev) => [...prev, ...localPreviews]);
    setAssignAttachmentUploading(true);
    setNote(`Uploading ${picked.length} image${picked.length === 1 ? '' : 's'}...`);

    const uploaded = [];
    const uploadedPreviewUrls = [];
    for (let i = 0; i < picked.length; i += 1) {
      const file = picked[i];
      const previewUrl = localPreviews[i];
      try {
        const res = await uploadHomeworkImage(file);
        if (res?.url) {
          uploaded.push(res.url);
          if (previewUrl) uploadedPreviewUrls.push(previewUrl);
        }
      } catch {
        // Keep local preview if one upload fails.
      }
    }

    if (uploaded.length) {
      setAssignAttachmentUrls((prev) => {
        const merged = [...prev, ...uploaded];
        return Array.from(new Set(merged));
      });
      setAssignPreviewUrls((prev) => prev.filter((u) => !uploadedPreviewUrls.includes(u)));
      setNote(uploaded.length === picked.length
        ? `Uploaded ${uploaded.length} image${uploaded.length === 1 ? '' : 's'}.`
        : `Uploaded ${uploaded.length}/${picked.length} image${picked.length === 1 ? '' : 's'}.`);
    } else {
      setNote('Image upload failed. Local previews kept, you can still assign or remove them.');
    }

    setAssignAttachmentUploading(false);
  }

  function onRemoveTeacherAttachment(url) {
    setAssignAttachmentUrls((prev) => prev.filter((u) => u !== url));
    setAssignPreviewUrls((prev) => prev.filter((u) => u !== url));
  }

  function onRemoveAllTeacherAttachments() {
    setAssignAttachmentUrls([]);
    setAssignPreviewUrls([]);
  }

  function onAssignImageDragStart(e, index) {
    setAssignDraggedImageIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onAssignImageDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setAssignDragOverImageIndex(index);
  }

  function onAssignImageDragLeave() {
    setAssignDragOverImageIndex(null);
  }

  function onAssignImageDrop(e, index) {
    e.preventDefault();
    e.stopPropagation();
    setAssignDragOverImageIndex(null);

    if (assignDraggedImageIndex === null || assignDraggedImageIndex === index) {
      setAssignDraggedImageIndex(null);
      return;
    }

    const allUrls = [...assignAttachmentUrls, ...assignPreviewUrls];
    const newUrls = [...allUrls];
    const draggedUrl = newUrls[assignDraggedImageIndex];
    newUrls.splice(assignDraggedImageIndex, 1);
    newUrls.splice(index, 0, draggedUrl);

    const serverUrls = assignAttachmentUrls;
    const newServerUrls = [];
    const newPreviewUrls = [];

    newUrls.forEach((url) => {
      if (serverUrls.includes(url)) {
        newServerUrls.push(url);
      } else {
        newPreviewUrls.push(url);
      }
    });

    setAssignAttachmentUrls(newServerUrls);
    setAssignPreviewUrls(newPreviewUrls);
    setAssignDraggedImageIndex(null);
  }

  function onEditingImageDragStart(e, index) {
    setEditingDraggedImageIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onEditingImageDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setEditingDragOverImageIndex(index);
  }

  function onEditingImageDragLeave() {
    setEditingDragOverImageIndex(null);
  }

  function onEditingImageDrop(e, index) {
    e.preventDefault();
    e.stopPropagation();
    setEditingDragOverImageIndex(null);

    if (editingDraggedImageIndex === null || editingDraggedImageIndex === index) {
      setEditingDraggedImageIndex(null);
      return;
    }

    const allUrls = [...editingHwAttachmentUrls];
    const newUrls = [...allUrls];
    const draggedUrl = newUrls[editingDraggedImageIndex];
    newUrls.splice(editingDraggedImageIndex, 1);
    newUrls.splice(index, 0, draggedUrl);

    setEditingHwAttachmentUrls(newUrls);
    setEditingDraggedImageIndex(null);
  }

  function onStartEditHomework(homework) {
    if (!homework?.id) return;
    setEditingHwId(homework.id);
    setEditingHwTitle(homework.title || '');
    setEditingHwNote(homework.note || '');
    setEditingHwSubject(homework.subject || 'Mathematics');
    setEditingHwStartAt(homework.startAt || '');
    setEditingHwDueAt(homework.dueAt || '');
    setEditingHwLessonIds(Array.isArray(homework.lessonIds) ? homework.lessonIds : []);
    setEditingHwAttachmentUrls(asUrlList(homework?.attachmentUrls || homework?.attachment_urls, homework?.attachmentUrl || homework?.attachment_url));
    setNote(`Editing "${homework.title || 'Homework'}". Update and save to resend to all students.`);
  }

  async function onEditHomeworkFilesSelected(files) {
    const picked = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!picked.length) return;

    setEditingHwUploading(true);
    setNote(`Uploading ${picked.length} image${picked.length === 1 ? '' : 's'}...`);

    const uploaded = [];
    for (let i = 0; i < picked.length; i += 1) {
      try {
        const res = await uploadHomeworkImage(picked[i]);
        if (res?.url) uploaded.push(res.url);
      } catch {
        // Best-effort upload; continue with remaining files.
      }
    }

    if (uploaded.length) {
      setEditingHwAttachmentUrls((prev) => Array.from(new Set([...prev, ...uploaded])));
      setNote(uploaded.length === picked.length
        ? `Uploaded ${uploaded.length} image${uploaded.length === 1 ? '' : 's'} for edited homework.`
        : `Uploaded ${uploaded.length}/${picked.length} image${picked.length === 1 ? '' : 's'} for edited homework.`);
    } else {
      setNote('Image upload failed. Please try again.');
    }

    setEditingHwUploading(false);
  }

  async function onSaveHomeworkEdit(e) {
    e.preventDefault();
    if (!editingHwId) return;
    if (!editingHwTitle.trim()) {
      setNote('Title is required.');
      return;
    }
    if (editingHwUploading) {
      setNote('Please wait for image upload to finish before saving.');
      return;
    }
    setBusy('editHw');
    setNote('');
    try {
      const res = await updateTeacherHomework(editingHwId, {
        title: editingHwTitle.trim(),
        subject: editingHwSubject,
        note: editingHwNote || null,
        startAt: editingHwStartAt || null,
        dueAt: editingHwDueAt || null,
        attachmentUrls: editingHwAttachmentUrls,
        lessonIds: editingHwLessonIds,
        lessonTitles: editingHwLessonIds
          .map((id) => assignAvailableLessons.find((lesson) => lesson.id === id)?.title || '')
          .filter(Boolean)
      });
      const updatedHomework = res?.homework || {
        id: editingHwId,
        title: editingHwTitle.trim(),
        subject: editingHwSubject,
        note: editingHwNote || null,
        startAt: editingHwStartAt || null,
        dueAt: editingHwDueAt || null,
        assignmentGroupId: activeAssignments.find((a) => a.id === editingHwId)?.assignmentGroupId || null,
        lessonIds: editingHwLessonIds,
        lessonTitles: editingHwLessonIds
          .map((id) => assignAvailableLessons.find((lesson) => lesson.id === id)?.title || '')
          .filter(Boolean),
        attachmentUrls: editingHwAttachmentUrls,
        attachmentUrl: editingHwAttachmentUrls[0] || null,
      };
      // Update in activeAssignments if it's there
      setActiveAssignments((prev) =>
        prev.map((a) =>
          (a.id === editingHwId || (updatedHomework.assignmentGroupId && a.assignmentGroupId === updatedHomework.assignmentGroupId))
            ? {
                ...a,
                assignmentGroupId: updatedHomework.assignmentGroupId || a.assignmentGroupId || null,
                title: updatedHomework.title,
                subject: updatedHomework.subject,
                note: updatedHomework.note,
                startAt: updatedHomework.startAt,
                dueAt: updatedHomework.dueAt,
                className: updatedHomework.className || a.className,
                lessonIds: updatedHomework.lessonIds || editingHwLessonIds,
                lessonTitles: updatedHomework.lessonTitles || [],
                attachmentUrls: asUrlList(updatedHomework.attachmentUrls, updatedHomework.attachmentUrl),
                attachmentUrl: updatedHomework.attachmentUrl || asUrlList(updatedHomework.attachmentUrls, updatedHomework.attachmentUrl)[0] || null
              }
            : a
        )
      );
      setHomeworkHistory((prev) => {
        const next = prev.map((a) =>
          (a.id === editingHwId || (updatedHomework.assignmentGroupId && a.assignmentGroupId === updatedHomework.assignmentGroupId))
            ? {
                ...a,
                assignmentGroupId: updatedHomework.assignmentGroupId || a.assignmentGroupId || null,
                title: updatedHomework.title,
                subject: updatedHomework.subject,
                note: updatedHomework.note,
                startAt: updatedHomework.startAt,
                dueAt: updatedHomework.dueAt,
                className: updatedHomework.className || a.className,
                lessonIds: updatedHomework.lessonIds || editingHwLessonIds,
                lessonTitles: updatedHomework.lessonTitles || [],
                attachmentUrls: asUrlList(updatedHomework.attachmentUrls, updatedHomework.attachmentUrl),
                attachmentUrl: updatedHomework.attachmentUrl || asUrlList(updatedHomework.attachmentUrls, updatedHomework.attachmentUrl)[0] || null
              }
            : a
        );
        try {
          localStorage.setItem(historyStorageKey, JSON.stringify(next.slice(0, 300)));
        } catch {
          // Ignore storage errors.
        }
        return next;
      });
      setNote(`✅ Homework updated and resent to all students.`);
      setEditingHwId(null);
      setEditingHwTitle('');
      setEditingHwNote('');
      setEditingHwSubject('');
      setEditingHwStartAt('');
      setEditingHwDueAt('');
      setEditingHwLessonIds([]);
      setShowEditingLessonPicker(false);
      setEditingHwAttachmentUrls([]);
      await loadHomeworkHistory();
    } catch (e2) {
      setNote(e2?.message || 'Failed to update homework.');
    } finally {
      setBusy('');
    }
  }

  function onCancelEditHomework() {
    setEditingHwId(null);
    setEditingHwTitle('');
    setEditingHwNote('');
    setEditingHwSubject('');
    setEditingHwStartAt('');
    setEditingHwDueAt('');
    setEditingHwLessonIds([]);
    setShowEditingLessonPicker(false);
    setEditingHwAttachmentUrls([]);
    setNote('Edit cancelled.');
  }

  function onTeacherDrop(event) {
    event.preventDefault();
    setAssignDropActive(false);
    const files = Array.from(event.dataTransfer?.files || []).filter((file) => String(file?.type || '').startsWith('image/'));
    if (files.length) onTeacherHomeworkFilesSelected(files);
  }

  function toLocalDateKey(value) {
    const dt = parseSafeDate(value);
    if (!dt) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  function getHomeworkHistoryDate(item) {
    return toLocalDateKey(item?.startAt || item?.start_at)
      || toLocalDateKey(item?.createdAt || item?.created_at)
      || '';
  }

  function getHomeworkHistoryLabel(item) {
    const start = parseSafeDate(item?.startAt || item?.start_at);
    const due = parseSafeDate(item?.dueAt || item?.due_at);
    const created = parseSafeDate(item?.createdAt || item?.created_at);
    return start || created || due || null;
  }

  async function loadHomeworkHistory() {
    try {
      const res = await getTeacherAssignedHomework();
      const normalizeAssignment = (item) => {
        const meta = item?.tasks && typeof item.tasks === 'object' && item.tasks.meta && typeof item.tasks.meta === 'object'
          ? item.tasks.meta
          : null;
        const attachmentUrls = asUrlList(
          item?.attachmentUrls || item?.attachment_urls || meta?.attachmentUrls,
          item?.attachmentUrl || item?.attachment_url || meta?.attachmentUrl
        );
        return {
          ...item,
          assignmentGroupId: item?.assignmentGroupId || meta?.assignmentGroupId || null,
          className: item?.className || item?.class_name || meta?.className || '',
          startAt: item?.startAt || item?.start_at || meta?.startAt || null,
          dueAt: item?.dueAt || item?.due_at || meta?.dueAt || null,
          createdAt: item?.createdAt || item?.created_at || null,
          note: item?.note || item?.homework_note || meta?.note || '',
          attachmentUrls,
          attachmentUrl: attachmentUrls[0] || null
        };
      };

      const rawApiList = Array.isArray(res?.assignments)
        ? res.assignments
        : (Array.isArray(res?.homework)
          ? res.homework
          : (Array.isArray(res?.items)
            ? res.items
            : (Array.isArray(res?.data) ? res.data : [])));
      const apiList = Array.isArray(rawApiList) ? rawApiList.map(normalizeAssignment) : [];
      const cachedRaw = localStorage.getItem(historyStorageKey);
      const cachedList = cachedRaw ? JSON.parse(cachedRaw) : [];
      const normalizedCached = Array.isArray(cachedList) ? cachedList.map(normalizeAssignment) : [];
      const merged = [...apiList, ...normalizedCached];
      const mergedByKey = new Map();
      merged.forEach((item) => {
        const key = assignmentStableKey(item);
        const existing = mergedByKey.get(key);
        if (!existing) {
          mergedByKey.set(key, item);
          return;
        }

        const existingAttachments = asUrlList(existing?.attachmentUrls || existing?.attachment_urls, existing?.attachmentUrl || existing?.attachment_url);
        const nextAttachments = asUrlList(item?.attachmentUrls || item?.attachment_urls, item?.attachmentUrl || item?.attachment_url);
        const mergedAttachments = Array.from(new Set([...existingAttachments, ...nextAttachments]));

        const resolved = {
          ...existing,
          ...item,
          note: existing?.note || item?.note || '',
          startAt: existing?.startAt || item?.startAt || item?.start_at || null,
          dueAt: existing?.dueAt || item?.dueAt || item?.due_at || null,
          createdAt: existing?.createdAt || item?.createdAt || item?.created_at || null,
          attachmentUrls: mergedAttachments,
          attachmentUrl: mergedAttachments[0] || null
        };
        mergedByKey.set(key, resolved);
      });
      const dedup = Array.from(mergedByKey.values());

      // ── Auto-resync: push cached items that aren't in the backend back in ──
      // This recovers homework after a server restart wiped in-memory data.
      const apiKeys = new Set(apiList.map(assignmentStableKey));
      const cachedNormalized = normalizedCached;
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
            const due = parseSafeDate(a?.dueAt || a?.due_at);
            return !due || due > now;
          })
          .sort((a, b) => new Date(b?.createdAt || b?.created_at || 0).getTime() - new Date(a?.createdAt || a?.created_at || 0).getTime())
          .slice(0, 40)
      );
    } catch {
      // Keep local view if API fails.
      try {
        const cachedRaw = localStorage.getItem(historyStorageKey);
        const cachedList = cachedRaw ? JSON.parse(cachedRaw) : [];
        const list = Array.isArray(cachedList) ? cachedList.map((item) => {
          const meta = item?.tasks && typeof item.tasks === 'object' && item.tasks.meta && typeof item.tasks.meta === 'object'
            ? item.tasks.meta
            : null;
          const attachmentUrls = asUrlList(
            item?.attachmentUrls || item?.attachment_urls || meta?.attachmentUrls,
            item?.attachmentUrl || item?.attachment_url || meta?.attachmentUrl
          );
          return {
            ...item,
            className: item?.className || item?.class_name || meta?.className || '',
            startAt: item?.startAt || item?.start_at || meta?.startAt || null,
            dueAt: item?.dueAt || item?.due_at || meta?.dueAt || null,
            createdAt: item?.createdAt || item?.created_at || null,
            note: item?.note || item?.homework_note || meta?.note || '',
            attachmentUrls,
            attachmentUrl: attachmentUrls[0] || null
          };
        }) : [];
        setHomeworkHistory(list);
        const now = new Date();
        setActiveAssignments(
          list.filter((a) => {
            const due = parseSafeDate(a?.dueAt || a?.due_at);
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
    if (announcementStartAt && announcementEndAt && new Date(announcementEndAt) <= new Date(announcementStartAt)) {
      setNote('End time must be after the start time.');
      return;
    }

    setBusy('announce');
    setNote('');
    try {
      const res = await postTeacherAnnouncement({
        title: announcementTitle,
        message: announcementMessage,
        audience: 'students',
        className: teacherTargetClass,
        startAt: announcementStartAt || null,
        endAt: announcementEndAt || null
      });
      if (!res?.announcement) {
        setNote(res?.error || 'Announcement could not be posted.');
        return;
      }

      setAnnouncementTitle('');
      setAnnouncementMessage('');
      setAnnouncementStartAt('');
      setAnnouncementEndAt('');
      setNote(`Announcement posted to ${teacherTargetClass}.`);
      await Promise.all([loadAnnouncementsPanel(), loadSummaryPanel()]);
    } catch (e2) {
      setNote('Failed to post announcement.');
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

  function scoreColor(score) {
    const n = Number(score);
    if (n >= 80) return '#22c55e';
    if (n >= 60) return '#f59e0b';
    return '#ef4444';
  }

  const selectedStudentName = (classScopedStudents.find((s) => s.id === selectedStudentId)?.name) || selectedStudentId || 'Student';

  const navItems = [
    { key: 'teacher', label: 'Teacher', icon: '📋' },
    { key: 'ai-assistant', label: 'AI Assistant', icon: '🤖' },
    { key: 'students', label: 'Students', icon: '👤' },
    { key: 'progress', label: 'Student Progress', icon: '📈' }
  ];

  return (
    <div className="td-shell">
      {/* ── Sidebar ── */}
      <nav className="td-sidebar">
        <div className="td-sidebar-brand">
          <span className="td-sidebar-logo">🎓</span>
          <span className="td-sidebar-title">AcademiX</span>
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
      <div className="td-main td-main-themed" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Subject-themed SVG background */}
        <SubjectBackground subject={teacherProfile?.subject || session?.subject || 'General'} />
        {activeSection !== 'progress' && activeSection !== 'students' && activeSection !== 'ai-assistant' && (
          <>
            <header className="td-topbar td-framed">
              <div>
                <p className="td-kicker">Teacher Workspace</p>
                <h1>Welcome, {teacherProfile?.name || session?.name || 'Teacher'}</h1>
                <p>
                  {teacherProfile?.subject || session?.subject
                    ? <><strong>{teacherProfile?.subject || session?.subject}</strong>{' · '}</>  
                    : null}
                  {activeSection === 'teacher'
                    ? 'Manage announcements, homework, and tests.'
                    : 'Register students and manage invitations.'}
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
                <article key={item.label} className="td-stat-card td-framed">
                  <p>{item.label}</p>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </section>

            {note ? <p className="td-note">{note}</p> : null}
          </>
        )}

        {/* ══════════ TEACHER SECTION ══════════ */}
        {activeSection === 'teacher' && (
          <section className="td-grid">

            {/* ── Global class selector ── */}
            <div className="td-class-banner td-framed">
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

            <article className="td-card td-card-framed">
              <h3>Announcements</h3>
              <p>Broadcast an update to <strong>{teacherTargetClass === 'all' ? 'the selected class' : teacherTargetClass}</strong>.</p>
              <form className="td-form" onSubmit={onPostAnnouncement}>
                <input value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} placeholder="Announcement title" />
                <textarea rows={3} value={announcementMessage} onChange={(e) => setAnnouncementMessage(e.target.value)} placeholder="Type announcement message" />
                <div className="td-announce-schedule">
                  <div>
                    <label className="td-field-label">Visible From (optional)</label>
                    <input
                      type="datetime-local"
                      className="td-input"
                      value={announcementStartAt}
                      onChange={(e) => setAnnouncementStartAt(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="td-field-label">Visible Until (optional)</label>
                    <input
                      type="datetime-local"
                      className="td-input"
                      value={announcementEndAt}
                      min={announcementStartAt || undefined}
                      onChange={(e) => setAnnouncementEndAt(e.target.value)}
                    />
                  </div>
                </div>
                <small className="td-announce-schedule-hint">
                  Leave blank to post immediately and keep it visible indefinitely.
                </small>
                <button type="submit" disabled={busy === 'announce'}>
                  {busy === 'announce' ? 'Posting...' : teacherTargetClass === 'all' ? 'Select a class first' : `Post to ${teacherTargetClass}`}
                </button>
              </form>
              {panelError.announcements ? <p className="td-empty">{panelError.announcements}</p> : null}
              <ul className="td-announcements">
                {classScopedAnnouncements.slice(0, 5).map((a) => (
                  <li key={a.id || `${a.title}-${a.createdAt}`}>
                    <strong>{a.title}</strong>
                    <p>{a.message}</p>
                    <span className="td-announce-schedule-badge">{announcementScheduleLabel(a)}</span>
                  </li>
                ))}
                {!panelLoading.announcements && !classScopedAnnouncements.length ? <p className="td-empty">No announcements posted yet.</p> : null}
              </ul>
            </article>

            <article className="td-card td-card-wide td-card-framed">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0 }}>📝 Assign Homework</h3>
                  <span style={{ fontSize: '12px', color: '#666', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '999px', padding: '2px 8px' }}>
                    Active: {classScopedActiveAssignments.length} | History: {classScopedHomeworkHistory.length}
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
                      if (!showHistoryDropdown) {
                        setHistoryFilterDate('');
                        setHistoryCalMonth(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
                        loadHomeworkHistory();
                      }
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
                      {(() => {
                        const dateStatusMap = {};
                        safeArray(classScopedHomeworkHistory).forEach((hw) => {
                          const d = getHomeworkHistoryDate(hw);
                          if (!d) return;
                          if (!dateStatusMap[d]) dateStatusMap[d] = { all: 0 };
                          dateStatusMap[d].all += 1;
                        });

                        const { year, month } = historyCalMonth;
                        const firstDay = new Date(year, month, 1);
                        const startOffset = (firstDay.getDay() + 6) % 7;
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        const monthLabel = firstDay.toLocaleString(undefined, { month: 'long', year: 'numeric' });
                        const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
                        const cells = [];
                        for (let i = 0; i < startOffset; i += 1) cells.push(null);
                        for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

                        return (
                          <div style={{ marginBottom: '12px', userSelect: 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <button type="button" onClick={() => setHistoryCalMonth(({ year: y, month: m }) => { const d = new Date(y, m - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#475569', padding: '2px 6px' }}>‹</button>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>{monthLabel}</span>
                              <button type="button" onClick={() => setHistoryCalMonth(({ year: y, month: m }) => { const d = new Date(y, m + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#475569', padding: '2px 6px' }}>›</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '2px' }}>
                              {DAY_LABELS.map((l, i) => (
                                <div key={i} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#94a3b8', padding: '2px 0' }}>{l}</div>
                              ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                              {cells.map((day, idx) => {
                                if (!day) return <div key={`e-${idx}`} />;
                                const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                const info = dateStatusMap[iso];
                                const isSelected = historyFilterDate === iso;
                                let bg = 'transparent';
                                let color = '#374151';
                                let fontWeight = 400;
                                if (info) {
                                  bg = isSelected ? '#15803d' : '#dcfce7';
                                  color = isSelected ? '#fff' : '#15803d';
                                  fontWeight = 700;
                                } else if (isSelected) {
                                  bg = '#3b82f6'; color = '#fff'; fontWeight = 700;
                                }
                                return (
                                  <button
                                    key={iso}
                                    type="button"
                                    title={info ? `${info.all} homework assigned` : 'No homework'}
                                    onClick={() => setHistoryFilterDate(isSelected ? '' : iso)}
                                    style={{ background: bg, color, fontWeight, border: isSelected ? `2px solid ${color === '#fff' ? 'rgba(0,0,0,0.2)' : color}` : '1px solid transparent', borderRadius: '6px', padding: '4px 2px', fontSize: '12px', cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}
                                  >
                                    {day}
                                  </button>
                                );
                              })}
                            </div>
                            {historyFilterDate ? (
                              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '12px', color: '#475569' }}>Selected: <strong>{new Date(historyFilterDate + 'T00:00:00').toLocaleDateString()}</strong></span>
                                <button type="button" className="eg-inline-btn" onClick={() => setHistoryFilterDate('')}>Clear</button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                      {classScopedHomeworkHistory.length === 0 ? (
                        <p style={{ color: '#999', fontSize: '13px' }}>No homework assigned yet.</p>
                      ) : (() => {
                        const visibleHistoryBase = classScopedHomeworkHistory
                          .filter((h) => {
                            if (!historyFilterDate) return true;
                            const relevantKey = getHomeworkHistoryDate(h);
                            return relevantKey === historyFilterDate;
                          })
                          .sort((a, b) => {
                            const da = getHomeworkHistoryLabel(a)
                              || new Date(0);
                            const db = getHomeworkHistoryLabel(b)
                              || new Date(0);
                            return db.getTime() - da.getTime();
                          });

                        const visibleHistory = historyFilterDate
                          ? visibleHistoryBase.filter((h) => getHomeworkHistoryDate(h) === historyFilterDate)
                          : visibleHistoryBase.slice(0, 2);

                        if (!visibleHistory.length) {
                          return (
                            <p style={{ color: '#999', fontSize: '13px' }}>
                              {historyFilterDate ? 'No homework found for the selected date.' : 'No homework assigned yet.'}
                            </p>
                          );
                        }

                        return visibleHistory.map((h, idx) => {
                          const historyId = String(h?.id || h?.homeworkId || h?.homework_id || h?.title || 'history');
                          const detailsExpanded = !!expandedHistoryDetailsById[historyId];
                          const teacherImages = asUrlList(h?.attachmentUrls || h?.attachment_urls, h?.attachmentUrl || h?.attachment_url);
                          const historyDateKey = getHomeworkHistoryDate(h) || 'no-date';
                          return (
                            <div key={`${historyId}-${historyDateKey}-${idx}`} style={{
                              padding: '10px 12px', marginBottom: '8px', background: '#f8f8ff',
                              borderRadius: '8px', borderLeft: '3px solid #5b47ff', fontSize: '13px'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                <div style={{ fontWeight: 'bold' }}>{h.subject}: {h.title}</div>
                                <button
                                  type="button"
                                  className="td-inline-btn"
                                  onClick={() => setExpandedHistoryDetailsById((prev) => ({ ...prev, [historyId]: !prev[historyId] }))}
                                >
                                  {detailsExpanded ? 'Hide details' : 'Show details'}
                                </button>
                              </div>
                              <div style={{ color: '#888', fontSize: '12px' }}>
                                {parseSafeDate(h.startAt || h.start_at) && <span>Start: {parseSafeDate(h.startAt || h.start_at).toLocaleString()} · </span>}
                                {parseSafeDate(h.dueAt || h.due_at) && <span>Due: {parseSafeDate(h.dueAt || h.due_at).toLocaleString()}</span>}
                                {!(h.startAt || h.start_at) && !(h.dueAt || h.due_at) && <span>Assigned: {(h.createdAt || h.created_at) ? new Date(h.createdAt || h.created_at).toLocaleDateString() : '–'}</span>}
                              </div>
                              {detailsExpanded ? (
                                <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
                                  {h.note ? (
                                    <div style={{ color: '#555', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '3px' }}>Instructions</div>
                                      {h.note}
                                    </div>
                                  ) : null}
                                  {teacherImages.length ? (
                                    <div>
                                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginBottom: '4px' }}>Teacher attachments</div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {teacherImages.map((url) => (
                                          <img
                                            key={url}
                                            src={url}
                                            alt="Homework attachment"
                                            onClick={() => setLightboxUrl(url)}
                                            title="Click to expand"
                                            style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '1px solid #d1d5db' }}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        });
                      })()}
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
                  readOnly={!!lockedSubject}
                  title={lockedSubject ? 'Locked to your subject' : undefined}
                  style={lockedSubject ? { background: '#f2f4fb', cursor: 'not-allowed' } : undefined}
                />
                {/* Chapter / Lesson picker */}
                <div ref={lessonPickerRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={`td-lesson-picker-btn${assignLessonIds.length ? ' has-selection' : ''}`}
                    onClick={() => setShowLessonPicker((v) => !v)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    {assignLessonIds.length
                      ? `${assignLessonIds.length} chapter${assignLessonIds.length > 1 ? 's' : ''} selected`
                      : 'Select chapters (optional)'}
                    <span style={{ marginLeft: 'auto', fontSize: '10px', transition: 'transform 0.2s', transform: showLessonPicker ? 'rotate(180deg)' : 'none' }}>▾</span>
                  </button>
                  {showLessonPicker && (
                    <div className="td-lesson-picker-dropdown">
                      {!teacherTargetClass || teacherTargetClass === 'all' ? (
                        assignAvailableLessons.length > 0 ? null : (
                        <div style={{ padding: '12px', fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
                          Select a class to see chapters, or no lessons uploaded yet.
                        </div>
                        )
                      ) : assignAvailableLessons.length === 0 ? (
                        <div style={{ padding: '12px', fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
                          No lessons uploaded for {assignSubject} in {teacherTargetClass} yet. Upload lessons from the school portal first.
                        </div>
                      ) : (
                        <>
                          <label className="td-lesson-picker-option">
                            <input
                              type="checkbox"
                              checked={assignLessonIds.length === 0}
                              onChange={() => setAssignLessonIds([])}
                            />
                            <span style={{ fontWeight: 600 }}>All chapters / General</span>
                          </label>
                          {assignAvailableLessons.map((lesson, idx) => (
                            <label key={lesson.id} className="td-lesson-picker-option">
                              <input
                                type="checkbox"
                                checked={assignLessonIds.includes(lesson.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAssignLessonIds((prev) => [...prev, lesson.id]);
                                  } else {
                                    setAssignLessonIds((prev) => prev.filter((id) => id !== lesson.id));
                                  }
                                }}
                              />
                              <span>{idx + 1}. {lesson.title}</span>
                            </label>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  {assignLessonIds.length > 0 && (
                    <div className="td-lesson-picker-tags">
                      {assignLessonIds.map((id) => {
                        const lesson = assignAvailableLessons.find((l) => l.id === id);
                        return lesson ? (
                          <span key={id} className="td-lesson-tag">
                            📖 {lesson.title}
                            <button type="button" onClick={() => setAssignLessonIds((prev) => prev.filter((x) => x !== id))}>✕</button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  placeholder="Homework instructions / notes for students (e.g. Read pages 45–52 and answer Q1–Q5...)"
                  style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '14px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box' }}
                />
                <div
                  onDragOver={(e) => { e.preventDefault(); setAssignDropActive(true); }}
                  onDragLeave={() => setAssignDropActive(false)}
                  onDrop={onTeacherDrop}
                  style={{
                    border: `2px dashed ${assignDropActive ? '#4f46e5' : '#d7def5'}`,
                    background: assignDropActive ? '#eef2ff' : '#fafbff',
                    borderRadius: '10px',
                    padding: '12px'
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => onTeacherHomeworkFilesSelected(Array.from(e.target.files || []))}
                    disabled={assignAttachmentUploading}
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
                    Drag and drop multiple images here, or use Choose Files.
                  </div>
                </div>
                {assignAttachmentUploading && <p style={{ fontSize: '12px', color: '#888', margin: '4px 0' }}>⏳ Uploading...</p>}
                {([...assignAttachmentUrls, ...assignPreviewUrls]).length ? (
                  <div style={{ border: '1px dashed #ddd', borderRadius: '8px', padding: '8px', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#666' }}>{[...assignAttachmentUrls, ...assignPreviewUrls].length} image(s) selected</span>
                      <button type="button" className="td-inline-btn danger" onClick={onRemoveAllTeacherAttachments}>Remove all</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {[...assignAttachmentUrls, ...assignPreviewUrls].map((url, index) => (
                        <div
                          key={url}
                          draggable
                          onDragStart={(e) => onAssignImageDragStart(e, index)}
                          onDragOver={(e) => onAssignImageDragOver(e, index)}
                          onDragLeave={onAssignImageDragLeave}
                          onDrop={(e) => onAssignImageDrop(e, index)}
                          style={{
                            position: 'relative',
                            opacity: assignDraggedImageIndex === index ? 0.5 : 1,
                            backgroundColor: assignDragOverImageIndex === index ? '#f0f0f0' : 'transparent',
                            borderRadius: '6px',
                            border: assignDragOverImageIndex === index ? '2px dashed #4f46e5' : 'none',
                            padding: assignDragOverImageIndex === index ? '4px' : '0px',
                            cursor: 'grab',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <img
                            src={url}
                            alt="Homework preview"
                            onClick={() => setLightboxUrl(url)}
                            title="Drag to reorder • Click to expand"
                            style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '6px', display: 'block', border: '1px solid #ddd', userSelect: 'none' }}
                          />
                          <button
                            type="button"
                            onClick={() => onRemoveTeacherAttachment(url)}
                            title="Remove image"
                            style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', fontSize: '12px', lineHeight: '18px', cursor: 'pointer', padding: 0, zIndex: 10 }}
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                    {assignAttachmentUploading && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', fontSize: '13px', color: '#555' }}>
                        ⏳ Uploading to server...
                      </div>
                    )}
                    <p style={{ fontSize: '11px', color: '#999', margin: '6px 0 0', textAlign: 'center' }}>Drag images to reorder • Click image to expand • click x to remove</p>
                  </div>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Start Date &amp; Time</label>
                    <input
                      type="datetime-local"
                      value={assignStartAt}
                      onChange={(e) => {
                        setAssignStartAt(e.target.value);
                        // Auto-set due date to next day when start date is selected
                        if (e.target.value) {
                          const startDate = new Date(e.target.value);
                          if (!Number.isNaN(startDate.getTime())) {
                            const nextDay = new Date(startDate);
                            nextDay.setDate(nextDay.getDate() + 1);
                            setAssignDueAt(toLocalDateTimeInputValue(nextDay));
                          }
                        }
                      }}
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
                <button type="submit" disabled={busy === 'assign' || assignAttachmentUploading}>
                  {busy === 'assign'
                    ? 'Assigning...'
                    : assignAttachmentUploading
                      ? 'Uploading image...'
                      : (assignPreviewUrls.length > 0 && assignAttachmentUrls.length === 0)
                        ? `✅ Assign to ${teacherTargetClass} (local image)`
                        : teacherTargetClass === 'all'
                          ? 'Select a class first'
                          : `✅ Assign to ${teacherTargetClass}`}
                </button>
                {note ? (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      background: note.startsWith('✅') ? '#ecfdf3' : (note.startsWith('⚠') ? '#fff7ed' : '#fef2f2'),
                      color: note.startsWith('✅') ? '#166534' : (note.startsWith('⚠') ? '#9a3412' : '#991b1b'),
                      border: note.startsWith('✅') ? '1px solid #bbf7d0' : (note.startsWith('⚠') ? '1px solid #fed7aa' : '1px solid #fecaca')
                    }}
                  >
                    {note}
                  </div>
                ) : null}
              </form>

              {/* Edit Homework Form */}
              {editingHwId && (
                <div style={{ marginTop: '20px', padding: '16px', background: '#f0f4ff', borderRadius: '8px', border: '2px solid #4f46e5' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#1e40af' }}>Edit Homework</h4>
                  <form onSubmit={onSaveHomeworkEdit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Title</label>
                      <input
                        type="text"
                        value={editingHwTitle}
                        onChange={(e) => setEditingHwTitle(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Subject</label>
                      <input
                        type="text"
                        value={editingHwSubject}
                        onChange={(e) => setEditingHwSubject(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', ...(lockedSubject ? { background: '#f2f4fb', cursor: 'not-allowed' } : {}) }}
                        readOnly={!!lockedSubject}
                        title={lockedSubject ? 'Locked to your subject' : undefined}
                      />
                    </div>
                    <div ref={editingLessonPickerRef} style={{ position: 'relative' }}>
                      <button
                        type="button"
                        className={`td-lesson-picker-btn${editingHwLessonIds.length ? ' has-selection' : ''}`}
                        onClick={() => setShowEditingLessonPicker((value) => !value)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                        {editingHwLessonIds.length
                          ? `${editingHwLessonIds.length} chapter${editingHwLessonIds.length > 1 ? 's' : ''} selected`
                          : 'All chapters / General'}
                        <span style={{ marginLeft: 'auto', fontSize: '10px', transform: showEditingLessonPicker ? 'rotate(180deg)' : 'none' }}>▾</span>
                      </button>
                      {showEditingLessonPicker && (
                        <div className="td-lesson-picker-dropdown">
                          <label className="td-lesson-picker-option">
                            <input type="checkbox" checked={!editingHwLessonIds.length} onChange={() => setEditingHwLessonIds([])} />
                            <span style={{ fontWeight: 600 }}>All chapters / General</span>
                          </label>
                          {assignAvailableLessons.length ? assignAvailableLessons.map((lesson, index) => (
                            <label key={lesson.id} className="td-lesson-picker-option">
                              <input
                                type="checkbox"
                                checked={editingHwLessonIds.includes(lesson.id)}
                                onChange={(event) => setEditingHwLessonIds((current) => event.target.checked
                                  ? [...current, lesson.id]
                                  : current.filter((id) => id !== lesson.id))}
                              />
                              <span>{index + 1}. {lesson.title}</span>
                            </label>
                          )) : (
                            <div style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>No lessons available for this class and subject.</div>
                          )}
                        </div>
                      )}
                      {editingHwLessonIds.length > 0 && (
                        <div className="td-lesson-picker-tags">
                          {editingHwLessonIds.map((id) => {
                            const lesson = assignAvailableLessons.find((item) => item.id === id);
                            return lesson ? <span key={id} className="td-lesson-tag">📖 {lesson.title}</span> : null;
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Instructions / Note</label>
                      <textarea
                        value={editingHwNote}
                        onChange={(e) => setEditingHwNote(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', minHeight: '60px', fontFamily: 'inherit' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Start Date &amp; Time</label>
                        <input
                          type="datetime-local"
                          value={editingHwStartAt}
                          onChange={(e) => setEditingHwStartAt(e.target.value)}
                          style={{ width: '100%', fontSize: '13px', padding: '6px' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Due Date &amp; Time</label>
                        <input
                          type="datetime-local"
                          value={editingHwDueAt}
                          onChange={(e) => setEditingHwDueAt(e.target.value)}
                          style={{ width: '100%', fontSize: '13px', padding: '6px' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Add / Replace Images</label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => onEditHomeworkFilesSelected(Array.from(e.target.files || []))}
                        disabled={editingHwUploading || busy === 'editHw'}
                        style={{ width: '100%', fontSize: '13px' }}
                      />
                      {editingHwUploading && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>Uploading image(s)...</div>
                      )}
                    </div>
                    {editingHwAttachmentUrls.length > 0 && (
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Images ({editingHwAttachmentUrls.length})</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {editingHwAttachmentUrls.map((url, index) => (
                            <div
                              key={url}
                              draggable
                              onDragStart={(e) => onEditingImageDragStart(e, index)}
                              onDragOver={(e) => onEditingImageDragOver(e, index)}
                              onDragLeave={onEditingImageDragLeave}
                              onDrop={(e) => onEditingImageDrop(e, index)}
                              style={{
                                position: 'relative',
                                opacity: editingDraggedImageIndex === index ? 0.5 : 1,
                                backgroundColor: editingDragOverImageIndex === index ? '#f0f0f0' : 'transparent',
                                borderRadius: '4px',
                                border: editingDragOverImageIndex === index ? '2px dashed #4f46e5' : 'none',
                                padding: editingDragOverImageIndex === index ? '4px' : '0px',
                                cursor: 'grab',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <img
                                src={url}
                                alt="Homework attachment"
                                onClick={() => setLightboxUrl(url)}
                                title="Drag to reorder • Click to expand"
                                style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd', userSelect: 'none' }}
                              />
                              <button
                                type="button"
                                onClick={() => setEditingHwAttachmentUrls((prev) => prev.filter((u) => u !== url))}
                                style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', fontSize: '11px', cursor: 'pointer', padding: 0, zIndex: 10 }}
                              >
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                        <p style={{ fontSize: '10px', color: '#999', margin: '4px 0 0', marginTop: '4px' }}>Drag images to reorder</p>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={onCancelEditHomework}
                        style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={busy === 'editHw' || editingHwUploading}
                        style={{ padding: '8px 16px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', cursor: busy === 'editHw' ? 'wait' : 'pointer', fontSize: '13px' }}
                      >
                        {busy === 'editHw' ? 'Saving...' : 'Update & Resend to All Students'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Active Acknowledgments — visible until due date passes */}
              {latestTwoActiveAssignments.length > 0 && (
                <div style={{ marginTop: '18px' }}>
                  <h4 style={{ fontSize: '14px', color: '#555', marginBottom: '8px' }}>✅ Recently Assigned (visible until due date)</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {latestTwoActiveAssignments.map((a, idx) => (
                      <li key={a.id} style={{
                        padding: '10px 14px', marginBottom: '8px', background: '#eef9f0',
                        borderRadius: '8px', borderLeft: '4px solid #2ecc71', fontSize: '13px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <div style={{ fontWeight: 'bold' }}>
                            {a.subject}: {a.title}
                          </div>
                          {idx < 2 && (
                            <button
                              type="button"
                              onClick={() => onStartEditHomework(a)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                background: '#3498db',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        {a.note && <div style={{ color: '#555', marginBottom: '4px' }}>{a.note}</div>}
                        {asUrlList(a?.attachmentUrls || a?.attachment_urls, a?.attachmentUrl || a?.attachment_url).length ? (
                          <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {asUrlList(a?.attachmentUrls || a?.attachment_urls, a?.attachmentUrl || a?.attachment_url).map((url) => (
                              <img
                                key={url}
                                src={url}
                                alt="Assigned attachment"
                                onClick={() => setLightboxUrl(url)}
                                title="Click to expand"
                                style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in', border: '1px solid #c8d6d0' }}
                              />
                            ))}
                            <span style={{ fontSize: '11px', color: '#666' }}>Attachment(s)</span>
                          </div>
                        ) : null}
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

            <article className="td-card td-card-wide td-card-framed">
              <h3>Mock Tests</h3>
              <p>Create tests and add questions for your students.</p>
              {panelError.tests ? <p className="td-empty">{panelError.tests}</p> : null}

              {classScopedTests.length ? (
                <ul className="td-announcements">
                  {classScopedTests.map((t) => (
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
                  <input className="td-input" value={editingTestSubject} onChange={(e) => setEditingTestSubject(e.target.value)} placeholder="Subject" readOnly={!!lockedSubject} title={lockedSubject ? 'Locked to your subject' : undefined} style={lockedSubject ? { background: '#f2f4fb', cursor: 'not-allowed' } : undefined} />
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
                <input className="td-input" value={newTestSubject} onChange={(e) => setNewTestSubject(e.target.value)} placeholder="Subject" readOnly={!!lockedSubject} title={lockedSubject ? 'Locked to your subject' : undefined} style={lockedSubject ? { background: '#f2f4fb', cursor: 'not-allowed' } : undefined} />
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

        {/* ══════════ AI ASSISTANT SECTION ══════════ */}
        {activeSection === 'ai-assistant' && (
          <section className="td-ai-page">
            <article className="td-card td-card-wide td-card-framed td-ai-tutor-card">
              <section className="cardish eg-grad-ai eg-ai-panel eg-ai-screen">
                <div className="eg-ai-top-sticky">
                  <div className="eg-ai-head">
                    <h3>🤖 AI Assistant</h3>
                    <div className="eg-ai-head-controls">
                      <div className="eg-ai-speed-control" title={`Voice speed: ${getSpeedLabel(chatReadAloudSpeed)}`}>
                        <label htmlFor="td-ai-speed-range">Speed</label>
                        <input
                          id="td-ai-speed-range"
                          type="range"
                          min="0.6"
                          max="1.8"
                          step="0.1"
                          value={chatReadAloudSpeed}
                          onChange={(e) => setChatReadAloudSpeed(clampSpeed(e.target.value))}
                          aria-label="Voice speed"
                        />
                        <span>{chatReadAloudSpeed.toFixed(1)}×</span>
                      </div>
                    </div>
                  </div>
                  <div className="eg-ai-context">
                    <div className="eg-ai-context-row">
                      <span className="eg-ai-select" style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {lockedSubject || 'No subject set'}
                      </span>
                      <select
                        value={selectedTutorLessonId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          setSelectedTutorLessonId(nextId);
                          setSelectedTutorLesson(tutorLessons.find((lesson) => String(lesson.id || '') === String(nextId)) || null);
                        }}
                        className="eg-ai-select"
                        disabled={!tutorLessons.length}
                      >
                        <option value="">{tutorLessons.length ? 'Select a lesson' : 'No lessons yet'}</option>
                        {tutorLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
                      </select>
                    </div>
                    <small className="eg-ai-scope-note">
                      {teacherTargetClass && teacherTargetClass !== 'all'
                        ? `Visible lessons for ${teacherTargetClass}`
                        : 'Showing lessons across all your classes.'}
                    </small>
                    {selectedTutorLesson ? (
                      <div className="eg-ai-lesson-chip">
                        Teaching: <strong>{selectedTutorLesson.title}</strong> · {selectedTutorLesson.subject}
                      </div>
                    ) : null}
                  </div>
                </div>
                {selectedTutorLesson ? (
                  <>
                    {panelError.chat ? <p className="eg-loading" style={{ color: '#dc2626' }}>{panelError.chat}</p> : null}
                    <div className="eg-ai-chat eg-ai-chat-screen">
                      {safeArray(chatHistory).map((m, idx) => {
                        const messageId = String(m?.id || m?.ts || `msg-${idx}`);
                        const messageText = m?.text || m?.message || '';
                        const isBot = m?.role !== 'user';
                        const isVoicePlaying = chatVoicePlayId === messageId;
                        const isVoiceLoading = chatVoiceLoadingId === messageId;
                        return (
                          <div key={messageId} className={`ai-msg ${m.role === 'user' ? 'user' : 'bot'} eg-ai-msg-text`}>
                            {Array.isArray(m?.imageDataUrls) && m.imageDataUrls.length ? (
                              <div className="eg-ai-inline-image-wrap eg-ai-inline-image-grid">
                                {m.imageDataUrls.slice(0, 4).map((url, i) => (
                                  <img
                                    key={`${messageId}-img-${i}`}
                                    className="eg-ai-inline-image"
                                    src={String(url)}
                                    alt={String(m?.imageNames?.[i] || `Uploaded image ${i + 1}`)}
                                  />
                                ))}
                                <small className="eg-ai-inline-image-label">{m.imageDataUrls.length} image{m.imageDataUrls.length === 1 ? '' : 's'} attached</small>
                              </div>
                            ) : null}
                            {messageText}
                            {isBot && messageText ? (
                              <div className="eg-ai-msg-actions">
                                <button
                                  type="button"
                                  className="eg-ai-voice-btn"
                                  onClick={() => onToggleLocalVoice(messageId, messageText)}
                                  disabled={Boolean(chatVoiceLoadingId) && !isVoicePlaying}
                                >
                                  {isVoiceLoading ? 'Generating Voice...' : (isVoicePlaying ? 'Stop Voice' : 'Play Voice')}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {chatLoading ? (
                        <div className="ai-msg bot ai-msg-thinking">
                          <span>AcademiX is thinking</span>
                          <span className="eg-typing-dots" aria-hidden="true"><i /><i /><i /></span>
                        </div>
                      ) : null}
                      {!panelLoading.chat && !chatHistory.length && !chatLoading ? (
                        <div className="ai-msg bot">👋 Hi! Ask me anything about {selectedTutorLesson.title} to help plan or recap this lesson.</div>
                      ) : null}
                      <div ref={chatEndRef} />
                    </div>
                    {!chatLoading && chatFollowups.length > 0 ? (
                      <div className="eg-ai-actions-wrap">
                        <div className="eg-ai-actions-panel">
                          <div className="eg-ai-followups">
                            {chatFollowups.map((f, i) => (
                              <button
                                key={i}
                                type="button"
                                className="eg-ai-followup-btn"
                                onClick={() => onSendTutorMessage(f)}
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {chatImages.length ? (
                      <div className="eg-ai-image-preview-wrap">
                        <div className="eg-ai-image-preview-grid">
                          {chatImages.map((img) => (
                            <div key={img.id} className="eg-ai-image-tile">
                              <img className="eg-ai-image-preview" src={img.dataUrl} alt={img.name || 'Selected for AI Assistant'} />
                              <button type="button" className="eg-ai-image-tile-remove" onClick={() => removeChatImageById(img.id)}>×</button>
                            </div>
                          ))}
                        </div>
                        <div className="eg-ai-image-meta">
                          <span>{chatImages.length} file{chatImages.length === 1 ? '' : 's'} selected</span>
                          <button type="button" className="eg-ai-image-clear" onClick={clearChatImages}>Clear all</button>
                        </div>
                      </div>
                    ) : null}
                    {chatImageError ? <p className="eg-ai-image-error">{chatImageError}</p> : null}
                    <div className="eg-ai-input-row">
                      <input
                        className="eg-ai-input"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendTutorMessage(); } }}
                        placeholder={`Ask about ${selectedTutorLesson.title}... (Enter to send)`}
                        disabled={chatLoading}
                      />
                      {chatImages.length ? <span className="eg-ai-selected-pill">{chatImages.length} file{chatImages.length === 1 ? '' : 's'} ready</span> : null}
                      <label className="eg-ai-attach-btn" htmlFor="td-ai-image-input">📎 File</label>
                      <input
                        id="td-ai-image-input"
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => { onTutorImageSelected(Array.from(e.target.files || [])); e.target.value = ''; }}
                        disabled={chatLoading}
                      />
                      <button
                        className={`eg-ai-send-btn ${chatLoading ? 'eg-ai-stop-btn' : ''}`}
                        onClick={() => (chatLoading ? onStopTutorMessageSend() : onSendTutorMessage())}
                        disabled={!chatLoading && !chatInput.trim() && !chatImages.length}
                      >
                        {chatLoading ? 'Stop' : 'Send'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="eg-ai-select-lesson-prompt">
                    <span className="eg-ai-select-lesson-icon" aria-hidden="true">📚</span>
                    <h4>Select a lesson to get started</h4>
                    <p>
                      {lockedSubject
                        ? `Choose an available ${lockedSubject} lesson from the dropdown above to start a focused assistant session for it.`
                        : 'Your teacher profile has no subject set — ask your school admin to assign one.'}
                    </p>
                  </div>
                )}
              </section>
            </article>
          </section>
        )}

        {/* ══════════ STUDENTS SECTION ══════════ */}
        {activeSection === 'students' && (
          <section
            className="td-grid"
            onClick={(e) => {
              if (e.target === e.currentTarget && homeworkStatusFilter !== 'all') {
                setHomeworkStatusFilter('all');
              }
            }}
          >
            <article className="td-card td-card-framed">
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
                <button type="button" className="td-inline-btn" onClick={clearSelectedStudents}>Clear Selection</button>
              </div>
              {panelError.students ? <p className="td-empty">{panelError.students}</p> : null}
              <div className="td-student-list">
                {pagedStudents.map((s) => (
                  <button
                    key={s.id}
                    className={selectedStudentId === s.id ? 'active' : ''}
                    onClick={() => { setSelectedStudentId(s.id); toggleStudent(s.id); }}
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
                {!panelLoading.students && !classScopedStudents.length ? <p className="td-empty">No students available yet for this class.</p> : null}
              </div>
              {classScopedStudents.length > STUDENTS_PAGE_SIZE ? (
                <div className="td-student-pager">
                  <button
                    type="button"
                    className="td-inline-btn"
                    disabled={clampedStudentPage === 0}
                    onClick={() => setStudentPage((p) => Math.max(0, p - 1))}
                  >
                    ← Previous
                  </button>
                  <span className="td-student-pager-label">Page {clampedStudentPage + 1} of {studentPageCount}</span>
                  <button
                    type="button"
                    className="td-inline-btn"
                    disabled={clampedStudentPage >= studentPageCount - 1}
                    onClick={() => setStudentPage((p) => Math.min(studentPageCount - 1, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              ) : null}
            </article>

            <article className="td-card td-card-framed">
              <h3>Progress Snapshot</h3>
              <div className="td-analytics-header">
                <p>{selectedStudentId ? `📊 ${selectedStudentName}` : 'Select a student to see metrics.'}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {subjectProgress?.subject ? (
                    <div className="td-toggle" role="tablist" aria-label="Choose time range">
                      <button type="button" className={progressView === 'daily' ? 'on' : ''} onClick={() => setProgressView('daily')}>Daily</button>
                      <button type="button" className={progressView === 'monthly' ? 'on' : ''} onClick={() => setProgressView('monthly')}>Monthly</button>
                    </div>
                  ) : null}
                  {subjectProgress?.subject && (
                    <button
                      type="button"
                      className="td-export-btn"
                      onClick={() => exportCSV(
                        `progress-${selectedStudentName}-${subjectProgress.subject.subjectKey}-${new Date().toISOString().slice(0,10)}.csv`,
                        ['Period', 'Score (%)'],
                        (progressView === 'monthly' ? subjectProgress.subject.monthly : subjectProgress.subject.daily || [])
                          .filter((p) => p.value != null)
                          .map((p) => [p.label, p.value])
                      )}
                    >
                      ↓ Export CSV
                    </button>
                  )}
                </div>
              </div>
              {panelError.progress ? <p className="td-empty">{panelError.progress}</p> : null}
              {subjectProgress?.subject ? (
                <TeacherSubjectProgressChart subject={subjectProgress.subject} view={progressView} />
              ) : (!panelLoading.progress && selectedStudentId ? <p className="td-empty">No progress data yet.</p> : null)}
            </article>

            <div className="td-delivery-hw-row">
              <article className="td-card td-card-framed td-delivery-narrow">
                <h3>Delivery Status</h3>
                <p>{selectedStudentId ? `What ${selectedStudentName} can currently see.` : 'Select a student to inspect delivery.'}</p>
                {panelError.delivery ? <p className="td-empty">{panelError.delivery}</p> : null}
                <div className="td-delivery-chips">
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
                </div>
                <p className="td-section-subtitle">Latest Items</p>
                <ul className="td-timeline">
                  <li><span>Homework</span><strong>{selectedDeliveryStatus.recentHomeworkTitle || '—'}</strong></li>
                  <li><span>Test</span><strong>{selectedDeliveryStatus.recentTestTitle || '—'}</strong></li>
                </ul>
              </article>

              {/* ── Homework Status ── */}
              <article className="td-card td-card-framed">
                <h3>Homework Status</h3>
                <div className="td-analytics-header">
                  <p>{selectedStudentId ? `📝 All homework for ${selectedStudentName}` : 'Select a student to view homework.'}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {classScopedStudents.length > 1 ? (
                      <div className="td-hw-pager">
                        <button
                          type="button"
                          className="td-hw-pager-btn"
                          disabled={selectedStudentIndex <= 0}
                          onClick={() => goToAdjacentStudent(-1)}
                        >
                          ← Prev
                        </button>
                        <span className="td-hw-pager-label">{selectedStudentIndex + 1}/{classScopedStudents.length}</span>
                        <button
                          type="button"
                          className="td-hw-pager-btn"
                          disabled={selectedStudentIndex === -1 || selectedStudentIndex >= classScopedStudents.length - 1}
                          onClick={() => goToAdjacentStudent(1)}
                        >
                          Next →
                        </button>
                      </div>
                    ) : null}
                    {classScopedSelectedHomework.length > 0 && (
                      <button
                        type="button"
                        className="td-export-btn"
                        onClick={() => exportCSV(
                          `homework-${selectedStudentName}-${new Date().toISOString().slice(0,10)}.csv`,
                          ['Title', 'Subject', 'Due Date', 'Status', 'Grade', 'Attempts', 'Submitted At'],
                          classScopedSelectedHomework.map((h) => [h.title, h.subject, h.dueAt || '', h.status, h.grade ?? '', h.attemptCount, h.submittedAt || ''])
                      )}
                    >
                      ↓ Export CSV
                    </button>
                  )}
                </div>
              </div>
              {classScopedSelectedHomework.length > 0 ? (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setHomeworkStatusFilter((prev) => (prev === 'submitted' ? 'all' : 'submitted'))}
                    style={{ background: homeworkStatusFilter === 'submitted' ? '#16a34a' : '#dcfce7', color: homeworkStatusFilter === 'submitted' ? '#fff' : '#166534', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                  >
                    Submitted: {selectedHomeworkSummary.submitted}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHomeworkStatusFilter((prev) => (prev === 'not-submitted' ? 'all' : 'not-submitted'))}
                    style={{ background: homeworkStatusFilter === 'not-submitted' ? '#dc2626' : '#fee2e2', color: homeworkStatusFilter === 'not-submitted' ? '#fff' : '#991b1b', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                  >
                    Not submitted: {selectedHomeworkSummary.notSubmitted}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHomeworkStatusFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))}
                    style={{ background: homeworkStatusFilter === 'overdue' ? '#c2410c' : '#ffedd5', color: homeworkStatusFilter === 'overdue' ? '#fff' : '#9a3412', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                  >
                    Overdue: {selectedHomeworkSummary.overdue}
                  </button>
                </div>
              ) : null}
              {panelError.homework ? <p className="td-empty">{panelError.homework}</p> : null}
              {classScopedSelectedHomework.length > 0 ? (
                filteredSelectedHomework.length > 0 ? (
                  <div className={`td-hw-table-wrap${homeworkStatusFilter !== 'all' && filteredSelectedHomework.length > 5 ? ' td-hw-table-scroll' : ''}`}>
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
                      {(homeworkStatusFilter === 'all' ? latestFiveSelectedHomework : filteredSelectedHomework).map((hw) => (
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
                            {(() => {
                              const statusLower = String(hw?.status || '').toLowerCase();
                              const dueStatusLower = String(hw?.dueStatus || '').toLowerCase();
                              const canGrade = ['submitted', 'resubmitted', 'graded', 'pending', 'overdue'].includes(statusLower)
                                || ['submitted', 'resubmitted', 'overdue', 'pending'].includes(dueStatusLower);
                              const isGradeOpen = !!expandedGradeById[hw.id];
                              return (
                                <>
                                  {(() => {
                                    const latestUrls = asUrlList(hw?.latestAttachmentUrls || hw?.latest_attachment_urls, hw?.latestAttachmentUrl || hw?.latest_attachment_url);
                                    const fallbackUrls = asUrlList((hwAttemptsByHwId[hw.id] || [])[0]?.attachmentUrls, (hwAttemptsByHwId[hw.id] || [])[0]?.attachmentUrl);
                                    const submittedUrls = latestUrls.length ? latestUrls : fallbackUrls;
                                    const latestAnswer = (() => {
                                      const fromAttempt = String((hwAttemptsByHwId[hw.id] || [])[0]?.answers?.text || '').trim();
                                      if (fromAttempt) return fromAttempt;
                                      const fromHw = String(hw?.latestAnswerText || hw?.latest_answer_text || '').trim();
                                      return fromHw;
                                    })();
                                    const hasSubmissionDetails = submittedUrls.length > 0 || !!latestAnswer;
                                    if (!hasSubmissionDetails) {
                                      return <span style={{ fontSize: '11px', color: '#9ca3af', marginRight: 8 }}>No student submission yet</span>;
                                    }
                                    const expanded = !!expandedHwSubmissionById[hw.id];
                                    return (
                                      <div style={{ marginTop: 6, marginBottom: 6 }}>
                                        <button
                                          type="button"
                                          className="td-inline-btn"
                                          onClick={() => setExpandedHwSubmissionById((prev) => ({ ...prev, [hw.id]: !prev[hw.id] }))}
                                        >
                                          {expanded ? 'Hide student submission' : 'Show student submission'}
                                        </button>
                                        {expanded ? (
                                          <div style={{ marginTop: 6, display: 'grid', gap: 8, maxWidth: 260 }}>
                                            {submittedUrls.length ? (
                                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                {submittedUrls.map((url) => (
                                                  <img
                                                    key={url}
                                                    src={url}
                                                    alt="Student submission"
                                                    onClick={() => setLightboxUrl(url)}
                                                    title="Student submission — click to expand"
                                                    style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in', border: '2px solid #22c55e' }}
                                                  />
                                                ))}
                                              </div>
                                            ) : null}
                                            {latestAnswer ? (
                                              <div style={{ fontSize: '11px', color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', whiteSpace: 'pre-wrap' }}>
                                                {latestAnswer}
                                              </div>
                                            ) : null}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })()}
                                  {isGradeOpen ? (
                                    <div style={{ marginTop: 8, padding: '8px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, display: 'grid', gap: 6 }}>
                                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#78350f' }}>Grade Assignment</div>
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          value={gradeValue}
                                          onChange={(e) => setGradeValue(e.target.value)}
                                          placeholder="Score (0-100)"
                                          style={{ flex: 1, padding: '6px 8px', fontSize: '11px', borderRadius: 4, border: '1px solid #d4af37' }}
                                        />
                                      </div>
                                      <textarea
                                        value={gradeFeedback}
                                        onChange={(e) => setGradeFeedback(e.target.value)}
                                        placeholder="Feedback for student"
                                        style={{ padding: '6px 8px', fontSize: '11px', borderRadius: 4, border: '1px solid #d4af37', minHeight: 50, resize: 'vertical' }}
                                      />
                                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (!gradeValue && !gradeFeedback) {
                                              alert('Please enter a grade or feedback');
                                              return;
                                            }
                                            setBusy(`grade-${hw.id}`);
                                            try {
                                              await gradeTeacherHomework(hw.id, {
                                                status: 'graded',
                                                grade: gradeValue ? parseInt(gradeValue, 10) : null,
                                                feedback: gradeFeedback,
                                              });
                                              setGradeSubmittedById((prev) => ({ ...prev, [hw.id]: true }));
                                              setGradeValue('');
                                              setGradeFeedback('');
                                              setExpandedGradeById((prev) => ({ ...prev, [hw.id]: false }));
                                              await loadHomeworkPanel(selectedStudentId);
                                            } catch (err) {
                                              console.error(err);
                                              alert(String(err?.message || 'Error grading homework'));
                                            } finally {
                                              setBusy('');
                                            }
                                          }}
                                          disabled={busy === `grade-${hw.id}`}
                                          style={{ padding: '4px 8px', fontSize: '11px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                        >
                                          {busy === `grade-${hw.id}` ? 'Submitting...' : 'Submit'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setExpandedGradeById((prev) => ({ ...prev, [hw.id]: false }))}
                                          style={{ padding: '4px 8px', fontSize: '11px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                  {(() => {
                                    const isLatestHomework = classScopedSelectedHomework.length > 0 && classScopedSelectedHomework[0]?.id === hw.id;
                                    const hasGrade = hw.grade !== null && hw.grade !== undefined;
                                    const hasFeedback = !!hw.feedback;
                                    const isSubmitted = hasGrade || hasFeedback;
                                    return (
                                      <>
                                        {isSubmitted ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                              ✓ Submitted
                                            </span>
                                            {isLatestHomework && (
                                              <button
                                                type="button"
                                                className="td-inline-btn"
                                                onClick={() => {
                                                  const opening = !isGradeOpen;
                                                  setExpandedGradeById((prev) => ({ ...prev, [hw.id]: opening }));
                                                  if (opening) {
                                                    setGradeValue(hw.grade !== null && hw.grade !== undefined ? String(hw.grade) : '');
                                                    setGradeFeedback(String(hw.feedback || ''));
                                                  }
                                                }}
                                              >
                                                {isGradeOpen ? 'Cancel Edit' : 'Edit'}
                                              </button>
                                            )}
                                          </div>
                                        ) : canGrade ? (
                                          <button
                                            type="button"
                                            className="td-inline-btn"
                                            onClick={() => {
                                              const opening = !isGradeOpen;
                                              setExpandedGradeById((prev) => ({ ...prev, [hw.id]: opening }));
                                              if (opening) {
                                                setGradeValue(hw.grade !== null && hw.grade !== undefined ? String(hw.grade) : '');
                                                setGradeFeedback(String(hw.feedback || ''));
                                              }
                                            }}
                                          >
                                            {isGradeOpen ? 'Hide Grade' : 'Grade'}
                                          </button>
                                        ) : (
                                          <span className="td-hw-done">✓</span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </>
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="td-empty">
                    {homeworkStatusFilter === 'submitted'
                      ? 'No submitted homework in this panel.'
                      : homeworkStatusFilter === 'not-submitted'
                        ? 'No not-submitted homework in this panel.'
                        : homeworkStatusFilter === 'overdue'
                          ? 'No overdue homework in this panel.'
                          : 'No homework in this panel.'}
                  </p>
                )
              ) : (!panelLoading.homework ? <p className="td-empty">No homework assigned yet.</p> : null)}
            </article>
            </div>

            {/* ── Test Attempt History ── */}
            <article className="td-card td-card-wide td-card-framed">
              <h3>Test Attempt History</h3>
              <div className="td-analytics-header">
                <p>{selectedStudentId ? `📊 All test attempts for ${selectedStudentName}` : 'Select a student to view test history.'}</p>
                {classScopedSelectedTestAttempts.length > 0 && (
                  <button
                    type="button"
                    className="td-export-btn"
                    onClick={() => exportCSV(
                      `tests-${selectedStudentName}-${new Date().toISOString().slice(0,10)}.csv`,
                      ['Test', 'Subject', 'Started', 'Submitted', 'Score', 'Status'],
                      classScopedSelectedTestAttempts.map((a) => [a.testTitle, a.subject, a.startedAt || '', a.submittedAt || '', a.score !== null ? `${a.score}${a.maxScore ? `/${a.maxScore}` : ''}` : '—', a.status])
                    )}
                  >
                    ↓ Export CSV
                  </button>
                )}
              </div>
              {panelError.testAttempts ? <p className="td-empty">{panelError.testAttempts}</p> : null}
              {classScopedSelectedTestAttempts.length > 0 ? (
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
                      {classScopedSelectedTestAttempts.map((a) => (
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

        {/* ══════════ STUDENT PROGRESS SECTION ══════════ */}
        {activeSection === 'progress' && (
          <section className="td-progress-layout">
            <article className="td-card td-card-framed td-progress-student-card">
              <h3>Students</h3>
              <p>Select a student to see their full progress report — every subject, just like they see it.</p>
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
              {panelError.students ? <p className="td-empty">{panelError.students}</p> : null}
              <div className="td-student-list">
                {pagedStudents.map((s) => (
                  <button
                    key={s.id}
                    className={selectedStudentId === s.id ? 'active' : ''}
                    onClick={() => setSelectedStudentId(s.id)}
                  >
                    <div>
                      <strong>{s.name || 'Student'}</strong>
                      <span>{s.className || 'Class'}</span>
                    </div>
                  </button>
                ))}
                {!panelLoading.students && !classScopedStudents.length ? <p className="td-empty">No students available yet for this class.</p> : null}
              </div>
              {classScopedStudents.length > STUDENTS_PAGE_SIZE ? (
                <div className="td-student-pager">
                  <button
                    type="button"
                    className="td-inline-btn"
                    disabled={clampedStudentPage === 0}
                    onClick={() => setStudentPage((p) => Math.max(0, p - 1))}
                  >
                    ← Previous
                  </button>
                  <span className="td-student-pager-label">Page {clampedStudentPage + 1} of {studentPageCount}</span>
                  <button
                    type="button"
                    className="td-inline-btn"
                    disabled={clampedStudentPage >= studentPageCount - 1}
                    onClick={() => setStudentPage((p) => Math.min(studentPageCount - 1, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              ) : null}
            </article>

            <article className="td-card td-card-framed td-progress-page-card">
              {selectedStudentId ? (
                <StudentProgress
                  studentId={selectedStudentId}
                  greetingName={selectedStudentName}
                  fetchFn={getTeacherStudentLearningScore}
                />
              ) : (
                <p className="td-empty">Select a student on the left to see their full progress report.</p>
              )}
            </article>
          </section>
        )}
      </div>

      {/* Lightbox — full-screen image viewer */}
      {lightboxUrl ? (
        <div
          onClick={() => setLightboxUrl('')}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out'
          }}
        >
          {canPrevLightbox ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); moveLightbox(-1); }}
              style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', borderRadius: '50%', width: 44, height: 44, lineHeight: '44px', textAlign: 'center' }}
              aria-label="Previous image"
            >
              ‹
            </button>
          ) : null}
          <img
            src={lightboxUrl}
            alt="Full view"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
          />
          {canNextLightbox ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); moveLightbox(1); }}
              style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', borderRadius: '50%', width: 44, height: 44, lineHeight: '44px', textAlign: 'center' }}
              aria-label="Next image"
            >
              ›
            </button>
          ) : null}
          <button
            onClick={() => setLightboxUrl('')}
            style={{ position: 'absolute', top: 18, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', borderRadius: '50%', width: 44, height: 44, lineHeight: '44px', textAlign: 'center' }}
          >✕</button>
        </div>
      ) : null}
    </div>
  );
}

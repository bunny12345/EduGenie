import React, { useEffect, useMemo, useState } from 'react';
import {
  createCalendarEvent,
  earnReward,
  getCalendar,
  getChatHistory,
  getDashboard,
  getHomework,
  getLearningTimeline,
  getStudent,
  getLibrary,
  getLibraryResource,
  getProgress,
  getRewards,
  getSettings,
  getTestAttempt,
  getTests,
  listCurriculumLessons,
  recordProgress,
  saveSettings,
  sendChat,
  startTest,
  submitHomework,
  generateLocalTtsAudio,
  translateReadAloud,
  uploadHomeworkImage,
  submitTestAttempt
} from '../api';

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function fmtDate(value) {
  if (!value) return 'TBD';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getScore(row) {
  const n = Number(row?.score ?? row?.metric_value ?? row?.value ?? row?.details?.score ?? row?.details?.value);
  return Number.isFinite(n) ? n : null;
}

function buildProgressSummary(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const bySubject = new Map();
  safeRows.forEach((r) => {
    const s = r?.subject || r?.metric_key || 'General';
    const sc = getScore(r);
    if (sc === null) return;
    const prev = bySubject.get(s) || [];
    prev.push(sc);
    bySubject.set(s, prev);
  });

  return Array.from(bySubject.entries()).slice(0, 4).map(([subject, arr]) => {
    const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    return { subject, score: avg };
  });
}

function buildTrendPoints(rows) {
  return (Array.isArray(rows) ? rows : []).map(getScore).filter((n) => n !== null).slice(-7);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateInputValue(value) {
  const d = parseDate(value);
  if (!d) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function asUrlList(value, fallbackSingle) {
  const fromList = Array.isArray(value) ? value : [];
  const list = fromList
    .filter((u) => typeof u === 'string' && u.trim())
    .map((u) => String(u).trim())
    .filter((u) => !u.startsWith('blob:'));
  if (list.length) return list;
  if (typeof fallbackSingle === 'string' && fallbackSingle.trim() && !fallbackSingle.trim().startsWith('blob:')) return [fallbackSingle.trim()];
  return [];
}

async function fileToCompressedDataUrl(file) {
  if (!file) throw new Error('No file selected');

  const readDataUrl = () => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image'));
    reader.readAsDataURL(file);
  });

  // Small files can be sent as-is.
  if (file.size <= 1.8 * 1024 * 1024) {
    return readDataUrl();
  }

  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      resolve(el);
    };
    el.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e || new Error('Unable to load image'));
    };
    el.src = url;
  });

  const source = img;
  const maxSide = 1440;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const targetW = Math.max(1, Math.round(source.width * scale));
  const targetH = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return readDataUrl();
  ctx.drawImage(source, 0, 0, targetW, targetH);

  // Use JPEG compression to keep payload reasonable for local inference.
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

function getHomeworkState(h) {
  const due = parseDate(h?.dueAt || h?.due_at || h?.createdAt || h?.created_at);
  const rawStatus = String(h?.status || '').toLowerCase();
  const resubmitted = rawStatus === 'resubmitted' || String(h?.dueStatus || '').toLowerCase() === 'resubmitted' || String(h?.remark || '').toLowerCase() === 'resubmitted';
  const submitted = rawStatus === 'submitted' || rawStatus === 'graded' || rawStatus === 'resubmitted';
  if (submitted) {
    const submittedAt = parseDate(h?.lastAttemptAt || h?.submittedAt || h?.updatedAt || h?.updated_at || h?.createdAt || h?.created_at);
    const daysSinceSubmitted = submittedAt ? Math.floor((Date.now() - submittedAt.getTime()) / (24 * 60 * 60 * 1000)) : 0;
    return {
      submitted: true,
      resubmitted,
      overdue: false,
      expired: false,
      hide: false,
      archived: daysSinceSubmitted >= 2,
      history: daysSinceSubmitted >= 2,
      label: resubmitted ? 'Resubmitted' : 'Submitted',
      color: resubmitted ? '#2563eb' : '#16a34a',
      bg: resubmitted ? '#dbeafe' : '#dcfce7'
    };
  }
  if (!due) return { submitted: false, resubmitted: false, overdue: false, expired: false, hide: false, label: 'Pending', color: '#6b7280', bg: '#f3f4f6' };
  const daysSinceDue = Math.floor((Date.now() - due.getTime()) / (24 * 60 * 60 * 1000));
  const overdue = daysSinceDue >= 0;
  const expired = daysSinceDue > 3;
  if (expired) return { submitted: false, resubmitted: false, overdue: true, expired: true, hide: true, history: true, label: `Expired ${daysSinceDue}d overdue`, color: '#b91c1c', bg: '#fee2e2' };
  if (overdue) return { submitted: false, resubmitted: false, overdue: true, expired: false, hide: false, label: `Overdue ${daysSinceDue}d`, color: '#b45309', bg: '#ffedd5' };
  return { submitted: false, resubmitted: false, overdue: false, expired: false, hide: false, label: 'Pending', color: '#6b7280', bg: '#f3f4f6' };
}

function Sparkline({ values }) {
  const safeValues = safeArray(values);
  if (!safeValues.length) return null;
  const width = 180;
  const height = 64;
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const span = Math.max(max - min, 1);
  const pts = safeValues.map((v, i) => {
    const x = (i / Math.max(safeValues.length - 1, 1)) * (width - 10) + 5;
    const y = height - 6 - ((v - min) / span) * (height - 16);
    return `${x},${y}`;
  });
  const lastPoint = pts[pts.length - 1] || '0,0';
  const last = String(lastPoint).split(',');

  return (
    <svg className="eg-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline className="eg-spark-track" points={`5,${height - 6} ${width - 5},${height - 6}`} />
      <polyline className="eg-spark-line" points={pts.join(' ')} pathLength="1" />
      <circle className="eg-spark-dot" cx={last[0]} cy={last[1]} r="3" />
    </svg>
  );
}

const DEFAULT_SUBJECTS = ['Science', 'Mathematics', 'Social'];

export default function StudentDashboard({ studentId = 'test', onLogout }) {
  // Navigation state
  const [activeView, setActiveView] = useState('home'); // 'home' or subject name
  const [activeSidebarTab, setActiveSidebarTab] = useState('Home');

  const [loading, setLoading] = useState(true);
  const [panelLoading, setPanelLoading] = useState({
    dashboard: false,
    homework: false,
    progress: false,
    calendar: false,
    rewards: false,
    tests: false,
    library: false,
    settings: false,
    chat: false,
    timeline: false
  });
  const [panelError, setPanelError] = useState({
    dashboard: '',
    homework: '',
    progress: '',
    calendar: '',
    rewards: '',
    tests: '',
    library: '',
    settings: '',
    chat: '',
    timeline: ''
  });

  const [dashboard, setDashboard] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [homework, setHomework] = useState([]);
  const [progress, setProgress] = useState([]);
  const [events, setEvents] = useState([]);
  const [rewards, setRewards] = useState({ coins: 0, badges: [] });
  const [tests, setTests] = useState([]);
  const [library, setLibrary] = useState([]);
  const [learningTimeline, setLearningTimeline] = useState([]);
  const [settings, setSettings] = useState({ prefs: {} });
  const [chatHistory, setChatHistory] = useState([]);
  const [tutorSubject, setTutorSubject] = useState('Science');
  const [tutorLessons, setTutorLessons] = useState([]);
  const [selectedTutorLessonId, setSelectedTutorLessonId] = useState('');
  const [selectedTutorLesson, setSelectedTutorLesson] = useState(null);
  const [tutorLoadingLessons, setTutorLoadingLessons] = useState(false);

  const [startingTestId, setStartingTestId] = useState('');
  const [startingHomeworkId, setStartingHomeworkId] = useState('');
  const [lastSubmitHomeworkId, setLastSubmitHomeworkId] = useState('');
  const [homeworkAttachmentUrls, setHomeworkAttachmentUrls] = useState({});
  const [homeworkAnswerTextById, setHomeworkAnswerTextById] = useState({});
  const [homeworkUploadingById, setHomeworkUploadingById] = useState({});
  const [homeworkPreviewById, setHomeworkPreviewById] = useState({}); // local object URLs for instant preview
  const [homeworkDropActiveById, setHomeworkDropActiveById] = useState({});
  const [editingResubmitById, setEditingResubmitById] = useState({});
  const [expandedTeacherInfoById, setExpandedTeacherInfoById] = useState({});
  const [expandedSubmissionDetailsById, setExpandedSubmissionDetailsById] = useState({});
  const [expandedFeedbackById, setExpandedFeedbackById] = useState({});
  const [homeworkStatusFilter, setHomeworkStatusFilter] = useState('all');
  const [lightboxUrl, setLightboxUrl] = useState(''); // full-screen image viewer
  const [imageReorderingHomeworkId, setImageReorderingHomeworkId] = useState(null);
  const [draggedImageIndex, setDraggedImageIndex] = useState(null);
  const [dragOverImageIndex, setDragOverImageIndex] = useState(null);
  const [showHomeworkHistory, setShowHomeworkHistory] = useState(false);
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyCalMonth, setHistoryCalMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [historyToDate, setHistoryToDate] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatFollowups, setChatFollowups] = useState([]);
  const [chatImages, setChatImages] = useState([]);
  const [chatImageError, setChatImageError] = useState('');
  const [chatReadAloudId, setChatReadAloudId] = useState('');
  const [chatReadAloudSupported, setChatReadAloudSupported] = useState(false);
  const [chatReadAloudLanguage, setChatReadAloudLanguage] = useState('en-US');
  const [chatReadAloudSpeed, setChatReadAloudSpeed] = useState(1);
  const [chatVoicePlayId, setChatVoicePlayId] = useState('');
  const [chatVoiceLoadingId, setChatVoiceLoadingId] = useState('');
  const welcomedLessonsRef = React.useRef(new Set());
  const readAloudTranslationCacheRef = React.useRef({});
  const localVoiceCacheRef = React.useRef({});
  const localAudioRef = React.useRef(null);
  const localAudioUrlRef = React.useRef('');
  const currentReadAloudRef = React.useRef({ messageId: '', text: '', languageCode: '' });
  const speechSessionRef = React.useRef(0);
  const speechVoicesRef = React.useRef([]);
  const chatRequestAbortRef = React.useRef(null);
  const chatEndRef = React.useRef(null);
  const [testResult, setTestResult] = useState(null);
  const [homeworkInfo, setHomeworkInfo] = useState('');
  const [selectedResource, setSelectedResource] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Calendar event creation
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [calendarAdding, setCalendarAdding] = useState(false);
  const [calendarNote, setCalendarNote] = useState('');

  // Rewards earn
  const [rewardsNote, setRewardsNote] = useState('');
  const [rewardsEarning, setRewardsEarning] = useState(false);

  const setPanelLoadingKey = (key, value) => {
    setPanelLoading((prev) => ({ ...prev, [key]: value }));
  };

  const setPanelErrorKey = (key, value) => {
    setPanelError((prev) => ({ ...prev, [key]: value }));
  };

  // Computed values for subject grouping
  const homeworkBySubject = useMemo(() => {
    const grouped = new Map();
    homework.forEach((h) => {
      const subj = h?.subject || 'General';
      if (!grouped.has(subj)) grouped.set(subj, []);
      grouped.get(subj).push(h);
    });
    return grouped;
  }, [homework]);

  const latestAssignedHomeworkId = useMemo(() => {
    const sorted = safeArray(homework)
      .slice()
      .sort((a, b) => {
        const aTs = parseDate(a?.startAt || a?.createdAt || a?.created_at || a?.dueAt || a?.due_at)?.getTime() || 0;
        const bTs = parseDate(b?.startAt || b?.createdAt || b?.created_at || b?.dueAt || b?.due_at)?.getTime() || 0;
        return bTs - aTs;
      });
    return String(sorted[0]?.id || sorted[0]?.homeworkId || sorted[0]?.homework_id || '');
  }, [homework]);

  const latestSubmittedHomeworkId = useMemo(() => {
    const sortedSubmitted = safeArray(homework)
      .filter((h) => getHomeworkState(h).submitted && ((h?.grade !== null && h?.grade !== undefined) || h?.feedback))
      .slice()
      .sort((a, b) => {
        const aTs = parseDate(a?.lastAttemptAt || a?.submittedAt || a?.submitted_at || a?.updatedAt || a?.updated_at || a?.createdAt || a?.created_at)?.getTime() || 0;
        const bTs = parseDate(b?.lastAttemptAt || b?.submittedAt || b?.submitted_at || b?.updatedAt || b?.updated_at || b?.createdAt || b?.created_at)?.getTime() || 0;
        return bTs - aTs;
      });
    return String(sortedSubmitted[0]?.id || sortedSubmitted[0]?.homeworkId || sortedSubmitted[0]?.homework_id || '');
  }, [homework]);

  const lightboxImages = useMemo(() => {
    if (!lightboxUrl) return [];

    const groups = safeArray(homework).map((h) => {
      const homeworkId = String(h?.id || h?.homeworkId || h?.homework_id || '');
      const teacherImages = asUrlList(h?.attachmentUrls || h?.attachment_urls, h?.attachmentUrl || h?.attachment_url);
      const submittedImages = asUrlList(h?.latestAttachmentUrls || h?.latest_attachment_urls, h?.latestAttachmentUrl || h?.latest_attachment_url);
      const localUploadImages = safeArray(homeworkAttachmentUrls?.[homeworkId]).filter((u) => typeof u === 'string' && u.trim());
      const previewImages = safeArray(homeworkPreviewById?.[homeworkId]).filter((u) => typeof u === 'string' && u.trim());
      return Array.from(new Set([...teacherImages, ...submittedImages, ...localUploadImages, ...previewImages]));
    }).filter((group) => group.length > 0);

    const matchedGroup = groups.find((group) => group.includes(lightboxUrl));
    if (matchedGroup) return matchedGroup;

    return [lightboxUrl];
  }, [lightboxUrl, homework, homeworkAttachmentUrls, homeworkPreviewById]);

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

  const testsBySubject = useMemo(() => {
    const grouped = new Map();
    tests.forEach((t) => {
      const subj = t?.subject || 'General';
      if (!grouped.has(subj)) grouped.set(subj, []);
      grouped.get(subj).push(t);
    });
    return grouped;
  }, [tests]);

  const progressBySubject = useMemo(() => {
    const summary = buildProgressSummary(progress);
    const grouped = new Map();
    summary.forEach((p) => {
      grouped.set(p.subject, p.score);
    });
    return grouped;
  }, [progress]);

  useEffect(() => {
    setHomeworkStatusFilter('all');
  }, [activeView]);

  useEffect(() => {
    if (!homework.length) {
      setExpandedTeacherInfoById({});
      return;
    }
    if (!latestAssignedHomeworkId) return;
    setExpandedTeacherInfoById((prev) => {
      if (Object.keys(prev || {}).length === 1 && prev[latestAssignedHomeworkId]) return prev;
      return { [latestAssignedHomeworkId]: true };
    });
  }, [homework, latestAssignedHomeworkId]);

  useEffect(() => {
    if (!homework.length || !latestSubmittedHomeworkId) {
      setExpandedFeedbackById({});
      return;
    }
    setExpandedFeedbackById((prev) => {
      if (Object.keys(prev || {}).length === 1 && prev[latestSubmittedHomeworkId]) return prev;
      return { [latestSubmittedHomeworkId]: true };
    });
  }, [homework, latestSubmittedHomeworkId]);

  // Get unique subject list
  const subjects = useMemo(() => {
    const seen = new Set(DEFAULT_SUBJECTS);
    homeworkBySubject.forEach((_, subj) => seen.add(subj));
    testsBySubject.forEach((_, subj) => seen.add(subj));
    progressBySubject.forEach((_, subj) => seen.add(subj));
    return Array.from(seen).sort();
  }, [homeworkBySubject, testsBySubject, progressBySubject]);

  // Calculate notification count for each subject
  const getSubjectNotifications = (subject) => {
    let count = 0;
    homeworkBySubject.get(subject)?.forEach((h) => {
      const state = getHomeworkState(h);
      if (!state.submitted) count++;
    });
    testsBySubject.get(subject)?.forEach(() => count++);
    return count;
  };

  async function loadDashboardPanel() {
    setPanelLoadingKey('dashboard', true);
    setPanelErrorKey('dashboard', '');
    try {
      const res = await getDashboard(studentId);
      setDashboard(res || null);
    } catch (e) {
      setPanelErrorKey('dashboard', e?.message || 'Unable to load dashboard.');
      setDashboard(null);
    } finally {
      setPanelLoadingKey('dashboard', false);
    }
  }

  async function loadStudentProfilePanel() {
    try {
      const res = await getStudent(studentId);
      setStudentProfile(res?.student || null);
    } catch {
      setStudentProfile(null);
    }
  }

  async function loadTutorLessonsPanel(subjectOverride) {
    const className = String(
      studentProfile?.className
      || studentProfile?.class_name
      || dashboard?.student?.className
      || dashboard?.student?.class_name
      || ''
    ).trim();
    const subject = String(subjectOverride || tutorSubject || '').trim();
    if (!className) {
      setTutorLessons([]);
      setSelectedTutorLesson(null);
      return [];
    }

    setTutorLoadingLessons(true);
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
    } finally {
      setTutorLoadingLessons(false);
    }
  }

  async function loadLearningTimelinePanel() {
    setPanelLoadingKey('timeline', true);
    setPanelErrorKey('timeline', '');
    try {
      const res = await getLearningTimeline(studentId, 8);
      const items = Array.isArray(res?.timeline) ? res.timeline : [];
      setLearningTimeline(items);
    } catch (e) {
      setPanelErrorKey('timeline', e?.message || 'Unable to load learning timeline.');
      setLearningTimeline([]);
    } finally {
      setPanelLoadingKey('timeline', false);
    }
  }

  async function loadHomeworkPanel() {
    setPanelLoadingKey('homework', true);
    setPanelErrorKey('homework', '');
    try {
      const res = await getHomework(studentId);
      const list = safeArray(res?.homework)
        .slice()
        .sort((a, b) => {
          const aTs = parseDate(a?.startAt || a?.createdAt || a?.created_at || a?.dueAt || a?.due_at)?.getTime() || 0;
          const bTs = parseDate(b?.startAt || b?.createdAt || b?.created_at || b?.dueAt || b?.due_at)?.getTime() || 0;
          return bTs - aTs;
        });
      setHomework(list);
      setHomeworkAttachmentUrls((prev) => {
        const next = { ...prev };
        list.forEach((h) => {
          const id = String(h?.id || h?.homeworkId || h?.homework_id || '');
          if (!id || next[id]) return;
          const urls = asUrlList(h?.latestAttachmentUrls || h?.latest_attachment_urls, h?.latestAttachmentUrl || h?.latest_attachment_url);
          if (urls.length) next[id] = urls;
        });
        return next;
      });
      setHomeworkAnswerTextById((prev) => {
        const next = { ...prev };
        list.forEach((h) => {
          const id = String(h?.id || h?.homeworkId || h?.homework_id || '');
          if (!id || next[id]) return;
          const text = String(h?.latestAnswerText || h?.latest_answer_text || '').trim();
          if (text) next[id] = text;
        });
        return next;
      });
    } catch (e) {
      setPanelErrorKey('homework', e?.message || 'Unable to load homework.');
      setHomework([]);
    } finally {
      setPanelLoadingKey('homework', false);
    }
  }

  async function loadProgressPanel() {
    setPanelLoadingKey('progress', true);
    setPanelErrorKey('progress', '');
    try {
      const res = await getProgress(studentId);
      setProgress(safeArray(res?.subjectScores));
    } catch (e) {
      setPanelErrorKey('progress', e?.message || 'Unable to load progress.');
      setProgress([]);
    } finally {
      setPanelLoadingKey('progress', false);
    }
  }

  async function loadCalendarPanel() {
    setPanelLoadingKey('calendar', true);
    setPanelErrorKey('calendar', '');
    try {
      const res = await getCalendar(studentId);
      setEvents(safeArray(res?.events));
    } catch (e) {
      setPanelErrorKey('calendar', e?.message || 'Unable to load calendar.');
      setEvents([]);
    } finally {
      setPanelLoadingKey('calendar', false);
    }
  }

  async function loadRewardsPanel() {
    setPanelLoadingKey('rewards', true);
    setPanelErrorKey('rewards', '');
    try {
      const res = await getRewards(studentId);
      setRewards(res || { coins: 0, badges: [] });
    } catch (e) {
      setPanelErrorKey('rewards', e?.message || 'Unable to load rewards.');
      setRewards({ coins: 0, badges: [] });
    } finally {
      setPanelLoadingKey('rewards', false);
    }
  }

  async function loadTestsPanel() {
    setPanelLoadingKey('tests', true);
    setPanelErrorKey('tests', '');
    try {
      const res = await getTests(studentId, 'upcoming');
      setTests(safeArray(res?.tests));
    } catch (e) {
      setPanelErrorKey('tests', e?.message || 'Unable to load tests.');
      setTests([]);
    } finally {
      setPanelLoadingKey('tests', false);
    }
  }

  async function loadLibraryPanel() {
    setPanelLoadingKey('library', true);
    setPanelErrorKey('library', '');
    try {
      const res = await getLibrary('', '', 1);
      setLibrary(safeArray(res?.resources));
    } catch (e) {
      setPanelErrorKey('library', e?.message || 'Unable to load library.');
      setLibrary([]);
    } finally {
      setPanelLoadingKey('library', false);
    }
  }

  async function loadSettingsPanel() {
    setPanelLoadingKey('settings', true);
    setPanelErrorKey('settings', '');
    try {
      const res = await getSettings(studentId);
      setSettings(res || { prefs: {} });
    } catch (e) {
      setPanelErrorKey('settings', e?.message || 'Unable to load settings.');
      setSettings({ prefs: {} });
    } finally {
      setPanelLoadingKey('settings', false);
    }
  }

  function getCurrentTutorConversationId() {
    const normalizedSubject = String(tutorSubject || 'General')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const lessonPart = String(selectedTutorLesson?.id || '').trim();
    return lessonPart
      ? `conv-${studentId}:subject-${normalizedSubject}:lesson-${lessonPart}`
      : `conv-${studentId}:subject-${normalizedSubject}:all-lessons`;
  }

  async function loadChatPanel(conversationIdOverride) {
    setPanelLoadingKey('chat', true);
    setPanelErrorKey('chat', '');
    try {
      const fallbackConversationId = getCurrentTutorConversationId();
      const conversationId = String(conversationIdOverride || fallbackConversationId || `conv-${studentId}`);
      const res = await getChatHistory(studentId, conversationId);
      setChatHistory(safeArray(res?.messages));
      setChatFollowups([]);
    } catch (e) {
      setPanelErrorKey('chat', e?.message || 'Unable to load chat history.');
      setChatHistory([]);
    } finally {
      setPanelLoadingKey('chat', false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadAll() {
      setLoading(true);
      await Promise.all([
        loadStudentProfilePanel(),
        loadDashboardPanel(),
        loadHomeworkPanel(),
        loadProgressPanel(),
        loadCalendarPanel(),
        loadRewardsPanel(),
        loadTestsPanel(),
        loadLibraryPanel(),
        loadLearningTimelinePanel(),
        loadSettingsPanel(),
        loadChatPanel()
      ]);
      if (active) setLoading(false);
    }
    loadAll();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    loadChatPanel(getCurrentTutorConversationId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, tutorSubject, selectedTutorLesson?.id]);

  useEffect(() => {
    if (subjects.length && !subjects.includes(tutorSubject)) {
      setTutorSubject(subjects[0] || 'Science');
    }
  }, [subjects, tutorSubject]);

  useEffect(() => {
    if (studentProfile?.className || studentProfile?.class_name || dashboard?.student?.className || dashboard?.student?.class_name) {
      loadTutorLessonsPanel(tutorSubject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentProfile, dashboard, tutorSubject]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadDashboardPanel();
      loadHomeworkPanel();
      loadTestsPanel();
    }, 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    welcomedLessonsRef.current = new Set();
  }, [studentId]);

  useEffect(() => {
    const supported = typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && typeof window.SpeechSynthesisUtterance !== 'undefined';
    setChatReadAloudSupported(Boolean(supported));

    if (supported) {
      const synth = window.speechSynthesis;
      const loadVoices = () => {
        speechVoicesRef.current = synth.getVoices() || [];
      };
      loadVoices();
      synth.addEventListener('voiceschanged', loadVoices);

      return () => {
        synth.removeEventListener('voiceschanged', loadVoices);
        synth.cancel();
      };
    }

    return () => {
      if (supported) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (chatRequestAbortRef.current) {
        chatRequestAbortRef.current.abort();
        chatRequestAbortRef.current = null;
      }
      if (localAudioRef.current) {
        localAudioRef.current.pause();
        localAudioRef.current = null;
      }
      if (localAudioUrlRef.current) {
        URL.revokeObjectURL(localAudioUrlRef.current);
        localAudioUrlRef.current = '';
      }
    };
  }, []);

  const greetingName = dashboard?.greetingName || 'Student';
  const streakDays = Number(dashboard?.streak?.days || 0);
  const coins = Number(rewards?.coins || 0);
  const badges = Array.isArray(rewards?.badges) ? rewards.badges.length : 0;

  const eventsTop = events.slice(0, 3);
  const testsTop = tests.slice(0, 3);
  const libraryTop = library.slice(0, 4);
  const chatHistoryTop = chatHistory.slice(-3);
  const recentLessonTimeline = useMemo(() => safeArray(learningTimeline).filter((item) => item?.scopeType === 'lesson').slice(0, 4), [learningTimeline]);
  const recentSubjectTimeline = useMemo(() => safeArray(learningTimeline).filter((item) => item?.scopeType === 'subject').slice(0, 3), [learningTimeline]);
  const announcementsTop = safeArray(dashboard?.announcements).slice(0, 4);
  const currentTheme = settings?.prefs?.theme || settings?.theme || 'Unknown';
  const currentLanguage = settings?.prefs?.language || settings?.language || 'Unknown';
  const progressSummary = useMemo(() => buildProgressSummary(progress), [progress]);
  const trend = useMemo(() => buildTrendPoints(progress), [progress]);
  const tutorQuickPrompts = useMemo(() => {
    const lessonLabel = String(selectedTutorLesson?.title || '').trim();
    if (lessonLabel) {
      return [
        `Start ${lessonLabel} from basics`,
        `Give me one real-life example from ${lessonLabel}`,
        `Teach ${lessonLabel} in 3 simple steps`,
        `Ask me one easy question from ${lessonLabel}`,
      ];
    }
    return [
      'Explain this lesson in simple words',
      'Give me one real-life example',
      'Teach me step by step',
      'Ask me one easy quiz question',
    ];
  }, [selectedTutorLesson]);
  const weeklyGoalPct = 75;
  const sidebarItems = [
    ['🏠', 'Home'],
    ['🤖', 'AI Tutor'],
    ['📝', 'Homework'],
    ['🧪', 'Mock Tests'],
    ['📈', 'Progress'],
    ['📅', 'Calendar'],
    ['🏅', 'Rewards'],
    ['📚', 'Library'],
    ['⚙️', 'Settings']
  ];
  const contentViewKey = activeSidebarTab === 'AI Tutor' ? 'ai-tutor-view' : (activeView === 'home' ? 'home-view' : `subject-view-${activeView}`);

  function onSidebarNavClick(item) {
    setActiveSidebarTab(item);
    if (item === 'Home' || item === 'AI Tutor') {
      setActiveView('home');
      return;
    }
    if (item === 'Homework') {
      const firstSubject = safeArray(subjects)[0];
      setActiveView(firstSubject || 'home');
      return;
    }
    setActiveView('home');
  }

  function getReadAloudText(raw) {
    return String(raw || '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/[•●▪]/g, ', ')
      .replace(/\s*\n+\s*/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toSpeechFriendlyText(raw) {
    return String(raw || '')
      .replace(/\b([xX])\s*=\s*/g, 'x equals ')
      .replace(/\b([yY])\s*=\s*/g, 'y equals ')
      .replace(/\b\+\b/g, ' plus ')
      .replace(/\b-\b/g, ' minus ')
      .replace(/\b\*\b/g, ' times ')
      .replace(/\//g, ' divided by ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitForSpeech(text) {
    const normalized = String(text || '').trim();
    if (!normalized) return [];
    const rough = normalized
      .split(/(?<=[.!?])\s+|(?<=;)\s+|\n+/)
      .map((part) => part.trim())
      .filter(Boolean);

    const chunks = [];
    rough.forEach((part) => {
      if (part.length <= 180) {
        chunks.push(part);
        return;
      }
      const words = part.split(/\s+/);
      let current = '';
      words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > 180 && current) {
          chunks.push(current);
          current = word;
        } else {
          current = candidate;
        }
      });
      if (current) chunks.push(current);
    });
    return chunks;
  }

  function pickBestVoice(voices, languageCode) {
    const list = Array.isArray(voices) ? voices : [];
    if (!list.length) return null;

    const langPrefix = String(languageCode || 'en-US').split('-')[0].toLowerCase();
    const sameLang = list.filter((voice) => String(voice?.lang || '').toLowerCase().startsWith(langPrefix));
    const pool = sameLang.length ? sameLang : list;

    const scoreVoice = (voice) => {
      const name = String(voice?.name || '').toLowerCase();
      let score = 0;
      if (name.includes('neural')) score += 40;
      if (name.includes('natural')) score += 28;
      if (name.includes('premium') || name.includes('enhanced')) score += 18;
      if (name.includes('google') || name.includes('microsoft') || name.includes('samantha') || name.includes('alex')) score += 10;
      if (voice?.localService) score += 6;
      if (/female|woman|zira|aria|siri/i.test(name)) score += 4;
      return score;
    };

    return pool.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || pool[0] || null;
  }

  function getReadLanguageLabel(code) {
    const value = String(code || 'en-US');
    const option = [
      { code: 'en-US', label: 'English' },
      { code: 'te-IN', label: 'Telugu' },
      { code: 'hi-IN', label: 'Hindi' },
      { code: 'ta-IN', label: 'Tamil' },
      { code: 'kn-IN', label: 'Kannada' },
    ].find((item) => item.code === value);
    return option?.label || value;
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

  async function restartCurrentBrowserReadAloud(nextSpeed) {
    const current = currentReadAloudRef.current;
    if (!chatReadAloudId || !current?.messageId || !current?.text || !current?.languageCode) return;

    const synth = window.speechSynthesis;
    speechSessionRef.current += 1;
    const sessionId = speechSessionRef.current;
    synth.cancel();
    setChatReadAloudId('');
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (speechSessionRef.current !== sessionId) return;
    setChatReadAloudId(current.messageId);
    await speakSegmentsSequentially({ id: sessionId, text: current.text, languageCode: current.languageCode, speed: nextSpeed });
    if (speechSessionRef.current === sessionId) {
      setChatReadAloudId('');
    }
  }

  useEffect(() => {
    if (localAudioRef.current) {
      localAudioRef.current.playbackRate = clampSpeed(chatReadAloudSpeed);
    }
    if (chatReadAloudId && currentReadAloudRef.current?.messageId) {
      restartCurrentBrowserReadAloud(chatReadAloudSpeed).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatReadAloudSpeed]);

  async function speakSegmentsSequentially({ id, text, languageCode, speed }) {
    const synth = window.speechSynthesis;
    const segments = splitForSpeech(toSpeechFriendlyText(text));
    if (!segments.length) return;

    const voices = speechVoicesRef.current.length ? speechVoicesRef.current : (synth.getVoices() || []);
    const preferredVoice = pickBestVoice(voices, languageCode);

    for (const segment of segments) {
      if (speechSessionRef.current !== Number(id)) break;
      await new Promise((resolve) => {
        const utterance = new window.SpeechSynthesisUtterance(segment);
        if (preferredVoice) {
          utterance.voice = preferredVoice;
          utterance.lang = preferredVoice.lang || languageCode || 'en-US';
        } else {
          utterance.lang = languageCode || 'en-US';
        }

        utterance.rate = clampSpeed(speed ?? chatReadAloudSpeed);
        utterance.pitch = 1.02;
        utterance.volume = 1;
        utterance.onend = () => resolve(true);
        utterance.onerror = () => resolve(true);
        synth.speak(utterance);
      });
    }
  }

  async function onToggleReadAloud(messageId, rawText) {
    if (!chatReadAloudSupported || typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    const id = String(messageId || '').trim();
    if (!id) return;

    if (chatReadAloudId === id) {
      speechSessionRef.current += 1;
      synth.cancel();
      currentReadAloudRef.current = { messageId: '', text: '', languageCode: '' };
      setChatReadAloudId('');
      return;
    }

    const text = getReadAloudText(rawText);
    if (!text) return;

    const selectedLanguage = String(chatReadAloudLanguage || 'en-US');
    const cacheKey = `${id}::${selectedLanguage}::${text.slice(0, 120)}`;

    let spokenText = text;
    if (!/^en(-|_|$)/i.test(selectedLanguage)) {
      const cached = readAloudTranslationCacheRef.current[cacheKey];
      if (cached) {
        spokenText = cached;
      } else {
        try {
          const translatedRes = await translateReadAloud(text, selectedLanguage, studentId);
          const translatedText = String(translatedRes?.text || '').trim();
          if (translatedText) {
            spokenText = translatedText;
            readAloudTranslationCacheRef.current[cacheKey] = translatedText;
          }
        } catch {
          // Fallback to original text if translation fails.
        }
      }
    }

    speechSessionRef.current += 1;
    const sessionId = speechSessionRef.current;
    synth.cancel();
    stopLocalVoicePlayback();
    currentReadAloudRef.current = { messageId: id, text: spokenText, languageCode: selectedLanguage };
    setChatReadAloudId(id);
    await speakSegmentsSequentially({ id: sessionId, text: spokenText, languageCode: selectedLanguage });
    if (speechSessionRef.current === sessionId) {
      currentReadAloudRef.current = { messageId: '', text: '', languageCode: '' };
      setChatReadAloudId('');
    }
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

  function base64ToBlob(base64, mimeType) {
    const raw = atob(String(base64 || ''));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
      bytes[i] = raw.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
  }

  async function onToggleLocalVoice(messageId, rawText) {
    const id = String(messageId || '').trim();
    if (!id) return;

    if (chatVoicePlayId === id) {
      stopLocalVoicePlayback();
      return;
    }

    const cleanText = getReadAloudText(rawText);
    if (!cleanText) return;

    setPanelErrorKey('chat', '');
    setChatVoiceLoadingId(id);
    try {
      // Avoid overlapping browser TTS and local MP3 playback.
      speechSessionRef.current += 1;
      if (typeof window !== 'undefined' && chatReadAloudSupported) {
        window.speechSynthesis.cancel();
      }
      currentReadAloudRef.current = { messageId: '', text: '', languageCode: '' };
      setChatReadAloudId('');

      const language = String(chatReadAloudLanguage || 'en-US');
      const cacheKey = `${id}::${language}::${cleanText.slice(0, 160)}`;

      let cached = localVoiceCacheRef.current[cacheKey];
      if (!cached) {
        const tts = await generateLocalTtsAudio(cleanText, language, studentId, undefined, chatReadAloudSpeed);
        const audioBase64 = String(tts?.audioBase64 || '').trim();
        if (!audioBase64) throw new Error('Local TTS returned empty audio.');
        cached = {
          audioBase64,
          mimeType: String(tts?.mimeType || 'audio/mpeg').trim() || 'audio/mpeg'
        };
        localVoiceCacheRef.current[cacheKey] = cached;
      }

      stopLocalVoicePlayback();

      const blob = base64ToBlob(cached.audioBase64, cached.mimeType);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.playbackRate = clampSpeed(chatReadAloudSpeed);
      audio.onended = () => {
        if (localAudioRef.current === audio) {
          stopLocalVoicePlayback();
        }
      };
      audio.onerror = () => {
        if (localAudioRef.current === audio) {
          stopLocalVoicePlayback();
        }
      };

      localAudioRef.current = audio;
      localAudioUrlRef.current = url;
      setChatVoicePlayId(id);
      await audio.play();
      if (localAudioRef.current === audio) {
        localAudioRef.current.playbackRate = clampSpeed(chatReadAloudSpeed);
      }
    } catch (e) {
      stopLocalVoicePlayback();
      setPanelErrorKey('chat', e?.message || 'Voice playback failed.');
    } finally {
      setChatVoiceLoadingId('');
    }
  }

  async function onResumeTimelineThread(thread) {
    if (!thread) return;
    const subject = String(thread?.subject || tutorSubject || 'Science').trim() || 'Science';
    const lessonId = String(thread?.lessonId || '').trim();
    const lessonTitle = String(thread?.lessonTitle || '').trim();

    setActiveSidebarTab('AI Tutor');
    setActiveView('home');
    setTutorSubject(subject);

    if (!lessonId) {
      setSelectedTutorLessonId('');
      setSelectedTutorLesson(null);
      return;
    }

    setSelectedTutorLessonId(lessonId);
    setSelectedTutorLesson({ id: lessonId, title: lessonTitle, subject });

    const lessons = await loadTutorLessonsPanel(subject);
    const matchedLesson = safeArray(lessons).find((lesson) => String(lesson?.id || '') === lessonId);
    if (matchedLesson) {
      setSelectedTutorLessonId(String(matchedLesson.id || ''));
      setSelectedTutorLesson(matchedLesson);
    }
  }

  async function onStartTest(testId) {
    if (!testId) return;
    setStartingTestId(testId);
    try {
      const started = await startTest(testId, studentId);
      const attemptId = started?.attemptId;
      if (attemptId) {
        const questionList = Array.isArray(started?.questions) ? started.questions : [];
        const generatedAnswers = {};
        questionList.forEach((q) => {
          if (q?.id !== undefined && q?.id !== null) generatedAnswers[q.id] = 0;
        });
        const submitRes = await submitTestAttempt(attemptId, studentId, generatedAnswers);
        const resultRes = await getTestAttempt(attemptId);
        const result = resultRes?.result || null;
        const score = result?.score ?? submitRes?.score ?? null;
        if (score !== null) {
          setTestResult({ score, feedback: result?.feedback || submitRes?.feedback || 'Submitted' });
          // Record progress for this test attempt silently
          const testItem = tests.find((t) => t.id === testId);
          recordProgress({
            studentId,
            subject: testItem?.subject || testItem?.title || 'Test',
            score: Number(score),
            source: 'test'
          }).catch(() => {});
        }
      }
      await loadTestsPanel();
      await loadProgressPanel();
    } catch (e) {
      setPanelErrorKey('tests', e?.message || 'Test flow failed.');
    } finally {
      setStartingTestId('');
    }
  }

  async function onSubmitHomework(hwId, flags = {}) {
    const submitted = !!flags?.submitted;
    const expired = !!flags?.expired;
    const canResubmit = !!flags?.canResubmit;
    if (submitted && !canResubmit) {
      setLastSubmitHomeworkId(String(hwId || ''));
      setHomeworkInfo('This homework is already submitted. Resubmit is allowed only for the latest homework within 1 hour.');
      return;
    }
    if (expired) {
      setLastSubmitHomeworkId(String(hwId || ''));
      setHomeworkInfo('This homework is expired and can no longer be submitted.');
      return;
    }
    if (!hwId) {
      setLastSubmitHomeworkId(String(hwId || ''));
      setHomeworkInfo('Submit failed: homework id is missing for this row. Please refresh and try again.');
      return;
    }
    if (homeworkUploadingById[hwId]) {
      setLastSubmitHomeworkId(String(hwId || ''));
      setHomeworkInfo('Please wait for image upload to finish before submitting.');
      return;
    }
    const uploadedUrls = (Array.isArray(homeworkAttachmentUrls[hwId]) ? homeworkAttachmentUrls[hwId] : [])
      .filter((u) => typeof u === 'string' && u.trim() && !String(u).startsWith('blob:'));
    const answerText = String(homeworkAnswerTextById[hwId] || '').trim();
    const localPreviewOnlyCount = (Array.isArray(homeworkPreviewById[hwId]) ? homeworkPreviewById[hwId] : []).length;
    if (localPreviewOnlyCount > 0) {
      setLastSubmitHomeworkId(String(hwId || ''));
      setHomeworkInfo('Some selected images are still local-only. Wait for upload to finish or re-upload before submitting.');
      return;
    }
    setLastSubmitHomeworkId(String(hwId || ''));
    setHomeworkInfo('Submitting homework...');
    setStartingHomeworkId(hwId);
    try {
      const currentHomework = safeArray(homework).find((h) => String(h?.id || h?.homeworkId || h?.homework_id || '') === String(hwId));
      const currentAttachmentUrls = asUrlList(currentHomework?.latestAttachmentUrls || currentHomework?.latest_attachment_urls, currentHomework?.latestAttachmentUrl || currentHomework?.latest_attachment_url);
      const sub = await submitHomework(
        hwId,
        studentId,
        {
          summary: 'Completed in UI flow',
          text: answerText || null,
        },
        uploadedUrls
      );
      const grade = sub?.grade ?? null;
      const submittedAtIso = new Date().toISOString();
      const nextStatus = String(sub?.status || (submitted ? 'resubmitted' : 'submitted')).toLowerCase() === 'resubmitted' ? 'resubmitted' : 'submitted';
      const nextRemark = nextStatus === 'resubmitted' ? 'Resubmitted' : 'Submitted';
      const persistedUrls = uploadedUrls.length ? uploadedUrls : currentAttachmentUrls;
      setHomework((prev) => safeArray(prev).map((item) => {
        const id = String(item?.id || item?.homeworkId || item?.homework_id || '');
        if (id !== String(hwId)) return item;
        const existingCount = Number(item?.attemptCount || 0);
        return {
          ...item,
          status: nextStatus,
          dueStatus: nextStatus,
          submitted: true,
          remark: nextRemark,
          attemptCount: Number.isFinite(existingCount) ? existingCount + 1 : 1,
          lastAttemptAt: submittedAtIso,
          submittedAt: submittedAtIso,
          latestAttachmentUrls: persistedUrls,
          latestAttachmentUrl: persistedUrls[0] || null,
          latestAnswerText: answerText || null,
          grade: grade ?? item?.grade ?? null
        };
      }));
      setHomeworkInfo(`${nextStatus === 'resubmitted' ? 'Resubmitted' : 'Submitted'} successfully. Last grade: ${grade ?? '-'}`);
      // Record progress for homework submission silently
      if (grade !== null) {
        const hwItem = homework.find((h) => h.id === hwId);
        recordProgress({
          studentId,
          subject: hwItem?.subject || 'Homework',
          score: Number(grade),
          source: 'homework'
        }).catch(() => {});
      }
      setHomeworkAttachmentUrls((prev) => ({ ...prev, [hwId]: persistedUrls }));
      setHomeworkPreviewById((prev) => ({ ...prev, [hwId]: [] }));
      setEditingResubmitById((prev) => ({ ...prev, [hwId]: false }));
      setExpandedSubmissionDetailsById((prev) => ({ ...prev, [hwId]: false }));
      // Refresh in background; keep optimistic UI if one endpoint has bad/null payloads.
      loadHomeworkPanel().catch(() => {});
      loadProgressPanel().catch(() => {});
    } catch (e) {
      const msg = e?.message || 'Submit failed.';
      setHomeworkInfo(`Submit failed: ${msg}`);
      setPanelErrorKey('homework', msg);
    } finally {
      setStartingHomeworkId('');
    }
  }

  async function onStudentHomeworkFileSelected(hwId, files) {
    const picked = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!picked.length) return;

    const localUrls = picked.map((file) => URL.createObjectURL(file));
    setHomeworkPreviewById((prev) => {
      const current = Array.isArray(prev[hwId]) ? prev[hwId] : [];
      return { ...prev, [hwId]: [...current, ...localUrls] };
    });
    setHomeworkUploadingById((prev) => ({ ...prev, [hwId]: true }));
    setHomeworkInfo(`Uploading ${picked.length} image${picked.length === 1 ? '' : 's'}...`);

    const uploaded = [];
    const uploadedPreviewUrls = [];
    for (let i = 0; i < picked.length; i += 1) {
      const file = picked[i];
      const previewUrl = localUrls[i];
      try {
        const res = await uploadHomeworkImage(file);
        if (res?.url) {
          uploaded.push(res.url);
          if (previewUrl) uploadedPreviewUrls.push(previewUrl);
        }
      } catch {
        // Keep local preview fallback
      }
    }

    if (uploaded.length) {
      setHomeworkAttachmentUrls((prev) => {
        const current = Array.isArray(prev[hwId]) ? prev[hwId] : [];
        return { ...prev, [hwId]: Array.from(new Set([...current, ...uploaded])) };
      });
      setHomeworkPreviewById((prev) => {
        const current = Array.isArray(prev[hwId]) ? prev[hwId] : [];
        return { ...prev, [hwId]: current.filter((u) => !uploadedPreviewUrls.includes(u)) };
      });
      setHomeworkInfo(uploaded.length === picked.length
        ? `Uploaded ${uploaded.length} image${uploaded.length === 1 ? '' : 's'}.`
        : `Uploaded ${uploaded.length}/${picked.length} image${picked.length === 1 ? '' : 's'}.`);
    } else {
      setHomeworkInfo('Image upload failed. Local preview is temporary; please re-upload before submit so it appears after relogin.');
    }

    setHomeworkUploadingById((prev) => ({ ...prev, [hwId]: false }));
  }

  function onRemoveStudentAttachment(hwId, url) {
    setHomeworkAttachmentUrls((prev) => {
      const current = Array.isArray(prev[hwId]) ? prev[hwId] : [];
      return { ...prev, [hwId]: current.filter((u) => u !== url) };
    });
    setHomeworkPreviewById((prev) => {
      const current = Array.isArray(prev[hwId]) ? prev[hwId] : [];
      return { ...prev, [hwId]: current.filter((u) => u !== url) };
    });
  }

  function onRemoveAllStudentAttachments(hwId) {
    setHomeworkAttachmentUrls((prev) => ({ ...prev, [hwId]: [] }));
    setHomeworkPreviewById((prev) => ({ ...prev, [hwId]: [] }));
  }

  function onStudentDrop(hwId, event) {
    event.preventDefault();
    setHomeworkDropActiveById((prev) => ({ ...prev, [hwId]: false }));
    const files = Array.from(event.dataTransfer?.files || []).filter((file) => String(file?.type || '').startsWith('image/'));
    if (files.length) onStudentHomeworkFileSelected(hwId, files);
  }

  function onImageDragStart(e, hwId, index) {
    setImageReorderingHomeworkId(hwId);
    setDraggedImageIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onImageDragOver(e, hwId, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (hwId === imageReorderingHomeworkId) {
      setDragOverImageIndex(index);
    }
  }

  function onImageDragLeave() {
    setDragOverImageIndex(null);
  }

  function onImageDrop(e, hwId, index) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverImageIndex(null);

    if (hwId !== imageReorderingHomeworkId || draggedImageIndex === null || draggedImageIndex === index) {
      setImageReorderingHomeworkId(null);
      setDraggedImageIndex(null);
      return;
    }

    const allUrls = [
      ...(Array.isArray(homeworkAttachmentUrls[hwId]) ? homeworkAttachmentUrls[hwId] : []),
      ...(Array.isArray(homeworkPreviewById[hwId]) ? homeworkPreviewById[hwId] : [])
    ];

    const newUrls = [...allUrls];
    const draggedUrl = newUrls[draggedImageIndex];
    newUrls.splice(draggedImageIndex, 1);
    newUrls.splice(index, 0, draggedUrl);

    // Split back into attachment and preview URLs
    const attachmentUrls = Array.isArray(homeworkAttachmentUrls[hwId]) ? homeworkAttachmentUrls[hwId] : [];
    const previewUrls = Array.isArray(homeworkPreviewById[hwId]) ? homeworkPreviewById[hwId] : [];
    
    const newAttachmentUrls = [];
    const newPreviewUrls = [];
    
    newUrls.forEach((url) => {
      if (attachmentUrls.includes(url)) {
        newAttachmentUrls.push(url);
      } else {
        newPreviewUrls.push(url);
      }
    });

    setHomeworkAttachmentUrls((prev) => ({ ...prev, [hwId]: newAttachmentUrls }));
    setHomeworkPreviewById((prev) => ({ ...prev, [hwId]: newPreviewUrls }));
    setImageReorderingHomeworkId(null);
    setDraggedImageIndex(null);
  }

  async function onOpenResource(id) {
    if (!id) return;
    try {
      const res = await getLibraryResource(id);
      setSelectedResource(res?.resource || null);
    } catch (e) {
      setSelectedResource(null);
      setPanelErrorKey('library', e?.message || 'Unable to open resource.');
    }
  }

  async function onAddCalendarEvent(e) {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventDate) return;
    setCalendarAdding(true);
    setCalendarNote('');
    setPanelErrorKey('calendar', '');
    try {
      await createCalendarEvent({
        studentId,
        title: newEventTitle.trim(),
        start: new Date(newEventDate).toISOString(),
        end: new Date(newEventDate).toISOString(),
        type: 'study'
      });
      setNewEventTitle('');
      setNewEventDate('');
      setCalendarNote('Event added.');
      await loadCalendarPanel();
    } catch (e2) {
      setPanelErrorKey('calendar', e2?.message || 'Unable to add event.');
    } finally {
      setCalendarAdding(false);
    }
  }

  async function onEarnReward() {
    setRewardsEarning(true);
    setRewardsNote('');
    try {
      const res = await earnReward({ studentId, coins: 10, reason: 'Daily study check-in' });
      setRewardsNote(`+10 coins earned! Total: ${res?.newBalance ?? '–'}`);
      await loadRewardsPanel();
    } catch (e) {
      setRewardsNote(e?.message || 'Unable to earn reward.');
    } finally {
      setRewardsEarning(false);
    }
  }


  async function onSaveTheme(nextTheme) {
    setSettingsSaving(true);
    try {
      const payload = {
        studentId,
        prefs: {
          ...(settings?.prefs || {}),
          theme: nextTheme,
          language: currentLanguage
        }
      };
      const saved = await saveSettings(payload);
      setSettings(saved?.settings || settings);
    } catch (e) {
      setPanelErrorKey('settings', e?.message || 'Unable to save settings.');
    } finally {
      setSettingsSaving(false);
    }
  }

  // Scroll AI chat to bottom whenever messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  async function onSendTutorMessage(overrideMsg, options = {}) {
    const msg = (typeof overrideMsg === 'string' ? overrideMsg : chatInput).trim();
    const silentUser = Boolean(options?.silentUser);
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
    // Optimistically add user message
    const tempUserMsg = silentUser ? null : {
      id: `tmp-u-${Date.now()}`,
      role: 'user',
      text: msg || (chatImages.length ? `Please explain these ${chatImages.length} image${chatImages.length === 1 ? '' : 's'}.` : ''),
      ts: new Date().toISOString(),
      imageDataUrl: chatImages[0]?.dataUrl || '',
      imageName: chatImages[0]?.name || '',
      imageDataUrls: chatImages.map((img) => img.dataUrl),
      imageNames: chatImages.map((img) => img.name),
      lessonId: selectedTutorLesson?.id || '',
      lessonTitle: selectedTutorLesson?.title || '',
      lessonSubject: selectedTutorLesson?.subject || tutorSubject,
    };
    if (tempUserMsg) {
      setChatHistory((prev) => [...safeArray(prev), tempUserMsg]);
    }

    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    chatRequestAbortRef.current = abortController;

    setChatInput('');
    setChatLoading(true);
    setPanelErrorKey('chat', '');
    try {
      const res = await sendChat(
        studentId,
        msg || 'Please explain these images.',
        'Friendly',
        conversationId,
        recentMessages,
        chatImages[0]?.dataUrl || undefined,
        chatImages.map((img) => img.dataUrl),
        chatImages.map((img) => img.name),
        selectedTutorLesson?.id || undefined,
        selectedTutorLesson?.title || undefined,
        selectedTutorLesson?.subject || tutorSubject || undefined,
        abortController?.signal
      );
      // If the backend returned an error response (401/403/500 etc.), surface it
      if (!res?.reply && (res?.error || res?.message || res?.statusCode)) {
        throw new Error(res?.message || res?.error || 'Chat request failed');
      }
      // Use the reply directly from the response — much more reliable than
      // re-fetching from Supabase (which may return empty if persistence failed).
      const aiMsg = { id: `ai-${Date.now()}`, role: 'ai', text: res.reply || '…', ts: new Date().toISOString() };
      setChatHistory((prev) => [
        ...safeArray(prev).filter((m) => !tempUserMsg || m.id !== tempUserMsg.id),
        ...(tempUserMsg ? [{ ...tempUserMsg }] : []),
        aiMsg,
      ]);
      // Show follow-up suggestions if provided
      if (Array.isArray(res?.followups) && res.followups.length) {
        setChatFollowups(res.followups);
      }
      setChatImages([]);
      loadLearningTimelinePanel();
    } catch (e) {
      const isAborted = e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('aborted');
      if (isAborted) {
        setPanelErrorKey('chat', '');
        return;
      }
      // Show error inline as a bot message
      const errMsg = { id: `tmp-err-${Date.now()}`, role: 'ai', text: `⚠️ ${e?.message || 'Unable to reach AI tutor right now.'}`, ts: new Date().toISOString() };
      setChatHistory((prev) => [
        ...safeArray(prev).filter((m) => !tempUserMsg || m.id !== tempUserMsg.id),
        ...(tempUserMsg ? [tempUserMsg] : []),
        errMsg
      ]);
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

  useEffect(() => {
    const lessonId = String(selectedTutorLesson?.id || '').trim();
    if (!lessonId) return;
    if (welcomedLessonsRef.current.has(lessonId)) return;
    if (chatLoading) return;

    welcomedLessonsRef.current.add(lessonId);
    const lessonTitle = String(selectedTutorLesson?.title || 'this lesson').trim();
    const lessonSubject = String(selectedTutorLesson?.subject || tutorSubject || '').trim();
    const starter = `I selected the lesson "${lessonTitle}"${lessonSubject ? ` in ${lessonSubject}` : ''}. Please welcome me and teach in a very simple way. Give: 1) what this lesson means, 2) one real-life example, 3) three tiny steps we will cover, and 4) one easy check question.`;
    onSendTutorMessage(starter, { silentUser: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTutorLesson?.id]);

  async function onTutorImageSelected(files) {
    setChatImageError('');
    const picked = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!picked.length) {
      return;
    }

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
        try {
          dataUrl = String(await fileToCompressedDataUrl(file));
        } catch {
          dataUrl = String(await fileToRawDataUrl(file));
        }
        if (!dataUrl) throw new Error('empty image');
        prepared.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: String(file.name || 'image'),
          dataUrl,
        });
      } catch {
        setChatImageError('Some images could not be processed. Try PNG/JPG files.');
      }
    }

    if (!prepared.length) return;

    setChatImages((prev) => {
      const merged = [...prev, ...prepared];
      const deduped = [];
      const seen = new Set();
      for (const img of merged) {
        const key = `${img.name}|${img.dataUrl.slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(img);
        if (deduped.length >= 6) break;
      }
      return deduped;
    });
  }

  function removeChatImageById(id) {
    setChatImages((prev) => prev.filter((img) => img.id !== id));
  }

  function clearChatImages() {
    setChatImages([]);
  }

  const tutorPanel = (
    <section className="cardish eg-grad-ai eg-ai-panel eg-ai-screen">
      <div className="eg-ai-top-sticky">
        <div className="eg-ai-head">
          <h3>🤖 AI Tutor</h3>
          <div className="eg-ai-head-controls">
            <span className="eg-ai-head-hint">Quick prompts</span>
            <select
              className="eg-ai-read-language"
              value={chatReadAloudLanguage}
              onChange={(e) => setChatReadAloudLanguage(e.target.value)}
              aria-label="Read aloud language"
            >
              <option value="en-US">Read in English</option>
              <option value="te-IN">Read in Telugu</option>
              <option value="hi-IN">Read in Hindi</option>
              <option value="ta-IN">Read in Tamil</option>
              <option value="kn-IN">Read in Kannada</option>
            </select>
            <div className="eg-ai-speed-control" title={`Read aloud speed: ${getSpeedLabel(chatReadAloudSpeed)}`}>
              <label htmlFor="eg-ai-speed-range">Speed</label>
              <input
                id="eg-ai-speed-range"
                type="range"
                min="0.6"
                max="1.8"
                step="0.1"
                value={chatReadAloudSpeed}
                onChange={(e) => setChatReadAloudSpeed(clampSpeed(e.target.value))}
                aria-label="Read aloud speed"
              />
              <span>{chatReadAloudSpeed.toFixed(1)}×</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <select value={tutorSubject} onChange={(e) => setTutorSubject(e.target.value)} className="eg-ai-topic-chip" style={{ width: '100%' }}>
              {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
            </select>
            <select
              value={selectedTutorLessonId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedTutorLessonId(nextId);
                setSelectedTutorLesson(tutorLessons.find((lesson) => String(lesson.id || '') === String(nextId)) || null);
              }}
              disabled={tutorLoadingLessons}
              className="eg-ai-topic-chip"
              style={{ width: '100%' }}
            >
              <option value="">{tutorLoadingLessons ? 'Loading lessons...' : 'Select a lesson'}</option>
              {tutorLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
            </select>
          </div>
          <small style={{ color: '#6b7280' }}>
            {studentProfile?.className || studentProfile?.class_name
              ? `Visible lessons for ${studentProfile?.className || studentProfile?.class_name}`
              : 'Your class profile is loading.'}
          </small>
          {selectedTutorLesson ? (
            <div style={{ fontSize: 12, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
              Teaching: <strong>{selectedTutorLesson.title}</strong> · {selectedTutorLesson.subject}
            </div>
          ) : null}
        </div>
        <div className="eg-ai-topic-list">
          {tutorQuickPrompts.map((t) => (
            <button
              key={t}
              type="button"
              className="eg-ai-topic-chip"
              onClick={() => onSendTutorMessage(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {panelLoading.chat ? <p className="eg-loading">Loading chat...</p> : null}
      {panelError.chat ? <p className="eg-loading" style={{ color: '#dc2626' }}>{panelError.chat}</p> : null}
      <div className="eg-ai-chat eg-ai-chat-screen">
        {safeArray(chatHistory).map((m, idx) => {
          const messageId = String(m?.id || m?.ts || `msg-${idx}`);
          const messageText = m?.text || m?.message || '';
          const isBot = m?.role !== 'user';
          const isSpeaking = chatReadAloudId === messageId;
          const isVoicePlaying = chatVoicePlayId === messageId;
          const isVoiceLoading = chatVoiceLoadingId === messageId;
          return (
          <div key={messageId} className={`ai-msg ${m.role === 'user' ? 'user' : 'bot'} eg-ai-msg-text`}>
            {Array.isArray(m?.imageDataUrls) && m.imageDataUrls.length ? (
              <div className="eg-ai-inline-image-wrap eg-ai-inline-image-grid">
                {m.imageDataUrls.slice(0, 4).map((url, idx) => (
                  <img
                    key={`${m.id || m.ts}-img-${idx}`}
                    className="eg-ai-inline-image"
                    src={String(url)}
                    alt={String(m?.imageNames?.[idx] || `Uploaded image ${idx + 1}`)}
                  />
                ))}
                <small className="eg-ai-inline-image-label">{m.imageDataUrls.length} image{m.imageDataUrls.length === 1 ? '' : 's'} attached</small>
              </div>
            ) : m?.imageDataUrl ? (
              <div className="eg-ai-inline-image-wrap">
                <img
                  className="eg-ai-inline-image"
                  src={String(m.imageDataUrl)}
                  alt={String(m.imageName || 'Uploaded for AI Tutor')}
                />
                <small className="eg-ai-inline-image-label">Image attached</small>
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
                  title="Play local server-generated voice audio"
                >
                  {isVoiceLoading ? 'Generating Voice...' : (isVoicePlaying ? 'Stop Voice' : 'Play Voice')}
                </button>
                <button
                  type="button"
                  className="eg-ai-read-btn"
                  onClick={() => onToggleReadAloud(messageId, messageText)}
                  disabled={!chatReadAloudSupported}
                  title={chatReadAloudSupported ? `Read this response aloud in ${getReadLanguageLabel(chatReadAloudLanguage)}` : 'Read aloud is not supported on this browser'}
                >
                  {isSpeaking ? 'Stop Audio' : `Read ${getReadLanguageLabel(chatReadAloudLanguage)}`}
                </button>
              </div>
            ) : null}
          </div>
        );})}
        {chatLoading ? (
          <div className="ai-msg bot ai-msg-thinking">
            <span>EduGenie is thinking</span>
            <span className="eg-typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        ) : null}
        {!panelLoading.chat && !chatHistory.length && !chatLoading ? (
          <div className="ai-msg bot">👋 Hi! I'm EduGenie, your AI tutor. Ask me anything about your subjects!</div>
        ) : null}
        <div ref={chatEndRef} />
      </div>
      {chatFollowups.length > 0 && !chatLoading ? (
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
      ) : null}
      {chatImages.length ? (
        <div className="eg-ai-image-preview-wrap">
          <div className="eg-ai-image-preview-grid">
            {chatImages.map((img) => (
              <div key={img.id} className="eg-ai-image-tile">
                <img className="eg-ai-image-preview" src={img.dataUrl} alt={img.name || 'Selected for AI tutor'} />
                <button type="button" className="eg-ai-image-tile-remove" onClick={() => removeChatImageById(img.id)}>×</button>
              </div>
            ))}
          </div>
          <div className="eg-ai-image-meta">
            <span>{chatImages.length} file{chatImages.length === 1 ? '' : 's'} selected</span>
            <button type="button" className="eg-ai-image-clear" onClick={clearChatImages}>
              Clear all
            </button>
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
          placeholder={selectedTutorLesson ? `Ask about ${selectedTutorLesson.title}... (Enter to send)` : 'Select a lesson then ask anything...'}
          disabled={chatLoading}
        />
        {chatImages.length ? <span className="eg-ai-selected-pill">{chatImages.length} file{chatImages.length === 1 ? '' : 's'} ready</span> : null}
        <label className="eg-ai-attach-btn" htmlFor="eg-ai-image-input">📎 File</label>
        <input
          id="eg-ai-image-input"
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            onTutorImageSelected(Array.from(e.target.files || []));
            // Allow choosing the same file again (browser otherwise may not fire onChange).
            e.target.value = '';
          }}
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
    </section>
  );

  function renderTimelineConfidenceBadge(level) {
    const value = String(level || 'building').trim().toLowerCase();
    const palette = value === 'strong'
      ? { bg: '#dcfce7', color: '#166534', label: 'Strong' }
      : value === 'needs-support'
        ? { bg: '#fee2e2', color: '#991b1b', label: 'Needs support' }
        : { bg: '#e0e7ff', color: '#3730a3', label: 'Building' };
    return (
      <span className="eg-timeline-badge" style={{ background: palette.bg, color: palette.color }}>
        {palette.label}
      </span>
    );
  }

  return (
    <div className="eg-shell">
      <aside className="eg-sidebar">
        <div className="eg-logo">
          <div className="eg-logo-mark">EG</div>
          <div>
            <strong>EduGenie</strong>
            <p>Your AI Study Buddy</p>
          </div>
        </div>

        <nav className="eg-nav">
          {sidebarItems.map(([icon, item]) => (
            <button key={item} className={`eg-nav-item ${activeSidebarTab === item ? 'active' : ''}`} onClick={() => onSidebarNavClick(item)}>
              <span className="eg-dot" />
              <span className="eg-nav-icon" aria-hidden="true">{icon}</span>
              {item}
            </button>
          ))}
        </nav>

        <div className="eg-upgrade">
          <p>Upgrade to Premium</p>
          <button>Go Premium</button>
        </div>
      </aside>

      <div className="eg-main">
        <header className="eg-topbar cardish">
          <div className="eg-search">Search for topics, tests, books...</div>
          <div className="eg-top-actions">
            <span className="pill">🔥 {streakDays}</span>
            <span className="pill">🏅 {badges}</span>
            <div className="eg-profile-chip">
              <div className="eg-profile-avatar">🧑</div>
              <div className="eg-profile-meta">
                <strong>Hi, {greetingName}</strong>
                <span>Student</span>
              </div>
              <span className="eg-profile-caret">▾</span>
            </div>
          </div>
        </header>

        {/* Subject Navigation */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 20px', backgroundColor: '#f5f5f5', borderBottom: '1px solid #e0e0e0', overflowX: 'auto', alignItems: 'center' }}>
          <button 
            onClick={() => setActiveView('home')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '20px',
              backgroundColor: activeView === 'home' ? '#5b47ff' : '#fff',
              color: activeView === 'home' ? '#fff' : '#333',
              cursor: 'pointer',
              fontWeight: 'bold',
              whiteSpace: 'nowrap'
            }}
          >
            🏠 Home
          </button>
          {safeArray(subjects).map((subject) => {
            const notifyCount = getSubjectNotifications(subject);
            return (
              <button
                key={subject}
                onClick={() => setActiveView(subject)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '20px',
                  backgroundColor: activeView === subject ? '#5b47ff' : '#fff',
                  color: activeView === subject ? '#fff' : '#333',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  position: 'relative'
                }}
              >
                {subject}
                {notifyCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    backgroundColor: '#ff6b6b',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {notifyCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {panelError.dashboard ? <p className="eg-loading">{panelError.dashboard}</p> : null}

        <div key={contentViewKey} className={`eg-view-shell ${activeSidebarTab === 'AI Tutor' ? 'eg-view-ai' : 'eg-view-standard'}`}>
        {activeSidebarTab === 'AI Tutor' ? (
          tutorPanel
        ) : activeView === 'home' ? (
          <>
            <section className="eg-main-grid eg-main-grid-home">
              <div className="eg-left-stack">
              <section className="cardish eg-hero-card eg-grad-hero">
                <h1>Good Morning, {greetingName}! 👋</h1>
                <p>Ready to learn something amazing today?</p>
              <div className="eg-hero-inner">
                <div className="eg-bot-quote">
                  <div className="eg-bot">🤖</div>
                  <blockquote>
                    "The beautiful thing about learning is nobody can take it away from you."<br />
                    <span>- B.B. King</span>
                  </blockquote>
                </div>

                <div className="eg-plan-box">
                  <h3>Today's Plan</h3>
                  {panelLoading.homework ? <p className="eg-loading">Loading homework...</p> : null}
                  {panelError.homework ? <p className="eg-loading">{panelError.homework}</p> : null}
                  <ul>
                    {/* Show only unique subject names — click to go to subject page */}
                    {[...new Set((Array.isArray(homework) ? homework : []).map((h) => h?.subject || 'General'))].slice(0, 4).map((subj) => (
                      <li key={subj} style={{ cursor: 'pointer', color: '#5b47ff', fontWeight: '600' }}
                        onClick={() => setActiveView(subj)}>
                        📚 {subj}
                      </li>
                    ))}
                    {!panelLoading.homework && !homework.length ? <li>No homework tasks assigned.</li> : null}
                  </ul>
                  <button>Start Learning</button>
                </div>

                <div className="eg-streak-box">
                  <h4>Current Streak</h4>
                  <strong>{streakDays}</strong>
                  <span>Days</span>
                  <div className="eg-goal-ring">
                    <div>{weeklyGoalPct}%</div>
                    <small>Weekly Goal</small>
                  </div>
                </div>
              </div>
            </section>

            <section className="eg-subject-row">
              {panelLoading.progress ? <p className="eg-loading">Loading progress...</p> : null}
              {panelError.progress ? <p className="eg-loading">{panelError.progress}</p> : null}
              {safeArray(progressSummary).map((s) => (
                <article key={s.subject} className="cardish eg-subject-card">
                  <h4>{s.subject}</h4>
                  <strong>{s.score}%</strong>
                  <span>{s.score >= 75 ? 'Excellent' : 'Keep Practicing'}</span>
                </article>
              ))}
              {!panelLoading.progress && !progressSummary.length ? <p className="eg-loading">No progress metrics yet.</p> : null}
            </section>

            <section className="cardish eg-reco-card eg-grad-reco">
              <div>
                <h3>AI Recommends for You</h3>
                <p>Based on your current progress and library data.</p>
              </div>
              {panelLoading.library ? <p className="eg-loading">Loading recommendations...</p> : null}
              {panelError.library ? <p className="eg-loading">{panelError.library}</p> : null}
              <div className="eg-tag-row">
                {safeArray(libraryTop).slice(0, 4).map((t) => (
                  <span key={t.id || t.title}>{t.title || t.summary || 'Learning Resource'}</span>
                ))}
                {!panelLoading.library && !libraryTop.length ? <span>No recommendations yet.</span> : null}
              </div>
            </section>
          </div>
        </section>

        <section className="eg-bottom-grid">
          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Daily Focus</h4>
            <ul className="mini-list bullets">
              <li>Revise key concepts for 20 minutes</li>
              <li>Complete one homework task before lunch</li>
              <li>Practice one mock test section</li>
            </ul>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Learning Mode</h4>
            <div className="eg-role-list">
              <span>Guided Practice</span>
              <span>Test Simulation</span>
              <span>Quick Revision</span>
            </div>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft eg-timeline-card">
            <h4>Lesson Timeline</h4>
            {panelLoading.timeline ? <p className="eg-loading">Loading lesson progress...</p> : null}
            {panelError.timeline ? <p className="eg-loading">{panelError.timeline}</p> : null}
            {!panelLoading.timeline && !panelError.timeline && !recentLessonTimeline.length && !recentSubjectTimeline.length ? (
              <p className="eg-inline-note">Your lesson and subject learning threads will appear here after you start chatting with EduGenie.</p>
            ) : null}
            {recentLessonTimeline.length ? <p className="eg-timeline-section-title">Lesson threads</p> : null}
            <div className="eg-timeline-list">
              {recentLessonTimeline.map((item) => (
                <div key={item.conversationId} className="eg-timeline-row">
                  <div className="eg-timeline-copy">
                    <strong>{item.lessonTitle || 'Lesson thread'}</strong>
                    <span>{item.subject || 'General'} · {item.userMessageCount || 0} student messages</span>
                    <small>{item.lastActivityAt ? `Last active ${fmtDate(item.lastActivityAt)}` : 'No recent activity'}</small>
                  </div>
                  <div className="eg-timeline-actions">
                    {renderTimelineConfidenceBadge(item.confidence)}
                    <button className="eg-inline-btn" type="button" onClick={() => onResumeTimelineThread(item)}>
                      Resume
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {recentSubjectTimeline.length ? <p className="eg-timeline-section-title">Subject threads</p> : null}
            <div className="eg-timeline-list">
              {recentSubjectTimeline.map((item) => (
                <div key={item.conversationId} className="eg-timeline-row">
                  <div className="eg-timeline-copy">
                    <strong>{item.subject || 'General'}</strong>
                    <span>All visible lessons · {item.userMessageCount || 0} student messages</span>
                    <small>{item.lastActivityAt ? `Last active ${fmtDate(item.lastActivityAt)}` : 'No recent activity'}</small>
                  </div>
                  <div className="eg-timeline-actions">
                    {renderTimelineConfidenceBadge(item.confidence)}
                    <button className="eg-inline-btn" type="button" onClick={() => onResumeTimelineThread(item)}>
                      Resume subject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>📝 Homework</h4>
            {panelLoading.homework ? <p className="eg-loading">Loading homework...</p> : null}
            {panelError.homework ? <p className="eg-loading">{panelError.homework}</p> : null}
            <ul className="mini-list">
              {/* Home page: show subject name only — tap to go to subject page */}
              {[...new Set((Array.isArray(homework) ? homework : []).map((h) => h?.subject || 'General'))].slice(0, 5).map((subj) => {
                const count = homework.filter((h) => (h.subject || 'General') === subj && h.status !== 'submitted').length;
                return (
                  <li key={subj} style={{ cursor: 'pointer', padding: '6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onClick={() => setActiveView(subj)}>
                    <span style={{ color: '#5b47ff', fontWeight: '600' }}>📚 {subj}</span>
                    {count > 0 && (
                      <span style={{ background: '#ff6b6b', color: '#fff', borderRadius: '12px', padding: '2px 8px', fontSize: '12px' }}>
                        {count} pending
                      </span>
                    )}
                  </li>
                );
              })}
              {!panelLoading.homework && !homework.length ? <li>No homework assigned.</li> : null}
            </ul>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '6px' }}>Tap a subject to see full details →</p>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Announcements</h4>
            {panelLoading.dashboard ? <p className="eg-loading">Loading announcements...</p> : null}
            {panelError.dashboard ? <p className="eg-loading">{panelError.dashboard}</p> : null}
            <ul className="mini-list bullets">
              {safeArray(announcementsTop).map((a) => (
                <li key={a.id || `${a.title}-${a.createdAt}`}>
                  <strong>{a.title || 'Announcement'}:</strong> {a.message || 'No details'}
                </li>
              ))}
              {!panelLoading.dashboard && !announcementsTop.length ? <li>No announcements yet.</li> : null}
            </ul>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Mock Tests</h4>
            {panelLoading.tests ? <p className="eg-loading">Loading tests...</p> : null}
            {panelError.tests ? <p className="eg-loading">{panelError.tests}</p> : null}
            <ul className="mini-list">
              {safeArray(testsTop).map((t) => (
                <li key={t.id} className="eg-list-with-action">
                  <span>{t.title || t.name || 'Mock Test'}</span>
                  <button className="eg-inline-btn" onClick={() => onStartTest(t.id)} disabled={startingTestId === t.id}>
                    {startingTestId === t.id ? '...' : 'Start'}
                  </button>
                </li>
              ))}
              {!panelLoading.tests && !testsTop.length ? <li>No tests available.</li> : null}
            </ul>
            {testResult ? <p className="eg-inline-note">Last score: {String(testResult.score)} | {testResult.feedback}</p> : null}
          </article>

          <article className="cardish eg-mini-card eg-progress-card eg-grad-progress">
            <h4>Progress Dashboard</h4>
            {panelLoading.progress ? <p className="eg-loading">Loading progress...</p> : null}
            {panelError.progress ? <p className="eg-loading">{panelError.progress}</p> : null}
            {trend.length > 1 ? <Sparkline values={trend} /> : <p className="eg-loading">Not enough points for trend chart.</p>}
            <div className="eg-bars">
              {safeArray(progressSummary).map((s) => (
                <div key={s.subject} className="bar-row">
                  <span>{s.subject}</span>
                  <div><i style={{ width: `${Math.max(10, Math.min(100, s.score))}%` }} /></div>
                  <small>{s.score}%</small>
                </div>
              ))}
            </div>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Extra Highlights</h4>
            {panelLoading.library ? <p className="eg-loading">Loading library...</p> : null}
            {panelError.library ? <p className="eg-loading">{panelError.library}</p> : null}
            <ul className="mini-list bullets">
              {safeArray(libraryTop).map((r) => (
                <li key={r.id}>
                  <button className="eg-link-btn" onClick={() => onOpenResource(r.id)}>📚 {r.title || r.summary || 'Learning resource'}</button>
                </li>
              ))}
              {!panelLoading.library && !libraryTop.length ? <li>No resources available.</li> : null}
            </ul>
            {selectedResource ? <p className="eg-inline-note">Opened: {selectedResource.title || 'Resource'}</p> : null}
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Calendar</h4>
            {panelLoading.calendar ? <p className="eg-loading">Loading calendar...</p> : null}
            {panelError.calendar ? <p className="eg-loading">{panelError.calendar}</p> : null}
            <ul className="mini-list">
              {safeArray(eventsTop).map((e) => (
                <li key={e.id}>{e.title || e.event_type || 'Study Session'} - {fmtDate(e.starts_at || e.start || e.created_at)}</li>
              ))}
              {!panelLoading.calendar && !eventsTop.length ? <li>No events scheduled.</li> : null}
            </ul>
            <form className="eg-inline-form" onSubmit={onAddCalendarEvent}>
              <input
                className="eg-inline-input"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Event title"
                required
              />
              <input
                className="eg-inline-input"
                type="date"
                value={newEventDate}
                onChange={(e) => setNewEventDate(e.target.value)}
                required
              />
              <button className="eg-inline-btn" type="submit" disabled={calendarAdding}>
                {calendarAdding ? 'Adding...' : 'Add Event'}
              </button>
            </form>
            {calendarNote ? <p className="eg-inline-note">{calendarNote}</p> : null}
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Rewards</h4>
            {panelLoading.rewards ? <p className="eg-loading">Loading rewards...</p> : null}
            {panelError.rewards ? <p className="eg-loading">{panelError.rewards}</p> : null}
            <p className="eg-reward-big">{coins} Coins</p>
            <p>{badges} badges earned</p>
            <div className="eg-inline-actions">
              <button className="eg-mini-btn" onClick={onEarnReward} disabled={rewardsEarning}>
                {rewardsEarning ? 'Earning...' : 'Check-in (+10 coins)'}
              </button>
            </div>
            {rewardsNote ? <p className="eg-inline-note">{rewardsNote}</p> : null}
          </article>

          <article className="cardish eg-mini-card eg-voice-card eg-grad-voice">
            <h4>AI Voice Assistant</h4>
            <div className="eg-mic">🎤</div>
            <p>How can I help you today?</p>
            <button className="eg-mini-btn">Tap to Speak</button>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Settings</h4>
            {panelLoading.settings ? <p className="eg-loading">Loading settings...</p> : null}
            {panelError.settings ? <p className="eg-loading">{panelError.settings}</p> : null}
            <ul className="mini-list">
              <li>⚙️ Account Settings</li>
              <li>🔒 Privacy & Security</li>
              <li>🌐 Language: {currentLanguage}</li>
              <li>🎨 Theme: {currentTheme}</li>
            </ul>
            <div className="eg-inline-actions">
              <button className="eg-inline-btn" disabled={settingsSaving} onClick={() => onSaveTheme(currentTheme === 'Dark' ? 'Light' : 'Dark')}>
                {settingsSaving ? 'Saving...' : 'Toggle Theme'}
              </button>
            </div>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Profile</h4>
            <p>{greetingName}</p>
            <p>Student</p>
            <button className="eg-mini-btn danger" onClick={onLogout}>Logout</button>
          </article>
        </section>
        </>
        ) : (
          <section
            className="eg-main-grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
            onClick={(e) => {
              if (e.target === e.currentTarget && homeworkStatusFilter !== 'all') {
                setHomeworkStatusFilter('all');
              }
            }}
          >
            <h2 style={{ gridColumn: '1 / -1', marginBottom: '20px' }}>{activeView} - Homework & Tests</h2>

            {/* Subject Homework — full details */}
            <article
              className="cardish eg-mini-card eg-grad-soft"
              style={{
                gridColumn: 'span 2',
                maxHeight: '78vh',
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <h4 style={{ margin: 0 }}>📝 {activeView} Homework</h4>
                <button
                  type="button"
                  className="eg-inline-btn"
                  onClick={() => setShowHomeworkHistory((prev) => !prev)}
                  style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
                >
                  {showHomeworkHistory ? 'Hide history' : 'Open history'}
                </button>
              </div>
              {panelLoading.homework ? <p className="eg-loading">Loading homework...</p> : null}
              {panelError.homework ? <p className="eg-loading">{panelError.homework}</p> : null}
              {(() => {
                const allHomework = homeworkBySubject.get(activeView) || [];
                const visibleHomework = allHomework.filter((h) => !getHomeworkState(h).hide);
                const latestFiveHomework = visibleHomework.slice(0, 5);
                const filteredHistory = historyFromDate
                  ? allHomework.filter((h) => {
                      const startDate = parseDate(h?.startAt || h?.createdAt || h?.created_at);
                      const startDateValue = toDateInputValue(startDate);
                      return startDateValue === historyFromDate;
                    })
                  : [];
                const submittedCount = visibleHomework.filter((h) => getHomeworkState(h).submitted).length;
                const notSubmittedCount = visibleHomework.filter((h) => !getHomeworkState(h).submitted).length;
                const overdueCount = visibleHomework.filter((h) => getHomeworkState(h).overdue && !getHomeworkState(h).submitted).length;
                const filteredVisibleHomework = visibleHomework.filter((h) => {
                  const state = getHomeworkState(h);
                  if (homeworkStatusFilter === 'submitted') return state.submitted;
                  if (homeworkStatusFilter === 'not-submitted') return !state.submitted;
                  if (homeworkStatusFilter === 'overdue') return state.overdue && !state.submitted;
                  return true;
                });
                const homeworkCardsToShow = homeworkStatusFilter === 'all' ? latestFiveHomework : filteredVisibleHomework;
                return (
                  <>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <button
                        type="button"
                        onClick={() => setHomeworkStatusFilter((prev) => (prev === 'submitted' ? 'all' : 'submitted'))}
                        style={{ background: homeworkStatusFilter === 'submitted' ? '#16a34a' : '#dcfce7', color: homeworkStatusFilter === 'submitted' ? '#fff' : '#166534', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                      >
                        Submitted: {submittedCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => setHomeworkStatusFilter((prev) => (prev === 'not-submitted' ? 'all' : 'not-submitted'))}
                        style={{ background: homeworkStatusFilter === 'not-submitted' ? '#dc2626' : '#fee2e2', color: homeworkStatusFilter === 'not-submitted' ? '#fff' : '#991b1b', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                      >
                        Not submitted: {notSubmittedCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => setHomeworkStatusFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))}
                        style={{ background: homeworkStatusFilter === 'overdue' ? '#c2410c' : '#ffedd5', color: homeworkStatusFilter === 'overdue' ? '#fff' : '#9a3412', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                      >
                        Overdue: {overdueCount}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {showHomeworkHistory ? (
                        <div style={{ marginBottom: '4px', border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fafafa', padding: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                            <div style={{ fontWeight: 700, color: '#334155' }}>📅 View history by date</div>
                            <button type="button" className="eg-inline-btn" onClick={() => { setShowHomeworkHistory(false); setHistoryFromDate(''); }}>
                              Close
                            </button>
                          </div>
                          {/* ── Custom colored mini-calendar ── */}
                          {(() => {
                            // Build a date->status map from ALL homework for this subject
                            const dateStatusMap = {};
                            safeArray(allHomework).forEach((hw) => {
                              const d = toDateInputValue(parseDate(hw?.startAt || hw?.createdAt || hw?.created_at));
                              if (!d) return;
                              const submitted = getHomeworkState(hw).submitted;
                              if (!dateStatusMap[d]) dateStatusMap[d] = { all: 0, submitted: 0 };
                              dateStatusMap[d].all += 1;
                              if (submitted) dateStatusMap[d].submitted += 1;
                            });

                            const { year, month } = historyCalMonth;
                            const firstDay = new Date(year, month, 1);
                            // ISO week: Mon=0 … Sun=6
                            const startOffset = (firstDay.getDay() + 6) % 7;
                            const daysInMonth = new Date(year, month + 1, 0).getDate();
                            const monthLabel = firstDay.toLocaleString(undefined, { month: 'long', year: 'numeric' });
                            const DAY_LABELS = ['M','T','W','T','F','S','S'];
                            const cells = [];
                            for (let i = 0; i < startOffset; i++) cells.push(null);
                            for (let d = 1; d <= daysInMonth; d++) cells.push(d);

                            return (
                              <div style={{ userSelect: 'none', minWidth: 230 }}>
                                {/* Month navigation */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                  <button type="button" onClick={() => setHistoryCalMonth(({ year: y, month: m }) => { const d = new Date(y, m - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#475569', padding: '2px 6px' }}>‹</button>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>{monthLabel}</span>
                                  <button type="button" onClick={() => setHistoryCalMonth(({ year: y, month: m }) => { const d = new Date(y, m + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#475569', padding: '2px 6px' }}>›</button>
                                </div>
                                {/* Day-of-week headers */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '2px' }}>
                                  {DAY_LABELS.map((l, i) => (
                                    <div key={i} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#94a3b8', padding: '2px 0' }}>{l}</div>
                                  ))}
                                </div>
                                {/* Day cells */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                                  {cells.map((day, idx) => {
                                    if (!day) return <div key={`e-${idx}`} />;
                                    const iso = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                                    const info = dateStatusMap[iso];
                                    const isSelected = historyFromDate === iso;
                                    let bg = 'transparent';
                                    let color = '#374151';
                                    let fontWeight = 400;
                                    if (info) {
                                      if (info.submitted === info.all) { bg = isSelected ? '#15803d' : '#dcfce7'; color = isSelected ? '#fff' : '#15803d'; fontWeight = 700; }
                                      else { bg = isSelected ? '#b91c1c' : '#fee2e2'; color = isSelected ? '#fff' : '#b91c1c'; fontWeight = 700; }
                                    } else if (isSelected) {
                                      bg = '#3b82f6'; color = '#fff'; fontWeight = 700;
                                    }
                                    return (
                                      <button
                                        key={iso}
                                        type="button"
                                        title={info ? `${info.submitted}/${info.all} submitted` : 'No homework'}
                                        onClick={() => setHistoryFromDate(isSelected ? '' : iso)}
                                        style={{ background: bg, color, fontWeight, border: isSelected ? `2px solid ${color === '#fff' ? 'rgba(0,0,0,0.2)' : color}` : '1px solid transparent', borderRadius: '6px', padding: '4px 2px', fontSize: '12px', cursor: 'pointer', textAlign: 'center', lineHeight: 1.3 }}
                                      >
                                        {day}
                                      </button>
                                    );
                                  })}
                                </div>
                                {/* Legend */}
                                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#15803d' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#dcfce7', border: '1px solid #15803d', display: 'inline-block' }} />All submitted</span>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#b91c1c' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#fee2e2', border: '1px solid #b91c1c', display: 'inline-block' }} />Not submitted</span>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#374151' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#f3f4f6', border: '1px solid #d1d5db', display: 'inline-block' }} />No homework</span>
                                </div>
                                {historyFromDate ? (
                                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '12px', color: '#475569' }}>Selected: <strong>{new Date(historyFromDate + 'T00:00:00').toLocaleDateString()}</strong></span>
                                    <button type="button" className="eg-inline-btn" onClick={() => setHistoryFromDate('')}>Clear</button>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })()}
                          <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                            {!historyFromDate ? (
                              <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>Pick a date above to see homework assigned on that day.</div>
                            ) : filteredHistory.length === 0 ? (
                              <div style={{ fontSize: '12px', color: '#64748b' }}>No homework assigned on {new Date(historyFromDate + 'T00:00:00').toLocaleDateString()}.</div>
                            ) : safeArray(filteredHistory).map((h) => {
                              const hState = getHomeworkState(h);
                              const isSubmitted = hState.submitted;
                              const cardBorder = isSubmitted ? '2px solid #16a34a' : '2px solid #dc2626';
                              const cardBg = isSubmitted ? '#f0fdf4' : '#fff1f2';
                              const statusLabel = isSubmitted ? '✅ Submitted' : '❌ Not submitted';
                              const statusColor = isSubmitted ? '#16a34a' : '#dc2626';
                              const teacherImages = asUrlList(h?.attachmentUrls || h?.attachment_urls, h?.attachmentUrl || h?.attachment_url);
                              const studentImages = asUrlList(h?.latestAttachmentUrls || h?.latest_attachment_urls, h?.latestAttachmentUrl || h?.latest_attachment_url);
                              const studentText = String(h?.latestAnswerText || h?.latest_answer_text || '').trim();
                              return (
                                <div key={`hist-${h.id}`} style={{ border: cardBorder, borderRadius: '10px', padding: '12px', background: cardBg }}>
                                  {/* Header */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827' }}>{h.title || 'Homework Task'}</div>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: statusColor, background: isSubmitted ? '#dcfce7' : '#fee2e2', borderRadius: '999px', padding: '3px 10px', whiteSpace: 'nowrap' }}>
                                      {statusLabel}
                                    </span>
                                  </div>
                                  {/* Dates */}
                                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                                    {h.startAt ? <span>📅 Start: {new Date(h.startAt).toLocaleString()} &nbsp;</span> : null}
                                    {h.dueAt ? <span>⏰ Due: {new Date(h.dueAt).toLocaleString()}</span> : null}
                                    {h.lastAttemptAt ? <span> &nbsp;· Last submitted: {new Date(h.lastAttemptAt).toLocaleString()}</span> : null}
                                  </div>
                                  {/* Teacher instructions */}
                                  {h.note ? (
                                    <div style={{ fontSize: '13px', color: '#374151', marginBottom: '8px', lineHeight: 1.5, background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px' }}>
                                      <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, marginBottom: '4px' }}>📋 Teacher instructions</div>
                                      {h.note}
                                    </div>
                                  ) : null}
                                  {/* Teacher images */}
                                  {teacherImages.length ? (
                                    <div style={{ marginBottom: '8px' }}>
                                      <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, marginBottom: '4px' }}>📎 Teacher attachments</div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {teacherImages.map((url) => (
                                          <img key={url} src={url} alt="Teacher attachment" onClick={() => setLightboxUrl(url)} title="Click to expand" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '1px solid #d1d5db' }} />
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                  {/* Student submission */}
                                  {(studentImages.length || studentText) ? (
                                    <div style={{ borderTop: `1px solid ${isSubmitted ? '#bbf7d0' : '#fecaca'}`, paddingTop: '8px', marginTop: '4px' }}>
                                      <div style={{ fontSize: '11px', fontWeight: 600, color: statusColor, marginBottom: '6px' }}>🎒 Student submission</div>
                                      {studentImages.length ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: studentText ? '8px' : 0 }}>
                                          {studentImages.map((url) => (
                                            <img key={url} src={url} alt="Submitted" onClick={() => setLightboxUrl(url)} title="Click to expand" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '2px solid #16a34a' }} />
                                          ))}
                                        </div>
                                      ) : null}
                                      {studentText ? (
                                        <div style={{ fontSize: '12px', color: '#334155', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', padding: '6px 8px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                          {studentText}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {/* Grade / feedback */}
                                  {((h.grade !== null && h.grade !== undefined) || h.feedback) ? (() => {
                                    const historyHomeworkId = String(h?.id || h?.homeworkId || h?.homework_id || '');
                                    const feedbackExpanded = !!expandedFeedbackById[historyHomeworkId];
                                    const isLatestSubmitted = historyHomeworkId && historyHomeworkId === latestSubmittedHomeworkId;
                                    return (
                                      <div style={{ marginTop: '8px', border: '1px solid #bfdbfe', borderRadius: '6px', background: '#eff6ff', padding: '6px 8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>
                                            Teacher feedback {isLatestSubmitted ? '(latest)' : ''}
                                          </div>
                                          <button
                                            type="button"
                                            className="eg-inline-btn"
                                            onClick={() => setExpandedFeedbackById((prev) => ({ ...prev, [historyHomeworkId]: !prev[historyHomeworkId] }))}
                                          >
                                            {feedbackExpanded ? 'Hide feedback' : 'Show feedback'}
                                          </button>
                                        </div>
                                        {feedbackExpanded ? (
                                          <div style={{ marginTop: '6px', fontSize: '12px', color: '#1f2937' }}>
                                            {h.grade !== null && h.grade !== undefined ? <span>Grade: {h.grade}/100</span> : null}
                                            {h.feedback ? <span>{h.grade !== null && h.grade !== undefined ? ' · ' : ''}Feedback: {h.feedback}</span> : null}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })() : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {safeArray(homeworkCardsToShow).map((h) => {
                        const state = getHomeworkState(h);
                        const homeworkId = String(h?.id || h?.homeworkId || h?.homework_id || '');
                        const isLatestAssigned = homeworkId && homeworkId === latestAssignedHomeworkId;
                        const lastSubmittedAt = parseDate(h?.lastAttemptAt || h?.submittedAt || h?.submitted_at || h?.updatedAt || h?.updated_at);
                        const resubmitWindowMs = 60 * 60 * 1000;
                        // If no timestamp available but homework is submitted and is latest, assume window is still open
                        const remainingResubmitMs = lastSubmittedAt
                          ? Math.max(0, (lastSubmittedAt.getTime() + resubmitWindowMs) - Date.now())
                          : (state.submitted && isLatestAssigned ? resubmitWindowMs : 0);
                        const canResubmitWindow = state.submitted && isLatestAssigned && remainingResubmitMs > 0;
                        const isEditingResubmit = !!editingResubmitById[homeworkId];
                        const canResubmit = canResubmitWindow && isEditingResubmit;
                        const remainingResubmitMinutes = Math.ceil(remainingResubmitMs / (60 * 1000));
                        const canEnterEditMode = canResubmitWindow && !isEditingResubmit;
                        const canSubmitNow = !state.submitted || canResubmit;
                        return (
                  <div key={homeworkId || h.title} style={{
                    background: state.overdue && !state.submitted ? '#fff1f2' : '#f8f8ff', borderRadius: '10px', padding: '14px',
                    borderLeft: `4px solid ${state.color}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedTeacherInfoById((prev) => ({ ...prev, [homeworkId]: !prev[homeworkId] }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpandedTeacherInfoById((prev) => ({ ...prev, [homeworkId]: !prev[homeworkId] }));
                            }
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap', cursor: 'pointer' }}
                          title="Click to view teacher instructions and assigned images"
                        >
                          <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{h.title || 'Homework Task'}</div>
                          <span style={{ background: state.bg, color: state.color, borderRadius: '999px', padding: '3px 8px', fontSize: '11px', fontWeight: 700 }}>
                            {state.label}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                            {expandedTeacherInfoById[homeworkId] ? 'Hide homework instructions' : '...'}
                          </span>
                        </div>
                        {expandedTeacherInfoById[homeworkId] && h.note && (
                          <div style={{ color: '#444', fontSize: '14px', marginBottom: '8px', lineHeight: '1.5' }}>
                            {h.note}
                          </div>
                        )}
                        {expandedTeacherInfoById[homeworkId] && asUrlList(h?.attachmentUrls || h?.attachment_urls, h?.attachmentUrl || h?.attachment_url).length ? (
                          <div style={{ marginBottom: '10px' }}>
                            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>📎 Teacher attachment:</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {asUrlList(h?.attachmentUrls || h?.attachment_urls, h?.attachmentUrl || h?.attachment_url).map((url) => (
                                <img
                                  key={url}
                                  src={url}
                                  alt="Homework"
                                  onClick={() => setLightboxUrl(url)}
                                  title="Click to view full size"
                                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '1px solid #ddd' }}
                                />
                              ))}
                            </div>
                            <p style={{ fontSize: '10px', color: '#aaa', margin: '2px 0 0' }}>Tap to expand</p>
                          </div>
                        ) : null}
                        {state.submitted ? (
                          (() => {
                            const submittedImages = asUrlList(h?.latestAttachmentUrls || h?.latest_attachment_urls, h?.latestAttachmentUrl || h?.latest_attachment_url);
                            const submittedText = String(h?.latestAnswerText || h?.latest_answer_text || '').trim();
                            if (!submittedImages.length && !submittedText) return null;
                            const expanded = !!expandedSubmissionDetailsById[homeworkId];
                            return (
                              <div style={{ marginBottom: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
                                <button
                                  type="button"
                                  className="eg-inline-btn"
                                  onClick={() => setExpandedSubmissionDetailsById((prev) => ({ ...prev, [homeworkId]: !prev[homeworkId] }))}
                                  style={{ marginBottom: expanded ? 6 : 0 }}
                                >
                                  {expanded ? 'Hide your submission homework' : 'Show your submission homework'}
                                </button>
                                {expanded ? (
                                  <div style={{ display: 'grid', gap: '8px', maxHeight: '220px', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' }}>
                                    {submittedImages.length ? (
                                      <div>
                                        <p style={{ fontSize: '11px', color: '#166534', margin: '0 0 6px' }}>✅ Submitted images:</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                          {submittedImages.map((url) => (
                                            <img
                                              key={url}
                                              src={url}
                                              alt="Submitted homework"
                                              onClick={() => setLightboxUrl(url)}
                                              title="Click to view full size"
                                              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', border: '2px solid #16a34a' }}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                    {submittedText ? (
                                      <div style={{ fontSize: '12px', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                        {submittedText}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })()
                        ) : null}
                        <div style={{ marginBottom: '8px', display: 'grid', gap: '8px' }}>
                          {!state.submitted || canResubmit ? (
                            <>
                              <div style={{ display: 'grid', gap: '6px' }}>
                                <label style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>Your written answer</label>
                                <textarea
                                  rows={3}
                                  value={homeworkAnswerTextById[homeworkId] || ''}
                                  onChange={(e) => setHomeworkAnswerTextById((prev) => ({ ...prev, [homeworkId]: e.target.value }))}
                                  placeholder="Write your answer here (this will be visible to your teacher in homework status)."
                                  style={{ width: '100%', resize: 'vertical' }}
                                />
                              </div>
                              <div
                                onDragOver={(e) => { e.preventDefault(); setHomeworkDropActiveById((prev) => ({ ...prev, [homeworkId]: true })); }}
                                onDragLeave={() => setHomeworkDropActiveById((prev) => ({ ...prev, [homeworkId]: false }))}
                                onDrop={(e) => onStudentDrop(homeworkId, e)}
                                style={{
                                  border: `2px dashed ${homeworkDropActiveById[homeworkId] ? '#7c3aed' : '#ddd'}`,
                                  background: homeworkDropActiveById[homeworkId] ? '#f5f3ff' : '#fafafa',
                                  borderRadius: '10px',
                                  padding: '10px'
                                }}
                              >
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={(e) => onStudentHomeworkFileSelected(homeworkId, Array.from(e.target.files || []))}
                                  disabled={homeworkUploadingById[homeworkId]}
                                />
                                <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
                                  Drag and drop multiple images here, or use Choose Files.
                                </div>
                              </div>
                              {/* Instant thumbnail preview — shows immediately on file select */}
                              {([...(Array.isArray(homeworkAttachmentUrls[homeworkId]) ? homeworkAttachmentUrls[homeworkId] : []), ...(Array.isArray(homeworkPreviewById[homeworkId]) ? homeworkPreviewById[homeworkId] : [])]).length ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexDirection: 'column' }}>
                                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: '#666' }}>
                                      {[...(Array.isArray(homeworkAttachmentUrls[homeworkId]) ? homeworkAttachmentUrls[homeworkId] : []), ...(Array.isArray(homeworkPreviewById[homeworkId]) ? homeworkPreviewById[homeworkId] : [])].length} image(s) selected
                                    </span>
                                    <button type="button" className="eg-inline-btn" onClick={() => onRemoveAllStudentAttachments(homeworkId)}>Remove all</button>
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                                    {[...(Array.isArray(homeworkAttachmentUrls[homeworkId]) ? homeworkAttachmentUrls[homeworkId] : []), ...(Array.isArray(homeworkPreviewById[homeworkId]) ? homeworkPreviewById[homeworkId] : [])].map((url, index) => (
                                      <div
                                        key={url}
                                        draggable
                                        onDragStart={(e) => onImageDragStart(e, homeworkId, index)}
                                        onDragOver={(e) => onImageDragOver(e, homeworkId, index)}
                                        onDragLeave={onImageDragLeave}
                                        onDrop={(e) => onImageDrop(e, homeworkId, index)}
                                        style={{
                                          position: 'relative',
                                          display: 'inline-block',
                                          opacity: draggedImageIndex === index && imageReorderingHomeworkId === homeworkId ? 0.5 : 1,
                                          backgroundColor: dragOverImageIndex === index && imageReorderingHomeworkId === homeworkId ? '#f0f0f0' : 'transparent',
                                          borderRadius: '6px',
                                          border: dragOverImageIndex === index && imageReorderingHomeworkId === homeworkId ? '2px dashed #7c3aed' : 'none',
                                          padding: dragOverImageIndex === index && imageReorderingHomeworkId === homeworkId ? '4px' : '0px',
                                          cursor: 'grab',
                                          transition: 'all 0.2s ease'
                                        }}
                                      >
                                        <img
                                          src={url}
                                          alt="Your answer"
                                          onClick={() => setLightboxUrl(url)}
                                          title="Drag to reorder • Click to view full size"
                                          style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '2px solid #7c3aed', userSelect: 'none' }}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => onRemoveStudentAttachment(homeworkId, url)}
                                          title="Remove image"
                                          style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', fontSize: '12px', lineHeight: '18px', cursor: 'pointer', padding: 0, zIndex: 10 }}
                                        >
                                          x
                                        </button>
                                        {homeworkUploadingById[homeworkId] && (
                                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: 10 }}>
                                            ⏳
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                                    {homeworkUploadingById[homeworkId] ? 'Uploading...' : '✅ Ready to submit'}
                                    <br />
                                    <span style={{ color: '#aaa' }}>Drag images to reorder • Tap image to expand • click x to remove</span>
                                  </div>
                                </div>
                              ) : null}
                              {state.submitted && isEditingResubmit ? (
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                  <button
                                    type="button"
                                    className="eg-inline-btn"
                                    onClick={() => {
                                      setEditingResubmitById((prev) => ({ ...prev, [homeworkId]: false }));
                                      setHomeworkAttachmentUrls((prev) => ({ ...prev, [homeworkId]: [] }));
                                      setHomeworkPreviewById((prev) => ({ ...prev, [homeworkId]: [] }));
                                    }}
                                  >
                                    Cancel edit
                                  </button>
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        {(h.grade !== null && h.grade !== undefined) || h.feedback ? (() => {
                          const feedbackExpanded = !!expandedFeedbackById[homeworkId];
                          const isLatestSubmitted = homeworkId && homeworkId === latestSubmittedHomeworkId;
                          return (
                            <div style={{ marginBottom: '8px', background: '#eef6ff', border: '1px solid #cfe0ff', borderRadius: '8px', padding: '10px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>
                                  Teacher feedback {isLatestSubmitted ? '(latest)' : ''}
                                </div>
                                <button
                                  type="button"
                                  className="eg-inline-btn"
                                  onClick={() => setExpandedFeedbackById((prev) => ({ ...prev, [homeworkId]: !prev[homeworkId] }))}
                                >
                                  {feedbackExpanded ? 'Hide feedback' : 'Show feedback'}
                                </button>
                              </div>
                              {feedbackExpanded ? (
                                <div style={{ marginTop: '8px' }}>
                                  {h.grade !== null && h.grade !== undefined ? (
                                    <div style={{ fontSize: '12px', color: '#1f2937', marginBottom: h.feedback ? '4px' : 0 }}>
                                      Grade: {h.grade}/100
                                    </div>
                                  ) : null}
                                  {h.feedback ? (
                                    <div style={{ fontSize: '12px', color: '#374151', lineHeight: '1.45' }}>{h.feedback}</div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })() : null}
                        <div style={{ fontSize: '12px', color: '#888' }}>
                          {h.startAt && <span>📅 Start: {new Date(h.startAt).toLocaleString()} &nbsp;</span>}
                          {h.dueAt && <span>⏰ Due: {new Date(h.dueAt).toLocaleString()}</span>}
                          {!h.startAt && !h.dueAt && h.createdAt && (
                            <span>Assigned: {new Date(h.createdAt).toLocaleDateString()}</span>
                          )}
                        </div>
                        {!state.submitted && state.overdue ? (
                          <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '12px', fontWeight: 600 }}>
                            ⚠ Not submitted yet — {state.expired ? 'hidden after 3 overdue days' : 'submit before it disappears'}
                          </div>
                        ) : null}
                        {canResubmitWindow ? (
                          <div style={{ marginTop: '8px', color: '#1d4ed8', fontSize: '12px', fontWeight: 600 }}>
                            {isEditingResubmit
                              ? `Editing enabled. Resubmit within ${remainingResubmitMinutes} minute${remainingResubmitMinutes === 1 ? '' : 's'}.`
                              : `You can edit this latest homework for ${remainingResubmitMinutes} more minute${remainingResubmitMinutes === 1 ? '' : 's'}.`}
                          </div>
                        ) : state.submitted && !isLatestAssigned ? (
                          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280', fontSize: '11px' }}>
                            <span>🔒</span>
                            <span>Resubmit only available for the latest homework within 1 hour of submission.</span>
                          </div>
                        ) : state.submitted && isLatestAssigned && remainingResubmitMs === 0 && lastSubmittedAt ? (
                          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280', fontSize: '11px' }}>
                            <span>🔒</span>
                            <span>1-hour resubmit window has closed.</span>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ marginLeft: '12px', flexShrink: 0, display: 'grid', gap: '6px', justifyItems: 'end' }}>
                        <button
                          type="button"
                          className="eg-inline-btn"
                          onClick={() => {
                            if (canEnterEditMode) {
                              setEditingResubmitById((prev) => ({ ...prev, [homeworkId]: true }));
                              return;
                            }
                            onSubmitHomework(homeworkId, { submitted: state.submitted, expired: state.expired, canResubmit });
                          }}
                          disabled={startingHomeworkId === homeworkId || !!homeworkUploadingById[homeworkId] || (!canSubmitNow && !canEnterEditMode)}
                          style={{ position: 'relative', zIndex: 2, pointerEvents: 'auto', cursor: 'pointer' }}
                        >
                          {startingHomeworkId === homeworkId
                            ? '...'
                            : homeworkUploadingById[homeworkId]
                              ? 'Uploading...'
                              : (state.expired
                                ? 'Expired'
                                : (canEnterEditMode
                                  ? `Edit (${remainingResubmitMinutes}m)`
                                  : (canResubmit
                                  ? `Resubmit (${remainingResubmitMinutes}m)`
                                  : (state.submitted ? `✅ ${state.resubmitted ? 'Resubmitted' : 'Submitted'}` : 'Submit'))))}
                        </button>
                        {lastSubmitHomeworkId === homeworkId && homeworkInfo ? (
                          <span style={{ fontSize: '11px', color: '#6b7280', maxWidth: '220px', textAlign: 'right', lineHeight: 1.35 }}>{homeworkInfo}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                        );
                      })}
                      {!homeworkCardsToShow.length ? (
                        <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                          {homeworkStatusFilter === 'submitted'
                            ? 'No submitted homework in this panel.'
                            : homeworkStatusFilter === 'not-submitted'
                              ? 'No not-submitted homework in this panel.'
                              : homeworkStatusFilter === 'overdue'
                                ? 'No overdue homework in this panel.'
                                : 'No homework in this panel.'}
                        </p>
                      ) : null}
                    </div>
                  </>
                );
              })()}
              {!panelLoading.homework && !(homeworkBySubject.get(activeView) || []).some((h) => !getHomeworkState(h).hide) ? (
                  <p style={{ color: '#999' }}>No homework assigned for this subject.</p>
                ) : null}
              {homeworkInfo ? <p className="eg-inline-note">{homeworkInfo}</p> : null}
            </article>

            {/* Subject Tests */}
            <article
              className="cardish eg-mini-card eg-grad-soft"
              style={{
                maxHeight: '78vh',
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              <h4>🧪 {activeView} Mock Tests</h4>
              {panelLoading.tests ? <p className="eg-loading">Loading tests...</p> : null}
              {panelError.tests ? <p className="eg-loading">{panelError.tests}</p> : null}
              <ul className="mini-list">
                {(testsBySubject.get(activeView) || []).map((t) => (
                  <li key={t.id} className="eg-list-with-action">
                    <span>{t.title || t.name || 'Mock Test'}</span>
                    <button className="eg-inline-btn" onClick={() => onStartTest(t.id)} disabled={startingTestId === t.id}>
                      {startingTestId === t.id ? '...' : 'Start'}
                    </button>
                  </li>
                ))}
                {!panelLoading.tests && !(testsBySubject.get(activeView) || []).length ? <li>No tests available for this subject.</li> : null}
              </ul>
              {testResult ? <p className="eg-inline-note">Last score: {String(testResult.score)} | {testResult.feedback}</p> : null}
            </article>

            {/* Subject Progress */}
            {progressBySubject.has(activeView) && (
              <article className="cardish eg-mini-card eg-progress-card eg-grad-progress">
                <h4>📊 {activeView} Progress</h4>
                <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#5b47ff', marginBottom: '10px' }}>
                  {progressBySubject.get(activeView)}%
                </div>
                <small>Average Score in {activeView}</small>
              </article>
            )}
          </section>
        )}
        </div>

        {loading ? <p className="eg-loading">Loading dashboard data...</p> : null}
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

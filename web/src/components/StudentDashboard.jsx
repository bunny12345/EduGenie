import React, { useEffect, useMemo, useRef, useState } from 'react';
import SubjectBackground, { getPalette } from './SubjectBackground';
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  checkInReward,
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
  recordOrchardActivity,
  saveSettings,
  sendChat,
  transcribeTutorAudio,
  startTest,
  submitHomework,
  generateLocalTtsAudio,
  uploadHomeworkImage,
  submitTestAttempt,
  generateCheckQuestion,
  answerCheckQuestion,
  evaluateExplainBack,
  generateLessonStory,
  completeLessonStory,
  generateQuizRush,
  submitQuizRush,
  getDueReviewNudge
} from '../api';
import StudentOrchard from './StudentOrchard';
import StudentGames from './StudentGames';
import StudentProgress from './StudentProgress';

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

// Play a short, bright "coin cling" using the Web Audio API — two quick metallic
// chimes (a fifth apart) with a fast decay. No audio asset needed, and it stays
// silent if the browser blocks audio until the first user interaction.
let _coinAudioCtx = null;
function playCoinSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!_coinAudioCtx) _coinAudioCtx = new AudioCtx();
    const ctx = _coinAudioCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    // Two chimes: B5 then E6 — the classic "ding-ding" coin pickup.
    [[987.77, 0], [1318.51, 0.08]].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(1, now + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.32);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + offset);
      osc.stop(now + offset + 0.34);
    });
  } catch { /* audio not available — fail silently */ }
}

function getScore(row) {
  const n = Number(row?.score ?? row?.metric_value ?? row?.value ?? row?.details?.score ?? row?.details?.value);
  return Number.isFinite(n) ? n : null;
}

// "#rrggbb"/"#rgb" -> "r, g, b" for use inside rgba(var(--x), alpha) in CSS.
function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (!full || Number.isNaN(num)) return '0, 0, 0';
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

/* Subject icon component — clean SVG icons for each subject */
function getSubjectTheme(subject) {
  const s = (subject || '').toLowerCase();
  const p = getPalette(subject);
  if (s.includes('math')) return { color: '#7a6b1a', bg: 'linear-gradient(135deg, #fefaed, #fdf5dc)', border: '#e8d89a', pageBg: p.bg, accent: p.accent };
  if (s.includes('science') || s.includes('physics') || s.includes('chemistry'))
    return { color: '#0a7550', bg: 'linear-gradient(135deg, #eefbf3, #e0f7ec)', border: '#a7f3d0', pageBg: p.bg, accent: p.accent };
  if (s.includes('bio')) return { color: '#166534', bg: 'linear-gradient(135deg, #dcfce7, #ecfdf5)', border: '#bbf7d0', pageBg: p.bg, accent: p.accent };
  if (s.includes('english') || s.includes('language') || s.includes('literature'))
    return { color: '#9b1d5d', bg: 'linear-gradient(135deg, #fdf2f6, #fce7f0)', border: '#f5c0d5', pageBg: p.bg, accent: p.accent };
  if (s.includes('history') || s.includes('social'))
    return { color: '#5b21b6', bg: 'linear-gradient(135deg, #f0edfb, #ede9fe)', border: '#ddd6fe', pageBg: p.bg, accent: p.accent };
  if (s.includes('hindi') || s.includes('telugu') || s.includes('sanskrit') || s.includes('urdu') || s.includes('tamil') || s.includes('kannada'))
    return { color: s.includes('hindi') || s.includes('sanskrit') || s.includes('urdu') ? '#92400e' : '#065f46',
      bg: s.includes('hindi') || s.includes('sanskrit') || s.includes('urdu') ? 'linear-gradient(135deg, #fef6ee, #fef0e0)' : 'linear-gradient(135deg, #eefbf3, #e0f7ec)',
      border: s.includes('hindi') || s.includes('sanskrit') || s.includes('urdu') ? '#e8c49e' : '#a7f3d0', pageBg: p.bg, accent: p.accent };
  if (s.includes('geo')) return { color: '#5b21b6', bg: 'linear-gradient(135deg, #f0edfb, #ede9fe)', border: '#d1c8f0', pageBg: p.bg, accent: p.accent };
  if (s.includes('computer') || s.includes('coding'))
    return { color: '#1e40af', bg: 'linear-gradient(135deg, #eef0fb, #dbeafe)', border: '#bfdbfe', pageBg: p.bg, accent: p.accent };
  return { color: '#3b3080', bg: 'linear-gradient(135deg, #f0eeff, #e8f0ff)', border: '#d4ccff', pageBg: p.bg, accent: p.accent };
}

function SubjectIcon({ subject }) {
  const s = (subject || '').toLowerCase();
  // Mathematics / Maths
  if (s.includes('math')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#5b47ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="12" x2="20" y2="12"/><line x1="12" y1="4" x2="12" y2="20"/>
      <circle cx="7" cy="7" r="1.5" fill="#5b47ff" stroke="none"/>
      <circle cx="17" cy="17" r="1.5" fill="#5b47ff" stroke="none"/>
    </svg>
  );
  // Science / Physics / Chemistry
  if (s.includes('science') || s.includes('physics') || s.includes('chemistry')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3v6l-4 8a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-4-8V3"/>
      <line x1="9" y1="3" x2="15" y2="3"/><path d="M10 14h4"/>
    </svg>
  );
  // Biology
  if (s.includes('bio')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c-4-4-8-7.5-8-11a8 8 0 0 1 16 0c0 3.5-4 7-8 11z"/>
      <path d="M12 11V6"/><path d="M9 8l3-2 3 2"/>
    </svg>
  );
  // English / Language / Literature
  if (s.includes('english') || s.includes('language') || s.includes('literature')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  );
  // History / Social
  if (s.includes('history') || s.includes('social')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
  // Hindi / Telugu / Sanskrit (language subjects)
  if (s.includes('hindi') || s.includes('telugu') || s.includes('sanskrit') || s.includes('urdu') || s.includes('tamil') || s.includes('kannada')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M8 9h8"/><path d="M8 13h5"/>
    </svg>
  );
  // Geography
  if (s.includes('geo')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a16 16 0 0 1 4 10 16 16 0 0 1-4 10"/>
      <path d="M12 2a16 16 0 0 0-4 10 16 16 0 0 0 4 10"/>
    </svg>
  );
  // Computer / IT
  if (s.includes('computer') || s.includes('coding') || s.includes('programming')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      <line x1="14" y1="4" x2="10" y2="20"/>
    </svg>
  );
  // Art / Drawing
  if (s.includes('art') || s.includes('draw')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9-10-9z"/>
      <circle cx="7.5" cy="11.5" r="1.5" fill="#f97316" stroke="none"/><circle cx="10.5" cy="7.5" r="1.5" fill="#22c55e" stroke="none"/>
      <circle cx="14.5" cy="7.5" r="1.5" fill="#ef4444" stroke="none"/><circle cx="17.5" cy="11.5" r="1.5" fill="#3b82f6" stroke="none"/>
    </svg>
  );
  // Music
  if (s.includes('music')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
  // Default — generic book icon
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#5b47ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  );
}

function SchoolServiceIcon({ type }) {
  const gifMap = {
    student: 'student-info.gif',
    fee: 'fee.gif',
    transport: 'transport.gif',
    attendance: 'attendance.gif',
    medical: 'medical-info.gif',
    room: 'my-room.gif',
    leaves: 'leaves.gif',
    query: 'technical-query.gif',
  };
  const filename = gifMap[type] || 'student-info.gif';
  return <img src={`/assets/gifs/${filename}`} alt={type} width="36" height="36" style={{ objectFit: 'contain' }} />;
}

const SCHOOL_SERVICES = [
  ['student', 'Student Info', '#6366f1', '#eef0ff'],
  ['fee', 'Fee', '#e67e22', '#fff3e2'],
  ['transport', 'Transport', '#0891b2', '#e0f7fa'],
  ['attendance', 'Attendance', '#e11d48', '#fde8ee'],
  ['medical', 'Medical Info', '#16a34a', '#e8f8ee'],
  ['room', 'My Room', '#d97706', '#fff7e6'],
  ['leaves', 'Leaves', '#2563eb', '#e8f0ff'],
  ['query', 'Technical Query', '#db2777', '#fce7f3'],
];

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

// Sidebar tabs that used to be small cards on the Home screen. They now open as
// their own focused page so Home can stay a clean overview.
const UTILITY_TABS = {
  Library: { icon: '📚', title: 'Library', sub: 'Extra reading and practice material picked for you.' },
  Calendar: { icon: '📅', title: 'Calendar', sub: 'Plan your study sessions and keep track of what is coming up.' },
  Rewards: { icon: '🏅', title: 'Rewards', sub: 'Coins and badges you have collected so far.' },
  Settings: { icon: '⚙️', title: 'Settings', sub: 'Account, privacy and appearance preferences.' },
};

export default function StudentDashboard({ studentId = 'test', onLogout }) {
  // Navigation state
  const SIDEBAR_TABS = ['Home', 'My Orchard', 'Games', 'AI Tutor', 'Homework', 'Mock Tests', 'Progress', 'Calendar', 'Rewards', 'Library', 'Settings'];
  // Parsed once so every "restore after refresh" piece of state agrees on the
  // same hash. Formats: "Home" | "Tab" | "Tab/Subject" | "AI Tutor/Subject/LessonId"
  // (legacy bare "#Mathematics" while on the Home tab still works too).
  const initialHashRaw = decodeURIComponent(window.location.hash.replace('#', ''));
  const initialHashParts = initialHashRaw.split('/');
  const initialHashTab = initialHashParts[0];
  const [activeView, setActiveView] = useState(() => {
    if (!initialHashRaw || initialHashRaw === 'Home') return 'home';
    // AI Tutor encodes its subject/lesson in parts 1/2 — activeView isn't used
    // to pick its content, so it always stays 'home' for that tab.
    if (initialHashTab === 'AI Tutor') return 'home';
    if (initialHashParts.length > 1) return initialHashParts[1];
    if (SIDEBAR_TABS.includes(initialHashRaw)) return 'home';
    return initialHashRaw;
  });
  const [activeSidebarTab, setActiveSidebarTab] = useState(() => (
    SIDEBAR_TABS.includes(initialHashTab) ? initialHashTab : 'Home'
  ));
  const [selectedSchoolService, setSelectedSchoolService] = useState(null);

  useEffect(() => {
    function onHashChange() {
      const h = decodeURIComponent(window.location.hash.replace('#', ''));
      if (!h || h === 'Home' || h === 'home') {
        setActiveSidebarTab('Home');
        setActiveView('home');
        return;
      }
      const parts = h.split('/');
      const tab = parts[0];
      if (SIDEBAR_TABS.includes(tab)) {
        setActiveSidebarTab(tab);
        if (tab === 'AI Tutor') {
          if (parts[1]) setTutorSubject(parts[1]);
          if (parts[2]) setSelectedTutorLessonId(parts[2]);
          setActiveView('home');
        } else {
          setActiveView(parts[1] || 'home');
        }
      } else {
        setActiveSidebarTab('Home');
        setActiveView(h);
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const profileDropdownRef = useRef(null);
  const [homework, setHomework] = useState([]);
  const [progress, setProgress] = useState([]);
  const [events, setEvents] = useState([]);
  const [rewards, setRewards] = useState({ coins: 0, badges: [] });
  const [coinGain, setCoinGain] = useState(null); // { id, amount } — floating "+N" highlight on the coins chip
  const prevCoinsRef = useRef(null); // last seen coin balance, to detect increases
  const [tests, setTests] = useState([]);
  const [library, setLibrary] = useState([]);
  const [learningTimeline, setLearningTimeline] = useState([]);
  const [settings, setSettings] = useState({ prefs: {} });
  const [chatHistory, setChatHistory] = useState([]);
  const [tutorSubject, setTutorSubject] = useState(() => (
    initialHashTab === 'AI Tutor' && initialHashParts[1] ? initialHashParts[1] : ''
  ));
  const [tutorLessons, setTutorLessons] = useState([]);
  const [selectedTutorLessonId, setSelectedTutorLessonId] = useState(() => (
    initialHashTab === 'AI Tutor' && initialHashParts[2] ? initialHashParts[2] : ''
  ));
  const [selectedTutorLesson, setSelectedTutorLesson] = useState(null);
  // True while we still need to confirm a subject restored from the URL hash
  // against the class's real subject list — stops the "reset to first
  // subject" effect below from clobbering it before that list has loaded.
  const restoringTutorSubjectRef = useRef(Boolean(initialHashTab === 'AI Tutor' && initialHashParts[1]));
  // Set while a flashcard deep-link is in flight so subject-change effects can't
  // reset the lesson selection or reload the wrong chat thread.
  const tutorHandoffRef = useRef(false);

  // Keep the URL hash in sync so a browser refresh lands back on the same
  // page — including the specific AI Tutor subject/lesson, or the specific
  // subject a tab like Homework is viewing.
  useEffect(() => {
    let next;
    if (activeSidebarTab === 'AI Tutor') {
      next = tutorSubject
        ? `${activeSidebarTab}/${tutorSubject}${selectedTutorLessonId ? `/${selectedTutorLessonId}` : ''}`
        : activeSidebarTab;
    } else if (activeSidebarTab === 'Home') {
      next = activeView === 'home' ? 'Home' : activeView;
    } else if (activeView !== 'home') {
      // e.g. the Homework tab viewing a specific subject — "Homework/Mathematics"
      next = `${activeSidebarTab}/${activeView}`;
    } else {
      next = activeSidebarTab;
    }
    window.location.hash = next;
  }, [activeSidebarTab, activeView, tutorSubject, selectedTutorLessonId]);

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
  const [showChatActions, setShowChatActions] = useState(false);
  const [chatImages, setChatImages] = useState([]);
  const [chatImageError, setChatImageError] = useState('');
  const [chatReadAloudId, setChatReadAloudId] = useState('');
  const [chatReadAloudSupported, setChatReadAloudSupported] = useState(false);
  const [chatReadAloudSpeed, setChatReadAloudSpeed] = useState(1);
  const [chatVoicePlayId, setChatVoicePlayId] = useState('');
  const [chatVoiceLoadingId, setChatVoiceLoadingId] = useState('');
  const [talkToSamOpen, setTalkToSamOpen] = useState(false);
  const [talkToSamRecording, setTalkToSamRecording] = useState(false);
  const [talkToSamBusy, setTalkToSamBusy] = useState(false);
  const [talkToSamTranscript, setTalkToSamTranscript] = useState('');
  const [talkToSamError, setTalkToSamError] = useState('');
  const [talkToSamSpeaking, setTalkToSamSpeaking] = useState(false);
  const [talkToSamAutoSpeak, setTalkToSamAutoSpeak] = useState(true);
  const [samSessionActive, setSamSessionActive] = useState(false);
  const samSessionActiveRef = React.useRef(false);
  const [samGesture, setSamGesture] = useState('wave');
  const samGestureTimerRef = React.useRef(null);
  const talkToSamAudioRef = React.useRef(null);
  const talkToSamAudioUrlRef = React.useRef('');
  const samSpeakQueueRef = React.useRef([]);
  const localVoiceCacheRef = React.useRef({});
  const localAudioRef = React.useRef(null);
  const localAudioUrlRef = React.useRef('');
  const talkMediaRecorderRef = React.useRef(null);
  const talkMediaStreamRef = React.useRef(null);
  const talkAudioChunksRef = React.useRef([]);
  const talkMimeTypeRef = React.useRef('audio/webm');
  const talkSilenceTimerRef = React.useRef(null);
  const talkAudioContextRef = React.useRef(null);
  const currentReadAloudRef = React.useRef({ messageId: '', text: '', languageCode: '' });
  const speechSessionRef = React.useRef(0);
  const speechVoicesRef = React.useRef([]);
  const chatRequestAbortRef = React.useRef(null);
  const chatEndRef = React.useRef(null);

  // ── Interactive Learning State ─────────────────────────────────────────
  const [checkQuestion, setCheckQuestion] = useState(null); // inline MCQ in chat
  const [checkQuestionLoading, setCheckQuestionLoading] = useState(false);
  const [checkQuestionResult, setCheckQuestionResult] = useState(null); // { correct, explanation }
  const [quizRushActive, setQuizRushActive] = useState(false);
  const [quizRushData, setQuizRushData] = useState(null); // { questions, timePerQuestion, ... }
  const [quizRushCurrentIndex, setQuizRushCurrentIndex] = useState(0);
  const [quizRushAnswers, setQuizRushAnswers] = useState([]);
  const [quizRushResult, setQuizRushResult] = useState(null);
  const [quizRushLoading, setQuizRushLoading] = useState(false);
  const [explainBackActive, setExplainBackActive] = useState(false);
  const [explainBackTopic, setExplainBackTopic] = useState('');
  const [explainBackInput, setExplainBackInput] = useState('');
  const [explainBackLoading, setExplainBackLoading] = useState(false);
  const [explainBackResult, setExplainBackResult] = useState(null);
  const [storyActive, setStoryActive] = useState(false);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyData, setStoryData] = useState(null); // { title, story }
  const [storyCompleted, setStoryCompleted] = useState(false); // already done (server or just now)
  const [storyJustCompleted, setStoryJustCompleted] = useState(false); // one-time celebration this session
  const [dueReviewNudge, setDueReviewNudge] = useState(null);

  const [testResult, setTestResult] = useState(null);
  const [homeworkInfo, setHomeworkInfo] = useState('');
  const [selectedResource, setSelectedResource] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Calendar event creation
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [calendarAdding, setCalendarAdding] = useState(false);
  const [calendarNote, setCalendarNote] = useState('');
  // Dynamic month grid — always starts on today's real month/year (never
  // hardcoded), rolls forward automatically whenever the year changes since
  // it's re-derived from `new Date()` on every mount.
  const [calendarViewMonth, setCalendarViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => toDateInputValue(new Date()));
  // Inline editing of an existing event in the Upcoming Events panel.
  const [editingEventId, setEditingEventId] = useState('');
  const [editEventTitle, setEditEventTitle] = useState('');
  const [editEventDate, setEditEventDate] = useState('');
  const [eventBusyId, setEventBusyId] = useState('');

  // Rewards earn
  const [rewardsNote, setRewardsNote] = useState('');

  // Panels load silently — nothing on screen ever announces "loading". The flag
  // below is kept only for the *first* fetch of each panel, so an empty-state
  // line ("No homework tasks assigned.") can't flash before the data has had a
  // chance to arrive. Once a panel has loaded once, every later refresh (the
  // 20s poll, a manual retry) swaps the content in place without flicker.
  const panelLoadedOnceRef = useRef({});
  const setPanelLoadingKey = (key, value) => {
    if (value && panelLoadedOnceRef.current[key]) return;
    if (!value) panelLoadedOnceRef.current[key] = true;
    setPanelLoading((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  };

  const setPanelErrorKey = (key, value) => {
    setPanelError((prev) => ({ ...prev, [key]: value }));
  };

  // Computed values for subject grouping (uses classHomework defined after subjects)
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
    // A subject exists for this student only because the school registered a
    // teacher for it in their class — there is no default set. A class with no
    // teachers therefore has no subjects, and no subject-scoped feature (tutor,
    // orchard, games, progress) has anything to show. Leftover homework, tests
    // or progress rows never add a subject back: that would show a subject the
    // class no longer has a teacher for. The backend resolves the same source.
    const seen = new Set();
    (Array.isArray(dashboard?.classTeachers) ? dashboard.classTeachers : []).forEach((t) => {
      const subj = String(t?.subject || '').trim();
      if (subj && subj.toLowerCase() !== 'general') seen.add(subj);
    });
    return Array.from(seen).sort();
  }, [dashboard]);

  // Only show homework for subjects that have a teacher in this class
  const classHomework = useMemo(() => {
    if (!subjects.length) return homework; // fallback: if no subjects loaded yet, show all
    const validSubjects = new Set(subjects.map((s) => s.toLowerCase()));
    const myClass = (dashboard?.className || '').trim().toLowerCase();
    return homework.filter((h) => {
      const subj = (h?.subject || 'General').toLowerCase();
      // Filter by class: only show homework for this student's class (or legacy untagged)
      if (myClass) {
        const hwClass = (h?.className || h?.class_name || '').trim().toLowerCase();
        if (hwClass && hwClass !== myClass) return false;
      }
      return subj === 'general' || validSubjects.has(subj);
    });
  }, [homework, subjects, dashboard]);

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

  async function loadTutorLessonsPanel(subjectOverride, lessonIdOverride) {
    const className = String(
      studentProfile?.className
      || studentProfile?.class_name
      || dashboard?.className
      || dashboard?.student?.className
      || dashboard?.student?.class_name
      || ''
    ).trim();
    const subject = String(subjectOverride || tutorSubject || '').trim();
    if (!className && !lessonIdOverride) {
      setTutorLessons([]);
      setSelectedTutorLesson(null);
      return [];
    }

    try {
      // Normal path: every lesson for the class+subject (populates the dropdown).
      // The lessonId fallback only kicks in when the class isn't resolved yet.
      const res = await listCurriculumLessons(
        className ? { className, subject } : { lessonId: lessonIdOverride }
      );
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

  function getCurrentTutorConversationId(lessonOverride, subjectOverride) {
    const normalizedSubject = String(subjectOverride || tutorSubject || 'General')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const lessonPart = String(lessonOverride?.id || selectedTutorLesson?.id || '').trim();
    return lessonPart
      ? `conv-${studentId}:subject-${normalizedSubject}:lesson-${lessonPart}`
      : `conv-${studentId}:subject-${normalizedSubject}:all-lessons`;
  }

  // Earlier builds auto-sent a scripted "welcome me and teach this lesson"
  // prompt the moment a lesson was picked. That behaviour is gone, but the
  // prompt and its reply are still stored in old conversations, so they are
  // filtered out on load — the tutor now only answers what the student asks.
  const AUTO_STARTER_RE = /^I selected the lesson ".*"( in .+)?\.\s*Please welcome me and teach in a very simple way\./i;

  function withoutAutoStarters(messages) {
    const rows = safeArray(messages);
    const kept = [];
    for (let i = 0; i < rows.length; i += 1) {
      const text = String(rows[i]?.text || rows[i]?.message || '').trim();
      if (rows[i]?.role !== 'ai' && AUTO_STARTER_RE.test(text)) {
        // Drop the scripted prompt together with the answer it produced.
        if (rows[i + 1] && rows[i + 1].role === 'ai') i += 1;
        continue;
      }
      kept.push(rows[i]);
    }
    return kept;
  }

  async function loadChatPanel(conversationIdOverride) {
    setPanelLoadingKey('chat', true);
    setPanelErrorKey('chat', '');
    try {
      const fallbackConversationId = getCurrentTutorConversationId();
      const conversationId = String(conversationIdOverride || fallbackConversationId || `conv-${studentId}`);
      const res = await getChatHistory(studentId, conversationId);
      const history = withoutAutoStarters(res?.messages);
      setChatHistory(history);
      setChatFollowups([]);

      // Auto-greeting logic: once per day per conversation
      const lesson = selectedTutorLesson;
      if (lesson?.title) {
        const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const storageKey = `sam-autogreeted:${conversationId}`;
        const lastGreeted = localStorage.getItem(storageKey) || '';

        if (lastGreeted !== todayKey) {
          localStorage.setItem(storageKey, todayKey);
          const hasHistory = history.length > 0;

          if (!hasHistory) {
            // First time ever — introduce the lesson
            setTimeout(() => {
              onSamSendMessage(
                `The student just opened the lesson "${lesson.title}" in ${lesson.subject || tutorSubject || 'this subject'} for the first time. You are Sam. Give a brief, exciting 2-3 sentence introduction of what this lesson covers and what they'll learn. Then ask if they're ready to start or if they have any specific questions. Keep it short and friendly.`,
                { hidden: true, speak: true }
              );
            }, 500);
            // This intro is the app's stand-in for "watching" the lesson (there is
            // no video) — record it once so the Orchard checklist reflects it.
            const orchardSubjectKey = String(lesson.subject || tutorSubject || '').trim().toLowerCase().replace(/\s+/g, '-');
            if (orchardSubjectKey) {
              recordOrchardActivity({ studentId, subjectKey: orchardSubjectKey, activityType: 'lesson' }).catch(() => {});
            }
          } else {
            // Returning on a new day — progress check
            setTimeout(() => {
              onSamSendMessage(
                `The student is back to continue "${lesson.title}" in ${lesson.subject || tutorSubject || 'this subject'}. You are Sam. Based on the conversation history, briefly remind them where they left off (1 sentence), then either ask a quick recall question to test their memory from last time OR ask what they'd like to focus on today. Keep it short — max 3 sentences.`,
                { hidden: true, speak: true }
              );
            }, 500);
          }
        }
        // Same day return — no auto message
      }
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
        loadChatPanel(),
        onAutoCheckIn()
      ]);
    }
    if (active) loadAll();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    if (tutorHandoffRef.current) return;
    // A lesson id was restored (from the URL hash, or mid-flight) but hasn't
    // resolved into a full lesson object yet — loading now would fetch the
    // wrong "all-lessons" conversation and a slower in-flight request could
    // later overwrite the correct history once it does resolve. Wait for the
    // lesson list to finish resolving (also covers a stale/deleted restored
    // lesson id, where selectedTutorLesson would otherwise stay null->null
    // and never re-trigger this effect), then load exactly once with the
    // right id.
    if (selectedTutorLessonId && !selectedTutorLesson) return;
    loadChatPanel(getCurrentTutorConversationId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, tutorSubject, selectedTutorLesson?.id, tutorLessons]);

  useEffect(() => {
    // Follow the class's actual subjects: pick the first one, and clear the
    // selection entirely when the class has none. Skipped once while a
    // subject restored from the URL hash is still waiting to be confirmed.
    if (!subjects.length) {
      if (tutorSubject && !restoringTutorSubjectRef.current) setTutorSubject('');
      return;
    }
    if (restoringTutorSubjectRef.current) {
      restoringTutorSubjectRef.current = false;
      if (subjects.includes(tutorSubject)) return;
    }
    if (!subjects.includes(tutorSubject)) setTutorSubject(subjects[0]);
  }, [subjects, tutorSubject]);

  useEffect(() => {
    if (tutorHandoffRef.current) return;
    if (studentProfile?.className || studentProfile?.class_name || dashboard?.student?.className || dashboard?.student?.class_name) {
      loadTutorLessonsPanel(tutorSubject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentProfile, dashboard, tutorSubject]);

  useEffect(() => {
    if (!showProfileDropdown) return;
    function handleClick(e) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) setShowProfileDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showProfileDropdown]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadDashboardPanel();
      loadHomeworkPanel();
      loadTestsPanel();
      // Progress has to poll too, otherwise the subject score cards keep
      // showing the numbers from page load while the student keeps studying.
      loadProgressPanel();
    }, 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (talkMediaRecorderRef.current && talkMediaRecorderRef.current.state !== 'inactive') {
        try { talkMediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (talkMediaStreamRef.current) {
        talkMediaStreamRef.current.getTracks().forEach((track) => {
          try { track.stop(); } catch { /* ignore */ }
        });
        talkMediaStreamRef.current = null;
      }
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

  // Fall back to the login session so the profile chip always shows the real
  // student (and their grade) even before/if the dashboard payload is thin.
  const sessionProfile = useMemo(() => {
    try {
      return JSON.parse(window.localStorage.getItem('edugenie.session') || '{}') || {};
    } catch {
      return {};
    }
  }, []);
  const greetingName = dashboard?.greetingName || sessionProfile?.name || 'Student';
  const classTeachers = Array.isArray(dashboard?.classTeachers) ? dashboard.classTeachers : [];
  const className = dashboard?.className || sessionProfile?.className || '';
  const studentGender = (dashboard?.gender || studentProfile?.gender || '').toLowerCase();
  const studentLoginId = dashboard?.loginId || studentProfile?.loginId || '';
  const schoolName = dashboard?.schoolName || '';
  const profileEmoji = studentGender === 'female' ? '👩' : studentGender === 'male' ? '👦' : '🧑';
  const streak = dashboard?.streak || {};
  const streakDays = Number(streak.days || 0);
  const streakLongest = Number(streak.longest || 0);
  const streakActiveToday = Boolean(streak.activeToday);
  const streakAtRisk = Boolean(streak.atRisk);
  const streakFreezeUsed = Boolean(streak.freezeUsed);
  const streakFreezesAvailable = Number(streak.freezesAvailable ?? 0);
  const streakMilestones = Array.isArray(streak.milestones) ? streak.milestones : [];
  const streakNextMilestone = streak.nextMilestone ?? null;
  const streakDaysToNext = streak.daysToNextMilestone ?? null;
  const coins = Number(rewards?.coins || 0);
  const badges = Array.isArray(rewards?.badges) ? rewards.badges.length : 0;

  // Whenever the coin balance climbs, flash a floating "+N" on the chip and play
  // the coin cling. We skip the very first render (initial load) so the sound
  // only fires on real earnings, not when the saved balance first appears.
  useEffect(() => {
    const prev = prevCoinsRef.current;
    prevCoinsRef.current = coins;
    if (prev === null) return; // first observed balance — don't celebrate a load
    if (coins > prev) {
      const gained = coins - prev;
      setCoinGain({ id: Date.now(), amount: gained });
      playCoinSound();
      const t = setTimeout(() => setCoinGain(null), 1600);
      return () => clearTimeout(t);
    }
  }, [coins]);

  const libraryTop = library.slice(0, 4);
  const chatHistoryTop = chatHistory.slice(-3);
  const recentLessonTimeline = useMemo(() => safeArray(learningTimeline).filter((item) => item?.scopeType === 'lesson').slice(0, 4), [learningTimeline]);
  const recentSubjectTimeline = useMemo(() => safeArray(learningTimeline).filter((item) => item?.scopeType === 'subject').slice(0, 3), [learningTimeline]);
  const announcementsTop = safeArray(dashboard?.announcements).slice(0, 4);
  const currentTheme = settings?.prefs?.theme || settings?.theme || 'Unknown';
  const currentLanguage = settings?.prefs?.language || settings?.language || 'Unknown';
  const progressSummary = useMemo(() => buildProgressSummary(progress), [progress]);
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
  const weeklyGoalPct = Math.round((Math.min(streakDays, 7) / 7) * 100);
  const sidebarItems = [
    ['🏠', 'Home'],
    ['🌳', 'My Orchard'],
    ['🎮', 'Games'],
    ['🤖', 'AI Tutor'],
    ['📝', 'Homework'],
    ['🧪', 'Mock Tests'],
    ['📈', 'Progress'],
    ['📅', 'Calendar'],
    ['🏅', 'Rewards'],
    ['📚', 'Library'],
    ['⚙️', 'Settings']
  ];
  const contentViewKey = activeSidebarTab === 'AI Tutor'
    ? 'ai-tutor-view'
    : activeSidebarTab === 'My Orchard'
      ? 'orchard-view'
      : activeSidebarTab === 'Games'
        ? 'games-view'
        : UTILITY_TABS[activeSidebarTab]
          ? `utility-view-${activeSidebarTab}`
          : (activeView === 'home' ? 'home-view' : `subject-view-${activeView}`);

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
      // Strip emojis and pictographic symbols so voice playback reads only the
      // content instead of announcing emoji names (e.g. "pizza", "seedling").
      .replace(
        /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2B05}-\u{2B07}\u{2934}\u{2935}]/gu,
        ' '
      )
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

    speechSessionRef.current += 1;
    const sessionId = speechSessionRef.current;
    synth.cancel();
    stopLocalVoicePlayback();
    currentReadAloudRef.current = { messageId: id, text, languageCode: 'en-US' };
    setChatReadAloudId(id);
    await speakSegmentsSequentially({ id: sessionId, text, languageCode: 'en-US' });
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

    // Sam has the mic — don't let a message's voice button start talking
    // over her (the button is also disabled in the JSX; this is a safety net).
    if (talkToSamSpeaking) return;

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

      const cacheKey = `${id}::en-US::${cleanText.slice(0, 160)}`;

      let cached = localVoiceCacheRef.current[cacheKey];
      if (!cached) {
        const tts = await generateLocalTtsAudio(cleanText, 'en-US', studentId, undefined, chatReadAloudSpeed);
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

    const lessons = await loadTutorLessonsPanel(subject, lessonId);
    const matchedLesson = safeArray(lessons).find((lesson) => String(lesson?.id || '') === lessonId);
    if (matchedLesson) {
      setSelectedTutorLessonId(String(matchedLesson.id || ''));
      setSelectedTutorLesson(matchedLesson);
    }
  }

  // Deep-link from a flashcard's "Ask AI" button into the AI Tutor: open the
  // matching subject + chapter and auto-send an explain request for the card.
  async function onAskTutorFromGame({ subjectName, lessonId, chapterTitle, question, answer }) {
    const subject = String(subjectName || tutorSubject || 'Science').trim() || 'Science';
    tutorHandoffRef.current = true;
    setActiveSidebarTab('AI Tutor');
    setActiveView('home');

    try {
      // Load lessons for this subject, then select the matching one by ID or title
      const lessons = await loadTutorLessonsPanel(subject, lessonId);
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const target = norm(chapterTitle);
      const matched = safeArray(lessons).find((l) => String(l?.id || '') === String(lessonId || '')) || safeArray(lessons).find((l) => {
        const t = norm(l?.title);
        return t && target && (t === target || t.includes(target) || target.includes(t));
      });
      setTutorSubject(subject);
      if (matched) {
        setSelectedTutorLessonId(String(matched.id || ''));
        setSelectedTutorLesson(matched);
      } else {
        setSelectedTutorLessonId('');
        setSelectedTutorLesson(null);
      }

      // Load the correct thread ourselves — the auto-reload effect is suppressed.
      await loadChatPanel(getCurrentTutorConversationId(matched || null, subject));

      const q = String(question || '').trim();
      const a = String(answer || '').trim();
      const prompt =
        `I'm revising the chapter "${chapterTitle}". Please explain this flashcard in simple terms `
        + `with a short example.\n\nQuestion: ${q}${a ? `\nAnswer: ${a}` : ''}`;
      await onSendTutorMessage(prompt, { lesson: matched || null, subject });
    } finally {
      tutorHandoffRef.current = false;
    }
  }

  // A flashcard chapter bonus was awarded — reflect the new balance in the top bar.
  function onGameCoinsEarned(totalCoins) {
    setRewards((prev) => ({ ...(prev || { badges: [] }), coins: Number(totalCoins || 0) }));
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

  function onStartEditEvent(ev) {
    const id = String(ev?.id || '');
    if (!id) return;
    setEditingEventId(id);
    setEditEventTitle(ev.title || '');
    setEditEventDate(toDateInputValue(parseDate(ev?.starts_at || ev?.start || ev?.created_at)) || '');
  }

  function onCancelEditEvent() {
    setEditingEventId('');
    setEditEventTitle('');
    setEditEventDate('');
  }

  async function onSaveEditEvent(e) {
    e.preventDefault();
    if (!editingEventId || !editEventTitle.trim() || !editEventDate) return;
    setEventBusyId(editingEventId);
    setPanelErrorKey('calendar', '');
    try {
      await updateCalendarEvent(editingEventId, {
        studentId,
        title: editEventTitle.trim(),
        start: new Date(editEventDate).toISOString(),
        end: new Date(editEventDate).toISOString(),
      });
      onCancelEditEvent();
      await loadCalendarPanel();
    } catch (e2) {
      setPanelErrorKey('calendar', e2?.message || 'Unable to update event.');
    } finally {
      setEventBusyId('');
    }
  }

  async function onDeleteEvent(ev) {
    const id = String(ev?.id || '');
    if (!id) return;
    setEventBusyId(id);
    setPanelErrorKey('calendar', '');
    try {
      await deleteCalendarEvent(id, studentId);
      if (editingEventId === id) onCancelEditEvent();
      await loadCalendarPanel();
    } catch (e2) {
      setPanelErrorKey('calendar', e2?.message || 'Unable to delete event.');
    } finally {
      setEventBusyId('');
    }
  }

  // Automatic daily check-in — fires once per session load. The backend
  // itself enforces "once per day" (checks for an existing check-in reward
  // dated today before crediting), so this is safe to call on every login.
  async function onAutoCheckIn() {
    try {
      const res = await checkInReward(studentId);
      if (res && res.alreadyCheckedIn === false) {
        setRewardsNote(`+10 coins for checking in today! Total: ${res?.newBalance ?? '–'}`);
        await loadRewardsPanel();
      }
    } catch {
      /* best-effort — silent, matches the rest of the app's background loads */
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

  async function onSendTutorMessage(overrideMsg, opts = {}) {
    const msg = (typeof overrideMsg === 'string' ? overrideMsg : chatInput).trim();
    if (!msg && !chatImages.length) return null;
    const targetLesson = opts?.lesson || selectedTutorLesson;
    const targetSubject = opts?.subject || targetLesson?.subject || tutorSubject;
    setChatFollowups([]);
    setChatImageError('');
    const conversationId = getCurrentTutorConversationId(targetLesson, targetSubject);
    const recentMessages = safeArray(chatHistory)
      .slice(-20)
      .map((m) => ({
        role: m?.role === 'ai' ? 'assistant' : 'user',
        content: String(m?.text || m?.message || '').trim(),
      }))
      .filter((m) => m.content);
    // Optimistically add user message (skip if hidden — e.g. auto-tutor prompt)
    const tempUserMsg = {
      id: `tmp-u-${Date.now()}`,
      role: 'user',
      text: msg || (chatImages.length ? `Please explain these ${chatImages.length} image${chatImages.length === 1 ? '' : 's'}.` : ''),
      ts: new Date().toISOString(),
      imageDataUrl: chatImages[0]?.dataUrl || '',
      imageName: chatImages[0]?.name || '',
      imageDataUrls: chatImages.map((img) => img.dataUrl),
      imageNames: chatImages.map((img) => img.name),
      lessonId: targetLesson?.id || '',
      lessonTitle: targetLesson?.title || '',
      lessonSubject: targetLesson?.subject || targetSubject,
      fromVoice: Boolean(opts?.fromVoice),
      hidden: Boolean(opts?.hidden),
    };
    if (!opts?.hidden) {
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
        targetLesson?.id || undefined,
        targetLesson?.title || undefined,
        targetLesson?.subject || targetSubject || undefined,
        abortController?.signal
      );
      // If the backend returned an error response (401/403/500 etc.), surface it
      if (!res?.reply && (res?.error || res?.message || res?.statusCode)) {
        throw new Error(res?.message || res?.error || 'Chat request failed');
      }
      // Use the reply directly from the response — much more reliable than
      // re-fetching from Supabase (which may return empty if persistence failed).
      const aiMsg = { id: `ai-${Date.now()}`, role: 'ai', text: res.reply || '…', ts: new Date().toISOString(), fromVoice: Boolean(opts?.fromVoice) };
      if (opts?.hidden) {
        // Hidden prompt (auto-tutor) — only show the AI reply, not the user prompt
        setChatHistory((prev) => [...safeArray(prev), aiMsg]);
      } else {
        setChatHistory((prev) => [
          ...safeArray(prev).filter((m) => m.id !== tempUserMsg.id),
          { ...tempUserMsg },
          aiMsg,
        ]);
      }
      // Auto-speak when Sam session is active (use ref to avoid stale closure)
      if ((samSessionActiveRef.current || opts?.speak) && res.reply) {
        speakSamResponse(res.reply, { autoListen: true });
      }
      // Show follow-up suggestions if provided
      if (Array.isArray(res?.followups) && res.followups.length) {
        setChatFollowups(res.followups);
        setShowChatActions(true);
      }
      setChatImages([]);
      loadLearningTimelinePanel();
      return { aiMsg, reply: res.reply };
    } catch (e) {
      const isAborted = e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('aborted');
      if (isAborted) {
        setPanelErrorKey('chat', '');
        return null;
      }
      // Show error inline as a bot message
      const errMsg = { id: `tmp-err-${Date.now()}`, role: 'ai', text: `⚠️ ${e?.message || 'Unable to reach AI tutor right now.'}`, ts: new Date().toISOString() };
      setChatHistory((prev) => [
        ...safeArray(prev).filter((m) => m.id !== tempUserMsg.id),
        tempUserMsg,
        errMsg
      ]);
      setPanelErrorKey('chat', e?.message || 'Unable to send chat message.');
      return null;
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

  async function blobToBase64(blob) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Unable to read audio blob'));
      reader.readAsDataURL(blob);
    });
    return String(dataUrl).split(',')[1] || '';
  }

  async function onStartTalkToSamRecording() {
    if (talkToSamRecording || talkToSamBusy) return;
    setTalkToSamError('');
    setTalkToSamTranscript('');
    // Don't let a message's voice audio bleed into the mic recording.
    stopLocalVoicePlayback();

    if (typeof window === 'undefined' || !window.navigator?.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setTalkToSamError('Voice recording is not supported on this browser.');
      return;
    }

    try {
      const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
      talkMediaStreamRef.current = stream;

      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ];
      const mimeType = supportedTypes.find((type) => window.MediaRecorder.isTypeSupported(type)) || '';
      const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      talkMimeTypeRef.current = mimeType || 'audio/webm';
      talkAudioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event?.data && event.data.size > 0) talkAudioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setTalkToSamError('Microphone recording failed. Please try again.');
        setTalkToSamRecording(false);
        cleanupSilenceDetection();
      };
      recorder.start(250); // collect data every 250ms for faster processing
      talkMediaRecorderRef.current = recorder;
      setTalkToSamRecording(true);

      // ── Silence detection using Web Audio API ──
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        talkAudioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const SILENCE_THRESHOLD = 15; // audio level below this = silence
        const SILENCE_DURATION = 1800; // ms of silence before auto-stop
        const MIN_SPEECH_DURATION = 600; // must have at least 600ms of speech before silence can trigger
        let silenceStart = null;
        let hasSpeechStarted = false;
        let speechStartTime = null;

        const checkSilence = () => {
          if (!talkMediaRecorderRef.current || talkMediaRecorderRef.current.state === 'inactive') return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;

          if (avg > SILENCE_THRESHOLD) {
            // Speech detected
            silenceStart = null;
            if (!hasSpeechStarted) {
              hasSpeechStarted = true;
              speechStartTime = Date.now();
            }
          } else if (hasSpeechStarted) {
            // Silence after speech
            const speechDuration = Date.now() - (speechStartTime || Date.now());
            if (speechDuration >= MIN_SPEECH_DURATION) {
              if (!silenceStart) {
                silenceStart = Date.now();
              } else if (Date.now() - silenceStart >= SILENCE_DURATION) {
                // Auto-stop: enough silence after speech
                cleanupSilenceDetection();
                onStopTalkToSamRecording();
                return;
              }
            }
          }

          talkSilenceTimerRef.current = requestAnimationFrame(checkSilence);
        };
        talkSilenceTimerRef.current = requestAnimationFrame(checkSilence);
      } catch { /* silence detection is optional enhancement */ }
    } catch {
      setTalkToSamError('Microphone permission denied or unavailable.');
      setTalkToSamRecording(false);
    }
  }

  function cleanupSilenceDetection() {
    if (talkSilenceTimerRef.current) {
      cancelAnimationFrame(talkSilenceTimerRef.current);
      talkSilenceTimerRef.current = null;
    }
    if (talkAudioContextRef.current) {
      try { talkAudioContextRef.current.close(); } catch { /* ignore */ }
      talkAudioContextRef.current = null;
    }
  }

  // Sam avatar gesture images
  const SAM_GESTURES = {
    wave: '/assets/sam/sam-wave.png',
    explain1: '/assets/sam/sam-explain1.png',
    explain2: '/assets/sam/sam-explain2.png',
    point: '/assets/sam/sam-point.png',
    excited: '/assets/sam/sam-excited.png',
    present: '/assets/sam/sam-present.png',
    gentle: '/assets/sam/sam-gentle.png',
    think: '/assets/sam/sam-think.png',
  };
  const SAM_TALKING_GESTURES = ['explain1', 'point', 'explain2', 'excited', 'present', 'explain1', 'point'];

  // Cycle through talking gestures while Sam is speaking
  React.useEffect(() => {
    if (talkToSamSpeaking) {
      let idx = 0;
      setSamGesture(SAM_TALKING_GESTURES[0]);
      samGestureTimerRef.current = setInterval(() => {
        idx = (idx + 1) % SAM_TALKING_GESTURES.length;
        setSamGesture(SAM_TALKING_GESTURES[idx]);
      }, 700);
    } else {
      if (samGestureTimerRef.current) {
        clearInterval(samGestureTimerRef.current);
        samGestureTimerRef.current = null;
      }
      if (talkToSamBusy || chatLoading) {
        setSamGesture('think');
      } else if (talkToSamRecording) {
        setSamGesture('gentle');
      } else if (talkToSamOpen) {
        setSamGesture('wave');
      }
    }
    return () => {
      if (samGestureTimerRef.current) {
        clearInterval(samGestureTimerRef.current);
        samGestureTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talkToSamSpeaking, talkToSamBusy, chatLoading, talkToSamRecording, talkToSamOpen]);

  // Stop any current Sam speaking audio (non-blocking — doesn't prevent input)
  function stopTalkToSamSpeaking() {
    if (talkToSamAudioRef.current) {
      try { talkToSamAudioRef.current.pause(); } catch { /* ignore */ }
      talkToSamAudioRef.current = null;
    }
    if (talkToSamAudioUrlRef.current) {
      URL.revokeObjectURL(talkToSamAudioUrlRef.current);
      talkToSamAudioUrlRef.current = '';
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
    samSpeakQueueRef.current = [];
    cleanupSilenceDetection();
    setTalkToSamSpeaking(false);
  }

  // Speak Sam's response — runs in background, auto-listens after done
  async function speakSamResponse(text, opts = {}) {
    if (!text) return;
    const cleanText = getReadAloudText(text);
    if (!cleanText) return;

    // A message's own "Play Voice" audio takes the same speakers Sam is
    // about to use — stop it so the two never overlap.
    stopLocalVoicePlayback();

    // If already speaking, queue it
    if (talkToSamAudioRef.current || (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking)) {
      samSpeakQueueRef.current.push({ text: cleanText, autoListen: opts.autoListen !== false });
      return;
    }

    async function playNext(speechText, autoListen) {
      if (!speechText) {
        setTalkToSamSpeaking(false);
        // Auto-listen after Sam finishes speaking (voice-loop)
        if (autoListen && samSessionActiveRef.current) {
          setTimeout(() => {
            if (samSessionActiveRef.current && !talkToSamBusy) {
              onStartTalkToSamRecording();
            }
          }, 400);
        }
        return;
      }
      setTalkToSamSpeaking(true);

      const onDone = () => {
        talkToSamAudioRef.current = null;
        const next = samSpeakQueueRef.current.shift();
        if (next) playNext(next.text, next.autoListen);
        else {
          setTalkToSamSpeaking(false);
          if (autoListen && samSessionActiveRef.current) {
            setTimeout(() => {
              if (samSessionActiveRef.current && !talkToSamBusy) {
                onStartTalkToSamRecording();
              }
            }, 400);
          }
        }
      };

      let played = false;
      try {
        const tts = await generateLocalTtsAudio(speechText, 'en-US', studentId, 'ash', 1.15);
        // If Sam was closed while awaiting TTS, abort playback
        if (!samSessionActiveRef.current) { setTalkToSamSpeaking(false); return; }
        const audioBase64 = String(tts?.audioBase64 || '').trim();
        if (audioBase64) {
          const blob = base64ToBlob(audioBase64, tts?.mimeType || 'audio/mpeg');
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.preload = 'auto';
          audio.playbackRate = clampSpeed(chatReadAloudSpeed);
          audio.onended = () => {
            URL.revokeObjectURL(url);
            talkToSamAudioUrlRef.current = '';
            onDone();
          };
          audio.onerror = () => onDone();
          talkToSamAudioRef.current = audio;
          talkToSamAudioUrlRef.current = url;
          await audio.play();
          played = true;
        }
      } catch { /* fallback below */ }

      // Browser SpeechSynthesis fallback
      if (!played && typeof window !== 'undefined' && window.speechSynthesis) {
        const utterance = new window.SpeechSynthesisUtterance(speechText);
        utterance.lang = 'en-US';
        utterance.rate = clampSpeed(chatReadAloudSpeed) * 1.1;
        utterance.pitch = 1.3;
        utterance.onend = () => onDone();
        utterance.onerror = () => onDone();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        played = true;
      }

      if (!played) {
        onDone();
      }
    }

    await playNext(cleanText, opts.autoListen !== false);
  }

  // Send a message as Sam's voice input — does NOT block, Sam speaks reply in background
  async function onSamSendMessage(text, opts = {}) {
    const msg = String(text || '').trim();
    if (!msg) return;
    setTalkToSamError('');

    const result = await onSendTutorMessage(msg, { fromVoice: true, speak: true, ...opts });
    return result;
  }

  // Voice recording for Sam — continuous flow
  async function onStopTalkToSamRecording() {
    const recorder = talkMediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    cleanupSilenceDetection();
    setTalkToSamBusy(true);

    try {
      const audioBlob = await new Promise((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(talkAudioChunksRef.current, { type: talkMimeTypeRef.current || 'audio/webm' });
          resolve(blob);
        };
        recorder.stop();
      });

      const stream = talkMediaStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          try { track.stop(); } catch { /* ignore */ }
        });
      }
      talkMediaStreamRef.current = null;
      talkMediaRecorderRef.current = null;
      setTalkToSamRecording(false);

      const base64 = await blobToBase64(audioBlob);
      if (!base64) throw new Error('Empty audio recording');

      const conversationId = getCurrentTutorConversationId();
      const transcription = await transcribeTutorAudio(studentId, {
        audioBase64: base64,
        mimeType: talkMimeTypeRef.current || 'audio/webm',
        lessonId: selectedTutorLesson?.id || undefined,
        lessonTitle: selectedTutorLesson?.title || undefined,
        lessonSubject: selectedTutorLesson?.subject || tutorSubject || undefined,
        conversationId,
      });

      const recognized = String(transcription?.text || '').trim();
      if (!recognized) {
        setTalkToSamError('I could not catch that. Try again!');
        return;
      }

      setTalkToSamTranscript(recognized);
      if (explainBackActive) {
        // Explain Back is open — treat the spoken answer as the explanation
        // instead of a normal chat message, and evaluate it right away.
        setTalkToSamOpen(false);
        setExplainBackInput(recognized);
        await onSubmitExplainBack(recognized);
      } else {
        await onSamSendMessage(recognized);
      }
    } catch (e) {
      setTalkToSamError(e?.message || 'Voice input failed. Please try again.');
    } finally {
      setTalkToSamBusy(false);
    }
  }

  // Toggle popup — ChatGPT voice assistant style:
  // Open → greet → auto-listen → student speaks → reply + speak → auto-listen → loop
  function onToggleTalkToSamPopup() {
    const wasOpen = talkToSamOpen;
    // A message's voice button is also disabled while opening Sam, but
    // guard here too in case this gets triggered another way.
    if (!wasOpen && (chatVoicePlayId || chatVoiceLoadingId)) return;
    setTalkToSamOpen((prev) => !prev);
    setTalkToSamError('');
    setTalkToSamTranscript('');

    if (wasOpen) {
      // Deactivate session FIRST so in-flight TTS requests abort
      setSamSessionActive(false);
      samSessionActiveRef.current = false;
      stopTalkToSamSpeaking();
      // Stop active recording & release mic
      if (talkMediaRecorderRef.current && talkMediaRecorderRef.current.state !== 'inactive') {
        try { talkMediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      talkMediaRecorderRef.current = null;
      if (talkMediaStreamRef.current) {
        talkMediaStreamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
        talkMediaStreamRef.current = null;
      }
      setTalkToSamRecording(false);
      setTalkToSamBusy(false);
    } else {
      setSamSessionActive(true);
      samSessionActiveRef.current = true;

      // Greet the student — just voice, no chat message generated
      const studentName = localStorage.getItem('studentName') || 'there';
      const topic = selectedTutorLesson?.title || '';
      let greeting;
      if (topic) {
        greeting = `Hey ${studentName}! Ready to continue with ${topic}? Ask me anything or just say "teach me" and I'll start!`;
      } else {
        greeting = `Hey ${studentName}! I'm Sam, your study buddy. What would you like to learn today?`;
      }
      // Speak greeting, then auto-start listening when done
      setTimeout(() => speakSamResponse(greeting, { autoListen: true }), 300);
    }
  }

  // Mic toggle — press to start, press again to stop & send
  async function onTalkToSamPrimaryAction() {
    if (talkToSamBusy) return;
    if (talkToSamRecording) {
      await onStopTalkToSamRecording();
      return;
    }
    await onStartTalkToSamRecording();
  }

  // ── Interactive Learning Handlers ───────────────────────────────────────

  async function onRequestCheckQuestion() {
    if (checkQuestionLoading) return;
    setCheckQuestion(null);
    setCheckQuestionResult(null);
    setCheckQuestionLoading(true);
    try {
      const conversationId = getCurrentTutorConversationId();
      const res = await generateCheckQuestion(
        studentId,
        conversationId,
        selectedTutorLesson?.id,
        selectedTutorLesson?.title,
        selectedTutorLesson?.subject || tutorSubject
      );
      if (res?.checkQuestion) {
        setCheckQuestion(res.checkQuestion);
      }
    } catch (e) {
      console.warn('check question generation failed', e);
    } finally {
      setCheckQuestionLoading(false);
    }
  }

  async function onAnswerCheckQuestion(selectedIndex) {
    if (!checkQuestion) return;
    const correct = selectedIndex === checkQuestion.correctIndex;
    setCheckQuestionResult({ correct, explanation: checkQuestion.explanation, selectedIndex });
    // Record the answer → grows orchard
    try {
      await answerCheckQuestion(studentId, {
        questionId: checkQuestion.id,
        selectedIndex,
        correctIndex: checkQuestion.correctIndex,
        question: checkQuestion.question,
        correctAnswer: checkQuestion.options[checkQuestion.correctIndex] || '',
        explanation: checkQuestion.explanation,
        lessonId: selectedTutorLesson?.id,
        subject: selectedTutorLesson?.subject || tutorSubject,
      });
    } catch { /* best-effort */ }
    // Add the result as a chat message for context
    const resultText = correct
      ? `✅ Correct! ${checkQuestion.explanation || 'Great job!'}`
      : `❌ Not quite. The answer is ${checkQuestion.options[checkQuestion.correctIndex]}. ${checkQuestion.explanation || ''}`;
    setChatHistory((prev) => [...safeArray(prev), {
      id: `cq-result-${Date.now()}`,
      role: 'ai',
      text: resultText,
      ts: new Date().toISOString(),
    }]);
  }

  function onDismissCheckQuestion() {
    setCheckQuestion(null);
    setCheckQuestionResult(null);
  }

  async function onStartQuizRush() {
    if (quizRushLoading) return;
    setQuizRushLoading(true);
    setQuizRushResult(null);
    setQuizRushAnswers([]);
    setQuizRushCurrentIndex(0);
    try {
      const res = await generateQuizRush(studentId, {
        lessonId: selectedTutorLesson?.id,
        lessonTitle: selectedTutorLesson?.title,
        subject: selectedTutorLesson?.subject || tutorSubject,
        count: 5,
      });
      if (res?.questions?.length) {
        setQuizRushData(res);
        setQuizRushActive(true);
      }
    } catch (e) {
      console.warn('quiz rush generation failed', e);
    } finally {
      setQuizRushLoading(false);
    }
  }

  function onQuizRushAnswer(selectedIndex) {
    if (!quizRushData) return;
    const question = quizRushData.questions[quizRushCurrentIndex];
    if (!question) return;
    const correct = selectedIndex === question.correctIndex;
    const answer = { questionId: question.id, selectedIndex, correct, question: question.question, correctAnswer: question.options[question.correctIndex] || '', explanation: question.explanation };
    setQuizRushAnswers((prev) => [...prev, answer]);
    if (quizRushCurrentIndex < quizRushData.questions.length - 1) {
      setQuizRushCurrentIndex((prev) => prev + 1);
    } else {
      // Quiz done — submit results
      const allAnswers = [...quizRushAnswers, answer];
      const score = allAnswers.filter((a) => a.correct).length;
      const total = allAnswers.length;
      setQuizRushResult({ score, total, answers: allAnswers });
      // Submit to backend → orchard growth
      submitQuizRush(studentId, {
        quizId: quizRushData.quizId,
        subject: quizRushData.subject || selectedTutorLesson?.subject || tutorSubject,
        lessonId: quizRushData.lessonId || selectedTutorLesson?.id,
        score,
        total,
        results: allAnswers.map((a) => ({
          question: a.question,
          correctAnswer: a.correctAnswer,
          selectedIndex: a.selectedIndex,
          correctIndex: quizRushData.questions.find((q) => q.id === a.questionId)?.correctIndex || 0,
          correct: a.correct,
          explanation: a.explanation,
        })),
      }).catch(() => {});
    }
  }

  function onCloseQuizRush() {
    setQuizRushActive(false);
    setQuizRushData(null);
    setQuizRushResult(null);
    setQuizRushAnswers([]);
    setQuizRushCurrentIndex(0);
  }

  function onStartExplainBack(topic) {
    setExplainBackActive(true);
    setExplainBackTopic(topic || selectedTutorLesson?.title || 'what we just covered');
    setExplainBackInput('');
    setExplainBackResult(null);
  }

  async function onSubmitExplainBack(overrideText) {
    const textToSubmit = String(overrideText || explainBackInput || '').trim();
    if (!textToSubmit || explainBackLoading) return;
    setExplainBackInput(textToSubmit);
    setExplainBackLoading(true);
    try {
      const res = await evaluateExplainBack(studentId, {
        explanation: textToSubmit,
        topic: explainBackTopic,
        conversationId: getCurrentTutorConversationId(),
        lessonId: selectedTutorLesson?.id,
        subject: selectedTutorLesson?.subject || tutorSubject,
      });
      if (res?.evaluation) {
        setExplainBackResult(res.evaluation);
        // Add result to chat
        const emoji = res.evaluation.passedCheck ? '🌟' : '💪';
        const feedbackMsg = `${emoji} **Explain Back Result**: ${res.evaluation.feedback}\nStrengths: ${(res.evaluation.strengths || []).join(', ') || 'N/A'}\nAreas to work on: ${(res.evaluation.gaps || []).join(', ') || 'None!'}`;
        setChatHistory((prev) => [...safeArray(prev), {
          id: `eb-result-${Date.now()}`,
          role: 'ai',
          text: feedbackMsg,
          ts: new Date().toISOString(),
        }]);
      }
    } catch (e) {
      console.warn('explain back failed', e);
    } finally {
      setExplainBackLoading(false);
    }
  }

  function onCloseExplainBack() {
    setExplainBackActive(false);
    setExplainBackResult(null);
    setExplainBackInput('');
  }

  async function onStartStory() {
    if (storyLoading) return;
    setStoryActive(true);
    setStoryData(null);
    setStoryCompleted(false);
    setStoryJustCompleted(false);
    setStoryLoading(true);
    try {
      const res = await generateLessonStory(studentId, {
        lessonId: selectedTutorLesson?.id,
        lessonTitle: selectedTutorLesson?.title,
        subject: selectedTutorLesson?.subject || tutorSubject,
      });
      if (res?.success) {
        setStoryData({ title: res.title, story: res.story });
        setStoryCompleted(Boolean(res.completed));
      }
    } catch (e) {
      console.warn('story generation failed', e);
    } finally {
      setStoryLoading(false);
    }
  }

  async function onFinishStory() {
    setStoryJustCompleted(true);
    setStoryCompleted(true);
    try {
      await completeLessonStory(studentId, {
        lessonId: selectedTutorLesson?.id,
        subject: selectedTutorLesson?.subject || tutorSubject,
      });
    } catch (e) {
      console.warn('story completion failed', e);
    }
  }

  function onCloseStory() {
    setStoryActive(false);
    setStoryData(null);
    setStoryCompleted(false);
    setStoryJustCompleted(false);
  }

  // Load due review nudge when tutor opens
  React.useEffect(() => {
    if (activeSidebarTab === 'AI Tutor' && studentId) {
      getDueReviewNudge(studentId, selectedTutorLesson?.subject || tutorSubject)
        .then((res) => {
          if (res?.nudgeMessage) setDueReviewNudge(res);
          else setDueReviewNudge(null);
        })
        .catch(() => {});
    }
  }, [activeSidebarTab, studentId, tutorSubject, selectedTutorLesson?.id]);

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
            <div className="eg-ai-speed-control" title={`Voice speed: ${getSpeedLabel(chatReadAloudSpeed)}`}>
              <label htmlFor="eg-ai-speed-range">Speed</label>
              <input
                id="eg-ai-speed-range"
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
            <select value={tutorSubject} onChange={(e) => setTutorSubject(e.target.value)} className="eg-ai-select" disabled={!subjects.length}>
              {subjects.length
                ? subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)
                : <option value="">No subjects yet</option>}
            </select>
            <select
              value={selectedTutorLessonId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedTutorLessonId(nextId);
                setSelectedTutorLesson(tutorLessons.find((lesson) => String(lesson.id || '') === String(nextId)) || null);
              }}
              className="eg-ai-select"
            >
              <option value="">Select a lesson</option>
              {tutorLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
            </select>
          </div>
          <small className="eg-ai-scope-note">
            {studentProfile?.className || studentProfile?.class_name
              ? `Visible lessons for ${studentProfile?.className || studentProfile?.class_name}`
              : 'Your class profile is loading.'}
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
        {safeArray(chatHistory).filter((m) => !m?.hidden).map((m, idx) => {
          const messageId = String(m?.id || m?.ts || `msg-${idx}`);
          const messageText = m?.text || m?.message || '';
          const isBot = m?.role !== 'user';
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
                  disabled={(Boolean(chatVoiceLoadingId) && !isVoicePlaying) || (talkToSamSpeaking && !isVoicePlaying)}
                  title={talkToSamSpeaking && !isVoicePlaying ? 'Sam is talking — wait for her to finish' : 'Play local server-generated voice audio'}
                >
                  {isVoiceLoading ? 'Generating Voice...' : (isVoicePlaying ? 'Stop Voice' : 'Play Voice')}
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
      {/* ── Collapsible suggestions & actions toggle ──────────────────── */}
      {!chatLoading && chatHistory.length > 0 && !quizRushActive && !explainBackActive && !storyActive ? (
        <div className="eg-ai-actions-wrap">
          <button
            type="button"
            className={`eg-ai-actions-toggle ${showChatActions ? 'is-open' : ''}`}
            onClick={() => setShowChatActions((v) => !v)}
          >
            <span className="eg-ai-actions-toggle-icon">💡</span>
            <span>{showChatActions ? 'Hide suggestions' : 'Suggestions & Actions'}</span>
            <span className={`eg-ai-actions-caret ${showChatActions ? 'open' : ''}`}>▾</span>
          </button>
          {showChatActions && (
            <div className="eg-ai-actions-panel">
              {chatFollowups.length > 0 ? (
                <div className="eg-ai-followups">
                  {chatFollowups.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      className="eg-ai-followup-btn"
                      onClick={() => { onSendTutorMessage(f); setShowChatActions(false); }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="eg-ai-interactive-actions">
                <button
                  type="button"
                  className="eg-ai-action-btn eg-ai-action-quiz"
                  onClick={onRequestCheckQuestion}
                  disabled={checkQuestionLoading}
                >
                  {checkQuestionLoading ? '⏳ Generating...' : '🧠 Quiz Me'}
                </button>
                <button
                  type="button"
                  className="eg-ai-action-btn eg-ai-action-explain"
                  onClick={onStartExplainBack}
                >
                  🗣️ Explain Back
                </button>
                <button
                  type="button"
                  className="eg-ai-action-btn eg-ai-action-rush"
                  onClick={onStartQuizRush}
                  disabled={quizRushLoading}
                >
                  {quizRushLoading ? '⏳ Loading...' : '⚡ Quiz Rush'}
                </button>
                <button
                  type="button"
                  className="eg-ai-action-btn eg-ai-action-story"
                  onClick={onStartStory}
                  disabled={storyLoading}
                >
                  {storyLoading ? '⏳ Writing...' : '📖 Story Mode'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Due Review Nudge ─────────────────────────────────────────── */}
      {dueReviewNudge?.nudgeMessage && !chatLoading ? (
        <div className="eg-ai-nudge">
          <span>📋 {dueReviewNudge.nudgeMessage}</span>
          <button type="button" className="eg-ai-nudge-btn" onClick={() => { setDueReviewNudge(null); onSendTutorMessage('Review my due flashcards'); }}>
            Start Review
          </button>
          <button type="button" className="eg-ai-nudge-dismiss" onClick={() => setDueReviewNudge(null)}>✕</button>
        </div>
      ) : null}

      {/* ── Inline Check Question Card ───────────────────────────────── */}
      {checkQuestion && !checkQuestionResult ? (
        <div className="eg-ai-check-card">
          <div className="eg-ai-check-header">
            <span>🧠 Quick Check</span>
            <button type="button" className="eg-ai-check-dismiss" onClick={onDismissCheckQuestion}>✕</button>
          </div>
          <p className="eg-ai-check-question">{checkQuestion.question}</p>
          <div className="eg-ai-check-options">
            {checkQuestion.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                className="eg-ai-check-option"
                onClick={() => onAnswerCheckQuestion(i)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {checkQuestion && checkQuestionResult ? (
        <div className={`eg-ai-check-card ${checkQuestionResult.correct ? 'eg-check-correct' : 'eg-check-wrong'}`}>
          <div className="eg-ai-check-header">
            <span>{checkQuestionResult.correct ? '✅ Correct!' : '❌ Not quite'}</span>
            <button type="button" className="eg-ai-check-dismiss" onClick={onDismissCheckQuestion}>✕</button>
          </div>
          <p className="eg-ai-check-explanation">{checkQuestionResult.explanation}</p>
          {!checkQuestionResult.correct ? (
            <p className="eg-ai-check-note">A flashcard was auto-created for review 📚</p>
          ) : null}
        </div>
      ) : null}

      {/* ── Explain Back Panel ───────────────────────────────────────── */}
      {explainBackActive ? (
        <div className="eg-ai-explain-back-panel">
          <div className="eg-ai-check-header">
            <span>🗣️ Explain Back: <strong>{explainBackTopic}</strong></span>
            <button type="button" className="eg-ai-check-dismiss" onClick={onCloseExplainBack}>✕</button>
          </div>
          <p className="eg-ai-explain-prompt">Explain in your own words what you learned about this topic. The AI will evaluate your understanding!</p>
          <p className="eg-ai-explain-hint">💬 Type your explanation here, or tap the 🎙️ Sam button below to answer by voice instead.</p>
          {!explainBackResult ? (
            <>
              <textarea
                className="eg-ai-explain-textarea"
                value={explainBackInput}
                onChange={(e) => setExplainBackInput(e.target.value)}
                placeholder="Type your explanation here..."
                rows={4}
              />
              <button
                type="button"
                className="eg-ai-action-btn eg-ai-action-explain"
                onClick={() => onSubmitExplainBack()}
                disabled={!explainBackInput.trim() || explainBackLoading}
              >
                {explainBackLoading ? '⏳ Evaluating...' : '📤 Submit Explanation'}
              </button>
            </>
          ) : (
            <div className="eg-ai-explain-result">
              <div className="eg-ai-explain-score">
                <strong>Score: {explainBackResult.score}/5</strong>
                <span>{explainBackResult.passedCheck ? '🌳 Orchard watered!' : '💪 Keep trying!'}</span>
              </div>
              <p>{explainBackResult.feedback}</p>
              {explainBackResult.strengths?.length ? <p className="eg-ai-explain-strengths">✅ {explainBackResult.strengths.join(', ')}</p> : null}
              {explainBackResult.gaps?.length ? <p className="eg-ai-explain-gaps">📝 Work on: {explainBackResult.gaps.join(', ')}</p> : null}
              <button type="button" className="eg-ai-action-btn" onClick={onCloseExplainBack}>Done</button>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Story Mode panel ─────────────────────────────────────────── */}
      {storyActive ? (
        <div className="eg-ai-story-panel">
          <div className="eg-ai-check-header">
            <span>📖 {storyData?.title || 'Story Mode'}</span>
            <button type="button" className="eg-ai-check-dismiss" onClick={onCloseStory}>✕</button>
          </div>
          {storyLoading ? (
            <p className="eg-ai-explain-prompt">Writing your story...</p>
          ) : storyData ? (
            <>
              {storyCompleted && !storyJustCompleted ? (
                <p className="eg-ai-explain-hint">✅ You've already completed this story.</p>
              ) : null}
              <p className="eg-ai-story-text">{storyData.story}</p>
              {!storyCompleted ? (
                <button type="button" className="eg-ai-action-btn eg-ai-action-story" onClick={onFinishStory}>
                  ✅ I finished the story!
                </button>
              ) : storyJustCompleted ? (
                <div className="eg-ai-explain-result">
                  <div className="eg-ai-explain-score">
                    <span>🌳 Orchard watered!</span>
                  </div>
                  <button type="button" className="eg-ai-action-btn" onClick={onCloseStory}>Done</button>
                </div>
              ) : (
                <button type="button" className="eg-ai-action-btn" onClick={onCloseStory}>Close</button>
              )}
            </>
          ) : (
            <p className="eg-ai-explain-prompt">Could not write a story right now — try again in a moment.</p>
          )}
        </div>
      ) : null}

      {/* ── Quiz Rush Modal ──────────────────────────────────────────── */}
      {quizRushActive && quizRushData ? (
        <div className="eg-ai-quiz-rush-panel">
          <div className="eg-ai-check-header">
            <span>⚡ Quiz Rush — {quizRushData.subject || 'General'}</span>
            <button type="button" className="eg-ai-check-dismiss" onClick={onCloseQuizRush}>✕</button>
          </div>
          {!quizRushResult ? (
            <div className="eg-ai-quiz-rush-body">
              <div className="eg-ai-quiz-progress">
                Question {quizRushCurrentIndex + 1} of {quizRushData.questions.length}
              </div>
              <p className="eg-ai-check-question">
                {quizRushData.questions[quizRushCurrentIndex]?.question}
              </p>
              <div className="eg-ai-check-options">
                {(quizRushData.questions[quizRushCurrentIndex]?.options || []).map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    className="eg-ai-check-option"
                    onClick={() => onQuizRushAnswer(i)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="eg-ai-quiz-rush-result">
              <div className="eg-ai-quiz-score">
                <strong>{quizRushResult.score}/{quizRushResult.total}</strong>
                <span>{quizRushResult.score >= Math.ceil(quizRushResult.total / 2) ? '🎉 Passed! Orchard watered!' : '💪 Keep practicing!'}</span>
              </div>
              <div className="eg-ai-quiz-answers">
                {quizRushResult.answers.map((a, i) => (
                  <div key={i} className={`eg-ai-quiz-answer-row ${a.correct ? 'correct' : 'wrong'}`}>
                    <span>{a.correct ? '✅' : '❌'}</span>
                    <span className="eg-ai-quiz-answer-q">{a.question}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="eg-ai-action-btn" onClick={onCloseQuizRush}>Done</button>
            </div>
          )}
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
            e.target.value = '';
          }}
          disabled={chatLoading}
        />
        {/* Talk to Sam floating bubble */}
        <div className={`eg-talk-sam-wrap ${talkToSamOpen ? 'open' : ''} ${talkToSamRecording ? 'recording' : ''} ${talkToSamSpeaking ? 'speaking' : ''}`}>
          <button
            type="button"
            className={`eg-talk-sam-mic ${talkToSamRecording ? 'recording' : ''} ${talkToSamSpeaking ? 'speaking' : ''} ${talkToSamOpen ? 'active' : ''}`}
            onClick={onToggleTalkToSamPopup}
            aria-expanded={talkToSamOpen}
            aria-label="Talk to Sam"
            disabled={!talkToSamOpen && (Boolean(chatVoicePlayId) || Boolean(chatVoiceLoadingId))}
            title={!talkToSamOpen && (chatVoicePlayId || chatVoiceLoadingId) ? 'A message is playing its voice — wait for it to finish' : 'Talk to Sam'}
          >
            <svg className="eg-talk-sam-mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            {(talkToSamRecording || talkToSamSpeaking) && (
              <div className="eg-talk-sam-waveform">
                <span className="eg-wave-bar" style={{ animationDelay: '0ms' }}></span>
                <span className="eg-wave-bar" style={{ animationDelay: '120ms' }}></span>
                <span className="eg-wave-bar" style={{ animationDelay: '240ms' }}></span>
                <span className="eg-wave-bar" style={{ animationDelay: '360ms' }}></span>
                <span className="eg-wave-bar" style={{ animationDelay: '480ms' }}></span>
              </div>
            )}
            <span className="eg-talk-sam-label">Sam</span>
          </button>
          {/* Sam Interactive Panel */}
          {talkToSamOpen && (
            <div className="eg-talk-sam-pop" role="dialog" aria-label="Talk to Sam">
              {/* Sam anime avatar — DISABLED for now, enable later with better images */}
              {/* <div className={`eg-sam-avatar-container ${talkToSamSpeaking ? 'speaking' : ''} ${(talkToSamBusy || chatLoading) ? 'thinking' : ''}`}>
                <img
                  src={SAM_GESTURES[samGesture] || SAM_GESTURES.wave}
                  alt="Sam"
                  className="eg-sam-avatar-img"
                  draggable={false}
                />
              </div> */}
              <div className="eg-talk-sam-header">
                <div className="eg-talk-sam-avatar-ring">
                  <span className="eg-talk-sam-avatar">🎓</span>
                </div>
                <div className="eg-talk-sam-header-text">
                  <p className="eg-talk-sam-title">Sam</p>
                  <p className="eg-talk-sam-sub">
                    {selectedTutorLesson
                      ? `Teaching: ${selectedTutorLesson.title}`
                      : tutorSubject || 'Your AI Study Buddy'}
                  </p>
                </div>
                <div className="eg-talk-sam-header-actions">
                  {talkToSamSpeaking && (
                    <button type="button" className="eg-talk-sam-mute" onClick={stopTalkToSamSpeaking} title="Mute Sam">
                      🔇
                    </button>
                  )}
                  <button type="button" className="eg-talk-sam-close" onClick={onToggleTalkToSamPopup} aria-label="Close">×</button>
                </div>
              </div>
              {/* Status bar — shows what Sam/student is doing */}
              <div className={`eg-talk-sam-status-bar ${talkToSamRecording ? 'recording' : ''} ${talkToSamSpeaking ? 'speaking' : ''} ${talkToSamBusy ? 'thinking' : ''}`}>
                <div className="eg-talk-sam-status-waves">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <span key={i} className="eg-talk-sam-wave-line" style={{ animationDelay: `${i * 50}ms` }}></span>
                  ))}
                </div>
                <span className="eg-talk-sam-status-label">
                  {talkToSamRecording ? '🎙️ Listening... (speak, I\'ll auto-detect when you stop)'
                    : talkToSamSpeaking ? '🔊 Sam is talking...'
                    : (talkToSamBusy || chatLoading) ? '💭 Sam is thinking...'
                    : samSessionActive ? '✨ Sam is ready'
                    : '🎤 Start a conversation'}
                </span>
              </div>
              {/* Transcript of last voice input */}
              {talkToSamTranscript && (
                <div className="eg-talk-sam-transcript">
                  <span className="eg-talk-sam-transcript-label">You said:</span>
                  <span className="eg-talk-sam-transcript-text">"{talkToSamTranscript}"</span>
                </div>
              )}
              {talkToSamError && (
                <div className="eg-talk-sam-error-wrap">
                  <p className="eg-talk-sam-error">{talkToSamError}</p>
                  <button
                    type="button"
                    className="eg-talk-sam-retry-btn"
                    onClick={() => { setTalkToSamError(''); onStartTalkToSamRecording(); }}
                    disabled={talkToSamBusy || talkToSamRecording}
                  >
                     Try Again
                  </button>
                </div>
              )}
              {/* Voice control — use main chat input for text replies */}
              <div className="eg-talk-sam-input-area">
                <p className="eg-talk-sam-hint">
                  {talkToSamRecording
                    ? 'Speak now — I\'ll hear when you\'re done'
                    : 'Sam will listen automatically after speaking'}
                </p>
                {talkToSamRecording && (
                  <button
                    type="button"
                    className="eg-talk-sam-voice-btn-large recording"
                    onClick={onTalkToSamPrimaryAction}
                    title="Stop & send now"
                  >
                    ⏹️ Send Now
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
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
            {tutorSubject
              ? `Choose an available ${tutorSubject} lesson from the dropdown above — Sam will start a focused session just for that lesson.`
              : 'Choose a subject and lesson from the dropdowns above — Sam will start a focused session just for that lesson.'}
          </p>
        </div>
      )}
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

  // Library / Calendar / Rewards / Settings each get their own page instead of a
  // cramped tile on Home.
  const utilityMeta = UTILITY_TABS[activeSidebarTab];
  const utilityPanel = utilityMeta ? (
    <section className="eg-utility">
      <header className="eg-utility-head">
        <span className="eg-utility-icon" aria-hidden="true">{utilityMeta.icon}</span>
        <div>
          <h1>{utilityMeta.title}</h1>
          <p>{utilityMeta.sub}</p>
        </div>
      </header>

      {activeSidebarTab === 'Library' ? (
        <article className="cardish eg-utility-card">
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
      ) : null}

      {activeSidebarTab === 'Calendar' ? (
        <div className="eg-calendar-layout">
        <article className="cardish eg-utility-card eg-calendar-page">
          {panelError.calendar ? <p className="eg-loading">{panelError.calendar}</p> : null}
          {(() => {
            const today = new Date();
            const todayIso = toDateInputValue(today);
            const { year, month } = calendarViewMonth;
            const firstDay = new Date(year, month, 1);
            const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0 … Sun=6
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthLabel = firstDay.toLocaleString(undefined, { month: 'long', year: 'numeric' });
            const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

            // Group every event by its calendar day for quick lookup.
            const eventsByDate = {};
            safeArray(events).forEach((ev) => {
              const d = toDateInputValue(parseDate(ev?.starts_at || ev?.start || ev?.created_at));
              if (!d) return;
              (eventsByDate[d] = eventsByDate[d] || []).push(ev);
            });

            const cells = [];
            for (let i = 0; i < startOffset; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(d);

            const selectedEvents = eventsByDate[calendarSelectedDate] || [];

            return (
              <>
                <div className="eg-cal-head">
                  <button
                    type="button"
                    className="eg-cal-nav-btn"
                    onClick={() => setCalendarViewMonth(({ year: y, month: m }) => {
                      const d = new Date(y, m - 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    })}
                  >‹</button>
                  <div className="eg-cal-head-title">
                    <strong>{monthLabel}</strong>
                    <button
                      type="button"
                      className="eg-cal-today-btn"
                      onClick={() => {
                        setCalendarViewMonth({ year: today.getFullYear(), month: today.getMonth() });
                        setCalendarSelectedDate(todayIso);
                      }}
                    >Today</button>
                  </div>
                  <button
                    type="button"
                    className="eg-cal-nav-btn"
                    onClick={() => setCalendarViewMonth(({ year: y, month: m }) => {
                      const d = new Date(y, m + 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    })}
                  >›</button>
                </div>

                <div className="eg-cal-weekdays">
                  {DAY_LABELS.map((lbl) => <span key={lbl}>{lbl}</span>)}
                </div>

                <div className="eg-cal-grid">
                  {cells.map((day, idx) => {
                    if (!day) return <span key={`e-${idx}`} className="eg-cal-cell eg-cal-cell-empty" />;
                    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayEvents = eventsByDate[iso] || [];
                    const isToday = iso === todayIso;
                    const isSelected = iso === calendarSelectedDate;
                    return (
                      <button
                        type="button"
                        key={iso}
                        className={`eg-cal-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${dayEvents.length ? 'has-events' : ''}`}
                        onClick={() => {
                          // Selecting a day previews its events AND pre-fills the
                          // Add Event date — the student can still change it manually.
                          setCalendarSelectedDate(iso);
                          setNewEventDate(iso);
                        }}
                      >
                        <span className="eg-cal-cell-num">{day}</span>
                        {dayEvents.length > 0 && <span className="eg-cal-cell-dot" />}
                      </button>
                    );
                  })}
                </div>

                <div className="eg-cal-events">
                  <h4>{calendarSelectedDate === todayIso ? 'Today' : new Date(`${calendarSelectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h4>
                  <ul className="mini-list">
                    {selectedEvents.map((e) => (
                      <li key={e.id}>{e.title || e.event_type || 'Study Session'}</li>
                    ))}
                    {!panelLoading.calendar && !selectedEvents.length ? <li>No events on this day.</li> : null}
                  </ul>
                </div>
              </>
            );
          })()}
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

        <article className="cardish eg-utility-card eg-cal-upcoming">
          <h3>📌 Upcoming Events</h3>
          {(() => {
            const todayIso = toDateInputValue(new Date());
            // Visible from creation until the end of their own day, then gone.
            const upcoming = safeArray(events)
              .filter((ev) => {
                const d = toDateInputValue(parseDate(ev?.starts_at || ev?.start || ev?.created_at));
                return d && d >= todayIso;
              })
              .sort((a, b) => new Date(a.starts_at || a.start || a.created_at) - new Date(b.starts_at || b.start || b.created_at));

            if (!panelLoading.calendar && !upcoming.length) {
              return <p className="eg-cal-upcoming-empty">No upcoming events. Add one from the calendar!</p>;
            }

            return (
              <ul className="eg-cal-upcoming-list">
                {upcoming.map((ev) => {
                  const isEditing = editingEventId === String(ev.id);
                  const busy = eventBusyId === String(ev.id);
                  const d = parseDate(ev?.starts_at || ev?.start || ev?.created_at);
                  const dIso = toDateInputValue(d);
                  const isToday = dIso === todayIso;
                  if (isEditing) {
                    return (
                      <li key={ev.id} className="eg-cal-upcoming-item is-editing">
                        <form className="eg-cal-edit-form" onSubmit={onSaveEditEvent}>
                          <input
                            className="eg-inline-input"
                            value={editEventTitle}
                            onChange={(ex) => setEditEventTitle(ex.target.value)}
                            placeholder="Event title"
                            required
                          />
                          <input
                            className="eg-inline-input"
                            type="date"
                            value={editEventDate}
                            onChange={(ex) => setEditEventDate(ex.target.value)}
                            required
                          />
                          <div className="eg-cal-edit-actions">
                            <button type="submit" className="eg-inline-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
                            <button type="button" className="eg-inline-btn" onClick={onCancelEditEvent} disabled={busy}>Cancel</button>
                          </div>
                        </form>
                      </li>
                    );
                  }
                  return (
                    <li key={ev.id} className="eg-cal-upcoming-item">
                      <div className="eg-cal-upcoming-info">
                        <strong>{ev.title || ev.event_type || 'Study Session'}</strong>
                        <span className={isToday ? 'is-today' : ''}>{isToday ? 'Today' : d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : ''}</span>
                      </div>
                      <div className="eg-cal-upcoming-actions">
                        <button type="button" className="eg-icon-btn" onClick={() => onStartEditEvent(ev)} disabled={busy} title="Edit event">✏️</button>
                        <button type="button" className="eg-icon-btn" onClick={() => onDeleteEvent(ev)} disabled={busy} title="Delete event">{busy ? '…' : '🗑️'}</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </article>
        </div>
      ) : null}

      {activeSidebarTab === 'Rewards' ? (
        <article className="cardish eg-utility-card">
          {panelError.rewards ? <p className="eg-loading">{panelError.rewards}</p> : null}
          <p className="eg-reward-big">{coins} Coins</p>
          <p>{badges} badges earned</p>
          {rewardsNote ? <p className="eg-inline-note">{rewardsNote}</p> : null}
        </article>
      ) : null}

      {activeSidebarTab === 'Settings' ? (
        <article className="cardish eg-utility-card">
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
      ) : null}
    </section>
  ) : null;

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

        <button type="button" className="eg-side-logout" onClick={onLogout}>
          <span className="eg-nav-icon" aria-hidden="true">🚪</span>
          Logout
        </button>
      </aside>

      <div className={`eg-main ${activeSidebarTab === 'AI Tutor' ? 'eg-main-ai' : ''}`}>
        {activeSidebarTab !== 'AI Tutor' && (
        <header className="eg-topbar cardish">
          <div className="eg-search">Search for topics, tests, books...</div>
          <div className="eg-top-actions">
            <button
              type="button"
              className={`eg-streak-chip ${streakDays > 0 ? 'is-active' : 'is-zero'} ${streakActiveToday ? 'done-today' : 'pending-today'} ${streakAtRisk ? 'at-risk' : ''}`}
              onClick={() => setActiveSidebarTab('Rewards')}
              title={
                streakDays > 0
                  ? `${streakDays}-day learning streak${streakActiveToday ? ' — done today! ✅' : ' — ⚠️ study today or you\'ll lose it!'}`
                    + `${streakFreezeUsed ? '  ·  ❄️ A freeze saved a missed day' : streakFreezesAvailable > 0 ? '  ·  ❄️ 1 freeze ready (protects one missed day)' : ''}`
                    + `${streakLongest > streakDays ? `  ·  🏆 Best: ${streakLongest} days` : ''}`
                    + `${streakNextMilestone ? `  ·  ${streakDaysToNext} day(s) to your ${streakNextMilestone}-day badge` : ''}`
                  : 'Start your learning streak today! Do any lesson, homework, test or orchard task.'
              }
            >
              <span className="eg-streak-flame" aria-hidden="true">🔥</span>
              <span className="eg-streak-count">{streakDays}</span>
              <span className="eg-streak-word">day{streakDays === 1 ? '' : 's'}</span>
              {streakDays > 0 && (streakFreezesAvailable > 0 || streakFreezeUsed) && (
                <span
                  key={streakFreezesAvailable > 0 ? 'freeze-ready' : 'freeze-spent'}
                  className={`eg-streak-freeze ${streakFreezesAvailable > 0 ? 'is-ready' : 'is-spent'}`}
                  aria-hidden="true"
                  title={streakFreezesAvailable > 0 ? 'Streak freeze ready — protects one missed day' : 'Freeze used up — it saved a missed day'}
                >❄️</span>
              )}
            </button>
            <button
              type="button"
              className={`eg-coins-chip ${coins > 0 ? 'is-active' : 'is-zero'} ${coinGain ? 'is-gaining' : ''}`}
              onClick={() => setActiveSidebarTab('Rewards')}
              title={`${coins} coins earned — finish flashcard chapters (+100), tests and daily check-ins to collect more`}
            >
              <span className="eg-coin-medallion" aria-hidden="true">
                <span className="eg-coin-face">★</span>
              </span>
              <span className="eg-coins-count" key={`coins-${coins}`}>{coins}</span>
              <span className="eg-coins-word">coins</span>
              {coinGain && (
                <span className="eg-coins-delta" key={coinGain.id} aria-hidden="true">+{coinGain.amount}</span>
              )}
            </button>
            <span className="pill">🏅 {badges}</span>
            <div className="eg-profile-chip" ref={profileDropdownRef} onClick={() => setShowProfileDropdown((v) => !v)} style={{ cursor: 'pointer', position: 'relative' }}>
              <div className="eg-profile-avatar">{profileEmoji}</div>
              <div className="eg-profile-meta">
                <strong>Hi, {greetingName}</strong>
                <span>{className ? `Student · ${className}` : 'Student'}</span>
              </div>
              <span className={`eg-profile-caret ${showProfileDropdown ? 'open' : ''}`}>▾</span>
              {showProfileDropdown && (
                <div className="eg-profile-dropdown">
                  <div className="eg-profile-dropdown-avatar">{profileEmoji}</div>
                  <strong className="eg-profile-dropdown-name">{greetingName}</strong>
                  {schoolName && <span className="eg-profile-dropdown-school">🏫 {schoolName}</span>}
                  <div className="eg-profile-dropdown-details">
                    {className && <span><strong>Class:</strong> {className}</span>}
                    {studentGender && <span><strong>Gender:</strong> {studentGender.charAt(0).toUpperCase() + studentGender.slice(1)}</span>}
                    {studentLoginId && <span><strong>Login ID:</strong> {studentLoginId}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        )}

        {/* Subject Navigation — polished icon cards, shown when viewing a specific subject */}
        {activeSidebarTab !== 'My Orchard' && activeSidebarTab !== 'Games' && activeSidebarTab !== 'Progress' && activeSidebarTab !== 'AI Tutor' && !UTILITY_TABS[activeSidebarTab] && activeView !== 'home' && (
        <div className="eg-subject-nav-cards">
          <button
            className="eg-subject-nav-back"
            onClick={() => setActiveView('home')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
            Home
          </button>
          <div className="eg-subject-nav-scroll">
            {safeArray(subjects).map((subject) => {
              const theme = getSubjectTheme(subject);
              const notifyCount = getSubjectNotifications(subject);
              const isActive = activeView === subject;
              return (
                <button
                  key={subject}
                  className={`eg-subject-nav-chip ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveView(subject)}
                  style={{
                    '--subject-glow': theme.accent,
                    '--subject-glow-rgb': hexToRgb(theme.accent),
                    ...(isActive ? { background: theme.bg, borderColor: theme.color + '55' } : {}),
                  }}
                >
                  <span className="eg-subject-nav-chip-icon" style={isActive ? { background: theme.color + '18' } : {}}>
                    <SubjectIcon subject={subject} />
                  </span>
                  <span className="eg-subject-nav-chip-label" style={isActive ? { color: theme.color } : {}}>{subject}</span>
                  {notifyCount > 0 && (
                    <span className="eg-subject-pill-badge">{notifyCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {panelError.dashboard ? <p className="eg-loading">{panelError.dashboard}</p> : null}

        <div key={contentViewKey} className={`eg-view-shell ${activeSidebarTab === 'AI Tutor' ? 'eg-view-ai' : 'eg-view-standard'}`}>
        {activeSidebarTab === 'AI Tutor' ? (
          tutorPanel
        ) : activeSidebarTab === 'My Orchard' ? (
          <StudentOrchard studentId={studentId} greetingName={greetingName} />
        ) : activeSidebarTab === 'Games' ? (
          <StudentGames studentId={studentId} greetingName={greetingName} onAskTutor={onAskTutorFromGame} onCoinsEarned={onGameCoinsEarned} />
        ) : activeSidebarTab === 'Progress' ? (
          <StudentProgress studentId={studentId} greetingName={greetingName} />
        ) : utilityPanel ? (
          utilityPanel
        ) : activeView === 'home' ? (
          <>
            <section className="eg-main-grid eg-main-grid-home">
              <div className="eg-left-stack">
              <section className="cardish eg-hero-card eg-grad-hero eg-home-glass">
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

                <div className="eg-streak-split">
                  <div className={`eg-streak-box ${streakActiveToday ? 'done-today' : ''} ${streakAtRisk ? 'at-risk' : ''}`}>
                    <h4>Current Streak {streakActiveToday ? '✅' : ''}</h4>
                    <strong>{streakDays}</strong>
                    <span>Day{streakDays === 1 ? '' : 's'} 🔥</span>

                    {/* At-risk nudge — reminder to study today before losing the streak */}
                    {streakAtRisk && (
                      <div className="eg-streak-nudge">
                        {streakFreezesAvailable > 0
                          ? <>Study today to keep your streak! <span className="eg-streak-nudge-freeze">❄️ A freeze will protect it once.</span></>
                          : 'Study today or your streak resets!'}
                      </div>
                    )}

                    {/* Freeze status */}
                    {streakDays > 0 && !streakAtRisk && (
                      <div className="eg-streak-freeze-line">
                        {streakFreezeUsed
                          ? '❄️ A freeze saved a missed day'
                          : streakFreezesAvailable > 0
                            ? '❄️ Freeze ready — one missed day is protected'
                            : ''}
                      </div>
                    )}

                    {/* Milestone badges 7 / 30 / 100 */}
                    <div className="eg-streak-badges">
                      {streakMilestones.map((m) => (
                        <span
                          key={m.days}
                          className={`eg-streak-badge ${m.earned ? 'earned' : 'locked'}`}
                          title={m.earned ? `${m.label} — ${m.days}-day badge earned!` : `${m.label} — reach ${m.days} days to unlock`}
                        >
                          <span className="eg-streak-badge-icon">{m.earned ? m.icon : '🔒'}</span>
                          <small>{m.days}d</small>
                        </span>
                      ))}
                    </div>

                    {/* Next milestone progress */}
                    {streakNextMilestone && (
                      <div className="eg-streak-next">
                        <div className="eg-streak-next-bar">
                          <span style={{ width: `${Math.min(100, Math.round((streakDays / streakNextMilestone) * 100))}%` }} />
                        </div>
                        <small>{streakDaysToNext} day{streakDaysToNext === 1 ? '' : 's'} to your {streakNextMilestone}-day badge</small>
                      </div>
                    )}

                    {streakLongest > 0 && <div className="eg-streak-sub"><small>🏆 Best: {streakLongest} day{streakLongest === 1 ? '' : 's'}</small></div>}
                  </div>

                  <div className="eg-goal-box">
                    <h4>Weekly Goal</h4>
                    <div className="eg-goal-ring" style={{ background: `conic-gradient(#ffd23f ${weeklyGoalPct * 3.6}deg, #f3ecd6 ${weeklyGoalPct * 3.6}deg)` }}>
                      <div className="eg-goal-ring-inner">
                        <div>{weeklyGoalPct}%</div>
                      </div>
                    </div>
                    <span className="eg-goal-box-sub">{Math.min(streakDays, 7)}/7 days this week</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="eg-home-summary-row">
              <article className="cardish eg-home-summary-card eg-home-glass">
                <h4>📝 Homework</h4>
                {panelError.homework ? <p className="eg-loading">{panelError.homework}</p> : null}
                {(() => {
                  const subjectsWithPending = [...new Set((Array.isArray(classHomework) ? classHomework : []).map((h) => h?.subject || 'General'))]
                    .map((subj) => ({
                      subj,
                      count: classHomework.filter((h) => (h.subject || 'General') === subj && !getHomeworkState(h).submitted && !getHomeworkState(h).hide).length,
                    }))
                    .filter((row) => row.count > 0)
                    .slice(0, 5);

                  if (!panelLoading.homework && !subjectsWithPending.length) {
                    return <p className="eg-home-no-hw">🎉 No homework assigned for today. Have fun!</p>;
                  }

                  return (
                    <ul className="mini-list">
                      {subjectsWithPending.map(({ subj, count }) => (
                        <li key={subj} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => setActiveView(subj)}>
                          <span style={{ color: '#5b47ff', fontWeight: 600 }}>📚 {subj}</span>
                          <span className="eg-home-pending">{count} pending</span>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </article>

              <article className="cardish eg-home-summary-card eg-home-glass">
                <h4>Announcements</h4>
                {panelError.dashboard ? <p className="eg-loading">{panelError.dashboard}</p> : null}
                <ul className="mini-list bullets">
                  {safeArray(announcementsTop).map((a) => (
                    <li key={a.id || `${a.title}-${a.createdAt}`}><strong>{a.title || 'Announcement'}:</strong> {a.message || 'No details'}</li>
                  ))}
                  {!panelLoading.dashboard && !announcementsTop.length ? <li>No announcements yet.</li> : null}
                </ul>
              </article>
            </section>

            <section className="eg-subject-row">
              {panelError.progress ? <p className="eg-loading">{panelError.progress}</p> : null}
              {safeArray(subjects).map((subj) => {
                const progressEntry = safeArray(progressSummary).find((p) => p.subject === subj);
                const score = progressEntry?.score ?? null;
                const teacher = classTeachers.find((t) => t.subject === subj);
                const teacherName = teacher?.name || '';
                const scoreLabel = score !== null ? (score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Keep Practicing') : '';
                const subjectTheme = getSubjectTheme(subj);
                return (
                  <article
                    key={subj}
                    className="cardish eg-subject-card eg-home-glass"
                    onClick={() => setActiveView(subj)}
                    style={{
                      cursor: 'pointer',
                      borderColor: subjectTheme.border,
                      position: 'relative',
                      overflow: 'hidden',
                      '--subject-glow': subjectTheme.accent,
                      '--subject-glow-rgb': hexToRgb(subjectTheme.accent),
                    }}
                  >
                    <div className="eg-subject-card-icon" style={{ background: subjectTheme.color + '15' }}>
                      <SubjectIcon subject={subj} />
                    </div>
                    <div className="eg-subject-card-info">
                      <h4>{subj}</h4>
                      {score !== null && <strong>{score}%</strong>}
                      {scoreLabel && <span className="eg-subject-score-label">{scoreLabel}</span>}
                      {teacherName && <small className="eg-subject-teacher">{teacherName}</small>}
                    </div>
                    <div className="eg-subject-card-arrow">›</div>
                  </article>
                );
              })}
              {!safeArray(subjects).length && !panelLoading.progress ? <p className="eg-loading">No subjects yet.</p> : null}
            </section>

            <section className="cardish eg-reco-card eg-grad-reco eg-home-glass">
              <div>
                <h3>Academics</h3>
                <p>Quick access to your learning tools</p>
              </div>
              <div className="eg-academ-grid">
                <button className="eg-academ-card" onClick={() => onSidebarNavClick('AI Tutor')}>
                  <div className="eg-academ-icon" style={{ background: '#eef0ff' }}>
                    <img src="/assets/gifs/ai-tutor.gif" alt="AI Tutor" width="36" height="36" style={{ objectFit: 'contain' }} />
                  </div>
                  <span>AI Tutor</span>
                </button>
                <button className="eg-academ-card" onClick={() => onSidebarNavClick('Homework')}>
                  <div className="eg-academ-icon" style={{ background: '#fef3e2' }}>
                    <img src="/assets/gifs/homework.gif" alt="Homework" width="36" height="36" style={{ objectFit: 'contain' }} />
                  </div>
                  <span>Homework</span>
                </button>
                <button className="eg-academ-card" onClick={() => onSidebarNavClick('My Orchard')}>
                  <div className="eg-academ-icon" style={{ background: '#e8f8ee' }}>
                    <img src="/assets/gifs/my-orchard.gif" alt="My Orchard" width="36" height="36" style={{ objectFit: 'contain' }} />
                  </div>
                  <span>My Orchard</span>
                </button>
                <button className="eg-academ-card" onClick={() => onSidebarNavClick('Mock Tests')}>
                  <div className="eg-academ-icon" style={{ background: '#fde8ee' }}>
                    <img src="/assets/gifs/mock-tests.gif" alt="Mock Tests" width="36" height="36" style={{ objectFit: 'contain' }} />
                  </div>
                  <span>Mock Tests</span>
                </button>
                <button className="eg-academ-card" onClick={() => onSidebarNavClick('Progress')}>
                  <div className="eg-academ-icon" style={{ background: '#e0f2fe' }}>
                    <img src="/assets/gifs/progress.gif" alt="Progress" width="36" height="36" style={{ objectFit: 'contain' }} />
                  </div>
                  <span>Progress</span>
                </button>
                <button className="eg-academ-card" onClick={() => onSidebarNavClick('Games')}>
                  <div className="eg-academ-icon" style={{ background: '#fef9e7' }}>
                    <img src="/assets/gifs/games.gif" alt="Games" width="36" height="36" style={{ objectFit: 'contain' }} />
                  </div>
                  <span>Games</span>
                </button>
                <button className="eg-academ-card" onClick={() => onSidebarNavClick('Calendar')}>
                  <div className="eg-academ-icon" style={{ background: '#f0e6ff' }}>
                    <img src="/assets/gifs/calendar.gif" alt="Calendar" width="36" height="36" style={{ objectFit: 'contain' }} />
                  </div>
                  <span>Calendar</span>
                </button>
                <button className="eg-academ-card" onClick={() => onSidebarNavClick('Rewards')}>
                  <div className="eg-academ-icon" style={{ background: '#fff7ed' }}>
                    <img src="/assets/gifs/rewards.gif" alt="Rewards" width="36" height="36" style={{ objectFit: 'contain' }} />
                  </div>
                  <span>Rewards</span>
                </button>
                <button className="eg-academ-card" onClick={() => onSidebarNavClick('Library')}>
                  <div className="eg-academ-icon" style={{ background: '#ecfdf5' }}>
                    <img src="/assets/gifs/library.gif" alt="Library" width="36" height="36" style={{ objectFit: 'contain' }} />
                  </div>
                  <span>Library</span>
                </button>
              </div>
            </section>
            <section className="cardish eg-services-card eg-home-glass">
              <div className="eg-services-heading">
                <div>
                  <h3>School Services</h3>
                  <p>Helpful school tools, customizable to your school</p>
                </div>
                {selectedSchoolService ? <button type="button" className="eg-services-close" onClick={() => setSelectedSchoolService(null)} aria-label="Close service details">✕</button> : null}
              </div>
              <div className="eg-services-grid">
                {SCHOOL_SERVICES.map(([type, label, color, background]) => (
                  <button
                    key={type}
                    type="button"
                    className={`eg-service-card${selectedSchoolService?.label === label ? ' is-selected' : ''}`}
                    onClick={() => setSelectedSchoolService({ label, color })}
                  >
                    <span className="eg-service-icon" style={{ color, background }}><SchoolServiceIcon type={type} /></span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              {selectedSchoolService ? (
                <div className="eg-service-demo-panel" style={{ borderColor: `${selectedSchoolService.color}44` }}>
                  <strong>{selectedSchoolService.label}</strong>
                  <span>This school service is ready to be customized for your school requirements.</span>
                  <small>For now, this is a client demo preview. Your school can define the fields, approvals, notifications, and workflows.</small>
                </div>
              ) : null}
            </section>
          </div>
        </section>

        <section className="eg-bottom-grid eg-home-legacy-summary">
          <article className="cardish eg-mini-card eg-grad-soft eg-home-glass">
            <h4>📝 Homework</h4>
            {panelError.homework ? <p className="eg-loading">{panelError.homework}</p> : null}
            <ul className="mini-list">
              {/* Home page: show subject name only — tap to go to subject page */}
              {[...new Set((Array.isArray(classHomework) ? classHomework : []).map((h) => h?.subject || 'General'))].slice(0, 5).map((subj) => {
                const count = classHomework.filter((h) => (h.subject || 'General') === subj && !getHomeworkState(h).submitted && !getHomeworkState(h).hide).length;
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
              {!panelLoading.homework && !classHomework.length ? <li>No homework assigned.</li> : null}
            </ul>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '6px' }}>Tap a subject to see full details →</p>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft eg-home-glass">
            <h4>Announcements</h4>
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

          <article className="cardish eg-mini-card eg-voice-card eg-grad-voice eg-home-glass">
            <h4>AI Voice Assistant</h4>
            <div className="eg-mic">
              <svg viewBox="0 0 64 64" width="42" height="42" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <radialGradient id="micHead" cx="50%" cy="40%" r="50%">
                    <stop offset="0%" stopColor="#e8e8e8"/>
                    <stop offset="60%" stopColor="#c0c0c0"/>
                    <stop offset="100%" stopColor="#808080"/>
                  </radialGradient>
                  <linearGradient id="micStand" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#999"/>
                    <stop offset="30%" stopColor="#ddd"/>
                    <stop offset="50%" stopColor="#f5f5f5"/>
                    <stop offset="70%" stopColor="#ddd"/>
                    <stop offset="100%" stopColor="#999"/>
                  </linearGradient>
                </defs>
                {/* Mic head - round mesh grille */}
                <circle cx="32" cy="22" r="14" fill="url(#micHead)" stroke="#666" strokeWidth="0.8"/>
                {/* Mesh pattern - horizontal */}
                <path d="M20 18 Q32 16 44 18" fill="none" stroke="#777" strokeWidth="0.4" opacity="0.7"/>
                <path d="M19 22 Q32 20 45 22" fill="none" stroke="#777" strokeWidth="0.4" opacity="0.7"/>
                <path d="M20 26 Q32 24 44 26" fill="none" stroke="#777" strokeWidth="0.4" opacity="0.7"/>
                {/* Mesh pattern - vertical */}
                <path d="M26 9 Q25 22 26 35" fill="none" stroke="#777" strokeWidth="0.4" opacity="0.5"/>
                <path d="M32 8 Q32 22 32 36" fill="none" stroke="#777" strokeWidth="0.4" opacity="0.5"/>
                <path d="M38 9 Q39 22 38 35" fill="none" stroke="#777" strokeWidth="0.4" opacity="0.5"/>
                {/* Highlight / shine on head */}
                <ellipse cx="27" cy="17" rx="5" ry="6" fill="rgba(255,255,255,0.25)"/>
                {/* Ring connector */}
                <rect x="28" y="35" width="8" height="3" rx="1.5" fill="#aaa" stroke="#888" strokeWidth="0.5"/>
                {/* Stand pole */}
                <rect x="30" y="38" width="4" height="14" rx="2" fill="url(#micStand)" stroke="#888" strokeWidth="0.4"/>
                {/* Stand shine */}
                <rect x="31.2" y="39" width="1.5" height="12" rx="0.75" fill="rgba(255,255,255,0.4)"/>
                {/* Base */}
                <ellipse cx="32" cy="54" rx="9" ry="3.5" fill="url(#micStand)" stroke="#777" strokeWidth="0.6"/>
                <ellipse cx="32" cy="53" rx="9" ry="3" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5"/>
              </svg>
            </div>
            <p>How can I help you today?</p>
            <button className="eg-mini-btn">Tap to Speak</button>
          </article>
        </section>
        </>
        ) : (() => {
          const subjectTheme = getSubjectTheme(activeView);
          return (
          <section
            className="eg-subject-page eg-subject-themed"
            onClick={(e) => {
              if (e.target === e.currentTarget && homeworkStatusFilter !== 'all') {
                setHomeworkStatusFilter('all');
              }
            }}
            style={{
              position: 'relative',
              overflow: 'hidden',
              '--subject-glow': subjectTheme.accent,
              '--subject-glow-rgb': hexToRgb(subjectTheme.accent),
            }}
          >
            {/* Full-page decorative SVG background */}
            <SubjectBackground subject={activeView} />

            {/* Subject header banner */}
            <div className="eg-subject-header eg-subject-glass-card" style={{ borderColor: subjectTheme.border + '66', position: 'relative', zIndex: 1 }}>
              <div className="eg-subject-header-icon" style={{ background: subjectTheme.color + '18' }}>
                <SubjectIcon subject={activeView} />
              </div>
              <div className="eg-subject-header-text">
                <h2 style={{ margin: 0, color: subjectTheme.color }}>{activeView}</h2>
                <p style={{ margin: 0, fontSize: '13px', color: subjectTheme.color + 'aa' }}>Homework & Tests</p>
              </div>
            </div>

            <div className="eg-subject-page-grid" style={{ position: 'relative', zIndex: 1 }}>
            {/* Subject Homework — full details */}
            <article className="cardish eg-subject-hw-card eg-subject-glass-card">
              <div className="eg-subject-section-head">
                <svg viewBox="0 0 24 24" fill="none" stroke={subjectTheme.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <h4>{activeView} Homework</h4>
                <button
                  type="button"
                  className="eg-inline-btn"
                  onClick={() => setShowHomeworkHistory((prev) => !prev)}
                  style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
                >
                  {showHomeworkHistory ? 'Hide history' : 'Open history'}
                </button>
              </div>
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
                                    {Array.isArray(h.lessonTitles) && h.lessonTitles.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '2px' }}>
                                        {h.lessonTitles.map((lt, ltIdx) => (
                                          <span key={ltIdx} style={{ background: '#eef2ff', color: '#4338ca', borderRadius: '999px', padding: '2px 7px', fontSize: '10px', fontWeight: 600 }}>📖 {lt}</span>
                                        ))}
                                      </div>
                                    )}
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
                  <div key={homeworkId || h.title} className="eg-hw-item-card" style={{
                    background: state.overdue && !state.submitted ? '#fff1f2' : '#f8f8ff', padding: '14px',
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
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap', cursor: 'pointer', padding: '8px 12px' }}
                          title="Click to view teacher instructions and assigned images"
                        >
                          <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{h.title || 'Homework Task'}</div>
                          {Array.isArray(h.lessonTitles) && h.lessonTitles.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {h.lessonTitles.map((lt, ltIdx) => (
                                <span key={ltIdx} style={{ background: '#eef2ff', color: '#4338ca', borderRadius: '999px', padding: '2px 8px', fontSize: '10px', fontWeight: 600 }}>
                                  📖 {lt}
                                </span>
                              ))}
                            </div>
                          )}
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
            <div className="eg-subject-sidebar">
            <article className="cardish eg-subject-test-card eg-subject-glass-card">
              <div className="eg-subject-section-head">
                <svg viewBox="0 0 24 24" fill="none" stroke={subjectTheme.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 14l2 2 4-4"/></svg>
                <h4>{activeView} Mock Tests</h4>
              </div>
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
              <article className="cardish eg-subject-progress-card eg-subject-glass-card">
                <div className="eg-subject-section-head">
                  <svg viewBox="0 0 24 24" fill="none" stroke={subjectTheme.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  <h4>{activeView} Progress</h4>
                </div>
                <div className="eg-subject-progress-score" style={{ color: subjectTheme.color }}>
                  {progressBySubject.get(activeView)}%
                </div>
                <small style={{ color: '#6b7280' }}>Average Score</small>
              </article>
            )}
            </div>
            </div>
          </section>
        );})()}
        </div>
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
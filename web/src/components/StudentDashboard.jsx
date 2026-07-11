import React, { useEffect, useMemo, useState } from 'react';
import {
  createCalendarEvent,
  earnReward,
  getCalendar,
  getChatHistory,
  getDashboard,
  getHomework,
  getHomeworkAttempts,
  getLibrary,
  getLibraryResource,
  getProgress,
  getRewards,
  getSettings,
  getTestAttempt,
  getTests,
  recordProgress,
  saveSettings,
  sendChat,
  startTest,
  submitHomework,
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
  const bySubject = new Map();
  rows.forEach((r) => {
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
  return rows.map(getScore).filter((n) => n !== null).slice(-7);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getHomeworkState(h) {
  const due = parseDate(h?.dueAt || h?.due_at || h?.createdAt || h?.created_at);
  const submitted = String(h?.status || '').toLowerCase() === 'submitted' || String(h?.status || '').toLowerCase() === 'graded';
  if (submitted) return { submitted: true, overdue: false, expired: false, hide: false, label: 'Submitted', color: '#16a34a', bg: '#dcfce7' };
  if (!due) return { submitted: false, overdue: false, expired: false, hide: false, label: 'Pending', color: '#6b7280', bg: '#f3f4f6' };
  const daysSinceDue = Math.floor((Date.now() - due.getTime()) / (24 * 60 * 60 * 1000));
  const overdue = daysSinceDue >= 0;
  const expired = daysSinceDue > 3;
  if (expired) return { submitted: false, overdue: true, expired: true, hide: true, label: `Expired ${daysSinceDue}d overdue`, color: '#b91c1c', bg: '#fee2e2' };
  if (overdue) return { submitted: false, overdue: true, expired: false, hide: false, label: `Overdue ${daysSinceDue}d`, color: '#b45309', bg: '#ffedd5' };
  return { submitted: false, overdue: false, expired: false, hide: false, label: 'Pending', color: '#6b7280', bg: '#f3f4f6' };
}

function Sparkline({ values }) {
  const width = 180;
  const height = 64;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * (width - 10) + 5;
    const y = height - 6 - ((v - min) / span) * (height - 16);
    return `${x},${y}`;
  });
  const last = pts[pts.length - 1].split(',');

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
    chat: false
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
    chat: ''
  });

  const [dashboard, setDashboard] = useState(null);
  const [homework, setHomework] = useState([]);
  const [progress, setProgress] = useState([]);
  const [events, setEvents] = useState([]);
  const [rewards, setRewards] = useState({ coins: 0, badges: [] });
  const [tests, setTests] = useState([]);
  const [library, setLibrary] = useState([]);
  const [settings, setSettings] = useState({ prefs: {} });
  const [chatHistory, setChatHistory] = useState([]);

  const [startingTestId, setStartingTestId] = useState('');
  const [startingHomeworkId, setStartingHomeworkId] = useState('');
  const [homeworkAttachmentUrl, setHomeworkAttachmentUrl] = useState({});
  const [homeworkUploadingById, setHomeworkUploadingById] = useState({});
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
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

  async function loadHomeworkPanel() {
    setPanelLoadingKey('homework', true);
    setPanelErrorKey('homework', '');
    try {
      const res = await getHomework(studentId);
      setHomework(safeArray(res?.homework));
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

  async function loadChatPanel() {
    setPanelLoadingKey('chat', true);
    setPanelErrorKey('chat', '');
    try {
      const res = await getChatHistory(studentId);
      setChatHistory(safeArray(res?.messages));
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
        loadDashboardPanel(),
        loadHomeworkPanel(),
        loadProgressPanel(),
        loadCalendarPanel(),
        loadRewardsPanel(),
        loadTestsPanel(),
        loadLibraryPanel(),
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
    const timer = setInterval(() => {
      loadDashboardPanel();
      loadHomeworkPanel();
      loadTestsPanel();
    }, 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const greetingName = dashboard?.greetingName || 'Student';
  const streakDays = Number(dashboard?.streak?.days || 0);
  const coins = Number(rewards?.coins || 0);
  const badges = Array.isArray(rewards?.badges) ? rewards.badges.length : 0;

  const eventsTop = events.slice(0, 3);
  const testsTop = tests.slice(0, 3);
  const libraryTop = library.slice(0, 4);
  const chatHistoryTop = chatHistory.slice(-3);
  const announcementsTop = safeArray(dashboard?.announcements).slice(0, 4);
  const currentTheme = settings?.prefs?.theme || settings?.theme || 'Unknown';
  const currentLanguage = settings?.prefs?.language || settings?.language || 'Unknown';
  const progressSummary = useMemo(() => buildProgressSummary(progress), [progress]);
  const trend = useMemo(() => buildTrendPoints(progress), [progress]);
  const weeklyGoalPct = 75;

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

  async function onSubmitHomework(hwId) {
    if (!hwId) return;
    setStartingHomeworkId(hwId);
    try {
      const sub = await submitHomework(
        hwId,
        studentId,
        { summary: 'Completed in UI flow' },
        homeworkAttachmentUrl[hwId] || null
      );
      const at = await getHomeworkAttempts(hwId, studentId);
      const count = Array.isArray(at?.attempts) ? at.attempts.length : 0;
      const grade = sub?.grade ?? null;
      setHomeworkInfo(`Submitted. Attempts: ${count}. Last grade: ${grade ?? '-'}`);
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
      await Promise.all([loadHomeworkPanel(), loadProgressPanel()]);
      setHomeworkAttachmentUrl((prev) => ({ ...prev, [hwId]: '' }));
    } catch (e) {
      setHomeworkInfo('Submit failed');
      setPanelErrorKey('homework', e?.message || 'Submit failed.');
    } finally {
      setStartingHomeworkId('');
    }
  }

  async function onStudentHomeworkFileSelected(hwId, file) {
    if (!file) return;
    setHomeworkUploadingById((prev) => ({ ...prev, [hwId]: true }));
    setHomeworkInfo('Uploading homework image...');
    try {
      const res = await uploadHomeworkImage(file);
      if (!res?.url) throw new Error('Upload failed');
      setHomeworkAttachmentUrl((prev) => ({ ...prev, [hwId]: res.url }));
      setHomeworkInfo('Homework image uploaded.');
    } catch (e) {
      setHomeworkInfo(e?.message || 'Homework image upload failed');
    } finally {
      setHomeworkUploadingById((prev) => ({ ...prev, [hwId]: false }));
    }
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

  async function onSendTutorMessage() {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatLoading(true);
    setPanelErrorKey('chat', '');
    try {
      const res = await sendChat(studentId, msg, 'Friendly', `conv-${studentId}`);
      const hist = await getChatHistory(studentId, res?.conversationId || `conv-${studentId}`);
      setChatHistory(safeArray(hist?.messages));
      setChatInput('');
    } catch (e) {
      setPanelErrorKey('chat', e?.message || 'Unable to send chat message.');
    } finally {
      setChatLoading(false);
    }
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
          {[
            ['🏠', 'Home'],
            ['🤖', 'AI Tutor'],
            ['📝', 'Homework'],
            ['🧪', 'Mock Tests'],
            ['📈', 'Progress'],
            ['📅', 'Calendar'],
            ['🏅', 'Rewards'],
            ['📚', 'Library'],
            ['⚙️', 'Settings']
          ].map(([icon, item], i) => (
            <button key={item} className={`eg-nav-item ${i === 0 ? 'active' : ''}`}>
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
          {subjects.map((subject) => {
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

        {activeView === 'home' ? (
          <>
            <section className="eg-main-grid">
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
                    {[...new Set(homework.map((h) => h.subject || 'General'))].slice(0, 4).map((subj) => (
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
              {progressSummary.map((s) => (
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
                {libraryTop.slice(0, 4).map((t) => (
                  <span key={t.id || t.title}>{t.title || t.summary || 'Learning Resource'}</span>
                ))}
                {!panelLoading.library && !libraryTop.length ? <span>No recommendations yet.</span> : null}
              </div>
            </section>
          </div>

          <section className="cardish eg-ai-panel eg-grad-ai">
            <div className="eg-ai-head">
              <h3>AI Tutor</h3>
              <button>Voice Mode</button>
            </div>
            <div className="eg-ai-topic-list">
              {['Fractions', 'Algebra', 'Science', 'Grammar'].map((t) => (
                <div key={t}>{t}</div>
              ))}
            </div>
            {panelLoading.chat ? <p className="eg-loading">Loading chat...</p> : null}
            {panelError.chat ? <p className="eg-loading">{panelError.chat}</p> : null}
            <div className="eg-ai-chat">
              {chatHistoryTop.map((m) => (
                <div key={m.id || m.ts} className={`ai-msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                  {m.text || m.message}
                </div>
              ))}
              {!panelLoading.chat && !chatHistoryTop.length ? <div className="ai-msg bot">No chat history yet. Ask your first question.</div> : null}
            </div>
            <div className="eg-ai-input-row">
              <input className="eg-ai-input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask anything..." />
              <button onClick={onSendTutorMessage} disabled={chatLoading}>{chatLoading ? '...' : 'Send'}</button>
            </div>
          </section>
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

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>📝 Homework</h4>
            {panelLoading.homework ? <p className="eg-loading">Loading homework...</p> : null}
            {panelError.homework ? <p className="eg-loading">{panelError.homework}</p> : null}
            <ul className="mini-list">
              {/* Home page: show subject name only — tap to go to subject page */}
              {[...new Set(homework.map((h) => h.subject || 'General'))].slice(0, 5).map((subj) => {
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
              {announcementsTop.map((a) => (
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
              {testsTop.map((t) => (
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
              {progressSummary.map((s) => (
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
              {libraryTop.map((r) => (
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
              {eventsTop.map((e) => (
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
          <section className="eg-main-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <h2 style={{ gridColumn: '1 / -1', marginBottom: '20px' }}>{activeView} - Homework & Tests</h2>

            {/* Subject Homework — full details */}
            <article className="cardish eg-mini-card eg-grad-soft" style={{ gridColumn: 'span 2' }}>
              <h4>📝 {activeView} Homework</h4>
              {panelLoading.homework ? <p className="eg-loading">Loading homework...</p> : null}
              {panelError.homework ? <p className="eg-loading">{panelError.homework}</p> : null}
              {(() => {
                const visibleHomework = (homeworkBySubject.get(activeView) || []).filter((h) => !getHomeworkState(h).hide);
                const submittedCount = visibleHomework.filter((h) => getHomeworkState(h).submitted).length;
                const notSubmittedCount = visibleHomework.filter((h) => !getHomeworkState(h).submitted).length;
                const overdueCount = visibleHomework.filter((h) => getHomeworkState(h).overdue && !getHomeworkState(h).submitted).length;
                return (
                  <>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <span style={{ background: '#dcfce7', color: '#166534', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
                        Submitted: {submittedCount}
                      </span>
                      <span style={{ background: '#fee2e2', color: '#991b1b', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
                        Not submitted: {notSubmittedCount}
                      </span>
                      <span style={{ background: '#ffedd5', color: '#9a3412', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
                        Overdue: {overdueCount}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {visibleHomework.map((h) => {
                        const state = getHomeworkState(h);
                        return (
                  <div key={h.id} style={{
                    background: state.overdue && !state.submitted ? '#fff1f2' : '#f8f8ff', borderRadius: '10px', padding: '14px',
                    borderLeft: `4px solid ${state.color}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{h.title || 'Homework Task'}</div>
                          <span style={{ background: state.bg, color: state.color, borderRadius: '999px', padding: '3px 8px', fontSize: '11px', fontWeight: 700 }}>
                            {state.label}
                          </span>
                        </div>
                        {h.note && (
                          <div style={{ color: '#444', fontSize: '14px', marginBottom: '8px', lineHeight: '1.5' }}>
                            {h.note}
                          </div>
                        )}
                        {h.attachmentUrl ? (
                          <div style={{ marginBottom: '8px' }}>
                            <a href={h.attachmentUrl} target="_blank" rel="noreferrer" style={{ fontSize: '12px' }}>
                              Open homework image
                            </a>
                          </div>
                        ) : null}
                        <div style={{ marginBottom: '8px', display: 'grid', gap: '8px' }}>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => onStudentHomeworkFileSelected(h.id, e.target.files?.[0] || null)}
                            disabled={h.status === 'submitted' || homeworkUploadingById[h.id]}
                          />
                          <input
                            value={homeworkAttachmentUrl[h.id] || ''}
                            readOnly
                            placeholder="Uploaded solved image URL will appear here"
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '12px' }}
                            disabled={h.status === 'submitted'}
                          />
                        </div>
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
                      </div>
                      <button
                        className="eg-inline-btn"
                        onClick={() => onSubmitHomework(h.id)}
                        disabled={startingHomeworkId === h.id || h.status === 'submitted' || state.expired}
                        style={{ marginLeft: '12px', flexShrink: 0 }}
                      >
                        {state.expired ? 'Expired' : (h.status === 'submitted' ? '✅ Submitted' : startingHomeworkId === h.id ? '...' : 'Submit')}
                      </button>
                    </div>
                  </div>
                        );
                      })}
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
            <article className="cardish eg-mini-card eg-grad-soft">
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

        {loading ? <p className="eg-loading">Loading dashboard data...</p> : null}
      </div>
    </div>
  );
}

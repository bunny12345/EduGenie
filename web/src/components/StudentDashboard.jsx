import React, { useEffect, useMemo, useState } from 'react';
import {
  getDashboard,
  getHomework,
  getProgress,
  getCalendar,
  getRewards,
  getTests,
  startTest,
  submitTestAttempt,
  getTestAttempt,
  getLibrary,
  getLibraryResource,
  getSettings,
  saveSettings,
  submitHomework,
  getHomeworkAttempts,
  getChatHistory,
  sendChat
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

  if (bySubject.size === 0) {
    return [
      { subject: 'Mathematics', score: 76 },
      { subject: 'Science', score: 82 },
      { subject: 'English', score: 65 },
      { subject: 'Social Science', score: 70 }
    ];
  }

  return Array.from(bySubject.entries()).slice(0, 4).map(([subject, arr]) => {
    const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    return { subject, score: avg };
  });
}

function buildTrendPoints(rows) {
  const points = rows.map(getScore).filter((n) => n !== null).slice(-7);
  if (points.length >= 5) return points;
  return [64, 68, 63, 71, 69, 74, 76];
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

export default function StudentDashboard({ studentId = 'test', onLogout }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    dashboard: null,
    homework: [],
    progress: [],
    events: [],
    rewards: { coins: 0, badges: [] },
    tests: [],
    library: [],
    settings: { prefs: {} },
    chatHistory: []
  });
  const [startingTestId, setStartingTestId] = useState('');
  const [startingHomeworkId, setStartingHomeworkId] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [homeworkInfo, setHomeworkInfo] = useState('');
  const [selectedResource, setSelectedResource] = useState(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [dashboard, hw, prog, cal, rew, testsRes, libraryRes, settingsRes, historyRes] = await Promise.all([
          getDashboard(studentId),
          getHomework(studentId),
          getProgress(studentId),
          getCalendar(studentId),
          getRewards(studentId),
          getTests(studentId, 'upcoming'),
          getLibrary('', '', 1),
          getSettings(studentId),
          getChatHistory(studentId)
        ]);
        if (!active) return;
        setData({
          dashboard: dashboard || null,
          homework: safeArray(hw?.homework),
          progress: safeArray(prog?.subjectScores),
          events: safeArray(cal?.events),
          rewards: rew || { coins: 0, badges: [] },
          tests: safeArray(testsRes?.tests),
          library: safeArray(libraryRes?.resources),
          settings: settingsRes || { prefs: {} },
          chatHistory: safeArray(historyRes?.messages)
        });
      } catch (e) {
        if (!active) return;
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [studentId]);

  const greetingName = data.dashboard?.greetingName || 'Aarav';
  const streakDays = data.dashboard?.streak?.days || 12;
  const coins = Number(data.rewards?.coins) || 1250;
  const badges = Array.isArray(data.rewards?.badges) ? data.rewards.badges.length : 12;

  const homework = data.homework.slice(0, 4);
  const events = data.events.slice(0, 3);
  const tests = data.tests.slice(0, 3);
  const library = data.library.slice(0, 4);
  const chatHistory = data.chatHistory.slice(-3);
  const currentTheme = data.settings?.prefs?.theme || data.settings?.theme || 'Light';
  const currentLanguage = data.settings?.prefs?.language || data.settings?.language || 'English';
  const progressSummary = useMemo(() => buildProgressSummary(data.progress), [data.progress]);
  const trend = useMemo(() => buildTrendPoints(data.progress), [data.progress]);
  const weeklyGoalPct = 75;

  async function onStartTest(testId) {
    if (!testId) return;
    setStartingTestId(testId);
    try {
      const started = await startTest(testId, studentId);
      const attemptId = started?.attemptId;
      if (attemptId) {
        await submitTestAttempt(attemptId, studentId, { q1: 'A', q2: 'B' });
        const resultRes = await getTestAttempt(attemptId);
        const result = resultRes?.result || null;
        if (result) setTestResult({ score: result.score ?? '-', feedback: result.feedback || 'Submitted' });
      }
    } catch (e) {
      // no-op for now
    } finally {
      setStartingTestId('');
    }
  }

  async function onSubmitHomework(hwId) {
    if (!hwId) return;
    setStartingHomeworkId(hwId);
    try {
      const sub = await submitHomework(hwId, studentId, { summary: 'Completed in UI flow' }, null);
      const at = await getHomeworkAttempts(hwId, studentId);
      const count = Array.isArray(at?.attempts) ? at.attempts.length : 0;
      setHomeworkInfo(`Submitted. Attempts: ${count}. Last grade: ${sub?.grade ?? '-'}`);
    } catch (e) {
      setHomeworkInfo('Submit failed');
    } finally {
      setStartingHomeworkId('');
    }
  }

  async function onOpenResource(id) {
    if (!id) return;
    try {
      const res = await getLibraryResource(id);
      setSelectedResource(res?.resource || null);
    } catch (e) {
      setSelectedResource(null);
    }
  }

  async function onSaveTheme(nextTheme) {
    setSettingsSaving(true);
    try {
      const payload = {
        studentId,
        prefs: {
          ...(data.settings?.prefs || {}),
          theme: nextTheme,
          language: currentLanguage
        }
      };
      const saved = await saveSettings(payload);
      setData((prev) => ({
        ...prev,
        settings: saved?.settings || prev.settings
      }));
    } finally {
      setSettingsSaving(false);
    }
  }

  async function onSendTutorMessage() {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatLoading(true);
    try {
      const res = await sendChat(studentId, msg, 'Friendly', `conv-${studentId}`);
      const hist = await getChatHistory(studentId, res?.conversationId || `conv-${studentId}`);
      setData((prev) => ({ ...prev, chatHistory: safeArray(hist?.messages) }));
      setChatInput('');
    } catch (e) {
      // no-op for now
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
            <span className="pill">🔥 12</span>
            <span className="pill">🏅 {badges}</span>
            <div className="eg-profile-chip">
              <div className="eg-profile-avatar">🧑</div>
              <div className="eg-profile-meta">
                <strong>Hi, {greetingName}</strong>
                <span>Class 8</span>
              </div>
              <span className="eg-profile-caret">▾</span>
            </div>
          </div>
        </header>

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
                  <ul>
                    {homework.length === 0 ? <li>Math Homework - Due in 2 hrs</li> : null}
                    {(homework.length ? homework : [{ id: 'a', title: 'Math Homework' }, { id: 'b', title: 'Science Revision' }, { id: 'c', title: 'English Reading' }]).slice(0, 3).map((h) => (
                      <li key={h.id}>{h.title || h.file_url || 'Homework Task'}</li>
                    ))}
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
              {progressSummary.map((s) => (
                <article key={s.subject} className="cardish eg-subject-card">
                  <h4>{s.subject}</h4>
                  <strong>{s.score}%</strong>
                  <span>{s.score >= 75 ? 'Excellent' : 'Keep Practicing'}</span>
                </article>
              ))}
            </section>

            <section className="cardish eg-reco-card eg-grad-reco">
              <div>
                <h3>AI Recommends for You</h3>
                <p>Based on your performance, we think you'll like these topics</p>
              </div>
              <div className="eg-tag-row">
                {['Algebra Basics', 'Force & Motion', 'Story Writing', 'Lines & Angles'].map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </section>
          </div>

          <section className="cardish eg-ai-panel eg-grad-ai">
            <div className="eg-ai-head">
              <h3>AI Tutor</h3>
              <button>Voice Mode</button>
            </div>
            <div className="eg-ai-topic-list">
              {['Fractions', 'Algebra', 'Newton\'s Laws', 'Photosynthesis', 'Grammar'].map((t) => (
                <div key={t}>{t}</div>
              ))}
            </div>
            <div className="eg-ai-chat">
              {(chatHistory.length ? chatHistory : [
                { id: 'seed-1', role: 'assistant', text: `Hi ${greetingName}! What would you like to learn today?` }
              ]).map((m) => (
                <div key={m.id || m.ts} className={`ai-msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                  {m.text || m.message}
                </div>
              ))}
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
            <h4>Homework</h4>
            <ul className="mini-list">
              {(homework.length ? homework : [{ id: 'h1', title: 'Math Homework' }, { id: 'h2', title: 'Science Homework' }, { id: 'h3', title: 'English Homework' }]).slice(0, 3).map((h) => (
                <li key={h.id} className="eg-list-with-action">
                  <span>{h.title || h.file_url || 'Homework Task'}</span>
                  <button className="eg-inline-btn" onClick={() => onSubmitHomework(h.id)} disabled={startingHomeworkId === h.id}>
                    {startingHomeworkId === h.id ? '...' : 'Submit'}
                  </button>
                </li>
              ))}
            </ul>
            {homeworkInfo ? <p className="eg-inline-note">{homeworkInfo}</p> : null}
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Mock Tests</h4>
            <ul className="mini-list">
              {(tests.length ? tests : [
                { id: 'test-1', title: 'Math Chapter Test' },
                { id: 'test-2', title: 'Science Weekly Test' },
                { id: 'test-3', title: 'English Grammar Test' }
              ]).map((t) => (
                <li key={t.id} className="eg-list-with-action">
                  <span>{t.title || t.name || 'Mock Test'}</span>
                  <button className="eg-inline-btn" onClick={() => onStartTest(t.id)} disabled={startingTestId === t.id}>
                    {startingTestId === t.id ? '...' : 'Start'}
                  </button>
                </li>
              ))}
            </ul>
            {testResult ? <p className="eg-inline-note">Last score: {String(testResult.score)} | {testResult.feedback}</p> : null}
          </article>

          <article className="cardish eg-mini-card eg-progress-card eg-grad-progress">
            <h4>Progress Dashboard</h4>
            <Sparkline values={trend} />
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
            <ul className="mini-list bullets">
              {(library.length
                ? library.map((r) => ({ id: r.id, label: `📚 ${r.title || r.summary || 'Learning resource'}` }))
                : ['🎤 AI Voice Conversations', '📖 Story Based Learning', '⏰ Smart Reminders', '🧠 Personalized Study Plan', '🛡 Safe & Child Friendly']
              ).map((x) => (
                <li key={typeof x === 'string' ? x : x.id}>
                  {typeof x === 'string' ? x : <button className="eg-link-btn" onClick={() => onOpenResource(x.id)}>{x.label}</button>}
                </li>
              ))}
            </ul>
            {selectedResource ? <p className="eg-inline-note">Opened: {selectedResource.title || 'Resource'}</p> : null}
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Calendar</h4>
            <ul className="mini-list">
              {(events.length ? events : [{ id: 'e1', title: 'Math Test', starts_at: new Date() }, { id: 'e2', title: 'Science Homework Due', starts_at: new Date(Date.now() + 86400000) }]).map((e) => (
                <li key={e.id}>{e.title || e.event_type || 'Study Session'} - {fmtDate(e.starts_at || e.start || e.created_at)}</li>
              ))}
            </ul>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Rewards</h4>
            <p className="eg-reward-big">{coins} Coins</p>
            <p>{badges} badges earned</p>
            <button className="eg-mini-btn">View Rewards</button>
          </article>

          <article className="cardish eg-mini-card eg-voice-card eg-grad-voice">
            <h4>AI Voice Assistant</h4>
            <div className="eg-mic">🎤</div>
            <p>How can I help you today?</p>
            <button className="eg-mini-btn">Tap to Speak</button>
          </article>

          <article className="cardish eg-mini-card eg-grad-soft">
            <h4>Settings</h4>
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
            <p>{greetingName} Sharma</p>
            <p>Class 8 - Student</p>
            <button className="eg-mini-btn danger" onClick={onLogout}>Logout</button>
          </article>
        </section>

        {loading ? <p className="eg-loading">Loading dashboard data...</p> : null}
      </div>
    </div>
  );
}

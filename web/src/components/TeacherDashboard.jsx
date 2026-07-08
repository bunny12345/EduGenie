import React, { useEffect, useMemo, useState } from 'react';
import {
  askTeacherAi,
  assignTeacherHomework,
  createTeacherStudentInvite,
  getTeacherAnnouncements,
  getTeacherDashboard,
  getTeacherStudentProgress,
  getTeacherStudents,
  listTeacherStudentInvites,
  postTeacherAnnouncement,
  resendTeacherStudentInvite,
  registerTeacherStudent,
  revokeTeacherStudentInvite
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

export default function TeacherDashboard({ session, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({ summary: {}, students: [], recentAnnouncements: [] });
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedProgress, setSelectedProgress] = useState({ subjectScores: [], timeline: [] });
  const [announcements, setAnnouncements] = useState([]);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [assignTitle, setAssignTitle] = useState('Worksheet Practice');
  const [assignSubject, setAssignSubject] = useState(session?.subject || 'Mathematics');
  const [assignDueAt, setAssignDueAt] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [teacherPrompt, setTeacherPrompt] = useState('Plan a 30-minute revision session for Algebra basics.');
  const [teacherAi, setTeacherAi] = useState(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentClassName, setStudentClassName] = useState('Class 8');
  const [studentLoginId, setStudentLoginId] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [latestCreatedAccount, setLatestCreatedAccount] = useState(null);
  const [studentInviteLink, setStudentInviteLink] = useState('');
  const [studentInvites, setStudentInvites] = useState([]);

  function applyStudentInvites(nextInvites) {
    const safeInvites = Array.isArray(nextInvites) ? nextInvites : [];
    setStudentInvites(safeInvites);
    const activeInvites = safeInvites.filter((i) => inviteStatusLabel(i) === 'active').length;
    setDashboard((prev) => ({
      ...(prev || {}),
      summary: {
        ...(prev?.summary || {}),
        activeInvites
      }
    }));
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [dashRes, studentsRes, annRes] = await Promise.all([
          getTeacherDashboard(),
          getTeacherStudents(''),
          getTeacherAnnouncements()
        ]);
        if (!active) return;
        const loadedStudents = Array.isArray(studentsRes?.students) ? studentsRes.students : [];
        setDashboard(dashRes || { summary: {}, students: [], recentAnnouncements: [] });
        setStudents(loadedStudents);
        setAnnouncements(Array.isArray(annRes?.announcements) ? annRes.announcements : []);
        const invRes = await listTeacherStudentInvites();
        applyStudentInvites(Array.isArray(invRes?.invites) ? invRes.invites : []);
        if (loadedStudents.length) {
          const firstId = loadedStudents[0].id;
          setSelectedStudentId(firstId);
          setSelectedStudentIds([firstId]);
        }
      } catch (e) {
        if (active) setNote('Unable to load teacher data. Check your teacher token and backend connection.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadProgress() {
      if (!selectedStudentId) return;
      try {
        const res = await getTeacherStudentProgress(selectedStudentId);
        if (!active) return;
        setSelectedProgress(res || { subjectScores: [], timeline: [] });
      } catch (e) {
        if (active) setSelectedProgress({ subjectScores: [], timeline: [] });
      }
    }
    loadProgress();
    return () => {
      active = false;
    };
  }, [selectedStudentId]);

  const topStats = useMemo(() => {
    const s = dashboard?.summary || {};
    return [
      { label: 'Students', value: s.studentsCount ?? 0 },
      { label: 'Active Homework', value: s.activeHomework ?? 0 },
      { label: 'Average Score', value: `${s.avgScore ?? 0}%` },
      { label: 'Announcements', value: s.announcementsCount ?? 0 }
    ];
  }, [dashboard]);

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
      const next = res?.announcement;
      if (next) {
        setAnnouncements((prev) => [next, ...prev]);
        setAnnouncementTitle('');
        setAnnouncementMessage('');
        setNote('Announcement posted for all students.');
      } else {
        setNote(res?.error || 'Announcement could not be posted.');
      }
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
      setStudents((prev) => [
        {
          id: res.student.id,
          name: res.student.name,
          className: res.student.className
        },
        ...prev
      ]);
      setStudentName('');
      setStudentLoginId('');
      setStudentPassword('');
      setNote('Student account created. Share the login ID and password manually with the student.');
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
      if (res?.invite) {
        applyStudentInvites([{ ...res.invite, status: 'active' }, ...studentInvites]);
      }
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
      const next = studentInvites.map((inv) => (inv.token === token ? { ...inv, revoked: true, status: 'revoked' } : inv));
      applyStudentInvites(next);
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
      const next = [{ ...res.invite, status: 'active' }, ...studentInvites.map((inv) => (inv.token === token ? { ...inv, revoked: true, status: 'revoked' } : inv))];
      applyStudentInvites(next);
      setStudentInviteLink(res.invite.link || '');
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
          <div className="td-student-list">
            {(students.length ? students : dashboard?.students || []).map((s) => (
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
            {!students.length && !dashboard?.students?.length ? <p className="td-empty">No students available yet.</p> : null}
          </div>
        </article>

        <article className="td-card">
          <h3>Student Invite History</h3>
          <ul className="td-announcements">
            {(studentInvites.length ? studentInvites : []).slice(0, 6).map((i) => (
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
            {!studentInvites.length ? <p className="td-empty">No student invites yet.</p> : null}
          </ul>
        </article>

        <article className="td-card">
          <h3>Progress Snapshot</h3>
          <p>{selectedStudentId ? `Student ID: ${selectedStudentId}` : 'Pick a student to see metrics.'}</p>
          <div className="td-progress-grid">
            {(selectedProgress?.subjectScores || []).slice(0, 6).map((x) => (
              <div key={x.subject}>
                <span>{x.subject}</span>
                <strong>{x.avgScore}%</strong>
              </div>
            ))}
            {!selectedProgress?.subjectScores?.length ? <p className="td-empty">No progress data yet.</p> : null}
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
          <ul className="td-announcements">
            {(announcements.length ? announcements : dashboard?.recentAnnouncements || []).slice(0, 5).map((a) => (
              <li key={a.id || `${a.title}-${a.createdAt}`}>
                <strong>{a.title}</strong>
                <p>{a.message}</p>
              </li>
            ))}
            {!announcements.length && !dashboard?.recentAnnouncements?.length ? <p className="td-empty">No announcements posted yet.</p> : null}
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
      </section>

      {loading ? <p className="td-loading">Loading teacher workspace...</p> : null}
      {note ? <p className="td-note">{note}</p> : null}
    </div>
  );
}

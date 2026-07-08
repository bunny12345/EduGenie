import React, { useEffect, useState } from 'react';
import {
  resendSchoolTeacherInvite,
  revokeSchoolTeacherInvite,
  schoolDashboard,
  schoolInviteTeacher,
  schoolInvites,
  schoolRegisterTeacher,
  schoolStudents,
  schoolTeachers
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

export default function SchoolDashboard({ session, onLogout }) {
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherSubject, setTeacherSubject] = useState('Mathematics');
  const [teacherLoginId, setTeacherLoginId] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [createdTeacher, setCreatedTeacher] = useState(null);
  const [inviteLink, setInviteLink] = useState('');
  const [dashboard, setDashboard] = useState({ summary: { teachers: 0, students: 0, activeInvites: 0 } });
  const [teachers, setTeachers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [students, setStudents] = useState([]);

  function applyInvites(nextInvites) {
    const safeInvites = Array.isArray(nextInvites) ? nextInvites : [];
    setInvites(safeInvites);
    const activeInvites = safeInvites.filter((i) => inviteStatusLabel(i) === 'active').length;
    setDashboard((prev) => ({
      ...prev,
      summary: {
        ...(prev?.summary || {}),
        activeInvites
      }
    }));
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [dashRes, tRes, iRes, sRes] = await Promise.all([
          schoolDashboard(),
          schoolTeachers(),
          schoolInvites(),
          schoolStudents()
        ]);
        if (!active) return;
        setDashboard(dashRes || { summary: { teachers: 0, students: 0, activeInvites: 0 } });
        setTeachers(Array.isArray(tRes?.teachers) ? tRes.teachers : []);
        applyInvites(Array.isArray(iRes?.invites) ? iRes.invites : []);
        setStudents(Array.isArray(sRes?.students) ? sRes.students : []);
      } catch (e) {
        if (!active) return;
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

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
        password: teacherPassword
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
      setTeacherName('');
      setTeacherEmail('');
      setTeacherLoginId('');
      setTeacherPassword('');
      setNote('Teacher account created. Share login credentials manually.');
    } catch (e2) {
      setNote('Unable to register teacher right now.');
    } finally {
      setBusy('');
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
      if (res?.invite) {
        const next = [{ ...res.invite, status: 'active' }, ...invites];
        applyInvites(next);
      }
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
      const next = invites.map((inv) => (inv.token === token ? { ...inv, revoked: true, status: 'revoked' } : inv));
      applyInvites(next);
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
      const next = [{ ...res.invite, status: 'active' }, ...invites.map((inv) => (inv.token === token ? { ...inv, revoked: true, status: 'revoked' } : inv))];
      applyInvites(next);
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
        <button className="sd-logout" onClick={onLogout}>Logout</button>
      </header>

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
            <button type="submit" disabled={busy === 'manual'}>{busy === 'manual' ? 'Creating...' : 'Create Teacher Account'}</button>
          </form>
          {createdTeacher ? (
            <div className="sd-credential-box">
              <strong>Share with teacher:</strong>
              <p>Name: {createdTeacher.name}</p>
              <p>Email: {createdTeacher.email}</p>
              <p>Login ID: {createdTeacher.loginId}</p>
              <p>Password: {createdTeacher.password}</p>
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
          <h3>Teachers</h3>
          <ul className="sd-list">
            {(teachers.length ? teachers : []).slice(0, 8).map((t) => (
              <li key={t.id || t.loginId}>{t.name || 'Teacher'} - {t.subject || 'General'}</li>
            ))}
            {!teachers.length ? <li>No teachers yet</li> : null}
          </ul>
        </article>

        <article className="sd-card">
          <h3>Recent Teacher Invites</h3>
          <ul className="sd-invite-list">
            {(invites.length ? invites : []).slice(0, 8).map((i) => (
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
            {!invites.length ? <li>No invites yet</li> : null}
          </ul>
        </article>

        <article className="sd-card">
          <h3>Students (School-wide)</h3>
          <ul className="sd-list">
            {(students.length ? students : []).slice(0, 8).map((s) => (
              <li key={s.id}>{s.name || 'Student'} - {s.className || 'Class'}</li>
            ))}
            {!students.length ? <li>No students yet</li> : null}
          </ul>
        </article>
      </section>

      {note ? <p className="sd-note">{note}</p> : null}
    </div>
  );
}

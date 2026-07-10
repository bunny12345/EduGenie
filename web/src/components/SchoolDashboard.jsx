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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteStatusFilter, setInviteStatusFilter] = useState('all');
  const [invitePage, setInvitePage] = useState(1);
  const [inviteTotalPages, setInviteTotalPages] = useState(1);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherPage, setTeacherPage] = useState(1);
  const [teacherTotalPages, setTeacherTotalPages] = useState(1);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [studentTotalPages, setStudentTotalPages] = useState(1);

  // New: Section-specific loading and refresh states
  const [refreshing, setRefreshing] = useState('');
  const [exportFormat, setExportFormat] = useState(null);

  const INVITES_PER_PAGE = 5;
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
    await loadTeachers({ q: teacherSearch, page: teacherPage, limit: TEACHERS_PER_PAGE });
    setRefreshing('');
  }

  async function refreshInvitesSection() {
    setRefreshing('invites');
    await loadInvites({ q: inviteSearch, status: inviteStatusFilter, page: invitePage, limit: INVITES_PER_PAGE });
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
      refreshInvitesSection(),
      refreshStudentsSection()
    ]);
    setRefreshing('');
  }

  function applyInvites(nextInvites, pagination) {
    const safeInvites = Array.isArray(nextInvites) ? nextInvites : [];
    setInvites(safeInvites);
    setInviteTotalPages(Math.max(1, Number(pagination?.totalPages || 1)));
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
    if (invitePage > inviteTotalPages) {
      setInvitePage(inviteTotalPages);
    }
  }, [invitePage, inviteTotalPages]);

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

  async function loadInvites(params) {
    const iRes = await schoolInvites(params || {
      q: inviteSearch,
      status: inviteStatusFilter,
      page: invitePage,
      limit: INVITES_PER_PAGE
    });
    applyInvites(Array.isArray(iRes?.invites) ? iRes.invites : [], iRes?.pagination || null);
  }

  async function loadTeachers(params) {
    const tRes = await schoolTeachers(params || {
      q: teacherSearch,
      page: teacherPage,
      limit: TEACHERS_PER_PAGE
    });
    applyTeachers(Array.isArray(tRes?.teachers) ? tRes.teachers : [], tRes?.pagination || null);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [dashRes, tRes, iRes, sRes] = await Promise.all([
          schoolDashboard(),
          schoolTeachers({ page: 1, limit: TEACHERS_PER_PAGE }),
          schoolInvites({ page: 1, limit: INVITES_PER_PAGE }),
          schoolStudents({ page: 1, limit: STUDENTS_PER_PAGE })
        ]);
        if (!active) return;
        setDashboard(dashRes || { summary: { teachers: 0, students: 0, activeInvites: 0 } });
        applyTeachers(Array.isArray(tRes?.teachers) ? tRes.teachers : [], tRes?.pagination || null);
        applyInvites(Array.isArray(iRes?.invites) ? iRes.invites : [], iRes?.pagination || null);
        applyStudents(Array.isArray(sRes?.students) ? sRes.students : [], sRes?.pagination || null);
      } catch (e) {
        if (!active) return;
        setError(e?.message || 'Failed to load school dashboard data');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function refreshInvites() {
      try {
        const iRes = await schoolInvites({
          q: inviteSearch,
          status: inviteStatusFilter,
          page: invitePage,
          limit: INVITES_PER_PAGE
        });
        if (!active) return;
        applyInvites(Array.isArray(iRes?.invites) ? iRes.invites : [], iRes?.pagination || null);
      } catch (e) {
        if (!active) return;
        setError(e?.message || 'Failed to refresh invites');
      }
    }
    refreshInvites();
    return () => {
      active = false;
    };
  }, [inviteSearch, inviteStatusFilter, invitePage]);

  useEffect(() => {
    let active = true;
    async function refreshTeachers() {
      try {
        const tRes = await schoolTeachers({
          q: teacherSearch,
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
  }, [teacherSearch, teacherPage]);

  useEffect(() => {
    let active = true;
    async function refreshStudents() {
      try {
        const sRes = await schoolStudents({
          q: studentSearch,
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
  }, [studentSearch, studentPage]);

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
      await loadTeachers({ q: teacherSearch, page: 1, limit: TEACHERS_PER_PAGE });
      setTeacherPage(1);
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
      await loadInvites({ q: inviteSearch, status: inviteStatusFilter, page: 1, limit: INVITES_PER_PAGE });
      setInvitePage(1);
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
      await loadInvites();
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
      await loadInvites({ q: inviteSearch, status: inviteStatusFilter, page: 1, limit: INVITES_PER_PAGE });
      setInvitePage(1);
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="sd-inline-btn"
            onClick={refreshAllSections}
            disabled={refreshing === 'all'}
            title="Refresh all sections"
          >
            {refreshing === 'all' ? '⟳ ...' : '⟳ Refresh'} 
          </button>
          <div style={{ position: 'relative' }}>
            <button 
              className="sd-inline-btn"
              onClick={() => setExportFormat(exportFormat ? null : true)}
              title="Export data"
            >
              ⬇ Export
            </button>
            {exportFormat && (
              <div style={{ 
                position: 'absolute', 
                right: 0, 
                top: '100%', 
                backgroundColor: '#fff', 
                border: '1px solid #ccc',
                borderRadius: '4px',
                zIndex: 10,
                minWidth: '140px'
              }}>
                <button 
                  onClick={() => exportTeachers('csv')}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none' }}
                >
                  👨‍🏫 Teachers CSV
                </button>
                <button 
                  onClick={() => exportStudents('csv')}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none' }}
                >
                  👥 Students CSV
                </button>
              </div>
            )}
          </div>
          <button className="sd-logout" onClick={onLogout}>Logout</button>
        </div>
      </header>

      {loading ? <p className="sd-note">Loading school data...</p> : null}
      {error ? <p className="sd-note">{error}</p> : null}

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
          </div>
          <ul className="sd-list">
            {(teachers.length ? teachers : []).map((t) => (
              <li key={t.id || t.loginId}>{t.name || 'Teacher'} - {t.subject || 'General'}</li>
            ))}
            {!teachers.length ? <li>No teachers match the current search.</li> : null}
          </ul>
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

        <article className="sd-card">
          <h3>Recent Teacher Invites</h3>
          <button 
            className="sd-inline-btn" 
            onClick={refreshInvitesSection}
            disabled={refreshing === 'invites'}
            style={{ float: 'right', fontSize: '12px' }}
          >
            {refreshing === 'invites' ? '...' : '↻'}
          </button>
          <div className="invite-toolbar">
            <input
              className="invite-search"
              value={inviteSearch}
              onChange={(e) => {
                setInviteSearch(e.target.value);
                setInvitePage(1);
              }}
              placeholder="Search by token or role"
            />
            <select
              className="invite-filter"
              value={inviteStatusFilter}
              onChange={(e) => {
                setInviteStatusFilter(e.target.value);
                setInvitePage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="used">Used</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <ul className="sd-invite-list">
            {(invites.length ? invites : []).map((i) => (
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
            {!invites.length ? <li>No invites match the current filters.</li> : null}
          </ul>
          <div className="invite-pager">
            <button
              type="button"
              className="sd-inline-btn"
              onClick={() => setInvitePage((p) => Math.max(1, p - 1))}
              disabled={invitePage === 1}
            >
              Previous
            </button>
            <span>Page {invitePage} of {inviteTotalPages}</span>
            <button
              type="button"
              className="sd-inline-btn"
              onClick={() => setInvitePage((p) => Math.min(inviteTotalPages, p + 1))}
              disabled={invitePage >= inviteTotalPages}
            >
              Next
            </button>
          </div>
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
          </div>
          <ul className="sd-list">
            {(students.length ? students : []).map((s) => (
              <li key={s.id}>{s.name || 'Student'} - {s.className || 'Class'}</li>
            ))}
            {!students.length ? <li>No students match the current search.</li> : null}
          </ul>
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

      {note ? <p className="sd-note">{note}</p> : null}
    </div>
  );
}

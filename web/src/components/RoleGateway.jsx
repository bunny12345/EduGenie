import React, { useEffect, useState } from 'react';
import {
  acceptInvite,
  getInviteInfo,
  schoolLogin,
  schoolRegister,
  studentLogin,
  teacherLogin
} from '../api';

export default function RoleGateway({ onLogin }) {
  const [role, setRole] = useState('school');
  const [schoolMode, setSchoolMode] = useState('register');

  const [schoolName, setSchoolName] = useState('');
  const [branch, setBranch] = useState('Main Branch');
  const [location, setLocation] = useState('');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [schoolPassword, setSchoolPassword] = useState('');

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');

  const [inviteToken, setInviteToken] = useState('');
  const [inviteInfo, setInviteInfo] = useState(null);

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSubject, setInviteSubject] = useState('Mathematics');
  const [inviteClassName, setInviteClassName] = useState('Class 8');
  const [inviteLoginId, setInviteLoginId] = useState('');
  const [invitePassword, setInvitePassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('inviteToken') || '';
    if (token) {
      setInviteToken(token);
      setRole('invite');
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadInvite() {
      if (!inviteToken) {
        setInviteInfo(null);
        return;
      }
      setError('');
      const info = await getInviteInfo(inviteToken);
      if (!active) return;
      if (!info?.success) {
        setInviteInfo(null);
        setError(info?.error || 'Invalid invite token');
        return;
      }
      setInviteInfo(info.invite || null);
    }
    loadInvite();
    return () => {
      active = false;
    };
  }, [inviteToken]);

  async function submitSchool(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = schoolMode === 'register'
        ? await schoolRegister({
            email: schoolEmail,
            schoolName,
            branch,
            location,
            password: schoolPassword
          })
        : await schoolLogin(schoolEmail, schoolPassword);

      if (!res?.success || !res?.token) {
        setError(res?.error || 'School authentication failed');
        return;
      }

      onLogin({
        role: 'school_admin',
        token: res.token,
        schoolId: res?.school?.id || '',
        schoolName: res?.school?.schoolName || schoolName || 'School',
        email: res?.school?.email || schoolEmail
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitTeacher(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await teacherLogin(loginId, password);
      if (!res?.success || !res?.token) {
        setError(res?.error || 'Teacher login failed');
        return;
      }
      onLogin({
        role: 'teacher',
        token: res.token,
        userId: res?.teacher?.id || '',
        schoolId: res?.teacher?.schoolId || '',
        name: res?.teacher?.name || 'Teacher',
        subject: res?.teacher?.subject || 'General'
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitStudent(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await studentLogin(loginId, password);
      if (!res?.success || !res?.token) {
        setError(res?.error || 'Student login failed');
        return;
      }
      onLogin({
        role: 'student',
        token: res.token,
        userId: res?.student?.id || '',
        name: res?.student?.name || 'Student',
        className: res?.student?.className || 'Class'
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitInvite(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await acceptInvite({
        token: inviteToken,
        name: inviteName,
        email: inviteEmail,
        subject: inviteSubject,
        className: inviteClassName,
        loginId: inviteLoginId,
        password: invitePassword
      });
      if (!res?.success || !res?.token) {
        setError(res?.error || 'Invite acceptance failed');
        return;
      }

      if (res.role === 'teacher') {
        onLogin({
          role: 'teacher',
          token: res.token,
          userId: res?.teacher?.id || '',
          schoolId: res?.teacher?.schoolId || '',
          name: res?.teacher?.name || inviteName || 'Teacher',
          subject: res?.teacher?.subject || inviteSubject
        });
        return;
      }

      onLogin({
        role: 'student',
        token: res.token,
        userId: res?.student?.id || '',
        name: res?.student?.name || inviteName || 'Student',
        className: res?.student?.className || inviteClassName
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rg-shell">
      <div className="rg-bg-shape rg-bg-shape-a" />
      <div className="rg-bg-shape rg-bg-shape-b" />

      <main className="rg-card">
        <header className="rg-head">
          <p className="rg-kicker">EduGenie Portal</p>
          <h1>School, Teacher and Student Access</h1>
          <p>School admins onboard teachers, teachers onboard students, and invite links support self-registration.</p>
        </header>

        <div className="rg-role-toggle rg-role-toggle-3">
          <button type="button" className={role === 'school' ? 'active' : ''} onClick={() => setRole('school')}>School</button>
          <button type="button" className={role === 'teacher' ? 'active' : ''} onClick={() => setRole('teacher')}>Teacher</button>
          <button type="button" className={role === 'student' ? 'active' : ''} onClick={() => setRole('student')}>Student</button>
        </div>

        {role === 'school' ? (
          <form className="rg-form" onSubmit={submitSchool}>
            <div className="rg-inline-toggle">
              <button type="button" className={schoolMode === 'register' ? 'active' : ''} onClick={() => setSchoolMode('register')}>Register School</button>
              <button type="button" className={schoolMode === 'login' ? 'active' : ''} onClick={() => setSchoolMode('login')}>School Login</button>
            </div>

            {schoolMode === 'register' ? (
              <>
                <label>
                  School Name
                  <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Green Valley School" />
                </label>
                <label>
                  Branch
                  <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Main Branch" />
                </label>
                <label>
                  Location
                  <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bengaluru" />
                </label>
              </>
            ) : null}

            <label>
              School Email
              <input value={schoolEmail} onChange={(e) => setSchoolEmail(e.target.value)} placeholder="admin@school.edu" />
            </label>
            <label>
              Password
              <input type="password" value={schoolPassword} onChange={(e) => setSchoolPassword(e.target.value)} placeholder="Strong password" />
            </label>

            {error ? <p className="rg-error">{error}</p> : null}
            <button className="rg-submit" type="submit" disabled={busy}>
              {busy ? 'Please wait...' : (schoolMode === 'register' ? 'Register School' : 'Login as School Admin')}
            </button>
          </form>
        ) : null}

        {role === 'teacher' ? (
          <form className="rg-form" onSubmit={submitTeacher}>
            <label>
              Teacher Login ID
              <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="teacher login id" />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="teacher password" />
            </label>
            {error ? <p className="rg-error">{error}</p> : null}
            <button className="rg-submit" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Login as Teacher'}</button>
          </form>
        ) : null}

        {role === 'student' ? (
          <form className="rg-form" onSubmit={submitStudent}>
            <label>
              Student Login ID
              <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="student login id" />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="student password" />
            </label>
            {error ? <p className="rg-error">{error}</p> : null}
            <button className="rg-submit" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Login as Student'}</button>
          </form>
        ) : null}

        {inviteToken ? (
          <form className="rg-form rg-invite-form" onSubmit={submitInvite}>
            <h3>Accept Invite</h3>
            <p>Invite role: <strong>{inviteInfo?.role || '...'}</strong></p>
            <label>
              Full Name
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Your name" />
            </label>
            {inviteInfo?.role === 'teacher' ? (
              <>
                <label>
                  Email
                  <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teacher email" />
                </label>
                <label>
                  Subject
                  <input value={inviteSubject} onChange={(e) => setInviteSubject(e.target.value)} placeholder="Subject" />
                </label>
              </>
            ) : (
              <label>
                Class
                <input value={inviteClassName} onChange={(e) => setInviteClassName(e.target.value)} placeholder="Class 8" />
              </label>
            )}
            <label>
              Login ID
              <input value={inviteLoginId} onChange={(e) => setInviteLoginId(e.target.value)} placeholder="Choose login ID" />
            </label>
            <label>
              Password
              <input type="password" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} placeholder="Choose strong password" />
            </label>
            {error ? <p className="rg-error">{error}</p> : null}
            <button className="rg-submit" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Complete Registration'}</button>
          </form>
        ) : null}
      </main>
    </div>
  );
}

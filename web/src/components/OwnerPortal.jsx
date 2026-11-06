import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getOwnerAccess, schoolRegisterRequestOtp, schoolRegisterVerifyOtp } from '../api';
import { createOwnerClient } from '../ownerAuthClient';
import TechnicalSupport from './TechnicalSupport';

function OwnerPasswordField({ label, ...inputProps }) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <label htmlFor={id}>
      {label}
      <div className="rg-password-field">
        <input {...inputProps} id={id} type={visible ? 'text' : 'password'} />
        <button
          type="button"
          className="rg-eye-btn"
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((value) => !value)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible ? <path d="m3 3 18 18" /> : null}
          </svg>
        </button>
      </div>
    </label>
  );
}

export default function OwnerPortal() {
  const [client] = useState(createOwnerClient);
  const [phase, setPhase] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState(null);
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ownerTab, setOwnerTab] = useState('schools');
  const epoch = useRef(0);

  useEffect(() => () => {
    epoch.current += 1;
    if (client) {
      client.auth.signOut({ scope: 'local' }).then(({ error: signOutError }) => {
        if (signOutError) console.error('Owner sign-out failed:', signOutError.message);
      });
    }
  }, [client]);

  const clearSession = useCallback(() => {
    epoch.current += 1;
    setSession(null);
    setPhase('login');
    setPassword('');
    setFactorId('');
    setQr('');
    setCode('');
    setBusy(false);
    setOwnerTab('schools');
  }, []);

  const signOut = useCallback(async (message = '') => {
    clearSession();
    setError(message);
    const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
    if (signOutError) setError(message || signOutError.message);
  }, [client, clearSession]);

  useEffect(() => {
    if (!session) return undefined;
    const timeout = setTimeout(() => {
      signOut('Your owner session expired. Sign in and verify MFA again.');
    }, Math.max(0, session.expires_at * 1000 - Date.now()));
    return () => clearTimeout(timeout);
  }, [session, signOut]);

  async function run(action) {
    const current = epoch.current;
    const active = () => current === epoch.current;
    setBusy(true);
    setError('');
    try {
      await action(active);
    } catch (e) {
      if (active()) setError(e.message || 'The owner request failed. Please try again.');
    } finally {
      if (active()) setBusy(false);
    }
  }

  async function prepareMfa(active) {
    const { data, error: factorError } = await client.auth.mfa.listFactors();
    if (factorError) throw factorError;
    if (!active()) return;
    const verified = data.totp.find((factor) => factor.status === 'verified');
    setCode('');
    if (verified) {
      setFactorId(verified.id);
      setPhase('verify');
      return;
    }
    // An interrupted setup leaves an unverified factor. Only remove those,
    // never an already verified authenticator.
    for (const factor of data.all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified')) {
      const { error: removeError } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (removeError) throw removeError;
      if (!active()) return;
    }
    const { data: enrolled, error: enrollError } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'AcademiX Owner',
      issuer: 'AcademiX',
    });
    if (enrollError) throw enrollError;
    if (!active()) return;
    setFactorId(enrolled.id);
    const svg = enrolled.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, '');
    setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    setPhase('setup');
  }

  function login(e) {
    e.preventDefault();
    run(async (active) => {
      const { data, error: loginError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) throw loginError;
      if (!active()) return;
      setPassword('');
      try {
        await getOwnerAccess(data.session.access_token);
      } catch (accessError) {
        await signOut(accessError.message);
        return;
      }
      if (!active()) return;
      setSession(data.session);
      await prepareMfa(active);
    });
  }

  function verify(e) {
    e.preventDefault();
    run(async (active) => {
      const { data, error: mfaError } = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (mfaError) throw mfaError;
      if (!active()) return;
      const access = await getOwnerAccess(data.access_token);
      if (!active()) return;
      if (!access.mfaVerified) throw new Error('MFA verification is required. Please try again.');
      setSession({ ...data, expires_at: Math.floor(Date.now() / 1000) + data.expires_in });
      setQr('');
      setCode('');
      setPhase('register');
    });
  }

  return (
    <div className="rg-shell">
      <main className="rg-card eg-owner-card">
        <header className="rg-head">
          <img src="/logo.png" alt="AcademiX" className="rg-logo" />
          <p className="rg-kicker">Private owner access</p>
          <h1>{phase === 'register' ? ownerTab === 'support' ? 'Support Inbox' : 'Register a school' : 'AcademiX Owner'}</h1>
          <p>Only the configured owner can register schools. Authenticator verification is required.</p>
        </header>
        {!client ? (
          <p className="rg-error" role="alert">Owner sign-in is not configured. Set the website Supabase URL and public anon key, then rebuild.</p>
        ) : phase === 'login' ? (
          <form className="rg-form" onSubmit={login}>
            <label>Owner email<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <OwnerPasswordField label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit" className="rg-submit" disabled={busy}>{busy ? 'Signing in...' : 'Owner sign in'}</button>
          </form>
        ) : phase === 'register' ? (
          <>
            <nav className="eg-owner-tabs" aria-label="Owner tools">
              <button type="button" aria-pressed={ownerTab === 'schools'} onClick={() => setOwnerTab('schools')}>Register school</button>
              <button type="button" aria-pressed={ownerTab === 'support'} onClick={() => setOwnerTab('support')}>Support Inbox</button>
            </nav>
            {ownerTab === 'support' ? <TechnicalSupport ownerToken={session.access_token} onAuthError={signOut} /> :
              <OwnerSchoolRegistration token={session.access_token} onSessionExpired={signOut} />}
          </>
        ) : (
          <form className="rg-form" onSubmit={verify}>
            {phase === 'setup' ? (
              <>
                <h2>Set up your authenticator</h2>
                <p>Scan this QR code with your authenticator app, then enter its six-digit code. Keep a secure backup in your authenticator before continuing.</p>
                <img className="eg-owner-qr" src={qr} alt="Scan to set up your owner authenticator" />
              </>
            ) : <h2>Verify your authenticator</h2>}
            <label>Authenticator code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            <button type="submit" className="rg-submit" disabled={busy || code.length !== 6}>{busy ? 'Verifying...' : 'Verify & continue'}</button>
            <button type="button" className="rg-link-btn" disabled={busy} onClick={() => run(prepareMfa)}>Retry authenticator setup</button>
          </form>
        )}
        {error ? <p className="rg-error" role="alert">{error}</p> : null}
        <div className="eg-owner-actions">
          {phase !== 'login' ? <button type="button" className="rg-link-btn" disabled={busy} onClick={() => signOut()}>Owner sign out</button> : null}
          <a href="/">Back to portal login</a>
        </div>
      </main>
    </div>
  );
}

function OwnerSchoolRegistration({ token, onSessionExpired }) {
  const emptySchool = { schoolName: '', branch: 'Main Branch', location: '', email: '', password: '' };
  const [school, setSchool] = useState(emptySchool);
  const [step, setStep] = useState('details');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  async function requestCode() {
    await schoolRegisterRequestOtp(school, token);
    setSchool((value) => ({ ...value, password: '' }));
    setOtp('');
    setNote(`A school email verification code was sent to ${school.email}. It expires in 10 minutes.`);
    setStep('otp');
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (step === 'details') {
        await requestCode();
      } else {
        const result = await schoolRegisterVerifyOtp(school.email, otp, token);
        setNote(`${result.school.schoolName} was registered successfully. Its administrator can now use School Login with the school email and password you set.`);
        setSchool(emptySchool);
        setOtp('');
        setStep('details');
      }
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        await onSessionExpired(e.message);
      } else {
        setError(e.message || 'School registration failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="rg-form" onSubmit={submit}>
      <p>Your owner session stays separate from the school account you create.</p>
      {note ? <p className="rg-otp-note" role="status">{note}</p> : null}
      {step === 'details' ? (
        <>
          {[
            ['schoolName', 'School name', 'text'],
            ['branch', 'Branch', 'text'],
            ['location', 'Location', 'text'],
            ['email', 'School email', 'email'],
            ['password', 'School password', 'password'],
          ].map(([field, label, type]) => (
            field === 'password' ? (
              <OwnerPasswordField key={field} label={label} required autoComplete="new-password" minLength={8} value={school[field]} onChange={(e) => setSchool({ ...school, [field]: e.target.value })} />
            ) : (
              <label key={field}>{label}<input required type={type} autoComplete="off" value={school[field]} onChange={(e) => setSchool({ ...school, [field]: e.target.value })} /></label>
            )
          ))}
          <button type="submit" className="rg-submit" disabled={busy}>{busy ? 'Sending code...' : 'Send school verification code'}</button>
        </>
      ) : (
        <>
          <label>School email verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
          <button type="submit" className="rg-submit" disabled={busy || otp.length !== 6}>{busy ? 'Creating school...' : 'Verify & register school'}</button>
          <button type="button" className="rg-link-btn" disabled={busy} onClick={() => { setStep('details'); setOtp(''); setNote('Re-enter the school password and submit the details to send a new code.'); setError(''); }}>Change details / request a new code</button>
        </>
      )}
      {error ? <p className="rg-error" role="alert">{error}</p> : null}
    </form>
  );
}

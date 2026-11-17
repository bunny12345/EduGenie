import React, { useEffect, useState } from 'react';
import { requestPasswordResetCode, resetForgottenPassword } from '../api';
import { PHONE_COUNTRIES } from './RegistrationContactField';

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8 && value.length <= 128 },
  { id: 'letter', label: 'A letter (a–z)', test: (value) => /[A-Za-z]/.test(value) },
  { id: 'number', label: 'A number (0–9)', test: (value) => /\d/.test(value) },
  { id: 'special', label: 'A special character (e.g. ! @ # $)', test: (value) => /[^A-Za-z0-9\s]/.test(value) }
];

/**
 * Self-service password recovery for school, teacher and student logins. Step 1
 * checks the login against the registered email or mobile number and sends a code;
 * step 2 verifies the code and sets a new, policy-compliant password.
 */
export default function ForgotPasswordPanel({ role, initialLoginId = '', PasswordField, onDone, onCancel }) {
  const isSchool = role === 'school';
  const label = isSchool ? 'School' : role === 'teacher' ? 'Teacher' : 'Student';
  const loginLabel = isSchool ? 'School Email' : `${label} Login ID`;
  const [step, setStep] = useState('request');
  const [loginId, setLoginId] = useState(initialLoginId);
  const [channel, setChannel] = useState('email');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('IN');
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const otherChannel = channel === 'email' ? 'phone' : 'email';
  const suggestsOther = !!error && step === 'request'
    && (channel === 'email' ? /mobile number/i.test(error) : /email/i.test(error))
    && !/contact (your school admin|AcademiX support)/i.test(error);
  const rulesMet = PASSWORD_RULES.every((rule) => rule.test(newPassword));
  const matches = !!newPassword && newPassword === confirmPassword;

  function switchChannel(next) {
    setChannel(next);
    setError('');
  }

  async function sendCode(e) {
    if (e) e.preventDefault();
    const id = loginId.trim();
    if (!id) return setError(`Enter your ${loginLabel.toLowerCase()}.`);
    const contactEmail = isSchool ? id : email.trim();
    if (channel === 'email' && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contactEmail)) {
      return setError('Enter a valid email address, or verify with your registered mobile number instead.');
    }
    if (channel === 'phone' && !/^[0-9 ()+-]{4,20}$/.test(phone.trim())) {
      return setError('Enter a valid mobile number.');
    }
    setBusy(true);
    setError('');
    try {
      const res = await requestPasswordResetCode({
        role, loginId: id, channel,
        ...(channel === 'email' ? { email: contactEmail } : { country, phone: phone.trim() })
      });
      if (!res?.success) return setError(res?.error || 'Could not send the verification code.');
      setChallenge(res);
      setCode('');
      setStep('reset');
      setResendIn(Number(res.resendAfter) || 60);
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the six-digit verification code.');
    if (!rulesMet) return setError('Password must be at least 8 characters and include a letter, a number and a special character.');
    if (!matches) return setError('The new password and confirmation do not match.');
    setBusy(true);
    setError('');
    try {
      const res = await resetForgottenPassword({
        role, loginId: loginId.trim(), challengeId: challenge?.challengeId, code: code.trim(), newPassword, confirmPassword
      });
      if (!res?.success) return setError(res?.error || 'Could not reset the password.');
      onDone(loginId.trim(), res.message || 'Your password has been changed. Please log in with your new password.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'reset') {
    return (
      <form className="rg-form rg-forgot" onSubmit={submitReset}>
        <h2>Set a new password</h2>
        <p className="rg-otp-note">
          We sent a 6-digit code to {challenge?.channel === 'phone' ? 'your mobile number' : 'your email'}{' '}
          <strong>{challenge?.destination}</strong>. It expires in 10 minutes.
        </p>
        <label>
          Verification code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
          />
        </label>
        <label>
          New password
          <PasswordField
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="new password"
            visible={showNew}
            onShow={() => setShowNew(true)}
            onHide={() => setShowNew(false)}
          />
        </label>
        <ul className="rg-password-rules" aria-label="Password requirements">
          {PASSWORD_RULES.map((rule) => (
            <li key={rule.id} className={rule.test(newPassword) ? 'met' : ''}>{rule.label}</li>
          ))}
          <li className="rg-rule-note">Must be different from your current password</li>
        </ul>
        <label>
          Confirm new password
          <PasswordField
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="re-enter new password"
            visible={showConfirm}
            onShow={() => setShowConfirm(true)}
            onHide={() => setShowConfirm(false)}
          />
        </label>
        {confirmPassword && !matches ? <p className="rg-error">Passwords do not match.</p> : null}
        {error ? <p className="rg-error" role="alert">{error}</p> : null}
        <button className="rg-submit" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Change password'}</button>
        <div className="rg-link-row">
          <button type="button" className="rg-link" disabled={busy || resendIn > 0} onClick={() => sendCode()}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </button>
          <button type="button" className="rg-link" disabled={busy} onClick={() => { setStep('request'); setError(''); }}>
            Use a different email or mobile
          </button>
        </div>
        <button type="button" className="rg-link" onClick={onCancel}>Back to login</button>
      </form>
    );
  }

  return (
    <form className="rg-form rg-forgot" onSubmit={sendCode}>
      <h2>Forgot password</h2>
      <p className="rg-forgot-intro">
        {isSchool
          ? 'Get a verification code at your school email or the mobile number registered for your school to set a new password.'
          : `Verify the email address or mobile number registered on your ${label.toLowerCase()} account to set a new password.`}
      </p>
      <label>
        {loginLabel}
        <input
          type={isSchool ? 'email' : 'text'}
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          placeholder={isSchool ? 'admin@school.edu' : `${label.toLowerCase()} login id`}
        />
      </label>
      <div className="rg-inline-toggle" role="group" aria-label="Verify with">
        <button type="button" className={channel === 'email' ? 'active' : ''} onClick={() => switchChannel('email')}>Email</button>
        <button type="button" className={channel === 'phone' ? 'active' : ''} onClick={() => switchChannel('phone')}>Mobile number</button>
      </div>
      {channel === 'email' && isSchool ? (
        <p className="rg-otp-note">We'll send the code to the school email above.</p>
      ) : null}
      {channel === 'email' && !isSchool ? (
        <label>
          Registered email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
      ) : null}
      {channel === 'phone' ? (
        <label>
          Registered mobile number
          <div className="rg-phone-row">
            <select aria-label="Country code" value={country} onChange={(e) => setCountry(e.target.value)}>
              {PHONE_COUNTRIES.map(({ country: value, name, code: callingCode }) => (
                <option key={value} value={value}>{name} (+{callingCode})</option>
              ))}
            </select>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="mobile number" inputMode="tel" />
          </div>
        </label>
      ) : null}
      {error ? <p className="rg-error" role="alert">{error}</p> : null}
      {suggestsOther ? (
        <button type="button" className="rg-link" onClick={() => switchChannel(otherChannel)}>
          Verify with {otherChannel === 'phone' ? 'mobile number' : 'email'} instead
        </button>
      ) : null}
      <button className="rg-submit" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Send verification code'}</button>
      <button type="button" className="rg-link" onClick={onCancel}>Back to login</button>
    </form>
  );
}

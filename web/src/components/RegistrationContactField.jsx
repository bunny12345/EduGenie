import React, { useEffect, useRef, useState } from 'react';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import {
  requestRegistrationPhoneCode, verifyRegistrationPhoneCode,
  requestRegistrationEmailCode, verifyRegistrationEmailCode,
  requestSchoolPhoneCode, verifySchoolPhoneCode
} from '../api';

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const PHONE_COUNTRIES = getCountries().map((country) => ({
  country, name: countryNames.of(country), code: getCountryCallingCode(country)
})).sort((a, b) => a.name.localeCompare(b.name));
export const EMPTY_REGISTRATION_PHONE = { country: 'IN', number: '', phone: '', verificationId: '', expiresAt: '' };
export const EMPTY_REGISTRATION_EMAIL = { number: '', email: '', verificationId: '', expiresAt: '' };

export function registrationPhoneNumber(value) {
  const phone = /^[0-9 ()-]+$/.test(value.number)
    ? parsePhoneNumberFromString(value.number, { defaultCountry: value.country, extract: false }) : null;
  const type = phone?.getType();
  return phone?.isValid() && phone.country === value.country && (type === 'MOBILE' || type === 'FIXED_LINE_OR_MOBILE') ? phone.number : '';
}

export function phoneFieldValue(number) {
  const phone = parsePhoneNumberFromString(number || '', 'IN');
  return { ...EMPTY_REGISTRATION_PHONE, country: phone?.country || 'IN', number: phone?.nationalNumber || number || '' };
}

export function isRegistrationVerified(value) {
  return !!value.verificationId && Date.parse(value.expiresAt) > Date.now();
}

export default function RegistrationContactField({
  role, channel = 'phone', value, onChange, disabled, accountId, token, onAuthError,
  verificationMode = 'either', required = channel !== 'email' || role !== 'student'
}) {
  const isEmail = channel === 'email';
  const method = isEmail ? 'email' : 'SMS';
  const contactLabel = isEmail ? 'Email' : 'Mobile';
  const label = role === 'teacher' ? 'Teacher' : role === 'school' ? 'School' : 'Student';
  const prefix = `${role}${accountId ? '-edit' : ''}`;
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const operation = useRef(0);
  const verified = !!value.verificationId && Date.parse(value.expiresAt) > now;
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => () => { operation.current += 1; }, []);
  useEffect(() => {
    if (!value.number) {
      operation.current += 1;
      setChallenge('');
      setCode('');
      setError('');
      setResendAt(0);
    }
  }, [value.number]);
  useEffect(() => {
    if (disabled) {
      operation.current += 1;
      setBusy('');
    }
  }, [disabled]);
  useEffect(() => {
    if (!challenge && !value.verificationId) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge, value.verificationId]);
  useEffect(() => {
    if (value.verificationId && Date.parse(value.expiresAt) <= now) {
      onChange({ ...value, verificationId: '', expiresAt: '' });
      setChallenge('');
      setError(`${contactLabel} verification expired. Please request a new code.`);
    }
  }, [now, value, onChange, contactLabel]);

  function change(patch) {
    operation.current += 1;
    onChange({ ...value, ...patch, ...(isEmail ? { email: '' } : { phone: '' }), verificationId: '', expiresAt: '' });
    setChallenge('');
    setCode('');
    setError('');
    setResendAt(0);
    setBusy('');
  }

  function payload() {
    return { role, ...(accountId ? { accountId } : {}), ...(isEmail
      ? { email: value.number.trim().toLowerCase() }
      : { country: value.country, phone: registrationPhoneNumber(value) }) };
  }

  async function sendCode() {
    const body = payload();
    if (isEmail && (body.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(body.email))) {
      setError('Enter a valid email address.');
      return;
    }
    if (!isEmail && !body.phone) {
      setError('Enter a valid mobile number for the selected country, without the country code.');
      return;
    }
    const request = ++operation.current;
    setBusy('send');
    setError('');
    try {
      const result = role === 'school' ? await requestSchoolPhoneCode(body, token)
        : isEmail ? await requestRegistrationEmailCode(body) : await requestRegistrationPhoneCode(body);
      if (request !== operation.current) return;
      setChallenge(result.challengeId);
      setCode('');
      setNow(Date.now());
      setResendAt(Date.now() + result.resendAfter * 1000);
    } catch (e) {
      if (request === operation.current) {
        setError(e.message || `Could not send an ${method} code. Please try again.`);
        if (onAuthError && (e.status === 401 || e.status === 403)) onAuthError(e.message);
      }
    } finally { if (request === operation.current) setBusy(''); }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(code.trim())) { setError(`Enter the six-digit ${method} verification code.`); return; }
    const request = ++operation.current;
    setBusy('verify');
    setError('');
    try {
      const body = { ...payload(), challengeId: challenge, code: code.trim() };
      const result = role === 'school' ? await verifySchoolPhoneCode(body, token)
        : isEmail ? await verifyRegistrationEmailCode(body) : await verifyRegistrationPhoneCode(body);
      if (request !== operation.current) return;
      onChange({ ...value, ...(isEmail ? { email: result.email } : { phone: result.phone }), verificationId: result.verificationId, expiresAt: result.expiresAt });
      setCode('');
      setNow(Date.now());
    } catch (e) {
      if (request === operation.current) {
        setError(e.message || `Could not verify the ${method} code. Please try again.`);
        if (onAuthError && (e.status === 401 || e.status === 403)) onAuthError(e.message);
      }
    } finally { if (request === operation.current) setBusy(''); }
  }

  return <fieldset className="sd-phone-verification" disabled={disabled || !!busy}>
    <legend>{isEmail ? required ? 'Email address' : 'Email Address (optional)' : 'Mobile number'}
      {required ? <span className="sd-phone-required">Required</span> : null}
    </legend>
    {isEmail ? <label className="sd-field-label" htmlFor={`${prefix}-email-address`}>Email address
      <input id={`${prefix}-email-address`} aria-label={`${label} email address`} type="email" autoComplete="email" required={required}
        value={value.number} onChange={(e) => change({ number: e.target.value })} placeholder={role === 'teacher' ? 'Teacher email' : 'Email address'} />
    </label> : <div className="sd-phone-inputs">
      <label className="sd-field-label" htmlFor={`${prefix}-phone-country`}>Country code
        <select id={`${prefix}-phone-country`} aria-label={`${label} country code`} value={value.country} onChange={(e) => change({ country: e.target.value })}>
          {PHONE_COUNTRIES.map(({ country, name, code: callingCode }) => <option key={country} value={country}>{name} (+{callingCode})</option>)}
        </select>
      </label>
      <label className="sd-field-label" htmlFor={`${prefix}-phone-number`}>Mobile number
        <input id={`${prefix}-phone-number`} aria-label={`${label} mobile number`} type="tel" inputMode="tel" autoComplete="tel-national" required={required}
          value={value.number} onChange={(e) => change({ number: e.target.value })} placeholder="Mobile number" />
      </label>
    </div>}
    {verified ? <p className="sd-phone-verified" role="status">Verified {isEmail ? value.email : value.phone}</p>
      : verificationMode === 'unchanged' ? <p className="sd-phone-help">Verify this contact only if you change it.</p> : <>
        <p className="sd-phone-help">{!isEmail && role === 'student' ? 'Use a parent or guardian mobile number. ' : ''}
          {verificationMode === 'either' ? `Verify by ${method}, or verify your ${isEmail ? 'mobile number' : 'email address'} instead.` : `Verify this ${isEmail ? 'email address' : 'mobile number'} by ${method} before saving.`}
        </p>
        <button type="button" className="sd-phone-send" disabled={!value.number.trim() || !!busy || resendSeconds > 0} onClick={sendCode}>
          {busy === 'send' ? 'Sending code...' : resendSeconds > 0 ? `Resend in ${resendSeconds}s` : challenge ? `Resend ${method} code` : `Send ${method} code`}
        </button>
        {challenge ? <div className="sd-phone-code">
          <label className="sd-field-label" htmlFor={`${prefix}-${channel}-code`}>{isEmail ? 'Email' : 'SMS'} verification code
            <input id={`${prefix}-${channel}-code`} inputMode="numeric" autoComplete="one-time-code" value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" />
          </label>
          <button type="button" disabled={!!busy || !code.trim()} onClick={verifyCode}>{busy === 'verify' ? 'Verifying...' : isEmail ? 'Verify email' : 'Verify number'}</button>
        </div> : null}
      </>}
    {error ? <p className="sd-phone-error" role="alert">{error}</p> : null}
  </fieldset>;
}

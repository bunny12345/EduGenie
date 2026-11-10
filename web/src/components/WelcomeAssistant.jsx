import React, { useEffect, useRef, useState } from 'react';
import { getCountries, getCountryCallingCode, getExampleNumber, parsePhoneNumberFromString, validatePhoneNumberLength } from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/examples.mobile.json';
import { askVisitorBot, requestEnquiryCode, verifyEnquiryCode } from '../api';
import SchoolEnquiryThread from './SchoolEnquiryThread';

const SESSION_KEY = 'AcademiX.enquiry';
const INTRO = 'Welcome to AcademiX! Give every student a personal AI tutor for learning beyond the classroom. Sam helps them understand lessons, practise for exams and work through homework, while learning reports show how they grow. Explore the features below, or talk to our admin about bringing AcademiX to your school.';
const TOPICS = ['Meet the AI tutor', 'Explore all features', 'Progress & report cards', 'Your school name & logo', 'Custom features', 'School registration'];
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const COUNTRIES = getCountries().map((country) => ({
  country, name: countryNames.of(country), code: getCountryCallingCode(country)
})).sort((a, b) => a.name.localeCompare(b.name));
function whatsappError(number, country) {
  if (!number.trim()) return '';
  if (!/^[0-9 ()-]+$/.test(number)) return 'Enter only your mobile number. Select the country code separately.';
  const length = validatePhoneNumberLength(number, country);
  if (length === 'TOO_SHORT') return `Not enough digits for ${countryNames.of(country)}. Please enter the full mobile number.`;
  if (length === 'TOO_LONG') return `Too many digits for ${countryNames.of(country)}. Please check your mobile number.`;
  const phone = parsePhoneNumberFromString(number, { defaultCountry: country, extract: false });
  if (length || !phone?.isValid() || phone.country !== country) return `Enter a valid mobile number for ${countryNames.of(country)}. Check the number of digits and format.`;
  return '';
}
function SupportIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 13v-2a8 8 0 0 1 16 0v2M4 12H3v6h4v-6H4ZM20 12h1v6h-4v-6h3ZM20 18c0 3-3 3-6 3" /><path d="M10 20h4v2h-4z" />
  </svg>;
}

export default function WelcomeAssistant() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('explore');
  const [messages, setMessages] = useState([{ role: 'bot', content: INTRO }]);
  const [draft, setDraft] = useState('');
  const [form, setForm] = useState({ name: '', schoolName: '', email: '', message: '', consent: false, whatsappNumber: '', whatsappConsent: false });
  const [whatsappCountry, setWhatsappCountry] = useState('IN');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const launcher = useRef(null);
  const dialog = useRef(null);
  const bottom = useRef(null);
  const active = useRef(true);
  const phoneInput = useRef(null);
  const phoneError = whatsappError(form.whatsappNumber, whatsappCountry);
  const phoneExample = getExampleNumber(whatsappCountry, examples)?.nationalNumber;
  useEffect(() => {
    active.current = true;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const value = JSON.parse(raw);
        if (typeof value.id === 'string' && typeof value.token === 'string') setSaved(value);
        else throw new Error('Invalid saved chat');
      }
    } catch (e) { setError('Your saved enquiry could not be restored. Start a new enquiry or check browser storage permissions.'); }
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const node = dialog.current;
    const opener = launcher.current;
    node.showModal();
    return () => { node.close(); opener?.focus(); };
  }, [open]);
  useEffect(() => { if (open && tab === 'explore') bottom.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages, open, tab]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) {
      if (active.current) setError(e.message || 'Please try again. The request could not be completed.');
    } finally { if (active.current) setBusy(false); }
  }
  function ask(message) {
    if (!message.trim() || busy) return;
    setMessages((list) => [...list, { role: 'user', content: message.trim() }]);
    setDraft('');
    run(async () => {
      const previousQuestions = messages.filter((item) => item.role === 'user').slice(-4).map((item) => item.content);
      const result = await askVisitorBot(message.trim(), previousQuestions);
      if (active.current) setMessages((list) => [...list, { role: 'bot', content: result.reply, handoff: result.handoff }]);
    });
  }
  function requestCode(e) {
    e.preventDefault();
    setPhoneTouched(true);
    if (phoneError) { phoneInput.current?.focus(); return; }
    run(async () => {
      const contact = form.whatsappNumber.trim() ? {
        whatsappNumber: parsePhoneNumberFromString(form.whatsappNumber, { defaultCountry: whatsappCountry, extract: false }).number,
        whatsappCountry
      } : { whatsappNumber: '' };
      const result = await requestEnquiryCode({ ...form, ...contact });
      if (active.current) { setChallenge(result.challengeId); setCode(''); }
    });
  }
  function verify(e) {
    e.preventDefault();
    run(async () => {
      const result = await verifyEnquiryCode({ challengeId: challenge, code });
      if (!active.current) return;
      const session = { id: result.enquiry.id, token: result.token };
      setSaved(session);
      setWarning(result.notificationWarning || '');
      setCode('');
      setChallenge('');
      setForm({ name: '', schoolName: '', email: '', message: '', consent: false, whatsappNumber: '', whatsappConsent: false });
      setWhatsappCountry('IN');
      setPhoneTouched(false);
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {
        setWarning('Your enquiry is saved with the admin, but this browser cannot remember the chat. Keep it open to receive replies; enable browser storage to retain access after a reload.');
      }
    });
  }
  function restart() {
    try {
      localStorage.removeItem(SESSION_KEY);
      setSaved(null);
      setWarning('');
      setError('');
    } catch (e) { setError('This browser could not clear saved chat access. Check browser storage permissions.'); }
  }

  return <>
    <div className="vc-launcher-wrap">
      <span className="vc-launcher-caption">Discover your school’s AI tutor</span>
      <button ref={launcher} type="button" className="vc-launcher" aria-label="Open AcademiX welcome assistant" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <SupportIcon /><span className="vc-launcher-dot" />
      </button>
    </div>
    {open ? <dialog ref={dialog} className="vc-dialog" aria-labelledby="welcome-title" onCancel={() => setOpen(false)} onKeyDown={(e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    }}>
      <header className="vc-hero">
        <div className="vc-hero-top"><span className="vc-brand"><SupportIcon /> AcademiX welcome team</span><button type="button" className="vc-close" aria-label="Close welcome assistant" onClick={() => setOpen(false)}>×</button></div>
        <span className="vc-eyebrow">BIG POSSIBILITIES. PERSONAL LEARNING.</span>
        <h2 id="welcome-title">Your school.<br />Every student’s AI tutor.</h2>
        <p>Learning beyond the classroom, with your school at the heart.</p>
        <div className="vc-hero-tags"><span>Personal AI tutor</span><span>Progress insights</span><span>Your school brand</span></div>
      </header>
      <nav className="vc-tabs" aria-label="Welcome assistant sections">
        <button type="button" aria-pressed={tab === 'explore'} onClick={() => { setTab('explore'); setError(''); }}>Explore AcademiX</button>
        <button type="button" aria-pressed={tab === 'admin'} onClick={() => { setTab('admin'); setError(''); }}>Talk to admin {saved ? '•' : '↗'}</button>
      </nav>
      <div className="vc-body">
        {tab === 'explore' ? <>
          <div className="vc-feature-strip"><div><span>01</span><strong>Learn with Sam</strong><small>Explanations, practice & revision</small></div><div><span>02</span><strong>See growth</strong><small>Skills, subjects & report cards</small></div><div><span>03</span><strong>Make it yours</strong><small>School branding & custom features</small></div></div>
          <div className="vc-bot-log" role="log" aria-label="Welcome assistant messages" aria-live="polite">
            {messages.map((message, index) => <article key={index} className={`vc-message ${message.role === 'user' ? 'vc-message-visitor' : 'vc-message-admin'}`}>
              <span>{message.role === 'user' ? 'You' : 'AcademiX guide · automated'}</span><p>{message.content}</p>
              {message.handoff ? <button type="button" className="vc-text-btn" onClick={() => setTab('admin')}>Talk to admin</button> : null}
            </article>)}
            {busy ? <span className="vc-typing" aria-label="Assistant is replying">•••</span> : null}
            <div ref={bottom} />
          </div>
          <div className="vc-topics">{TOPICS.map((topic) => <button key={topic} type="button" disabled={busy} onClick={() => ask(topic)}>{topic}</button>)}</div>
          <form className="vc-bot-compose" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
            <label className="vc-sr-only" htmlFor="welcome-question">Ask about AcademiX</label>
            <input id="welcome-question" maxLength={2000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What would you like to know?" />
            <button type="submit" className="vc-primary" disabled={busy || !draft.trim()} aria-label="Send question">↑</button>
          </form>
          <p className="vc-privacy">A feature guide, not a person. For a demo, pricing or school onboarding, talk to our admin.</p>
        </> : saved ? <SchoolEnquiryThread key={saved.id} id={saved.id} token={saved.token} initialWarning={warning} onRestart={restart} /> : <>
          <div className="vc-contact-intro"><span className="vc-contact-icon"><SupportIcon /></span><div><h3>Let’s bring AcademiX to your school</h3><p>Discuss a demo, your school’s branding, new features or registration with our admin.</p></div></div>
          {challenge ? <form className="vc-contact-form" onSubmit={verify}>
            <h3>Check your email</h3><p>A six-digit code was sent to {form.email}. It expires in 10 minutes. Your enquiry is only sent to admin after verification.</p>
            <label>Email verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            <button type="submit" className="vc-primary" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify & send enquiry'}</button>
            <button type="button" className="vc-text-btn" disabled={busy} onClick={() => { setChallenge(''); setCode(''); }}>Change details or request a new code</button>
          </form> : <form className="vc-contact-form" onSubmit={requestCode}>
            <label>Your name<input required maxLength={100} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>School name<input required maxLength={160} autoComplete="organization" value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} /></label>
            <label>Work email<input type="email" required maxLength={254} autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <div className="vc-phone-fields">
              <label>Country code<select value={whatsappCountry} onChange={(e) => { setWhatsappCountry(e.target.value); setPhoneTouched(Boolean(form.whatsappNumber.trim())); }} aria-describedby="welcome-whatsapp-help">
                {COUNTRIES.map(({ country, name, code }) => <option key={country} value={country}>{name} (+{code})</option>)}
              </select></label>
              <label>WhatsApp number (optional)<input ref={phoneInput} type="tel" inputMode="tel" maxLength={32} autoComplete="tel-national" value={form.whatsappNumber} onBlur={() => setPhoneTouched(true)} onChange={(e) => {
                setForm({ ...form, whatsappNumber: e.target.value, whatsappConsent: e.target.value.trim() ? form.whatsappConsent : false });
                if (!e.target.value.trim()) setPhoneTouched(false);
              }} placeholder={phoneExample ? `e.g. ${phoneExample}` : 'Mobile number'} aria-invalid={phoneTouched && Boolean(phoneError)} aria-describedby={`welcome-whatsapp-help${phoneTouched && phoneError ? ' welcome-whatsapp-error' : ''}`} /></label>
            </div>
            <p id="welcome-whatsapp-help">Select your country code and enter your mobile number without repeating the code. Leave it blank if you don’t want WhatsApp contact. Email verification is still required.</p>
            {phoneTouched && phoneError ? <p id="welcome-whatsapp-error" className="vc-phone-error" role="alert">{phoneError}</p> : null}
            {form.whatsappNumber.trim() ? <label className="vc-consent"><input type="checkbox" required checked={form.whatsappConsent} onChange={(e) => setForm({ ...form, whatsappConsent: e.target.checked })} /><span>I’d like the AcademiX admin to contact me about this enquiry on WhatsApp at this number.</span></label> : null}
            <label>How can we help your school?<textarea required maxLength={4000} rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Tell us about your school and what you would like to explore…" /></label>
            <label className="vc-consent"><input type="checkbox" required checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} /><span>I agree to share these details with the AcademiX admin to discuss this enquiry and receive related email notifications.</span></label>
            <button type="submit" className="vc-primary" disabled={busy}>{busy ? 'Sending code…' : 'Verify email & connect'}</button>
          </form>}
          <p className="vc-privacy">No school account is created here. Chat access is remembered in this browser for up to 30 days. Please don’t include passwords or student information.</p>
        </>}
        {error ? <p className="vc-error" role="alert">{error}</p> : null}
      </div>
    </dialog> : null}
  </>;
}

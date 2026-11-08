import React, { useEffect, useRef, useState } from 'react';
import { getSchoolEnquiry, replySchoolEnquiry, retryEnquiryNotification, setSchoolEnquiryStatus } from '../api';

export default function SchoolEnquiryThread({ id, token, owner = false, initialWarning = '', onAuthError, onRestart }) {
  const [enquiry, setEnquiry] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState(initialWarning);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const retry = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let fetching = false;
    async function load() {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        let offset = 0;
        let result;
        const all = [];
        do {
          result = await getSchoolEnquiry(id, token, owner, offset, controller.signal);
          all.push(...result.messages);
          offset = result.nextOffset;
        } while (offset !== null && active);
        if (!active) return;
        setEnquiry(result.enquiry);
        setMessages(all);
        setError('');
      } catch (e) {
        if (!active) return;
        setError(e.message || 'Unable to retrieve the conversation.');
        if (owner && (e.status === 401 || e.status === 403)) onAuthError?.(e.message);
      } finally { fetching = false; }
    }
    load();
    const timer = setInterval(load, 10000);
    document.addEventListener('visibilitychange', load);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [id, token, owner, refresh, onAuthError]);

  async function action(fn) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) {
      if (mounted.current) {
        setError(e.message || 'The enquiry action failed.');
        if (owner && (e.status === 401 || e.status === 403)) onAuthError?.(e.message);
      }
    } finally { if (mounted.current) setBusy(false); }
  }
  function send(e) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    const message = draft.trim();
    action(async () => {
      if (!window.crypto?.randomUUID) throw new Error('Secure messaging requires HTTPS and a supported browser. Please open the secure website.');
      if (!retry.current || retry.current.message !== message) retry.current = { id: window.crypto.randomUUID(), message };
      const result = await replySchoolEnquiry(id, retry.current, token, owner);
      if (!mounted.current) return;
      setWarning(result.notificationWarning || '');
      retry.current = null;
      setDraft('');
      setRefresh((v) => v + 1);
    });
  }

  return <section className="vc-thread" aria-label="School enquiry conversation">
    <header className="vc-thread-head">
      <div><strong>{owner ? enquiry?.school_name || 'School enquiry' : 'Talk to admin'}</strong>
        <p>{owner ? `${enquiry?.name || ''} · ${enquiry?.email || ''}` : 'A real conversation with the AcademiX team. Replies appear here.'}</p>
      </div>
      {enquiry ? <span className="vc-status">{enquiry.status === 'resolved' ? 'Resolved' : 'Open enquiry'}</span> : null}
    </header>
    {enquiry?.whatsapp_number ? <div className="vc-whatsapp-contact">
      <strong>WhatsApp contact requested</strong>
      <p>{enquiry.whatsapp_number} · Provided by visitor; number not verified.</p>
      {owner && /^\+[1-9][0-9]{7,14}$/.test(enquiry.whatsapp_number) ? <a href={`https://wa.me/${enquiry.whatsapp_number.slice(1)}`} target="_blank" rel="noopener noreferrer">Contact on WhatsApp ↗</a> : null}
      <p>WhatsApp replies are separate and do not appear in this chat.</p>
    </div> : null}
    {error ? <div className="vc-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRefresh((v) => v + 1)}>Retry conversation</button></div> : null}
    {warning ? <div className="vc-warning" role="status"><p>{warning}</p>{!owner ? <button type="button" disabled={busy} onClick={() => action(async () => {
      const result = await retryEnquiryNotification(id, token);
      if (mounted.current) setWarning(result.notificationWarning || '');
    })}>Retry email notification</button> : null}</div> : null}
    <div className="vc-thread-messages" role="log" aria-label="Enquiry messages" aria-live="polite">
      {messages.map((message) => <article key={message.id} className={`vc-message ${message.author_role === 'owner' ? 'vc-message-admin' : 'vc-message-visitor'}`}>
        <span>{message.author_role === 'owner' ? 'AcademiX admin' : owner ? enquiry?.name || 'Visitor' : 'You'}</span>
        <p>{message.content}</p>
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
      </article>)}
    </div>
    <form className="vc-compose" onSubmit={send}>
      <label htmlFor={`enquiry-message-${id}`}>Your message</label>
      <textarea id={`enquiry-message-${id}`} required maxLength={4000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={owner ? 'Reply to the school…' : 'Ask about a demo, registration or your school’s needs…'} />
      <button type="submit" className="vc-primary" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send message'}</button>
    </form>
    <p className="vc-privacy">Do not share passwords, verification codes or student records. Email replies are not imported into this chat.</p>
    {owner && enquiry ? <button type="button" className="vc-text-btn" disabled={busy} onClick={() => action(async () => {
      await setSchoolEnquiryStatus(id, enquiry.status === 'resolved' ? 'open' : 'resolved', token);
      if (mounted.current) setRefresh((v) => v + 1);
    })}>{enquiry.status === 'resolved' ? 'Reopen enquiry' : 'Mark resolved'}</button> : null}
    {!owner && onRestart ? <button type="button" className="vc-text-btn" onClick={onRestart}>Forget this browser’s chat and start a new enquiry</button> : null}
  </section>;
}

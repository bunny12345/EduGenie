import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  askSupportBot, createSupportTicket, getSupportThread, listSupportTickets,
  replyToSupportTicket, retrySupportNotification, setSupportTicketStatus,
} from '../api';

const greeting = { role: 'bot', content: 'Hi! I’m the AcademiX Help Assistant. Ask me how to use the website or app. For a bug or a question I cannot solve, you can report an issue or connect to a technician. Never share passwords, verification codes or private records.' };

export default function TechnicalSupport({ ownerToken, onAuthError, requesterRole = 'student' }) {
  const owner = Boolean(ownerToken);
  const teacher = requesterRole === 'teacher';
  const school = requesterRole === 'school_admin';
  const [tickets, setTickets] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [selected, setSelected] = useState('');
  const [category, setCategory] = useState('');
  const [messages, setMessages] = useState([school ? { role: 'bot', content: 'Hi! I’m the AcademiX School Help Assistant. Ask me about teacher and student registration, invites, class assignments and curriculum uploads. Report an issue or connect to a technician if you need more help. Never share passwords, verification codes, invite links or private records. I cannot provide internal technical information or academic answers.' } : teacher ? { role: 'bot', content: 'Hi! I’m the AcademiX Teacher Help Assistant. Ask me about using the teacher website or app: announcements, homework, tests, students and progress. Report an issue or connect to a technician if you need more help. Never share passwords, verification codes or private student records. I cannot provide internal technical information or academic answers.' } : greeting]);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState(school ? ['How do I register a teacher?', 'How do I register a student?', 'How do I upload curriculum?'] : teacher ? ['How do I assign homework?', 'How do I create a test?', 'How do I use AI Assistant?'] : ['How do I submit homework?', 'How do I use Sam?', 'My microphone is not working']);
  const [needsTechnician, setNeedsTechnician] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [warning, setWarning] = useState('');
  const botEpoch = useRef(0);
  const listBusy = useRef(null);

  useEffect(() => () => { botEpoch.current += 1; }, []);

  const handleError = useCallback((e, setter = setError) => {
    if (e.name === 'AbortError') return;
    if (ownerToken && (e.status === 401 || e.status === 403) && onAuthError) {
      onAuthError(e.message);
    } else setter(e.message || 'Support is unavailable. Please try again.');
  }, [ownerToken, onAuthError]);

  const refresh = useCallback(async (signal) => {
    if (listBusy.current) return;
    const request = Symbol();
    listBusy.current = request;
    try {
      const data = await listSupportTickets(0, ownerToken, signal);
      if (!signal?.aborted) {
        setTickets(data.tickets);
        setNextOffset(data.nextOffset);
        setListError('');
      }
    } catch (e) {
      handleError(e, setListError);
    } finally { if (listBusy.current === request) listBusy.current = null; }
  }, [ownerToken, handleError]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    const timer = setInterval(() => refresh(controller.signal), 15000);
    return () => { controller.abort(); clearInterval(timer); listBusy.current = null; };
  }, [refresh]);

  async function loadMore() {
    if (nextOffset === null || listBusy.current) return;
    const request = Symbol();
    listBusy.current = request;
    try {
      const data = await listSupportTickets(nextOffset, ownerToken);
      setTickets((previous) => [...previous, ...data.tickets.filter((ticket) => !previous.some((item) => item.id === ticket.id))]);
      setNextOffset(data.nextOffset);
      setListError('');
    } catch (e) { handleError(e, setListError); }
    finally { if (listBusy.current === request) listBusy.current = null; }
  }

  function escalate(value) {
    botEpoch.current += 1;
    setBusy(false);
    setSelected('');
    setCategory(value);
    setError('');
    setWarning('');
  }

  async function ask(value = input) {
    const text = value.trim();
    if (!text || busy) return;
    if (text === 'Report an issue' || text === 'Report a glitch') { escalate('glitch'); return; }
    if (text === 'Connect to a technician') { escalate('technician'); return; }
    const epoch = botEpoch.current;
    setBusy(true);
    setError('');
    setInput('');
    setMessages((previous) => [...previous, { role: 'user', content: text }]);
    try {
      const previousQuestions = messages.filter((message) => message.role === 'user').slice(-4).map((message) => message.content);
      const data = await askSupportBot(text, previousQuestions);
      if (epoch !== botEpoch.current) return;
      setMessages((previous) => [...previous, { role: 'bot', content: data.reply }]);
      setSuggestions(data.suggestions);
      setNeedsTechnician(data.needsTechnician);
    } catch (e) { if (epoch === botEpoch.current) handleError(e); }
    finally { if (epoch === botEpoch.current) setBusy(false); }
  }

  function select(id) {
    botEpoch.current += 1;
    setBusy(false);
    setSelected(id);
    setCategory('');
    setError('');
    setWarning('');
  }

  return (
    <section className={`eg-support ${owner ? 'eg-support-owner' : ''}`} aria-label={owner ? 'Owner support inbox' : 'Technical support'}>
      <header className="eg-support-header">
        <div>
          <span className="eg-support-eyebrow">{owner ? 'MFA-protected technician workspace' : 'Website & app help'}</span>
          <h3>{owner ? 'Support Inbox' : school ? 'School Support' : teacher ? 'Teacher Support' : 'Technical Query'}</h3>
          <p>{owner ? 'View reported issues and reply directly to students, teachers and school administrators. Email replies are not imported here.' : 'Get help with AcademiX, report an issue, or speak with a technician.'}</p>
        </div>
        {!owner ? <div className="eg-support-actions">
          <button type="button" onClick={() => escalate('glitch')}>Report an issue</button>
          <button type="button" className="eg-support-primary" onClick={() => escalate('technician')}>Connect to a technician</button>
        </div> : null}
      </header>
      <div className="eg-support-layout">
        <aside className="eg-support-requests" aria-label="Support requests">
          {!owner ? <button type="button" className={`eg-support-request${!selected && !category ? ' selected' : ''}`} onClick={() => { select(''); }}>Help Assistant<span>App and website guidance</span></button> : null}
          <div className="eg-support-list-heading"><strong>{owner ? 'All requests' : 'Your requests'}</strong><button type="button" onClick={() => refresh()}>Refresh</button></div>
          {tickets.map((ticket) => <button key={ticket.id} type="button" className={`eg-support-request${selected === ticket.id ? ' selected' : ''}`} onClick={() => select(ticket.id)}>
            <strong>{ticket.subject}</strong>
            <span>{owner ? `${ticket.requester_name} · ${ticket.requester_role} · ${ticket.class_name || 'Class not specified'}` : ticket.category === 'glitch' ? 'Issue report' : 'Technician chat'}</span>
            <span className={`eg-support-badge ${ticket.status}`}>{ticket.status === 'resolved' ? 'Resolved' : 'Open'} · #{ticket.id.slice(0, 8)}</span>
          </button>)}
          {!tickets.length && !listError ? <p className="eg-support-empty">{owner ? 'No support requests yet.' : 'Your reports and technician chats appear here.'}</p> : null}
          {listError ? <p className="eg-support-error" role="alert">{listError}</p> : null}
          {nextOffset !== null ? <button type="button" onClick={loadMore}>Show more requests</button> : null}
        </aside>
        <div className="eg-support-main">
          {selected ? <SupportThread key={selected} id={selected} token={ownerToken} requesterRole={requesterRole} onError={handleError} onChanged={refresh} initialWarning={warning} /> :
            category ? <SupportReport key={category} category={category} history={messages} onCancel={() => setCategory('')} onCreated={(data) => {
              setWarning(data.notificationWarning || '');
              select(data.ticket.id);
              setWarning(data.notificationWarning || '');
              refresh();
            }} /> :
              owner ? <div className="eg-support-empty">Select a request to read its messages and reply.</div> :
                <>
                  <SupportMessages messages={messages} thinking={busy} requesterRole={requesterRole} />
                  {needsTechnician ? <p className="eg-support-handoff">Still need help? A technician can review your question. Use Connect to a technician above.</p> : null}
                  <div className="eg-support-suggestions">{suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={busy} onClick={() => ask(suggestion)}>{suggestion}</button>)}</div>
                  {error ? <p className="eg-support-error" role="alert">{error}</p> : null}
                  <SupportComposer value={input} setValue={setInput} disabled={busy} sending={busy} onSubmit={() => ask()} placeholder="Ask how to use AcademiX…" />
                  <small className="eg-support-privacy">The assistant gives verified feature guidance, not academic answers. Only questions you send to a technician are saved.</small>
                </>}
        </div>
      </div>
    </section>
  );
}

function SupportMessages({ messages, thinking, requesterRole = 'student' }) {
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }, [messages.length, thinking]);
  return <div className="eg-support-messages" role="log" aria-label="Support messages" aria-live="polite">
    {messages.map((message, index) => {
      const role = message.role || message.author_role;
      const isRequester = role === 'user' || role === 'student' || role === 'teacher' || role === 'school_admin';
      const authorRole = role === 'user' ? requesterRole : role;
      const label = authorRole === 'school_admin' ? 'School administrator' : authorRole === 'teacher' ? 'Teacher' : 'Student';
      return <article key={message.id || index} className={`eg-support-message ${isRequester ? 'student' : role === 'owner' ? 'technician' : 'bot'}`}>
        <strong>{isRequester ? label : role === 'owner' ? 'Technician' : 'Help Assistant'}</strong>
        <p>{message.content}</p>
        {message.created_at ? <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time> : null}
      </article>;
    })}
    {thinking ? <div className="eg-support-thinking" aria-label="Assistant is replying"><span /><span /><span /></div> : null}
    <div ref={end} />
  </div>;
}

function SupportComposer({ value, setValue, disabled, sending, onSubmit, placeholder }) {
  return <form className="eg-support-composer" onSubmit={(e) => { e.preventDefault(); if (!disabled && value.trim()) onSubmit(); }}>
    <label className="eg-support-input-label">Message<textarea value={value} onChange={(e) => setValue(e.target.value)} maxLength={2000} rows={2} placeholder={placeholder} disabled={disabled} /></label>
    <button type="submit" className="eg-support-primary" disabled={disabled || !value.trim()}>{sending ? 'Sending…' : 'Send'}</button>
  </form>;
}

function SupportReport({ category, history, onCancel, onCreated }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState(history.filter((m) => m.role === 'user').at(-1)?.content || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await createSupportTicket({ id: requestId.current, category, subject, description,
        recentMessages: history.filter((m) => m.role === 'user').slice(-12).map((m) => ({ role: 'user', content: m.content })) });
      if (mounted.current) onCreated(data);
    } catch (e) { if (mounted.current) setError(e.message || 'Could not submit your request. Try again.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <form className="eg-support-report" onSubmit={submit}>
    <h4>{category === 'glitch' ? 'Report an issue' : 'Connect to a technician'}</h4>
    <p>Your account role, name, school and class identify this request automatically. Your recent questions are included; do not include passwords or private records.</p>
    <label>Short title<input required maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="For example: Homework submit button is not responding" /></label>
    <label>What happened?<textarea required rows={5} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Which page or app feature? What did you try, and what happened instead?" /></label>
    <small>A technician receives an email notification and replies here. This is not an instant live-chat guarantee—return to Your requests to check replies.</small>
    {error ? <p className="eg-support-error" role="alert">{error}</p> : null}
    <div className="eg-support-actions"><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="eg-support-primary" disabled={busy}>{busy ? 'Submitting…' : 'Send to technician'}</button></div>
  </form>;
}

function SupportThread({ id, token, requesterRole, onError, onChanged, initialWarning }) {
  const [thread, setThread] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState(initialWarning || '');
  const actionId = useRef(null);
  const refreshing = useRef(null);
  const alive = useRef(true);

  const refresh = useCallback(async (signal) => {
    if (refreshing.current) return;
    const request = Symbol();
    refreshing.current = request;
    try {
      const data = await getSupportThread(id, token, signal);
      if (alive.current && !signal?.aborted) { setThread(data); setError(''); }
    } catch (e) {
      if (alive.current) {
        if (e.status === 404) setThread(null);
        onError(e, setError);
      }
    }
    finally { if (refreshing.current === request) refreshing.current = null; }
  }, [id, token, onError]);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    refresh(controller.signal);
    const timer = setInterval(() => refresh(controller.signal), 10000);
    return () => { alive.current = false; controller.abort(); clearInterval(timer); refreshing.current = null; };
  }, [refresh]);

  async function send() {
    if (busy || !input.trim()) return;
    const text = input.trim();
    if (!actionId.current || actionId.current.text !== text) actionId.current = { id: crypto.randomUUID(), text };
    setBusy(true);
    setError('');
    try {
      const data = await replyToSupportTicket(id, { id: actionId.current.id, message: text }, token);
      if (!alive.current) return;
      actionId.current = null;
      setInput('');
      setWarning(data.notificationWarning || '');
      await refresh();
      onChanged();
    } catch (e) { if (alive.current) onError(e, setError); }
    finally { if (alive.current) setBusy(false); }
  }

  async function updateStatus() {
    setBusy(true);
    try {
      await setSupportTicketStatus(id, thread.ticket.status === 'open' ? 'resolved' : 'open', token);
      if (!alive.current) return;
      await refresh();
      onChanged();
    } catch (e) { if (alive.current) onError(e, setError); }
    finally { if (alive.current) setBusy(false); }
  }

  async function retryEmail() {
    setBusy(true);
    try {
      const data = await retrySupportNotification(id);
      if (alive.current) setWarning(data.notificationWarning || '');
    } catch (e) { if (alive.current) onError(e, setError); }
    finally { if (alive.current) setBusy(false); }
  }

  return <>
    {thread ? <div className="eg-support-thread-heading"><div><h4>{thread.ticket.subject}</h4><p>{thread.ticket.status === 'resolved' ? 'Resolved. This request and its messages are automatically deleted 48 hours after resolution. Sending another message before then reopens it.' : 'Sent to the technician. Replies appear here.'}</p>
      {token ? <small>{thread.ticket.requester_name} · {thread.ticket.requester_role} · {thread.ticket.class_name}<br />School ID: {thread.ticket.school_id}<br />Account ID: {thread.ticket.requester_id}</small> : null}</div>
      {token ? <button type="button" disabled={busy} onClick={updateStatus}>{thread.ticket.status === 'open' ? 'Mark resolved' : 'Reopen'}</button> : <button type="button" disabled={busy} onClick={() => refresh()}>Check replies</button>}</div> : null}
    <SupportMessages messages={thread?.messages || []} requesterRole={requesterRole} />
    {error ? <p className="eg-support-error" role="alert">{error}</p> : null}
    {warning ? <div className="eg-support-warning" role="status">{warning}<button type="button" disabled={busy} onClick={retryEmail}>Retry email notification</button></div> : null}
    <SupportComposer value={input} setValue={setInput} disabled={busy || !thread} sending={busy} onSubmit={send} placeholder={token ? 'Write your reply…' : 'Message the technician…'} />
    <small className="eg-support-privacy">Never share passwords, verification codes or confidential records. Replies refresh automatically while this chat is open.</small>
  </>;
}

import React, { useState, useRef } from 'react';
import { sendChat, addMemory } from '../api';
import ProfileEditor from './ProfileEditor';
import MessageBubble from './MessageBubble';

export default function Chat({ studentId = 'test' }) {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [followups, setFollowups] = useState([]);
  const messagesRef = useRef(null);

  async function sendMessage(txt) {
    const ts = Date.now();
    const userMsg = { role: 'user', text: txt, ts };
    setHistory((h) => [...h, userMsg]);
    setMessage('');
    setLoading(true);
    setTyping(true);
    try {
      const res = await sendChat(studentId, txt);
      const raw = res && (res.reply || res.answer || res.data) || null;
      let assistantText = 'No reply';
      if (typeof raw === 'string') assistantText = raw;
      else if (raw && typeof raw.text === 'string') assistantText = raw.text;
      else if (raw && typeof raw === 'object') assistantText = JSON.stringify(raw);

      // parse lightweight follow-up suggestions
      const FU_MARKER = /Follow-up suggestions/i;
      if (FU_MARKER.test(assistantText)) {
        const parts = assistantText.split(/\n\nFollow-up suggestions(?: for [^:\n]+)?:/i);
        const main = parts[0].trim();
        const fuPart = parts[1] || '';
        // split by numbered items like '1) ... 2) ...' or by newline
        const fuList = fuPart.split(/\d+\)\s*/).map((s) => s.trim()).filter(Boolean);
        setFollowups(fuList);
        assistantText = main;
      } else {
        setFollowups([]);
      }

      // simulate streaming/typing
      await new Promise((r) => setTimeout(r, 400));
      setHistory((h) => [...h, { role: 'assistant', text: assistantText, ts: Date.now() }]);
    } catch (err) {
      setHistory((h) => [...h, { role: 'assistant', text: 'Error: ' + err.message, ts: Date.now() }]);
    } finally {
      setLoading(false);
      setTyping(false);
      // scroll to bottom
      setTimeout(() => messagesRef.current && (messagesRef.current.scrollTop = messagesRef.current.scrollHeight), 50);
    }
  }

  async function onSend(e) {
    e && e.preventDefault();
    const txt = message.trim();
    if (!txt) return;
    await sendMessage(txt);
  }

  async function handleFollowup(s) {
    // automatically send followup suggestion as user's message
    await sendMessage(s);
  }

  async function onSaveMemory() {
    const last = history[history.length - 1];
    if (!last) return;
    try {
      await addMemory(studentId, last.text || '');
      alert('Saved to memories');
    } catch (e) {
      alert('Failed to save memory');
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 520 }}>
      <h3 style={{ marginTop: 0 }}>Chat</h3>
      <ProfileEditor studentId={studentId} onSaved={(s) => { /* could show toast */ }} />
      <div ref={messagesRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {history.length === 0 && <div style={{ color: '#666' }}>Ask EduGenie a question about the student.</div>}
        {history.map((m, i) => <MessageBubble key={i} role={m.role} text={m.text} ts={m.ts} />)}
        {typing && (
          <div className="typing" style={{ marginTop: 6 }}>
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        )}
        {followups && followups.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {followups.map((f, i) => (
              <button key={i} onClick={() => handleFollowup(f)} style={{ background: '#fff', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 6 }}>
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
      <form onSubmit={onSend} style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask something about the student..." style={{ flex: 1 }} />
        <button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send'}</button>
        <button type="button" onClick={onSaveMemory} style={{ background: '#e2e8f0', color: '#111', border: '1px solid #ccc' }}>Save</button>
      </form>
    </div>
  );
}

import React from 'react';

export default function MessageBubble({ role, text, ts }) {
  const isUser = role === 'user';
  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <div className="avatar" aria-hidden>
          <div className="avatar-initials">EG</div>
        </div>
      )}
      <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'} animate-up`}>
        <div className="message-text">{text}</div>
        {ts && <div className="message-ts">{new Date(ts).toLocaleTimeString()}</div>}
      </div>
      {isUser && (
        <div className="avatar avatar-right" aria-hidden>
          <div className="avatar-initials">YOU</div>
        </div>
      )}
    </div>
  );
}

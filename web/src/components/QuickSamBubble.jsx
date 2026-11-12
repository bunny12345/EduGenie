import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SamAvatar from './SamAvatar';
import MathMarkdown from './MathMarkdown';
import { sendQuickSamChat, generateLocalTtsAudio, transcribeTutorAudio } from '../api';

// Floating "Sam" bubble on the student home page. Opens the full-screen Sam
// avatar for quick questions across ALL of the class's subjects (no subject or
// lesson filter). The conversation lives only in this component's state: it is
// never saved and is wiped as soon as the student closes Sam.

function toSpeech(raw) {
  return String(raw || '')
    .replace(/\$\$?([^$]+)\$\$?/g, '$1')
    .replace(/\\(frac)\{([^}]*)\}\{([^}]*)\}/g, '$2 over $3')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\*\*|`|^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, ' ')
    .replace(/([.!?:;,])[ \t]*\n+[ \t]*/g, '$1 ')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

function base64ToBlob(base64, mimeType) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
}

export function splitSamSpeech(text) {
  const chunks = [];
  let rest = text.trim();
  while (rest) {
    const limit = chunks.length ? 600 : 240;
    const boundary = /[.!?](?=\s)/g;
    const ends = [...rest.slice(0, limit).matchAll(boundary)];
    let end = ends.length ? (chunks.length ? ends[ends.length - 1].index : ends[0].index) + 1 : Math.min(limit, rest.length);
    if (!ends.length && rest.length > limit) {
      const space = rest.lastIndexOf(' ', limit);
      if (space > 0) end = space;
    }
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  return chunks;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Unable to read audio'));
    reader.readAsDataURL(blob);
  });
}

export default function QuickSamBubble({ studentId, schoolName = '', greetingName = '' }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);

  // Bumped on every close so late replies/audio from a closed session are dropped.
  const sessionRef = useRef(0);
  const abortRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef('');
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const levelBufRef = useRef(null);
  const freqBufRef = useRef(null);
  const levelLiveRef = useRef(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const mutedRef = useRef(false);
  const speechRateRef = useRef(1);
  const speechRevisionRef = useRef(0);
  const finishAudioRef = useRef(null);
  const utteranceRef = useRef(null);
  const messagesRef = useRef([]);
  messagesRef.current = messages;

  const firstName = String(greetingName || '').trim().split(/\s+/)[0] || '';

  const stopSpeaking = useCallback(() => {
    speechRevisionRef.current += 1;
    finishAudioRef.current?.();
    finishAudioRef.current = null;
    utteranceRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      try { audio.pause(); } catch { /* ignore */ }
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = '';
    audioRef.current = null;
    levelLiveRef.current = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
    setVoicePlaying(false);
  }, []);

  const stopRecorder = useCallback((discard) => {
    const rec = recorderRef.current;
    if (rec && discard) rec.ondataavailable = null;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* ignore */ }
    }
    if (discard) {
      recorderRef.current = null;
      (streamRef.current?.getTracks() || []).forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
      streamRef.current = null;
      setRecording(false);
    }
  }, []);

  async function attachAnalyser(audio) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 300))]);
      }
      if (ctx.state !== 'running') return;
      if (audioRef.current !== audio) return;
      if (!analyserRef.current) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
        levelBufRef.current = new Uint8Array(analyser.fftSize);
        freqBufRef.current = new Uint8Array(analyser.frequencyBinCount);
      }
      ctx.createMediaElementSource(audio).connect(analyserRef.current);
      levelLiveRef.current = true;
    } catch {
      /* the avatar falls back to a procedural mouth */
    }
  }

  // Same loudness/brightness signal the AI Tutor's Sam uses for lip sync.
  const getMouthLevel = useCallback(() => {
    const analyser = analyserRef.current;
    const buf = levelBufRef.current;
    const freq = freqBufRef.current;
    if (!analyser || !buf || !freq || !levelLiveRef.current) return null;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const level = Math.min(1, Math.sqrt(sum / buf.length) * 5);
    analyser.getByteFrequencyData(freq);
    let weighted = 0;
    let total = 0;
    for (let i = 1; i < freq.length; i += 1) {
      weighted += i * freq[i];
      total += freq[i];
    }
    const centroid = total > 0 ? weighted / total / freq.length : 0;
    return { level, bright: Math.min(1, Math.max(0, (centroid - 0.04) / 0.14)) };
  }, []);

  async function speak(text) {
    const speech = toSpeech(text);
    if (!speech || mutedRef.current) return;
    const session = sessionRef.current;
    stopSpeaking();
    const revision = speechRevisionRef.current;
    const valid = () => session === sessionRef.current && revision === speechRevisionRef.current && !mutedRef.current;
    const chunks = splitSamSpeech(speech);
    // Prepare one short segment ahead while the current segment is speaking.
    // Capture failures here so a prefetched rejection can never go unhandled.
    const prepare = (chunk) => generateLocalTtsAudio(chunk, 'en-US', studentId, 'shimmer', 1)
      .then((tts) => ({ tts }), (error) => ({ error }));
    let pending = prepare(chunks[0]);
    for (let i = 0; i < chunks.length; i += 1) {
      const result = await pending;
      if (!valid()) return;
      pending = i + 1 < chunks.length ? prepare(chunks[i + 1]) : null;
      try {
        if (result.error) throw result.error;
        const b64 = String(result.tts?.audioBase64 || '').trim();
        if (!b64) throw new Error('Sam returned empty voice audio');
        const url = URL.createObjectURL(base64ToBlob(b64, result.tts?.mimeType));
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.playbackRate = speechRateRef.current;
        audioRef.current = audio;
        audioUrlRef.current = url;
        await new Promise((resolve, reject) => {
          finishAudioRef.current = resolve;
          audio.onplaying = () => { if (valid()) setVoicePlaying(true); };
          audio.onended = resolve;
          audio.onerror = () => reject(new Error('Sam audio playback failed'));
          // Lip-sync setup must not delay audio playback.
          attachAnalyser(audio);
          audio.play().catch(reject);
        });
      } catch (error) {
        if (!valid()) return;
        console.warn('Quick Sam voice playback failed', error);
        audioRef.current?.pause();
        if (!window.speechSynthesis) {
          setError('Sam’s voice is unavailable. You can still read the reply.');
          return;
        }
        await new Promise((resolve) => {
          const u = new window.SpeechSynthesisUtterance(chunks[i]);
          utteranceRef.current = u;
          finishAudioRef.current = resolve;
          u.lang = 'en-US';
          u.rate = speechRateRef.current;
          u.pitch = 1.3;
          u.onstart = () => { if (valid()) setVoicePlaying(true); };
          u.onend = resolve;
          u.onerror = () => {
            if (valid()) setError('Sam’s voice is unavailable. You can still read the reply.');
            resolve();
          };
          window.speechSynthesis.speak(u);
        });
      } finally {
        if (valid()) {
          if (audioRef.current) {
            audioRef.current.onplaying = null;
            audioRef.current.onended = null;
            audioRef.current.onerror = null;
          }
          if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
          audioRef.current = null;
          audioUrlRef.current = '';
          finishAudioRef.current = null;
          utteranceRef.current = null;
          levelLiveRef.current = false;
          setVoicePlaying(false);
        }
      }
    }
  }

  function changeSpeechRate(event) {
    const rate = Number(event.target.value);
    speechRateRef.current = rate;
    setSpeechRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
    // SpeechSynthesis cannot change rate mid-utterance; apply it to the next segment.
    if (utteranceRef.current) utteranceRef.current.rate = rate;
  }

  async function send(raw) {
    const text = String(raw ?? input).trim();
    if (!text || busy) return;
    const session = sessionRef.current;
    const history = messagesRef.current
      .filter((m) => !m.local)
      .slice(-12)
      .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
    setInput('');
    setError('');
    setFollowups([]);
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setBusy(true);
    stopSpeaking();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await sendQuickSamChat(studentId, text, history, controller.signal);
      if (session !== sessionRef.current) return;
      const reply = String(res?.reply || '').trim() || "Sorry, I couldn't come up with an answer. Try asking in a different way.";
      setMessages((prev) => [...prev, { role: 'ai', text: reply }]);
      setFollowups(Array.isArray(res?.followups) ? res.followups.slice(0, 3) : []);
      speak(reply);
    } catch (e) {
      if (session !== sessionRef.current || e?.name === 'AbortError') return;
      setError('Sam could not answer right now. Please try again.');
    } finally {
      if (session === sessionRef.current) {
        setBusy(false);
        abortRef.current = null;
      }
    }
  }

  async function toggleRecording() {
    if (recording) {
      stopRecorder(false);
      return;
    }
    if (busy || transcribing) return;
    setError('');
    stopSpeaking();
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('unsupported');
      }
      const session = sessionRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (session !== sessionRef.current || !chunks.length) return;
        setTranscribing(true);
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          const audioBase64 = await blobToBase64(blob);
          const result = await transcribeTutorAudio(studentId, { audioBase64, mimeType: blob.type });
          if (session !== sessionRef.current) return;
          const heard = String(result?.text || '').trim();
          if (heard) send(heard);
          else setError("I couldn't catch that. Try again!");
        } catch {
          if (session === sessionRef.current) setError("I couldn't catch that. Try again!");
        } finally {
          if (session === sessionRef.current) setTranscribing(false);
        }
      };
      streamRef.current = stream;
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError('Microphone is not available. You can type your question instead.');
    }
  }

  function openSam() {
    setOpen(true);
    setMessages([{
      role: 'ai',
      local: true,
      text: `Hi${firstName ? ` ${firstName}` : ''}! 👋 I'm Sam. Ask me anything from your class subjects — no need to pick a subject or lesson.`,
    }]);
    setFollowups([]);
    setError('');
    setInput('');
  }

  // Closing wipes the whole conversation: nothing about it is kept.
  const closeSam = useCallback(() => {
    sessionRef.current += 1;
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* ignore */ }
      abortRef.current = null;
    }
    stopSpeaking();
    stopRecorder(true);
    setOpen(false);
    setMessages([]);
    setFollowups([]);
    setInput('');
    setError('');
    setBusy(false);
    setTranscribing(false);
  }, [stopSpeaking, stopRecorder]);

  function toggleMute() {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    if (next) stopSpeaking();
  }

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeSam(); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, closeSam]);

  useEffect(() => {
    const box = listRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, busy]);

  // Leaving the home page (or logging out) unmounts the bubble: end everything.
  useEffect(() => () => {
    sessionRef.current += 1;
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* ignore */ }
    }
    stopSpeaking();
    stopRecorder(true);
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
    }
  }, [stopSpeaking, stopRecorder]);

  const thinking = busy || transcribing;
  const mode = voicePlaying ? 'speaking' : recording ? 'listening' : thinking ? 'thinking' : 'idle';
  const status = recording ? '🎙️ Listening… tap the mic again when you are done'
    : transcribing ? '💭 Catching what you said…'
    : busy ? '💭 Sam is thinking…'
    : voicePlaying ? '🔊 Sam is talking…'
    : '✨ Ask me about any of your subjects';

  return (
    <>
      {!open && (
        <button type="button" className="eg-quick-sam-fab" onClick={openSam} aria-label="Ask Sam a quick question" title="Ask Sam a quick question">
          <span className="eg-quick-sam-ring" aria-hidden="true" />
          <span className="eg-quick-sam-core">Sam</span>
        </button>
      )}
      {open && createPortal(
        <div className={`eg-sam-live eg-quick-sam ${mode}`} role="dialog" aria-modal="true" aria-label="Ask Sam">
          <div className="eg-sam-live-bg" aria-hidden="true">
            <span /><span /><span /><span /><span /><span />
          </div>

          <header className="eg-sam-live-top">
            <div className="eg-sam-live-title">
              <strong>Sam</strong>
              <span>Quick help · all your class subjects</span>
            </div>
            {schoolName ? <div className="eg-sam-live-school">🏫 {schoolName}</div> : <span />}
            <div className="eg-sam-live-actions">
              <label className="eg-quick-sam-speed">
                <span>Speed</span>
                <select aria-label="Sam speaking speed" value={speechRate} onChange={changeSpeechRate}>
                  {[1, 2].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
                </select>
              </label>
              <button type="button" className="eg-sam-live-btn" onClick={toggleMute} title={muted ? 'Turn Sam\'s voice on' : 'Mute Sam'}>
                {muted ? '🔈 Unmute' : '🔇 Mute'}
              </button>
              <button type="button" className="eg-sam-live-btn eg-sam-live-end" onClick={closeSam} aria-label="Close Sam">✕ Close</button>
            </div>
          </header>

          <div className="eg-sam-live-stage">
            <div className="eg-sam-live-glow" aria-hidden="true" />
            <SamAvatar mode={mode} schoolName={schoolName} getLevel={getMouthLevel} />
          </div>

          <div className="eg-sam-live-panel eg-quick-sam-panel">
            <div className="eg-quick-sam-list" ref={listRef} aria-live="polite">
              {messages.map((m, i) => (
                <div key={i} className={`eg-quick-sam-msg ${m.role === 'ai' ? 'ai' : 'me'}`}>
                  {m.role === 'ai'
                    ? <MathMarkdown text={m.text} className="eg-sam-live-caption-md" />
                    : m.text}
                </div>
              ))}
              {busy && (
                <div className="eg-quick-sam-msg ai eg-quick-sam-typing" aria-label="Sam is typing">
                  <span /><span /><span />
                </div>
              )}
            </div>

            {followups.length > 0 && !busy && (
              <div className="eg-quick-sam-chips">
                {followups.map((f) => (
                  <button key={f} type="button" className="eg-quick-sam-chip" onClick={() => send(f)}>{f}</button>
                ))}
              </div>
            )}

            <div className={`eg-quick-sam-status ${mode}`}>{status}</div>
            {error ? <p className="eg-quick-sam-error">{error}</p> : null}

            <form
              className="eg-quick-sam-input"
              onSubmit={(e) => { e.preventDefault(); send(); }}
            >
              <button
                type="button"
                className={`eg-quick-sam-mic ${recording ? 'on' : ''}`}
                onClick={toggleRecording}
                disabled={busy || transcribing}
                aria-label={recording ? 'Stop and send' : 'Ask by voice'}
                title={recording ? 'Stop and send' : 'Ask by voice'}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
                  {recording ? (
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  ) : (
                    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 11a1 1 0 0 0-2 0Z" />
                  )}
                </svg>
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Sam anything from your lessons…"
                maxLength={1000}
                disabled={recording}
              />
              <button type="submit" className="eg-quick-sam-send" disabled={busy || !input.trim()}>Send</button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

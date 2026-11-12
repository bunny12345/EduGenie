import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuickSamBubble, { splitSamSpeech } from './QuickSamBubble';
import { generateLocalTtsAudio, sendQuickSamChat } from '../api';

jest.mock('../api');
jest.mock('./SamAvatar', () => () => null);
jest.mock('./MathMarkdown', () => ({ text }) => <span>{text}</span>);

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const tts = { audioBase64: 'YXVkaW8=', mimeType: 'audio/mpeg' };
let players;
beforeEach(() => {
  jest.clearAllMocks();
  players = [];
  window.Audio = jest.fn().mockImplementation(() => {
    const audio = { playbackRate: 1, pause: jest.fn(), play: jest.fn().mockImplementation(() => {
      audio.onplaying?.();
      return Promise.resolve();
    }) };
    players.push(audio);
    return audio;
  });
  URL.createObjectURL = jest.fn(() => 'blob:sam');
  URL.revokeObjectURL = jest.fn();
  sendQuickSamChat.mockResolvedValue({ reply: 'First short sentence. Then the rest of the answer.' });
  generateLocalTtsAudio.mockResolvedValue(tts);
});

async function ask(text = 'Question') {
  fireEvent.change(screen.getByPlaceholderText('Ask Sam anything from your lessons…'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  await waitFor(() => expect(sendQuickSamChat).toHaveBeenCalled());
}

function open() {
  render(<QuickSamBubble studentId="student" />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Sam a quick question' }));
}

test('splits a short first segment and bounded remaining segments without losing text', () => {
  const text = `A quick introduction. ${'More explanation without sentence breaks '.repeat(60)}`;
  const parts = splitSamSpeech(text);
  expect(parts[0]).toBe('A quick introduction.');
  expect(parts[0].length).toBeLessThanOrEqual(240);
  expect(parts.slice(1).every((part) => part.length <= 600)).toBe(true);
  expect(parts.join(' ')).toBe(text.trim());
});

test('plays the short first segment before remaining speech is ready, with no overlapping segments', async () => {
  const second = deferred();
  generateLocalTtsAudio.mockResolvedValueOnce(tts).mockReturnValueOnce(second.promise);
  open();
  await ask();
  await waitFor(() => expect(players).toHaveLength(1));
  expect(generateLocalTtsAudio.mock.calls[0][0]).toBe('First short sentence.');
  expect(generateLocalTtsAudio.mock.calls[0][4]).toBe(1);
  expect(screen.getByText('First short sentence. Then the rest of the answer.')).toBeInTheDocument();
  expect(generateLocalTtsAudio).toHaveBeenCalledTimes(2);
  await act(async () => second.resolve(tts));
  expect(players).toHaveLength(1);
  await act(async () => players[0].onended());
  await waitFor(() => expect(players).toHaveLength(2));
  expect(players[1].play).toHaveBeenCalledTimes(1);
});

test('only 1x and 2x are offered and update playback without another TTS request', async () => {
  open();
  await ask();
  await waitFor(() => expect(players).toHaveLength(1));
  expect(screen.getAllByRole('option').map((option) => option.value)).toEqual(['1', '2']);
  for (const rate of [2, 1]) {
    fireEvent.change(screen.getByRole('combobox', { name: 'Sam speaking speed' }), { target: { value: String(rate) } });
    expect(players[0].playbackRate).toBe(rate);
  }
  fireEvent.change(screen.getByRole('combobox', { name: 'Sam speaking speed' }), { target: { value: '2' } });
  await act(async () => players[0].onended());
  await waitFor(() => expect(players).toHaveLength(2));
  expect(players[1].playbackRate).toBe(2);
  expect(generateLocalTtsAudio).toHaveBeenCalledTimes(2);
});

test.each(['mute', 'close', 'new question'])('late TTS cannot start after %s', async (action) => {
  const old = deferred();
  generateLocalTtsAudio.mockReturnValueOnce(old.promise);
  open();
  await ask();
  await waitFor(() => expect(generateLocalTtsAudio).toHaveBeenCalledTimes(1));
  if (action === 'mute') {
    fireEvent.click(screen.getByRole('button', { name: '🔇 Mute' }));
    fireEvent.click(screen.getByRole('button', { name: '🔈 Unmute' }));
  } else if (action === 'close') {
    fireEvent.click(screen.getByRole('button', { name: 'Close Sam' }));
  } else {
    sendQuickSamChat.mockResolvedValue({ reply: 'Newest answer' });
    await ask('Another question');
  }
  await waitFor(() => expect(players).toHaveLength(action === 'new question' ? 1 : 0));
  const count = players.length;
  await act(async () => old.resolve(tts));
  expect(players).toHaveLength(count);
});

test('muting stops audible speech and discards prefetched segments', async () => {
  open();
  await ask();
  await waitFor(() => expect(players).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: '🔇 Mute' }));
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
  expect(players[0].pause).toHaveBeenCalledTimes(1);
  expect(players).toHaveLength(1);
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});

test('slow lip-sync audio-context setup does not delay sound', async () => {
  const resumed = deferred();
  const original = window.AudioContext;
  window.AudioContext = jest.fn(() => ({
    state: 'suspended',
    resume: () => resumed.promise,
    close: jest.fn(),
  }));
  try {
    open();
    await ask();
    await waitFor(() => expect(players).toHaveLength(1));
    expect(players[0].play).toHaveBeenCalledTimes(1);
    await act(async () => resumed.resolve());
  } finally {
    window.AudioContext = original;
  }
});

test('unmounting discards unfinished voice generation', async () => {
  const old = deferred();
  generateLocalTtsAudio.mockReturnValueOnce(old.promise);
  const view = render(<QuickSamBubble studentId="student" />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Sam a quick question' }));
  await ask();
  view.unmount();
  await act(async () => old.resolve(tts));
  expect(players).toHaveLength(0);
});

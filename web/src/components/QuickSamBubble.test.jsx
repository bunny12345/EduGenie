import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuickSamBubble, { HOMEWORK_HELP_PROMPT, splitSamSpeech } from './QuickSamBubble';
import { generateLocalTtsAudio, prepareSamSpeech, sendQuickSamChat } from '../api';

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
  prepareSamSpeech.mockResolvedValue({ speechText: 'First short sentence. Then the rest of the answer.' });
});

async function ask(text = 'Question') {
  fireEvent.change(screen.getByPlaceholderText('Ask Sam anything from your units…'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send', exact: true }));
  await waitFor(() => expect(sendQuickSamChat).toHaveBeenCalled());
}

function open() {
  const view = render(<QuickSamBubble studentId="student" />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Sam a quick question' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop Sam speaking' }));
  generateLocalTtsAudio.mockClear();
  return view;
}

test('opening Sam speaks a local greeting and learning question without a teaching request', async () => {
  render(<QuickSamBubble studentId="student" greetingName="Alex Taylor" />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Sam a quick question' }));
  await waitFor(() => expect(players).toHaveLength(1));
  expect(generateLocalTtsAudio.mock.calls[0][0]).toBe('Hi Alex!');
  expect(screen.getByText(/What would you like to learn today/)).toBeInTheDocument();
  expect(generateLocalTtsAudio.mock.calls.map((call) => call[0]).join(' ')).toContain('What would you like to learn today?');
  expect(sendQuickSamChat).not.toHaveBeenCalled();
  expect(prepareSamSpeech).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Stop Sam speaking' }));
  expect(players[0].pause).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Ask by voice' })).toBeEnabled();
  await ask('Explain fractions');
  expect(sendQuickSamChat.mock.calls[0][2]).toEqual([]);
});

test('muted reopening keeps the welcome message without starting voice', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: '🔇 Mute' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close Sam' }));
  generateLocalTtsAudio.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Ask Sam a quick question' }));
  expect(generateLocalTtsAudio).not.toHaveBeenCalled();
  expect(screen.getByText(/What would you like to learn today/)).toBeInTheDocument();
});

test('homework help opens automatically, retains its id on follow-ups, and clears it on close', async () => {
  const started = jest.fn();
  const view = render(<QuickSamBubble studentId="student" homeworkHelpRequest={{ homeworkId: 'homework-a' }} onHomeworkHelpStarted={started} />);
  await waitFor(() => expect(sendQuickSamChat).toHaveBeenCalledTimes(1));
  expect(sendQuickSamChat).toHaveBeenLastCalledWith('student', HOMEWORK_HELP_PROMPT, [], expect.any(AbortSignal), 'homework-a');
  expect(started).toHaveBeenCalledTimes(1);
  view.rerender(<QuickSamBubble studentId="student" onHomeworkHelpStarted={started} />);
  expect(await screen.findByText('First short sentence. Then the rest of the answer.')).toBeInTheDocument();
  await ask('I tried a factor. Give me one more hint.');
  await waitFor(() => expect(sendQuickSamChat).toHaveBeenCalledTimes(2));
  expect(sendQuickSamChat.mock.calls[1][4]).toBe('homework-a');
  expect(sendQuickSamChat.mock.calls[1][2][0].content).toBe(HOMEWORK_HELP_PROMPT);
  fireEvent.click(screen.getByRole('button', { name: 'Close Sam' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Sam a quick question' }));
  await ask('Teach me about leaves');
  await waitFor(() => expect(sendQuickSamChat).toHaveBeenCalledTimes(3));
  expect(sendQuickSamChat.mock.calls[2][4]).toBeUndefined();
  expect(sendQuickSamChat.mock.calls[2][2]).toEqual([]);
});

test('homework availability errors are visible rather than replaced with a generic failure', async () => {
  sendQuickSamChat.mockRejectedValue(new Error('This homework has already been submitted.'));
  render(<QuickSamBubble studentId="student" homeworkHelpRequest={{ homeworkId: 'done' }} />);
  expect(await screen.findByText('This homework has already been submitted.')).toBeInTheDocument();
});

test('closing before homework help starts cancels the automatic request', async () => {
  const started = jest.fn();
  render(<QuickSamBubble studentId="student" homeworkHelpRequest={{ homeworkId: 'pending' }} onHomeworkHelpStarted={started} />);
  fireEvent.click(screen.getByRole('button', { name: 'Close Sam' }));
  await waitFor(() => expect(started).toHaveBeenCalledTimes(1));
  expect(sendQuickSamChat).not.toHaveBeenCalled();
});

test('splits a short first segment and bounded remaining segments without losing text', () => {
  const text = `A quick introduction. ${'More explanation without sentence breaks '.repeat(60)}`;
  const parts = splitSamSpeech(text);
  expect(parts[0]).toBe('A quick introduction.');
  expect(parts[0].length).toBeLessThanOrEqual(240);
  expect(parts.slice(1).every((part) => part.length <= 600)).toBe(true);
  expect(parts.join(' ')).toBe(text.trim());
});

test('plays the short first segment before remaining speech is ready, with no overlapping segments', async () => {
  sendQuickSamChat.mockResolvedValue({ reply: 'First short sentence. Then the rest of the answer.', speechLanguage: 'te-IN', speechSubject: 'Science' });
  const second = deferred();
  const speechText = 'ఇది మొదటి concept. ఇప్పుడు మిగిలిన explanation చూద్దాం.';
  prepareSamSpeech.mockResolvedValue({ speechText });
  open();
  generateLocalTtsAudio.mockResolvedValueOnce(tts).mockReturnValueOnce(second.promise);
  await ask();
  await waitFor(() => expect(players).toHaveLength(1));
  expect(prepareSamSpeech).toHaveBeenCalledTimes(1);
  expect(prepareSamSpeech).toHaveBeenCalledWith('First short sentence. Then the rest of the answer.', 'te-IN', 'student', 'Science');
  expect(generateLocalTtsAudio.mock.calls[0][0]).toBe('ఇది మొదటి concept.');
  expect(generateLocalTtsAudio.mock.calls.map((call) => call[0]).join(' ')).toBe(speechText);
  expect(generateLocalTtsAudio.mock.calls[0][1]).toBe('te-IN');
  expect(generateLocalTtsAudio.mock.calls[0][4]).toBe(1);
  expect(generateLocalTtsAudio.mock.calls[0][5]).toBe('Science');
  expect(generateLocalTtsAudio.mock.calls.every((call) => call[6] === true)).toBe(true);
  expect(screen.getByText('First short sentence. Then the rest of the answer.')).toBeInTheDocument();
  expect(generateLocalTtsAudio).toHaveBeenCalledTimes(2);
  await act(async () => second.resolve(tts));
  expect(players).toHaveLength(1);
  await act(async () => players[0].onended());
  await waitFor(() => expect(players).toHaveLength(2));
  expect(players[1].play).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Stop Sam speaking' })).toBeEnabled();
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
  expect(prepareSamSpeech).not.toHaveBeenCalled();
});

test.each(['stop', 'mute', 'close', 'new question', 'unmount'])('late regional script cannot start speech after %s', async (action) => {
  const old = deferred();
  prepareSamSpeech.mockReturnValueOnce(old.promise);
  sendQuickSamChat.mockResolvedValueOnce({ reply: 'Old concept explanation.', speechLanguage: 'ml-IN', speechSubject: 'Science' });
  const view = open();
  await ask();
  await waitFor(() => expect(prepareSamSpeech).toHaveBeenCalledTimes(1));
  expect(generateLocalTtsAudio).not.toHaveBeenCalled();
  if (action === 'stop') {
    fireEvent.click(screen.getByRole('button', { name: 'Stop Sam speaking' }));
  } else if (action === 'mute') {
    fireEvent.click(screen.getByRole('button', { name: '🔇 Mute' }));
    fireEvent.click(screen.getByRole('button', { name: '🔈 Unmute' }));
  } else if (action === 'close') {
    fireEvent.click(screen.getByRole('button', { name: 'Close Sam' }));
  } else if (action === 'unmount') {
    view.unmount();
  } else {
    sendQuickSamChat.mockResolvedValueOnce({ reply: 'Newest answer' });
    await ask('Another question');
    await waitFor(() => expect(players).toHaveLength(1));
  }
  const count = generateLocalTtsAudio.mock.calls.length;
  await act(async () => old.resolve({ speechText: 'പഴയ concept explanation.' }));
  expect(generateLocalTtsAudio).toHaveBeenCalledTimes(count);
  expect(players).toHaveLength(action === 'new question' ? 1 : 0);
});

test('regional script failures keep the English reply visible and never synthesize an English fallback', async () => {
  sendQuickSamChat.mockResolvedValueOnce({ reply: 'Approved English explanation.', speechLanguage: 'hi-IN' });
  prepareSamSpeech.mockRejectedValueOnce(new Error('Sam could not verify the spoken explanation.'));
  open();
  await ask();
  expect(await screen.findByText('Sam could not verify the spoken explanation.')).toBeInTheDocument();
  expect(screen.getByText('Approved English explanation.')).toBeInTheDocument();
  expect(generateLocalTtsAudio).not.toHaveBeenCalled();
});

test.each(['stop', 'mute', 'close', 'new question'])('late TTS cannot start after %s', async (action) => {
  const old = deferred();
  open();
  generateLocalTtsAudio.mockReturnValueOnce(old.promise);
  await ask();
  await waitFor(() => expect(generateLocalTtsAudio).toHaveBeenCalledTimes(1));
  if (action === 'stop') {
    fireEvent.click(screen.getByRole('button', { name: 'Stop Sam speaking' }));
  } else if (action === 'mute') {
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

test.each(['stop', 'mute'])('%s stops audible speech and discards prefetched segments', async (action) => {
  open();
  await ask();
  await waitFor(() => expect(players).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: action === 'stop' ? 'Stop Sam speaking' : '🔇 Mute' }));
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
  const view = open();
  generateLocalTtsAudio.mockReturnValueOnce(old.promise);
  await ask();
  view.unmount();
  await act(async () => old.resolve(tts));
  expect(players).toHaveLength(0);
});

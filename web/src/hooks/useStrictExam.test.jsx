import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import useStrictExam, { useExamAccess } from './useStrictExam';
import StrictExamStudents from '../components/StrictExamStudents';
import { controlExam, getExamAccess, getExamStudents, resumeExamStudent } from '../api';

jest.mock('../api', () => ({
  controlExam: jest.fn(), getExamAccess: jest.fn(), getExamStudents: jest.fn(), resumeExamStudent: jest.fn(),
}));
const exam = { attemptId: 'attempt-a', strictMode: true, control: { status: 'active' } };
function Harness({ test = exam, done = false }) {
  const state = useStrictExam(test, done, () => {});
  return <div>
    <span>{state.status}</span><span>{state.error}</span>
    <span data-testid="clock-offset">{state.now() - Date.now()}</span>
    <button disabled={state.locked} onClick={() => state.save({ q: 1 })}>Answer</button>
    <button onClick={() => state.pause('left_test')}>Leave test</button>
  </div>;
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  localStorage.clear();
  getExamAccess.mockResolvedValue({ exams: [] });
  let status = 'active';
  let revision = 0;
  controlExam.mockImplementation(async (_id, payload) => {
    if (payload.action === 'pause') status = 'paused';
    return { control: { status, revision: ++revision, answers: {} } };
  });
});
afterEach(() => { jest.useRealTimers(); });

test.each(['blur', 'pagehide', 'hashchange'])('%s pauses only this attempt and locks answering', async (event) => {
  render(<Harness />);
  await act(async () => jest.advanceTimersByTime(0));
  expect(controlExam).toHaveBeenCalledWith('attempt-a', { action: 'heartbeat' });
  await act(async () => window.dispatchEvent(new Event(event)));
  expect(screen.getByRole('button', { name: 'Answer' })).toBeDisabled();
  await waitFor(() => expect(controlExam).toHaveBeenCalledWith('attempt-a', expect.objectContaining({ action: 'pause' })));
  expect(screen.getByText('paused')).toBeInTheDocument();
});

test('hidden browser tab pauses answering and polling observes a teacher resume', async () => {
  render(<Harness />);
  await act(async () => jest.advanceTimersByTime(0));
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => expect(controlExam).toHaveBeenCalledWith('attempt-a', { action: 'pause', reason: 'tab_hidden' }));
  expect(screen.getByRole('button', { name: 'Answer' })).toBeDisabled();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  controlExam.mockResolvedValue({ control: { status: 'active', revision: 99, answers: {} } });
  await act(async () => jest.advanceTimersByTime(5000));
  expect(screen.getByRole('button', { name: 'Answer' })).toBeEnabled();
});

test('failed pause remains pending across remount and cannot be bypassed by reopening', async () => {
  const view = render(<Harness />);
  await act(async () => jest.advanceTimersByTime(0));
  controlExam.mockRejectedValue(new Error('Offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Leave test' }));
  await screen.findByText('Offline');
  view.unmount();
  controlExam.mockResolvedValue({ control: { status: 'paused', revision: 100, answers: {} } });
  render(<Harness />);
  expect(screen.getByRole('button', { name: 'Answer' })).toBeDisabled();
  await act(async () => jest.advanceTimersByTime(0));
  expect(controlExam).toHaveBeenLastCalledWith('attempt-a', { action: 'pause', reason: 'left_test' });
});

test('answers are saved immediately and connection failures lock until synchronized', async () => {
  render(<Harness />);
  await act(async () => jest.advanceTimersByTime(0));
  controlExam.mockRejectedValueOnce(new Error('Cannot save answer'));
  fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
  await screen.findByText('Cannot save answer');
  expect(controlExam).toHaveBeenCalledWith('attempt-a', { action: 'save', answers: { q: 1 } });
  expect(screen.getByRole('button', { name: 'Answer' })).toBeDisabled();
  await act(async () => jest.advanceTimersByTime(5000));
  expect(screen.getByRole('button', { name: 'Answer' })).toBeEnabled();
});

test('legacy tests and completed attempts do not register interruption handlers', async () => {
  render(<Harness test={{ ...exam, strictMode: false }} />);
  act(() => window.dispatchEvent(new Event('blur')));
  await act(async () => jest.advanceTimersByTime(10000));
  expect(controlExam).not.toHaveBeenCalled();
});

test('the countdown clock follows server time instead of a skewed browser clock', async () => {
  controlExam.mockResolvedValue({
    control: { status: 'active', revision: 1, answers: {}, serverNow: new Date(Date.now() + 120000).toISOString() },
  });
  const view = render(<Harness />);
  await act(async () => jest.advanceTimersByTime(0));
  expect(screen.getByTestId('clock-offset')).toHaveTextContent('120000');
  view.rerender(<Harness test={{ ...exam, strictMode: false }} />);
  expect(screen.getByTestId('clock-offset')).toHaveTextContent('0');
});

test('scheduled Tutor restrictions update without starting a test and failures stay explicit', async () => {
  function Access() {
    const state = useExamAccess('student-a', null);
    return <><span>{state.blocked ? 'Tutor locked' : 'Tutor available'}</span><span>{state.error}</span></>;
  }
  getExamAccess.mockResolvedValue({ exams: [{ testId: 'a', title: 'Maths' }] });
  render(<Access />);
  await act(async () => jest.advanceTimersByTime(0));
  expect(screen.getByText('Tutor locked')).toBeInTheDocument();
  getExamAccess.mockResolvedValue({ exams: [] });
  await act(async () => jest.advanceTimersByTime(5000));
  expect(screen.getByText('Tutor available')).toBeInTheDocument();
  getExamAccess.mockRejectedValue(new Error('Unable to verify'));
  await act(async () => jest.advanceTimersByTime(5000));
  expect(screen.getByText('Tutor locked')).toBeInTheDocument();
  expect(screen.getByText('Unable to verify')).toBeInTheDocument();
});

test('teacher monitor automatically shows paused students and resumes one account only', async () => {
  getExamStudents.mockResolvedValue({ students: [
    { studentId: 'a', name: 'Asha', status: 'paused', incidentCount: 1, lastReason: 'tab_hidden' },
    { studentId: 'b', name: 'Banu', status: 'active', incidentCount: 0 },
  ] });
  resumeExamStudent.mockResolvedValue({ success: true });
  render(<StrictExamStudents testId="test-a" />);
  fireEvent.click(await screen.findByRole('button', { name: /1 paused/ }));
  expect(screen.getByText(/not proof of cheating/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Resume Banu' })).not.toBeInTheDocument();
  getExamStudents.mockResolvedValue({ students: [{ studentId: 'a', name: 'Asha', status: 'active', incidentCount: 1 }] });
  fireEvent.click(screen.getByRole('button', { name: 'Resume Asha' }));
  await waitFor(() => expect(resumeExamStudent).toHaveBeenCalledWith('test-a', 'a'));
  await screen.findByRole('button', { name: /0 paused/ });
});

import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import StudentDashboard from './StudentDashboard';
import * as api from '../api';

jest.mock('../api');
jest.mock('./StudentOrchard', () => () => null);
jest.mock('./StudentGames', () => () => null);
jest.mock('./StudentProgress', () => () => null);
jest.mock('./StudentReportCard', () => () => null);
jest.mock('./SamAvatar', () => () => null);
jest.mock('./QuickSamBubble', () => () => null);
jest.mock('./MathMarkdown', () => ({ children }) => <span>{children}</span>);

beforeEach(() => {
  window.location.hash = '';
  Object.values(api).forEach((fn) => {
    if (jest.isMockFunction(fn)) fn.mockReset().mockResolvedValue({});
  });
  api.getDashboard.mockResolvedValue({
    greetingName: 'Student', className: 'Class 8',
    classTeachers: [{ id: 'teacher', name: 'Teacher', subject: 'Science' }],
    announcements: [], streak: { days: 0 },
  });
  api.getStudent.mockResolvedValue({ student: { className: 'Class 8' } });
  api.getHomework.mockResolvedValue({ homework: [] });
  api.getProgress.mockResolvedValue({ subjectScores: [] });
  api.getTests.mockResolvedValue({ tests: [] });
  api.getExamAccess.mockResolvedValue({ exams: [] });
  api.getLibrary.mockResolvedValue({ resources: [] });
  api.getCalendar.mockResolvedValue({ events: [] });
  api.getSettings.mockResolvedValue({ prefs: {} });
  api.checkInReward.mockResolvedValue({ alreadyCheckedIn: true });
});

test('Home preserves summary data but does not fetch unopened library, calendar or tutor panels', async () => {
  render(<StudentDashboard studentId="student" onLogout={() => {}} />);
  await waitFor(() => expect(api.getDashboard).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Good day, Student! 👋')).toBeInTheDocument();
  expect(api.getHomework).toHaveBeenCalledTimes(1);
  expect(api.getProgress).toHaveBeenCalledTimes(1);
  expect(api.getTests).toHaveBeenCalledTimes(1);
  expect(api.getLibrary).not.toHaveBeenCalled();
  expect(api.getCalendar).not.toHaveBeenCalled();
  expect(api.getLearningTimeline).not.toHaveBeenCalled();
  expect(api.getChatHistory).not.toHaveBeenCalled();
  expect(api.listCurriculumLessons).not.toHaveBeenCalled();
  expect(screen.getByRole('complementary')).toHaveClass('eg-sidebar');

  fireEvent.click(screen.getAllByRole('button', { name: 'Library', exact: true })[0]);
  await waitFor(() => expect(api.getLibrary).toHaveBeenCalledTimes(1));
  expect(api.getCalendar).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole('button', { name: 'Home', exact: true })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Library', exact: true })[0]);
  await waitFor(() => expect(api.getLibrary).toHaveBeenCalledTimes(1));
});

test('restored Calendar hash fetches calendar without fetching unrelated homework or tutor data', async () => {
  window.location.hash = 'Calendar';
  render(<StudentDashboard studentId="student" onLogout={() => {}} />);
  await waitFor(() => expect(api.getCalendar).toHaveBeenCalledTimes(1));
  expect(api.getHomework).not.toHaveBeenCalled();
  expect(api.getProgress).not.toHaveBeenCalled();
  expect(api.getTests).not.toHaveBeenCalled();
  expect(api.getChatHistory).not.toHaveBeenCalled();
});

test('subject average card labels the backend mock-test marks and preserves a real zero', async () => {
  window.location.hash = 'Home/Science';
  api.getProgress.mockResolvedValue({
    subjectScores: [{ subject: 'Science', score: 0, assigned: 1, completed: 1, testScore: 0 }],
  });
  render(<StudentDashboard studentId="student" onLogout={() => {}} />);
  expect(await screen.findByText('Average Mock Test Score')).toBeInTheDocument();
  const card = screen.getAllByRole('article').find((article) => within(article).queryByText('Average Mock Test Score'));
  expect(within(card).getByText('0%')).toBeInTheDocument();
  expect(api.getProgress).toHaveBeenCalledTimes(1);
});

test('a strict test saves answers then freezes both answers and submission after a window interruption', async () => {
  window.location.hash = 'Home/Science';
  const endAt = new Date(Date.now() + 300000).toISOString();
  api.getTests.mockResolvedValue({
    tests: [{ id: 'strict-a', title: 'Strict Science', subject: 'Science', strictMode: true, windowStatus: 'open', endAt }],
  });
  let status = 'active';
  let revision = 0;
  const answers = {};
  const control = () => ({ status, revision: ++revision, answers: { ...answers }, endAt, serverNow: new Date().toISOString() });
  api.startTest.mockResolvedValue({
    success: true, attemptId: 'strict-attempt', strictMode: true, control: control(), answers: {},
    questions: [{ id: 'q', text: '1 + 1?', options: ['Two', 'Three'] }],
  });
  api.controlExam.mockImplementation(async (_attemptId, payload) => {
    if (payload.action === 'pause') status = 'paused';
    if (payload.action === 'save' && status === 'active') Object.assign(answers, payload.answers);
    return { success: true, control: control() };
  });
  const confirmation = jest.spyOn(window, 'confirm').mockReturnValue(true);
  try {
    render(<StudentDashboard studentId="student" onLogout={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start', exact: true }));
    const option = await screen.findByRole('button', { name: 'Two', exact: true });
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining('Only your assigning teacher can resume'));
    fireEvent.click(option);
    await waitFor(() => expect(api.controlExam).toHaveBeenCalledWith('strict-attempt', { action: 'save', answers: { q: 0 } }));
    await waitFor(() => expect(option).toBeEnabled());
    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(screen.getByText('Test paused — waiting for your teacher')).toBeInTheDocument();
    expect(option).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Three' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit Test' })).toBeDisabled();
    expect(screen.getByText(/⏱/)).toBeInTheDocument();
    expect(api.submitTestAttempt).not.toHaveBeenCalled();
  } finally {
    confirmation.mockRestore();
  }
});

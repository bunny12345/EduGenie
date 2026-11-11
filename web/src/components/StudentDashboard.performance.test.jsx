import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

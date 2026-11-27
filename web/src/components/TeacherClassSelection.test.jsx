import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import TeacherDashboard from './TeacherDashboard';
import TeacherReportCards from './TeacherReportCards';
import * as api from '../api';

jest.mock('../api');
jest.mock('./SupportBubble', () => () => null);
jest.mock('./StudentProgress', () => () => null);

beforeEach(() => {
  jest.resetAllMocks();
  window.location.hash = '';
  window.localStorage.clear();
  api.getTeacherDashboard.mockResolvedValue({ summary: {} });
  api.getTeacherStudents.mockResolvedValue({ students: [] });
  api.getTeacherAnnouncements.mockResolvedValue({ announcements: [] });
  api.getTests.mockResolvedValue({ tests: [] });
  api.getTeacherAssignedHomework.mockResolvedValue({ assignments: [] });
  api.listCurriculumLessons.mockResolvedValue({ lessons: [] });
  api.getReportCardExams.mockResolvedValue({ exams: [] });
});

function openDashboard() {
  const result = render(<TeacherDashboard session={{ userId: 'teacher', subject: 'Science' }} onLogout={() => {}} />);
  return { ...result, select: result.container.querySelector('.td-class-banner-select') };
}

test('teacher startup requests the initial roster only once', async () => {
  api.getTeacherProfile.mockResolvedValue({ profile: { subject: 'Science', grades: ['Class 8', 'Class 9'] } });
  openDashboard();
  await waitFor(() => expect(api.getTeacherProfile).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(api.getTeacherStudents).toHaveBeenCalledTimes(1);
});

test('a sole registered class is selected even without students', async () => {
  api.getTeacherProfile.mockResolvedValue({ profile: { subject: 'Science', grades: ['Class 9'] } });
  const { select } = openDashboard();
  await waitFor(() => expect(select.value).toBe('Class 9'));
  expect([...select.options].map((option) => option.value)).toContain('Class 9');
  await waitFor(() => expect(api.getTeacherStudents).toHaveBeenCalledWith(expect.objectContaining({ className: 'Class 9' })));
  await waitFor(() => expect(api.listCurriculumLessons).toHaveBeenCalledWith(expect.objectContaining({ className: 'Class 9' })));
});

test('multiple registered classes are offered even if the roster contains one', async () => {
  api.getTeacherStudents.mockResolvedValue({ students: [{ id: 's1', name: 'Alex', className: 'Class 8' }] });
  api.getTeacherProfile.mockResolvedValue({ profile: { subject: 'Science', grades: ['Class 8', 'Class 9'] } });
  for (const name of ['getTeacherStudentSubjectProgress', 'getTeacherStudentDeliveryStatus', 'getTeacherStudentHomework', 'getTeacherStudentTestAttempts']) {
    api[name].mockResolvedValue({});
  }
  const { select } = openDashboard();
  await waitFor(() => expect([...select.options].map((option) => option.value)).toContain('Class 9'));
  expect(select.value).toBe('all');
  await act(async () => fireEvent.change(select, { target: { value: 'Class 9' } }));
  expect(select.value).toBe('Class 9');
});

test('a renewed session does not reload teacher data or reset the selected class', async () => {
  api.getTeacherProfile.mockResolvedValue({ profile: { subject: 'Science', grades: ['Class 8', 'Class 9'] } });
  const { container, rerender } = render(
    <TeacherDashboard session={{ userId: 'teacher', subject: 'Science', token: 'old' }} onLogout={() => {}} />
  );
  const select = container.querySelector('.td-class-banner-select');
  await waitFor(() => expect([...select.options].map((option) => option.value)).toContain('Class 9'));
  await act(async () => fireEvent.change(select, { target: { value: 'Class 9' } }));
  await waitFor(() => expect(api.listCurriculumLessons).toHaveBeenCalledWith(expect.objectContaining({ className: 'Class 9' })));
  const requests = api.getTeacherProfile.mock.calls.length;
  const lessons = api.listCurriculumLessons.mock.calls.length;
  await act(async () => rerender(
    <TeacherDashboard session={{ userId: 'teacher', subject: 'Science', token: 'new' }} onLogout={() => {}} />
  ));
  expect(select.value).toBe('Class 9');
  expect(api.getTeacherProfile).toHaveBeenCalledTimes(requests);
  expect(api.listCurriculumLessons).toHaveBeenCalledTimes(lessons);
});

test('a manual class choice is preserved when a delayed profile arrives', async () => {
  let resolveProfile;
  api.getTeacherProfile.mockReturnValue(new Promise((resolve) => { resolveProfile = resolve; }));
  api.getTeacherStudents.mockResolvedValue({ students: [{ name: 'Alex', className: 'Class 8' }] });
  const { select } = openDashboard();
  await waitFor(() => expect([...select.options].map((option) => option.value)).toContain('Class 8'));
  await act(async () => fireEvent.change(select, { target: { value: 'Class 8' } }));
  await act(async () => fireEvent.change(select, { target: { value: 'all' } }));
  await act(async () => resolveProfile({ profile: { subject: 'Science', grades: ['Class 8'] } }));
  expect(select.value).toBe('all');
});

test('report cards select the sole assigned class but ask multi-class teachers to choose', async () => {
  const { getByRole, rerender } = render(
    <TeacherReportCards classOptions={['Class 9']} autoSelectSingle />
  );
  await waitFor(() => expect(api.getReportCardExams).toHaveBeenCalledWith('Class 9'));
  expect(getByRole('combobox').value).toBe('Class 9');
  rerender(<TeacherReportCards classOptions={['Class 8', 'Class 9']} />);
  expect(getByRole('combobox').value).toBe('Class 9');
});

test('report cards do not choose a class when multiple are assigned', async () => {
  const { getByRole } = render(<TeacherReportCards classOptions={['Class 8', 'Class 9']} />);
  const select = getByRole('combobox');
  expect(select.value).toBe('');
  expect(api.getReportCardExams).not.toHaveBeenCalled();
  await act(async () => fireEvent.change(select, { target: { value: 'Class 8' } }));
  expect(api.getReportCardExams).toHaveBeenCalledWith('Class 8');
});

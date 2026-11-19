import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudentAttendance, TeacherAttendance } from './Attendance';
import { getStudentAttendance, getTeacherAttendance, saveTeacherAttendance } from '../api';

jest.mock('../api');

const period = { startDate: '2026-04-01', endDate: '2026-12-01' };

test('teacher can clear and reselect all, then correct a student and save', async () => {
  getTeacherAttendance.mockResolvedValue({
    classes: ['Class 8'], className: 'Class 8', date: '2026-06-02', today: '2026-06-02', period, saved: false,
    students: [
      { id: 'a', name: 'Alex', present: true, recorded: false },
      { id: 'b', name: 'Blair', present: true, recorded: false },
    ],
  });
  saveTeacherAttendance.mockResolvedValue({ success: true });
  render(<TeacherAttendance />);
  const all = await screen.findByRole('checkbox', { name: 'Select all present' });
  expect(all).toBeChecked();
  fireEvent.click(all);
  expect(screen.getByText('0 present · 2 absent')).toBeInTheDocument();
  fireEvent.click(all);
  fireEvent.click(screen.getByRole('button', { name: 'Edit attendance for Blair' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mark absent' }));
  expect(all).toBePartiallyChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }));
  await waitFor(() => expect(saveTeacherAttendance).toHaveBeenCalledWith({
    className: 'Class 8', date: '2026-06-02', saved: false, entries: [
      { studentId: 'a', present: true }, { studentId: 'b', present: false },
    ],
  }));
  expect(await screen.findByRole('status')).toHaveTextContent('Attendance saved.');
});

test('student sees a real zero and only recorded roll-call days', async () => {
  getStudentAttendance.mockResolvedValue({
    period, percentage: 0, recordedDays: 1, presentDays: 0, absentDays: 1,
    records: [{ date: '2026-06-02', present: false }],
  });
  render(<StudentAttendance />);
  expect(await screen.findByText('0%')).toBeInTheDocument();
  expect(screen.getByText('0 present · 1 absent · 1 recorded days')).toBeInTheDocument();
  expect(screen.getByText('Only saved roll-call days count.')).toBeInTheDocument();
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SchoolProgressPeriod from './SchoolProgressPeriod';
import { getSchoolProgressPeriod, saveSchoolProgressPeriod } from '../api';

jest.mock('../api', () => ({
  getSchoolProgressPeriod: jest.fn(),
  saveSchoolProgressPeriod: jest.fn(),
}));

beforeEach(() => {
  jest.resetAllMocks();
  getSchoolProgressPeriod.mockResolvedValue({
    success: true, period: { startDate: '2026-06-15', endDate: '2027-03-20' },
  });
});

test('school control restores persisted dates and reloads all reports only after confirmed save', async () => {
  const onSaved = jest.fn();
  saveSchoolProgressPeriod.mockImplementation(async (period) => ({ success: true, period }));
  render(<SchoolProgressPeriod schoolId="school" onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByLabelText('Start date')).toHaveValue('2026-06-15'));
  expect(screen.getByLabelText('End date')).toHaveValue('2027-03-20');
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-05-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-04-15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply to all progress graphs' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Saved for your whole school');
  expect(saveSchoolProgressPeriod).toHaveBeenCalledWith({ startDate: '2026-05-01', endDate: '2027-04-15' });
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test('failed save never claims success or reloads scores; school can retry', async () => {
  const onSaved = jest.fn();
  saveSchoolProgressPeriod.mockRejectedValue(new Error('Unable to save school dates'));
  render(<SchoolProgressPeriod schoolId="school" onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByLabelText('Start date')).toHaveValue('2026-06-15'));
  fireEvent.click(screen.getByRole('button', { name: 'Apply to all progress graphs' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save school dates');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
});

test('load errors are visible and retriable; missing settings do not invent or silently save dates', async () => {
  getSchoolProgressPeriod.mockRejectedValueOnce(new Error('Settings unavailable'))
    .mockResolvedValueOnce({ success: true, period: null });
  render(<SchoolProgressPeriod schoolId="school" onSaved={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Settings unavailable');
  expect(screen.getByRole('button', { name: 'Apply to all progress graphs' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(/No school dates saved yet/)).toBeInTheDocument();
  expect(screen.getByLabelText('Start date')).toHaveValue('');
  expect(saveSchoolProgressPeriod).not.toHaveBeenCalled();
});

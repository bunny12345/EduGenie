import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import StudentProgress from './StudentProgress';

const metrics = [
  { key: 'understanding', label: 'Understanding', value: 90 },
  { key: 'tests', label: 'Test Scores', value: 80 },
  { key: 'practice', label: 'Practice', value: 60 },
  { key: 'growth', label: 'Tree Growth', value: 100 },
  { key: 'homework', label: 'Homework', value: 100 },
];
const subject = {
  subjectKey: 'science', name: 'Science', score: 85, score1000: 850,
  status: 'strong', statusLabel: 'Great!', accent: '#0ea5e9',
  metrics, stats: [{ key: 'homework', label: 'Homework completed', value: 8 }],
  daily: [{ key: 'd1', label: '1', value: 10 }, { key: 'd2', label: '2', value: 85 }],
  monthly: [{ key: 'm1', label: 'Oct', value: 10 }, { key: 'm2', label: 'Nov', value: 85 }, { key: 'm3', label: 'Dec', value: null, future: true }],
};

test('subject detail renders all learning components and backend history without games', async () => {
  render(<StudentProgress studentId="student" fetchFn={async () => ({
    success: true, hasData: true, score: 400, subjects: [subject],
    dimensions: [], dailyTrend: [], trend: [],
  })} />);
  fireEvent.click(await screen.findByText('Science'));
  const modal = document.querySelector('.eg-pg-modal');
  const detail = within(modal);
  metrics.forEach((metric) => expect(detail.getByText(metric.label)).toBeInTheDocument());
  expect(detail.getByText('Homework completed')).toBeInTheDocument();
  expect(modal.querySelectorAll('.eg-pg-skill')).toHaveLength(5);
  expect(modal.querySelectorAll('.eg-pg-trend-dot')).toHaveLength(2);
  expect(modal.querySelector('.eg-pg-trend-val').textContent).toBe('85%');
  expect(detail.queryByText('Study this subject to see your line grow here!')).not.toBeInTheDocument();
  fireEvent.click(detail.getByText('Month by month'));
  expect(modal.querySelectorAll('.eg-pg-trend-dot')).toHaveLength(2);
  expect(modal.querySelector('.eg-pg-future-zone')).toBeInTheDocument();
  expect(detail.getByText('Dec')).toBeInTheDocument();
});

test('overall graph keeps the backend /1000 scale for both ranges and does not average subject cards', async () => {
  render(<StudentProgress studentId="student" fetchFn={async () => ({
    success: true, hasData: true, score: 546, subjects: [subject],
    dimensions: [], dailyTrend: [
      { key: 'd1', label: '1', score: 400, value: 40 },
      { key: 'd2', label: '2', score: 546, value: 55 },
    ],
    trend: [
      { key: 'm1', label: 'Oct', score: 480, value: 48 },
      { key: 'm2', label: 'Nov', score: 546, value: 55 },
      { key: 'm3', label: 'Dec', score: null, value: null, future: true },
    ],
  })} />);
  await screen.findByText('Science');
  const graph = document.querySelector('.eg-pg-trend-svg');
  expect(graph.querySelector('.eg-pg-trend-val').textContent).toBe('546');
  expect(graph.querySelectorAll('.eg-pg-trend-dot')).toHaveLength(2);
  fireEvent.click(screen.getAllByText('Month by month')[0]);
  expect(graph.querySelectorAll('.eg-pg-trend-val')[1].textContent).toBe('546');
  expect(graph.querySelector('.eg-pg-future-zone')).toBeInTheDocument();
});

test('school period labels replace April and both graph ranges use server-selected dates without admin controls', async () => {
  const fetchFn = jest.fn().mockResolvedValue({
    score: 600, hasData: true, trackingSince: '15 June 2026', academicEndLabel: '20 March 2027',
    subjects: [{ ...subject, monthly: [
      { key: 'jun', label: 'Jun 26', value: 80 },
      { key: 'mar', label: 'Mar 27', value: null, future: true },
    ] }],
    dailyTrend: [{ key: 'jun15', label: '15 Jun', weekday: 'Mon', score: 500 }, { key: 'mar20', label: '20 Mar', score: null }],
    trend: [{ key: 'jun', label: 'Jun 26', score: 500 }, { key: 'mar', label: 'Mar 27', score: null }],
  });

  render(<StudentProgress studentId="student" fetchFn={fetchFn} />);
  expect(await screen.findByText(/15 June 2026 → 20 March 2027/)).toBeInTheDocument();
  expect(screen.queryByText(/to April/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByText('Month by month')[0]);
  expect(screen.getAllByText('Mar 27').length).toBeGreaterThan(0);
});

test('open progress reports and their subject detail update automatically when school graph dates change', async () => {
  jest.useFakeTimers();
  const fetchFn = jest.fn().mockResolvedValue({
    score: 500, hasData: true, subjects: [subject], trackingSince: '15 June 2026', academicEndLabel: '20 March 2027',
  });
  const { unmount } = render(<StudentProgress studentId="student" fetchFn={fetchFn} />);
  fireEvent.click(await screen.findByText('Science'));
  fetchFn.mockResolvedValue({
    score: 500, hasData: true, trackingSince: '1 May 2026', academicEndLabel: '15 April 2027',
    subjects: [{ ...subject, daily: [{ key: 'may', label: '1 May', value: 15 }, { key: 'apr', label: '15 Apr', value: null, future: true }] }],
  });
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(screen.getByText(/1 May 2026 → 15 April 2027/)).toBeInTheDocument();
  expect(screen.getAllByText('15 Apr').length).toBeGreaterThan(0);
  expect(fetchFn).toHaveBeenCalledTimes(2);
  unmount();
  jest.useRealTimers();
});

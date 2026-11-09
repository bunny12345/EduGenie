import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

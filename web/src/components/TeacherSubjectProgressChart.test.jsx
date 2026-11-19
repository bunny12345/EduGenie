import React from 'react';
import { render } from '@testing-library/react';
import TeacherSubjectProgressChart from './TeacherSubjectProgressChart';

const subject = { name: 'Mathematics', score: 69, accent: '#7436ef', trend: 10, status: 'on-track' };

test.each(['daily', 'monthly'])('%s snapshot keeps labels spaced without dropping recorded points', (view) => {
  const count = view === 'daily' ? 365 : 24;
  const recorded = view === 'daily' ? 190 : 13;
  const series = Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, view === 'daily' ? 0 : i, view === 'daily' ? i + 1 : 1));
    return {
      key: date.toISOString().slice(0, view === 'daily' ? 10 : 7),
      label: date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      weekday: 'Mon',
      value: i < recorded ? (i === recorded - 1 ? 69 : 50) : null,
    };
  });
  const { container } = render(<TeacherSubjectProgressChart subject={{ ...subject, [view]: series }} view={view} />);
  const labels = [...container.querySelectorAll('.td-progress-axis-x')];
  const offsets = labels.map((node) => Number(node.getAttribute('x')));
  const points = container.querySelector('.td-progress-line').getAttribute('points').split(' ');
  expect(labels).toHaveLength(7);
  expect(labels[0]).toHaveTextContent(view === 'daily' ? 'Jan 1' : 'Jan');
  expect(labels.at(-1)).toHaveTextContent(view === 'daily' ? 'Dec 31' : 'Dec');
  expect(labels.at(-1)).toHaveClass('future');
  expect(offsets.every((x, i) => !i || x - offsets[i - 1] >= 55)).toBe(true);
  expect(points).toHaveLength(recorded);
  expect(container.querySelectorAll('.td-progress-dot').length).toBeLessThan(labels.length);
  const latest = [...container.querySelectorAll('.td-progress-val')].find((node) => node.textContent === '69%');
  expect(latest.getAttribute('x')).toBe(points.at(-1).split(',')[0]);
});

import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import ExamResultsJourney from './ExamResultsJourney';
import { examChange, examJourney, examValue } from './examJourney';
import StudentProgress from './StudentProgress';

const card = (examId, examName, maximum, marks, createdAt) => ({
  examId, examName, createdAt, subjects: [
    { subject: 'Mathematics', marks: marks[0], maxMarks: maximum },
    { subject: 'Science', marks: marks[1], maxMarks: maximum },
  ],
});
const first = card('q', 'Quarterly exam', 25, [15, 20], '2026-07-01');
const second = card('h', 'Half-yearly exam', 50, [45, 40], '2026-09-01');
const third = card('a', 'Annual exam', 100, [60, 80], '2026-11-01');
const fetchCards = () => Promise.resolve({ success: true, reportCards: [third, second, first] });

afterEach(() => jest.useRealTimers());

test('normalizes 25/50/100-mark exams, orders chronologically, and uses weighted totals rather than mean percentages', () => {
  const points = examJourney([second, first, third]);
  expect(points.map((point) => point.percentage)).toEqual([70, 85, 70]);
  expect(points.map((point) => examValue(point, 'mathematics'))).toEqual([60, 90, 60]);
  expect(examChange(70, 85)).toBe(-15);
  expect(examChange(85, 70)).toBe(15);
  expect(examChange(80, 80)).toBe(0);
  expect(examJourney([{
    examId: 'mixed', subjects: [{ subject: 'Maths', marks: 20, maxMarks: 25 }, { subject: 'Science', marks: 50, maxMarks: 100 }],
  }])[0].percentage).toBeCloseTo(56, 10);
  expect(examJourney([{ ...third, createdAt: null }, { ...first, createdAt: null }]).map((p) => p.examId)).toEqual(['q', 'a']);
});

test('one panel shows ups, downs, raw marks, and keyboard-selectable exams with subject comparison', async () => {
  render(<ExamResultsJourney studentId="student" fetchFn={fetchCards} />);
  const panel = screen.getByRole('region', { name: 'Exam Results Journey' });
  expect((await within(panel).findAllByText('↓ Down 15 pp')).length).toBeGreaterThan(0);
  expect(within(panel).getByText('3 released exams')).toBeInTheDocument();
  fireEvent.keyDown(within(panel).getByRole('button', { name: 'Half-yearly exam: 85%. Show marks' }), { key: 'Enter' });
  expect(within(panel).getByText('↑ Up 15 pp')).toBeInTheDocument();
  expect(within(panel).getByText('All subjects · 85/100 marks')).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: 'Mathematics', exact: true }));
  expect(within(panel).getByRole('group', { name: /Mathematics exam results/ })).toBeInTheDocument();
  expect(within(panel).getByText('Mathematics · 45/50 marks')).toBeInTheDocument();
  expect(within(panel).getByText('↑ Up 30 pp')).toBeInTheDocument();
  expect(within(panel).getByText('↓ Down 30 pp')).toBeInTheDocument();
});

test('zero marks are real points and missing subjects are gaps, not zeros or connected interpolations', async () => {
  const zero = card('z', 'First exam', 25, [0, 0], '2026-01-01');
  const missing = { ...card('m', 'Second exam', 50, [30, 40], '2026-02-01'), subjects: [{ subject: 'Science', marks: 40, maxMarks: 50 }] };
  render(<ExamResultsJourney studentId="student" fetchFn={async () => ({ reportCards: [missing, zero] })} />);
  await screen.findByText('2 released exams');
  expect(screen.getByRole('button', { name: 'First exam: 0%. Show marks' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mathematics', exact: true }));
  expect(screen.getByRole('button', { name: 'Second exam: subject not included. Show marks' })).toBeInTheDocument();
  expect(screen.getByText('Mathematics · Subject not included')).toBeInTheDocument();
  expect(screen.queryByText('Mathematics · 40/50 marks')).not.toBeInTheDocument();
});

test('single and unreleased exams never invent a trend; errors and invalid marks are visible', async () => {
  const fetchFn = jest.fn()
    .mockResolvedValueOnce({ success: true, reportCards: [] })
    .mockResolvedValueOnce({ success: false, error: 'Results unavailable' })
    .mockResolvedValueOnce({ success: true, reportCards: [{ ...first, subjects: [{ subject: 'Science', marks: 30, maxMarks: 25 }] }] })
    .mockResolvedValueOnce({ success: true, reportCards: [first] });
  const { rerender } = render(<ExamResultsJourney studentId="student" fetchFn={fetchFn} />);
  expect(await screen.findByText('Your exam story starts here')).toBeInTheDocument();
  rerender(<ExamResultsJourney studentId="student" fetchFn={fetchFn} refreshKey={1} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Results unavailable');
  fireEvent.click(screen.getByText('Try again'));
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid marks');
  fireEvent.click(screen.getByText('Try again'));
  expect(await screen.findByText('One real result. No predictions.')).toBeInTheDocument();
  expect(screen.queryByText(/Up.*pp/)).not.toBeInTheDocument();
});

test('newly released exams extend the graph automatically; corrections replace marks without moving an exam', async () => {
  jest.useFakeTimers();
  const fetchFn = jest.fn().mockResolvedValue({ reportCards: [first] });
  render(<ExamResultsJourney studentId="student" fetchFn={fetchFn} />);
  expect(await screen.findByText('1 released exam')).toBeInTheDocument();
  fetchFn.mockResolvedValue({ reportCards: [second, first] });
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(screen.getByText('2 released exams')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Half-yearly exam: 85%. Show marks' })).toHaveAttribute('aria-pressed', 'true');
  fetchFn.mockResolvedValue({ reportCards: [second, { ...first, releasedAt: '2026-12-01', subjects: first.subjects.map((row) => ({ ...row, marks: 25 })) }] });
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(screen.getByRole('button', { name: 'Quarterly exam: 100%. Show marks' })).toBeInTheDocument();
  expect(screen.getAllByText('↓ Down 15 pp').length).toBeGreaterThan(0);
  jest.useRealTimers();
});

test('student switches discard old responses and scoped readers never fetch the signed-in student results', async () => {
  let resolveOld;
  const fetchFn = jest.fn((id) => id === 'old'
    ? new Promise((resolve) => { resolveOld = resolve; })
    : Promise.resolve({ reportCards: [second] }));
  const { rerender } = render(<ExamResultsJourney studentId="old" fetchFn={fetchFn} />);
  rerender(<ExamResultsJourney studentId="new" fetchFn={fetchFn} />);
  await screen.findByRole('button', { name: 'Half-yearly exam: 85%. Show marks' });
  await act(async () => { resolveOld({ reportCards: [first] }); });
  expect(screen.queryByRole('button', { name: /Quarterly exam:/ })).not.toBeInTheDocument();
  expect(fetchFn).toHaveBeenLastCalledWith('new');
});

test('progress places the journey below subject panels and Refresh reloads both independently', async () => {
  const fetchFn = jest.fn().mockResolvedValue({ score: 0, subjects: [] });
  const reportCardsFetchFn = jest.fn().mockResolvedValue({ reportCards: [first] });
  render(<StudentProgress studentId="student" fetchFn={fetchFn} reportCardsFetchFn={reportCardsFetchFn} />);
  await screen.findByText('1 released exam');
  const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
  expect(headings.indexOf('Exam Results Journey')).toBeGreaterThan(headings.indexOf('📚 Each subject on its own'));
  fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
  await screen.findByText('1 released exam');
  expect(fetchFn).toHaveBeenCalledTimes(2);
  expect(reportCardsFetchFn).toHaveBeenCalledTimes(2);
});

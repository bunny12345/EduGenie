import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SchoolDashboard from './SchoolDashboard';
import {
  getSchoolProgressStudents, getSchoolStudentLearningScore, getSchoolStudentReportCards,
  schoolDashboard, schoolTeachers, schoolStudents, schoolDeduplicateTeachers, listCurriculumSubjects
} from '../api';

jest.mock('../api', () => ({
  schoolDashboard: jest.fn().mockResolvedValue({ summary: { students: 14, teachers: 2, activeInvites: 0 } }),
  schoolTeachers: jest.fn().mockResolvedValue({ teachers: [], pagination: null }),
  schoolStudents: jest.fn().mockResolvedValue({ students: [], pagination: null }),
  schoolDeduplicateTeachers: jest.fn().mockResolvedValue({ success: true }),
  listCurriculumSubjects: jest.fn().mockResolvedValue({ classes: [] }),
  getSchoolProgressStudents: jest.fn(),
  getSchoolStudentLearningScore: jest.fn(),
  getSchoolStudentReportCards: jest.fn()
}));
jest.mock('./SupportBubble', () => () => <div data-testid="school-support" />);
jest.mock('./StudentProgress', () => function Progress({ studentId, greetingName, fetchFn }) {
  require('react').useEffect(() => { fetchFn(studentId); }, [studentId, fetchFn]);
  return <div data-testid="learning-report">{greetingName} learning report</div>;
});
jest.mock('./StudentReportCard', () => function ReportCard({ studentId, greetingName, fetchFn, embedded }) {
  require('react').useEffect(() => { fetchFn(); }, [studentId]);
  return <div data-testid="report-card">{greetingName} {embedded ? 'embedded' : ''} report card</div>;
});

const students = [
  { id: 'asha', name: 'Asha', className: 'Class 8' },
  { id: 'banu', name: 'Banu', className: 'Class 9' },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `learner-${i}`, name: `Learner ${String(i).padStart(2, '0')}`, className: 'Class 10' }))
];
const session = { schoolId: 'school-a', schoolName: 'Test School' };
beforeEach(() => {
  jest.clearAllMocks();
  window.location.hash = '#progress';
  schoolDashboard.mockResolvedValue({ summary: { students: 14, teachers: 2, activeInvites: 0 } });
  schoolTeachers.mockResolvedValue({ teachers: [], pagination: null });
  schoolStudents.mockResolvedValue({ students: [], pagination: null });
  schoolDeduplicateTeachers.mockResolvedValue({ success: true });
  listCurriculumSubjects.mockResolvedValue({ classes: [] });
  getSchoolProgressStudents.mockResolvedValue({ students, classes: ['Class 8', 'Class 9', 'Class 10'] });
  getSchoolStudentLearningScore.mockResolvedValue({ success: true });
  getSchoolStudentReportCards.mockResolvedValue({ success: true });
});
afterEach(() => { window.location.hash = ''; });

test('school sidebar restores progress from the hash and reuses both student reports', async () => {
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  expect(screen.getByRole('button', { name: /Student Progress/ })).toHaveClass('active');
  expect(await screen.findByTestId('learning-report')).toHaveTextContent('Asha');
  expect(screen.getByTestId('report-card')).toHaveTextContent('Asha embedded report card');
  expect(getSchoolStudentLearningScore).toHaveBeenCalledWith('asha');
  expect(getSchoolStudentReportCards).toHaveBeenCalledWith('asha');
  expect(screen.queryByTestId('school-support')).not.toBeInTheDocument();
});

test('filters by available class and searches the entire school including later pages', async () => {
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  await screen.findByTestId('learning-report');
  expect(screen.queryByRole('button', { name: /Learner 11 Class 10/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'Learner 11' } });
  expect(screen.getByTestId('learning-report')).toHaveTextContent('Learner 11');
  expect(getSchoolStudentReportCards).toHaveBeenLastCalledWith('learner-11');
  fireEvent.change(screen.getByLabelText('Class', { exact: true }), { target: { value: 'Class 8' } });
  expect(screen.queryByTestId('learning-report')).not.toBeInTheDocument();
  expect(screen.getByText(/No students match these filters/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }));
  expect(screen.getByLabelText('Class', { exact: true })).toHaveValue('');
  expect(screen.getByTestId('learning-report')).toHaveTextContent('Asha');
  fireEvent.change(screen.getByLabelText('Class', { exact: true }), { target: { value: 'Class 9' } });
  expect(screen.getByTestId('learning-report')).toHaveTextContent('Banu');
  expect(screen.getByTestId('report-card')).toHaveTextContent('Banu');
  expect(getSchoolStudentLearningScore).toHaveBeenLastCalledWith('banu');
});

test('paginates student results and switches both reports without changing other roster filters', async () => {
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  await screen.findByTestId('learning-report');
  fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: /Learner 11 Class 10/ }));
  expect(screen.getByTestId('learning-report')).toHaveTextContent('Learner 11');
  expect(screen.getByTestId('report-card')).toHaveTextContent('Learner 11');
  fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'Banu' } });
  expect(screen.queryByText(/Page 2 of/)).not.toBeInTheDocument();
  expect(screen.getByTestId('learning-report')).toHaveTextContent('Banu');
});

test('Refresh reloads the roster and both selected student reports', async () => {
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  await screen.findByTestId('learning-report');
  const scoreCalls = getSchoolStudentLearningScore.mock.calls.length;
  const cardCalls = getSchoolStudentReportCards.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
  await waitFor(() => expect(getSchoolProgressStudents).toHaveBeenCalledTimes(2));
  expect(getSchoolStudentLearningScore.mock.calls.length).toBeGreaterThan(scoreCalls);
  expect(getSchoolStudentReportCards.mock.calls.length).toBeGreaterThan(cardCalls);
});

test('roster errors are visible and retry recovers without showing Loading text', async () => {
  getSchoolProgressStudents.mockRejectedValueOnce(new Error('School roster unavailable'));
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('School roster unavailable');
  expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByTestId('learning-report')).toHaveTextContent('Asha');
});

test('does not fetch progress outside the section and preserves sidebar navigation', async () => {
  window.location.hash = '#overview';
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  await screen.findByTestId('school-support');
  expect(getSchoolProgressStudents).not.toHaveBeenCalled();
  const sidebar = screen.getByRole('navigation');
  fireEvent.click(within(sidebar).getByRole('button', { name: /Student Progress/ }));
  await screen.findByTestId('learning-report');
  expect(window.location.hash).toBe('#progress');
  fireEvent.click(within(sidebar).getByRole('button', { name: /Overview/ }));
  expect(screen.queryByTestId('learning-report')).not.toBeInTheDocument();
  expect(screen.getByTestId('school-support')).toBeInTheDocument();
});

test('ignores a late roster response after leaving the progress section', async () => {
  let resolveRoster;
  getSchoolProgressStudents.mockReturnValueOnce(new Promise((resolve) => { resolveRoster = resolve; }));
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /Overview/ }));
  await act(async () => { resolveRoster({ students, classes: ['Class 8'] }); });
  expect(screen.queryByTestId('learning-report')).not.toBeInTheDocument();
  expect(getSchoolStudentLearningScore).not.toHaveBeenCalled();
});

test('real shared views render learning scores and exam results and discard a previous student’s late response', async () => {
  const StudentProgress = jest.requireActual('./StudentProgress').default;
  const StudentReportCard = jest.requireActual('./StudentReportCard').default;
  let resolveOldScore;
  getSchoolStudentLearningScore.mockImplementation((id) => id === 'asha'
    ? new Promise((resolve) => { resolveOldScore = resolve; })
    : Promise.resolve({ success: true, hasData: true, score: 720, maxScore: 1000 }));
  getSchoolStudentReportCards.mockResolvedValue({
    success: true,
    reportCards: [{
      examId: 'term-1', examName: 'Term 1', className: 'Class 9', total: 85, maxTotal: 100,
      percentage: 85, grade: 'A', rank: null, toppers: [],
      subjects: [{ subject: 'Science', marks: 85, maxMarks: 100, percentage: 85, grade: 'A', remarks: 'Good understanding' }]
    }],
    pending: [{ examId: 'term-2', examName: 'Term 2', entered: 1, total: 2, missingSubjects: ['Mathematics'] }]
  });
  const report = (id, name) => (
    <div key={id}>
      <StudentProgress studentId={id} greetingName={name} fetchFn={getSchoolStudentLearningScore} />
      <StudentReportCard embedded studentId={id} greetingName={name} fetchFn={() => getSchoolStudentReportCards(id)} />
    </div>
  );
  const { rerender } = render(report('asha', 'Asha'));
  rerender(report('banu', 'Banu'));
  expect(await screen.findByRole('heading', { name: 'My Learning Report' })).toBeInTheDocument();
  expect(screen.getByText('720')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'REPORT CARD' })).toBeInTheDocument();
  expect(screen.getByText(/waiting for Mathematics/)).toBeInTheDocument();
  await act(async () => { resolveOldScore({ success: true, hasData: true, score: 111, maxScore: 1000 }); });
  expect(screen.queryByText('111')).not.toBeInTheDocument();
  expect(screen.getByText('720')).toBeInTheDocument();
  expect(screen.getByText('Banu', { selector: 'strong' })).toBeInTheDocument();
});

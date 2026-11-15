import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SchoolDashboard from './SchoolDashboard';
import {
  getSchoolProgressStudents, getSchoolStudentLearningScore, getSchoolStudentReportCards,
  getSchoolProgressPeriod, saveSchoolProgressPeriod,
  schoolDashboard, schoolTeachers, schoolStudents, schoolDeduplicateTeachers, listCurriculumSubjects,
  listCurriculumLessons, listCurriculumLessonDocuments, previewCurriculumPdfImport, publishCurriculumPdfImport,
  createCurriculumLesson, uploadCurriculumLessonDocument, saveCurriculumLessonText, deleteCurriculumLesson
} from '../api';

jest.mock('../api', () => ({
  schoolDashboard: jest.fn().mockResolvedValue({ summary: { students: 14, teachers: 2, activeInvites: 0 } }),
  schoolTeachers: jest.fn().mockResolvedValue({ teachers: [], pagination: null }),
  schoolStudents: jest.fn().mockResolvedValue({ students: [], pagination: null }),
  schoolDeduplicateTeachers: jest.fn().mockResolvedValue({ success: true }),
  listCurriculumSubjects: jest.fn().mockResolvedValue({ classes: [] }),
  listCurriculumLessons: jest.fn(),
  listCurriculumLessonDocuments: jest.fn(),
  previewCurriculumPdfImport: jest.fn(),
  publishCurriculumPdfImport: jest.fn(),
  createCurriculumLesson: jest.fn(),
  uploadCurriculumLessonDocument: jest.fn(),
  saveCurriculumLessonText: jest.fn(),
  deleteCurriculumLesson: jest.fn(),
  getSchoolProgressStudents: jest.fn(),
  getSchoolProgressPeriod: jest.fn(),
  saveSchoolProgressPeriod: jest.fn(),
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
const pdfPreview = {
  previewId: 'preview-a', fileName: 'English part one.pdf', pageCount: 10, excludedPages: [1, 2, 10],
  lessons: [
    { title: 'The River', startPage: 3, endPage: 5, lessonNumber: 1 },
    { title: 'The Garden', startPage: 6, endPage: 7, lessonNumber: 2 },
    { title: 'The Bridge', startPage: 8, endPage: 9, lessonNumber: 3 }
  ]
};

function curriculumFixture() {
  window.location.hash = '#curriculum';
  listCurriculumSubjects.mockResolvedValue({ classes: [
    { className: 'Class 7', subjects: [
      { subject: 'English', teacherId: 'english', teacherName: 'Teacher', canUpload: true },
      { subject: 'Mathematics', teacherId: 'math', teacherName: 'Math teacher', canUpload: true }
    ] }
  ], allSubjects: [] });
  listCurriculumLessons.mockResolvedValue({ lessons: [] });
  listCurriculumLessonDocuments.mockResolvedValue({ documents: [] });
  previewCurriculumPdfImport.mockResolvedValue(pdfPreview);
  URL.createObjectURL = jest.fn(() => 'blob:curriculum');
  URL.revokeObjectURL = jest.fn();
}
beforeEach(() => {
  jest.clearAllMocks();
  window.location.hash = '#progress';
  schoolDashboard.mockResolvedValue({ summary: { students: 14, teachers: 2, activeInvites: 0 } });
  schoolTeachers.mockResolvedValue({ teachers: [], pagination: null });
  schoolStudents.mockResolvedValue({ students: [], pagination: null });
  schoolDeduplicateTeachers.mockResolvedValue({ success: true });
  listCurriculumSubjects.mockResolvedValue({ classes: [] });
  getSchoolProgressStudents.mockResolvedValue({ students, classes: ['Class 8', 'Class 9', 'Class 10'] });
  getSchoolProgressPeriod.mockResolvedValue({ success: true, period: null });
  saveSchoolProgressPeriod.mockResolvedValue({ success: true, period: { startDate: '2026-06-15', endDate: '2027-03-20' } });
  getSchoolStudentLearningScore.mockResolvedValue({ success: true });
  getSchoolStudentReportCards.mockResolvedValue({ success: true });
});
afterEach(() => { window.location.hash = ''; });

test('manual lesson creation accepts pasted content without a PDF and can also attach PDFs', async () => {
  curriculumFixture();
  createCurriculumLesson.mockResolvedValue({ success: true, lesson: { id: 'pasted-lesson', order_index: 1 } });
  saveCurriculumLessonText.mockResolvedValue({ success: true, chunkCount: 2 });
  uploadCurriculumLessonDocument.mockResolvedValue({ success: true });
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  const title = await screen.findByLabelText('Lesson name');
  const content = screen.getByLabelText(/Or paste lesson content/);
  fireEvent.change(title, { target: { value: 'The River' } });
  expect(screen.getByRole('button', { name: 'Add Lesson' })).toBeDisabled();
  fireEvent.change(content, { target: { value: ' \n Rivers carry water to the sea. \n ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Lesson' }));
  await waitFor(() => expect(saveCurriculumLessonText).toHaveBeenCalledWith('pasted-lesson', 'Rivers carry water to the sea.'));
  await waitFor(() => expect(content).toHaveValue(''));
  expect(createCurriculumLesson).toHaveBeenCalledWith(expect.objectContaining({ teacherId: 'english', subject: 'English', className: 'Class 7', title: 'The River' }));
  expect(uploadCurriculumLessonDocument).not.toHaveBeenCalled();

  fireEvent.change(title, { target: { value: 'The Garden' } });
  fireEvent.change(content, { target: { value: 'Plants need sunlight.' } });
  fireEvent.change(screen.getByLabelText(/Lesson PDFs/), { target: { files: [new File(['%PDF-fixture'], 'garden.pdf', { type: 'application/pdf' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Lesson' }));
  await waitFor(() => expect(uploadCurriculumLessonDocument).toHaveBeenCalledWith('pasted-lesson', expect.objectContaining({ fileName: 'garden.pdf' })));
  await waitFor(() => expect(content).toHaveValue(''));

  fireEvent.change(title, { target: { value: 'The Bridge' } });
  fireEvent.change(screen.getByLabelText(/Lesson PDFs/), { target: { files: [new File(['%PDF-fixture'], 'bridge.pdf', { type: 'application/pdf' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Lesson' }));
  await waitFor(() => expect(uploadCurriculumLessonDocument).toHaveBeenCalledWith('pasted-lesson', expect.objectContaining({ fileName: 'bridge.pdf' })));
  await waitFor(() => expect(title).toHaveValue(''));
  expect(saveCurriculumLessonText).toHaveBeenCalledTimes(2);
});

test('pasted-content indexing failures remove the empty lesson and keep the draft', async () => {
  curriculumFixture();
  createCurriculumLesson.mockResolvedValue({ success: true, lesson: { id: 'failed-lesson', order_index: 1 } });
  saveCurriculumLessonText.mockRejectedValue(new Error('Lesson indexing failed'));
  deleteCurriculumLesson.mockResolvedValue({ success: true });
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  fireEvent.change(await screen.findByLabelText('Lesson name'), { target: { value: 'The River' } });
  const content = screen.getByLabelText(/Or paste lesson content/);
  fireEvent.change(content, { target: { value: 'Rivers carry water.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Lesson' }));
  await waitFor(() => expect(deleteCurriculumLesson).toHaveBeenCalledWith('failed-lesson'));
  expect(await screen.findByText('Lesson indexing failed')).toBeInTheDocument();
  expect(content).toHaveValue('Rivers carry water.');
  expect(screen.getByLabelText('Lesson name')).toHaveValue('The River');
  deleteCurriculumLesson.mockResolvedValue({ success: false, error: 'Cleanup write failed' });
  fireEvent.click(screen.getByRole('button', { name: 'Add Lesson' }));
  expect(await screen.findByText(/Cleanup failed for lesson failed-lesson/)).toHaveTextContent('Remove that lesson before retrying');
});

test('pasted content is not silently truncated and does not carry over to another subject', async () => {
  curriculumFixture();
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  fireEvent.change(await screen.findByLabelText('Lesson name'), { target: { value: 'The River' } });
  const content = screen.getByLabelText(/Or paste lesson content/);
  const tooLong = 'x'.repeat(200001);
  fireEvent.change(content, { target: { value: tooLong } });
  expect(content).toHaveValue(tooLong);
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing has been truncated');
  expect(screen.getByRole('button', { name: 'Add Lesson' })).toBeDisabled();
  expect(createCurriculumLesson).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('tab', { name: /Mathematics/ }));
  expect(content).toHaveValue('');
});

test('multi-lesson upload previews units and requires review before creating separate lessons', async () => {
  curriculumFixture();
  let published = false;
  const lessons = pdfPreview.lessons.map((lesson) => ({
    id: `lesson-${lesson.lessonNumber}`, teacher_id: 'english', subject: 'English',
    class_name: 'Class 7', title: lesson.title, order_index: lesson.lessonNumber, visibleClassNames: ['Class 7']
  }));
  listCurriculumLessons.mockImplementation(async () => ({ lessons: published ? lessons : [] }));
  publishCurriculumPdfImport.mockImplementation(async () => { published = true; return { lessonCount: 3, lessons }; });
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Upload Multi-Lesson PDF/ }));
  const file = new File(['%PDF-fixture'], 'English part one.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Multi-lesson PDF (up to 15 MB)'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Detect lessons' }));
  expect(await screen.findByText('3 lessons detected · 10 PDF pages')).toBeInTheDocument();
  expect(previewCurriculumPdfImport).toHaveBeenCalledWith({
    teacherId: 'english', subject: 'English', className: 'Class 7', fileName: file.name, data: expect.stringContaining('data:application/pdf;base64,')
  });
  const preview = screen.getByLabelText('Detected lessons');
  expect(within(preview).getByText('Lesson 1')).toBeInTheDocument();
  expect(within(preview).getByText('The River')).toBeInTheDocument();
  expect(within(preview).getAllByRole('link', { name: 'Open first page' })[0]).toHaveAttribute('href', 'blob:curriculum#page=3');
  expect(within(preview).getAllByRole('link', { name: 'Last page' })[0]).toHaveAttribute('href', 'blob:curriculum#page=5');
  const create = screen.getByRole('button', { name: 'Create 3 lessons' });
  expect(create).toBeDisabled();
  expect(publishCurriculumPdfImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: /I checked the lesson names/ }));
  fireEvent.click(create);
  await waitFor(() => expect(publishCurriculumPdfImport).toHaveBeenCalledWith('preview-a'));
  expect(await screen.findByText('The River')).toBeInTheDocument();
  expect(screen.queryByLabelText('Detected lessons')).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:curriculum');
  expect(screen.getByRole('button', { name: /Curriculum Upload/ })).toHaveClass('active');
});

test('uncertain split errors stay visible and the manual lesson draft is preserved', async () => {
  curriculumFixture();
  previewCurriculumPdfImport.mockRejectedValue(new Error('Two units start on page 4. No lessons were created.'));
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  await screen.findByRole('button', { name: /Upload Multi-Lesson PDF/ });
  fireEvent.change(screen.getByLabelText('Lesson name'), { target: { value: 'My manual lesson draft' } });
  fireEvent.click(screen.getByRole('button', { name: /Upload Multi-Lesson PDF/ }));
  fireEvent.change(screen.getByLabelText('Multi-lesson PDF (up to 15 MB)'), { target: { files: [new File(['%PDF-fixture'], 'book.pdf', { type: 'application/pdf' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Detect lessons' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Two units start on page 4');
  expect(publishCurriculumPdfImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add one lesson manually' }));
  expect(screen.getByLabelText('Lesson name')).toHaveValue('My manual lesson draft');
});

test('changing subjects discards the previous PDF preview and cannot publish it to another subject', async () => {
  curriculumFixture();
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Upload Multi-Lesson PDF/ }));
  fireEvent.change(screen.getByLabelText('Multi-lesson PDF (up to 15 MB)'), { target: { files: [new File(['%PDF-fixture'], 'book.pdf', { type: 'application/pdf' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Detect lessons' }));
  await screen.findByText('3 lessons detected · 10 PDF pages');
  fireEvent.click(screen.getByRole('tab', { name: /Mathematics/ }));
  expect(screen.queryByLabelText('Detected lessons')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Detect lessons' })).toBeDisabled();
  expect(publishCurriculumPdfImport).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:curriculum');
});

test('school account dropdown shows registered details, dismisses and preserves logout', async () => {
  const onLogout = jest.fn();
  render(<SchoolDashboard session={{ ...session, email: 'admin@example.test', branch: 'Main campus', location: 'Hyderabad' }} onLogout={onLogout} />);
  await screen.findByTestId('learning-report');
  const trigger = screen.getByRole('button', { name: 'School account details' });
  expect(within(screen.getByRole('navigation')).getByRole('button', { name: 'School account details' })).toBe(trigger);
  expect(document.querySelector('.td-topbar')).not.toContainElement(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  const card = screen.getByRole('region', { name: 'School account' });
  for (const value of ['Test School', 'admin@example.test', 'Main campus', 'Hyderabad']) {
    expect(within(card).getByText(value)).toBeInTheDocument();
  }
  expect(within(card).queryByText('School ID')).not.toBeInTheDocument();
  expect(within(card).queryByText('school-a')).not.toBeInTheDocument();
  expect(within(card).queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('region', { name: 'School account' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.mouseDown(document.body);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: /Logout/ }));
  expect(onLogout).toHaveBeenCalledTimes(1);
});

test('school account keeps missing fields explicit and closes when focus leaves', async () => {
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  await screen.findByTestId('learning-report');
  const trigger = screen.getByRole('button', { name: 'School account details' });
  fireEvent.click(trigger);
  expect(within(screen.getByRole('region', { name: 'School account' })).getAllByText('Not available')).toHaveLength(3);
  fireEvent.blur(trigger, { relatedTarget: screen.getByRole('button', { name: /Export/ }) });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('school sidebar restores progress from the hash and reuses both student reports', async () => {
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  expect(screen.getByRole('button', { name: /Student Progress/ })).toHaveClass('active');
  expect(await screen.findByTestId('learning-report')).toHaveTextContent('Asha');
  expect(screen.getByTestId('report-card')).toHaveTextContent('Asha embedded report card');
  expect(getSchoolStudentLearningScore).toHaveBeenCalledWith('asha');
  expect(getSchoolStudentReportCards).toHaveBeenCalledWith('asha');
  expect(screen.queryByTestId('school-support')).not.toBeInTheDocument();
});

test('school graph dates sit at the top and saving refreshes the selected student report', async () => {
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  await screen.findByTestId('learning-report');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Apply to all progress graphs' })).toBeEnabled());
  const before = getSchoolStudentLearningScore.mock.calls.length;
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-06-15' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-03-20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply to all progress graphs' }));
  expect(await screen.findByText(/Saved for your whole school/)).toBeInTheDocument();
  await waitFor(() => expect(getSchoolStudentLearningScore.mock.calls.length).toBeGreaterThan(before));
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /Overview/ }));
  expect(screen.queryByRole('region', { name: 'School progress graph dates' })).not.toBeInTheDocument();
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

test('progress loads the roster and both selected reports without a refresh button', async () => {
  render(<SchoolDashboard session={session} onLogout={jest.fn()} />);
  await screen.findByTestId('learning-report');
  expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument();
  expect(getSchoolProgressStudents).toHaveBeenCalledTimes(1);
  expect(getSchoolStudentLearningScore).toHaveBeenCalledWith('asha');
  expect(getSchoolStudentReportCards).toHaveBeenCalledWith('asha');
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

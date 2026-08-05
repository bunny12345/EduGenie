/**
 * SchoolDashboard — sidebar portal + curriculum subject buttons.
 *
 * The portal is organised into sidebar pages (Overview / Teacher Registration /
 * Teachers & Invites / Curriculum Upload / Students), so every assertion first
 * navigates to the page that owns the thing being checked.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SchoolDashboard from './SchoolDashboard';
import * as api from '../api';

jest.mock('../api');

const mockSession = {
  schoolId: 'school-123',
  schoolName: 'Model High School'
};

function sidebar() {
  return within(document.querySelector('.td-sidebar'));
}

function goTo(label) {
  fireEvent.click(sidebar().getByText(label));
}

function renderPortal() {
  return render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
}

describe('SchoolDashboard', () => {
  beforeEach(() => {
    api.schoolDashboard.mockResolvedValue({
      summary: { teachers: 5, students: 150, activeInvites: 3 }
    });
    api.schoolTeachers.mockResolvedValue({
      teachers: [
        { id: 't1', name: 'Rajesh Kumar', subject: 'Mathematics', loginId: 'rk_123', grades: ['Class 9'] },
        { id: 't2', name: 'Priya Sharma', subject: 'English', loginId: 'ps_456', grades: ['Class 8'] }
      ],
      pagination: { totalPages: 1, currentPage: 1 }
    });
    api.schoolInvites.mockResolvedValue({
      invites: [{ token: 'inv_abc', role: 'teacher', status: 'active', expiresAt: '2026-07-13' }],
      pagination: { totalPages: 1, currentPage: 1 }
    });
    api.schoolStudents.mockResolvedValue({
      students: [
        { id: 's1', name: 'Aditya Singh', className: 'Class 8' },
        { id: 's2', name: 'Neha Patel', className: 'Class 9' }
      ],
      pagination: { totalPages: 1, currentPage: 1 }
    });
    api.listCurriculumSubjects.mockResolvedValue({
      classes: [
        { className: 'Class 8', subjects: [{ subject: 'English', teacherId: 't2', teacherName: 'Priya Sharma' }] },
        { className: 'Class 9', subjects: [{ subject: 'Mathematics', teacherId: 't1', teacherName: 'Rajesh Kumar' }] }
      ]
    });
    api.listCurriculumLessons.mockImplementation(({ className } = {}) => Promise.resolve({
      lessons: className === 'Class 8'
        ? [{ id: 'l1', title: 'Nouns', subject: 'English', class_name: 'Class 8', order_index: 1 }]
        : []
    }));
    api.listCurriculumLessonDocuments.mockResolvedValue({
      documents: [{ id: 'd1', file_name: 'nouns.pdf', file_url: '/uploads/nouns.pdf', extraction_status: 'completed' }]
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Sidebar navigation', () => {
    test('renders every portal page as a sidebar button', async () => {
      renderPortal();
      await waitFor(() => expect(api.schoolDashboard).toHaveBeenCalled());

      const nav = sidebar();
      ['Overview', 'Teacher Registration', 'Teachers & Invites', 'Curriculum Upload', 'Students']
        .forEach((label) => expect(nav.getByText(label)).toBeInTheDocument());
    });

    test('opens the Overview page by default', async () => {
      renderPortal();
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'School Overview' })).toBeInTheDocument();
      });
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
      expect(screen.getByText('Classes & Subjects')).toBeInTheDocument();
    });

    test('shows the school stats bar on every page', async () => {
      renderPortal();
      await waitFor(() => expect(screen.getByText('Total Teachers')).toBeInTheDocument());
      expect(screen.getByText('Total Students')).toBeInTheDocument();
      expect(screen.getByText('Active Invites')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText('150')).toBeInTheDocument());
    });

    test('moves the registration form onto the Teacher Registration page', async () => {
      renderPortal();
      await waitFor(() => expect(api.schoolDashboard).toHaveBeenCalled());

      // Not visible from Overview.
      expect(screen.queryByPlaceholderText('Teacher login ID')).not.toBeInTheDocument();

      goTo('Teacher Registration');
      expect(screen.getByText('Manual Teacher Registration')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Teacher login ID')).toBeInTheDocument();
      expect(screen.getByText('Invite Teacher by Link')).toBeInTheDocument();
    });

    test('moves the roster and invites onto the Teachers & Invites page', async () => {
      renderPortal();
      await waitFor(() => expect(api.schoolTeachers).toHaveBeenCalled());

      goTo('Teachers & Invites');
      await waitFor(() => expect(screen.getByText('Rajesh Kumar')).toBeInTheDocument());
      expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
      expect(screen.getByText('Recent Teacher Invites')).toBeInTheDocument();
    });

    test('moves the student list onto the Students page', async () => {
      renderPortal();
      await waitFor(() => expect(api.schoolStudents).toHaveBeenCalled());

      goTo('Students');
      await waitFor(() => expect(screen.getByText(/Aditya Singh/)).toBeInTheDocument());
      expect(screen.getByText(/Neha Patel/)).toBeInTheDocument();
      expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
    });

    test('Quick Actions on Overview jump to the matching page', async () => {
      renderPortal();
      await waitFor(() => expect(screen.getByText('Quick Actions')).toBeInTheDocument());

      const quick = within(document.querySelector('.sd-quick-actions'));
      fireEvent.click(quick.getByText('Curriculum Upload'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Curriculum Upload' })).toBeInTheDocument();
      });
    });

    test('lists each class with the subjects it already has', async () => {
      renderPortal();
      await waitFor(() => expect(document.querySelector('.sd-class-map li strong')).toBeTruthy());

      const map = within(document.querySelector('.sd-class-map'));
      expect(map.getByText('Class 8')).toBeInTheDocument();
      expect(map.getByText('English')).toBeInTheDocument();
      expect(map.getByText('Class 9')).toBeInTheDocument();
      expect(map.getByText('Mathematics')).toBeInTheDocument();
    });
  });

  describe('Curriculum Upload — subject buttons', () => {
    async function openCurriculum() {
      renderPortal();
      await waitFor(() => expect(api.listCurriculumSubjects).toHaveBeenCalled());
      goTo('Curriculum Upload');
      await waitFor(() => expect(document.querySelector('.eg-cc-subject-buttons')).toBeTruthy());
    }

    test('renders one button per subject the selected class already has', async () => {
      await openCurriculum();

      await waitFor(() => expect(document.querySelector('.eg-cc-subject-count').textContent).toBe('1'));
      const buttons = [...document.querySelectorAll('.eg-cc-subject-btn')];
      expect(buttons.map((b) => b.querySelector('.eg-cc-subject-name').textContent)).toEqual(['English']);
    });

    test('pre-selects the first subject and confirms its teacher', async () => {
      await openCurriculum();

      expect(document.querySelector('.eg-cc-subject-btn').classList.contains('is-active')).toBe(true);
      expect(screen.getByText(/teaches English for Class 8/)).toBeInTheDocument();
      expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    });

    test('numbers the next upload after the lessons already filed', async () => {
      await openCurriculum();

      await waitFor(() => expect(document.querySelector('.eg-cc-nextnum').textContent).toContain('2'));
      const hint = document.querySelector('.eg-cc-nextnum');
      expect(hint.textContent).toContain('Saves as lesson');
      expect(hint.textContent).toContain('English');
    });

    test('lists the uploaded lessons of the selected subject, numbered', async () => {
      await openCurriculum();

      await waitFor(() => expect(document.querySelector('.eg-cc-lesson')).toBeTruthy());
      expect(document.querySelector('.eg-cc-num').textContent).toBe('1');
      expect(screen.getByText('Nouns')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText('nouns.pdf')).toBeInTheDocument());
    });

    test('changing the class swaps the subject buttons and the lesson list', async () => {
      await openCurriculum();
      await waitFor(() => expect(document.querySelector('.eg-cc-lesson')).toBeTruthy());

      fireEvent.change(document.querySelector('.eg-cc-class select'), { target: { value: 'Class 9' } });

      await waitFor(() => {
        const names = [...document.querySelectorAll('.eg-cc-subject-name')].map((n) => n.textContent);
        expect(names).toEqual(['Mathematics']);
      });
      expect(api.listCurriculumLessons).toHaveBeenCalledWith({ className: 'Class 9' });
      await waitFor(() => expect(document.querySelector('.eg-cc-lesson')).toBeFalsy());
    });

    test('the free-text subject field is gone — subjects can only be picked', async () => {
      await openCurriculum();
      expect(document.querySelector('#cc-subject')).toBeNull();
      expect(document.querySelector('datalist')).toBeNull();
    });

    test('Add Lesson stays disabled until a title and a PDF are supplied', async () => {
      await openCurriculum();

      const addBtn = screen.getByRole('button', { name: /Add Lesson/i });
      expect(addBtn).toBeDisabled();

      fireEvent.change(document.querySelector('#cc-title'), { target: { value: 'Verbs' } });
      expect(addBtn).toBeDisabled(); // still no PDF
    });

    test('tells the admin when a class has no subjects yet', async () => {
      api.listCurriculumSubjects.mockResolvedValue({
        classes: [{ className: 'Class 8', subjects: [] }]
      });
      api.listCurriculumLessons.mockResolvedValue({ lessons: [] });

      renderPortal();
      await waitFor(() => expect(api.listCurriculumSubjects).toHaveBeenCalled());
      goTo('Curriculum Upload');

      await waitFor(() => {
        expect(screen.getByText(/No subjects registered for Class 8/)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /Add Lesson/i })).not.toBeInTheDocument();
    });
  });

  describe('Refresh', () => {
    test('the header refreshes every section', async () => {
      renderPortal();
      await waitFor(() => expect(api.schoolDashboard).toHaveBeenCalled());

      jest.clearAllMocks();
      fireEvent.click(screen.getByText(/⟳ Refresh/));

      await waitFor(() => {
        expect(api.schoolTeachers).toHaveBeenCalled();
        expect(api.schoolInvites).toHaveBeenCalled();
        expect(api.schoolStudents).toHaveBeenCalled();
      });
    });

    test('each page refreshes only its own section', async () => {
      renderPortal();
      await waitFor(() => expect(api.schoolStudents).toHaveBeenCalled());

      goTo('Students');
      jest.clearAllMocks();
      fireEvent.click(screen.getByText('↻'));

      await waitFor(() => expect(api.schoolStudents).toHaveBeenCalled());
      expect(api.schoolTeachers).not.toHaveBeenCalled();
      expect(api.schoolInvites).not.toHaveBeenCalled();
    });
  });

  describe('Export', () => {
    function captureDownload() {
      const realCreate = document.createElement.bind(document);
      const link = { click: jest.fn(), href: '', download: '' };
      jest.spyOn(document, 'createElement').mockImplementation(
        (tag) => (String(tag).toLowerCase() === 'a' ? link : realCreate(tag))
      );
      return link;
    }

    beforeEach(() => {
      global.URL.createObjectURL = jest.fn(() => 'blob://mock-url');
      global.URL.revokeObjectURL = jest.fn();
    });

    test('offers teacher and student CSV exports', async () => {
      renderPortal();
      await waitFor(() => expect(api.schoolDashboard).toHaveBeenCalled());

      fireEvent.click(screen.getByText(/⬇ Export/));
      expect(screen.getByText(/Teachers CSV/)).toBeInTheDocument();
      expect(screen.getByText(/Students CSV/)).toBeInTheDocument();
    });

    test('exports teachers with the school id and date in the filename', async () => {
      renderPortal();
      await waitFor(() => expect(screen.getByText('Quick Actions')).toBeInTheDocument());

      const link = captureDownload();
      fireEvent.click(screen.getByText(/⬇ Export/));
      fireEvent.click(screen.getByText(/Teachers CSV/));

      expect(link.click).toHaveBeenCalled();
      expect(link.download).toMatch(/^teachers-school-123-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    test('exports students as CSV', async () => {
      renderPortal();
      await waitFor(() => expect(screen.getByText('Quick Actions')).toBeInTheDocument());

      const link = captureDownload();
      fireEvent.click(screen.getByText(/⬇ Export/));
      fireEvent.click(screen.getByText(/Students CSV/));

      expect(link.click).toHaveBeenCalled();
      expect(link.download).toMatch(/^students-school-123-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    test('escapes quotes in exported CSV data', async () => {
      api.schoolTeachers.mockResolvedValue({
        teachers: [{ id: 't1', name: 'Teacher "Dr." Name', subject: 'Science', email: 'x@s.edu', loginId: 'x_1' }],
        pagination: { totalPages: 1 }
      });

      renderPortal();
      await waitFor(() => expect(screen.getByText('Quick Actions')).toBeInTheDocument());

      let csv = '';
      const RealBlob = global.Blob;
      jest.spyOn(global, 'Blob').mockImplementation((parts) => {
        csv = parts[0];
        return new RealBlob(parts, { type: 'text/csv' });
      });

      const link = captureDownload();
      fireEvent.click(screen.getByText(/⬇ Export/));
      fireEvent.click(screen.getByText(/Teachers CSV/));

      expect(link.click).toHaveBeenCalled();
      expect(csv).toContain('"Name","Email","Subject","Login ID","Created At"');
      expect(csv).toContain('""Dr.""');
    });
  });

  describe('Error handling', () => {
    test('surfaces a failed section load', async () => {
      api.schoolTeachers.mockRejectedValue(new Error('API Error: Connection failed'));

      renderPortal();
      await waitFor(() => {
        expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
      });
    });
  });
});

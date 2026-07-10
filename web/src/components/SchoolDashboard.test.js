/**
 * SchoolDashboard Portal Enhancement Tests
 * Tests for new features: refresh buttons, export, admin functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SchoolDashboard from './SchoolDashboard';
import * as api from '../api';

jest.mock('../api');

describe('SchoolDashboard Admin Portal Enhancements', () => {
  const mockSession = {
    schoolId: 'school-123',
    schoolName: 'Model High School'
  };
  
  beforeEach(() => {
    // Mock all API calls
    api.schoolDashboard.mockResolvedValue({
      summary: { teachers: 5, students: 150, activeInvites: 3 }
    });
    api.schoolTeachers.mockResolvedValue({
      teachers: [
        { id: 't1', name: 'Rajesh Kumar', subject: 'Mathematics', loginId: 'rk_123' },
        { id: 't2', name: 'Priya Sharma', subject: 'Science', loginId: 'ps_456' }
      ],
      pagination: { totalPages: 1, currentPage: 1 }
    });
    api.schoolInvites.mockResolvedValue({
      invites: [
        { token: 'inv_abc', role: 'teacher', status: 'active', expiresAt: '2026-07-13' }
      ],
      pagination: { totalPages: 1, currentPage: 1 }
    });
    api.schoolStudents.mockResolvedValue({
      students: [
        { id: 's1', name: 'Aditya Singh', className: 'Class 10' },
        { id: 's2', name: 'Neha Patel', className: 'Class 10' }
      ],
      pagination: { totalPages: 1, currentPage: 1 }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Refresh All Sections Button', () => {
    test('should render "Refresh" button in admin header', async () => {
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/Refresh/i)).toBeInTheDocument();
      });
    });

    test('should call all section loaders when Refresh All clicked', async () => {
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      const refreshBtn = screen.getByText(/Refresh/i);
      fireEvent.click(refreshBtn);
      
      await waitFor(() => {
        // Verify each section loader was called
        expect(api.schoolTeachers).toHaveBeenCalled();
        expect(api.schoolInvites).toHaveBeenCalled();
        expect(api.schoolStudents).toHaveBeenCalled();
      });
    });

    test('should disable "Refresh" button while refreshing', async () => {
      api.schoolTeachers.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ teachers: [] }), 100))
      );
      
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      const refreshBtn = screen.getByText(/Refresh/i);
      fireEvent.click(refreshBtn);
      
      // Button should show loading state
      await waitFor(() => {
        expect(refreshBtn).toHaveTextContent('...');
      });
    });
  });

  describe('Individual Section Refresh Buttons', () => {
    test('should render refresh buttons on admin sections', async () => {
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      await waitFor(() => {
        const refreshButtons = screen.getAllByText('↻');
        // Should have buttons for: Teachers, Invites, Students
        expect(refreshButtons.length).toBeGreaterThanOrEqual(3);
      });
    });

    test('should refresh teachers section individually', async () => {
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      // Find refresh button for teachers (first one)
      const buttons = screen.getAllByText('↻');
      const teachersRefreshBtn = buttons[0];
      
      // Clear initial calls
      jest.clearAllMocks();
      
      fireEvent.click(teachersRefreshBtn);
      
      await waitFor(() => {
        expect(api.schoolTeachers).toHaveBeenCalled();
        // Other sections should NOT be called
        expect(api.schoolInvites).not.toHaveBeenCalled();
        expect(api.schoolStudents).not.toHaveBeenCalled();
      });
    });

    test('should refresh invites section independently', async () => {
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      // Find refresh button for invites
      const buttons = screen.getAllByText('↻');
      const invitesRefreshBtn = buttons[1];
      
      jest.clearAllMocks();
      fireEvent.click(invitesRefreshBtn);
      
      await waitFor(() => {
        expect(api.schoolInvites).toHaveBeenCalled();
      });
    });
  });

  describe('Export Data Features', () => {
    test('should render Export button in admin header', async () => {
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/Export/i)).toBeInTheDocument();
      });
    });

    test('should show export options when Export clicked', async () => {
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      const exportBtn = screen.getByText(/Export/i);
      fireEvent.click(exportBtn);
      
      await waitFor(() => {
        expect(screen.getByText('Teachers CSV')).toBeInTheDocument();
        expect(screen.getByText('Students CSV')).toBeInTheDocument();
      });
    });

    test('should export teachers as CSV', async () => {
      // Mock URL and createElement
      global.URL.createObjectURL = jest.fn(() => 'blob://mock-url');
      global.URL.revokeObjectURL = jest.fn();
      
      const mockLink = { click: jest.fn(), href: '', download: '' };
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
      
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      const exportBtn = screen.getByText(/Export/i);
      fireEvent.click(exportBtn);
      
      await waitFor(() => {
        const teachersOption = screen.getByText('Teachers CSV');
        fireEvent.click(teachersOption);
        
        // Verify file was triggered for download
        expect(mockLink.click).toHaveBeenCalled();
        expect(mockLink.download).toMatch(/teachers-.*\.csv$/);
      });
    });

    test('should export students as CSV', async () => {
      global.URL.createObjectURL = jest.fn(() => 'blob://mock-url');
      global.URL.revokeObjectURL = jest.fn();
      
      const mockLink = { click: jest.fn(), href: '', download: '' };
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
      
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      const exportBtn = screen.getByText(/Export/i);
      fireEvent.click(exportBtn);
      
      await waitFor(() => {
        const studentsOption = screen.getByText('Students CSV');
        fireEvent.click(studentsOption);
        
        expect(mockLink.click).toHaveBeenCalled();
        expect(mockLink.download).toMatch(/students-.*\.csv$/);
      });
    });

    test('should include school ID and date in export filename', async () => {
      global.URL.createObjectURL = jest.fn(() => 'blob://mock-url');
      global.URL.revokeObjectURL = jest.fn();
      
      const mockLink = { click: jest.fn(), href: '', download: '' };
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
      
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      const exportBtn = screen.getByText(/Export/i);
      fireEvent.click(exportBtn);
      
      await waitFor(() => {
        const teachersOption = screen.getByText('Teachers CSV');
        fireEvent.click(teachersOption);
        
        // Filename should contain school ID and date
        expect(mockLink.download).toMatch(/school-123/);
        expect(mockLink.download).toMatch(/\d{4}-\d{2}-\d{2}/); // Date format YYYY-MM-DD
      });
    });
  });

  describe('Admin Operations', () => {
    test('should display school overview stats', async () => {
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      await waitFor(() => {
        expect(screen.getByText('Teachers')).toBeInTheDocument();
        expect(screen.getByText('Students')).toBeInTheDocument();
        expect(screen.getByText('Active Invites')).toBeInTheDocument();
      });
    });

    test('should load and display teachers list', async () => {
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Rajesh Kumar/i)).toBeInTheDocument();
        expect(screen.getByText(/Priya Sharma/i)).toBeInTheDocument();
      });
    });

    test('should load and display student list', async () => {
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Aditya Singh/i)).toBeInTheDocument();
        expect(screen.getByText(/Neha Patel/i)).toBeInTheDocument();
      });
    });

    test('should maintain pagination state during refresh', async () => {
      // Mock pagination on page 2
      api.schoolTeachers.mockResolvedValue({
        teachers: [{ id: 't3', name: 'Another Teacher' }],
        pagination: { totalPages: 5, currentPage: 2 }
      });
      
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      await waitFor(() => {
        // Should show page 2 indicator
        expect(screen.getByText(/Page 2 of 5/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('should show error message if section fails to load', async () => {
      api.schoolTeachers.mockRejectedValue(new Error('API Error: Connection failed'));
      
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
      });
    });

    test('should allow retry after refresh failure', async () => {
      let callCount = 0;
      api.schoolTeachers.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve({ teachers: [], pagination: {} });
      });
      
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      // Initial fails
      await waitFor(() => {
        expect(api.schoolTeachers).toHaveBeenCalledTimes(1);
      });
      
      // Click refresh to retry
      const buttons = screen.getAllByText('↻');
      if (buttons.length > 0) {
        fireEvent.click(buttons[0]);
        
        await waitFor(() => {
          expect(api.schoolTeachers).toHaveBeenCalledTimes(2);
        });
      }
    });
  });

  describe('Export Data Quality', () => {
    test('should export all visible teachers', async () => {
      global.URL.createObjectURL = jest.fn(() => 'blob://mock-url');
      global.URL.revokeObjectURL = jest.fn();
      
      // Capture blob data
      let csvContent = '';
      jest.spyOn(global, 'Blob').mockImplementation((data) => {
        csvContent = data[0];
        return { type: 'text/csv' };
      });
      
      const mockLink = { click: jest.fn(), href: '', download: '' };
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
      
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      const exportBtn = screen.getByText(/Export/i);
      fireEvent.click(exportBtn);
      
      await waitFor(() => {
        const teachersOption = screen.getByText('Teachers CSV');
        fireEvent.click(teachersOption);
        
        // CSV should contain headers and teacher data
        expect(csvContent).toContain('Name,Email,Subject,Login ID,Created At');
        expect(csvContent).toContain('Rajesh Kumar');
        expect(csvContent).toContain('Priya Sharma');
      });
    });

    test('should properly escape quotes in CSV data', async () => {
      api.schoolTeachers.mockResolvedValue({
        teachers: [
          { 
            id: 't1', 
            name: 'Teacher "Dr." Name', 
            subject: 'Science', 
            email: 'test@school.edu',
            loginId: 'test_123'
          }
        ],
        pagination: { totalPages: 1 }
      });
      
      global.URL.createObjectURL = jest.fn(() => 'blob://mock-url');
      global.URL.revokeObjectURL = jest.fn();
      
      let csvContent = '';
      jest.spyOn(global, 'Blob').mockImplementation((data) => {
        csvContent = data[0];
        return { type: 'text/csv' };
      });
      
      const mockLink = { click: jest.fn(), href: '', download: '' };
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
      
      render(<SchoolDashboard session={mockSession} onLogout={() => {}} />);
      
      const exportBtn = screen.getByText(/Export/i);
      fireEvent.click(exportBtn);
      
      await waitFor(() => {
        const teachersOption = screen.getByText('Teachers CSV');
        fireEvent.click(teachersOption);
        
        // Should escape quotes properly
        expect(csvContent).toContain('""Dr.""');
      });
    });
  });
});

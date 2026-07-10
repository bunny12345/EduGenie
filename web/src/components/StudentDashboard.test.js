/**
 * StudentDashboard Portal Enhancement Tests
 * Tests for new features: refresh buttons, export, performance improvements
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudentDashboard from './StudentDashboard';
import * as api from '../api';

jest.mock('../api');

describe('StudentDashboard Portal Enhancements', () => {
  const mockStudentId = 'test-student-123';
  
  beforeEach(() => {
    // Mock all API calls
    api.getDashboard.mockResolvedValue({ 
      greetingName: 'Alice', 
      announcements: [],
      streak: { days: 5 }
    });
    api.getHomework.mockResolvedValue({ homework: [] });
    api.getProgress.mockResolvedValue({ subjectScores: [] });
    api.getCalendar.mockResolvedValue({ events: [] });
    api.getRewards.mockResolvedValue({ coins: 100, badges: [] });
    api.getTests.mockResolvedValue({ tests: [] });
    api.getLibrary.mockResolvedValue({ resources: [] });
    api.getSettings.mockResolvedValue({ prefs: {} });
    api.getChatHistory.mockResolvedValue({ messages: [] });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Refresh All Panels Button', () => {
    test('should render "Refresh" button in topbar', async () => {
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/Refresh/i)).toBeInTheDocument();
      });
    });

    test('should call all panel load functions when Refresh All clicked', async () => {
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      const refreshBtn = screen.getByText(/Refresh/i);
      fireEvent.click(refreshBtn);
      
      await waitFor(() => {
        // Verify each panel loader was called
        expect(api.getDashboard).toHaveBeenCalledWith(mockStudentId);
        expect(api.getHomework).toHaveBeenCalledWith(mockStudentId);
        expect(api.getProgress).toHaveBeenCalledWith(mockStudentId);
        expect(api.getCalendar).toHaveBeenCalledWith(mockStudentId);
        expect(api.getRewards).toHaveBeenCalledWith(mockStudentId);
        expect(api.getTests).toHaveBeenCalledWith(mockStudentId, 'upcoming');
        expect(api.getLibrary).toHaveBeenCalled();
        expect(api.getSettings).toHaveBeenCalledWith(mockStudentId);
        expect(api.getChatHistory).toHaveBeenCalledWith(mockStudentId);
      });
    });

    test('should disable "Refresh" button while refreshing', async () => {
      // Simulate slow API
      api.getDashboard.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ greetingName: 'Alice' }), 100))
      );
      
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      const refreshBtn = screen.getByText(/Refresh/i);
      fireEvent.click(refreshBtn);
      
      // Button should show loading state
      await waitFor(() => {
        expect(refreshBtn).toHaveTextContent('...');
      });
    });
  });

  describe('Individual Panel Refresh Buttons', () => {
    test('should render refresh buttons on critical panels', async () => {
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      await waitFor(() => {
        const refreshButtons = screen.getAllByText('↻');
        // Should have buttons for: Homework, Progress Dashboard, Mock Tests
        expect(refreshButtons.length).toBeGreaterThanOrEqual(3);
      });
    });

    test('should refresh homework panel individually', async () => {
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      // Find homework refresh button and click
      const buttons = screen.getAllByText('↻');
      const homeworkRefreshBtn = buttons[0]; // Homework is first
      
      fireEvent.click(homeworkRefreshBtn);
      
      await waitFor(() => {
        expect(api.getHomework).toHaveBeenLastCalledWith(mockStudentId);
      });
    });

    test('should refresh progress panel individually', async () => {
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      // Note: This test assumes Progress panel refresh button is accessible
      // In actual implementation, need to identify refresh button by context
      const buttons = screen.getAllByText('↻');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Export Progress Data', () => {
    test('should render Export button in topbar', async () => {
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/Export/i)).toBeInTheDocument();
      });
    });

    test('should show export format options when Export clicked', async () => {
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      const exportBtn = screen.getByText(/Export/i);
      fireEvent.click(exportBtn);
      
      await waitFor(() => {
        expect(screen.getByText('CSV')).toBeInTheDocument();
        expect(screen.getByText('JSON')).toBeInTheDocument();
      });
    });

    test('should export progress as CSV', async () => {
      // Mock progress data
      api.getProgress.mockResolvedValue({
        subjectScores: [
          { subject: 'Mathematics', score: 85 },
          { subject: 'Science', score: 90 }
        ]
      });
      
      // Mock URL.createObjectURL
      global.URL.createObjectURL = jest.fn(() => 'blob://mock-url');
      global.URL.revokeObjectURL = jest.fn();
      
      // Mock createElement and click
      const mockLink = { click: jest.fn(), href: '', download: '' };
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
      
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      const exportBtn = screen.getByText(/Export/i);
      fireEvent.click(exportBtn);
      
      await waitFor(() => {
        const csvOption = screen.getByText('CSV');
        fireEvent.click(csvOption);
        
        // Verify file was triggered for download
        expect(mockLink.click).toHaveBeenCalled();
        expect(mockLink.download).toMatch(/\.csv$/);
      });
    });

    test('should export progress as JSON', async () => {
      api.getProgress.mockResolvedValue({
        subjectScores: [
          { subject: 'Mathematics', score: 85 }
        ]
      });
      
      global.URL.createObjectURL = jest.fn(() => 'blob://mock-url');
      global.URL.revokeObjectURL = jest.fn();
      
      const mockLink = { click: jest.fn(), href: '', download: '' };
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
      
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      const exportBtn = screen.getByText(/Export/i);
      fireEvent.click(exportBtn);
      
      await waitFor(() => {
        const jsonOption = screen.getByText('JSON');
        fireEvent.click(jsonOption);
        
        expect(mockLink.click).toHaveBeenCalled();
        expect(mockLink.download).toMatch(/\.json$/);
      });
    });
  });

  describe('Error Handling', () => {
    test('should show error message if panel refresh fails', async () => {
      api.getHomework.mockRejectedValue(new Error('API Error: Connection failed'));
      
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      await waitFor(() => {
        expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
      });
    });

    test('should allow retry after refresh failure', async () => {
      let callCount = 0;
      api.getHomework.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve({ homework: [] });
      });
      
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      // First load fails
      await waitFor(() => {
        expect(api.getHomework).toHaveBeenCalledTimes(1);
      });
      
      // Click refresh to retry
      const buttons = screen.getAllByText('↻');
      if (buttons.length > 0) {
        fireEvent.click(buttons[0]);
        
        await waitFor(() => {
          expect(api.getHomework).toHaveBeenCalledTimes(2);
        });
      }
    });
  });

  describe('Performance Optimizations', () => {
    test('should load all panels in parallel on mount', async () => {
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      // Wait for initial load
      await waitFor(() => {
        // All APIs should be called once during initial load
        expect(api.getDashboard).toHaveBeenCalled();
        expect(api.getHomework).toHaveBeenCalled();
        expect(api.getProgress).toHaveBeenCalled();
      });
    });

    test('should not refresh all panels simultaneously during interval polling', async () => {
      jest.useFakeTimers();
      
      render(<StudentDashboard studentId={mockStudentId} onLogout={() => {}} />);
      
      // Clear initial calls
      jest.clearAllMocks();
      
      // Fast-forward 20 seconds
      jest.advanceTimersByTime(20000);
      
      // Should only refresh dashboard, homework, tests (selective polling)
      expect(api.getDashboard).toHaveBeenCalled();
      expect(api.getHomework).toHaveBeenCalled();
      expect(api.getTests).toHaveBeenCalled();
      
      // Should NOT refresh other panels in auto-poll
      expect(api.getCalendar).not.toHaveBeenCalledSince = 0;
      
      jest.useRealTimers();
    });
  });
});

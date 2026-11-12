import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Flashcards from './games/Flashcards';
import QuizRush from './games/QuizRush';
import MemoryMaze from './games/MemoryMaze';
import SchoolEnquiriesInbox from './SchoolEnquiriesInbox';
import { getFlashcardOverview, getQuizRushOverview, listSchoolEnquiries } from '../api';

jest.mock('../api', () => ({
  getFlashcardOverview: jest.fn(),
  getQuizRushOverview: jest.fn(),
  listSchoolEnquiries: jest.fn(),
}));

beforeEach(() => jest.resetAllMocks());

test.each([
  ['Flashcards', Flashcards, getFlashcardOverview, 'No flashcards yet'],
  ['Quiz Rush', QuizRush, getQuizRushOverview, 'No chapters ready yet'],
  ['Memory Maze', MemoryMaze, getFlashcardOverview, 'No chapters ready yet'],
])('%s omits refresh for empty content but keeps working error recovery', async (_name, Game, overview, heading) => {
  overview.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({ subjects: [] });
  render(<Game studentId="student" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  expect(overview).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('button', { name: /refresh|try again/i })).not.toBeInTheDocument();
});

test('enquiries only offer manual retry after an error', async () => {
  listSchoolEnquiries.mockRejectedValueOnce(new Error('Enquiries unavailable'))
    .mockResolvedValue({ enquiries: [], nextOffset: null });
  render(<SchoolEnquiriesInbox token="test-token" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Enquiries unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Verified school enquiries will appear here.')).toBeInTheDocument();
  expect(listSchoolEnquiries).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('button', { name: /refresh|try again/i })).not.toBeInTheDocument();
});

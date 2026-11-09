import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentOrchard from './StudentOrchard';
import { getOrchard, getOrchardTree } from '../api';

jest.mock('../api', () => ({ getOrchard: jest.fn(), getOrchardTree: jest.fn() }));
jest.mock('./orchard/OrchardAmbience', () => () => null);

const tree = {
  subjectKey: 'science', subject: 'Science', treeType: 'crystal',
  treeEmoji: '🌲', fruitEmoji: '💎', accentColor: '#0ea5e9',
  stage: 'fruit', stageLabel: 'Fruit', masteredChapters: 3,
  completedChapters: 4, totalChapters: 12, progressPct: 33, rootsPct: 90,
  level: 5, maxLevel: 7, waterPct: 60, sunlightPct: 50, fertilizerPct: 30,
  health: 'healthy', season: 'spring',
};
beforeEach(() => {
  jest.clearAllMocks();
  getOrchard.mockResolvedValue({ trees: [tree], overallProgress: 33, profile: {} });
  getOrchardTree.mockResolvedValue({
    ...tree, tree, chapters: [], nextChapter: null,
  });
});

test('returning from a tree refreshes the selected chapter detail along with overview progress', async () => {
    getOrchardTree.mockResolvedValue({
      ...tree, tree, chapters: [],
      nextChapter: { chapterId: 'chapter-1', title: 'Old unfinished chapter', stageLabel: 'Growing Tree' },
    });
    render(<StudentOrchard studentId="student-1" />);
    expect(await screen.findByText('Old unfinished chapter')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Explore tree →'));
    expect(await screen.findByText('← Back to Orchard')).toBeInTheDocument();
    const mastered = { ...tree, stage: 'golden_fruit', stageLabel: 'Golden Fruit', masteredChapters: 12, completedChapters: 12, progressPct: 100 };
    getOrchard.mockResolvedValue({ trees: [mastered], overallProgress: 100, profile: {} });
    getOrchardTree.mockResolvedValue({ ...mastered, tree: mastered, chapters: [], nextChapter: null });
    const previousReads = getOrchardTree.mock.calls.length;
    fireEvent.click(screen.getByText('← Back to Orchard'));
    expect(await screen.findByText('12 apples')).toBeInTheDocument();
    await waitFor(() => expect(getOrchardTree.mock.calls.length).toBeGreaterThan(previousReads));
    await waitFor(() => expect(screen.queryByText('Old unfinished chapter')).not.toBeInTheDocument());
});

test('Orchard card, side panel and expanded tree show the same natural mastery count', async () => {
  render(<StudentOrchard studentId="student-1" />);
  expect(await screen.findByText('3 apples')).toBeInTheDocument();
  expect(screen.getByText('3 apples earned · One per fully mastered lesson')).toBeInTheDocument();
  expect(screen.getAllByRole('img', { name: /apple tree with 3 apples/ })).toHaveLength(2);
  expect(screen.getByText('4 / 12 Lessons')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Explore tree →'));
  expect(await screen.findByText('3 apples · mastered lessons')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /apple tree with 3 apples/ })).toBeInTheDocument();
  expect(getOrchardTree).toHaveBeenCalledWith('student-1', 'science');
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TreeSprite from './TreeSprite';
import { masteryFruitRects, treeArt } from './treeArt';

function artwork(file) {
  return screen.queryAllByAltText('').filter((image) => image.getAttribute('src').endsWith(`/${file}.png`));
}

test.each(['crystal', 'cherry_blossom', 'banyan', 'digital', 'mango', 'lemon', 'peach', 'plum', 'coconut'])('%s grows natural fruit at the oak positions without changing its identifier', (treeType) => {
  const { rerender } = render(<TreeSprite treeType={treeType} stage="fruit" masteredChapters={1} size={220} />);
  let image = screen.getByRole('img');
  expect(image).toHaveAccessibleName(new RegExp(`1 ${treeArt(treeType).fruitPlural}`));
  const [base] = artwork('fully_grown');
  expect(base).toHaveAttribute('src', `/assets/orchard/${treeType}/fully_grown.png`);
  const [fruit] = artwork('mastery_fruit');
  expect(fruit).toHaveStyle({ left: `${220 * (0.253 - 0.035)}px`, top: `${220 * (0.590 - 0.045)}px` });
  rerender(<TreeSprite treeType={treeType} stage="golden_fruit" masteredChapters={17} size={220} health="wilting" />);
  image = screen.getByRole('img');
  expect(artwork('mastery_fruit')).toHaveLength(17);
  expect(image).toHaveStyle({ filter: 'saturate(0.55)', width: '220px', height: '220px' });
});

test('oak retains the supplied images and adds matching acorns above nine', () => {
  const { rerender } = render(<TreeSprite treeType="oak" stage="fruit" masteredChapters={9} />);
  expect(artwork('acorns_9')).toHaveLength(1);
  rerender(<TreeSprite treeType="oak" stage="golden_fruit" masteredChapters={12} />);
  expect(artwork('acorn')).toHaveLength(3);
});

test('zero mastery and unavailable mastery do not invent fruit rewards', () => {
  const { rerender } = render(<TreeSprite treeType="crystal" stage="seed" masteredChapters={0} />);
  expect(artwork('seed')).toHaveLength(1);
  rerender(<TreeSprite treeType="crystal" stage="golden_fruit" />);
  expect(artwork('mastery_fruit')).toHaveLength(0);
  expect(artwork('fully_grown')).toHaveLength(1);
});

test('unknown tree types keep existing fallback behaviour', () => {
  render(<TreeSprite treeType="unknown" stage="seed" />);
  for (let i = 0; i < 6; i++) fireEvent.error(screen.getByAltText(''));
  expect(screen.getByLabelText(/unknown seed/)).toHaveClass('eg-tree-placeholder');
});

test('all mastery fruits fit inside the canvas, with no nine-fruit cap', () => {
  for (const count of [0, 1, 9, 10, 17, 100, 1200]) {
    const rects = masteryFruitRects(count, 220);
    expect(rects).toHaveLength(count);
    for (const rect of rects) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.left + rect.width).toBeLessThanOrEqual(220);
      expect(rect.top + rect.height).toBeLessThanOrEqual(220);
    }
  }
});

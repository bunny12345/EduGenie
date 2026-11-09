import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TreeSprite from './TreeSprite';
import { masteryFruitRects, treeArt } from './treeArt';

function artwork(file) {
  return screen.queryAllByAltText('').filter((image) => new RegExp(`/${file}\\.(png|webp)$`).test(image.getAttribute('src')));
}

test.each(['oak', 'crystal'])('%s selects the correct artwork for all eight learning stages', (treeType) => {
  const { rerender } = render(<TreeSprite treeType={treeType} stage="seed" masteredChapters={0} />);
  for (const stage of ['seed', 'sprout', 'young_plant', 'growing_tree', 'mature_tree', 'blossom', 'fruit', 'golden_fruit']) {
    const masteredChapters = stage === 'golden_fruit' ? 1 : 0;
    rerender(<TreeSprite treeType={treeType} stage={stage} masteredChapters={masteredChapters} />);
    const file = masteredChapters > 0 ? (treeType === 'oak' ? 'acorns_1' : 'fully_grown')
      : ['blossom', 'fruit'].includes(stage) ? 'fully_grown' : stage;
    expect(artwork(file)).toHaveLength(1);
    expect(artwork('mastery_fruit')).toHaveLength(treeType === 'crystal' && masteredChapters > 0 ? 1 : 0);
    expect(screen.getByRole('img')).not.toHaveClass('eg-tree-placeholder');
  }
});

test.each(['crystal', 'cherry_blossom', 'banyan', 'digital', 'mango', 'lemon', 'peach', 'plum', 'strawberry'])('%s grows natural fruit at the oak positions without changing its identifier', (treeType) => {
  const { rerender } = render(<TreeSprite treeType={treeType} stage="fruit" masteredChapters={1} size={220} />);
  let image = screen.getByRole('img');
  expect(image).toHaveAccessibleName(new RegExp(`1 ${treeArt(treeType).fruitPlural}`));
  const [base] = artwork('fully_grown');
  expect(base).toHaveAttribute('src', `/assets/orchard/${treeType}/fully_grown.webp`);
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

test('saved coconut assignments present strawberries without resetting the tree', () => {
  render(<TreeSprite treeType="coconut" stage="golden_fruit" masteredChapters={12} />);
  expect(screen.getByRole('img')).toHaveAccessibleName(/12 strawberries/);
  expect(artwork('mastery_fruit')).toHaveLength(12);
  expect(treeArt('coconut').fruitEmoji).toBe('🍓');
  expect(artwork('fully_grown')[0]).toHaveAttribute('src', '/assets/orchard/strawberry/fully_grown.webp');
  expect(treeArt('coconut')).toBe(treeArt('strawberry'));
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

test('optimized artwork falls back to the original PNG if unavailable', () => {
  render(<TreeSprite treeType="oak" stage="seed" masteredChapters={0} />);
  expect(artwork('seed')[0]).toHaveAttribute('src', '/assets/orchard/oak/seed.webp');
  fireEvent.error(artwork('seed')[0]);
  expect(artwork('seed')[0]).toHaveAttribute('src', '/assets/orchard/oak/seed.png');
  fireEvent.error(artwork('seed')[0]);
  expect(screen.getByLabelText(/oak seed/)).toHaveClass('eg-tree-placeholder');
});

test('optimized fruit sprites fall back to their original PNG if unavailable', () => {
  render(<TreeSprite treeType="crystal" stage="golden_fruit" masteredChapters={1} />);
  const [fruit] = artwork('mastery_fruit');
  expect(fruit).toHaveAttribute('src', '/assets/orchard/crystal/mastery_fruit.webp');
  fireEvent.error(fruit);
  expect(fruit).toHaveAttribute('src', '/assets/orchard/crystal/mastery_fruit.png');
  fireEvent.error(fruit);
  expect(fruit).toHaveAttribute('src', '/assets/orchard/crystal/mastery_fruit.png');
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

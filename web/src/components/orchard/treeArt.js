export const TREE_ART = {
  oak: { assetType: 'oak', fruitName: 'acorn', fruitPlural: 'acorns', fruitEmoji: '🌰' },
  crystal: { assetType: 'crystal', fruitName: 'apple', fruitPlural: 'apples', fruitEmoji: '🍎' },
  cherry_blossom: { assetType: 'cherry_blossom', fruitName: 'cherry reward', fruitPlural: 'cherry rewards', fruitEmoji: '🍒' },
  banyan: { assetType: 'banyan', fruitName: 'orange', fruitPlural: 'oranges', fruitEmoji: '🍊' },
  digital: { assetType: 'digital', fruitName: 'pear', fruitPlural: 'pears', fruitEmoji: '🍐' },
  mango: { assetType: 'mango', fruitName: 'mango', fruitPlural: 'mangoes', fruitEmoji: '🥭' },
  lemon: { assetType: 'lemon', fruitName: 'lemon', fruitPlural: 'lemons', fruitEmoji: '🍋' },
  peach: { assetType: 'peach', fruitName: 'peach', fruitPlural: 'peaches', fruitEmoji: '🍑' },
  plum: { assetType: 'plum', fruitName: 'plum', fruitPlural: 'plums', fruitEmoji: '🟣' },
  coconut: { assetType: 'coconut', fruitName: 'coconut', fruitPlural: 'coconuts', fruitEmoji: '🥥' },
};
export function treeArt(treeType) {
  const aliases = { willow: 'cherry_blossom', maple: 'cherry_blossom', pine: 'crystal', palm: 'mango', olive: 'banyan', redwood: 'digital' };
  return TREE_ART[aliases[treeType] || treeType];
}
export function masteryStageLabel(treeType, stageLabel, masteredChapters) {
  return treeArt(treeType) && masteredChapters > 0 ? 'Fully grown' : stageLabel;
}
const OAK_FRUIT_CENTERS = [
  [0.253, 0.590], [0.731, 0.625], [0.319, 0.477],
  [0.602, 0.343], [0.407, 0.410], [0.675, 0.460],
  [0.246, 0.316], [0.775, 0.519], [0.172, 0.445],
];
export function masteryFruitRects(count, size, bakedOak = false) {
  const fruits = bakedOak ? [] : OAK_FRUIT_CENTERS.slice(0, count).map(([x, y]) => ({
    left: size * (x - 0.035), top: size * (y - 0.045), width: size * 0.07, height: size * 0.09,
  }));
  const extra = Math.max(0, count - 9);
  const columns = Math.max(5, Math.ceil(Math.sqrt(extra * 2.5)));
  const rows = Math.max(1, Math.ceil(extra / columns));
  const width = size * Math.min(0.055, Math.min(0.36 / columns * 0.85, 0.13 / rows * 0.65));
  for (let i = 0; i < extra; i++) {
    fruits.push({
      left: size * (0.32 + ((i % columns) + 0.5) / columns * 0.36) - width / 2,
      top: size * (0.09 + Math.floor(i / columns) / rows * 0.13),
      width, height: width * 167 / 122,
    });
  }
  return fruits;
}

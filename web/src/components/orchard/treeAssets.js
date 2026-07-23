// Knowledge Orchard — tree art asset pipeline.
//
// Drop your artwork into: web/public/assets/orchard/<treeType>/<stage>.<ext>
//   treeType: oak | crystal | cherry_blossom | banyan | digital | mango
//   stage:    seed | sprout | young_plant | growing_tree | mature_tree
//             | blossom | fruit | golden_fruit
//   ext:      png (preferred) or svg
//
// Example: web/public/assets/orchard/oak/growing_tree.png
//
// Until a file exists, <TreeSprite> renders a styled emoji placeholder so the
// UI is fully functional. No code changes are needed when you add real art —
// the component discovers the files automatically.

export const STAGES = [
  'seed',
  'sprout',
  'young_plant',
  'growing_tree',
  'mature_tree',
  'blossom',
  'fruit',
  'golden_fruit',
];

export const STAGE_LABEL = {
  seed: 'Seed',
  sprout: 'Sprout',
  young_plant: 'Young Plant',
  growing_tree: 'Growing Tree',
  mature_tree: 'Mature Tree',
  blossom: 'Blossom',
  fruit: 'Fruit',
  golden_fruit: 'Golden Fruit',
};

export const STAGE_EMOJI = {
  seed: '🌰',
  sprout: '🌱',
  young_plant: '🌿',
  growing_tree: '🌳',
  mature_tree: '🌲',
  blossom: '🌸',
  fruit: '🍎',
  golden_fruit: '✨',
};

// Fallback emoji per tree type (used by the placeholder).
export const TREE_TYPE_EMOJI = {
  oak: '🌳',
  crystal: '🌲',
  cherry_blossom: '🌸',
  banyan: '🌳',
  digital: '🌲',
  mango: '🌴',
};

const PUBLIC_URL = (typeof process !== 'undefined' && process.env && process.env.PUBLIC_URL) || '';

// Ordered list of candidate URLs to try for a given tree + stage.
export function treeAssetCandidates(treeType, stage) {
  const t = String(treeType || 'oak');
  const s = String(stage || 'seed');
  const base = `${PUBLIC_URL}/assets/orchard/${t}`;
  return [`${base}/${s}.png`, `${base}/${s}.svg`, `${base}/${s}.webp`];
}

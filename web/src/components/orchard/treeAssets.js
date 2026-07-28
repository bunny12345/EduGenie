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

// The tree is "alive": its face/mood changes with how well it is cared for.
// Moods map directly to the tree's health (+ a celebration mood at golden).
//   happy   → healthy & growing (well watered, tasks done)
//   sad     → thirsty / falling behind (needs attention)
//   sleepy  → wilting / neglected a long time
//   excited → celebration (golden fruit / just mastered)
export const MOODS = ['happy', 'sad', 'sleepy', 'excited'];

export const MOOD_EMOJI = {
  happy: '😊',
  sad: '😟',
  sleepy: '😴',
  excited: '🤩',
};

// Pick the tree's mood from its stage + health.
export function moodForState(stage, health) {
  if (String(stage) === 'golden_fruit') return 'excited';
  if (health === 'wilting') return 'sleepy';
  if (health === 'thirsty') return 'sad';
  return 'happy';
}

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

// Ordered list of candidate URLs to try for a given tree + stage + mood.
// Mood-specific art (e.g. mature_tree.sad.png) is tried first; if the artist
// hasn't drawn that mood yet, it falls back to the plain stage image
// (mature_tree.png) so nothing ever breaks. Delivery can be fully incremental.
export function treeAssetCandidates(treeType, stage, mood) {
  const t = String(treeType || 'oak');
  const s = String(stage || 'seed');
  const m = String(mood || 'happy');
  const base = `${PUBLIC_URL}/assets/orchard/${t}`;
  const out = [];
  if (m && m !== 'happy') {
    // Try the specific mood art first (all extensions).
    out.push(`${base}/${s}.${m}.png`, `${base}/${s}.${m}.svg`, `${base}/${s}.${m}.webp`);
  }
  // 'happy' is the default look, so it may be delivered either as the plain
  // stage file OR an explicit .happy file — try both.
  out.push(`${base}/${s}.happy.png`, `${base}/${s}.happy.svg`, `${base}/${s}.happy.webp`);
  out.push(`${base}/${s}.png`, `${base}/${s}.svg`, `${base}/${s}.webp`);
  return out;
}

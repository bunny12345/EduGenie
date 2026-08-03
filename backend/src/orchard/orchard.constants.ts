// The Knowledge Orchard — shared growth-engine configuration.
// Pure data + helpers so the service and any seeding scripts stay consistent.

export type StageKey =
  | 'seed'
  | 'sprout'
  | 'young_plant'
  | 'growing_tree'
  | 'mature_tree'
  | 'blossom'
  | 'fruit'
  | 'golden_fruit';

export const STAGES: StageKey[] = [
  'seed',
  'sprout',
  'young_plant',
  'growing_tree',
  'mature_tree',
  'blossom',
  'fruit',
  'golden_fruit',
];

export const STAGE_INDEX: Record<StageKey, number> = STAGES.reduce((acc, s, i) => {
  acc[s] = i;
  return acc;
}, {} as Record<StageKey, number>);

export const STAGE_LABEL: Record<StageKey, string> = {
  seed: 'Seed',
  sprout: 'Sprout',
  young_plant: 'Young Plant',
  growing_tree: 'Growing Tree',
  mature_tree: 'Mature Tree',
  blossom: 'Blossom',
  fruit: 'Fruit',
  golden_fruit: 'Golden Fruit',
};

export const STAGE_EMOJI: Record<StageKey, string> = {
  seed: '🌰',
  sprout: '🌱',
  young_plant: '🌿',
  growing_tree: '🌳',
  mature_tree: '🌲',
  blossom: '🌸',
  fruit: '🍎',
  golden_fruit: '✨',
};

// Milestone flags recorded per chapter. Grouped by the stage they unlock.
export interface Milestones {
  // Sprout
  lesson_watched?: boolean;
  question_asked?: boolean; // at least one meaningful question
  story_done?: boolean;
  // Young plant
  homework?: boolean;
  quiz?: boolean;
  flashcards?: boolean;
  // Growing tree
  active_recall?: boolean;
  explain_back?: boolean;
  memory_challenge?: boolean;
  // Mature tree
  word_problems?: boolean;
  real_life?: boolean;
  projects?: boolean;
  // Retention (set by spaced-repetition reviews)
  week_retention?: boolean;
  month_retention?: boolean;
}

// Which milestones are required to reach each stage (all must be true).
export const STAGE_REQUIREMENTS: Record<StageKey, (keyof Milestones)[]> = {
  seed: [],
  sprout: ['lesson_watched', 'question_asked', 'story_done'],
  young_plant: ['homework', 'quiz', 'flashcards'],
  growing_tree: ['active_recall', 'explain_back', 'memory_challenge'],
  mature_tree: ['word_problems', 'real_life', 'projects'],
  blossom: ['week_retention'],
  fruit: ['month_retention'],
  golden_fruit: [], // requires fruit + high roots (handled in engine)
};

export const GOLDEN_ROOTS_THRESHOLD = 90;

// Activity types accepted by the growth engine and their resource effects.
// water/sunlight/fertilizer are added to the tree's rolling meters. Each
// activity may also mark one or more milestones.
export interface ActivityEffect {
  water: number;
  sunlight: number;
  fertilizer: number;
  milestones: (keyof Milestones)[];
  roots: number; // roots (understanding) delta for the chapter
}

export const ACTIVITY_EFFECTS: Record<string, ActivityEffect> = {
  lesson: { water: 1, sunlight: 0, fertilizer: 0, milestones: ['lesson_watched'], roots: 2 },
  question: { water: 0, sunlight: 0, fertilizer: 2, milestones: ['question_asked'], roots: 1 },
  story: { water: 1, sunlight: 0, fertilizer: 0, milestones: ['story_done'], roots: 1 },
  homework: { water: 1, sunlight: 1, fertilizer: 0, milestones: ['homework'], roots: 3 },
  quiz: { water: 1, sunlight: 2, fertilizer: 0, milestones: ['quiz'], roots: 3 },
  flashcards: { water: 1, sunlight: 1, fertilizer: 0, milestones: ['flashcards'], roots: 3 },
  revision: { water: 2, sunlight: 1, fertilizer: 0, milestones: [], roots: 4 },
  mock_test: { water: 3, sunlight: 3, fertilizer: 0, milestones: [], roots: 5 },
  active_recall: { water: 1, sunlight: 2, fertilizer: 1, milestones: ['active_recall'], roots: 6 },
  explain_back: { water: 4, sunlight: 3, fertilizer: 1, milestones: ['explain_back'], roots: 8 }, // "Teaching AI" 💧x4
  memory_challenge: { water: 1, sunlight: 2, fertilizer: 0, milestones: ['memory_challenge'], roots: 6 },
  word_problem: { water: 1, sunlight: 1, fertilizer: 1, milestones: ['word_problems'], roots: 4 },
  real_life: { water: 1, sunlight: 1, fertilizer: 2, milestones: ['real_life'], roots: 4 },
  project: { water: 2, sunlight: 1, fertilizer: 1, milestones: ['projects'], roots: 5 },
  review: { water: 1, sunlight: 1, fertilizer: 0, milestones: [], roots: 2 },
};

// Season by calendar month (Northern-hemisphere school year vibe from the spec).
export function seasonForDate(d: Date): 'spring' | 'summer' | 'autumn' | 'winter' {
  const m = d.getMonth(); // 0-11
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 9) return 'autumn';
  return 'winter';
}

// Default number of chapters (seeds) per subject tree when none are defined.
export const DEFAULT_CHAPTERS_PER_SUBJECT = 18;

// Subject catalog fallback (used when the DB catalog is empty, e.g. mock mode).
export interface SubjectCatalogEntry {
  subject_key: string;
  display_name: string;
  tree_type: string;
  fruit_type: string;
  fruit_emoji: string;
  tree_emoji: string;
  accent_color: string;
  order_index: number;
}

export const SUBJECT_CATALOG: SubjectCatalogEntry[] = [
  { subject_key: 'mathematics', display_name: 'Mathematics', tree_type: 'oak', fruit_type: 'golden_apple', fruit_emoji: '🍎', tree_emoji: '🌳', accent_color: '#7c3aed', order_index: 1 },
  { subject_key: 'science', display_name: 'Science', tree_type: 'crystal', fruit_type: 'blue_crystal', fruit_emoji: '💎', tree_emoji: '🌲', accent_color: '#0ea5e9', order_index: 2 },
  { subject_key: 'english', display_name: 'English', tree_type: 'cherry_blossom', fruit_type: 'pink_cherry', fruit_emoji: '🍒', tree_emoji: '🌸', accent_color: '#ec4899', order_index: 3 },
  { subject_key: 'social', display_name: 'Social Studies', tree_type: 'banyan', fruit_type: 'wisdom_fruit', fruit_emoji: '🟠', tree_emoji: '🌳', accent_color: '#f59e0b', order_index: 4 },
  { subject_key: 'computer', display_name: 'Computer', tree_type: 'digital', fruit_type: 'pixel_fruit', fruit_emoji: '🟢', tree_emoji: '🌲', accent_color: '#10b981', order_index: 5 },
  { subject_key: 'hindi', display_name: 'Hindi', tree_type: 'mango', fruit_type: 'mango', fruit_emoji: '🥭', tree_emoji: '🌳', accent_color: '#eab308', order_index: 6 },
];

export const SUBJECT_BY_KEY: Record<string, SubjectCatalogEntry> = SUBJECT_CATALOG.reduce((acc, s) => {
  acc[s.subject_key] = s;
  return acc;
}, {} as Record<string, SubjectCatalogEntry>);

// Turn any free-text subject name into a stable, url-safe key (e.g. "Biology" →
// "biology", "Political Science" → "political_science"). Used for subjects that
// are not part of the fixed base catalog so every registered subject still gets
// a consistent key across homework, tests, orchard trees and games.
export function slugifySubject(raw?: string): string {
  return (
    String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'subject'
  );
}

// Prettify a subject key back into a human display name ("political_science" →
// "Political Science"). Used as a fallback display name for dynamic subjects.
export function prettifySubjectName(key?: string): string {
  const words = String(key || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(' ') || 'Subject';
}

// Map free-text subject names (from homework/tests/curriculum) to a canonical
// key. Base subjects map to the fixed catalog; anything else (Biology, Physics,
// Chemistry, Sanskrit, …) becomes its own dynamic subject key so a teacher who
// registers that subject shows up with every feature instead of being dropped.
export function normalizeSubjectKey(raw?: string): string | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (/(math|maths|mathematics|algebra|geometry)/.test(s)) return 'mathematics';
  if (/(english|language arts|grammar)/.test(s)) return 'english';
  if (/(social|history|civics|geography|sst)/.test(s)) return 'social';
  if (/(computer|coding|cs|informatics|it)/.test(s)) return 'computer';
  if (/(hindi)/.test(s)) return 'hindi';
  if (/(science|evs)/.test(s)) return 'science';
  if (SUBJECT_BY_KEY[s]) return s;
  return slugifySubject(s);
}

// Deterministic visual palette for dynamically-registered subjects so each new
// subject gets a stable, distinct tree look without needing a catalog row.
const DYNAMIC_SUBJECT_PALETTE: Array<Pick<SubjectCatalogEntry, 'tree_type' | 'fruit_type' | 'fruit_emoji' | 'tree_emoji' | 'accent_color'>> = [
  { tree_type: 'willow', fruit_type: 'berry', fruit_emoji: '🫐', tree_emoji: '🌳', accent_color: '#2563eb' },
  { tree_type: 'maple', fruit_type: 'peach', fruit_emoji: '🍑', tree_emoji: '🍁', accent_color: '#db2777' },
  { tree_type: 'pine', fruit_type: 'plum', fruit_emoji: '🍇', tree_emoji: '🌲', accent_color: '#7c3aed' },
  { tree_type: 'palm', fruit_type: 'coconut', fruit_emoji: '🥥', tree_emoji: '🌴', accent_color: '#0d9488' },
  { tree_type: 'olive', fruit_type: 'lemon', fruit_emoji: '🍋', tree_emoji: '🌳', accent_color: '#65a30d' },
  { tree_type: 'redwood', fruit_type: 'green_apple', fruit_emoji: '🍏', tree_emoji: '🌲', accent_color: '#0891b2' },
];

function hashSubjectKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Resolve a subject catalog entry for ANY key. Returns the fixed base-catalog
// entry when the key is one of the built-ins, otherwise synthesizes a stable
// dynamic entry so newly-registered subjects render everywhere (orchard trees,
// progress cards, games) without a DB catalog row.
export function subjectEntryFor(subjectKey: string, displayName?: string): SubjectCatalogEntry {
  if (SUBJECT_BY_KEY[subjectKey]) return SUBJECT_BY_KEY[subjectKey];
  const palette = DYNAMIC_SUBJECT_PALETTE[hashSubjectKey(subjectKey) % DYNAMIC_SUBJECT_PALETTE.length];
  return {
    subject_key: subjectKey,
    display_name: displayName && displayName.trim() ? displayName.trim() : prettifySubjectName(subjectKey),
    order_index: 100 + (hashSubjectKey(subjectKey) % 100),
    ...palette,
  };
}

// Compute the growth stage from a chapter's milestones + roots.
export function computeStage(milestones: Milestones, rootsPct: number): { stage: StageKey; index: number } {
  let reached: StageKey = 'seed';
  for (const stage of STAGES) {
    if (stage === 'seed') {
      reached = 'seed';
      continue;
    }
    if (stage === 'golden_fruit') {
      // Requires fruit already reached + very deep roots.
      const fruitReached = STAGE_INDEX[reached] >= STAGE_INDEX['fruit'];
      if (fruitReached && rootsPct >= GOLDEN_ROOTS_THRESHOLD) reached = 'golden_fruit';
      continue;
    }
    const reqs = STAGE_REQUIREMENTS[stage];
    const ok = reqs.every((k) => Boolean(milestones[k]));
    if (ok) reached = stage;
    else break; // stages are strictly sequential
  }
  return { stage: reached, index: STAGE_INDEX[reached] };
}

// Tree-level growth: the subject tree advances purely by how many of its
// chapters the student has FINISHED, regardless of the subject's total chapter
// count. This keeps the model simple ("one tree per subject that grows as you
// complete chapters") and works for any number of chapters. The final
// golden-fruit stage is reserved for finishing EVERY chapter in the subject.
export function treeStageFromCompletion(completed: number, total: number): { stage: StageKey; index: number } {
  if (!total || total <= 0 || completed <= 0) {
    return { stage: 'seed', index: 0 };
  }
  if (completed >= total) {
    return { stage: 'golden_fruit', index: STAGE_INDEX['golden_fruit'] };
  }
  // Spread partial progress across the six middle stages (sprout → fruit) so
  // the very first finished chapter already shows visible growth, and 'fruit'
  // only appears when nearly all chapters are done. 'golden_fruit' is never
  // reached here — only at 100% completion above.
  const fraction = completed / total; // 0 < fraction < 1
  const idx = Math.min(STAGE_INDEX['fruit'], Math.max(1, Math.ceil(fraction * 6)));
  return { stage: STAGES[idx], index: idx };
}

export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function healthFromWater(waterPct: number): 'healthy' | 'thirsty' | 'wilting' {
  if (waterPct >= 50) return 'healthy';
  if (waterPct >= 20) return 'thirsty';
  return 'wilting';
}

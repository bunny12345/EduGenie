/*
 * Learning Games — shared constants & spaced-repetition helpers.
 *
 * The GAME_CATALOG is intentionally data-driven so new games slot in without
 * touching the player logic. Each entry describes how a game surfaces in the
 * arcade hub (title, tagline, icon, accent) and whether it's live yet.
 */

export interface GameCatalogEntry {
  gameKey: string;
  title: string;
  tagline: string;
  icon: string;
  accent: string;
  status: 'live' | 'soon';
  order: number;
}

// The arcade line-up. Flashcards ships now; the rest are teasers so the hub
// already looks like a growing collection (and reserves the keys for later).
export const GAME_CATALOG: GameCatalogEntry[] = [
  {
    gameKey: 'flashcards',
    title: 'AI Flashcards',
    tagline: 'Flip smart cards that come back right when you need them.',
    icon: '🃏',
    accent: '#6d5efc',
    status: 'live',
    order: 1,
  },
  {
    gameKey: 'quiz_rush',
    title: 'Quiz Rush',
    tagline: 'Beat the clock with rapid-fire questions.',
    icon: '⚡',
    accent: '#f59e0b',
    status: 'live',
    order: 2,
  },
  {
    gameKey: 'match_up',
    title: 'Match Up',
    tagline: 'Pair terms with meanings before the board clears.',
    icon: '🧩',
    accent: '#0ea5e9',
    status: 'soon',
    order: 3,
  },
  {
    gameKey: 'memory_maze',
    title: 'Memory Maze',
    tagline: 'Flip-and-remember challenge for tricky concepts.',
    icon: '🌀',
    accent: '#ec4899',
    status: 'soon',
    order: 4,
  },
];

// ─── Spaced repetition (Leitner-style) ──────────────────────────────────────
// box 0 = brand new (due immediately). A correct answer promotes the card to the
// next box; the box picks how many days until it's shown again. This matches the
// requested 1 → 3 → 7 → 14 → 30 day ladder. A miss sends the card back to box 0
// so it resurfaces this session.
export const SRS_INTERVALS_DAYS = [1, 3, 7, 14, 30]; // box 1..5
export const SRS_MAX_BOX = SRS_INTERVALS_DAYS.length; // 5

export type ReviewRating = 'again' | 'good' | 'easy';

export interface SrsState {
  box: number;
  intervalDays: number;
  dueAt: string;      // ISO
  streak: number;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Compute the next spaced-repetition schedule for a card given the current box
 * and the student's self-rating.
 *  - 'again' → reset to box 0, due now (re-queued within the session).
 *  - 'good'  → advance one box.
 *  - 'easy'  → jump two boxes (skip ahead faster).
 */
export function nextSrsState(currentBox: number, rating: ReviewRating, now: number = Date.now()): SrsState {
  const box0 = Number.isFinite(currentBox) ? Math.max(0, Math.min(SRS_MAX_BOX, currentBox)) : 0;

  if (rating === 'again') {
    return { box: 0, intervalDays: 0, dueAt: new Date(now).toISOString(), streak: 0 };
  }

  const step = rating === 'easy' ? 2 : 1;
  const box = Math.max(1, Math.min(SRS_MAX_BOX, box0 + step));
  const intervalDays = SRS_INTERVALS_DAYS[box - 1];
  return {
    box,
    intervalDays,
    dueAt: new Date(now + intervalDays * DAY_MS).toISOString(),
    streak: 0, // caller increments its own running streak
  };
}

/** A human label for how far out a card is scheduled (for nice UI copy). */
export function scheduleLabel(intervalDays: number): string {
  if (!intervalDays || intervalDays <= 0) return 'again soon';
  if (intervalDays === 1) return 'tomorrow';
  if (intervalDays < 7) return `in ${intervalDays} days`;
  if (intervalDays === 7) return 'in 1 week';
  if (intervalDays < 30) return `in ${Math.round(intervalDays / 7)} weeks`;
  return 'in 1 month';
}

/** Turn a chapter title into a stable slug for deck_key. */
export function slugify(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'chapter';
}

export function deckKey(subjectKey: string, className: string | null | undefined, chapterTitle: string): string {
  return `${subjectKey}:${(className || 'any').toLowerCase().replace(/\s+/g, '')}:${slugify(chapterTitle)}`;
}

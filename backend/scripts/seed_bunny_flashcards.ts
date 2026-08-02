/*
 * Seed AI Flashcards for Bunny's Mathematics chapters (Class 9).
 *
 * Creates one flashcard deck per selected chapter (linked to the real
 * orchard_chapters rows seeded by seed_bunny_math.ts) and fills each with
 * curated Q/A cards. This mirrors what the auto-generator produces on lesson
 * upload, but is deterministic so the game always has content to demo — and it
 * costs zero LLM tokens.
 *
 * Run:   npx ts-node --transpile-only scripts/seed_bunny_flashcards.ts
 * Reset: npx ts-node --transpile-only scripts/seed_bunny_flashcards.ts --reset
 */

require('dotenv').config();

import { SupabaseService } from '../src/supabase.service';

const BUNNY = 'f83c44fc-d57f-48f9-9552-2ccfee4f4aed';
const SUBJECT = 'mathematics';

function slugify(raw: string): string {
  return (
    String(raw || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'chapter'
  );
}
function deckKey(subjectKey: string, className: string | null, chapterTitle: string): string {
  return `${subjectKey}:${(className || 'any').toLowerCase().replace(/\s+/g, '')}:${slugify(chapterTitle)}`;
}

type Card = { front: string; back: string; hint?: string; difficulty?: 'easy' | 'medium' | 'hard' };

// Curated cards keyed by chapter title (must match orchard_chapters titles).
const CARDS_BY_CHAPTER: Record<string, Card[]> = {
  'Number Systems': [
    { front: 'What is a rational number?', back: 'A number that can be written as p/q where p and q are integers and q ≠ 0.', difficulty: 'easy' },
    { front: 'Give an example of an irrational number.', back: '√2 (or π). It cannot be written as a simple fraction and has a non-terminating, non-repeating decimal.', difficulty: 'easy' },
    { front: 'What kind of decimal expansion does a rational number have?', back: 'Either terminating, or non-terminating but recurring (repeating).', hint: 'Think 1/2 vs 1/3', difficulty: 'medium' },
    { front: 'Are all integers rational numbers?', back: 'Yes. Every integer n can be written as n/1, so it is rational.', difficulty: 'easy' },
    { front: 'What is the rationalising factor of (√5 + 2)?', back: '(√5 − 2). Multiplying by the conjugate removes the surd from the denominator.', difficulty: 'hard' },
    { front: 'Simplify: √2 × √8', back: '√16 = 4.', difficulty: 'medium' },
  ],
  'Polynomials': [
    { front: 'What is the degree of the polynomial 4x³ + 2x + 7?', back: '3 — the highest power of the variable.', difficulty: 'easy' },
    { front: 'State the Factor Theorem.', back: '(x − a) is a factor of p(x) if and only if p(a) = 0.', difficulty: 'medium' },
    { front: 'What does the Remainder Theorem say?', back: 'When p(x) is divided by (x − a), the remainder is p(a).', difficulty: 'medium' },
    { front: 'What is a zero of a polynomial?', back: 'A value of x for which the polynomial evaluates to 0.', difficulty: 'easy' },
    { front: 'Expand (a + b)².', back: 'a² + 2ab + b².', hint: 'A standard identity', difficulty: 'easy' },
    { front: 'Factorise x² − 9.', back: '(x − 3)(x + 3) — a difference of squares.', difficulty: 'medium' },
  ],
  'Coordinate Geometry': [
    { front: 'What are the coordinates of the origin?', back: '(0, 0).', difficulty: 'easy' },
    { front: 'In which quadrant is the point (−3, 5)?', back: 'The second quadrant (x negative, y positive).', difficulty: 'easy' },
    { front: 'What is the x-coordinate called?', back: 'The abscissa.', hint: 'The y-coordinate is the ordinate', difficulty: 'medium' },
    { front: 'On which axis does the point (0, 7) lie?', back: 'The y-axis, because its x-coordinate is 0.', difficulty: 'easy' },
    { front: 'What are the sign conventions in the third quadrant?', back: 'Both coordinates are negative: (−, −).', difficulty: 'medium' },
  ],
  'Linear Equations in Two Variables': [
    { front: 'What is the general form of a linear equation in two variables?', back: 'ax + by + c = 0, where a and b are not both zero.', difficulty: 'easy' },
    { front: 'How many solutions does a linear equation in two variables have?', back: 'Infinitely many — its graph is a straight line.', difficulty: 'medium' },
    { front: 'What does the graph of x = 4 look like?', back: 'A vertical line parallel to the y-axis passing through x = 4.', difficulty: 'medium' },
    { front: 'Is (2, 0) a solution of x + y = 2?', back: 'Yes, because 2 + 0 = 2.', difficulty: 'easy' },
    { front: 'What is the graph of a linear equation in two variables?', back: 'A straight line.', difficulty: 'easy' },
  ],
  'Lines and Angles': [
    { front: 'What do angles on a straight line add up to?', back: '180° (they are supplementary / a linear pair).', difficulty: 'easy' },
    { front: 'What is the sum of angles around a point?', back: '360°.', difficulty: 'easy' },
    { front: 'What are vertically opposite angles?', back: 'Angles opposite each other when two lines cross — they are equal.', difficulty: 'medium' },
    { front: 'When a transversal cuts parallel lines, what is true of alternate interior angles?', back: 'They are equal.', hint: 'Z-shape', difficulty: 'medium' },
    { front: 'What is the sum of the interior angles of a triangle?', back: '180°.', difficulty: 'easy' },
  ],
  'Triangles': [
    { front: 'State the SAS congruence rule.', back: 'Two triangles are congruent if two sides and the included angle of one equal those of the other.', difficulty: 'medium' },
    { front: 'What does "congruent" mean for two triangles?', back: 'They are exactly the same shape and size — all corresponding sides and angles are equal.', difficulty: 'easy' },
    { front: 'In an isosceles triangle, which angles are equal?', back: 'The angles opposite the two equal sides (the base angles).', difficulty: 'medium' },
    { front: 'What is the ASA congruence rule?', back: 'Two triangles are congruent if two angles and the included side of one equal those of the other.', difficulty: 'medium' },
    { front: 'Which is the longest side in a triangle?', back: 'The side opposite the largest angle.', difficulty: 'hard' },
  ],
};

async function main() {
  const reset = process.argv.includes('--reset');
  const hasRealSupabase =
    !!process.env.SUPABASE_URL && !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  if (!hasRealSupabase) {
    console.error('Refusing to seed: Supabase env not set (MOCK mode). Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env.');
    process.exit(1);
  }
  const db = new SupabaseService();

  // Resolve Bunny's class for the deck_key (falls back to Class 9).
  let className = 'Class 9';
  try {
    const sRes = await db.client.from('students').select('*').eq('id', BUNNY).limit(1);
    const student = ((sRes && (sRes as any).data) || [])[0];
    if (student && student.class_name) className = String(student.class_name);
  } catch { /* keep default */ }

  // Map chapter titles → orchard_chapters rows for chapter_id linkage.
  const chRes = await db.client.from('orchard_chapters').select('*').eq('subject_key', SUBJECT);
  const chapters = ((chRes && (chRes as any).data) || []) as any[];
  const chapterByTitle = new Map<string, any>();
  for (const c of chapters) chapterByTitle.set(String(c.title), c);

  let deckCount = 0;
  let cardCount = 0;

  for (const [title, cards] of Object.entries(CARDS_BY_CHAPTER)) {
    const key = deckKey(SUBJECT, className, title);
    const chapter = chapterByTitle.get(title) || null;

    // Find or create the deck.
    let deck: any = null;
    try {
      const dRes = await db.client.from('flashcard_decks').select('*').eq('deck_key', key).limit(1);
      deck = ((dRes && (dRes as any).data) || [])[0] || null;
    } catch { /* ignore */ }

    if (deck && reset) {
      // Clear existing cards so we can re-seed cleanly.
      try { await db.client.from('flashcards').delete().eq('deck_id', deck.id); } catch {}
    }

    if (!deck) {
      const insRes = await db.client
        .from('flashcard_decks')
        .insert([
          {
            deck_key: key,
            subject_key: SUBJECT,
            class_name: className,
            chapter_id: chapter ? chapter.id : null,
            chapter_number: chapter ? Number(chapter.chapter_number || 0) : 0,
            chapter_title: title,
            source: 'seed',
            card_count: 0,
            generated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .select('*');
      deck = (((insRes as any) || {}).data || [])[0];
    }
    if (!deck) {
      console.warn(`Could not create deck for "${title}" — skipping.`);
      continue;
    }
    deckCount += 1;

    // Skip if already populated (idempotent) unless resetting.
    let existingCards: any[] = [];
    try {
      const cRes = await db.client.from('flashcards').select('id').eq('deck_id', deck.id);
      existingCards = ((cRes && (cRes as any).data) || []) as any[];
    } catch { /* ignore */ }
    if (existingCards.length && !reset) {
      console.log(`Deck "${title}" already has ${existingCards.length} cards — skipping.`);
      continue;
    }

    let order = 0;
    for (const card of cards) {
      order += 1;
      await db.client.from('flashcards').insert([
        {
          deck_id: deck.id,
          subject_key: SUBJECT,
          class_name: className,
          chapter_id: chapter ? chapter.id : null,
          chapter_number: chapter ? Number(chapter.chapter_number || 0) : 0,
          chapter_title: title,
          front: card.front,
          back: card.back,
          hint: card.hint || null,
          difficulty: card.difficulty || 'medium',
          order_index: order,
          source: 'seed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      cardCount += 1;
    }
    await db.client
      .from('flashcard_decks')
      .update({ card_count: cards.length, generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', deck.id);
    console.log(`Seeded "${title}" → ${cards.length} cards${chapter ? ' (linked to chapter)' : ''}.`);
  }

  console.log(`\nDone. ${deckCount} decks, ${cardCount} cards for Bunny (${className}).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

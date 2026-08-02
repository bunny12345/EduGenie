require('dotenv').config();
import { SupabaseService } from '../src/supabase.service';
import { LlmService } from '../src/llm/llm.service';
import { OrchardService } from '../src/orchard/orchard.service';
import { LocalFeedService } from '../src/shared/local-feed.service';
import { FlashcardsService } from '../src/games/flashcards.service';

/**
 * Rebuilds the flashcard decks so they come ONLY from real uploaded chapters.
 * 1. Removes every curated "seed" deck (and its cards/progress) that isn't tied
 *    to an actual uploaded lesson.
 * 2. Generates decks from the real Mathematics lessons that have content chunks.
 */
(async () => {
  const db = new SupabaseService();
  const llm = new LlmService();
  const orchard = new OrchardService(db);
  const localFeed = new LocalFeedService();
  const svc = new FlashcardsService(db, llm, orchard, localFeed);

  // ── 1. purge seed decks (no lesson_id / source=seed) ───────────────────────
  const decks = ((await db.client.from('flashcard_decks').select('*')).data as any[]) || [];
  const seedDecks = decks.filter((d) => d.source === 'seed' || !d.lesson_id);
  console.log(`Purging ${seedDecks.length} seed decks…`);
  for (const d of seedDecks) {
    await db.client.from('flashcard_progress').delete().eq('deck_id', d.id);
    await db.client.from('flashcards').delete().eq('deck_id', d.id);
    await db.client.from('flashcard_decks').delete().eq('id', d.id);
    console.log(`  removed: ${d.chapter_title}`);
  }

  // ── 2. generate decks from real uploaded lessons with content ──────────────
  // Only lessons with chunks; for duplicated Coordinate Geometry use the Class 9 row.
  const realLessons = [
    '28066c8a-f064-41d5-8016-b72bcf56d0ef', // Real Numbers (already exists, skip unless empty)
    '8df95cfb-89b0-490c-b45c-d66e7d834350', // POLYNOMIALS
    '067a4d3d-d7d2-4862-bdc7-cce700db7704', // Chapter 3 Coordinate Geometry (Class 9)
  ];
  for (const lessonId of realLessons) {
    const res = await svc.generateForLesson(lessonId, {});
    console.log(`generate ${lessonId}: ${JSON.stringify(res)}`);
    // Retry once if the small model returned nothing this pass.
    if (!res.success && res.reason === 'generation-empty') {
      const retry = await svc.generateForLesson(lessonId, { force: true });
      console.log(`  retry ${lessonId}: ${JSON.stringify(retry)}`);
    }
  }

  console.log('\nDone. Decks now reflect real uploaded chapters.');
  process.exit(0);
})();

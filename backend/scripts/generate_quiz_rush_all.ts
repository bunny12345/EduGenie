require('dotenv').config();
import { SupabaseService } from '../src/supabase.service';
import { LlmService } from '../src/llm/llm.service';
import { OrchardService } from '../src/orchard/orchard.service';
import { QuizRushService } from '../src/games/quiz-rush.service';

/**
 * One-off backfill: generate Quiz Rush questions for every already-uploaded
 * lesson that has content chunks but no quiz deck yet (new uploads generate
 * automatically via CurriculumService going forward).
 */
(async () => {
  const db = new SupabaseService();
  const llm = new LlmService();
  const orchard = new OrchardService(db);
  const svc = new QuizRushService(db, llm, orchard);

  const results = await svc.generateForAllLessons();
  console.log(`Quiz Rush backfill: generated=${results.generated} skipped=${results.skipped} failed=${results.failed}`);
  process.exit(0);
})().catch((e) => {
  console.error('Quiz Rush backfill failed:', e);
  process.exit(1);
});

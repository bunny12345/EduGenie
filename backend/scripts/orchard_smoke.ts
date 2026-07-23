/*
 * Orchard engine smoke test (mock mode).
 * Forces the file-backed mock Supabase client and drives the OrchardService
 * through a simulated multi-month learning journey to verify tree growth,
 * spaced-repetition reviews, and aggregate computation.
 *
 * Run: npx ts-node scripts/orchard_smoke.ts
 */

// Force mock mode BEFORE importing the service (constructor reads env).
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_ANON_KEY;

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Isolate the mock store in a temp dir so we don't pollute local-data.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orchard-smoke-'));
fs.mkdirSync(path.join(tmp, 'local-data'), { recursive: true });
process.chdir(tmp);

import { SupabaseService } from '../src/supabase.service';
import { OrchardService } from '../src/orchard/orchard.service';

function daysAgoIso(monthsBack: number, dayOffset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString();
}

async function main() {
  const db = new SupabaseService();
  console.log('mock mode:', (db.client as any).isMock === true);
  const svc = new OrchardService(db);
  const student = 'smoke-student-1';

  await svc.ensureOrchard(student);

  // Helper to push an activity for mathematics on the current "next" chapter.
  const act = (type: string, occurredAt: string, correct?: boolean) =>
    svc.recordActivity(student, { subjectKey: 'mathematics', activityType: type, correct, occurredAt });

  // ── Month -3: start chapter → sprout ─────────────────────────────────────
  await act('lesson', daysAgoIso(3, 0));
  await act('question', daysAgoIso(3, 0), true);
  await act('story', daysAgoIso(3, 1));

  // ── Month -3 later: young_plant ──────────────────────────────────────────
  await act('homework', daysAgoIso(3, 3), true);
  await act('quiz', daysAgoIso(3, 4), true);
  await act('flashcards', daysAgoIso(3, 5));

  // ── Month -2: growing_tree ───────────────────────────────────────────────
  await act('active_recall', daysAgoIso(2, 0), true);
  await act('explain_back', daysAgoIso(2, 1), true);
  await act('memory_challenge', daysAgoIso(2, 2), true);

  // ── Month -2 later: mature_tree (schedules week+month reviews) ───────────
  await act('word_problem', daysAgoIso(2, 5), true);
  await act('real_life', daysAgoIso(2, 6));
  await act('project', daysAgoIso(2, 7));

  // Find the chapter we grew (the first one).
  const treeBefore = await svc.getTree(student, 'mathematics');
  const grown = treeBefore.chapters.find((c: any) => c.stageIndex >= 4);
  console.log('\nAfter mature milestones, lead chapter stage:', grown && grown.stage, 'roots:', grown && grown.rootsPct);

  // ── Week retention review passes → blossom ───────────────────────────────
  await svc.completeReview(student, { chapterId: grown.chapterId, reviewType: 'week', passed: true, occurredAt: daysAgoIso(1, 20) });
  let t = await svc.getTree(student, 'mathematics');
  let ch = t.chapters.find((c: any) => c.chapterId === grown.chapterId);
  console.log('After week review:', ch.stage, 'roots:', ch.rootsPct);

  // ── Month retention review passes → fruit / golden ───────────────────────
  await svc.completeReview(student, { chapterId: grown.chapterId, reviewType: 'month', passed: true, occurredAt: daysAgoIso(0, -1) });
  // Add extra recall to push roots >= 90 for golden fruit.
  await act('explain_back', daysAgoIso(0, -1), true);
  await act('memory_challenge', daysAgoIso(0, 0), true);
  t = await svc.getTree(student, 'mathematics');
  ch = t.chapters.find((c: any) => c.chapterId === grown.chapterId);
  console.log('After month review:', ch.stage, 'roots:', ch.rootsPct, 'golden:', ch.isGolden);

  // ── Overview ─────────────────────────────────────────────────────────────
  const overview = await svc.getOrchard(student);
  console.log('\n=== ORCHARD OVERVIEW ===');
  console.log('profile:', overview.profile);
  console.log('overallProgress:', overview.overallProgress);
  for (const tr of overview.trees) {
    console.log(
      `  ${tr.subject.padEnd(15)} stage=${tr.stageLabel.padEnd(12)} L${tr.level}/${tr.maxLevel} ` +
        `chapters=${tr.completedChapters}/${tr.totalChapters} progress=${tr.progressPct}% ` +
        `roots=${tr.rootsPct}% water=${tr.waterPct}% sun=${tr.sunlightPct}% fert=${tr.fertilizerPct}% health=${tr.health}`,
    );
  }

  const math = overview.trees.find((x: any) => x.subjectKey === 'mathematics');
  const ok = math && math.completedChapters >= 1 && ch.stage && ['fruit', 'golden_fruit'].includes(ch.stage);
  console.log('\nSMOKE RESULT:', ok ? 'PASS ✅' : 'FAIL ❌');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error', e);
  process.exit(1);
});

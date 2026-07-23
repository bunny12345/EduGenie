/*
 * Phase 7 — Seed Bunny's Mathematics orchard with month-wise growth data.
 *
 * Targets ONE student (Bunny, Class 9) and ONE subject (Mathematics) so we can
 * visually verify the tree growing across months. Writes chapter growth states,
 * backdated activity history, spaced-repetition reviews, and profile currencies
 * into the SAME Supabase the app reads, then refreshes the tree aggregate using
 * the real engine formula (OrchardService.recomputeSubject).
 *
 * Run: npx ts-node --transpile-only scripts/seed_bunny_math.ts
 * Reset first: npx ts-node --transpile-only scripts/seed_bunny_math.ts --reset
 */

require('dotenv').config();

import { SupabaseService } from '../src/supabase.service';
import { OrchardService } from '../src/orchard/orchard.service';
import { STAGES, STAGE_INDEX } from '../src/orchard/orchard.constants';

const BUNNY = 'f83c44fc-d57f-48f9-9552-2ccfee4f4aed';
const SUBJECT = 'mathematics';

// Chapter titles for a Class 9 Maths syllabus (18 chapters = 18 seeds).
const MATH_CHAPTERS = [
  'Number Systems',
  'Polynomials',
  'Coordinate Geometry',
  'Linear Equations in Two Variables',
  'Introduction to Euclid’s Geometry',
  'Lines and Angles',
  'Triangles',
  'Quadrilaterals',
  'Areas of Parallelograms & Triangles',
  'Circles',
  'Constructions',
  'Heron’s Formula',
  'Surface Areas and Volumes',
  'Statistics',
  'Probability',
  'Trigonometry Basics',
  'Mensuration',
  'Data Handling',
];

// Target growth stage per chapter — a showcase distribution across all stages.
// index: 0 seed .. 7 golden_fruit
const TARGETS: number[] = [
  7, 7, 7, // 3 golden fruits (fully mastered, months ago)
  6, 6, 6, // 3 fruits
  5, 5, // 2 blossoms
  4, 4, 4, // 3 mature trees
  3, 3, // 2 growing trees
  2, // 1 young plant
  1, // 1 sprout
  0, 0, 0, // 3 untouched seeds
];

// Roots (understanding %) that fits each stage.
const ROOTS_BY_INDEX = [4, 18, 38, 58, 72, 80, 88, 95];

// How many months back each chapter's journey began (older = more grown).
const MONTHS_BACK_BY_INDEX = [4.2, 3.6, 3.0, 2.6, 2.2, 1.9, 1.6, 1.3, 0.8, 0.3];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.round(days));
  return d.toISOString();
}

function milestonesForStage(targetIndex: number): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  if (targetIndex >= 1) {
    m.lesson_watched = true;
    m.question_asked = true;
    m.story_done = true;
  }
  if (targetIndex >= 2) {
    m.homework = true;
    m.quiz = true;
    m.flashcards = true;
  }
  if (targetIndex >= 3) {
    m.active_recall = true;
    m.explain_back = true;
    m.memory_challenge = true;
  }
  if (targetIndex >= 4) {
    m.word_problems = true;
    m.real_life = true;
    m.projects = true;
  }
  if (targetIndex >= 5) m.week_retention = true;   // blossom
  if (targetIndex >= 6) m.month_retention = true;  // fruit / golden
  return m;
}

// Representative activity log entries for a chapter's journey (backdated).
function activityRowsForChapter(chapterId: string, targetIndex: number, monthsBack: number) {
  if (targetIndex === 0) return [] as any[];
  const startDays = monthsBack * 30;
  const seq: Array<[string, number, number, number, number, boolean | null]> = [
    // type, dayOffsetFromStart, water, sunlight, fertilizer, correct
    ['lesson', 0, 1, 0, 0, null],
    ['question', 0, 0, 0, 2, true],
    ['story', 1, 1, 0, 0, null],
  ];
  if (targetIndex >= 2) {
    seq.push(['homework', 3, 1, 2, 0, true]);
    seq.push(['quiz', 4, 1, 3, 0, true]);
    seq.push(['flashcards', 5, 1, 1, 0, null]);
  }
  if (targetIndex >= 3) {
    seq.push(['active_recall', 8, 1, 3, 1, true]);
    seq.push(['explain_back', 10, 4, 3, 1, true]);
    seq.push(['memory_challenge', 12, 1, 3, 0, true]);
  }
  if (targetIndex >= 4) {
    seq.push(['word_problem', 15, 1, 2, 1, true]);
    seq.push(['real_life', 16, 1, 2, 2, null]);
    seq.push(['project', 18, 2, 1, 1, null]);
  }
  return seq.map(([type, off, w, s, f, correct]) => ({
    student_id: BUNNY,
    subject_key: SUBJECT,
    chapter_id: chapterId,
    activity_type: type,
    water: w,
    sunlight: s,
    fertilizer: f,
    correct: correct,
    occurred_at: isoDaysAgo(startDays - (off as number)),
    created_at: new Date().toISOString(),
  }));
}

// Recent "keep the tree healthy" activity so the water meter (trailing 14 days)
// shows the Mathematics tree as well cared-for right now.
function recentUpkeepRows(chapterIds: string[]) {
  const rows: any[] = [];
  const picks = chapterIds.slice(0, 4);
  const plan: Array<[string, number, number, number, number]> = [
    ['revision', 1, 2, 1, 0],
    ['homework', 2, 1, 2, 0],
    ['mock_test', 4, 3, 3, 0],
    ['question', 5, 0, 0, 2],
    ['flashcards', 7, 1, 1, 0],
    ['revision', 9, 2, 1, 0],
    ['active_recall', 11, 1, 2, 1],
  ];
  plan.forEach(([type, daysAgo, w, s, f], i) => {
    rows.push({
      student_id: BUNNY,
      subject_key: SUBJECT,
      chapter_id: picks[i % picks.length],
      activity_type: type,
      water: w,
      sunlight: s,
      fertilizer: f,
      correct: type === 'mock_test' ? true : null,
      occurred_at: isoDaysAgo(daysAgo),
      created_at: new Date().toISOString(),
    });
  });
  return rows;
}

function reviewRowsForChapter(chapterId: string, targetIndex: number, monthsBack: number) {
  if (targetIndex < 5) return [] as any[];
  const startDays = monthsBack * 30;
  const rows: any[] = [];
  // Week review passed (blossom+)
  rows.push({
    student_id: BUNNY,
    subject_key: SUBJECT,
    chapter_id: chapterId,
    review_type: 'week',
    scheduled_at: isoDaysAgo(startDays - 25),
    completed_at: isoDaysAgo(startDays - 26),
    passed: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (targetIndex >= 6) {
    // Month review passed (fruit / golden)
    rows.push({
      student_id: BUNNY,
      subject_key: SUBJECT,
      chapter_id: chapterId,
      review_type: 'month',
      scheduled_at: isoDaysAgo(Math.max(1, startDays - 50)),
      completed_at: isoDaysAgo(Math.max(0, startDays - 52)),
      passed: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

async function main() {
  const reset = process.argv.includes('--reset');
  const hasRealSupabase =
    !!process.env.SUPABASE_URL &&
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  if (!hasRealSupabase) {
    console.error('Refusing to seed: Supabase env not set (MOCK mode). Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env.');
    process.exit(1);
  }
  const db = new SupabaseService();
  const svc = new OrchardService(db);

  console.log('Ensuring Bunny orchard exists (creates trees + chapters)…');
  await svc.ensureOrchard(BUNNY);

  // Ensure the 18 Maths chapters have proper titles (ensureOrchard creates
  // generic "Chapter N" titles; upgrade them to real syllabus names).
  const chRes = await db.client.from('orchard_chapters').select('*').eq('subject_key', SUBJECT);
  let chapters = ((chRes && chRes.data) || []).sort(
    (a: any, b: any) => Number(a.order_index || a.chapter_number || 0) - Number(b.order_index || b.chapter_number || 0),
  );
  for (let i = 0; i < chapters.length && i < MATH_CHAPTERS.length; i++) {
    const ch = chapters[i];
    if (ch.title !== MATH_CHAPTERS[i]) {
      await db.client.from('orchard_chapters').update({ title: MATH_CHAPTERS[i] }).eq('id', ch.id);
      ch.title = MATH_CHAPTERS[i];
    }
  }

  if (reset) {
    console.log('Reset: clearing Bunny Mathematics activity/reviews and resetting chapter growth…');
    // Best-effort deletes (service role bypasses RLS).
    try { await db.client.from('orchard_activity').delete().eq('student_id', BUNNY).eq('subject_key', SUBJECT); } catch {}
    try { await db.client.from('orchard_reviews').delete().eq('student_id', BUNNY).eq('subject_key', SUBJECT); } catch {}
  }

  const activityRows: any[] = [];
  const reviewRows: any[] = [];

  console.log('Writing chapter growth states…');
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const targetIndex = TARGETS[i] ?? 0;
    const stage = STAGES[targetIndex];
    const roots = ROOTS_BY_INDEX[targetIndex];
    const monthsBack = MONTHS_BACK_BY_INDEX[i] ?? Math.max(0.2, 4 - i * 0.2);
    const milestones = milestonesForStage(targetIndex);
    const startIso = isoDaysAgo(monthsBack * 30);
    const isGolden = targetIndex >= 7;
    const fruitAt = targetIndex >= STAGE_INDEX['fruit'] ? isoDaysAgo(Math.max(0, monthsBack * 30 - 52)) : null;

    await db.client
      .from('chapter_growth')
      .update({
        stage,
        stage_index: targetIndex,
        roots_pct: roots,
        milestones,
        is_golden: isGolden,
        fruit_collected: isGolden,
        started_at: targetIndex > 0 ? startIso : null,
        stage_updated_at: startIso,
        fruit_at: fruitAt,
        updated_at: new Date().toISOString(),
      })
      .eq('student_id', BUNNY)
      .eq('chapter_id', ch.id);

    activityRows.push(...activityRowsForChapter(ch.id, targetIndex, monthsBack));
    reviewRows.push(...reviewRowsForChapter(ch.id, targetIndex, monthsBack));
  }

  // Recent upkeep so the tree looks healthy today.
  activityRows.push(...recentUpkeepRows(chapters.map((c: any) => c.id)));

  console.log(`Inserting ${activityRows.length} activity rows and ${reviewRows.length} review rows…`);
  if (activityRows.length) await db.client.from('orchard_activity').insert(activityRows);
  if (reviewRows.length) await db.client.from('orchard_reviews').insert(reviewRows);

  console.log('Recomputing Mathematics tree aggregate (real engine)…');
  const tree = await svc.recomputeSubject(BUNNY, SUBJECT);

  // Give Bunny some currencies + a streak so the header looks alive.
  await db.client
    .from('orchard_profile')
    .update({
      water_drops: 1250,
      sunshine: 850,
      gems: 32,
      day_streak: 15,
      companion_level: 12,
      companion_xp: 810,
      companion_xp_max: 1200,
      last_active_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    })
    .eq('student_id', BUNNY);

  // Report.
  const detail = await svc.getTree(BUNNY, SUBJECT);
  console.log('\n=== BUNNY · MATHEMATICS ===');
  console.log(
    `Tree: ${detail.tree.stageLabel} · L${detail.tree.level}/${detail.tree.maxLevel} · ` +
      `progress ${detail.tree.progressPct}% · roots ${detail.tree.rootsPct}% · health ${detail.tree.health} · ` +
      `chapters fruited ${detail.tree.completedChapters}/${detail.tree.totalChapters}`,
  );
  console.log('Chapters:');
  for (const c of detail.chapters) {
    console.log(`  Ch ${String(c.chapterNumber).padStart(2)} ${String(c.title).padEnd(38)} ${c.stageLabel.padEnd(12)} roots=${c.rootsPct}%${c.isGolden ? '  ✨GOLDEN' : ''}`);
  }
  console.log('\nDone. Log in as Bunny and open “My Orchard”. Tree used by getTree matches the app.');
  process.exit(0);
}

main().catch((e) => {
  console.error('seed error', e);
  process.exit(1);
});

/**
 * Orchard tree-art growth probe.
 *
 * Walks ONE subject (default: mathematics) for ONE student through every
 * growth stage using the real endpoints, and reports:
 *   - the per-chapter stage after each activity,
 *   - the subject tree stage shown on the orchard card,
 *   - whether the artwork file for each stage actually exists and is served.
 *
 * Usage:
 *   node scripts/orchard_growth_probe.js [studentId] [subjectKey]
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');

const API = process.env.PROBE_API || 'http://localhost:3000';
const WEB = process.env.PROBE_WEB || 'http://localhost:3001';
const STUDENT_ID = process.argv[2] || 'f83c44fc-d57f-48f9-9552-2ccfee4f4aed';
const SUBJECT = process.argv[3] || 'mathematics';

const secret = process.env.SUPABASE_JWT_SECRET;
if (!secret) {
  console.error('SUPABASE_JWT_SECRET missing');
  process.exit(2);
}
const TOKEN = jwt.sign({ sub: STUDENT_ID, role: 'student' }, secret, { expiresIn: '1h' });

const STAGES = [
  'seed', 'sprout', 'young_plant', 'growing_tree',
  'mature_tree', 'blossom', 'fruit', 'golden_fruit',
];

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 200)}`);
  return body;
}

const getTree = () => api(`/orchard/${SUBJECT}?studentId=${STUDENT_ID}`);
const getOrchard = () => api(`/orchard?studentId=${STUDENT_ID}`);

// Wipe the subject back to bare soil so the walk starts from "seed" and every
// stage transition can be observed. Only used when --reset is passed.
async function resetSubject(chapterIds) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY needed for --reset');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  const inList = `(${chapterIds.map((c) => `"${c}"`).join(',')})`;
  const del = async (table, query) => {
    const r = await fetch(`${url}/rest/v1/${table}?${query}`, { method: 'DELETE', headers });
    if (!r.ok && r.status !== 404) throw new Error(`${table} reset -> ${r.status} ${await r.text()}`);
  };
  await del('orchard_reviews', `student_id=eq.${STUDENT_ID}&chapter_id=in.${inList}`);
  await del('orchard_activity', `student_id=eq.${STUDENT_ID}&subject_key=eq.${SUBJECT}`);
  await del('chapter_growth', `student_id=eq.${STUDENT_ID}&chapter_id=in.${inList}`);
  await del('orchard_trees', `student_id=eq.${STUDENT_ID}&subject_key=eq.${SUBJECT}`);
}

async function activity(chapterId, activityType) {
  return api('/orchard/activity', {
    method: 'POST',
    body: JSON.stringify({ studentId: STUDENT_ID, subjectKey: SUBJECT, chapterId, activityType, correct: true }),
  });
}

async function review(chapterId, reviewType) {
  return api('/orchard/review/complete', {
    method: 'POST',
    body: JSON.stringify({ studentId: STUDENT_ID, chapterId, reviewType, passed: true }),
  });
}

async function chapterState(chapterId) {
  const t = await getTree();
  const ch = (t.chapters || []).find((c) => c.chapterId === chapterId);
  return { chapter: ch, tree: t.tree };
}

(async () => {
  console.log(`\n=== Orchard growth probe — student ${STUDENT_ID}, subject "${SUBJECT}" ===\n`);

  // ---------------------------------------------------------------- artwork
  console.log('1) Stage artwork is served by the web app');
  const missing = [];
  const detail0 = await getTree();
  const treeType = detail0.treeType;
  for (const stage of STAGES) {
    const url = `${WEB}/assets/orchard/${treeType}/${stage}.png`;
    let ok = false;
    let size = 0;
    try {
      const r = await fetch(url);
      const buf = Buffer.from(await r.arrayBuffer());
      size = buf.length;
      // CRA dev server answers 200 with index.html for unknown paths, so make
      // sure we actually received a PNG and not the SPA shell.
      ok = r.ok && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    } catch (e) {
      ok = false;
    }
    if (!ok) missing.push(stage);
    check(`${treeType}/${stage}.png`, ok, ok ? `${Math.round(size / 1024)} KB` : 'not a PNG / not served');
  }
  if (missing.length) {
    console.log(`\n  Missing artwork for: ${missing.join(', ')}\n`);
  }

  // ------------------------------------------------------- chapter growth
  console.log('\n2) One chapter walks the full 8-stage ladder');
  let chapters = detail0.chapters || [];
  if (!chapters.length) {
    console.log('  FAIL  no chapters for this subject — nothing to grow');
    process.exit(1);
  }
  if (process.argv.includes('--reset')) {
    await resetSubject(chapters.map((c) => c.chapterId));
    const fresh = await getTree();
    chapters = fresh.chapters || [];
    console.log(`  (reset) subject wiped back to bare soil — tree is "${fresh.tree.stage}"`);
  }
  const target = chapters[0];
  console.log(`  target chapter: ${target.chapterNumber}. ${target.title} (${target.chapterId})`);
  console.log(`  starting stage: ${target.stage} (index ${target.stageIndex}), roots ${target.rootsPct}%\n`);

  const timeline = [];
  async function step(label, expectedStages, fn) {
    await fn();
    const { chapter, tree } = await chapterState(target.chapterId);
    timeline.push({ label, chapter: chapter.stage, roots: chapter.rootsPct, tree: tree.stage });
    const wanted = Array.isArray(expectedStages) ? expectedStages : [expectedStages];
    check(
      `${label} -> chapter "${wanted.join('" or "')}"`,
      wanted.includes(chapter.stage),
      `got "${chapter.stage}" (roots ${chapter.rootsPct}%) · subject tree "${tree.stage}"`,
    );
    return chapter;
  }

  await step('lesson + question + story', 'sprout', async () => {
    await activity(target.chapterId, 'lesson');
    await activity(target.chapterId, 'question');
    await activity(target.chapterId, 'story');
  });

  await step('homework + quiz + flashcards', 'young_plant', async () => {
    await activity(target.chapterId, 'homework');
    await activity(target.chapterId, 'quiz');
    await activity(target.chapterId, 'flashcards');
  });

  await step('active recall + explain back + memory challenge', 'growing_tree', async () => {
    await activity(target.chapterId, 'active_recall');
    await activity(target.chapterId, 'explain_back');
    await activity(target.chapterId, 'memory_challenge');
  });

  await step('word problems + real life + project', 'mature_tree', async () => {
    await activity(target.chapterId, 'word_problem');
    await activity(target.chapterId, 'real_life');
    await activity(target.chapterId, 'project');
  });

  await step('7-day retention review passed', 'blossom', async () => {
    await review(target.chapterId, 'week');
  });

  // 'fruit' is skipped when the student's roots already passed the golden
  // threshold (90%) by the time the month review lands — that is the engine
  // working as designed, so accept either.
  const afterMonth = await step('30-day retention review passed', ['fruit', 'golden_fruit'], async () => {
    await review(target.chapterId, 'month');
  });

  // Golden fruit needs fruit + roots >= 90.
  console.log(`\n  roots after fruit: ${afterMonth.rootsPct}% (golden needs >= 90)`);
  let guard = 0;
  while (guard < 40) {
    const { chapter } = await chapterState(target.chapterId);
    if (chapter.rootsPct >= 90 || chapter.stage === 'golden_fruit') break;
    await activity(target.chapterId, 'explain_back'); // biggest roots gain
    guard += 1;
  }
  const golden = await chapterState(target.chapterId);
  timeline.push({ label: 'deep practice to 90% roots', chapter: golden.chapter.stage, roots: golden.chapter.rootsPct, tree: golden.tree.stage });
  check(
    'roots >= 90 -> chapter "golden_fruit"',
    golden.chapter.stage === 'golden_fruit',
    `got "${golden.chapter.stage}" (roots ${golden.chapter.rootsPct}%)`,
  );
  check('chapter flagged isGolden', golden.chapter.isGolden === true, `isGolden=${golden.chapter.isGolden}`);

  // ---------------------------------------------------- subject tree stage
  console.log('\n3) The subject tree on the orchard card reacts');
  const orchard = await getOrchard();
  const card = (orchard.trees || []).find((t) => t.subjectKey === SUBJECT);
  check('subject tree left the seed stage', card && card.stage !== 'seed', card ? `stage "${card.stage}", ${card.completedChapters}/${card.totalChapters} chapters, ${card.progressPct}%` : 'tree missing');
  check('completed chapter counted', card && card.completedChapters >= 1, card ? `${card.completedChapters}` : 'n/a');

  console.log('\n  Stage ladder actually observed:');
  console.log('  ' + 'step'.padEnd(46) + 'chapter'.padEnd(15) + 'roots'.padEnd(8) + 'subject tree');
  for (const row of timeline) {
    console.log('  ' + row.label.padEnd(46) + String(row.chapter).padEnd(15) + `${row.roots}%`.padEnd(8) + row.tree);
  }

  // --------------------------------------- how the card maps chapters->art
  console.log('\n4) Subject-card stage across the whole journey');
  const total = card ? card.totalChapters : 0;
  const reachable = new Set();
  const maxIndex = 7;
  // Same maths as treeStageFromGrowth() in orchard.constants.ts: every chapter
  // contributes its own stage index, so partial work already moves the tree.
  for (let points = 0; points <= total * maxIndex; points += 1) {
    let idx;
    if (points <= 0) idx = 0;
    else if (points >= total * maxIndex) idx = 7;
    else idx = Math.min(6, Math.max(1, Math.ceil((points / (total * maxIndex)) * maxIndex)));
    reachable.add(STAGES[idx]);
  }
  for (const s of STAGES) {
    console.log(`  ${s.padEnd(14)} ${reachable.has(s) ? 'reachable' : 'NEVER SHOWN'}`);
  }
  const unreachable = STAGES.filter((s) => !reachable.has(s));
  check(
    'every stage image is reachable on the subject card',
    unreachable.length === 0,
    unreachable.length ? `never shown with ${total} chapters: ${unreachable.join(', ')}` : `all 8 reachable with ${total} chapters`,
  );

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nPROBE ERROR:', e.message);
  process.exit(1);
});

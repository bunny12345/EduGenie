/**
 * Pushes one subject tree up to a target stage by doing real activities on its
 * chapters, so the artwork for that stage can be inspected in the browser.
 *
 * Usage: node scripts/orchard_stage_to.js <studentId> <subjectKey> <targetStage>
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');

const API = process.env.PROBE_API || 'http://localhost:3000';
const STUDENT_ID = process.argv[2];
const SUBJECT = process.argv[3];
const TARGET = process.argv[4];

const STAGES = ['seed', 'sprout', 'young_plant', 'growing_tree', 'mature_tree', 'blossom', 'fruit', 'golden_fruit'];
const LADDER = [
  ['lesson', 'question', 'story'],
  ['homework', 'quiz', 'flashcards'],
  ['active_recall', 'explain_back', 'memory_challenge'],
  ['word_problem', 'real_life', 'project'],
];

const TOKEN = jwt.sign({ sub: STUDENT_ID, role: 'student' }, process.env.SUPABASE_JWT_SECRET, { expiresIn: '1h' });

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const getTree = () => api(`/orchard/${SUBJECT}?studentId=${STUDENT_ID}`);
const act = (chapterId, activityType) =>
  api('/orchard/activity', {
    method: 'POST',
    body: JSON.stringify({ studentId: STUDENT_ID, subjectKey: SUBJECT, chapterId, activityType, correct: true }),
  });
const rev = (chapterId, reviewType) =>
  api('/orchard/review/complete', {
    method: 'POST',
    body: JSON.stringify({ studentId: STUDENT_ID, chapterId, reviewType, passed: true }),
  });

(async () => {
  const want = STAGES.indexOf(TARGET);
  if (want < 0) throw new Error(`unknown stage "${TARGET}"`);

  let detail = await getTree();
  if (STAGES.indexOf(detail.tree.stage) >= want) {
    console.log(`already at "${detail.tree.stage}"`);
    return;
  }

  // Nudge chapters forward one rung at a time, lowest first, until the subject
  // tree reaches the wanted stage.
  for (let round = 0; round < 8; round += 1) {
    for (const ch of detail.chapters) {
      const cur = await getTree();
      if (STAGES.indexOf(cur.tree.stage) >= want) {
        console.log(`${SUBJECT} tree -> ${cur.tree.stage} (${cur.tree.completedChapters}/${cur.tree.totalChapters} chapters, ${cur.tree.progressPct}%)`);
        return;
      }
      const live = cur.chapters.find((c) => c.chapterId === ch.chapterId);
      const idx = live.stageIndex;
      if (idx < 4) {
        for (const a of LADDER[idx]) await act(ch.chapterId, a);
      } else if (idx === 4) {
        await rev(ch.chapterId, 'week');
      } else if (idx === 5) {
        await rev(ch.chapterId, 'month');
      } else if (idx === 6) {
        for (let i = 0; i < 8; i += 1) await act(ch.chapterId, 'explain_back');
      }
    }
    detail = await getTree();
  }
  const final = await getTree();
  console.log(`${SUBJECT} tree -> ${final.tree.stage} (${final.tree.completedChapters}/${final.tree.totalChapters} chapters, ${final.tree.progressPct}%)`);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});

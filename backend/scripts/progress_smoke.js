/**
 * progress_smoke.js — proves the student Progress feature reacts to real
 * activity, and only ever shows subjects the school has registered a teacher
 * for.
 *
 * Creates its own throwaway class, teacher and student, drives real endpoints
 * (POST /progress, POST /games/session) and asserts that both the home progress
 * cards (GET /progress) and the Learning Report (GET /progress/learning-score)
 * move. Everything is deleted again in teardown.
 *
 * Run against a live backend:
 *   set -a && source .env && set +a && npm run smoke:progress
 */
const jwt = require('jsonwebtoken');

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.SUPABASE_JWT_SECRET;
const SCHOOL = process.env.SMOKE_SCHOOL_ID || 'b994994e-355c-435e-b28f-8e3d1c24d12b';
const CLASS = 'Class 7';
const stamp = Date.now();

if (!SECRET) {
  console.error('SUPABASE_JWT_SECRET is required (source backend/.env first).');
  process.exit(1);
}

const tok = (sub, role, extra = {}) => jwt.sign({ sub, role, ...extra }, SECRET, { expiresIn: '1h' });
const admin = tok(SCHOOL, 'school_admin', { schoolId: SCHOOL });
const studentToken = (id) => tok(id, 'student', { studentId: id });

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  const line = `${label}${detail !== undefined ? ' :: ' + detail : ''}`;
  if (ok) { pass++; console.log(`  PASS ✅  ${line}`); } else { fail++; console.log(`  FAIL ❌  ${line}`); }
}

async function req(path, token, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, ...(opts.headers || {}) },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text, _status: res.status }; }
}
const post = (path, token, body) => req(path, token, { method: 'POST', body: JSON.stringify(body) });
const del = (path, token) => req(path, token, { method: 'DELETE' });

const subjectIn = (report, name) => (report.subjects || []).find((s) => s.name === name) || null;
const subjectNames = (report) => JSON.stringify((report.subjects || []).map((s) => s.name));

(async () => {
  let teacherId = null;
  let studentId = null;
  try {
    console.log('\n1. a fresh student in a class with no teacher has nothing to show');
    const created = await post('/school/students/register', admin, {
      name: `Progress Smoke ${stamp}`,
      loginId: `progress.smoke.${stamp}`,
      password: 'smoke12345',
      className: CLASS,
    });
    studentId = created.student && created.student.id;
    if (!studentId) throw new Error('student registration failed: ' + JSON.stringify(created));
    const student = studentToken(studentId);

    let report = await req(`/progress/learning-score?studentId=${studentId}`, student);
    check('learning score starts at 0', report.score === 0, `score=${report.score}`);
    check('hasData is false', report.hasData === false, String(report.hasData));
    check('no subjects without a teacher', (report.subjects || []).length === 0, subjectNames(report));

    let cards = await req(`/progress?studentId=${studentId}`, student);
    check('no progress cards yet', (cards.subjectScores || []).length === 0, JSON.stringify(cards.subjectScores));

    console.log(`\n2. registering a Physics teacher for ${CLASS} makes the subject appear`);
    const teacher = await post('/school/teachers/register', admin, {
      name: `Physics Smoke ${stamp}`,
      loginId: `physics.smoke.${stamp}`,
      password: 'smoke12345',
      email: `physics.smoke.${stamp}@example.com`,
      subject: 'Physics',
      grades: [CLASS],
    });
    teacherId = teacher.teacher && teacher.teacher.id;
    if (!teacherId) throw new Error('teacher registration failed: ' + JSON.stringify(teacher));

    report = await req(`/progress/learning-score?studentId=${studentId}`, student);
    check('Physics is in the learning report', !!subjectIn(report, 'Physics'), subjectNames(report));
    check('Physics starts as not-started', (subjectIn(report, 'Physics') || {}).status === 'not-started');
    check('score is still 0 before any activity', report.score === 0, `score=${report.score}`);

    console.log('\n3. a recorded metric shows up on the home progress cards');
    const metric = await post('/progress', student, {
      studentId, subject: 'Physics', score: 82, minutes: 25, source: 'smoke',
    });
    check('POST /progress reports success', metric.success === true, metric.error || '');
    cards = await req(`/progress?studentId=${studentId}`, student);
    const physicsCard = (cards.subjectScores || []).find((s) => s.subject === 'Physics');
    check('the Physics card exists', !!physicsCard, JSON.stringify(cards.subjectScores));
    check('the card shows the score that was recorded', physicsCard && physicsCard.score === 82, physicsCard && String(physicsCard.score));
    check('minutes are counted', cards.timeSpent === 25, String(cards.timeSpent));

    console.log('\n4. playing a game moves the learning score');
    const before = report.score;
    await post('/games/session', student, {
      studentId, gameKey: 'flashcards', subjectKey: 'physics', chapterScope: 'all',
      score: 18, total: 20, durationMs: 240000,
    });
    report = await req(`/progress/learning-score?studentId=${studentId}`, student);
    const physics = subjectIn(report, 'Physics');
    check('the overall score went up', report.score > before, `${before} → ${report.score}`);
    check('hasData is true', report.hasData === true, String(report.hasData));
    check('Physics is no longer not-started', physics && physics.status !== 'not-started', physics && `${physics.score}% (${physics.status})`);
    check('the Physics score is above 0', physics && physics.score > 0, physics && String(physics.score));
    check('at least one skill moved off 0',
      (report.dimensions || []).some((d) => d.value > 0),
      (report.dimensions || []).filter((d) => d.value > 0).map((d) => `${d.key}:${d.value}`).join(' ') || 'none');
    check('the daily trend ends on the current score',
      (report.dailyTrend || []).length > 0 && report.dailyTrend[report.dailyTrend.length - 1].score === report.score);

    console.log('\n5. a second, stronger session moves it again');
    const mid = report.score;
    const midPhysics = physics.score;
    await post('/games/session', student, {
      studentId, gameKey: 'flashcards', subjectKey: 'physics', chapterScope: 'all',
      score: 20, total: 20, durationMs: 200000,
    });
    report = await req(`/progress/learning-score?studentId=${studentId}`, student);
    const physicsAgain = subjectIn(report, 'Physics');
    check('the overall score reacted again', report.score > mid, `${mid} → ${report.score}`);
    check('the Physics score reacted again', physicsAgain && physicsAgain.score >= midPhysics, `${midPhysics} → ${physicsAgain && physicsAgain.score}`);

    console.log('\n6. activity in a subject with no teacher stays hidden');
    await post('/progress', student, { studentId, subject: 'Sanskrit', score: 91, minutes: 10, source: 'smoke' });
    report = await req(`/progress/learning-score?studentId=${studentId}`, student);
    check('Sanskrit is not in the learning report', !subjectIn(report, 'Sanskrit'), subjectNames(report));
    cards = await req(`/progress?studentId=${studentId}`, student);
    check('Sanskrit has no progress card either',
      !(cards.subjectScores || []).some((s) => s.subject === 'Sanskrit'),
      JSON.stringify((cards.subjectScores || []).map((s) => s.subject)));

    console.log('\n7. removing the teacher removes the subject again');
    await del(`/school/teachers/${teacherId}`, admin);
    teacherId = null;
    report = await req(`/progress/learning-score?studentId=${studentId}`, student);
    check('Physics is gone with its teacher', !subjectIn(report, 'Physics'), subjectNames(report));
    check('the overall score still reflects the work that was done', report.score > 0, `score=${report.score}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL ❌  the smoke threw :: ${(e && e.message) || e}`);
  } finally {
    if (teacherId) await del(`/school/teachers/${teacherId}`, admin);
    if (studentId) await del(`/school/students/${studentId}`, admin);
    console.log('\nteardown: throwaway teacher/student removed');
    console.log(`\nPROGRESS SMOKE: ${fail === 0 ? 'PASS ✅' : 'FAIL ❌'}  (${pass} passed, ${fail} failed)`);
    process.exit(fail === 0 ? 0 : 1);
  }
})();

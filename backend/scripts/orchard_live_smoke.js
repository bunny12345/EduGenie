/*
 * Live orchard smoke test (runs against a running backend + the real database).
 *
 * Contract under test — "orchard chapters are 100% driven by uploads":
 *   1. A brand-new teacher subject + a brand-new student start with EMPTY trees.
 *   2. A tree's chapter count always equals the number of lessons uploaded and
 *      made visible for that student's subject + class — never a filler number.
 *   3. Chapters are named after the uploaded lesson, never "Chapter N".
 *   4. Uploading a lesson makes exactly one chapter appear immediately.
 *   5. Other subjects and other classes are completely unaffected.
 *
 * Everything this script creates is deleted again in the `finally` block, so it
 * is safe to run repeatedly against a real environment.
 *
 * Usage:
 *   cd backend && set -a && source .env && set +a && npm run smoke:orchard:live
 *
 * Env:
 *   API_BASE_URL          (default http://localhost:3000)
 *   SMOKE_SCHOOL_ID       school to register the throwaway teacher under
 *   SUPABASE_JWT_SECRET   required, used to mint the test tokens
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  required for teardown
 */
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const API = process.env.API_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.SUPABASE_JWT_SECRET;
const SCHOOL = process.env.SMOKE_SCHOOL_ID || 'b994994e-355c-435e-b28f-8e3d1c24d12b';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const STAMP = Date.now().toString().slice(-8);
const SUBJECT = `SmokeAstro${STAMP}`;
const LESSON_TITLE = `Stars and Galaxies ${STAMP}`;
const GENERIC_TITLE = /^chapter\s*\d+$/i;

if (!SECRET) {
  console.error('SUPABASE_JWT_SECRET is required (source backend/.env first).');
  process.exit(1);
}

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  ${label}${detail ? ` :: ${detail}` : ''}`);
}

const token = (sub, role) => jwt.sign({ sub, role, schoolId: SCHOOL }, SECRET, { expiresIn: '1h' });

async function api(path, { method = 'GET', body, tok } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { status: res.status, raw: text.slice(0, 300) };
  }
}

const created = { teacherId: null, studentId: null, lessonId: null };

async function teardown() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.log('\n(skipping teardown — no service key; remove the SmokeAstro records manually)');
    return;
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  if (created.lessonId) {
    const { data: chapters } = await db.from('orchard_chapters').select('id').eq('lesson_id', created.lessonId);
    const chapterIds = (chapters || []).map((c) => c.id);
    if (chapterIds.length) {
      await db.from('orchard_trees').update({ next_chapter_id: null }).in('next_chapter_id', chapterIds);
      await db.from('chapter_growth').delete().in('chapter_id', chapterIds);
      await db.from('orchard_reviews').delete().in('chapter_id', chapterIds);
      await db.from('orchard_activity').update({ chapter_id: null }).in('chapter_id', chapterIds);
      await db.from('orchard_chapters').delete().in('id', chapterIds);
    }
    await db.from('lesson_class_visibility').delete().eq('lesson_id', created.lessonId);
    await db.from('lesson_chunks').delete().eq('lesson_id', created.lessonId);
    await db.from('lesson_documents').delete().eq('lesson_id', created.lessonId);
    await db.from('lessons').delete().eq('id', created.lessonId);
  }
  if (created.studentId) {
    await db.from('orchard_activity').delete().eq('student_id', created.studentId);
    await db.from('orchard_trees').delete().eq('student_id', created.studentId);
    await db.from('orchard_profile').delete().eq('student_id', created.studentId);
    await db.from('students').delete().eq('id', created.studentId);
  }
  if (created.teacherId) {
    // Go through the API so the in-memory account store is updated too, then
    // make sure the row is really gone.
    await api(`/school/teachers/${created.teacherId}`, { method: 'DELETE', tok: token(SCHOOL, 'school_admin') });
    await db.from('teachers').delete().eq('id', created.teacherId);
  }
  // Trees for the throwaway subject may exist for other students in the class.
  await db.from('orchard_trees').delete().eq('subject_key', SUBJECT.toLowerCase());
  pruneLocalAccounts();
  console.log('\nteardown: throwaway teacher/student/lesson removed');
}

// The auth service also mirrors accounts to local-data/*.json, so clear them too.
function pruneLocalAccounts() {
  const fs = require('fs');
  const path = require('path');
  const files = [
    [path.join(__dirname, '..', 'local-data', 'teacher-accounts.json'), (r) => String(r.loginId || '').startsWith('smokeastro')],
    [path.join(__dirname, '..', 'local-data', 'student-accounts.json'), (r) => String(r.loginId || '').startsWith('smokenova')],
  ];
  for (const [file, isProbe] of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(rows)) continue;
      const kept = rows.filter((r) => !isProbe(r));
      if (kept.length !== rows.length) fs.writeFileSync(file, JSON.stringify(kept, null, 2));
    } catch {
      /* best-effort */
    }
  }
}

(async () => {
  const schoolTok = token(SCHOOL, 'school_admin');

  console.log('=== 1. Brand-new teacher subject + brand-new student ===');
  const tRes = await api('/school/teachers/register', {
    method: 'POST',
    tok: schoolTok,
    body: {
      name: `Smoke Astro ${STAMP}`,
      email: `smokeastro${STAMP}@AcademiX.test`,
      subject: SUBJECT,
      loginId: `smokeastro${STAMP}`,
      password: 'Passw0rd!',
      grades: ['Class 8'],
    },
  });
  created.teacherId = tRes.teacher && (tRes.teacher.id || tRes.teacher.teacherId);
  check('school can register a teacher for a brand-new subject', Boolean(created.teacherId), SUBJECT);
  if (!created.teacherId) throw new Error(`teacher registration failed: ${JSON.stringify(tRes).slice(0, 200)}`);

  const sRes = await api('/teacher/students/register', {
    method: 'POST',
    tok: token(created.teacherId, 'teacher'),
    body: { name: `Smoke Nova ${STAMP}`, className: 'Class 8', loginId: `smokenova${STAMP}`, password: 'Passw0rd!' },
  });
  created.studentId = sRes.student && (sRes.student.id || sRes.student.studentId);
  check('teacher can register a brand-new student', Boolean(created.studentId), 'Class 8');
  if (!created.studentId) throw new Error(`student registration failed: ${JSON.stringify(sRes).slice(0, 200)}`);
  const stuTok = token(created.studentId, 'student');

  console.log('\n=== 2. Every tree mirrors the uploaded lessons exactly ===');
  const lessonsRes = await api('/curriculum/lessons', { tok: stuTok });
  const classLessons = lessonsRes.lessons || [];
  const uploadedTitlesFor = (subjectName) =>
    classLessons
      .filter((l) => String(l.subject || '').toLowerCase() === String(subjectName || '').toLowerCase())
      .map((l) => l.title);
  console.log(`  lessons visible to Class 8: ${classLessons.length}`);

  const orchard = await api('/orchard', { tok: stuTok });
  const trees = orchard.trees || [];
  console.log('  trees:', trees.map((t) => `${t.subject}=${t.totalChapters}`).join(', '));

  const newTree = trees.find((t) => String(t.subject).toLowerCase() === SUBJECT.toLowerCase());
  check('the brand-new subject grows its own tree', Boolean(newTree), SUBJECT);
  check('the brand-new subject starts with ZERO chapters', Boolean(newTree) && newTree.totalChapters === 0, String(newTree && newTree.totalChapters));
  check(
    'no tree falls back to the old 18-chapter filler',
    !trees.some((t) => t.totalChapters === 18),
    trees.map((t) => `${t.subject}=${t.totalChapters}`).join(', '),
  );

  for (const t of trees) {
    const detail = await api(`/orchard/${t.subjectKey}`, { tok: stuTok });
    const titles = (detail.chapters || []).map((c) => c.title);
    const expected = uploadedTitlesFor(t.subject);
    check(
      `${t.subject}: chapters === uploaded lessons (${expected.length})`,
      titles.length === expected.length && expected.every((x) => titles.includes(x)),
      `got [${titles.join(' | ') || 'empty'}] expected [${expected.join(' | ') || 'empty'}]`,
    );
    check(`${t.subject}: reported total matches the chapter list`, t.totalChapters === titles.length, `${t.totalChapters} vs ${titles.length}`);
    check(`${t.subject}: no generic "Chapter N" titles`, !titles.some((x) => GENERIC_TITLE.test(x)));
  }

  console.log('\n=== 3. Uploading a lesson creates exactly one, lesson-named chapter ===');
  const lRes = await api('/curriculum/lessons', {
    method: 'POST',
    tok: schoolTok,
    body: {
      teacherId: created.teacherId,
      subject: SUBJECT,
      title: LESSON_TITLE,
      className: 'Class 8',
      visibleClassNames: ['Class 8'],
      orderIndex: 1,
    },
  });
  created.lessonId = lRes.lesson && lRes.lesson.id;
  check('school can upload a lesson for the new subject', Boolean(created.lessonId), LESSON_TITLE);
  if (!created.lessonId) throw new Error(`lesson creation failed: ${JSON.stringify(lRes).slice(0, 240)}`);

  const after = await api(`/orchard/${newTree.subjectKey}`, { tok: stuTok });
  const afterTitles = (after.chapters || []).map((c) => c.title);
  check('uploaded lesson becomes exactly one chapter', afterTitles.length === 1, afterTitles.join(' | ') || '(empty)');
  check('the chapter is named after the uploaded lesson', afterTitles[0] === LESSON_TITLE, String(afterTitles[0]));
  check('tree total is now 1', after.tree && after.tree.totalChapters === 1, String(after.tree && after.tree.totalChapters));
  check(
    'the chapter is clickable work (has an id + milestones)',
    Boolean(after.chapters && after.chapters[0] && after.chapters[0].chapterId),
    JSON.stringify(after.chapters && after.chapters[0] ? Object.keys(after.chapters[0]) : []).slice(0, 160),
  );
  check('the tree points at that chapter as the next action', Boolean(after.nextChapter && after.nextChapter.title === LESSON_TITLE), String(after.nextChapter && after.nextChapter.title));

  const otherAfter = await api('/orchard', { tok: stuTok });
  check(
    'other subjects are untouched by the upload',
    (otherAfter.trees || []).every((t) =>
      t.subjectKey === newTree.subjectKey ? t.totalChapters === 1 : t.totalChapters === uploadedTitlesFor(t.subject).length,
    ),
    (otherAfter.trees || []).map((t) => `${t.subject}=${t.totalChapters}`).join(', '),
  );
  check(
    'subjects with no uploads stay completely empty',
    (otherAfter.trees || [])
      .filter((t) => t.subjectKey !== newTree.subjectKey && uploadedTitlesFor(t.subject).length === 0)
      .every((t) => t.totalChapters === 0),
    (otherAfter.trees || [])
      .filter((t) => t.subjectKey !== newTree.subjectKey && uploadedTitlesFor(t.subject).length === 0)
      .map((t) => `${t.subject}=${t.totalChapters}`)
      .join(', ') || '(none)',
  );

  console.log('\n=== 4. Other classes never see this lesson ===');
  if (SUPABASE_URL && SERVICE_KEY) {
    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: others } = await db.from('students').select('id, name, class_name').neq('class_name', 'Class 8').limit(3);
    for (const s of others || []) {
      const oTok = token(s.id, 'student');
      const o = await api('/orchard', { tok: oTok });
      for (const t of o.trees || []) {
        const d = await api(`/orchard/${t.subjectKey}`, { tok: oTok });
        const titles = (d.chapters || []).map((c) => c.title);
        check(`${s.name} (${s.class_name})/${t.subject}: no Class 8 leak`, !titles.includes(LESSON_TITLE));
        check(`${s.name} (${s.class_name})/${t.subject}: no generic "Chapter N"`, !titles.some((x) => GENERIC_TITLE.test(x)));
      }
    }
    if (!(others || []).length) console.log('  (no students in other classes to compare against)');
  } else {
    console.log('  (skipped — needs the service key to pick a student from another class)');
  }
})()
  .catch((e) => {
    failures += 1;
    console.error('\nERROR:', e && e.message ? e.message : e);
  })
  .finally(async () => {
    try {
      await teardown();
    } catch (e) {
      console.error('teardown error:', e && e.message ? e.message : e);
    }
    console.log(`\nLIVE ORCHARD SMOKE: ${failures === 0 ? 'PASS ✅' : `FAIL ❌ (${failures})`}`);
    process.exit(failures === 0 ? 0 : 1);
  });

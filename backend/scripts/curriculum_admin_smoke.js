/*
 * Live smoke test for the school-admin Curriculum Content flow.
 *
 * Contract under test:
 *   1. `GET /curriculum/subjects` only reports subjects that actually have a
 *      teacher for a class — this is what the panel validates against.
 *   2. A lesson cannot be filed under a subject with no teacher for that class.
 *   3. Lesson numbering is automatic and positional: 1, 2, 3 … per subject+class.
 *   4. Uploading is one action (create lesson + attach PDF) and the lesson shows
 *      up immediately in the student's orchard, flashcard games and tutor index.
 *   5. Renaming a lesson renames its orchard chapter and flashcard deck.
 *   6. Deleting a lesson removes its chapter/deck/chunks and renumbers the rest.
 *   7. A second subject for the same class gets its own independent numbering.
 *
 * Everything created is removed again in the `finally` block.
 *
 * Usage:
 *   cd backend && set -a && source .env && set +a && npm run smoke:curriculum
 */
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const API = process.env.API_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.SUPABASE_JWT_SECRET;
const SCHOOL = process.env.SMOKE_SCHOOL_ID || 'b994994e-355c-435e-b28f-8e3d1c24d12b';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const STAMP = Date.now().toString().slice(-8);
const CLASS = 'Class 8';
const SUBJECT_A = `SmokeGeo${STAMP}`;
const SUBJECT_B = `SmokeCivics${STAMP}`;

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
const adminTok = token(SCHOOL, 'school_admin');

async function api(path, { method = 'GET', body, tok = adminTok } = {}) {
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

/** A tiny but genuinely parseable one-page PDF, as a data URL. */
function makePdfDataUrl(text) {
  const content = `BT /F1 12 Tf 40 700 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(pdf, 'latin1').toString('base64')}`;
}

/** The one action the admin panel performs: create the lesson + attach the PDF. */
async function addLesson({ teacherId, subject, title, body }) {
  const created = await api('/curriculum/lessons', {
    method: 'POST',
    body: { teacherId, subject, title, className: CLASS, isActive: true, visibleClassNames: [CLASS] },
  });
  if (created?.success === false) throw new Error(`create failed: ${created.error}`);
  const lessonId = created?.lesson?.id;
  const uploaded = await api(`/curriculum/lessons/${lessonId}/documents/upload`, {
    method: 'POST',
    body: { fileName: `${title}.pdf`, mimeType: 'application/pdf', data: makePdfDataUrl(body || title) },
  });
  if (uploaded?.success === false) throw new Error(`upload failed: ${uploaded.error}`);
  return { lessonId, orderIndex: created.lesson.order_index, document: uploaded.document };
}

const created = { teacherA: null, teacherB: null, studentId: null, lessonIds: [] };

async function teardown() {
  for (const id of created.lessonIds) {
    try { await api(`/curriculum/lessons/${id}`, { method: 'DELETE' }); } catch { /* best-effort */ }
  }
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  if (created.studentId) {
    await db.from('orchard_activity').delete().eq('student_id', created.studentId);
    await db.from('orchard_trees').delete().eq('student_id', created.studentId);
    await db.from('orchard_profile').delete().eq('student_id', created.studentId);
    await db.from('students').delete().eq('id', created.studentId);
  }
  for (const teacherId of [created.teacherA, created.teacherB].filter(Boolean)) {
    await api(`/school/teachers/${teacherId}`, { method: 'DELETE' });
    await db.from('teachers').delete().eq('id', teacherId);
  }
  for (const subject of [SUBJECT_A, SUBJECT_B]) {
    await db.from('orchard_trees').delete().eq('subject_key', subject.toLowerCase());
  }
  pruneLocalAccounts();
  console.log('\nteardown: throwaway teachers/student/lessons removed');
}

function pruneLocalAccounts() {
  const fs = require('fs');
  const path = require('path');
  const files = [
    [path.join(__dirname, '..', 'local-data', 'teacher-accounts.json'), (r) => String(r.loginId || '').startsWith('smokecc')],
    [path.join(__dirname, '..', 'local-data', 'student-accounts.json'), (r) => String(r.loginId || '').startsWith('smokeccstu')],
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
  console.log('=== 1. Subject roster drives the panel ===');
  const before = await api(`/curriculum/subjects?className=${encodeURIComponent(CLASS)}`);
  check('subjects endpoint answers for an admin', before?.success === true, JSON.stringify(before).slice(0, 120));
  check(
    'a subject with no teacher is NOT offered for the class',
    !(before.subjects || []).some((s) => s.subject === SUBJECT_A),
    (before.subjects || []).map((s) => s.subject).join(', ') || '(none)',
  );

  console.log('\n=== 2. A lesson cannot be filed under a subject with no teacher ===');
  const orphan = await api('/curriculum/lessons', {
    method: 'POST',
    body: { teacherId: '00000000-0000-0000-0000-000000000000', subject: SUBJECT_A, title: 'Should not exist', className: CLASS },
  });
  check('unknown teacher is rejected', orphan?.success === false, String(orphan?.error || '').slice(0, 80));

  console.log('\n=== 3. Registering the subject teacher unlocks the subject ===');
  const tA = await api('/school/teachers/register', {
    method: 'POST',
    body: {
      name: `Smoke Geo ${STAMP}`,
      email: `smokecc-a${STAMP}@AcademiX.test`,
      subject: SUBJECT_A,
      loginId: `smokecca${STAMP}`,
      password: 'Passw0rd!',
      grades: [CLASS],
    },
  });
  created.teacherA = tA?.teacher?.id;
  check('subject teacher registered', Boolean(created.teacherA), SUBJECT_A);
  if (!created.teacherA) throw new Error(JSON.stringify(tA).slice(0, 200));

  const after = await api(`/curriculum/subjects?className=${encodeURIComponent(CLASS)}`);
  const offered = (after.subjects || []).find((s) => s.subject === SUBJECT_A);
  check('subject is now offered for the class', Boolean(offered), SUBJECT_A);
  check('the class teacher is returned for confirmation', offered?.teacherId === created.teacherA, String(offered?.teacherName));
  check(
    'the subject is NOT offered for a class the teacher does not handle',
    !((after.classes || []).find((c) => c.className === 'Class 9')?.subjects || []).some((s) => s.subject === SUBJECT_A),
  );

  console.log('\n=== 4. Numbering is automatic and positional ===');
  const l1 = await addLesson({ teacherId: created.teacherA, subject: SUBJECT_A, title: `Maps and Globes ${STAMP}` });
  created.lessonIds.push(l1.lessonId);
  check('first upload becomes lesson 1', l1.orderIndex === 1, String(l1.orderIndex));

  const l2 = await addLesson({ teacherId: created.teacherA, subject: SUBJECT_A, title: `Rivers of India ${STAMP}` });
  created.lessonIds.push(l2.lessonId);
  check('second upload becomes lesson 2', l2.orderIndex === 2, String(l2.orderIndex));

  const l3 = await addLesson({ teacherId: created.teacherA, subject: SUBJECT_A, title: `Climate Zones ${STAMP}` });
  created.lessonIds.push(l3.lessonId);
  check('third upload becomes lesson 3', l3.orderIndex === 3, String(l3.orderIndex));

  console.log('\n=== 5. A second subject numbers independently ===');
  const tB = await api('/school/teachers/register', {
    method: 'POST',
    body: {
      name: `Smoke Civics ${STAMP}`,
      email: `smokecc-b${STAMP}@AcademiX.test`,
      subject: SUBJECT_B,
      loginId: `smokeccb${STAMP}`,
      password: 'Passw0rd!',
      grades: [CLASS],
    },
  });
  created.teacherB = tB?.teacher?.id;
  check('second subject teacher registered', Boolean(created.teacherB), SUBJECT_B);

  const b1 = await addLesson({ teacherId: created.teacherB, subject: SUBJECT_B, title: `The Constitution ${STAMP}` });
  created.lessonIds.push(b1.lessonId);
  check('a new subject starts again at lesson 1', b1.orderIndex === 1, String(b1.orderIndex));

  console.log('\n=== 6. Uploads reach the student (orchard / games / tutor) ===');
  const sRes = await api('/teacher/students/register', {
    method: 'POST',
    tok: token(created.teacherA, 'teacher'),
    body: { name: `Smoke CC ${STAMP}`, className: CLASS, loginId: `smokeccstu${STAMP}`, password: 'Passw0rd!' },
  });
  created.studentId = sRes?.student?.id;
  check('student registered for the class', Boolean(created.studentId), CLASS);
  const stuTok = token(created.studentId, 'student');

  const orchard = await api('/orchard', { tok: stuTok });
  const treeA = (orchard.trees || []).find((t) => String(t.subject).toLowerCase() === SUBJECT_A.toLowerCase());
  const treeB = (orchard.trees || []).find((t) => String(t.subject).toLowerCase() === SUBJECT_B.toLowerCase());
  check('orchard shows 3 chapters for the 3 uploaded lessons', treeA?.totalChapters === 3, String(treeA?.totalChapters));
  check('orchard shows 1 chapter for the second subject', treeB?.totalChapters === 1, String(treeB?.totalChapters));

  const detailA = await api(`/orchard/${treeA.subjectKey}`, { tok: stuTok });
  const chapterTitles = (detailA.chapters || []).map((c) => c.title);
  check(
    'orchard chapters are named after the uploaded lessons, in order',
    chapterTitles.join('|') === [`Maps and Globes ${STAMP}`, `Rivers of India ${STAMP}`, `Climate Zones ${STAMP}`].join('|'),
    chapterTitles.join(' | '),
  );
  check(
    'orchard numbers the chapters 1, 2, 3',
    (detailA.chapters || []).map((c) => c.chapterNumber).join(',') === '1,2,3',
    (detailA.chapters || []).map((c) => c.chapterNumber).join(','),
  );

  const lessonsForStudent = await api('/curriculum/lessons', { tok: stuTok });
  const studentTitles = (lessonsForStudent.lessons || []).map((l) => l.title);
  check(
    'the AI tutor lesson picker sees every uploaded lesson',
    [`Maps and Globes ${STAMP}`, `Rivers of India ${STAMP}`, `Climate Zones ${STAMP}`, `The Constitution ${STAMP}`]
      .every((t) => studentTitles.includes(t)),
    `${studentTitles.length} lessons visible`,
  );

  const games = await api('/games/flashcards/overview', { tok: stuTok });
  const gameSubjects = (games.subjects || []).map((s) => s.subject || s.subjectKey);
  check(
    'flashcard games list the new subjects',
    gameSubjects.some((s) => String(s).toLowerCase().includes('smokegeo')),
    gameSubjects.join(', ') || '(none)',
  );

  console.log('\n=== 7. Editing a lesson follows through everywhere ===');
  const renamed = `Maps and Globes (Revised) ${STAMP}`;
  const upd = await api(`/curriculum/lessons/${l1.lessonId}`, { method: 'PATCH', body: { title: renamed } });
  check('lesson rename accepted', upd?.success === true, String(upd?.error || ''));
  const afterRename = await api(`/orchard/${treeA.subjectKey}`, { tok: stuTok });
  check(
    'the orchard chapter is renamed too',
    (afterRename.chapters || []).some((c) => c.title === renamed),
    (afterRename.chapters || []).map((c) => c.title).join(' | '),
  );

  console.log('\n=== 8. Deleting a lesson cleans up and renumbers ===');
  const del = await api(`/curriculum/lessons/${l2.lessonId}`, { method: 'DELETE' });
  check('lesson delete accepted', del?.success === true, String(del?.error || ''));
  created.lessonIds = created.lessonIds.filter((id) => id !== l2.lessonId);

  const listAfter = await api(`/curriculum/lessons?className=${encodeURIComponent(CLASS)}&subject=${encodeURIComponent(SUBJECT_A)}`);
  const remaining = (listAfter.lessons || []).sort((a, b) => a.order_index - b.order_index);
  check('deleted lesson is gone', !remaining.some((l) => l.id === l2.lessonId), `${remaining.length} left`);
  check(
    'remaining lessons are renumbered 1, 2',
    remaining.map((l) => l.order_index).join(',') === '1,2',
    remaining.map((l) => `${l.order_index}:${l.title}`).join(' | '),
  );

  const orchardAfter = await api(`/orchard/${treeA.subjectKey}`, { tok: stuTok });
  check('the orchard drops the deleted chapter', (orchardAfter.chapters || []).length === 2, String((orchardAfter.chapters || []).length));
  check(
    'the orchard renumbers to 1, 2',
    (orchardAfter.chapters || []).map((c) => c.chapterNumber).join(',') === '1,2',
    (orchardAfter.chapters || []).map((c) => `${c.chapterNumber}. ${c.title}`).join(' | '),
  );
  check(
    'the deleted lesson is no longer offered to the AI tutor',
    !((await api('/curriculum/lessons', { tok: stuTok })).lessons || []).some((l) => l.id === l2.lessonId),
  );
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
    console.log(`\nCURRICULUM ADMIN SMOKE: ${failures === 0 ? 'PASS ✅' : `FAIL ❌ (${failures})`}`);
    process.exit(failures === 0 ? 0 : 1);
  });

/*
 * Orchard engine smoke test (mock mode).
 *
 * Part A — DYNAMIC CHAPTERS CONTRACT (regression guard):
 *   Orchard chapters are derived 1:1 from the lessons a school uploaded for the
 *   student's subject AND class. There is no filler: a subject with nothing
 *   uploaded has ZERO chapters, and no chapter is ever titled "Chapter N".
 *
 * Part B — growth engine: drives a simulated multi-month learning journey to
 *   verify tree growth, spaced-repetition reviews and aggregate computation.
 *
 * Run: npm run smoke:orchard   (or: npx ts-node scripts/orchard_smoke.ts)
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
import { StudentAuthService } from '../src/auth/student-auth.service';
import { OrchardService } from '../src/orchard/orchard.service';

const SCHOOL = 'smoke-school-1';
const CLASS_A = 'Class 8';
const CLASS_B = 'Class 9';
const GENERIC_TITLE = /^chapter\s*\d+$/i;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  ${label}${detail ? ` :: ${detail}` : ''}`);
}

function daysAgoIso(monthsBack: number, dayOffset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString();
}

async function insert(db: SupabaseService, table: string, row: any): Promise<any> {
  const res: any = await (db.client as any).from(table).insert([row]).select();
  return (res && res.data && res.data[0]) || row;
}

async function addStudent(db: SupabaseService, id: string, name: string, className: string) {
  await insert(db, 'students', { id, name, class_name: className, school_id: SCHOOL });
}

async function addTeacher(db: SupabaseService, id: string, subject: string, grades: string[]) {
  await insert(db, 'teachers', {
    id,
    name: `${subject} teacher`,
    subject,
    school_id: SCHOOL,
    grades,
    class_name: grades[0],
  });
}

/** An uploaded lesson = exactly one orchard chapter for the class it is visible to. */
async function addLesson(db: SupabaseService, title: string, subject: string, className: string, orderIndex: number) {
  const lesson = await insert(db, 'lessons', {
    title,
    subject,
    class_name: className,
    school_id: SCHOOL,
    order_index: orderIndex,
    created_at: new Date().toISOString(),
  });
  await insert(db, 'lesson_class_visibility', { lesson_id: lesson.id, class_name: className, is_visible: true });
  return lesson;
}

async function main() {
  const db = new SupabaseService();
  console.log('mock mode:', (db.client as any).isMock === true);
  const svc = new OrchardService(db, new StudentAuthService(db));

  // ══ Part A — dynamic chapters ═════════════════════════════════════════════
  console.log('\n=== A. DYNAMIC CHAPTERS (uploads drive the trees) ===');

  // Two teachers → two subjects for Class 8. Only Mathematics gets uploads.
  await addTeacher(db, 'smoke-teacher-math', 'Mathematics', [CLASS_A, CLASS_B]);
  await addTeacher(db, 'smoke-teacher-eng', 'English', [CLASS_A]);

  const mathTitles = ['Rational Numbers', 'Linear Equations', 'Understanding Quadrilaterals'];
  for (let i = 0; i < mathTitles.length; i++) {
    await addLesson(db, mathTitles[i], 'Mathematics', CLASS_A, i + 1);
  }
  // A Class 9 maths lesson must NEVER leak into the Class 8 tree.
  await addLesson(db, 'Coordinate Geometry (Class 9 only)', 'Mathematics', CLASS_B, 1);

  const student = 'smoke-student-1';
  await addStudent(db, student, 'Smoke Student', CLASS_A);
  await svc.ensureOrchard(student);

  const mathTree = await svc.getTree(student, 'mathematics');
  const mathChapterTitles: string[] = mathTree.chapters.map((c: any) => c.title);
  check('mathematics has exactly the 3 uploaded Class 8 lessons', mathTree.chapters.length === 3, mathChapterTitles.join(' | '));
  check('chapter titles come from the uploaded lessons', mathTitles.every((t) => mathChapterTitles.includes(t)));
  check('another grade never leaks in', !mathChapterTitles.some((t) => /Class 9 only/.test(t)));
  check('no generic "Chapter N" titles', !mathChapterTitles.some((t) => GENERIC_TITLE.test(t)));
  check('tree total matches the uploaded lesson count', mathTree.tree.totalChapters === 3, String(mathTree.tree.totalChapters));

  const engTree = await svc.getTree(student, 'english');
  check('english (nothing uploaded) has ZERO chapters', engTree.chapters.length === 0, `${engTree.chapters.length} chapters`);
  check('english tree total is 0', engTree.tree.totalChapters === 0, String(engTree.tree.totalChapters));
  check('english has no next chapter', !engTree.nextChapter);

  const overviewA = await svc.getOrchard(student);
  check(
    'overview reports 0 chapters for every subject with no uploads',
    overviewA.trees.every((t: any) => (t.subjectKey === 'mathematics' ? t.totalChapters === 3 : t.totalChapters === 0)),
    overviewA.trees.map((t: any) => `${t.subject}=${t.totalChapters}`).join(', '),
  );
  check(
    'at least one tree is legitimately empty (no filler anywhere)',
    overviewA.trees.some((t: any) => t.totalChapters === 0),
  );

  // A brand-new student in the same class sees exactly the same dynamic set.
  const newStudent = 'smoke-student-new';
  await addStudent(db, newStudent, 'Fresh Student', CLASS_A);
  await svc.ensureOrchard(newStudent);
  const newMath = await svc.getTree(newStudent, 'mathematics');
  const newEng = await svc.getTree(newStudent, 'english');
  check('brand-new student gets the 3 uploaded maths chapters', newMath.chapters.length === 3, String(newMath.chapters.length));
  check('brand-new student gets 0 english chapters', newEng.chapters.length === 0, String(newEng.chapters.length));
  check('brand-new student sees no generic titles', !newMath.chapters.some((c: any) => GENERIC_TITLE.test(c.title)));

  // A student in the other class only sees their own grade's upload.
  const otherStudent = 'smoke-student-class9';
  await addStudent(db, otherStudent, 'Class 9 Student', CLASS_B);
  await svc.ensureOrchard(otherStudent);
  const class9Math = await svc.getTree(otherStudent, 'mathematics');
  check(
    'Class 9 student sees only the Class 9 lesson',
    class9Math.chapters.length === 1,
    class9Math.chapters.map((c: any) => c.title).join(' | '),
  );

  // A new upload appears immediately.
  await addLesson(db, 'Data Handling', 'Mathematics', CLASS_A, 4);
  await svc.ensureOrchard(student);
  const afterUpload = await svc.getTree(student, 'mathematics');
  check(
    'newly uploaded lesson appears as a chapter right away',
    afterUpload.chapters.length === 4,
    afterUpload.chapters.map((c: any) => c.title).join(' | '),
  );

  // An empty tree fills in the moment its subject is uploaded…
  const engLesson = await addLesson(db, 'Honeydew — The Best Christmas Present', 'English', CLASS_A, 1);
  await svc.ensureOrchard(student);
  const engAfter = await svc.getTree(student, 'english');
  check(
    'english tree fills in the moment English is uploaded',
    engAfter.chapters.length === 1,
    engAfter.chapters.map((c: any) => c.title).join(' | '),
  );

  // …and empties again when the lesson is withdrawn.
  await (db.client as any).from('lessons').delete().eq('id', engLesson.id);
  await svc.ensureOrchard(student);
  const engRemoved = await svc.getTree(student, 'english');
  check('removing the lesson empties the tree again', engRemoved.chapters.length === 0, String(engRemoved.chapters.length));
  check('tree total returns to 0 after removal', engRemoved.tree.totalChapters === 0, String(engRemoved.tree.totalChapters));

  // ══ Part B — growth engine ════════════════════════════════════════════════
  console.log('\n=== B. GROWTH ENGINE ===');

  const act = (type: string, occurredAt: string, correct?: boolean) =>
    svc.recordActivity(student, { subjectKey: 'mathematics', activityType: type, correct, occurredAt });

  // Month -3: start chapter → sprout
  await act('lesson', daysAgoIso(3, 0));
  await act('question', daysAgoIso(3, 0), true);
  await act('story', daysAgoIso(3, 1));

  // Month -3 later: young_plant
  await act('homework', daysAgoIso(3, 3), true);
  await act('quiz', daysAgoIso(3, 4), true);
  await act('flashcards', daysAgoIso(3, 5));

  // Month -2: growing_tree
  await act('active_recall', daysAgoIso(2, 0), true);
  await act('explain_back', daysAgoIso(2, 1), true);
  await act('memory_challenge', daysAgoIso(2, 2), true);

  // Month -2 later: mature_tree (schedules week + month reviews)
  await act('word_problem', daysAgoIso(2, 5), true);
  await act('real_life', daysAgoIso(2, 6));
  await act('project', daysAgoIso(2, 7));

  const treeBefore = await svc.getTree(student, 'mathematics');
  const grown = treeBefore.chapters.find((c: any) => c.stageIndex >= 4);
  check('a chapter reached mature stage', Boolean(grown), grown ? `${grown.title} → ${grown.stage}` : 'none');
  if (!grown) {
    console.log('\nSMOKE RESULT: FAIL ❌ (growth journey did not mature a chapter)');
    process.exit(1);
  }

  await svc.completeReview(student, { chapterId: grown.chapterId, reviewType: 'week', passed: true, occurredAt: daysAgoIso(1, 20) });
  let t = await svc.getTree(student, 'mathematics');
  let ch = t.chapters.find((c: any) => c.chapterId === grown.chapterId);
  console.log(`  after week review: ${ch.stage} (roots ${ch.rootsPct}%)`);

  await svc.completeReview(student, { chapterId: grown.chapterId, reviewType: 'month', passed: true, occurredAt: daysAgoIso(0, -1) });
  await act('explain_back', daysAgoIso(0, -1), true);
  await act('memory_challenge', daysAgoIso(0, 0), true);
  t = await svc.getTree(student, 'mathematics');
  ch = t.chapters.find((c: any) => c.chapterId === grown.chapterId);
  console.log(`  after month review: ${ch.stage} (roots ${ch.rootsPct}%, golden ${ch.isGolden})`);
  check('chapter fruited after the full journey', ['fruit', 'golden_fruit'].includes(ch.stage), ch.stage);

  const overview = await svc.getOrchard(student);
  console.log('\n=== ORCHARD OVERVIEW ===');
  console.log('overallProgress:', overview.overallProgress);
  for (const tr of overview.trees) {
    console.log(
      `  ${tr.subject.padEnd(15)} stage=${tr.stageLabel.padEnd(12)} L${tr.level}/${tr.maxLevel} ` +
        `chapters=${tr.completedChapters}/${tr.totalChapters} progress=${tr.progressPct}% roots=${tr.rootsPct}%`,
    );
  }

  const math = overview.trees.find((x: any) => x.subjectKey === 'mathematics');
  check('overview counts the fruited chapter', Boolean(math && math.completedChapters >= 1), String(math && math.completedChapters));
  check('growth never invented extra chapters', Boolean(math && math.totalChapters === 4), String(math && math.totalChapters));

  console.log(`\nSMOKE RESULT: ${failures === 0 ? 'PASS ✅' : `FAIL ❌ (${failures} failing checks)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error', e);
  process.exit(1);
});

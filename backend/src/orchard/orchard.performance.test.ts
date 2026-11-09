import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { OrchardService } from './orchard.service';
import { assignSchoolTrees, SUBJECT_CATALOG } from './orchard.constants';

type Row = Record<string, any>;
type Read = { table: string; filters: Array<[string, unknown]>; write: boolean };

function fixture(subjectCount = 6) {
  const subjects = SUBJECT_CATALOG.slice(0, subjectCount);
  const tables = new Map<string, Row[]>([
    ['orchard_subjects', subjects.map((subject) => ({ ...subject }))],
    ['lessons', subjects.map((subject) => ({
      id: `lesson-${subject.subject_key}`, subject: subject.display_name, class_name: 'Class 8', title: subject.display_name,
    }))],
    ['orchard_chapters', subjects.map((subject) => ({
      id: `chapter-${subject.subject_key}`, subject_key: subject.subject_key, class_name: 'Class 8',
      lesson_id: `lesson-${subject.subject_key}`, title: subject.display_name, chapter_number: 1, order_index: 1,
    }))],
    ['chapter_growth', [{
      student_id: 'student', subject_key: subjects[0].subject_key, chapter_id: `chapter-${subjects[0].subject_key}`,
      stage: 'golden_fruit', stage_index: 7, roots_pct: 95, is_golden: true,
    }]],
    ['orchard_trees', subjects.map((subject, index) => ({
      student_id: 'student', subject_key: subject.subject_key, total_chapters: 1,
      completed_chapters: index === 0 ? 1 : 0, progress_pct: index === 0 ? 100 : 0,
      stage: index === 0 ? 'golden_fruit' : 'seed', next_chapter_id: `chapter-${subject.subject_key}`,
    }))],
    ['orchard_profile', [{ student_id: 'student' }]],
    ['orchard_activity', [{
      student_id: 'student', subject_key: subjects[0].subject_key,
      activity_type: 'revision', water: 10, sunlight: 10, fertilizer: 10, occurred_at: new Date().toISOString(),
    }]],
    ['orchard_reviews', [{
      student_id: 'student', subject_key: subjects[0].subject_key, chapter_id: `chapter-${subjects[0].subject_key}`,
      review_type: 'week', completed_at: null, scheduled_at: new Date(Date.now() - 86400000).toISOString(),
    }]],
  ]);
  const reads: Read[] = [];
  let active = 0;
  let maxActive = 0;
  let profileReads = 0;
  let serial = 0;
  let failAssignment = false;
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  Object.defineProperty(db, 'client', { value: {
    async rpc(_name: string, args: { p_subject_keys: string[] }) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return failAssignment ? { data: null, error: { message: 'simulated failure' } }
        : { data: assignSchoolTrees(args.p_subject_keys, []), error: null };
    },
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const predicates: Array<(row: Row) => boolean> = [];
      let additions: Row[] | undefined;
      let updates: Row | undefined;
      let removing = false;
      let from = 0;
      let to = Infinity;
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) {
          filters.push([key, value]); predicates.push((row) => row[key] === value); return query;
        },
        is(key: string, value: unknown) { predicates.push((row) => (row[key] ?? null) === value); return query; },
        lte(key: string, value: string) { predicates.push((row) => row[key] <= value); return query; },
        order() { return query; },
        range(start: number, end: number) { from = start; to = end; return query; },
        insert(rows: Row[]) { additions = rows; return query; },
        update(changes: Row) { updates = changes; return query; },
        delete() { removing = true; return query; },
        async then(resolve: (result: { data: Row[]; error: null }) => void) {
          reads.push({ table, filters, write: !!(additions || updates || removing) });
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise<void>((done) => setImmediate(done));
          const rows = tables.get(table) || [];
          let data = rows.filter((row) => predicates.every((predicate) => predicate(row)));
          if (additions) {
            data = additions.map((row) => ({ id: `insert-${++serial}`, ...row }));
            tables.set(table, [...rows, ...data]);
          } else if (updates) {
            data.forEach((row) => Object.assign(row, updates));
          } else if (removing) {
            tables.set(table, rows.filter((row) => !data.includes(row)));
          }
          active--;
          resolve({ data: data.slice(from, to + 1).map((row) => ({ ...row })), error: null });
        },
      };
      return query;
    },
  } });
  const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
  Object.defineProperty(auth, 'resolveStudentProfile', {
    value: async () => { profileReads++; return { schoolId: 'school', className: 'Class 8' }; },
  });
  Object.defineProperty(auth, 'listClassTeachers', {
    value: async () => subjects.map((subject) => ({ subject: subject.display_name })),
  });
  return {
    service: new OrchardService(db, auth), tables, reads, subjects,
    profileReads: () => profileReads, maxActive: () => maxActive,
    failAssignment: (value: boolean) => { failAssignment = value; },
  };
}

test('overview reads curriculum once, reuses chapter synchronization and bounds subject fan-out', async () => {
  const f = fixture();
  const result = await f.service.getOrchard('student');
  assert.equal(f.profileReads(), 1);
  for (const table of ['lessons', 'lesson_class_visibility']) {
    assert.equal(f.reads.filter((read) => read.table === table).length, 1);
  }
  assert.equal(f.reads.filter((read) => read.table === 'orchard_chapters').length, 6);
  assert.equal(f.reads.filter((read) => !read.write).length, 31);
  assert.equal(f.reads.filter((read) => read.write).length, 5);
  assert.ok(f.maxActive() >= 3 && f.maxActive() <= 6, `unexpected fan-out ${f.maxActive()}`);
  assert.equal(result.trees.length, 6);
  assert.equal(result.trees[0].masteredChapters, 1);
  assert.equal(result.trees[0].dueReviewCount, 1);
  assert.equal(result.trees[0].waterPct, 50);
  assert.equal(result.overallProgress, Math.round(100 / 6));
});

test('tree detail initializes only its own subject and preserves mastery, chapters and due reviews', async () => {
  const f = fixture();
  const key = f.subjects[0].subject_key;
  const result = await f.service.getTree('student', key);
  assert.equal(f.profileReads(), 1);
  assert.equal(result.tree.masteredChapters, 1);
  assert.equal(result.tree.totalChapters, 1);
  assert.equal(result.tree.progressPct, 100);
  assert.equal(result.chapters[0].dueReview, 'week');
  assert.equal(result.nextChapter.chapterId, `chapter-${key}`);
  assert.equal(f.reads.filter((read) => read.table === 'orchard_chapters').length, 1);
  for (const read of f.reads.filter((read) => ['orchard_trees', 'chapter_growth', 'orchard_chapters'].includes(read.table))) {
    assert.ok(read.filters.some(([column, value]) => column === 'subject_key' && value === key));
  }
  assert.ok(f.reads.length <= 13, `expected <=13 queries, got ${f.reads.length}`);
  const unknown = await f.service.getTree('student', 'unassigned');
  assert.equal(unknown.success, false);
});

test('80 overlapping identical reads share work; subsequent reads reflect curriculum updates and activity', async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 80 }, () => f.service.getOrchard('student')));
  assert.ok(results.every((result) => result === results[0]));
  assert.equal(f.profileReads(), 1);
  assert.equal(f.reads.filter((read) => read.table === 'lessons').length, 1);
  f.tables.get('lessons')![0].title = 'Renamed lesson';
  f.tables.get('lessons')!.push({ id: 'new-lesson', subject: f.subjects[0].display_name, title: 'New lesson', class_name: 'Class 8' });
  const detail = await f.service.getTree('student', f.subjects[0].subject_key);
  assert.equal(detail.chapters.length, 2);
  assert.equal(detail.chapters[0].title, 'Renamed lesson');
  assert.equal(detail.chapters[1].title, 'New lesson');
  assert.equal(detail.tree.masteredChapters, 1);
  f.tables.set('lessons', f.tables.get('lessons')!.filter((lesson) => lesson.id !== `lesson-${f.subjects[0].subject_key}`));
  const refreshed = await f.service.getTree('student', f.subjects[0].subject_key);
  assert.equal(refreshed.chapters.length, 1);
  assert.equal(refreshed.tree.masteredChapters, 0);
  f.tables.set('orchard_activity', []);
  const overview = await f.service.getOrchard('student');
  assert.equal(overview.trees[0].waterPct, 0);
});

test('80 distinct students stay isolated and shared chapter initialization creates no duplicate chapters', async () => {
  const f = fixture(2);
  f.tables.set('orchard_chapters', []);
  const results = await Promise.all(Array.from({ length: 80 }, (_, i) => f.service.getOrchard(`new-student-${i}`)));
  assert.equal(results.length, 80);
  assert.ok(results.every((result) => result.trees.length === 2 && result.trees.every((tree: Row) =>
    tree.masteredChapters === 0 && tree.waterPct === 0)));
  assert.equal(f.tables.get('orchard_chapters')!.length, 2);
  assert.equal(f.tables.get('chapter_growth')!.filter((row) => row.student_id !== 'student').length, 160);
  assert.equal(new Set(f.tables.get('orchard_trees')!.map((row) => `${row.student_id}:${row.subject_key}`)).size, 162);
});

test('overlapping detail and overview initialization does not duplicate student growth or omit other subjects', async () => {
  const f = fixture(2);
  f.tables.set('chapter_growth', []);
  f.tables.set('orchard_trees', []);
  const [detail, overview, otherDetail] = await Promise.all([
    f.service.getTree('new-student', f.subjects[0].subject_key),
    f.service.getOrchard('new-student'),
    f.service.getTree('new-student', f.subjects[1].subject_key),
  ]);
  assert.equal(overview.trees.length, 2);
  assert.equal(detail.chapters.length, 1);
  assert.equal(otherDetail.chapters.length, 1);
  assert.equal(f.tables.get('chapter_growth')!.length, 2);
  assert.equal(f.tables.get('orchard_trees')!.length, 2);
});

test('failed initialization is released for retry', async () => {
  const f = fixture(2);
  f.failAssignment(true);
  await assert.rejects(f.service.getOrchard('student'), /Orchard tree assignments/);
  f.failAssignment(false);
  assert.equal((await f.service.getOrchard('student')).trees.length, 2);
});

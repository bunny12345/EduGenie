import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { OrchardService } from './orchard.service';
import { SchoolTreeAssignment, SUBJECT_CATALOG } from './orchard.constants';

type Row = Record<string, unknown>;

function fixture(rpc?: (name: string, args: { p_school_id: string; p_subject_keys: string[] }) => Promise<{
  data: SchoolTreeAssignment[] | null; error: { message: string } | null;
}>) {
  const tables = new Map<string, Row[]>();
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  Object.defineProperty(db, 'client', { value: {
    isMock: !rpc,
    ...(rpc ? { rpc } : {}),
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let additions: Row[] = [];
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        insert(rows: Row[]) { additions = rows; return query; },
        order() { return query; },
        range() { return query; },
        then(resolve: (result: { data: Row[]; error: null }) => void) {
          const rows = tables.get(table) || [];
          if (additions.length) tables.set(table, [...rows, ...additions]);
          resolve({ data: additions.length ? additions : rows.filter((row) =>
            filters.every(([key, value]) => row[key] === value)), error: null });
        },
      };
      return query;
    },
  } });
  const profiles = new Map<string, { schoolId: string; className: string }>([
    ['student-a', { schoolId: 'school-a', className: 'Class 8' }],
    ['student-b', { schoolId: 'school-a', className: 'Class 9' }],
    ['student-c', { schoolId: 'school-b', className: 'Class 8' }],
  ]);
  const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
  Object.defineProperty(auth, 'resolveStudentProfile', {
    value: async (id: string) => profiles.get(id) || { schoolId: '', className: 'Class 8' },
  });
  const keys = new Map<string, string[]>([
    ['student-a', [...SUBJECT_CATALOG.map((s) => s.subject_key), 'biology', 'music', 'art', 'geography']],
    ['student-b', ['biology', 'new_subject', 'music']],
    ['student-c', ['biology', 'music']],
  ]);
  const makeService = (chapters: Record<string, Array<{ id: string }>> = {}) => {
    const service = new OrchardService(db, auth);
    Object.defineProperty(service, 'resolveStudentSubjectKeys', { value: async (id: string) => keys.get(id) || [] });
    Object.defineProperty(service, 'ensureChapters', { value: async (key: string) => chapters[key] || [] });
    Object.defineProperty(service, 'ensureTree', { value: async () => ({}) });
    Object.defineProperty(service, 'ensureProfile', { value: async () => ({}) });
    return service;
  };
  return { makeService, tables, keys };
}

test('school mappings survive new service instances, class changes and new subjects', async () => {
  const { makeService, tables, keys } = fixture();
  const service = makeService();
  const original = await service.ensureOrchard('student-a');
  assert.equal(new Set(original.catalog.map((s) => s.tree_type)).size, 10);
  const later = await makeService().ensureOrchard('student-b');
  assert.equal(later.catalog.length, 3);
  for (const key of ['biology', 'music']) {
    assert.equal(later.catalog.find((s) => s.subject_key === key)?.tree_type,
      original.catalog.find((s) => s.subject_key === key)?.tree_type);
  }
  keys.set('student-a', [...keys.get('student-a')!, 'new_subject', 'another']);
  const expanded = await makeService().ensureOrchard('student-a');
  for (const subject of original.catalog) {
    assert.equal(expanded.catalog.find((s) => s.subject_key === subject.subject_key)?.tree_type, subject.tree_type);
  }
  assert.equal(expanded.catalog.length, 12);
  assert.equal(new Set(expanded.catalog.map((s) => s.tree_type)).size, 10);
  await service.ensureOrchard('student-c');
  assert.equal(tables.get('orchard_school_tree_assignments')?.filter((row) => row.school_id === 'school-a').length, 12);
  assert.equal(tables.get('orchard_school_tree_assignments')?.filter((row) => row.school_id === 'school-b').length, 2);
  const detail = await service.getTree('student-b', 'biology');
  const overview = await service.getOrchard('student-b');
  assert.equal(detail.treeType, overview.trees.find((row: { subjectKey: string }) => row.subjectKey === 'biology').treeType);
  assert.equal(detail.fruitType, overview.trees.find((row: { subjectKey: string }) => row.subjectKey === 'biology').fruitType);
});

test('concurrent local reads store each school subject once', async () => {
  const { makeService, tables } = fixture();
  await Promise.all([makeService().ensureOrchard('student-a'), makeService().ensureOrchard('student-b')]);
  const rows = tables.get('orchard_school_tree_assignments')!;
  assert.equal(new Set(rows.map((row) => `${row.school_id}:${row.subject_key}`)).size, rows.length);
});

test('subjects reusing a design still have separate chapter mastery and growth', async () => {
  const { makeService, tables, keys } = fixture();
  const subjectKeys = Array.from({ length: 11 }, (_, i) => `custom_${String(i).padStart(2, '0')}`);
  keys.set('student-a', subjectKeys);
  tables.set('chapter_growth', [
    { student_id: 'student-a', subject_key: 'custom_00', chapter_id: 'first-lesson', stage: 'golden_fruit', stage_index: 7 },
    { student_id: 'student-a', subject_key: 'custom_10', chapter_id: 'second-lesson', stage: 'young_plant', stage_index: 2 },
    { student_id: 'student-b', subject_key: 'custom_10', chapter_id: 'second-lesson', stage: 'golden_fruit', stage_index: 7 },
  ]);
  tables.set('orchard_trees', [
    { student_id: 'student-a', subject_key: 'custom_00', stage: 'golden_fruit', progress_pct: 100 },
    { student_id: 'student-a', subject_key: 'custom_10', stage: 'young_plant', progress_pct: 29 },
  ]);
  const service = makeService({
    custom_00: [{ id: 'first-lesson' }],
    custom_10: [{ id: 'second-lesson' }],
  });
  const first = await service.getTree('student-a', 'custom_00');
  const reused = await service.getTree('student-a', 'custom_10');
  assert.equal(first.treeType, reused.treeType);
  assert.equal(first.tree.masteredChapters, 1);
  assert.equal(reused.tree.masteredChapters, 0);
  assert.equal(first.tree.stage, 'golden_fruit');
  assert.equal(reused.tree.stage, 'young_plant');
  assert.equal(reused.tree.progressPct, 29);
  assert.equal(reused.chapters[0].chapterId, 'second-lesson');
});

test('production allocator uses only the resolved school identity', async () => {
  const { makeService, keys } = fixture(async (name, args) => {
    assert.equal(name, 'orchard_assign_school_trees');
    assert.equal(args.p_school_id, 'school-a');
    assert.deepEqual(args.p_subject_keys, ['biology']);
    return { data: [{ subject_key: 'biology', tree_type: 'coconut' }], error: null };
  });
  keys.set('student-a', ['biology']);
  const { catalog } = await makeService().ensureOrchard('student-a');
  assert.equal(catalog[0].tree_type, 'strawberry');
  assert.equal(catalog[0].fruit_type, 'strawberry');
  assert.equal(catalog[0].fruit_emoji, '🍓');
  assert.equal(catalog[0].accent_color, '#e11d48');
});

test('missing migration, incomplete responses and unverified school report errors', async () => {
  for (const response of [
    { data: null, error: { message: 'function orchard_assign_school_trees does not exist' } },
    { data: [], error: null },
    { data: [{ subject_key: 'biology', tree_type: 'unknown' }], error: null },
  ]) {
    const { makeService } = fixture(async () => response);
    await assert.rejects(makeService().ensureOrchard('student-a'), ServiceUnavailableException);
  }
  const { makeService, keys } = fixture();
  keys.set('unknown-student', ['biology']);
  await assert.rejects(makeService().ensureOrchard('unknown-student'), ForbiddenException);
});

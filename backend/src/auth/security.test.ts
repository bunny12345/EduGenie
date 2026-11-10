import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Module, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sign } from 'jsonwebtoken';
import { SupabaseService } from '../supabase.service';
import { jwtSecret } from './jwt-secret';
import { StudentAuthService } from './student-auth.service';
import { AuthGuard } from './auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';
import { RewardsController } from '../controllers/rewards.controller';
import { TestsController } from '../controllers/tests.controller';
import { SettingsController } from '../controllers/settings.controller';
import { ProgressController } from '../controllers/progress.controller';
import { LearningScoreService } from '../progress/learning-score.service';
import { OrchardService } from '../orchard/orchard.service';

function object(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}

function objects(value: unknown): Array<Record<string, unknown>> {
  assert.ok(Array.isArray(value));
  return value.map(object);
}

async function json(response: Awaited<ReturnType<typeof fetch>>) {
  return object(await response.json());
}

test('JWT verification always verifies signatures and requires subject/expiry', async (t) => {
  const names = ['SUPABASE_JWT_SECRET', 'SUPABASE_URL', 'NODE_ENV'] as const;
  const saved = names.map((name) => [name, process.env[name]] as const);
  t.after(() => saved.forEach(([name, value]) => {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }));
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  process.env.SUPABASE_JWT_SECRET = 'test-only-security-key';
  const valid = sign({ sub: 'student-a', role: 'student' }, jwtSecret(), { expiresIn: '5m' });
  assert.equal(db.verifyJwt(valid)?.sub, 'student-a');
  assert.equal(db.verifyJwt(sign({ sub: 'student-a' }, 'attacker-key', { expiresIn: '5m' })), null);
  assert.equal(db.verifyJwt(sign({ sub: 'student-a' }, jwtSecret(), { expiresIn: -1 })), null);
  assert.equal(db.verifyJwt(sign({ role: 'student' }, jwtSecret(), { expiresIn: '5m' })), null);
  assert.equal(db.verifyJwt(sign({ sub: 'student-a' }, jwtSecret())), null);
  assert.equal(db.verifyJwt(sign({ sub: 'student-a' }, jwtSecret(), { algorithm: 'HS384', expiresIn: '5m' })), null);
  const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"student-a"}').toString('base64url')}.`;
  assert.equal(db.verifyJwt(unsigned), null);

  delete process.env.SUPABASE_JWT_SECRET;
  process.env.NODE_ENV = 'production';
  assert.throws(jwtSecret, ServiceUnavailableException);
  assert.equal(db.verifyJwt(valid), null);
  process.env.NODE_ENV = 'development';
  process.env.SUPABASE_URL = 'https://security.example.test';
  assert.throws(jwtSecret, ServiceUnavailableException);
  assert.equal(db.verifyJwt(valid), null);
  delete process.env.SUPABASE_URL;
  const localToken = sign({ sub: 'local-student', role: 'student' }, jwtSecret(), { expiresIn: '5m' });
  assert.equal(db.verifyJwt(localToken)?.sub, 'local-student');
  assert.equal(db.verifyJwt(sign({ sub: 'local-student' }, 'dev-insecure-secret', { expiresIn: '5m' })), null);
  const signer: StudentAuthService = Object.create(StudentAuthService.prototype);
  const localLogin = Reflect.get(signer, 'makeToken').call(signer, 'local-student');
  assert.equal(db.verifyJwt(localLogin)?.sub, 'local-student');
  process.env.NODE_ENV = 'production';
  assert.throws(() => Reflect.get(signer, 'makeToken').call(signer, 'student-a'), ServiceUnavailableException);
  assert.throws(() => Reflect.get(signer, 'makeRoleToken').call(signer, 'teacher-a', 'teacher'), ServiceUnavailableException);
});

test('HTTP authorization isolates student data and teacher test authoring', async (t) => {
  const old = process.env.SUPABASE_JWT_SECRET;
  process.env.SUPABASE_JWT_SECRET = 'test-only-http-security-key';
  t.after(() => {
    if (old === undefined) delete process.env.SUPABASE_JWT_SECRET; else process.env.SUPABASE_JWT_SECRET = old;
  });
  type Row = Record<string, unknown>;
  const tests: Row[] = [
    { id: 'test-a', teacher_id: 'teacher-a', school_id: 'school-a', class_name: 'Class 8', status: 'assigned' },
    { id: 'test-b', teacher_id: 'teacher-b', school_id: 'school-b', class_name: 'Class 8', status: 'assigned' },
    { id: 'test-draft', teacher_id: 'teacher-a', school_id: 'school-a', class_name: 'Class 8', status: 'draft' },
    { id: 'test-other-class', teacher_id: 'teacher-a', school_id: 'school-a', class_name: 'Class 9', status: 'assigned' },
  ];
  const tables: Record<string, Row[]> = {
    tests,
    test_questions: [{ id: 'question-a', test_id: 'test-a', text: 'Fixture question', options: ['A', 'B'], correct_option: 0 }],
    test_attempts: [{ id: 'attempt-b', test_id: 'test-a', student_id: 'student-b', score: null }],
    student_rewards: [],
    redemptions: [],
    settings: [{ id: 'settings-b', student_id: 'student-b', prefs: { private: true } }],
    progress_metrics: [],
  };
  let writes = 0;
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  db.client = {
    from(table: string) {
      const source = tables[table];
      assert.ok(source, `Unexpected table ${table}`);
      let rows = [...source];
      let insert: Row[] | undefined;
      let patch: Row | undefined;
      let remove = false;
      const query = {
        select: () => query,
        eq(key: string, value: unknown) { rows = rows.filter((row) => row[key] === value); return query; },
        in(key: string, values: unknown[]) { rows = rows.filter((row) => values.includes(row[key])); return query; },
        limit(count: number) { rows = rows.slice(0, count); return query; },
        order: () => query,
        insert(value: Row[]) { insert = value; return query; },
        update(value: Row) { patch = value; return query; },
        delete() { remove = true; return query; },
        then(resolve: (value: unknown) => void) {
          if (insert) {
            writes += 1;
            rows = insert.map((row, i) => ({ id: `insert-${writes}-${i}`, created_at: new Date().toISOString(), ...row }));
            source.push(...rows);
          }
          if (patch) { writes += 1; rows.forEach((row) => Object.assign(row, patch)); }
          if (remove) { writes += 1; rows.forEach((row) => source.splice(source.indexOf(row), 1)); }
          resolve({ data: rows, error: null });
        },
      };
      return query;
    },
  };
  @Module({
    controllers: [RewardsController, TestsController, SettingsController, ProgressController],
    providers: [
      AuthGuard, LocalFeedService,
      { provide: SupabaseService, useValue: db },
      { provide: StudentAuthService, useValue: {
        resolveStudentProfile: async () => ({ schoolId: 'school-a', className: 'Class 8' }),
      } },
      { provide: LearningScoreService, useValue: {} },
      { provide: OrchardService, useValue: {} },
    ],
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  // Avoid reading the developer's persisted local feed during this isolated test.
  app.get(LocalFeedService).onModuleInit = () => {};
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();
  const token = (sub: string, role = 'student', schoolId = 'school-a') =>
    sign({ sub, role, schoolId }, jwtSecret(), { expiresIn: '5m' });
  const student = token('student-a');
  const teacher = token('teacher-a', 'teacher');
  const otherTeacher = token('teacher-b', 'teacher', 'school-b');
  const request = (url: string, auth = student, method = 'GET', body?: Row) => fetch(`${base}${url}`, {
    method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  await t.test('forged and missing-subject tokens rejected at the guard', async () => {
    assert.equal((await request('/rewards', sign({ sub: 'student-a' }, 'wrong-key', { expiresIn: '5m' }))).status, 401);
    assert.equal((await request('/rewards', sign({ role: 'student' }, jwtSecret(), { expiresIn: '5m' }))).status, 401);
  });
  await t.test('cross-student reward/progress/settings writes rejected before database access', async () => {
    const before = writes;
    for (const route of ['/rewards/checkin', '/rewards/earn', '/rewards/redeem', '/progress', '/settings']) {
      assert.equal((await request(route, student, 'POST', { studentId: 'student-b', coins: 10 })).status, 403, route);
    }
    assert.equal((await request('/settings', student, 'POST', { student_id: 'student-b' })).status, 403);
    assert.equal(writes, before);
    const result = await request('/settings', student, 'POST', { id: 'settings-b', prefs: {} });
    assert.equal((await json(result)).success, false);
    assert.deepEqual(tables.settings[0].prefs, { private: true });
  });
  await t.test('own daily check-in works and is idempotent', async () => {
    const first = await request('/rewards/checkin', student, 'POST', { studentId: 'student-a' });
    assert.equal(first.status, 201);
    assert.equal((await json(first)).newBalance, 10);
    const second = await request('/rewards/checkin', student, 'POST', {});
    assert.equal((await json(second)).alreadyCheckedIn, true);
    assert.equal(tables.student_rewards.length, 1);
  });
  await t.test('students cannot access answer keys or teacher mutation routes', async () => {
    const before = writes;
    for (const [url, method, body] of [
      ['/tests/create', 'POST', {}],
      ['/tests/test-a', 'DELETE', undefined],
      ['/tests/test-a', 'PATCH', { title: 'tampered' }],
      ['/tests/test-a/assign', 'POST', {}],
      ['/tests/test-a/clone', 'POST', {}],
      ['/tests/test-a/questions', 'GET', undefined],
      ['/tests/test-a/questions', 'POST', {}],
      ['/tests/test-a/questions/question-a', 'PATCH', {}],
      ['/tests/test-a/questions/question-a', 'DELETE', undefined],
    ] as const) {
      assert.equal((await request(url, student, method, body)).status, 403, `${method} ${url}`);
    }
    assert.equal(writes, before);
  });
  await t.test('teacher can read own answer keys but cannot access another teacher school', async () => {
    assert.equal((await request('/tests/test-a/questions', teacher)).status, 200);
    assert.equal((await request('/tests/test-a/questions', otherTeacher)).status, 403);
    assert.equal((await request('/tests/test-a', otherTeacher, 'DELETE')).status, 403);
    const response = await request('/tests?filter=all', teacher);
    assert.deepEqual(objects((await json(response)).tests).map((row) => row.id), ['test-a', 'test-draft', 'test-other-class']);
  });
  await t.test('teacher create/edit/clone/questions/assign/delete flows retain ownership', async () => {
    const created = await json(await request('/tests/create', teacher, 'POST', {
      title: 'Security fixture', subject: 'Mathematics', className: 'Class 8',
      teacherId: 'teacher-b', schoolId: 'school-b',
    }));
    assert.equal(created.success, true);
    const id = object(created.test).id;
    const stored = tables.tests.find((row) => row.id === id);
    assert.equal(stored.teacher_id, 'teacher-a');
    assert.equal(stored.school_id, 'school-a');
    const updated = await json(await request(`/tests/${id}`, teacher, 'PATCH', { title: 'Updated fixture' }));
    assert.equal(updated.success, true);
    const added = await json(await request(`/tests/${id}/questions`, teacher, 'POST', {
      text: 'Question', options: ['A', 'B'], correctOption: 0,
    }));
    const questionId = object(added.question).id;
    assert.equal((await json(await request(`/tests/${id}/questions/${questionId}`, teacher, 'PATCH', {
      correctOption: 1,
    }))).success, true);
    const copied = await json(await request(`/tests/${id}/clone`, teacher, 'POST', {}));
    assert.equal(copied.success, true);
    const copyId = object(copied.test).id;
    assert.equal(tables.tests.find((row) => row.id === copyId).teacher_id, 'teacher-a');
    const assigned = await json(await request(`/tests/${id}/assign`, teacher, 'POST', {
      startAt: new Date(Date.now() - 60000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
    }));
    assert.equal(assigned.success, true);
    const cached = app.get(LocalFeedService).listTests().find((row) => row.id === id);
    assert.equal(cached.teacher_id, 'teacher-a');
    assert.equal(cached.school_id, 'school-a');
    assert.equal((await request(`/tests/${id}/questions/${questionId}`, teacher, 'DELETE')).status, 200);
    assert.equal((await request(`/tests/${id}`, teacher, 'DELETE')).status, 200);
    assert.equal((await request(`/tests/${copyId}`, teacher, 'DELETE')).status, 200);
  });
  await t.test('student lists and starts only assigned own-school own-class tests', async () => {
    const response = await request('/tests?filter=all');
    assert.deepEqual(objects((await json(response)).tests).map((row) => row.id), ['test-a']);
    for (const id of ['test-b', 'test-draft', 'test-other-class']) {
      assert.equal((await request(`/tests/${id}/start`, student, 'POST', {})).status, 403);
    }
    assert.equal((await request('/tests/test-a/start', student, 'POST', { studentId: 'student-b' })).status, 403);
    const start = await request('/tests/test-a/start', student, 'POST', { studentId: 'student-a' });
    const started = await json(start);
    assert.equal(start.status, 201);
    assert.equal(started.success, true);
    assert.equal(objects(started.questions)[0].correctOption, undefined);
    assert.equal(objects(started.questions)[0].correct_option, undefined);
    const submit = await request(`/tests/attempts/${started.attemptId}/submit`, student, 'POST', { answers: { 'question-a': 0 } });
    assert.equal((await json(submit)).score, 100);
  });
  await t.test('other students cannot submit or view another attempt including local fallback', async () => {
    const before = writes;
    const result = await request('/tests/attempts/attempt-b');
    assert.equal((await json(result)).result, null);
    const submit = await request('/tests/attempts/attempt-b/submit', student, 'POST', { answers: {} });
    assert.equal((await json(submit)).success, false);
    assert.equal((await request('/tests/attempts/attempt-b/submit', student, 'POST', { studentId: 'student-b' })).status, 403);
    const local = app.get(LocalFeedService).createAttempt('test-a', 'student-b');
    assert.equal((await request(`/tests/attempts/${local.id}`)).status, 403);
    assert.equal((await request(`/tests/attempts/${local.id}/submit`, student, 'POST', {})).status, 403);
    assert.equal(writes, before);
    const ownedLocal = app.get(LocalFeedService).createAttempt('test-a', 'student-a');
    const ownedResult = await json(await request(`/tests/attempts/${ownedLocal.id}`));
    assert.equal(object(ownedResult.result).student_id, 'student-a');
  });
});

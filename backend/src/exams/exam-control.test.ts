import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ExecutionContext, ForbiddenException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { LocalFeedService } from '../shared/local-feed.service';
import { TestsController } from '../controllers/tests.controller';
import { AuthGuard } from '../auth/auth.guard';
import { ExamControlService } from './exam-control.service';

type Row = Record<string, any>;
function fixture() {
  const exam = { id: 'test-a', title: 'Maths', school_id: 'school-a', teacher_id: 'teacher-a',
    class_name: 'Class 8', status: 'assigned', start_at: new Date(Date.now() - 60000).toISOString(),
    end_at: new Date(Date.now() + 3600000).toISOString() };
  const tables: Record<string, Row[]> = {
    tests: [exam], strict_test_settings: [{ test_id: exam.id, enabled: true }], strict_exam_sessions: [],
    test_questions: [{ id: 'q1', test_id: exam.id, text: '1 + 1?', options: ['2', '3'], correct_option: 0 }],
    test_attempts: [],
  };
  const failures = new Set<string>();
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  db.client = { isMock: true, from(table: string) {
    let filters: Array<(row: Row) => boolean> = [];
    let patch: Row | undefined;
    let insert: Row[] | undefined;
    let offset = 0; let end = Infinity;
    const query = {
      select() { return query; },
      eq(key: string, value: any) { filters.push((row) => row[key] === value); return query; },
      is(key: string, value: any) { filters.push((row) => (row[key] ?? null) === value); return query; },
      in(key: string, values: any[]) { filters.push((row) => values.includes(row[key])); return query; },
      order() { return query; },
      range(start: number, last: number) { offset = start; end = last; return query; },
      limit(count: number) { end = count - 1; return query; },
      update(value: Row) { patch = value; return query; },
      insert(value: Row[]) { insert = value; return query; },
      then(resolve: (result: any) => void) {
        if (failures.has(table)) return resolve({ data: null, error: { message: 'fixture unavailable' } });
        const source = tables[table] ||= [];
        if (insert) source.push(...insert.map((row) => ({ id: `row-${source.length}`, ...row })));
        const rows = source.filter((row) => filters.every((filter) => filter(row))).slice(offset, end + 1);
        if (patch) rows.forEach((row) => Object.assign(row, patch));
        resolve({ data: rows.map((row) => ({ ...row })), error: null });
      },
    };
    return query;
  } };
  const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
  auth.resolveStudentProfile = async (id: string) => ({ id, name: id, schoolId: 'school-a', className: 'Class 8', teacherId: 'teacher-a' });
  const feed: LocalFeedService = Object.create(LocalFeedService.prototype);
  feed.listTests = () => [];
  feed.getAttempt = () => null;
  feed.listAttemptsForStudent = () => [];
  feed.finishAttempt = () => null;
  feed.logStudentActivity = (studentId, activity) => ({ id: 'activity', studentId, type: activity.type, action: activity.action,
    title: activity.title, details: activity.details, meta: activity.meta, createdAt: new Date().toISOString() });
  const service = new ExamControlService(db, auth, feed);
  const controller = new TestsController(db, feed, auth, service);
  const req = (studentId = 'student-a') => ({ user: { sub: studentId, role: 'student', schoolId: 'school-a' }, studentId });
  const teacher = { user: { sub: 'teacher-a', role: 'teacher', schoolId: 'school-a' } };
  const start = (id = 'student-a', clientId = 'browser-client-a') => controller.start(req(id), exam.id, { clientId });
  const control = (attemptId: string, action: string, extra: Row = {}, studentId = 'student-a') =>
    controller.examControl(req(studentId), attemptId, { action, clientId: 'browser-client-a', ...extra });
  return { exam, tables, failures, db, feed, service, controller, req, teacher, start, control };
}

test('only the affected student is paused; saved answers and timer survive resume and controller recreation', async () => {
  const f = fixture();
  const a = await f.start(); const b = await f.start('student-b');
  assert.ok(a.attemptId && b.attemptId);
  await f.control(a.attemptId, 'save', { answers: { q1: 0 } });
  await f.control(a.attemptId, 'pause', { reason: 'tab_hidden' });
  await f.control(a.attemptId, 'pause', { reason: 'window_blur' });
  const paused = await f.service.session(f.exam.id, 'student-a');
  assert.equal(paused?.status, 'paused');
  assert.equal(paused.incident_count, 1);
  assert.equal((await f.service.session(f.exam.id, 'student-b'))?.status, 'active');
  const rejected = await f.control(a.attemptId, 'save', { answers: { q1: 1 } });
  assert.deepEqual(rejected.control.answers, { q1: 0 });
  await assert.rejects(f.controller.submit(f.req(), a.attemptId, { clientId: 'browser-client-a', answers: { q1: 1 } }), ForbiddenException);
  const restored = await f.start();
  assert.equal(restored.attemptId, a.attemptId);
  assert.ok('control' in restored);
  assert.equal(restored.control?.status, 'paused');
  const end = f.exam.end_at;
  await f.controller.resumeExam(f.teacher, f.exam.id, 'student-a');
  const freshService = new ExamControlService(f.db, Object.assign(Object.create(StudentAuthService.prototype), {
    resolveStudentProfile: async () => ({ schoolId: 'school-a', className: 'Class 8' }),
  }), f.feed);
  assert.equal((await freshService.session(f.exam.id, 'student-a'))?.status, 'active');
  assert.equal(f.exam.end_at, end);
  assert.deepEqual((await f.control(a.attemptId, 'heartbeat')).control.answers, { q1: 0 });
});

test('expiry freezes saved answers, finalizes a paused attempt and releases Tutor restrictions', async () => {
  const f = fixture();
  assert.equal((await f.service.restrictions('student-a')).length, 1);
  const a = await f.start();
  await f.control(a.attemptId, 'save', { answers: { q1: 0 } });
  await f.control(a.attemptId, 'pause', { reason: 'app_background' });
  f.exam.end_at = new Date(Date.now() - 1).toISOString();
  await f.controller['finishExpiredStrictExams']();
  assert.equal(f.tables.test_attempts[0].score, 100);
  assert.equal((await f.service.session(f.exam.id, 'student-a'))?.status, 'closed');
  assert.ok((await f.service.session(f.exam.id, 'student-a'))?.finalized_at);
  assert.deepEqual(await f.service.restrictions('student-a'), []);
  await assert.rejects(f.controller.resumeExam(f.teacher, f.exam.id, 'student-a'), /ended/);
  const res = await f.controller.submit(f.req(), a.attemptId, { clientId: 'browser-client-a', answers: { q1: 1 } });
  assert.equal(res.score, 100);
});

test('heartbeat gaps and another device pause instead of providing a reload bypass', async () => {
  const f = fixture();
  const a = await f.start();
  f.tables.strict_exam_sessions[0].last_seen = new Date(Date.now() - 26000).toISOString();
  assert.equal((await f.control(a.attemptId, 'heartbeat')).control.lastReason, 'connection_lost');
  await f.controller.resumeExam(f.teacher, f.exam.id, 'student-a');
  await f.control(a.attemptId, 'heartbeat');
  const other = await f.start('student-a', 'another-browser');
  assert.ok('control' in other);
  assert.equal(other.control?.status, 'paused');
  assert.equal(other.control?.lastReason, 'another_device');
});

test('ownership, school scope, student identity and answer validation are enforced on the server', async () => {
  const f = fixture(); const a = await f.start();
  await assert.rejects(f.control(a.attemptId, 'pause', { reason: 'tab_hidden' }, 'student-b'), NotFoundException);
  for (const teacher of [
    { user: { sub: 'teacher-b', role: 'teacher', schoolId: 'school-a' } },
    { user: { sub: 'teacher-a', role: 'teacher', schoolId: 'school-b' } }, f.req(),
  ]) {
    await assert.rejects(f.controller.examStudents(teacher, f.exam.id), ForbiddenException);
    await assert.rejects(f.controller.resumeExam(teacher, f.exam.id, 'student-a'), ForbiddenException);
  }
  await assert.rejects(f.control(a.attemptId, 'save', { answers: { q1: 9 } }), /Invalid exam answer/);
  await assert.rejects(f.control(a.attemptId, 'save', { answers: { fake: 0 } }), /Invalid exam answer/);
  await assert.rejects(f.control(a.attemptId, 'pause', { reason: 'invented' }), /Invalid exam incident/);
});

test('Tutor is blocked before starting, released after submit, and unrelated school/class/draft tests do not block', async () => {
  const f = fixture();
  await assert.rejects(f.service.assertTutorAccess('student-a'), (error: HttpException) => error.getStatus() === 423);
  const a = await f.start();
  assert.equal((await f.controller.submit(f.req(), a.attemptId, { clientId: 'browser-client-a', answers: { q1: 0 } })).success, true);
  await f.service.assertTutorAccess('student-a');
  for (const patch of [{ school_id: 'school-b' }, { class_name: 'Class 9' }, { status: 'draft' }]) {
    const other = fixture(); Object.assign(other.exam, patch);
    assert.deepEqual(await other.service.restrictions('student-a'), []);
  }
});

test('strict mode is opt-in and database failures fail explicitly rather than allowing answers', async () => {
  const f = fixture();
  await f.service.configure(f.exam.id, false);
  assert.deepEqual(await f.service.restrictions('student-a'), []);
  const a = await f.controller.start(f.req(), f.exam.id, {});
  assert.equal(a.success, true);
  assert.equal((await f.controller.submit(f.req(), a.attemptId, { answers: { q1: 0 } })).score, 100);
  f.failures.add('strict_test_settings');
  await assert.rejects(f.service.assertTutorAccess('student-a'), ServiceUnavailableException);
  assert.equal((await f.start()).success, false);
});

test('concurrent pause/save cannot overwrite the pause or change answers afterwards', async () => {
  const f = fixture(); const a = await f.start();
  await Promise.all([
    f.control(a.attemptId, 'pause', { reason: 'tab_hidden' }),
    f.control(a.attemptId, 'save', { answers: { q1: 0 } }),
  ]);
  assert.equal((await f.service.session(f.exam.id, 'student-a'))?.status, 'paused');
  const before = (await f.service.session(f.exam.id, 'student-a'))?.answers;
  await f.control(a.attemptId, 'save', { answers: { q1: 1 } });
  assert.deepEqual((await f.service.session(f.exam.id, 'student-a'))?.answers, before);
});

test('authenticated student Tutor and game endpoints are guarded, including Quick Sam and voice', async () => {
  const f = fixture();
  f.db.verifyJwt = async () => ({ sub: 'student-a', role: 'student' });
  const guard = new AuthGuard(f.db, f.service);
  for (const url of ['/chat', '/chat/quick', '/chat/history', '/chat/transcribe', '/chat/story/generate', '/games/quiz-rush/questions']) {
    const req = { headers: { authorization: 'fixture' }, originalUrl: url };
    const context = { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
    await assert.rejects(guard.canActivate(context), (error: HttpException) => error.getStatus() === 423);
  }
  const req = { headers: { authorization: 'fixture' }, originalUrl: '/support/chat' };
  assert.equal(await guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext), true);
  req.originalUrl = '/chat/student?studentId=student-a';
  assert.equal(await guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext), true);
});

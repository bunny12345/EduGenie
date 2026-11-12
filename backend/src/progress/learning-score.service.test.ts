import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { OrchardService } from '../orchard/orchard.service';
import { ACTIVITY_EFFECTS } from '../orchard/orchard.constants';
import { LearningScoreService } from './learning-score.service';
import { LocalFeedService } from '../shared/local-feed.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { ProgressController } from '../controllers/progress.controller';
import { TestsController } from '../controllers/tests.controller';
import { ExamControlService } from '../exams/exam-control.service';

type Row = Record<string, unknown>;

function at(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  if (daysAgo) date.setHours(9, 0, 0, 0);
  else date.setMinutes(date.getMinutes() - 1);
  return date.toISOString();
}

function dayKey(daysAgo: number): string {
  const date = new Date(at(daysAgo));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fixture(initial: Record<string, Row[]> = {}, failingTable = '', isMock = true) {
  const tables: Record<string, Row[]> = {
    orchard_chapters: (initial.chapter_growth || []).map((r) => ({ id: r.chapter_id, class_name: 'Class 8' })),
    ...initial,
    students: (initial.students || [{ id: 'student', created_at: at(60) }]).map((row) => ({ school_id: 'school', ...row })),
    homework: (initial.homework || []).map((r) => ({ student_id: 'student', ...r })),
  };
  const requests: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const failingWrites = new Set<string>();
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  Object.defineProperty(db, 'client', { value: {
    isMock,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let ids: unknown[] | null = null;
      let start = 0;
      let end = Infinity;
      let patch: Row | undefined;
      let inserted: Row[] | undefined;
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        is(key: string, value: unknown) { filters[key] = value; return query; },
        update(value: Row) { patch = value; return query; },
        insert(value: Row[]) { inserted = value; return query; },
        in(_key: string, values: unknown[]) { ids = values; return query; },
        order() { return query; },
        range(from: number, to: number) { start = from; end = to; return query; },
        limit(count: number) { end = count - 1; return query; },
        then(resolve: (result: { data: Row[]; error: { message: string } | null }) => void) {
          if (inserted && table !== failingTable && !failingWrites.has(table)) {
            (tables[table] ||= []).push(...inserted);
          }
          requests.push({ table, filters });
          if (!isMock && ids?.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id)))) {
            return resolve({ data: [], error: { message: 'invalid input syntax for type uuid' } });
          }
          const rows = (tables[table] || []).filter((row) =>
            Object.entries(filters).every(([key, value]) => (value === null ? row[key] == null : row[key] === value))
              && (!ids || ids.includes(row.id)));
          if (patch && !failingWrites.has(table)) rows.forEach((row) => Object.assign(row, patch));
          resolve({
            data: rows.slice(start, end + 1),
            error: table === failingTable || ((patch || inserted) && failingWrites.has(table)) ? { message: 'simulated query failure' } : null,
          });
        },
      };
      return query;
    },
  } });
  const orchard: OrchardService = Object.create(OrchardService.prototype);
  Object.defineProperty(orchard, 'resolveStudentSubjectKeys', { value: async () => ['science', 'english', 'telugu'] });
  Object.defineProperty(orchard, 'resolveStudentClassName', { value: async () => 'Class 8' });
  const localFeed = new LocalFeedService();
  const auth: StudentAuthService = Object.create(StudentAuthService.prototype);
  auth.resolveStudentProfile = async () => ({ id: 'student', name: 'Student', schoolId: 'school', className: 'Class 8', teacherId: '' });
  const service = new LearningScoreService(db, orchard, localFeed, auth);
  return {
    service, tables, requests, localFeed, failingWrites,
    progressController: new ProgressController(db, service, orchard),
    testsController: new TestsController(db, localFeed, auth, new ExamControlService(db, auth, localFeed)),
  };
}

function own(rows: Row[]): Row[] {
  return rows.map((row, i) => ({ id: `row-${i}`, student_id: 'student', ...row }));
}

test('concurrent reports share reads per student, without caching completed results', async () => {
  const { service, requests } = fixture();
  const [first, second] = await Promise.all([
    service.getLearningScore('student'), service.getLearningScore('student'),
  ]);
  assert.deepEqual(first, second);
  assert.equal(requests.filter((request) => request.table === 'messages').length, 1);
  await service.getLearningScore('student');
  assert.equal(requests.filter((request) => request.table === 'messages').length, 2);
  await Promise.all([service.getLearningScore('student'), service.getLearningScore('another-student')]);
  assert.equal(requests.filter((request) => request.table === 'messages').length, 4);
});

test('a failed report is not retained and subsequent requests can retry', async () => {
  const { service, requests } = fixture({}, 'messages');
  await assert.rejects(service.getLearningScore('student'), ServiceUnavailableException);
  await assert.rejects(service.getLearningScore('student'), ServiceUnavailableException);
  assert.equal(requests.filter((request) => request.table === 'messages').length, 2);
});

function assertEndpoints(report: Awaited<ReturnType<LearningScoreService['getLearningScore']>>) {
  assert.equal(report.dailyTrend.at(-1).score, report.score);
  const currentMonth = report.trend.filter((point: { future: boolean }) => !point.future).at(-1);
  assert.equal(currentMonth.score, report.score);
  for (const subject of report.subjects) {
    assert.equal(subject.daily.at(-1).value, subject.score);
    assert.equal(subject.monthly.filter((point: { future: boolean }) => !point.future).at(-1).value, subject.score);
    assert.ok(subject.daily.every((point: { value: number }) => point.value >= 0 && point.value <= 100));
    assert.ok(subject.monthly.filter((point: { future: boolean }) => point.future).every((point: { value: unknown }) => point.value === null));
  }
}

test('Orchard-only learning appears on its actual days, including retention and mastery', async () => {
  const types = ['lesson', 'question', 'story', 'homework', 'quiz', 'flashcards',
    'active_recall', 'explain_back', 'memory_challenge', 'word_problem', 'real_life', 'project'];
  const activity = types.map((type, index) => ({
    subject_key: 'science', chapter_id: 'chapter', activity_type: type,
    sunlight: ACTIVITY_EFFECTS[type].sunlight, occurred_at: at(10 - Math.floor(index / 2)),
    created_at: at(0),
  }));
  for (let i = 0; i < 8; i++) activity.push({
    subject_key: 'science', chapter_id: 'chapter', activity_type: 'revision',
    sunlight: 1, occurred_at: at(1), created_at: at(0),
  });
  const { service } = fixture({
    orchard_trees: own([{ subject_key: 'science', total_chapters: 1, sunlight_pct: 100, last_activity_at: at(1) }]),
    chapter_growth: own([{ subject_key: 'science', chapter_id: 'chapter', stage_index: 7, roots_pct: 90, stage_updated_at: at(1) }]),
    orchard_activity: own(activity),
    orchard_reviews: own([
      { subject_key: 'science', chapter_id: 'chapter', review_type: 'week', passed: true, completed_at: at(3) },
      { subject_key: 'science', chapter_id: 'chapter', review_type: 'month', passed: true, completed_at: at(2) },
    ]),
  });
  const result = await service.getLearningScore('student');
  const science = result.subjects[0];
  const value = (day: number) => science.daily.find((p: { key: string }) => p.key === dayKey(day)).value;
  assert.equal(value(11), 0);
  assert.ok(value(10) > 0);
  assert.ok(value(3) > value(4));
  assert.ok(value(2) > value(3));
  assert.ok(value(1) > value(2));
  assert.equal(science.metrics.find((m: { key: string }) => m.key === 'understanding').value, 90);
  assert.equal(science.metrics.find((m: { key: string }) => m.key === 'growth').value, 100);
  assert.equal(science.stats.find((s: { key: string }) => s.key === 'rounds').value, 0);
  assert.equal(result.subjects[1].score, 0);
  assert.ok(result.score > 0);
  assertEndpoints(result);
});

test('partial tree growth counts before a chapter fruits; later activity cannot rescale earlier days', async () => {
  const { service, tables } = fixture({
    orchard_trees: own([{ subject_key: 'science', total_chapters: 1, progress_pct: 0 }]),
    chapter_growth: own([{ subject_key: 'science', chapter_id: 'chapter', stage_index: 1, roots_pct: 4, stage_updated_at: at(4) }]),
    orchard_activity: own(['lesson', 'question', 'story'].map((type) => ({
      subject_key: 'science', chapter_id: 'chapter', activity_type: type, occurred_at: at(4),
    }))),
  });
  const before = await service.getLearningScore('student');
  assert.equal(before.subjects[0].metrics.find((m: { key: string }) => m.key === 'growth').value, 14);
  tables.orchard_activity.push(...own(['homework', 'quiz', 'flashcards'].map((type) => ({
    subject_key: 'science', chapter_id: 'chapter', activity_type: type, occurred_at: at(1),
  }))));
  tables.chapter_growth[0] = { ...tables.chapter_growth[0], roots_pct: 13, stage_index: 2, stage_updated_at: at(1) };
  const after = await service.getLearningScore('student');
  assert.equal(after.subjects[0].daily.find((p: { key: string }) => p.key === dayKey(4)).value,
    before.subjects[0].daily.find((p: { key: string }) => p.key === dayKey(4)).value);
  assert.ok(after.subjects[0].score > before.subjects[0].score);
  assertEndpoints(after);
});

test('tests resolve assignment subjects and use finished_at and percentage scores, not start time', async () => {
  const { service } = fixture({
    tests: [{ id: 'test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(9) }],
    test_attempts: own([
      { test_id: 'test', started_at: at(9), created_at: at(9), finished_at: at(3), score: 80 },
      { test_id: 'test', started_at: at(1), score: null },
      { test_id: 'test', started_at: at(1) },
    ]),
    progress_metrics: own([{ subject: 'Science', metric_value: 80, recorded_at: at(3), details: { source: 'test' } }]),
  });
  const result = await service.getLearningScore('student');
  const science = result.subjects[0];
  assert.equal(science.score, 80);
  assert.equal(science.bestTest, 80);
  assert.equal(science.stats.find((s: { key: string }) => s.key === 'tests').value, 1);
  assert.equal(science.metrics.find((m: { key: string }) => m.key === 'practice').value, 0);
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(4)).value, 0);
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(3)).value, 80);
  assertEndpoints(result);
});

test('homework uses submitted / assigned, ignoring grades and duplicate resubmissions', async () => {
  const { service } = fixture({
    homework: [{ id: 'hw', subject: 'Science' }],
    homework_attempts: own([
      { homework_id: 'hw', created_at: at(5), score: null },
      { homework_id: 'hw', created_at: at(3), score: 80 },
    ]),
  });
  const result = await service.getLearningScore('student');
  const science = result.subjects[0];
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(5)).value, 100);
  assert.equal(science.score, 100);
  assert.equal(science.stats.find((s: { key: string }) => s.key === 'homework').value, 1);
  assert.equal(science.metrics.find((m: { key: string }) => m.key === 'homework').value, 100);
  assert.ok(result.dimensions.find((d: { key: string }) => d.key === 'homework').value > 0);
  assertEndpoints(result);
});

test('standalone flashcard and progress metric practice are included without game sessions', async () => {
  const { service } = fixture({
    flashcard_progress: own([{ subject_key: 'Science', review_count: 10, correct_count: 8, box: 3, created_at: at(9), last_reviewed_at: at(3) }]),
    progress_metrics: own([{ subject: 'English', metric_value: 65, recorded_at: at(4), details: { source: 'activity', minutes: 15 } }]),
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.subjects[0].score, 80);
  assert.equal(result.subjects[0].daily.find((p: { key: string }) => p.key === dayKey(4)).value, 0);
  assert.equal(result.subjects[1].score, 65);
  assert.ok(result.hasData);
  assertEndpoints(result);
});

test('mixed games and flashcards contribute together to both current and historical practice', async () => {
  const { service } = fixture({
    game_sessions: own([{ subject_key: 'science', score: 1, total: 2, ended_at: at(3) }]),
    flashcard_progress: own([{ subject_key: 'science', review_count: 10, correct_count: 9, last_reviewed_at: at(3) }]),
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.subjects[0].metrics.find((m: { key: string }) => m.key === 'practice').value, 70);
  assert.equal(result.subjects[0].score, 70);
  assertEndpoints(result);
});

test('unlinked legacy test metrics earn neither test nor practice credit', async () => {
  const { service } = fixture({
    progress_metrics: own([{ subject: 'Science', metric_value: 72, recorded_at: at(3), details: { source: 'mock_test' } }]),
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.subjects[0].score, 0);
  assert.equal(result.subjects[0].metrics.find((m: { key: string }) => m.key === 'tests').value, 0);
  assert.equal(result.subjects[0].metrics.find((m: { key: string }) => m.key === 'practice').value, 0);
  assertEndpoints(result);
});

test('all five subject components use the same documented weights for score and graph', async () => {
  const { service } = fixture({
    orchard_trees: own([{ subject_key: 'science', total_chapters: 1 }]),
    chapter_growth: own([{ subject_key: 'science', chapter_id: 'chapter', stage_index: 7, roots_pct: 90, stage_updated_at: at(3) }]),
    tests: [{ id: 'test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(3) }],
    test_attempts: own([{ test_id: 'test', subject: 'Science', score: 16, max_score: 20, finished_at: at(3) }]),
    game_sessions: own([{ subject_key: 'science', score: 6, total: 10, ended_at: at(3) }]),
    homework_attempts: own(Array.from({ length: 8 }, (_, i) => ({ homework_id: `hw-${i}`, subject: 'Science', score: 100, created_at: at(3) }))),
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.subjects[0].score, 85); // growth20 + roots18 + tests20 + practice12 + homework15.
  assert.equal(result.subjects[0].metrics.length, 5);
  assertEndpoints(result);
});

test('lower later test performance lowers the curve rather than forcing monotonic improvement', async () => {
  const { service } = fixture({
    tests: [{ id: 'test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(4) }],
    test_attempts: own([{ test_id: 'test', score: 100, finished_at: at(4) }, { test_id: 'test', score: 20, finished_at: at(1) }]),
  });
  const result = await service.getLearningScore('student');
  const science = result.subjects[0];
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(4)).value, 100);
  assert.equal(science.score, 20); // Latest result per assigned test, not an average of retries.
  assertEndpoints(result);
});

test('all pages are read with student scoping and failed reads surface explicitly', async () => {
  const { service, requests } = fixture({
    game_sessions: [
      ...own(Array.from({ length: 1100 }, () => ({ subject_key: 'science', score: 1, total: 2, ended_at: at(3) }))),
      { id: 'other', student_id: 'another-student', subject_key: 'science', score: 2, total: 2, ended_at: at(3) },
    ],
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.subjects[0].score, 50);
  assert.equal(result.subjects[0].stats.find((s: { key: string }) => s.key === 'rounds').value, 1100);
  assert.equal(requests.filter((r) => r.table === 'game_sessions').length, 3);
  assert.ok(requests.filter((r) => r.table === 'game_sessions').every((r) => r.filters.student_id === 'student'));
  await assert.rejects(fixture({}, 'orchard_activity').service.getLearningScore('student'), ServiceUnavailableException);
});

test('fresh students stay at zero and failed or uncompleted retention checks earn no credit', async () => {
  const { service } = fixture({
    orchard_trees: own([{ subject_key: 'science', total_chapters: 1 }]),
    chapter_growth: own([{ subject_key: 'science', chapter_id: 'chapter', stage_index: 0, roots_pct: 0, stage_updated_at: at(4) }]),
    orchard_reviews: own([{ subject_key: 'science', chapter_id: 'chapter', review_type: 'month', passed: false, completed_at: null }]),
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.score, 0);
  assert.equal(result.hasData, false);
  assert.equal(result.subjects[0].status, 'not-started');
  assertEndpoints(result);
});

test('returning students still see the current academic year and current score', async () => {
  const { service } = fixture({
    students: [{ id: 'student', created_at: at(1100) }],
    test_attempts: own([{ subject: 'Science', score: 70, finished_at: at(3) }]),
  });
  const result = await service.getLearningScore('student');
  assert.ok(result.trend.length <= 24);
  assert.ok(new Date(result.academicEndAt).getTime() > Date.now());
  assertEndpoints(result);
});

test('previous-class chapter growth does not inflate the current subject tree', async () => {
  const { service } = fixture({
    orchard_trees: own([{ subject_key: 'science', total_chapters: 1 }]),
    orchard_chapters: [{ id: 'current', class_name: 'Class 8' }, { id: 'previous', class_name: 'Class 7' }],
    chapter_growth: own([
      { subject_key: 'science', chapter_id: 'current', stage_index: 0, roots_pct: 0, stage_updated_at: at(3) },
      { subject_key: 'science', chapter_id: 'previous', stage_index: 7, roots_pct: 100, stage_updated_at: at(3) },
    ]),
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.subjects[0].score, 0);
  assert.equal(result.subjects[0].metrics.find((m: { key: string }) => m.key === 'growth').value, 0);
  assertEndpoints(result);
});

test('future-dated evidence does not contribute to today or historical points', async () => {
  const { service } = fixture({
    orchard_trees: own([{ subject_key: 'science', total_chapters: 1 }]),
    chapter_growth: own([{ subject_key: 'science', chapter_id: 'chapter', stage_index: 7, roots_pct: 100, stage_updated_at: at(-2) }]),
    orchard_activity: own([{ subject_key: 'science', chapter_id: 'chapter', activity_type: 'revision', occurred_at: at(-2) }]),
    test_attempts: own([{ subject: 'Science', score: 100, finished_at: at(-2) }]),
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.subjects[0].score, 0);
  assert.equal(result.score, 0);
  assert.equal(result.hasData, false);
  assert.equal(result.subjects[0].status, 'not-started');
  assertEndpoints(result);
});

test('production UUID queries exclude legacy local IDs while retaining mixed historical attempts', async () => {
  const databaseTest = '11111111-1111-1111-1111-111111111111';
  const databaseHomework = '22222222-2222-2222-2222-222222222222';
  const { service, requests, localFeed } = fixture({
    tests: [{ id: databaseTest, subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(4) }],
    homework: [{ id: databaseHomework, subject: 'Science' }],
    test_attempts: own([
      { test_id: databaseTest, score: 80, finished_at: at(3) },
      { test_id: 'local-test-1791399844044', score: 60, finished_at: at(2) },
      { test_id: 'local-test-deleted', score: 40, finished_at: at(1) },
    ]),
    homework_attempts: own([
      { homework_id: databaseHomework, score: 90, created_at: at(3) },
      { homework_id: 'local-homework-deleted', subject: 'Science', score: 70, created_at: at(2) },
    ]),
  }, '', false);
  Object.defineProperty(localFeed, 'listTests', { value: () => [{
    id: 'local-test-1791399844044', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(4),
  }] });
  const result = await service.getLearningScore('student');
  assert.equal(result.success, true);
  assert.equal(result.subjects[0].metrics.find((m: { key: string }) => m.key === 'tests').value, 70);
  assert.equal(result.subjects[0].stats.find((s: { key: string }) => s.key === 'tests').value, 2);
  assert.equal(result.subjects[0].stats.find((s: { key: string }) => s.key === 'homework').value, 2);
  assert.equal(result.dimensions.find((d: { key: string }) => d.key === 'tests').value, 70);
  assert.equal(requests.filter((r) => r.table === 'tests').length, 1);
  assertEndpoints(result);
});

test('legacy-only deleted assignment metadata does not prevent a report loading', async () => {
  const { service, requests } = fixture({
    test_attempts: own([{ test_id: 'local-test-1791399844044', score: 75, finished_at: at(3) }]),
  }, '', false);
  const result = await service.getLearningScore('student');
  assert.equal(result.success, true);
  assert.equal(result.dimensions.find((d: { key: string }) => d.key === 'tests').value, 0);
  assert.equal(requests.filter((r) => r.table === 'tests').length, 1);
  assertEndpoints(result);
});

test('genuine database assignment failures are still surfaced instead of hidden as legacy IDs', async () => {
  const { service } = fixture({
    test_attempts: own([{ test_id: '11111111-1111-1111-1111-111111111111', score: 75, finished_at: at(3) }]),
  }, 'tests', false);
  await assert.rejects(service.getLearningScore('student'), ServiceUnavailableException);
});

test('Telugu assigned zero-mark test does not inherit 62% from six old unlinked metrics', async () => {
  const { service, localFeed } = fixture({
    orchard_trees: own([{ subject_key: 'telugu', total_chapters: 0 }]),
    tests: [{ id: 'telugu-test', subject: 'Telugu', school_id: 'school', status: 'assigned', created_at: at(10) }],
    test_attempts: own([{ test_id: 'telugu-test', subject: 'Telugu', score: 0, finished_at: at(3) }]),
    progress_metrics: own([100, 100, 100, 100, 0, 33].map((value) => ({
      subject: 'Telugu', metric_value: value, recorded_at: at(40), details: { source: 'test' },
    }))),
  });
  Object.defineProperty(localFeed, 'listHomeworkForStudent', { value: () => own([
    { id: 'local-hw-one', subject: 'Telugu', class_name: 'Class 8', status: 'submitted', grade: 0, submitted_at: at(20) },
    { id: 'local-hw-two', subject: 'Telugu', class_name: 'Class 8', status: 'submitted', grade: null, submitted_at: at(19) },
    { id: 'local-hw-three', subject: 'Telugu', class_name: 'Class 8', status: 'submitted', grade: null, submitted_at: at(19) },
    { id: 'pending', subject: 'Telugu', status: 'pending' },
    { id: 'other-class', subject: 'Telugu', class_name: 'Class 7', status: 'submitted', submitted_at: at(20) },
  ]) });
  const result = await service.getLearningScore('student');
  const telugu = result.subjects.find((s: { subjectKey: string }) => s.subjectKey === 'telugu');
  assert.equal(telugu.metrics.find((m: { key: string }) => m.key === 'homework').value, 75); // Three submitted out of four assigned.
  assert.equal(telugu.stats.find((s: { key: string }) => s.key === 'homework').value, 3);
  assert.equal(telugu.metrics.find((m: { key: string }) => m.key === 'tests').value, 0);
  assert.deepEqual(telugu.testPerformance, { assigned: 1, completed: 1, averageMarks: 0, completionRate: 100, score: 0 });
  assert.equal(telugu.score, 28); // (0 * .25 + 75 * .15) / .4.
  assert.ok(telugu.daily.every((p: { value: number }) => p.value > 0));
  assertEndpoints(result);
});

test('DB homework submission status is evidence even without a subject column or attempt ledger', async () => {
  const id = '33333333-3333-3333-3333-333333333333';
  const { service, localFeed } = fixture({
    homework: own([{ id, status: 'submitted', submitted_at: at(4) }]),
  }, '', false);
  Object.defineProperty(localFeed, 'listHomeworkForStudent', { value: () => own([
    { id, subject: 'Telugu', class_name: 'Class 8', status: 'pending' },
  ]) });
  const result = await service.getLearningScore('student');
  const telugu = result.subjects.find((s: { subjectKey: string }) => s.subjectKey === 'telugu');
  assert.equal(telugu.score, 100);
  assert.equal(telugu.stats.find((s: { key: string }) => s.key === 'homework').value, 1);
  assertEndpoints(result);
});

test('assignment status does not duplicate submissions and grades do not alter completion scores', async () => {
  const { service } = fixture({
    homework: own([
      { id: 'existing', subject: 'Science', status: 'submitted', submitted_at: at(5) },
      { id: 'graded', subject: 'Science', status: 'graded', submitted_at: at(5), updated_at: at(1), grade: 80 },
      { id: 'undated', subject: 'Science', status: 'submitted' },
    ]),
    homework_attempts: own([{ homework_id: 'existing', subject: 'Science', created_at: at(5), score: null }]),
  });
  const result = await service.getLearningScore('student');
  const science = result.subjects[0];
  assert.equal(science.stats.find((s: { key: string }) => s.key === 'homework').value, 2);
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(5)).value, 100);
  assert.equal(science.score, 67); // Two dated submissions out of three assignments.
  assertEndpoints(result);
});

test('assigned test marks exclude both old unlinked metrics and mirrored metric writes', async () => {
  const { service } = fixture({
    tests: [{ id: 'test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(5) }],
    test_attempts: own([{ test_id: 'test', subject: 'Science', score: 0, finished_at: at(2) }]),
    progress_metrics: own([
      { subject: 'Science', metric_value: 80, recorded_at: at(4), details: { source: 'test' } },
      { subject: 'Science', metric_value: 0, recorded_at: at(2), details: { source: 'test' } },
    ]),
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.subjects[0].score, 0);
  assert.equal(result.subjects[0].daily.find((p: { key: string }) => p.key === dayKey(4)).value, 0);
  assertEndpoints(result);
});

test('all subject scores and the overall graph use exact source values and independent weights', async () => {
  const { service } = fixture({
    orchard_trees: own([
      { subject_key: 'science', total_chapters: 1, sunlight_pct: 10, last_activity_at: at(3) },
      { subject_key: 'english', total_chapters: 1, sunlight_pct: 30, last_activity_at: at(2) },
      { subject_key: 'removed-subject', total_chapters: 20, sunlight_pct: 100, last_activity_at: at(2) },
    ]),
    chapter_growth: own([
      { subject_key: 'science', chapter_id: 'science-chapter', stage_index: 3, roots_pct: 50, stage_updated_at: at(3) },
      { subject_key: 'english', chapter_id: 'english-chapter', stage_index: 0, roots_pct: 0, stage_updated_at: at(2) },
    ]),
    tests: [
      { id: 'science-test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(3) },
      { id: 'english-test', subject: 'English', school_id: 'school', status: 'assigned', created_at: at(2) },
    ],
    test_attempts: own([
      { test_id: 'science-test', subject: 'Science', score: 80, finished_at: at(3) },
      { test_id: 'english-test', subject: 'English', score: 40, finished_at: at(2) },
    ]),
    game_sessions: own([
      { subject_key: 'science', chapter_id: 'science-chapter', score: 1, total: 2, ended_at: at(3) },
      { subject_key: 'english', chapter_id: 'english-chapter', score: 2, total: 2, ended_at: at(2) },
    ]),
    flashcard_progress: own([{ subject_key: 'science', review_count: 10, correct_count: 8, box: 2, last_reviewed_at: at(2) }]),
    homework_attempts: own([
      { homework_id: 'science-hw', subject: 'Science', score: null, created_at: at(5) },
      { homework_id: 'english-hw', subject: 'English', score: null, created_at: at(4) },
    ]),
  });
  const report = await service.getLearningScore('student');
  assert.equal(report.subjects[0].score, 67);
  assert.equal(report.subjects[1].score, 45);
  assert.equal(report.subjects[2].score, 0);
  const practice = (50 + 100 + 80) / 3;
  const expected = {
    understanding: .4 * 25 + .1 * (3 / 14 * 100) + .3 * 60 + .2 * practice,
    tests: 60,
    homework: 100,
    consistency: .5 * (4 / 21 * 100) + .5 * (4 / 20 * 100),
    revision: .4 * practice + .3 * 40 + .3 * (10 / 120 * 100),
    focus: .4 * 75,
    confidence: .5 * 20 + .3 * 60,
    curiosity: .5 * (2 / 12 * 100),
    speaking: 0,
  };
  const weights = { understanding: .16, tests: .14, homework: .13, consistency: .12, revision: .11, focus: .10, confidence: .09, curiosity: .08, speaking: .07 };
  for (const dimension of report.dimensions) assert.equal(dimension.value, Math.round(expected[dimension.key]), dimension.key);
  assert.equal(report.score, Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + expected[key] * weight, 0) * 10));
  assertEndpoints(report);
});

test('homework, tests, games and check-ins all count toward overall consistency without Orchard events', async () => {
  const { service } = fixture({
    homework_attempts: own([{ subject: 'Science', homework_id: 'hw', created_at: at(5) }]),
    tests: [{ id: 'test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(4) }],
    test_attempts: own([{ test_id: 'test', subject: 'Science', score: 70, finished_at: at(4) }]),
    game_sessions: own([{ subject_key: 'science', score: 1, total: 2, ended_at: at(3) }]),
    student_rewards: own([{ reward_type: 'coin', amount: 10, created_at: at(2) }]),
  });
  const report = await service.getLearningScore('student');
  assert.equal(report.dimensions.find((d: { key: string }) => d.key === 'consistency').value, 20);
  assertEndpoints(report);
});

test('a later watering activity cannot erase historical confidence from earlier dated sunlight', async () => {
  const { service, tables } = fixture({
    orchard_trees: own([{ subject_key: 'science', total_chapters: 0, sunlight_pct: 25, last_activity_at: at(4) }]),
    orchard_activity: own([{ subject_key: 'science', activity_type: 'quiz', sunlight: 5, occurred_at: at(4) }]),
  });
  const before = await service.getLearningScore('student');
  tables.orchard_trees[0] = { ...tables.orchard_trees[0], sunlight_pct: 30, last_activity_at: at(1) };
  tables.orchard_activity.push(...own([{ subject_key: 'science', activity_type: 'homework', sunlight: 1, occurred_at: at(1) }]));
  const after = await service.getLearningScore('student');
  assert.equal(after.dailyTrend.find((p: { key: string }) => p.key === dayKey(4)).score,
    before.dailyTrend.find((p: { key: string }) => p.key === dayKey(4)).score);
  assertEndpoints(after);
});

test('persisted grades do not change completion scores and old-class homework is excluded', async () => {
  const { service } = fixture({
    homework: own([
      { id: 'hw', subject: 'Science', class_name: 'Class 8', status: 'graded', submitted_at: at(4), updated_at: at(2), grade: 80 },
      { id: 'old-class', subject: 'Science', class_name: 'Class 7', status: 'submitted', submitted_at: at(4) },
    ]),
    homework_attempts: own([
      { homework_id: 'hw', subject: 'Science', created_at: at(4), score: null },
      { homework_id: 'old-class', subject: 'Science', created_at: at(4), score: 100 },
    ]),
  });
  const report = await service.getLearningScore('student');
  const science = report.subjects[0];
  assert.equal(science.stats.find((s: { key: string }) => s.key === 'homework').value, 1);
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(4)).value, 100);
  assert.equal(science.score, 100);
  assertEndpoints(report);
});

test('35 of 100 homework and tests produce 35% homework and 28% tests at 80% average marks', async () => {
  const { service } = fixture({
    homework: Array.from({ length: 100 }, (_, i) => ({
      id: `hw-${i}`, subject: 'Science', class_name: 'Class 8', created_at: at(8), status: 'pending',
    })),
    tests: Array.from({ length: 100 }, (_, i) => ({
      id: `test-${i}`, subject: 'Science', school_id: 'school', class_name: 'Class 8',
      status: 'assigned', created_at: at(8),
    })),
    homework_attempts: own(Array.from({ length: 35 }, (_, i) => ({
      homework_id: `hw-${i}`, created_at: at(4), score: 100,
    }))),
    test_attempts: own(Array.from({ length: 35 }, (_, i) => ({
      test_id: `test-${i}`, finished_at: at(4), score: 16, max_score: 20,
    }))),
  });
  const report = await service.getLearningScore('student');
  const science = report.subjects[0];
  assert.equal(science.metrics.find((m: { key: string }) => m.key === 'homework').value, 35);
  assert.equal(science.metrics.find((m: { key: string }) => m.key === 'tests').value, 28);
  assert.equal(report.dimensions.find((d: { key: string }) => d.key === 'homework').value, 35);
  assert.equal(report.dimensions.find((d: { key: string }) => d.key === 'tests').value, 28);
  assert.equal(science.score, 31);
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(5)).value, 0);
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(4)).value, 31);
  assertEndpoints(report);
});

test('new assignments reduce completion now without rewriting earlier daily/monthly scores', async () => {
  const { service, tables } = fixture({
    homework: [{ id: 'hw', subject: 'Science', created_at: at(50) }],
    tests: [{ id: 'test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(50) }],
    homework_attempts: own([{ homework_id: 'hw', created_at: at(45) }]),
    test_attempts: own([{ test_id: 'test', score: 80, finished_at: at(45) }]),
  });
  const before = await service.getLearningScore('student');
  tables.homework.push({ id: 'new-hw', student_id: 'student', subject: 'Science', created_at: at(1) });
  tables.tests.push({ id: 'new-test', school_id: 'school', subject: 'Science', status: 'assigned', start_at: at(1) });
  const after = await service.getLearningScore('student');
  assert.equal(before.subjects[0].score, 88);
  assert.equal(after.subjects[0].score, 44);
  assert.equal(after.subjects[0].daily.find((p: { key: string }) => p.key === dayKey(2)).value, 88);
  for (const point of before.subjects[0].monthly.filter((p: { future: boolean; key: string }) =>
    !p.future && p.key !== new Date().toISOString().slice(0, 7))) {
    assert.deepEqual(after.subjects[0].monthly.find((p: { key: string }) => p.key === point.key), point);
  }
  assertEndpoints(after);
});

test('test denominator excludes other schools/classes, drafts, cancelled and future tests', async () => {
  const base = { subject: 'Science', school_id: 'school', class_name: 'Class 8', status: 'assigned', created_at: at(8) };
  const { service } = fixture({
    tests: [
      { ...base, id: 'own' },
      { ...base, id: 'pending' },
      { ...base, id: 'other-school', school_id: 'other' },
      { ...base, id: 'other-class', class_name: 'Class 7' },
      { ...base, id: 'draft', status: 'draft' },
      { ...base, id: 'cancelled', status: 'cancelled' },
      { ...base, id: 'future', start_at: at(-3) },
    ],
    homework: [
      { id: 'hw', subject: 'Science', created_at: at(8) },
      { id: 'pending-hw', subject: 'Science', created_at: at(8) },
      { id: 'other-class-hw', subject: 'Science', class_name: 'Class 7', created_at: at(8) },
      { id: 'other-student-hw', student_id: 'other', subject: 'Science', created_at: at(8) },
      { id: 'draft-hw', subject: 'Science', status: 'draft', created_at: at(8) },
      { id: 'future-hw', subject: 'Science', created_at: at(-3) },
    ],
    test_attempts: own([
      { test_id: 'own', score: 80, finished_at: at(4) },
      { test_id: 'pending', score: null, created_at: at(4) },
      { test_id: 'other-class', score: 100, finished_at: at(4) },
      { test_id: 'other-school', score: 100, finished_at: at(4) },
    ]),
    homework_attempts: own([{ homework_id: 'hw', created_at: at(4) }]),
  });
  const report = await service.getLearningScore('student');
  assert.equal(report.subjects[0].metrics.find((m: { key: string }) => m.key === 'tests').value, 40);
  assert.equal(report.subjects[0].metrics.find((m: { key: string }) => m.key === 'homework').value, 50);
  assertEndpoints(report);
});

test('retries count a test once and use its latest marks; homework grades never boost completion', async () => {
  const { service } = fixture({
    tests: ['a', 'b', 'c', 'd'].map((id) => ({
      id, subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(8),
    })),
    test_attempts: own([
      { test_id: 'a', score: 100, finished_at: at(6) },
      { test_id: 'a', score: 80, finished_at: at(4) },
      { test_id: 'b', score: 40, finished_at: at(4) },
    ]),
    homework: ['a', 'b', 'c', 'd'].map((id) => ({ id, subject: 'Science', created_at: at(8) })),
    homework_attempts: own([
      { homework_id: 'a', score: null, created_at: at(6) },
      { homework_id: 'a', score: 100, created_at: at(4) },
    ]),
  });
  const report = await service.getLearningScore('student');
  assert.equal(report.subjects[0].metrics.find((m: { key: string }) => m.key === 'tests').value, 30); // 2/4 * mean(80,40).
  assert.equal(report.subjects[0].metrics.find((m: { key: string }) => m.key === 'homework').value, 25);
  assertEndpoints(report);
});

test('assignment denominators page beyond 500 and local assignments share the same scope', async () => {
  const { service, requests, localFeed, testsController } = fixture({
    tests: Array.from({ length: 501 }, (_, i) => ({
      id: `test-${i}`, subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(8),
    })),
    test_attempts: own([{ test_id: 'test-0', score: 100, finished_at: at(3) }]),
  });
  Object.defineProperty(localFeed, 'listTests', { value: () => [
    { id: 'local-test-pending', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(8) },
    { id: 'test-0', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(8) },
    { id: 'local-test-other', subject: 'Science', school_id: 'other', status: 'assigned', created_at: at(8) },
  ] });
  const report = await service.getLearningScore('student');
  assert.equal(report.subjects[0].score, 0); // 1 / 502 * 100 rounds to zero.
  const understanding = report.dimensions.find((d: { key: string }) => d.key === 'understanding');
  assert.equal(understanding.value, 0);
  const reads = requests.filter((r) => r.table === 'tests' && r.filters.school_id === 'school');
  assert.equal(reads.length, 2);
  assert(reads.every((r) => r.filters.school_id === 'school'));
  const listed = await testsController.list(studentRequest, 'student', 'upcoming');
  assert.equal(listed.tests.length, 502);
  assert.equal(listed.tests.filter((row: { attempted: boolean }) => row.attempted).length, 1);
  assertEndpoints(report);
});

const studentRequest = { studentId: 'student', user: { sub: 'student', role: 'student' } };

test('Telugu subject card, list, review and graph all show the saved zero, not the latest 33% metric', async () => {
  const { service, progressController, testsController } = fixture({
    tests: [{
      id: 'telugu-test', subject: 'Telugu', school_id: 'school', status: 'assigned', created_at: at(10),
    }],
    test_questions: [{ id: 'q', test_id: 'telugu-test', options: ['A', 'B'], correct_option: 0 }],
    test_attempts: own([{ test_id: 'telugu-test', score: 0, finished_at: at(3), answers: {} }]),
    progress_metrics: own([100, 100, 100, 100, 0, 33].map((score) => ({
      subject: 'Telugu', metric_value: score, recorded_at: at(40), details: { source: 'test' },
    }))),
  });
  const progress = await progressController.getProgress(studentRequest, 'student', '');
  assert.equal(progress.success, true);
  assert.deepEqual(progress.subjectScores, [{
    subject: 'Telugu', score: 0, trend: 0, assigned: 1, completed: 1, testScore: 0,
  }]);
  const report = await service.getLearningScore('student');
  const telugu = report.subjects.find((s: { subjectKey: string }) => s.subjectKey === 'telugu');
  assert.equal(telugu.testPerformance.score, 0);
  const listed = await testsController.list(studentRequest, 'student', 'upcoming');
  assert.equal(listed.tests[0].lastScore, 0);
  const review = await testsController.review(studentRequest, 'telugu-test', 'student');
  assert.equal(review.score, 0);
  assert.equal(review.perQuestionFeedback[0].selectedOption, -1);
});

test('actual 33% saved marks on one of one assigned tests produces 33% on every surface', async () => {
  const { service, progressController, testsController } = fixture({
    tests: [{ id: 'test', subject: 'Telugu', school_id: 'school', status: 'assigned', created_at: at(8) }],
    test_attempts: own([{ test_id: 'test', score: 33, finished_at: at(3) }]),
    progress_metrics: own([{ subject: 'Telugu', metric_value: 100, recorded_at: at(1), details: { source: 'test' } }]),
  });
  const report = await service.getLearningScore('student');
  const telugu = report.subjects.find((s: { subjectKey: string }) => s.subjectKey === 'telugu');
  assert.deepEqual(telugu.testPerformance, {
    assigned: 1, completed: 1, averageMarks: 33, completionRate: 100, score: 33,
  });
  assert.equal(telugu.metrics.find((m: { key: string }) => m.key === 'tests').value, 33);
  assert.equal((await progressController.getProgress(studentRequest, 'student', '')).subjectScores[0].score, 33);
  assert.equal((await testsController.list(studentRequest, 'student', 'upcoming')).tests[0].lastScore, 33);
  assert.equal((await testsController.review(studentRequest, 'test', 'student')).score, 33);
  assertEndpoints(report);
});

test('subject card shows average marks while graph correctly includes completion, even with conflicting metric IDs', async () => {
  const { service, progressController } = fixture({
    tests: ['a', 'b', 'c', 'd'].map((id) => ({
      id, subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(8),
    })),
    test_attempts: own([{ test_id: 'a', score: 80, finished_at: at(3) }, { test_id: 'b', score: 40, finished_at: at(3) }]),
    progress_metrics: own([{ subject: 'Science', metric_value: 100, recorded_at: at(1), details: { source: 'test', testId: 'a' } }]),
  });
  const report = await service.getLearningScore('student');
  assert.equal(report.subjects[0].testPerformance.score, 30); // 2/4 * mean(80,40).
  const card = (await progressController.getProgress(studentRequest, 'student', '')).subjectScores[0];
  assert.equal(card.score, 60);
  assert.equal(card.completed, 2);
  assert.equal(card.assigned, 4);
});

test('local fallback results count once across card, graph, list and review; database wins duplicate IDs', async () => {
  const { service, localFeed, testsController, progressController } = fixture({
    tests: [{ id: 'database-test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(8) }],
    test_attempts: own([{ id: 'duplicate', test_id: 'database-test', score: 0, finished_at: at(3) }]),
  });
  localFeed.upsertTest({ id: 'local-test-a', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(8) });
  localFeed.setQuestions('local-test-a', [{ id: 'q', options: ['A', 'B'], correct_option: 0 }]);
  const attempt = localFeed.createAttempt('local-test-a', 'student');
  localFeed.finishAttempt(attempt.id, { score: 100, answers: { q: 0 }, finished_at: at(3) });
  Object.defineProperty(localFeed, 'listAttemptsForStudent', { value: (id: string) => id === 'student' ? [
    localFeed.getAttempt(attempt.id),
    { id: 'duplicate', student_id: 'student', test_id: 'database-test', score: 100, finished_at: at(1) },
  ] : [] });
  const report = await service.getLearningScore('student');
  assert.equal(report.subjects[0].testPerformance.score, 50);
  const card = (await progressController.getProgress(studentRequest, 'student', '')).subjectScores[0];
  assert.equal(card.score, 50);
  const listed = await testsController.list(studentRequest, 'student', 'upcoming');
  assert.equal(listed.tests.find((row: { id: string }) => row.id === 'local-test-a').lastScore, 100);
  assert.equal((await testsController.review(studentRequest, 'local-test-a', 'student')).score, 100);
});

test('failed result writes return an error without publishing marks; finalized results cannot be overwritten', async () => {
  const { tables, failingWrites, testsController } = fixture({
    tests: [{ id: 'test', subject: 'Science', school_id: 'school', status: 'assigned' }],
    test_questions: [{ id: 'q', test_id: 'test', options: ['A', 'B'], correct_option: 0 }],
    test_attempts: own([{ id: 'attempt', test_id: 'test', score: null, created_at: at(1) }]),
  });
  failingWrites.add('test_attempts');
  await assert.rejects(testsController.submit(studentRequest, 'attempt', { answers: { q: 0 } }), ServiceUnavailableException);
  assert.equal(tables.test_attempts[0].score, null);
  failingWrites.clear();
  const first = await testsController.submit(studentRequest, 'attempt', { answers: { q: 0 } });
  assert.equal(first.success, true);
  assert.equal(first.score, 100);
  const repeated = await testsController.submit(studentRequest, 'attempt', { answers: {} });
  assert.equal(repeated.score, 100);
  assert.deepEqual(tables.test_attempts[0].answers, { q: 0 });
});

test('expired attempts finalize persisted answers once and reports subsequently use that result', async () => {
  const { tables, testsController, progressController } = fixture({
    tests: [{
      id: 'test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(10), end_at: at(1),
    }],
    test_questions: [{ id: 'q', test_id: 'test', options: ['A', 'B'], correct_option: 0 }],
    test_attempts: own([{ id: 'attempt', test_id: 'test', score: null, started_at: at(2), answers: { q: 0 } }]),
  });
  const listed = await testsController.list(studentRequest, 'student', 'upcoming');
  assert.equal(listed.tests[0].lastScore, 100);
  assert.equal(tables.test_attempts[0].score, 100);
  const finalizedAt = tables.test_attempts[0].finished_at;
  await testsController.list(studentRequest, 'student', 'upcoming');
  assert.equal(tables.test_attempts[0].finished_at, finalizedAt);
  assert.equal((await progressController.getProgress(studentRequest, 'student', '')).subjectScores[0].score, 100);
});

test('a missing question set is not silently finalized as zero', async () => {
  const { tables, testsController } = fixture({
    tests: [{ id: 'test', subject: 'Science', school_id: 'school', status: 'assigned' }],
    test_attempts: own([{ id: 'attempt', test_id: 'test', score: null, created_at: at(1) }]),
  });
  await assert.rejects(testsController.submit(studentRequest, 'attempt', { answers: {} }), ServiceUnavailableException);
  assert.equal(tables.test_attempts[0].score, null);
});

test('subject cards preserve allowed-subject time tracking without inventing mock-test averages', async () => {
  const { progressController } = fixture({
    progress_metrics: own([
      { subject: 'Science', metric_value: 80, details: { minutes: 5, source: 'practice' }, recorded_at: at(1) },
      { subject: 'removed-subject', metric_value: 100, details: { minutes: 20 }, recorded_at: at(1) },
    ]),
  });
  const progress = await progressController.getProgress(studentRequest, 'student', '');
  assert.equal(progress.timeSpent, 5);
  assert.deepEqual(progress.subjectScores, []);
});

test('database draft status overrides a stale local assigned copy in both graph and list', async () => {
  const { service, testsController, localFeed } = fixture({
    tests: [{ id: 'test', subject: 'Science', school_id: 'school', status: 'draft', created_at: at(8) }],
    test_attempts: own([{ test_id: 'test', score: 100, finished_at: at(3) }]),
  });
  localFeed.upsertTest({ id: 'test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(8) });
  assert.equal((await service.getLearningScore('student')).subjects[0].testPerformance.assigned, 0);
  assert.deepEqual((await testsController.list(studentRequest, 'student', 'upcoming')).tests, []);
});

test('local fallback test can start and submit without sending local IDs to UUID columns', async () => {
  const { testsController, localFeed, requests } = fixture({}, '', false);
  localFeed.upsertTest({ id: 'local-test-a', subject: 'Science', school_id: 'school', status: 'assigned', created_at: at(8) });
  localFeed.setQuestions('local-test-a', [{ id: 'q', options: ['A', 'B'], correct_option: 0 }]);
  const started = await testsController.start(studentRequest, 'local-test-a', {});
  assert.equal(started.success, true);
  assert.ok(started.attemptId?.startsWith('local-attempt-'));
  assert.equal((await testsController.submit(studentRequest, started.attemptId, { answers: { q: 0 } })).score, 100);
  assert.ok(requests.filter(({ table }) => !table.startsWith('strict_')).every(({ filters }) => !Object.values(filters).some((value) => String(value).startsWith('local-'))));
  assert.equal((await testsController.start(studentRequest, 'local-test-a', {})).success, false);
});

test('saved school dates recalculate all graph buckets, retain cumulative evidence and isolate schools', async () => {
  const { service, tables, failingWrites } = fixture({
    tests: [{ id: 'test', subject: 'Science', school_id: 'school', status: 'assigned', created_at: '2025-01-01' }],
    test_attempts: own([
      { test_id: 'test', score: 80, finished_at: '2025-02-01' },
      { test_id: 'test', score: 20, finished_at: '2025-09-01' },
    ]),
  });
  const baseline = await service.getLearningScore('student');
  const dates = { startDate: '2025-06-15', endDate: '2025-08-03' };
  await service.saveSchoolProgressPeriod('school', dates);
  assert.deepEqual(await service.getSchoolProgressPeriod('school'), dates);
  assert.equal(await service.getSchoolProgressPeriod('other'), null);
  const report = await service.getLearningScore('student');
  assert.equal(report.score, baseline.score);
  assert.deepEqual(report.trend.map((p: { key: string }) => p.key), ['2025-06', '2025-07', '2025-08']);
  assert.equal(report.dailyTrend[0].key, dates.startDate);
  assert.equal(report.dailyTrend.at(-1).key, dates.endDate);
  assert.equal(report.subjects[0].monthly[0].value, 80);
  assert.equal(report.subjects[0].monthly.at(-1).value, 80);
  assert.equal(report.subjects[0].score, 20);
  for (const subject of report.subjects) {
    assert.deepEqual(subject.monthly.map((p: { key: string }) => p.key), report.trend.map((p: { key: string }) => p.key));
    assert.deepEqual(subject.daily.map((p: { key: string }) => p.key), report.dailyTrend.map((p: { key: string }) => p.key));
  }
  await service.saveSchoolProgressPeriod('school', { startDate: '2025-07-01', endDate: '2025-07-12' });
  const updated = await service.getLearningScore('student');
  assert.equal(updated.trend.length, 1);
  assert.equal(updated.dailyTrend.length, 12);
  assert.equal(tables.school_progress_periods.length, 1);
  failingWrites.add('school_progress_periods');
  await assert.rejects(service.saveSchoolProgressPeriod('school', dates), ServiceUnavailableException);
  assert.equal((await service.getSchoolProgressPeriod('school'))?.endDate, '2025-07-12');
});

test('an entirely future school period has null graph points, and settings read errors never use a silent default', async () => {
  const future = fixture({
    school_progress_periods: [{ school_id: 'school', start_date: '2099-06-01', end_date: '2099-07-01' }],
  });
  const report = await future.service.getLearningScore('student');
  assert.ok(report.trend.every((p: { score: number | null }) => p.score === null));
  assert.ok(report.dailyTrend.every((p: { score: number | null }) => p.score === null));
  assert.ok(report.subjects.every((s: { daily: Array<{ value: number | null }> }) => s.daily.every((p) => p.value === null)));
  const broken = fixture({}, 'school_progress_periods');
  await assert.rejects(broken.service.getLearningScore('student'), ServiceUnavailableException);
});

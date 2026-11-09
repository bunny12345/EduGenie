import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { OrchardService } from '../orchard/orchard.service';
import { ACTIVITY_EFFECTS } from '../orchard/orchard.constants';
import { LearningScoreService } from './learning-score.service';
import { LocalFeedService } from '../shared/local-feed.service';

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
    students: [{ id: 'student', created_at: at(60) }],
    orchard_chapters: (initial.chapter_growth || []).map((r) => ({ id: r.chapter_id, class_name: 'Class 8' })),
    ...initial,
    homework: (initial.homework || []).map((r) => ({ student_id: 'student', ...r })),
  };
  const requests: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const db: SupabaseService = Object.create(SupabaseService.prototype);
  Object.defineProperty(db, 'client', { value: {
    isMock,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let ids: unknown[] | null = null;
      let start = 0;
      let end = Infinity;
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        in(_key: string, values: unknown[]) { ids = values; return query; },
        order() { return query; },
        range(from: number, to: number) { start = from; end = to; return query; },
        limit(count: number) { end = count - 1; return query; },
        then(resolve: (result: { data: Row[]; error: { message: string } | null }) => void) {
          requests.push({ table, filters });
          if (!isMock && ids?.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id)))) {
            return resolve({ data: [], error: { message: 'invalid input syntax for type uuid' } });
          }
          const rows = (tables[table] || []).filter((row) =>
            Object.entries(filters).every(([key, value]) => row[key] === value)
              && (!ids || ids.includes(row.id)));
          resolve({
            data: rows.slice(start, end + 1),
            error: table === failingTable ? { message: 'simulated query failure' } : null,
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
  const service = new LearningScoreService(db, orchard, localFeed);
  return { service, tables, requests, localFeed };
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
    tests: [{ id: 'test', subject: 'Science' }],
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

test('homework-only submissions and grades contribute; resubmissions do not inflate completion', async () => {
  const { service } = fixture({
    homework: [{ id: 'hw', subject: 'Science' }],
    homework_attempts: own([
      { homework_id: 'hw', created_at: at(5), score: null },
      { homework_id: 'hw', created_at: at(3), score: 80 },
    ]),
  });
  const result = await service.getLearningScore('student');
  const science = result.subjects[0];
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(5)).value, 13);
  assert.equal(science.score, 53); // 60% grade + 40% one completed assignment out of eight.
  assert.equal(science.stats.find((s: { key: string }) => s.key === 'homework').value, 1);
  assert.equal(science.metrics.find((m: { key: string }) => m.key === 'homework').value, 53);
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

test('test-only fallback metrics count as tests, not practice', async () => {
  const { service } = fixture({
    progress_metrics: own([{ subject: 'Science', metric_value: 72, recorded_at: at(3), details: { source: 'mock_test' } }]),
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.subjects[0].score, 72);
  assert.equal(result.subjects[0].metrics.find((m: { key: string }) => m.key === 'tests').value, 72);
  assert.equal(result.subjects[0].metrics.find((m: { key: string }) => m.key === 'practice').value, 0);
  assertEndpoints(result);
});

test('all five subject components use the same documented weights for score and graph', async () => {
  const { service } = fixture({
    orchard_trees: own([{ subject_key: 'science', total_chapters: 1 }]),
    chapter_growth: own([{ subject_key: 'science', chapter_id: 'chapter', stage_index: 7, roots_pct: 90, stage_updated_at: at(3) }]),
    test_attempts: own([{ subject: 'Science', score: 16, max_score: 20, finished_at: at(3) }]),
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
    test_attempts: own([{ subject: 'Science', score: 100, finished_at: at(4) }, { subject: 'Science', score: 20, finished_at: at(1) }]),
  });
  const result = await service.getLearningScore('student');
  const science = result.subjects[0];
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(4)).value, 100);
  assert.equal(science.score, 60);
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
    tests: [{ id: databaseTest, subject: 'Science' }],
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
  Object.defineProperty(localFeed, 'listTests', { value: () => [{ id: 'local-test-1791399844044', subject: 'Science' }] });
  const result = await service.getLearningScore('student');
  assert.equal(result.success, true);
  assert.equal(result.subjects[0].metrics.find((m: { key: string }) => m.key === 'tests').value, 70);
  assert.equal(result.subjects[0].stats.find((s: { key: string }) => s.key === 'tests').value, 2);
  assert.equal(result.subjects[0].stats.find((s: { key: string }) => s.key === 'homework').value, 2);
  assert.equal(result.dimensions.find((d: { key: string }) => d.key === 'tests').value, 60);
  assert.equal(requests.filter((r) => r.table === 'tests').length, 1);
  assertEndpoints(result);
});

test('legacy-only deleted assignment metadata does not prevent a report loading', async () => {
  const { service, requests } = fixture({
    test_attempts: own([{ test_id: 'local-test-1791399844044', score: 75, finished_at: at(3) }]),
  }, '', false);
  const result = await service.getLearningScore('student');
  assert.equal(result.success, true);
  assert.equal(result.dimensions.find((d: { key: string }) => d.key === 'tests').value, 75);
  assert.equal(requests.filter((r) => r.table === 'tests').length, 0);
  assertEndpoints(result);
});

test('genuine database assignment failures are still surfaced instead of hidden as legacy IDs', async () => {
  const { service } = fixture({
    test_attempts: own([{ test_id: '11111111-1111-1111-1111-111111111111', score: 75, finished_at: at(3) }]),
  }, 'tests', false);
  await assert.rejects(service.getLearningScore('student'), ServiceUnavailableException);
});

test('Telugu counts persisted assignment submissions without attempt rows and keeps older test history', async () => {
  const { service, localFeed } = fixture({
    orchard_trees: own([{ subject_key: 'telugu', total_chapters: 0 }]),
    test_attempts: own([{ subject: 'Telugu', score: 0, finished_at: at(3) }]),
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
  assert.equal(telugu.metrics.find((m: { key: string }) => m.key === 'homework').value, 38); // Three of eight; ungraded default 0 is not a grade.
  assert.equal(telugu.stats.find((s: { key: string }) => s.key === 'homework').value, 3);
  assert.equal(telugu.metrics.find((m: { key: string }) => m.key === 'tests').value, 62); // (433 + 0) / 7, not the newest zero alone.
  assert.equal(telugu.score, 53); // (61.857 * .25 + 37.5 * .15) / .4.
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
  assert.equal(telugu.score, 13);
  assert.equal(telugu.stats.find((s: { key: string }) => s.key === 'homework').value, 1);
  assertEndpoints(result);
});

test('assignment status does not duplicate real attempts and mutable grades begin on grading date', async () => {
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
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(5)).value, 25);
  assert.equal(science.score, 58); // 80*.6 + 25*.4.
  assertEndpoints(result);
});

test('later tests retain older legacy metrics while same-time mirrored scores count once', async () => {
  const { service } = fixture({
    test_attempts: own([{ subject: 'Science', score: 0, finished_at: at(2) }]),
    progress_metrics: own([
      { subject: 'Science', metric_value: 80, recorded_at: at(4), details: { source: 'test' } },
      { subject: 'Science', metric_value: 0, recorded_at: at(2), details: { source: 'test' } },
    ]),
  });
  const result = await service.getLearningScore('student');
  assert.equal(result.subjects[0].score, 40);
  assert.equal(result.subjects[0].daily.find((p: { key: string }) => p.key === dayKey(4)).value, 80);
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
    test_attempts: own([
      { subject: 'Science', score: 80, finished_at: at(3) },
      { subject: 'English', score: 40, finished_at: at(2) },
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
  assert.equal(report.subjects[0].score, 53);
  assert.equal(report.subjects[1].score, 32);
  assert.equal(report.subjects[2].score, 0);
  const practice = (50 + 100 + 80) / 3;
  const expected = {
    understanding: .4 * 25 + .1 * (3 / 14 * 100) + .3 * 60 + .2 * practice,
    tests: 60,
    homework: 25,
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
    test_attempts: own([{ subject: 'Science', score: 70, finished_at: at(4) }]),
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

test('persisted grades complement ungraded real attempts without adding a homework completion', async () => {
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
  assert.equal(science.daily.find((p: { key: string }) => p.key === dayKey(4)).value, 13);
  assert.equal(science.score, 53);
  assertEndpoints(report);
});

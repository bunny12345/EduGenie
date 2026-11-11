import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { latestCompletedTests, mergeTestAttempts, testAttemptAt, testPercentage } from './test-results.util';

test('marks preserve a genuine zero, normalize raw totals, and reject missing or invalid values', () => {
  assert.equal(testPercentage({ score: 0 }), 0);
  assert.ok(Math.abs(testPercentage({ score: 1, max_score: 3 }) - 100 / 3) < 1e-10);
  assert.equal(testPercentage({ score: '80' }), 80);
  for (const score of [null, undefined, '', ' ', 'invalid', NaN, Infinity]) {
    assert.ok(Number.isNaN(testPercentage({ score })));
  }
});

test('latest completed marks count one test, excluding ungraded, unlinked and future attempts', () => {
  const rows = [
    { id: 'old', test_id: 'a', score: 100, finished_at: '2026-01-01' },
    { id: 'latest', test_id: 'a', score: 0, finished_at: '2026-02-01' },
    { id: 'open', test_id: 'a', score: null, created_at: '2026-03-01' },
    { id: 'future', test_id: 'a', score: 90, finished_at: '2026-05-01' },
    { id: 'unlinked', score: 80, finished_at: '2026-01-01' },
    { id: 'undated', test_id: 'b', score: 80 },
  ];
  assert.deepEqual(latestCompletedTests(rows, Date.parse('2026-04-01')).map((row) => row.id), ['latest']);
  assert.deepEqual(latestCompletedTests(rows, Date.parse('2026-01-15')).map((row) => row.id), ['old']);
});

test('attempt date falls back only to a valid recorded timestamp', () => {
  assert.equal(testAttemptAt({ finished_at: 'invalid', submitted_at: '2026-01-01', created_at: '2025-01-01' }),
    Date.parse('2026-01-01'));
  assert.equal(testAttemptAt({}), 0);
});

test('database attempts override duplicate local records, without overriding distinct local attempts', () => {
  const database = [{ id: 'a', test_id: 'test', score: 0 }];
  const local = [{ id: 'a', test_id: 'test', score: 100 }, { id: 'b', test_id: 'other', score: 80 }];
  assert.deepEqual(mergeTestAttempts(database, local), [database[0], local[1]]);
});

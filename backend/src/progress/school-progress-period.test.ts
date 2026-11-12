import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { progressPeriodBuckets, validateProgressPeriod } from './school-progress-period';

test('school dates reject invalid calendar dates, reversed ranges and over 24 calendar months', () => {
  for (const input of [
    null, {}, { startDate: '2026-02-30', endDate: '2026-04-01' },
    { startDate: '2026-06-01', endDate: '2026-05-01' },
    { startDate: '2026-06-01T00:00:00Z', endDate: '2027-04-01' },
    { startDate: '2026-01-01', endDate: '2028-01-01' },
  ]) assert.throws(() => validateProgressPeriod(input), BadRequestException);
  assert.deepEqual(validateProgressPeriod({ startDate: '2024-02-29', endDate: '2024-02-29' }),
    { startDate: '2024-02-29', endDate: '2024-02-29' });
});

test('monthly and daily buckets respect partial months, end dates, India midnight and future gaps', () => {
  const { monthly, daily } = progressPeriodBuckets({ startDate: '2026-06-15', endDate: '2026-08-03' },
    Date.parse('2026-07-14T18:30:00Z'));
  assert.deepEqual(monthly.map((b) => b.key), ['2026-06', '2026-07', '2026-08']);
  assert.equal(daily[0].key, '2026-06-15');
  assert.equal(daily.at(-1)?.key, '2026-08-03');
  assert.equal(monthly.at(-1)?.end, Date.parse('2026-08-03T23:59:59.999+05:30'));
  assert.equal(daily.find((b) => b.key === '2026-07-15')?.future, false);
  assert.equal(daily.find((b) => b.key === '2026-07-16')?.future, true);
  assert.equal(monthly.at(-1)?.future, true);
  assert.equal(monthly[0].end, Date.parse('2026-06-30T23:59:59.999+05:30'));
});

type TestAttempt = {
  id?: string;
  test_id?: string;
  score?: number | string | null;
  max_score?: number;
  total?: number;
  finished_at?: string;
  submitted_at?: string;
  created_at?: string;
};

export function testAttemptAt(row: TestAttempt): number {
  for (const value of [row.finished_at, row.submitted_at, row.created_at]) {
    const time = value ? new Date(value).getTime() : NaN;
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

export function testPercentage(row: TestAttempt): number {
  if (row.score === null || row.score === undefined || (typeof row.score === 'string' && !row.score.trim())) return NaN;
  const score = Number(row.score);
  if (!Number.isFinite(score)) return NaN;
  const total = Number(row.max_score || row.total || 0);
  return Math.max(0, Math.min(100, total > 0 ? score / total * 100 : score));
}

export function latestCompletedTests<T extends TestAttempt>(attempts: T[], cutoff: number): T[] {
  const latest = new Map<string, T>();
  for (const row of attempts) {
    const at = testAttemptAt(row);
    if (!row.test_id || !at || at > cutoff || !Number.isFinite(testPercentage(row))) continue;
    const previous = latest.get(row.test_id);
    if (!previous || at >= testAttemptAt(previous)) latest.set(row.test_id, row);
  }
  return [...latest.values()];
}

export function mergeTestAttempts<T extends TestAttempt>(database: T[], local: T[]): T[] {
  const merged = new Map<string, T>();
  for (const row of [...local, ...database]) {
    if (row.id) merged.set(row.id, row);
  }
  return [...merged.values()];
}

/**
 * `progress_metrics` rows are written by several code paths and the table has
 * evolved: the real columns are
 *   student_id | subject | metric_key | metric_value | details (jsonb) | recorded_at | created_at
 * while older/looser callers used `score`, `minutes` and `date`. These readers
 * accept both shapes so a metric is never silently dropped.
 */

export const METRIC_ORDER_COLUMN = 'recorded_at';

export function metricScore(row: any): number {
  const v = Number(row?.score ?? row?.metric_value ?? row?.value ?? row?.details?.score);
  return Number.isFinite(v) ? v : NaN;
}

export function metricMinutes(row: any): number {
  const v = Number(row?.minutes ?? row?.time_spent ?? row?.details?.minutes ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function metricAt(row: any): string | null {
  return row?.recorded_at || row?.date || row?.created_at || null;
}

/** Build an insert row using only columns that actually exist on the table. */
export function metricRow(input: {
  studentId: string;
  subject: string;
  metricKey: string;
  score: number;
  minutes: number;
  source: string;
  recordedAt?: string;
}) {
  const recordedAt = input.recordedAt || new Date().toISOString();
  return {
    student_id: input.studentId,
    subject: input.subject,
    metric_key: input.metricKey,
    metric_value: input.score,
    details: { score: input.score, minutes: input.minutes, source: input.source },
    recorded_at: recordedAt,
  };
}

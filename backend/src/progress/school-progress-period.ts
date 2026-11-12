import { BadRequestException } from '@nestjs/common';

export type ProgressPeriod = { startDate: string; endDate: string };
const DAY = 86400000;
const INDIA_OFFSET = 330 * 60000;

function dateMs(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return NaN;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : NaN;
}

export function validateProgressPeriod(value: unknown): ProgressPeriod {
  if (!value || typeof value !== 'object') throw new BadRequestException('Select a start and end date.');
  const { startDate, endDate } = value as Record<string, unknown>;
  const start = dateMs(startDate);
  const end = dateMs(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new BadRequestException('Enter valid dates in YYYY-MM-DD format.');
  if (end < start) throw new BadRequestException('The end date must be on or after the start date.');
  const first = new Date(start);
  const last = new Date(end);
  const months = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1;
  if (months > 24) throw new BadRequestException('Select a period covering at most 24 calendar months.');
  return { startDate: String(startDate), endDate: String(endDate) };
}

export function progressPeriodBuckets(period: ProgressPeriod, now: number) {
  const start = dateMs(period.startDate);
  const end = dateMs(period.endDate);
  const daily: Array<{ key: string; label: string; weekday: string; end: number; future: boolean }> = [];
  for (let cursor = start; cursor <= end; cursor += DAY) {
    const date = new Date(cursor);
    daily.push({
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      end: cursor + DAY - INDIA_OFFSET - 1,
      future: cursor - INDIA_OFFSET > now,
    });
  }
  const first = new Date(start);
  first.setUTCDate(1);
  const monthly: Array<{ key: string; label: string; end: number; future: boolean }> = [];
  for (let cursor = first.getTime(); cursor <= end;) {
    const date = new Date(cursor);
    const nextMonth = new Date(cursor);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const next = nextMonth.getTime();
    monthly.push({
      key: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      end: Math.min(next - 1, end + DAY - 1) - INDIA_OFFSET,
      future: Math.max(cursor, start) - INDIA_OFFSET > now,
    });
    cursor = next;
  }
  return { daily, monthly };
}

export function progressPeriodLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

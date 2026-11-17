export const DEFAULT_PUSH_TIMEZONE = process.env.PUSH_DEFAULT_TIMEZONE || 'Asia/Kolkata';

export function safeTimezone(value: unknown): string {
  const zone = String(value || '').trim();
  if (!zone || zone.length > 64) return DEFAULT_PUSH_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_PUSH_TIMEZONE;
  }
}

export type LocalClock = { date: string; minutes: number };

/** Wall-clock date (YYYY-MM-DD) and minutes-after-midnight in `timezone`. */
export function localClock(at: Date | string | number, timezone: string): LocalClock | null {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute'))
  };
}

export function localDate(at: unknown, timezone: string): string | null {
  if (!at) return null;
  return localClock(at as any, timezone)?.date || null;
}

export function shiftDate(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function localTimeLabel(at: unknown, timezone: string): string {
  const date = new Date(at as any);
  if (!at || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: safeTimezone(timezone), hour: 'numeric', minute: '2-digit', hour12: true })
    .format(date)
    .replace(/\u202f/g, ' ');
}

/** e.g. "Wed, Nov 20, 5:00 PM" in the student's timezone. */
export function localDateTimeLabel(at: unknown, timezone: string): string {
  const date = new Date(at as any);
  if (!at || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimezone(timezone), weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  }).format(date).replace(/\u202f/g, ' ');
}

export const EVENING_PLAN_MINUTES = 18 * 60 + 30;
export const NIGHT_RECAP_MINUTES = 21 * 60;
// Catch-up windows so a short server restart never skips the day's message,
// without ever sending a "6:30 PM" plan late at night.
export const EVENING_WINDOW_END = NIGHT_RECAP_MINUTES;
export const NIGHT_WINDOW_END = 23 * 60;

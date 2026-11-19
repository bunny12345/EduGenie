import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { FcmService } from './fcm.service';
import { StudentDigestService } from './student-digest.service';
import {
  PushMessage,
  announcementMessage,
  eveningPlanMessage,
  newHomeworkMessage,
  newTestMessage,
  nightRecapMessage,
  testTomorrowMessage
} from './push-templates';
import {
  EVENING_PLAN_MINUTES,
  EVENING_WINDOW_END,
  NIGHT_RECAP_MINUTES,
  NIGHT_WINDOW_END,
  localClock,
  localDateTimeLabel,
  safeTimezone
} from './push-time';

const TABLE = 'student_push_devices';

export type PushPreferences = {
  eveningPlan: boolean;
  nightRecap: boolean;
  testReminders: boolean;
  schoolUpdates: boolean;
};

const DEFAULT_PREFERENCES: PushPreferences = { eveningPlan: true, nightRecap: true, testReminders: true, schoolUpdates: true };
const PREFERENCE_COLUMNS: Record<keyof PushPreferences, string> = {
  eveningPlan: 'evening_plan',
  nightRecap: 'night_recap',
  testReminders: 'test_reminders',
  schoolUpdates: 'school_updates'
};

const toPreferences = (row: any): PushPreferences => ({
  eveningPlan: row?.evening_plan !== false,
  nightRecap: row?.night_recap !== false,
  testReminders: row?.test_reminders !== false,
  schoolUpdates: row?.school_updates !== false
});

const preferenceColumns = (prefs: PushPreferences) =>
  Object.fromEntries(Object.entries(PREFERENCE_COLUMNS).map(([key, column]) => [column, prefs[key as keyof PushPreferences]]));

const normalizeClass = (value: unknown) => String(value || '').trim().toLowerCase();

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Push');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: SupabaseService,
    private readonly fcm: FcmService,
    private readonly digests: StudentDigestService,
    private readonly studentAuth: StudentAuthService
  ) {}

  onModuleInit() {
    if (!this.fcm.configured || process.env.PUSH_SCHEDULER_DISABLED === 'true') return;
    this.timer = setInterval(() => void this.tick().catch((e) => this.logger.warn(`Push tick failed: ${e?.message || e}`)), 60_000);
    this.timer.unref?.();
    this.logger.log('Daily study push scheduler started (6:30 PM plan, 9:00 PM recap)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  get pushConfigured() {
    return this.fcm.configured;
  }

  private async devicesWhere(apply: (q: any) => any): Promise<any[]> {
    const out: any[] = [];
    for (let offset = 0; ; offset += 500) {
      const res: any = await apply(this.db.client.from(TABLE).select('*')).order('id').range(offset, offset + 499);
      if (res?.error) throw new Error(res.error.message || 'Unable to read push devices');
      out.push(...(res?.data || []));
      if ((res?.data || []).length < 500) break;
    }
    return out;
  }

  private studentDevices(studentId: string) {
    return this.devicesWhere((q) => q.eq('student_id', studentId));
  }

  async preferences(studentId: string): Promise<PushPreferences> {
    const devices = await this.studentDevices(studentId);
    return devices.length ? toPreferences(devices[0]) : { ...DEFAULT_PREFERENCES };
  }

  async registerDevice(studentId: string, body: any) {
    const token = String(body?.token || '').trim();
    if (token.length < 20 || token.length > 4096) throw new BadRequestException('A valid device push token is required');
    const platform = ['android', 'ios', 'web'].includes(body?.platform) ? body.platform : 'android';
    const profile = await this.studentAuth.resolveStudentProfile(studentId);
    const prefs = await this.preferences(studentId);
    const row = {
      student_id: studentId,
      school_id: profile.schoolId || null,
      class_name: profile.className || null,
      token,
      platform,
      timezone: safeTimezone(body?.timezone),
      ...preferenceColumns(prefs),
      updated_at: new Date().toISOString()
    };
    const existing: any = await this.db.client.from(TABLE).select('id,student_id').eq('token', token).limit(1);
    if (existing?.error) throw new Error(existing.error.message);
    const current = existing?.data?.[0];
    // A phone that switches student accounts must not inherit the previous student's "already sent today" markers.
    const reset = current && current.student_id !== studentId
      ? { last_evening_sent_on: null, last_night_sent_on: null, last_test_reminder_on: null }
      : {};
    const res: any = current
      ? await this.db.client.from(TABLE).update({ ...row, ...reset }).eq('token', token)
      : await this.db.client.from(TABLE).insert([{ ...row, created_at: row.updated_at }]).select();
    if (res?.error) throw new Error(res.error.message || 'Unable to save push device');
    return prefs;
  }

  async removeDevice(studentId: string, token: string) {
    const value = String(token || '').trim();
    if (!value) return;
    await this.db.client.from(TABLE).delete().eq('token', value).eq('student_id', studentId);
  }

  async updatePreferences(studentId: string, body: any): Promise<PushPreferences> {
    const next = { ...(await this.preferences(studentId)) };
    for (const key of Object.keys(PREFERENCE_COLUMNS) as (keyof PushPreferences)[]) {
      if (body?.[key] === undefined) continue;
      if (typeof body[key] !== 'boolean') throw new BadRequestException(`${key} must be true or false`);
      next[key] = body[key];
    }
    const res: any = await this.db.client.from(TABLE)
      .update({ ...preferenceColumns(next), updated_at: new Date().toISOString() })
      .eq('student_id', studentId);
    if (res?.error) throw new Error(res.error.message || 'Unable to save notification preferences');
    return next;
  }

  async preview(studentId: string, timezoneHint?: string) {
    const devices = await this.studentDevices(studentId);
    const timezone = safeTimezone(timezoneHint || devices[0]?.timezone);
    const digest = await this.digests.build(studentId, timezone);
    return {
      timezone,
      pushConfigured: this.fcm.configured,
      devices: devices.length,
      preferences: devices.length ? toPreferences(devices[0]) : { ...DEFAULT_PREFERENCES },
      eveningPlan: eveningPlanMessage(digest),
      testTomorrow: testTomorrowMessage(digest),
      nightRecap: nightRecapMessage(digest),
      summary: {
        pendingHomework: digest.pendingHomework.length,
        dueToday: digest.pendingHomework.filter((h) => h.dueToday || h.overdue).length,
        testsTomorrow: digest.testsTomorrow.length,
        streakDays: digest.streakDays,
        activity: digest.activity
      }
    };
  }

  async sendTest(studentId: string) {
    const devices = await this.studentDevices(studentId);
    if (!this.fcm.configured) return { sent: 0, devices: devices.length, error: 'Push notifications are not configured on the server yet.' };
    if (!devices.length) return { sent: 0, devices: 0, error: 'This phone is not registered for notifications yet. Allow notifications and try again.' };
    const digest = await this.digests.build(studentId, safeTimezone(devices[0].timezone));
    const plan = eveningPlanMessage(digest);
    const sent = await this.deliver(devices, { ...plan, type: 'test', title: `🔔 Test · ${plan.title}` });
    return { sent, devices: devices.length, error: sent ? undefined : 'Could not reach this phone. Please try again in a moment.' };
  }

  private async deliver(devices: any[], message: PushMessage | ((device: any) => PushMessage | null)): Promise<number> {
    let sent = 0;
    for (const device of devices) {
      const payload = typeof message === 'function' ? message(device) : message;
      if (!payload) continue;
      const result = await this.fcm.send(device.token, payload);
      if (result.ok) sent += 1;
      else if (result.invalidToken) await this.db.client.from(TABLE).delete().eq('token', device.token);
      else this.logger.warn(`Push ${payload.type} failed: ${result.error}`);
    }
    return sent;
  }

  /** Runs every minute: delivers each student's 6:30 PM plan and 9:00 PM recap once per local day. */
  async tick(now = new Date()) {
    if (this.running || !this.fcm.configured) return;
    this.running = true;
    try {
      const devices = await this.devicesWhere((q) => q);
      const digestCache = new Map<string, Promise<any>>();
      const digestFor = (device: any) => {
        const key = `${device.student_id}|${safeTimezone(device.timezone)}`;
        if (!digestCache.has(key)) digestCache.set(key, this.digests.build(device.student_id, safeTimezone(device.timezone), now));
        return digestCache.get(key)!;
      };
      for (const device of devices) {
        const clock = localClock(now, safeTimezone(device.timezone));
        if (!clock) continue;
        const inEvening = clock.minutes >= EVENING_PLAN_MINUTES && clock.minutes < EVENING_WINDOW_END;
        const inNight = clock.minutes >= NIGHT_RECAP_MINUTES && clock.minutes < NIGHT_WINDOW_END;
        const sendPlan = inEvening && device.evening_plan !== false && device.last_evening_sent_on !== clock.date;
        const sendTests = inEvening && device.test_reminders !== false && device.last_test_reminder_on !== clock.date;
        const sendRecap = inNight && device.night_recap !== false && device.last_night_sent_on !== clock.date;
        if (!sendPlan && !sendTests && !sendRecap) continue;

        // Claim the slot first so a slow/failed send can never repeat every minute.
        const claim: Record<string, string> = {};
        if (sendPlan) claim.last_evening_sent_on = clock.date;
        if (sendTests) claim.last_test_reminder_on = clock.date;
        if (sendRecap) claim.last_night_sent_on = clock.date;
        const claimed: any = await this.db.client.from(TABLE).update(claim).eq('token', device.token);
        if (claimed?.error) continue;

        const digest = await digestFor(device);
        if (sendPlan) await this.deliver([device], eveningPlanMessage(digest));
        if (sendTests) {
          const tests = testTomorrowMessage(digest);
          if (tests) await this.deliver([device], tests);
        }
        if (sendRecap) await this.deliver([device], nightRecapMessage(digest));
      }
    } finally {
      this.running = false;
    }
  }

  private async schoolDevices(schoolId: string, className: string | null, pref: keyof PushPreferences) {
    if (!schoolId) return [];
    const target = normalizeClass(className);
    const devices = await this.devicesWhere((q) => q.eq('school_id', schoolId));
    return devices.filter((d) => d[PREFERENCE_COLUMNS[pref]] !== false && (!target || normalizeClass(d.class_name) === target));
  }

  private background(task: () => Promise<unknown>) {
    if (!this.fcm.configured) return;
    return task().catch((e) => this.logger.warn(`Event push failed: ${e?.message || e}`));
  }

  notifyHomeworkAssigned(rows: any[]) {
    this.background(async () => {
      const byStudent = new Map<string, any[]>();
      for (const row of rows || []) {
        const id = String(row?.student_id || '').trim();
        if (id) byStudent.set(id, [...(byStudent.get(id) || []), row]);
      }
      if (!byStudent.size) return;
      const devices = await this.devicesWhere((q) => q.in('student_id', [...byStudent.keys()]));
      await this.deliver(devices.filter((d) => d.school_updates !== false), (device) => {
        const list = byStudent.get(device.student_id) || [];
        if (!list.length) return null;
        return newHomeworkMessage({
          title: list[0].title,
          subject: list[0].subject,
          dueLabel: localDateTimeLabel(list[0].due_at, safeTimezone(device.timezone)),
          count: list.length
        });
      });
    });
  }

  notifyTestAssigned(test: { school_id?: string; class_name?: string; title?: string; subject?: string; start_at?: string; duration_minutes?: number }) {
    return this.background(async () => {
      const schoolId = String(test.school_id || '').trim();
      if (!schoolId) return;
      const target = normalizeClass(test.class_name);
      const roster = await this.studentAuth.listSchoolProgressStudents(schoolId);
      const ids = roster.filter((s) => normalizeClass(s.className) && (!target || normalizeClass(s.className) === target))
        .map((s) => s.id);
      for (let offset = 0; offset < ids.length; offset += 100) {
        const devices = await this.devicesWhere((q) => q.in('student_id', ids.slice(offset, offset + 100)));
        const optedIn = devices.filter((d) => d.test_reminders !== false);
        const eligible = new Set<string>();
        await Promise.all([...new Set<string>(optedIn.map((device) => device.student_id))].map(async (id) => {
          const profile = await this.studentAuth.resolveStudentProfile(id);
          const currentClass = normalizeClass(profile.className);
          if (profile.schoolId === schoolId && currentClass && (!target || currentClass === target)) eligible.add(id);
        }));
        await this.deliver(optedIn.filter((device) => eligible.has(device.student_id)), (device) => newTestMessage({
          title: String(test.title || ''),
          subject: String(test.subject || ''),
          opensLabel: localDateTimeLabel(test.start_at, safeTimezone(device.timezone)),
          durationMinutes: Math.max(1, Number(test.duration_minutes || 30))
        }));
      }
    });
  }

  notifyAnnouncement(input: { schoolId?: string; className?: string | null; title: string; message: string; startAt?: string | null }) {
    // Never push an announcement before it is visible on the portal.
    if (input.startAt && new Date(input.startAt).getTime() > Date.now() + 60_000) return;
    this.background(async () => {
      const devices = await this.schoolDevices(String(input.schoolId || ''), input.className || null, 'schoolUpdates');
      await this.deliver(devices, announcementMessage({ title: input.title, message: input.message }));
    });
  }
}

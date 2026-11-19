import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { StudentDigestService } from './student-digest.service';
import { NotificationsService } from './notifications.service';
import { eveningPlanMessage, nightRecapMessage, StudentDigest } from './push-templates';
import { localClock } from './push-time';

function fakeDb(tables: Record<string, any[]>) {
  const query = (table: string) => {
    const filters: ((row: any) => boolean)[] = [];
    let action: { kind: 'select' | 'update' | 'delete'; patch?: any } = { kind: 'select' };
    const builder: any = {
      select: () => builder,
      eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return builder; },
      in: (k: string, v: any[]) => { filters.push((r) => v.includes(r[k])); return builder; },
      gte: (k: string, v: any) => { filters.push((r) => String(r[k]) >= String(v)); return builder; },
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      update: (patch: any) => { action = { kind: 'update', patch }; return builder; },
      delete: () => { action = { kind: 'delete' }; return builder; },
      insert: (rows: any[]) => {
        tables[table] = [...(tables[table] || []), ...rows.map((r, i) => ({ id: `${table}-${Date.now()}-${i}`, ...r }))];
        return { select: async () => ({ data: rows, error: null }) };
      },
      then: (resolve: any) => {
        const all = tables[table] || [];
        const match = (r: any) => filters.every((f) => f(r));
        if (action.kind === 'update') tables[table] = all.map((r) => (match(r) ? { ...r, ...action.patch } : r));
        if (action.kind === 'delete') tables[table] = all.filter((r) => !match(r));
        resolve({ data: all.filter(match), error: null });
      }
    };
    return builder;
  };
  return { client: { from: query } } as any;
}

const localFeed = { listHomeworkForStudent: () => [], listTests: () => [], listAttemptsForStudent: () => [] } as any;
const studentAuth = {
  resolveStudentProfile: async (id: string) => ({ id, name: 'Aarav Sharma', className: 'Class 8', schoolId: 'sch-1', teacherId: '' })
} as any;

// 2026-11-18 18:30 in Asia/Kolkata (UTC+5:30).
const EVENING = new Date('2026-11-18T13:00:00Z');
const NIGHT = new Date('2026-11-18T15:30:00Z');

function fixture() {
  return {
    homework: [
      { id: 'hw-1', student_id: 'stu-1', title: 'Fractions worksheet', subject: 'Maths', class_name: 'Class 8', due_at: '2026-11-18T17:00:00Z', status: 'pending', created_at: '2026-11-17T05:00:00Z' },
      { id: 'hw-2', student_id: 'stu-1', title: 'Essay', subject: 'English', class_name: 'Class 8', due_at: '2026-11-19T10:00:00Z', status: 'pending', created_at: '2026-11-17T05:00:00Z' },
      { id: 'hw-3', student_id: 'stu-1', title: 'Other class', subject: 'Science', class_name: 'Class 9', due_at: '2026-11-18T17:00:00Z', status: 'pending' },
      { id: 'hw-4', student_id: 'stu-1', title: 'Done', subject: 'Science', class_name: 'Class 8', due_at: '2026-11-18T10:00:00Z', status: 'pending' }
    ],
    homework_attempts: [{ id: 'a-1', homework_id: 'hw-4', student_id: 'stu-1', created_at: '2026-11-18T08:00:00Z' }],
    tests: [
      { id: 't-1', title: 'Unit test 3', subject: 'Science', school_id: 'sch-1', class_name: 'Class 8', status: 'assigned', start_at: '2026-11-19T04:30:00Z', end_at: '2026-11-19T06:00:00Z', duration_minutes: 40 },
      { id: 't-2', title: 'Other school', subject: 'Maths', school_id: 'sch-2', class_name: 'Class 8', status: 'assigned', start_at: '2026-11-19T04:30:00Z' }
    ],
    test_attempts: [],
    messages: [{ student_id: 'stu-1', role: 'user', created_at: '2026-11-18T12:00:00Z' }, { student_id: 'stu-1', role: 'user', created_at: '2026-11-18T12:05:00Z' }],
    orchard_activity: [{ student_id: 'stu-1', occurred_at: '2026-11-17T12:00:00Z' }],
    student_rewards: [],
    progress_metrics: [],
    student_push_devices: [
      { id: 'd-1', student_id: 'stu-1', token: 'token-ok-0123456789abcdef', timezone: 'Asia/Kolkata', school_id: 'sch-1', class_name: 'Class 8' },
      { id: 'd-2', student_id: 'stu-1', token: 'token-dead-0123456789abcd', timezone: 'Asia/Kolkata', school_id: 'sch-1', class_name: 'Class 8' }
    ]
  } as Record<string, any[]>;
}

test('local clock follows the student timezone', () => {
  assert.deepEqual(localClock(EVENING, 'Asia/Kolkata'), { date: '2026-11-18', minutes: 18 * 60 + 30 });
  assert.equal(localClock(EVENING, 'Not/AZone')?.minutes, 18 * 60 + 30);
});

test('digest counts only the student’s own pending homework, tomorrow’s tests and today’s activity', async () => {
  const db = fakeDb(fixture());
  const digest = await new StudentDigestService(db, localFeed, studentAuth).build('stu-1', 'Asia/Kolkata', EVENING);
  assert.equal(digest.firstName, 'Aarav');
  assert.deepEqual(digest.pendingHomework.map((h) => [h.subject, h.dueToday, h.dueTomorrow]), [['Maths', true, false], ['English', false, true]]);
  assert.deepEqual(digest.testsTomorrow.map((t) => [t.subject, t.opensAtLabel]), [['Science', '10:00 AM']]);
  assert.equal(digest.activity.homeworkSubmitted, 1);
  assert.equal(digest.activity.tutorQuestions, 2);
  assert.equal(digest.streakDays, 2);

  const plan = eveningPlanMessage(digest);
  assert.equal(plan.title, '📚 Aarav, 2 homework tasks to finish');
  assert.match(plan.body, /⏰ 1 due today \(Maths\) · 📅 1 due tomorrow \(English\)/);
  assert.match(plan.body, /2-day streak/);
});

test('templates personalise the no-homework plan and the 9 PM recap', () => {
  const base: StudentDigest = {
    firstName: 'Diya', pendingHomework: [], testsTomorrow: [], streakDays: 4, revisionSubject: 'Science',
    activity: { homeworkSubmitted: 0, testsCompleted: 0, bestTestScore: null, tutorQuestions: 0, practiceSessions: 0, checkedIn: false }
  };
  const plan = eveningPlanMessage(base);
  assert.equal(plan.route, 'ai_tutor');
  assert.match(plan.body, /Science revision with Sam/);

  assert.match(nightRecapMessage(base).title, /5 minutes before bed/);
  const great = nightRecapMessage({ ...base, activity: { ...base.activity, homeworkSubmitted: 2, testsCompleted: 1, bestTestScore: 85 } });
  assert.equal(great.title, '🎉 Great job today, Diya!');
  assert.match(great.body, /📚 2 homework submitted · 📝 1 mock test done \(85%\)/);
  const pending = nightRecapMessage({ ...base, pendingHomework: [{ title: 'x', subject: 'Maths', dueToday: true, dueTomorrow: false, overdue: false }] });
  assert.match(pending.body, /1 homework task waiting/);
});

test('scheduler sends the 6:30 PM plan + test reminder and the 9 PM recap once per day, dropping dead tokens', async () => {
  const tables = fixture();
  const db = fakeDb(tables);
  const sent: { token: string; type: string; title: string }[] = [];
  const fcm = {
    configured: true,
    send: async (token: string, message: any) => {
      if (token.startsWith('token-dead')) return { ok: false, invalidToken: true };
      sent.push({ token, type: message.type, title: message.title });
      return { ok: true, invalidToken: false };
    }
  } as any;
  const service = new NotificationsService(db, fcm, new StudentDigestService(db, localFeed, studentAuth), studentAuth);

  await service.tick(EVENING);
  assert.deepEqual(sent.map((s) => s.type), ['evening_plan', 'test_tomorrow']);
  assert.equal(sent[1].title, '📝 Mock test tomorrow: Science');
  assert.deepEqual(tables.student_push_devices.map((d) => d.token), ['token-ok-0123456789abcdef']);

  await service.tick(new Date(EVENING.getTime() + 60_000));
  assert.equal(sent.length, 2, 'no duplicate evening messages');

  await service.tick(NIGHT);
  assert.equal(sent.length, 3);
  assert.equal(sent[2].type, 'night_recap');
  assert.match(sent[2].title, /Nice progress today, Aarav/);
  await service.tick(new Date(NIGHT.getTime() + 60_000));
  assert.equal(sent.length, 3, 'no duplicate recap');
});

test('device registration keeps preferences per student and validates input', async () => {
  const tables = fixture();
  tables.student_push_devices = [];
  const db = fakeDb(tables);
  const service = new NotificationsService(db, { configured: false } as any, new StudentDigestService(db, localFeed, studentAuth), studentAuth);
  await assert.rejects(service.registerDevice('stu-1', { token: 'short' }), /valid device push token/);
  await service.registerDevice('stu-1', { token: 'phone-token-0123456789abcdef', platform: 'android', timezone: 'Asia/Kolkata' });
  const prefs = await service.updatePreferences('stu-1', { nightRecap: false });
  assert.equal(prefs.nightRecap, false);
  await assert.rejects(service.updatePreferences('stu-1', { eveningPlan: 'yes' }), /true or false/);
  await service.registerDevice('stu-1', { token: 'tablet-token-0123456789abcd', platform: 'ios', timezone: 'Bad/Zone' });
  assert.deepEqual(tables.student_push_devices.map((d) => [d.night_recap, d.timezone, d.class_name]), [[false, 'Asia/Kolkata', 'Class 8'], [false, 'Asia/Kolkata', 'Class 8']]);
  await service.removeDevice('stu-1', 'tablet-token-0123456789abcd');
  assert.equal(tables.student_push_devices.length, 1);
});

test('scheduled assignments push to the current class and respect notification preferences', async () => {
  const tables = fixture();
  tables.student_push_devices = [
    { student_id: 'current', token: 'current-phone', school_id: 'old-school', class_name: 'Class 7', timezone: 'Asia/Kolkata' },
    { student_id: 'moved', token: 'moved-phone', school_id: 'sch-1', class_name: 'Class 8' },
    { student_id: 'opted-out', token: 'muted-phone', school_id: 'sch-1', class_name: 'Class 8', test_reminders: false },
    { student_id: 'other-class', token: 'other-class-phone', school_id: 'sch-1', class_name: 'Class 9' },
  ];
  const auth = {
    listSchoolProgressStudents: async (schoolId: string) => {
      assert.equal(schoolId, 'sch-1');
      return [{ id: 'current', className: 'Class 8' }, { id: 'moved', className: 'Class 8' },
        { id: 'opted-out', className: 'Class 8' }, { id: 'other-class', className: 'Class 9' }];
    },
    resolveStudentProfile: async (id: string) => ({ id, schoolId: id === 'moved' ? 'sch-2' : 'sch-1', className: 'Class 8' }),
  } as any;
  const sent: { token: string; message: ReturnType<typeof eveningPlanMessage> }[] = [];
  const service = new NotificationsService(fakeDb(tables), {
    configured: true,
    send: async (token: string, message: ReturnType<typeof eveningPlanMessage>) => {
      sent.push({ token, message });
      return { ok: true, invalidToken: false };
    },
  } as any, null!, auth);
  await service.notifyTestAssigned({
    school_id: 'sch-1', class_name: 'Class 8', subject: 'Science', title: 'Plants', start_at: '2099-01-19T04:30:00Z',
  });
  assert.deepEqual(sent.map((s) => [s.token, s.message.type, s.message.route, s.message.data]), [
    ['current-phone', 'new_test', 'tests', { subject: 'Science' }],
  ]);
  assert.match(sent[0].message.body, /Plants.*opens.*10:00 AM/);
});

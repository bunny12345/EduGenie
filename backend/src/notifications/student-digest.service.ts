import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { LocalFeedService } from '../shared/local-feed.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { metricAt, metricScore } from '../progress/progress-metric.util';
import { localDate, localTimeLabel, shiftDate } from './push-time';
import { DigestHomework, DigestTest, StudentDigest } from './push-templates';

const DAY_MS = 86_400_000;
const SUBMITTED = new Set(['submitted', 'graded', 'resubmitted']);

async function rows(query: PromiseLike<any>): Promise<any[]> {
  try {
    const res = await query;
    return Array.isArray(res?.data) ? res.data : [];
  } catch {
    return [];
  }
}

const sameClass = (rowClass: unknown, studentClass: string) => {
  const value = String(rowClass || '').trim().toLowerCase();
  return !studentClass || !value || value === studentClass;
};

/** Builds one student's personalised day summary for push notifications. */
@Injectable()
export class StudentDigestService {
  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService,
    private readonly studentAuth: StudentAuthService
  ) {}

  async build(studentId: string, timezone: string, now = new Date()): Promise<StudentDigest> {
    const id = String(studentId || '').trim();
    const today = localDate(now, timezone)!;
    const tomorrow = shiftDate(today, 1);
    const since = new Date(now.getTime() - 60 * DAY_MS).toISOString();
    const profile = await this.studentAuth.resolveStudentProfile(id);
    const studentClass = profile.className.trim().toLowerCase();
    const onDay = (value: unknown, day = today) => localDate(value, timezone) === day;

    const [homeworkDb, homeworkAttempts, testsDb, testAttemptsDb, messages, orchard, rewards, metrics] = await Promise.all([
      rows(this.db.client.from('homework').select('*').eq('student_id', id)),
      rows(this.db.client.from('homework_attempts').select('*').eq('student_id', id)),
      profile.schoolId ? rows(this.db.client.from('tests').select('*').eq('school_id', profile.schoolId).eq('status', 'assigned')) : Promise.resolve([]),
      rows(this.db.client.from('test_attempts').select('*').eq('student_id', id).limit(500)),
      rows(this.db.client.from('messages').select('created_at,role').eq('student_id', id).eq('role', 'user').gte('created_at', since).limit(2000)),
      rows(this.db.client.from('orchard_activity').select('*').eq('student_id', id).limit(1000)),
      rows(this.db.client.from('student_rewards').select('*').eq('student_id', id).limit(500)),
      rows(this.db.client.from('progress_metrics').select('*').eq('student_id', id).limit(500))
    ]);

    // Homework: same merge/class/submitted/expired rules as GET /homework.
    const dbIds = new Set(homeworkDb.map((h) => String(h.id || '')));
    const homework = [...homeworkDb, ...this.localFeed.listHomeworkForStudent(id).filter((h: any) => !dbIds.has(String(h.id || '')))]
      .filter((h) => sameClass(h.class_name, studentClass));
    const attemptsByHomework = new Map<string, any[]>();
    for (const a of homeworkAttempts) {
      const key = String(a.homework_id || '');
      attemptsByHomework.set(key, [...(attemptsByHomework.get(key) || []), a]);
    }
    const pendingHomework: DigestHomework[] = [];
    let homeworkSubmittedToday = 0;
    for (const h of homework) {
      const attempts = attemptsByHomework.get(String(h.id || '')) || [];
      const submitted = attempts.length > 0 || SUBMITTED.has(String(h.status || '').toLowerCase());
      if (attempts.some((a) => onDay(a.created_at)) || (!attempts.length && onDay(h.submitted_at))) homeworkSubmittedToday += 1;
      if (submitted) continue;
      const startAt = h.start_at || h?.tasks?.meta?.startAt;
      if (startAt && new Date(startAt).getTime() > now.getTime()) continue;
      const due = h.due_at || h.created_at;
      const dueTime = due ? new Date(due).getTime() : NaN;
      if (Number.isFinite(dueTime) && now.getTime() - dueTime > 3 * DAY_MS) continue; // expired/hidden on the portal
      const dueDay = localDate(due, timezone);
      pendingHomework.push({
        title: String(h.title || 'Homework'),
        subject: String(h.subject || 'General'),
        dueToday: dueDay === today,
        dueTomorrow: dueDay === tomorrow,
        overdue: Number.isFinite(dueTime) && dueTime < now.getTime() && dueDay !== today
      });
    }

    // Tests: assigned to the student's school/class, opening or closing tomorrow.
    const byTestId = new Map<string, any>();
    for (const t of this.localFeed.listTests()) byTestId.set(String(t.id), t);
    for (const t of testsDb) byTestId.set(String(t.id), t);
    const testAttempts = [...testAttemptsDb, ...this.localFeed.listAttemptsForStudent(id)];
    const finishedTests = new Set(testAttempts.filter((a) => a.score !== null && a.score !== undefined).map((a) => String(a.test_id)));
    const testsTomorrow: DigestTest[] = [];
    for (const t of byTestId.values()) {
      if (t.status !== 'assigned' || String(t.school_id || '') !== profile.schoolId || !sameClass(t.class_name, studentClass)) continue;
      if (finishedTests.has(String(t.id))) continue;
      const startAt = t.start_at || t.startAt;
      const endAt = t.end_at || t.endAt;
      const opensTomorrow = localDate(startAt, timezone) === tomorrow;
      const closesTomorrow = !opensTomorrow && localDate(endAt, timezone) === tomorrow && (!startAt || new Date(startAt).getTime() <= now.getTime() + DAY_MS);
      if (!opensTomorrow && !closesTomorrow) continue;
      testsTomorrow.push({
        title: String(t.title || 'Mock test'),
        subject: String(t.subject || 'General'),
        opensAtLabel: localTimeLabel(startAt, timezone),
        closesAtLabel: localTimeLabel(endAt, timezone),
        durationMinutes: Math.max(1, Number(t.duration_minutes || 30)),
        closesTomorrow
      });
    }

    // Today's activity across web + app (everything is stored server-side).
    const testsToday = testAttempts.filter((a) => a.score !== null && a.score !== undefined && onDay(a.finished_at || a.submitted_at || a.created_at));
    const scores = testsToday.map((a) => Number(a.score)).filter(Number.isFinite);
    const checkIns = rewards.filter((r) => /check-?in/i.test(`${r.label || ''} ${r.reason || ''}`));
    const practice = orchard.filter((o) => onDay(o.occurred_at || o.created_at)).length
      + metrics.filter((m) => onDay(metricAt(m))).length;

    // Streak in the student's own days: consecutive active days ending today or yesterday.
    const activeDays = new Set<string>();
    const mark = (value: unknown) => { const day = localDate(value, timezone); if (day && day <= today) activeDays.add(day); };
    homeworkAttempts.forEach((a) => mark(a.created_at));
    homework.forEach((h) => mark(h.submitted_at));
    testAttempts.forEach((a) => mark(a.finished_at || a.submitted_at || a.started_at || a.created_at));
    orchard.forEach((o) => mark(o.occurred_at || o.created_at));
    metrics.forEach((m) => mark(metricAt(m)));
    checkIns.forEach((r) => mark(r.created_at));
    let streakDays = 0;
    let cursor = activeDays.has(today) ? today : shiftDate(today, -1);
    while (activeDays.has(cursor)) {
      streakDays += 1;
      cursor = shiftDate(cursor, -1);
    }

    // Suggest revising the weakest recent subject, else the latest homework subject.
    const subjectScores = new Map<string, number[]>();
    for (const m of metrics) {
      const subject = String(m.subject || '').trim();
      const score = metricScore(m);
      if (subject && Number.isFinite(score)) subjectScores.set(subject, [...(subjectScores.get(subject) || []), score]);
    }
    const weakest = [...subjectScores.entries()]
      .map(([subject, list]) => ({ subject, avg: list.reduce((s, v) => s + v, 0) / list.length }))
      .sort((a, b) => a.avg - b.avg)[0]?.subject;
    const latestHomework = [...homework].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];

    return {
      firstName: profile.name.split(/\s+/)[0] || '',
      pendingHomework,
      testsTomorrow,
      activity: {
        homeworkSubmitted: homeworkSubmittedToday,
        testsCompleted: testsToday.length,
        bestTestScore: scores.length ? Math.round(Math.max(...scores)) : null,
        tutorQuestions: messages.filter((m) => onDay(m.created_at)).length,
        practiceSessions: practice,
        checkedIn: checkIns.some((r) => onDay(r.created_at))
      },
      streakDays,
      revisionSubject: weakest || (latestHomework?.subject ? String(latestHomework.subject) : null)
    };
  }
}

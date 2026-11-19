import { Injectable, Logger } from '@nestjs/common';
import { StudentAuthService } from '../auth/student-auth.service';
import { localDate, localDateTimeLabel, safeTimezone, shiftDate } from '../notifications/push-time';
import { normalizeSubjectKey } from '../orchard/orchard.constants';
import { LearningScoreService } from '../progress/learning-score.service';
import { latestCompletedTests, mergeTestAttempts, testPercentage } from '../progress/test-results.util';
import { LocalFeedService } from '../shared/local-feed.service';
import { SupabaseService } from '../supabase.service';

type StatusRequest = { text: string; homework: boolean; tests: boolean; progress: boolean; plan: boolean };
type TutorScope = { lessonId?: string; lessonSubject?: string };
type HomeworkRow = {
  id: string; subject?: string; title?: string; status?: string; class_name?: string; school_id?: string;
  start_at?: string; created_at?: string; due_at?: string; submitted_at?: string; graded?: boolean;
  tasks?: { meta?: { startAt?: string; lessonIds?: string[]; lessonTitles?: string[] } };
};
type TestAttempt = Parameters<typeof testPercentage>[0] & { test_id?: string };
type ProgressSubject = { name: string; score: number; status: string };
const key = (text: string | undefined) => normalizeSubjectKey(text);
const normalized = (text: string | undefined) => String(text || '').toLowerCase().trim().replace(/\s+/g, ' ');
const label = (text: string | undefined, fallback: string) => String(text || fallback).replace(/\s+/g, ' ').trim().slice(0, 100);
const time = (text: string | undefined) => Date.parse(text || '');
const heading = 'Your schoolwork update';

export function isSchoolworkStatusReply(text: string) {
  return text.startsWith(`${heading}\n`);
}

export function schoolworkStatusRequest(message: string): StatusRequest | null {
  const text = normalized(message);
  // Mixed requests and teaching requests must still go through the tutor and homework review.
  if (!text || /\b(?:solve|answers?|solutions?|explain|hint|definition|why|prove|calculate|step.by.step|how (?:to|do i|can i) (?:do|solve|submit|answer|complete))\b/.test(text)) return null;
  const plan = /\b(?:what should i (?:study|revise|focus on|practi[cs]e)|(?:make|give|show) me (?:a |my )?(?:study|revision) plan|(?:my )?weakest subject|where (?:am i struggling|should i improve))\b/.test(text);
  const homework = /\bhomeworks?\b/.test(text) &&
    (/^(?:what(?:'s| is| are) (?:(?:the|my|our) )?(?:[\p{L}]+\s+){0,2}homeworks?\b|what homeworks?\b|today'?s homeworks?\b|(?:my )?homeworks?\??$)/u.test(text)
      || /\b(?:assigned|due|pending|outstanding|submit(?:ted)?|turned in|completed|do i have|show|list|check)\b/.test(text)
        && /^(?:what|which|when|do i|have i|did i|is my|has my|show|list|tell me|check|any|my)\b/.test(text));
  const tests = /\b(?:mock tests?|test (?:scores?|marks|results?|status)|scores?|marks)\b/.test(text) &&
    /^(?:what|which|when|do i have|have i|did i|is my|has my|show|list|tell me|check|any|how (?:did i|am i|have i)|my|mock test)/.test(text);
  const progress = /\b(?:my (?:learning )?progress|progress (?:graph|chart|trend)|learning (?:power|score)|how am i (?:doing|performing))\b/.test(text);
  return homework || tests || progress || plan ? { text, homework, tests, progress, plan } : null;
}

@Injectable()
export class SchoolworkStatusService {
  private readonly logger = new Logger(SchoolworkStatusService.name);

  constructor(
    private readonly db: SupabaseService,
    private readonly feed: LocalFeedService,
    private readonly auth: StudentAuthService,
    private readonly learning: LearningScoreService,
  ) {}

  private async studentRows<T>(table: string, columns: string, studentId: string): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.db.client.from(table).select(columns).eq('student_id', studentId)
        .order('id').range(offset, offset + 499);
      if (error) throw new Error(`Unable to read ${table}: ${error.message}`);
      const page: T[] = data || [];
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }

  private async homeworkLines(studentId: string, profile: { className: string; schoolId: string }, request: StatusRequest, subjects: Set<string>, now: number, scope?: TutorScope) {
    const [database, attempts] = await Promise.all([
      this.studentRows<HomeworkRow>('homework', '*', studentId),
      this.studentRows<{ homework_id: string }>('homework_attempts', 'id,homework_id', studentId),
    ]);
    const byId = new Map<string, HomeworkRow>(this.feed.listHomeworkForStudent(studentId).map((row) => [row.id, row]));
    for (const row of database) byId.set(row.id, row);
    const submittedIds = new Set(attempts.map((row) => row.homework_id));
    const zone = safeTimezone(undefined);
    const today = localDate(now, zone)!;
    const date = /\btomorrow\b/.test(request.text) ? shiftDate(today, 1) : today;
    const dated = /\b(?:today|tomorrow)\b/.test(request.text) || request.plan;
    const matching = [...byId.values()].filter((row) => {
      const subject = key(row.subject);
      const start = row.start_at || row.tasks?.meta?.startAt;
      return (!row.class_name || normalized(row.class_name) === normalized(profile.className))
        && (!row.school_id || row.school_id === profile.schoolId)
        && !(time(start) > now)
        && (!subjects.size || !!subject && subjects.has(subject));
    }).map((row) => ({
      row,
      submitted: submittedIds.has(row.id) || !!row.submitted_at || !!row.graded || /^(submitted|resubmitted|graded|completed)$/.test(normalized(row.status)),
    })).sort((a, b) => (time(a.row.due_at) || Infinity) - (time(b.row.due_at) || Infinity));
    const selected = matching.filter(({ row, submitted }) => {
      if (dated) return [row.due_at, row.created_at, row.start_at || row.tasks?.meta?.startAt].some((value) => localDate(value, zone) === date);
      return submitted || !(now - time(row.due_at) >= 4 * 86_400_000);
    });
    const items = scope ? selected.filter(({ row }) => scope.lessonId && key(scope.lessonSubject)
      && key(row.subject) === key(scope.lessonSubject) && row.tasks?.meta?.lessonIds?.includes(scope.lessonId)) : selected;
    const lines = items.slice(0, 6).map(({ row, submitted }) => {
      const due = localDateTimeLabel(row.due_at, zone);
      return `- ${label(row.subject, 'General')}: ${label(row.title, 'Homework')} — ${submitted ? 'submitted' : 'not submitted'}${due ? ` · due ${due}` : ''}`;
    });
    const header = dated ? `Homework assigned or due ${date === today ? 'today' : 'tomorrow'}` : 'Homework';
    const result = [`${header}: ${items.length ? `${items.filter((item) => !item.submitted).length} pending, ${items.filter((item) => item.submitted).length} submitted.` : 'none found.'}`, ...lines];
    if (items.length > lines.length) result.push('Open Homework to see the full list.');
    if (!scope && dated && date === today) {
      const overdue = matching.filter((item) => !selected.includes(item) && !item.submitted
        && time(item.row.due_at) < now && now - time(item.row.due_at) < 4 * 86_400_000);
      if (overdue.length) result.push(`You also have ${overdue.length} overdue ${overdue.length === 1 ? 'assignment' : 'assignments'} from earlier days.`);
    }
    if (scope && selected.length > items.length) {
      const other = selected.filter((item) => !items.includes(item));
      const destinations = [...new Set(other.flatMap(({ row }) =>
        (row.tasks?.meta?.lessonTitles || []).map((title) => `${label(row.subject, 'General')} → ${label(title, 'Unit')}`)))].slice(0, 3);
      result.push(destinations.length
        ? `For homework outside this Unit, select ${destinations.join(' or ')} in AI Tutor, or ask Sam on Home.`
        : 'There is homework outside this Unit or with no Unit linked. Select the matching subject and Unit, or ask Sam on Home.');
    }
    return result.join('\n');
  }

  private async testLines(studentId: string, profile: { className: string; schoolId: string }, subjects: Set<string>, now: number) {
    const [tests, attempts] = await Promise.all([
      this.learning.listAssignedTests(profile.schoolId, profile.className),
      this.studentRows<TestAttempt>('test_attempts', 'id,test_id,score,max_score,created_at,submitted_at,finished_at', studentId),
    ]);
    const merged = mergeTestAttempts(attempts, this.feed.listAttemptsForStudent(studentId));
    const completed = new Map(latestCompletedTests(merged, now).map((row) => [row.test_id, row]));
    const zone = safeTimezone(undefined);
    const visible = tests.filter((row) => !subjects.size || subjects.has(key(row.subject) || ''));
    const pending = visible.filter((row) => !completed.has(row.id) && !(time(row.end_at) <= now))
      .sort((a, b) => (time(a.start_at) || 0) - (time(b.start_at) || 0));
    const results = visible.filter((row) => completed.has(row.id))
      .sort((a, b) => time(completed.get(b.id)?.finished_at || completed.get(b.id)?.created_at) - time(completed.get(a.id)?.finished_at || completed.get(a.id)?.created_at));
    const missed = visible.length - pending.length - results.length;
    const prefix = (row: typeof visible[number]) => `- ${label(row.subject, 'General')}: ${label(row.title, 'Mock test')}`;
    const next = pending.slice(0, 4).map((row) => {
      const opens = localDateTimeLabel(row.start_at, zone);
      const closes = localDateTimeLabel(row.end_at, zone);
      const started = merged.some((attempt) => attempt.test_id === row.id);
      return `${prefix(row)} — ${time(row.start_at) > now ? `scheduled; opens ${opens}` : started ? 'started, not submitted' : 'open, not attempted'}${closes ? ` · closes ${closes}` : ''}`;
    });
    const recent = results.slice(0, 4).map((row) => `${prefix(row)} — completed, ${Math.round(testPercentage(completed.get(row.id)!))}%`);
    const lowest = results.slice(0, 4).sort((a, b) => testPercentage(completed.get(a.id)!) - testPercentage(completed.get(b.id)!))[0];
    return [
      `Mock tests: ${pending.length} pending, ${results.length} completed${missed ? `, ${missed} closed without a result` : ''}.`,
      ...next, ...recent,
      lowest && testPercentage(completed.get(lowest.id)!) < 70
        ? `For ${label(lowest.subject, 'that subject')}, review the questions you missed in Mock Tests, revisit one related Unit, then try a short practice quiz.` : '',
    ].filter(Boolean).join('\n');
  }

  private async progressLines(studentId: string, subjects: Set<string>) {
    const report = await this.learning.getLearningScore(studentId);
    if (!report.hasData) return 'Progress: there is not enough activity for a learning trend yet. Try one short revision session or submit an assignment to get started.';
    const active: ProgressSubject[] = (report.subjects || []).filter((row: ProgressSubject) =>
      Number.isFinite(row.score) && row.status !== 'not-started' && (!subjects.size || subjects.has(key(row.name) || '')));
    const points = (report.trend || []).filter((point: { score: number | null; future?: boolean }) => !point.future && Number.isFinite(point.score)).slice(-2);
    const change = points.length === 2 ? points[1].score - points[0].score : null;
    const overall = `Learning Power: ${report.score}/${report.maxScore}.${change === null ? '' : ` The last two monthly points moved from ${points[0].score} to ${points[1].score}${change === 0 ? ' (steady)' : change > 0 ? ' (up)' : ' (down)'}.`}`;
    const focus = [...active].sort((a, b) => a.score - b.score)[0];
    return [
      subjects.size ? `Subject progress: ${active.length ? active.map((row) => `${label(row.name, 'Subject')} ${row.score}%`).join(', ') : 'no recorded activity for the selected subject yet'}.` : overall,
      focus && focus.score < 70 ? `Start with ${label(focus.name, 'your focus subject')} (${focus.score}%): review one Unit for 10 minutes, then ask me for a quick practice question.` : '',
    ].filter(Boolean).join('\n');
  }

  async reply(studentId: string, request: StatusRequest, scope?: TutorScope) {
    const homeRedirect = 'For mock-test results, overall progress, or a study plan, ask Sam on Home. Here I can help with the selected Unit.';
    const now = Date.now();
    const sections: string[] = [];
    let subjects: string[] = [];
    if (scope && !request.homework) return { reply: `${heading}\n${homeRedirect}`, followups: [], subjects };

    try {
      const profile = await this.auth.resolveStudentProfile(studentId);
      if (!profile.schoolId || !profile.className) throw new Error('Student school or class is missing');
      subjects = (await this.auth.listClassTeachers(profile.schoolId, profile.className)).map((teacher) => teacher.subject).filter(Boolean);
      subjects = [...new Set(subjects)];
      const words = ` ${request.text.replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
      const aliases = [...subjects, 'Math', 'Maths', 'Mathematics', 'General Science', 'Social Studies', 'Social Science', 'SST', 'Computer Science', 'English Language'];
      const requestedSubjects = new Set(aliases.filter((name) => words.includes(` ${normalized(name)} `))
        .map(key).filter((value): value is string => !!value));
      const reads: Array<{ name: string; value: Promise<string> }> = [];
      if (request.homework || request.plan) reads.push({ name: 'homework', value: this.homeworkLines(studentId, profile, request, requestedSubjects, now, scope) });
      if (!scope && (request.tests || request.plan)) reads.push({ name: 'mock tests', value: this.testLines(studentId, profile, requestedSubjects, now) });
      if (!scope && (request.progress || request.plan)) reads.push({ name: 'progress', value: this.progressLines(studentId, requestedSubjects) });
      sections.push(...await Promise.all(reads.map(async ({ name, value }) => {
        try {
          return await value;
        } catch (error) {
          this.logger.warn(`Schoolwork status (${name}): ${error instanceof Error ? error.message : String(error)}`);
          return `I couldn’t verify your ${name} right now. Please try again or check the student portal.`;
        }
      })));
    } catch (error) {
      this.logger.warn(`Schoolwork status profile: ${error instanceof Error ? error.message : String(error)}`);
      sections.push('I couldn’t verify your school records right now. Please try again.');
    }
    if (scope && (request.tests || request.progress || request.plan)) sections.push(homeRedirect);
    if (!scope && request.plan) sections.push('Start with any unfinished homework due today. Then spend 10 minutes on an upcoming test or the subject that needs the most practice.');
    const followups = scope ? [] : ['What homework is due today?', 'How did I do on my mock tests?', 'How is my progress?']
      .filter((_, index) => ![request.homework, request.tests, request.progress][index]);
    return { reply: `${heading}\n${sections.join('\n\n')}`, followups, subjects };
  }
}

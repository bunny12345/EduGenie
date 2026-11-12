import { BadRequestException, ForbiddenException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { testPercentage } from '../progress/test-results.util';
import { LocalFeedService } from '../shared/local-feed.service';

export type ExamSession = {
  test_id: string; student_id: string; attempt_id: string; school_id: string; teacher_id: string;
  student_name: string; status: 'active' | 'paused' | 'closed'; answers: Record<string, number>;
  client_id: string; last_seen: string; incident_count: number; last_reason: string | null;
  paused_at: string | null; resumed_at: string | null; revision: number;
  finalized_at: string | null;
};
const LEASE_MS = 25000;
const REASONS = new Set(['tab_hidden', 'window_blur', 'left_test', 'app_background', 'connection_lost', 'another_device']);

@Injectable()
export class ExamControlService {
  constructor(private readonly db: SupabaseService, private readonly auth: StudentAuthService, private readonly feed: LocalFeedService) {}

  private checked<T>(result: { data: T; error?: { message?: string } }, operation: string): T {
    if (result.error) {
      console.warn(`Exam controls: ${operation}`, result.error.message);
      throw new ServiceUnavailableException('Exam controls are unavailable. Ensure the strict mock-exam migration is installed.');
    }
    return result.data;
  }

  async enabled(testId: string): Promise<boolean> {
    const rows = this.checked<Array<{ enabled: boolean }>>(await this.db.client.from('strict_test_settings').select('*').eq('test_id', testId), 'read settings');
    return rows?.[0]?.enabled === true;
  }

  async configure(testId: string, enabled: boolean) {
    if (this.db.client.isMock) {
      const rows = this.checked<any[]>(await this.db.client.from('strict_test_settings').select('*').eq('test_id', testId), 'read settings');
      this.checked(await (rows.length
        ? this.db.client.from('strict_test_settings').update({ enabled }).eq('test_id', testId).select()
        : this.db.client.from('strict_test_settings').insert([{ test_id: testId, enabled }]).select()), 'save settings');
    } else {
      this.checked(await this.db.client.from('strict_test_settings').upsert({ test_id: testId, enabled }, { onConflict: 'test_id' }).select(), 'save settings');
    }
  }

  async decorate(tests: any[]) {
    if (!tests.length) return tests;
    const rows: Array<{ test_id: string; enabled: boolean }> = [];
    for (let offset = 0; offset < tests.length; offset += 500) {
      rows.push(...this.checked<Array<{ test_id: string; enabled: boolean }>>(await this.db.client.from('strict_test_settings').select('*')
        .in('test_id', tests.slice(offset, offset + 500).map((test) => test.id)), 'read settings'));
    }
    const enabled = new Set((rows || []).filter((row) => row.enabled).map((row) => row.test_id));
    return tests.map((test) => ({ ...test, strictMode: enabled.has(String(test.id)) }));
  }

  async session(testId: string, studentId: string): Promise<ExamSession | null> {
    const rows = this.checked<ExamSession[]>(await this.db.client.from('strict_exam_sessions').select('*').eq('test_id', testId).eq('student_id', studentId), 'read session');
    return rows?.[0] || null;
  }

  clientId(value: unknown): string {
    if (typeof value !== 'string' || value.length < 8 || value.length > 150) throw new BadRequestException('An exam device identifier is required. Update the app and retry.');
    return value;
  }

  async open(test: any, studentId: string, attemptId: string, clientId: string) {
    const profile = await this.auth.resolveStudentProfile(studentId);
    const row: ExamSession = {
      test_id: test.id, student_id: studentId, attempt_id: attemptId, school_id: test.school_id,
      teacher_id: test.teacher_id, student_name: profile?.name || 'Student', status: 'active', answers: {},
      client_id: this.clientId(clientId), last_seen: new Date().toISOString(), incident_count: 0,
      last_reason: null, paused_at: null, resumed_at: null, revision: 0,
      finalized_at: null,
    };
    if (this.db.client.isMock) {
      if (!await this.session(test.id, studentId)) this.checked(await this.db.client.from('strict_exam_sessions').insert([row]).select(), 'open session');
    } else {
      this.checked(await this.db.client.from('strict_exam_sessions').upsert(row, { onConflict: 'test_id,student_id', ignoreDuplicates: true }).select(), 'open session');
    }
    const saved = await this.session(test.id, studentId);
    if (!saved) throw new ServiceUnavailableException('Unable to confirm exam session');
    return saved;
  }

  // Compare-and-swap serializes saves, pauses, resumes and closing across devices.
  async change(testId: string, studentId: string, update: (row: ExamSession) => Partial<ExamSession>) {
    for (let retry = 0; retry < 8; retry++) {
      const current = await this.session(testId, studentId);
      if (!current) throw new BadRequestException('Exam session not found. Open your test first.');
      const patch = update(current);
      if (!Object.keys(patch).length) return current;
      const rows = this.checked<ExamSession[]>(await this.db.client.from('strict_exam_sessions')
        .update({ ...patch, revision: current.revision + 1 }).eq('test_id', testId).eq('student_id', studentId)
        .eq('revision', current.revision).select('*'), 'update session');
      if (rows?.[0]) return rows[0];
    }
    throw new ServiceUnavailableException('Exam state changed. Please retry.');
  }

  private pausePatch(row: ExamSession, reason: string): Partial<ExamSession> {
    if (row.status !== 'active') return {};
    return { status: 'paused', incident_count: row.incident_count + 1, last_reason: reason, paused_at: new Date().toISOString() };
  }

  async sync(test: any, studentId: string, clientId?: string, reason?: string, answers?: Record<string, number>) {
    if (reason && !REASONS.has(reason)) throw new BadRequestException('Invalid exam incident');
    const end = new Date(test.end_at || test.endAt).getTime();
    return this.change(test.id, studentId, (row) => {
      if (row.status === 'closed') return {};
      if (Number.isFinite(end) && Date.now() >= end) return { status: 'closed' };
      if (reason) return this.pausePatch(row, reason);
      if (row.status === 'paused') return {};
      if (Date.now() - new Date(row.last_seen).getTime() > LEASE_MS) return this.pausePatch(row, 'connection_lost');
      if (clientId && row.client_id && clientId !== row.client_id) return this.pausePatch(row, 'another_device');
      if (!clientId) return {};
      return { last_seen: new Date().toISOString(), client_id: clientId, ...(answers ? { answers: { ...row.answers, ...answers } } : {}) };
    });
  }

  async resume(test: any, studentId: string) {
    if (Date.now() >= new Date(test.end_at || test.endAt).getTime()) throw new BadRequestException('This exam has ended.');
    return this.change(test.id, studentId, (row) => row.status !== 'paused' ? {} : {
      status: 'active', client_id: '', last_seen: new Date().toISOString(), resumed_at: new Date().toISOString(),
    });
  }

  async roster(test: any) {
    const rows: ExamSession[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = this.checked<ExamSession[]>(await this.db.client.from('strict_exam_sessions').select('*').eq('test_id', test.id)
        .eq('teacher_id', test.teacher_id).eq('school_id', test.school_id).order('student_id').range(offset, offset + 499), 'read exam roster');
      rows.push(...page);
      if (page.length < 500) break;
    }
    return Promise.all((rows || []).map((row) => this.sync(test, row.student_id)));
  }

  async unfinished(): Promise<ExamSession[]> {
    const all: ExamSession[] = [];
    for (let offset = 0; ; offset += 500) {
      const rows = this.checked<ExamSession[]>(await this.db.client.from('strict_exam_sessions').select('*')
        .is('finalized_at', null).order('test_id').order('student_id').range(offset, offset + 499), 'read unfinished exams');
      all.push(...rows);
      if (rows.length < 500) return all;
    }
  }

  async restrictions(studentId: string) {
    const profile = await this.auth.resolveStudentProfile(studentId);
    if (!profile?.schoolId || !profile?.className) throw new ForbiddenException('Student school and class are required');
    const tests: any[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = this.checked<any[]>(await this.db.client.from('tests').select('*').eq('school_id', profile.schoolId)
        .order('id').range(offset, offset + 499), 'read active exams');
      tests.push(...page);
      if (page.length < 500) break;
    }
    const now = Date.now();
    const merged = new Map([...this.feed.listTests(), ...tests].map((row) => [String(row.id), row]));
    const active = [...merged.values()].filter((test) => test.school_id === profile.schoolId && test.status === 'assigned'
      && (!test.class_name || String(test.class_name).trim().toLowerCase() === profile.className.trim().toLowerCase())
      && now >= new Date(test.start_at || test.startAt).getTime() && now < new Date(test.end_at || test.endAt).getTime());
    const result: Array<{ testId: string; title: string; endAt: string }> = [];
    for (const test of (await this.decorate(active)).filter((row) => row.strictMode)) {
      const attempts = String(test.id).startsWith('local-test-') ? this.feed.listAttemptsForStudent(studentId).filter((row) => row.test_id === test.id)
        : this.checked<any[]>(await this.db.client.from('test_attempts').select('score').eq('test_id', test.id).eq('student_id', studentId), 'read exam completion');
      const session = await this.session(test.id, studentId);
      if (session?.status === 'closed' || attempts?.some((row) => Number.isFinite(testPercentage(row)))) continue;
      result.push({ testId: test.id, title: test.title, endAt: test.end_at || test.endAt });
    }
    return result;
  }

  async assertTutorAccess(studentId: string) {
    if ((await this.restrictions(studentId)).length) {
      throw new HttpException({ success: false, code: 'STRICT_EXAM_ACTIVE',
        error: 'AI Tutor is unavailable during your strict mock exam. Access returns after submission or when the scheduled exam ends.' }, 423);
    }
  }
}

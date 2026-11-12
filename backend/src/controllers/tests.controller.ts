import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ExamControlService, ExamSession } from '../exams/exam-control.service';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { requireStudentIdentity } from '../auth/student-identity';
import { latestCompletedTests, mergeTestAttempts, testPercentage } from '../progress/test-results.util';

@Controller('tests')
export class TestsController {
  private examTimer?: ReturnType<typeof setInterval>;
  private examSweepBusy = false;
  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService,
    private readonly studentAuth: StudentAuthService,
    private readonly exams: ExamControlService
  ) {}

  onModuleInit() {
    this.examTimer = setInterval(() => { void this.finishExpiredStrictExams(); }, 15000);
  }

  onModuleDestroy() {
    if (this.examTimer) clearInterval(this.examTimer);
  }

  private async finishExpiredStrictExams() {
    if (this.examSweepBusy) return;
    this.examSweepBusy = true;
    try {
      for (const session of await this.exams.unfinished()) {
        try {
          const test = await this.loadTest(session.test_id);
          if (session.status !== 'closed' && Date.now() < new Date(test.end_at || test.endAt).getTime()) continue;
          const closed = await this.exams.sync(test, session.student_id);
          const attempt = await this.loadStudentAttempt(closed.attempt_id, closed.student_id);
          if (attempt) await this.scoreAndFinalizeAttempt(attempt, closed.answers, closed.student_id);
        } catch (error) {
          console.warn('Unable to finalize strict exam', session.test_id, error);
        }
      }
    } catch (error) {
      console.warn('Strict exam finalization sweep unavailable', error);
    } finally { this.examSweepBusy = false; }
  }

  private requireTeacher(req: any) {
    if (req?.user?.role !== 'teacher' || !req.user.sub || !req.user.schoolId) {
      throw new ForbiddenException('Teacher access required');
    }
  }

  private async loadTest(testId: string) {
    const local = this.localFeed.listTests().find((row: any) => String(row.id) === testId);
    if (testId.startsWith('local-test-') && local) return local;
    const res = await this.db.client.from('tests').select('*').eq('id', testId).limit(1);
    if (res?.error) throw new ServiceUnavailableException('Unable to verify test access');
    const row = res?.data?.[0] || local;
    if (!row) throw new NotFoundException('Test not found');
    return row;
  }

  private async requireOwnedTest(req: any, testId: string) {
    this.requireTeacher(req);
    const row = await this.loadTest(testId);
    if (row.teacher_id !== req.user.sub || row.school_id !== req.user.schoolId) {
      throw new ForbiddenException('Test not in teacher scope');
    }
    return row;
  }

  private async requireEditableTest(req: any, testId: string) {
    const row = await this.requireOwnedTest(req, testId);
    if (row.status === 'assigned' && await this.exams.enabled(testId)) {
      throw new ForbiddenException('Assigned strict exams cannot be edited. Use Reuse to create a new draft.');
    }
    return row;
  }

  private async loadStudentAttempt(attemptId: string, studentId: string) {
    const local = this.localFeed.getAttempt(attemptId);
    if (local && local.student_id !== studentId) {
      throw new ForbiddenException('Attempt not owned by this student');
    }
    if (attemptId.startsWith('local-attempt-')) return local;
    const res = await this.db.client.from('test_attempts').select('*')
      .eq('id', attemptId).eq('student_id', studentId).limit(1);
    if (res?.error) throw new ServiceUnavailableException('Unable to verify attempt access');
    const row = res?.data?.[0] || local;
    if (row && row.student_id !== studentId) throw new ForbiddenException('Attempt not owned by this student');
    return row;
  }

  private async scopeTests(req: any, rows: any[]) {
    if (req?.user?.role === 'teacher') {
      this.requireTeacher(req);
      return rows.filter((row) => row.teacher_id === req.user.sub && row.school_id === req.user.schoolId);
    }
    const id = requireStudentIdentity(req);
    const profile = await this.studentAuth.resolveStudentProfile(id);
    if (!profile?.schoolId || !profile?.className) {
      throw new ForbiddenException('Student school and class are required');
    }
    return rows.filter((row) => row.status === 'assigned'
      && row.school_id === profile.schoolId
      && (!row.class_name || String(row.class_name).trim().toLowerCase() === profile.className.trim().toLowerCase()));
  }

  // Students only ever see tests their teacher has explicitly assigned
  // (status 'assigned'), scoped to their own class. Teachers (filter 'all')
  // and the 'completed' filter are unaffected.
  private async filterTestsForRequest(tests: any[], filter: string | undefined, studentId: string) {
    const rows = Array.isArray(tests) ? tests : [];
    if (!filter) return rows;
    if (filter === 'completed') return rows.filter((t: any) => t.status === 'completed');
    if (filter === 'upcoming') {
      let scoped = rows.filter((t: any) => t.status === 'assigned');
      const id = String(studentId || '').trim();
      if (id) {
        const profile = await this.studentAuth.resolveStudentProfile(id);
        const studentClass = String(profile?.className || '').trim().toLowerCase();
        if (studentClass) {
          scoped = scoped.filter((t: any) => {
            const testClass = String(t.class_name || t.className || '').trim().toLowerCase();
            return !testClass || testClass === studentClass;
          });
        }
      }
      return scoped;
    }
    return rows;
  }

  // Once a student has submitted an attempt for a test, mark it so the
  // frontend can lock the "Start" button instead of letting them retake it.
  // Also attaches the scheduled attempt window (if any) and auto-finalizes
  // any attempt that was started but never submitted before the window closed.
  private async attachAttemptStatus(tests: any[], studentId: string) {
    const rows = Array.isArray(tests) ? tests : [];
    const id = String(studentId || '').trim();
    if (!id || !rows.length) return rows.map((t: any) => ({ ...t, attempted: false, windowStatus: this.computeWindowStatus(t) }));
    try {
      const attemptRows = await this.studentAttempts(id);
      const latestByTest = new Map(latestCompletedTests(attemptRows, Date.now()).map((row) => [row.test_id, row]));
      const inProgressByTest = new Map<string, any>();
      attemptRows.forEach((a: any) => {
        const key = String(a.test_id || '');
        if (a.score === null || a.score === undefined) {
          // Not submitted yet — remember it in case the window has expired.
          const existing = inProgressByTest.get(key);
          const time = new Date(a.started_at || a.created_at || 0).getTime();
          const existingTime = existing ? new Date(existing.started_at || existing.created_at || 0).getTime() : -1;
          if (!existing || time >= existingTime) inProgressByTest.set(key, a);
          return;
        }
      });

      const out = [];
      for (const t of rows) {
        const testId = String(t?.id || '');
        const windowStatus = this.computeWindowStatus(t);
        let attempt = latestByTest.get(testId);
        if (!attempt && windowStatus === 'expired' && inProgressByTest.has(testId)) {
          // Finalize only persisted answers; unsaved browser selections cannot
          // be reconstructed after the window closes.
          const stale = inProgressByTest.get(testId);
          const strict = t.strictMode ? await this.exams.sync(t, id) : null;
          attempt = await this.scoreAndFinalizeAttempt(stale, strict?.answers || stale.answers || {}, id);
        }
        out.push({
          ...t,
          windowStatus,
          startAt: t.start_at || t.startAt || null,
          endAt: t.end_at || t.endAt || null,
          attempted: !!attempt,
          lastScore: attempt ? testPercentage(attempt) : undefined,
          lastFeedback: attempt?.feedback ?? undefined,
          attemptId: attempt?.id ?? undefined
        });
      }
      return out;
    } catch (error) {
      console.warn('Unable to retrieve test results', error);
      throw new ServiceUnavailableException('Unable to retrieve test results');
    }
  }

  private async studentAttempts(studentId: string): Promise<any[]> {
    const database: any[] = [];
    for (let offset = 0; ; offset += 500) {
      const res = await this.db.client.from('test_attempts').select('*').eq('student_id', studentId)
        .order('id').range(offset, offset + 499);
      if (res.error) throw new ServiceUnavailableException('Unable to retrieve saved test attempts');
      database.push(...(res.data || []));
      if ((res.data || []).length < 500) break;
    }
    return mergeTestAttempts(database, this.localFeed.listAttemptsForStudent(studentId));
  }

  // 'none' = no window configured (legacy tests — always open).
  private computeWindowStatus(test: any): 'none' | 'scheduled' | 'open' | 'expired' {
    const startAtRaw = test?.start_at || test?.startAt;
    const endAtRaw = test?.end_at || test?.endAt;
    if (!startAtRaw && !endAtRaw) return 'none';
    const now = Date.now();
    const startAt = startAtRaw ? new Date(startAtRaw).getTime() : null;
    const endAt = endAtRaw ? new Date(endAtRaw).getTime() : null;
    if (startAt && now < startAt) return 'scheduled';
    if (endAt && now >= endAt) return 'expired';
    return 'open';
  }

  // Scores a set of answers against a test's questions and persists the
  // result onto the attempt. Shared by the normal submit flow and the
  // auto-finalize sweep for attempts whose window closed before submission.
  private async scoreAndFinalizeAttempt(attempt: any, answers: any, actorId: string) {
    if (Number.isFinite(testPercentage(attempt))) {
      const strict = await this.exams.session(attempt.test_id, actorId);
      if (strict?.status === 'closed' && !strict.finalized_at) {
        await this.exams.change(attempt.test_id, actorId, (row) => row.finalized_at ? {} : { finalized_at: new Date().toISOString() });
      }
      const questions = await this.loadQuestions(attempt.test_id);
      const { perQuestionFeedback } = this.computePerQuestionFeedback(questions, attempt.answers || {});
      return { id: attempt.id, score: testPercentage(attempt), feedback: attempt.feedback || '', perQuestionFeedback };
    }
    const questions = await this.loadQuestions(attempt.test_id);
    const { perQuestionFeedback, correctCount } = this.computePerQuestionFeedback(questions, answers);

    const total = questions.length;
    if (!total) throw new ServiceUnavailableException('Unable to grade a test without questions');
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const feedback = score >= 80
      ? 'Great work. Keep consistency.'
      : score >= 50
        ? 'Good attempt. Focus on weak topics.'
        : 'Needs improvement. Revise and retry.';
    const patch = { finished_at: new Date().toISOString(), score, feedback, answers };
    if (String(attempt.id).startsWith('local-attempt-')) {
      if (!this.localFeed.finishAttempt(attempt.id, patch)) {
        throw new ServiceUnavailableException('Unable to save test result');
      }
    } else {
      const saved = await this.db.client.from('test_attempts').update(patch)
        .eq('id', attempt.id).eq('student_id', actorId)
        .is('score', null).select('*');
      if (saved.error) {
        console.warn('Unable to save test result', saved.error.message);
        throw new ServiceUnavailableException('Unable to save test result. Please retry.');
      }
      if (!saved.data?.length) {
        const existing = await this.loadStudentAttempt(attempt.id, actorId);
        if (existing && Number.isFinite(testPercentage(existing))) {
          return this.scoreAndFinalizeAttempt(existing, existing.answers || {}, actorId);
        }
        throw new ServiceUnavailableException('Unable to confirm saved test result. Please retry.');
      }
      this.localFeed.finishAttempt(attempt.id, patch);
    }
    this.localFeed.logStudentActivity(actorId || attempt.student_id, {
      type: 'test',
      action: 'submitted',
      title: `Test ${attempt.test_id}`,
      details: `Submitted test attempt with score ${score}%`,
      meta: { testId: attempt.test_id, attemptId: attempt.id, score }
    });
    const strict = await this.exams.session(attempt.test_id, actorId);
    if (strict?.status === 'closed') {
      await this.exams.change(attempt.test_id, actorId, (row) => row.finalized_at ? {} : { finalized_at: new Date().toISOString() });
    }
    return { id: attempt.id, score, feedback, perQuestionFeedback };
  }

  private async loadQuestions(testId: string) {
    if (testId.startsWith('local-test-')) return this.localFeed.listQuestions(testId);
    const questionsRes = await this.db.client.from('test_questions').select('*').eq('test_id', testId);
    if (questionsRes.error) throw new ServiceUnavailableException('Unable to retrieve test questions');
    return Array.isArray((questionsRes as any)?.data) && (questionsRes as any).data.length
      ? (questionsRes as any).data
      : this.localFeed.listQuestions(testId);
  }

  private computePerQuestionFeedback(questions: any[], answers: any) {
    const resolveSubmittedIndex = (value: any, options: any[]) => {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d+$/.test(trimmed)) return Number(trimmed);
        const idx = (options || []).findIndex((opt) => String(opt || '').trim().toLowerCase() === trimmed.toLowerCase());
        if (idx >= 0) return idx;
      }
      return -1;
    };

    let correctCount = 0;
    const perQuestionFeedback = questions.map((q: any, index: number) => {
      const options = Array.isArray(q.options) ? q.options : [];
      const submittedRaw = Array.isArray(answers) ? answers[index] : (answers?.[q.id] ?? answers?.[String(q.id)]);
      const submittedIndex = resolveSubmittedIndex(submittedRaw, options);
      const correctIndex = Number(q.correct_option ?? q.correctOption ?? -1);
      const isCorrect = submittedIndex >= 0 && submittedIndex === correctIndex;
      if (isCorrect) correctCount += 1;
      return {
        questionId: q.id,
        text: q.text || q.question || 'Question',
        options,
        isCorrect,
        selectedOption: submittedIndex,
        correctOption: correctIndex,
        feedback: isCorrect ? 'Correct.' : 'Review this concept.'
      };
    });
    return { perQuestionFeedback, correctCount };
  }

  @Get()
  @UseGuards(AuthGuard)
  async list(@Req() req: any, @Query('studentId') studentId: string, @Query('filter') filter?: string) {
    const id = req.studentId || studentId;
    try {
      const byId = new Map<string, any>(this.localFeed.listTests().map((row) => [String(row.id), row]));
      for (let offset = 0; ; offset += 500) {
        const res = await this.db.client.from('tests').select('*').order('id').range(offset, offset + 499);
        if (res.error) throw new ServiceUnavailableException('Unable to retrieve assigned tests');
        for (const row of res.data || []) byId.set(String(row.id), row);
        if ((res.data || []).length < 500) break;
      }
      let tests = [...byId.values()];
      tests = await this.exams.decorate(await this.filterTestsForRequest(await this.scopeTests(req, tests), filter, id));
      if (filter === 'upcoming') tests = await this.attachAttemptStatus(tests, id);
      return { success: true, tests: Array.isArray(tests) ? tests : [] };
    } catch (e) {
      if (e instanceof ServiceUnavailableException || e instanceof ForbiddenException) throw e;
      console.warn('Unable to retrieve assigned tests', e);
      throw new ServiceUnavailableException('Unable to retrieve assigned tests');
    }
  }

  // Teacher: create a test
  @Post('create')
  @UseGuards(AuthGuard)
  async create(@Req() req: any, @Body() body: any) {
    this.requireTeacher(req);
    try {
      const row = {
        title: String(body.title || 'Untitled Test').slice(0, 200),
        subject: String(body.subject || 'General').slice(0, 100),
        class_name: String(body.className || body.class_name || '').slice(0, 100),
        school_id: req.user.schoolId,
        teacher_id: req.user.sub,
        duration_minutes: Math.max(1, Number(body.durationMinutes || 30)),
        status: 'draft',
        created_at: new Date().toISOString()
      };
      const res = await this.db.client.from('tests').insert([row]).select();
      const test = (res as any)?.data?.[0] || row;
      const normalized = {
        id: test.id || `local-test-${Date.now()}`,
        title: test.title,
        subject: test.subject,
        class_name: test.class_name || row.class_name,
        school_id: row.school_id,
        teacher_id: row.teacher_id,
        duration_minutes: test.duration_minutes || row.duration_minutes,
        status: test.status || 'draft'
      };
      this.localFeed.upsertTest(normalized);
      return { success: true, test: { id: test.id || null, title: test.title, subject: test.subject, status: test.status } };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'test create failed'), test: null };
    }
  }

  // Teacher: assign a test so it becomes visible to students in its class,
  // only during the given [startAt, endAt] attempt window.
  @Post(':testId/assign')
  @UseGuards(AuthGuard)
  async assign(@Req() req: any, @Param('testId') testId: string, @Body() body: any) {
    const ownedTest = await this.requireOwnedTest(req, testId);
    try {
      const questionsRes = await this.db.client.from('test_questions').select('id').eq('test_id', testId);
      const dbQuestionCount = Array.isArray((questionsRes as any)?.data) ? (questionsRes as any).data.length : 0;
      const questionCount = dbQuestionCount || this.localFeed.listQuestions(testId).length;
      if (!questionCount) {
        return { success: false, error: 'Add at least one question before assigning this test.', test: null };
      }

      const startAtRaw = body?.startAt ? new Date(body.startAt) : null;
      const endAtRaw = body?.endAt ? new Date(body.endAt) : null;
      if (!startAtRaw || Number.isNaN(startAtRaw.getTime()) || !endAtRaw || Number.isNaN(endAtRaw.getTime())) {
        return { success: false, error: 'Set both an opens-at and closes-at time before assigning this test.', test: null };
      }
      if (endAtRaw <= startAtRaw) {
        return { success: false, error: 'The closing time must be after the opening time.', test: null };
      }
      if (endAtRaw.getTime() < Date.now()) {
        return { success: false, error: 'The closing time must be in the future.', test: null };
      }
      const startAt = startAtRaw.toISOString();
      const endAt = endAtRaw.toISOString();
      if (body.strictMode !== undefined && typeof body.strictMode !== 'boolean') {
        throw new BadRequestException('Strict mode must be true or false');
      }
      if (ownedTest.status === 'assigned' && (body.strictMode === true || await this.exams.enabled(testId))) {
        throw new BadRequestException('This test is already assigned. Strict mode cannot be changed during an exam.');
      }
      await this.exams.configure(testId, body.strictMode === true);

      const res = await this.db.client.from('tests').update({ status: 'assigned', start_at: startAt, end_at: endAt }).eq('id', testId).select();
      const test = (res as any)?.data?.[0] || null;
      if (!test) {
        const localTest = this.localFeed.listTests().find((t: any) => String(t?.id || '') === String(testId));
        if (!localTest) return { success: false, error: 'Test not found', test: null };
        const updated = { ...localTest, status: 'assigned', start_at: startAt, end_at: endAt };
        this.localFeed.upsertTest(updated);
        return { success: true, test: { id: updated.id, title: updated.title, subject: updated.subject, status: 'assigned', startAt, endAt } };
      }
      this.localFeed.upsertTest({
        id: test.id || testId,
        title: test.title,
        subject: test.subject,
        class_name: test.class_name || test.className || '',
        school_id: ownedTest.school_id,
        teacher_id: ownedTest.teacher_id,
        duration_minutes: test.duration_minutes || 30,
        status: 'assigned',
        start_at: test.start_at || startAt,
        end_at: test.end_at || endAt
      });
      return { success: true, test: { id: test.id || testId, title: test.title, subject: test.subject, status: 'assigned', startAt: test.start_at || startAt, endAt: test.end_at || endAt } };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'test assign failed'), test: null };
    }
  }

  // Teacher: update a test's metadata
  @Patch(':testId')
  @UseGuards(AuthGuard)
  async update(@Req() req: any, @Param('testId') testId: string, @Body() body: any) {
    const ownedTest = await this.requireEditableTest(req, testId);
    try {
      const patch = {
        title: body.title !== undefined ? String(body.title || 'Untitled Test').slice(0, 200) : undefined,
        subject: body.subject !== undefined ? String(body.subject || 'General').slice(0, 100) : undefined,
        class_name: body.className !== undefined || body.class_name !== undefined ? String(body.className || body.class_name || '').slice(0, 100) : undefined,
        duration_minutes: body.durationMinutes !== undefined ? Math.max(1, Number(body.durationMinutes || 30)) : undefined,
        status: body.status !== undefined ? String(body.status || 'upcoming') : undefined
      };

      const cleaned = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (!Object.keys(cleaned).length) {
        return { success: false, error: 'No update fields provided', test: null };
      }

      const res = await this.db.client.from('tests').update(cleaned).eq('id', testId).select();
      const test = (res as any)?.data?.[0] || null;
      if (!test) return { success: false, error: 'Test not found', test: null };
      this.localFeed.upsertTest({
        id: test.id || testId,
        title: test.title,
        subject: test.subject,
        class_name: test.class_name || test.className || '',
        school_id: ownedTest.school_id,
        teacher_id: ownedTest.teacher_id,
        duration_minutes: test.duration_minutes || 30,
        status: test.status || 'upcoming'
      });
      return {
        success: true,
        test: {
          id: test.id || testId,
          title: test.title,
          subject: test.subject,
          className: test.class_name || test.className || '',
          durationMinutes: test.duration_minutes || 30,
          status: test.status || 'upcoming'
        }
      };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'test update failed'), test: null };
    }
  }

  // Teacher: clone/reuse an existing test with its questions
  @Post(':testId/clone')
  @UseGuards(AuthGuard)
  async clone(@Req() req: any, @Param('testId') testId: string, @Body() body: any) {
    const sourceFinal = await this.requireOwnedTest(req, testId);
    try {
      const questionsRes = await this.db.client.from('test_questions').select('*').eq('test_id', testId).order('created_at', { ascending: true });
      const sourceQuestions = Array.isArray((questionsRes as any)?.data) && (questionsRes as any).data.length
        ? (questionsRes as any).data
        : this.localFeed.listQuestions(testId);

      const clonedTestRow = {
        title: String(body.title || `Copy of ${sourceFinal.title || 'Test'}`).slice(0, 200),
        subject: String(body.subject || sourceFinal.subject || 'General').slice(0, 100),
        class_name: String(body.className || body.class_name || sourceFinal.class_name || sourceFinal.className || '').slice(0, 100),
        school_id: sourceFinal.school_id || req?.user?.schoolId || null,
        teacher_id: sourceFinal.teacher_id || req?.user?.sub || null,
        duration_minutes: Math.max(1, Number(body.durationMinutes || sourceFinal.duration_minutes || 30)),
        status: 'draft',
        created_at: new Date().toISOString()
      };

      const inserted = await this.db.client.from('tests').insert([clonedTestRow]).select();
      const clonedTest = (inserted as any)?.data?.[0] || clonedTestRow;
      const clonedQuestions = sourceQuestions.map((q: any) => ({
        test_id: clonedTest.id,
        text: q.text || q.question || 'Question',
        options: Array.isArray(q.options) ? q.options : [],
        correct_option: q.correct_option ?? q.correctOption ?? null,
        marks: q.marks || 1,
        created_at: new Date().toISOString()
      }));

      if (clonedQuestions.length) {
        await this.db.client.from('test_questions').insert(clonedQuestions);
      }
      const normalizedClonedTestId = clonedTest.id || `local-test-${Date.now()}`;
      this.localFeed.upsertTest({
        id: normalizedClonedTestId,
        title: clonedTest.title,
        subject: clonedTest.subject,
        class_name: clonedTest.class_name || clonedTest.className || '',
        school_id: sourceFinal.school_id,
        teacher_id: sourceFinal.teacher_id,
        duration_minutes: clonedTest.duration_minutes || 30,
        status: clonedTest.status || 'upcoming'
      });
      this.localFeed.setQuestions(
        normalizedClonedTestId,
        clonedQuestions.map((q: any, idx: number) => ({
          id: q.id || `${normalizedClonedTestId}-q-${idx + 1}`,
          test_id: normalizedClonedTestId,
          text: q.text,
          options: q.options || [],
          correct_option: q.correct_option ?? null,
          marks: q.marks || 1
        }))
      );

      return {
        success: true,
        test: {
          id: clonedTest.id || null,
          title: clonedTest.title,
          subject: clonedTest.subject,
          className: clonedTest.class_name || clonedTest.className || '',
          durationMinutes: clonedTest.duration_minutes || 30,
          status: clonedTest.status || 'upcoming'
        },
        questions: clonedQuestions.map((q: any, idx: number) => ({
          id: `${clonedTest.id || 'clone'}-${idx}`,
          text: q.text,
          options: q.options || [],
          marks: q.marks || 1
        }))
      };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'test clone failed'), test: null, questions: [] };
    }
  }

  // Teacher: add a question to an existing test
  @Post(':testId/questions')
  @UseGuards(AuthGuard)
  async addQuestion(@Req() req: any, @Param('testId') testId: string, @Body() body: any) {
    await this.requireEditableTest(req, testId);
    try {
      const options = Array.isArray(body.options) ? body.options : [];
      const row = {
        test_id: testId,
        text: String(body.text || body.question || '').slice(0, 500),
        options,
        correct_option: body.correctOption ?? body.correct_option ?? null,
        marks: Math.max(0, Number(body.marks || 1)),
        created_at: new Date().toISOString()
      };
      const res = await this.db.client.from('test_questions').insert([row]).select();
      const q = (res as any)?.data?.[0] || row;
      const qid = q.id || `local-q-${Date.now()}`;
      this.localFeed.upsertQuestion(testId, {
        id: qid,
        test_id: testId,
        text: q.text,
        options: q.options,
        correct_option: q.correct_option ?? q.correctOption ?? null,
        marks: q.marks || 1
      });
      return {
        success: true,
        question: {
          id: qid,
          testId,
          text: q.text,
          options: q.options,
          correctOption: q.correct_option ?? q.correctOption ?? null,
          marks: q.marks || 1
        }
      };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'question add failed'), question: null };
    }
  }

  // Teacher: update a question for a test
  @Patch(':testId/questions/:questionId')
  @UseGuards(AuthGuard)
  async updateQuestion(@Req() req: any, @Param('testId') testId: string, @Param('questionId') questionId: string, @Body() body: any) {
    await this.requireEditableTest(req, testId);
    try {
      const patch = {
        text: body.text !== undefined ? String(body.text || '').slice(0, 500) : undefined,
        options: body.options !== undefined ? (Array.isArray(body.options) ? body.options : []) : undefined,
        correct_option: body.correctOption !== undefined || body.correct_option !== undefined ? (body.correctOption ?? body.correct_option ?? null) : undefined,
        marks: body.marks !== undefined ? Math.max(0, Number(body.marks || 1)) : undefined
      };
      const cleaned = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (!Object.keys(cleaned).length) {
        return { success: false, error: 'No question fields provided', question: null };
      }

      const res = await this.db.client.from('test_questions').update(cleaned).eq('id', questionId).eq('test_id', testId).select();
      const q = (res as any)?.data?.[0] || null;
      if (!q) {
        const localExisting = this.localFeed.listQuestions(testId).find((x: any) => String(x?.id || '') === String(questionId));
        if (!localExisting) return { success: false, error: 'Question not found', question: null };
        const mergedLocal = {
          ...localExisting,
          ...cleaned,
          id: localExisting.id || questionId,
          test_id: testId
        };
        this.localFeed.upsertQuestion(testId, mergedLocal);
        return {
          success: true,
          question: {
            id: mergedLocal.id || questionId,
            testId,
            text: mergedLocal.text || mergedLocal.question,
            options: mergedLocal.options || [],
            correctOption: mergedLocal.correct_option ?? mergedLocal.correctOption ?? null,
            marks: mergedLocal.marks || 1
          }
        };
      }
      this.localFeed.upsertQuestion(testId, q);
      return {
        success: true,
        question: {
          id: q.id || questionId,
          testId,
          text: q.text || q.question,
          options: q.options || [],
          correctOption: q.correct_option ?? q.correctOption ?? null,
          marks: q.marks || 1
        }
      };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'question update failed'), question: null };
    }
  }

  // Teacher: delete a question from a test
  @Delete(':testId/questions/:questionId')
  @UseGuards(AuthGuard)
  async deleteQuestion(@Req() req: any, @Param('testId') testId: string, @Param('questionId') questionId: string) {
    await this.requireEditableTest(req, testId);
    try {
      await this.db.client.from('test_questions').delete().eq('id', questionId).eq('test_id', testId);
      this.localFeed.removeQuestion(testId, questionId);
      return { success: true, questionId };
    } catch (e) {
      this.localFeed.removeQuestion(testId, questionId);
      return { success: true, error: String((e as any)?.message || e || 'question delete fallback'), questionId };
    }
  }

  // Teacher: list questions for a test
  @Get(':testId/questions')
  @UseGuards(AuthGuard)
  async listQuestions(@Req() req: any, @Param('testId') testId: string) {
    await this.requireOwnedTest(req, testId);
    try {
      const res = await this.db.client.from('test_questions').select('*').eq('test_id', testId).order('created_at', { ascending: true });
      const rows = (res as any)?.data || [];
      const mergedRows = Array.isArray(rows) && rows.length ? rows : this.localFeed.listQuestions(testId);
      return {
        success: true,
        questions: mergedRows.map((q: any) => ({
          id: q.id,
          text: q.text || q.question,
          options: q.options || [],
          correctOption: q.correct_option ?? q.correctOption ?? null,
          marks: q.marks || 1
        }))
      };
    } catch (e) {
      const rows = this.localFeed.listQuestions(testId);
      return {
        success: true,
        error: String(e),
        questions: rows.map((q: any) => ({
          id: q.id,
          text: q.text || q.question,
          options: q.options || [],
          correctOption: q.correct_option ?? q.correctOption ?? null,
          marks: q.marks || 1
        }))
      };
    }
  }

  // Teacher: delete a test
  @Delete(':testId')
  @UseGuards(AuthGuard)
  async remove(@Req() req: any, @Param('testId') testId: string) {
    const test = await this.requireOwnedTest(req, testId);
    if (test.status === 'assigned' && await this.exams.enabled(testId)) {
      if (Date.now() < new Date(test.end_at || test.endAt).getTime()) throw new ForbiddenException('A scheduled strict exam cannot be deleted before its closing time.');
      const unfinished = (await this.exams.unfinished()).some((row) => row.test_id === testId);
      if (unfinished) throw new ForbiddenException('Exam results are still being finalized. Please retry shortly.');
    }
    try {
      await this.db.client.from('test_questions').delete().eq('test_id', testId);
      await this.db.client.from('tests').delete().eq('id', testId);
      this.localFeed.removeTest(testId);
      return { success: true, testId };
    } catch (e) {
      this.localFeed.removeTest(testId);
      return { success: true, error: String(e), testId };
    }
  }

  @Post(':testId/start')
  @UseGuards(AuthGuard)
  async start(@Req() req: any, @Param('testId') testId: string, @Body() body: any) {
    const sId = requireStudentIdentity(req, body.studentId);
    const testRow = await this.loadTest(testId);
    if (!(await this.scopeTests(req, [testRow])).length) {
      throw new ForbiddenException('Test not assigned to this student');
    }
    try {
      const existingRows = await this.studentAttempts(sId);
      const alreadySubmitted = latestCompletedTests(existingRows, Date.now()).some((row) => row.test_id === testId);
      if (alreadySubmitted) {
        return { success: false, error: 'You have already submitted this test.', attemptId: null, questions: [] };
      }

      const windowStatus = this.computeWindowStatus(testRow || {});
      if (windowStatus === 'scheduled') {
        const opensAt = testRow?.start_at || testRow?.startAt;
        return { success: false, error: `This test opens at ${opensAt ? new Date(opensAt).toLocaleString() : 'a later time'}.`, attemptId: null, questions: [] };
      }
      if (windowStatus === 'expired') {
        return { success: false, error: "This test's time window has closed.", attemptId: null, questions: [] };
      }

      const strictMode = await this.exams.enabled(testId);
      const clientId = strictMode ? this.exams.clientId(body.clientId) : '';
      const existingSession = strictMode ? await this.exams.session(testId, sId) : null;
      if (existingSession?.status === 'closed') throw new ForbiddenException('You have already finished this test.');
      const questions = await this.loadQuestions(testId);
      const attempt = { test_id: testId, student_id: sId, started_at: new Date().toISOString() };
      let attemptRow;
      if (existingSession) {
        attemptRow = await this.loadStudentAttempt(existingSession.attempt_id, sId);
        if (!attemptRow) throw new ServiceUnavailableException('Unable to restore the saved exam attempt');
      } else if (testId.startsWith('local-test-')) {
        attemptRow = this.localFeed.createAttempt(testId, sId);
      } else {
        const ins = await this.db.client.from('test_attempts').insert([attempt]).select();
        if (ins.error || !ins.data?.length) {
          console.warn('Unable to create database test attempt', ins.error?.message || 'No inserted row');
          throw new ServiceUnavailableException('Unable to start test. Please retry.');
        }
        attemptRow = ins.data[0];
      }
      const normalizedQuestions = (Array.isArray(questions) ? questions : []).map((q: any) => ({
        id: q.id,
        text: q.text || q.question || 'Question',
        options: q.options || []
      }));
      this.localFeed.logStudentActivity(sId, {
        type: 'test',
        action: 'started',
        title: `Test ${testId}`,
        details: `Started test with ${normalizedQuestions.length} question(s)`,
        meta: { testId, attemptId: attemptRow.id || 'attempt-1' }
      });
      let control: ExamSession | null = null;
      if (strictMode) {
        control = existingSession || await this.exams.open(testRow, sId, attemptRow.id, clientId);
        control = await this.exams.sync(testRow, sId, clientId);
      }
      return { success: true, attemptId: control?.attempt_id || attemptRow.id, questions: normalizedQuestions,
        strictMode, control: control ? this.publicControl(control, testRow) : null, answers: control?.answers || {} };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'test start failed'), attemptId: null, questions: [] };
    }
  }

  @Post('/attempts/:attemptId/submit')
  @UseGuards(AuthGuard)
  async submit(@Req() req: any, @Param('attemptId') attemptId: string, @Body() body: any) {
    const actorId = requireStudentIdentity(req, body.studentId);
    try {
      const attempt = await this.loadStudentAttempt(attemptId, actorId);
      if (!attempt?.test_id) {
        return { success: false, error: 'Attempt not found', score: 0, feedback: 'Submission failed', perQuestionFeedback: [] };
      }
      const answers = body.answers || {};
      const test = await this.loadTest(attempt.test_id);
      let finalAnswers = answers;
      if (await this.exams.enabled(test.id)) {
        const state = await this.exams.sync(test, actorId, this.exams.clientId(body.clientId));
        if (state.attempt_id !== attemptId) throw new ForbiddenException('This is not your current exam attempt');
        const validated = await this.validateExamAnswers(test.id, answers);
        const closed = await this.exams.change(test.id, actorId, (row) => {
          if (row.status === 'closed') return {};
          if (row.status === 'paused') throw new ForbiddenException('Your test is paused. Only your assigning teacher can resume it. The clock is still running.');
          if (row.client_id && row.client_id !== body.clientId) throw new ForbiddenException('This exam is open on another device');
          return { status: 'closed', answers: { ...row.answers, ...validated } };
        });
        finalAnswers = closed.answers;
      }
      const result = await this.scoreAndFinalizeAttempt(attempt, finalAnswers, actorId);
      return { success: true, score: result.score, feedback: result.feedback, perQuestionFeedback: result.perQuestionFeedback };
    } catch (e) {
      if (e instanceof ForbiddenException || e instanceof ServiceUnavailableException) throw e;
      return { success: false, error: String(e), score: 0, feedback: 'Submission failed', perQuestionFeedback: [] };
    }
  }

  private publicControl(row: ExamSession, test: any) {
    return { status: row.status, revision: row.revision, incidentCount: row.incident_count, lastReason: row.last_reason,
      pausedAt: row.paused_at, endAt: test.end_at || test.endAt, serverNow: new Date().toISOString(), answers: row.answers };
  }

  private async validateExamAnswers(testId: string, value: unknown): Promise<Record<string, number>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Invalid answers');
    const questions = await this.loadQuestions(testId);
    const out: Record<string, number> = {};
    for (const [id, answer] of Object.entries(value)) {
      const question = questions.find((q: any) => String(q.id) === id);
      if (!question || typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= (question.options || []).length) {
        throw new BadRequestException('Invalid exam answer');
      }
      out[id] = answer;
    }
    return out;
  }

  @Get('exam-access/current')
  @UseGuards(AuthGuard)
  async examAccess(@Req() req: any) {
    return { success: true, exams: await this.exams.restrictions(requireStudentIdentity(req)) };
  }

  @Post('attempts/:attemptId/control')
  @UseGuards(AuthGuard)
  async examControl(@Req() req: any, @Param('attemptId') attemptId: string, @Body() body: any) {
    const studentId = requireStudentIdentity(req);
    const attempt = await this.loadStudentAttempt(attemptId, studentId);
    if (!attempt) throw new NotFoundException('Attempt not found');
    const test = await this.loadTest(attempt.test_id);
    if (!(await this.scopeTests(req, [test])).length) throw new ForbiddenException('Test not in student scope');
    if (!await this.exams.enabled(test.id)) throw new BadRequestException('This test does not use strict mode');
    const session = await this.exams.session(test.id, studentId);
    if (session?.attempt_id !== attemptId) throw new ForbiddenException('This is not your current exam attempt');
    const clientId = this.exams.clientId(body.clientId);
    if (!['heartbeat', 'save', 'pause'].includes(body.action)) throw new BadRequestException('Invalid exam action');
    if (body.action === 'pause' && !body.reason) throw new BadRequestException('An incident reason is required');
    const answers = body.action === 'save' ? await this.validateExamAnswers(test.id, body.answers) : undefined;
    const row = await this.exams.sync(test, studentId, clientId, body.action === 'pause' ? body.reason : undefined, answers);
    const result = row.status === 'closed' ? await this.scoreAndFinalizeAttempt(attempt, row.answers, studentId) : null;
    return { success: true, control: this.publicControl(row, test), result };
  }

  @Get(':testId/exam-students')
  @UseGuards(AuthGuard)
  async examStudents(@Req() req: any, @Param('testId') testId: string) {
    const test = await this.requireOwnedTest(req, testId);
    const rows = await this.exams.roster(test);
    for (const row of rows.filter((item) => item.status === 'closed')) {
      const attempt = await this.loadStudentAttempt(row.attempt_id, row.student_id);
      if (attempt) await this.scoreAndFinalizeAttempt(attempt, row.answers, row.student_id);
    }
    const endAt = test.end_at || test.endAt;
    const ended = Date.now() >= new Date(endAt).getTime();
    return { success: true, ended, endAt, serverNow: new Date().toISOString(), students: (ended ? [] : rows).map((row) => ({
      studentId: row.student_id, name: row.student_name, status: row.status, incidentCount: row.incident_count,
      lastReason: row.last_reason, pausedAt: row.paused_at, resumedAt: row.resumed_at,
    })) };
  }

  @Post(':testId/exam-students/resume-all')
  @UseGuards(AuthGuard)
  async resumeAllExams(@Req() req: any, @Param('testId') testId: string) {
    const test = await this.requireOwnedTest(req, testId);
    if (!await this.exams.enabled(test.id)) throw new BadRequestException('This test does not use strict mode');
    return { success: true, resumedCount: await this.exams.resumeAll(test) };
  }

  @Post(':testId/exam-students/:studentId/resume')
  @UseGuards(AuthGuard)
  async resumeExam(@Req() req: any, @Param('testId') testId: string, @Param('studentId') studentId: string) {
    const test = await this.requireOwnedTest(req, testId);
    const row = await this.exams.resume(test, studentId);
    return { success: true, control: this.publicControl(row, test) };
  }

  @Get('/attempts/:attemptId')
  @UseGuards(AuthGuard)
  async result(@Req() req: any, @Param('attemptId') attemptId: string) {
    const studentId = requireStudentIdentity(req);
    try {
      const row = await this.loadStudentAttempt(attemptId, studentId);
      return { success: true, result: row };
    } catch (e) {
      if (e instanceof ForbiddenException || e instanceof ServiceUnavailableException) throw e;
      return { success: false, error: String((e as any)?.message || e || 'test result failed'), result: null };
    }
  }

  // Student: review the question-by-question breakdown of a completed attempt
  // (used by the "expand to review" collapsed panel after a test is done).
  @Get(':testId/review')
  @UseGuards(AuthGuard)
  async review(@Req() req: any, @Param('testId') testId: string, @Query('studentId') studentId: string) {
    const sId = requireStudentIdentity(req, studentId);
    try {
      const attemptRows = await this.studentAttempts(sId);
      const attempt = latestCompletedTests(attemptRows, Date.now()).find((row) => row.test_id === testId);
      if (!attempt) {
        return { success: false, error: 'No submitted attempt found for this test.', score: 0, feedback: '', perQuestionFeedback: [] };
      }
      const questions = await this.loadQuestions(testId);
      const { perQuestionFeedback } = this.computePerQuestionFeedback(questions, attempt.answers || {});
      return { success: true, score: testPercentage(attempt), feedback: attempt.feedback || '', perQuestionFeedback };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'test review failed'), score: 0, feedback: '', perQuestionFeedback: [] };
    }
  }
}

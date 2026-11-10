import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { requireStudentIdentity } from '../auth/student-identity';

@Controller('tests')
export class TestsController {
  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService,
    private readonly studentAuth: StudentAuthService
  ) {}

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
      const testIds = rows.map((t: any) => String(t?.id || '')).filter(Boolean);
      const res = await this.db.client.from('test_attempts').select('*').eq('student_id', id).in('test_id', testIds);
      const attemptRows = Array.isArray((res as any)?.data) ? (res as any).data : [];
      const latestByTest = new Map<string, any>();
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
        const existing = latestByTest.get(key);
        const time = new Date(a.submitted_at || a.finished_at || a.created_at || 0).getTime();
        const existingTime = existing ? new Date(existing.submitted_at || existing.finished_at || existing.created_at || 0).getTime() : -1;
        if (!existing || time >= existingTime) latestByTest.set(key, a);
      });

      const out = [];
      for (const t of rows) {
        const testId = String(t?.id || '');
        const windowStatus = this.computeWindowStatus(t);
        let attempt = latestByTest.get(testId);
        if (!attempt && windowStatus === 'expired' && inProgressByTest.has(testId)) {
          // The window closed while this attempt was still open — auto-submit
          // it now with whatever answers were saved (none, in this flow).
          const stale = inProgressByTest.get(testId);
          attempt = await this.scoreAndFinalizeAttempt(stale, {}, id);
        }
        out.push({
          ...t,
          windowStatus,
          startAt: t.start_at || t.startAt || null,
          endAt: t.end_at || t.endAt || null,
          attempted: !!attempt,
          lastScore: attempt?.score ?? undefined,
          lastFeedback: attempt?.feedback ?? undefined,
          attemptId: attempt?.id ?? undefined
        });
      }
      return out;
    } catch {
      return rows.map((t: any) => ({ ...t, attempted: false, windowStatus: this.computeWindowStatus(t) }));
    }
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
    if (endAt && now > endAt) return 'expired';
    return 'open';
  }

  // Scores a set of answers against a test's questions and persists the
  // result onto the attempt. Shared by the normal submit flow and the
  // auto-finalize sweep for attempts whose window closed before submission.
  private async scoreAndFinalizeAttempt(attempt: any, answers: any, actorId: string) {
    const questions = await this.loadQuestions(attempt.test_id);
    const { perQuestionFeedback, correctCount } = this.computePerQuestionFeedback(questions, answers);

    const total = questions.length;
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const feedback = score >= 80
      ? 'Great work. Keep consistency.'
      : score >= 50
        ? 'Good attempt. Focus on weak topics.'
        : 'Needs improvement. Revise and retry.';
    await this.db.client.from('test_attempts').update({ finished_at: new Date().toISOString(), score, feedback, answers }).eq('id', attempt.id);
    this.localFeed.finishAttempt(attempt.id, { score, feedback, finished_at: new Date().toISOString(), answers });
    this.localFeed.logStudentActivity(actorId || attempt.student_id, {
      type: 'test',
      action: 'submitted',
      title: `Test ${attempt.test_id}`,
      details: `Submitted test attempt with score ${score}%`,
      meta: { testId: attempt.test_id, attemptId: attempt.id, score }
    });
    return { id: attempt.id, score, feedback, perQuestionFeedback };
  }

  private async loadQuestions(testId: string) {
    const questionsRes = await this.db.client.from('test_questions').select('*').eq('test_id', testId);
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
      const res = await this.db.client.from('tests').select('*');
      let tests = (res && (res as any).data) || [];
      if (!Array.isArray(tests) || !tests.length) tests = this.localFeed.listTests();
      tests = await this.filterTestsForRequest(await this.scopeTests(req, tests), filter, id);
      if (filter === 'upcoming') tests = await this.attachAttemptStatus(tests, id);
      return { success: true, tests: Array.isArray(tests) ? tests : [] };
    } catch (e) {
      let tests = this.localFeed.listTests();
      tests = await this.filterTestsForRequest(await this.scopeTests(req, tests), filter, id);
      if (filter === 'upcoming') tests = await this.attachAttemptStatus(tests, id);
      return { success: true, error: String((e as any)?.message || e || 'tests list fallback'), tests };
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
    const ownedTest = await this.requireOwnedTest(req, testId);
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
    await this.requireOwnedTest(req, testId);
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
    await this.requireOwnedTest(req, testId);
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
    await this.requireOwnedTest(req, testId);
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
    await this.requireOwnedTest(req, testId);
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
      const existingRes = await this.db.client.from('test_attempts').select('*').eq('test_id', testId).eq('student_id', sId);
      const existingRows = Array.isArray((existingRes as any)?.data) ? (existingRes as any).data : [];
      const alreadySubmitted = existingRows.some((a: any) => a.score !== null && a.score !== undefined);
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

      const questionsRes = await this.db.client.from('test_questions').select('*').eq('test_id', testId);
      const questions = ((questionsRes && (questionsRes as any).data) || []).length
        ? (questionsRes as any).data
        : this.localFeed.listQuestions(testId);
      const attempt = { test_id: testId, student_id: sId, started_at: new Date().toISOString() };
      const ins = await this.db.client.from('test_attempts').insert([attempt]).select();
      const attemptRow = (ins && (ins as any).data && (ins as any).data[0]) || this.localFeed.createAttempt(testId, sId);
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
      return { success: true, attemptId: attemptRow.id || 'attempt-1', questions: normalizedQuestions };
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
      const result = await this.scoreAndFinalizeAttempt(attempt, answers, actorId);
      return { success: true, score: result.score, feedback: result.feedback, perQuestionFeedback: result.perQuestionFeedback };
    } catch (e) {
      if (e instanceof ForbiddenException || e instanceof ServiceUnavailableException) throw e;
      return { success: false, error: String(e), score: 0, feedback: 'Submission failed', perQuestionFeedback: [] };
    }
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
      const attemptsRes = await this.db.client.from('test_attempts').select('*').eq('test_id', testId).eq('student_id', sId);
      const attemptRows = Array.isArray((attemptsRes as any)?.data) ? (attemptsRes as any).data : [];
      const submitted = attemptRows.filter((a: any) => a.score !== null && a.score !== undefined);
      submitted.sort((a: any, b: any) => new Date(b.submitted_at || b.finished_at || b.created_at || 0).getTime() - new Date(a.submitted_at || a.finished_at || a.created_at || 0).getTime());
      const attempt = submitted[0];
      if (!attempt) {
        return { success: false, error: 'No submitted attempt found for this test.', score: 0, feedback: '', perQuestionFeedback: [] };
      }
      const questions = await this.loadQuestions(testId);
      const { perQuestionFeedback } = this.computePerQuestionFeedback(questions, attempt.answers || {});
      return { success: true, score: attempt.score, feedback: attempt.feedback || '', perQuestionFeedback };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'test review failed'), score: 0, feedback: '', perQuestionFeedback: [] };
    }
  }
}

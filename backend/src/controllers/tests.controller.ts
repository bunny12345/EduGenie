import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';

@Controller('tests')
export class TestsController {
  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async list(@Req() req: any, @Query('studentId') studentId: string, @Query('filter') filter?: string) {
    const id = req.studentId || studentId;
    try {
      const res = await this.db.client.from('tests').select('*');
      let tests = (res && (res as any).data) || [];
      if (!Array.isArray(tests) || !tests.length) tests = this.localFeed.listTests();
      if (filter && Array.isArray(tests)) {
        if (filter === 'completed') tests = tests.filter((t: any) => t.status === 'completed');
        if (filter === 'upcoming') tests = tests.filter((t: any) => t.status !== 'completed');
      }
      return { success: true, tests: Array.isArray(tests) ? tests : [] };
    } catch (e) {
      let tests = this.localFeed.listTests();
      if (filter && Array.isArray(tests)) {
        if (filter === 'completed') tests = tests.filter((t: any) => t.status === 'completed');
        if (filter === 'upcoming') tests = tests.filter((t: any) => t.status !== 'completed');
      }
      return { success: true, error: String((e as any)?.message || e || 'tests list fallback'), tests };
    }
  }

  // Teacher: create a test
  @Post('create')
  @UseGuards(AuthGuard)
  async create(@Req() req: any, @Body() body: any) {
    try {
      const row = {
        title: String(body.title || 'Untitled Test').slice(0, 200),
        subject: String(body.subject || 'General').slice(0, 100),
        class_name: String(body.className || body.class_name || '').slice(0, 100),
        school_id: req?.user?.schoolId || body.schoolId || null,
        teacher_id: req?.user?.sub || body.teacherId || null,
        duration_minutes: Math.max(1, Number(body.durationMinutes || 30)),
        status: 'upcoming',
        created_at: new Date().toISOString()
      };
      const res = await this.db.client.from('tests').insert([row]).select();
      const test = (res as any)?.data?.[0] || row;
      const normalized = {
        id: test.id || `local-test-${Date.now()}`,
        title: test.title,
        subject: test.subject,
        class_name: test.class_name || row.class_name,
        duration_minutes: test.duration_minutes || row.duration_minutes,
        status: test.status || 'upcoming'
      };
      this.localFeed.upsertTest(normalized);
      return { success: true, test: { id: test.id || null, title: test.title, subject: test.subject, status: test.status } };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'test create failed'), test: null };
    }
  }

  // Teacher: update a test's metadata
  @Patch(':testId')
  @UseGuards(AuthGuard)
  async update(@Req() req: any, @Param('testId') testId: string, @Body() body: any) {
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
    try {
      const testRes = await this.db.client.from('tests').select('*').eq('id', testId).limit(1);
      const source = (testRes as any)?.data?.[0] || null;
      const localSource = this.localFeed.listTests().find((t: any) => String(t?.id || '') === String(testId));
      const sourceFinal = source || localSource;
      if (!sourceFinal) return { success: false, error: 'Test not found', test: null, questions: [] };

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
        status: 'upcoming',
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
  async updateQuestion(@Param('testId') testId: string, @Param('questionId') questionId: string, @Body() body: any) {
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
  async deleteQuestion(@Param('testId') testId: string, @Param('questionId') questionId: string) {
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
  async listQuestions(@Param('testId') testId: string) {
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
  async remove(@Param('testId') testId: string) {
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
    try {
      const questionsRes = await this.db.client.from('test_questions').select('*').eq('test_id', testId);
      const questions = ((questionsRes && (questionsRes as any).data) || []).length
        ? (questionsRes as any).data
        : this.localFeed.listQuestions(testId);
      const attempt = { test_id: testId, student_id: body.studentId || req.studentId, started_at: new Date().toISOString() };
      const ins = await this.db.client.from('test_attempts').insert([attempt]).select();
      const attemptRow = (ins && (ins as any).data && (ins as any).data[0]) || this.localFeed.createAttempt(testId, body.studentId || req.studentId);
      const normalizedQuestions = (Array.isArray(questions) ? questions : []).map((q: any) => ({
        id: q.id,
        text: q.text || q.question || 'Question',
        options: q.options || []
      }));
      this.localFeed.logStudentActivity(body.studentId || req.studentId, {
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
    try {
      const attemptRes = await this.db.client.from('test_attempts').select('*').eq('id', attemptId).limit(1);
      const attempt = (attemptRes as any)?.data?.[0] || this.localFeed.getAttempt(attemptId);
      if (!attempt?.test_id) {
        return { success: false, error: 'Attempt not found', score: 0, feedback: 'Submission failed', perQuestionFeedback: [] };
      }

      const questionsRes = await this.db.client.from('test_questions').select('*').eq('test_id', attempt.test_id);
      const questions = Array.isArray((questionsRes as any)?.data) && (questionsRes as any).data.length
        ? (questionsRes as any).data
        : this.localFeed.listQuestions(attempt.test_id);
      const answers = body.answers || {};

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
          isCorrect,
          selectedOption: submittedIndex,
          correctOption: correctIndex,
          feedback: isCorrect ? 'Correct.' : 'Review this concept.'
        };
      });

      const total = questions.length;
      const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
      const feedback = score >= 80
        ? 'Great work. Keep consistency.'
        : score >= 50
          ? 'Good attempt. Focus on weak topics.'
          : 'Needs improvement. Revise and retry.';
      await this.db.client.from('test_attempts').update({ finished_at: new Date().toISOString(), score, feedback }).eq('id', attemptId);
      this.localFeed.finishAttempt(attemptId, { score, feedback, finished_at: new Date().toISOString() });
      this.localFeed.logStudentActivity(body.studentId || req.studentId || attempt.student_id, {
        type: 'test',
        action: 'submitted',
        title: `Test ${attempt.test_id}`,
        details: `Submitted test attempt with score ${score}%`,
        meta: { testId: attempt.test_id, attemptId, score }
      });
      return { success: true, score, feedback, perQuestionFeedback };
    } catch (e) {
      return { success: false, error: String(e), score: 0, feedback: 'Submission failed', perQuestionFeedback: [] };
    }
  }

  @Get('/attempts/:attemptId')
  @UseGuards(AuthGuard)
  async result(@Param('attemptId') attemptId: string) {
    try {
      const res = await this.db.client.from('test_attempts').select('*').eq('id', attemptId).limit(1);
      const row = (res && (res as any).data && (res as any).data[0]) || this.localFeed.getAttempt(attemptId);
      return { success: true, result: row };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'test result failed'), result: null };
    }
  }
}

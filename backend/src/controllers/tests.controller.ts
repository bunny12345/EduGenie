import { Controller, Get, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('tests')
export class TestsController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  @UseGuards(AuthGuard)
  async list(@Req() req: any, @Query('studentId') studentId: string, @Query('filter') filter?: string) {
    const id = req.studentId || studentId;
    try {
      const res = await this.db.client.from('tests').select('*');
      let tests = (res && (res as any).data) || [];
      if (filter && Array.isArray(tests)) {
        if (filter === 'completed') tests = tests.filter((t: any) => t.status === 'completed');
        if (filter === 'upcoming') tests = tests.filter((t: any) => t.status !== 'completed');
      }
      return { tests: Array.isArray(tests) ? tests : [] };
    } catch (e) {
      return { tests: [] };
    }
  }

  @Post(':testId/start')
  @UseGuards(AuthGuard)
  async start(@Req() req: any, @Param('testId') testId: string, @Body() body: any) {
    try {
      const questionsRes = await this.db.client.from('test_questions').select('*').eq('test_id', testId);
      const questions = (questionsRes && (questionsRes as any).data) || [];
      const attempt = { test_id: testId, student_id: body.studentId || req.studentId, started_at: new Date().toISOString() };
      const ins = await this.db.client.from('test_attempts').insert([attempt]).select();
      const attemptRow = (ins && (ins as any).data && (ins as any).data[0]) || attempt;
      const normalizedQuestions = (Array.isArray(questions) ? questions : []).map((q: any) => ({
        id: q.id,
        text: q.text || q.question || 'Question',
        options: q.options || []
      }));
      return { attemptId: attemptRow.id || 'attempt-1', questions: normalizedQuestions };
    } catch (e) {
      return { attemptId: null, questions: [] };
    }
  }

  @Post('/attempts/:attemptId/submit')
  @UseGuards(AuthGuard)
  async submit(@Req() req: any, @Param('attemptId') attemptId: string, @Body() body: any) {
    try {
      const answers = body.answers || {};
      const answerCount = Array.isArray(answers) ? answers.length : Object.keys(answers).length;
      const score = Math.min(100, Math.max(0, Math.round(55 + answerCount * 5)));
      const feedback = score >= 75 ? 'Great work. Keep consistency.' : 'Good attempt. Focus on weak topics.';
      const perQuestionFeedback = Object.keys(answers).map((k) => ({ questionId: k, feedback: 'Reviewed (mock).' }));
      await this.db.client.from('test_attempts').update({ finished_at: new Date().toISOString(), score, feedback }).eq('id', attemptId);
      return { score, feedback, perQuestionFeedback };
    } catch (e) {
      return { error: String(e) };
    }
  }

  @Get('/attempts/:attemptId')
  @UseGuards(AuthGuard)
  async result(@Param('attemptId') attemptId: string) {
    try {
      const res = await this.db.client.from('test_attempts').select('*').eq('id', attemptId).limit(1);
      const row = (res && (res as any).data && (res as any).data[0]) || null;
      return { result: row };
    } catch (e) {
      return { result: null };
    }
  }
}

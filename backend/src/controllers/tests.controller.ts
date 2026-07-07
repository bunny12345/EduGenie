import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';

@Controller('tests')
export class TestsController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  async list(@Query('studentId') studentId: string) {
    try {
      const res = await this.db.client.from('tests').select('*');
      return { tests: (res && (res as any).data) || [] };
    } catch (e) {
      return { tests: [] };
    }
  }

  @Post(':testId/start')
  async start(@Param('testId') testId: string, @Body() body: any) {
    try {
      const questionsRes = await this.db.client.from('test_questions').select('*').eq('test_id', testId);
      const questions = (questionsRes && (questionsRes as any).data) || [];
      const attempt = { test_id: testId, student_id: body.studentId, started_at: new Date().toISOString() };
      const ins = await this.db.client.from('test_attempts').insert([attempt]).select();
      const attemptRow = (ins && (ins as any).data && (ins as any).data[0]) || attempt;
      return { attemptId: attemptRow.id || 'attempt-1', questions };
    } catch (e) {
      return { attemptId: null, questions: [] };
    }
  }

  @Post('/attempts/:attemptId/submit')
  async submit(@Param('attemptId') attemptId: string, @Body() body: any) {
    try {
      const result = { attemptId, score: 0, feedback: 'Auto-graded (mock)' };
      await this.db.client.from('test_attempts').update({ finished_at: new Date().toISOString(), score: result.score, feedback: result.feedback }).eq('id', attemptId);
      return result;
    } catch (e) {
      return { error: String(e) };
    }
  }
}

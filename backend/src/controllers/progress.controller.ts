import { Controller, Get, Post, Query, Body, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LearningScoreService } from '../progress/learning-score.service';
import { OrchardService } from '../orchard/orchard.service';
import { METRIC_ORDER_COLUMN, metricMinutes, metricRow } from '../progress/progress-metric.util';
import { requireStudentIdentity } from '../auth/student-identity';
import { normalizeSubjectKey } from '../orchard/orchard.constants';

@Controller('progress')
export class ProgressController {
  constructor(
    private readonly db: SupabaseService,
    private readonly learningScore: LearningScoreService,
    private readonly orchard: OrchardService,
  ) {}

  // Rich "Learning Score" (credit-score style /1000) with 9 dimensions, a month
  // trend, per-subject breakdown and a decline alert. Computed live from real
  // activity, so it starts at zero for a fresh student and grows automatically.
  @Get('learning-score')
  @UseGuards(AuthGuard)
  async getLearningScore(@Req() req: any, @Query('studentId') studentId: string) {
    const id = req.studentId || studentId;
    try {
      return await this.learningScore.getLearningScore(id);
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'learning score failed'), hasData: false, score: 0, maxScore: 1000, dimensions: [], trend: [], subjects: [] };
    }
  }

  @Get()
  @UseGuards(AuthGuard)
  async getProgress(@Req() req: any, @Query('studentId') studentId: string, @Query('period') period: string) {
    const id = requireStudentIdentity(req, studentId);
    try {
      const [report, res] = await Promise.all([
        this.learningScore.getLearningScore(id),
        this.db.client.from('progress_metrics').select('*').eq('student_id', id)
          .order(METRIC_ORDER_COLUMN, { ascending: false }).limit(50),
      ]);
      if ((res as any)?.error) throw new Error((res as any).error.message);
      const rows = (res && (res as any).data) || [];

      const allowed = new Set(report.subjects.map((subject: any) => subject.subjectKey));
      const timeSpent = rows.reduce((sum: number, row: any) =>
        sum + (allowed.has(normalizeSubjectKey(row.subject || row.metric_key || 'General')) ? metricMinutes(row) : 0), 0);
      // The subject card shows actual average marks, not the latest generic
      // activity metric or the completion-adjusted graph component.
      const subjectScores = report.subjects
        .filter((subject: any) => subject.testPerformance.completed > 0)
        .map((subject: any) => ({
          subject: subject.name,
          score: Math.round(subject.testPerformance.averageMarks),
          trend: 0,
          completed: subject.testPerformance.completed,
          assigned: subject.testPerformance.assigned,
          testScore: subject.testPerformance.score,
        }));

      const weakTopics = subjectScores
        .filter((s) => s.score < 70)
        .slice(0, 5)
        .map((s) => ({ topic: s.subject, confidence: Math.max(0, Math.min(100, 100 - s.score)) }));

      return { success: true, timeSpent, subjectScores, weakTopics };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'progress failed'), timeSpent: 0, subjectScores: [], weakTopics: [] };
    }
  }

  @Post()
  @UseGuards(AuthGuard)
  async record(@Req() req: any, @Body() body: any) {
    const sid = requireStudentIdentity(req, body.studentId);
    const subject = String(body.subject || 'General').slice(0, 100);
    const score = Math.max(0, Math.min(100, Number(body.score ?? 0)));
    const minutes = Math.max(0, Number(body.minutes || body.timeSpent || 0));
    const metricKey = String(body.metricKey || subject);
    // `date` is accepted as a plain day for backwards compatibility, but the
    // table stores a timestamp in recorded_at.
    const recordedAt = body.date ? new Date(String(body.date)).toISOString() : new Date().toISOString();
    try {
      const row = metricRow({
        studentId: sid,
        subject,
        metricKey,
        score,
        minutes,
        source: String(body.source || 'activity').slice(0, 50),
        recordedAt,
      });
      const res = await this.db.client.from('progress_metrics').insert([row]).select();
      if ((res as any)?.error) throw new Error((res as any).error.message);
      const inserted = (res as any)?.data?.[0] || row;
      return { success: true, metric: { id: inserted.id || null, subject: inserted.subject, score, minutes, recordedAt: inserted.recorded_at || recordedAt } };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'progress record failed') };
    }
  }
}

import { Controller, Get, Post, Query, Body, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LearningScoreService } from '../progress/learning-score.service';
import { OrchardService } from '../orchard/orchard.service';
import { normalizeSubjectKey } from '../orchard/orchard.constants';
import { METRIC_ORDER_COLUMN, metricMinutes, metricRow, metricScore } from '../progress/progress-metric.util';

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
    const id = req.studentId || studentId;
    try {
      const res = await this.db.client.from('progress_metrics').select('*').eq('student_id', id).order(METRIC_ORDER_COLUMN, { ascending: false }).limit(50);
      if ((res as any)?.error) throw new Error((res as any).error.message);
      const rows = (res && (res as any).data) || [];

      // Only report subjects the student actually has — i.e. ones the school
      // registered a teacher for in their class. Metrics left behind by a
      // subject that no longer has a teacher must not reappear as a card.
      const allowed = new Set(await this.orchard.resolveStudentSubjectKeys(id).catch(() => [] as string[]));

      const bySubject = new Map<string, number[]>();
      let timeSpent = 0;

      for (const r of Array.isArray(rows) ? rows : []) {
        const s = r.subject || r.metric_key || 'General';
        if (!allowed.has(normalizeSubjectKey(s))) continue;
        const score = metricScore(r);
        timeSpent += metricMinutes(r);
        if (!Number.isFinite(score)) continue;
        const arr = bySubject.get(s) || [];
        arr.push(score);
        bySubject.set(s, arr);
      }

      const subjectScores = Array.from(bySubject.entries()).map(([subject, arr]) => {
        const latest = arr[0] ?? 0;
        const prev = arr[1] ?? latest;
        return { subject, score: Math.round(latest), trend: Math.round(latest - prev) };
      });

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
    const sid = body.studentId || req.studentId;
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

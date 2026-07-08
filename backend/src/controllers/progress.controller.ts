import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('progress')
export class ProgressController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getProgress(@Req() req: any, @Query('studentId') studentId: string, @Query('period') period: string) {
    const id = req.studentId || studentId;
    try {
      const res = await this.db.client.from('progress_metrics').select('*').eq('student_id', id).order('date', { ascending: false }).limit(50);
      const rows = (res && (res as any).data) || [];
      const bySubject = new Map<string, number[]>();
      let timeSpent = 0;

      for (const r of Array.isArray(rows) ? rows : []) {
        const s = r.subject || r.metric_key || 'General';
        const score = Number(r.score ?? r.metric_value ?? r.value);
        const minutes = Number(r.minutes || r.time_spent || 0);
        if (Number.isFinite(minutes)) timeSpent += minutes;
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

      return { timeSpent, subjectScores, weakTopics };
    } catch (e) {
      return { timeSpent: 0, subjectScores: [], weakTopics: [] };
    }
  }
}

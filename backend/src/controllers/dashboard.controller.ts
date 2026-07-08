import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';

@Controller('dashboard')
export class DashboardController {
  private static cache = new Map<string, { expiresAt: number; value: any }>();

  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async getDashboard(@Req() req: any, @Query('studentId') studentId: string) {
    const id = req.studentId || studentId;
    const cacheKey = `dashboard:${id}`;
    const now = Date.now();
    const cached = DashboardController.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;

    try {
      const s = await this.db.client.from('students').select('id,name').eq('id', id).limit(1);
      const student = (s && (s as any).data && (s as any).data[0]) || null;

      const hw = await this.db.client.from('homework').select('*').eq('student_id', id).order('due_at', { ascending: true }).limit(8);
      const homeworkRows = (hw && (hw as any).data) || [];
      const mergedHomeworkRows = Array.isArray(homeworkRows) && homeworkRows.length
        ? homeworkRows
        : this.localFeed.listHomeworkForStudent(id);
      const todayPlan = (Array.isArray(mergedHomeworkRows) ? mergedHomeworkRows : []).slice(0, 6).map((h: any) => ({
        type: 'homework',
        title: h.title || h.file_url || 'Homework task',
        dueAt: h.due_at || h.created_at || null,
        status: h.status || (h.graded ? 'completed' : 'pending')
      }));

      const pm = await this.db.client.from('progress_metrics').select('*').eq('student_id', id).order('date', { ascending: false }).limit(10);
      const progressRows = (pm && (pm as any).data) || [];

      const subjectsMap = new Map<string, { scoreSum: number; count: number }>();
      for (const r of Array.isArray(progressRows) ? progressRows : []) {
        const name = r.subject || r.metric_key || 'General';
        const score = Number(r.score ?? r.metric_value ?? r.value ?? r?.details?.score ?? 0);
        if (!Number.isFinite(score)) continue;
        const prev = subjectsMap.get(name) || { scoreSum: 0, count: 0 };
        prev.scoreSum += score;
        prev.count += 1;
        subjectsMap.set(name, prev);
      }

      const subjects = Array.from(subjectsMap.entries()).map(([name, v], idx) => ({
        id: `${idx + 1}`,
        name,
        score: Math.round(v.scoreSum / Math.max(v.count, 1)),
        goal: 85
      }));

      const memRes = await this.db.client.from('memories').select('*').eq('student_id', id).limit(6);
      const memRows = (memRes && (memRes as any).data) || [];
      const recommendations = (Array.isArray(memRows) ? memRows : []).slice(0, 4).map((m: any) => ({
        topic: m.key || 'study topic',
        reason: m.value || 'Recommended from your learning pattern'
      }));

      const ann = await this.db.client
        .from('announcements')
        .select('*')
        .in('audience', ['students', 'all'])
        .order('created_at', { ascending: false })
        .limit(8);
      const announcementRows = (ann && (ann as any).data) || [];
      const announcements = (Array.isArray(announcementRows) ? announcementRows : []).map((a: any) => ({
        id: a.id,
        title: a.title || 'Announcement',
        message: a.message || '',
        audience: a.audience || 'students',
        createdAt: a.created_at || null
      }));
      const mergedAnnouncements = announcements.length ? announcements : this.localFeed.listAnnouncements();

      const dashboard = {
        greetingName: student?.name || null,
        todayPlan,
        subjects,
        streak: { days: 0 },
        recommendations,
        announcements: mergedAnnouncements
      };

      const response = {
        success: true,
        dashboard,
        ...dashboard
      };

      DashboardController.cache.set(cacheKey, { expiresAt: now + 10_000, value: response });
      return response;
    } catch (e) {
      const dashboard = { greetingName: null, todayPlan: [], subjects: [], streak: { days: 0 }, recommendations: [], announcements: [] };
      return { success: false, error: String((e as any)?.message || e || 'dashboard failed'), dashboard, ...dashboard };
    }
  }
}

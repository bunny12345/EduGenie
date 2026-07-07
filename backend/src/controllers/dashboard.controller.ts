import { Controller, Get, Query } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  async getDashboard(@Query('studentId') studentId: string) {
    try {
      const s = await this.db.client.from('students').select('id,name').eq('id', studentId).limit(1);
      const student = (s && (s as any).data && (s as any).data[0]) || null;

      const hw = await this.db.client.from('homework').select('*').eq('student_id', studentId).order('due_at', { ascending: true }).limit(8);
      const homework = (hw && (hw as any).data) || [];

      const pm = await this.db.client.from('progress_metrics').select('*').eq('student_id', studentId).order('date', { ascending: false }).limit(10);
      const progress = (pm && (pm as any).data) || [];

      return {
        greetingName: student?.name || null,
        todayPlan: homework,
        subjects: progress,
        streak: { days: 0 },
        recommendations: []
      };
    } catch (e) {
      return { greetingName: null, todayPlan: [], subjects: [], streak: { days: 0 }, recommendations: [] };
    }
  }
}

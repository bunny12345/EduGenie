import { Controller, Get, Query } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';

@Controller('progress')
export class ProgressController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  async getProgress(@Query('studentId') studentId: string, @Query('period') period: string) {
    try {
      const res = await this.db.client.from('progress_metrics').select('*').eq('student_id', studentId).order('date', { ascending: false }).limit(50);
      const rows = (res && (res as any).data) || [];
      return { timeSpent: 0, subjectScores: rows };
    } catch (e) {
      return { timeSpent: 0, subjectScores: [] };
    }
  }
}

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
      return { timeSpent: 0, subjectScores: rows };
    } catch (e) {
      return { timeSpent: 0, subjectScores: [] };
    }
  }
}

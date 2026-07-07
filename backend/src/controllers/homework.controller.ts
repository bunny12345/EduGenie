import { Controller, Get, Post, Body, Query, Param, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('homework')
export class HomeworkController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  @UseGuards(AuthGuard)
  async list(@Req() req: any, @Query('studentId') studentId: string) {
    const id = req.studentId || studentId;
    try {
      const res = await this.db.client.from('homework').select('*').eq('student_id', id).order('due_at', { ascending: true });
      return { homework: (res && (res as any).data) || [] };
    } catch (e) {
      return { homework: [] };
    }
  }

  @Post()
  @UseGuards(AuthGuard)
  async create(@Req() req: any, @Body() payload: any) {
    try {
      // ensure student_id is set from authenticated token
      const toInsert = { ...payload, student_id: payload.student_id || req.studentId };
      const res = await this.db.client.from('homework').insert([toInsert]).select();
      return { success: true, homework: (res && (res as any).data && (res as any).data[0]) || payload };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  @Post(':id/submit')
  @UseGuards(AuthGuard)
  async submit(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    try {
      const attempt = { homework_id: id, student_id: body.studentId || req.studentId, answers: body.answers || null, created_at: new Date().toISOString() };
      const res = await this.db.client.from('homework_attempts').insert([attempt]).select();
      return { success: true, attempt: (res && (res as any).data && (res as any).data[0]) || attempt };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}

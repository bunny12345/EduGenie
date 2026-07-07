import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';

@Controller('homework')
export class HomeworkController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  async list(@Query('studentId') studentId: string) {
    try {
      const res = await this.db.client.from('homework').select('*').eq('student_id', studentId).order('due_at', { ascending: true });
      return { homework: (res && (res as any).data) || [] };
    } catch (e) {
      return { homework: [] };
    }
  }

  @Post()
  async create(@Body() payload: any) {
    try {
      const res = await this.db.client.from('homework').insert([payload]).select();
      return { success: true, homework: (res && (res as any).data && (res as any).data[0]) || payload };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  @Post(':id/submit')
  async submit(@Param('id') id: string, @Body() body: any) {
    try {
      const attempt = { homework_id: id, student_id: body.studentId, answers: body.answers || null, created_at: new Date().toISOString() };
      const res = await this.db.client.from('homework_attempts').insert([attempt]).select();
      return { success: true, attempt: (res && (res as any).data && (res as any).data[0]) || attempt };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}

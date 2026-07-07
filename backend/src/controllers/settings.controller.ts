import { Controller, Get, Post, Query, Body, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('settings')
export class SettingsController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  @UseGuards(AuthGuard)
  async getSettings(@Req() req: any, @Query('studentId') studentId: string) {
    const id = req.studentId || studentId;
    try {
      const res = await this.db.client.from('settings').select('*').eq('student_id', id).limit(1);
      return (res && (res as any).data && (res as any).data[0]) || { prefs: {} };
    } catch (e) {
      return { prefs: {} };
    }
  }

  @Post()
  @UseGuards(AuthGuard)
  async saveSettings(@Req() req: any, @Body() body: any) {
    try {
      const payload = { ...body, student_id: body.student_id || req.studentId };
      if (payload.id) {
        const upd = await this.db.client.from('settings').update(payload).eq('id', payload.id).select();
        return { success: true, saved: (upd && (upd as any).data && (upd as any).data[0]) || payload };
      }
      const ins = await this.db.client.from('settings').insert([payload]).select();
      return { success: true, saved: (ins && (ins as any).data && (ins as any).data[0]) || payload };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}

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
      const row = (res && (res as any).data && (res as any).data[0]) || null;
      return { success: true, studentId: id, prefs: row?.prefs || row || {} };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'settings get failed'), studentId: id, prefs: {} };
    }
  }

  @Post()
  @UseGuards(AuthGuard)
  async saveSettings(@Req() req: any, @Body() body: any) {
    try {
      const payload = {
        ...body,
        student_id: body.studentId || body.student_id || req.studentId,
        prefs: body.prefs || body.preferences || body.prefs || {}
      };
      if (payload.id) {
        const upd = await this.db.client.from('settings').update(payload).eq('id', payload.id).select();
        const saved = (upd && (upd as any).data && (upd as any).data[0]) || payload;
        return { success: true, settings: { studentId: saved.student_id, prefs: saved.prefs || {} } };
      }
      const ins = await this.db.client.from('settings').insert([payload]).select();
      const saved = (ins && (ins as any).data && (ins as any).data[0]) || payload;
      return { success: true, settings: { studentId: saved.student_id, prefs: saved.prefs || {} } };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}

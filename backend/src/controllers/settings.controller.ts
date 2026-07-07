import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  async getSettings(@Query('studentId') studentId: string) {
    try {
      const res = await this.db.client.from('settings').select('*').eq('student_id', studentId).limit(1);
      return (res && (res as any).data && (res as any).data[0]) || { prefs: {} };
    } catch (e) {
      return { prefs: {} };
    }
  }

  @Post()
  async saveSettings(@Body() body: any) {
    try {
      const payload = body;
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

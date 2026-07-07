import { Controller, Get, Post, Delete, Query, Param, Body } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  async list(@Query('studentId') studentId: string) {
    try {
      const res = await this.db.client.from('events').select('*').eq('student_id', studentId).order('start', { ascending: true });
      return { events: (res && (res as any).data) || [] };
    } catch (e) {
      return { events: [] };
    }
  }

  @Post()
  async create(@Body() payload: any) {
    try {
      const res = await this.db.client.from('events').insert([payload]).select();
      return { success: true, event: (res && (res as any).data && (res as any).data[0]) || payload };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      await this.db.client.from('events').delete().eq('id', id);
      return { success: true, id };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}

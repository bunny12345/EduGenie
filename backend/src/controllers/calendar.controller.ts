import { Controller, Get, Post, Delete, Query, Param, Body, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  @UseGuards(AuthGuard)
  async list(
    @Req() req: any,
    @Query('studentId') studentId: string,
    @Query('rangeStart') rangeStart?: string,
    @Query('rangeEnd') rangeEnd?: string
  ) {
    const id = req.studentId || studentId;
    try {
      let q = this.db.client.from('events').select('*').eq('student_id', id);
      if (rangeStart) q = q.gte('start', rangeStart);
      if (rangeEnd) q = q.lte('start', rangeEnd);
      const res = await q.order('start', { ascending: true });
      return { success: true, events: (res && (res as any).data) || [] };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'calendar list failed'), events: [] };
    }
  }

  @Post()
  @UseGuards(AuthGuard)
  async create(@Req() req: any, @Body() payload: any) {
    try {
      const toInsert = {
        student_id: payload.studentId || payload.student_id || req.studentId,
        title: payload.title,
        start: payload.start,
        end: payload.end,
        type: payload.type || 'event',
        metadata: payload.metadata || null
      };
      const res = await this.db.client.from('events').insert([toInsert]).select();
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

import { Controller, Get, Post, Delete, Query, Param, Body, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly db: SupabaseService) {}

  @Get()
  @UseGuards(AuthGuard)
  async list(@Req() req: any, @Query('studentId') studentId: string) {
    const id = req.studentId || studentId;
    try {
      const res = await this.db.client.from('events').select('*').eq('student_id', id).order('start', { ascending: true });
      return { events: (res && (res as any).data) || [] };
    } catch (e) {
      return { events: [] };
    }
  }

  @Post()
  @UseGuards(AuthGuard)
  async create(@Req() req: any, @Body() payload: any) {
    try {
      const toInsert = { ...payload, student_id: payload.student_id || req.studentId };
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

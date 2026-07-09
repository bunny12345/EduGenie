import { Controller, Get, Post, Delete, Query, Param, Body, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService
  ) {}

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
      const rows = (res && (res as any).data) || [];
      const merged = Array.isArray(rows) && rows.length ? rows : this.localFeed.listEventsForStudent(id);
      return { success: true, events: merged };
    } catch (e) {
      return {
        success: true,
        error: String((e as any)?.message || e || 'calendar list failed'),
        events: this.localFeed.listEventsForStudent(id)
      };
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
      const event = (res && (res as any).data && (res as any).data[0]) || toInsert;
      const saved = this.localFeed.addEvent(event);
      this.localFeed.logStudentActivity(toInsert.student_id, {
        type: 'calendar',
        action: 'created',
        title: toInsert.title || 'Calendar event',
        details: 'Created calendar event',
        meta: { eventId: saved?.id || event?.id || null, start: toInsert.start }
      });
      return { success: true, event: saved || event };
    } catch (e) {
      const saved = this.localFeed.addEvent({
        student_id: payload.studentId || payload.student_id || req.studentId,
        title: payload.title,
        start: payload.start,
        end: payload.end,
        type: payload.type || 'event',
        metadata: payload.metadata || null
      });
      this.localFeed.logStudentActivity(payload.studentId || payload.student_id || req.studentId, {
        type: 'calendar',
        action: 'created',
        title: payload.title || 'Calendar event',
        details: 'Created calendar event',
        meta: { eventId: saved?.id || null, start: payload.start || null }
      });
      return { success: true, error: String(e), event: saved };
    }
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async remove(@Req() req: any, @Param('id') id: string) {
    const localEvent = this.localFeed.listEventsForStudent(req.studentId).find((event: any) => String(event?.id || '') === String(id));
    try {
      await this.db.client.from('events').delete().eq('id', id);
      this.localFeed.removeEvent(id);
      this.localFeed.logStudentActivity(req.studentId || localEvent?.student_id || localEvent?.studentId, {
        type: 'calendar',
        action: 'deleted',
        title: localEvent?.title || `Event ${id}`,
        details: 'Deleted calendar event',
        meta: { eventId: id }
      });
      return { success: true, id };
    } catch (e) {
      this.localFeed.removeEvent(id);
      this.localFeed.logStudentActivity(req.studentId || localEvent?.student_id || localEvent?.studentId, {
        type: 'calendar',
        action: 'deleted',
        title: localEvent?.title || `Event ${id}`,
        details: 'Deleted calendar event',
        meta: { eventId: id }
      });
      return { success: true, error: String(e), id };
    }
  }
}

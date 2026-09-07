import { Controller, Get, Post, Patch, Delete, Query, Param, Body, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService
  ) {}

  // NOTE: the `events` table columns are `starts_at` / `ends_at` / `event_type`
  // (see backend/db/migrations/2026-07-07-app-tables.sql) — do not use
  // `start` / `end` / `type` here, those columns don't exist and every
  // Supabase call would silently no-op (supabase-js returns {error}, it
  // doesn't throw), which used to make events "disappear" after a restart
  // because they only ever landed in the in-memory local-feed fallback.
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
      if (rangeStart) q = q.gte('starts_at', rangeStart);
      if (rangeEnd) q = q.lte('starts_at', rangeEnd);
      const res = await q.order('starts_at', { ascending: true });
      if (res?.error) throw new Error(res.error.message || 'calendar list failed');
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
    const studentId = payload.studentId || payload.student_id || req.studentId;
    const toInsert = {
      student_id: studentId,
      title: payload.title,
      description: payload.description || null,
      event_type: payload.type || payload.event_type || 'study',
      starts_at: payload.start || payload.starts_at,
      ends_at: payload.end || payload.ends_at || null,
      all_day: payload.allDay || payload.all_day || false
    };
    try {
      const res = await this.db.client.from('events').insert([toInsert]).select();
      if (res?.error) throw new Error(res.error.message || 'calendar insert failed');
      const event = (res && (res as any).data && (res as any).data[0]) || toInsert;
      // Also cache in the local feed so list() has an immediate fallback if a
      // subsequent read hiccups; Supabase remains the durable source of truth.
      const saved = this.localFeed.addEvent(event);
      this.localFeed.logStudentActivity(studentId, {
        type: 'calendar',
        action: 'created',
        title: toInsert.title || 'Calendar event',
        details: 'Created calendar event',
        meta: { eventId: saved?.id || event?.id || null, start: toInsert.starts_at }
      });
      return { success: true, event: event || saved };
    } catch (e) {
      const saved = this.localFeed.addEvent(toInsert);
      this.localFeed.logStudentActivity(studentId, {
        type: 'calendar',
        action: 'created',
        title: payload.title || 'Calendar event',
        details: 'Created calendar event',
        meta: { eventId: saved?.id || null, start: toInsert.starts_at || null }
      });
      return { success: true, error: String((e as any)?.message || e), event: saved };
    }
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  async update(@Req() req: any, @Param('id') id: string, @Body() payload: any) {
    const studentId = payload.studentId || payload.student_id || req.studentId;
    const patch: any = {};
    if (payload.title !== undefined) patch.title = payload.title;
    if (payload.description !== undefined) patch.description = payload.description;
    if (payload.start !== undefined) patch.starts_at = payload.start;
    if (payload.starts_at !== undefined) patch.starts_at = payload.starts_at;
    if (payload.end !== undefined) patch.ends_at = payload.end;
    if (payload.ends_at !== undefined) patch.ends_at = payload.ends_at;
    if (payload.type !== undefined) patch.event_type = payload.type;
    if (payload.event_type !== undefined) patch.event_type = payload.event_type;
    if (payload.allDay !== undefined) patch.all_day = payload.allDay;
    try {
      const res = await this.db.client.from('events').update(patch).eq('id', id).select();
      if (res?.error) throw new Error(res.error.message || 'calendar update failed');
      const event = (res && (res as any).data && (res as any).data[0]) || null;
      const saved = this.localFeed.addEvent({ id, student_id: studentId, ...patch, ...(event || {}) });
      this.localFeed.logStudentActivity(studentId, {
        type: 'calendar',
        action: 'updated',
        title: patch.title || saved?.title || `Event ${id}`,
        details: 'Updated calendar event',
        meta: { eventId: id, start: patch.starts_at || saved?.starts_at || null }
      });
      return { success: true, event: event || saved };
    } catch (e) {
      const saved = this.localFeed.addEvent({ id, student_id: studentId, ...patch });
      this.localFeed.logStudentActivity(studentId, {
        type: 'calendar',
        action: 'updated',
        title: patch.title || saved?.title || `Event ${id}`,
        details: 'Updated calendar event',
        meta: { eventId: id }
      });
      return { success: true, error: String((e as any)?.message || e), event: saved };
    }
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async remove(@Req() req: any, @Param('id') id: string) {
    const localEvent = this.localFeed.listEventsForStudent(req.studentId).find((event: any) => String(event?.id || '') === String(id));
    try {
      const res = await this.db.client.from('events').delete().eq('id', id);
      if (res?.error) throw new Error(res.error.message || 'calendar delete failed');
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
      return { success: true, error: String((e as any)?.message || e), id };
    }
  }
}

import { Controller, Get, Post, Body, Query, Param, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';

@Controller('homework')
export class HomeworkController {
  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async list(@Req() req: any, @Query('studentId') studentId: string) {
    const id = req.studentId || studentId;
    try {
      const res = await this.db.client.from('homework').select('*').eq('student_id', id).order('due_at', { ascending: true });
      const rows = (res && (res as any).data) || [];
      const mergedRows = (Array.isArray(rows) && rows.length) ? rows : this.localFeed.listHomeworkForStudent(id);
      const homework = (Array.isArray(mergedRows) ? mergedRows : []).map((h: any) => ({
        id: h.id,
        title: h.title || h.file_url || 'Homework',
        subject: h.subject || 'General',
        dueAt: h.due_at || h.created_at || null,
        status: h.status || (h.graded ? 'completed' : 'pending'),
        progress: h.progress ?? (h.graded ? 100 : 0)
      }));
      return { success: true, homework };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'homework list failed'), homework: [] };
    }
  }

  @Post()
  @UseGuards(AuthGuard)
  async create(@Req() req: any, @Body() payload: any) {
    try {
      // ensure student_id is set from authenticated token
      const toInsert = {
        student_id: payload.studentId || payload.student_id || req.studentId,
        title: payload.title,
        subject: payload.subject || 'General',
        due_at: payload.dueAt || payload.due_at || null,
        tasks: payload.tasks || null,
        status: payload.status || 'pending'
      };
      const res = await this.db.client.from('homework').insert([toInsert]).select();
      const row = (res && (res as any).data && (res as any).data[0]) || toInsert;
      this.localFeed.addHomework([row]);
      return {
        success: true,
        homework: {
          id: row.id,
          title: row.title || 'Homework',
          subject: row.subject || 'General',
          dueAt: row.due_at || null,
          status: row.status || 'pending',
          progress: row.progress ?? 0
        }
      };
    } catch (e) {
      return { success: false, homework: null, error: String(e) };
    }
  }

  @Post(':id/submit')
  @UseGuards(AuthGuard)
  async submit(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    try {
      const attempt = {
        homework_id: id,
        student_id: body.studentId || req.studentId,
        answers: body.answers || null,
        attachment_url: body.attachmentUrl || null,
        created_at: new Date().toISOString()
      };
      const res = await this.db.client.from('homework_attempts').insert([attempt]).select();
      const row = (res && (res as any).data && (res as any).data[0]) || attempt;
      this.localFeed.logStudentActivity(body.studentId || req.studentId, {
        type: 'homework',
        action: 'submitted',
        title: `Homework ${id}`,
        details: 'Submitted homework attempt'
      });
      return { success: true, attemptId: row.id || null, grade: row.score ?? null };
    } catch (e) {
      return { success: false, attemptId: null, grade: null, error: String(e) };
    }
  }

  @Get(':id/attempts')
  @UseGuards(AuthGuard)
  async attempts(@Req() req: any, @Param('id') id: string, @Query('studentId') studentId: string) {
    const sid = req.studentId || studentId;
    try {
      const res = await this.db.client.from('homework_attempts').select('*').eq('homework_id', id).eq('student_id', sid).order('created_at', { ascending: false });
      return { success: true, attempts: (res && (res as any).data) || [] };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'homework attempts failed'), attempts: [] };
    }
  }
}

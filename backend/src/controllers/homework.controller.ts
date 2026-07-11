import { Controller, Get, Post, Body, Query, Param, UseGuards, Req } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Controller('homework')
export class HomeworkController {
  constructor(
    private readonly db: SupabaseService,
    private readonly localFeed: LocalFeedService
  ) {}

  private saveHomeworkUpload(payload: any) {
    const fileNameRaw = String(payload?.fileName || 'homework-upload').trim() || 'homework-upload';
    const mimeType = String(payload?.mimeType || '').trim();
    const dataRaw = String(payload?.data || '').trim();
    if (!dataRaw) throw new Error('Missing upload data');

    const base64 = dataRaw.replace(/^data:[^;]+;base64,/, '');
    const extFromMime = mimeType.includes('/') ? `.${mimeType.split('/')[1].split(';')[0].replace(/[^a-z0-9]+/gi, '')}` : '';
    const extFromName = path.extname(fileNameRaw).replace(/[^.a-z0-9]+/gi, '');
    const safeBase = path.basename(fileNameRaw, path.extname(fileNameRaw)).replace(/[^a-z0-9-_]+/gi, '_').slice(0, 50) || 'homework-upload';
    const finalName = `${safeBase}-${Date.now()}-${randomUUID().slice(0, 8)}${extFromName || extFromMime || '.png'}`;
    const uploadDir = path.join(process.cwd(), 'local-data', 'uploads', 'homework');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, finalName), Buffer.from(base64, 'base64'));
    return `/uploads/homework/${finalName}`;
  }

  @Post('upload')
  @UseGuards(AuthGuard)
  async uploadHomeworkImage(@Req() req: any, @Body() body: any) {
    try {
      const url = this.saveHomeworkUpload(body);
      return { success: true, url };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'upload failed') };
    }
  }

  @Get()
  @UseGuards(AuthGuard)
  async list(@Req() req: any, @Query('studentId') studentId: string) {
    const id = req.studentId || studentId;
    try {
      const res = await this.db.client.from('homework').select('*').eq('student_id', id).order('due_at', { ascending: true });
      const dbRows: any[] = Array.isArray((res as any)?.data) ? (res as any).data : [];

      // Merge with localFeed (handles mock client and in-process-only assignments)
      const localRows = this.localFeed.listHomeworkForStudent(id);
      const dbIds = new Set(dbRows.map((r: any) => String(r.id || '')));
      const freshLocal = localRows.filter((r: any) => !dbIds.has(String(r.id || '')));
      const mergedRows = [...dbRows, ...freshLocal];

      const attemptsRes = await this.db.client.from('homework_attempts').select('*').eq('student_id', id).order('created_at', { ascending: false });
      const attemptsRows: any[] = Array.isArray((attemptsRes as any)?.data) ? (attemptsRes as any).data : [];
      const attemptsByHw = new Map<string, any[]>();
      attemptsRows.forEach((a: any) => {
        const key = String(a.homework_id || '');
        if (!attemptsByHw.has(key)) attemptsByHw.set(key, []);
        attemptsByHw.get(key)!.push(a);
      });

      const now = new Date();
      const homework = mergedRows.map((h: any, idx: number) => {
        const dueDateRaw = h.due_at || h.created_at || null;
        const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
        const hwAttempts = attemptsByHw.get(String(h.id || '')) || [];
        const submitted = hwAttempts.length > 0 || String(h.status || '').toLowerCase() === 'submitted' || String(h.status || '').toLowerCase() === 'graded';
        const daysSinceDue = dueDate && !Number.isNaN(dueDate.getTime())
          ? Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        const overdue = !!(daysSinceDue !== null && daysSinceDue >= 0);
        const expired = !!(daysSinceDue !== null && daysSinceDue > 3 && !submitted);
        return {
        note: h.note ?? h?.tasks?.meta?.note ?? null,
        startAt: h.start_at ?? h?.tasks?.meta?.startAt ?? null,
        attachmentUrl: h.attachment_url ?? h?.tasks?.meta?.attachmentUrl ?? null,
        id: h.id || `${id}-${h.subject || 'General'}-${h.title || 'Homework'}-${h.due_at || h.created_at || idx}-${idx}`,
        title: h.title || h.file_url || 'Homework',
        subject: h.subject || 'General',
        dueAt: h.due_at || h.created_at || null,
        status: submitted ? 'submitted' : (h.status || 'pending'),
        progress: h.progress ?? (submitted ? 100 : 0),
        submitted,
        overdue,
        expired,
        daysSinceDue,
        attemptCount: hwAttempts.length,
        lastAttemptAt: hwAttempts[0]?.created_at || null,
        dueStatus: submitted ? 'submitted' : (expired ? 'expired' : (overdue ? 'overdue' : 'pending')),
        remark: submitted
          ? 'Submitted'
          : (expired
            ? `Overdue by ${daysSinceDue} day${daysSinceDue === 1 ? '' : 's'} — hidden from student portal`
            : (overdue ? `Overdue by ${daysSinceDue} day${daysSinceDue === 1 ? '' : 's'}` : 'Pending'))
      };
      });
      return { success: true, homework };
    } catch (e) {
      // On any error fall back to whatever localFeed has for this student
      const attemptsFallback = [] as any[];
      const homeworkById = new Map<string, any[]>();
      attemptsFallback.forEach((a: any) => {
        const key = String(a.homework_id || '');
        if (!homeworkById.has(key)) homeworkById.set(key, []);
        homeworkById.get(key)!.push(a);
      });
      const now = new Date();
      const fallback = this.localFeed.listHomeworkForStudent(id).map((h: any, idx: number) => {
        const dueDateRaw = h.due_at || h.created_at || null;
        const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
        const hwAttempts = homeworkById.get(String(h.id || '')) || [];
        const submitted = hwAttempts.length > 0 || String(h.status || '').toLowerCase() === 'submitted' || String(h.status || '').toLowerCase() === 'graded';
        const daysSinceDue = dueDate && !Number.isNaN(dueDate.getTime())
          ? Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        const overdue = !!(daysSinceDue !== null && daysSinceDue >= 0);
        const expired = !!(daysSinceDue !== null && daysSinceDue > 3 && !submitted);
        return {
        note: h.note ?? h?.tasks?.meta?.note ?? null,
        startAt: h.start_at ?? h?.tasks?.meta?.startAt ?? null,
        attachmentUrl: h.attachment_url ?? h?.tasks?.meta?.attachmentUrl ?? null,
        id: h.id || `${id}-${h.subject || 'General'}-${h.title || 'Homework'}-${h.due_at || h.created_at || idx}-${idx}`,
        title: h.title || 'Homework',
        subject: h.subject || 'General',
        dueAt: h.due_at || h.created_at || null,
        status: submitted ? 'submitted' : (h.status || 'pending'),
        progress: h.progress ?? (submitted ? 100 : 0),
        submitted,
        overdue,
        expired,
        daysSinceDue,
        attemptCount: hwAttempts.length,
        lastAttemptAt: hwAttempts[0]?.created_at || null,
        dueStatus: submitted ? 'submitted' : (expired ? 'expired' : (overdue ? 'overdue' : 'pending')),
        remark: submitted
          ? 'Submitted'
          : (expired
            ? `Overdue by ${daysSinceDue} day${daysSinceDue === 1 ? '' : 's'} — hidden from student portal`
            : (overdue ? `Overdue by ${daysSinceDue} day${daysSinceDue === 1 ? '' : 's'}` : 'Pending'))
      };
      });
      if (fallback.length) return { success: true, homework: fallback };
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

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

  private sanitizeAttachmentUrls(value: any, fallbackSingle?: any) {
    const list = Array.isArray(value) ? value : [];
    const normalized = list
      .filter((u: any) => typeof u === 'string' && String(u).trim())
      .map((u: string) => String(u).trim())
      .filter((u: string) => !u.startsWith('blob:'));
    if (normalized.length) return normalized;
    const single = typeof fallbackSingle === 'string' ? fallbackSingle.trim() : '';
    if (single && !single.startsWith('blob:')) return [single];
    return [];
  }

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
      const relativeUrl = this.saveHomeworkUpload(body);
      const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
      const protoHeader = String(req?.headers?.['x-forwarded-proto'] || '').trim();
      const protocol = protoHeader || (req?.protocol || 'http');
      const url = host ? `${protocol}://${host}${relativeUrl}` : relativeUrl;
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
      const homeworkIds = new Set(mergedRows.map((r: any) => String(r?.id || '')));

      // Legacy repair: older builds stored student submissions under "test".
      // Auto-migrate only attempts that belong to this student's homework.
      if (id && id !== 'test') {
        try {
          const legacyRes = await this.db.client.from('homework_attempts').select('*').eq('student_id', 'test').order('created_at', { ascending: false });
          const legacyRows: any[] = Array.isArray((legacyRes as any)?.data) ? (legacyRes as any).data : [];
          const migratable = legacyRows.filter((a: any) => homeworkIds.has(String(a?.homework_id || '')));
          if (migratable.length) {
            for (const row of migratable) {
              if (!row?.id) continue;
              await this.db.client.from('homework_attempts').update({ student_id: id }).eq('id', row.id);
            }
            attemptsRows.unshift(...migratable.map((a: any) => ({ ...a, student_id: id })));
          }
        } catch {
          // Non-fatal local repair.
        }
      }
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
        const rawStatus = String(h.status || '').toLowerCase();
        const submitted = hwAttempts.length > 0 || rawStatus === 'submitted' || rawStatus === 'graded' || rawStatus === 'resubmitted';
        const effectiveSubmittedStatus = (hwAttempts.length > 1 || rawStatus === 'resubmitted') ? 'resubmitted' : 'submitted';
        const savedLatestUrls = this.sanitizeAttachmentUrls(h.latest_attachment_urls ?? h?.latestAttachmentUrls, h.latest_attachment_url ?? h?.latestAttachmentUrl ?? null);
        const daysSinceDue = dueDate && !Number.isNaN(dueDate.getTime())
          ? Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        const overdue = !!(daysSinceDue !== null && daysSinceDue >= 0);
        const expired = !!(daysSinceDue !== null && daysSinceDue > 3 && !submitted);
        const attachmentUrls = this.sanitizeAttachmentUrls(h.attachment_urls ?? h?.tasks?.meta?.attachmentUrls, h.attachment_url ?? h?.tasks?.meta?.attachmentUrl ?? null);
        const attachmentUrl = attachmentUrls[0] ?? null;
        return {
        note: h.note ?? h?.tasks?.meta?.note ?? null,
        startAt: h.start_at ?? h?.tasks?.meta?.startAt ?? null,
        attachmentUrls: attachmentUrls.length ? attachmentUrls : (attachmentUrl ? [attachmentUrl] : []),
        attachmentUrl,
        id: h.id || `${id}-${h.subject || 'General'}-${h.title || 'Homework'}-${h.due_at || h.created_at || idx}-${idx}`,
        title: h.title || h.file_url || 'Homework',
        subject: h.subject || 'General',
        dueAt: h.due_at || h.created_at || null,
        status: submitted ? effectiveSubmittedStatus : (h.status || 'pending'),
        grade: h.grade ?? null,
        feedback: h.feedback ?? null,
        progress: h.progress ?? (submitted ? 100 : 0),
        submitted,
        overdue,
        expired,
        daysSinceDue,
        attemptCount: hwAttempts.length,
        lastAttemptAt: hwAttempts[0]?.created_at || null,
        submittedAt: hwAttempts[0]?.created_at || h.submitted_at || null,
        latestAttachmentUrls: this.sanitizeAttachmentUrls(hwAttempts[0]?.attachment_urls, hwAttempts[0]?.attachment_url).length
          ? this.sanitizeAttachmentUrls(hwAttempts[0]?.attachment_urls, hwAttempts[0]?.attachment_url)
          : savedLatestUrls,
        latestAttachmentUrl: this.sanitizeAttachmentUrls(hwAttempts[0]?.attachment_urls, hwAttempts[0]?.attachment_url)[0] || savedLatestUrls[0] || null,
        latestAnswerText: (() => {
          const fromAttempt = typeof hwAttempts[0]?.answers?.text === 'string' ? hwAttempts[0].answers.text.trim() : '';
          if (fromAttempt) return fromAttempt;
          const fromRow = typeof h?.latest_answer_text === 'string' ? h.latest_answer_text.trim() : '';
          return fromRow || null;
        })(),
        dueStatus: submitted ? (effectiveSubmittedStatus === 'resubmitted' ? 'resubmitted' : 'submitted') : (expired ? 'expired' : (overdue ? 'overdue' : 'pending')),
        remark: submitted
          ? (effectiveSubmittedStatus === 'resubmitted' ? 'Resubmitted' : 'Submitted')
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
        const rawStatus = String(h.status || '').toLowerCase();
        const submitted = hwAttempts.length > 0 || rawStatus === 'submitted' || rawStatus === 'graded' || rawStatus === 'resubmitted';
        const effectiveSubmittedStatus = (hwAttempts.length > 1 || rawStatus === 'resubmitted') ? 'resubmitted' : 'submitted';
        const savedLatestUrls = this.sanitizeAttachmentUrls(h.latest_attachment_urls ?? h?.latestAttachmentUrls, h.latest_attachment_url ?? h?.latestAttachmentUrl ?? null);
        const daysSinceDue = dueDate && !Number.isNaN(dueDate.getTime())
          ? Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        const overdue = !!(daysSinceDue !== null && daysSinceDue >= 0);
        const expired = !!(daysSinceDue !== null && daysSinceDue > 3 && !submitted);
        const attachmentUrls = this.sanitizeAttachmentUrls(h.attachment_urls ?? h?.tasks?.meta?.attachmentUrls, h.attachment_url ?? h?.tasks?.meta?.attachmentUrl ?? null);
        const attachmentUrl = attachmentUrls[0] ?? null;
        return {
        note: h.note ?? h?.tasks?.meta?.note ?? null,
        startAt: h.start_at ?? h?.tasks?.meta?.startAt ?? null,
        attachmentUrls: attachmentUrls.length ? attachmentUrls : (attachmentUrl ? [attachmentUrl] : []),
        attachmentUrl,
        id: h.id || `${id}-${h.subject || 'General'}-${h.title || 'Homework'}-${h.due_at || h.created_at || idx}-${idx}`,
        title: h.title || 'Homework',
        subject: h.subject || 'General',
        dueAt: h.due_at || h.created_at || null,
        status: submitted ? effectiveSubmittedStatus : (h.status || 'pending'),
        grade: h.grade ?? null,
        feedback: h.feedback ?? null,
        progress: h.progress ?? (submitted ? 100 : 0),
        submitted,
        overdue,
        expired,
        daysSinceDue,
        attemptCount: hwAttempts.length,
        lastAttemptAt: hwAttempts[0]?.created_at || null,
        submittedAt: hwAttempts[0]?.created_at || h.submitted_at || null,
        latestAttachmentUrls: this.sanitizeAttachmentUrls(hwAttempts[0]?.attachment_urls, hwAttempts[0]?.attachment_url).length
          ? this.sanitizeAttachmentUrls(hwAttempts[0]?.attachment_urls, hwAttempts[0]?.attachment_url)
          : savedLatestUrls,
        latestAttachmentUrl: this.sanitizeAttachmentUrls(hwAttempts[0]?.attachment_urls, hwAttempts[0]?.attachment_url)[0] || savedLatestUrls[0] || null,
        latestAnswerText: (() => {
          const fromAttempt = typeof hwAttempts[0]?.answers?.text === 'string' ? hwAttempts[0].answers.text.trim() : '';
          if (fromAttempt) return fromAttempt;
          const fromRow = typeof h?.latest_answer_text === 'string' ? h.latest_answer_text.trim() : '';
          return fromRow || null;
        })(),
        dueStatus: submitted ? (effectiveSubmittedStatus === 'resubmitted' ? 'resubmitted' : 'submitted') : (expired ? 'expired' : (overdue ? 'overdue' : 'pending')),
        remark: submitted
          ? (effectiveSubmittedStatus === 'resubmitted' ? 'Resubmitted' : 'Submitted')
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
      const actorStudentId = req.studentId || body.studentId;
      if (!actorStudentId) {
        return { success: false, error: 'Missing student identity for submit' };
      }

      const RESUBMIT_WINDOW_MS = 60 * 60 * 1000;

      let latestHomeworkId = '';
      try {
        const latestRes = await this.db.client
          .from('homework')
          .select('id,created_at,start_at,due_at')
          .eq('student_id', actorStudentId)
          .order('created_at', { ascending: false })
          .limit(200);
        const rows = Array.isArray((latestRes as any)?.data) ? (latestRes as any).data : [];
        const sorted = rows
          .slice()
          .sort((a: any, b: any) => {
            const aTs = new Date(a?.start_at || a?.created_at || a?.due_at || 0).getTime();
            const bTs = new Date(b?.start_at || b?.created_at || b?.due_at || 0).getTime();
            return bTs - aTs;
          });
        latestHomeworkId = String(sorted[0]?.id || '').trim();
      } catch {
        const localRows = this.localFeed.listHomeworkForStudent(actorStudentId);
        const sorted = localRows
          .slice()
          .sort((a: any, b: any) => {
            const aTs = new Date(a?.start_at || a?.created_at || a?.due_at || 0).getTime();
            const bTs = new Date(b?.start_at || b?.created_at || b?.due_at || 0).getTime();
            return bTs - aTs;
          });
        latestHomeworkId = String(sorted[0]?.id || '').trim();
      }

      let priorAttempts: any[] = [];
      try {
        const priorRes = await this.db.client
          .from('homework_attempts')
          .select('*')
          .eq('homework_id', id)
          .eq('student_id', actorStudentId)
          .order('created_at', { ascending: false })
          .limit(10);
        priorAttempts = Array.isArray((priorRes as any)?.data) ? (priorRes as any).data : [];
      } catch {
        priorAttempts = [];
      }

      const isResubmission = priorAttempts.length > 0;
      if (isResubmission) {
        if (!latestHomeworkId || String(latestHomeworkId) !== String(id)) {
          return { success: false, error: 'Resubmission is allowed only for your latest assigned homework.' };
        }
        const lastAttemptAt = new Date(priorAttempts[0]?.created_at || 0).getTime();
        if (!Number.isFinite(lastAttemptAt) || Number.isNaN(lastAttemptAt)) {
          return { success: false, error: 'Cannot verify last submission time for resubmission.' };
        }
        if ((Date.now() - lastAttemptAt) > RESUBMIT_WINDOW_MS) {
          return { success: false, error: 'Resubmission window closed. You can edit and resubmit only within 1 hour.' };
        }
      }

      let currentHomeworkAttachmentUrls: string[] = [];
      try {
        const currentRes = await this.db.client.from('homework').select('latest_attachment_urls,latest_attachment_url,attachment_urls,attachment_url').eq('id', id).maybeSingle();
        const currentRow = (currentRes as any)?.data || null;
        currentHomeworkAttachmentUrls = this.sanitizeAttachmentUrls(
          currentRow?.latest_attachment_urls ?? currentRow?.attachment_urls,
          currentRow?.latest_attachment_url ?? currentRow?.attachment_url ?? null
        );
      } catch {
        currentHomeworkAttachmentUrls = [];
      }

      const providedAttachmentUrls = this.sanitizeAttachmentUrls(body.attachmentUrls, body.attachmentUrl);
      const stableAttachmentUrls = providedAttachmentUrls.length ? providedAttachmentUrls : currentHomeworkAttachmentUrls;
      const nowIso = new Date().toISOString();
      const latestAnswerText = typeof body?.answers?.text === 'string' ? body.answers.text.trim() : '';
      const attempt = {
        homework_id: id,
        student_id: actorStudentId,
        answers: body.answers || null,
        attachment_urls: stableAttachmentUrls,
        attachment_url: stableAttachmentUrls[0] || null,
        created_at: nowIso
      };
      let row: any = attempt;
      try {
        const res = await this.db.client.from('homework_attempts').insert([attempt]).select();
        row = (res && (res as any).data && (res as any).data[0]) || attempt;
      } catch {
        row = { ...attempt, id: `local-attempt-${Date.now()}` };
      }

      const nextStatus = isResubmission ? 'resubmitted' : 'submitted';
      try {
        await this.db.client.from('homework').update({
          status: nextStatus,
          latest_attachment_urls: stableAttachmentUrls,
          latest_attachment_url: stableAttachmentUrls[0] || null,
          latest_answer_text: latestAnswerText || null,
          submitted_at: nowIso,
          updated_at: nowIso
        }).eq('id', id);
      } catch {
        // Non-fatal in local/mock flows.
      }
      this.localFeed.updateHomework(id, {
        status: nextStatus,
        latest_attachment_urls: stableAttachmentUrls,
        latest_attachment_url: stableAttachmentUrls[0] || null,
        latest_answer_text: latestAnswerText || null,
        submitted_at: nowIso,
        updated_at: nowIso
      });
      this.localFeed.logStudentActivity(actorStudentId, {
        type: 'homework',
        action: isResubmission ? 'resubmitted' : 'submitted',
        title: `Homework ${id}`,
        details: isResubmission ? 'Resubmitted homework attempt' : 'Submitted homework attempt'
      });
      return { success: true, attemptId: row.id || null, grade: row.score ?? null, status: nextStatus, resubmitted: isResubmission };
    } catch (e) {
      return { success: true, attemptId: `local-attempt-${Date.now()}`, grade: null, warning: String(e) };
    }
  }

  @Get(':id/attempts')
  @UseGuards(AuthGuard)
  async attempts(@Req() req: any, @Param('id') id: string, @Query('studentId') studentId: string) {
    const sid = req.studentId || studentId;
    try {
      const res = await this.db.client.from('homework_attempts').select('*').eq('homework_id', id).eq('student_id', sid).order('created_at', { ascending: false });
      const attempts = Array.isArray((res && (res as any).data) || []) ? (res as any).data : [];
      return {
        success: true,
        attempts: attempts.map((a: any) => ({
          ...a,
          attachmentUrls: this.sanitizeAttachmentUrls(a?.attachment_urls, a?.attachment_url),
          attachmentUrl: this.sanitizeAttachmentUrls(a?.attachment_urls, a?.attachment_url)[0] || null
        }))
      };
    } catch (e) {
      return { success: false, error: String((e as any)?.message || e || 'homework attempts failed'), attempts: [] };
    }
  }
}

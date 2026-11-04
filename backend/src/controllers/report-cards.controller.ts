import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { StudentAuthService } from '../auth/student-auth.service';

// Routes deliberately live under the existing `teacher/` and `progress/` URL
// prefixes: CloudFront only forwards known controller prefixes to the backend.

const norm = (v: any) => String(v ?? '').trim().toLowerCase();

function isTeacher(role: any) {
  const raw = String(role || '').toLowerCase();
  return raw === 'teacher' || raw.includes('teacher') || raw === 'admin';
}

function gradeFor(pct: number) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 35) return 'D';
  return 'E';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type TeacherCtx = { teacherId: string; schoolId: string; grades: string[]; subject: string };

@Controller()
@UseGuards(AuthGuard)
export class ReportCardsController {
  constructor(
    private readonly db: SupabaseService,
    private readonly studentAuth: StudentAuthService
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────

  private fail(e: any, fallback: string) {
    const msg = String(e?.message || e || fallback);
    const missingTable = /report_exam|relation .* does not exist|schema cache|42P01/i.test(msg);
    return {
      success: false,
      error: missingTable ? 'Report cards are not set up yet — the database migration has not been applied.' : msg
    };
  }

  private unwrap(res: any) {
    if (res?.error) throw new Error(res.error?.message || String(res.error));
    return Array.isArray(res?.data) ? res.data : [];
  }

  private async teacherCtx(req: any): Promise<TeacherCtx> {
    const teacherId = String(req?.user?.sub || req?.user?.user_id || req?.user?.id || '').trim();
    const local = this.studentAuth.getLocalTeacher(teacherId);
    const schoolId = String(req?.user?.schoolId || local?.schoolId || '').trim();
    let grades: string[] = [];
    try {
      grades = await this.studentAuth.resolveTeacherGrades(teacherId);
    } catch {
      grades = [];
    }
    let subject = '';
    try {
      subject = await this.studentAuth.resolveTeacherSubject(teacherId);
    } catch {
      subject = '';
    }
    if (!subject) subject = String(req?.user?.subject || '').trim();
    if (norm(subject) === 'general') subject = '';
    return { teacherId, schoolId, grades, subject };
  }

  // A teacher may only work with classes the school admin assigned to them.
  private canAccessClass(ctx: TeacherCtx, className: string) {
    if (!ctx.grades.length) return true;
    return ctx.grades.some((g) => norm(g) === norm(className));
  }

  private async classTeachers(schoolId: string, className: string) {
    if (!schoolId || !className) return [] as Array<{ id: string; name: string; subject: string }>;
    try {
      return await this.studentAuth.listClassTeachers(schoolId, className);
    } catch {
      return [];
    }
  }

  // Unique subjects taught in a class, in a stable alphabetical order.
  private classSubjects(teachers: Array<{ id: string; name: string; subject: string }>) {
    const bySubject = new Map<string, { subject: string; teacherNames: string[] }>();
    for (const t of teachers) {
      const subject = String(t.subject || '').trim();
      if (!subject || norm(subject) === 'general') continue;
      const key = norm(subject);
      const entry = bySubject.get(key) || { subject, teacherNames: [] };
      if (t.name && !entry.teacherNames.includes(t.name)) entry.teacherNames.push(t.name);
      bySubject.set(key, entry);
    }
    return Array.from(bySubject.values()).sort((a, b) => a.subject.localeCompare(b.subject));
  }

  private async roster(schoolId: string, className: string) {
    try {
      const res: any = await this.studentAuth.listStudentsByScope({
        schoolId: schoolId || undefined,
        grades: [className],
        className
      });
      const rows = Array.isArray(res?.students) ? res.students : [];
      return rows
        .filter((s: any) => norm(s.className) === norm(className))
        .map((s: any) => ({ id: String(s.id), name: String(s.name || 'Student') }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
    } catch {
      return [] as Array<{ id: string; name: string }>;
    }
  }

  private examRow(r: any) {
    return {
      id: String(r.id),
      name: String(r.name || ''),
      className: String(r.class_name || ''),
      maxMarks: Number(r.max_marks ?? 100),
      createdBy: r.created_by ? String(r.created_by) : null,
      createdAt: r.created_at || null
    };
  }

  private async loadExam(examId: string) {
    const rows = this.unwrap(await this.db.client.from('report_exams').select('*').eq('id', examId).limit(1));
    return rows[0] || null;
  }

  // Per-subject completion + how many students are fully released.
  private buildSummary(
    exam: any,
    subjects: Array<{ subject: string; teacherNames: string[] }>,
    roster: Array<{ id: string; name: string }>,
    marks: any[],
    ctx: TeacherCtx,
    teacherNameById: Map<string, string>
  ) {
    const bySubject = new Map<string, Set<string>>();
    subjects.forEach((s) => bySubject.set(norm(s.subject), new Set()));
    const rosterIds = new Set(roster.map((s) => s.id));
    const perStudent = new Map<string, Set<string>>();
    for (const m of marks) {
      const sid = String(m.student_id);
      const key = norm(m.subject);
      if (!rosterIds.has(sid) || !bySubject.has(key)) continue;
      bySubject.get(key)!.add(sid);
      if (!perStudent.has(sid)) perStudent.set(sid, new Set());
      perStudent.get(sid)!.add(key);
    }
    let studentsReleased = 0;
    if (subjects.length) {
      for (const s of roster) {
        if ((perStudent.get(s.id)?.size || 0) >= subjects.length) studentsReleased += 1;
      }
    }
    const base = this.examRow(exam);
    const mySubjectKey = norm(ctx.subject);
    return {
      ...base,
      createdByName: base.createdBy ? (teacherNameById.get(base.createdBy) || null) : null,
      isOwner: !!base.createdBy && base.createdBy === ctx.teacherId,
      subjects: subjects.map((s) => {
        const entered = bySubject.get(norm(s.subject))?.size || 0;
        return {
          subject: s.subject,
          teacherNames: s.teacherNames,
          entered,
          total: roster.length,
          done: roster.length > 0 && entered >= roster.length,
          isMine: !!mySubjectKey && norm(s.subject) === mySubjectKey
        };
      }),
      studentsTotal: roster.length,
      studentsReleased,
      released: subjects.length > 0 && roster.length > 0 && studentsReleased >= roster.length
    };
  }

  private async summarize(exam: any, ctx: TeacherCtx) {
    const className = String(exam.class_name || '');
    const [teachers, roster] = await Promise.all([
      this.classTeachers(ctx.schoolId, className),
      this.roster(ctx.schoolId, className)
    ]);
    const marks = this.unwrap(await this.db.client.from('report_exam_marks').select('*').eq('exam_id', exam.id));
    const nameById = new Map<string, string>();
    teachers.forEach((t) => nameById.set(String(t.id), t.name));
    return { summary: this.buildSummary(exam, this.classSubjects(teachers), roster, marks, ctx, nameById), roster, marks, teachers };
  }

  // ── teacher: exams ─────────────────────────────────────────────────────

  @Get('teacher/report-cards/exams')
  async listExams(@Req() req: any, @Query('className') className?: string) {
    if (!isTeacher(req?.user?.role)) return { success: false, error: 'Teacher access required', exams: [] };
    try {
      const ctx = await this.teacherCtx(req);
      let q = this.db.client.from('report_exams').select('*');
      if (ctx.schoolId) q = q.eq('school_id', ctx.schoolId);
      const rows = this.unwrap(await q.order('created_at', { ascending: false }));
      const wanted = String(className || '').trim();
      const scoped = rows.filter((r: any) => (wanted && norm(wanted) !== 'all'
        ? norm(r.class_name) === norm(wanted)
        : this.canAccessClass(ctx, r.class_name)));
      const visible = scoped.filter((r: any) => this.canAccessClass(ctx, r.class_name));

      const exams: any[] = [];
      for (const exam of visible) {
        const { summary } = await this.summarize(exam, ctx);
        exams.push(summary);
      }
      return { success: true, exams, mySubject: ctx.subject || null };
    } catch (e) {
      return { ...this.fail(e, 'Unable to load exams.'), exams: [] };
    }
  }

  @Post('teacher/report-cards/exams')
  async createExam(@Req() req: any, @Body() body: any) {
    if (!isTeacher(req?.user?.role)) return { success: false, error: 'Teacher access required' };
    try {
      const ctx = await this.teacherCtx(req);
      const name = String(body?.name || '').trim().replace(/\s+/g, ' ');
      const className = String(body?.className || '').trim();
      const maxMarks = body?.maxMarks === undefined || body?.maxMarks === '' ? 100 : Number(body.maxMarks);
      if (!className) return { success: false, error: 'Select a class first.' };
      if (name.length < 2 || name.length > 60) return { success: false, error: 'Exam name must be 2–60 characters.' };
      if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 1000) {
        return { success: false, error: 'Maximum marks must be a number between 1 and 1000.' };
      }
      if (!this.canAccessClass(ctx, className)) return { success: false, error: 'You are not assigned to this class.' };

      let q = this.db.client.from('report_exams').select('*');
      if (ctx.schoolId) q = q.eq('school_id', ctx.schoolId);
      const existing = this.unwrap(await q).find((r: any) => norm(r.class_name) === norm(className) && norm(r.name) === norm(name));
      if (existing) {
        return {
          success: false,
          error: `"${existing.name}" already exists for ${className}. Open it from the list to add your subject marks.`,
          existingExamId: String(existing.id)
        };
      }

      const row = {
        school_id: ctx.schoolId || null,
        class_name: className,
        name,
        max_marks: maxMarks,
        created_by: ctx.teacherId || null
      };
      const inserted = this.unwrap(await this.db.client.from('report_exams').insert([row]).select());
      const created = inserted[0] || row;
      const { summary } = await this.summarize(created, ctx);
      return { success: true, exam: summary };
    } catch (e) {
      return this.fail(e, 'Unable to create exam.');
    }
  }

  @Patch('teacher/report-cards/exams/:examId')
  async updateExam(@Req() req: any, @Param('examId') examId: string, @Body() body: any) {
    if (!isTeacher(req?.user?.role)) return { success: false, error: 'Teacher access required' };
    try {
      const ctx = await this.teacherCtx(req);
      const exam = await this.loadExam(examId);
      if (!exam || (ctx.schoolId && String(exam.school_id || '') !== ctx.schoolId)) {
        return { success: false, error: 'Exam not found.' };
      }
      if (!exam.created_by || String(exam.created_by) !== ctx.teacherId) {
        return { success: false, error: 'Only the teacher who created this exam can rename it.' };
      }

      const changes: any = {};
      if (body?.name !== undefined) {
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        if (name.length < 2 || name.length > 60) return { success: false, error: 'Exam name must be 2–60 characters.' };
        let q = this.db.client.from('report_exams').select('*');
        if (ctx.schoolId) q = q.eq('school_id', ctx.schoolId);
        const clash = this.unwrap(await q).find((r: any) => String(r.id) !== String(exam.id)
          && norm(r.class_name) === norm(exam.class_name) && norm(r.name) === norm(name));
        if (clash) return { success: false, error: `"${clash.name}" already exists for ${exam.class_name}.` };
        changes.name = name;
      }
      if (body?.maxMarks !== undefined) {
        const maxMarks = Number(body.maxMarks);
        if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 1000) {
          return { success: false, error: 'Maximum marks must be a number between 1 and 1000.' };
        }
        const marks = this.unwrap(await this.db.client.from('report_exam_marks').select('*').eq('exam_id', exam.id));
        const over = marks.find((m: any) => Number(m.marks) > maxMarks);
        if (over) return { success: false, error: `Some students already have marks above ${maxMarks}. Raise the maximum or fix those marks first.` };
        changes.max_marks = maxMarks;
      }
      if (!Object.keys(changes).length) return { success: false, error: 'Nothing to update.' };
      changes.updated_at = new Date().toISOString();

      const res: any = await this.db.client.from('report_exams').update(changes).eq('id', exam.id);
      if (res?.error) throw new Error(res.error.message || String(res.error));
      const { summary } = await this.summarize({ ...exam, ...changes }, ctx);
      return { success: true, exam: summary };
    } catch (e) {
      return this.fail(e, 'Unable to update exam.');
    }
  }

  // ── teacher: marks (own subject only) ──────────────────────────────────

  @Get('teacher/report-cards/exams/:examId/marks')
  async getMarks(@Req() req: any, @Param('examId') examId: string) {
    if (!isTeacher(req?.user?.role)) return { success: false, error: 'Teacher access required' };
    try {
      const ctx = await this.teacherCtx(req);
      const exam = await this.loadExam(examId);
      if (!exam || (ctx.schoolId && String(exam.school_id || '') !== ctx.schoolId) || !this.canAccessClass(ctx, exam.class_name)) {
        return { success: false, error: 'Exam not found.' };
      }
      const { summary, roster, marks } = await this.summarize(exam, ctx);
      const mine = new Map<string, any>();
      marks.filter((m: any) => norm(m.subject) === norm(ctx.subject)).forEach((m: any) => mine.set(String(m.student_id), m));
      const students = roster.map((s) => {
        const m = mine.get(s.id);
        return {
          id: s.id,
          name: s.name,
          marks: m ? Number(m.marks) : null,
          remarks: m?.remarks || '',
          updatedAt: m?.updated_at || null
        };
      });
      const mySubject = summary.subjects.find((s) => s.isMine)?.subject || ctx.subject;
      return {
        success: true,
        exam: summary,
        subject: mySubject || null,
        canEdit: !!ctx.subject && summary.subjects.some((s) => s.isMine),
        students
      };
    } catch (e) {
      return this.fail(e, 'Unable to load marks.');
    }
  }

  @Post('teacher/report-cards/exams/:examId/marks')
  async saveMarks(@Req() req: any, @Param('examId') examId: string, @Body() body: any) {
    if (!isTeacher(req?.user?.role)) return { success: false, error: 'Teacher access required' };
    try {
      const ctx = await this.teacherCtx(req);
      if (!ctx.subject) return { success: false, error: 'Your account has no subject assigned, so you cannot enter marks.' };
      const exam = await this.loadExam(examId);
      if (!exam || (ctx.schoolId && String(exam.school_id || '') !== ctx.schoolId) || !this.canAccessClass(ctx, exam.class_name)) {
        return { success: false, error: 'Exam not found.' };
      }

      const entries = Array.isArray(body?.entries) ? body.entries : [];
      if (!entries.length) return { success: false, error: 'No marks to save.' };

      const className = String(exam.class_name || '');
      const [teachers, roster] = await Promise.all([this.classTeachers(ctx.schoolId, className), this.roster(ctx.schoolId, className)]);
      const subjects = this.classSubjects(teachers);
      // Always store under the class's canonical subject name, and only ever the
      // signed-in teacher's own subject — the client cannot choose it.
      const canonical = subjects.find((s) => norm(s.subject) === norm(ctx.subject));
      if (subjects.length && !canonical) return { success: false, error: `${ctx.subject} is not registered for ${className}.` };
      const subject = canonical?.subject || ctx.subject;

      const rosterIds = new Set(roster.map((s) => s.id));
      const maxMarks = Number(exam.max_marks ?? 100);
      const clean = new Map<string, { marks: number | null; remarks: string }>();
      for (const e of entries) {
        const sid = String(e?.studentId || '').trim();
        if (!rosterIds.has(sid)) return { success: false, error: 'One of the students is not in this class.' };
        const raw = e?.marks;
        const remarks = String(e?.remarks || '').trim().slice(0, 200);
        if (raw === null || raw === undefined || String(raw).trim() === '') {
          clean.set(sid, { marks: null, remarks });
          continue;
        }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > maxMarks) {
          return { success: false, error: `Marks must be between 0 and ${maxMarks}.` };
        }
        clean.set(sid, { marks: round2(n), remarks });
      }

      const existingRows = this.unwrap(await this.db.client.from('report_exam_marks').select('*').eq('exam_id', exam.id))
        .filter((m: any) => norm(m.subject) === norm(subject));
      const existingByStudent = new Map<string, any>();
      existingRows.forEach((m: any) => existingByStudent.set(String(m.student_id), m));

      const now = new Date().toISOString();
      const toInsert: any[] = [];
      let saved = 0;
      let cleared = 0;
      for (const [sid, v] of clean) {
        const current = existingByStudent.get(sid);
        if (v.marks === null) {
          if (current) {
            const res: any = await this.db.client.from('report_exam_marks').delete().eq('id', current.id);
            if (res?.error) throw new Error(res.error.message || String(res.error));
            cleared += 1;
          }
          continue;
        }
        if (current) {
          const res: any = await this.db.client
            .from('report_exam_marks')
            .update({ marks: v.marks, remarks: v.remarks || null, teacher_id: ctx.teacherId || null, updated_at: now })
            .eq('id', current.id);
          if (res?.error) throw new Error(res.error.message || String(res.error));
        } else {
          toInsert.push({
            exam_id: exam.id,
            student_id: sid,
            subject,
            marks: v.marks,
            remarks: v.remarks || null,
            teacher_id: ctx.teacherId || null
          });
        }
        saved += 1;
      }
      if (toInsert.length) this.unwrap(await this.db.client.from('report_exam_marks').insert(toInsert).select());

      const { summary } = await this.summarize(exam, ctx);
      return { success: true, saved, cleared, exam: summary };
    } catch (e) {
      return this.fail(e, 'Unable to save marks.');
    }
  }

  // ── student: released report cards ─────────────────────────────────────

  @Get('progress/report-cards')
  async studentReportCards(@Req() req: any) {
    // Identity always comes from the token, never from a client-supplied id.
    const studentId = String(req?.studentId || '').trim();
    if (!studentId) return { success: false, error: 'Unauthorized', reportCards: [] };
    try {
      const profile = await this.studentAuth.resolveStudentProfile(studentId);
      if (!profile.className) return { success: true, reportCards: [] };

      let q = this.db.client.from('report_exams').select('*');
      if (profile.schoolId) q = q.eq('school_id', profile.schoolId);
      const exams = this.unwrap(await q.order('created_at', { ascending: false }))
        .filter((r: any) => norm(r.class_name) === norm(profile.className));
      if (!exams.length) return { success: true, reportCards: [] };

      const teachers = await this.classTeachers(profile.schoolId, profile.className);
      const subjects = this.classSubjects(teachers);
      if (!subjects.length) return { success: true, reportCards: [] };

      const marks = this.unwrap(
        await this.db.client.from('report_exam_marks').select('*').eq('student_id', studentId).in('exam_id', exams.map((e: any) => e.id))
      );

      const reportCards: any[] = [];
      for (const exam of exams) {
        const mine = marks.filter((m: any) => String(m.exam_id) === String(exam.id));
        const rows = subjects.map((s) => ({ s, m: mine.find((m: any) => norm(m.subject) === norm(s.subject)) }));
        // Held back until every subject teacher has entered this student's marks.
        if (rows.some((r) => !r.m)) continue;

        const maxMarks = Number(exam.max_marks ?? 100);
        const subjectRows = rows.map(({ s, m }) => {
          const value = Number(m.marks);
          const pct = maxMarks > 0 ? round2((value / maxMarks) * 100) : 0;
          return {
            subject: s.subject,
            marks: value,
            maxMarks,
            percentage: pct,
            grade: gradeFor(pct),
            remarks: m.remarks || '',
            teacherName: s.teacherNames[0] || ''
          };
        });
        const total = round2(subjectRows.reduce((sum, r) => sum + r.marks, 0));
        const maxTotal = maxMarks * subjectRows.length;
        const percentage = maxTotal > 0 ? round2((total / maxTotal) * 100) : 0;
        const releasedAt = mine.reduce((latest: string, m: any) => {
          const t = String(m.updated_at || m.created_at || '');
          return t > latest ? t : latest;
        }, '');
        reportCards.push({
          examId: String(exam.id),
          examName: exam.name,
          className: exam.class_name,
          maxMarks,
          subjects: subjectRows,
          total,
          maxTotal,
          percentage,
          grade: gradeFor(percentage),
          releasedAt: releasedAt || null
        });
      }
      return { success: true, reportCards };
    } catch (e) {
      return { ...this.fail(e, 'Unable to load report cards.'), reportCards: [] };
    }
  }
}

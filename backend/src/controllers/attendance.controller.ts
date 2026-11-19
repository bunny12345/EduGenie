import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Logger, Post, Query, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { StudentAuthService } from '../auth/student-auth.service';
import { requireStudentIdentity } from '../auth/student-identity';
import { localDate } from '../notifications/push-time';
import { LearningScoreService } from '../progress/learning-score.service';
import { ProgressPeriod, validateProgressPeriod } from '../progress/school-progress-period';
import { SupabaseService } from '../supabase.service';

type AttendanceRequest = { user?: { sub?: string; role?: string; schoolId?: string } };
type AttendanceRow = { student_id: string; attendance_date: string; present: boolean; class_key: string };
type Entry = { studentId: string; present: boolean };
const table = 'class_attendance';
const classKey = (value: string) => value.trim().toLowerCase();
const schoolToday = () => localDate(Date.now(), 'Asia/Kolkata')!;

@Controller()
@UseGuards(AuthGuard)
export class AttendanceController {
  private readonly logger = new Logger(AttendanceController.name);

  constructor(
    private readonly db: SupabaseService,
    private readonly auth: StudentAuthService,
    private readonly learning: LearningScoreService,
  ) {}

  private async teacher(req: AttendanceRequest, requested?: string) {
    const user = req.user;
    if (user?.role !== 'teacher' || !user.sub || !user.schoolId) throw new ForbiddenException('Teacher access required.');
    const classes = await this.auth.resolveTeacherGrades(user.sub);
    const className = requested === undefined ? classes[0] : classes.find((name) => classKey(name) === classKey(requested));
    if (requested !== undefined && !className) throw new ForbiddenException('Attendance is only available for your assigned classes.');
    const period = await this.learning.getSchoolProgressPeriod(user.schoolId);
    return { teacherId: user.sub, schoolId: user.schoolId, classes, className: className || null, period };
  }

  private validateDate(date: unknown, period: ProgressPeriod | null, today: string) {
    if (!period) throw new BadRequestException('Ask your school admin to set the Progress Graph dates first.');
    const { startDate } = validateProgressPeriod({ startDate: date, endDate: date });
    if (startDate < period.startDate || startDate > period.endDate || startDate > today) {
      throw new BadRequestException('Select a date within the school progress period that is not in the future.');
    }
    return startDate;
  }

  private fail(error: { message?: string }) {
    this.logger.error(error.message || 'Attendance storage error');
    throw new ServiceUnavailableException('Attendance is unavailable right now. Please try again or contact your school.');
  }

  private async readRows(apply: (query: ReturnType<SupabaseService['client']['from']>) => unknown): Promise<AttendanceRow[]> {
    const rows: AttendanceRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const query = this.db.client.from(table).select('student_id,attendance_date,present,class_key');
      apply(query);
      const { data, error } = await query.order('attendance_date', { ascending: false }).order('student_id').order('class_key').range(offset, offset + 499);
      if (error) this.fail(error);
      const page: AttendanceRow[] = data || [];
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }

  private async roster(schoolId: string, className: string) {
    const students = await this.auth.listSchoolProgressStudents(schoolId);
    return students.filter((student) => classKey(student.className) === classKey(className));
  }

  @Get('teacher/attendance')
  async register(@Req() req: AttendanceRequest, @Query('className') className?: string, @Query('date') requestedDate?: string) {
    const ctx = await this.teacher(req, className);
    const today = schoolToday();
    const latest = ctx.period && ctx.period.endDate < today ? ctx.period.endDate : today;
    const date = requestedDate !== undefined ? this.validateDate(requestedDate, ctx.period, today)
      : ctx.period && latest >= ctx.period.startDate ? latest : null;
    const base = { success: true, classes: ctx.classes, className: ctx.className, period: ctx.period, today, date };
    if (!ctx.className || !date) return { ...base, saved: false, students: [] };
    const key = classKey(ctx.className);
    const [roster, rows] = await Promise.all([
      this.roster(ctx.schoolId, ctx.className),
      this.readRows((q) => q.eq('school_id', ctx.schoolId).eq('class_key', key).eq('attendance_date', date)),
    ]);
    const byId = new Map(rows.map((row) => [row.student_id, row.present]));
    return {
      ...base, saved: rows.length > 0,
      students: roster.map(({ id, name }) => ({ id, name, present: byId.get(id) ?? true, recorded: byId.has(id) })),
    };
  }

  @Post('teacher/attendance')
  async save(@Req() req: AttendanceRequest, @Body() body: { className?: string; date?: string; saved?: boolean; entries?: Entry[] }) {
    if (typeof body?.className !== 'string' || typeof body.saved !== 'boolean' || !Array.isArray(body.entries) || !body.entries.length) {
      throw new BadRequestException('Choose a class, date and at least one student.');
    }
    const ctx = await this.teacher(req, body.className);
    const date = this.validateDate(body.date, ctx.period, schoolToday());
    const key = classKey(ctx.className!);
    const roster = await this.roster(ctx.schoolId, ctx.className!);
    const allowed = new Set(roster.map((student) => student.id));
    const entries = new Map<string, boolean>();
    for (const entry of body.entries) {
      if (!entry || typeof entry.studentId !== 'string' || typeof entry.present !== 'boolean' || entries.has(entry.studentId)) {
        throw new BadRequestException('Each student must have one valid attendance mark.');
      }
      if (!allowed.has(entry.studentId)) throw new ForbiddenException('A student is not in this class roster.');
      entries.set(entry.studentId, entry.present);
    }
    const existing = await this.readRows((q) => q.eq('school_id', ctx.schoolId).eq('class_key', key).eq('attendance_date', date));
    if (body.saved !== (existing.length > 0) || (!body.saved && entries.size !== allowed.size)) {
      throw new ConflictException('The register or roster changed. Refresh before saving attendance.');
    }
    const now = new Date().toISOString();
    const rows = [...entries].map(([student_id, present]) => ({
      school_id: ctx.schoolId, class_key: key, attendance_date: date, student_id, present,
      updated_by: ctx.teacherId, updated_at: now,
    }));
    if (this.db.client.isMock) {
      for (const row of rows) {
        const result = existing.some((mark) => mark.student_id === row.student_id)
          ? await this.db.client.from(table).update(row).eq('school_id', row.school_id).eq('class_key', key).eq('attendance_date', date).eq('student_id', row.student_id)
          : await this.db.client.from(table).insert([row]).select();
        if (result.error) this.fail(result.error);
      }
    } else {
      const result = body.saved
        ? await this.db.client.from(table).upsert(rows, { onConflict: 'school_id,class_key,attendance_date,student_id' })
        : await this.db.client.from(table).insert(rows);
      if (result.error?.code === '23505') throw new ConflictException('This register was just saved. Refresh before making corrections.');
      if (result.error) this.fail(result.error);
    }
    return { success: true };
  }

  @Get('progress/attendance')
  async student(@Req() req: AttendanceRequest) {
    const id = requireStudentIdentity(req);
    const profile = await this.auth.resolveStudentProfile(id);
    if (!profile.schoolId) throw new ForbiddenException('Your student account is not linked to a school.');
    const period = await this.learning.getSchoolProgressPeriod(profile.schoolId);
    const today = schoolToday();
    const rows = period ? await this.readRows((q) => q.eq('school_id', profile.schoolId).eq('student_id', id)
      .gte('attendance_date', period.startDate).lte('attendance_date', period.endDate < today ? period.endDate : today)) : [];
    // A transfer can leave two marks on the same day. Prefer the student's current class.
    const days = new Map<string, boolean>();
    for (const row of rows) {
      if (!days.has(row.attendance_date) || row.class_key === classKey(profile.className || '')) days.set(row.attendance_date, row.present);
    }
    const records = [...days].sort(([a], [b]) => b.localeCompare(a)).map(([date, present]) => ({ date, present }));
    const present = records.filter((row) => row.present).length;
    return { success: true, period, recordedDays: records.length, presentDays: present, absentDays: records.length - present,
      percentage: records.length ? Math.round(1000 * present / records.length) / 10 : null, records };
  }
}

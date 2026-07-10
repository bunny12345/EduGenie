import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { StudentAuthService } from '../auth/student-auth.service';
import { LocalFeedService } from '../shared/local-feed.service';

function isTeacher(role: any) {
  const raw = String(role || '').toLowerCase();
  return raw === 'teacher' || raw.includes('teacher') || raw === 'admin';
}

@Controller('teacher')
@UseGuards(AuthGuard)
export class TeacherController {
  constructor(
    private readonly db: SupabaseService,
    private readonly studentAuth: StudentAuthService,
    private readonly localFeed: LocalFeedService
  ) {}

  private sampleStudents() {
    return [
      { id: 'stu-101', name: 'Aarav Sharma', className: 'Class 8', email: 'aarav@example.com' },
      { id: 'stu-102', name: 'Diya Nair', className: 'Class 8', email: 'diya@example.com' },
      { id: 'stu-103', name: 'Rohan Das', className: 'Class 9', email: 'rohan@example.com' }
    ];
  }

  private ensureTeacher(req: any) {
    if (!isTeacher(req?.user?.role)) {
      throw new ForbiddenException('Teacher access required');
    }
  }

  private async ensureStudentAccess(req: any, studentId: string) {
    const scopedStudents = await this.studentAuth.listStudentsByScope({
      teacherId: req?.user?.sub || undefined,
      schoolId: req?.user?.schoolId || undefined
    });
    const scopedRows = Array.isArray(scopedStudents.students) ? scopedStudents.students : [];
    const hasScopedRoster = scopedRows.length > 0;
    const allowed = new Set(scopedRows.map((s: any) => s.id));

    if (hasScopedRoster && !allowed.has(studentId)) {
      throw new ForbiddenException('Student not in teacher scope');
    }

    if (!hasScopedRoster) {
      const sampleIds = new Set(this.sampleStudents().map((student) => student.id));
      if (!sampleIds.has(studentId)) {
        throw new ForbiddenException('Student not in teacher scope');
      }
    }

    return { scopedRows, hasScopedRoster };
  }

  @Get('profile')
  async teacherProfile(@Req() req: any) {
    this.ensureTeacher(req);
    const teacherId = req?.user?.sub || null;
    const schoolId = req?.user?.schoolId || null;

    try {
      const row = teacherId
        ? (await this.db.client.from('teachers').select('*').eq('id', teacherId).single())
        : null;
      const teacher = (row as any)?.data || null;
      const schoolRow = schoolId
        ? (await this.db.client.from('schools').select('name,logo_url').eq('id', schoolId).single())
        : null;
      const school = (schoolRow as any)?.data || null;

      return {
        success: true,
        profile: {
          id: teacher?.id || teacherId || 'teacher-local',
          name: teacher?.name || req?.user?.name || 'Teacher',
          email: teacher?.email || req?.user?.email || null,
          subject: teacher?.subject || req?.user?.subject || 'General',
          schoolId: teacher?.school_id || schoolId || null,
          schoolName: school?.name || null,
          schoolLogo: school?.logo_url || null,
          avatarUrl: teacher?.avatar_url || null,
          joinedAt: teacher?.created_at || null
        }
      };
    } catch (e) {
      return {
        success: true,
        profile: {
          id: teacherId || 'teacher-local',
          name: req?.user?.name || 'Teacher',
          email: req?.user?.email || null,
          subject: req?.user?.subject || 'General',
          schoolId: schoolId || null,
          schoolName: null,
          schoolLogo: null,
          avatarUrl: null,
          joinedAt: null
        }
      };
    }
  }

  @Get('dashboard')
  async dashboard(@Req() req: any) {
    this.ensureTeacher(req);
    try {
      const scopedStudentsRes = await this.studentAuth.listStudentsByScope({
        teacherId: req?.user?.sub || undefined,
        schoolId: req?.user?.schoolId || undefined
      });
      const students = Array.isArray(scopedStudentsRes.students) ? scopedStudentsRes.students : [];
      const studentIds = students.map((s: any) => s.id).filter(Boolean);

      let homeworkRows: any[] = [];
      if (studentIds.length) {
        const homeworkRes = await this.db.client.from('homework').select('*').in('student_id', studentIds).order('created_at', { ascending: false }).limit(500);
        homeworkRows = Array.isArray((homeworkRes as any)?.data) ? (homeworkRes as any).data : [];
      }

      let progressRows: any[] = [];
      if (studentIds.length) {
        const progressRes = await this.db.client.from('progress_metrics').select('*').in('student_id', studentIds).order('date', { ascending: false }).limit(1000);
        progressRows = Array.isArray((progressRes as any)?.data) ? (progressRes as any).data : [];
      }

      const announcementsRes = await this.db.client.from('announcements').select('*').order('created_at', { ascending: false }).limit(20);
      const announcements = Array.isArray((announcementsRes as any)?.data) ? (announcementsRes as any).data : [];

      const inviteRes = await this.studentAuth.listInvitesByScope({
        schoolId: req?.user?.schoolId || undefined,
        teacherId: req?.user?.sub || undefined,
        role: 'student'
      });
      const invites = Array.isArray(inviteRes.invites) ? inviteRes.invites : [];

      const avgScore = progressRows.length
        ? Math.round(progressRows.reduce((acc: number, row: any) => {
            const score = Number(row?.score ?? row?.metric_value ?? row?.value ?? 0);
            return acc + (Number.isFinite(score) ? score : 0);
          }, 0) / progressRows.length)
        : 0;

      const normalizedStudents = students.length
        ? students.map((s: any) => ({
            id: s.id,
            name: s.name || s.full_name || 'Student',
            className: s.class_name || s.grade || 'Class',
            guardian: s.guardian_name || null
          }))
        : this.sampleStudents();

      const mergedAnnouncements = announcements.length ? announcements : this.localFeed.listAnnouncements();
      const mergedHomeworkRows = homeworkRows.length ? homeworkRows : this.localFeed.listHomeworkForStudents(studentIds);

      return {
        success: true,
        summary: {
          studentsCount: normalizedStudents.length,
          activeHomework: mergedHomeworkRows.filter((h: any) => String(h?.status || 'pending') !== 'completed').length,
          avgScore,
          announcementsCount: mergedAnnouncements.length,
          activeInvites: invites.filter((i: any) => i.status === 'active').length
        },
        students: normalizedStudents.slice(0, 6),
        recentAnnouncements: mergedAnnouncements.slice(0, 5).map((a: any) => ({
          id: a.id,
          title: a.title || 'Announcement',
          message: a.message || '',
          createdAt: a.created_at || a.createdAt || null
        })),
        invites: invites.slice(0, 6)
      };
    } catch (e) {
      return {
        success: true,
        summary: {
          studentsCount: this.sampleStudents().length,
          activeHomework: this.localFeed.listHomeworkForStudents(this.sampleStudents().map((s) => s.id)).length,
          avgScore: 0,
          announcementsCount: this.localFeed.listAnnouncements().length,
          activeInvites: 0
        },
        students: this.sampleStudents(),
        recentAnnouncements: this.localFeed.listAnnouncements().slice(0, 5),
        invites: []
      };
    }
  }

  @Get('students')
  async students(@Req() req: any, @Query('q') q?: string, @Query('className') className?: string) {
    this.ensureTeacher(req);
    try {
      const scopeStudents = await this.studentAuth.listStudentsByScope({
        teacherId: req?.user?.sub || undefined,
        schoolId: req?.user?.schoolId || undefined,
        className: className || undefined
      });
      const rows = Array.isArray(scopeStudents.students) ? scopeStudents.students : [];
      const keyword = String(q || '').trim().toLowerCase();
      const classFilter = String(className || '').trim().toLowerCase();
      const filtered = keyword
        ? rows.filter((r: any) => String(r.name || r.full_name || '').toLowerCase().includes(keyword))
        : rows;
      const classFiltered = classFilter
        ? filtered.filter((r: any) => String(r.className || r.class_name || r.grade || '').trim().toLowerCase() === classFilter)
        : filtered;

      const normalized = classFiltered.length
        ? classFiltered.map((s: any) => ({
            id: s.id,
            name: s.name || s.full_name || 'Student',
            className: s.className || s.class_name || s.grade || 'Class',
            email: s.email || null
          }))
        : (classFilter
          ? this.sampleStudents().filter((s) => String(s.className || '').trim().toLowerCase() === classFilter)
          : this.sampleStudents());

      return { success: true, students: normalized };
    } catch (e) {
      const classFilter = String(className || '').trim().toLowerCase();
      const fallback = classFilter
        ? this.sampleStudents().filter((s) => String(s.className || '').trim().toLowerCase() === classFilter)
        : this.sampleStudents();
      return { success: true, students: fallback };
    }
  }

  @Post('students/bulk/class')
  async bulkUpdateStudentClass(@Req() req: any, @Body() body: any) {
    this.ensureTeacher(req);
    const className = String(body?.className || '').trim();
    const studentIdsRaw = Array.isArray(body?.studentIds) ? body.studentIds : [];
    const studentIds: string[] = Array.from(
      new Set(studentIdsRaw.map((id: any) => String(id || '').trim()).filter(Boolean))
    );

    if (!className) {
      return { success: false, updated: 0, studentIds: [], error: 'className is required' };
    }
    if (!studentIds.length) {
      return { success: false, updated: 0, studentIds: [], error: 'studentIds is required' };
    }

    const scopedStudents = await this.studentAuth.listStudentsByScope({
      teacherId: req?.user?.sub || undefined,
      schoolId: req?.user?.schoolId || undefined
    });
    const scopedRows = Array.isArray(scopedStudents.students) ? scopedStudents.students : [];
    const hasScopedRoster = scopedRows.length > 0;
    const allowed = new Set(scopedRows.map((s: any) => String(s.id || '').trim()));
    const effectiveStudentIds = hasScopedRoster
      ? studentIds.filter((id) => allowed.has(id))
      : studentIds;

    if (!effectiveStudentIds.length) {
      return { success: false, updated: 0, studentIds: [], error: 'No valid students in teacher scope' };
    }

    let dbUpdated = 0;
    try {
      const studentsRes = await this.db.client
        .from('students')
        .update({ class_name: className })
        .in('id', effectiveStudentIds)
        .select('id');
      const studentRows = Array.isArray((studentsRes as any)?.data) ? (studentsRes as any).data : [];
      dbUpdated = studentRows.length;

      // Best effort update for account mirror table.
      await this.db.client
        .from('student_accounts')
        .update({ class_name: className })
        .in('student_id', effectiveStudentIds);
    } catch (e) {
      // Continue with local update fallback.
    }

    const localUpdated = this.studentAuth.updateLocalStudentsClass(effectiveStudentIds, className, {
      teacherId: req?.user?.sub || undefined,
      schoolId: req?.user?.schoolId || undefined
    });

    return {
      success: true,
      className,
      updated: Math.max(dbUpdated, localUpdated),
      studentIds: effectiveStudentIds
    };
  }

  @Post('students/register')
  async registerStudent(@Req() req: any, @Body() body: any) {
    this.ensureTeacher(req);
    const res = await this.studentAuth.registerByTeacher({
      loginId: body?.loginId,
      password: body?.password,
      name: body?.name,
      className: body?.className,
      studentId: body?.studentId,
      createdBy: req?.user?.sub || null,
      teacherId: req?.user?.sub || null,
      schoolId: req?.user?.schoolId || body?.schoolId || null
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, student: res.student };
  }

  @Post('invites/student')
  async createStudentInvite(@Req() req: any, @Body() body: any) {
    this.ensureTeacher(req);
    const schoolId = req?.user?.schoolId || body?.schoolId || 'school-local';
    const createdBy = req?.user?.sub || 'teacher-local';
    const inv = await this.studentAuth.createInvite({
      role: 'student',
      schoolId,
      teacherId: createdBy,
      createdBy,
      expiresHours: body?.expiresHours || 72
    });
    if (!inv.ok) return { success: false, error: (inv as any).error || 'Could not create invite' };
    return { success: true, invite: (inv as any).invite };
  }

  @Get('invites/student')
  async studentInvites(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('status') status?: 'all' | 'active' | 'used' | 'revoked' | 'expired',
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    this.ensureTeacher(req);
    const schoolId = req?.user?.schoolId || 'school-local';
    const teacherId = req?.user?.sub || 'teacher-local';
    const res = await this.studentAuth.listInvitesByScope({
      schoolId,
      teacherId,
      role: 'student',
      q,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
    return { success: true, invites: res.invites || [], pagination: res.pagination || null };
  }

  @Post('invites/student/:token/revoke')
  async revokeStudentInvite(@Req() req: any, @Param('token') token: string) {
    this.ensureTeacher(req);
    const schoolId = req?.user?.schoolId || 'school-local';
    const teacherId = req?.user?.sub || 'teacher-local';
    const inviteRes = await this.studentAuth.listInvitesByScope({ schoolId, teacherId, role: 'student' });
    const found = (inviteRes.invites || []).find((i: any) => i.token === token);
    if (!found) return { success: false, error: 'Invite not found in teacher scope' };

    const revoked = await this.studentAuth.revokeInvite(token, teacherId);
    if (!revoked.ok) return { success: false, error: (revoked as any).error || 'Could not revoke invite' };
    return { success: true, invite: (revoked as any).invite };
  }

  @Post('invites/student/:token/resend')
  async resendStudentInvite(@Req() req: any, @Param('token') token: string, @Body() body: any) {
    this.ensureTeacher(req);
    const schoolId = req?.user?.schoolId || 'school-local';
    const teacherId = req?.user?.sub || 'teacher-local';
    const inviteRes = await this.studentAuth.listInvitesByScope({ schoolId, teacherId, role: 'student' });
    const found = (inviteRes.invites || []).find((i: any) => i.token === token);
    if (!found) return { success: false, error: 'Invite not found in teacher scope' };

    const resent = await this.studentAuth.resendInvite(token, teacherId, body?.expiresHours || 72);
    if (!resent.ok) return { success: false, error: (resent as any).error || 'Could not resend invite' };
    return { success: true, invite: (resent as any).invite };
  }

  @Get('students/:id/progress')
  async studentProgress(@Req() req: any, @Param('id') studentId: string) {
    this.ensureTeacher(req);
    await this.ensureStudentAccess(req, studentId);
    try {
      const res = await this.db.client
        .from('progress_metrics')
        .select('*')
        .eq('student_id', studentId)
        .order('date', { ascending: false })
        .limit(50);
      const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];

      const bySubject = new Map<string, { sum: number; count: number }>();
      rows.forEach((r: any) => {
        const subject = r.subject || r.metric_key || 'General';
        const score = Number(r?.score ?? r?.metric_value ?? r?.value ?? 0);
        if (!Number.isFinite(score)) return;
        const prev = bySubject.get(subject) || { sum: 0, count: 0 };
        prev.sum += score;
        prev.count += 1;
        bySubject.set(subject, prev);
      });

      const subjectScores = Array.from(bySubject.entries()).map(([subject, v]) => ({
        subject,
        avgScore: Math.round(v.sum / Math.max(v.count, 1))
      }));

      if (!subjectScores.length) {
        return {
          success: true,
          studentId,
          subjectScores: [
            { subject: 'Mathematics', avgScore: 78 },
            { subject: 'Science', avgScore: 81 },
            { subject: 'English', avgScore: 74 }
          ],
          timeline: [
            { date: new Date().toISOString(), subject: 'Mathematics', score: 78 },
            { date: new Date(Date.now() - 86400000).toISOString(), subject: 'Science', score: 82 },
            { date: new Date(Date.now() - 172800000).toISOString(), subject: 'English', score: 74 }
          ]
        };
      }

      return {
        success: true,
        studentId,
        subjectScores,
        timeline: rows.slice(0, 10).map((r: any) => ({
          date: r.date || r.created_at || null,
          subject: r.subject || r.metric_key || 'General',
          score: Number(r?.score ?? r?.metric_value ?? r?.value ?? 0) || 0
        }))
      };
    } catch (e) {
      return {
        success: false,
        error: String((e as any)?.message || e || 'student progress failed'),
        studentId,
        subjectScores: [
          { subject: 'Mathematics', avgScore: 76 },
          { subject: 'Science', avgScore: 80 },
          { subject: 'English', avgScore: 73 }
        ],
        timeline: []
      };
    }
  }

  @Get('students/:id/delivery-status')
  async studentDeliveryStatus(@Req() req: any, @Param('id') studentId: string) {
    this.ensureTeacher(req);
    await this.ensureStudentAccess(req, studentId);

    try {
      const [homeworkRes, announcementsRes, testsRes, eventsRes, rewardsRes] = await Promise.all([
        this.db.client.from('homework').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(100),
        this.db.client.from('announcements').select('*').in('audience', ['students', 'all']).order('created_at', { ascending: false }).limit(100),
        this.db.client.from('tests').select('*').order('created_at', { ascending: false }).limit(100),
        this.db.client.from('events').select('*').eq('student_id', studentId).order('start', { ascending: true }).limit(100),
        this.db.client.from('student_rewards').select('*').eq('student_id', studentId).limit(20)
      ]);

      const mergeById = (dbRows: any[], localRows: any[]) => {
        const merged = new Map<string, any>();
        [...(Array.isArray(dbRows) ? dbRows : []), ...(Array.isArray(localRows) ? localRows : [])].forEach((row: any, idx: number) => {
          const id = String(row?.id || `${idx}`).trim();
          if (!merged.has(id)) merged.set(id, row);
        });
        return Array.from(merged.values());
      };

      const homeworkRows = mergeById((homeworkRes as any)?.data || [], this.localFeed.listHomeworkForStudent(studentId));
      const announcementRows = mergeById((announcementsRes as any)?.data || [], this.localFeed.listAnnouncements());
      const testRows = mergeById((testsRes as any)?.data || [], this.localFeed.listTests());
      const eventRows = mergeById((eventsRes as any)?.data || [], this.localFeed.listEventsForStudent(studentId));
      const rewardRows = Array.isArray((rewardsRes as any)?.data) ? (rewardsRes as any).data : [];
      const rewardFallback = this.localFeed.getRewards(studentId);
      const rewardHead = rewardRows[0] || null;

      return {
        success: true,
        studentId,
        status: {
          announcementsAvailable: announcementRows.length,
          homeworkAssigned: homeworkRows.length,
          homeworkPending: homeworkRows.filter((h: any) => String(h?.status || 'pending') !== 'completed').length,
          testsAvailable: testRows.filter((t: any) => String(t?.status || 'upcoming') !== 'completed').length,
          eventsScheduled: eventRows.length,
          rewardCoins: Math.max(Number(rewardHead?.coins || 0), Number(rewardFallback.coins || 0)),
          recentAnnouncementTitle: announcementRows[0]?.title || null,
          recentHomeworkTitle: homeworkRows[0]?.title || null,
          recentTestTitle: testRows[0]?.title || null,
          nextEventTitle: eventRows[0]?.title || null
        }
      };
    } catch (e) {
      const homeworkRows = this.localFeed.listHomeworkForStudent(studentId);
      const announcementRows = this.localFeed.listAnnouncements();
      const testRows = this.localFeed.listTests();
      const eventRows = this.localFeed.listEventsForStudent(studentId);
      const rewardFallback = this.localFeed.getRewards(studentId);
      return {
        success: true,
        studentId,
        error: String((e as any)?.message || e || 'delivery status failed'),
        status: {
          announcementsAvailable: announcementRows.length,
          homeworkAssigned: homeworkRows.length,
          homeworkPending: homeworkRows.filter((h: any) => String(h?.status || 'pending') !== 'completed').length,
          testsAvailable: testRows.filter((t: any) => String(t?.status || 'upcoming') !== 'completed').length,
          eventsScheduled: eventRows.length,
          rewardCoins: Number(rewardFallback.coins || 0),
          recentAnnouncementTitle: announcementRows[0]?.title || null,
          recentHomeworkTitle: homeworkRows[0]?.title || null,
          recentTestTitle: testRows[0]?.title || null,
          nextEventTitle: eventRows[0]?.title || null
        }
      };
    }
  }

  @Get('students/:id/activity')
  async studentActivity(@Req() req: any, @Param('id') studentId: string) {
    this.ensureTeacher(req);
    await this.ensureStudentAccess(req, studentId);

    return {
      success: true,
      studentId,
      activity: this.localFeed.listStudentActivity(studentId).slice(0, 20)
    };
  }

  @Get('students/:id/homework')
  async studentHomework(@Req() req: any, @Param('id') studentId: string) {
    this.ensureTeacher(req);
    await this.ensureStudentAccess(req, studentId);

    try {
      const [hwRes, attRes] = await Promise.all([
        this.db.client.from('homework').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(50),
        this.db.client.from('homework_attempts').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(100)
      ]);

      const hwRows: any[] = Array.isArray((hwRes as any)?.data) && (hwRes as any).data.length
        ? (hwRes as any).data
        : this.localFeed.listHomeworkForStudent(studentId);

      const attempts: any[] = Array.isArray((attRes as any)?.data) ? (attRes as any).data : [];
      const attemptsByHw = new Map<string, any[]>();
      attempts.forEach((a: any) => {
        const key = String(a.homework_id || '');
        if (!attemptsByHw.has(key)) attemptsByHw.set(key, []);
        attemptsByHw.get(key)!.push(a);
      });

      const homework = hwRows.map((h: any) => {
        const hwAttempts = attemptsByHw.get(String(h.id || '')) || [];
        const latest = hwAttempts[0] || null;
        const status = h.status || (latest ? 'submitted' : 'pending');
        return {
          id: h.id,
          title: h.title || 'Homework',
          subject: h.subject || 'General',
          note: h.note || null,
          startAt: h.start_at || null,
          dueAt: h.due_at || null,
          status,
          grade: latest?.score ?? h.grade ?? null,
          submittedAt: latest?.created_at || null,
          attemptCount: hwAttempts.length,
          createdAt: h.created_at || null
        };
      });

      return { success: true, studentId, homework };
    } catch (e) {
      const localHw = this.localFeed.listHomeworkForStudent(studentId);
      return {
        success: true,
        studentId,
        homework: localHw.map((h: any) => ({
          id: h.id,
          title: h.title || 'Homework',
          subject: h.subject || 'General',
          note: h.note || null,
          startAt: h.start_at || null,
          dueAt: h.due_at || null,
          status: h.status || 'pending',
          grade: null,
          submittedAt: null,
          attemptCount: 0,
          createdAt: h.created_at || null
        }))
      };
    }
  }

  @Get('students/:id/test-attempts')
  async studentTestAttempts(@Req() req: any, @Param('id') studentId: string) {
    this.ensureTeacher(req);
    await this.ensureStudentAccess(req, studentId);

    try {
      const [attRes, testsRes] = await Promise.all([
        this.db.client.from('test_attempts').select('*').eq('student_id', studentId).order('started_at', { ascending: false }).limit(50),
        this.db.client.from('tests').select('id,title,subject,class_name,duration_minutes').limit(200)
      ]);

      const attempts: any[] = Array.isArray((attRes as any)?.data) ? (attRes as any).data : [];
      const testsMap = new Map<string, any>();
      (Array.isArray((testsRes as any)?.data) ? (testsRes as any).data : this.localFeed.listTests())
        .forEach((t: any) => testsMap.set(String(t.id), t));

      const localAttempts = this.localFeed.listStudentActivity(studentId)
        .filter((a: any) => a.type === 'test')
        .map((a: any, idx: number) => ({
          id: a.id || `local-${idx}`,
          test_id: a.meta?.testId || null,
          started_at: a.createdAt || null,
          submitted_at: a.meta?.submittedAt || null,
          score: a.meta?.score ?? null,
          status: a.action === 'submitted' ? 'completed' : 'started'
        }));

      const merged = attempts.length ? attempts : localAttempts;

      const result = merged.map((a: any) => {
        const test = testsMap.get(String(a.test_id || '')) || null;
        return {
          id: a.id,
          testId: a.test_id || null,
          testTitle: test?.title || a.test_title || 'Test',
          subject: test?.subject || 'General',
          startedAt: a.started_at || null,
          submittedAt: a.submitted_at || a.completed_at || null,
          score: a.score ?? null,
          maxScore: a.max_score ?? null,
          status: a.status || (a.submitted_at ? 'completed' : 'in-progress'),
          durationMinutes: test?.duration_minutes || null
        };
      });

      return { success: true, studentId, attempts: result };
    } catch (e) {
      return { success: true, studentId, attempts: [] };
    }
  }

  @Post('homework/:hwId/grade')
  async gradeHomework(@Req() req: any, @Param('hwId') hwId: string, @Body() body: any) {
    this.ensureTeacher(req);
    const status = body?.status || 'graded';
    const grade = body?.grade ?? null;
    const feedback = body?.feedback || null;

    const validStatuses = ['pending', 'submitted', 'graded', 'completed'];
    const safeStatus = validStatuses.includes(status) ? status : 'graded';

    try {
      const update: any = { status: safeStatus, updated_at: new Date().toISOString() };
      if (grade !== null) update.grade = grade;
      if (feedback) update.feedback = feedback;

      await this.db.client.from('homework').update(update).eq('id', hwId);
      return { success: true, homeworkId: hwId, status: safeStatus, grade, feedback };
    } catch (e) {
      return { success: true, homeworkId: hwId, status: safeStatus, grade, feedback };
    }
  }

  @Get('homework')
  async listTeacherHomework(@Req() req: any) {
    this.ensureTeacher(req);
    const teacherId = req?.user?.sub || null;
    try {
      const res = await this.db.client
        .from('homework')
        .select('*')
        .eq('created_by', teacherId)
        .order('created_at', { ascending: false })
        .limit(200);
      const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];
      const assignments = rows.map((h: any) => ({
        id: h.id,
        title: h.title,
        subject: h.subject,
        note: h.note || null,
        startAt: h.start_at || null,
        dueAt: h.due_at || null,
        className: h.class_name || null,
        createdAt: h.created_at || null,
      }));
      return { success: true, assignments };
    } catch (e) {
      // Fall back to local feed — filter by created_by
      const allHw = this.localFeed.listHomeworkByTeacher(teacherId);
      return {
        success: true,
        assignments: allHw.map((h: any) => ({
          id: h.id,
          title: h.title,
          subject: h.subject,
          note: h.note || null,
          startAt: h.start_at || null,
          dueAt: h.due_at || null,
          className: h.class_name || null,
          createdAt: h.created_at || null,
        }))
      };
    }
  }

  @Post('homework/assign')
  async assignHomework(@Req() req: any, @Body() body: any) {
    this.ensureTeacher(req);
    const subject = body?.subject || 'General';
    const title = body?.title || 'Homework';
    const dueAt = body?.dueAt || null;
    const targetClass: string | null = body?.className || null;
    const studentIds = Array.isArray(body?.studentIds) ? body.studentIds : [];

    let effectiveStudentIds: string[];

    if (targetClass) {
      // Resolve all students in the given class
      const classStudents = await this.studentAuth.listStudentsByScope({
        teacherId: req?.user?.sub || undefined,
        schoolId: req?.user?.schoolId || undefined,
        className: targetClass
      });
      effectiveStudentIds = (classStudents.students || []).map((s: any) => s.id);
      if (!effectiveStudentIds.length) {
        return { success: false, created: 0, assignments: [], error: `No students found in class "${targetClass}"` };
      }
    } else {
      if (!studentIds.length) {
        return { success: false, created: 0, assignments: [], error: 'Provide either className or studentIds' };
      }
      const scopedStudents = await this.studentAuth.listStudentsByScope({
        teacherId: req?.user?.sub || undefined,
        schoolId: req?.user?.schoolId || undefined
      });
      const allowed = new Set((scopedStudents.students || []).map((s: any) => s.id));
      const filteredStudentIds = studentIds.filter((id: string) => allowed.has(id));
      const hasScopedRoster = Array.isArray(scopedStudents.students) && scopedStudents.students.length > 0;
      effectiveStudentIds = filteredStudentIds.length
        ? filteredStudentIds
        : (!hasScopedRoster ? studentIds : []);
      if (!effectiveStudentIds.length) {
        return { success: false, created: 0, assignments: [], error: 'No valid students in teacher scope' };
      }
    }

    const note = body?.note || null;
    const startAt = body?.startAt || null;
    const className = body?.className || targetClass || null;

    const rows = effectiveStudentIds.map((studentId: string) => ({
      student_id: studentId,
      subject,
      title,
      note,
      start_at: startAt,
      due_at: dueAt,
      class_name: className,
      status: 'pending',
      tasks: body?.tasks || null,
      created_by: req?.user?.sub || null
    }));

    try {
      const res = await this.db.client.from('homework').insert(rows).select();
      const inserted = Array.isArray((res as any)?.data) ? (res as any).data : rows;
      this.localFeed.addHomework(inserted);
      return {
        success: true,
        created: inserted.length,
        assignments: inserted.map((h: any) => ({
          id: h.id,
          studentId: h.student_id,
          subject: h.subject,
          title: h.title,
          note: h.note || null,
          startAt: h.start_at || null,
          dueAt: h.due_at || null,
          className: h.class_name || null,
          createdAt: h.created_at || new Date().toISOString()
        }))
      };
    } catch (e) {
      const inserted = rows.map((r: any, idx: number) => ({ ...r, id: `local-hw-${Date.now()}-${idx}`, created_at: new Date().toISOString() }));
      this.localFeed.addHomework(inserted);
      return {
        success: true,
        created: inserted.length,
        assignments: inserted.map((h: any) => ({
          id: h.id,
          studentId: h.student_id,
          subject: h.subject,
          title: h.title,
          note: h.note || null,
          startAt: h.start_at || null,
          dueAt: h.due_at || null,
          className: h.class_name || null,
          createdAt: h.created_at || new Date().toISOString()
        }))
      };
    }
  }

  @Get('announcements')
  async listAnnouncements(@Req() req: any) {
    this.ensureTeacher(req);
    try {
      const res = await this.db.client.from('announcements').select('*').order('created_at', { ascending: false }).limit(100);
      const rows = Array.isArray((res as any)?.data) ? (res as any).data : [];
      const normalized = rows.map((a: any) => ({
        id: a.id,
        title: a.title || 'Announcement',
        message: a.message || '',
        audience: a.audience || 'students',
        createdAt: a.created_at || null
      }));
      return { success: true, announcements: normalized.length ? normalized : this.localFeed.listAnnouncements() };
    } catch (e) {
      return { success: true, announcements: this.localFeed.listAnnouncements() };
    }
  }

  @Post('announcements')
  async postAnnouncement(@Req() req: any, @Body() body: any) {
    this.ensureTeacher(req);
    const targetClass: string | null = body?.className || null;
    const row = {
      title: body?.title || 'Announcement',
      message: body?.message || '',
      audience: targetClass ? `class:${targetClass}` : (body?.audience || 'students'),
      target_class: targetClass,
      created_by: req?.user?.sub || null,
      created_at: new Date().toISOString()
    };
    try {
      const res = await this.db.client.from('announcements').insert([row]).select();
      const inserted = (res as any)?.data?.[0] || row;
      this.localFeed.addAnnouncements([
        {
          id: inserted.id || null,
          title: inserted.title,
          message: inserted.message,
          audience: inserted.audience,
          createdAt: inserted.created_at || row.created_at
        }
      ]);
      return {
        success: true,
        announcement: {
          id: inserted.id || null,
          title: inserted.title,
          message: inserted.message,
          audience: inserted.audience,
          createdAt: inserted.created_at || row.created_at
        }
      };
    } catch (e) {
      const local = {
        id: `local-ann-${Date.now()}`,
        title: row.title,
        message: row.message,
        audience: row.audience,
        createdAt: row.created_at
      };
      this.localFeed.addAnnouncements([local]);
      return {
        success: false,
        error: String((e as any)?.message || e || 'announcement post failed'),
        announcement: local
      };
    }
  }

  @Post('ai/assist')
  async teacherAi(@Req() req: any, @Body() body: any) {
    this.ensureTeacher(req);
    const prompt = String(body?.prompt || '').trim();
    if (!prompt) return { success: false, error: 'Please enter a prompt.', reply: 'Please enter a prompt.' };

    return {
      success: true,
      reply: `Teaching assistant suggestion: For "${prompt}", start with a 5-minute recap, then assign one easy, one medium, and one challenge question.`,
      tips: [
        'Share one real-world example to increase engagement.',
        'Use mixed-ability grouping for peer learning.',
        'Close with an exit ticket to measure understanding.'
      ]
    };
  }
}

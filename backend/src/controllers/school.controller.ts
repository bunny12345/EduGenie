import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { normalizeProfileFields, StudentAuthService } from '../auth/student-auth.service';
import { LearningScoreService } from '../progress/learning-score.service';
import { RegistrationPhoneService } from '../auth/registration-phone.service';
import { RegistrationEmailService } from '../auth/registration-email.service';

function isSchoolAdmin(role: any) {
  const raw = String(role || '').toLowerCase();
  return raw === 'school_admin' || raw === 'admin';
}

@Controller('school')
@UseGuards(AuthGuard)
export class SchoolController {
  constructor(
    private readonly authFlow: StudentAuthService,
    private readonly learningScore: LearningScoreService,
    private readonly registrationPhone: RegistrationPhoneService,
    private readonly registrationEmail: RegistrationEmailService
  ) {}

  private ensureSchoolAdmin(req: any) {
    if (!isSchoolAdmin(req?.user?.role)) {
      throw new ForbiddenException('School admin access required');
    }
  }

  private async registrationContact(req: any, role: 'teacher' | 'student', body: any) {
    const scope = { schoolId: req.user.schoolId || req.user.sub, actorId: req.user.sub };
    const phone = this.registrationPhone.normalize(scope, role, body);
    const email = this.registrationEmail.normalizeEmail(body?.email, role === 'teacher');
    if (body?.emailVerificationId) {
      await this.registrationEmail.consume(scope, role, body);
    } else if (body?.phoneVerificationId) {
      await this.registrationPhone.consume(scope, role, body);
    } else {
      throw new BadRequestException('Verify either the mobile number or email address before registering.');
    }
    return { phone, email };
  }

  private async contactScope(req: any, body: any) {
    const scope = { schoolId: req.user.schoolId || req.user.sub, actorId: req.user.sub };
    if (body?.role !== 'teacher' && body?.role !== 'student') throw new BadRequestException('Select teacher or student verification.');
    if (body?.accountId === undefined) return scope;
    if (typeof body.accountId !== 'string' || !body.accountId || (body.role !== 'teacher' && body.role !== 'student')) {
      throw new BadRequestException('Select a valid account to edit.');
    }
    await this.authFlow.schoolAccountContact(scope.schoolId, body.role, body.accountId);
    return { ...scope, actorId: JSON.stringify([scope.actorId, 'profile', body.role, body.accountId]), rateLimitActorId: scope.actorId };
  }

  private async changedContacts(req: any, role: 'teacher' | 'student', id: string, body: any) {
    const schoolId = req.user.schoolId || req.user.sub;
    const existing = await this.authFlow.schoolAccountContact(schoolId, role, id);
    const scope = { schoolId, actorId: JSON.stringify([req.user.sub, 'profile', role, id]) };
    const phone = body?.phone === undefined ? undefined : this.registrationPhone.normalize(scope, role, body);
    const email = body?.email === undefined ? undefined : this.registrationEmail.normalizeEmail(body.email);
    const profile = normalizeProfileFields({ ...body, phone, email });
    if (phone !== undefined && phone !== existing.phone) {
      await this.registrationPhone.consume(scope, role, { ...body, phone });
    }
    if (email !== undefined && email !== existing.email.trim().toLowerCase()) {
      await this.registrationEmail.consume(scope, role, { ...body, email });
    }
    return profile;
  }

  @Get('dashboard')
  async dashboard(@Req() req: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const teachersRes = await this.authFlow.listTeachersBySchool(schoolId);
    const studentsRes = await this.authFlow.listStudentsByScope({ schoolId });
    const invitesRes = await this.authFlow.listInvitesByScope({ schoolId, role: 'teacher' });
    const activeInvites = (invitesRes.invites || []).filter((i: any) => i.status === 'active').length;

    return {
      success: true,
      schoolId,
      summary: {
        teachers: (teachersRes.teachers || []).length,
        students: (studentsRes.students || []).length,
        activeInvites
      },
      teachers: (teachersRes.teachers || []).slice(0, 8),
      invites: (invitesRes.invites || []).slice(0, 8),
      students: (studentsRes.students || []).slice(0, 8)
    };
  }

  @Get('teachers')
  async teachers(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('className') className?: string
  ) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const teachersRes = await this.authFlow.listTeachersBySchool(schoolId, {
      q,
      className: className || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
    return {
      success: true,
      teachers: teachersRes.teachers || [],
      pagination: teachersRes.pagination || null
    };
  }

  @Get('invites')
  async invites(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('status') status?: 'all' | 'active' | 'used' | 'revoked' | 'expired',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role') role?: string
  ) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    // Teacher invites stay the default so existing callers are unaffected; the
    // school's student registration page asks for role=student.
    const scopedRole = String(role || '').trim().toLowerCase() === 'student' ? 'student' : 'teacher';
    const invitesRes = await this.authFlow.listInvitesByScope({
      schoolId,
      role: scopedRole,
      q,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
    return { success: true, invites: invitesRes.invites || [], pagination: invitesRes.pagination || null };
  }

  @Get('students')
  async students(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('className') className?: string
  ) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const studentsRes = await this.authFlow.listStudentsByScope({
      schoolId,
      q,
      className: className || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
    return {
      success: true,
      students: studentsRes.students || [],
      pagination: studentsRes.pagination || null
    };
  }

  @Get('progress/students')
  async progressStudents(@Req() req: any) {
    const schoolId = this.authFlow.schoolAdminSchoolId(req?.user);
    const students = await this.authFlow.listSchoolProgressStudents(schoolId);
    const classes = Array.from(new Set(students.map((s) => s.className).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { success: true, students, classes };
  }

  @Get('progress/period')
  async progressPeriod(@Req() req: any) {
    const schoolId = this.authFlow.schoolAdminSchoolId(req?.user);
    return { success: true, period: await this.learningScore.getSchoolProgressPeriod(schoolId) };
  }

  @Patch('progress/period')
  async saveProgressPeriod(@Req() req: any, @Body() body: unknown) {
    const schoolId = this.authFlow.schoolAdminSchoolId(req?.user);
    return { success: true, period: await this.learningScore.saveSchoolProgressPeriod(schoolId, body) };
  }

  @Get('students/:id/learning-score')
  async studentLearningScore(@Req() req: any, @Param('id') studentId: string) {
    const profile = await this.authFlow.resolveSchoolStudentProfile(req?.user, studentId);
    const data = await this.learningScore.getLearningScore(profile.id);
    return { ...data, studentId: profile.id };
  }

  @Post('students/register')
  async registerStudent(@Req() req: any, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const dob = body?.dateOfBirth;
    const date = typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T00:00:00Z`) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dob
      || dob > new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException('A valid date of birth is required and cannot be in the future.');
    }
    const { phone, email } = await this.registrationContact(req, 'student', body);
    const res = await this.authFlow.registerStudentBySchool({
      schoolId,
      name: body?.name,
      className: body?.className,
      loginId: body?.loginId,
      password: body?.password,
      gender: body?.gender || null,
      dateOfBirth: body?.dateOfBirth || null,
      phone,
      email,
      createdBy: req?.user?.sub || null
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, student: res.student };
  }

  @Patch('students/:id')
  async updateStudent(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const contact = await this.changedContacts(req, 'student', id, body);
    const res = await this.authFlow.updateStudentBySchool({
      schoolId,
      studentId: id,
      name: body?.name,
      className: body?.className,
      ...contact
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, student: res.student };
  }

  @Post('students/:id/reset-password')
  async resetStudentPassword(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const res = await this.authFlow.resetStudentPassword({
      schoolId,
      studentId: id,
      password: body?.password
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, student: res.student };
  }

  @Delete('students/:id')
  async deleteStudent(@Req() req: any, @Param('id') id: string) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const res = await this.authFlow.deleteStudentBySchool({ schoolId, studentId: id });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, student: res.student };
  }

  @Post('invites/student')
  async inviteStudent(@Req() req: any, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const inv = await this.authFlow.createInvite({
      role: 'student',
      schoolId,
      createdBy: req?.user?.sub || 'school-admin',
      expiresHours: body?.expiresHours || 72
    });
    if (!inv.ok) return { success: false, error: (inv as any).error || 'Could not create invite' };
    return { success: true, invite: (inv as any).invite };
  }

  @Post('invites/student/:token/revoke')
  async revokeStudentInvite(@Req() req: any, @Param('token') token: string) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const inviteRes = await this.authFlow.listInvitesByScope({ schoolId, role: 'student' });
    const found = (inviteRes.invites || []).find((i: any) => i.token === token);
    if (!found) return { success: false, error: 'Invite not found in school scope' };

    const revoked = await this.authFlow.revokeInvite(token, req?.user?.sub || 'school-admin');
    if (!revoked.ok) return { success: false, error: (revoked as any).error || 'Could not revoke invite' };
    return { success: true, invite: (revoked as any).invite };
  }

  @Post('invites/student/:token/resend')
  async resendStudentInvite(@Req() req: any, @Param('token') token: string, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const inviteRes = await this.authFlow.listInvitesByScope({ schoolId, role: 'student' });
    const found = (inviteRes.invites || []).find((i: any) => i.token === token);
    if (!found) return { success: false, error: 'Invite not found in school scope' };

    const resent = await this.authFlow.resendInvite(token, req?.user?.sub || 'school-admin', body?.expiresHours || 72);
    if (!resent.ok) return { success: false, error: (resent as any).error || 'Could not resend invite' };
    return { success: true, invite: (resent as any).invite };
  }

  @Post('teachers/register')
  async registerTeacher(@Req() req: any, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const { phone, email } = await this.registrationContact(req, 'teacher', body);
    const res = await this.authFlow.registerTeacherBySchool({
      schoolId,
      name: body?.name,
      email,
      subject: body?.subject,
      loginId: body?.loginId,
      password: body?.password,
      gender: body?.gender || null,
      phone,
      grades: body?.grades,
      createdBy: req?.user?.sub || null
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, teacher: res.teacher };
  }

  @Post('registration/phone/request')
  async requestRegistrationPhone(@Req() req: any, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    return this.registrationPhone.request(await this.contactScope(req, body), body);
  }

  @Post('registration/phone/verify')
  async verifyRegistrationPhone(@Req() req: any, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    return this.registrationPhone.verify(await this.contactScope(req, body), body);
  }

  @Post('registration/email/request')
  async requestRegistrationEmail(@Req() req: any, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    return this.registrationEmail.request(await this.contactScope(req, body), body);
  }

  @Post('registration/email/verify')
  async verifyRegistrationEmail(@Req() req: any, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    return this.registrationEmail.verify(await this.contactScope(req, body), body);
  }

  @Patch('teachers/:id')
  async updateTeacher(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const contact = await this.changedContacts(req, 'teacher', id, body);
    const res = await this.authFlow.updateTeacherBySchool({
      schoolId,
      teacherId: id,
      name: body?.name,
      ...contact,
      subject: body?.subject,
      grades: body?.grades
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, teacher: res.teacher };
  }

  @Post('teachers/:id/reset-password')
  async resetTeacherPassword(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const res = await this.authFlow.resetTeacherPassword({
      schoolId,
      teacherId: id,
      password: body?.password
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, teacher: res.teacher };
  }

  @Delete('teachers/:id')
  async deleteTeacher(@Req() req: any, @Param('id') id: string) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const res = await this.authFlow.deleteTeacherBySchool({ schoolId, teacherId: id });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, teacher: res.teacher };
  }

  @Post('teachers/deduplicate')
  async deduplicateTeachers(@Req() req: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const result = await this.authFlow.deduplicateTeacherSubjects(schoolId);
    return { success: true, removed: result.removed };
  }

  @Post('invites/teacher')
  async inviteTeacher(@Req() req: any, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const createdBy = req?.user?.sub || 'school-admin';
    const inv = await this.authFlow.createInvite({
      role: 'teacher',
      schoolId,
      createdBy,
      expiresHours: body?.expiresHours || 72
    });
    if (!inv.ok) return { success: false, error: (inv as any).error || 'Could not create invite' };
    return { success: true, invite: (inv as any).invite };
  }

  @Post('invites/teacher/:token/revoke')
  async revokeTeacherInvite(@Req() req: any, @Param('token') token: string) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const inviteRes = await this.authFlow.listInvitesByScope({ schoolId, role: 'teacher' });
    const found = (inviteRes.invites || []).find((i: any) => i.token === token);
    if (!found) return { success: false, error: 'Invite not found in school scope' };

    const revoked = await this.authFlow.revokeInvite(token, req?.user?.sub || 'school-admin');
    if (!revoked.ok) return { success: false, error: (revoked as any).error || 'Could not revoke invite' };
    return { success: true, invite: (revoked as any).invite };
  }

  @Post('invites/teacher/:token/resend')
  async resendTeacherInvite(@Req() req: any, @Param('token') token: string, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const inviteRes = await this.authFlow.listInvitesByScope({ schoolId, role: 'teacher' });
    const found = (inviteRes.invites || []).find((i: any) => i.token === token);
    if (!found) return { success: false, error: 'Invite not found in school scope' };

    const resent = await this.authFlow.resendInvite(token, req?.user?.sub || 'school-admin', body?.expiresHours || 72);
    if (!resent.ok) return { success: false, error: (resent as any).error || 'Could not resend invite' };
    return { success: true, invite: (resent as any).invite };
  }
}

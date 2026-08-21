import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { StudentAuthService } from '../auth/student-auth.service';

function isSchoolAdmin(role: any) {
  const raw = String(role || '').toLowerCase();
  return raw === 'school_admin' || raw === 'admin';
}

@Controller('school')
@UseGuards(AuthGuard)
export class SchoolController {
  constructor(private readonly authFlow: StudentAuthService) {}

  private ensureSchoolAdmin(req: any) {
    if (!isSchoolAdmin(req?.user?.role)) {
      throw new ForbiddenException('School admin access required');
    }
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

  @Post('students/register')
  async registerStudent(@Req() req: any, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const res = await this.authFlow.registerStudentBySchool({
      schoolId,
      name: body?.name,
      className: body?.className,
      loginId: body?.loginId,
      password: body?.password,
      gender: body?.gender || null,
      createdBy: req?.user?.sub || null
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, student: res.student };
  }

  @Patch('students/:id')
  async updateStudent(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const res = await this.authFlow.updateStudentBySchool({
      schoolId,
      studentId: id,
      name: body?.name,
      className: body?.className
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
    const res = await this.authFlow.registerTeacherBySchool({
      schoolId,
      name: body?.name,
      email: body?.email,
      subject: body?.subject,
      loginId: body?.loginId,
      password: body?.password,
      gender: body?.gender || null,
      grades: body?.grades,
      createdBy: req?.user?.sub || null
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, teacher: res.teacher };
  }

  @Patch('teachers/:id')
  async updateTeacher(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub;
    const res = await this.authFlow.updateTeacherBySchool({
      schoolId,
      teacherId: id,
      name: body?.name,
      email: body?.email,
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

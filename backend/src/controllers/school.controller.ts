import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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
  async teachers(@Req() req: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const teachersRes = await this.authFlow.listTeachersBySchool(schoolId);
    return { success: true, teachers: teachersRes.teachers || [] };
  }

  @Get('invites')
  async invites(@Req() req: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const invitesRes = await this.authFlow.listInvitesByScope({ schoolId, role: 'teacher' });
    return { success: true, invites: invitesRes.invites || [] };
  }

  @Get('students')
  async students(@Req() req: any) {
    this.ensureSchoolAdmin(req);
    const schoolId = req?.user?.schoolId || req?.user?.sub || 'school-local';
    const studentsRes = await this.authFlow.listStudentsByScope({ schoolId });
    return { success: true, students: studentsRes.students || [] };
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
      createdBy: req?.user?.sub || null
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, teacher: res.teacher };
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

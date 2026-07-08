import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { StudentAuthService } from '../auth/student-auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly studentAuth: StudentAuthService) {}

  @Post('school/register')
  async schoolRegister(@Body() body: any) {
    const res = await this.studentAuth.registerSchool({
      email: body?.email,
      schoolName: body?.schoolName,
      branch: body?.branch,
      location: body?.location,
      password: body?.password
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, role: 'school_admin', token: res.token, school: res.school };
  }

  @Post('school/login')
  async schoolLogin(@Body() body: any) {
    const res = await this.studentAuth.loginSchool(body?.email, body?.password);
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, role: 'school_admin', token: res.token, school: res.school };
  }

  @Post('teacher/login')
  async teacherLogin(@Body() body: any) {
    const res = await this.studentAuth.loginTeacher(body?.loginId, body?.password);
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, token: res.token, role: res.role, teacher: res.teacher };
  }

  @Post('student/login')
  async studentLogin(@Body() body: any) {
    const res = await this.studentAuth.loginStudent(body?.loginId, body?.password);
    if (!res.ok) return { success: false, error: res.error };
    return {
      success: true,
      token: res.token,
      role: res.role,
      student: res.student
    };
  }

  @Get('invite/:token')
  async getInvite(@Param('token') token: string) {
    const res = await this.studentAuth.getInvite(token);
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, invite: (res as any).invite };
  }

  @Post('invite/accept')
  async acceptInvite(@Body() body: any) {
    const res = await this.studentAuth.acceptInvite(body?.token, body || {});
    if (!res.ok) return { success: false, error: res.error };
    return {
      success: true,
      token: (res as any).token,
      role: (res as any).role,
      student: (res as any).student,
      teacher: (res as any).teacher
    };
  }
}

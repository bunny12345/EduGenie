import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { StudentAuthService } from '../auth/student-auth.service';
import { OwnerGuard, OwnerIdentityGuard } from '../auth/owner.guard';
import { RegistrationPhoneService } from '../auth/registration-phone.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly studentAuth: StudentAuthService,
    private readonly registrationPhone: RegistrationPhoneService
  ) {}

  private ownerScope(req: { owner: { id: string } }) {
    return { schoolId: 'owner-school-registration', actorId: req.owner.id };
  }

  @Post('school/register/phone/request')
  @UseGuards(OwnerGuard)
  requestSchoolPhone(@Req() req: { owner: { id: string } }, @Body() body: any) {
    return this.registrationPhone.request(this.ownerScope(req), { ...body, role: 'school' });
  }

  @Post('school/register/phone/verify')
  @UseGuards(OwnerGuard)
  verifySchoolPhone(@Req() req: { owner: { id: string } }, @Body() body: any) {
    return this.registrationPhone.verify(this.ownerScope(req), { ...body, role: 'school' });
  }

  @Get('owner/access')
  @UseGuards(OwnerIdentityGuard)
  ownerAccess(@Req() req: { owner: { mfaVerified: boolean } }) {
    return { success: true, mfaVerified: req.owner.mfaVerified };
  }

  @Post('school/register')
  @UseGuards(OwnerGuard)
  schoolRegister() {
    throw new BadRequestException('School registration requires both email and SMS verification. Use the registration verification flow.');
  }

  @Post('school/register/request-otp')
  @UseGuards(OwnerGuard)
  async schoolRegisterRequestOtp(@Req() req: { owner: { id: string } }, @Body() body: any) {
    const phone = this.registrationPhone.normalize(this.ownerScope(req), 'school', body);
    const res = await this.studentAuth.requestSchoolRegistrationOtp({
      email: body?.email,
      schoolName: body?.schoolName,
      branch: body?.branch,
      location: body?.location,
      password: body?.password,
      phone,
      country: body?.country || 'IN',
      ownerId: req.owner.id
    });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, message: 'Verification code sent to your email.' };
  }

  @Post('school/register/verify-otp')
  @UseGuards(OwnerGuard)
  async schoolRegisterVerifyOtp(@Req() req: { owner: { id: string } }, @Body() body: any) {
    const res = await this.studentAuth.verifySchoolRegistrationOtp(body?.email, body?.otp, req.owner.id,
      async (contact) => {
        await this.registrationPhone.consume(this.ownerScope(req), 'school', {
          ...contact, phoneVerificationId: body?.phoneVerificationId
        });
      });
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, school: res.school };
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

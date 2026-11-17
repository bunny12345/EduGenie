import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireStudentIdentity } from '../auth/student-identity';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('devices')
  async register(@Req() req: any, @Body() body: any) {
    const preferences = await this.notifications.registerDevice(requireStudentIdentity(req), body);
    return { success: true, preferences, pushConfigured: this.notifications.pushConfigured };
  }

  @Post('devices/remove')
  async remove(@Req() req: any, @Body() body: any) {
    await this.notifications.removeDevice(requireStudentIdentity(req), body?.token);
    return { success: true };
  }

  @Get('preferences')
  async preferences(@Req() req: any) {
    return { success: true, preferences: await this.notifications.preferences(requireStudentIdentity(req)) };
  }

  @Patch('preferences')
  async updatePreferences(@Req() req: any, @Body() body: any) {
    return { success: true, preferences: await this.notifications.updatePreferences(requireStudentIdentity(req), body) };
  }

  @Get('preview')
  async preview(@Req() req: any, @Query('timezone') timezone?: string) {
    return { success: true, ...(await this.notifications.preview(requireStudentIdentity(req), timezone)) };
  }

  @Post('test')
  async test(@Req() req: any) {
    const result = await this.notifications.sendTest(requireStudentIdentity(req));
    return { success: result.sent > 0, ...result };
  }
}

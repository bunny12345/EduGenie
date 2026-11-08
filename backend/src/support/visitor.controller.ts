import { BadRequestException, Body, Controller, Get, Header, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OwnerGuard } from '../auth/owner.guard';
import { VisitorService } from './visitor.service';

interface VisitorRequest { headers: { authorization?: string }; socket: { remoteAddress?: string } }
function offset(value?: string) {
  const parsed = value === undefined ? 0 : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 100000) throw new BadRequestException('Invalid page offset.');
  return parsed;
}
// Public onboarding lives under the already-forwarded support URL prefix.
@Controller('support/public')
export class VisitorController {
  constructor(private readonly visitors: VisitorService) {}
  @Post('chat')
  chat(@Req() req: VisitorRequest, @Body() body: Parameters<VisitorService['chat']>[1]) {
    return this.visitors.chat(req.socket.remoteAddress || 'unknown', body);
  }
  @Post('code')
  code(@Req() req: VisitorRequest, @Body() body: Parameters<VisitorService['requestCode']>[1]) {
    return this.visitors.requestCode(req.socket.remoteAddress || 'unknown', body);
  }
  @Post('verify')
  @Header('Cache-Control', 'no-store')
  verify(@Req() req: VisitorRequest, @Body() body: Parameters<VisitorService['verify']>[1]) {
    return this.visitors.verify(req.socket.remoteAddress || 'unknown', body);
  }
  @Get('enquiries/:id')
  @Header('Cache-Control', 'no-store')
  detail(@Req() req: VisitorRequest, @Param('id') id: string, @Query('offset') page?: string) {
    return this.visitors.detail(id, req.headers.authorization, false, offset(page));
  }
  @Post('enquiries/:id/messages')
  reply(@Req() req: VisitorRequest, @Param('id') id: string, @Body() body: Parameters<VisitorService['reply']>[1]) {
    return this.visitors.reply(id, body, req.headers.authorization);
  }
  @Post('enquiries/:id/notify')
  notify(@Req() req: VisitorRequest, @Param('id') id: string) { return this.visitors.notifyAgain(id, req.headers.authorization); }
}

@Controller('owner/support/enquiries')
@UseGuards(OwnerGuard)
export class OwnerEnquiriesController {
  constructor(private readonly visitors: VisitorService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('offset') page?: string) { return this.visitors.list(offset(page)); }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string, @Query('offset') page?: string) { return this.visitors.detail(id, undefined, true, offset(page)); }
  @Post(':id/messages')
  reply(@Param('id') id: string, @Body() body: Parameters<VisitorService['reply']>[1]) { return this.visitors.reply(id, body, undefined, true); }
  @Post(':id/status')
  status(@Param('id') id: string, @Body() body: { status?: unknown }) { return this.visitors.status(id, body?.status); }
}

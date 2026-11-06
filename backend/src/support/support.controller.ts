import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OwnerGuard } from '../auth/owner.guard';
import { SupportActor, SupportService } from './support.service';

function offset(value?: string) {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 100000) throw new BadRequestException('Invalid page offset.');
  return parsed;
}

@Controller('support')
@UseGuards(AuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Post('chat')
  chat(@Req() req: SupportActor, @Body() body: { message?: unknown }) { return this.support.chat(req, body); }
  @Get('tickets')
  list(@Req() req: SupportActor, @Query('offset') page?: string) { return this.support.list(req, offset(page)); }
  @Post('tickets')
  create(@Req() req: SupportActor, @Body() body: Parameters<SupportService['create']>[1]) { return this.support.create(req, body); }
  @Get('tickets/:id')
  detail(@Req() req: SupportActor, @Param('id') id: string, @Query('offset') page?: string) { return this.support.detail(id, req, offset(page)); }
  @Post('tickets/:id/messages')
  reply(@Req() req: SupportActor, @Param('id') id: string, @Body() body: Parameters<SupportService['reply']>[1]) { return this.support.reply(id, body, req); }
  @Post('tickets/:id/notify')
  notify(@Req() req: SupportActor, @Param('id') id: string) { return this.support.retryNotification(id, req); }
}

@Controller('owner/support')
@UseGuards(OwnerGuard)
export class OwnerSupportController {
  constructor(private readonly support: SupportService) {}
  @Get('tickets')
  list(@Query('offset') page?: string) { return this.support.list(undefined, offset(page)); }
  @Get('tickets/:id')
  detail(@Param('id') id: string, @Query('offset') page?: string) { return this.support.detail(id, undefined, offset(page)); }
  @Post('tickets/:id/messages')
  reply(@Param('id') id: string, @Body() body: Parameters<SupportService['reply']>[1]) { return this.support.reply(id, body); }
  @Post('tickets/:id/status')
  status(@Param('id') id: string, @Body() body: { status?: unknown }) { return this.support.status(id, body?.status); }
}

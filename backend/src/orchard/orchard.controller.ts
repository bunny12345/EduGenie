import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OrchardService } from './orchard.service';

@Controller('orchard')
export class OrchardController {
  constructor(private readonly orchard: OrchardService) {}

  // Full orchard overview (profile currencies + all subject trees).
  @Get()
  @UseGuards(AuthGuard)
  async getOrchard(@Req() req: any, @Query('studentId') studentId?: string) {
    const id = req.studentId || studentId;
    return this.orchard.getOrchard(id);
  }

  // Single tree detail with its chapters (seeds).
  @Get(':subjectKey')
  @UseGuards(AuthGuard)
  async getTree(@Req() req: any, @Param('subjectKey') subjectKey: string, @Query('studentId') studentId?: string) {
    const id = req.studentId || studentId;
    return this.orchard.getTree(id, subjectKey);
  }

  // Record a learning activity that drives tree growth.
  @Post('activity')
  @UseGuards(AuthGuard)
  async recordActivity(
    @Req() req: any,
    @Body()
    body: {
      studentId?: string;
      subjectKey: string;
      chapterId?: string;
      activityType: string;
      correct?: boolean;
      occurredAt?: string;
    },
  ) {
    const id = req.studentId || body.studentId;
    return this.orchard.recordActivity(id, {
      subjectKey: body.subjectKey,
      chapterId: body.chapterId,
      activityType: body.activityType,
      correct: body.correct,
      occurredAt: body.occurredAt,
    });
  }

  // Complete a spaced-repetition retention review (week / month).
  @Post('review/complete')
  @UseGuards(AuthGuard)
  async completeReview(
    @Req() req: any,
    @Body()
    body: {
      studentId?: string;
      chapterId: string;
      reviewType: 'week' | 'month';
      passed: boolean;
      occurredAt?: string;
    },
  ) {
    const id = req.studentId || body.studentId;
    return this.orchard.completeReview(id, {
      chapterId: body.chapterId,
      reviewType: body.reviewType,
      passed: body.passed,
      occurredAt: body.occurredAt,
    });
  }
}

import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { FlashcardsService } from './flashcards.service';
import { ReviewRating } from './games.constants';

@Controller('games')
export class GamesController {
  constructor(private readonly flashcards: FlashcardsService) {}

  // Arcade line-up (live + coming-soon games).
  @Get()
  @UseGuards(AuthGuard)
  async listGames() {
    return { success: true, games: this.flashcards.listGames() };
  }

  // Subject + chapter picker data for the flashcards game (with due counts).
  @Get('flashcards/overview')
  @UseGuards(AuthGuard)
  async flashcardOverview(@Req() req: any, @Query('studentId') studentId?: string) {
    const id = req.studentId || studentId;
    return this.flashcards.getFlashcardOverview(id);
  }

  // Build a study session: a specific chapter (deckId) or all chapters.
  @Get('flashcards/cards')
  @UseGuards(AuthGuard)
  async flashcardCards(
    @Req() req: any,
    @Query('subject') subject: string,
    @Query('deckId') deckId?: string,
    @Query('scope') scope?: string,
    @Query('mode') mode?: string,
    @Query('limit') limit?: string,
    @Query('studentId') studentId?: string,
  ) {
    const id = req.studentId || studentId;
    return this.flashcards.getCards(id, {
      subjectKey: subject,
      deckId,
      scope,
      mode,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // Record one card review → advances the spaced-repetition schedule.
  @Post('flashcards/review')
  @UseGuards(AuthGuard)
  async flashcardReview(
    @Req() req: any,
    @Body() body: { studentId?: string; flashcardId: string; rating: ReviewRating },
  ) {
    const id = req.studentId || body.studentId;
    return this.flashcards.submitReview(id, { flashcardId: body.flashcardId, rating: body.rating });
  }

  // On-demand generation (dev/admin) — normally cards are generated on upload.
  @Post('flashcards/generate')
  @UseGuards(AuthGuard)
  async flashcardGenerate(@Req() req: any, @Body() body: { lessonId: string; force?: boolean; count?: number }) {
    return this.flashcards.generateForLesson(body.lessonId, { force: body.force, count: body.count });
  }

  // Bulk-regenerate flashcards for all lessons that have chunks
  @Post('flashcards/generate-all')
  @UseGuards(AuthGuard)
  async flashcardGenerateAll(@Req() req: any) {
    const results = await this.flashcards.generateForAllLessons();
    return { success: true, ...results };
  }

  // Award the one-time 100-coin bonus for finishing every card in a chapter.
  @Post('flashcards/complete-chapter')
  @UseGuards(AuthGuard)
  async completeChapter(
    @Req() req: any,
    @Body() body: { studentId?: string; deckId: string; subjectKey?: string; chapterTitle?: string },
  ) {
    const id = req.studentId || body.studentId;
    return this.flashcards.completeChapter(id, {
      deckId: body.deckId,
      subjectKey: body.subjectKey,
      chapterTitle: body.chapterTitle,
    });
  }

  // Log a completed game session (updates history + waters the orchard tree).
  @Post('session')
  @UseGuards(AuthGuard)
  async logSession(
    @Req() req: any,
    @Body()
    body: {
      studentId?: string;
      gameKey?: string;
      subjectKey?: string;
      chapterId?: string;
      chapterScope?: string;
      score?: number;
      total?: number;
      durationMs?: number;
      meta?: any;
    },
  ) {
    const id = req.studentId || body.studentId;
    return this.flashcards.logSession(id, body);
  }
}

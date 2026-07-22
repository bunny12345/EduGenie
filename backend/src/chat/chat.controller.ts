import { Controller, Post, Body, Get, Query, Headers, UseGuards, Req } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AuthGuard } from '../auth/auth.guard';
import { LocalFeedService } from '../shared/local-feed.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly localFeed: LocalFeedService
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  async chat(
    @Req() req: any,
    @Body() payload: {
      studentId?: string;
      message: string;
      personality?: string;
      conversationId?: string;
      recentMessages?: Array<{ role: string; content: string }>;
      imageDataUrl?: string;
      imageDataUrls?: string[];
      imageNames?: string[];
      lessonId?: string;
      lessonTitle?: string;
      lessonSubject?: string;
    }
  ) {
    const { message, personality, conversationId, recentMessages, imageDataUrl, imageDataUrls, imageNames, lessonId, lessonTitle, lessonSubject } = payload;
    const studentId = req.studentId || payload.studentId || 'anon';
    const response = await this.chatService.handleMessage(studentId, message, {
      personality,
      conversationId,
      recentMessages,
      imageDataUrl,
      imageDataUrls,
      imageNames,
      lessonId,
      lessonTitle,
      lessonSubject,
    });
    this.localFeed.logStudentActivity(studentId, {
      type: 'chat',
      action: 'sent',
      title: 'Chat message',
      details: String(message || '').slice(0, 120),
      meta: { conversationId: conversationId || null }
    });
    return { success: true, ...response };
  }

  @Get('history')
  @UseGuards(AuthGuard)
  async history(@Req() req: any, @Query('studentId') studentId?: string, @Query('conversationId') conversationId?: string) {
    const id = req.studentId || studentId || 'anon';
    const messages = await this.chatService.getHistory(id, conversationId);
    return { success: true, messages };
  }

  @Get('learning-timeline')
  @UseGuards(AuthGuard)
  async learningTimeline(@Req() req: any, @Query('studentId') studentId?: string, @Query('limit') limit?: string) {
    const id = req.studentId || studentId || 'anon';
    const parsedLimit = Number(limit || 20);
    const result = await this.chatService.getLearningTimeline(id, {
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 20,
    });
    return { success: true, ...result };
  }

  @Get('lesson-mastery')
  @UseGuards(AuthGuard)
  async lessonMastery(@Req() req: any, @Query('studentId') studentId?: string, @Query('lessonId') lessonId?: string) {
    const id = req.studentId || studentId || 'anon';
    const mastery = await this.chatService.getLessonMastery(id, lessonId);
    return { success: true, mastery };
  }

  @Post('tts-audio')
  @UseGuards(AuthGuard)
  async localTtsAudio(
    @Req() req: any,
    @Body() payload: { studentId?: string; text: string; targetLanguage?: string; voice?: string; speed?: number }
  ) {
    const id = req.studentId || payload.studentId || 'anon';
    const tts = await this.chatService.generateLocalTtsAudio(payload?.text, payload?.targetLanguage, payload?.voice, payload?.speed);
    if (!tts?.audioBase64) {
      return {
        success: false,
        error: 'Local TTS is unavailable. Start your self-hosted TTS service and set TTS_SERVICE_URL.'
      };
    }

    this.localFeed.logStudentActivity(id, {
      type: 'chat',
      action: 'tts-local',
      title: 'Voice playback',
      details: String(payload?.targetLanguage || 'en-US'),
      meta: { targetLanguage: payload?.targetLanguage || 'en-US', voice: payload?.voice || tts.voice || null, speed: payload?.speed ?? 1 }
    });

    return { success: true, ...tts };
  }

  @Get('seed')
  async seed() {
    const student = await this.chatService.createTestStudent();
    return { success: true, student, id: student.id };
  }

  @Post('memory')
  @UseGuards(AuthGuard)
  async addMemory(@Req() req: any, @Body() payload: { key?: string; value: string }) {
    const { key, value } = payload;
    const studentId = req.studentId || 'anon';
    const mem = await this.chatService.addMemory(studentId, key || 'note', value);
    return { success: true, memory: mem };
  }

  @Post('student')
  async createStudent(@Body() payload: { name: string; age?: number; class?: string; board?: string }) {
    const student = await this.chatService.createStudent(payload);
    return { success: true, student };
  }

  @Get('student')
  @UseGuards(AuthGuard)
  async getStudent(@Req() req: any, @Query('studentId') studentId?: string) {
    const id = req.studentId || studentId;
    if (!id) return { success: false, message: 'missing studentId' };
    try {
      const students = await this.chatService.getStudentById(id);
      return { success: true, student: students };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  @Get('memories_all')
  async allMemories() {
    const mems = await this.chatService.listAllMemories();
    return { success: true, memories: mems };
  }

  @Get('seed_memories')
  async seedMemories() {
    const student = await this.chatService.createTestStudent();
    const mems = await this.chatService.seedMemories(student.id || 'anon');
    return { success: true, student, id: student.id, memoriesSeeded: mems };
  }

  @Get('memories')
  @UseGuards(AuthGuard)
  async listMemories(@Req() req: any, @Query('studentId') studentId?: string) {
    const id = req.studentId || studentId || 'anon';
    const mems = await this.chatService.listMemories(id);
    return { success: true, memories: mems };
  }

  @Post('prune_memories')
  async pruneMemories(@Headers('x-service-role-key') key?: string) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return { success: false, message: 'Service role key not configured on server' };
    if (!key || key !== serviceKey) return { success: false, message: 'Missing or invalid service role header x-service-role-key' };

    const res = await this.chatService.pruneDuplicateMemories();
    // Logging for visibility
    try {
      let deletedCount = 0;
      if (res && res.result) {
        if (res.result.deleted) {
          deletedCount = res.result.deleted;
          console.log(`prune_memories: deleted ${res.result.deleted} duplicate memories`);
        } else if (typeof res.result.rowCount === 'number') {
          console.log(`prune_memories: rowCount ${res.result.rowCount}`);
        } else console.log('prune_memories: result', JSON.stringify(res.result));
      } else {
        console.log('prune_memories: result', JSON.stringify(res));
      }

      // Send Slack alert if configured and deletions occurred
      const slackUrl = process.env.SLACK_WEBHOOK_URL;
      if (slackUrl && deletedCount > 0) {
        try {
          // lazy require to avoid startup issues
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const fetch = require('node-fetch');
          const text = `EduGenie prune: deleted ${deletedCount} duplicate memories`;
          await fetch(slackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
          console.log('prune_memories: slack notification sent');
        } catch (e) {
          console.warn('prune_memories: failed to send slack notification', e?.message || e);
        }
      }
    } catch (e) {}
    return res;
  }

  @Get('stats')
  async stats(@Headers('x-service-role-key') key?: string) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return { success: false, message: 'Service role key not configured on server' };
    if (!key || key !== serviceKey) return { success: false, message: 'Missing or invalid service role header x-service-role-key' };

    const res = await this.chatService.getStats();
    return res;
  }
}

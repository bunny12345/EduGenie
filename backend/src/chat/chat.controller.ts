import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(@Body() payload: { studentId?: string; message: string }) {
    const { studentId, message } = payload;
    const response = await this.chatService.handleMessage(studentId || 'anon', message);
    return { reply: response };
  }

  @Get('seed')
  async seed() {
    const student = await this.chatService.createTestStudent();
    return { student, id: student.id };
  }

  @Post('memory')
  async addMemory(@Body() payload: { studentId: string; key?: string; value: string }) {
    const { studentId, key, value } = payload;
    const mem = await this.chatService.addMemory(studentId || 'anon', key || 'note', value);
    return { memory: mem };
  }

  @Post('student')
  async createStudent(@Body() payload: { name: string; age?: number; class?: string; board?: string }) {
    const student = await this.chatService.createStudent(payload);
    return { student };
  }

  @Get('memories_all')
  async allMemories() {
    const mems = await this.chatService.listAllMemories();
    return { memories: mems };
  }

  @Get('seed_memories')
  async seedMemories() {
    const student = await this.chatService.createTestStudent();
    const mems = await this.chatService.seedMemories(student.id || 'anon');
    return { student, id: student.id, memoriesSeeded: mems };
  }

  @Get('memories')
  async listMemories(@Query('studentId') studentId?: string) {
    const mems = await this.chatService.listMemories(studentId || 'anon');
    return { memories: mems };
  }
}

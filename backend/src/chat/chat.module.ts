import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LlmService } from '../llm/llm.service';
import { SupabaseService } from '../supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, LlmService, SupabaseService, EmbeddingsService]
})
export class ChatModule {}

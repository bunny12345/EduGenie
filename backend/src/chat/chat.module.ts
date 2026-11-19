import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { LlmService } from '../llm/llm.service';
import { SupabaseService } from '../supabase.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { EmailService } from '../auth/email.service';
import { OrchardService } from '../orchard/orchard.service';
import { SharedModule } from '../shared/shared.module';
import { SchoolworkStatusService } from './schoolwork-status.service';
import { LearningScoreService } from '../progress/learning-score.service';

@Module({
  imports: [SharedModule],
  controllers: [ChatController],
  providers: [ChatService, LlmService, SupabaseService, EmbeddingsService, StudentAuthService, EmailService, OrchardService, LearningScoreService, SchoolworkStatusService]
})
export class ChatModule {}

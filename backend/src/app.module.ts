import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { SupabaseService } from './supabase.service';

@Module({
  imports: [ChatModule],
  providers: [SupabaseService]
})
export class AppModule {}

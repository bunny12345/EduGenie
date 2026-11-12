import { Global, Module } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { EmailService } from '../auth/email.service';
import { ExamControlService } from './exam-control.service';
import { SharedModule } from '../shared/shared.module';

@Global()
@Module({
  imports: [SharedModule],
  providers: [SupabaseService, StudentAuthService, EmailService, ExamControlService],
  exports: [ExamControlService],
})
export class ExamControlModule {}

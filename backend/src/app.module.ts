import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { DashboardController } from './controllers/dashboard.controller';
import { HomeworkController } from './controllers/homework.controller';
import { TestsController } from './controllers/tests.controller';
import { ProgressController } from './controllers/progress.controller';
import { CalendarController } from './controllers/calendar.controller';
import { RewardsController } from './controllers/rewards.controller';
import { LibraryController } from './controllers/library.controller';
import { SettingsController } from './controllers/settings.controller';
import { TeacherController } from './controllers/teacher.controller';
import { AuthController } from './controllers/auth.controller';
import { SchoolController } from './controllers/school.controller';
import { SupabaseService } from './supabase.service';
import { AuthGuard } from './auth/auth.guard';
import { StudentAuthService } from './auth/student-auth.service';

@Module({
  imports: [ChatModule],
  controllers: [
    DashboardController,
    HomeworkController,
    TestsController,
    ProgressController,
    CalendarController,
    RewardsController,
    LibraryController,
    SettingsController,
    TeacherController,
    AuthController,
    SchoolController
  ],
  providers: [SupabaseService, AuthGuard, StudentAuthService]
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { DashboardController } from './controllers/dashboard.controller';
import { HealthController } from './controllers/health.controller';
import { HomeworkController } from './controllers/homework.controller';
import { TestsController } from './controllers/tests.controller';
import { ReportCardsController } from './controllers/report-cards.controller';
import { ProgressController } from './controllers/progress.controller';
import { CalendarController } from './controllers/calendar.controller';
import { RewardsController } from './controllers/rewards.controller';
import { LibraryController } from './controllers/library.controller';
import { SettingsController } from './controllers/settings.controller';
import { TeacherController } from './controllers/teacher.controller';
import { CurriculumController } from './controllers/curriculum.controller';
import { AuthController } from './controllers/auth.controller';
import { SchoolController } from './controllers/school.controller';
import { OrchardController } from './orchard/orchard.controller';
import { OrchardService } from './orchard/orchard.service';
import { GamesController } from './games/games.controller';
import { FlashcardsService } from './games/flashcards.service';
import { QuizRushService } from './games/quiz-rush.service';
import { LlmService } from './llm/llm.service';
import { LearningScoreService } from './progress/learning-score.service';
import { SupabaseService } from './supabase.service';
import { AuthGuard } from './auth/auth.guard';
import { OwnerAuthService } from './auth/owner-auth.service';
import { OwnerGuard, OwnerIdentityGuard } from './auth/owner.guard';
import { StudentAuthService } from './auth/student-auth.service';
import { EmailService } from './auth/email.service';
import { CurriculumService } from './curriculum/curriculum.service';
import { EmbeddingsService } from './embeddings/embeddings.service';
import { SharedModule } from './shared/shared.module';
import { SupportService } from './support/support.service';
import { SupportController, OwnerSupportController } from './support/support.controller';
import { VisitorController, OwnerEnquiriesController } from './support/visitor.controller';
import { VisitorService } from './support/visitor.service';

@Module({
  imports: [ChatModule, SharedModule],
  controllers: [
    VisitorController,
    OwnerEnquiriesController,
    SupportController,
    OwnerSupportController,
    HealthController,
    DashboardController,
    HomeworkController,
    TestsController,
    ReportCardsController,
    ProgressController,
    CalendarController,
    RewardsController,
    LibraryController,
    SettingsController,
    TeacherController,
    CurriculumController,
    AuthController,
    SchoolController,
    OrchardController,
    GamesController
  ],
  providers: [SupabaseService, AuthGuard, OwnerAuthService, OwnerGuard, OwnerIdentityGuard, StudentAuthService, EmailService, CurriculumService, EmbeddingsService, OrchardService, FlashcardsService, QuizRushService, LlmService, LearningScoreService, SupportService, VisitorService]
})
export class AppModule {}

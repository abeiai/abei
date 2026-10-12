import { CreatorAuthModule } from "./creator-auth/creator-auth.module.js";
import { MembershipModule } from "./membership/membership.module.js";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { resolve } from "node:path";
import { AdminAuthModule } from "./admin-auth/admin-auth.module.js";
import { AiModule } from "./ai/ai.module.js";
import { AudioModule } from "./audio/audio.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CmsModule } from "./cms/cms.module.js";
import { ContentModulesModule } from "./content-modules/content-modules.module.js";
import { CopybookFontsModule } from "./copybook-fonts/copybook-fonts.module.js";
import { CopybooksModule } from "./copybooks/copybooks.module.js";
import { CoursesModule } from "./courses/courses.module.js";
import { DictionaryModule } from "./dictionary/dictionary.module.js";
import { EnglishGuidedStudyModule } from "./english-guided-study/english-guided-study.module.js";
import { HealthModule } from "./health/health.module.js";
import { LearningFlashcardsModule } from "./learning-flashcards/learning-flashcards.module.js";
import { LearningMaterialsModule } from "./learning-materials/learning-materials.module.js";
import { LearnerLearningModule } from "./learner-learning/learner-learning.module.js";
import { MediaModule } from "./media/media.module.js";
import { OperationsModule } from "./operations/operations.module.js";
import { OrganizationsModule } from "./organizations/organizations.module.js";
import { OnboardingModule } from "./onboarding/onboarding.module.js";
import { PageCompositionsModule } from "./page-compositions/page-compositions.module.js";
import { PaymentModule } from "./payment/payment.module.js";
import { PictureBookModule } from "./picture-books/picture-book.module.js";
import { PictureBookGuideModule } from "./picture-book-guide/picture-book-guide.module.js";
import { ProfilesModule } from "./profiles/profiles.module.js";
import { PublicContentModule } from "./public-content/public-content.module.js";
import { RenderEngineModule } from "./render-engine/render-engine.module.js";
import { RateLimitInterceptor } from "./security/rate-limit.interceptor.js";
import { RequestLoggingInterceptor } from "./security/request-logging.interceptor.js";
import { SystemConfigModule } from "./system-config/system-config.module.js";
import { TypingModule } from "./typing/typing.module.js";
import { VideoGuideModule } from "./video-guide/video-guide.module.js";
import { WalletModule } from "./wallet/wallet.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")],
      isGlobal: true
    }),
    AuthModule,
    CreatorAuthModule,
    AdminAuthModule,
    AudioModule,
    AiModule,
    CmsModule,
    ContentModulesModule,
    CopybookFontsModule,
    CopybooksModule,
    CoursesModule,
    DictionaryModule,
    EnglishGuidedStudyModule,
    LearningFlashcardsModule,
    PublicContentModule,
    RenderEngineModule,
    LearningMaterialsModule,
    LearnerLearningModule,
    MediaModule,
    WalletModule,
    PaymentModule,
    PictureBookModule,
    PictureBookGuideModule,
    MembershipModule,
    ProfilesModule,
    OrganizationsModule,
    PageCompositionsModule,
    OperationsModule,
    OnboardingModule,
    SystemConfigModule,
    TypingModule,
    VideoGuideModule,
    HealthModule
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RateLimitInterceptor
    }
  ]
})
export class AppModule {}

import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AudioModule } from "../audio/audio.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { CoursesModule } from "../courses/courses.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { EnglishGuidedStudyController, PublicEnglishGuidedStudyController } from "./english-guided-study.controller.js";
import { EnglishGuidedStudyService } from "./english-guided-study.service.js";
import { EnglishGuidedStudyDownloadController } from "./english-guided-study-download.controller.js";
import { EnglishGuidedStudyDownloadService } from "./english-guided-study-download.service.js";

@Module({
  imports: [AuthModule, AudioModule, AiModule, CoursesModule, ProfilesModule],
  controllers: [EnglishGuidedStudyController, PublicEnglishGuidedStudyController, EnglishGuidedStudyDownloadController],
  providers: [EnglishGuidedStudyService, EnglishGuidedStudyDownloadService]
})
export class EnglishGuidedStudyModule {}

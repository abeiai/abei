import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AudioModule } from "../audio/audio.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { CoursesModule } from "../courses/courses.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { PublicVideoGuideController, VideoGuideController } from "./video-guide.controller.js";
import { VideoGuideService } from "./video-guide.service.js";

@Module({
  imports: [AuthModule, AudioModule, AiModule, CoursesModule, ProfilesModule],
  controllers: [VideoGuideController, PublicVideoGuideController],
  providers: [VideoGuideService]
})
export class VideoGuideModule {}

import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { MediaModule } from "../media/media.module.js";
import { LearnerAccessService } from "./learner-access.service.js";
import { LearnerActivityService } from "./learner-activity.service.js";
import { LearnerProfilesService } from "./learner-profiles.service.js";
import { ProfilesController } from "./profiles.controller.js";

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [ProfilesController],
  providers: [LearnerAccessService, LearnerActivityService, LearnerProfilesService],
  exports: [
    AuthModule,
    LearnerAccessService,
    LearnerActivityService,
    LearnerProfilesService
  ]
})
export class ProfilesModule {}

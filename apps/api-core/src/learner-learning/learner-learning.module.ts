import { Module } from "@nestjs/common";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { LearnerLearningContextService } from "./learner-learning-context.service.js";
import {
  LearnerLearningAccountController,
  LearnerLearningController
} from "./learner-learning.controller.js";
import { LearnerLearningSessionService } from "./learner-learning-session.service.js";
import { LearnerLearningQueryService } from "./learner-learning-query.service.js";
import { LearnerLearningEventService } from "./learner-learning-event.service.js";
import { LearnerLearningMaintenanceService } from "./learner-learning-maintenance.service.js";

@Module({
  imports: [ProfilesModule],
  controllers: [LearnerLearningController, LearnerLearningAccountController],
  providers: [
    LearnerLearningContextService,
    LearnerLearningSessionService,
    LearnerLearningEventService,
    LearnerLearningQueryService,
    LearnerLearningMaintenanceService
  ],
  exports: [
    LearnerLearningContextService,
    LearnerLearningSessionService,
    LearnerLearningEventService,
    LearnerLearningQueryService,
    LearnerLearningMaintenanceService
  ]
})
export class LearnerLearningModule {}

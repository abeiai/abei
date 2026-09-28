import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { CoursesModule } from "../courses/courses.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import {
  LearningFlashcardsController,
  PublicLearningFlashcardsController
} from "./learning-flashcards.controller.js";
import { LearningFlashcardsService } from "./learning-flashcards.service.js";

@Module({
  imports: [AiModule, AuthModule, CoursesModule, ProfilesModule],
  controllers: [LearningFlashcardsController, PublicLearningFlashcardsController],
  providers: [LearningFlashcardsService],
  exports: [LearningFlashcardsService]
})
export class LearningFlashcardsModule {}

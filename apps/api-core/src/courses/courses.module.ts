import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AiModule } from "../ai/ai.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { MediaModule } from "../media/media.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { AdminCourseReviewsController } from "./admin-course-reviews.controller.js";
import { CourseReviewService } from "./course-review.service.js";
import { CoursesController, PublicCoursesController } from "./courses.controller.js";
import { CoursesService } from "./courses.service.js";

@Module({
  imports: [AdminAuthModule, AiModule, AuthModule, MediaModule, ProfilesModule],
  controllers: [AdminCourseReviewsController, CoursesController, PublicCoursesController],
  providers: [CourseReviewService, CoursesService],
  exports: [CourseReviewService, CoursesService]
})
export class CoursesModule {}

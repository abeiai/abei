import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AiModule } from "../ai/ai.module.js";
import { AudioModule } from "../audio/audio.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { CoursesModule } from "../courses/courses.module.js";
import { MediaModule } from "../media/media.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { SystemConfigModule } from "../system-config/system-config.module.js";
import { PictureBookSubmissionController, PublicPictureBooksController, AdminPictureBookSubmissionsController } from "./picture-book-submission.controller.js";
import { PictureBookSubmissionService } from "./picture-book-submission.service.js";
import { PictureBookController } from "./picture-book.controller.js";
import { PictureBookService } from "./picture-book.service.js";

@Module({
  imports: [AdminAuthModule, AiModule, AudioModule, AuthModule, CoursesModule, MediaModule, ProfilesModule, SystemConfigModule],
  controllers: [PictureBookController, PictureBookSubmissionController, PublicPictureBooksController, AdminPictureBookSubmissionsController],
  providers: [PictureBookService, PictureBookSubmissionService]
})
export class PictureBookModule {}

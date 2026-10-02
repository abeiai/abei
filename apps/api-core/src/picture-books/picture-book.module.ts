import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AudioModule } from "../audio/audio.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { CoursesModule } from "../courses/courses.module.js";
import { MediaModule } from "../media/media.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { SystemConfigModule } from "../system-config/system-config.module.js";
import { PictureBookController } from "./picture-book.controller.js";
import { PictureBookService } from "./picture-book.service.js";

@Module({
  imports: [AiModule, AudioModule, AuthModule, CoursesModule, MediaModule, ProfilesModule, SystemConfigModule],
  controllers: [PictureBookController],
  providers: [PictureBookService]
})
export class PictureBookModule {}

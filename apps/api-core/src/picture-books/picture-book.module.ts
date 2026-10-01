import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AudioModule } from "../audio/audio.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { MediaModule } from "../media/media.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { PictureBookController } from "./picture-book.controller.js";
import { PictureBookService } from "./picture-book.service.js";

@Module({
  imports: [AiModule, AudioModule, AuthModule, MediaModule, ProfilesModule],
  controllers: [PictureBookController],
  providers: [PictureBookService]
})
export class PictureBookModule {}

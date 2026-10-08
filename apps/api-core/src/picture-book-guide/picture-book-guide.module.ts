import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AudioModule } from "../audio/audio.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { MediaModule } from "../media/media.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { PictureBookGuideAccountGuard, PictureBookGuideController } from "./picture-book-guide.controller.js";
import { PictureBookGuideService } from "./picture-book-guide.service.js";
import { PictureBookGuideLibraryService } from "./picture-book-guide-library.service.js";

@Module({ imports: [AiModule, AudioModule, AuthModule, MediaModule, ProfilesModule], controllers: [PictureBookGuideController], providers: [PictureBookGuideService, PictureBookGuideLibraryService, PictureBookGuideAccountGuard] })
export class PictureBookGuideModule {}

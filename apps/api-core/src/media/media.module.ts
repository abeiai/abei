import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { MediaController } from "./media.controller.js";
import { MediaService } from "./media.service.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService]
})
export class MediaModule {}

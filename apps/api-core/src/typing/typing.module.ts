import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { TypingController } from "./typing.controller.js";
import { TypingService } from "./typing.service.js";

@Module({
  imports: [AuthModule, ProfilesModule],
  controllers: [TypingController],
  providers: [TypingService],
  exports: [TypingService]
})
export class TypingModule {}

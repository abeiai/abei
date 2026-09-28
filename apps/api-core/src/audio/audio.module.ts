import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { OrganizationsModule } from "../organizations/organizations.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { AdminAudioController } from "./admin-audio.controller.js";
import { AudioController } from "./audio.controller.js";
import { LearnerAudioCapabilityService } from "./learner-audio-capability.js";
import { AudioService } from "./audio.service.js";
import { AudioDialogueController } from "./audio-dialogue.controller.js";
import { AudioDialogueService } from "./audio-dialogue.service.js";
import { VoiceDownloadService } from "./voice-download.service.js";
import { VoiceDownloadController } from "./voice-download.controller.js";

@Module({
  imports: [AuthModule, AdminAuthModule, OrganizationsModule, ProfilesModule],
  controllers: [AudioController, AdminAudioController, AudioDialogueController, VoiceDownloadController],
  providers: [AudioService, LearnerAudioCapabilityService, AudioDialogueService, VoiceDownloadService],
  exports: [AudioService]
})
export class AudioModule {}

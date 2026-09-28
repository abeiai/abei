import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { OnboardingController } from "./onboarding.controller.js";
import { OnboardingService } from "./onboarding.service.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [OnboardingController],
  providers: [OnboardingService]
})
export class OnboardingModule {}

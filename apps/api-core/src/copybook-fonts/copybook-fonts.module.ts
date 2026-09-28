import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { CopybookFontsController } from "./copybook-fonts.controller.js";
import { CopybookFontsService } from "./copybook-fonts.service.js";

@Module({
  imports: [AdminAuthModule, AuthModule, ProfilesModule],
  controllers: [CopybookFontsController],
  providers: [CopybookFontsService],
  exports: [CopybookFontsService]
})
export class CopybookFontsModule {}

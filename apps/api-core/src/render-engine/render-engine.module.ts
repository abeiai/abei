import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CopybookFontsModule } from "../copybook-fonts/copybook-fonts.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { RenderEngineController } from "./render-engine.controller.js";
import { RenderEngineService } from "./render-engine.service.js";

@Module({
  imports: [AuthModule, CopybookFontsModule, ProfilesModule],
  controllers: [RenderEngineController],
  providers: [RenderEngineService],
  exports: [RenderEngineService]
})
export class RenderEngineModule {}

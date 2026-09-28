import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CopybookFontsModule } from "../copybook-fonts/copybook-fonts.module.js";
import { RenderEngineModule } from "../render-engine/render-engine.module.js";
import { WalletModule } from "../wallet/wallet.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { CopybooksController } from "./copybooks.controller.js";
import { CopybooksService } from "./copybooks.service.js";

@Module({
  imports: [AuthModule, CopybookFontsModule, RenderEngineModule, WalletModule, ProfilesModule],
  controllers: [CopybooksController],
  providers: [CopybooksService]
})
export class CopybooksModule {}

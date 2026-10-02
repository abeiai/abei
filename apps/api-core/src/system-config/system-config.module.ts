import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { MediaModule } from "../media/media.module.js";
import { SystemConfigController } from "./system-config.controller.js";
import { SystemConfigService } from "./system-config.service.js";

@Module({
  imports: [AdminAuthModule, MediaModule],
  controllers: [SystemConfigController],
  providers: [SystemConfigService],
  exports: [SystemConfigService]
})
export class SystemConfigModule {}

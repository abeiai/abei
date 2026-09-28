import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { SystemConfigController } from "./system-config.controller.js";
import { SystemConfigService } from "./system-config.service.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [SystemConfigController],
  providers: [SystemConfigService]
})
export class SystemConfigModule {}

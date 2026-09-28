import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { ContentModulesController } from "./content-modules.controller.js";
import { ContentModulesService } from "./content-modules.service.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [ContentModulesController],
  providers: [ContentModulesService]
})
export class ContentModulesModule {}

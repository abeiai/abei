import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { CmsSchedulerService } from "./cms-scheduler.service.js";
import { CmsController } from "./cms.controller.js";
import { CmsService } from "./cms.service.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [CmsController],
  providers: [CmsService, CmsSchedulerService]
})
export class CmsModule {}

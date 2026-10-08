import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminUsersService } from "./admin-users.service.js";
import { OperationLogsController } from "./operation-logs.controller.js";
import { OperationLogsService } from "./operation-logs.service.js";
import { LegacyAiLogsController } from "./legacy-ai-logs.controller.js";
import { LegacyAiLogsService } from "./legacy-ai-logs.service.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminUsersController, OperationLogsController, LegacyAiLogsController],
  providers: [AdminUsersService, OperationLogsService, LegacyAiLogsService]
})
export class OperationsModule {}

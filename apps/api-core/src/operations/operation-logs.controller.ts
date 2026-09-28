import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { OperationLogsService } from "./operation-logs.service.js";

@Controller("admin/operation-logs")
export class OperationLogsController {
  constructor(
    @Inject(OperationLogsService) private readonly operationLogsService: OperationLogsService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(
    @Req() request: unknown,
    @Query("adminUserId") adminUserId?: string,
    @Query("resourceType") resourceType?: string,
    @Query("resourceId") resourceId?: string,
    @Query("startedAt") startedAt?: string,
    @Query("endedAt") endedAt?: string
  ) {
    await this.adminAuthService.me(request as never);

    return successResponse(
      await this.operationLogsService.listLogs({
        adminUserId: adminUserId?.trim(),
        resourceType: resourceType?.trim(),
        resourceId: resourceId?.trim(),
        startedAt: startedAt?.trim(),
        endedAt: endedAt?.trim()
      })
    );
  }

  @Get("admins")
  async admins(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.operationLogsService.listAdmins());
  }
}

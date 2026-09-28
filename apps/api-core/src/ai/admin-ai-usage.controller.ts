import { Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { AiUsageService } from "./ai-usage.service.js";

@Controller("admin/ai/usage")
export class AdminAiUsageController {
  constructor(
    @Inject(AiUsageService) private readonly aiUsageService: AiUsageService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async dashboard(
    @Req() request: unknown,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("providerId") providerId?: string,
    @Query("modelId") modelId?: string
  ) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiUsageService.getDashboard({ from, to, providerId, modelId }));
  }

  @Post("aggregate")
  async aggregate(
    @Req() request: unknown,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.aiUsageService.aggregateDaily({ from, to });

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "AGGREGATE_AI_USAGE",
      resourceType: "AI_USAGE",
      description: `刷新 AI 用量统计：${result.from} 至 ${result.to}`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Get("alerts")
  async alerts(@Req() request: unknown, @Query("status") status?: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiUsageService.listAlerts(status));
  }

  @Post("alerts/:id/resolve")
  async resolveAlert(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const alert = await this.aiUsageService.resolveAlert(id, admin.id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "RESOLVE_SYSTEM_ALERT",
      resourceType: "SYSTEM_ALERT",
      resourceId: id,
      description: `处理系统告警：${alert?.title ?? id}`,
      request: request as HeaderRequestLike
    });

    return successResponse(alert);
  }
}

import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { AiService } from "./ai.service.js";

@Controller("admin/ai-tasks")
export class AdminAiTaskController {
  constructor(
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(
    @Req() request: unknown,
    @Query("taskType") taskType?: string,
    @Query("provider") provider?: string,
    @Query("model") model?: string,
    @Query("status") status?: string,
    @Query("startTime") startTime?: string,
    @Query("endTime") endTime?: string,
    @Query("user") user?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    await this.adminAuthService.me(request as never);

    return successResponse(
      await this.aiService.listAdminTasks({
        taskType,
        provider,
        model,
        status,
        startTime,
        endTime,
        user,
        page,
        pageSize
      })
    );
  }

  @Get(":id")
  async detail(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.getAdminTask(id));
  }
}

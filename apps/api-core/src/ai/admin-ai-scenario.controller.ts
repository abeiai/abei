import { Body, Controller, Delete, Get, Inject, Param, Patch, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { AiService } from "./ai.service.js";
import { UpdateAiScenarioDto } from "./dto/advanced-ai.dto.js";

@Controller("admin/ai-scenarios")
export class AdminAiScenarioController {
  constructor(
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.listAdminScenarios());
  }

  @Get(":id/delete-check")
  async checkDelete(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.checkScenarioDelete(id));
  }

  @Patch(":id")
  async update(@Req() request: unknown, @Param("id") id: string, @Body() dto: UpdateAiScenarioDto) {
    const admin = await this.adminAuthService.me(request as never);
    const scenario = await this.aiService.updateScenario(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_AI_SCENARIO",
      resourceType: "AI_SCENARIO",
      resourceId: scenario.id,
      description: `编辑 AI 场景：${scenario.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(scenario);
  }

  @Delete(":id")
  async delete(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.aiService.deleteScenario(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_AI_SCENARIO",
      resourceType: "AI_SCENARIO",
      resourceId: result.scenarioId,
      description: `删除 AI 场景：${result.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }
}

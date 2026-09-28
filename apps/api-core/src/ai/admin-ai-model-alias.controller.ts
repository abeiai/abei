import { Body, Controller, Get, Inject, Param, Patch, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { AiService } from "./ai.service.js";
import { UpdateAiModelAliasDto } from "./dto/advanced-ai.dto.js";

@Controller("admin/ai/model-aliases")
export class AdminAiModelAliasController {
  constructor(
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.listModelAliases());
  }

  @Patch(":aliasKey")
  async update(
    @Req() request: unknown,
    @Param("aliasKey") aliasKey: string,
    @Body() dto: UpdateAiModelAliasDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const aliases = await this.aiService.updateModelAlias(aliasKey, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_AI_MODEL_ALIAS",
      resourceType: "AI_MODEL_ALIAS",
      resourceId: aliasKey,
      description: `绑定 AI 模型别名：${aliasKey}`,
      request: request as HeaderRequestLike
    });

    return successResponse(aliases);
  }
}

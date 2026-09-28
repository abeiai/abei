import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { AiService } from "./ai.service.js";
import { UpsertAiToolCategoryDto } from "./dto/advanced-ai.dto.js";

@Controller("admin/ai/tool-categories")
export class AdminAiToolCategoryController {
  constructor(
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.listToolCategories(true));
  }

  @Post()
  async create(@Req() request: unknown, @Body() dto: UpsertAiToolCategoryDto) {
    const admin = await this.adminAuthService.me(request as never);
    const category = await this.aiService.createToolCategory(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_AI_TOOL_CATEGORY",
      resourceType: "AI_TOOL_CATEGORY",
      resourceId: category.id,
      description: `创建 AI 工具分类：${category.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(category);
  }

  @Patch(":id")
  async update(@Req() request: unknown, @Param("id") id: string, @Body() dto: UpsertAiToolCategoryDto) {
    const admin = await this.adminAuthService.me(request as never);
    const category = await this.aiService.updateToolCategory(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_AI_TOOL_CATEGORY",
      resourceType: "AI_TOOL_CATEGORY",
      resourceId: category.id,
      description: `编辑 AI 工具分类：${category.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(category);
  }
}

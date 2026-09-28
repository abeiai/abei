import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { AiService } from "./ai.service.js";
import { ImportAiToolTemplateDto } from "./dto/advanced-ai.dto.js";

@Controller("admin/ai/tool-templates")
export class AdminAiToolTemplateController {
  constructor(
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get("export")
  async exportAll(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.exportToolTemplates());
  }

  @Get(":id/export")
  async exportOne(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.exportToolTemplates(id));
  }

  @Post("import/preview")
  async preview(@Req() request: unknown, @Body() dto: ImportAiToolTemplateDto) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.previewToolTemplateImport(dto));
  }

  @Post("import")
  async import(@Req() request: unknown, @Body() dto: ImportAiToolTemplateDto) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.aiService.importToolTemplates(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "IMPORT_AI_TOOL_TEMPLATE",
      resourceType: "AI_TOOL_TEMPLATE",
      resourceId: null,
      description: `导入 AI 工具模板：${result.items
        .map((item) => item.slug)
        .slice(0, 3)
        .join("、")}，新增 ${result.createdCount} 个，跳过 ${result.skippedCount} 个`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }
}

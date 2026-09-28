import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { AiService } from "./ai.service.js";
import { CreateAiProviderModelDto, UpdateAiModelDto } from "./dto/advanced-ai.dto.js";
import { CreateAiProviderDto, UpdateAiProviderDto } from "./dto/ai-provider.dto.js";

@Controller("admin/ai-providers")
export class AdminAiProviderController {
  constructor(
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.listProviders());
  }

  @Post()
  async create(@Req() request: unknown, @Body() dto: CreateAiProviderDto) {
    const admin = await this.adminAuthService.me(request as never);
    const provider = await this.aiService.createProvider(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_AI_PROVIDER",
      resourceType: "AI_PROVIDER",
      resourceId: provider.id,
      description: `创建 AI Provider：${provider.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(provider);
  }

  @Patch(":id")
  async update(@Req() request: unknown, @Param("id") id: string, @Body() dto: UpdateAiProviderDto) {
    const admin = await this.adminAuthService.me(request as never);
    const provider = await this.aiService.updateProvider(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_AI_PROVIDER",
      resourceType: "AI_PROVIDER",
      resourceId: provider.id,
      description: `编辑 AI Provider：${provider.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(provider);
  }

  @Post(":id/models")
  async createModel(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: CreateAiProviderModelDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const model = await this.aiService.createProviderModel(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_AI_MODEL",
      resourceType: "AI_MODEL",
      resourceId: model.id,
      description: `新增 AI 模型：${model.displayName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(model);
  }

  @Patch("models/:modelId")
  async updateModel(
    @Req() request: unknown,
    @Param("modelId") modelId: string,
    @Body() dto: UpdateAiModelDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const model = await this.aiService.updateModel(modelId, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_AI_MODEL",
      resourceType: "AI_MODEL",
      resourceId: model.id,
      description: `编辑 AI 模型：${model.displayName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(model);
  }
}

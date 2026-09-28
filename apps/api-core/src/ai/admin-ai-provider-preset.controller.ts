import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { AiService } from "./ai.service.js";
import {
  CreateAiProviderPresetDto,
  UpdateAiModelInstanceDto,
  UpdateAiProviderInstanceDto
} from "./dto/advanced-ai.dto.js";

@Controller("admin/ai/providers")
export class AdminAiProviderPresetController {
  constructor(
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.listProviderPresets());
  }

  @Post()
  async create(@Req() request: unknown, @Body() dto: CreateAiProviderPresetDto) {
    const admin = await this.adminAuthService.me(request as never);
    const provider = await this.aiService.createProviderPreset(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_AI_PROVIDER_PRESET",
      resourceType: "AI_PROVIDER_PRESET",
      resourceId: provider.id,
      description: `新增 AI 厂商：${provider.displayName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(provider);
  }

  @Get(":id")
  async detail(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.getProviderPreset(id));
  }

  @Patch(":id")
  async updateInstance(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateAiProviderInstanceDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const provider = await this.aiService.updateProviderInstance(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_AI_PROVIDER_INSTANCE",
      resourceType: "AI_PROVIDER_PRESET",
      resourceId: id,
      description: `配置 AI Provider：${provider.displayName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(provider);
  }

  @Delete(":id")
  async deleteProvider(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.aiService.deleteProviderPreset(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_AI_PROVIDER_PRESET",
      resourceType: "AI_PROVIDER_PRESET",
      resourceId: id,
      description: "删除 AI 厂商",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Post(":id/test")
  async test(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.aiService.testProviderInstance(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "TEST_AI_PROVIDER",
      resourceType: "AI_PROVIDER_PRESET",
      resourceId: id,
      description: `测试 AI Provider 连接：${result.message}`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Get("model-instances/:modelInstanceId/delete-check")
  async checkModelInstanceDelete(@Req() request: unknown, @Param("modelInstanceId") modelInstanceId: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.aiService.checkModelInstanceDelete(modelInstanceId));
  }

  @Post(":id/model-presets/:modelPresetId/enable")
  async enableModel(
    @Req() request: unknown,
    @Param("id") id: string,
    @Param("modelPresetId") modelPresetId: string,
    @Body() dto: UpdateAiModelInstanceDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const provider = await this.aiService.enableModelPreset(id, modelPresetId, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "ENABLE_AI_MODEL_PRESET",
      resourceType: "AI_MODEL_PRESET",
      resourceId: modelPresetId,
      description: `启用 AI 模型预置：${provider.displayName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(provider);
  }

  @Post(":id/model-instances")
  async createModelInstance(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateAiModelInstanceDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const model = await this.aiService.createModelInstance(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_AI_MODEL_INSTANCE",
      resourceType: "AI_MODEL_INSTANCE",
      resourceId: model.id,
      description: `新增 AI 模型实例：${model.displayName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(model);
  }

  @Patch("model-instances/:modelInstanceId")
  async updateModelInstance(
    @Req() request: unknown,
    @Param("modelInstanceId") modelInstanceId: string,
    @Body() dto: UpdateAiModelInstanceDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const model = await this.aiService.updateModelInstance(modelInstanceId, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_AI_MODEL_INSTANCE",
      resourceType: "AI_MODEL_INSTANCE",
      resourceId: modelInstanceId,
      description: `编辑 AI 模型实例：${model.displayName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(model);
  }

  @Delete("model-instances/:modelInstanceId")
  async deleteModelInstance(@Req() request: unknown, @Param("modelInstanceId") modelInstanceId: string) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.aiService.deleteModelInstance(modelInstanceId);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_AI_MODEL_INSTANCE",
      resourceType: "AI_MODEL_INSTANCE",
      resourceId: modelInstanceId,
      description: "删除 AI 模型实例",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }
}

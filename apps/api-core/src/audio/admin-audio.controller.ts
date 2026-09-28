import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, StreamableFile } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { AudioService, localAudioStream } from "./audio.service.js";
import {
  CreateAdminPlatformVoiceDesignDto,
  CreatePlatformVoiceAssetDto,
  DeleteVoiceAssetAdminDto,
  ReviewVoiceAssetDto,
  UpdateAdminVoiceAssetDto,
  UpdateAudioModelDto,
  UpdateSystemVoiceDto
} from "./dto/audio.dto.js";

@Controller("admin/audio")
export class AdminAudioController {
  constructor(
    @Inject(AudioService) private readonly audioService: AudioService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get("models")
  async listModels(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.audioService.listAdminAudioModels());
  }

  @Get("models/:id/delete-check")
  async checkModelDelete(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.audioService.checkAdminAudioModelDelete(id));
  }

  @Patch("models/:id")
  async updateModel(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateAudioModelDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const model = await this.audioService.updateAdminAudioModel(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "AUDIO_MODEL_UPDATE",
      resourceType: "AI_MODEL_INSTANCE",
      resourceId: id,
      description: `更新语音模型配置：${model.modelName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(model);
  }

  @Delete("models/:id")
  async deleteModel(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.audioService.deleteAdminAudioModel(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "AUDIO_MODEL_DELETE",
      resourceType: "AI_MODEL_INSTANCE",
      resourceId: id,
      description: "删除语音模型",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Get("tasks")
  async listTasks(
    @Req() request: unknown,
    @Query("user") user?: string,
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("provider") provider?: string,
    @Query("model") model?: string,
    @Query("startTime") startTime?: string,
    @Query("endTime") endTime?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    await this.adminAuthService.me(request as never);

    return successResponse(
      await this.audioService.listAdminTasks({
        user,
        status,
        type,
        provider,
        model,
        startTime,
        endTime,
        page,
        pageSize
      })
    );
  }

  @Get("tasks/:id")
  async getTask(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.audioService.getAdminTask(id));
  }

  @Get("safety-settings")
  async safetySettings(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.audioService.getSafetySettings());
  }

  @Get("voices")
  async listVoices(
    @Req() request: unknown,
    @Query("keyword") keyword?: string,
    @Query("status") status?: string,
    @Query("language") language?: string,
    @Query("accent") accent?: string,
    @Query("model") model?: string
  ) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.audioService.listAdminVoiceAssets({ keyword, status, language, accent, model }));
  }

  @Post("voices/platform")
  async createPlatformVoice(@Req() request: unknown, @Body() dto: CreatePlatformVoiceAssetDto) {
    const admin = await this.adminAuthService.me(request as never);
    const voice = await this.audioService.createPlatformVoiceAsset(dto, admin.id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "AUDIO_PLATFORM_VOICE_CREATE",
      resourceType: "VOICE_ASSET",
      resourceId: voice.id,
      description: `新增平台音色：${voice.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(voice);
  }

  @Post("voices/sync-elevenlabs-defaults")
  async syncElevenLabsDefaultVoices(@Req() request: unknown) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.audioService.syncElevenLabsDefaultVoices(admin.id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "AUDIO_ELEVENLABS_DEFAULT_VOICES_SYNC",
      resourceType: "VOICE_ASSET",
      resourceId: "elevenlabs-defaults",
      description: `同步 ElevenLabs 默认音色：新增 ${result.created}，更新 ${result.updated}`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Post("voices/platform-design")
  async createPlatformVoiceDesign(@Req() request: unknown, @Body() dto: CreateAdminPlatformVoiceDesignDto) {
    const admin = await this.adminAuthService.me(request as never);
    const voice = await this.audioService.createPlatformVoiceDesign(dto, admin.id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "AUDIO_PLATFORM_VOICE_DESIGN_CREATE",
      resourceType: "VOICE_ASSET",
      resourceId: voice.id,
      description: `生成平台设计音色：${voice.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(voice);
  }

  @Get("system-voices")
  async listSystemVoices(
    @Req() request: unknown,
    @Query("keyword") keyword?: string,
    @Query("status") status?: string,
    @Query("language") language?: string,
    @Query("accent") accent?: string,
    @Query("model") model?: string
  ) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.audioService.listAdminSystemVoiceAssets({ keyword, status, language, accent, model }));
  }

  @Get("system-voices/:voice")
  async getSystemVoice(@Req() request: unknown, @Param("voice") voice: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.audioService.getAdminSystemVoiceAsset(voice));
  }

  @Patch("system-voices/:voice")
  async updateSystemVoice(
    @Req() request: unknown,
    @Param("voice") voice: string,
    @Body() dto: UpdateSystemVoiceDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.audioService.updateAdminSystemVoice(voice, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "AUDIO_SYSTEM_VOICE_UPDATE",
      resourceType: "SYSTEM_VOICE",
      resourceId: voice,
      description: `更新系统音色：${result.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Get("voices/:id")
  async getVoice(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.audioService.getAdminVoiceAsset(id));
  }

  @Patch("voices/:id")
  async updatePlatformVoice(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateAdminVoiceAssetDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const voice = await this.audioService.updateAdminPlatformVoiceAsset(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "AUDIO_PLATFORM_VOICE_UPDATE",
      resourceType: "VOICE_ASSET",
      resourceId: id,
      description: `修改平台音色信息：${voice.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(voice);
  }

  @Get("assets/:id/file")
  async getSourceSampleFile(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);
    const file = await this.audioService.getAdminAudioAssetFile(id);

    return new StreamableFile(localAudioStream(file.filepath), {
      type: file.mimeType,
      disposition: `inline; filename="${file.filename}"`,
      length: file.size
    });
  }

  @Patch("voices/:id/review")
  async reviewVoice(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: ReviewVoiceAssetDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const voice = await this.audioService.reviewVoiceAsset(id, dto, admin.id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: `AUDIO_VOICE_${dto.action}`,
      resourceType: "VOICE_ASSET",
      resourceId: id,
      description: `语音音色审核操作：${dto.action}`,
      request: request as HeaderRequestLike
    });

    return successResponse(voice);
  }

  @Delete("voices/:id")
  async deleteVoice(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: DeleteVoiceAssetAdminDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.audioService.deleteVoiceAssetAsAdmin(id, dto, admin.id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "AUDIO_VOICE_DELETE",
      resourceType: "VOICE_ASSET",
      resourceId: id,
      description: "删除违规语音音色",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Get("usage")
  async usage(
    @Req() request: unknown,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("operationType") operationType?: string,
    @Query("model") model?: string
  ) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.audioService.getUsageDashboard({ from, to, operationType, model }));
  }
}

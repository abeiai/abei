import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { AppException } from "../common/app-exception.js";
import { LearnerAccessService, type AuthorizedScenarioTarget } from "../profiles/learner-access.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { AudioService, localAudioStream, type UploadedAudioFileLike } from "./audio.service.js";
import { LearnerAudioCapabilityService } from "./learner-audio-capability.js";
import {
  CreateAudioAssetDto,
  CreateTtsAudioTaskDto,
  CreateVoiceCloneTaskDto,
  CreateVoiceDesignTaskDto,
  SetDefaultVoiceDto,
  UpdateVoiceAssetDto
} from "./dto/audio.dto.js";

@Controller("audio")
export class AudioController {
  constructor(
    @Inject(AudioService) private readonly audioService: AudioService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService,
    @Inject(LearnerAccessService) private readonly learnerAccessService: LearnerAccessService,
    @Inject(LearnerAudioCapabilityService) private readonly learnerAudioCapabilityService: LearnerAudioCapabilityService
  ) {}

  @Get("models")
  async listModels(@Req() request: unknown) {
    const subject = await this.requireSelected(request);
    await this.learnerAccessService.assertHasAuthorizedCapability(subject, "AUDIO");

    return successResponse(await this.audioService.listModelOptions());
  }

  @Get("voices")
  async listVoices(@Req() request: unknown) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    await this.learnerAccessService.assertHasAuthorizedCapability(subject, "AUDIO");

    return successResponse(subject.mode === "LEARNER"
      ? await this.audioService.listLearnerVoiceAssets(user.id)
      : await this.audioService.listVoiceAssets(user.id));
  }

  @Patch("voices/default")
  async setDefaultVoice(@Req() request: unknown, @Body() dto: SetDefaultVoiceDto) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.audioService.setDefaultVoice(user.id, dto));
  }

  @Patch("voices/:id")
  async updateVoice(@Req() request: unknown, @Param("id") id: string, @Body() dto: UpdateVoiceAssetDto) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.audioService.updateVoiceAsset(user.id, id, dto));
  }

  @Delete("voices/:id")
  async deleteVoice(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.audioService.deleteVoiceAsset(user.id, id));
  }

  @Get("assets")
  async listAssets(@Req() request: unknown) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.audioService.listUserAudioAssets(user.id));
  }

  @Post("assets")
  async createAsset(@Req() request: unknown, @Body() dto: CreateAudioAssetDto) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.audioService.createAudioAsset(user.id, dto));
  }

  @Post("assets/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: Number(process.env.AUDIO_UPLOAD_MAX_BYTES ?? 20 * 1024 * 1024)
      }
    })
  )
  async uploadAsset(
    @Req() request: unknown,
    @Query("type") type: "SOURCE_SAMPLE" | "PREVIEW" | "TTS_OUTPUT" = "SOURCE_SAMPLE",
    @UploadedFile() file?: UploadedAudioFileLike
  ) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    if (subject.mode === "ACCOUNT") {
      return successResponse(await this.audioService.uploadAudioAsset(user.id, type, file));
    }
    if (type !== "SOURCE_SAMPLE") {
      throw new AppException(40301, "请切换到主账号身份后操作", 403);
    }
    const root = await this.learnerAccessService.assertScenarioAuthorized(subject, "my-voice-clone");
    return this.runScenario(subject, root, "my-voice-clone", async () => {
      const asset = await this.audioService.uploadAudioAsset(user.id, type, file);
      const proof = this.learnerAudioCapabilityService.issueLearnerSample(
        subject,
        asset.id,
        "my-voice-clone"
      );
      return successResponse(this.audioService.toLearnerAudioAsset(asset, proof));
    });
  }

  @Delete("assets/:id")
  async deleteAsset(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.audioService.deleteAudioAsset(user.id, id));
  }

  @Get("tasks")
  async listTasks(@Req() request: unknown, @Query("profile") profile?: string | string[], @Query("experience") experience?: string) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    return successResponse(experience === "voice"
      ? await this.audioService.listVoiceExperienceTasks(subject)
      : await this.audioService.listUserTasks(subject, profile));
  }

  @Get("tasks/:id")
  async getTask(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    return successResponse(await this.audioService.getUserTask(subject, id));
  }

  @Post("tasks/tts")
  async createTtsTask(@Req() request: unknown, @Body() dto: CreateTtsAudioTaskDto) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    if (subject.mode === "ACCOUNT") {
      await this.learnerAccessService.assertScenarioAuthorized(subject, "article-to-speech");
      if (dto.scenarioId?.trim() && dto.scenarioId.trim() !== "article-to-speech") {
        await this.learnerAccessService.assertScenarioAuthorized(subject, dto.scenarioId.trim());
      }
      return successResponse(await this.audioService.createTtsTask(this.attribution(subject, null), dto));
    }
    if (!dto.scenarioId?.trim()) {
      throw new AppException(40001, "请选择已授权的语音应用", 400);
    }
    this.assertPersonalBilling(dto);
    const root = await this.learnerAccessService.assertScenarioAuthorized(subject, dto.scenarioId);
    const capabilities = Array.isArray(root?.requiredCapabilities) ? root.requiredCapabilities : [];
    if (!capabilities.includes("AUDIO") || !capabilities.includes("TTS")) {
      throw new AppException(40004, "当前应用不支持语音合成", 400);
    }
    return this.runScenario(subject, root, dto.scenarioId, async () =>
      successResponse(this.audioService.toLearnerAudioTask(
        await this.audioService.createTtsTask(this.attribution(subject, root), dto)
      )));
  }

  @Post("tasks/voice-clone")
  async createVoiceCloneTask(@Req() request: unknown, @Body() dto: CreateVoiceCloneTaskDto) {
    const checked = await this.requireScenario(request, "my-voice-clone", dto);
    if (checked.subject.mode === "LEARNER") {
      this.learnerAudioCapabilityService.assertLearnerSample(
        dto.learnerSampleProof ?? "",
        checked.subject,
        dto.sourceAudioAssetId,
        "my-voice-clone"
      );
    }
    return this.runScenario(checked.subject, checked.root, "my-voice-clone", async () => {
      const voice = await this.audioService.createVoiceCloneTask(
        this.attribution(checked.subject, checked.root),
        dto,
        request as HeaderRequestLike
      );
      return successResponse(checked.subject.mode === "LEARNER"
        ? this.audioService.toLearnerVoiceAsset(voice)
        : voice);
    });
  }

  @Post("tasks/voice-design")
  async createVoiceDesignTask(@Req() request: unknown, @Body() dto: CreateVoiceDesignTaskDto) {
    const checked = await this.requireScenario(request, "brand-voice-design", dto);
    return this.runScenario(checked.subject, checked.root, "brand-voice-design", async () => {
      const voice = await this.audioService.createVoiceDesignTask(
        this.attribution(checked.subject, checked.root),
        dto
      );
      return successResponse(checked.subject.mode === "LEARNER"
        ? this.audioService.toLearnerVoiceAsset(voice)
        : voice);
    });
  }

  @Get("files/:filename")
  async file(@Param("filename") filename: string, @Res() response: unknown) {
    const file = await this.audioService.getLocalAudioFile(filename);
    const res = response as {
      setHeader(name: string, value: string | number): void;
      status(code: number): { end(): void };
    } & NodeJS.WritableStream;

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", file.size);
    res.setHeader("Cache-Control", "private, max-age=3600");

    localAudioStream(file.filepath).pipe(res);
  }

  private async requireSelected(request: unknown) {
    const user = await this.authService.me(request as never);
    return this.profileContextService.requireSelected(request as never, user.id);
  }

  private async requireScenario(
    request: unknown,
    scenario: string,
    billing?: { billingContext?: string; organizationId?: string }
  ) {
    const subject = await this.requireSelected(request);
    this.assertPersonalBillingForSubject(subject, billing);
    const root = await this.learnerAccessService.assertScenarioAuthorized(subject, scenario);
    return { subject, root };
  }

  private assertPersonalBilling(input: { billingContext?: string; organizationId?: string }) {
    if (input.billingContext === "ORGANIZATION" || input.organizationId) {
      throw new AppException(40301, "学习者身份仅支持个人点数", 403);
    }
  }

  private assertPersonalBillingForSubject(
    subject: ProfileSubject,
    input?: { billingContext?: string; organizationId?: string }
  ) {
    if (subject.mode === "LEARNER" && input) this.assertPersonalBilling(input);
  }

  private runScenario<T>(
    subject: ProfileSubject,
    root: AuthorizedScenarioTarget | null,
    requested: string,
    callback: () => Promise<T>
  ) {
    return this.learnerAccessService.runWithScenarioAuthorization(subject, root?.slug ?? requested, callback);
  }

  private attribution(subject: ProfileSubject, root: AuthorizedScenarioTarget | null) {
    return {
      userId: subject.userId,
      learnerId: subject.learnerId,
      rootScenarioId: root?.id ?? null
    };
  }

}

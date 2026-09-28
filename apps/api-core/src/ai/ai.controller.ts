import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { AppException } from "../common/app-exception.js";
import { successResponse } from "../common/api-response.js";
import { LearnerAccessService, type AuthorizedScenarioTarget } from "../profiles/learner-access.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import { AiService } from "./ai.service.js";
import { CreateAiChatDto } from "./dto/create-ai-chat.dto.js";
import { CreateAiTaskDto } from "./dto/create-ai-task.dto.js";
import { CreateImageGenerationDto } from "./dto/create-image-generation.dto.js";
import { CreateStudentPhotoDto } from "./dto/create-student-photo.dto.js";
import { CreateVideoGenerationDto } from "./dto/create-video-generation.dto.js";

@Controller("ai")
export class AiController {
  constructor(
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService,
    @Inject(LearnerAccessService) private readonly learnerAccessService: LearnerAccessService
  ) {}

  @Get("scenarios")
  async scenarios(@Req() request: unknown) {
    const rows = await this.aiService.listScenarios();
    const subject = await this.optionalSubject(request);
    return successResponse(subject?.mode === "LEARNER"
      ? await this.learnerAccessService.filterAuthorizedScenarios(subject, rows)
      : rows);
  }

  @Get("tool-categories")
  async toolCategories() {
    return successResponse(await this.aiService.listToolCategories(false));
  }

  @Get("tools")
  async tools(@Req() request: unknown, @Query("category") category?: string) {
    const rows = await this.aiService.listTools(category);
    const subject = await this.optionalSubject(request);
    return successResponse(subject?.mode === "LEARNER"
      ? await this.learnerAccessService.filterAuthorizedScenarios(subject, rows)
      : rows);
  }

  @Get("tools/:slug")
  async tool(@Req() request: unknown, @Param("slug") slug: string) {
    const row = await this.aiService.getTool(slug);
    const subject = await this.optionalSubject(request);
    if (subject?.mode === "LEARNER") {
      const visible = await this.learnerAccessService.filterAuthorizedScenarios(subject, [row]);
      if (visible.length === 0) {
        throw new AppException(40301, "当前学习者未获得此应用授权", 403);
      }
    }
    return successResponse(row);
  }

  @Get("chat/models")
  async chatModels() {
    return successResponse(await this.aiService.listChatModels());
  }

  @Get("image/models")
  async imageModels() {
    return successResponse(await this.aiService.listImageModels());
  }

  @Get("video/models")
  async videoModels() {
    return successResponse(await this.aiService.listVideoModels());
  }

  @Post("image/generate")
  async generateImage(@Req() request: unknown, @Body() dto: CreateImageGenerationDto) {
    const checked = await this.requireScenario(request, "experience-image-generation", dto);
    return this.runScenario(checked, "experience-image-generation", async () =>
      successResponse(await this.aiService.generateImage(checked.subject, dto)));
  }

  @Post("image/student-photo")
  async generateStudentPhoto(@Req() request: unknown, @Body() dto: CreateStudentPhotoDto) {
    const checked = await this.requireScenario(request, "experience-image-generation");
    return this.runScenario(checked, "experience-image-generation", async () =>
      successResponse(await this.aiService.generateStudentPhoto(checked.subject, dto)));
  }

  @Get("image/student-photo/history")
  async studentPhotoHistory(@Req() request: unknown, @Query("cursor") cursor?: string) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    return successResponse(await this.aiService.listStudentPhotoHistory(subject, cursor));
  }

  @Get("image/student-photo/status/:clientRequestId")
  async studentPhotoStatus(@Req() request: unknown, @Param("clientRequestId") clientRequestId: string) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    return successResponse(await this.aiService.getStudentPhotoRequestStatus(subject, clientRequestId));
  }

  @Get("image/student-photo/history/:taskId/images/:index")
  async studentPhotoImage(@Req() request: unknown, @Res() response: unknown,
    @Param("taskId") taskId: string, @Param("index") index: string) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    const image = await this.aiService.getStudentPhotoImage(subject, taskId, Number(index));
    const res = response as { setHeader(name: string, value: string): void; end(data: Buffer): void };
    res.setHeader("Content-Type", image.mimeType);
    res.setHeader("Cache-Control", "private, no-store");
    res.end(image.body);
  }

  @Post("video/generate")
  async generateVideo(@Req() request: unknown, @Body() dto: CreateVideoGenerationDto) {
    const checked = await this.requireScenario(request, "experience-video-generation", dto);
    return this.runScenario(checked, "experience-video-generation", async () =>
      successResponse(await this.aiService.generateVideo(checked.subject, dto)));
  }

  @Get("video/tasks/:taskId")
  async videoTask(
    @Req() request: unknown,
    @Param("taskId") taskId: string
  ) {
    const checked = await this.requireScenario(request, "experience-video-generation");
    return this.runScenario(checked, "experience-video-generation", async () =>
      successResponse(await this.aiService.getVideoGenerationTask(checked.subject, taskId)));
  }

  @Post("chat/stream")
  async chatStream(
    @Req() request: unknown,
    @Res() response: unknown,
    @Body() dto: CreateAiChatDto
  ) {
    const checked = await this.requireScenario(request, "experience-ai-chat", dto);
    const res = response as {
      setHeader(name: string, value: string): void;
      write(chunk: string): void;
      end(): void;
    };
    const req = request as {
      on(event: "close", listener: () => void): void;
    };
    const controller = new AbortController();
    let finished = false;

    req.on("close", () => {
      if (!finished) {
        controller.abort();
      }
    });
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    try {
      await this.runScenario(checked, "experience-ai-chat", () => this.aiService.createChatStream(
        checked.subject, dto, (event) => res.write(`data: ${JSON.stringify(event)}\n\n`), controller.signal
      ));
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "AI 对话失败，请稍后再试"
        })}\n\n`
      );
    } finally {
      finished = true;
      res.end();
    }
  }

  @Post("tasks")
  async createTask(@Req() request: unknown, @Body() dto: CreateAiTaskDto) {
    const checked = await this.requireScenario(request, dto.scenarioId, dto);
    return this.runScenario(checked, dto.scenarioId, async () =>
      successResponse(await this.aiService.createTask(checked.subject, dto)));
  }

  @Post("tasks/stream")
  async createTaskStream(
    @Req() request: unknown,
    @Res() response: unknown,
    @Body() dto: CreateAiTaskDto
  ) {
    const checked = await this.requireScenario(request, dto.scenarioId, dto);
    const res = response as {
      setHeader(name: string, value: string): void;
      write(chunk: string): void;
      end(): void;
    };
    const req = request as {
      on(event: "close", listener: () => void): void;
    };
    const controller = new AbortController();
    let finished = false;

    req.on("close", () => {
      if (!finished) {
        controller.abort();
      }
    });
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    try {
      await this.runScenario(checked, dto.scenarioId, () => this.aiService.createTaskStream(
        checked.subject, dto, (event) => res.write(`data: ${JSON.stringify(event)}\n\n`), controller.signal
      ));
    } finally {
      finished = true;
      res.end();
    }
  }

  @Get("tasks")
  async tasks(@Req() request: unknown, @Query("profile") profile?: string | string[]) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    return successResponse(await this.aiService.listUserTasks(subject, profile));
  }

  @Get("tasks/:id")
  async task(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    return successResponse(await this.aiService.getTask(subject, id));
  }

  private async optionalSubject(request: unknown): Promise<ProfileSubject | null> {
    try {
      const user = await this.authService.me(request as never);
      const context = await this.profileContextService.optional(request as never, user.id);
      return context?.mode === "LEARNER"
        ? { userId: user.id, mode: "LEARNER", learnerId: context.learnerId }
        : context?.mode === "ACCOUNT"
          ? { userId: user.id, mode: "ACCOUNT", learnerId: null }
          : null;
    } catch (error) {
      if (error instanceof AppException && error.code === 40101 && error.message === "请先登录") return null;
      throw error;
    }
  }

  private async requireScenario(
    request: unknown,
    scenarioIdOrSlug: string,
    billing?: { billingContext?: string; organizationId?: string }
  ) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    const root = await this.learnerAccessService.assertScenarioAuthorized(subject, scenarioIdOrSlug);
    if (subject.mode === "LEARNER" && (billing?.billingContext === "ORGANIZATION" || billing?.organizationId)) {
      throw new AppException(40301, "学习者身份仅支持个人点数", 403);
    }
    return { subject, root };
  }

  private runScenario<T>(
    checked: { subject: ProfileSubject; root: AuthorizedScenarioTarget | null },
    requestedScenario: string,
    callback: () => Promise<T>
  ) {
    return this.learnerAccessService.runWithScenarioAuthorization(
      checked.subject,
      checked.root?.slug ?? requestedScenario,
      callback
    );
  }

}

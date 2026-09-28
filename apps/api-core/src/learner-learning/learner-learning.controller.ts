import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { AppException } from "../common/app-exception.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import type { RequestLike } from "../profiles/profile-context.types.js";
import {
  AccountLearnerLearningQueryDto,
  LearnerLearningHeartbeatDto,
  LearnerLearningMaterialsQueryDto,
  LearnerLearningOverviewQueryDto,
  RecordLearnerLearningEventsDto,
  StartLearnerLearningSessionDto
} from "./dto/learner-learning.dto.js";
import { learnerLearningEnabled } from "./learner-learning.constants.js";
import { LearnerLearningSessionService } from "./learner-learning-session.service.js";
import { LearnerLearningQueryService } from "./learner-learning-query.service.js";
import { LearnerLearningEventService } from "./learner-learning-event.service.js";

@Controller("profiles/learner/learning")
export class LearnerLearningController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService)
    private readonly profileContextService: ProfileContextService,
    @Inject(LearnerLearningSessionService)
    private readonly sessionService: LearnerLearningSessionService,
    @Inject(LearnerLearningQueryService)
    private readonly queryService: LearnerLearningQueryService,
    @Inject(LearnerLearningEventService)
    private readonly eventService: LearnerLearningEventService
  ) {}

  @Get("overview")
  async overview(
    @Req() request: unknown,
    @Query() query: LearnerLearningOverviewQueryDto
  ) {
    this.requireEnabled();
    const selected = await this.requireLearnerSession(request);
    const defaults = this.queryService.defaultRange();
    return successResponse(
      await this.queryService.getOverview({
        userId: selected.subject.userId,
        learnerId: selected.subject.learnerId,
        from: query.from ?? defaults.from,
        to: query.to ?? defaults.to
      })
    );
  }

  @Get("materials")
  async materials(
    @Req() request: unknown,
    @Query() query: LearnerLearningMaterialsQueryDto
  ) {
    this.requireEnabled();
    const selected = await this.requireLearnerSession(request);
    return successResponse(
      await this.queryService.getMaterials({
        userId: selected.subject.userId,
        learnerId: selected.subject.learnerId,
        limit: query.limit
      })
    );
  }

  @Get("materials/:materialType/:materialId")
  async materialDetail(
    @Req() request: unknown,
    @Param("materialType") materialType: string,
    @Param("materialId") materialId: string
  ) {
    this.requireEnabled();
    const selected = await this.requireLearnerSession(request);
    return successResponse(
      await this.queryService.getMaterialDetail({
        userId: selected.subject.userId,
        learnerId: selected.subject.learnerId,
        materialType,
        materialId
      })
    );
  }

  @Post("sessions")
  async start(
    @Req() request: unknown,
    @Body() dto: StartLearnerLearningSessionDto
  ) {
    this.requireEnabled();
    const selected = await this.requireLearnerSession(request);
    return successResponse(
      await this.sessionService.start(
        selected.subject,
        selected.refreshTokenId,
        dto
      )
    );
  }

  @Post("sessions/:id/heartbeat")
  async heartbeat(
    @Req() request: unknown,
    @Param("id") sessionId: string,
    @Body() dto: LearnerLearningHeartbeatDto
  ) {
    this.requireEnabled();
    const selected = await this.requireLearnerSession(request);
    return successResponse(
      await this.sessionService.heartbeat(
        selected.subject,
        selected.refreshTokenId,
        sessionId,
        dto
      )
    );
  }

  @Post("sessions/:id/end")
  async end(@Req() request: unknown, @Param("id") sessionId: string) {
    this.requireEnabled();
    const selected = await this.requireLearnerSession(request);
    return successResponse(
      await this.sessionService.end(
        selected.subject,
        selected.refreshTokenId,
        sessionId
      )
    );
  }

  @Post("sessions/:id/events")
  async events(
    @Req() request: unknown,
    @Param("id") sessionId: string,
    @Body() dto: RecordLearnerLearningEventsDto
  ) {
    this.requireEnabled();
    const selected = await this.requireLearnerSession(request);
    return successResponse(
      await this.eventService.recordBatch(
        selected.subject,
        selected.refreshTokenId,
        sessionId,
        dto
      )
    );
  }

  private async requireLearnerSession(request: unknown) {
    const user = await this.authService.me(request as never);
    const selected = await this.profileContextService.requireSelectedSession(
      request as RequestLike,
      user.id
    );
    if (selected.subject.mode !== "LEARNER") {
      throw new AppException(40301, "请使用学习者身份记录学习情况", 403);
    }
    return selected as {
      subject: Extract<typeof selected.subject, { mode: "LEARNER" }>;
      refreshTokenId: string;
    };
  }

  private requireEnabled() {
    if (!learnerLearningEnabled()) {
      throw new AppException(40401, "学习记录功能暂未开放", 404);
    }
  }
}

@Controller("profiles/learners/:learnerId/learning")
export class LearnerLearningAccountController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService)
    private readonly profileContextService: ProfileContextService,
    @Inject(LearnerLearningQueryService)
    private readonly queryService: LearnerLearningQueryService
  ) {}

  @Get("overview")
  async overview(
    @Req() request: unknown,
    @Param("learnerId") learnerId: string,
    @Query() query: AccountLearnerLearningQueryDto
  ) {
    this.requireEnabled();
    const userId = await this.requireAccount(request);
    return successResponse(
      await this.queryService.getAccountOverview(userId, learnerId, query)
    );
  }

  @Get("materials")
  async materials(
    @Req() request: unknown,
    @Param("learnerId") learnerId: string,
    @Query() query: AccountLearnerLearningQueryDto
  ) {
    this.requireEnabled();
    const userId = await this.requireAccount(request);
    return successResponse(
      await this.queryService.getAccountMaterials(userId, learnerId, query)
    );
  }

  @Get("materials/:materialType/:materialId")
  async detail(
    @Req() request: unknown,
    @Param("learnerId") learnerId: string,
    @Param("materialType") materialType: string,
    @Param("materialId") materialId: string
  ) {
    this.requireEnabled();
    const userId = await this.requireAccount(request);
    return successResponse(
      await this.queryService.getAccountMaterialDetail(
        userId,
        learnerId,
        materialType,
        materialId
      )
    );
  }

  private async requireAccount(request: unknown) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as RequestLike, user.id);
    return user.id;
  }

  private requireEnabled() {
    if (!learnerLearningEnabled()) {
      throw new AppException(40401, "学习记录功能暂未开放", 404);
    }
  }
}

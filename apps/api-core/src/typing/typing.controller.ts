import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import {
  CreateTypingReviewSessionDto,
  CreateTypingSessionDto,
  ListTypingLibrariesDto,
  ListTypingReviewsDto,
  ResetTypingReviewDto,
  SubmitTypingAttemptDto,
  UpdateTypingPreferencesDto,
  UpdateTypingSessionTimeDto
} from "./dto/typing.dto.js";
import { TypingService } from "./typing.service.js";

@Controller("typing")
export class TypingController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService,
    @Inject(LearnerAccessService) private readonly learnerAccessService: LearnerAccessService,
    @Inject(TypingService) private readonly typingService: TypingService
  ) {}

  @Get("libraries")
  async listLibraries(@Query() dto: ListTypingLibrariesDto) {
    return successResponse(await this.typingService.listLibraries(dto));
  }

  @Get("libraries/:id")
  async getLibrary(@Param("id") id: string) {
    return successResponse(await this.typingService.getLibrary(id));
  }

  @Get("libraries/:id/progress")
  async getLibraryProgress(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.getLibraryProgress(subject, id)));
  }

  @Post("sessions")
  async createSession(@Req() request: unknown, @Body() dto: CreateTypingSessionDto) {
    return this.authorized(request, async (subject, scenarioId) =>
      successResponse(await this.typingService.createSession(subject, scenarioId, dto)));
  }

  @Get("sessions/active")
  async getActiveSession(@Req() request: unknown) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.getActiveSession(subject)));
  }

  @Get("sessions/:id")
  async getSession(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.getSession(subject, id)));
  }

  @Post("sessions/:id/attempts")
  async submitAttempt(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: SubmitTypingAttemptDto
  ) {
    return this.authorized(request, async (subject, scenarioId) =>
      successResponse(await this.typingService.submitAttempt(subject, scenarioId, id, dto)));
  }

  @Post("sessions/:id/hints")
  async requestHint(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.requestHint(subject, id)));
  }

  @Post("sessions/:id/next")
  async nextQuestion(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (subject, scenarioId) =>
      successResponse(await this.typingService.nextQuestion(subject, scenarioId, id)));
  }

  @Post("sessions/:id/pause")
  async pauseSession(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateTypingSessionTimeDto
  ) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.pauseSession(subject, id, dto)));
  }

  @Post("sessions/:id/resume")
  async resumeSession(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.resumeSession(subject, id)));
  }

  @Post("sessions/:id/finish")
  async finishSession(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateTypingSessionTimeDto
  ) {
    return this.authorized(request, async (subject, scenarioId) =>
      successResponse(await this.typingService.finishSession(subject, scenarioId, id, dto)));
  }

  @Get("reviews/summary")
  async reviewSummary(@Req() request: unknown) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.reviewSummary(subject)));
  }

  @Get("reviews")
  async listReviews(@Req() request: unknown, @Query() dto: ListTypingReviewsDto) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.listReviews(subject, dto)));
  }

  @Post("reviews/sessions")
  async createReviewSession(
    @Req() request: unknown,
    @Body() dto: CreateTypingReviewSessionDto
  ) {
    return this.authorized(request, async (subject, scenarioId) =>
      successResponse(await this.typingService.createReviewSession(subject, scenarioId, dto)));
  }

  @Post("reviews/:itemId/reset")
  async resetReview(
    @Req() request: unknown,
    @Param("itemId") itemId: string,
    @Body() dto: ResetTypingReviewDto
  ) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.resetReview(subject, itemId, dto.confirm)));
  }

  @Get("history")
  async history(@Req() request: unknown) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.history(subject)));
  }

  @Get("preferences")
  async getPreferences(@Req() request: unknown) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.getPreferences(subject)));
  }

  @Put("preferences")
  async updatePreferences(
    @Req() request: unknown,
    @Body() dto: UpdateTypingPreferencesDto
  ) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.typingService.updatePreferences(subject, dto)));
  }

  private async authorized<T>(
    request: unknown,
    callback: (subject: ProfileSubject, scenarioId: string | null) => Promise<T>
  ) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    const root = await this.learnerAccessService.assertScenarioAuthorized(subject, "typing");
    return this.learnerAccessService.runWithScenarioAuthorization(
      subject,
      root?.slug ?? "typing",
      () => callback(subject, root?.id ?? null)
    );
  }
}

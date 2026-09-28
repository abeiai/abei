import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import {
  GenerateLearningFlashcardDeckDto,
  ImportLearningFlashcardDeckDto,
  ReviewLearningFlashcardDto,
  UpdateLearningFlashcardDto
} from "./dto/learning-flashcards.dto.js";
import { LearningFlashcardsService } from "./learning-flashcards.service.js";

@Controller("learning-flashcards")
export class LearningFlashcardsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(LearningFlashcardsService) private readonly learningFlashcardsService: LearningFlashcardsService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService,
    @Inject(LearnerAccessService) private readonly learnerAccessService: LearnerAccessService
  ) {}

  @Get("decks")
  async listDecks(@Req() request: unknown) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.learningFlashcardsService.listUserDecks(subject)));
  }

  @Get("decks/:id")
  async getDeck(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.learningFlashcardsService.getUserDeck(subject, id)));
  }

  @Post("decks/generate")
  async generateDeck(@Req() request: unknown, @Body() dto: GenerateLearningFlashcardDeckDto) {
    return this.authorized(request, async (_subject, attribution) =>
      successResponse(await this.learningFlashcardsService.generateDeck(attribution, dto)));
  }

  @Post("decks/import")
  async importDeck(@Req() request: unknown, @Body() dto: ImportLearningFlashcardDeckDto) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.learningFlashcardsService.importDeck(subject, dto)));
  }

  @Patch("cards/:id")
  async updateCard(@Req() request: unknown, @Param("id") id: string, @Body() dto: UpdateLearningFlashcardDto) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.learningFlashcardsService.updateCard(subject, id, dto)));
  }

  @Post("cards/:id/review")
  async reviewCard(@Req() request: unknown, @Param("id") id: string, @Body() dto: ReviewLearningFlashcardDto) {
    return this.authorized(request, async (subject) =>
      successResponse(await this.learningFlashcardsService.reviewCard(subject, id, dto)));
  }

  private async authorized<T>(
    request: unknown,
    callback: (
      subject: ProfileSubject,
      attribution: { userId: string; learnerId: string | null; rootScenarioId: string | null }
    ) => Promise<T>
  ) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    const root = await this.learnerAccessService.assertScenarioAuthorized(subject, "learning-flashcards-deck");
    return this.learnerAccessService.runWithScenarioAuthorization(
      subject,
      root?.slug ?? "learning-flashcards-deck",
      () => callback(subject, {
        userId: subject.userId,
        learnerId: subject.learnerId,
        rootScenarioId: root?.id ?? null
      })
    );
  }
}

@Controller("public/learning-flashcards")
export class PublicLearningFlashcardsController {
  constructor(
    @Inject(LearningFlashcardsService) private readonly learningFlashcardsService: LearningFlashcardsService
  ) {}

  @Get("decks/:id")
  async getDeck(@Param("id") id: string) {
    return successResponse(await this.learningFlashcardsService.getPublicCourseDeck(id));
  }
}

import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { AppException } from "../common/app-exception.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { AudioDialogueService } from "./audio-dialogue.service.js";
import { validateDialogueInput } from "./audio-dialogue.types.js";
import { ConfirmDialogueGenerationDto } from "./dto/audio-dialogue.dto.js";

@Controller("audio/dialogue")
export class AudioDialogueController {
  constructor(
    @Inject(AudioDialogueService) private readonly dialogue: AudioDialogueService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ProfileContextService) private readonly profiles: ProfileContextService,
    @Inject(LearnerAccessService) private readonly access: LearnerAccessService
  ) {}
  private async authorized(request: unknown) {
    const user = await this.auth.me(request as never);
    const subject = await this.profiles.requireSelected(request as never, user.id);
    const root = await this.access.assertScenarioAuthorized(subject, "article-to-speech");
    return { subject, root };
  }
  @Get("projects")
  async list(@Req() request: unknown) {
    const { subject } = await this.authorized(request);
    return successResponse(await this.dialogue.list(subject));
  }
  @Get("projects/:id")
  async get(@Req() request: unknown, @Param("id") id: string) {
    const { subject } = await this.authorized(request);
    return successResponse(await this.dialogue.get(subject, id));
  }
  @Post("quotes")
  async quote(@Req() request: unknown, @Body() body: unknown) {
    const { subject, root } = await this.authorized(request);
    const input = validateDialogueInput(body);
    if (subject.mode === "LEARNER" && input.billingContext !== "PERSONAL") throw new AppException(40301, "学习者身份仅支持个人点数", 403);
    return this.access.runWithScenarioAuthorization(subject, root?.slug ?? "article-to-speech", async () =>
      successResponse(await this.dialogue.quote(subject, input, root?.id ?? null)));
  }
  @Post("generations")
  async confirm(@Req() request: unknown, @Body() body: ConfirmDialogueGenerationDto) {
    const { subject, root } = await this.authorized(request);
    return this.access.runWithScenarioAuthorization(subject, root?.slug ?? "article-to-speech", async () =>
      successResponse(await this.dialogue.confirm(subject, body.quoteId)));
  }
  @Post("projects/:id/merge")
  async merge(@Req() request: unknown, @Param("id") id: string) {
    const { subject } = await this.authorized(request);
    return successResponse(await this.dialogue.remerge(subject, id));
  }
}

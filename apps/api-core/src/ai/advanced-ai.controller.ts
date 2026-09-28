import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { AdvancedAiService } from "./advanced-ai.service.js";
import { AgentToolRunDto } from "./dto/advanced-ai.dto.js";

@Controller("ai")
export class AdvancedAiController {
  constructor(
    @Inject(AdvancedAiService) private readonly advancedAiService: AdvancedAiService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService
  ) {}

  @Post("agent-tools/run")
  async runTool(@Req() request: unknown, @Body() dto: AgentToolRunDto) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);

    return successResponse(await this.advancedAiService.runAgentTool(user.id, dto));
  }
}

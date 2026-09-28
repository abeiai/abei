import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { readCookie } from "../security/cookies.js";
import { referralCookie } from "./referral-rules.js";
import { ReferralService } from "./referral.service.js";

@Controller("referrals")
export class ReferralController {
  constructor(@Inject(ReferralService) private readonly service: ReferralService, @Inject(AuthService) private readonly auth: AuthService, @Inject(ProfileContextService) private readonly profiles: ProfileContextService) {}

  @Get("profile/:handle")
  async profile(@Param("handle") handle: string) { return successResponse(await this.service.publicProfile(handle)); }

  @Post("visit/:handle")
  async visit(@Param("handle") handle: string, @Req() request: unknown) {
    return successResponse(await this.service.capture(handle, readCookie(request as never, referralCookie)));
  }

  @Get("me")
  async me(@Req() request: unknown) {
    const user = await this.auth.me(request as never);
    await this.profiles.requireAccount(request as never, user.id);
    return successResponse(await this.service.me(user.id));
  }

  @Post("alias")
  async alias(@Req() request: unknown, @Body() body: { name?: unknown }) {
    const user = await this.auth.me(request as never);
    await this.profiles.requireAccount(request as never, user.id);
    return successResponse(await this.service.bindAlias(user.id, body?.name));
  }
}

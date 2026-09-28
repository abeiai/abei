import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AdminReferralController } from "../referrals/admin-referral.controller.js";
import { ReferralController } from "../referrals/referral.controller.js";
import { ReferralService } from "../referrals/referral.service.js";
import { getPrismaClient } from "@xueleai/database";
import { MediaModule } from "../media/media.module.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { WechatAuthController } from "./wechat-auth.controller.js";
import {
  WECHAT_AUTH_PRISMA,
  WechatAuthService
} from "./wechat-auth.service.js";
import {
  WECHAT_OAUTH_STATE_STORE,
  RedisWechatOAuthStateStore
} from "./wechat-oauth-state.store.js";
import { WechatOAuthClient } from "./wechat-oauth.client.js";

@Module({
  imports: [MediaModule, AdminAuthModule],
  controllers: [AuthController, WechatAuthController, ReferralController, AdminReferralController],
  providers: [
    ReferralService,
    AuthService,
    ProfileContextService,
    WechatAuthService,
    {
      provide: WechatOAuthClient,
      useFactory: () => new WechatOAuthClient()
    },
    {
      provide: WECHAT_OAUTH_STATE_STORE,
      useFactory: () => new RedisWechatOAuthStateStore()
    },
    {
      provide: WECHAT_AUTH_PRISMA,
      useFactory: () => getPrismaClient()
    }
  ],
  exports: [AuthService, ProfileContextService]
})
export class AuthModule {}

import { MembershipModule } from "../membership/membership.module.js";
import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { AdminBillingProductController } from "./admin-billing-product.controller.js";
import { AdminPaymentConfigController } from "./admin-payment-config.controller.js";
import { AdminPaymentController } from "./admin-payment.controller.js";
import { AlipayClient } from "./alipay.client.js";
import { PaymentConfigService } from "./payment-config.service.js";
import { PaymentController } from "./payment.controller.js";
import { PaymentService } from "./payment.service.js";
import { WechatPayClient } from "./wechat-pay.client.js";
import { WechatOAuthService } from "./wechat-oauth.service.js";

@Module({
  imports: [MembershipModule, AuthModule, AdminAuthModule, ProfilesModule],
  controllers: [
    PaymentController,
    AdminPaymentController,
    AdminPaymentConfigController,
    AdminBillingProductController
  ],
  providers: [PaymentService, PaymentConfigService, AlipayClient, WechatPayClient, WechatOAuthService]
})
export class PaymentModule {}

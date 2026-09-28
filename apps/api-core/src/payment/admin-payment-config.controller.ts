import { Body, Controller, Get, Inject, Patch, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { UpdatePaymentConfigDto } from "./dto/update-payment-config.dto.js";
import { PaymentConfigService } from "./payment-config.service.js";

@Controller("admin/payment-config")
export class AdminPaymentConfigController {
  constructor(
    @Inject(PaymentConfigService) private readonly paymentConfigService: PaymentConfigService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async getConfig(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.paymentConfigService.getAdminConfig());
  }

  @Patch()
  async updateConfig(@Req() request: unknown, @Body() dto: UpdatePaymentConfigDto) {
    const admin = await this.adminAuthService.me(request as never);
    const config = await this.paymentConfigService.updateConfig(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_PAYMENT_CONFIG",
      resourceType: "PAYMENT_CONFIG",
      resourceId: "site",
      description: "更新支付配置",
      request: request as HeaderRequestLike
    });

    return successResponse(config);
  }
}

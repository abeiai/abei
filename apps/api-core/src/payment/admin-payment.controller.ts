import { Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { PaymentService } from "./payment.service.js";

@Controller("admin/payments")
export class AdminPaymentController {
  constructor(
    @Inject(PaymentService) private readonly paymentService: PaymentService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async listOrders(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);
    return successResponse(await this.paymentService.listAdminOrders());
  }

  @Get("notify-logs")
  async listNotifyLogs(@Req() request: unknown, @Query("orderNo") orderNo?: string) {
    await this.adminAuthService.me(request as never);
    return successResponse(await this.paymentService.listNotifyLogs(orderNo));
  }

  @Get(":id")
  async getOrder(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);
    return successResponse(await this.paymentService.getAdminOrder(id));
  }

  @Post(":id/sync")
  async syncOrder(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.paymentService.syncOrder(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "SYNC_PAYMENT_ORDER",
      resourceType: "PAYMENT_ORDER",
      resourceId: id,
      description: `同步支付订单：${result.order.orderNo}`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Post(":id/supplement")
  async supplementOrder(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.paymentService.supplementOrder(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "SUPPLEMENT_PAYMENT_ORDER",
      resourceType: "PAYMENT_ORDER",
      resourceId: id,
      description: `手动补单：${result.order.orderNo}，渠道状态 ${result.channelStatus}`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }
}

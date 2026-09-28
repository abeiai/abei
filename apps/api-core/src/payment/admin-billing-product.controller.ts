import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { UpsertBillingProductDto } from "./dto/billing-product.dto.js";
import { PaymentService } from "./payment.service.js";

@Controller("admin/products")
export class AdminBillingProductController {
  constructor(
    @Inject(PaymentService) private readonly paymentService: PaymentService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async listProducts(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);
    return successResponse(await this.paymentService.listAdminBillingProducts());
  }

  @Post()
  async createProduct(@Req() request: unknown, @Body() dto: UpsertBillingProductDto) {
    const admin = await this.adminAuthService.me(request as never);
    const product = await this.paymentService.createAdminBillingProduct(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_BILLING_PRODUCT",
      resourceType: "BILLING_PRODUCT",
      resourceId: product.id,
      description: `创建充值产品：${product.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(product);
  }

  @Patch(":id")
  async updateProduct(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpsertBillingProductDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const product = await this.paymentService.updateAdminBillingProduct(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_BILLING_PRODUCT",
      resourceType: "BILLING_PRODUCT",
      resourceId: id,
      description: `更新充值产品：${product.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(product);
  }

  @Delete(":id")
  async deleteProduct(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.paymentService.deleteAdminBillingProduct(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_BILLING_PRODUCT",
      resourceType: "BILLING_PRODUCT",
      resourceId: id,
      description: "删除充值产品",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }
}

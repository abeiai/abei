import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { AdminUsersService } from "./admin-users.service.js";
import { AdjustUserCreditsDto, RechargeUserCreditsDto, UpdateUserStatusDto } from "./dto/admin-user.dto.js";

@Controller("admin/users")
export class AdminUsersController {
  constructor(
    @Inject(AdminUsersService) private readonly adminUsersService: AdminUsersService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.adminUsersService.listUsers());
  }

  @Get(":id")
  async detail(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.adminUsersService.getUserDetail(id));
  }

  @Patch(":id/status")
  async updateStatus(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateUserStatusDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const user = await this.adminUsersService.updateStatus(id, dto.status);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_USER_STATUS",
      resourceType: "USER",
      resourceId: id,
      description: `将用户 ${user.email} 状态更新为${user.statusName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(user);
  }

  @Post(":id/credits/adjust")
  async adjustCredits(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: AdjustUserCreditsDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.adminUsersService.adjustCredits(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "ADMIN_ADJUST_CREDITS",
      resourceType: "USER",
      resourceId: id,
      description: `为用户 ${result.user.email} 调整 ${dto.amount} 点，原因：${dto.reason.trim()}`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Post(":id/credits/recharge")
  async rechargeCredits(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: RechargeUserCreditsDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.adminUsersService.rechargeCredits(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "ADMIN_RECHARGE_CREDITS",
      resourceType: "USER",
      resourceId: id,
      description: `为用户 ${result.user.email} 充值 ${dto.amount} 点，原因：${result.ledgerEntry.note ?? "管理员充值"}`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }
}

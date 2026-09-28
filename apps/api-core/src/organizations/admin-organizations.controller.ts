import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import {
  AdjustOrganizationCreditsDto,
  AdminCreateOrganizationDto,
  AdminUpdateOrganizationDto
} from "./dto/organization.dto.js";
import { OrganizationsService } from "./organizations.service.js";

@Controller("admin/organizations")
export class AdminOrganizationsController {
  constructor(
    @Inject(OrganizationsService) private readonly organizationsService: OrganizationsService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async list(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.organizationsService.listAdminOrganizations());
  }

  @Get(":id")
  async detail(@Req() request: unknown, @Param("id") id: string) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.organizationsService.getAdminOrganization(id));
  }

  @Post()
  async create(@Req() request: unknown, @Body() dto: AdminCreateOrganizationDto) {
    const admin = await this.adminAuthService.me(request as never);
    const organization = await this.organizationsService.createAdminOrganization(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "ADMIN_CREATE_ORGANIZATION",
      resourceType: "ORGANIZATION",
      resourceId: organization.id,
      description: `新建企业账号：${organization.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(organization);
  }

  @Patch(":id")
  async update(@Req() request: unknown, @Param("id") id: string, @Body() dto: AdminUpdateOrganizationDto) {
    const admin = await this.adminAuthService.me(request as never);
    const organization = await this.organizationsService.updateAdminOrganization(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "ADMIN_UPDATE_ORGANIZATION",
      resourceType: "ORGANIZATION",
      resourceId: id,
      description: `更新企业账号：${organization.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(organization);
  }

  @Post(":id/credits/adjust")
  async adjustCredits(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: AdjustOrganizationCreditsDto
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.organizationsService.adjustOrganizationCredits(admin.id, id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "ADMIN_ADJUST_ORGANIZATION_CREDITS",
      resourceType: "ORGANIZATION",
      resourceId: id,
      description: `调整企业点数 ${dto.amount} 点，原因：${dto.reason.trim()}`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }
}

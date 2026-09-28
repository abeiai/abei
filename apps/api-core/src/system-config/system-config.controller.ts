import { Body, Controller, Get, Inject, Patch, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { UpdateSystemConfigDto } from "./dto/update-system-config.dto.js";
import { SystemConfigService } from "./system-config.service.js";

@Controller("system-config")
export class SystemConfigController {
  constructor(
    @Inject(SystemConfigService) private readonly systemConfigService: SystemConfigService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async listConfigs(@Req() request: unknown) {
    await this.requireAdmin(request);
    return successResponse(await this.systemConfigService.listConfigs());
  }

  @Get("public")
  async publicConfigs() {
    return successResponse(await this.systemConfigService.listPublicConfigs());
  }

  @Patch()
  async updateConfigs(@Req() request: unknown, @Body() dto: UpdateSystemConfigDto) {
    const admin = await this.adminAuthService.me(request as never);
    const configs = await this.systemConfigService.updateConfigs(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_SYSTEM_CONFIG",
      resourceType: "SYSTEM_CONFIG",
      resourceId: "site",
      description: "更新系统设置",
      request: request as HeaderRequestLike
    });

    return successResponse(configs);
  }

  private async requireAdmin(request: unknown) {
    await this.adminAuthService.me(request as never);
  }
}

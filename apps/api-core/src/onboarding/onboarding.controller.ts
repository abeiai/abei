import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { CompleteSetupDto, CreateFirstAdminDto, SetupSiteDto } from "./dto/onboarding.dto.js";
import { OnboardingService } from "./onboarding.service.js";

@Controller()
export class OnboardingController {
  constructor(
    @Inject(OnboardingService) private readonly onboardingService: OnboardingService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get("setup/status")
  async setupStatus() {
    return successResponse(await this.onboardingService.getSetupStatus());
  }

  @Post("setup/admin")
  async createFirstAdmin(@Body() dto: CreateFirstAdminDto) {
    return successResponse(await this.onboardingService.createFirstAdmin(dto));
  }

  @Post("admin/setup/site")
  async updateSite(@Req() request: unknown, @Body() dto: SetupSiteDto) {
    const admin = await this.adminAuthService.me(request as never);
    const status = await this.onboardingService.updateSite(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_SETUP_SITE",
      resourceType: "SYSTEM_CONFIG",
      resourceId: "siteName",
      description: `初始化设置站点名称：${dto.siteName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(status);
  }

  @Post("admin/setup/tools")
  async enablePresetTools(@Req() request: unknown) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.onboardingService.enablePresetTools();

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "ENABLE_SETUP_AI_TOOLS",
      resourceType: "AI_SCENARIO",
      resourceId: null,
      description: `初始化启用历史模板：${result.enabledCount} 个`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Post("admin/setup/complete")
  async completeSetup(@Req() request: unknown, @Body() dto: CompleteSetupDto) {
    const admin = await this.adminAuthService.me(request as never);
    const status = await this.onboardingService.completeSetup(dto, admin.id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "COMPLETE_DEVELOPER_ONBOARDING",
      resourceType: "SYSTEM_CONFIG",
      resourceId: "developerOnboardingCompletedAt",
      description: "完成开发者初始化向导",
      request: request as HeaderRequestLike
    });

    return successResponse(status);
  }

  @Get("admin/system/env-check")
  async envCheck(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.onboardingService.getEnvCheck());
  }
}

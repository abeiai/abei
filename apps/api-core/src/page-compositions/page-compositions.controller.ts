import { Body, Controller, Get, Inject, Put, Query, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { UpsertPageCompositionDto } from "./dto/page-composition.dto.js";
import { PageCompositionsService } from "./page-compositions.service.js";

@Controller("page-compositions")
export class PageCompositionsController {
  constructor(
    @Inject(PageCompositionsService) private readonly pageCompositionsService: PageCompositionsService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async listCompositions(@Req() request: unknown) {
    await this.requireAdmin(request);

    return successResponse(await this.pageCompositionsService.listCompositions());
  }

  @Get("target")
  async getByTarget(
    @Req() request: unknown,
    @Query("targetType") targetType?: string,
    @Query("pageId") pageId?: string
  ) {
    await this.requireAdmin(request);

    return successResponse(await this.pageCompositionsService.getByTarget(targetType, pageId));
  }

  @Put("target")
  async upsertByTarget(@Req() request: unknown, @Body() dto: UpsertPageCompositionDto) {
    const admin = await this.requireAdmin(request);
    const composition = await this.pageCompositionsService.upsertByTarget(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPSERT_PAGE_COMPOSITION",
      resourceType: "PAGE_COMPOSITION",
      resourceId: composition.id,
      description: `保存页面编排：${composition.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(composition);
  }

  private requireAdmin(request: unknown) {
    return this.adminAuthService.me(request as never);
  }
}

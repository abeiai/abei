import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { ContentModulesService } from "./content-modules.service.js";
import { CreateContentModuleDto, UpdateContentModuleDto } from "./dto/content-module.dto.js";

@Controller("content-modules")
export class ContentModulesController {
  constructor(
    @Inject(ContentModulesService) private readonly contentModulesService: ContentModulesService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get()
  async listModules(@Req() request: unknown, @Query("type") type?: string) {
    await this.requireAdmin(request);

    return successResponse(await this.contentModulesService.listModules(type));
  }

  @Get(":id")
  async getModule(@Req() request: unknown, @Param("id") id: string) {
    await this.requireAdmin(request);

    return successResponse(await this.contentModulesService.getModule(id));
  }

  @Post()
  async createModule(@Req() request: unknown, @Body() dto: CreateContentModuleDto) {
    const admin = await this.requireAdmin(request);
    const module = await this.contentModulesService.createModule(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_CONTENT_MODULE",
      resourceType: "CONTENT_MODULE",
      resourceId: module.id,
      description: `创建内容模块：${module.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(module);
  }

  @Patch(":id")
  async updateModule(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateContentModuleDto
  ) {
    const admin = await this.requireAdmin(request);
    const module = await this.contentModulesService.updateModule(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_CONTENT_MODULE",
      resourceType: "CONTENT_MODULE",
      resourceId: module.id,
      description: `编辑内容模块：${module.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(module);
  }

  @Delete(":id")
  async deleteModule(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.requireAdmin(request);
    const result = await this.contentModulesService.deleteModule(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_CONTENT_MODULE",
      resourceType: "CONTENT_MODULE",
      resourceId: id,
      description: "删除内容模块",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  private requireAdmin(request: unknown) {
    return this.adminAuthService.me(request as never);
  }
}

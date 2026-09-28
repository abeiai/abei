import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import {
  AddOrganizationMemberDto,
  AdjustMemberQuotaDto,
  AllocateMemberQuotaDto,
  CreateOrganizationDto,
  UpdateOrganizationMemberDto
} from "./dto/organization.dto.js";
import { OrganizationsService } from "./organizations.service.js";

@Controller("organizations")
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService) private readonly organizationsService: OrganizationsService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService
  ) {}

  @Get()
  async list(@Req() request: unknown) {
    const user = await this.requireAccount(request);

    return successResponse(await this.organizationsService.listForUser(user.id));
  }

  @Post()
  async create(@Req() request: unknown, @Body() dto: CreateOrganizationDto) {
    const user = await this.requireAccount(request);

    return successResponse(await this.organizationsService.createOrganization(user.id, dto));
  }

  @Get("users/search")
  async searchUsers(@Req() request: unknown, @Query("q") query = "") {
    const user = await this.requireAccount(request);

    return successResponse(await this.organizationsService.searchUsers(user.id, query));
  }

  @Get(":id")
  async detail(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.requireAccount(request);

    return successResponse(await this.organizationsService.getOrganizationForUser(user.id, id));
  }

  @Post(":id/members")
  async addMember(@Req() request: unknown, @Param("id") id: string, @Body() dto: AddOrganizationMemberDto) {
    const user = await this.requireAccount(request);

    return successResponse(await this.organizationsService.addMember(user.id, id, dto));
  }

  @Patch(":id/members/:memberId")
  async updateMember(
    @Req() request: unknown,
    @Param("id") id: string,
    @Param("memberId") memberId: string,
    @Body() dto: UpdateOrganizationMemberDto
  ) {
    const user = await this.requireAccount(request);

    return successResponse(await this.organizationsService.updateMember(user.id, id, memberId, dto));
  }

  @Post(":id/members/:memberId/quotas")
  async allocateQuota(
    @Req() request: unknown,
    @Param("id") id: string,
    @Param("memberId") memberId: string,
    @Body() dto: AllocateMemberQuotaDto
  ) {
    const user = await this.requireAccount(request);

    return successResponse(await this.organizationsService.allocateQuota(user.id, id, memberId, dto));
  }

  @Post(":id/members/:memberId/quotas/adjust")
  async adjustQuota(
    @Req() request: unknown,
    @Param("id") id: string,
    @Param("memberId") memberId: string,
    @Body() dto: AdjustMemberQuotaDto
  ) {
    const user = await this.requireAccount(request);

    return successResponse(await this.organizationsService.adjustMemberQuota(user.id, id, memberId, dto));
  }

  private async requireAccount(request: unknown) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);
    return user;
  }
}

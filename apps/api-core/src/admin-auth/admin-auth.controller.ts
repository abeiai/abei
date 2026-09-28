import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import { successResponse } from "../common/api-response.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminLoginDto } from "./dto/admin-login.dto.js";

@Controller("admin-auth")
export class AdminAuthController {
  constructor(@Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService) {}

  @Post("login")
  async login(
    @Req() request: unknown,
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) response: unknown
  ) {
    return successResponse(
      await this.adminAuthService.login(dto, response as never, request as never)
    );
  }

  @Post("logout")
  async logout(@Req() request: unknown, @Res({ passthrough: true }) response: unknown) {
    return successResponse(await this.adminAuthService.logout(request as never, response as never));
  }

  @Post("refresh")
  async refresh(@Req() request: unknown, @Res({ passthrough: true }) response: unknown) {
    return successResponse(await this.adminAuthService.refresh(request as never, response as never));
  }

  @Get("me")
  async me(@Req() request: unknown) {
    return successResponse(await this.adminAuthService.me(request as never));
  }
}

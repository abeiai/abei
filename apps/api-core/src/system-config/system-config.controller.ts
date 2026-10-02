import { Body, Controller, Get, HttpStatus, Inject, Param, Patch, Req, Res } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { UpdateSystemConfigDto } from "./dto/update-system-config.dto.js";
import { SystemConfigService } from "./system-config.service.js";
import { MediaService } from "../media/media.service.js";
import { AppException } from "../common/app-exception.js";

@Controller("system-config")
export class SystemConfigController {
  constructor(
    @Inject(SystemConfigService) private readonly systemConfigService: SystemConfigService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService,
    @Inject(MediaService) private readonly mediaService: MediaService
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

  @Get("picture-book-styles/:id/image")
  async pictureBookStyleImage(@Param("id") id: string, @Res() response: { redirect(url: string): void; setHeader(name: string, value: string | number): void; send(body: Buffer): void }) {
    const style = (await this.systemConfigService.pictureBookStyles()).find(item => item.id === id);
    if (!style) throw new AppException(40401, "绘画风格不存在", HttpStatus.NOT_FOUND);
    await this.systemConfigService.assertPictureBookStyleImage(style);
    if (style.imageUrl.startsWith("/picture-book-styles/")) { response.redirect(style.imageUrl); return; }
    const image = await this.mediaService.readPictureBookStoredImage(style.imageUrl);
    response.setHeader("Content-Type", image.mimetype);
    response.setHeader("Content-Length", image.buffer.length);
    response.setHeader("Cache-Control", "public, max-age=300");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(image.buffer);
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

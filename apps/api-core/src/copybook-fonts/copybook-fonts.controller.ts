import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { AuthService, type PublicUser } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import {
  CopybookFontsService,
  fontUploadMaxBytes,
  localFontStream,
  type UploadedFontFileLike
} from "./copybook-fonts.service.js";

@Controller()
export class CopybookFontsController {
  constructor(
    @Inject(CopybookFontsService) private readonly copybookFontsService: CopybookFontsService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService
  ) {}

  @Get("admin/fonts")
  async listFonts(@Req() request: unknown) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.copybookFontsService.listFonts());
  }

  @Get("fonts")
  async listPublicFonts(@Req() request: unknown) {
    const user = await this.currentUserOrNull(request);

    return successResponse(await this.copybookFontsService.listPublicFonts(user?.id));
  }

  @Post("admin/fonts")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: fontUploadMaxBytes()
      }
    })
  )
  async createFont(
    @Req() request: unknown,
    @UploadedFile() file: UploadedFontFileLike | undefined,
    @Body("name") name?: string,
    @Body("sortOrder") sortOrder?: string,
    @Body("suitableTemplates") suitableTemplates?: string | string[]
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const font = await this.copybookFontsService.createFont(admin.id, { name, sortOrder, suitableTemplates }, normalizeUploadedFile(file));

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_COPYBOOK_FONT",
      resourceType: "COPYBOOK_FONT",
      resourceId: font.id,
      description: `创建字帖字体：${font.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(font);
  }

  @Post("fonts")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: fontUploadMaxBytes()
      }
    })
  )
  async createUserFont(
    @Req() request: unknown,
    @UploadedFile() file: UploadedFontFileLike | undefined,
    @Body("name") name?: string,
    @Body("suitableTemplates") suitableTemplates?: string | string[]
  ) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);
    const font = await this.copybookFontsService.createUserFont(user.id, { name, suitableTemplates }, normalizeUploadedFile(file));

    return successResponse(font);
  }

  @Patch("admin/fonts/:id")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: fontUploadMaxBytes()
      }
    })
  )
  async updateFont(
    @Req() request: unknown,
    @Param("id") id: string,
    @UploadedFile() file: UploadedFontFileLike | undefined,
    @Body("name") name?: string,
    @Body("sortOrder") sortOrder?: string,
    @Body("suitableTemplates") suitableTemplates?: string | string[]
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const font = await this.copybookFontsService.updateFont(id, { name, sortOrder, suitableTemplates }, normalizeUploadedFile(file));

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_COPYBOOK_FONT",
      resourceType: "COPYBOOK_FONT",
      resourceId: font.id,
      description: `编辑字帖字体：${font.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(font);
  }

  @Delete("admin/fonts/:id")
  async deleteFont(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const result = await this.copybookFontsService.deleteFont(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_COPYBOOK_FONT",
      resourceType: "COPYBOOK_FONT",
      resourceId: id,
      description: "删除字帖字体",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Delete("fonts/:id")
  async deleteUserFont(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.authService.me(request as never);
    await this.profileContextService.requireAccount(request as never, user.id);
    const result = await this.copybookFontsService.deleteUserFont(user.id, id);

    return successResponse(result);
  }

  @Get("fonts/files/:filename")
  async file(@Req() request: unknown, @Param("filename") filename: string, @Res() response: unknown) {
    const user = await this.currentUserOrNull(request);
    const file = await this.copybookFontsService.getLocalFontFile(filename, user?.id);
    const res = response as {
      setHeader(name: string, value: string | number): void;
      status(code: number): { end(): void };
    } & NodeJS.WritableStream;

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", file.size);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    localFontStream(file.filepath).pipe(res);
  }

  private async currentUserOrNull(request: unknown): Promise<PublicUser | null> {
    try {
      return await this.authService.me(request as never);
    } catch {
      return null;
    }
  }
}

function normalizeUploadedFile(file: UploadedFontFileLike | undefined) {
  if (!file) {
    return undefined;
  }

  if (file.size === 0) {
    return undefined;
  }

  return file;
}

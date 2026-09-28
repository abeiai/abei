import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { localMediaStream, mediaUploadMaxBytes, MediaService } from "./media.service.js";

interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller("media")
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get("admin/assets")
  async listAssets(
    @Req() request: unknown,
    @Query("mediaType") mediaType?: string,
    @Query("sourceType") sourceType?: string,
    @Query("q") q?: string
  ) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.mediaService.listAssets({ mediaType, sourceType, q }));
  }

  @Post("admin/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: mediaUploadMaxBytes()
      }
    })
  )
  async upload(
    @Req() request: unknown,
    @UploadedFile() file?: UploadedFileLike,
    @Body("sourceType") sourceType?: string
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const asset = await this.mediaService.uploadFile(admin.id, file, sourceType);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPLOAD_MEDIA",
      resourceType: "MEDIA_ASSET",
      resourceId: asset.id,
      description: `上传媒体文件：${asset.originalName}`,
      request: request as HeaderRequestLike
    });

    return successResponse(asset);
  }

  @Get("files/:filename")
  async file(@Param("filename") filename: string, @Res() response: unknown) {
    const file = await this.mediaService.getLocalFile(filename);
    const res = response as {
      setHeader(name: string, value: string | number): void;
      status(code: number): { end(): void };
    } & NodeJS.WritableStream;

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", file.size);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    localMediaStream(file.filepath).pipe(res);
  }
}

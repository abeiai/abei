import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { LearningMaterialsService, textbookUploadMaxBytes } from "./learning-materials.service.js";

interface WritableResponse {
  redirect(url: string): void;
  setHeader(name: string, value: string | number): void;
  status(code: number): { end(body?: string): void };
  end(body?: string | Buffer): void;
}

interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller("admin/learning-materials")
export class LearningMaterialsController {
  constructor(
    @Inject(LearningMaterialsService) private readonly learningMaterialsService: LearningMaterialsService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get("textbooks")
  async listTextbooks(@Req() request: unknown, @Query() query: Record<string, string | undefined>) {
    await this.adminAuthService.me(request as never);

    return successResponse(await this.learningMaterialsService.listTextbooks(query));
  }

  @Post("textbooks")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "pdfFile", maxCount: 1 },
        { name: "mdFile", maxCount: 1 }
      ],
      {
        limits: {
          fileSize: textbookUploadMaxBytes()
        }
      }
    )
  )
  async createTextbook(
    @Req() request: unknown,
    @Body() body: Record<string, string | undefined>,
    @UploadedFiles() files?: Record<string, UploadedFileLike[]>
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const textbook = await this.learningMaterialsService.createTextbook(body, files);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_LEARNING_TEXTBOOK",
      resourceType: "LEARNING_MATERIAL_TEXTBOOK",
      resourceId: textbook.id,
      description: `新增教材：${textbook.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(textbook);
  }

  @Patch("textbooks/:id")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "pdfFile", maxCount: 1 },
        { name: "mdFile", maxCount: 1 }
      ],
      {
        limits: {
          fileSize: textbookUploadMaxBytes()
        }
      }
    )
  )
  async updateTextbook(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() body: Record<string, string | undefined>,
    @UploadedFiles() files?: Record<string, UploadedFileLike[]>
  ) {
    const admin = await this.adminAuthService.me(request as never);
    const textbook = await this.learningMaterialsService.updateTextbook(id, body, files);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_LEARNING_TEXTBOOK",
      resourceType: "LEARNING_MATERIAL_TEXTBOOK",
      resourceId: textbook.id,
      description: `编辑教材：${textbook.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(textbook);
  }

  @Delete("textbooks/:id")
  async deleteTextbook(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.adminAuthService.me(request as never);
    const textbook = await this.learningMaterialsService.deleteTextbook(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_LEARNING_TEXTBOOK",
      resourceType: "LEARNING_MATERIAL_TEXTBOOK",
      resourceId: textbook.id,
      description: `删除教材：${textbook.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(textbook);
  }

  @Get("textbooks/:id/download/:format")
  async downloadTextbook(
    @Req() request: unknown,
    @Param("id") id: string,
    @Param("format") format: string,
    @Res() response: unknown
  ) {
    await this.adminAuthService.me(request as never);
    const download = await this.learningMaterialsService.getTextbookDownload(id, format);
    const res = response as WritableResponse;

    if ("redirectUrl" in download) {
      res.redirect(download.redirectUrl);
      return;
    }

    res.setHeader("Content-Type", download.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${download.filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.end(download.content);
  }
}

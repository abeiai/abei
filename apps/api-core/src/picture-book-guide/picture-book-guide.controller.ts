import { Body, CanActivate, Controller, Delete, ExecutionContext, Get, Headers, Inject, Injectable, Param, ParseIntPipe, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors, ValidationPipe } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "../auth/auth.service.js";
import { AppException } from "../common/app-exception.js";
import { successResponse } from "../common/api-response.js";
import type { UploadedFileLike } from "../media/media.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import { guidePdfMaxBytes } from "./picture-book-guide-content.js";
import { GuideAudioDto, GuideBookImportDto, GuideBookQueryDto, GuidePageDto, GuidePdfSelectionDto, GuideSettingsDto, GuideVersionDto } from "./picture-book-guide.dto.js";
import { PictureBookGuideService } from "./picture-book-guide.service.js";
import { PictureBookGuideLibraryService } from "./picture-book-guide-library.service.js";

type GuideRequest = { guideSubject: ProfileSubject & { mode: "ACCOUNT" } };
type BinaryResponse = { setHeader(name: string, value: string | number): void; status(code: number): BinaryResponse; send(buffer?: Buffer): void };
const bookInputPipe = (expectedType: typeof GuideBookQueryDto | typeof GuideBookImportDto) => new ValidationPipe({ expectedType, transform: true, whitelist: true, exceptionFactory: () => new AppException(40001, "请求参数错误", 400) });

@Injectable()
export class PictureBookGuideAccountGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(ProfileContextService) private readonly profiles: ProfileContextService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user = await this.auth.me(request);
    request.guideSubject = await this.profiles.requireAccount(request, user.id);
    return true;
  }
}

@Controller("picture-book-guide")
@UseGuards(PictureBookGuideAccountGuard)
export class PictureBookGuideController {
  constructor(@Inject(PictureBookGuideService) private readonly guides: PictureBookGuideService, @Inject(PictureBookGuideLibraryService) private readonly library: PictureBookGuideLibraryService) {}

  @Get("options")
  options() { return successResponse(this.guides.options()); }

  @Get("books")
  async books(@Req() request: GuideRequest, @Query(bookInputPipe(GuideBookQueryDto)) query: GuideBookQueryDto) { return successResponse(await this.library.list(request.guideSubject.userId, query)); }

  @Post("books")
  async importBook(@Req() request: GuideRequest, @Body(bookInputPipe(GuideBookImportDto)) dto: GuideBookImportDto) { return successResponse(await this.library.import(request.guideSubject.userId, dto)); }

  @Get()
  async list(@Req() request: GuideRequest) { return successResponse(await this.guides.list(request.guideSubject.userId)); }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: guidePdfMaxBytes, files: 1 } }))
  async upload(@Req() request: GuideRequest, @UploadedFile() file?: UploadedFileLike, @Body("prepare") prepare?: string) { return successResponse(await this.guides.upload(request.guideSubject.userId, file, { preparePdfAnalysis: prepare === "1" })); }

  @Get(":id")
  async get(@Req() request: GuideRequest, @Param("id") id: string) { return successResponse(await this.guides.get(request.guideSubject.userId, id)); }

  @Patch(":id")
  async settings(@Req() request: GuideRequest, @Param("id") id: string, @Body() dto: GuideSettingsDto) { return successResponse(await this.guides.settings(request.guideSubject.userId, id, dto)); }

  @Delete(":id")
  async remove(@Req() request: GuideRequest, @Param("id") id: string) { return successResponse(await this.guides.remove(request.guideSubject.userId, id)); }

  @Patch(":id/pages/:pageNumber")
  async updatePage(@Req() request: GuideRequest, @Param("id") id: string, @Param("pageNumber", ParseIntPipe) pageNumber: number, @Body() dto: GuidePageDto) { return successResponse(await this.guides.updatePage(request.guideSubject.userId, id, pageNumber, dto)); }

  @Post(":id/pages/:pageNumber/script")
  async script(@Req() request: GuideRequest, @Param("id") id: string, @Param("pageNumber", ParseIntPipe) pageNumber: number, @Body() dto: GuideVersionDto) { return successResponse(await this.guides.generateScript(request.guideSubject, id, pageNumber, dto.version)); }

  @Post(":id/pages/:pageNumber/analyze")
  async analyzePage(@Req() request: GuideRequest, @Param("id") id: string, @Param("pageNumber", ParseIntPipe) pageNumber: number, @Body() dto: GuideVersionDto) { return successResponse(await this.guides.analyzePdfPage(request.guideSubject, id, pageNumber, dto.version)); }

  @Post(":id/pdf-selection")
  async selectPdfPages(@Req() request: GuideRequest, @Param("id") id: string, @Body() dto: GuidePdfSelectionDto) { return successResponse(await this.guides.finishPdfAnalysis(request.guideSubject, id, dto)); }

  @Post(":id/pdf-overview-batch")
  async pdfOverviewBatch(@Req() request: GuideRequest, @Param("id") id: string, @Body() dto: GuidePdfSelectionDto) { return successResponse(await this.guides.summarizePdfBatch(request.guideSubject, id, dto)); }

  @Post(":id/pages/:pageNumber/audio")
  async audio(@Req() request: GuideRequest, @Param("id") id: string, @Param("pageNumber", ParseIntPipe) pageNumber: number, @Body() dto: GuideAudioDto) { return successResponse(await this.guides.generateAudio(request.guideSubject, id, pageNumber, dto)); }

  @Get(":id/pdf")
  async pdf(@Req() request: GuideRequest, @Param("id") id: string, @Res() response: BinaryResponse) {
    response.setHeader("Content-Disposition", "inline; filename=picture-book.pdf");
    return this.sendFile(request, id, "pdf", response);
  }
  @Get(":id/pages/:pageNumber/image")
  async image(@Req() request: GuideRequest, @Param("id") id: string, @Param("pageNumber", ParseIntPipe) pageNumber: number, @Res() response: BinaryResponse) { return this.sendFile(request, id, "image", response, pageNumber); }

  @Get(":id/pages/:pageNumber/audio")
  async audioFile(@Req() request: GuideRequest, @Param("id") id: string, @Param("pageNumber", ParseIntPipe) pageNumber: number, @Res() response: BinaryResponse, @Headers("range") range?: string, @Query("v") audioTaskId?: string) { return this.sendFile(request, id, "audio", response, pageNumber, range, audioTaskId); }

  private async sendFile(request: GuideRequest, id: string, kind: "pdf" | "image" | "audio", response: BinaryResponse, pageNumber?: number, range?: string, audioTaskId?: string) {
    const file = await this.guides.file(request.guideSubject.userId, id, kind, pageNumber, audioTaskId);
    response.setHeader("Content-Type", file.mimetype);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (kind === "audio") response.setHeader("Accept-Ranges", "bytes");
    if (range && kind === "audio") {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const size = file.buffer.length;
      const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
      const end = Math.min(match?.[1] && match[2] ? Number(match[2]) : size - 1, size - 1);
      if (!match || (!match[1] && (!match[2] || Number(match[2]) <= 0)) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
        response.setHeader("Content-Range", `bytes */${size}`);
        throw new AppException(41601, "语音播放范围无效", 416);
      }
      const buffer = file.buffer.subarray(start, end + 1);
      response.status(206);
      response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      response.setHeader("Content-Length", buffer.length);
      response.send(buffer);
      return;
    }
    response.setHeader("Content-Length", file.buffer.length);
    response.send(file.buffer);
  }
}

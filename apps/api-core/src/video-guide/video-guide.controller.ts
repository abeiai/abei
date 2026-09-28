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
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import {
  CheckVideoGuideUploadDto,
  CreateVideoGuideDraftDto,
  CreateVideoGuideLessonDto,
  EstimateVideoGuideNarrationAudioDto,
  GenerateVideoGuideNarrationAudioDto,
  GenerateVideoGuidePracticeDto,
  GenerateVideoGuideSubtitleDto,
  ReadVideoGuideSubtitleTextDto,
  UpdateVideoGuideLessonTitleDto,
  UpdateVideoGuideLessonSubtitleDto,
  UpdateVideoGuideNarrationScriptDto,
  videoGuideSubtitleMaxBytes
} from "./dto/video-guide.dto.js";
import { videoGuideMediaMaxBytes } from "./video-guide-upload-limits.js";
import {
  localVideoGuideFileStream,
  type UploadedVideoGuideFileLike,
  VideoGuideService
} from "./video-guide.service.js";

@Controller("video-guide")
export class VideoGuideController {
  constructor(
    @Inject(VideoGuideService) private readonly videoGuideService: VideoGuideService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ProfileContextService) private readonly profileContextService: ProfileContextService,
    @Inject(LearnerAccessService) private readonly learnerAccessService: LearnerAccessService
  ) {}

  @Get("lessons")
  async listLessons(@Req() request: unknown, @Query("profile") profile?: string | string[]) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.listUserLessons(subject, profile)));
  }

  @Post("lessons")
  async createLesson(@Req() request: unknown, @Body() dto: CreateVideoGuideLessonDto) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.createLesson(subject, dto)));
  }

  @Post("lessons/draft")
  async createDraftLesson(@Req() request: unknown, @Body() dto: CreateVideoGuideDraftDto) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.createDraftLesson(subject, dto)));
  }

  @Post("lessons/estimate")
  async estimateLesson(@Req() request: unknown, @Body() dto: CreateVideoGuideLessonDto) {
    return this.authorized(request, async (userId) => successResponse(await this.videoGuideService.estimateLessonGeneration(userId, dto)));
  }

  @Post("lessons/:id/practice/estimate")
  async estimatePractice(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.estimatePracticeGeneration(subject, id)));
  }

  @Post("lessons/:id/narration-audio/estimate")
  async estimateNarrationAudio(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: EstimateVideoGuideNarrationAudioDto
  ) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.estimateNarrationAudioGeneration(subject, id, dto)));
  }

  @Post("lessons/:id/narration-audio")
  async generateNarrationAudio(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: GenerateVideoGuideNarrationAudioDto
  ) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.generateNarrationAudio(subject, id, dto)));
  }

  @Post("lessons/:id/practice")
  async generatePractice(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: GenerateVideoGuidePracticeDto
  ) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.generatePracticeQuestions(subject, id, dto)));
  }

  @Post("lessons/:id/media/normalize")
  async normalizeLessonMedia(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.normalizeUserLessonMediaForWeb(subject, id)));
  }

  @Post("subtitles/generate")
  async generateSubtitle(@Req() request: unknown, @Body() dto: GenerateVideoGuideSubtitleDto) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.generateSubtitleFile(subject, dto)));
  }

  @Post("subtitles/estimate")
  async estimateSubtitle(@Req() request: unknown, @Body() dto: GenerateVideoGuideSubtitleDto) {
    return this.authorized(request, async (userId) => successResponse(await this.videoGuideService.estimateSubtitleGeneration(userId, dto)));
  }

  @Post("subtitles/text")
  async readSubtitleText(@Req() request: unknown, @Body() dto: ReadVideoGuideSubtitleTextDto) {
    return this.authorized(request, async (userId) => successResponse(await this.videoGuideService.readSubtitleText(userId, dto)));
  }

  @Post("uploads/check")
  async checkUpload(@Req() request: unknown, @Body() dto: CheckVideoGuideUploadDto) {
    return this.authorized(request, async (userId) => successResponse(await this.videoGuideService.checkUploadedAsset(userId, dto)));
  }

  @Post("uploads/media")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: videoGuideMediaMaxBytes
      }
    })
  )
  async uploadMedia(@Req() request: unknown, @UploadedFile() file?: UploadedVideoGuideFileLike) {
    return this.authorized(request, async (userId) => successResponse(
      await this.videoGuideService.uploadMediaFile(userId, file, mediaUploadProgressIdFromRequest(request))));
  }

  @Get("uploads/media-progress/:uploadId")
  async getMediaUploadProgress(@Req() request: unknown, @Param("uploadId") uploadId: string) {
    return this.authorized(request, async (userId) =>
      successResponse(this.videoGuideService.getMediaUploadProgress(userId, uploadId)));
  }

  @Post("uploads/subtitle")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: videoGuideSubtitleMaxBytes
      }
    })
  )
  async uploadSubtitle(@Req() request: unknown, @UploadedFile() file?: UploadedVideoGuideFileLike) {
    return this.authorized(request, async (userId) => successResponse(await this.videoGuideService.uploadSubtitleFile(userId, file)));
  }

  @Get("lessons/:id")
  async getLesson(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.getUserLesson(subject, id)));
  }

  @Delete("lessons/:id")
  async deleteLesson(@Req() request: unknown, @Param("id") id: string) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.deleteUserLesson(subject, id)));
  }

  @Patch("lessons/:id/title")
  async updateLessonTitle(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateVideoGuideLessonTitleDto
  ) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.updateLessonTitle(subject, id, dto)));
  }

  @Patch("lessons/:id/subtitle")
  async updateLessonSubtitle(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateVideoGuideLessonSubtitleDto
  ) {
    return this.authorized(request, async (_userId, subject) =>
      successResponse(await this.videoGuideService.updateLessonSubtitle(subject, id, dto)));
  }

  @Patch("lessons/:id/narration-script")
  async updateLessonNarrationScript(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateVideoGuideNarrationScriptDto
  ) {
    return this.authorized(request, async (_userId, subject) => successResponse(
      await this.videoGuideService.updateLessonNarrationScript(subject, id, dto)));
  }

  @Post("lessons/:id/narration-script/estimate")
  async estimateLessonNarrationScriptUpdate(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateVideoGuideNarrationScriptDto
  ) {
    return this.authorized(request, async (_userId, subject) => successResponse(
      await this.videoGuideService.estimateLessonNarrationScriptUpdate(subject, id, dto)));
  }

  private async authorized<T>(request: unknown, callback: (userId: string, subject: ProfileSubject) => Promise<T>) {
    const user = await this.authService.me(request as never);
    const subject = await this.profileContextService.requireSelected(request as never, user.id);
    const root = await this.learnerAccessService.assertScenarioAuthorized(subject, "video-guide-narration");
    return this.learnerAccessService.runWithScenarioAuthorization(
      subject,
      root?.slug ?? "video-guide-narration",
      () => callback(user.id, subject)
    );
  }
}

@Controller("public/video-guide")
export class PublicVideoGuideController {
  constructor(@Inject(VideoGuideService) private readonly videoGuideService: VideoGuideService) {}

  @Get("lessons/:shareToken")
  async getPublicLesson(@Param("shareToken") shareToken: string) {
    return successResponse(await this.videoGuideService.getPublicLesson(shareToken));
  }

  @Get("files/:filename")
  async file(@Param("filename") filename: string, @Req() request: unknown, @Res() response: unknown) {
    const file = await this.videoGuideService.getPublicFile(filename);
    const range = readRangeHeader(request);
    const res = response as {
      setHeader(name: string, value: string | number): void;
      status(code: number): { end(): void };
    } & NodeJS.WritableStream;

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Accept-Ranges", "bytes");

    if (range) {
      const parsedRange = parseByteRange(range, file.size);

      if (!parsedRange) {
        res.setHeader("Content-Range", `bytes */${file.size}`);
        res.status(416).end();
        return;
      }

      res.status(206);
      res.setHeader("Content-Range", `bytes ${parsedRange.start}-${parsedRange.end}/${file.size}`);
      res.setHeader("Content-Length", parsedRange.end - parsedRange.start + 1);
      localVideoGuideFileStream(file.filepath, parsedRange).pipe(res);
      return;
    }

    res.setHeader("Content-Length", file.size);

    localVideoGuideFileStream(file.filepath).pipe(res);
  }
}

function mediaUploadProgressIdFromRequest(request: unknown) {
  const body = (request as { body?: Record<string, unknown> }).body;

  return typeof body?.progressId === "string" ? body.progressId : undefined;
}

function readRangeHeader(request: unknown) {
  const headers = (request as { headers?: Record<string, string | string[] | undefined> }).headers;
  const range = headers?.range;

  return Array.isArray(range) ? range[0] : range;
}

function parseByteRange(value: string, size: number) {
  const match = value.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;
  const suffixLength = rawStart ? 0 : Number(rawEnd);
  const start = rawStart ? Number(rawStart) : Math.max(0, size - (Number.isFinite(suffixLength) ? suffixLength : 0));
  const end = rawEnd && rawStart ? Number(rawEnd) : size - 1;

  if (![start, end].every(Number.isFinite) || start < 0 || end < start || start >= size) {
    return null;
  }

  return {
    end: Math.min(end, size - 1),
    start
  };
}

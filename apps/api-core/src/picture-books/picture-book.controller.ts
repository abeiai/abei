import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import type { UploadedFileLike } from "../media/media.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { PictureBookService } from "./picture-book.service.js";
import { CreatePictureBookDto, CreatePictureBookCharacterDto, DiscussPictureBookDto, GeneratePictureBookAudioDto, GeneratePictureBookImageDto, UpdatePictureBookDto, UpdatePictureBookPageDto } from "./picture-book.dto.js";

@Controller("picture-books")
export class PictureBookController {
  constructor(
    @Inject(PictureBookService) private readonly books: PictureBookService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ProfileContextService) private readonly profiles: ProfileContextService
  ) {}

  @Get()
  async list(@Req() request: unknown) {
    const subject = await this.account(request);
    return successResponse(await this.books.list(subject.userId));
  }

  @Post()
  async create(@Req() request: unknown, @Body() dto: CreatePictureBookDto) {
    const subject = await this.account(request);
    return successResponse(await this.books.create(subject.userId, dto));
  }

  @Post("style-reference")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadStyleReference(@Req() request: unknown, @UploadedFile() file?: UploadedFileLike) {
    const subject = await this.account(request);
    return successResponse(await this.books.uploadStyleReference(subject.userId, file));
  }

  @Get("style-references/:assetId/image")
  async customStyleImage(@Req() request: unknown, @Param("assetId") assetId: string, @Res() response: { setHeader(name: string, value: string | number): void; send(body: Buffer): void }) {
    const subject = await this.account(request);
    const image = await this.books.customStyleImage(subject.userId, assetId);
    response.setHeader("Content-Type", image.mimetype);
    response.setHeader("Content-Length", image.buffer.length);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(image.buffer);
  }

  @Get("characters")
  async characters(@Req() request: unknown) {
    const subject = await this.account(request);
    return successResponse(await this.books.listCharacters(subject.userId));
  }

  @Post("characters")
  async createCharacter(@Req() request: unknown, @Body() dto: CreatePictureBookCharacterDto) {
    const subject = await this.account(request);
    return successResponse(await this.books.createCharacter(subject.userId, dto));
  }

  @Post("characters/:id/image")
  async characterImage(@Req() request: unknown, @Param("id") id: string, @Body() dto: GeneratePictureBookImageDto) {
    const subject = await this.account(request);
    return successResponse(await this.books.generateCharacterImage(subject, id, dto.modelInstanceId));
  }

  @Post("characters/:id/upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadCharacterImage(@Req() request: unknown, @Param("id") id: string, @UploadedFile() file?: UploadedFileLike) {
    const subject = await this.account(request);
    return successResponse(await this.books.uploadCharacterImage(subject.userId, id, file));
  }

  @Get(":id")
  async get(@Req() request: unknown, @Param("id") id: string) {
    const subject = await this.account(request);
    return successResponse(await this.books.get(subject.userId, id));
  }

  @Get(":id/play")
  async playback(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.auth.me(request as never);
    const subject = await this.profiles.requireSelected(request as never, user.id);
    return successResponse(await this.books.playback(subject, id));
  }

  @Get(":id/pages/:position/image")
  async pageImage(@Req() request: unknown, @Param("id") id: string, @Param("position") position: string, @Res() response: { setHeader(name: string, value: string | number): void; send(body: Buffer): void }) {
    const user = await this.auth.me(request as never);
    const subject = await this.profiles.requireSelected(request as never, user.id);
    const image = await this.books.pageImage(subject, id, Number(position));
    response.setHeader("Content-Type", image.mimetype);
    response.setHeader("Content-Length", image.buffer.length);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(image.buffer);
  }

  @Patch(":id")
  async update(@Req() request: unknown, @Param("id") id: string, @Body() dto: UpdatePictureBookDto) {
    const subject = await this.account(request);
    return successResponse(await this.books.update(subject.userId, id, dto));
  }

  @Get(":id/pages/:position/audio")
  async pageAudio(@Req() request: unknown, @Param("id") id: string, @Param("position") position: string, @Headers("range") range: string | undefined, @Res() response: { setHeader(name: string, value: string | number): void; status(code: number): void; send(body: Buffer): void }) {
    const user = await this.auth.me(request as never);
    const subject = await this.profiles.requireSelected(request as never, user.id);
    const audio = await this.books.pageAudio(subject, id, Number(position));
    const size = audio.buffer.length;
    response.setHeader("Content-Type", audio.mimetype);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Accept-Ranges", "bytes");
    let body = audio.buffer;
    if (range) {
      const bytes = audioByteRange(range, size);
      if (!bytes) {
        response.status(416);
        response.setHeader("Content-Range", `bytes */${size}`);
        body = Buffer.alloc(0);
      } else {
        response.status(206);
        response.setHeader("Content-Range", `bytes ${bytes.start}-${bytes.end}/${size}`);
        body = body.subarray(bytes.start, bytes.end + 1);
      }
    }
    response.setHeader("Content-Length", body.length);
    response.send(body);
  }

  @Post(":id/discuss")
  async discuss(@Req() request: unknown, @Param("id") id: string, @Body() dto: DiscussPictureBookDto) {
    const subject = await this.account(request);
    return successResponse(await this.books.discuss(subject, id, dto));
  }

  @Post(":id/outline")
  async outline(@Req() request: unknown, @Param("id") id: string) {
    const subject = await this.account(request);
    return successResponse(await this.books.outline(subject, id));
  }

  @Post(":id/blank")
  async blank(@Req() request: unknown, @Param("id") id: string) {
    const subject = await this.account(request);
    return successResponse(await this.books.startBlank(subject.userId, id));
  }

  @Post(":id/complete")
  async complete(@Req() request: unknown, @Param("id") id: string) {
    const subject = await this.account(request);
    return successResponse(await this.books.complete(subject.userId, id));
  }

  @Patch(":id/pages/:position")
  async updatePage(@Req() request: unknown, @Param("id") id: string, @Param("position") position: string, @Body() dto: UpdatePictureBookPageDto) {
    const subject = await this.account(request);
    return successResponse(await this.books.updatePage(subject.userId, id, Number(position), dto));
  }

  @Post(":id/pages/:position/image")
  async generateImage(@Req() request: unknown, @Param("id") id: string, @Param("position") position: string, @Body() dto: GeneratePictureBookImageDto) {
    const subject = await this.account(request);
    return successResponse(await this.books.generateImage(subject, id, Number(position), dto));
  }

  @Post(":id/pages/:position/upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadPageImage(@Req() request: unknown, @Param("id") id: string, @Param("position") position: string, @UploadedFile() file?: UploadedFileLike) {
    const subject = await this.account(request);
    return successResponse(await this.books.uploadPageImage(subject.userId, id, Number(position), file));
  }

  @Post(":id/pages/:position/audio")
  async generateAudio(@Req() request: unknown, @Param("id") id: string, @Param("position") position: string, @Body() dto: GeneratePictureBookAudioDto) {
    const subject = await this.account(request);
    return successResponse(await this.books.generateAudio(subject, id, Number(position), dto));
  }

  private async account(request: unknown) {
    const user = await this.auth.me(request as never);
    return this.profiles.requireAccount(request as never, user.id);
  }
}

function audioByteRange(range: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const requestedEnd = match[1] && match[2] ? Number(match[2]) : size - 1;
  const end = Math.min(requestedEnd, size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || (!match[1] && Number(match[2]) <= 0) || start >= size || end < start) return null;
  return { start, end };
}

import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { AuthService } from "../auth/auth.service.js";
import { successResponse } from "../common/api-response.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { audioByteRange } from "./picture-book.controller.js";
import { PictureBookSubmissionService } from "./picture-book-submission.service.js";

export class PublicBookQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(20)
  pageSize = 20;
}
export class ReviewQuery {
  @IsOptional() @IsIn(["PENDING", "APPROVED", "REJECTED"])
  status?: "PENDING" | "APPROVED" | "REJECTED";
}
export class DecisionDto {
  @IsDateString({}, { message: "审核版本参数格式错误" })
  expectedUpdatedAt!: string;
}
export class UnpublishBookDto {
  @IsInt() @Min(1)
  expectedVersion!: number;
}
export class RejectDto extends DecisionDto {
  @IsString() @MinLength(2) @MaxLength(500)
  reason!: string;
}
type MediaResponse = { setHeader(name: string, value: string | number): void; status(code: number): void; send(body: Buffer): void };
function sendMedia(response: MediaResponse, file: { buffer: Buffer; mimetype: string }, range?: string) {
  let body = file.buffer;
  response.setHeader("Content-Type", file.mimetype);
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (range) {
    response.setHeader("Accept-Ranges", "bytes");
    const bytes = audioByteRange(range, body.length);
    if (!bytes) { response.status(416); response.setHeader("Content-Range", `bytes */${body.length}`); body = Buffer.alloc(0); }
    else { response.status(206); response.setHeader("Content-Range", `bytes ${bytes.start}-${bytes.end}/${body.length}`); body = body.subarray(bytes.start, bytes.end + 1); }
  }
  response.setHeader("Content-Length", body.length);
  response.send(body);
}

@Controller("picture-books")
export class PictureBookSubmissionController {
  constructor(
    @Inject(PictureBookSubmissionService) private readonly submissions: PictureBookSubmissionService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ProfileContextService) private readonly profiles: ProfileContextService
  ) {}

  @Post(":id/submit")
  async submit(@Req() request: unknown, @Param("id") id: string) {
    const user = await this.auth.me(request as never);
    await this.profiles.requireAccount(request as never, user.id);
    return successResponse(await this.submissions.submit(user.id, id));
  }
}

@Controller("public/picture-books")
export class PublicPictureBooksController {
  constructor(@Inject(PictureBookSubmissionService) private readonly submissions: PictureBookSubmissionService) {}
  @Get()
  async list(@Query() query: PublicBookQuery) { return successResponse(await this.submissions.publicList(query.page, query.pageSize)); }
  @Get("albums")
  async albums() { return successResponse(await this.submissions.albums()); }
  @Get(":id/play")
  async play(@Param("id") id: string) { return successResponse(await this.submissions.publicBook(id)); }
  @Get(":id/cover")
  async cover(@Param("id") id: string, @Res() response: MediaResponse) { sendMedia(response, await this.submissions.image(id)); }
  @Get(":id/pages/:position/image")
  async image(@Param("id") id: string, @Param("position") position: string, @Res() response: MediaResponse) { sendMedia(response, await this.submissions.image(id, Number(position))); }
  @Get(":id/pages/:position/audio")
  async audio(@Param("id") id: string, @Param("position") position: string, @Headers("range") range: string | undefined, @Res() response: MediaResponse, @Query("language") language?: string) { sendMedia(response, await this.submissions.audio(id, Number(position), language), range); }
}

@Controller("admin/picture-book-submissions")
export class AdminPictureBookSubmissionsController {
  constructor(@Inject(PictureBookSubmissionService) private readonly submissions: PictureBookSubmissionService, @Inject(AdminAuthService) private readonly auth: AdminAuthService) {}
  @Get()
  async list(@Req() request: unknown, @Query() query: ReviewQuery) { await this.auth.me(request as never); return successResponse(await this.submissions.listReviews(query.status)); }
  @Get(":id")
  async get(@Req() request: unknown, @Param("id") id: string) { await this.auth.me(request as never); return successResponse(await this.submissions.review(id)); }
  @Post(":id/cover")
  async cover(@Req() request: unknown, @Param("id") id: string) { await this.auth.me(request as never); return successResponse(await this.submissions.generateCover(id)); }
  @Get(":id/cover/image")
  async coverImage(@Req() request: unknown, @Param("id") id: string, @Res() response: MediaResponse) { await this.auth.me(request as never); sendMedia(response, await this.submissions.reviewImage(id)); }
  @Get(":id/pages/:position/image")
  async image(@Req() request: unknown, @Param("id") id: string, @Param("position") position: string, @Res() response: MediaResponse) { await this.auth.me(request as never); sendMedia(response, await this.submissions.reviewImage(id, Number(position))); }
  @Get(":id/pages/:position/audio")
  async audio(@Req() request: unknown, @Param("id") id: string, @Param("position") position: string, @Query("language") language: string | undefined, @Headers("range") range: string | undefined, @Res() response: MediaResponse) { await this.auth.me(request as never); sendMedia(response, await this.submissions.reviewAudio(id, Number(position), language), range); }
  @Post(":id/unpublish")
  async unpublish(@Req() request: unknown, @Param("id") id: string, @Body() dto: UnpublishBookDto) { const admin = await this.auth.me(request as never); return successResponse(await this.submissions.unpublish(admin.id, id, dto.expectedVersion)); }
  @Post(":id/approve")
  async approve(@Req() request: unknown, @Param("id") id: string, @Body() dto: DecisionDto) { return this.decide(request, id, dto, "APPROVED"); }
  @Post(":id/reject")
  async reject(@Req() request: unknown, @Param("id") id: string, @Body() dto: RejectDto) { return this.decide(request, id, dto, "REJECTED", dto.reason); }
  private async decide(request: unknown, id: string, dto: DecisionDto, status: "APPROVED" | "REJECTED", reason?: string) {
    const admin = await this.auth.me(request as never);
    const review = await this.submissions.decide(admin.id, id, dto.expectedUpdatedAt, status, reason);
    await writeAdminOperationLog({ adminUserId: admin.id, action: status === "APPROVED" ? "APPROVE_PICTURE_BOOK_SUBMISSION" : "REJECT_PICTURE_BOOK_SUBMISSION", resourceType: "PICTURE_BOOK_SUBMISSION", resourceId: id, description: status === "APPROVED" ? "通过单本绘本投稿审核" : `拒绝单本绘本投稿：${reason?.trim()}`, request: request as HeaderRequestLike });
    return successResponse(review);
  }
}

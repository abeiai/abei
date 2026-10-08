import { Controller, Get, Inject, Param, Query, Req, Res, StreamableFile } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { LegacyAiLogsService } from "./legacy-ai-logs.service.js";

interface ResponseLike { setHeader(name: string, value: string): void; status(code: number): unknown }

@Controller("admin/legacy-ai-logs")
export class LegacyAiLogsController {
  constructor(
    @Inject(LegacyAiLogsService) private readonly logs: LegacyAiLogsService,
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
  ) {}
  private async authorize(request: unknown, response: ResponseLike) {
    response.setHeader("Cache-Control", "private, no-store");
    await this.auth.me(request as never);
  }
  @Get()
  async list(@Req() request: unknown, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) response: ResponseLike) {
    await this.authorize(request, response);
    return successResponse(await this.logs.list(query));
  }
  @Get(":id")
  async detail(@Req() request: unknown, @Param("id") id: string, @Query("sessionPage") sessionPage: unknown, @Res({ passthrough: true }) response: ResponseLike) {
    await this.authorize(request, response);
    return successResponse(await this.logs.detail(id, sessionPage));
  }
  @Get(":id/assets/:assetId/file")
  async file(@Req() request: { headers: { range?: string } }, @Param("id") id: string, @Param("assetId") assetId: string, @Res({ passthrough: true }) response: ResponseLike) {
    await this.authorize(request, response);
    const file = await this.logs.file(id, assetId, request.headers.range);
    response.status(file.status);
    for (const [key, value] of Object.entries(file.headers)) response.setHeader(key, value);
    return new StreamableFile(file.stream);
  }
}

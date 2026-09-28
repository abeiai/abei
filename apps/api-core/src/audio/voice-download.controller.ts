import { Controller, Get, Inject, Query, Req, Res } from "@nestjs/common";
import type { EventEmitter } from "node:events";
import { AuthService } from "../auth/auth.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import { VoiceDownloadService, validateVoiceDownloadQuery } from "./voice-download.service.js";

type DownloadRequest = EventEmitter & { aborted?: boolean; headers: { cookie?: string; authorization?: string } };
type DownloadResponse = EventEmitter & { writableEnded: boolean; destroyed?: boolean; set(headers: Record<string, string>): void; send(bytes: Buffer): void };

@Controller("audio/voice-download")
export class VoiceDownloadController {
  constructor(
    @Inject(VoiceDownloadService) private readonly downloads: VoiceDownloadService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ProfileContextService) private readonly profiles: ProfileContextService,
    @Inject(LearnerAccessService) private readonly access: LearnerAccessService
  ) {}

  @Get()
  async download(@Req() request: DownloadRequest, @Res() response: DownloadResponse, @Query() raw: Record<string, unknown>) {
    const controller = new AbortController();
    const abort = () => { if (!response.writableEnded) controller.abort(); };
    request.once("aborted", abort);
    response.once("close", abort);
    try {
      if (request.aborted || response.destroyed) controller.abort();
      controller.signal.throwIfAborted();
      const user = await this.auth.me(request);
      const subject = await this.profiles.requireSelected(request, user.id);
      await this.access.assertScenarioAuthorized(subject, "article-to-speech");
      const query = validateVoiceDownloadQuery(raw);
      controller.signal.throwIfAborted();
      const file = await this.downloads.download(subject, query, controller.signal);
      controller.signal.throwIfAborted();
      response.set({ "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Content-Length": String(file.bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
      response.send(file.bytes);
    } finally {
      request.off("aborted", abort);
      response.off("close", abort);
    }
  }
}

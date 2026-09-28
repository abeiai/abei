import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import type { EventEmitter } from "node:events";
import { AuthService } from "../auth/auth.service.js";
import { ProfileContextService } from "../profiles/profile-context.service.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import { EnglishGuidedStudyService } from "./english-guided-study.service.js";
import { EnglishGuidedStudyDownloadService } from "./english-guided-study-download.service.js";

type Request = EventEmitter & { aborted?: boolean; headers: { cookie?: string; authorization?: string } };
type Response = EventEmitter & { writableEnded: boolean; destroyed?: boolean; set(headers: Record<string, string>): void; send(bytes: Buffer): void };

@Controller("english-guided-study/materials")
export class EnglishGuidedStudyDownloadController {
  constructor(
    @Inject(EnglishGuidedStudyDownloadService) private readonly downloads: EnglishGuidedStudyDownloadService,
    @Inject(EnglishGuidedStudyService) private readonly materials: EnglishGuidedStudyService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ProfileContextService) private readonly profiles: ProfileContextService,
    @Inject(LearnerAccessService) private readonly access: LearnerAccessService
  ) {}

  @Get(":id/audio-download/:kind")
  async download(@Req() request: Request, @Res() response: Response, @Param("id") id: string, @Param("kind") kind: string) {
    const abort = new AbortController();
    const onClose = () => { if (!response.writableEnded) abort.abort(); };
    request.once("aborted", onClose);
    response.once("close", onClose);
    try {
      if (request.aborted || response.destroyed) abort.abort();
      abort.signal.throwIfAborted();
      const user = await this.auth.me(request);
      const subject = await this.profiles.requireSelected(request, user.id);
      const root = await this.materials.getMaterialAuthorizationRoot(subject, id);
      await this.access.assertScenarioAuthorized(subject, root);
      abort.signal.throwIfAborted();
      const file = await this.access.runWithScenarioAuthorization(subject, root, () => this.downloads.download(subject, id, kind, abort.signal));
      abort.signal.throwIfAborted();
      const filename = encodeURIComponent(file.filename.replace(/[\p{Cc}/\\]/gu, "_")).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
      response.set({ "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="audio"; filename*=UTF-8''${filename}`,
        "Content-Length": String(file.bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
      response.send(file.bytes);
    } finally {
      request.off("aborted", onClose);
      response.off("close", onClose);
    }
  }
}

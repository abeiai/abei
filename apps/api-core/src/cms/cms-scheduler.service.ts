import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CmsService } from "./cms.service.js";

@Injectable()
export class CmsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CmsSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(CmsService) private readonly cmsService: CmsService) {}

  onModuleInit() {
    if (process.env.CMS_SCHEDULED_PUBLISHER_ENABLED === "0") {
      return;
    }

    const intervalMs = Number(process.env.CMS_SCHEDULED_PUBLISHER_INTERVAL_MS ?? 60_000);
    const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs >= 10_000 ? intervalMs : 60_000;

    this.timer = setInterval(() => {
      void this.publishDueContent();
    }, safeIntervalMs);
    this.timer.unref?.();

    void this.publishDueContent();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async publishDueContent() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.cmsService.publishDueContent();
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: "CMS 定时发布失败",
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error)
        })
      );
    } finally {
      this.running = false;
    }
  }
}

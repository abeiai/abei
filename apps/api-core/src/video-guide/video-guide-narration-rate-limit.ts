import { randomBytes } from "node:crypto";
import { createClient } from "redis";

export interface NarrationTtsRateLimitClient {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  set(
    key: string,
    value: string,
    options: { NX: true; PX: number }
  ): Promise<string | null>;
  pTTL(key: string): Promise<number>;
  quit(): Promise<unknown>;
  destroy(): void;
  on?(event: "error", listener: (error: Error) => void): unknown;
}

interface VideoGuideNarrationTtsRateLimiterInput {
  client?: NarrationTtsRateLimitClient;
  key?: string;
  redisUrl?: string;
  requestsPerSecond?: number;
  commandTimeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const defaultKey = "xueleai:video-guide:narration-tts:start-rate:v1";

export class VideoGuideNarrationTtsRateLimiter {
  private readonly client: NarrationTtsRateLimitClient | null;
  private readonly intervalMs: number;
  private readonly commandTimeoutMs: number;
  private readonly key: string;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private connection: Promise<unknown> | null = null;

  constructor(input: VideoGuideNarrationTtsRateLimiterInput = {}) {
    const redisUrl = input.redisUrl?.trim() || process.env.REDIS_URL?.trim() || "";

    this.client = input.client ?? (redisUrl ? createClient({ url: redisUrl }) : null);
    this.intervalMs = Math.ceil(1_000 / normalizedRequestsPerSecond(input.requestsPerSecond));
    this.commandTimeoutMs = positiveInteger(
      input.commandTimeoutMs ?? Number(process.env.VIDEO_GUIDE_NARRATION_TTS_REDIS_TIMEOUT_MS || 5_000),
      5_000
    );
    this.key = input.key?.trim() || defaultKey;
    this.sleep = input.sleep ?? delay;
    this.client?.on?.("error", () => undefined);
  }

  async acquire() {
    const client = this.client;

    if (!client) {
      throw new Error("视频导学语音全局限速器缺少 Redis 配置");
    }

    await this.ensureConnected(client);

    while (true) {
      const acquired = await this.withCommandTimeout(
        client.set(
          this.key,
          randomBytes(12).toString("hex"),
          { NX: true, PX: this.intervalMs }
        )
      );

      if (acquired === "OK") {
        return;
      }

      const ttlMs = await this.withCommandTimeout(client.pTTL(this.key));
      await this.sleep(ttlMs > 0 ? ttlMs : Math.min(25, this.intervalMs));
    }
  }

  async close() {
    this.destroyClient();
  }

  private async ensureConnected(client: NarrationTtsRateLimitClient) {
    if (client.isOpen) {
      return;
    }

    this.connection ??= this.withCommandTimeout(client.connect()).finally(() => {
      this.connection = null;
    });
    await this.connection;
  }

  private async withCommandTimeout<T>(operation: Promise<T>) {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => {
              reject(new Error("视频导学语音全局限速服务响应超时"));
              this.destroyClient();
            },
            this.commandTimeoutMs
          );
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private destroyClient() {
    try {
      this.client?.destroy();
    } catch {
      // The timeout error remains the authoritative failure for the caller.
    }
  }
}

function normalizedRequestsPerSecond(value?: number) {
  const configured = value ?? Number(process.env.VIDEO_GUIDE_NARRATION_TTS_RPS || 0.75);

  return Number.isFinite(configured) ? Math.min(3, Math.max(0.25, configured)) : 0.75;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function positiveInteger(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

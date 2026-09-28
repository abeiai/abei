import { createHash } from "node:crypto";
import type { OnModuleDestroy } from "@nestjs/common";
import { createClient } from "redis";
import {
  WechatAuthError,
  type WechatOAuthStateRecord
} from "./wechat-auth.types.js";

export interface WechatOAuthStateStore {
  put(
    state: string,
    record: WechatOAuthStateRecord,
    ttlSeconds: number
  ): Promise<void>;
  consume(state: string): Promise<WechatOAuthStateRecord | null>;
}

export const WECHAT_OAUTH_STATE_STORE = Symbol("WECHAT_OAUTH_STATE_STORE");

export interface WechatStateRedisClient {
  isOpen: boolean;
  connect(): Promise<unknown>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  getDel(key: string): Promise<string | null>;
  quit(): Promise<unknown>;
}

function createWechatRedisClient(): WechatStateRedisClient {
  const url = process.env.REDIS_URL?.trim();

  if (!url) {
    throw new WechatAuthError("upstream");
  }

  return createClient({ url }) as unknown as WechatStateRedisClient;
}

function stateKey(state: string) {
  const digest = createHash("sha256").update(state).digest("hex");
  return `wechat-oauth:state:${digest}`;
}

function parseStateRecord(value: string): WechatOAuthStateRecord | null {
  try {
    const record = JSON.parse(value) as Partial<WechatOAuthStateRecord>;
    if (
      (record.channel !== "MP" && record.channel !== "WEB") ||
      typeof record.next !== "string" ||
      typeof record.issuedAt !== "number" ||
      !Number.isFinite(record.issuedAt)
    ) {
      return null;
    }
    return {
      channel: record.channel,
      next: record.next,
      issuedAt: record.issuedAt
    };
  } catch {
    return null;
  }
}

export class RedisWechatOAuthStateStore
  implements WechatOAuthStateStore, OnModuleDestroy
{
  private client: WechatStateRedisClient | null;

  constructor(client?: WechatStateRedisClient) {
    this.client = client ?? null;
  }

  async put(
    state: string,
    record: WechatOAuthStateRecord,
    ttlSeconds: number
  ) {
    if (!state || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new WechatAuthError("upstream");
    }

    try {
      const client = this.redisClient();
      await this.ensureConnected(client);
      await client.set(stateKey(state), JSON.stringify(record), {
        EX: ttlSeconds
      });
    } catch {
      throw new WechatAuthError("upstream");
    }
  }

  async consume(state: string) {
    if (!state) {
      return null;
    }

    try {
      const client = this.redisClient();
      await this.ensureConnected(client);
      const value = await client.getDel(stateKey(state));
      return value ? parseStateRecord(value) : null;
    } catch {
      throw new WechatAuthError("upstream");
    }
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  private redisClient() {
    this.client ??= createWechatRedisClient();
    return this.client;
  }

  private async ensureConnected(client: WechatStateRedisClient) {
    if (!client.isOpen) {
      await client.connect();
    }
  }
}

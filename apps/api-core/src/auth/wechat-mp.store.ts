import { createHash } from "node:crypto";
import { createClient } from "redis";
import type { OnModuleDestroy } from "@nestjs/common";
import { WechatAuthError, type ScanRecord } from "./wechat-mp.types.js";
export interface WechatScanStore {
  read(key: string): Promise<ScanRecord | null>;
  atomic<T>(
    keys: string[],
    update: (values: Array<ScanRecord | null>) => {
      values: Array<ScanRecord | null>;
      result: T;
    },
  ): Promise<T>;
}
export const WECHAT_SCAN_STORE = Symbol("WECHAT_SCAN_STORE");
export function scanKey(appId: string, kind: string, value: string) {
  return `abei:wechat-mp:{${createHash("sha256").update(appId).digest("hex").slice(0, 16)}}:${kind}:${createHash("sha256").update(value).digest("hex")}`;
}
const casScript = `
for i=1,#KEYS do
  if (redis.call('GET',KEYS[i]) or '') ~= ARGV[i] then return 0 end
end
for i=1,#KEYS do
  local value = ARGV[#KEYS+i]
  local ttl = tonumber(ARGV[2*#KEYS+i])
  if value == '' or ttl <= 0 then redis.call('DEL',KEYS[i])
  else redis.call('SET',KEYS[i],value,'EX',ttl) end
end
return 1`;
function parsed(raw: string | null): ScanRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ScanRecord;
    if (
      !value ||
      !Number.isFinite(value.expiresAt) ||
      ![
        "CONTEXT",
        "CHALLENGE",
        "SCENE",
        "OPENID",
        "EVENT",
        "PENDING",
        "TOKEN",
        "LOCK",
      ].includes(value.kind)
    )
      throw new Error();
    return value;
  } catch {
    throw new WechatAuthError("upstream");
  }
}
export class RedisWechatScanStore implements WechatScanStore, OnModuleDestroy {
  private client: ReturnType<typeof createClient> | null = null;
  private connection: Promise<unknown> | null = null;
  private async ready() {
    const url = process.env.REDIS_URL?.trim();
    if (!url) throw new WechatAuthError("upstream");
    if (!this.client) {
      this.client = createClient({
        url,
        socket: { connectTimeout: 5000, reconnectStrategy: false },
      });
      this.client.on("error", () => {});
    }
    if (this.connection) await this.connection;
    else if (!this.client.isOpen) {
      this.connection = this.client.connect().finally(() => {
        this.connection = null;
      });
      await this.connection;
    }
    return this.client;
  }
  async read(key: string) {
    try {
      return parsed(await (await this.ready()).get(key));
    } catch {
      throw new WechatAuthError("upstream");
    }
  }
  async atomic<T>(
    keys: string[],
    update: (values: Array<ScanRecord | null>) => {
      values: Array<ScanRecord | null>;
      result: T;
    },
  ): Promise<T> {
    const client = await this.ready().catch(() => {
      throw new WechatAuthError("upstream");
    });
    for (let attempt = 0; attempt < 12; attempt++) {
      let raw: Array<string | null>;
      try {
        raw = await client.mGet(keys);
      } catch {
        throw new WechatAuthError("upstream");
      }
      const result = update(raw.map(parsed));
      if (result.values.length !== keys.length)
        throw new WechatAuthError("upstream");
      const values = result.values.map((x) => (x ? JSON.stringify(x) : ""));
      const ttls = result.values.map((x) =>
        String(
          x ? Math.max(0, Math.ceil((x.expiresAt - Date.now()) / 1000)) : 0,
        ),
      );
      try {
        if (
          (await client.eval(casScript, {
            keys,
            arguments: [...raw.map((x) => x ?? ""), ...values, ...ttls],
          })) === 1
        )
          return result.result;
      } catch {
        throw new WechatAuthError("upstream");
      }
    }
    throw new WechatAuthError("upstream");
  }
  async onModuleDestroy() {
    if (this.client?.isOpen) await this.client.quit();
  }
}

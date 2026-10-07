import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  loadWechatMpConfig,
  recordOf,
  WechatAuthError,
  type WechatIdentity,
  type WechatMpConfig,
} from "./wechat-mp.types.js";
import {
  scanKey,
  WECHAT_SCAN_STORE,
  type WechatScanStore,
} from "./wechat-mp.store.js";
export interface WechatMpProvider {
  config(): WechatMpConfig;
  createQrcode(scene: string): Promise<{ url: string; expiresIn: number }>;
  identity(openId: string): Promise<WechatIdentity>;
}
@Injectable()
export class WechatMpClient implements WechatMpProvider {
  constructor(
    @Inject(WECHAT_SCAN_STORE) private readonly store: WechatScanStore,
    private readonly configured?: WechatMpConfig,
    private readonly request: typeof fetch = fetch,
  ) {}
  config() {
    return this.configured ?? loadWechatMpConfig();
  }
  private async payload(url: string, init: RequestInit = {}) {
    try {
      const response = await this.request(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (
        !response.ok ||
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        (payload.errcode !== undefined && payload.errcode !== 0)
      )
        throw new Error();
      return payload;
    } catch {
      throw new WechatAuthError("upstream");
    }
  }
  private async token() {
    const config = this.config(),
      key = scanKey(config.appId, "token", "stable"),
      lockKey = scanKey(config.appId, "token-lock", "stable"),
      owner = randomBytes(16).toString("hex");
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await this.store.atomic<{
        token: string | null;
        acquired: boolean;
      }>([key, lockKey], (values) => {
        const token = recordOf(values[0], "TOKEN");
        if (token && token.expiresAt > Date.now())
          return { values, result: { token: token.token, acquired: false } };
        const lock = recordOf(values[1], "LOCK");
        if (lock && lock.expiresAt > Date.now())
          return { values, result: { token: null, acquired: false } };
        values[1] = { kind: "LOCK", owner, expiresAt: Date.now() + 10_000 };
        return { values, result: { token: null, acquired: true } };
      });
      if (result.token) return result.token;
      if (!result.acquired) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      try {
        const payload = await this.payload(
          "https://api.weixin.qq.com/cgi-bin/stable_token",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              grant_type: "client_credential",
              appid: config.appId,
              secret: config.appSecret,
              force_refresh: false,
            }),
          },
        );
        if (
          typeof payload.access_token !== "string" ||
          !payload.access_token ||
          payload.access_token.length > 4096 ||
          typeof payload.expires_in !== "number" ||
          payload.expires_in < 120 ||
          payload.expires_in > 86400
        )
          throw new WechatAuthError("upstream");
        const token = payload.access_token;
        await this.store.atomic([key, lockKey], (values) => {
          if (recordOf(values[1], "LOCK")?.owner !== owner)
            throw new WechatAuthError("upstream");
          values[0] = {
            kind: "TOKEN",
            token,
            expiresAt: Date.now() + (Number(payload.expires_in) - 60) * 1000,
          };
          values[1] = null;
          return { values, result: null };
        });
        return token;
      } finally {
        await this.store.atomic([lockKey], (values) => {
          if (recordOf(values[0], "LOCK")?.owner === owner) values[0] = null;
          return { values, result: null };
        });
      }
    }
    throw new WechatAuthError("upstream");
  }
  async createQrcode(scene: string) {
    const token = await this.token();
    const payload = await this.payload(
      "https://api.weixin.qq.com/cgi-bin/qrcode/create?" +
        new URLSearchParams({ access_token: token }),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expire_seconds: 180,
          action_name: "QR_STR_SCENE",
          action_info: { scene: { scene_str: scene } },
        }),
      },
    );
    if (
      typeof payload.ticket !== "string" ||
      !payload.ticket ||
      payload.ticket.length > 4096 ||
      typeof payload.expire_seconds !== "number" ||
      payload.expire_seconds < 1
    )
      throw new WechatAuthError("upstream");
    return {
      url:
        "https://mp.weixin.qq.com/cgi-bin/showqrcode?" +
        new URLSearchParams({ ticket: payload.ticket }),
      expiresIn: Math.min(180, payload.expire_seconds),
    };
  }
  async identity(openId: string): Promise<WechatIdentity> {
    const config = this.config(),
      base = {
        appId: config.appId,
        openId,
        unionId: null,
        nickname: "微信用户",
        avatarUrl: null,
      };
    try {
      const token = await this.token(),
        payload = await this.payload(
          "https://api.weixin.qq.com/cgi-bin/user/info?" +
            new URLSearchParams({
              access_token: token,
              openid: openId,
              lang: "zh_CN",
            }),
        );
      if (payload.openid !== openId || payload.subscribe !== 1) return base;
      const unionId =
        typeof payload.unionid === "string" &&
        /^[A-Za-z0-9_-]{1,128}$/.test(payload.unionid)
          ? payload.unionid
          : null;
      return { ...base, unionId };
    } catch {
      return base;
    }
  }
}

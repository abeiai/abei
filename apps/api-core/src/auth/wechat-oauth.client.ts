import {
  WechatAuthError,
  type WechatIdentity,
  type WechatOAuthChannel
} from "./wechat-auth.types.js";

export interface WechatOAuthRuntimeConfig {
  callbackUrl: string;
  mp: { appId: string; appSecret: string };
  web: { appId: string; appSecret: string };
}

interface WechatProviderPayload {
  access_token?: unknown;
  openid?: unknown;
  unionid?: unknown;
  nickname?: unknown;
  headimgurl?: unknown;
  errcode?: unknown;
}

const deniedProviderCodes = new Set([40029, 40163]);

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new WechatAuthError("config");
  }

  return value;
}

export function loadWechatOAuthRuntimeConfig(): WechatOAuthRuntimeConfig {
  const appBaseUrl = requiredEnvironmentValue("APP_BASE_URL").replace(/\/+$/u, "");
  let callbackUrl: string;

  try {
    const baseUrl = new URL(appBaseUrl);
    if (!/^https?:$/u.test(baseUrl.protocol)) {
      throw new Error("unsupported protocol");
    }
    if (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:") {
      throw new Error("production callback must use https");
    }
    callbackUrl = new URL("/api/auth/wechat/callback", `${appBaseUrl}/`).toString();
  } catch {
    throw new WechatAuthError("config");
  }

  return {
    callbackUrl,
    mp: {
      appId: requiredEnvironmentValue("WECHAT_APP_ID"),
      appSecret: requiredEnvironmentValue("WECHAT_APP_SECRET")
    },
    web: {
      appId: requiredEnvironmentValue("WECHAT_OPEN_APP_ID"),
      appSecret: requiredEnvironmentValue("WECHAT_OPEN_APP_SECRET")
    }
  };
}

export function resolveWechatOAuthChannel(
  userAgent: string | null
): WechatOAuthChannel | null {
  if (!userAgent) {
    return null;
  }
  if (/MicroMessenger/iu.test(userAgent)) {
    return "MP";
  }
  if (/Android|iPhone|iPad|iPod|Mobile/iu.test(userAgent)) {
    return null;
  }
  return "WEB";
}

export class WechatOAuthClient {
  constructor(
    private readonly configuredRuntime?: WechatOAuthRuntimeConfig,
    private readonly request: typeof fetch = fetch
  ) {}

  buildAuthorizationUrl(channel: WechatOAuthChannel, state: string) {
    const runtime = this.runtimeConfig();
    const channelConfig = this.channelConfig(runtime, channel);
    const url = new URL(
      channel === "MP"
        ? "https://open.weixin.qq.com/connect/oauth2/authorize"
        : "https://open.weixin.qq.com/connect/qrconnect"
    );
    url.searchParams.set("appid", channelConfig.appId);
    url.searchParams.set("redirect_uri", runtime.callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", channel === "MP" ? "snsapi_userinfo" : "snsapi_login");
    url.searchParams.set("state", state);
    url.hash = "wechat_redirect";
    return url.toString();
  }

  async fetchIdentity(
    channel: WechatOAuthChannel,
    code: string
  ): Promise<WechatIdentity> {
    if (!code.trim()) {
      throw new WechatAuthError("denied");
    }

    const channelConfig = this.channelConfig(this.runtimeConfig(), channel);
    const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
    tokenUrl.searchParams.set("appid", channelConfig.appId);
    tokenUrl.searchParams.set("secret", channelConfig.appSecret);
    tokenUrl.searchParams.set("code", code);
    tokenUrl.searchParams.set("grant_type", "authorization_code");

    const tokenPayload = await this.requestPayload(tokenUrl, true);
    const accessToken = this.requiredString(tokenPayload.access_token);
    const tokenOpenId = this.requiredString(tokenPayload.openid);

    if (!accessToken || !tokenOpenId) {
      throw new WechatAuthError("upstream");
    }

    const userInfoUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
    userInfoUrl.searchParams.set("access_token", accessToken);
    userInfoUrl.searchParams.set("openid", tokenOpenId);
    userInfoUrl.searchParams.set("lang", "zh_CN");

    const userPayload = await this.requestPayload(userInfoUrl, false);
    const openId = this.requiredString(userPayload.openid);
    const unionId = this.requiredString(userPayload.unionid);

    if (!openId || openId !== tokenOpenId || !unionId) {
      throw new WechatAuthError("upstream");
    }

    return {
      channel,
      openId,
      unionId,
      nickname: this.requiredString(userPayload.nickname) || "微信用户",
      avatarUrl: this.requiredString(userPayload.headimgurl) || null
    };
  }

  private runtimeConfig() {
    return this.configuredRuntime ?? loadWechatOAuthRuntimeConfig();
  }

  private channelConfig(
    runtime: WechatOAuthRuntimeConfig,
    channel: WechatOAuthChannel
  ) {
    return channel === "MP" ? runtime.mp : runtime.web;
  }

  private async requestPayload(url: URL, tokenRequest: boolean) {
    try {
      const response = await this.request(url, {
        method: "GET",
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) {
        throw new WechatAuthError("upstream");
      }

      const payload = (await response.json()) as WechatProviderPayload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new WechatAuthError("upstream");
      }
      if (typeof payload.errcode === "number") {
        if (tokenRequest && deniedProviderCodes.has(payload.errcode)) {
          throw new WechatAuthError("denied");
        }
        throw new WechatAuthError("upstream");
      }
      return payload;
    } catch (error) {
      if (error instanceof WechatAuthError) {
        throw error;
      }
      throw new WechatAuthError("upstream");
    }
  }

  private requiredString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }
}

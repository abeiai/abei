import { HttpStatus } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";
export type WechatFailure =
  | "config"
  | "state"
  | "csrf"
  | "upstream"
  | "identity_conflict"
  | "disabled"
  | "already_logged_in"
  | "registration_closed"
  | "phone";
const messages: Record<WechatFailure, string> = {
  config: "公众号登录尚未完成配置，请使用其他登录方式",
  state: "扫码登录已失效，请刷新二维码",
  csrf: "登录请求校验失败，请刷新页面",
  upstream: "公众号登录服务暂不可用，请稍后重试",
  identity_conflict: "账号关联异常，请联系客服处理",
  disabled: "账号已被禁用",
  already_logged_in: "当前浏览器已登录，请先退出再使用微信登录",
  registration_closed: "新用户注册暂未开放，请使用已有账号登录",
  phone: "请完成本次手机号验证后重试",
};
export class WechatAuthError extends AppException {
  constructor(public readonly reason: WechatFailure) {
    super(
      40011,
      messages[reason],
      reason === "upstream"
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.BAD_REQUEST,
    );
  }
}
export interface WechatMpConfig {
  appId: string;
  appSecret: string;
  token: string;
  encodingKey: string;
  originalId: string;
  origin: string;
  registrationEnabled: boolean;
}
export function loadWechatMpConfig(): WechatMpConfig {
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new WechatAuthError("config");
    return value;
  };
  if (process.env.WECHAT_MP_LOGIN_ENABLED !== "true")
    throw new WechatAuthError("config");
  const appId = required("WECHAT_APP_ID"),
    appSecret = required("WECHAT_APP_SECRET"),
    token = required("WECHAT_MP_CALLBACK_TOKEN"),
    encodingKey = required("WECHAT_MP_ENCODING_AES_KEY"),
    originalId = required("WECHAT_MP_ORIGINAL_ID");
  let origin: string;
  try {
    const url = new URL(required("APP_BASE_URL"));
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    )
      throw new Error();
    origin = url.origin;
  } catch {
    throw new WechatAuthError("config");
  }
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(appId) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(originalId) ||
    !/^[A-Za-z0-9]{3,32}$/.test(token) ||
    !/^[A-Za-z0-9+/]{43}$/.test(encodingKey) ||
    Buffer.from(encodingKey + "=", "base64").length !== 32
  )
    throw new WechatAuthError("config");
  return {
    appId,
    appSecret,
    token,
    encodingKey,
    originalId,
    origin,
    registrationEnabled: process.env.WECHAT_MP_REGISTRATION_ENABLED === "true",
  };
}
export function safeWechatNextPath(value: unknown) {
  const next = typeof value === "string" ? value.trim() : "";
  return !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    /[\r\n]/.test(next) ||
    /^\/admin(?:\/|$|\?|#)/.test(next) ||
    next.length > 2048
    ? "/"
    : next;
}
export interface WechatIdentity {
  appId: string;
  openId: string;
  unionId: string | null;
  nickname: string;
  avatarUrl: string | null;
}
export type ScanStatus =
  | "WAITING"
  | "SCANNED"
  | "CONFIRMED"
  | "CONSUMED"
  | "CANCELLED";
export type ScanRecord =
  | {
      kind: "CONTEXT";
      expiresAt: number;
      csrf: string;
      busy: boolean;
      activeId: string | null;
      pendingId: string | null;
    }
  | {
      kind: "CHALLENGE";
      expiresAt: number;
      id: string;
      scene: string;
      contextKey: string;
      status: ScanStatus;
      openId: string | null;
      confirmationCode: string | null;
      next: string;
      referralToken: string | null;
    }
  | { kind: "SCENE"; expiresAt: number; id: string }
  | {
      kind: "OPENID";
      expiresAt: number;
      failures: number;
      entries: Array<{ id: string; code: string; expiresAt: number }>;
    }
  | { kind: "EVENT"; expiresAt: number; reply: string }
  | {
      kind: "PENDING";
      expiresAt: number;
      id: string;
      contextKey: string;
      openId: string;
      unionId: string | null;
      next: string;
      referralToken: string | null;
      status: "READY" | "CLAIMED";
      phone: string | null;
      verificationId: string | null;
      codeSentAt: number;
    }
  | { kind: "TOKEN"; expiresAt: number; token: string }
  | { kind: "LOCK"; expiresAt: number; owner: string };
export type RecordOf<T extends ScanRecord["kind"]> = Extract<
  ScanRecord,
  { kind: T }
>;
export function recordOf<T extends ScanRecord["kind"]>(
  record: ScanRecord | null | undefined,
  kind: T,
): RecordOf<T> | null {
  return record?.kind === kind ? (record as RecordOf<T>) : null;
}

export function wechatScanCookieName() {
  try {
    return new URL(process.env.APP_BASE_URL ?? "http://localhost:3600")
      .protocol === "https:"
      ? "__Host-abei_wechat_scan_context"
      : "abei_wechat_scan_context_dev";
  } catch {
    throw new WechatAuthError("config");
  }
}

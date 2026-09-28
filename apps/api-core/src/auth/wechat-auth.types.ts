export type WechatOAuthChannel = "MP" | "WEB";

export type WechatLoginErrorCode =
  | "config"
  | "state"
  | "denied"
  | "upstream"
  | "identity_conflict"
  | "disabled"
  | "mobile_browser";

export interface WechatOAuthStateRecord {
  channel: WechatOAuthChannel;
  next: string;
  issuedAt: number;
}

export interface WechatIdentity {
  channel: WechatOAuthChannel;
  openId: string;
  unionId: string;
  nickname: string;
  avatarUrl: string | null;
}

export class WechatAuthError extends Error {
  constructor(
    public readonly code: WechatLoginErrorCode,
    public readonly next?: string
  ) {
    super(code);
    this.name = "WechatAuthError";
  }
}

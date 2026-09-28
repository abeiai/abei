import { safeNextPath } from "./email-auth";

export type WechatLoginErrorCode =
  | "config"
  | "state"
  | "denied"
  | "upstream"
  | "identity_conflict"
  | "disabled"
  | "mobile_browser";

const wechatLoginErrorMessages: Record<WechatLoginErrorCode, string> = {
  config: "微信登录尚未完成配置",
  state: "微信登录状态已失效，请重新尝试",
  denied: "微信授权未完成，请重新尝试",
  upstream: "微信登录服务暂不可用，请稍后再试",
  identity_conflict: "微信账号关联异常，请联系客服处理",
  disabled: "账号已被禁用",
  mobile_browser: "请在微信中打开本页面，或在电脑上扫码登录"
};

export function wechatLoginHref(next?: string) {
  const safeNext = safeNextPath(next);
  return safeNext
    ? `/api/auth/wechat/authorize?next=${encodeURIComponent(safeNext)}`
    : "/api/auth/wechat/authorize";
}

export function wechatLoginErrorMessage(value: string | undefined) {
  if (!value || !(value in wechatLoginErrorMessages)) {
    return null;
  }

  return wechatLoginErrorMessages[value as WechatLoginErrorCode];
}

import type { ResponseLike } from "../security/cookies.js";

export const wechatOAuthStateCookie = "xueleai_wechat_oauth_state";
const wechatOAuthCookiePath = "/api/auth/wechat";

function shouldUseSecureCookies() {
  const appBaseUrl = process.env.APP_BASE_URL?.trim().toLowerCase();

  if (appBaseUrl) {
    return appBaseUrl.startsWith("https://");
  }

  return process.env.NODE_ENV === "production";
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: wechatOAuthCookiePath
  };
}

export function setWechatOAuthStateCookie(
  response: ResponseLike,
  state: string,
  maxAgeSeconds: number
) {
  response.cookie(wechatOAuthStateCookie, state, {
    ...baseCookieOptions(),
    maxAge: maxAgeSeconds * 1000
  });
}

export function clearWechatOAuthStateCookie(response: ResponseLike) {
  response.clearCookie(wechatOAuthStateCookie, baseCookieOptions());
}

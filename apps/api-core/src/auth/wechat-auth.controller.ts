import { referralCookie } from "../referrals/referral-rules.js";
import { Controller, Get, Inject, Logger, Query, Req, Res } from "@nestjs/common";
import { readCookie, type ResponseLike } from "../security/cookies.js";
import {
  getUserAgent,
  type HeaderRequestLike
} from "../security/request-types.js";
import {
  clearWechatOAuthStateCookie,
  setWechatOAuthStateCookie,
  wechatOAuthStateCookie
} from "./wechat-auth-cookie.js";
import {
  safeWechatNextPath,
  WechatAuthService
} from "./wechat-auth.service.js";
import {
  WechatAuthError,
  type WechatLoginErrorCode,
  type WechatOAuthChannel
} from "./wechat-auth.types.js";

interface WechatRedirectResponse extends ResponseLike {
  redirect(statusCode: number, url: string): void;
}

export interface WechatAuthFlow {
  createAuthorization(
    userAgent: string | null,
    next: string | undefined
  ): Promise<{
    channel: WechatOAuthChannel;
    state: string;
    url: string;
    maxAgeSeconds: number;
  }>;
  completeAuthorization(input: {
    code: string | undefined;
    state: string | undefined;
    stateCookie: string | null;
    referralToken?: string | null;
    response: ResponseLike;
  }): Promise<{ next: string }>;
}

@Controller("auth/wechat")
export class WechatAuthController {
  private readonly logger = new Logger(WechatAuthController.name);

  constructor(
    @Inject(WechatAuthService)
    private readonly wechatAuthService: WechatAuthFlow
  ) {}

  @Get("authorize")
  async authorize(
    @Req() request: HeaderRequestLike,
    @Query("next") next: string | undefined,
    @Res() response: WechatRedirectResponse
  ) {
    try {
      const authorization = await this.wechatAuthService.createAuthorization(
        getUserAgent(request),
        next
      );
      setWechatOAuthStateCookie(
        response,
        authorization.state,
        authorization.maxAgeSeconds
      );
      response.redirect(302, authorization.url);
    } catch (error) {
      const errorCode = this.errorCode(error, request.requestId);
      response.redirect(302, this.loginErrorUrl(errorCode));
    }
  }

  @Get("callback")
  async callback(
    @Req() request: HeaderRequestLike,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res() response: WechatRedirectResponse
  ) {
    let redirectUrl: string;

    try {
      const result = await this.wechatAuthService.completeAuthorization({
        code,
        state,
        stateCookie: readCookie(request, wechatOAuthStateCookie),
        referralToken: readCookie(request, referralCookie),
        response
      });
      const next = safeWechatNextPath(result.next);
      redirectUrl = this.appUrl(`/select-profile?next=${encodeURIComponent(next)}`);
    } catch (error) {
      redirectUrl = this.loginErrorUrl(this.errorCode(error, request.requestId));
    } finally {
      clearWechatOAuthStateCookie(response);
    }

    response.redirect(302, redirectUrl);
  }

  private errorCode(error: unknown, requestId: string | undefined) {
    if (error instanceof WechatAuthError) {
      return error.code;
    }

    this.logger.error(
      JSON.stringify({
        requestId: requestId ?? "unknown",
        errorName: error instanceof Error ? error.name : "UnknownError"
      })
    );
    return "upstream" satisfies WechatLoginErrorCode;
  }

  private loginErrorUrl(errorCode: WechatLoginErrorCode) {
    return this.appUrl(`/login?wechat_error=${encodeURIComponent(errorCode)}`);
  }

  private appUrl(path: string) {
    const appBaseUrl = process.env.APP_BASE_URL?.trim() || "http://localhost:3321";

    try {
      return new URL(path, `${appBaseUrl.replace(/\/+$/u, "")}/`).toString();
    } catch {
      return path;
    }
  }
}

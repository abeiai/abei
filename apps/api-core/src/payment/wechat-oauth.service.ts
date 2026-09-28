import { createHmac, randomBytes } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { getPrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { PaymentConfigService } from "./payment-config.service.js";

interface OAuthStatePayload {
  userId: string;
  redirectPath: string;
  nonce: string;
  issuedAt: number;
}

@Injectable()
export class WechatOAuthService {
  private readonly prisma = getPrismaClient();

  constructor(
    @Inject(PaymentConfigService)
    private readonly paymentConfigService: PaymentConfigService
  ) {}

  async createAuthorizationUrl(userId: string, redirectPath: string) {
    const config = await this.paymentConfigService.getWechatJsapiRuntimeConfig();

    if (!config) {
      throw new AppException(40004, "微信 JSAPI 支付尚未完成配置", HttpStatus.BAD_REQUEST);
    }

    const state = this.signState({
      userId,
      redirectPath: safeRedirectPath(redirectPath),
      nonce: randomBytes(12).toString("hex"),
      issuedAt: Date.now()
    });
    const params = new URLSearchParams({
      appid: config.appId,
      redirect_uri: config.oauthCallbackUrl,
      response_type: "code",
      scope: "snsapi_base",
      state
    });

    return `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`;
  }

  async handleCallback(code: string, state: string) {
    const payload = this.verifyState(state);
    const config = await this.paymentConfigService.getWechatJsapiRuntimeConfig();

    if (!config) {
      throw new AppException(40004, "微信 JSAPI 支付尚未完成配置", HttpStatus.BAD_REQUEST);
    }

    const params = new URLSearchParams({
      appid: config.appId,
      secret: config.appSecret,
      code,
      grant_type: "authorization_code"
    });
    const response = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?${params.toString()}`);
    const result = await response.json() as {
      openid?: string;
      errcode?: number;
      errmsg?: string;
    };

    if (!response.ok || !result.openid) {
      throw new AppException(40004, result.errmsg || "微信授权失败", HttpStatus.BAD_REQUEST);
    }

    await this.prisma.user.update({
      where: {
        id: payload.userId
      },
      data: {
        wechatOpenId: result.openid
      }
    });

    return `${this.appBaseUrl()}${payload.redirectPath}`;
  }

  private signState(payload: OAuthStatePayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.signature(encoded);

    return `${encoded}.${signature}`;
  }

  private verifyState(state: string) {
    const [encoded, signature] = state.split(".");

    if (!encoded || !signature || signature !== this.signature(encoded)) {
      throw new AppException(40001, "微信授权状态无效", HttpStatus.BAD_REQUEST);
    }

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload;

    if (!payload.userId || !payload.redirectPath || Date.now() - payload.issuedAt > 10 * 60 * 1000) {
      throw new AppException(40001, "微信授权状态已失效", HttpStatus.BAD_REQUEST);
    }

    return {
      ...payload,
      redirectPath: safeRedirectPath(payload.redirectPath)
    };
  }

  private signature(value: string) {
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new AppException(50002, "JWT Access Secret 未配置", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return createHmac("sha256", secret).update(value).digest("base64url");
  }

  private appBaseUrl() {
    return (process.env.APP_BASE_URL ?? "http://localhost:3321").replace(/\/$/, "");
  }
}

function safeRedirectPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard/billing";
}

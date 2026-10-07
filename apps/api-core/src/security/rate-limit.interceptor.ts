import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { AppException } from "../common/app-exception.js";
import {
  getClientIp,
  getRequestPath,
  type HeaderRequestLike,
} from "./request-types.js";

interface RateLimitRule {
  method: string;
  path: RegExp;
  bucketPath?: string;
  maxEnv: string;
  fallbackMax: number;
  subject?: {
    maxEnv: string;
    fallbackMax: number;
    getKey(request: HeaderRequestLike): string | null;
  };
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rules: RateLimitRule[] = [
  {
    method: "POST",
    path: /^\/api\/referrals\/visit\/[a-z0-9]+$/,
    bucketPath: "/api/referrals/visit",
    maxEnv: "RATE_LIMIT_REFERRAL_VISIT_MAX",
    fallbackMax: 60,
  },
  {
    method: "POST",
    path: /^\/api\/referrals\/alias$/,
    maxEnv: "RATE_LIMIT_REFERRAL_ALIAS_MAX",
    fallbackMax: 10,
  },
  {
    method: "GET",
    path: /^\/api\/auth\/wechat\/mp\/(?:bootstrap|challenges\/[^/]+)\/?$/,
    bucketPath: "/api/auth/wechat/mp/poll",
    maxEnv: "RATE_LIMIT_AUTH_WECHAT_POLL_MAX",
    fallbackMax: 180,
  },
  {
    method: "POST",
    path: /^\/api\/auth\/wechat\/mp\/resolution\/phone-code\/?$/,
    bucketPath: "/api/auth/wechat/mp/phone-code",
    maxEnv: "RATE_LIMIT_AUTH_PHONE_CODE_MAX",
    fallbackMax: 5,
    subject: {
      maxEnv: "RATE_LIMIT_AUTH_WECHAT_PHONE_SUBJECT_MAX",
      fallbackMax: 3,
      getKey: (request) => {
        const body = request.body;
        return body && typeof body === "object" && "phone" in body
          ? normalizePhoneSubject(body.phone)
          : null;
      },
    },
  },
  {
    method: "POST",
    path: /^\/api\/auth\/wechat\/mp\/(?:challenges(?:\/[^/]+\/complete)?|resolution\/(?:phone|email))\/?$/,
    bucketPath: "/api/auth/wechat/mp/actions",
    maxEnv: "RATE_LIMIT_AUTH_WECHAT_MAX",
    fallbackMax: 20,
  },
  {
    method: "POST",
    path: /^\/api\/auth\/login$/,
    maxEnv: "RATE_LIMIT_AUTH_LOGIN_MAX",
    fallbackMax: 10,
  },
  {
    method: "POST",
    path: /^\/api\/auth\/learner-login\/?$/,
    bucketPath: "/api/auth/learner-login",
    maxEnv: "RATE_LIMIT_AUTH_LEARNER_LOGIN_MAX",
    fallbackMax: 10,
  },
  {
    method: "POST",
    path: /^\/api\/auth\/register$/,
    maxEnv: "RATE_LIMIT_AUTH_REGISTER_MAX",
    fallbackMax: 5,
  },
  {
    method: "POST",
    path: /^\/api\/auth\/phone-code$/,
    maxEnv: "RATE_LIMIT_AUTH_PHONE_CODE_MAX",
    fallbackMax: 5,
  },
  {
    method: "POST",
    path: /^\/api\/auth\/email-code$/,
    maxEnv: "RATE_LIMIT_AUTH_EMAIL_CODE_MAX",
    fallbackMax: 5,
    subject: {
      maxEnv: "RATE_LIMIT_AUTH_EMAIL_CODE_SUBJECT_MAX",
      fallbackMax: 3,
      getKey: (request) => {
        const body =
          request.body && typeof request.body === "object"
            ? request.body
            : null;
        const email = normalizeEmailSubject(
          body && "email" in body ? body.email : null,
        );
        const purpose =
          body && "purpose" in body && typeof body.purpose === "string"
            ? body.purpose.trim().toUpperCase()
            : "";

        return email ? `${email}:${purpose || "UNKNOWN"}` : null;
      },
    },
  },
  {
    method: "POST",
    path: /^\/api\/auth\/phone-login$/,
    maxEnv: "RATE_LIMIT_AUTH_PHONE_LOGIN_MAX",
    fallbackMax: 10,
  },
  {
    method: "POST",
    path: /^\/api\/auth\/reset-password$/,
    maxEnv: "RATE_LIMIT_AUTH_RESET_PASSWORD_MAX",
    fallbackMax: 5,
    subject: {
      maxEnv: "RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX",
      fallbackMax: 5,
      getKey: (request) => {
        const body =
          request.body && typeof request.body === "object"
            ? request.body
            : null;
        const email = normalizeEmailSubject(
          body && "email" in body ? body.email : null,
        );

        return email ? email : null;
      },
    },
  },
  {
    method: "POST",
    path: /^\/api\/auth\/password-reset\/verify-code$/,
    bucketPath: "/api/auth/password-reset",
    maxEnv: "RATE_LIMIT_AUTH_RESET_PASSWORD_MAX",
    fallbackMax: 5,
    subject: {
      maxEnv: "RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX",
      fallbackMax: 5,
      getKey: (request) => {
        const body =
          request.body && typeof request.body === "object"
            ? request.body
            : null;
        const method =
          body && "method" in body && typeof body.method === "string"
            ? body.method.trim().toUpperCase()
            : "";
        const email = normalizeEmailSubject(
          body && "email" in body ? body.email : null,
        );
        const phone = normalizePhoneSubject(
          body && "phone" in body ? body.phone : null,
        );

        if (method === "EMAIL" && email) {
          return `email:${email}`;
        }

        if (method === "PHONE" && phone) {
          return `phone:${phone}`;
        }

        return null;
      },
    },
  },
  {
    method: "POST",
    path: /^\/api\/auth\/password-reset\/confirm$/,
    bucketPath: "/api/auth/password-reset",
    maxEnv: "RATE_LIMIT_AUTH_RESET_PASSWORD_MAX",
    fallbackMax: 5,
  },
  {
    method: "POST",
    path: /^\/api\/admin-auth\/login$/,
    maxEnv: "RATE_LIMIT_ADMIN_AUTH_LOGIN_MAX",
    fallbackMax: 10,
  },
  {
    method: "POST",
    path: /^\/api\/profiles\/switch-learner\/?$/,
    bucketPath: "/api/profiles/switch-learner",
    maxEnv: "RATE_LIMIT_PROFILE_SWITCH_MAX",
    fallbackMax: 20,
  },
  {
    method: "POST",
    path: /^\/api\/profiles\/return-account\/?$/,
    bucketPath: "/api/profiles/return-account",
    maxEnv: "RATE_LIMIT_PROFILE_RETURN_ACCOUNT_MAX",
    fallbackMax: 20,
  },
  {
    method: "POST",
    path: /^\/api\/payment\/orders$/,
    maxEnv: "RATE_LIMIT_PAYMENT_ORDERS_MAX",
    fallbackMax: 20,
  },
  {
    method: "POST",
    path: /^\/api\/payment\/orders\/[^/]+\/sync$/,
    bucketPath: "/api/payment/orders/:id/sync",
    maxEnv: "RATE_LIMIT_PAYMENT_ORDER_SYNC_MAX",
    fallbackMax: 30,
  },
  {
    method: "POST",
    path: /^\/api\/ai\/tasks$/,
    maxEnv: "RATE_LIMIT_AI_TASKS_MAX",
    fallbackMax: 20,
  },
];

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly buckets = new Map<string, RateLimitBucket>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<HeaderRequestLike>();
    const method = request.method ?? "";
    const path = getRequestPath(request);
    const rule = rules.find(
      (item) => item.method === method && item.path.test(path),
    );

    if (rule) {
      this.assertAllowed(request, rule, path);
      this.assertSubjectAllowed(request, rule, path);
    }

    return next.handle();
  }

  private assertAllowed(
    request: HeaderRequestLike,
    rule: RateLimitRule,
    path: string,
  ) {
    const windowMs = this.windowSeconds() * 1000;
    const maxRequests = this.maxRequests(rule);
    const clientIp =
      request.ip ??
      request.socket?.remoteAddress ??
      getClientIp(request) ??
      "unknown";
    const key = `${rule.method}:${rule.bucketPath ?? path}:${clientIp}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    bucket.count += 1;

    if (bucket.count > maxRequests) {
      throw new AppException(
        42901,
        "请求过于频繁，请稍后再试。",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private assertSubjectAllowed(
    request: HeaderRequestLike,
    rule: RateLimitRule,
    path: string,
  ) {
    if (!rule.subject) {
      return;
    }

    const subjectKey = rule.subject.getKey(request);

    if (!subjectKey) {
      return;
    }

    this.assertBucketAllowed(
      `${rule.method}:${rule.bucketPath ?? path}:subject:${subjectKey}`,
      this.maxSubjectRequests(rule),
    );
  }

  private assertBucketAllowed(key: string, maxRequests: number) {
    const windowMs = this.windowSeconds() * 1000;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    bucket.count += 1;

    if (bucket.count > maxRequests) {
      throw new AppException(
        42901,
        "请求过于频繁，请稍后再试。",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private windowSeconds() {
    const value = Number(process.env.RATE_LIMIT_WINDOW_SECONDS);

    return Number.isFinite(value) && value > 0 ? value : 60;
  }

  private maxRequests(rule: RateLimitRule) {
    const value = Number(process.env[rule.maxEnv]);

    return Number.isFinite(value) && value > 0 ? value : rule.fallbackMax;
  }

  private maxSubjectRequests(rule: RateLimitRule) {
    if (!rule.subject) {
      return rule.fallbackMax;
    }

    const value = Number(process.env[rule.subject.maxEnv]);

    return Number.isFinite(value) && value > 0
      ? value
      : rule.subject.fallbackMax;
  }
}

function normalizeEmailSubject(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePhoneSubject(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/[\s-]/g, "") : "";
}

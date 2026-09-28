import assert from "node:assert/strict";
import test from "node:test";
import type { CallHandler, ExecutionContext } from "@nestjs/common";

import { AppException } from "../src/common/app-exception.js";
import { RateLimitInterceptor } from "../src/security/rate-limit.interceptor.js";

function contextFor(
  path: string,
  options: {
    body?: unknown;
    forwardedFor?: string;
    ip?: string;
    method?: string;
  } = {}
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: options.forwardedFor
          ? {
              "x-forwarded-for": options.forwardedFor
            }
          : {},
        body: options.body,
        ip: options.ip ?? "203.0.113.10",
        method: options.method ?? "POST",
        originalUrl: path
      })
    })
  } as unknown as ExecutionContext;
}

const next = {
  handle: () => undefined
} as unknown as CallHandler;

test("微信授权与回调共享 GET 限流桶", () => {
  const previousMax = process.env.RATE_LIMIT_AUTH_WECHAT_MAX;
  const previousWindow = process.env.RATE_LIMIT_WINDOW_SECONDS;
  process.env.RATE_LIMIT_AUTH_WECHAT_MAX = "1";
  process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

  try {
    const interceptor = new RateLimitInterceptor();
    const options = { method: "GET", ip: "203.0.113.80" };

    interceptor.intercept(
      contextFor("/api/auth/wechat/authorize", options),
      next
    );
    assert.throws(
      () =>
        interceptor.intercept(
          contextFor("/api/auth/wechat/callback", options),
          next
        ),
      (error: unknown) =>
        error instanceof AppException &&
        error.code === 42901 &&
        error.getStatus() === 429
    );
  } finally {
    if (previousMax === undefined) {
      delete process.env.RATE_LIMIT_AUTH_WECHAT_MAX;
    } else {
      process.env.RATE_LIMIT_AUTH_WECHAT_MAX = previousMax;
    }
    if (previousWindow === undefined) {
      delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.RATE_LIMIT_WINDOW_SECONDS = previousWindow;
    }
  }
});

test("支付订单同步接口受限流保护", () => {
  const previousMax = process.env.RATE_LIMIT_PAYMENT_ORDER_SYNC_MAX;
  const previousWindow = process.env.RATE_LIMIT_WINDOW_SECONDS;
  process.env.RATE_LIMIT_PAYMENT_ORDER_SYNC_MAX = "1";
  process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

  try {
    const interceptor = new RateLimitInterceptor();

    interceptor.intercept(contextFor("/api/payment/orders/order-1/sync"), next);
    assert.throws(
      () =>
        interceptor.intercept(
          contextFor("/api/payment/orders/order-2/sync", {
            forwardedFor: "198.51.100.20"
          }),
          next
        ),
      (error: unknown) =>
        error instanceof AppException &&
        error.code === 42901 &&
        error.getStatus() === 429
    );
  } finally {
    if (previousMax === undefined) {
      delete process.env.RATE_LIMIT_PAYMENT_ORDER_SYNC_MAX;
    } else {
      process.env.RATE_LIMIT_PAYMENT_ORDER_SYNC_MAX = previousMax;
    }

    if (previousWindow === undefined) {
      delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.RATE_LIMIT_WINDOW_SECONDS = previousWindow;
    }
  }
});

test("学习者切换和返回账号各自按 IP 每分钟限制 20 次", () => {
  const previousSwitchMax = process.env.RATE_LIMIT_PROFILE_SWITCH_MAX;
  const previousReturnMax = process.env.RATE_LIMIT_PROFILE_RETURN_ACCOUNT_MAX;
  const previousWindow = process.env.RATE_LIMIT_WINDOW_SECONDS;
  delete process.env.RATE_LIMIT_PROFILE_SWITCH_MAX;
  delete process.env.RATE_LIMIT_PROFILE_RETURN_ACCOUNT_MAX;
  process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

  try {
    const interceptor = new RateLimitInterceptor();

    for (let index = 0; index < 20; index += 1) {
      interceptor.intercept(contextFor("/api/profiles/switch-learner"), next);
      interceptor.intercept(contextFor("/api/profiles/return-account"), next);
    }

    for (const path of ["/api/profiles/switch-learner", "/api/profiles/return-account"]) {
      assert.throws(
        () => interceptor.intercept(contextFor(path), next),
        (error: unknown) =>
          error instanceof AppException &&
          error.code === 42901 &&
          error.message === "请求过于频繁，请稍后再试。" &&
          error.getStatus() === 429
      );
    }
  } finally {
    if (previousSwitchMax === undefined) delete process.env.RATE_LIMIT_PROFILE_SWITCH_MAX;
    else process.env.RATE_LIMIT_PROFILE_SWITCH_MAX = previousSwitchMax;
    if (previousReturnMax === undefined) delete process.env.RATE_LIMIT_PROFILE_RETURN_ACCOUNT_MAX;
    else process.env.RATE_LIMIT_PROFILE_RETURN_ACCOUNT_MAX = previousReturnMax;
    if (previousWindow === undefined) delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    else process.env.RATE_LIMIT_WINDOW_SECONDS = previousWindow;
  }
});

test("学习账号直接登录的标准与尾斜杠路径共享 IP 限流桶且不同 IP 隔离", () => {
  const previousMax = process.env.RATE_LIMIT_AUTH_LEARNER_LOGIN_MAX;
  process.env.RATE_LIMIT_AUTH_LEARNER_LOGIN_MAX = "1";

  try {
    const interceptor = new RateLimitInterceptor();
    interceptor.intercept(
      contextFor("/api/auth/learner-login", {
        body: { accountId: "10000", learnerId: "100" },
        ip: "203.0.113.55"
      }),
      next
    );
    assert.throws(
      () => interceptor.intercept(
        contextFor("/api/auth/learner-login/", {
          body: { accountId: "20000", learnerId: "200" },
          ip: "203.0.113.55"
        }),
        next
      ),
      (error: unknown) => error instanceof AppException && error.code === 42901
    );

    assert.doesNotThrow(() => interceptor.intercept(
      contextFor("/api/auth/learner-login", {
        body: { accountId: "10000", learnerId: "100" },
        ip: "203.0.113.56"
      }),
      next
    ));
  } finally {
    if (previousMax === undefined) delete process.env.RATE_LIMIT_AUTH_LEARNER_LOGIN_MAX;
    else process.env.RATE_LIMIT_AUTH_LEARNER_LOGIN_MAX = previousMax;
  }
});

test("学习者切换和返回账号的 canonical 与尾斜杠路径共享限流 bucket", () => {
  const previousSwitchMax = process.env.RATE_LIMIT_PROFILE_SWITCH_MAX;
  const previousReturnMax = process.env.RATE_LIMIT_PROFILE_RETURN_ACCOUNT_MAX;
  process.env.RATE_LIMIT_PROFILE_SWITCH_MAX = "1";
  process.env.RATE_LIMIT_PROFILE_RETURN_ACCOUNT_MAX = "1";

  try {
    const interceptor = new RateLimitInterceptor();

    for (const [canonical, trailing] of [
      ["/api/profiles/switch-learner", "/api/profiles/switch-learner/"],
      ["/api/profiles/return-account", "/api/profiles/return-account/"]
    ]) {
      interceptor.intercept(contextFor(canonical), next);
      assert.throws(
        () => interceptor.intercept(contextFor(trailing), next),
        (error: unknown) => error instanceof AppException && error.code === 42901 && error.getStatus() === 429
      );
    }
  } finally {
    if (previousSwitchMax === undefined) delete process.env.RATE_LIMIT_PROFILE_SWITCH_MAX;
    else process.env.RATE_LIMIT_PROFILE_SWITCH_MAX = previousSwitchMax;
    if (previousReturnMax === undefined) delete process.env.RATE_LIMIT_PROFILE_RETURN_ACCOUNT_MAX;
    else process.env.RATE_LIMIT_PROFILE_RETURN_ACCOUNT_MAX = previousReturnMax;
  }
});

test("邮箱验证码发送接口受限流保护", () => {
  const previousMax = process.env.RATE_LIMIT_AUTH_EMAIL_CODE_MAX;
  const previousWindow = process.env.RATE_LIMIT_WINDOW_SECONDS;
  process.env.RATE_LIMIT_AUTH_EMAIL_CODE_MAX = "1";
  process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

  try {
    const interceptor = new RateLimitInterceptor();

    interceptor.intercept(contextFor("/api/auth/email-code"), next);
    assert.throws(
      () => interceptor.intercept(contextFor("/api/auth/email-code"), next),
      (error: unknown) =>
        error instanceof AppException &&
        error.code === 42901 &&
        error.getStatus() === 429
    );
  } finally {
    if (previousMax === undefined) {
      delete process.env.RATE_LIMIT_AUTH_EMAIL_CODE_MAX;
    } else {
      process.env.RATE_LIMIT_AUTH_EMAIL_CODE_MAX = previousMax;
    }

    if (previousWindow === undefined) {
      delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.RATE_LIMIT_WINDOW_SECONDS = previousWindow;
    }
  }
});

test("邮箱验证码发送接口按邮箱和用途受限流保护", () => {
  const previousEndpointMax = process.env.RATE_LIMIT_AUTH_EMAIL_CODE_MAX;
  const previousSubjectMax = process.env.RATE_LIMIT_AUTH_EMAIL_CODE_SUBJECT_MAX;
  const previousWindow = process.env.RATE_LIMIT_WINDOW_SECONDS;
  process.env.RATE_LIMIT_AUTH_EMAIL_CODE_MAX = "100";
  process.env.RATE_LIMIT_AUTH_EMAIL_CODE_SUBJECT_MAX = "1";
  process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

  try {
    const interceptor = new RateLimitInterceptor();

    interceptor.intercept(
      contextFor("/api/auth/email-code", {
        body: {
          email: "Same@Example.com",
          purpose: "REGISTER"
        },
        ip: "203.0.113.10"
      }),
      next
    );
    assert.throws(
      () =>
        interceptor.intercept(
          contextFor("/api/auth/email-code", {
            body: {
              email: "same@example.com",
              purpose: "REGISTER"
            },
            ip: "203.0.113.11"
          }),
          next
        ),
      (error: unknown) =>
        error instanceof AppException &&
        error.code === 42901 &&
        error.getStatus() === 429
    );
    interceptor.intercept(
      contextFor("/api/auth/email-code", {
        body: {
          email: "same@example.com",
          purpose: "RESET_PASSWORD"
        },
        ip: "203.0.113.12"
      }),
      next
    );
  } finally {
    if (previousEndpointMax === undefined) {
      delete process.env.RATE_LIMIT_AUTH_EMAIL_CODE_MAX;
    } else {
      process.env.RATE_LIMIT_AUTH_EMAIL_CODE_MAX = previousEndpointMax;
    }

    if (previousSubjectMax === undefined) {
      delete process.env.RATE_LIMIT_AUTH_EMAIL_CODE_SUBJECT_MAX;
    } else {
      process.env.RATE_LIMIT_AUTH_EMAIL_CODE_SUBJECT_MAX = previousSubjectMax;
    }

    if (previousWindow === undefined) {
      delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.RATE_LIMIT_WINDOW_SECONDS = previousWindow;
    }
  }
});

test("重置密码接口受限流保护", () => {
  const previousMax = process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX;
  const previousWindow = process.env.RATE_LIMIT_WINDOW_SECONDS;
  process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX = "1";
  process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

  try {
    const interceptor = new RateLimitInterceptor();

    interceptor.intercept(contextFor("/api/auth/reset-password"), next);
    assert.throws(
      () => interceptor.intercept(contextFor("/api/auth/reset-password"), next),
      (error: unknown) =>
        error instanceof AppException &&
        error.code === 42901 &&
        error.getStatus() === 429
    );
  } finally {
    if (previousMax === undefined) {
      delete process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX;
    } else {
      process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX = previousMax;
    }

    if (previousWindow === undefined) {
      delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.RATE_LIMIT_WINDOW_SECONDS = previousWindow;
    }
  }
});

test("重置密码接口按邮箱受限流保护", () => {
  const previousEndpointMax = process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX;
  const previousSubjectMax = process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX;
  const previousWindow = process.env.RATE_LIMIT_WINDOW_SECONDS;
  process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX = "100";
  process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX = "1";
  process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

  try {
    const interceptor = new RateLimitInterceptor();

    interceptor.intercept(
      contextFor("/api/auth/reset-password", {
        body: {
          email: "Reset@Example.com"
        },
        ip: "203.0.113.10"
      }),
      next
    );
    assert.throws(
      () =>
        interceptor.intercept(
          contextFor("/api/auth/reset-password", {
            body: {
              email: "reset@example.com"
            },
            ip: "203.0.113.11"
          }),
          next
        ),
      (error: unknown) =>
        error instanceof AppException &&
        error.code === 42901 &&
        error.getStatus() === 429
    );
  } finally {
    if (previousEndpointMax === undefined) {
      delete process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX;
    } else {
      process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX = previousEndpointMax;
    }

    if (previousSubjectMax === undefined) {
      delete process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX;
    } else {
      process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX = previousSubjectMax;
    }

    if (previousWindow === undefined) {
      delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.RATE_LIMIT_WINDOW_SECONDS = previousWindow;
    }
  }
});

test("重置密码验证码验证按邮箱和手机号受限流保护", () => {
  const previousEndpointMax = process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX;
  const previousSubjectMax = process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX;
  const previousWindow = process.env.RATE_LIMIT_WINDOW_SECONDS;
  process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX = "100";
  process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX = "1";
  process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

  try {
    const interceptor = new RateLimitInterceptor();

    interceptor.intercept(
      contextFor("/api/auth/password-reset/verify-code", {
        body: {
          method: "EMAIL",
          email: "ResetVerify@Example.com"
        },
        ip: "203.0.113.10"
      }),
      next
    );
    assert.throws(
      () =>
        interceptor.intercept(
          contextFor("/api/auth/password-reset/verify-code", {
            body: {
              method: "EMAIL",
              email: "resetverify@example.com"
            },
            ip: "203.0.113.11"
          }),
          next
        ),
      (error: unknown) =>
        error instanceof AppException &&
        error.code === 42901 &&
        error.getStatus() === 429
    );
    interceptor.intercept(
      contextFor("/api/auth/password-reset/verify-code", {
        body: {
          method: "PHONE",
          phone: "138 0000-0000"
        },
        ip: "203.0.113.12"
      }),
      next
    );
    assert.throws(
      () =>
        interceptor.intercept(
          contextFor("/api/auth/password-reset/verify-code", {
            body: {
              method: "PHONE",
              phone: "13800000000"
            },
            ip: "203.0.113.13"
          }),
          next
        ),
      (error: unknown) =>
        error instanceof AppException &&
        error.code === 42901 &&
        error.getStatus() === 429
    );
  } finally {
    if (previousEndpointMax === undefined) {
      delete process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX;
    } else {
      process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_MAX = previousEndpointMax;
    }

    if (previousSubjectMax === undefined) {
      delete process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX;
    } else {
      process.env.RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX = previousSubjectMax;
    }

    if (previousWindow === undefined) {
      delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.RATE_LIMIT_WINDOW_SECONDS = previousWindow;
    }
  }
});

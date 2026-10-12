import { creatorTestHttpPort } from "./helpers/abei-test-environment.js";
import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WechatAuthController } from "../src/auth/wechat-auth.controller.js";
import { WechatAuthService } from "../src/auth/wechat-auth.service.js";
import { AuthService } from "../src/auth/auth.service.js";
import { AuthController } from "../src/auth/auth.controller.js";
import { AppException } from "../src/common/app-exception.js";
import { HttpExceptionFilter } from "../src/common/http-exception.filter.js";

const testPort = creatorTestHttpPort();

test("登录前端点提供不可缓存的 CSRF 上下文，旧 OAuth 路由已移除", async () => {
  @Module({
    controllers: [WechatAuthController],
    providers: [
      {
        provide: AuthService,
        useValue: {
          async me() {
            throw new AppException(40101, "请先登录", 401);
          },
        },
      },
      {
        provide: WechatAuthService,
        useValue: {
          async bootstrap() {
            return { contextId: "test-context", csrfToken: "test-csrf" };
          },
        },
      },
    ],
  })
  class HarnessModule {}
  process.env.APP_BASE_URL = `http://127.0.0.1:${testPort}`;
  const app = await NestFactory.create(HarnessModule, { logger: false });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(testPort, "127.0.0.1");
  try {
    const response = await fetch(
      `http://127.0.0.1:${testPort}/api/auth/wechat/mp/bootstrap`,
      {
        headers: {
          Origin: `http://127.0.0.1:${testPort}`,
          "Sec-Fetch-Site": "same-origin",
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/i);
    assert.equal((await response.json()).data.csrfToken, "test-csrf");
    const obsolete = await fetch(
      `http://127.0.0.1:${testPort}/api/auth/wechat/authorize`,
      { redirect: "manual" },
    );
    assert.equal(obsolete.status, 404);
    const obsoleteCallback = await fetch(
      `http://127.0.0.1:${testPort}/api/auth/wechat/callback`,
    );
    assert.equal(obsoleteCallback.status, 404);
  } finally {
    await app.close();
  }
});

test("四类普通登录均经过微信上下文互斥守卫，HTTPS 不信任开发 Cookie", async () => {
  const oldEnabled = process.env.WECHAT_MP_LOGIN_ENABLED,
    oldOrigin = process.env.APP_BASE_URL;
  process.env.WECHAT_MP_LOGIN_ENABLED = "true";
  process.env.APP_BASE_URL = "https://abei.example";
  const guarded: Array<string | null> = [],
    logins: string[] = [];
  const service = {
    async register() {
      logins.push("register");
      return {};
    },
    async login() {
      logins.push("login");
      return {};
    },
    async loginByPhone() {
      logins.push("phone");
      return {};
    },
    async loginAsLearner() {
      logins.push("learner");
      return {};
    },
  };
  const wechat = {
    async withAlternativeLogin<T>(
      id: string | null,
      operation: () => Promise<T>,
    ) {
      guarded.push(id);
      return operation();
    },
  };
  const controller = new AuthController(
      service as never,
      {} as never,
      {} as never,
      wechat as never,
    ),
    response = { cookie() {}, clearCookie() {} },
    request = {
      headers: {
        cookie:
          "__Host-abei_wechat_scan_context=trusted-browser-context; abei_wechat_scan_context_dev=untrusted-context",
      },
    };
  try {
    await controller.register({} as never, response, request);
    await controller.login({} as never, response, request);
    await controller.phoneLogin({} as never, response, request);
    await controller.learnerLogin({} as never, response, request);
    assert.deepEqual(guarded, Array(4).fill("trusted-browser-context"));
    assert.deepEqual(logins, ["register", "login", "phone", "learner"]);
  } finally {
    if (oldEnabled === undefined) delete process.env.WECHAT_MP_LOGIN_ENABLED;
    else process.env.WECHAT_MP_LOGIN_ENABLED = oldEnabled;
    if (oldOrigin === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = oldOrigin;
  }
});

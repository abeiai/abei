import { creatorTestHttpPort } from "./helpers/abei-test-environment.js";
import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

test("明文模式回调通过 GET 验证和 POST 扫码事件，坏签名被拒绝", async () => {
  const values = {
    WECHAT_MP_LOGIN_ENABLED: "true",
    WECHAT_MP_MESSAGE_MODE: "plain",
    WECHAT_APP_ID: "wx0123456789abcdef",
    WECHAT_APP_SECRET: "unit-secret",
    WECHAT_MP_CALLBACK_TOKEN: "unitcallbacktoken",
    WECHAT_MP_ENCODING_AES_KEY: Buffer.alloc(32, 7).toString("base64").slice(0, -1),
    WECHAT_MP_ORIGINAL_ID: "gh_unit_test",
    APP_BASE_URL: "https://abei.example",
  };
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  const received: Record<string, string>[] = [];
  @Module({
    controllers: [WechatAuthController],
    providers: [
      { provide: AuthService, useValue: {} },
      {
        provide: WechatAuthService,
        useValue: {
          async handleMessage(message: Record<string, string>) {
            received.push(message);
            return "扫码成功，请返回网页";
          },
        },
      },
    ],
  })
  class HarnessModule {}
  const app = await NestFactory.create(HarnessModule, { logger: false });
  app.useBodyParser("text", { type: ["application/xml", "text/xml"] });
  app.setGlobalPrefix("api");
  await app.listen(3609, "127.0.0.1");
  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = "route-nonce";
    const signature = createHash("sha1")
      .update([values.WECHAT_MP_CALLBACK_TOKEN, timestamp, nonce].sort().join(""))
      .digest("hex");
    const url = new URL("http://127.0.0.1:3609/api/auth/wechat/mp/events");
    url.search = new URLSearchParams({ timestamp, nonce, signature }).toString();
    const verify = await fetch(url + "&echostr=verified-echo");
    assert.equal(verify.status, 200);
    assert.equal(await verify.text(), "verified-echo");
    const body = `<xml><ToUserName><![CDATA[gh_unit_test]]></ToUserName><FromUserName><![CDATA[verified-openid]]></FromUserName><CreateTime>${timestamp}</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[SCAN]]></Event><EventKey><![CDATA[ABEI2_L_0123456789abcdef0123456789abcdef]]></EventKey></xml>`;
    const scan = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: "\n" + body.replace("<xml>", "<xml>\n")
        .replace(/(<\/[A-Za-z]+>)(?=<)/g, "$1\n") + "\n",
    });
    assert.equal(scan.status, 200);
    assert.match(await scan.text(), /扫码成功，请返回网页/);
    assert.equal(received[0]?.FromUserName, "verified-openid");
    url.searchParams.set("signature", "0".repeat(40));
    const rejected = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body,
    });
    assert.equal(rejected.status, 400);
    assert.equal(received.length, 1);
  } finally {
    await app.close();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import * as auth from "../src/lib/wechat-auth.js";
import {
  publicAccountLabel,
  publicEmailLabel,
} from "../src/lib/user-identity.js";
interface Client {
  start(
    next?: string,
  ): Promise<{ challengeId: string; qrcodeUrl: string; expiresAt: number }>;
  poll(id: string): Promise<{ status: string; confirmationCode?: string }>;
  complete(id: string): Promise<{ status: string; next?: string }>;
}
test("扫码客户端使用同源上下文和 CSRF，不再跳转 OAuth", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const values = [
    { csrfToken: "browser-csrf", registrationEnabled: true },
    {
      challengeId: "opaque-challenge-id",
      qrcodeUrl: "https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=unit",
      expiresAt: Date.now() + 180000,
    },
    {
      status: "SCANNED",
      confirmationCode: "456789",
      expiresAt: Date.now() + 180000,
    },
    { status: "AUTHENTICATED", next: "/select-profile?next=%2Fpicture-books" },
  ];
  const request = (async (url: RequestInfo | URL, init: RequestInit = {}) => {
    requests.push({ url: String(url), init });
    return new Response(
      JSON.stringify({ code: 0, message: "成功", data: values.shift() }),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  const Constructor = (
    auth as unknown as {
      WechatScanClient: new (request: typeof fetch) => Client;
    }
  ).WechatScanClient;
  const client = new Constructor(request),
    challenge = await client.start("//evil.example");
  assert.equal(requests[0]!.url, "/api/auth/wechat/mp/bootstrap");
  assert.equal(requests[1]!.url, "/api/auth/wechat/mp/challenges");
  assert.equal(
    (JSON.parse(String(requests[1]!.init.body)) as { next: string }).next,
    "/",
  );
  assert.equal(
    new Headers(requests[1]!.init.headers).get("x-wechat-csrf"),
    "browser-csrf",
  );
  assert.equal(requests[1]!.init.credentials, "same-origin");
  assert.equal(requests[1]!.init.cache, "no-store");
  assert.equal(
    (await client.poll(challenge.challengeId)).confirmationCode,
    "456789",
  );
  assert.equal(
    (await client.complete(challenge.challengeId)).next,
    "/select-profile?next=%2Fpicture-books",
  );
  assert.equal(
    requests.some(
      (x) => x.url.includes("authorize") || x.url.includes("openid="),
    ),
    false,
  );
});
test("错误响应和不安全跳转均不会成为登录成功", async () => {
  const Constructor = (
    auth as unknown as {
      WechatScanClient: new (request: typeof fetch) => Client;
    }
  ).WechatScanClient;
  const failed = new Constructor(
    (async () =>
      new Response(
        JSON.stringify({ code: 40011, message: "二维码已失效", data: null }),
        { status: 400 },
      )) as typeof fetch,
  );
  await assert.rejects(() => failed.start(), /二维码已失效/);
  const values = [
    { csrfToken: "csrf" },
    {
      challengeId: "opaque-challenge-id",
      qrcodeUrl: "https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=unit",
      expiresAt: Date.now() + 180000,
    },
    { status: "AUTHENTICATED", next: "https://evil.example" },
  ];
  const unsafe = new Constructor(
    (async () =>
      new Response(
        JSON.stringify({ code: 0, data: values.shift() }),
      )) as typeof fetch,
  );
  await unsafe.start();
  await assert.rejects(
    () => unsafe.complete("opaque-challenge-id"),
    /跳转异常/,
  );
});
test("abei 的内部邮箱不会显示为真实邮箱或账户名", () => {
  assert.equal(
    publicEmailLabel("wechat-digest@users.abei.local"),
    "未绑定邮箱",
  );
  assert.equal(
    publicAccountLabel({
      email: "wechat-digest@users.abei.local",
      phone: "13800000001",
      nickname: "微信用户",
    }),
    "138****0001",
  );
});

test("缺失响应数据与网络异常使用中文错误", async () => {
  const malformed = new auth.WechatScanClient((async () =>
    Response.json({ code: 0 })) as typeof fetch);
  await assert.rejects(() => malformed.start(), /登录请求失败/);
  const disconnected = new auth.WechatScanClient((async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch);
  await assert.rejects(() => disconnected.start(), /网络连接异常/);
});

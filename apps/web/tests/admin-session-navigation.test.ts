import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";

import { proxy } from "../src/proxy.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function mockSession(status: number, code: number) {
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/setup/status")) {
      return Response.json({ code: 0, data: { isInitialized: true } });
    }
    assert.ok(url.endsWith("/admin-auth/me"));
    assert.equal(new Headers(init?.headers).get("Cookie"), "xueleai_admin_access=old; xueleai_admin_refresh=refresh");
    return Response.json({ code, data: code === 0 ? { id: "admin", status: "ACTIVE" } : null }, { status });
  };
  return calls;
}

function adminRequest(path = "/admin") {
  return new NextRequest(`http://localhost:3600${path}`, {
    headers: { cookie: "xueleai_admin_access=old; xueleai_admin_refresh=refresh" }
  });
}

test("失效管理员会话在后台数据加载前跳转登录页", async () => {
  mockSession(401, 40101);
  const response = await proxy(adminRequest());
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost:3600/admin/login");
});

test("后台子页面也拒绝失效会话，业务错误码同样有效", async () => {
  mockSession(200, 40101);
  const response = await proxy(adminRequest("/admin/users"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost:3600/admin/login");
});

test("有效管理员会话或 API 接受的刷新会话继续访问后台", async () => {
  const calls = mockSession(200, 0);
  const response = await proxy(adminRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(calls.filter(url => url.endsWith("/admin-auth/me")).length, 1);
});

test("登录页保持可访问，不检查旧会话或形成跳转循环", async () => {
  const calls = mockSession(401, 40101);
  const response = await proxy(adminRequest("/admin/login"));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, []);
});

test("后台写请求继续交由现有操作和 API 校验", async () => {
  const calls = mockSession(401, 40101);
  await proxy(new NextRequest("http://localhost:3600/admin", {
    method: "POST", headers: { cookie: "xueleai_admin_access=old" }
  }));
  assert.equal(calls.some(url => url.endsWith("/admin-auth/me")), false);
});

test("API 暂时不可用不会误判会话失效并强制重新登录", async () => {
  mockSession(503, 50000);
  const response = await proxy(adminRequest());
  assert.equal(response.headers.get("location"), null);
});

test("未登录访问后台直接跳转，不发起会话核验", async () => {
  const calls = mockSession(401, 40101);
  const response = await proxy(new NextRequest("http://localhost:3600/admin"));
  assert.equal(response.status, 307);
  assert.equal(calls.some(url => url.endsWith("/admin-auth/me")), false);
});

test("被禁用的管理员会话需要重新登录", async () => {
  mockSession(403, 40301);
  assert.equal((await proxy(adminRequest())).status, 307);
});

test("401 响应即使不是 JSON 也会跳转登录页", async () => {
  mockSession(401, 40101);
  const mockedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input).endsWith("/admin-auth/me")
    ? new Response("Unauthorized", { status: 401 }) : mockedFetch(input, init);
  assert.equal((await proxy(adminRequest())).status, 307);
});

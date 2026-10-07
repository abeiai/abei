import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { config, proxy } from "../src/proxy.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const userCookies = "xueleai_user_access=expired; xueleai_user_refresh=old; xueleai_profile_context=context";
const request = (cookie = userCookies, path = "/center?q=熊猫&sort=popular", method = "GET") =>
  new NextRequest(`http://127.0.0.1:3600${path}`, { method, headers: { cookie } });

function mockSession(response: () => Response | Promise<Response>) {
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(String(input));
    assert.ok(String(input).endsWith("/public/courses?view=listing"));
    assert.equal(new Headers(init?.headers).get("Cookie"), userCookies);
    return response();
  };
  return calls;
}

test("资源中心导航在渲染前检查会话", () => {
  assert.ok(config.matcher.includes("/center"));
});

test("失效用户会话清理用户及身份 cookie 后回到原资源查询", async () => {
  const calls = mockSession(() => Response.json({ code: 40101, data: null }, { status: 401 }));
  const input = request();
  const result = await proxy(input);
  assert.equal(result.status, 307);
  assert.equal(result.headers.get("location"), input.url);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(result.cookies.getAll().map(c => c.name).sort(), ["xueleai_profile_context", "xueleai_user_access", "xueleai_user_refresh"]);
  for (const cookie of result.cookies.getAll()) {
    assert.equal(cookie.value, "");
    assert.equal(cookie.path, "/");
    assert.equal(cookie.expires instanceof Date ? cookie.expires.getTime() : cookie.expires, 0);
  }
  assert.equal(calls.length, 1);
});

test("旧版登录与身份错误码和非JSON的HTTP401都能恢复资源中心", async () => {
  for (const response of [Response.json({ code: 40101 }, { status: 200 }), Response.json({ code: 40102 }, { status: 200 }), new Response("Unauthorized", { status: 401 })]) {
    mockSession(() => response);
    assert.equal((await proxy(request())).status, 307);
  }
});

test("有效主账号、学习者或API接受的刷新会话保留现有身份", async () => {
  for (const scope of ["ACCOUNT", "LEARNER", "REFRESH"]) {
    const calls = mockSession(() => Response.json({ code: 0, data: { id: "reader", sessionScope: scope } }));
    const result = await proxy(request());
    assert.equal(result.status, 200);
    assert.equal(result.cookies.getAll().length, 0);
    assert.equal(result.headers.get("location"), null);
    assert.equal(calls.length, 1);
  }
});

test("清理后游客直接浏览公开资源，不重复请求或跳转", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("游客不应核验会话"); };
  const result = await proxy(request(""));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("location"), null);
  assert.equal(calls, 0);
});

test("服务故障、无效响应或网络失败不能被误判为会话失效", async () => {
  for (const response of [
    () => Response.json({ code: 50001 }, { status: 503 }),
    () => new Response("invalid", { status: 200 }),
    () => { throw new Error("网络不可用"); }
  ]) {
    mockSession(response);
    const result = await proxy(request());
    assert.equal(result.status, 200);
    assert.equal(result.cookies.getAll().length, 0);
  }
});

test("恢复仅处理资源中心页面导航，不改变写请求及其他页面", async () => {
  const calls = mockSession(() => Response.json({ code: 40101 }, { status: 401 }));
  for (const input of [request(userCookies, "/center", "POST"), request(userCookies, "/login"), request(userCookies, "/c/306f0ed1871f63b9ed7cbbd9")]) {
    assert.equal((await proxy(input)).status, 200);
  }
  assert.equal(calls.length, 0);
});

test("有效access但资源身份上下文失效时仍恢复公开资源入口", async () => {
  globalThis.fetch = async input => String(input).endsWith("/auth/me")
    ? Response.json({ code: 0, data: { id: "reader" } })
    : Response.json({ code: 40102, data: null }, { status: 401 });
  const result = await proxy(request());
  assert.equal(result.status, 307);
  assert.equal(result.cookies.get("xueleai_profile_context")?.value, "");
});

test("后台预取不清理cookie，避免旧预取响应覆盖新登录", async () => {
  const calls = mockSession(() => Response.json({ code: 40101 }, { status: 401 }));
  for (const [name, value] of [["next-router-prefetch", "1"], ["purpose", "prefetch"]]) {
    const input = request(); input.headers.set(name!, value!);
    assert.equal((await proxy(input)).cookies.getAll().length, 0);
  }
  assert.equal(calls.length, 0);
});

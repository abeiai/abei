# 微信公众号与网站应用登录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `xueleai.com` 增加微信内公众号 OAuth 登录和普通桌面网站应用扫码登录，并通过 UnionID 统一到现有用户、钱包和 JWT 会话。

**Architecture:** `AuthModule` 新增独立的微信登录控制器、OAuth 客户端、Redis state store 和编排服务。两种微信渠道共用回调，服务端以 Cookie + Redis 一次性 state 防止登录 CSRF，以 UnionID 为主、渠道 OpenID 为兼容键解析现有 `users`，最后调用现有 `AuthService` 建立会话。

**Tech Stack:** NestJS 11、TypeScript、Prisma 7、PostgreSQL、Redis、Next.js 16 App Router、React 19、Node test runner、Font Awesome Brands。

## Global Constraints

- 设计依据：`docs/superpowers/specs/2026-08-08-wechat-oauth-login-design.md`。
- 在隔离 worktree 中执行本计划，基线为包含设计提交 `67d73ff` 的当前 HEAD；不得带入主工作区未提交的视频导学、字帖或环境配置改动。
- 不修改 `abeiai.com`、微信公众号服务器配置、公众号消息回调、微信支付 OAuth 路由或微信支付回调。
- 微信内渠道固定使用 `oauth2/authorize` + `snsapi_userinfo`；桌面渠道固定使用 `qrconnect` + `snsapi_login`。
- 公开回调固定为 `${APP_BASE_URL}/api/auth/wechat/callback`，生产环境必须解析为 `https://xueleai.com/api/auth/wechat/callback`。
- 继续使用现有 `users` 表、JWT、刷新令牌和钱包；不新增独立 `xueleai_user` 表。
- 所有用户可见提示必须为简体中文；微信原始错误、OpenID、UnionID、授权 code、access token 和 AppSecret 不得返回前端或写入日志。
- 真实凭据只能进入未跟踪的 `.env` / `.env.production`；示例文件只增加空值或替换提示。
- 所有端口继续遵守 `3320-3329` 规则；不新增端口。
- 数据库 migration 只允许新增可空列和唯一索引；禁止 reset、删除 volume 或修改既有生产数据。
- 每个生产行为必须先有失败测试，再写最小实现并观察测试转绿。

## File Structure

- `packages/database/prisma/schema.prisma`：新增网站应用 OpenID 与 UnionID 字段。
- `packages/database/prisma/migrations/20260808120000_wechat_oauth_login/migration.sql`：向前兼容的生产 migration。
- `packages/database/prisma/wechat-auth-schema-contract.test.ts`：锁定字段、索引和 migration 契约。
- `apps/api-core/src/auth/wechat-auth.types.ts`：渠道、state、身份、错误码和安全路径类型。
- `apps/api-core/src/auth/wechat-oauth.client.ts`：构造两类授权 URL、换取 token 和用户资料。
- `apps/api-core/src/auth/wechat-oauth-state.store.ts`：Redis state 写入和原子消费。
- `apps/api-core/src/auth/wechat-auth-cookie.ts`：临时 state Cookie 的读写选项。
- `apps/api-core/src/auth/wechat-auth.service.ts`：渠道选择、state 编排、UnionID 用户解析和会话接入。
- `apps/api-core/src/auth/wechat-auth.controller.ts`：公开 authorize/callback 浏览器跳转端点。
- `apps/api-core/src/auth/auth.service.ts`：公开按用户 ID 创建现有会话的窄接口。
- `apps/api-core/src/auth/auth.module.ts`：注册微信登录控制器和 providers。
- `apps/api-core/src/security/rate-limit.interceptor.ts`：微信登录入口限流。
- `apps/api-core/tests/wechat-auth.test.ts`：OAuth、state、身份解析和控制器测试。
- `.env.example`、`.env.production.example`、`docker-compose.prod.yml`：空凭据、限流和 api-core 变量传递。
- `apps/web/src/lib/wechat-auth.ts`：微信登录 href 与固定错误文案映射。
- `apps/web/src/lib/user-identity.ts`：隐藏内部占位邮箱并生成账号展示文案。
- `apps/web/src/app/login/page.tsx`、`apps/web/src/components/auth/user-login-form.tsx`：入口和错误展示。
- `apps/web/src/app/dashboard/page.tsx`、`apps/web/src/components/shell/user-account-menu.tsx`：微信新用户不显示内部占位邮箱。
- `apps/web/tests/wechat-auth.test.ts`：登录入口、错误文案和账号展示测试。

---

### Task 1: Add the WeChat identity schema contract

**Files:**
- Create: `packages/database/prisma/wechat-auth-schema-contract.test.ts`
- Create: `packages/database/prisma/migrations/20260808120000_wechat_oauth_login/migration.sql`
- Modify: `packages/database/prisma/schema.prisma:435-479`

**Interfaces:**
- Consumes: existing Prisma `User.wechatOpenId` as the official-account OpenID.
- Produces: nullable unique `User.wechatWebOpenId` and `User.wechatUnionId` fields used by Task 3.

- [ ] **Step 1: Write the failing schema contract test**

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("./schema.prisma", import.meta.url), "utf8");
const migrationUrl = new URL(
  "./migrations/20260808120000_wechat_oauth_login/migration.sql",
  import.meta.url
);

test("微信双端身份字段映射到现有 users 表并保持唯一", () => {
  assert.match(schema, /wechatOpenId\s+String\?\s+@unique/u);
  assert.match(schema, /wechatWebOpenId\s+String\?\s+@unique/u);
  assert.match(schema, /wechatUnionId\s+String\?\s+@unique/u);
  assert.equal(existsSync(migrationUrl), true);
  const migration = readFileSync(migrationUrl, "utf8");
  assert.match(migration, /ADD COLUMN "wechatWebOpenId" TEXT/u);
  assert.match(migration, /ADD COLUMN "wechatUnionId" TEXT/u);
  assert.match(migration, /CREATE UNIQUE INDEX "users_wechatWebOpenId_key"/u);
  assert.match(migration, /CREATE UNIQUE INDEX "users_wechatUnionId_key"/u);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @xueleai/database exec node --import tsx --test prisma/wechat-auth-schema-contract.test.ts
```

Expected: FAIL because the migration file and the two Prisma fields do not exist.

- [ ] **Step 3: Add the Prisma fields and forward-only migration**

Add beside `wechatOpenId`:

```prisma
wechatOpenId    String? @unique
wechatWebOpenId String? @unique
wechatUnionId   String? @unique
```

Create the migration with exactly additive SQL:

```sql
ALTER TABLE "users"
ADD COLUMN "wechatWebOpenId" TEXT,
ADD COLUMN "wechatUnionId" TEXT;

CREATE UNIQUE INDEX "users_wechatWebOpenId_key" ON "users"("wechatWebOpenId");
CREATE UNIQUE INDEX "users_wechatUnionId_key" ON "users"("wechatUnionId");
```

- [ ] **Step 4: Generate Prisma client and verify GREEN**

Run:

```bash
pnpm --filter @xueleai/database db:generate
pnpm --filter @xueleai/database exec node --import tsx --test prisma/wechat-auth-schema-contract.test.ts
pnpm --filter @xueleai/database typecheck
```

Expected: all commands PASS; generated client contains both new nullable fields.

- [ ] **Step 5: Commit the schema contract**

```bash
git add packages/database/prisma/schema.prisma \
  packages/database/prisma/migrations/20260808120000_wechat_oauth_login/migration.sql \
  packages/database/prisma/wechat-auth-schema-contract.test.ts
git commit -m "feat(auth): add WeChat identity fields"
```

---

### Task 2: Build OAuth, state, and Cookie primitives

**Files:**
- Create: `apps/api-core/src/auth/wechat-auth.types.ts`
- Create: `apps/api-core/src/auth/wechat-oauth.client.ts`
- Create: `apps/api-core/src/auth/wechat-oauth-state.store.ts`
- Create: `apps/api-core/src/auth/wechat-auth-cookie.ts`
- Create: `apps/api-core/tests/wechat-auth.test.ts`

**Interfaces:**
- Consumes: `APP_BASE_URL`, `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `WECHAT_OPEN_APP_ID`, `WECHAT_OPEN_APP_SECRET`, `REDIS_URL`.
- Produces: `WechatOAuthClient.buildAuthorizationUrl(channel, state)`, `WechatOAuthClient.fetchIdentity(channel, code)`, `WechatOAuthStateStore.put/consume`, `WechatAuthError`, and state Cookie helpers.

- [ ] **Step 1: Write failing tests for channel resolution and authorization URLs**

```ts
const desktopChromeUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36";
const mobileSafariUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const client = new WechatOAuthClient(
  {
    callbackUrl: "https://xueleai.com/api/auth/wechat/callback",
    mp: { appId: "mp-app-id", appSecret: "mp-secret" },
    web: { appId: "web-app-id", appSecret: "web-secret" }
  },
  async () => {
    throw new Error("URL 构造测试不应发起网络请求");
  }
);

test("微信内浏览器使用公众号 snsapi_userinfo", () => {
  assert.equal(resolveWechatOAuthChannel("MicroMessenger/8.0"), "MP");
  const url = new URL(client.buildAuthorizationUrl("MP", "mp-state"));
  assert.equal(url.origin + url.pathname, "https://open.weixin.qq.com/connect/oauth2/authorize");
  assert.equal(url.searchParams.get("appid"), "mp-app-id");
  assert.equal(url.searchParams.get("scope"), "snsapi_userinfo");
  assert.equal(url.searchParams.get("state"), "mp-state");
});

test("桌面浏览器使用网站应用 snsapi_login", () => {
  assert.equal(resolveWechatOAuthChannel(desktopChromeUserAgent), "WEB");
  const url = new URL(client.buildAuthorizationUrl("WEB", "web-state"));
  assert.equal(url.origin + url.pathname, "https://open.weixin.qq.com/connect/qrconnect");
  assert.equal(url.searchParams.get("appid"), "web-app-id");
  assert.equal(url.searchParams.get("scope"), "snsapi_login");
});

test("普通手机浏览器不尝试公众号授权", () => {
  assert.equal(resolveWechatOAuthChannel(mobileSafariUserAgent), null);
});
```

- [ ] **Step 2: Run the URL tests and verify RED**

Run:

```bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/wechat-auth.test.ts
```

Expected: FAIL because the WeChat auth modules do not exist.

- [ ] **Step 3: Define the shared types and OAuth client**

Use these public contracts:

```ts
export type WechatOAuthChannel = "MP" | "WEB";
export type WechatLoginErrorCode =
  | "config"
  | "state"
  | "denied"
  | "upstream"
  | "identity_conflict"
  | "disabled"
  | "mobile_browser";

export interface WechatOAuthStateRecord {
  channel: WechatOAuthChannel;
  next: string;
  issuedAt: number;
}

export interface WechatIdentity {
  channel: WechatOAuthChannel;
  openId: string;
  unionId: string;
  nickname: string;
  avatarUrl: string | null;
}

export class WechatAuthError extends Error {
  constructor(
    public readonly code: WechatLoginErrorCode,
    public readonly next?: string
  ) {
    super(code);
    this.name = "WechatAuthError";
  }
}
```

Implement the OAuth client around an injectable runtime config and request function so tests never need real secrets:

```ts
export interface WechatOAuthRuntimeConfig {
  callbackUrl: string;
  mp: { appId: string; appSecret: string };
  web: { appId: string; appSecret: string };
}

export class WechatOAuthClient {
  constructor(
    private readonly config = loadWechatOAuthRuntimeConfig(),
    private readonly request: typeof fetch = fetch
  ) {}

  buildAuthorizationUrl(channel: WechatOAuthChannel, state: string): string;
  fetchIdentity(channel: WechatOAuthChannel, code: string): Promise<WechatIdentity>;
}

export function resolveWechatOAuthChannel(userAgent: string | null): WechatOAuthChannel | null {
  if (!userAgent) return null;
  if (/MicroMessenger/i.test(userAgent)) return "MP";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return null;
  return "WEB";
}
```

`fetchIdentity` must use `AbortSignal.timeout(10_000)`, call the token endpoint first, then `sns/userinfo?lang=zh_CN`, require non-empty `openid` and `unionid`, and map provider failures to `WechatAuthError("denied")` or `WechatAuthError("upstream")`. Never include the request URL or provider payload in the thrown message.

- [ ] **Step 4: Add failing tests for token exchange secrecy and response validation**

```ts
const testRuntimeConfig: WechatOAuthRuntimeConfig = {
  callbackUrl: "https://xueleai.com/api/auth/wechat/callback",
  mp: { appId: "mp-app-id", appSecret: "mp-secret" },
  web: { appId: "web-app-id", appSecret: "web-secret" }
};

function sequenceFetch(
  requests: URL[],
  payloads: Array<Record<string, unknown>>
): typeof fetch {
  let index = 0;
  return (async (input) => {
    requests.push(new URL(String(input)));
    const payload = payloads[index++];
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
}

test("OAuth token 与用户资料请求返回统一身份", async () => {
  const requests: URL[] = [];
  const client = new WechatOAuthClient(testRuntimeConfig, sequenceFetch(requests, [
      { access_token: "oauth-token", openid: "web-open-id" },
      { openid: "web-open-id", unionid: "union-id", nickname: "微信用户", headimgurl: "https://wx.example/avatar" }
    ]));
  const identity = await client.fetchIdentity("WEB", "authorization-code");

  assert.equal(identity.unionId, "union-id");
  assert.equal(identity.openId, "web-open-id");
  assert.equal(identity.nickname, "微信用户");
  assert.equal(requests.length, 2);
});

test("缺少 UnionID 时拒绝创建无法统一的账号", async () => {
  const requests: URL[] = [];
  const client = new WechatOAuthClient(testRuntimeConfig, sequenceFetch(requests, [
    { access_token: "oauth-token", openid: "mp-open-id" },
    { openid: "mp-open-id", nickname: "微信用户" }
  ]));
  await assert.rejects(
    () => client.fetchIdentity("MP", "code"),
    (error: unknown) => error instanceof WechatAuthError && error.code === "upstream"
  );
});
```

Run and confirm the new tests fail for missing behavior before completing `fetchIdentity`.

- [ ] **Step 5: Add failing tests for one-time Redis state and Cookie options**

```ts
test("state 以摘要作为 Redis key 并只能消费一次", async () => {
  const redis = new FakeRedisClient();
  const store = new RedisWechatOAuthStateStore(redis);
  const record = { channel: "MP" as const, next: "/dashboard", issuedAt: 1 };

  await store.put("raw-state", record, 600);
  assert.equal(redis.lastKey?.includes("raw-state"), false);
  assert.deepEqual(await store.consume("raw-state"), record);
  assert.equal(await store.consume("raw-state"), null);
});

test("state Cookie 仅发送给授权与回调路径", () => {
  process.env.APP_BASE_URL = "https://xueleai.com";
  const response = responseMock();
  setWechatOAuthStateCookie(response, "raw-state", 600);
  assert.deepEqual(response.cookies[0]?.options, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/api/auth/wechat",
    maxAge: 600_000
  });
});
```

- [ ] **Step 6: Implement the Redis state store and Cookie helpers**

```ts
export interface WechatOAuthStateStore {
  put(state: string, record: WechatOAuthStateRecord, ttlSeconds: number): Promise<void>;
  consume(state: string): Promise<WechatOAuthStateRecord | null>;
}

export const WECHAT_OAUTH_STATE_STORE = Symbol("WECHAT_OAUTH_STATE_STORE");

export interface WechatStateRedisClient {
  isOpen: boolean;
  connect(): Promise<unknown>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  getDel(key: string): Promise<string | null>;
  quit(): Promise<unknown>;
}

function createWechatRedisClient(): WechatStateRedisClient {
  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new WechatAuthError("upstream");
  return createClient({ url }) as WechatStateRedisClient;
}

export class RedisWechatOAuthStateStore implements WechatOAuthStateStore {
  constructor(private readonly client: WechatStateRedisClient = createWechatRedisClient()) {}

  async put(state: string, record: WechatOAuthStateRecord, ttlSeconds: number) {
    await this.ensureConnected();
    await this.client.set(stateKey(state), JSON.stringify(record), { EX: ttlSeconds });
  }

  async consume(state: string) {
    await this.ensureConnected();
    const value = await this.client.getDel(stateKey(state));
    return value ? parseStateRecord(value) : null;
  }
}
```

`stateKey` must be `wechat-oauth:state:${sha256(state)}`. Invalid Redis JSON must return `null`; a missing or unusable `REDIS_URL` must fail closed as `WechatAuthError("upstream")`.

- [ ] **Step 7: Verify all primitives GREEN and commit**

Run:

```bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/wechat-auth.test.ts
pnpm --filter @xueleai/api-core typecheck
```

Expected: OAuth URL, exchange, state and Cookie tests PASS.

```bash
git add apps/api-core/src/auth/wechat-auth.types.ts \
  apps/api-core/src/auth/wechat-oauth.client.ts \
  apps/api-core/src/auth/wechat-oauth-state.store.ts \
  apps/api-core/src/auth/wechat-auth-cookie.ts \
  apps/api-core/tests/wechat-auth.test.ts
git commit -m "feat(auth): add secure WeChat OAuth primitives"
```

---

### Task 3: Resolve WeChat identities into existing users and sessions

**Files:**
- Create: `apps/api-core/src/auth/wechat-auth.service.ts`
- Modify: `apps/api-core/src/auth/auth.service.ts:718-758`
- Modify: `apps/api-core/tests/wechat-auth.test.ts`

**Interfaces:**
- Consumes: Task 1 Prisma fields; Task 2 OAuth client/state interfaces; existing `AuthService` session cookies.
- Produces: `WechatAuthService.createAuthorization(userAgent, next)` and `WechatAuthService.completeAuthorization(input)`; public `AuthService.startUserSession(userId, response)`.

- [ ] **Step 1: Write failing authorization orchestration tests**

```ts
test("授权入口生成随机 state 并把渠道与安全 next 写入 store", async () => {
  const first = await service.createAuthorization("MicroMessenger/8.0", "/dashboard/billing");
  const second = await service.createAuthorization("MicroMessenger/8.0", "/dashboard/billing");

  assert.equal(first.channel, "MP");
  assert.notEqual(first.state, second.state);
  assert.equal(first.state.length >= 40, true);
  assert.deepEqual(store.records.get(first.state)?.next, "/dashboard/billing");
});

test("授权入口拒绝普通手机浏览器并过滤外部 next", async () => {
  await assert.rejects(
    () => service.createAuthorization(mobileSafariUserAgent, "https://evil.example"),
    (error: unknown) => error instanceof WechatAuthError && error.code === "mobile_browser"
  );
  const desktop = await service.createAuthorization(desktopChromeUserAgent, "//evil.example");
  assert.equal(store.records.get(desktop.state)?.next, "/dashboard");
});
```

- [ ] **Step 2: Run and verify RED, then implement authorization creation**

Run the targeted API test and expect missing `WechatAuthService`. Implement:

```ts
async createAuthorization(userAgent: string | null, nextValue: string | undefined) {
  const channel = resolveWechatOAuthChannel(userAgent);
  if (!channel) throw new WechatAuthError("mobile_browser");

  const state = randomBytes(32).toString("base64url");
  const next = safeWechatNextPath(nextValue);
  await this.stateStore.put(state, { channel, next, issuedAt: Date.now() }, 600);

  return {
    channel,
    state,
    url: this.oauthClient.buildAuthorizationUrl(channel, state),
    maxAgeSeconds: 600
  };
}

export function safeWechatNextPath(value: string | undefined) {
  const next = value?.trim() ?? "";
  if (!next.startsWith("/") || next.startsWith("//") || /^\/admin(?:\/|$)/u.test(next)) {
    return "/dashboard";
  }
  return next;
}

function equalOpaqueState(left: string | null, right: string | undefined) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
```

- [ ] **Step 3: Write failing callback tests for state binding and identity matching**

```ts
test("回调必须同时匹配 Cookie state 并原子消费 Redis state", async () => {
  await assert.rejects(
    () => service.completeAuthorization({ code: "code", state: "query", stateCookie: "cookie", response }),
    (error: unknown) => error instanceof WechatAuthError && error.code === "state"
  );
  assert.equal(oauthClient.exchangeCount, 0);
});

test("UnionID 命中时补齐网站 OpenID 并建立现有会话", async () => {
  harness.users.push(activeUser({ wechatUnionId: "union-id", wechatWebOpenId: null }));
  oauthClient.identity = webIdentity({ unionId: "union-id", openId: "web-open-id" });

  const result = await completeWebAuthorization(service, store, response);

  assert.equal(result.next, "/dashboard");
  assert.equal(harness.users[0]?.wechatWebOpenId, "web-open-id");
  assert.deepEqual(authService.startedSessions, [harness.users[0]?.id]);
});

test("公众号 OpenID 旧用户首次登录时回填 UnionID", async () => {
  harness.users.push(activeUser({ wechatOpenId: "mp-open-id", wechatUnionId: null }));
  oauthClient.identity = mpIdentity({ openId: "mp-open-id", unionId: "union-id" });
  await completeMpAuthorization(service, store, response);
  assert.equal(harness.users[0]?.wechatUnionId, "union-id");
});
```

- [ ] **Step 4: Add failing creation, conflict, disabled, and race tests**

```ts
test("首次微信授权创建普通用户与钱包", async () => {
  oauthClient.identity = mpIdentity({ unionId: "new-union", nickname: "新微信用户" });
  await completeMpAuthorization(service, store, response);
  assert.equal(harness.users[0]?.email.endsWith("@users.xueleai.local"), true);
  assert.equal(harness.users[0]?.nickname, "新微信用户");
  assert.equal(harness.wallets[0]?.userId, harness.users[0]?.id);
});

test("UnionID 与渠道 OpenID 指向不同用户时拒绝自动合并", async () => {
  harness.users.push(
    activeUser({ id: "union-owner", wechatUnionId: "union-id" }),
    activeUser({ id: "openid-owner", wechatOpenId: "mp-open-id" })
  );
  await assert.rejects(
    () => completeMpAuthorization(service, store, response),
    (error: unknown) => error instanceof WechatAuthError && error.code === "identity_conflict"
  );
});

test("禁用用户不能通过微信登录", async () => {
  harness.users.push(activeUser({ status: "DISABLED", wechatUnionId: "union-id" }));
  await assert.rejects(
    () => completeMpAuthorization(service, store, response),
    (error: unknown) => error instanceof WechatAuthError && error.code === "disabled"
  );
});
```

The race test must make the first create throw a unique-key error after another user appears, then assert the service re-reads `wechatUnionId` and starts one session without creating a second wallet.

- [ ] **Step 5: Implement user resolution and internal credentials**

Use these rules in one focused private method:

```ts
private async resolveUser(identity: WechatIdentity) {
  const byUnion = await this.prisma.user.findUnique({ where: { wechatUnionId: identity.unionId } });
  const openIdWhere = identity.channel === "MP"
    ? { wechatOpenId: identity.openId }
    : { wechatWebOpenId: identity.openId };
  const byOpenId = await this.prisma.user.findUnique({ where: openIdWhere });

  if (byUnion && byOpenId && byUnion.id !== byOpenId.id) {
    throw new WechatAuthError("identity_conflict");
  }

  const existing = byUnion ?? byOpenId;
  if (existing) return this.updateWechatIdentity(existing, identity);
  return this.createWechatUser(identity);
}
```

Creation must use a nested wallet write and never store a usable known password:

```ts
data: {
  email: `wechat-${identityDigest(identity.unionId)}@users.xueleai.local`,
  passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
  nickname: identity.nickname.trim() || "微信用户",
  avatarUrl: identity.avatarUrl,
  wechatOpenId: identity.channel === "MP" ? identity.openId : undefined,
  wechatWebOpenId: identity.channel === "WEB" ? identity.openId : undefined,
  wechatUnionId: identity.unionId,
  lastLoginAt: new Date(),
  wallet: { create: {} }
}
```

Generate `identityDigest` with HMAC-SHA256 using `JWT_ACCESS_SECRET`, truncated to 32 lowercase hex characters. Existing non-empty nickname and avatar must not be overwritten; only identity fields and `lastLoginAt` are always updated.

- [ ] **Step 6: Expose a narrow existing-session entry point**

Add to `AuthService`:

```ts
async startUserSession(userId: string, response: ResponseLike) {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") {
    throw new AppException(40301, "账号已被禁用", HttpStatus.FORBIDDEN);
  }

  const updatedUser = await this.prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });
  return this.createUserSession(this.toPublicUser(updatedUser), response);
}
```

`WechatAuthService.completeAuthorization` must validate state in constant time, consume the Redis record, fetch identity, resolve the user, call `startUserSession`, and return `{ next: record.next }`.

- [ ] **Step 7: Verify identity tests GREEN and commit**

```bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/wechat-auth.test.ts
pnpm --filter @xueleai/api-core typecheck
git add apps/api-core/src/auth/wechat-auth.service.ts \
  apps/api-core/src/auth/auth.service.ts \
  apps/api-core/tests/wechat-auth.test.ts
git commit -m "feat(auth): resolve WeChat users into existing sessions"
```

---

### Task 4: Add browser redirect endpoints, configuration, and rate limits

**Files:**
- Create: `apps/api-core/src/auth/wechat-auth.controller.ts`
- Modify: `apps/api-core/src/auth/auth.module.ts`
- Modify: `apps/api-core/src/security/rate-limit.interceptor.ts:30-147`
- Modify: `apps/api-core/tests/wechat-auth.test.ts`
- Modify: `apps/api-core/tests/rate-limit.test.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `docker-compose.prod.yml:89-136`

**Interfaces:**
- Consumes: `WechatAuthService` and Cookie helpers from Tasks 2-3.
- Produces: public `GET /api/auth/wechat/authorize` and `GET /api/auth/wechat/callback`; api-core runtime receives all four WeChat credentials.

- [ ] **Step 1: Write failing controller tests**

```ts
test("授权端点设置 state Cookie 后跳转微信", async () => {
  const controller = new WechatAuthController(serviceMock);
  await controller.authorize(requestWithUa("MicroMessenger/8.0"), "/dashboard", response);
  assert.equal(response.cookies[0]?.name, "xueleai_wechat_oauth_state");
  assert.deepEqual(response.redirects[0], [302, "https://open.weixin.qq.com/authorize-test"]);
});

test("回调成功清除 state Cookie、设置会话并安全跳转", async () => {
  await controller.callback(requestWithCookie("state"), "code", "state", response);
  assert.equal(response.clearedCookies[0]?.name, "xueleai_wechat_oauth_state");
  assert.deepEqual(response.redirects[0], [302, "https://xueleai.com/dashboard"]);
});

test("回调错误只携带固定枚举返回登录页", async () => {
  serviceMock.completeError = new WechatAuthError("state");
  await controller.callback(requestWithCookie("bad"), "code", "bad", response);
  assert.deepEqual(response.redirects[0], [302, "https://xueleai.com/login?wechat_error=state"]);
});
```

- [ ] **Step 2: Run controller tests and verify RED**

Run the targeted API test. Expected: FAIL because the controller and module wiring do not exist.

- [ ] **Step 3: Implement the redirect controller and module providers**

The controller contract is:

```ts
interface WechatRedirectResponse extends ResponseLike {
  redirect(statusCode: number, url: string): void;
}

@Controller("auth/wechat")
export class WechatAuthController {
  @Get("authorize")
  async authorize(
    @Req() request: HeaderRequestLike,
    @Query("next") next: string | undefined,
    @Res() response: WechatRedirectResponse
  ): Promise<void>;

  @Get("callback")
  async callback(
    @Req() request: HeaderRequestLike,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res() response: WechatRedirectResponse
  ): Promise<void>;
}
```

Authorization sets the temporary Cookie only after state persistence succeeds. Callback reads the Cookie with existing `readCookie`, clears it in `finally`, and redirects to a fixed error enum for expected failures. Unknown failures are logged only as `{ requestId, errorName }` and redirect to `wechat_error=upstream`; error messages and request URLs are not logged.

Register providers without changing PaymentModule:

```ts
@Module({
  imports: [MediaModule],
  controllers: [AuthController, WechatAuthController],
  providers: [
    AuthService,
    WechatAuthService,
    {
      provide: WechatOAuthClient,
      useFactory: () => new WechatOAuthClient()
    },
    {
      provide: WECHAT_OAUTH_STATE_STORE,
      useFactory: () => new RedisWechatOAuthStateStore()
    }
  ],
  exports: [AuthService]
})
export class AuthModule {}
```

- [ ] **Step 4: Write and pass endpoint rate-limit tests**

Add a shared GET rule:

```ts
{
  method: "GET",
  path: /^\/api\/auth\/wechat\/(?:authorize|callback)$/,
  bucketPath: "/api/auth/wechat",
  maxEnv: "RATE_LIMIT_AUTH_WECHAT_MAX",
  fallbackMax: 20
}
```

Test that the 21st request from one IP in the same 60-second window throws `42901`, while authorize and callback share the bucket.

- [ ] **Step 5: Add only empty/example runtime configuration**

Add empty values to `.env.example`:

```dotenv
WECHAT_APP_ID=""
WECHAT_APP_SECRET=""
WECHAT_OPEN_APP_ID=""
WECHAT_OPEN_APP_SECRET=""
RATE_LIMIT_AUTH_WECHAT_MAX="20"
```

Add explicit replacement prompts to `.env.production.example`:

```dotenv
WECHAT_APP_ID="请替换为公众号 AppID"
WECHAT_APP_SECRET="请替换为公众号 AppSecret"
WECHAT_OPEN_APP_ID="请替换为开放平台网站应用 AppID"
WECHAT_OPEN_APP_SECRET="请替换为开放平台网站应用 AppSecret"
RATE_LIMIT_AUTH_WECHAT_MAX="20"
```

Pass the same names only to the `api-core` service:

```yaml
WECHAT_APP_ID: ${WECHAT_APP_ID:-}
WECHAT_APP_SECRET: ${WECHAT_APP_SECRET:-}
WECHAT_OPEN_APP_ID: ${WECHAT_OPEN_APP_ID:-}
WECHAT_OPEN_APP_SECRET: ${WECHAT_OPEN_APP_SECRET:-}
RATE_LIMIT_AUTH_WECHAT_MAX: ${RATE_LIMIT_AUTH_WECHAT_MAX:-20}
```

Before editing and staging these files, inspect their diffs. Because the original workspace has unrelated changes in `.env.example` and `docker-compose.prod.yml`, execute this task only inside the clean feature worktree and never stage the original workspace versions.

- [ ] **Step 6: Verify controller, rate limit, and configuration wiring GREEN**

```bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/wechat-auth.test.ts
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/rate-limit.test.ts
pnpm --filter @xueleai/api-core typecheck
git diff --check
```

- [ ] **Step 7: Commit the HTTP integration**

```bash
git add apps/api-core/src/auth/wechat-auth.controller.ts \
  apps/api-core/src/auth/auth.module.ts \
  apps/api-core/src/security/rate-limit.interceptor.ts \
  apps/api-core/tests/wechat-auth.test.ts \
  apps/api-core/tests/rate-limit.test.ts \
  .env.example .env.production.example docker-compose.prod.yml
git commit -m "feat(auth): expose WeChat login callbacks"
```

---

### Task 5: Add the login-page entry and safe account labels

**Files:**
- Create: `apps/web/src/lib/wechat-auth.ts`
- Create: `apps/web/src/lib/user-identity.ts`
- Create: `apps/web/tests/wechat-auth.test.ts`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/components/auth/user-login-form.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Modify: `apps/web/src/components/shell/user-account-menu.tsx`

**Interfaces:**
- Consumes: public `/api/auth/wechat/authorize` and fixed `wechat_error` values from Task 4.
- Produces: visible “微信登录” action, safe `next`, Chinese error feedback, and no leaked internal placeholder email after first login.

- [ ] **Step 1: Write failing pure helper tests**

```ts
test("微信登录地址只保留安全 next", () => {
  assert.equal(wechatLoginHref(), "/api/auth/wechat/authorize");
  assert.equal(
    wechatLoginHref("/dashboard/billing"),
    "/api/auth/wechat/authorize?next=%2Fdashboard%2Fbilling"
  );
  assert.equal(wechatLoginHref("//evil.example"), "/api/auth/wechat/authorize");
  assert.equal(wechatLoginHref("/admin/users"), "/api/auth/wechat/authorize");
});

test("微信错误枚举映射为固定中文提示", () => {
  assert.equal(wechatLoginErrorMessage("state"), "微信登录状态已失效，请重新尝试");
  assert.equal(wechatLoginErrorMessage("identity_conflict"), "微信账号关联异常，请联系客服处理");
  assert.equal(wechatLoginErrorMessage("raw-provider-message"), null);
});

test("微信占位邮箱不会显示给用户", () => {
  const user = { nickname: "微信用户", phone: null, email: "wechat-hash@users.xueleai.local" };
  assert.equal(publicAccountLabel(user), "微信用户");
});
```

- [ ] **Step 2: Run Web test and verify RED**

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/wechat-auth.test.ts
```

Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Implement the pure helpers**

```ts
export type WechatLoginErrorCode =
  | "config"
  | "state"
  | "denied"
  | "upstream"
  | "identity_conflict"
  | "disabled"
  | "mobile_browser";

export function wechatLoginHref(next?: string) {
  const safeNext = safeLoginNextPath(next);
  return safeNext
    ? `/api/auth/wechat/authorize?next=${encodeURIComponent(safeNext)}`
    : "/api/auth/wechat/authorize";
}

const messages: Partial<Record<WechatLoginErrorCode, string>> = {
  config: "微信登录尚未完成配置",
  state: "微信登录状态已失效，请重新尝试",
  denied: "微信授权未完成，请重新尝试",
  upstream: "微信登录服务暂不可用，请稍后再试",
  identity_conflict: "微信账号关联异常，请联系客服处理",
  disabled: "账号已被禁用",
  mobile_browser: "请在微信中打开本页面，或在电脑上扫码登录"
};

export function publicAccountLabel(user: { email: string; phone: string | null; nickname: string }) {
  if (!user.email.endsWith("@users.xueleai.local")) return user.email;
  if (user.phone) return `${user.phone.slice(0, 3)}****${user.phone.slice(-4)}`;
  return user.nickname.trim() || "微信用户";
}
```

- [ ] **Step 4: Add a failing source-level UI contract test**

```ts
test("登录表单展示微信品牌入口", () => {
  const source = readFileSync(
    new URL("../src/components/auth/user-login-form.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /faWeixin/u);
  assert.match(source, />微信登录</u);
  assert.match(source, /wechatLoginHref\(next\)/u);
});
```

Run and verify it fails before changing the component.

- [ ] **Step 5: Add the login button and fixed error rendering**

Update the login page search params and form contract:

```ts
searchParams: Promise<{ next?: string; reset?: string; wechat_error?: string }>;

const wechatError = wechatLoginErrorMessage(params.wechat_error);
<UserLoginForm next={next} wechatError={wechatError} />;
```

Add below the existing login modes:

```tsx
{wechatError ? <p role="alert" className="text-sm text-destructive">{wechatError}</p> : null}
<div className="flex items-center gap-3" aria-hidden="true">
  <span className="h-px flex-1 bg-border" />
  <span className="text-xs text-muted-foreground">其他登录方式</span>
  <span className="h-px flex-1 bg-border" />
</div>
<Button asChild variant="outline">
  <a href={wechatLoginHref(next)}>
    <FontAwesomeIcon aria-hidden="true" className="size-5" icon={faWeixin} />
    微信登录
  </a>
</Button>
```

Do not alter email, phone, forgot-password, register, or home-return behavior.

- [ ] **Step 6: Replace internal-email display on first landing surfaces**

Use `publicAccountLabel(user)` in `dashboard/page.tsx` and `user-account-menu.tsx`. Do not change admin tables, because internal email remains a useful unique support identifier there.

- [ ] **Step 7: Verify Web behavior GREEN and commit**

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/wechat-auth.test.ts
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web lint
git add apps/web/src/lib/wechat-auth.ts \
  apps/web/src/lib/user-identity.ts \
  apps/web/src/app/login/page.tsx \
  apps/web/src/components/auth/user-login-form.tsx \
  apps/web/src/app/dashboard/page.tsx \
  apps/web/src/components/shell/user-account-menu.tsx \
  apps/web/tests/wechat-auth.test.ts
git commit -m "feat(web): add WeChat login entry"
```

---

### Task 6: Run strict verification and independent review

**Files:**
- Modify only files required by concrete verification failures or approved review findings.
- Do not create deployment credentials or modify production `.env.production` in this task.

**Interfaces:**
- Consumes: all Tasks 1-5.
- Produces: a verified implementation ready for credential configuration and later deployment.

- [ ] **Step 1: Run the focused security and behavior tests**

```bash
pnpm --filter @xueleai/database exec node --import tsx --test prisma/wechat-auth-schema-contract.test.ts
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/wechat-auth.test.ts
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/rate-limit.test.ts
pnpm --filter @xueleai/web exec node --import tsx --test tests/wechat-auth.test.ts
```

Expected: all PASS with no warnings or secret values in output.

- [ ] **Step 2: Scan source and git history for leaked credentials**

Run structural scans without placing any secret literal on the command line:

```bash
rg -n "WECHAT_(APP|OPEN_APP)_(ID|SECRET)" \
  .env.example .env.production.example docker-compose.prod.yml \
  apps/api-core/src apps/web/src
rg -n "access_token|openid|unionid|authorization-code" apps/api-core/src/auth
git diff --check
```

Expected: environment names appear only in server/config code and empty examples; no real value appears; logs contain no sensitive identity fields.

- [ ] **Step 3: Run database, API, and Web checks**

```bash
pnpm --filter @xueleai/database db:generate
pnpm --filter @xueleai/database test
pnpm --filter @xueleai/database typecheck
pnpm --filter @xueleai/api-core test
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/api-core lint
pnpm --filter @xueleai/api-core build
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web lint
pnpm --filter @xueleai/web build
```

Expected: all commands PASS. If a pre-existing unrelated failure occurs, record the exact command and evidence; do not alter unrelated modules to make it pass.

- [ ] **Step 4: Run repository-wide strict checks once**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all PASS. Do not repeat an unchanged expensive command after it has passed.

- [ ] **Step 5: Request independent code review**

Use `superpowers:requesting-code-review` with the design spec, this plan, base commit `67d73ff`, current HEAD, and special focus on:

```text
OAuth login CSRF binding
state one-time consumption
Open redirect prevention
UnionID/OpenID account conflict
concurrent first-login duplication
secret/token logging
existing payment OAuth regression
production migration safety
```

Fix only concrete findings, add a failing regression test before each behavior fix, then rerun the smallest relevant command plus the final affected package check.

- [ ] **Step 6: Verify the final diff and commit review fixes**

```bash
git status --short
git diff --check 67d73ff..HEAD
git diff --stat 67d73ff..HEAD
```

If review produced code changes:

```bash
git add packages/database/prisma/schema.prisma \
  packages/database/prisma/migrations/20260808120000_wechat_oauth_login/migration.sql \
  packages/database/prisma/wechat-auth-schema-contract.test.ts \
  apps/api-core/src/auth apps/api-core/src/security/rate-limit.interceptor.ts \
  apps/api-core/tests/wechat-auth.test.ts apps/api-core/tests/rate-limit.test.ts \
  apps/web/src/lib/wechat-auth.ts apps/web/src/lib/user-identity.ts \
  apps/web/src/app/login/page.tsx apps/web/src/components/auth/user-login-form.tsx \
  apps/web/src/app/dashboard/page.tsx apps/web/src/components/shell/user-account-menu.tsx \
  apps/web/tests/wechat-auth.test.ts \
  .env.example .env.production.example docker-compose.prod.yml
git commit -m "fix(auth): harden WeChat login flow"
```

The final handoff must state that real WeChat login has not been deployed or live-tested until the website-app credentials are placed in server `.env.production` and a separate release is explicitly requested.

import assert from "node:assert/strict";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { AuthModule } from "../src/auth/auth.module.js";
import {
  clearWechatOAuthStateCookie,
  setWechatOAuthStateCookie,
  wechatOAuthStateCookie
} from "../src/auth/wechat-auth-cookie.js";
import { WechatAuthController } from "../src/auth/wechat-auth.controller.js";
import {
  loadWechatOAuthRuntimeConfig,
  resolveWechatOAuthChannel,
  WechatOAuthClient,
  type WechatOAuthRuntimeConfig
} from "../src/auth/wechat-oauth.client.js";
import {
  RedisWechatOAuthStateStore,
  type WechatOAuthStateStore,
  type WechatStateRedisClient
} from "../src/auth/wechat-oauth-state.store.js";
import {
  WechatAuthService,
  type WechatAuthPrisma,
  type WechatSessionStarter
} from "../src/auth/wechat-auth.service.js";
import {
  WechatAuthError,
  type WechatIdentity,
  type WechatOAuthChannel,
  type WechatOAuthStateRecord
} from "../src/auth/wechat-auth.types.js";

const desktopChromeUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36";
const mobileSafariUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
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

function responseMock() {
  const cookies: Array<{
    action: "set" | "clear";
    name: string;
    value?: string;
    options: Record<string, unknown>;
  }> = [];
  const redirects: Array<[number, string]> = [];

  return {
    cookies,
    redirects,
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies.push({ action: "set", name, value, options });
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      cookies.push({ action: "clear", name, options });
    },
    redirect(statusCode: number, url: string) {
      redirects.push([statusCode, url]);
    }
  };
}

class FakeRedisClient implements WechatStateRedisClient {
  isOpen = false;
  lastKey: string | null = null;
  private readonly values = new Map<string, string>();

  async connect() {
    this.isOpen = true;
  }

  async set(key: string, value: string) {
    this.lastKey = key;
    this.values.set(key, value);
  }

  async getDel(key: string) {
    this.lastKey = key;
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }

  async quit() {
    this.isOpen = false;
  }
}

test("微信内浏览器使用公众号 snsapi_userinfo", () => {
  const client = new WechatOAuthClient(testRuntimeConfig);

  assert.equal(resolveWechatOAuthChannel("MicroMessenger/8.0"), "MP");
  const url = new URL(client.buildAuthorizationUrl("MP", "mp-state"));
  assert.equal(
    url.origin + url.pathname,
    "https://open.weixin.qq.com/connect/oauth2/authorize"
  );
  assert.equal(url.searchParams.get("appid"), "mp-app-id");
  assert.equal(url.searchParams.get("redirect_uri"), testRuntimeConfig.callbackUrl);
  assert.equal(url.searchParams.get("scope"), "snsapi_userinfo");
  assert.equal(url.searchParams.get("state"), "mp-state");
});

test("桌面浏览器使用网站应用 snsapi_login", () => {
  const client = new WechatOAuthClient(testRuntimeConfig);

  assert.equal(resolveWechatOAuthChannel(desktopChromeUserAgent), "WEB");
  const url = new URL(client.buildAuthorizationUrl("WEB", "web-state"));
  assert.equal(
    url.origin + url.pathname,
    "https://open.weixin.qq.com/connect/qrconnect"
  );
  assert.equal(url.searchParams.get("appid"), "web-app-id");
  assert.equal(url.searchParams.get("scope"), "snsapi_login");
  assert.equal(url.searchParams.get("state"), "web-state");
});

test("普通手机浏览器不尝试公众号授权", () => {
  assert.equal(resolveWechatOAuthChannel(mobileSafariUserAgent), null);
  assert.equal(resolveWechatOAuthChannel(null), null);
});

test("微信配置缺失不阻塞模块构造并在使用时失败关闭", async () => {
  const names = [
    "APP_BASE_URL",
    "WECHAT_APP_ID",
    "WECHAT_APP_SECRET",
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET",
    "REDIS_URL"
  ] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) {
    delete process.env[name];
  }

  try {
    const oauthClient = new WechatOAuthClient();
    const stateStore = new RedisWechatOAuthStateStore();

    assert.throws(
      () => oauthClient.buildAuthorizationUrl("MP", "state"),
      (error: unknown) =>
        error instanceof WechatAuthError && error.code === "config"
    );
    await assert.rejects(
      () =>
        stateStore.put(
          "state",
          { channel: "MP", next: "/dashboard", issuedAt: Date.now() },
          600
        ),
      (error: unknown) =>
        error instanceof WechatAuthError && error.code === "upstream"
    );
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});

test("生产环境拒绝非 HTTPS 的微信回调地址", () => {
  const names = [
    "NODE_ENV",
    "APP_BASE_URL",
    "WECHAT_APP_ID",
    "WECHAT_APP_SECRET",
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET"
  ] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));

  process.env.NODE_ENV = "production";
  process.env.APP_BASE_URL = "http://xueleai.com";
  process.env.WECHAT_APP_ID = "mp-app-id";
  process.env.WECHAT_APP_SECRET = "mp-secret";
  process.env.WECHAT_OPEN_APP_ID = "web-app-id";
  process.env.WECHAT_OPEN_APP_SECRET = "web-secret";

  try {
    assert.throws(
      () => loadWechatOAuthRuntimeConfig(),
      (error: unknown) =>
        error instanceof WechatAuthError && error.code === "config"
    );
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});

test("AuthModule 在微信凭据为空时仍可完成依赖注入", async () => {
  const previousProfileContextSecret = process.env.PROFILE_CONTEXT_SECRET;
  process.env.PROFILE_CONTEXT_SECRET = "wechat-auth-profile-context-test-secret";

  try {
    const app = await NestFactory.createApplicationContext(AuthModule, {
      logger: false
    });

    await app.close();
  } finally {
    if (previousProfileContextSecret === undefined) {
      delete process.env.PROFILE_CONTEXT_SECRET;
    } else {
      process.env.PROFILE_CONTEXT_SECRET = previousProfileContextSecret;
    }
  }
});

test("OAuth token 与用户资料请求返回统一身份", async () => {
  const requests: URL[] = [];
  const client = new WechatOAuthClient(
    testRuntimeConfig,
    sequenceFetch(requests, [
      { access_token: "oauth-token", openid: "web-open-id" },
      {
        openid: "web-open-id",
        unionid: "union-id",
        nickname: "微信用户",
        headimgurl: "https://wx.example/avatar"
      }
    ])
  );

  const identity = await client.fetchIdentity("WEB", "authorization-code");

  assert.deepEqual(identity, {
    channel: "WEB",
    openId: "web-open-id",
    unionId: "union-id",
    nickname: "微信用户",
    avatarUrl: "https://wx.example/avatar"
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.searchParams.get("grant_type"), "authorization_code");
  assert.equal(requests[1]?.searchParams.get("lang"), "zh_CN");
});

test("缺少 UnionID 时拒绝创建无法统一的账号", async () => {
  const client = new WechatOAuthClient(
    testRuntimeConfig,
    sequenceFetch([], [
      { access_token: "oauth-token", openid: "mp-open-id" },
      { openid: "mp-open-id", nickname: "微信用户" }
    ])
  );

  await assert.rejects(
    () => client.fetchIdentity("MP", "code"),
    (error: unknown) =>
      error instanceof WechatAuthError &&
      error.code === "upstream" &&
      !error.message.includes("mp-secret")
  );
});

test("微信返回无效授权码时只暴露稳定错误", async () => {
  const client = new WechatOAuthClient(
    testRuntimeConfig,
    sequenceFetch([], [{ errcode: 40029, errmsg: "invalid code: provider detail" }])
  );

  await assert.rejects(
    () => client.fetchIdentity("MP", "bad-code"),
    (error: unknown) =>
      error instanceof WechatAuthError &&
      error.code === "denied" &&
      error.message === "denied"
  );
});

test("state 以摘要作为 Redis key 并只能消费一次", async () => {
  const redis = new FakeRedisClient();
  const store = new RedisWechatOAuthStateStore(redis);
  const record = { channel: "MP" as const, next: "/dashboard", issuedAt: 1 };

  await store.put("raw-state", record, 600);
  assert.equal(redis.lastKey?.includes("raw-state"), false);
  assert.deepEqual(await store.consume("raw-state"), record);
  assert.equal(await store.consume("raw-state"), null);
});

test("state Cookie 绑定授权路径并使用 HTTPS 安全属性", () => {
  const previousBaseUrl = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://xueleai.com";
  const response = responseMock();

  try {
    setWechatOAuthStateCookie(response, "raw-state", 600);
    clearWechatOAuthStateCookie(response);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = previousBaseUrl;
    }
  }

  assert.deepEqual(response.cookies[0], {
    action: "set",
    name: wechatOAuthStateCookie,
    value: "raw-state",
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/api/auth/wechat",
      maxAge: 600_000
    }
  });
  assert.deepEqual(response.cookies[1], {
    action: "clear",
    name: wechatOAuthStateCookie,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/api/auth/wechat"
    }
  });
});

interface HarnessUser {
  id: string;
  email: string;
  passwordHash: string;
  nickname: string;
  avatarUrl: string | null;
  status: "ACTIVE" | "DISABLED";
  wechatOpenId: string | null;
  wechatMpOpenId: string | null;
  wechatWebOpenId: string | null;
  wechatUnionId: string | null;
  lastLoginAt: Date | null;
}

class FakeWechatStateStore implements WechatOAuthStateStore {
  readonly records = new Map<string, WechatOAuthStateRecord>();

  async put(state: string, record: WechatOAuthStateRecord) {
    this.records.set(state, record);
  }

  async consume(state: string) {
    const record = this.records.get(state) ?? null;
    this.records.delete(state);
    return record;
  }
}

class FakeWechatOAuthClient {
  identity: WechatIdentity = {
    channel: "MP",
    openId: "mp-open-id",
    unionId: "union-id",
    nickname: "微信用户",
    avatarUrl: "https://wx.example/avatar"
  };
  exchangeCount = 0;

  buildAuthorizationUrl(channel: WechatOAuthChannel, state: string) {
    return `https://wechat.example/${channel.toLowerCase()}?state=${state}`;
  }

  async fetchIdentity(channel: WechatOAuthChannel) {
    this.exchangeCount += 1;
    return { ...this.identity, channel };
  }
}

function activeUser(values: Partial<HarnessUser> = {}): HarnessUser {
  return {
    id: values.id ?? `user-${Math.random()}`,
    email: values.email ?? "existing@example.com",
    passwordHash: values.passwordHash ?? "existing-password-hash",
    nickname: values.nickname ?? "已有用户",
    avatarUrl: values.avatarUrl ?? null,
    status: values.status ?? "ACTIVE",
    wechatOpenId: values.wechatOpenId ?? null,
    wechatMpOpenId: values.wechatMpOpenId ?? null,
    wechatWebOpenId: values.wechatWebOpenId ?? null,
    wechatUnionId: values.wechatUnionId ?? null,
    lastLoginAt: values.lastLoginAt ?? null
  };
}

function createServiceHarness() {
  const users: HarnessUser[] = [];
  const walletUserIds: string[] = [];
  const startedSessions: string[] = [];
  let userSequence = 0;
  let createRaceUser: HarnessUser | null = null;
  const store = new FakeWechatStateStore();
  const oauthClient = new FakeWechatOAuthClient();
  const authService: WechatSessionStarter = {
    async startUserSession(userId) {
      startedSessions.push(userId);
      return { userId };
    }
  };
  const prisma: WechatAuthPrisma = {
    user: {
      async findUnique(input) {
        const where = input.where;
        return (
          users.find((user) =>
            Object.entries(where).every(
              ([key, value]) => user[key as keyof HarnessUser] === value
            )
          ) ?? null
        );
      },
      async update(input) {
        const user = users.find((item) => item.id === input.where.id);
        assert.ok(user);
        Object.assign(user, input.data);
        return user;
      },
      async create(input) {
        if (createRaceUser) {
          users.push(createRaceUser);
          createRaceUser = null;
          throw { code: "P2002" };
        }

        const user: HarnessUser = {
          id: `created-${++userSequence}`,
          email: input.data.email,
          passwordHash: input.data.passwordHash,
          nickname: input.data.nickname,
          avatarUrl: input.data.avatarUrl ?? null,
          status: "ACTIVE",
          wechatOpenId: null,
          wechatMpOpenId: input.data.wechatMpOpenId ?? null,
          wechatWebOpenId: input.data.wechatWebOpenId ?? null,
          wechatUnionId: input.data.wechatUnionId,
          lastLoginAt: input.data.lastLoginAt ?? null
        };
        users.push(user);
        if (input.data.wallet?.create) {
          walletUserIds.push(user.id);
        }
        return user;
      }
    }
  };
  const service = new WechatAuthService(oauthClient, store, authService, prisma);

  return {
    service,
    store,
    oauthClient,
    users,
    walletUserIds,
    startedSessions,
    setCreateRaceUser(user: HarnessUser) {
      createRaceUser = user;
    }
  };
}

async function completeAuthorization(
  harness: ReturnType<typeof createServiceHarness>,
  channel: WechatOAuthChannel = "MP"
) {
  const state = `state-${channel.toLowerCase()}`;
  harness.store.records.set(state, {
    channel,
    next: "/dashboard",
    issuedAt: Date.now()
  });
  return harness.service.completeAuthorization({
    code: "authorization-code",
    state,
    stateCookie: state,
    response: responseMock()
  });
}

test("授权入口生成随机 state 并保存渠道与安全 next", async () => {
  const harness = createServiceHarness();
  const first = await harness.service.createAuthorization(
    "MicroMessenger/8.0",
    "/dashboard/billing"
  );
  const second = await harness.service.createAuthorization(
    "MicroMessenger/8.0",
    "/dashboard/billing"
  );

  assert.equal(first.channel, "MP");
  assert.notEqual(first.state, second.state);
  assert.equal(first.state.length >= 40, true);
  assert.equal(harness.store.records.get(first.state)?.next, "/dashboard/billing");
});

test("授权入口拒绝普通手机浏览器并过滤外部 next", async () => {
  const harness = createServiceHarness();

  await assert.rejects(
    () => harness.service.createAuthorization(mobileSafariUserAgent, "https://evil.example"),
    (error: unknown) =>
      error instanceof WechatAuthError && error.code === "mobile_browser"
  );
  const desktop = await harness.service.createAuthorization(
    desktopChromeUserAgent,
    "//evil.example"
  );
  assert.equal(harness.store.records.get(desktop.state)?.next, "/");
});

test("回调必须匹配 Cookie state 后才消费 Redis state", async () => {
  const harness = createServiceHarness();
  harness.store.records.set("query-state", {
    channel: "MP",
    next: "/dashboard",
    issuedAt: Date.now()
  });

  await assert.rejects(
    () =>
      harness.service.completeAuthorization({
        code: "code",
        state: "query-state",
        stateCookie: "cookie-state",
        response: responseMock()
      }),
    (error: unknown) => error instanceof WechatAuthError && error.code === "state"
  );
  assert.equal(harness.oauthClient.exchangeCount, 0);
  assert.equal(harness.store.records.has("query-state"), true);
});

test("UnionID 命中时补齐网站 OpenID 并建立现有会话", async () => {
  const harness = createServiceHarness();
  harness.users.push(activeUser({ id: "union-owner", wechatUnionId: "union-id" }));
  harness.oauthClient.identity = {
    ...harness.oauthClient.identity,
    channel: "WEB",
    openId: "web-open-id"
  };

  const result = await completeAuthorization(harness, "WEB");

  assert.equal(result.next, "/dashboard");
  assert.equal(harness.users[0]?.wechatWebOpenId, "web-open-id");
  assert.deepEqual(harness.startedSessions, ["union-owner"]);
});

test("公众号 OpenID 旧用户首次登录时回填 UnionID", async () => {
  const harness = createServiceHarness();
  harness.users.push(activeUser({ id: "legacy", wechatMpOpenId: "mp-open-id" }));

  await completeAuthorization(harness);

  assert.equal(harness.users[0]?.wechatUnionId, "union-id");
  assert.deepEqual(harness.startedSessions, ["legacy"]);
});

test("微信登录不覆盖已有昵称和头像", async () => {
  const harness = createServiceHarness();
  harness.users.push(
    activeUser({
      id: "profile-owner",
      nickname: "用户自定义昵称",
      avatarUrl: "https://xueleai.com/custom-avatar.png",
      wechatUnionId: "union-id"
    })
  );

  await completeAuthorization(harness);

  assert.equal(harness.users[0]?.nickname, "用户自定义昵称");
  assert.equal(
    harness.users[0]?.avatarUrl,
    "https://xueleai.com/custom-avatar.png"
  );
});

test("首次微信授权创建普通用户与唯一钱包", async () => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "wechat-auth-test-secret";
  const harness = createServiceHarness();
  harness.oauthClient.identity = {
    ...harness.oauthClient.identity,
    unionId: "new-union-id",
    nickname: "新微信用户"
  };

  try {
    await completeAuthorization(harness);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  }

  assert.equal(harness.users.length, 1);
  assert.equal(harness.users[0]?.email.endsWith("@users.xueleai.local"), true);
  assert.equal(harness.users[0]?.email.includes("new-union-id"), false);
  assert.equal(harness.users[0]?.nickname, "新微信用户");
  assert.equal(harness.users[0]?.wechatMpOpenId, "mp-open-id");
  assert.equal(harness.users[0]?.wechatOpenId, null);
  assert.deepEqual(harness.walletUserIds, [harness.users[0]?.id]);
  assert.deepEqual(harness.startedSessions, [harness.users[0]?.id]);
});

test("UnionID 与渠道 OpenID 指向不同用户时拒绝自动合并", async () => {
  const harness = createServiceHarness();
  harness.users.push(
    activeUser({ id: "union-owner", wechatUnionId: "union-id" }),
    activeUser({ id: "openid-owner", wechatMpOpenId: "mp-open-id" })
  );

  await assert.rejects(
    () => completeAuthorization(harness),
    (error: unknown) =>
      error instanceof WechatAuthError && error.code === "identity_conflict"
  );
  assert.deepEqual(harness.startedSessions, []);
});

test("禁用用户不能通过微信登录", async () => {
  const harness = createServiceHarness();
  harness.users.push(
    activeUser({ id: "disabled", status: "DISABLED", wechatUnionId: "union-id" })
  );

  await assert.rejects(
    () => completeAuthorization(harness),
    (error: unknown) =>
      error instanceof WechatAuthError && error.code === "disabled"
  );
  assert.deepEqual(harness.startedSessions, []);
});

test("并发创建唯一键竞争后重读赢家且不创建第二个钱包", async () => {
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "wechat-auth-test-secret";
  const harness = createServiceHarness();
  harness.setCreateRaceUser(
    activeUser({
      id: "race-winner",
      wechatUnionId: "union-id",
      wechatMpOpenId: "mp-open-id"
    })
  );

  try {
    await completeAuthorization(harness);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  }

  assert.equal(harness.users.length, 1);
  assert.deepEqual(harness.walletUserIds, []);
  assert.deepEqual(harness.startedSessions, ["race-winner"]);
});

async function withAppBaseUrl<T>(run: () => Promise<T>) {
  const previous = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://xueleai.com";

  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = previous;
    }
  }
}

test("授权端点设置 state Cookie 后跳转微信", async () => {
  const response = responseMock();
  const service = {
    async createAuthorization(userAgent: string | null, next: string | undefined) {
      assert.equal(userAgent, "MicroMessenger/8.0");
      assert.equal(next, "/dashboard");
      return {
        channel: "MP" as const,
        state: "controller-state",
        url: "https://open.weixin.qq.com/authorize-test",
        maxAgeSeconds: 600
      };
    },
    async completeAuthorization() {
      throw new Error("本测试不应完成授权");
    }
  };
  const controller = new WechatAuthController(service);

  await controller.authorize(
    { headers: { "user-agent": "MicroMessenger/8.0" } },
    "/dashboard",
    response
  );

  assert.equal(response.cookies[0]?.name, wechatOAuthStateCookie);
  assert.deepEqual(response.redirects, [
    [302, "https://open.weixin.qq.com/authorize-test"]
  ]);
});

test("回调成功清除 state Cookie 并进入保留原页面的身份选择", async () => {
  const response = responseMock();
  const service = {
    async createAuthorization() {
      throw new Error("本测试不应创建授权");
    },
    async completeAuthorization(input: { response: ReturnType<typeof responseMock> }) {
      input.response.cookie("xueleai_user_access", "session", { httpOnly: true });
      return { next: "/dashboard" };
    }
  };
  const controller = new WechatAuthController(service);

  await withAppBaseUrl(() =>
    controller.callback(
      { headers: { cookie: `${wechatOAuthStateCookie}=controller-state` } },
      "code",
      "controller-state",
      response
    )
  );

  assert.equal(
    response.cookies.some(
      (cookie) => cookie.action === "clear" && cookie.name === wechatOAuthStateCookie
    ),
    true
  );
  assert.deepEqual(response.redirects, [[
    302,
    "https://xueleai.com/select-profile?next=%2Fdashboard"
  ]]);
});

test("回调错误只携带固定枚举返回登录页", async () => {
  const response = responseMock();
  const service = {
    async createAuthorization() {
      throw new Error("本测试不应创建授权");
    },
    async completeAuthorization() {
      throw new WechatAuthError("state");
    }
  };
  const controller = new WechatAuthController(service);

  await withAppBaseUrl(() =>
    controller.callback(
      { headers: { cookie: `${wechatOAuthStateCookie}=bad-state` } },
      "provider-code-must-not-leak",
      "bad-state",
      response
    )
  );

  assert.deepEqual(response.redirects, [
    [302, "https://xueleai.com/login?wechat_error=state"]
  ]);
  assert.equal(response.redirects[0]?.[1].includes("provider-code"), false);
});

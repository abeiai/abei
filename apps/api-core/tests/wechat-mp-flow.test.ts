import assert from "node:assert/strict";
import test from "node:test";
import { WechatAuthService } from "../src/auth/wechat-auth.service.js";
import type { WechatScanStore } from "../src/auth/wechat-mp.store.js";
import type {
  ScanRecord,
  WechatMpConfig,
} from "../src/auth/wechat-mp.types.js";
const config: WechatMpConfig = {
  appId: "wx0123456789abcdef",
  appSecret: "unit-secret",
  token: "unitcallbacktoken",
  encodingKey: Buffer.alloc(32, 7).toString("base64").slice(0, -1),
  originalId: "gh_unit",
  messageMode: "safe",
  origin: "http://127.0.0.1:3608",
  registrationEnabled: true,
};
class MemoryStore implements WechatScanStore {
  values = new Map<string, ScanRecord>();
  constructor(readonly now: () => number) {}
  async read(key: string) {
    const v = this.values.get(key);
    return v && v.expiresAt > this.now() ? structuredClone(v) : null;
  }
  async atomic<T>(
    keys: string[],
    update: (values: Array<ScanRecord | null>) => {
      values: Array<ScanRecord | null>;
      result: T;
    },
  ) {
    const values = keys.map((key) => {
      const v = this.values.get(key);
      return v && v.expiresAt > this.now() ? structuredClone(v) : null;
    });
    const result = update(values);
    result.values.forEach((v, i) => {
      if (v) this.values.set(keys[i]!, structuredClone(v));
      else this.values.delete(keys[i]!);
    });
    return result.result;
  }
}
function harness() {
  let now = Date.now();
  const store = new MemoryStore(() => now);
  const scenes: string[] = [];
  const provider = {
    config: () => config,
    async createQrcode(scene: string) {
      scenes.push(scene);
      return {
        url: "https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=unit-ticket",
        expiresIn: 180,
      };
    },
    async identity(openId: string) {
      return {
        appId: config.appId,
        openId,
        unionId: null,
        nickname: "微信用户",
        avatarUrl: null,
      };
    },
  };
  const users: Array<Record<string, unknown>> = [];
  const sessions: string[] = [];
  const wallets: Array<Record<string, unknown>> = [];
  const ledgers: Array<Record<string, unknown>> = [];
  const cookies: string[] = [];
  let verifiedId: string | null = null;
  const db = {
    user: {
      async findUnique({ where }: { where: Record<string, unknown> }) {
        return (
          users.find((user) =>
            Object.entries(where).every(([k, v]) => user[k] === v),
          ) ?? null
        );
      },
      async updateMany({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) {
        const u = users.find((x) =>
          Object.entries(where).every(([k, v]) => x[k] === v),
        );
        if (!u) return { count: 0 };
        Object.assign(u, data);
        return { count: 1 };
      },
      async findUniqueOrThrow({ where }: { where: { id: string } }) {
        return users.find((x) => x.id === where.id)!;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const u = users.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const u = {
          id: "created-user",
          status: "ACTIVE",
          wechatUnionId: null,
          wechatMpOpenId: null,
          ...data,
        };
        users.push(u);
        return u;
      },
    },
    wallet: {
      async create({ data }: { data: Record<string, unknown> }) {
        const wallet = { availableCredits: 0, ...data };
        wallets.push(wallet);
        return wallet;
      },
    },
    ledgerEntry: {
      async create({ data }: { data: Record<string, unknown> }) {
        ledgers.push(data);
        return data;
      },
    },
    async $transaction<T>(operation: (tx: unknown) => Promise<T>) {
      return operation(db);
    },
  };
  const auth = {
    async startUserSession(
      userId: string,
      response: {
        cookie: (
          name: string,
          value: string,
          options: Record<string, unknown>,
        ) => void;
      },
    ) {
      sessions.push(userId);
      response.cookie("xueleai_user_access", "private-access", {
        httpOnly: true,
      });
      return { accessToken: "private-access", refreshToken: "private-refresh" };
    },
    async verifyWechatEmailPassword(email: string, password: string) {
      const user = users.find((x) => x.email === email);
      if (!user || password !== "existing-password")
        throw new Error("邮箱或密码错误");
      return {
        id: String(user.id),
        email,
        passwordHash: "fixture-hash",
        passwordLoginEnabled: true,
      };
    },
    async sendWechatPhoneCode() {
      return {
        verificationId: "sms-record-bound-to-context",
        expiresIn: 300,
        message: "验证码已发送",
      };
    },
    async verifyWechatPhoneCode(_phone: string, code: string, id: string) {
      if (code !== "123456" || id !== "sms-record-bound-to-context")
        throw new Error("验证码错误");
      verifiedId = id;
    },
  };
  const response = {
    cookie(name: string) {
      cookies.push(name);
    },
    clearCookie() {},
  };
  const service = new WechatAuthService(
    provider as never,
    store as never,
    auth as never,
    db as never,
    () => now,
  );
  async function start() {
    const boot = await service.bootstrap(null);
    const challenge = await service.createChallenge(
      boot.contextId,
      boot.csrfToken,
      "/picture-books",
      null,
    );
    return { boot, challenge, scene: scenes.at(-1)! };
  }
  async function scan(
    scene: string,
    openId = "owner-openid",
    event = "SCAN",
    time = now,
  ) {
    return service.handleMessage({
      ToUserName: config.originalId,
      FromUserName: openId,
      CreateTime: String(Math.floor(time / 1000)),
      MsgType: "event",
      Event: event,
      EventKey: event === "subscribe" ? "qrscene_" + scene : scene,
    });
  }
  async function scanFor(
    state: Awaited<ReturnType<typeof start>>,
    openId = "owner-openid",
  ) {
    await scan(state.scene, openId);
  }
  return {
    service,
    store,
    db,
    users,
    sessions,
    wallets,
    ledgers,
    cookies,
    response,
    start,
    scan,
    scanFor,
    provider,
    auth,
    get verifiedId() {
      return verifiedId;
    },
    advance(ms: number) {
      now += ms;
    },
  };
}
function owner(id = "existing-owner") {
  return {
    id,
    status: "ACTIVE",
    wechatMpOpenId: "owner-openid",
    wechatUnionId: "existing-union",
    nickname: "我的昵称",
    avatarUrl: "https://images.example/own.png",
    phone: "13800000001",
  };
}
test("公众号扫码后原浏览器直接领取一次已有账号会话且不暴露身份", async () => {
  const h = harness();
  h.users.push(owner());
  const s = await h.start();
  const outsider = await h.service.bootstrap(null);
  await h.scan(s.scene, "owner-openid", "subscribe");
  await assert.rejects(() =>
    h.service.poll(outsider.contextId, s.challenge.challengeId),
  );
  const scanned = await h.service.poll(
    s.boot.contextId,
    s.challenge.challengeId,
  );
  assert.equal(scanned.status, "CONFIRMED");
  assert.equal("confirmationCode" in scanned, false);
  assert.doesNotMatch(JSON.stringify(scanned), /owner-openid|existing-union/);
  const completed = await h.service.complete(
    s.boot.contextId,
    s.boot.csrfToken,
    s.challenge.challengeId,
    h.response,
  );
  assert.deepEqual(completed, {
    status: "AUTHENTICATED",
    next: "/select-profile?next=%2Fpicture-books",
  });
  assert.deepEqual(h.sessions, ["existing-owner"]);
  assert.doesNotMatch(
    JSON.stringify(completed),
    /private-access|private-refresh|owner-openid/,
  );
  assert.equal(h.wallets.length, 0);
  assert.equal(h.ledgers.length, 0);
  assert.equal(h.users[0]!.wechatUnionId, "existing-union");
  assert.equal(h.users[0]!.nickname, "我的昵称");
  await assert.rejects(() =>
    h.service.complete(
      s.boot.contextId,
      s.boot.csrfToken,
      s.challenge.challengeId,
      h.response,
    ),
  );
});
test("扫码登录不再要求公众号回复确认码，取消关注仍会终止未领取的挑战", async () => {
  const h = harness();
  const state = await h.start();
  await h.scan(state.scene);
  assert.equal(
    await h.service.handleMessage({
      FromUserName: "owner-openid",
      CreateTime: String(Math.floor(Date.now() / 1000)),
      MsgType: "text",
      MsgId: "obsolete-confirmation",
      Content: "登录 123456",
    }),
    null,
  );
  await h.service.handleMessage({
    FromUserName: "owner-openid",
    CreateTime: String(Math.floor(Date.now() / 1000)),
    MsgType: "event",
    Event: "unsubscribe",
  });
  assert.equal(
    (await h.service.poll(state.boot.contextId, state.challenge.challengeId)).status,
    "CANCELLED",
  );
});
test("取消关注也撤销滚动发布期间遗留的等待回复挑战", async () => {
  const h = harness();
  const state = await h.start();
  await h.scan(state.scene);
  const entry = [...h.store.values.entries()].find(
    ([, value]) => value.kind === "CHALLENGE" && value.id === state.challenge.challengeId,
  );
  assert.ok(entry);
  const [key, challenge] = entry;
  assert.equal(challenge.kind, "CHALLENGE");
  h.store.values.set(key, { ...challenge, status: "SCANNED" } as ScanRecord);
  await h.service.handleMessage({
    FromUserName: "owner-openid",
    CreateTime: String(Math.floor(Date.now() / 1000)),
    MsgType: "event",
    Event: "unsubscribe",
  });
  assert.equal(
    (await h.service.poll(state.boot.contextId, state.challenge.challengeId)).status,
    "CANCELLED",
  );
});
test("首次扫码身份不能被另一个微信覆盖，普通关注和错误前缀不会登录", async () => {
  const h = harness();
  h.users.push(owner());
  const s = await h.start();
  await h.scan(s.scene);
  await h.scan(s.scene, "attacker-openid");
  assert.equal(await h.scan("AI_legacy_AI"), null);
  await h.service.handleMessage({
    FromUserName: "owner-openid",
    CreateTime: String(Math.floor(Date.now() / 1000)),
    MsgType: "event",
    Event: "subscribe",
    EventKey: "",
  });
  await h.scanFor(s);
  await h.service.complete(
    s.boot.contextId,
    s.boot.csrfToken,
    s.challenge.challengeId,
    h.response,
  );
  assert.deepEqual(h.sessions, ["existing-owner"]);
});
test("刷新取消旧挑战、过期及 CSRF 不匹配均不能领取", async () => {
  const h = harness();
  const s = await h.start();
  await assert.rejects(() =>
    h.service.createChallenge(s.boot.contextId, "forged-csrf", "/", null),
  );
  await h.service.createChallenge(
    s.boot.contextId,
    s.boot.csrfToken,
    "/",
    null,
  );
  await assert.rejects(() =>
    h.service.poll(s.boot.contextId, s.challenge.challengeId),
  );
  const current = await h.start();
  await h.scanFor(current);
  h.advance(181_000);
  await assert.rejects(() =>
    h.service.complete(
      current.boot.contextId,
      current.boot.csrfToken,
      current.challenge.challengeId,
      h.response,
    ),
  );
  assert.equal(h.sessions.length, 0);
});
test("并发 complete 只允许一次会话副作用，取消关注不删除账户", async () => {
  const h = harness();
  h.users.push(owner());
  const s = await h.start();
  await h.scanFor(s);
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      h.service.complete(
        s.boot.contextId,
        s.boot.csrfToken,
        s.challenge.challengeId,
        h.response,
      ),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(h.sessions.length, 1);
  await h.scan("", "owner-openid", "unsubscribe");
  assert.equal(h.users.length, 1);
});
test("未匹配身份只获得未登录处理上下文，绑定要使用其验证码记录", async () => {
  const h = harness();
  h.users.push({ ...owner("phone-owner"), wechatMpOpenId: null });
  const s = await h.start();
  await h.scanFor(s);
  const result = await h.service.complete(
    s.boot.contextId,
    s.boot.csrfToken,
    s.challenge.challengeId,
    h.response,
  );
  assert.deepEqual(result, { status: "NEEDS_ACCOUNT_RESOLUTION" });
  assert.equal(h.sessions.length, 0);
  assert.equal(h.users.length, 1);
  await assert.rejects(() =>
    h.service.resolvePhone(
      s.boot.contextId,
      s.boot.csrfToken,
      { phone: "13800000001", code: "123456", action: "BIND" },
      h.response,
    ),
  );
  await h.service.sendResolutionCode(
    s.boot.contextId,
    s.boot.csrfToken,
    "13800000001",
  );
  const linked = await h.service.resolvePhone(
    s.boot.contextId,
    s.boot.csrfToken,
    { phone: "13800000001", code: "123456", action: "BIND" },
    h.response,
  );
  assert.equal(linked.status, "AUTHENTICATED");
  assert.equal(h.verifiedId, "sms-record-bound-to-context");
  assert.equal(h.users[0]!.wechatMpOpenId, "owner-openid");
  assert.equal(h.users.length, 1);
  await assert.rejects(() =>
    h.service.resolvePhone(
      s.boot.contextId,
      s.boot.csrfToken,
      { phone: "13800000001", code: "123456", action: "CREATE" },
      h.response,
    ),
  );
});
test("禁用身份扫码后仍拒绝登录", async () => {
  const h = harness();
  h.users.push({ ...owner(), status: "DISABLED" });
  const s = await h.start();
  await h.scanFor(s);
  await assert.rejects(() =>
    h.service.complete(
      s.boot.contextId,
      s.boot.csrfToken,
      s.challenge.challengeId,
      h.response,
    ),
  );
  assert.equal(h.sessions.length, 0);
});
test("外部 next 被过滤，重复消息不重置原始有效期", async () => {
  const h = harness();
  h.users.push(owner());
  const boot = await h.service.bootstrap(null);
  const c = await h.service.createChallenge(
    boot.contextId,
    boot.csrfToken,
    "//evil.example",
    null,
  );
  const scene = [...h.store.values.values()].find(
    (x) => x.kind === "CHALLENGE" && x.id === c.challengeId,
  );
  assert.ok(scene && scene.kind === "CHALLENGE");
  await h.scan(scene.scene);
  h.advance(170_000);
  await h.scan(scene.scene);
  h.advance(11_000);
  await assert.rejects(() => h.service.poll(boot.contextId, c.challengeId));
});

test("领取过程中刷新不能使旧请求绕过当前浏览器状态", async () => {
  const h = harness();
  h.users.push(owner());
  const s = await h.start();
  await h.scanFor(s);
  let release!: () => void, started!: () => void;
  const waiting = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      started = resolve;
    });
  h.provider.identity = async (openId: string) => {
    started();
    await waiting;
    return {
      appId: config.appId,
      openId,
      unionId: null,
      nickname: "微信用户",
      avatarUrl: null,
    };
  };
  const completed = h.service.complete(
    s.boot.contextId,
    s.boot.csrfToken,
    s.challenge.challengeId,
    h.response,
  );
  await ready;
  try {
    await assert.rejects(() =>
      h.service.createChallenge(s.boot.contextId, s.boot.csrfToken, "/", null),
    );
  } finally {
    release();
    await completed;
  }
});
test("可信 UnionID 与原账号不同不能覆盖，即使该 UnionID 尚无所有者", async () => {
  const h = harness();
  h.users.push(owner());
  const s = await h.start();
  await h.scanFor(s);
  h.provider.identity = async (openId: string) => ({
    appId: config.appId,
    openId,
    unionId: "other-union" as never,
    nickname: "微信用户",
    avatarUrl: null,
  });
  await assert.rejects(() =>
    h.service.complete(
      s.boot.contextId,
      s.boot.csrfToken,
      s.challenge.challengeId,
      h.response,
    ),
  );
  assert.equal(h.sessions.length, 0);
  assert.equal(h.users[0]!.wechatUnionId, "existing-union");
});

test("仅邮箱账号可凭已有密码绑定，失败不发会话或覆盖身份", async () => {
  const h = harness();
  h.users.push({
    ...owner("email-owner"),
    email: "owner@example.com",
    passwordHash: "fixture-hash",
    passwordLoginEnabled: true,
    wechatMpOpenId: null,
  });
  const s = await h.start();
  await h.scanFor(s);
  await h.service.complete(
    s.boot.contextId,
    s.boot.csrfToken,
    s.challenge.challengeId,
    h.response,
  );
  await h.service.resolveEmail(
    s.boot.contextId,
    s.boot.csrfToken,
    { email: "owner@example.com", password: "existing-password" },
    h.response,
  );
  assert.deepEqual(h.sessions, ["email-owner"]);
  assert.equal(h.users[0]!.wechatMpOpenId, "owner-openid");
  assert.equal(h.users.length, 1);
  await assert.rejects(() =>
    h.service.resolveEmail(
      s.boot.contextId,
      s.boot.csrfToken,
      { email: "owner@example.com", password: "existing-password" },
      h.response,
    ),
  );
  const h2 = harness();
  h2.users.push({
    ...owner(),
    email: "owner@example.com",
    passwordHash: "fixture-hash",
    passwordLoginEnabled: true,
    wechatMpOpenId: null,
  });
  const s2 = await h2.start();
  await h2.scanFor(s2);
  await h2.service.complete(
    s2.boot.contextId,
    s2.boot.csrfToken,
    s2.challenge.challengeId,
    h2.response,
  );
  await assert.rejects(() =>
    h2.service.resolveEmail(
      s2.boot.contextId,
      s2.boot.csrfToken,
      { email: "owner@example.com", password: "wrong" },
      h2.response,
    ),
  );
  assert.equal(h2.sessions.length, 0);
  assert.equal(h2.users[0]!.wechatMpOpenId, null);
});

test("验证手机号后账号并发更换手机号不能把微信绑定给旧持有人", async () => {
  const h = harness();
  h.users.push({ ...owner(), wechatMpOpenId: null });
  const s = await h.start();
  await h.scanFor(s);
  await h.service.complete(
    s.boot.contextId,
    s.boot.csrfToken,
    s.challenge.challengeId,
    h.response,
  );
  await h.service.sendResolutionCode(
    s.boot.contextId,
    s.boot.csrfToken,
    "13800000001",
  );
  const update = h.db.user.updateMany;
  h.db.user.updateMany = async (args) => {
    h.users[0]!.phone = "13800000002";
    return update(args);
  };
  await assert.rejects(() =>
    h.service.resolvePhone(
      s.boot.contextId,
      s.boot.csrfToken,
      { phone: "13800000001", code: "123456", action: "BIND" },
      h.response,
    ),
  );
  assert.equal(h.sessions.length, 0);
  assert.equal(h.users[0]!.wechatMpOpenId, null);
});

test("其他登录领取同一浏览器上下文后，扫码领取失败", async () => {
  const h = harness();
  h.users.push(owner());
  const s = await h.start();
  await h.scanFor(s);
  await h.service.withAlternativeLogin(
    s.boot.contextId,
    async () => "email-login",
  );
  await assert.rejects(() =>
    h.service.complete(
      s.boot.contextId,
      s.boot.csrfToken,
      s.challenge.challengeId,
      h.response,
    ),
  );
  assert.equal(h.sessions.length, 0);
});

test("临近过期时其他登录占用上下文，第二次提交仍被阻止", async () => {
  const h = harness();
  const s = await h.start();
  h.advance(599900);
  let release!: () => void;
  const pending = h.service.withAlternativeLogin(
    s.boot.contextId,
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  await new Promise((r) => setImmediate(r));
  h.advance(200);
  try {
    await assert.rejects(() =>
      h.service.withAlternativeLogin(s.boot.contextId, async () => "second"),
    );
  } finally {
    release();
    await pending;
  }
});

test("验证后邮箱、密码或密码开关改变，微信身份写入均失败", async () => {
  for (const changed of [
    { email: "changed@example.com" },
    { passwordHash: "reset-hash" },
    { passwordLoginEnabled: false },
  ]) {
    const h = harness();
    h.users.push({
      ...owner(),
      email: "owner@example.com",
      passwordHash: "fixture-hash",
      passwordLoginEnabled: true,
      wechatMpOpenId: null,
    });
    const s = await h.start();
    await h.scanFor(s);
    await h.service.complete(
      s.boot.contextId,
      s.boot.csrfToken,
      s.challenge.challengeId,
      h.response,
    );
    const verify = h.auth.verifyWechatEmailPassword;
    h.auth.verifyWechatEmailPassword = async (email, password) => {
      const proof = await verify(email, password);
      Object.assign(h.users[0]!, changed);
      return proof;
    };
    await assert.rejects(() =>
      h.service.resolveEmail(
        s.boot.contextId,
        s.boot.csrfToken,
        { email: "owner@example.com", password: "existing-password" },
        h.response,
      ),
    );
    assert.equal(h.sessions.length, 0);
    assert.equal(h.users[0]!.wechatMpOpenId, null);
  }
});

test("扫码完成已领取时，取消和其他登录失败，原登录仅建立一次", async () => {
  const h = harness();
  h.users.push(owner());
  const s = await h.start();
  await h.scanFor(s);
  let release!: () => void, ready!: () => void;
  const waiting = new Promise<void>((r) => {
      release = r;
    }),
    started = new Promise<void>((r) => {
      ready = r;
    });
  h.provider.identity = async (openId) => {
    ready();
    await waiting;
    return {
      appId: config.appId,
      openId,
      unionId: null,
      nickname: "微信用户",
      avatarUrl: null,
    };
  };
  const completed = h.service.complete(
    s.boot.contextId,
    s.boot.csrfToken,
    s.challenge.challengeId,
    h.response,
  );
  await started;
  try {
    await assert.rejects(() =>
      h.service.cancel(
        s.boot.contextId,
        s.boot.csrfToken,
        s.challenge.challengeId,
      ),
    );
    await assert.rejects(() =>
      h.service.withAlternativeLogin(
        s.boot.contextId,
        async () => "other-login",
      ),
    );
  } finally {
    release();
    await completed;
  }
  assert.deepEqual(h.sessions, ["existing-owner"]);
});

test("未知身份必须明确创建且完成短信，创建不启用密码登录", async () => {
  const h = harness();
  const s = await h.start();
  await h.scanFor(s);
  await h.service.complete(
    s.boot.contextId,
    s.boot.csrfToken,
    s.challenge.challengeId,
    h.response,
  );
  await h.service.sendResolutionCode(
    s.boot.contextId,
    s.boot.csrfToken,
    "13800000001",
  );
  await h.service.resolvePhone(
    s.boot.contextId,
    s.boot.csrfToken,
    { phone: "13800000001", code: "123456", action: "CREATE" },
    h.response,
  );
  assert.equal(h.users.length, 1);
  assert.equal(h.wallets[0]!.availableCredits, 100);
  assert.equal(h.ledgers.length, 1);
  assert.equal(h.ledgers[0]!.amount, 100);
  assert.equal(h.ledgers[0]!.balanceAfter, 100);
  assert.equal(h.users[0]!.passwordLoginEnabled, false);
  assert.match(
    String(h.users[0]!.email),
    /^wechat-[a-f0-9]{64}@users\.abei\.local$/,
  );
  assert.equal(h.users[0]!.wechatMpOpenId, "owner-openid");
});

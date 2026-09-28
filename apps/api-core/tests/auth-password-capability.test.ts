import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword } from "@xueleai/database";

import { AuthService } from "../src/auth/auth.service.js";
import { AuthController } from "../src/auth/auth.controller.js";
import { AppException } from "../src/common/app-exception.js";
import { profileContextCookie, userRefreshCookie } from "../src/security/cookies.js";
import { verifyProfileContextToken } from "../src/profiles/profile-context-token.js";

process.env.PROFILE_CONTEXT_SECRET = "profile-context-test-secret";

const learnerSwitchPasswordHash = await hashPassword("123456");

type MutableAuthService = AuthService & Record<string, unknown>;

function responseRecorder() {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const cleared: string[] = [];
  return {
    response: {
      cookie(name: string, value: string, options: Record<string, unknown>) {
        cookies.push({ name, value, options });
      },
      clearCookie(name: string) {
        cleared.push(name);
      }
    },
    cookies,
    cleared
  };
}

function publicUserRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    phone: null,
    phoneVerifiedAt: null,
    passwordHash: "hash",
    passwordLoginEnabled: true,
    learnerSwitchPasswordHash: null,
    nickname: "测试用户",
    avatarUrl: null,
    status: "ACTIVE",
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function configuredService() {
  const service = new AuthService() as MutableAuthService;
  service["getAccessSecret"] = () => "access-test-secret";
  service["getRefreshSecret"] = () => "refresh-test-secret";
  return service;
}

function refreshFixture(options: {
  afterAuthoritativeRead?: "REVOKE" | "SWITCH";
  learnerActive?: boolean;
  refreshMaxAge?: number;
  updateDelayMs?: number;
  recordType?: "USER" | "ADMIN";
  recordRevoked?: boolean;
  recordExpired?: boolean;
  profileMode?: "UNSELECTED" | "ACCOUNT" | "LEARNER";
  switchPasswordHash?: string | null;
} = {}) {
  const service = configuredService();
  if (options.refreshMaxAge) service["getRefreshMaxAge"] = () => options.refreshMaxAge!;
  const opaqueToken = "opaque-refresh";
  const tokenHash = (service["hashToken"] as (value: string) => string).call(service, opaqueToken);
  const record = {
    id: "refresh-1",
    userId: "user-1",
    adminUserId: null,
    tokenHash,
    type: options.recordType ?? "USER",
    profileMode: options.profileMode ?? "LEARNER",
    profileLearnerId: (options.profileMode ?? "LEARNER") === "LEARNER" ? "learner-1" : null,
    expiresAt: new Date(Date.now() + (options.recordExpired ? -60_000 : 60_000)),
    createdAt: new Date(),
    revokedAt: options.recordRevoked ? new Date() : (null as Date | null),
    user: publicUserRecord({
      learnerSwitchPasswordHash: options.switchPasswordHash ?? learnerSwitchPasswordHash
    })
  };
  let didMutate = false;
  let renewedExpiresAt: Date | null = null;
  let revoked = false;
  let writeAttempts = 0;

  function matches(where: Record<string, unknown>) {
    if (where.id !== undefined && where.id !== record.id) return false;
    if (where.tokenHash !== undefined && where.tokenHash !== record.tokenHash) return false;
    if (where.type !== undefined && where.type !== record.type) return false;
    if (where.userId !== undefined) {
      if (typeof where.userId === "object" && where.userId !== null && "not" in where.userId) {
        if ((where.userId as { not: unknown }).not === null && record.userId === null) return false;
      } else if (where.userId !== record.userId) {
        return false;
      }
    }
    if (where.revokedAt === null && record.revokedAt !== null) return false;
    if (where.profileMode !== undefined && where.profileMode !== record.profileMode) return false;
    if ("profileLearnerId" in where && where.profileLearnerId !== record.profileLearnerId) return false;
    const expiry = where.expiresAt as Date | { equals?: Date; gt?: Date } | undefined;
    if (expiry instanceof Date && expiry.getTime() !== record.expiresAt.getTime()) return false;
    if (expiry && !(expiry instanceof Date)) {
      if (expiry.equals && expiry.equals.getTime() !== record.expiresAt.getTime()) return false;
      if (expiry.gt && record.expiresAt <= expiry.gt) return false;
    }
    return true;
  }

  const prisma: Record<string, unknown> & {
    refreshToken: Record<string, unknown>;
    learner: Record<string, unknown>;
  } = {
    refreshToken: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (!matches(where)) return null;
        const snapshot = { ...record, user: { ...record.user } };
        if (!didMutate && options.afterAuthoritativeRead) {
          didMutate = true;
          if (options.afterAuthoritativeRead === "REVOKE") record.revokedAt = new Date();
          else {
            record.profileMode = "ACCOUNT";
            record.profileLearnerId = null;
          }
        }
        return snapshot;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (data.expiresAt) {
          renewedExpiresAt = data.expiresAt as Date;
          record.expiresAt = renewedExpiresAt;
        }
        if (data.revokedAt) {
          revoked = true;
          record.revokedAt = data.revokedAt as Date;
        }
        return { ...record };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        writeAttempts += 1;
        if (options.updateDelayMs) await new Promise((resolve) => setTimeout(resolve, options.updateDelayMs));
        if (!matches(where)) return { count: 0 };
        if (data.expiresAt) {
          renewedExpiresAt = data.expiresAt as Date;
          record.expiresAt = renewedExpiresAt;
        }
        if (data.revokedAt) {
          revoked = true;
          record.revokedAt = data.revokedAt as Date;
        }
        return { count: 1 };
      }
    },
    learner: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        options.learnerActive === false || where.id !== "learner-1" || where.userId !== "user-1"
          ? null
          : {
              id: "learner-1",
              userId: "user-1",
              nickname: "小小",
              grade: "GRADE_2",
              avatarUrl: null,
              status: "ACTIVE"
            }
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(prisma)
  };
  service["prisma"] = prisma;

  return {
    service,
    request(token = opaqueToken) {
      return { headers: { cookie: `xueleai_user_refresh=${token}` } };
    },
    get renewedExpiresAt() {
      return renewedExpiresAt;
    },
    get revoked() {
      return revoked;
    },
    get profileMode() {
      return record.profileMode;
    },
    get writeAttempts() {
      return writeAttempts;
    }
  };
}

function refreshAuthorityFixture(options: {
  recordType?: "USER" | "ADMIN";
  recordRevoked?: boolean;
  recordExpired?: boolean;
} = {}) {
  const service = configuredService();
  const storedToken = "stored-refresh-token";
  const storedTokenHash = (service["hashToken"] as (value: string) => string).call(service, storedToken);
  const expiresAt = new Date(Date.now() + (options.recordExpired ? -60_000 : 60_000));
  const record = {
    id: "refresh-authority-1",
    userId: "user-1",
    adminUserId: null,
    tokenHash: storedTokenHash,
    type: options.recordType ?? "USER",
    profileMode: "ACCOUNT",
    profileLearnerId: null,
    expiresAt,
    createdAt: new Date(),
    revokedAt: options.recordRevoked ? new Date() : null,
    user: publicUserRecord()
  };
  const queries: Array<{ where: Record<string, unknown>; include?: Record<string, unknown> }> = [];

  service["prisma"] = {
    refreshToken: {
      findFirst: async (query: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
        queries.push(query);
        const { where } = query;
        if (where.tokenHash !== undefined && where.tokenHash !== record.tokenHash) return null;
        if (where.type !== undefined && where.type !== record.type) return null;
        if ("revokedAt" in where && where.revokedAt !== record.revokedAt) return null;
        const expiry = where.expiresAt as { gt?: Date } | undefined;
        if (expiry?.gt && record.expiresAt <= expiry.gt) return null;
        return { ...record, user: { ...record.user } };
      }
    }
  };

  return {
    service,
    request(token = storedToken) {
      return { headers: { cookie: `${userRefreshCookie}=${token}` } };
    },
    storedTokenHash,
    expiresAt,
    get queries() {
      return [...queries];
    }
  };
}

test("公开用户返回是否具有主账号登录密码", () => {
  const service = configuredService();
  const toPublicUser = service["toPublicUser"] as (user: ReturnType<typeof publicUserRecord>) => Record<string, unknown>;

  assert.equal(toPublicUser.call(service, publicUserRecord({ passwordLoginEnabled: true })).hasLoginPassword, true);
  assert.equal(toPublicUser.call(service, publicUserRecord({ passwordLoginEnabled: false })).hasLoginPassword, false);
});

test("公开用户投影缺少密码能力字段时不能误报已有密码", () => {
  const service = configuredService();
  const toPublicUser = service["toPublicUser"] as (user: Record<string, unknown>) => Record<string, unknown>;
  const partial = publicUserRecord();
  delete (partial as { passwordLoginEnabled?: boolean }).passwordLoginEnabled;

  assert.equal(toPublicUser.call(service, partial).hasLoginPassword, false);
});

test("手机号首次创建用户禁用密码登录而邮箱注册启用密码登录", async () => {
  const phoneService = configuredService();
  let phoneCreateData: Record<string, unknown> | null = null;
  const phoneUser = publicUserRecord({
    email: "phone-13800138000@users.xueleai.local",
    phone: "13800138000",
    passwordLoginEnabled: false
  });
  phoneService["verifyPhoneCode"] = async () => undefined;
  phoneService["createUserSession"] = async (user: unknown) => ({ user });
  phoneService["prisma"] = {
    user: {
      findUnique: async () => null,
      update: async () => phoneUser
    },
    wallet: {},
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        user: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            phoneCreateData = data;
            return phoneUser;
          }
        },
        wallet: { create: async () => ({ id: "wallet-1" }) }
      })
  };
  await phoneService.loginByPhone({ phone: "13800138000", code: "199599" }, responseRecorder().response);
  assert.equal(phoneCreateData?.passwordLoginEnabled, false);

  const emailService = configuredService();
  let emailCreateData: Record<string, unknown> | null = null;
  emailService["verifyEmailCode"] = async () => undefined;
  emailService["createUserSession"] = async (user: unknown) => ({ user });
  emailService["prisma"] = {
    user: { findUnique: async () => null },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        user: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            emailCreateData = data;
            return publicUserRecord();
          }
        },
        wallet: { create: async () => ({ id: "wallet-1" }) }
      })
  };
  await emailService.register(
    { email: "user@example.com", password: "password123", emailCode: "123456" },
    responseRecorder().response
  );
  assert.equal(emailCreateData?.passwordLoginEnabled, true);
});

test("无主账号密码能力时拒绝密码验证，密码重置会启用能力并撤销会话", async () => {
  const disabled = configuredService();
  disabled["prisma"] = {
    user: {
      findUnique: async () => ({ passwordHash: await hashPassword("secret123"), passwordLoginEnabled: false, status: "ACTIVE" })
    }
  };
  await assert.rejects(
    disabled.verifyUserPassword("user-1", "secret123"),
    (error: unknown) => error instanceof AppException && error.message === "请先设置主账号登录密码"
  );

  const reset = configuredService();
  let userUpdate: Record<string, unknown> | null = null;
  let revoked = false;
  reset["prisma"] = {
    user: {
      update: ({ data }: { data: Record<string, unknown> }) => {
        userUpdate = data;
        return Promise.resolve({});
      }
    },
    refreshToken: {
      updateMany: () => {
        revoked = true;
        return Promise.resolve({ count: 1 });
      }
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations)
  };
  await (reset["updateUserPasswordAndRevokeSessions"] as (id: string, password: string) => Promise<void>)("user-1", "new-pass");
  assert.equal(userUpdate?.passwordLoginEnabled, true);
  assert.equal(revoked, true);
});

test("新用户刷新会话显式为未选择且登录响应不包含身份 token", async () => {
  const service = configuredService();
  let createData: Record<string, unknown> | null = null;
  service["prisma"] = {
    refreshToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createData = data;
        return { id: "refresh-1", ...data };
      }
    }
  };
  const recorder = responseRecorder();
  const result = await (service["createUserSession"] as (user: unknown, response: unknown) => Promise<Record<string, unknown>>)(
    publicUserRecord(),
    recorder.response
  );
  assert.equal(createData?.profileMode, "UNSELECTED");
  assert.equal(createData?.profileLearnerId, null);
  assert.equal(profileContextCookie in result, false);
});

test("刷新保留学习者模式并按新到期时间重签身份 Cookie", async () => {
  const state = refreshFixture();
  const recorder = responseRecorder();
  const result = await state.service.refresh(state.request(), recorder.response);
  const profileCookie = recorder.cookies.find((cookie) => cookie.name === profileContextCookie);
  assert.ok(profileCookie);
  assert.equal((result as Record<string, unknown>).profileContext, undefined);
  assert.equal(typeof profileCookie.options.maxAge, "number");
  const payload = verifyProfileContextToken(profileCookie.value, process.env.PROFILE_CONTEXT_SECRET!);
  assert.ok(payload);
  assert.ok(payload.expiresAt * 1000 <= state.renewedExpiresAt!.getTime());
});

test("续期遇到失效学习者撤销会话并清理三类 Cookie", async () => {
  const state = refreshFixture({ learnerActive: false });
  const recorder = responseRecorder();
  await assert.rejects(
    state.service.refresh(state.request(), recorder.response),
    (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );
  assert.equal(state.revoked, true);
  assert.deepEqual(new Set(recorder.cleared), new Set(["xueleai_user_access", "xueleai_user_refresh", profileContextCookie]));
});

test("refresh 权威读取后 logout 先撤销时 CAS 失败且不写 Cookie", async () => {
  const state = refreshFixture({ afterAuthoritativeRead: "REVOKE" });
  const recorder = responseRecorder();

  await assert.rejects(
    state.service.refresh(state.request(), recorder.response),
    (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );
  assert.equal(recorder.cookies.length, 0);
});

test("refresh 权威读取后身份切换先提交时 CAS 失败且不覆盖或写 Cookie", async () => {
  const state = refreshFixture({ afterAuthoritativeRead: "SWITCH" });
  const recorder = responseRecorder();

  await assert.rejects(
    state.service.refresh(state.request(), recorder.response),
    (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );
  assert.equal(state.profileMode, "ACCOUNT");
  assert.equal(recorder.cookies.length, 0);
});

test("refresh 用 hash、USER 类型、未撤销和未过期过滤且非法记录不尝试写入", async () => {
  const cases = [
    { state: refreshFixture(), token: "wrong-refresh" },
    { state: refreshFixture({ recordType: "ADMIN" }), token: "opaque-refresh" },
    { state: refreshFixture({ recordRevoked: true }), token: "opaque-refresh" },
    { state: refreshFixture({ recordExpired: true }), token: "opaque-refresh" }
  ];

  for (const { state, token } of cases) {
    const recorder = responseRecorder();
    await assert.rejects(
      state.service.refresh(state.request(token), recorder.response),
      (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
    );
    assert.equal(state.writeAttempts, 0);
    assert.equal(recorder.cookies.length, 0);
  }
});

test("refresh 遇到畸形百分号 Cookie 返回稳定登录失效错误", async () => {
  const state = refreshFixture();
  const recorder = responseRecorder();
  await assert.rejects(
    state.service.refresh({ headers: { cookie: "xueleai_user_refresh=%E0%A4%A" } }, recorder.response),
    (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );
  assert.equal(recorder.cookies.length, 0);
});

test("refresh 异步 CAS 后按数据库绝对到期重算身份 Cookie 生命周期", async () => {
  const state = refreshFixture({ refreshMaxAge: 3, updateDelayMs: 1_100 });
  const recorder = responseRecorder();
  await state.service.refresh(state.request(), recorder.response);
  const profileCookie = recorder.cookies.find((cookie) => cookie.name === profileContextCookie);
  assert.ok(profileCookie);
  const payload = verifyProfileContextToken(profileCookie.value, process.env.PROFILE_CONTEXT_SECRET!);
  assert.ok(payload);
  assert.ok(payload.expiresAt * 1000 <= state.renewedExpiresAt!.getTime());
  assert.ok((profileCookie.options.maxAge as number) <= 2_000);
});

test("学习账号退出缺少或使用错误切换密码时不撤销会话也不清 Cookie", async () => {
  for (const [dto, message] of [
    [{}, "请输入 6 位切换密码"],
    [{ switchPassword: "000000" }, "切换密码错误"]
  ] as const) {
    const state = refreshFixture();
    const recorder = responseRecorder();

    await assert.rejects(
      state.service.logout(state.request(), recorder.response, dto),
      (error: unknown) => error instanceof AppException && error.message === message
    );
    assert.equal(state.revoked, false);
    assert.deepEqual(recorder.cleared, []);
  }
});

test("学习账号退出验证正确切换密码后撤销会话并清三类 Cookie", async () => {
  const state = refreshFixture();
  const recorder = responseRecorder();

  await state.service.logout(
    state.request(),
    recorder.response,
    { switchPassword: "123456" }
  );

  assert.equal(state.revoked, true);
  assert.deepEqual(
    new Set(recorder.cleared),
    new Set(["xueleai_user_access", "xueleai_user_refresh", profileContextCookie])
  );
});

test("学习账号退出权威读取后身份先切换时拒绝陈旧撤销且不清 Cookie", async () => {
  const state = refreshFixture({ afterAuthoritativeRead: "SWITCH" });
  const recorder = responseRecorder();

  await assert.rejects(
    state.service.logout(
      state.request(),
      recorder.response,
      { switchPassword: "123456" }
    ),
    (error: unknown) =>
      error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );

  assert.equal(state.revoked, false);
  assert.deepEqual(recorder.cleared, []);
});

test("主账号退出不要求切换密码", async () => {
  const state = refreshFixture({ profileMode: "ACCOUNT" });
  const recorder = responseRecorder();

  await state.service.logout(state.request(), recorder.response, {});

  assert.equal(state.revoked, true);
  assert.deepEqual(
    new Set(recorder.cleared),
    new Set(["xueleai_user_access", "xueleai_user_refresh", profileContextCookie])
  );
});

test("requireUserRefreshSession 缺失、畸形或仅 Bearer 时不查询会话并统一拒绝", async () => {
  const state = refreshAuthorityFixture();
  const requests = [
    { headers: {} },
    { headers: { cookie: `${userRefreshCookie}=%E0%A4%A` } },
    { headers: { authorization: "Bearer access-token" } }
  ];

  for (const request of requests) {
    await assert.rejects(
      state.service.requireUserRefreshSession(request, "user-1"),
      (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
    );
  }
  assert.equal(state.queries.length, 0);
});

test("requireUserRefreshSession 的四个 Prisma 权威过滤与 userId 守卫分别拒绝非法会话", async () => {
  const cases = [
    { name: "wrong hash", state: refreshAuthorityFixture(), token: "wrong-refresh-token", userId: "user-1" },
    { name: "ADMIN type", state: refreshAuthorityFixture({ recordType: "ADMIN" }), userId: "user-1" },
    { name: "revoked", state: refreshAuthorityFixture({ recordRevoked: true }), userId: "user-1" },
    { name: "expired", state: refreshAuthorityFixture({ recordExpired: true }), userId: "user-1" },
    { name: "wrong user", state: refreshAuthorityFixture(), userId: "user-other" }
  ];

  for (const { name, state, token, userId } of cases) {
    await assert.rejects(
      state.service.requireUserRefreshSession(state.request(token), userId),
      (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录",
      name
    );
    assert.equal(state.queries.length, 1, name);
  }
});

test("requireUserRefreshSession 有效 Cookie 返回同一 USER 会话并发出精确权威查询", async () => {
  const state = refreshAuthorityFixture();
  const before = Date.now();

  const session = await state.service.requireUserRefreshSession(state.request(), "user-1");
  const after = Date.now();

  assert.deepEqual(session, {
    id: "refresh-authority-1",
    expiresAt: state.expiresAt,
    profileMode: "ACCOUNT",
    profileLearnerId: null
  });
  assert.equal(state.queries.length, 1);
  const query = state.queries[0]!;
  assert.deepEqual(Object.keys(query.where).sort(), ["expiresAt", "revokedAt", "tokenHash", "type"]);
  assert.equal(query.where.tokenHash, state.storedTokenHash);
  assert.equal(query.where.type, "USER");
  assert.equal(query.where.revokedAt, null);
  assert.deepEqual(Object.keys(query.where.expiresAt as Record<string, unknown>), ["gt"]);
  const queriedAt = (query.where.expiresAt as { gt: Date }).gt.getTime();
  assert.ok(queriedAt >= before && queriedAt <= after);
  assert.deepEqual(query.include, { user: true });
});

test("三种用户登录成功入口都会清除旧身份 Cookie", async () => {
  const auth = {
    register: async () => ({}),
    login: async () => ({}),
    loginByPhone: async () => ({})
  };
  const controller = new AuthController(auth as never, {} as never, {} as never);

  for (const invoke of [
    (response: unknown) => controller.register({} as never, response),
    (response: unknown) => controller.login({} as never, response),
    (response: unknown) => controller.phoneLogin({} as never, response)
  ]) {
    const recorder = responseRecorder();
    await invoke(recorder.response);
    assert.equal(recorder.cleared.includes(profileContextCookie), true);
  }
});

test("退出控制器把切换密码交给服务校验且校验失败前不清身份 Cookie", async () => {
  let receivedDto: unknown;
  const controller = new AuthController(
    {
      logout: async (_request: unknown, _response: unknown, dto: unknown) => {
        receivedDto = dto;
        throw new AppException(40003, "切换密码错误", 400);
      }
    } as never,
    {} as never,
    {} as never
  );
  const recorder = responseRecorder();

  await assert.rejects(
    controller.logout({} as never, { switchPassword: "000000" }, recorder.response),
    (error: unknown) => error instanceof AppException && error.message === "切换密码错误"
  );
  assert.deepEqual(receivedDto, { switchPassword: "000000" });
  assert.equal(recorder.cleared.includes(profileContextCookie), false);
});

test("用户登录失败不会清除现有身份 Cookie", async () => {
  const controller = new AuthController(
    {
      login: async () => {
        throw new AppException(40003, "邮箱或密码错误", 400);
      }
    } as never,
    {} as never,
    {} as never
  );
  const recorder = responseRecorder();

  await assert.rejects(controller.login({} as never, recorder.response));
  assert.equal(recorder.cleared.includes(profileContextCookie), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword } from "@xueleai/database";

import { AuthService } from "../src/auth/auth.service.js";
import { AppException } from "../src/common/app-exception.js";
import { profileContextCookie, userRefreshCookie } from "../src/security/cookies.js";
import { ProfileContextService } from "../src/profiles/profile-context.service.js";
import { signProfileContextToken } from "../src/profiles/profile-context-token.js";

const secret = "profile-context-test-secret";
type Mode = "UNSELECTED" | "ACCOUNT" | "LEARNER";
type Learner = {
  id: string;
  userId: string;
  nickname: string;
  grade: string;
  avatarUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
};

function fixture(options: {
  mode?: Mode;
  learnerId?: string | null;
  learners?: Learner[];
  switchPasswordHash?: string | null;
  loginPassword?: string;
  rejectTransition?: boolean;
  inactivateBeforeTransaction?: string;
  invalidateCurrentOnPassword?: boolean;
  switchSessionOnPassword?: boolean;
  reassignBeforeTransaction?: string;
  sessionExpiresInMs?: number;
  transitionDelayMs?: number;
  switchAfterAuthoritativeRead?: boolean;
} = {}) {
  const auth = new AuthService() as AuthService & Record<string, unknown>;
  auth["getRefreshSecret"] = () => "refresh-test-secret";
  const opaqueRefreshToken = "opaque-refresh";
  const tokenHash = (auth["hashToken"] as (value: string) => string).call(auth, opaqueRefreshToken);
  const user = {
    id: "user-1",
    email: "user@example.com",
    phone: null,
    phoneVerifiedAt: null,
    passwordHash: "password-hash",
    passwordLoginEnabled: true,
    learnerSwitchPasswordHash: options.switchPasswordHash ?? null,
    nickname: "测试用户",
    avatarUrl: null,
    status: "ACTIVE",
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const refresh = {
    id: "refresh-1",
    userId: "user-1",
    adminUserId: null,
    tokenHash,
    type: "USER",
    profileMode: options.mode ?? "UNSELECTED",
    profileLearnerId: options.learnerId ?? null,
    expiresAt: new Date(Date.now() + (options.sessionExpiresInMs ?? 10 * 60 * 1000)),
    createdAt: new Date(),
    revokedAt: null
  };
  const learners = (options.learners ?? []).map((learner) => ({ ...learner }));
  let passwordVerifiedWith: string | null = null;
  let transactionOptions: Record<string, unknown> | undefined;
  let transactionActive = false;
  let transactionCommits = 0;
  let transactionRollbacks = 0;
  const transactionClientCalls: string[] = [];

  function matchesRefreshWhere(where: Record<string, unknown>, row = refresh) {
    if (where.id !== undefined && where.id !== row.id) return false;
    if (where.tokenHash !== undefined && where.tokenHash !== row.tokenHash) return false;
    if (where.userId !== undefined && where.userId !== row.userId) return false;
    if (where.type !== undefined && where.type !== row.type) return false;
    if (where.revokedAt === null && row.revokedAt !== null) return false;
    if (where.profileMode !== undefined && where.profileMode !== row.profileMode) return false;
    if ("profileLearnerId" in where && where.profileLearnerId !== row.profileLearnerId) return false;
    const expiry = where.expiresAt as { equals?: Date; gt?: Date } | Date | undefined;
    if (expiry instanceof Date && expiry.getTime() !== row.expiresAt.getTime()) return false;
    if (expiry && !(expiry instanceof Date)) {
      if (expiry.equals && row.expiresAt.getTime() !== expiry.equals.getTime()) return false;
      if (expiry.gt && row.expiresAt <= expiry.gt) return false;
    }
    return true;
  }

  function assertRootClientOutsideTransaction() {
    if (transactionActive) {
      throw new Error("事务回调必须使用 transaction client");
    }
  }

  function findLearner(where: { id: string; userId: string; status?: string }) {
    const learner = learners.find((item) => item.id === where.id && item.userId === where.userId) ?? null;
    return learner && (!where.status || learner.status === where.status) ? learner : null;
  }

  const rootLearner = {
    findFirst: async ({ where }: { where: { id: string; userId: string; status?: string } }) => {
      assertRootClientOutsideTransaction();
      return findLearner(where);
    }
  };

  const rootRefreshToken = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      assertRootClientOutsideTransaction();
      return matchesRefreshWhere(where) ? { ...refresh, user: { ...user } } : null;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      assertRootClientOutsideTransaction();
      if (!matchesRefreshWhere(where)) return { count: 0 };
      if (data.revokedAt) refresh.revokedAt = data.revokedAt as Date;
      if (data.profileMode) refresh.profileMode = data.profileMode as Mode;
      if ("profileLearnerId" in data) refresh.profileLearnerId = data.profileLearnerId as string | null;
      return { count: 1 };
    }
  };

  const prisma: Record<string, unknown> & {
    learner: Record<string, unknown>;
    refreshToken: Record<string, unknown>;
    user: Record<string, unknown>;
  } = {
    learner: rootLearner,
    refreshToken: rootRefreshToken,
    user: {
      findUnique: async () => ({
        id: "user-1",
        learnerSwitchPasswordHash: options.switchPasswordHash ?? null
      })
    },
    $transaction: async (
      callback: (transaction: unknown) => Promise<unknown>,
      requestedOptions?: Record<string, unknown>
    ) => {
      transactionOptions = requestedOptions;
      if (options.inactivateBeforeTransaction) {
        const learner = learners.find((item) => item.id === options.inactivateBeforeTransaction);
        if (learner) learner.status = "INACTIVE";
      }
      if (options.reassignBeforeTransaction) {
        const learner = learners.find((item) => item.id === options.reassignBeforeTransaction);
        if (learner) learner.userId = "user-other";
      }

      const transactionRefresh = { ...refresh };
      let dirty = false;
      const transaction = {
        learner: {
          findFirst: async ({ where }: { where: { id: string; userId: string; status?: string } }) => {
            transactionClientCalls.push("learner.findFirst");
            return findLearner(where);
          }
        },
        refreshToken: {
          findFirst: async ({ where }: { where: Record<string, unknown> }) => {
            transactionClientCalls.push("refreshToken.findFirst");
            if (!matchesRefreshWhere(where, refresh)) return null;
            const snapshot = { ...transactionRefresh };
            if (options.switchAfterAuthoritativeRead) {
              refresh.profileMode = "LEARNER";
              refresh.profileLearnerId = "learner-2";
            }
            return snapshot;
          },
          updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            transactionClientCalls.push("refreshToken.updateMany");
            if (options.transitionDelayMs && data.profileMode) {
              await new Promise((resolve) => setTimeout(resolve, options.transitionDelayMs));
            }
            if (options.rejectTransition || !matchesRefreshWhere(where, refresh)) return { count: 0 };
            dirty = true;
            if (data.revokedAt) transactionRefresh.revokedAt = data.revokedAt as Date;
            if (data.profileMode) transactionRefresh.profileMode = data.profileMode as Mode;
            if ("profileLearnerId" in data) {
              transactionRefresh.profileLearnerId = data.profileLearnerId as string | null;
            }
            return { count: 1 };
          }
        }
      };

      transactionActive = true;
      try {
        const result = await callback(transaction);
        if (dirty) Object.assign(refresh, transactionRefresh);
        transactionCommits += 1;
        return result;
      } catch (error) {
        transactionRollbacks += 1;
        throw error;
      } finally {
        transactionActive = false;
      }
    }
  };
  auth["prisma"] = prisma;
  auth.verifyUserPassword = async (_userId: string, password: string) => {
      passwordVerifiedWith = password;
      if (password !== (options.loginPassword ?? "main-password")) {
        throw new AppException(40003, "登录密码错误", 400);
      }
      if (options.invalidateCurrentOnPassword && refresh.profileLearnerId) {
        const learner = learners.find((item) => item.id === refresh.profileLearnerId);
        if (learner) learner.status = "INACTIVE";
      }
      if (options.switchSessionOnPassword) {
        refresh.profileMode = "ACCOUNT";
        refresh.profileLearnerId = null;
      }
    };
  const service = new ProfileContextService(auth, prisma as never, secret);

  return {
    service,
    request(mode = refresh.profileMode, learnerId = refresh.profileLearnerId, includeProfile = true) {
      const profileToken =
        includeProfile && mode !== "UNSELECTED"
          ? signProfileContextToken(
              { userId: "user-1", refreshTokenId: refresh.id, mode, learnerId },
              secret,
              600
            )
          : null;
      return {
        headers: {
          cookie: [`${userRefreshCookie}=${opaqueRefreshToken}`, profileToken ? `${profileContextCookie}=${profileToken}` : null]
            .filter(Boolean)
            .join("; ")
        }
      };
    },
    get revokedRefreshTokenId() {
      return refresh.revokedAt ? refresh.id : null;
    },
    get passwordVerifiedWith() {
      return passwordVerifiedWith;
    },
    get profileMode() {
      return refresh.profileMode;
    },
    get profileLearnerId() {
      return refresh.profileLearnerId;
    },
    get transactionOptions() {
      return transactionOptions;
    },
    get transactionClientCalls() {
      return [...transactionClientCalls];
    },
    get transactionCommits() {
      return transactionCommits;
    },
    get transactionRollbacks() {
      return transactionRollbacks;
    }
  };
}

const learner1: Learner = {
  id: "learner-1",
  userId: "user-1",
  nickname: "大大",
  grade: "GRADE_1",
  avatarUrl: null,
  status: "ACTIVE"
};
const learner2: Learner = {
  id: "learner-2",
  userId: "user-1",
  nickname: "小小",
  grade: "GRADE_2",
  avatarUrl: null,
  status: "ACTIVE"
};

test("未选择身份时要求先选择", async () => {
  const state = fixture();
  await assert.rejects(
    state.service.requireSelected(state.request(), "user-1"),
    (error: unknown) => error instanceof AppException && error.message === "请先选择使用身份"
  );
});

test("学习采集同时取得可信身份和刷新会话编号", async () => {
  const state = fixture({ mode: "LEARNER", learnerId: "learner-1", learners: [learner1] });
  assert.deepEqual(
    await state.service.requireSelectedSession(state.request(), "user-1"),
    {
      subject: { userId: "user-1", mode: "LEARNER", learnerId: "learner-1" },
      refreshTokenId: "refresh-1"
    }
  );
});

test("未选择身份可免密选择账号或所属有效学习者", async () => {
  const account = fixture();
  assert.deepEqual((await account.service.select(account.request(), "user-1", { mode: "ACCOUNT", learnerId: null })).context, {
    mode: "ACCOUNT",
    learnerId: null,
    learner: null
  });

  const learner = fixture({ learners: [learner1] });
  assert.equal(
    (await learner.service.select(learner.request(), "user-1", { mode: "LEARNER", learnerId: "learner-1" })).context.mode,
    "LEARNER"
  );
});

test("身份变更使用独立事务 client 并请求 Serializable 隔离级别", async () => {
  const state = fixture({ mode: "ACCOUNT", learners: [learner1] });

  const result = await state.service.enterLearner(state.request(), "user-1", { learnerId: "learner-1" });

  assert.equal(result.context.mode, "LEARNER");
  assert.deepEqual(state.transactionOptions, { isolationLevel: "Serializable" });
  assert.deepEqual(state.transactionClientCalls, [
    "refreshToken.findFirst",
    "learner.findFirst",
    "refreshToken.updateMany"
  ]);
  assert.equal(state.transactionCommits, 1);
  assert.equal(state.transactionRollbacks, 0);
});

test("并发身份变更使条件更新失败时不签发新 token", async () => {
  const state = fixture({ rejectTransition: true });
  await assert.rejects(
    state.service.select(state.request(), "user-1", { mode: "ACCOUNT", learnerId: null }),
    (error: unknown) => error instanceof AppException && error.message === "身份状态已失效，请重新登录"
  );
});

test("事务权威读取后其他身份切换先赢时 snapshot CAS 不覆盖新身份", async () => {
  const state = fixture({
    mode: "ACCOUNT",
    learners: [learner1, learner2],
    switchAfterAuthoritativeRead: true
  });
  await assert.rejects(
    state.service.enterLearner(state.request(), "user-1", { learnerId: "learner-1" }),
    (error: unknown) => error instanceof AppException && error.message === "身份状态已失效，请重新登录"
  );
  assert.equal(state.profileMode, "LEARNER");
  assert.equal(state.profileLearnerId, "learner-2");
});

test("仅有 Bearer access token 不能选择或切换身份", async () => {
  const state = fixture();
  await assert.rejects(
    state.service.select({ headers: { authorization: "Bearer access-token" } }, "user-1", { mode: "ACCOUNT", learnerId: null }),
    (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );
});

test("畸形 refresh Cookie 返回稳定登录失效错误", async () => {
  const state = fixture();
  await assert.rejects(
    state.service.select({ headers: { cookie: `${userRefreshCookie}=%E0%A4%A` } }, "user-1", {
      mode: "ACCOUNT",
      learnerId: null
    }),
    (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );
});

test("已停用学习者使原身份上下文失效并撤销刷新会话", async () => {
  const state = fixture({ mode: "LEARNER", learnerId: "learner-1", learners: [{ ...learner1, status: "INACTIVE" }] });
  await assert.rejects(
    state.service.requireSelected(state.request(), "user-1"),
    (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );
  assert.equal(state.revokedRefreshTokenId, "refresh-1");
});

test("已停用学习者即使身份 Cookie 丢失也撤销刷新会话", async () => {
  const state = fixture({ mode: "LEARNER", learnerId: "learner-1", learners: [{ ...learner1, status: "INACTIVE" }] });
  await assert.rejects(
    state.service.requireSelected(state.request("LEARNER", "learner-1", false), "user-1"),
    (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );
  assert.equal(state.revokedRefreshTokenId, "refresh-1");
});

test("学习者之间切换验证共享六位密码并返回公开上下文", async () => {
  const state = fixture({
    mode: "LEARNER",
    learnerId: "learner-1",
    learners: [learner1, learner2],
    switchPasswordHash: await hashPassword("123456")
  });
  const result = await state.service.switchLearner(state.request(), "user-1", {
    learnerId: "learner-2",
    switchPassword: "123456"
  });

  assert.deepEqual(result.context, {
    mode: "LEARNER",
    learnerId: "learner-2",
    learner: { id: "learner-2", nickname: "小小", grade: "GRADE_2", gradeLabel: "二年级", avatarUrl: null }
  });
  assert.equal("token" in result, true);
});

test("账号模式进入所属有效学习者不要求密码", async () => {
  const state = fixture({ mode: "ACCOUNT", learners: [learner1] });
  const result = await state.service.enterLearner(state.request(), "user-1", { learnerId: "learner-1" });
  assert.equal(result.context.mode, "LEARNER");
});

test("目标学习者在前置检查后停用时事务拒绝写入和签发", async () => {
  const state = fixture({ mode: "ACCOUNT", learners: [learner1], inactivateBeforeTransaction: "learner-1" });
  await assert.rejects(
    state.service.enterLearner(state.request(), "user-1", { learnerId: "learner-1" }),
    (error: unknown) => error instanceof AppException && error.message === "学习者不存在或已停用"
  );
  assert.equal(state.profileMode, "ACCOUNT");
  assert.equal(state.profileLearnerId, null);
});

test("目标学习者在事务前转移 owner 时拒绝写入和签发", async () => {
  const state = fixture({ mode: "ACCOUNT", learners: [learner1], reassignBeforeTransaction: "learner-1" });
  await assert.rejects(
    state.service.enterLearner(state.request(), "user-1", { learnerId: "learner-1" }),
    (error: unknown) => error instanceof AppException && error.message === "学习者不存在或已停用"
  );
  assert.equal(state.profileMode, "ACCOUNT");
});

test("身份 CAS 完成后无正安全余量会回滚状态且不签 token", async () => {
  const state = fixture({
    mode: "ACCOUNT",
    learners: [learner1],
    sessionExpiresInMs: 1_500,
    transitionDelayMs: 1_100
  });
  await assert.rejects(
    state.service.enterLearner(state.request(), "user-1", { learnerId: "learner-1" }),
    (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );
  assert.equal(state.profileMode, "ACCOUNT");
  assert.equal(state.profileLearnerId, null);
});

test("公开学习者上下文返回正确的高中年级中文标签", async () => {
  const highSchoolLearner = { ...learner1, grade: "HIGH_1" };
  const state = fixture({ mode: "ACCOUNT", learners: [highSchoolLearner] });
  const result = await state.service.enterLearner(state.request(), "user-1", { learnerId: "learner-1" });
  assert.equal(result.context.learner?.gradeLabel, "高一");
});

test("学习者返回账号只验证主账号登录密码", async () => {
  const state = fixture({ mode: "LEARNER", learnerId: "learner-1", learners: [learner1], loginPassword: "main-password" });
  const result = await state.service.returnToAccount(state.request(), "user-1", { password: "main-password" });
  assert.deepEqual(result.context, { mode: "ACCOUNT", learnerId: null, learner: null });
  assert.equal(state.passwordVerifiedWith, "main-password");
});

test("当前学习者失效时先提交事务撤销再在事务外返回登录失效", async () => {
  const state = fixture({
    mode: "LEARNER",
    learnerId: "learner-1",
    learners: [learner1],
    invalidateCurrentOnPassword: true
  });
  await assert.rejects(
    state.service.returnToAccount(state.request(), "user-1", { password: "main-password" }),
    (error: unknown) => error instanceof AppException && error.message === "登录状态已失效，请重新登录"
  );
  assert.equal(state.revokedRefreshTokenId, "refresh-1");
  assert.equal(state.profileMode, "LEARNER");
  assert.equal(state.transactionCommits, 1);
  assert.equal(state.transactionRollbacks, 0);
});

test("主密码验证期间刷新会话已切换时 CAS 失败且不覆盖新身份", async () => {
  const state = fixture({
    mode: "LEARNER",
    learnerId: "learner-1",
    learners: [learner1],
    switchSessionOnPassword: true
  });
  await assert.rejects(
    state.service.returnToAccount(state.request(), "user-1", { password: "main-password" }),
    (error: unknown) => error instanceof AppException && error.message === "身份状态已失效，请重新登录"
  );
  assert.equal(state.profileMode, "ACCOUNT");
  assert.equal(state.profileLearnerId, null);
});

test("共享密码失败时不签发新 token", async () => {
  const state = fixture({
    mode: "LEARNER",
    learnerId: "learner-1",
    learners: [learner1, learner2],
    switchPasswordHash: await hashPassword("123456")
  });
  await assert.rejects(
    state.service.switchLearner(state.request(), "user-1", { learnerId: "learner-2", switchPassword: "654321" }),
    (error: unknown) => error instanceof AppException && error.message === "切换密码错误"
  );
});

test("已选身份 Cookie 被删除后拒绝访问且不能免密重新选择", async () => {
  const state = fixture({ mode: "ACCOUNT" });
  const request = state.request("ACCOUNT", null, false);
  await assert.rejects(
    state.service.requireSelected(request, "user-1"),
    (error: unknown) => error instanceof AppException && error.message === "身份状态已失效，请重新登录"
  );
  await assert.rejects(
    state.service.select(request, "user-1", { mode: "ACCOUNT", learnerId: null }),
    (error: unknown) => error instanceof AppException && error.message === "身份状态已失效，请重新登录"
  );
});

test("Cookie 与刷新会话身份或会话 id 不一致时拒绝访问", async () => {
  const state = fixture({ mode: "ACCOUNT" });
  const mismatchedMode = state.request("LEARNER", "learner-1");
  const wrongSessionToken = signProfileContextToken(
    { userId: "user-1", refreshTokenId: "refresh-other", mode: "ACCOUNT", learnerId: null },
    secret,
    600
  );
  const mismatchedSession = { headers: { cookie: `${userRefreshCookie}=opaque-refresh; ${profileContextCookie}=${wrongSessionToken}` } };

  for (const request of [mismatchedMode, mismatchedSession]) {
    await assert.rejects(
      state.service.requireSelected(request, "user-1"),
      (error: unknown) => error instanceof AppException && error.message === "身份状态已失效，请重新登录"
    );
  }
});

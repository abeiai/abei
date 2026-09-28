import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword } from "@xueleai/database";

import { AuthService } from "../src/auth/auth.service.js";
import { AppException } from "../src/common/app-exception.js";
import { profileContextCookie } from "../src/security/cookies.js";
import { verifyJwt } from "../src/security/jwt.js";
import { verifyProfileContextToken } from "../src/profiles/profile-context-token.js";

process.env.PROFILE_CONTEXT_SECRET = "learner-login-profile-secret";
process.env.JWT_ACCESS_SECRET = "learner-login-access-secret";
process.env.JWT_REFRESH_SECRET = "learner-login-refresh-secret";

type LoginAsLearner = (
  dto: { accountId: string; learnerId: string; switchPassword: string },
  response: ReturnType<typeof responseRecorder>["response"]
) => Promise<Record<string, unknown>>;

function responseRecorder() {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  return {
    response: {
      cookie(name: string, value: string, options: Record<string, unknown>) {
        cookies.push({ name, value, options });
      },
      clearCookie() {}
    },
    cookies
  };
}

async function learnerLoginFixture(options: {
  accountId?: number;
  learnerId?: number;
  learnerStatus?: "ACTIVE" | "INACTIVE";
  password?: string;
  userStatus?: "ACTIVE" | "DISABLED";
} = {}) {
  const service = new AuthService() as AuthService & Record<string, unknown>;
  const passwordHash = await hashPassword(options.password ?? "123456");
  const learner = {
    id: "learner-internal-1",
    userId: "user-1",
    accountNumber: options.learnerId ?? 100,
    nickname: "小明",
    grade: "GRADE_2",
    avatarUrl: null,
    status: options.learnerStatus ?? "ACTIVE",
    deactivatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const user = {
    id: "user-1",
    accountNumber: options.accountId ?? 10000,
    nextLearnerNumber: 101,
    email: "owner@example.com",
    phone: null,
    phoneVerifiedAt: null,
    passwordHash: "main-password-hash",
    passwordLoginEnabled: true,
    learnerSwitchPasswordHash: passwordHash,
    nickname: "主账号",
    avatarUrl: null,
    status: options.userStatus ?? "ACTIVE",
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    learners: [learner]
  };
  let refreshCreateData: Record<string, unknown> | null = null;
  service["prisma"] = {
    user: {
      findUnique: async ({
        include,
        where
      }: {
        include?: { learners: { where: { accountNumber: number } } };
        where: { accountNumber?: number; id?: string };
      }) =>
        where.id === user.id
          ? { ...user }
          : where.accountNumber === user.accountNumber && include
          ? {
              ...user,
              learners:
                include.learners.where.accountNumber === learner.accountNumber
                  ? [{ ...learner }]
                  : []
            }
          : null,
      update: async () => ({ ...user, lastLoginAt: new Date() })
    },
    refreshToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        refreshCreateData = data;
        return { id: "refresh-learner-1", ...data };
      }
    }
  };

  return {
    service,
    get refreshCreateData() {
      return refreshCreateData;
    }
  };
}

test("主账号 ID、子账号 ID 和切换密码正确时直接创建学习者身份会话", async () => {
  const fixture = await learnerLoginFixture();
  const recorder = responseRecorder();
  const login = fixture.service["loginAsLearner"] as LoginAsLearner;

  const result = await login.call(
    fixture.service,
    { accountId: "10000", learnerId: "100", switchPassword: "123456" },
    recorder.response
  );

  assert.equal((result.user as { accountId: string }).accountId, "10000");
  assert.deepEqual(
    result.user,
    {
      id: "user-1",
      accountId: "10000",
      email: "",
      phone: null,
      phoneVerifiedAt: null,
      nickname: "我的账号",
      avatarUrl: null,
      status: "ACTIVE",
      hasLoginPassword: true
    }
  );
  const accessPayload = verifyJwt(
    result.accessToken as string,
    process.env.JWT_ACCESS_SECRET!
  ) as { email?: string; sessionScope?: string } | null;
  assert.equal(accessPayload?.email, "learner@session.xueleai.local");
  assert.equal(accessPayload?.sessionScope, "LEARNER");
  const me = await fixture.service.me({
    headers: { authorization: `Bearer ${String(result.accessToken)}` }
  });
  assert.equal(me.email, "");
  assert.equal(me.phone, null);
  assert.equal(me.nickname, "我的账号");
  assert.equal(fixture.refreshCreateData?.profileMode, "LEARNER");
  assert.equal(fixture.refreshCreateData?.profileLearnerId, "learner-internal-1");
  const profileCookie = recorder.cookies.find((cookie) => cookie.name === profileContextCookie);
  assert.ok(profileCookie);
  const profile = verifyProfileContextToken(
    profileCookie.value,
    process.env.PROFILE_CONTEXT_SECRET!
  );
  assert.equal(profile?.mode, "LEARNER");
  assert.equal(profile?.learnerId, "learner-internal-1");
});

test("学习账号登录对不存在账号、停用账号和错误密码返回相同中文错误且不创建会话", async () => {
  const cases = [
    { fixture: await learnerLoginFixture(), dto: { accountId: "99999", learnerId: "100", switchPassword: "123456" } },
    { fixture: await learnerLoginFixture(), dto: { accountId: "10000", learnerId: "101", switchPassword: "123456" } },
    { fixture: await learnerLoginFixture({ learnerStatus: "INACTIVE" }), dto: { accountId: "10000", learnerId: "100", switchPassword: "123456" } },
    { fixture: await learnerLoginFixture({ userStatus: "DISABLED" }), dto: { accountId: "10000", learnerId: "100", switchPassword: "123456" } },
    { fixture: await learnerLoginFixture(), dto: { accountId: "10000", learnerId: "100", switchPassword: "000000" } }
  ];

  for (const { fixture, dto } of cases) {
    const recorder = responseRecorder();
    const login = fixture.service["loginAsLearner"] as LoginAsLearner;
    await assert.rejects(
      login.call(fixture.service, dto, recorder.response),
      (error: unknown) =>
        error instanceof AppException &&
        error.message === "主账号 ID、子账号 ID 或切换密码错误"
    );
    assert.equal(fixture.refreshCreateData, null);
    assert.deepEqual(recorder.cookies, []);
  }
});

test("超出 PostgreSQL INTEGER 范围的主账号 ID 在查询数据库前返回统一凭据错误", async () => {
  const fixture = await learnerLoginFixture();
  let queried = false;
  (fixture.service as AuthService & { prisma: { user: { findUnique: () => Promise<never> } } })["prisma"].user.findUnique = async () => {
    queried = true;
    throw new Error("Prisma integer out of range");
  };

  await assert.rejects(
    (fixture.service["loginAsLearner"] as LoginAsLearner).call(
      fixture.service,
      { accountId: "9999999999", learnerId: "100", switchPassword: "123456" },
      responseRecorder().response
    ),
    (error: unknown) =>
      error instanceof AppException && error.message === "主账号 ID、子账号 ID 或切换密码错误"
  );
  assert.equal(queried, false);
});

test("身份转换会立即换发与目标身份一致的 access token", async () => {
  const fixture = await learnerLoginFixture();
  const learnerRecorder = responseRecorder();

  await fixture.service.setProfileAccessCookie(
    "user-1",
    "LEARNER",
    learnerRecorder.response
  );
  const learnerAccess = learnerRecorder.cookies.find(
    (cookie) => cookie.name === "xueleai_user_access"
  );
  assert.ok(learnerAccess);
  assert.equal(
    verifyJwt(learnerAccess.value, process.env.JWT_ACCESS_SECRET!)?.sessionScope,
    "LEARNER"
  );
  assert.equal(
    verifyJwt(learnerAccess.value, process.env.JWT_ACCESS_SECRET!)?.email,
    "learner@session.xueleai.local"
  );

  const accountRecorder = responseRecorder();
  await fixture.service.setProfileAccessCookie(
    "user-1",
    "ACCOUNT",
    accountRecorder.response
  );
  const accountAccess = accountRecorder.cookies.find(
    (cookie) => cookie.name === "xueleai_user_access"
  );
  assert.ok(accountAccess);
  assert.equal(
    verifyJwt(accountAccess.value, process.env.JWT_ACCESS_SECRET!)?.sessionScope,
    undefined
  );
  assert.equal(
    verifyJwt(accountAccess.value, process.env.JWT_ACCESS_SECRET!)?.email,
    "owner@example.com"
  );
});

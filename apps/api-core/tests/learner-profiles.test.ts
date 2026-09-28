import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { verifyPassword } from "@xueleai/database";

import { AuthService } from "../src/auth/auth.service.js";
import { AppException } from "../src/common/app-exception.js";
import { MediaService } from "../src/media/media.service.js";
import { LearnerAccessService } from "../src/profiles/learner-access.service.js";
import { learnerGradeOptions } from "../src/profiles/learner-grade.js";
import { LearnerProfilesService } from "../src/profiles/learner-profiles.service.js";
import { ProfileContextService } from "../src/profiles/profile-context.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";

test("学段选项固定为十四项且大学阶段标签不回退为旧文案", () => {
  assert.deepEqual(learnerGradeOptions, [
    { value: "PRESCHOOL", label: "学龄前" },
    { value: "GRADE_1", label: "一年级" },
    { value: "GRADE_2", label: "二年级" },
    { value: "GRADE_3", label: "三年级" },
    { value: "GRADE_4", label: "四年级" },
    { value: "GRADE_5", label: "五年级" },
    { value: "GRADE_6", label: "六年级" },
    { value: "GRADE_7", label: "七年级" },
    { value: "GRADE_8", label: "八年级" },
    { value: "GRADE_9", label: "九年级" },
    { value: "HIGH_1", label: "高一" },
    { value: "HIGH_2", label: "高二" },
    { value: "HIGH_3", label: "高三" },
    { value: "UNIVERSITY_OR_WORK", label: "大学和工作" }
  ]);
});

type LearnerRow = {
  id: string;
  userId: string;
  accountNumber?: number;
  nickname: string;
  grade: string;
  avatarUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function learnerFixture(options: {
  freeLearnerLimit?: number;
  membershipLearnerLimit?: number;
  nextLearnerNumber?: number;
  passwordLoginEnabled?: boolean;
  learners?: LearnerRow[];
} = {}) {
  const now = new Date("2026-08-13T08:00:00Z");
  const user = {
    id: "user-1",
    accountNumber: 10000,
    nextLearnerNumber: options.nextLearnerNumber ?? 100,
    email: "owner@example.com",
    phone: null,
    phoneVerifiedAt: null,
    passwordHash: "login-password-hash",
    passwordLoginEnabled: options.passwordLoginEnabled ?? true,
    learnerSwitchPasswordHash: null as string | null,
    nickname: "主账号",
    avatarUrl: null,
    status: "ACTIVE",
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now
  };
  const learners = (options.learners ?? []).map((learner) => ({ ...learner }));
  const scenarioAuthorizations = new Set<string>();
  const courseAuthorizations = new Set<string>();
  const refreshTokens = [
    {
      id: "refresh-current",
      userId: "user-1",
      adminUserId: null,
      tokenHash: "hash",
      type: "USER",
      profileMode: "LEARNER",
      profileLearnerId: learners[0]?.id ?? null,
      expiresAt: new Date("2026-08-14T08:00:00Z"),
      createdAt: now,
      revokedAt: null as Date | null
    }
  ];
  let transactionIsolation: string | undefined;
  let transactions = Promise.resolve();

  const learnerDelegate = {
    count: async ({ where }: { where: { userId: string; status?: string } }) =>
      learners.filter((learner) => learner.userId === where.userId && (!where.status || learner.status === where.status)).length,
    create: async ({ data }: { data: Omit<LearnerRow, "id" | "status" | "deactivatedAt" | "createdAt" | "updatedAt"> }) => {
      const learner: LearnerRow = {
        id: `learner-${learners.length + 1}`,
        ...data,
        status: "ACTIVE",
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now
      };
      learners.push(learner);
      return { ...learner };
    },
    findFirst: async ({ where }: { where: { id?: string; userId?: string; status?: string } }) =>
      learners.find(
        (learner) =>
          (!where.id || learner.id === where.id) &&
          (!where.userId || learner.userId === where.userId) &&
          (!where.status || learner.status === where.status)
      ) ?? null,
    findMany: async ({ where }: { where: { userId: string; status?: string } }) =>
      learners.filter(
        (learner) => learner.userId === where.userId && (!where.status || learner.status === where.status)
      ),
    update: async ({ where, data }: { where: { id: string }; data: Partial<LearnerRow> }) => {
      const learner = learners.find((item) => item.id === where.id);
      if (!learner) throw new Error("missing learner");
      Object.assign(learner, data, { updatedAt: now });
      return { ...learner };
    },
    updateMany: async ({ where, data }: { where: { id: string; userId: string; status?: string }; data: Partial<LearnerRow> }) => {
      const learner = learners.find(
        (item) =>
          item.id === where.id && item.userId === where.userId && (!where.status || item.status === where.status)
      );
      if (!learner) return { count: 0 };
      Object.assign(learner, data, { updatedAt: now });
      return { count: 1 };
    }
  };
  const prisma = {
    membershipPeriod: { findFirst: async () => options.membershipLearnerLimit === undefined ? null : ({ learnerLimit: options.membershipLearnerLimit }) },
    systemConfig: { findUnique: async () => ({ value: String(options.freeLearnerLimit ?? 999) }) },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === user.id ? { ...user } : null),
      update: async ({ where, data }: { where: { id: string }; data: Partial<typeof user> & { nextLearnerNumber?: { increment: number } } }) => {
        if (where.id !== user.id) throw new Error("missing user");
        const { nextLearnerNumber, ...plainData } = data;
        Object.assign(user, plainData);
        if (typeof nextLearnerNumber === "object") {
          if (user.nextLearnerNumber + nextLearnerNumber.increment > 1000) {
            throw new Error("users_nextLearnerNumber_range_check");
          }
          user.nextLearnerNumber += nextLearnerNumber.increment;
        } else if (typeof nextLearnerNumber === "number") {
          user.nextLearnerNumber = nextLearnerNumber;
        }
        return { ...user };
      },
      updateMany: async ({
        data,
        where
      }: {
        data: { nextLearnerNumber: { increment: number } };
        where: { id: string; nextLearnerNumber: { lte: number } };
      }) => {
        if (where.id !== user.id || user.nextLearnerNumber > where.nextLearnerNumber.lte) {
          return { count: 0 };
        }
        user.nextLearnerNumber += data.nextLearnerNumber.increment;
        return { count: 1 };
      }
    },
    learner: learnerDelegate,
    learnerScenarioAuthorization: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }: { data: Array<{ learnerId: string; scenarioId: string }> }) => {
        data.forEach((item) => scenarioAuthorizations.add(`${item.learnerId}:${item.scenarioId}`));
        return { count: data.length };
      }
    },
    learnerCourseAuthorization: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }: { data: Array<{ learnerId: string; courseId: string }> }) => {
        data.forEach((item) => courseAuthorizations.add(`${item.learnerId}:${item.courseId}`));
        return { count: data.length };
      }
    },
    aiScenario: { findMany: async () => [] },
    course: { findMany: async () => [] },
    refreshToken: {
      updateMany: async ({ where, data }: { where: { profileLearnerId: string }; data: { revokedAt: Date } }) => {
        let count = 0;
        for (const token of refreshTokens) {
          if (token.profileLearnerId === where.profileLearnerId && token.revokedAt === null) {
            token.revokedAt = data.revokedAt;
            count += 1;
          }
        }
        return { count };
      }
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>, settings?: { isolationLevel?: string }) => {
      transactionIsolation = settings?.isolationLevel;
      const next = transactions.then(() => callback(prisma));
      transactions = next.then(() => undefined, () => undefined);
      return next;
    }
  };
  const authService = {
    verifyUserPassword: async (_userId: string, password: string) => {
      if (password !== "main-password") {
        throw new AppException(40003, "登录密码错误", 400);
      }
    }
  };
  const accessService = {
    replaceAuthorizationsInTransaction: async (
      transaction: typeof prisma,
      userId: string,
      learnerId: string,
      input: { scenarioIds: string[]; courseIds: string[] }
    ) => {
      assert.equal(transaction, prisma);
      assert.equal(userId, "user-1");
      await transaction.learnerScenarioAuthorization.createMany({
        data: input.scenarioIds.map((scenarioId) => ({ learnerId, scenarioId }))
      });
      await transaction.learnerCourseAuthorization.createMany({
        data: input.courseIds.map((courseId) => ({ learnerId, courseId }))
      });
    }
  };

  return {
    service: new LearnerProfilesService(authService as never, accessService as never, prisma as never),
    user,
    learners,
    scenarioAuthorizations,
    courseAuthorizations,
    refreshTokens,
    transactionIsolation: () => transactionIsolation
  };
}

function activeLearner(id: string, userId = "user-1"): LearnerRow {
  const now = new Date("2026-08-13T08:00:00Z");
  return {
    id,
    userId,
    nickname: "小明",
    grade: "GRADE_2",
    avatarUrl: null,
    status: "ACTIVE",
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

test("首个学习者在账号没有登录密码能力时拒绝创建", async () => {
  const { service } = learnerFixture({ passwordLoginEnabled: false });

  await assert.rejects(
    service.create("user-1", {
      nickname: "小明",
      grade: "GRADE_2",
      switchPassword: "123456",
      scenarioIds: [],
      courseIds: []
    }),
    (error: AppException) => error.message === "请先设置主账号登录密码"
  );
});

test("首个学习者缺少或使用非六位数字切换密码时拒绝创建", async () => {
  const first = learnerFixture().service;
  const second = learnerFixture().service;

  await assert.rejects(
    first.create("user-1", { nickname: "小明", grade: "GRADE_2" }),
    (error: AppException) => error.message === "请设置 6 位数字切换密码"
  );
  await assert.rejects(
    second.create("user-1", { nickname: "小明", grade: "GRADE_2", switchPassword: "12a456" }),
    (error: AppException) => error.message === "切换密码必须为 6 位数字"
  );
});

test("首个学习者在用户行原子分配编号并以 ReadCommitted 事务保存密码", async () => {
  const fixture = learnerFixture();

  const learner = await fixture.service.create("user-1", {
    nickname: "  小明  ",
    grade: "GRADE_2",
    switchPassword: "123456",
    scenarioIds: [],
    courseIds: []
  });

  assert.equal(learner.nickname, "小明");
  assert.equal(learner.accountId, "100");
  assert.equal(fixture.transactionIsolation(), "ReadCommitted");
  assert.equal(await verifyPassword("123456", fixture.user.learnerSwitchPasswordHash ?? ""), true);
});

test("同一主账号的学习账号从 100 依次编号且达到 999 后拒绝继续创建", async () => {
  const fixture = learnerFixture();
  const first = await fixture.service.create("user-1", {
    nickname: "大宝",
    grade: "GRADE_2",
    switchPassword: "123456"
  });
  const second = await fixture.service.create("user-1", {
    nickname: "二宝",
    grade: "GRADE_1"
  });

  assert.deepEqual([first.accountId, second.accountId], ["100", "101"]);
  assert.equal(fixture.user.nextLearnerNumber, 102);

  const full = learnerFixture({ nextLearnerNumber: 1000 });
  await assert.rejects(
    full.service.create("user-1", { nickname: "超额账号", grade: "GRADE_1", switchPassword: "123456" }),
    (error: unknown) => error instanceof AppException && error.message === "学习账号数量已达上限"
  );
  assert.equal(full.user.nextLearnerNumber, 1000);
});

test("首个学习者的空白授权 ID 在任何档案或密码写入前拒绝", async () => {
  const fixture = learnerFixture();

  await assert.rejects(
    fixture.service.create("user-1", {
      nickname: "小明",
      grade: "GRADE_2",
      switchPassword: "123456",
      scenarioIds: ["   "],
      courseIds: []
    }),
    (error: AppException) => error.message === "授权项不能为空"
  );
  assert.equal(fixture.learners.length, 0);
  assert.equal(fixture.user.learnerSwitchPasswordHash, null);
});

test("空白或超长昵称和非法学段不能绕过服务层校验", async () => {
  for (const input of [
    { nickname: "   ", grade: "GRADE_2", switchPassword: "123456" },
    { nickname: "甲".repeat(31), grade: "GRADE_2", switchPassword: "123456" },
    { nickname: "小明", grade: "GRADE_15", switchPassword: "123456" }
  ]) {
    await assert.rejects(
      learnerFixture().service.create("user-1", input as never),
      (error: AppException) => error.message === (input.grade === "GRADE_15" ? "学段不正确" : "昵称长度必须为 1 到 30 个字符")
    );
  }
});

test("后续学习者无需切换密码且不能覆盖现有共享密码", async () => {
  const fixture = learnerFixture({ learners: [activeLearner("learner-1")] });
  fixture.user.learnerSwitchPasswordHash = "existing-hash";

  const learner = await fixture.service.create("user-1", { nickname: "小红", grade: "GRADE_3" });

  assert.equal(learner.nickname, "小红");
  assert.equal(fixture.user.learnerSwitchPasswordHash, "existing-hash");
  await assert.rejects(
    fixture.service.create("user-1", {
      nickname: "小刚",
      grade: "GRADE_4",
      switchPassword: "654321"
    }),
    (error: AppException) => error.message === "已有学习者时不能设置切换密码"
  );
});

test("跨用户不能更新或写入头像并返回友好中文拒绝", async () => {
  const fixture = learnerFixture({ learners: [activeLearner("learner-other", "user-other")] });

  await assert.rejects(
    fixture.service.update("user-1", "learner-other", { nickname: "越权修改" }),
    (error: AppException) => error.message === "学习者不存在或无权操作"
  );
  await assert.rejects(
    fixture.service.updateAvatar("user-1", "learner-other", "https://cdn.example/avatar.png"),
    (error: AppException) => error.message === "学习者不存在或无权操作"
  );
});

test("列表状态过滤不能把非法枚举值传给数据库", async () => {
  const fixture = learnerFixture({ learners: [activeLearner("learner-1")] });

  await assert.rejects(
    fixture.service.list("user-1", "DELETED" as never),
    (error: AppException) => error.message === "学习者状态不正确"
  );
});

test("停用会原子撤销使用该学习者的刷新会话但保留授权并可恢复", async () => {
  const fixture = learnerFixture({ learners: [activeLearner("learner-1")] });
  fixture.scenarioAuthorizations.add("learner-1:scenario-1");
  fixture.courseAuthorizations.add("learner-1:course-1");

  const inactive = await fixture.service.deactivate("user-1", "learner-1");
  assert.equal(inactive.status, "INACTIVE");
  assert.ok(inactive.deactivatedAt instanceof Date);
  assert.ok(fixture.refreshTokens[0]?.revokedAt instanceof Date);
  assert.deepEqual([...fixture.scenarioAuthorizations], ["learner-1:scenario-1"]);
  assert.deepEqual([...fixture.courseAuthorizations], ["learner-1:course-1"]);

  const restored = await fixture.service.restore("user-1", "learner-1");
  assert.equal(restored.status, "ACTIVE");
  assert.equal(restored.deactivatedAt, null);
  assert.deepEqual([...fixture.scenarioAuthorizations], ["learner-1:scenario-1"]);
  assert.deepEqual([...fixture.courseAuthorizations], ["learner-1:course-1"]);
});

test("修改共享切换密码只接受主账号登录密码且保存六位数字哈希", async () => {
  const fixture = learnerFixture({ learners: [activeLearner("learner-1")] });

  await assert.rejects(
    fixture.service.updateSwitchPassword("user-1", { currentPassword: "wrong", switchPassword: "654321" }),
    (error: AppException) => error.message === "登录密码错误"
  );
  await fixture.service.updateSwitchPassword("user-1", {
    currentPassword: "main-password",
    switchPassword: "654321"
  });

  assert.equal(await verifyPassword("654321", fixture.user.learnerSwitchPasswordHash ?? ""), true);
});

function controllerFixture(options: {
  accountAllowed?: boolean;
  learnerAllowed?: boolean;
  ownerAllowed?: boolean;
  avatarUpdateError?: Error;
  avatarCleanupError?: Error;
} = {}) {
  const request = { headers: { cookie: "xueleai_user_refresh=opaque" } };
  const cookies: Array<{ name: string; value: string; settings: Record<string, unknown> }> = [];
  const response = {
    cookie(name: string, value: string, settings: Record<string, unknown>) {
      cookies.push({ name, value, settings });
    },
    clearCookie() {}
  };
  const user = {
    id: "user-1",
    email: "owner@example.com",
    phone: null,
    phoneVerifiedAt: null,
    nickname: "主账号",
    avatarUrl: null,
    status: "ACTIVE",
    hasLoginPassword: true
  };
  let selectedMethod: string | null = null;
  let uploaded = false;
  let updatedAvatarUrl: string | null = null;
  const profileUpdates: Array<{ userId: string; learnerId: string; dto: unknown }> = [];
  const avatarUpdates: Array<{ userId: string; learnerId: string; avatarUrl: string }> = [];
  const cleanedAvatarAssets: Array<{ userId: string; assetId: string }> = [];
  const accessScopes: Array<"ACCOUNT" | "LEARNER"> = [];
  let createdLearners = 0;
  const transition = {
    token: "signed-profile-token",
    maxAgeSeconds: 600,
    context: {
      mode: "LEARNER" as const,
      learnerId: "learner-1",
      learner: {
        id: "learner-1",
        nickname: "小明",
        grade: "GRADE_2",
        gradeLabel: "二年级",
        avatarUrl: null
      }
    }
  };
  const authService = {
    me: async () => user,
    setProfileAccessCookie: async (
      _userId: string,
      mode: "ACCOUNT" | "LEARNER",
      target: typeof response
    ) => {
      accessScopes.push(mode);
      target.cookie("xueleai_user_access", `${mode.toLowerCase()}-access-token`, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 900_000
      });
    }
  };
  const contextService = {
    requireAccount: async () => {
      if (options.accountAllowed === false) {
        throw new AppException(40301, "请切换到主账号身份后操作", 403);
      }
      return { userId: user.id, mode: "ACCOUNT", learnerId: null };
    },
    requireSelected: async () => options.learnerAllowed === false
      ? { userId: user.id, mode: "ACCOUNT", learnerId: null }
      : { userId: user.id, mode: "LEARNER", learnerId: "learner-1" },
    select: async () => {
      selectedMethod = "select";
      return transition;
    },
    enterLearner: async () => {
      selectedMethod = "enterLearner";
      return transition;
    },
    switchLearner: async () => {
      selectedMethod = "switchLearner";
      return transition;
    },
    returnToAccount: async () => {
      selectedMethod = "returnToAccount";
      return {
        token: "account-token",
        maxAgeSeconds: 600,
        context: { mode: "ACCOUNT" as const, learnerId: null, learner: null }
      };
    }
  };
  const learnersService = {
    selection: async () => ({
      account: { id: user.id, label: "我的账号", nickname: user.nickname, avatarUrl: null, hasLoginPassword: true },
      learners: []
    }),
    list: async () => [],
    create: async () => {
      createdLearners += 1;
      return { id: "learner-new" };
    },
    update: async (userId: string, learnerId: string, dto: unknown) => {
      profileUpdates.push({ userId, learnerId, dto });
      return { id: learnerId, nickname: "新昵称" };
    },
    deactivate: async () => ({ id: "learner-1", status: "INACTIVE" }),
    restore: async () => ({ id: "learner-1", status: "ACTIVE" }),
    updateSwitchPassword: async () => ({}),
    assertOwned: async () => {
      if (options.ownerAllowed === false) {
        throw new AppException(40401, "学习者不存在或无权操作", 404);
      }
      return { id: "learner-1" };
    },
    updateAvatar: async (_userId: string, _learnerId: string, avatarUrl: string) => {
      if (options.avatarUpdateError) {
        throw options.avatarUpdateError;
      }
      avatarUpdates.push({ userId: _userId, learnerId: _learnerId, avatarUrl });
      updatedAvatarUrl = avatarUrl;
      return { id: "learner-1", avatarUrl };
    }
  };
  const accessService = {
    listAuthorizationOptions: async () => ({ scenarios: [], courses: [] }),
    getAuthorizations: async () => ({ scenarioIds: [], courseIds: [] }),
    replaceAuthorizations: async () => ({ scenarioIds: [], courseIds: [] }),
    listAuthorizedHome: async () => ({ scenarios: [], courses: [], recentRecords: [] }),
    listLearningStatistics: async () => ({
      completedActivityCount: 4,
      recentCompletedActivityCount: 2,
      lastActivityAt: "2026-08-14T11:30:00.000Z"
    })
  };
  const mediaService = {
    uploadLearnerAvatar: async () => {
      uploaded = true;
      return { id: "asset-new", url: "https://cdn.example/learner-avatar.png" };
    },
    cleanupLearnerAvatar: async (userId: string, assetId: string) => {
      cleanedAvatarAssets.push({ userId, assetId });
      if (options.avatarCleanupError) {
        throw options.avatarCleanupError;
      }
      return { deleted: true };
    }
  };

  return {
    controller: new ProfilesController(
      authService as never,
      contextService as never,
      learnersService as never,
      accessService as never,
      mediaService as never
    ),
    request,
    response,
    cookies,
    selectedMethod: () => selectedMethod,
    uploaded: () => uploaded,
    updatedAvatarUrl: () => updatedAvatarUrl,
    profileUpdates,
    avatarUpdates,
    cleanedAvatarAssets,
    accessScopes,
    createdLearners: () => createdLearners
  };
}

test("HTTP ValidationPipe 会实例化 DTO 并在无效请求到达档案写入前返回中文错误", async () => {
  let mutations = 0;
  let authorizationMutations = 0;
  execFileSync("pnpm", ["build"], { cwd: process.cwd(), stdio: "pipe" });
  const [controllerModule, authModule, contextModule, learnerModule, accessModule, mediaModule, filterModule, validationModule] =
    await Promise.all([
      import("../dist/profiles/profiles.controller.js"),
      import("../dist/auth/auth.service.js"),
      import("../dist/profiles/profile-context.service.js"),
      import("../dist/profiles/learner-profiles.service.js"),
      import("../dist/profiles/learner-access.service.js"),
      import("../dist/media/media.service.js"),
      import("../dist/common/http-exception.filter.js"),
      import("../dist/common/validation.js")
    ]);
  const CompiledProfilesController = controllerModule.ProfilesController as typeof ProfilesController;
  const CompiledAuthService = authModule.AuthService as typeof AuthService;
  const CompiledProfileContextService = contextModule.ProfileContextService as typeof ProfileContextService;
  const CompiledLearnerProfilesService = learnerModule.LearnerProfilesService as typeof LearnerProfilesService;
  const CompiledLearnerAccessService = accessModule.LearnerAccessService as typeof LearnerAccessService;
  const CompiledMediaService = mediaModule.MediaService as typeof MediaService;

  @Module({
    controllers: [CompiledProfilesController],
    providers: [
      {
        provide: CompiledAuthService,
        useValue: {
          me: async () => ({
            id: "user-1",
            nickname: "主账号",
            avatarUrl: null,
            hasLoginPassword: true
          })
        }
      },
      {
        provide: CompiledProfileContextService,
        useValue: { requireAccount: async () => ({ userId: "user-1", mode: "ACCOUNT", learnerId: null }) }
      },
      {
        provide: CompiledLearnerProfilesService,
        useValue: {
          create: async () => {
            mutations += 1;
            return { id: "learner-invalid" };
          }
        }
      },
      {
        provide: CompiledLearnerAccessService,
        useValue: {
          replaceAuthorizations: async () => {
            authorizationMutations += 1;
            return { scenarioIds: [], courseIds: [] };
          }
        }
      },
      { provide: CompiledMediaService, useValue: {} }
    ]
  })
  class ProfilesValidationTestModule {}

  const app = await NestFactory.create(ProfilesValidationTestModule, { logger: false });
  app.useGlobalFilters(new filterModule.HttpExceptionFilter());
  app.useGlobalPipes(validationModule.createValidationPipe());
  await app.listen(0, "127.0.0.1");

  try {
    const response = await fetch(`${await app.getUrl()}/profiles/learners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "小明", grade: "NOT_A_GRADE", switchPassword: "123456" })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(payload, { code: 40001, message: "请求参数错误", data: null });
    assert.equal(mutations, 0);

    const authorizationResponse = await fetch(`${await app.getUrl()}/profiles/learners/learner-1/authorizations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioIds: ["   "], courseIds: [] })
    });
    const authorizationPayload = await authorizationResponse.json();

    assert.equal(authorizationResponse.status, 400);
    assert.deepEqual(authorizationPayload, { code: 40001, message: "请求参数错误", data: null });
    assert.equal(authorizationMutations, 0);
  } finally {
    await app.close();
  }
});

test("首次选择把内部 token 只写入 HttpOnly Cookie 且 JSON 只返回公开上下文", async () => {
  const fixture = controllerFixture();

  const response = await fixture.controller.select(
    fixture.request,
    { mode: "LEARNER", learnerId: "learner-1" },
    fixture.response
  );

  assert.equal(fixture.selectedMethod(), "select");
  assert.deepEqual(response, { code: 0, message: "成功", data: {
    mode: "LEARNER",
    learnerId: "learner-1",
    learner: { id: "learner-1", nickname: "小明", grade: "GRADE_2", gradeLabel: "二年级", avatarUrl: null }
  } });
  assert.equal(JSON.stringify(response).includes("signed-profile-token"), false);
  assert.deepEqual(fixture.cookies, [
    {
      name: "xueleai_user_access",
      value: "learner-access-token",
      settings: { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 900_000 }
    },
    {
      name: "xueleai_profile_context",
      value: "signed-profile-token",
      settings: { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 600_000 }
    }
  ]);
  assert.deepEqual(fixture.accessScopes, ["LEARNER"]);
});

test("账号进入学习者调用独立 enterLearner 分支而不复用首次选择", async () => {
  const fixture = controllerFixture();

  await fixture.controller.enterLearner(fixture.request, { learnerId: "learner-1" }, fixture.response);

  assert.equal(fixture.selectedMethod(), "enterLearner");
  assert.deepEqual(fixture.accessScopes, ["LEARNER"]);
});

test("返回主账号后立即换回主账号 access token", async () => {
  const fixture = controllerFixture();

  await fixture.controller.returnToAccount(
    fixture.request,
    { password: "main-password" },
    fixture.response
  );

  assert.equal(fixture.selectedMethod(), "returnToAccount");
  assert.deepEqual(fixture.accessScopes, ["ACCOUNT"]);
});

test("学习者模式调用创建管理接口会在任何档案写入前拒绝", async () => {
  const fixture = controllerFixture({ accountAllowed: false });

  await assert.rejects(
    fixture.controller.createLearner(fixture.request, {
      nickname: "小明",
      grade: "GRADE_2",
      switchPassword: "123456"
    }),
    (error: AppException) => error.message === "请切换到主账号身份后操作"
  );
  assert.equal(fixture.createdLearners(), 0);
});

test("学习者自助修改昵称只绑定服务端当前学习者且账号身份不能调用", async () => {
  const allowed = controllerFixture();
  const method = (allowed.controller as unknown as {
    updateCurrentLearner?: (request: unknown, dto: { nickname: string }) => Promise<unknown>;
  }).updateCurrentLearner;
  assert.equal(typeof method, "function");

  const response = await method?.call(allowed.controller, allowed.request, { nickname: "新昵称" });
  assert.deepEqual(response, {
    code: 0,
    message: "成功",
    data: { id: "learner-1", nickname: "新昵称" }
  });
  assert.deepEqual(allowed.profileUpdates, [{
    userId: "user-1",
    learnerId: "learner-1",
    dto: { nickname: "新昵称" }
  }]);

  const denied = controllerFixture({ learnerAllowed: false });
  const deniedMethod = (denied.controller as unknown as {
    updateCurrentLearner: (request: unknown, dto: { nickname: string }) => Promise<unknown>;
  }).updateCurrentLearner;
  await assert.rejects(
    deniedMethod.call(denied.controller, denied.request, { nickname: "越权昵称" }),
    (error: AppException) => error.message === "请使用学习者身份修改资料"
  );
  assert.deepEqual(denied.profileUpdates, []);
});

test("学习者自助上传头像只写入服务端当前学习者", async () => {
  const fixture = controllerFixture();
  const method = (fixture.controller as unknown as {
    updateCurrentLearnerAvatar?: (request: unknown, file: unknown) => Promise<unknown>;
  }).updateCurrentLearnerAvatar;
  assert.equal(typeof method, "function");

  await method?.call(fixture.controller, fixture.request, {
    originalname: "avatar.png",
    mimetype: "image/png",
    size: 10,
    buffer: Buffer.alloc(10)
  });
  assert.equal(fixture.uploaded(), true);
  assert.deepEqual(fixture.avatarUpdates, [{
    userId: "user-1",
    learnerId: "learner-1",
    avatarUrl: "https://cdn.example/learner-avatar.png"
  }]);
});

test("学习者统计接口只使用服务端当前身份且账号身份不能调用", async () => {
  const allowed = controllerFixture();
  assert.deepEqual(await allowed.controller.learnerStatistics(allowed.request), {
    code: 0,
    message: "成功",
    data: {
      completedActivityCount: 4,
      recentCompletedActivityCount: 2,
      lastActivityAt: "2026-08-14T11:30:00.000Z"
    }
  });

  const denied = controllerFixture({ learnerAllowed: false });
  await assert.rejects(
    denied.controller.learnerStatistics(denied.request),
    (error: AppException) => error.message === "请使用学习者身份查看学习统计"
  );
});

test("学习者自助头像接口先拒绝账号身份且保存失败会清理新资产", async () => {
  const denied = controllerFixture({ learnerAllowed: false });
  await assert.rejects(
    denied.controller.updateCurrentLearnerAvatar(denied.request, {
      originalname: "avatar.png",
      mimetype: "image/png",
      size: 10,
      buffer: Buffer.alloc(10)
    }),
    (error: AppException) => error.message === "请使用学习者身份修改资料"
  );
  assert.equal(denied.uploaded(), false);

  const updateError = new AppException(40901, "学习者头像保存失败", 409);
  const failed = controllerFixture({ avatarUpdateError: updateError });
  await assert.rejects(
    failed.controller.updateCurrentLearnerAvatar(failed.request, {
      originalname: "avatar.png",
      mimetype: "image/png",
      size: 10,
      buffer: Buffer.alloc(10)
    }),
    (error) => error === updateError
  );
  assert.deepEqual(failed.cleanedAvatarAssets, [{ userId: "user-1", assetId: "asset-new" }]);
});

test("头像上传在保存媒体前验证学习者所属并只保存返回 URL", async () => {
  const denied = controllerFixture({ ownerAllowed: false });
  await assert.rejects(
    denied.controller.updateLearnerAvatar(denied.request, "learner-other", {
      originalname: "avatar.png",
      mimetype: "image/png",
      size: 10,
      buffer: Buffer.alloc(10)
    }),
    (error: AppException) => error.message === "学习者不存在或无权操作"
  );
  assert.equal(denied.uploaded(), false);

  const allowed = controllerFixture();
  await allowed.controller.updateLearnerAvatar(allowed.request, "learner-1", {
    originalname: "avatar.png",
    mimetype: "image/png",
    size: 10,
    buffer: Buffer.alloc(10)
  });
  assert.equal(allowed.uploaded(), true);
  assert.equal(allowed.updatedAvatarUrl(), "https://cdn.example/learner-avatar.png");
});

test("头像上传成功但学习者更新与补偿均失败时仍保留原始错误", async () => {
  const updateError = new AppException(40901, "学习者头像保存失败", 409);
  const fixture = controllerFixture({
    avatarUpdateError: updateError,
    avatarCleanupError: new Error("模拟头像补偿失败")
  });

  await assert.rejects(
    fixture.controller.updateLearnerAvatar(fixture.request, "learner-1", {
      originalname: "avatar.png",
      mimetype: "image/png",
      size: 10,
      buffer: Buffer.alloc(10)
    }),
    (error) => error === updateError
  );
  assert.deepEqual(fixture.cleanedAvatarAssets, [{ userId: "user-1", assetId: "asset-new" }]);
});

test("学习者头像资产清理只删除同用户上传的图片并使用签名 S3 DELETE", async () => {
  const previousEnv = {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secret: process.env.S3_SECRET_ACCESS_KEY,
    prefix: process.env.S3_KEY_PREFIX,
    pathStyle: process.env.S3_FORCE_PATH_STYLE
  };
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; authorization: string }> = [];
  const deletedWhere: unknown[] = [];
  process.env.S3_ENDPOINT = "https://storage.example.com";
  process.env.S3_BUCKET = "avatars";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "access-key";
  process.env.S3_SECRET_ACCESS_KEY = "secret-key";
  process.env.S3_KEY_PREFIX = "uploads/";
  process.env.S3_FORCE_PATH_STYLE = "1";
  globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization") ?? ""
    });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    const service = new MediaService() as MediaService & Record<string, unknown>;
    service["prisma"] = {
      mediaAsset: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          assert.deepEqual(where, {
            id: "asset-new",
            createdByUserId: "user-1",
            createdByAdminId: null,
            mediaType: "IMAGE",
            sourceType: "USER_UPLOAD"
          });
          return {
            id: "asset-new",
            filename: "20260814-avatar.png",
            url: "https://cdn.example.com/uploads/20260814-avatar.png",
            storageProvider: "S3"
          };
        },
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          deletedWhere.push(where);
          return { count: 1 };
        }
      }
    };

    assert.deepEqual(await service.cleanupLearnerAvatar("user-1", "asset-new"), { deleted: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "DELETE");
    assert.match(calls[0]?.authorization ?? "", /^AWS4-HMAC-SHA256 /);
    assert.deepEqual(deletedWhere, [{
      id: "asset-new",
      createdByUserId: "user-1",
      createdByAdminId: null,
      mediaType: "IMAGE",
      sourceType: "USER_UPLOAD",
      filename: "20260814-avatar.png",
      storageProvider: "S3"
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      S3_ENDPOINT: previousEnv.endpoint,
      S3_BUCKET: previousEnv.bucket,
      S3_REGION: previousEnv.region,
      S3_ACCESS_KEY_ID: previousEnv.accessKeyId,
      S3_SECRET_ACCESS_KEY: previousEnv.secret,
      S3_KEY_PREFIX: previousEnv.prefix,
      S3_FORCE_PATH_STYLE: previousEnv.pathStyle
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("本地学习者头像补偿删除文件和受约束资产行", async () => {
  const previousUploadDir = process.env.UPLOAD_DIR;
  const directory = await mkdtemp(join(tmpdir(), "xueleai-learner-avatar-"));
  const filename = "local-avatar.png";
  await writeFile(join(directory, filename), Buffer.from("avatar"));
  process.env.UPLOAD_DIR = directory;
  let rowDeleted = false;

  try {
    const service = new MediaService() as MediaService & Record<string, unknown>;
    service["prisma"] = {
      mediaAsset: {
        findFirst: async () => ({
          id: "asset-local",
          filename,
          url: "/api/media/files/local-avatar.png",
          storageProvider: "LOCAL"
        }),
        deleteMany: async () => {
          rowDeleted = true;
          return { count: 1 };
        }
      }
    };

    assert.deepEqual(await service.cleanupLearnerAvatar("user-1", "asset-local"), { deleted: true });
    await assert.rejects(readFile(join(directory, filename)));
    assert.equal(rowDeleted, true);
  } finally {
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUploadDir;
    await rm(directory, { recursive: true, force: true });
  }
});

test("学习者头像语义上传复用现有图片内容校验而不只相信 MIME", async () => {
  const mediaService = new MediaService();

  await assert.rejects(
    mediaService.uploadLearnerAvatar("user-1", {
      originalname: "fake.png",
      mimetype: "image/png",
      size: 12,
      buffer: Buffer.from("not-an-image")
    }),
    (error: AppException) => error.message === "请上传有效的头像图片"
  );
});

 test("免费学习者上限阻止新增与恢复，已有学习者保持可用", async () => {
 const fixture = learnerFixture({freeLearnerLimit: 0});
 await assert.rejects(fixture.service.create("user-1", {nickname:"小明", grade:"GRADE_2",switchPassword:"123456"}), /数量已达上限/);
 });

 test("并发新建和恢复只占用剩余的一个会员名额", async () => {
 const fixture = learnerFixture({freeLearnerLimit:1,membershipLearnerLimit:2,learners:[activeLearner("active"),{...activeLearner("inactive"),status:"INACTIVE"}]});
 const results=await Promise.allSettled([fixture.service.create("user-1", {nickname:"新学习者",grade:"GRADE_2"}), fixture.service.restore("user-1","inactive")]);
 assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
 assert.equal((await fixture.service.list("user-1","ACTIVE")).length,2);
 });
 test("到期后保留超额学习者但阻止恢复", async () => {
 const fixture=learnerFixture({freeLearnerLimit:1,learners:[activeLearner("first"),activeLearner("second"),{...activeLearner("inactive"),status:"INACTIVE"}]});
 assert.equal((await fixture.service.list("user-1","ACTIVE")).length,2);
 await fixture.service.restore("user-1","first");
 await assert.rejects(fixture.service.restore("user-1","inactive"), /数量已达上限/);
 });

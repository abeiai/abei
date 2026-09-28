import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import type { PrismaClient } from "@xueleai/database";
import { resolveHistoryProfileWhere } from "../src/profiles/history-profile-filter.js";
import { verifyJwt } from "../src/security/jwt.js";

const execFileAsync = promisify(execFile);
const defaultDatabaseUrl = "postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public";
const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:3325";
const unique = `task11-${randomUUID()}`;
const databaseName = `task11_profile_${randomUUID().replaceAll("-", "")}`;
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

assert.match(databaseName, /^task11_profile_[a-f0-9]{32}$/);
process.env.JWT_ACCESS_SECRET = `task11-access-${randomUUID()}`;
process.env.JWT_REFRESH_SECRET = `task11-refresh-${randomUUID()}`;
process.env.PROFILE_CONTEXT_SECRET = `task11-profile-${randomUUID()}`;
process.env.SECRET_ENCRYPTION_KEY = `task11-encryption-${randomUUID()}`;
process.env.REDIS_URL = redisUrl;
process.env.CMS_SCHEDULED_PUBLISHER_ENABLED = "0";
process.env.PUBLIC_API_BASE_URL = "http://127.0.0.1:3322/api";

interface ApiPayload<T> {
  code: number;
  message: string;
  data: T | null;
}

interface CookieAttributes {
  httpOnly: boolean;
  maxAgePositive: boolean;
  name: string;
  pathRoot: boolean;
  sameSiteLax: boolean;
}

interface CleanupStage {
  name: string;
  run: () => Promise<void>;
}

async function runCleanupStages(stages: readonly CleanupStage[]) {
  const errors: Error[] = [];

  for (const stage of stages) {
    try {
      await stage.run();
    } catch (error) {
      errors.push(new Error(`清理阶段失败：${stage.name}`, { cause: error }));
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "学习者 E2E 清理失败");
  }
}

class CookieJar {
  private readonly values = new Map<string, string>();

  capture(headers: Headers): CookieAttributes[] {
    const values = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter((value): value is string => Boolean(value));

    return values.flatMap((header) => header.split(/,(?=[^;,]+=)/u)).map((header) => {
      const parts = header.split(";").map((part) => part.trim());
      const pair = parts[0] ?? "";
      const equalsAt = pair.indexOf("=");
      const name = equalsAt > 0 ? pair.slice(0, equalsAt) : "";
      const value = equalsAt > 0 ? pair.slice(equalsAt + 1) : "";
      const lowerAttributes = parts.slice(1).map((part) => part.toLowerCase());
      const maxAge = lowerAttributes
        .find((part) => part.startsWith("max-age="))
        ?.slice("max-age=".length);

      if (name) {
        if (!value || maxAge === "0") this.values.delete(name);
        else this.values.set(name, value);
      }

      return {
        name,
        httpOnly: lowerAttributes.includes("httponly"),
        sameSiteLax: lowerAttributes.includes("samesite=lax"),
        pathRoot: lowerAttributes.includes("path=/"),
        maxAgePositive: maxAge !== undefined && Number(maxAge) > 0
      };
    });
  }

  has(name: string) {
    return this.values.has(name);
  }

  get(name: string) {
    return this.values.get(name);
  }

  set(name: string, value: string) {
    this.values.set(name, value);
  }

  header() {
    return [...this.values].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function prepareIsolatedSchema(isolatedDatabaseUrl: string) {
  await execFileAsync(
    "pnpm",
    [
      "--filter",
      "@xueleai/database",
      "exec",
      "prisma",
      "db",
      "push",
      "--schema",
      "prisma/schema.prisma"
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: isolatedDatabaseUrl },
      maxBuffer: 4 * 1024 * 1024
    }
  );
}

async function startApp() {
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../src/app.module.js");
  const { HttpExceptionFilter } = await import("../src/common/http-exception.filter.js");
  const { createValidationPipe } = await import("../src/common/validation.js");
  const app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(createValidationPipe());
  await app.listen(0, "127.0.0.1");
  return { app, baseUrl: `${await app.getUrl()}/api` };
}

test("学习者身份真实 HTTP 闭环与账号历史筛选", { timeout: 240_000 }, async () => {
  const requireFromDatabasePackage = createRequire(
    new URL("../../../packages/database/package.json", import.meta.url)
  );
  const { Client } = requireFromDatabasePackage("pg");
  const adminUrl = new URL(databaseUrl);
  adminUrl.searchParams.delete("schema");
  adminUrl.searchParams.delete("options");
  const isolatedUrl = new URL(adminUrl);
  isolatedUrl.pathname = `/${databaseName}`;
  isolatedUrl.searchParams.set("schema", "public");
  const admin = new Client({ connectionString: adminUrl.toString() });
  let app: Awaited<ReturnType<typeof startApp>>["app"] | null = null;
  let prisma: PrismaClient | null = null;
  let initialSchemaCount: number | null = null;
  let primaryUserId = "";
  let foreignUserId = "";
  let learnerAId = "";
  let learnerBId = "";
  let learnerCId = "";
  let learnerDId = "";
  let foreignLearnerId = "";
  let categoryId = "";
  let membershipPlanId = "";
  let videoScenarioId = "";
  let englishScenarioId = "";
  let ownedCourseId = "";
  let enrolledCourseId = "";
  const primaryJar = new CookieJar();
  const directLearnerJar = new CookieJar();
  const learnerSessionJar = new CookieJar();
  const email = `${unique}@example.com`;
  const foreignEmail = `foreign-${unique}@example.com`;
  const loginPassword = "MainPass123";
  const switchPassword = "123456";

  try {
    await admin.connect();
    const initialRows = await admin.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM pg_database
      WHERE datname ~ '^task11_profile_[a-f0-9]{32}$'
    `);
    initialSchemaCount = initialRows.rows[0]?.count ?? 0;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    await prepareIsolatedSchema(isolatedUrl.toString());
    process.env.DATABASE_URL = isolatedUrl.toString();

    const started = await startApp();
    app = started.app;
    const { getPrismaClient, hashPassword } = await import("@xueleai/database");
    prisma = getPrismaClient();
    await prisma.$executeRawUnsafe('ALTER SEQUENCE "users_accountNumber_seq" RESTART WITH 10000');
    const runtimeDatabase = await prisma.$queryRawUnsafe<Array<{ current_database: string }>>(
      "SELECT current_database()"
    );
    assert.equal(runtimeDatabase[0]?.current_database, databaseName);
    const runtimeColumns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'passwordLoginEnabled'
    `);
    assert.deepEqual(runtimeColumns, [{ column_name: "passwordLoginEnabled" }]);

    async function request<T>(
      path: string,
      options: {
        body?: unknown;
        expected?: { code: number; message: string; status: number };
        inspectOnly?: boolean;
        jar?: CookieJar;
        method?: string;
      } = {}
    ) {
      const headers = new Headers({ "Content-Type": "application/json" });
      if (options.jar) headers.set("Cookie", options.jar.header());
      const response = await fetch(`${started.baseUrl}${path}`, {
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        headers,
        method: options.method ?? "GET"
      });
      const cookies = options.jar?.capture(response.headers) ?? [];
      const payload = (await response.json()) as ApiPayload<T>;
      assert.equal(typeof payload.code, "number");
      assert.equal(typeof payload.message, "string");
      assert.equal(Object.prototype.hasOwnProperty.call(payload, "data"), true);

      if (options.inspectOnly) {
        // Aggregate assertions below keep the complete invalid-query RED matrix visible in one run.
      } else if (options.expected) {
        assert.equal(response.status, options.expected.status, path);
        assert.equal(payload.code, options.expected.code, path);
        assert.equal(payload.message, options.expected.message, path);
        assert.equal(payload.data, null, path);
      } else {
        assert.equal(response.ok, true, `${path}: ${payload.message}`);
        assert.equal(payload.code, 0, `${path}: ${payload.message}`);
        assert.notEqual(payload.data, null, path);
      }

      return { cookies, payload, status: response.status };
    }

    const verificationCode = "482631";
    const verificationHash = createHmac("sha256", process.env.JWT_REFRESH_SECRET!)
      .update(`${email}:REGISTER:${verificationCode}`)
      .digest("hex");
    await prisma.emailVerificationCode.create({
      data: {
        email,
        purpose: "REGISTER",
        codeHash: verificationHash,
        expiresAt: new Date(Date.now() + 5 * 60_000),
        sendProvider: "TASK11_FIXTURE",
        sendStatus: "SENT"
      }
    });

    const registered = await request<{ user: { id: string; email: string } }>("/auth/register", {
      method: "POST",
      jar: primaryJar,
      body: { email, password: loginPassword, emailCode: verificationCode, nickname: "端到端家长" }
    });
    primaryUserId = registered.payload.data!.user.id;
    // This account exercises several simultaneous learners; grant an explicit test membership.
    const membershipPlan = await prisma.membershipPlan.create({
      data: { name: `学习者测试会员 ${unique}`, rank: 1, storageGb: 1, learnerLimit: 10, benefits: [], prices: [] }
    });
    membershipPlanId = membershipPlan.id;
    const membershipOrder = await prisma.paymentOrder.create({
      data: { userId: primaryUserId, orderNo: `PROFILE_MEMBERSHIP_${randomUUID()}`, provider: "ALIPAY", amountCny: "1.00", credits: 0, status: "PAID", paidAt: new Date() }
    });
    await prisma.membershipPeriod.create({
      data: { userId: primaryUserId, planId: membershipPlan.id, orderId: membershipOrder.id,
        name: membershipPlan.name, rank: membershipPlan.rank, storageGb: membershipPlan.storageGb,
        learnerLimit: membershipPlan.learnerLimit, benefits: [], credits: 0, remainingCredits: 0,
        startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 86_400_000), grantedAt: new Date() }
    });
    assert.equal(registered.payload.data!.user.email, email);
    assert.equal(primaryJar.has("xueleai_user_access"), true);
    assert.equal(primaryJar.has("xueleai_user_refresh"), true);
    assert.equal(primaryJar.has("xueleai_profile_context"), false);

    await request("/video-guide/lessons", {
      jar: primaryJar,
      expected: { code: 40301, message: "请先选择使用身份", status: 403 }
    });

    const selectedAccount = await request<{ mode: string }>("/profiles/select", {
      method: "POST",
      jar: primaryJar,
      body: { mode: "ACCOUNT" }
    });
    const profileCookie = selectedAccount.cookies.find((cookie) => cookie.name === "xueleai_profile_context");
    assert.equal(Boolean(profileCookie), true);
    assert.equal(profileCookie?.httpOnly, true);
    assert.equal(profileCookie?.sameSiteLax, true);
    assert.equal(profileCookie?.pathRoot, true);
    assert.equal(profileCookie?.maxAgePositive, true);

    foreignUserId = (await prisma.user.create({
      data: {
        email: foreignEmail,
        passwordHash: await hashPassword("ForeignPass123"),
        nickname: "其他账号"
      }
    })).id;
    await prisma.wallet.create({ data: { userId: foreignUserId } });
    foreignLearnerId = (await prisma.learner.create({
      data: {
        userId: foreignUserId,
        accountNumber: 100,
        nickname: "其他学习者",
        grade: "GRADE_4"
      }
    })).id;

    categoryId = (await prisma.aiToolCategory.create({
      data: { name: `任务分类 ${unique}`, slug: `task11-category-${randomUUID()}`, isVisible: true }
    })).id;
    const scenarios = await Promise.all([
      prisma.aiScenario.create({
        data: {
          name: "视频导学",
          slug: "video-guide-narration",
          toolCategoryId: categoryId,
          promptTemplate: "{{input}}",
          requiredCapabilities: ["TEXT"],
          costCredits: 0,
          isEnabled: true
        }
      }),
      prisma.aiScenario.create({
        data: {
          name: "英文带学",
          slug: "english-guided-study-material",
          toolCategoryId: categoryId,
          promptTemplate: "{{input}}",
          requiredCapabilities: ["TEXT"],
          costCredits: 0,
          isEnabled: true
        }
      })
    ]);
    videoScenarioId = scenarios[0]!.id;
    englishScenarioId = scenarios[1]!.id;

    async function createPublishedCourse(userId: string, name: string) {
      const courseId = `course-${randomUUID()}`;
      const cover = await prisma!.mediaAsset.create({
        data: {
          filename: `${courseId}.png`,
          originalName: `${name}.png`,
          mimeType: "image/png",
          size: 128,
          url: `/uploads/${courseId}.png`,
          createdByUserId: userId
        }
      });
      await prisma!.course.create({
        data: { id: courseId, userId, reviewState: "PUBLISHED", publishedAt: new Date() }
      });
      const revision = await prisma!.courseRevision.create({
        data: {
          courseId,
          coverMediaId: cover.id,
          name,
          summary: `${name}课程摘要`,
          status: "APPROVED",
          reviewedAt: new Date()
        }
      });
      await prisma!.course.update({
        where: { id: courseId },
        data: { approvedRevisionId: revision.id, workingRevisionId: revision.id }
      });
      return courseId;
    }

    ownedCourseId = await createPublishedCourse(primaryUserId, "自建课程");
    enrolledCourseId = await createPublishedCourse(foreignUserId, "已加入课程");
    await prisma.courseEnrollment.create({ data: { userId: primaryUserId, courseId: enrolledCourseId } });

    const createdA = await request<{ id: string; accountId: string; nickname: string }>("/profiles/learners", {
      method: "POST",
      jar: primaryJar,
      body: {
        nickname: "学习者甲",
        grade: "GRADE_3",
        switchPassword,
        scenarioIds: [],
        courseIds: []
      }
    });
    learnerAId = createdA.payload.data!.id;
    const createdB = await request<{ id: string; accountId: string; nickname: string }>("/profiles/learners", {
      method: "POST",
      jar: primaryJar,
      body: {
        nickname: "学习者乙",
        grade: "GRADE_6",
        scenarioIds: [],
        courseIds: []
      }
    });
    learnerBId = createdB.payload.data!.id;
    assert.deepEqual(
      [createdA.payload.data!.accountId, createdB.payload.data!.accountId],
      ["100", "101"]
    );

    const [createdC, createdD] = await Promise.all([
      request<{ id: string; accountId: string }>("/profiles/learners", {
        method: "POST",
        jar: primaryJar,
        body: { nickname: "并发学习者丙", grade: "GRADE_4", scenarioIds: [], courseIds: [] }
      }),
      request<{ id: string; accountId: string }>("/profiles/learners", {
        method: "POST",
        jar: primaryJar,
        body: { nickname: "并发学习者丁", grade: "GRADE_5", scenarioIds: [], courseIds: [] }
      })
    ]);
    assert.deepEqual(
      [createdC.payload.data!.accountId, createdD.payload.data!.accountId].sort(),
      ["102", "103"]
    );
    learnerCId = createdC.payload.data!.id;
    learnerDId = createdD.payload.data!.id;
    assert.equal(
      (await prisma.user.findUnique({
        where: { id: primaryUserId },
        select: { nextLearnerNumber: true }
      }))?.nextLearnerNumber,
      104
    );

    const directLearnerLogin = await request<{
      accessToken: string;
      user: {
        accountId: string;
        avatarUrl: string | null;
        email: string;
        hasLoginPassword: boolean;
        id: string;
        nickname: string;
        phone: string | null;
        phoneVerifiedAt: string | null;
        status: string;
      };
    }>("/auth/learner-login", {
      method: "POST",
      jar: directLearnerJar,
      body: { accountId: "10000", learnerId: "100", switchPassword }
    });
    assert.deepEqual(directLearnerLogin.payload.data!.user, {
      accountId: "10000",
      avatarUrl: null,
      email: "",
      hasLoginPassword: true,
      id: primaryUserId,
      nickname: "我的账号",
      phone: null,
      phoneVerifiedAt: null,
      status: "ACTIVE"
    });
    assert.equal(directLearnerJar.has("xueleai_profile_context"), true);
    assert.equal(
      verifyJwt(
        directLearnerLogin.payload.data!.accessToken,
        process.env.JWT_ACCESS_SECRET!
      )?.sessionScope,
      "LEARNER"
    );

    const directLearnerMe = await request<{
      accountId: string;
      avatarUrl: string | null;
      email: string;
      hasLoginPassword: boolean;
      id: string;
      nickname: string;
      phone: string | null;
      phoneVerifiedAt: string | null;
      status: string;
    }>("/auth/me", { jar: directLearnerJar });
    assert.deepEqual(directLearnerMe.payload.data, {
      accountId: "10000",
      avatarUrl: null,
      email: "",
      hasLoginPassword: true,
      id: primaryUserId,
      nickname: "我的账号",
      phone: null,
      phoneVerifiedAt: null,
      status: "ACTIVE"
    });

    const directSelection = await request<{
      account: { nickname: string; avatarUrl: string | null };
    }>("/profiles/selection", { jar: directLearnerJar });
    assert.equal(directSelection.payload.data!.account.nickname, "我的账号");
    assert.equal(directSelection.payload.data!.account.avatarUrl, null);

    const directRefresh = await request<{
      accessToken: string;
      user: { email: string; nickname: string; phone: string | null };
    }>("/auth/refresh", { method: "POST", jar: directLearnerJar });
    assert.equal(directRefresh.payload.data!.user.email, "");
    assert.equal(directRefresh.payload.data!.user.nickname, "我的账号");
    assert.equal(directRefresh.payload.data!.user.phone, null);
    assert.equal(
      verifyJwt(directRefresh.payload.data!.accessToken, process.env.JWT_ACCESS_SECRET!)
        ?.sessionScope,
      "LEARNER"
    );

    assert.equal((await prisma.learnerScenarioAuthorization.count({
      where: { learnerId: { in: [learnerAId, learnerBId] } }
    })), 0);
    assert.equal((await prisma.learnerCourseAuthorization.count({
      where: { learnerId: { in: [learnerAId, learnerBId] } }
    })), 0);

    const accountDraft = await request<{ id: string }>("/video-guide/lessons/draft", {
      method: "POST",
      jar: primaryJar,
      body: {
        title: "我的账号记录",
        mediaName: "account.mp4",
        mediaType: "VIDEO",
        mediaSizeBytes: 512,
        mediaUrl: "/uploads/task11-account.mp4"
      }
    });
    assert.equal((await prisma.videoGuideLesson.findUnique({
      where: { id: accountDraft.payload.data!.id }, select: { learnerId: true }
    }))?.learnerId, null);

    await request("/profiles/enter-learner", {
      method: "POST",
      jar: primaryJar,
      body: { learnerId: learnerAId }
    });
    const transitionedLearnerAccess = primaryJar.get("xueleai_user_access");
    assert.ok(transitionedLearnerAccess);
    assert.equal(
      verifyJwt(transitionedLearnerAccess, process.env.JWT_ACCESS_SECRET!)?.sessionScope,
      "LEARNER"
    );
    const accessOnlyLearnerJar = new CookieJar();
    accessOnlyLearnerJar.set("xueleai_user_access", transitionedLearnerAccess);
    assert.equal(
      (await request<{ email: string }>("/auth/me", { jar: accessOnlyLearnerJar }))
        .payload.data!.email,
      ""
    );
    const beforeUnauthorized = await prisma.videoGuideLesson.count({
      where: { userId: primaryUserId, learnerId: learnerAId }
    });
    await request("/video-guide/lessons/draft", {
      method: "POST",
      jar: primaryJar,
      body: {
        title: "不应创建",
        mediaName: "blocked.mp4",
        mediaType: "VIDEO",
        mediaSizeBytes: 512,
        mediaUrl: "/uploads/task11-blocked.mp4"
      },
      expected: { code: 40301, message: "当前学习者未获得此应用授权", status: 403 }
    });
    assert.equal(await prisma.videoGuideLesson.count({
      where: { userId: primaryUserId, learnerId: learnerAId }
    }), beforeUnauthorized);

    await request("/profiles/return-account", {
      method: "POST",
      jar: primaryJar,
      body: { password: loginPassword }
    });
    const transitionedAccountAccess = primaryJar.get("xueleai_user_access");
    assert.ok(transitionedAccountAccess);
    assert.equal(
      verifyJwt(transitionedAccountAccess, process.env.JWT_ACCESS_SECRET!)?.sessionScope,
      undefined
    );
    assert.equal(
      verifyJwt(transitionedAccountAccess, process.env.JWT_ACCESS_SECRET!)?.email,
      email
    );
    await request(`/profiles/learners/${encodeURIComponent(learnerAId)}/authorizations`, {
      method: "PUT",
      jar: primaryJar,
      body: { scenarioIds: [videoScenarioId], courseIds: [ownedCourseId] }
    });
    await request(`/profiles/learners/${encodeURIComponent(learnerBId)}/authorizations`, {
      method: "PUT",
      jar: primaryJar,
      body: { scenarioIds: [videoScenarioId, englishScenarioId], courseIds: [enrolledCourseId] }
    });
    await request("/profiles/enter-learner", {
      method: "POST",
      jar: primaryJar,
      body: { learnerId: learnerAId }
    });
    const learnerADraft = await request<{ id: string }>("/video-guide/lessons/draft", {
      method: "POST",
      jar: primaryJar,
      body: {
        title: "甲的记录",
        mediaName: "learner-a.mp4",
        mediaType: "VIDEO",
        mediaSizeBytes: 512,
        mediaUrl: "/uploads/task11-learner-a.mp4"
      }
    });
    assert.deepEqual(await prisma.videoGuideLesson.findUnique({
      where: { id: learnerADraft.payload.data!.id }, select: { userId: true, learnerId: true }
    }), { userId: primaryUserId, learnerId: learnerAId });

    await request("/profiles/switch-learner", {
      method: "POST",
      jar: primaryJar,
      body: { learnerId: learnerBId, switchPassword: "000000" },
      expected: { code: 40003, message: "切换密码错误", status: 400 }
    });
    const stillA = await request<{ learner: { id: string } }>("/profiles/learner/home", { jar: primaryJar });
    assert.equal(stillA.payload.data!.learner.id, learnerAId);
    await request("/profiles/switch-learner", {
      method: "POST",
      jar: primaryJar,
      body: { learnerId: learnerBId, switchPassword }
    });
    const learnerBInitialLessons = await request<Array<{ id: string }>>("/video-guide/lessons", { jar: primaryJar });
    assert.deepEqual(learnerBInitialLessons.payload.data, []);
    const learnerBDraft = await request<{ id: string }>("/video-guide/lessons/draft", {
      method: "POST",
      jar: primaryJar,
      body: {
        title: "乙的记录",
        mediaName: "learner-b.mp4",
        mediaType: "VIDEO",
        mediaSizeBytes: 512,
        mediaUrl: "/uploads/task11-learner-b.mp4"
      }
    });
    assert.deepEqual(await prisma.videoGuideLesson.findUnique({
      where: { id: learnerBDraft.payload.data!.id }, select: { userId: true, learnerId: true }
    }), { userId: primaryUserId, learnerId: learnerBId });

    await request("/profiles/return-account", {
      method: "POST",
      jar: primaryJar,
      body: { password: switchPassword },
      expected: { code: 40003, message: "登录密码错误", status: 400 }
    });
    const stillB = await request<{ learner: { id: string } }>("/profiles/learner/home", { jar: primaryJar });
    assert.equal(stillB.payload.data!.learner.id, learnerBId);
    await request("/profiles/return-account", {
      method: "POST",
      jar: primaryJar,
      body: { password: loginPassword }
    });

    await prisma.aiTask.createMany({
      data: [
        { userId: primaryUserId, learnerId: null, scenarioId: videoScenarioId, input: {}, estimatedCredits: 0 },
        { userId: primaryUserId, learnerId: learnerAId, scenarioId: videoScenarioId, input: {}, estimatedCredits: 0 },
        { userId: primaryUserId, learnerId: learnerBId, scenarioId: videoScenarioId, input: {}, estimatedCredits: 0 }
      ]
    });
    await prisma.audioTask.createMany({
      data: [
        { userId: primaryUserId, learnerId: null, scenarioId: videoScenarioId, type: "TTS", provider: "fixture", model: "fixture", estimatedCredits: 0 },
        { userId: primaryUserId, learnerId: learnerAId, scenarioId: videoScenarioId, type: "TTS", provider: "fixture", model: "fixture", estimatedCredits: 0 },
        { userId: primaryUserId, learnerId: learnerBId, scenarioId: videoScenarioId, type: "TTS", provider: "fixture", model: "fixture", estimatedCredits: 0 }
      ]
    });

    const historyMatrix: Array<{ account: number; all: number; defaultAll: number; learnerA: number; route: string }> = [];
    for (const route of ["/ai/tasks", "/audio/tasks", "/video-guide/lessons"]) {
      const defaultAll = await request<unknown[]>(route, { jar: primaryJar });
      const all = await request<unknown[]>(`${route}?profile=all`, { jar: primaryJar });
      const account = await request<unknown[]>(`${route}?profile=account`, { jar: primaryJar });
      const learnerA = await request<unknown[]>(`${route}?profile=learner%3A${encodeURIComponent(learnerAId)}`, {
        jar: primaryJar
      });
      historyMatrix.push({
        route,
        defaultAll: defaultAll.payload.data!.length,
        all: all.payload.data!.length,
        account: account.payload.data!.length,
        learnerA: learnerA.payload.data!.length
      });
    }
    const invalidPaths = [
      "/ai/tasks?profile=all&profile=account",
      "/audio/tasks?profile=",
      "/video-guide/lessons?profile=%20all",
      "/ai/tasks?profile=all%20",
      "/audio/tasks?profile=creator",
      "/video-guide/lessons?profile=learner%3A",
      `/ai/tasks?profile=learner%3A${encodeURIComponent(learnerAId)}%3Aextra`,
      `/audio/tasks?profile=learner%3A${encodeURIComponent(foreignLearnerId)}`
    ];
    const historyCountsBeforeInvalid = await Promise.all([
      prisma.aiTask.count({ where: { userId: primaryUserId } }),
      prisma.audioTask.count({ where: { userId: primaryUserId } }),
      prisma.videoGuideLesson.count({ where: { userId: primaryUserId } })
    ]);
    const invalidResults = [];
    for (const path of invalidPaths) {
      const result = await request<unknown>(path, { inspectOnly: true, jar: primaryJar });
      invalidResults.push({
        path,
        status: result.status,
        code: result.payload.code,
        message: result.payload.message,
        dataNull: result.payload.data === null
      });
    }
    const historyCountsAfterInvalid = await Promise.all([
      prisma.aiTask.count({ where: { userId: primaryUserId } }),
      prisma.audioTask.count({ where: { userId: primaryUserId } }),
      prisma.videoGuideLesson.count({ where: { userId: primaryUserId } })
    ]);

    await request("/auth/login", {
      method: "POST",
      jar: learnerSessionJar,
      body: { email, password: loginPassword }
    });
    assert.equal(learnerSessionJar.has("xueleai_profile_context"), false);
    await request("/profiles/select", {
      method: "POST",
      jar: learnerSessionJar,
      body: { mode: "LEARNER", learnerId: learnerBId }
    });
    const learnerNoQueryCounts = [];
    for (const route of ["/ai/tasks", "/audio/tasks", "/video-guide/lessons"]) {
      const result = await request<unknown[]>(route, { jar: learnerSessionJar });
      learnerNoQueryCounts.push({ route, count: result.payload.data!.length });
    }
    const learnerExplicitResults = [];
    for (const path of [
      "/ai/tasks?profile=all",
      "/audio/tasks?profile=account",
      `/video-guide/lessons?profile=learner%3A${encodeURIComponent(learnerBId)}`
    ]) {
      const result = await request<unknown>(path, { inspectOnly: true, jar: learnerSessionJar });
      learnerExplicitResults.push({
        path,
        status: result.status,
        code: result.payload.code,
        message: result.payload.message,
        dataNull: result.payload.data === null
      });
    }
    await request(`/profiles/learners/${encodeURIComponent(learnerBId)}/deactivate`, {
      method: "POST",
      jar: primaryJar
    });
    await request("/profiles/learner/home", {
      jar: learnerSessionJar,
      expected: { code: 40101, message: "登录状态已失效，请重新登录", status: 401 }
    });
    assert.equal(await prisma.videoGuideLesson.count({
      where: { userId: primaryUserId, learnerId: learnerBId }
    }), 1);
    const inactiveHistory = await request<unknown[]>(
      `/video-guide/lessons?profile=learner%3A${encodeURIComponent(learnerBId)}`,
      { jar: primaryJar }
    );
    const invalidExpected = invalidPaths.map((path) => ({
      path,
      status: 400,
      code: 40001,
      message: "学习者筛选无效",
      dataNull: true
    }));
    assert.deepEqual({
      historyMatrix,
      invalidResults,
      historyCountsAfterInvalid,
      learnerNoQueryCounts,
      learnerExplicitResults,
      inactiveHistoryCount: inactiveHistory.payload.data!.length
    }, {
      historyMatrix: [
        { route: "/ai/tasks", defaultAll: 3, all: 3, account: 1, learnerA: 1 },
        { route: "/audio/tasks", defaultAll: 3, all: 3, account: 1, learnerA: 1 },
        { route: "/video-guide/lessons", defaultAll: 3, all: 3, account: 1, learnerA: 1 }
      ],
      invalidResults: invalidExpected,
      historyCountsAfterInvalid: historyCountsBeforeInvalid,
      learnerNoQueryCounts: [
        { route: "/ai/tasks", count: 1 },
        { route: "/audio/tasks", count: 1 },
        { route: "/video-guide/lessons", count: 1 }
      ],
      learnerExplicitResults: [
        { path: "/ai/tasks?profile=all", status: 400, code: 40001, message: "学习者筛选无效", dataNull: true },
        { path: "/audio/tasks?profile=account", status: 400, code: 40001, message: "学习者筛选无效", dataNull: true },
        {
          path: `/video-guide/lessons?profile=learner%3A${encodeURIComponent(learnerBId)}`,
          status: 400,
          code: 40001,
          message: "学习者筛选无效",
          dataNull: true
        }
      ],
      inactiveHistoryCount: 1
    });

    await request("/auth/logout", {
      method: "POST",
      jar: primaryJar,
      body: { switchPassword }
    });
    assert.equal(primaryJar.has("xueleai_profile_context"), false);
    await request("/auth/login", {
      method: "POST",
      jar: primaryJar,
      body: { email, password: loginPassword }
    });
    assert.equal(primaryJar.has("xueleai_profile_context"), false);
    await request("/video-guide/lessons", {
      jar: primaryJar,
      expected: { code: 40301, message: "请先选择使用身份", status: 403 }
    });
  } finally {
    await runCleanupStages([
      {
        name: "app-close",
        async run() {
          if (app) await app.close();
        }
      },
      {
        name: "row-cleanup",
        async run() {
          if (!prisma) return;

          if (primaryUserId || foreignUserId) {
            const userIds = [primaryUserId, foreignUserId].filter(Boolean);
            const learnerIds = [
              learnerAId,
              learnerBId,
              learnerCId,
              learnerDId,
              foreignLearnerId
            ].filter(Boolean);
            const courseIds = [ownedCourseId, enrolledCourseId].filter(Boolean);
            await prisma.learnerActivityEvent.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.aiCallLog.deleteMany({ where: { task: { userId: { in: userIds } } } });
            await prisma.creditReservation.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.ledgerEntry.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.audioTask.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.aiTask.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.videoGuideAssetRef.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.videoGuideLesson.deleteMany({ where: { userId: { in: userIds } } });
            if (learnerIds.length) {
              await prisma.learnerScenarioAuthorization.deleteMany({ where: { learnerId: { in: learnerIds } } });
              await prisma.learnerCourseAuthorization.deleteMany({ where: { learnerId: { in: learnerIds } } });
            }
            if (courseIds.length) {
              await prisma.courseEnrollment.deleteMany({ where: { courseId: { in: courseIds } } });
              await prisma.course.updateMany({
                where: { id: { in: courseIds } },
                data: { approvedRevisionId: null, workingRevisionId: null }
              });
              await prisma.courseRevision.deleteMany({ where: { courseId: { in: courseIds } } });
              await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
            }
            await prisma.mediaAsset.deleteMany({ where: { createdByUserId: { in: userIds } } });
            await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
            if (learnerIds.length) await prisma.learner.deleteMany({ where: { id: { in: learnerIds } } });
            await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.emailVerificationCode.deleteMany({ where: { email: { in: [email, foreignEmail] } } });
            await prisma.membershipPeriod.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.paymentOrder.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.user.deleteMany({ where: { id: { in: userIds } } });
          }
          if (membershipPlanId) await prisma.membershipPlan.delete({ where: { id: membershipPlanId } });
          if (videoScenarioId || englishScenarioId) {
            await prisma.aiScenario.deleteMany({
              where: { id: { in: [videoScenarioId, englishScenarioId].filter(Boolean) } }
            });
          }
          if (categoryId) await prisma.aiToolCategory.deleteMany({ where: { id: categoryId } });
          assert.equal(await prisma.user.count({ where: { email: { in: [email, foreignEmail] } } }), 0);
        }
      },
      {
        name: "prisma-disconnect",
        async run() {
          if (prisma) await prisma.$disconnect();
        }
      },
      {
        name: "terminate",
        async run() {
          await admin.query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
            [databaseName]
          );
        }
      },
      {
        name: "drop",
        async run() {
          await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
        }
      },
      {
        name: "absence-count",
        async run() {
          const exactRows = await admin.query<{ datname: string }>(
            "SELECT datname FROM pg_database WHERE datname = $1",
            [databaseName]
          );
          assert.deepEqual(exactRows.rows, []);
          if (initialSchemaCount !== null) {
            const finalRows = await admin.query<{ count: number }>(`
              SELECT count(*)::int AS count
              FROM pg_database
              WHERE datname ~ '^task11_profile_[a-f0-9]{32}$'
            `);
            assert.equal(finalRows.rows[0]?.count ?? 0, initialSchemaCount);
          }
        }
      },
      {
        name: "admin-end",
        async run() {
          await admin.end();
        }
      }
    ]);
  }
});

test("非法历史身份参数在业务查询前失败", async () => {
  let ownershipQueryCount = 0;
  const prisma = {
    learner: {
      async findFirst() {
        ownershipQueryCount += 1;
        return null;
      }
    }
  } as unknown as Parameters<typeof resolveHistoryProfileWhere>[0];
  const accountSubject = { mode: "ACCOUNT", userId: "user-a", learnerId: null } as const;

  for (const profile of ["", " all", "all ", "creator", "learner:", "learner:a:extra", ["all", "account"]]) {
    await assert.rejects(
      resolveHistoryProfileWhere(prisma, accountSubject, profile),
      (error: unknown) => {
        const candidate = error as { code?: number; message?: string; getStatus?: () => number };
        return candidate.code === 40001
          && candidate.message === "学习者筛选无效"
          && candidate.getStatus?.() === 400;
      }
    );
  }
  assert.equal(ownershipQueryCount, 0);

  await assert.rejects(resolveHistoryProfileWhere(prisma, accountSubject, "learner:foreign"));
  assert.equal(ownershipQueryCount, 1);
});

test("隔离库清理阶段失败时仍执行全部后续阶段并聚合原错误", async () => {
  const stageNames = [
    "app-close",
    "row-cleanup",
    "prisma-disconnect",
    "terminate",
    "drop",
    "absence-count",
    "admin-end"
  ];

  for (const failedStage of stageNames) {
    const calls: string[] = [];
    const originalError = new Error(`failure:${failedStage}`);
    await assert.rejects(
      runCleanupStages(stageNames.map((name) => ({
        name,
        async run() {
          calls.push(name);
          if (name === failedStage) throw originalError;
        }
      }))),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.errors.length, 1);
        assert.equal((error.errors[0] as Error).cause, originalError);
        return true;
      }
    );
    assert.deepEqual(calls, stageNames);
  }
});

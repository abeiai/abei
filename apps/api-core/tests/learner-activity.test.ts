import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { PrismaClient } from "@xueleai/database";

import { AiService } from "../src/ai/ai.service.js";
import { AudioService } from "../src/audio/audio.service.js";
import { AppException } from "../src/common/app-exception.js";
import { CopybooksService } from "../src/copybooks/copybooks.service.js";
import { EnglishGuidedStudyService } from "../src/english-guided-study/english-guided-study.service.js";
import { LearningFlashcardsService } from "../src/learning-flashcards/learning-flashcards.service.js";
import { LearnerAccessService } from "../src/profiles/learner-access.service.js";
import { LearnerActivityService } from "../src/profiles/learner-activity.service.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { VideoGuideService } from "../src/video-guide/video-guide.service.js";

const learnerSubject: ProfileSubject = {
  userId: "user-1",
  mode: "LEARNER",
  learnerId: "learner-1"
};
const accountSubject: ProfileSubject = { userId: "user-1", mode: "ACCOUNT", learnerId: null };

type CapturedEvent = {
  id: string;
  userId: string;
  learnerId: string;
  eventType: string;
  scenarioId: string | null;
  courseId: string | null;
  courseRevisionId: string | null;
  courseRevisionItemId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  materialType: "VIDEO_GUIDE" | "ENGLISH_GUIDED_STUDY" | "LEARNING_FLASHCARD" | null;
  materialId: string | null;
  contentVersion: string | null;
  partKey: string | null;
  itemKey: string | null;
  idempotencyKey: string | null;
  occurredAt: Date;
  metrics: unknown;
  createdAt: Date;
};

function activityFixture() {
  const events: CapturedEvent[] = [];
  const calls: Array<{ client: "default" | "transaction"; method: "create" | "upsert"; args: unknown }> = [];

  const client = (clientName: "default" | "transaction") => ({
    learnerActivityEvent: {
      create: async (args: { data: Omit<CapturedEvent, "id" | "createdAt"> }) => {
        calls.push({ client: clientName, method: "create", args });
        const event = {
          id: `event-${events.length + 1}`,
          createdAt: new Date("2026-08-14T08:00:00.000Z"),
          ...args.data
        } satisfies CapturedEvent;
        events.push(event);
        return event;
      },
      upsert: async (args: {
        where: { idempotencyKey: string };
        update: Record<string, never>;
        create: Omit<CapturedEvent, "id" | "createdAt">;
      }) => {
        calls.push({ client: clientName, method: "upsert", args });
        const existing = events.find((event) => event.idempotencyKey === args.where.idempotencyKey);
        if (existing) return existing;
        const event = {
          id: `event-${events.length + 1}`,
          createdAt: new Date("2026-08-14T08:00:00.000Z"),
          ...args.create
        } satisfies CapturedEvent;
        events.push(event);
        return event;
      }
    }
  });

  const defaultClient = client("default");
  const transactionClient = client("transaction");

  return {
    calls,
    events,
    service: new LearnerActivityService(defaultClient as never),
    transactionClient
  };
}

test("相同幂等键只创建一条不可被重试覆盖的学习者活动", async () => {
  const fixture = activityFixture();
  const first = await fixture.service.record({
    subject: learnerSubject,
    eventType: "CREATE_COMPLETED",
    scenarioId: "scenario-1",
    resourceType: "AI_TASK",
    resourceId: "task-1",
    idempotencyKey: "ai-task:task-1:create-completed",
    occurredAt: new Date("2026-08-14T08:10:00.000Z"),
    metrics: { inputTokens: 0, outputTokens: 12, totalTokens: 120, status: "SUCCEEDED" }
  });
  const retried = await fixture.service.record({
    subject: learnerSubject,
    eventType: "CREATE_COMPLETED",
    scenarioId: "scenario-forged",
    resourceType: "AI_TASK",
    resourceId: "task-1",
    idempotencyKey: "ai-task:task-1:create-completed",
    occurredAt: new Date("2026-08-14T09:10:00.000Z"),
    metrics: { totalTokens: 999 }
  });

  assert.equal(fixture.events.length, 1);
  assert.equal(first?.id, retried?.id);
  assert.equal(fixture.events[0]?.scenarioId, "scenario-1");
  assert.deepEqual(fixture.events[0]?.metrics, {
    inputTokens: 0,
    outputTokens: 12,
    totalTokens: 120,
    status: "SUCCEEDED"
  });
  assert.equal(fixture.events[0]?.occurredAt.toISOString(), "2026-08-14T08:10:00.000Z");
  assert.equal(fixture.calls.every((call) => call.method === "upsert"), true);
  assert.deepEqual((fixture.calls[0]?.args as { update: unknown }).update, {});
});

test("真实 Prisma 并发重试只保留首个不可变事件", {
  skip: !process.env.LEARNER_ACTIVITY_TEST_DATABASE_URL
}, async () => {
  const requireFromDatabasePackage = createRequire(
    new URL("../../../packages/database/package.json", import.meta.url)
  );
  const { PrismaPg } = requireFromDatabasePackage("@prisma/adapter-pg");
  const databaseUrl = process.env.LEARNER_ACTIVITY_TEST_DATABASE_URL!;
  const schema = `task9_activity_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^task9_activity_[a-f0-9]{32}$/);
  const admin = new PrismaClient({ adapter: new PrismaPg(databaseUrl, { schema: "public" }) });
  const isolated = new PrismaClient({ adapter: new PrismaPg(databaseUrl, { schema }) });
  let initialSchemaCount: number | null = null;

  try {
    const initialRows = await admin.$queryRawUnsafe<Array<{ count: number }>>(`
      SELECT count(*)::int AS count
      FROM information_schema.schemata
      WHERE schema_name ~ '^task9_activity_[a-f0-9]{32}$'
    `);
    initialSchemaCount = initialRows[0]?.count ?? 0;
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await admin.$executeRawUnsafe(`
      CREATE TYPE "${schema}"."LearnerActivityEventType" AS ENUM (
        'CREATE_STARTED', 'CREATE_COMPLETED', 'LEARNING_STARTED', 'LEARNING_COMPLETED', 'REVIEW_COMPLETED'
      )
    `);
    await admin.$executeRawUnsafe(`
      CREATE TABLE "${schema}"."learner_activity_events" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "learnerId" TEXT NOT NULL,
        "eventType" "${schema}"."LearnerActivityEventType" NOT NULL,
        "scenarioId" TEXT,
        "courseId" TEXT,
        "resourceType" TEXT,
        "resourceId" TEXT,
        "idempotencyKey" TEXT UNIQUE,
        "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "metrics" JSONB,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const service = new LearnerActivityService(isolated);
    const key = `ai-task:${randomUUID()}:create-completed`;
    const firstOccurredAt = new Date("2026-08-14T08:10:00.000Z");
    await service.record({
      subject: learnerSubject,
      eventType: "CREATE_COMPLETED",
      scenarioId: null,
      resourceType: "AI_TASK",
      resourceId: "task-concurrent",
      idempotencyKey: key,
      occurredAt: firstOccurredAt,
      metrics: { status: "SUCCEEDED", totalTokens: 120 }
    });

    await Promise.all(Array.from({ length: 12 }, (_, index) => service.record({
      subject: learnerSubject,
      eventType: "CREATE_COMPLETED",
      scenarioId: null,
      resourceType: "AI_TASK",
      resourceId: "task-concurrent",
      idempotencyKey: key,
      occurredAt: new Date(firstOccurredAt.getTime() + (index + 1) * 1_000),
      metrics: { status: "SUCCEEDED", totalTokens: 900 + index }
    })));

    const rows = await isolated.learnerActivityEvent.findMany({ where: { idempotencyKey: key } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.userId, "user-1");
    assert.equal(rows[0]?.learnerId, "learner-1");
    assert.equal(rows[0]?.occurredAt.toISOString(), firstOccurredAt.toISOString());
    assert.deepEqual(rows[0]?.metrics, { status: "SUCCEEDED", totalTokens: 120 });
  } finally {
    try {
      await isolated.$disconnect();
    } finally {
      try {
        await admin.$disconnect();
      } finally {
        const cleanupAdmin = new PrismaClient({
          adapter: new PrismaPg(databaseUrl, { schema: "public" })
        });
        try {
          await cleanupAdmin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
          const exactRows = await cleanupAdmin.$queryRawUnsafe<Array<{ schema_name: string }>>(`
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name = '${schema}'
          `);
          assert.deepEqual(exactRows, []);
          if (initialSchemaCount !== null) {
            const finalRows = await cleanupAdmin.$queryRawUnsafe<Array<{ count: number }>>(`
              SELECT count(*)::int AS count
              FROM information_schema.schemata
              WHERE schema_name ~ '^task9_activity_[a-f0-9]{32}$'
            `);
            assert.equal(finalRows[0]?.count ?? 0, initialSchemaCount);
          }
        } finally {
          await cleanupAdmin.$disconnect();
        }
      }
    }
  }
});

test("账号和未选择身份都不会创建学习者活动", async () => {
  const fixture = activityFixture();

  assert.equal(await fixture.service.record({ subject: accountSubject, eventType: "CREATE_STARTED" }), null);
  assert.equal(await fixture.service.record({
    subject: { userId: "user-1", mode: "UNSELECTED", learnerId: null } as never,
    eventType: "CREATE_STARTED"
  }), null);
  assert.equal(fixture.events.length, 0);
});

test("事件所有者和学习者只从受信任主体派生", async () => {
  const fixture = activityFixture();

  await fixture.service.record({
    subject: learnerSubject,
    eventType: "CREATE_STARTED",
    resourceType: "AUDIO_TASK",
    resourceId: "audio-1",
    userId: "user-forged",
    learnerId: "learner-forged"
  } as never);

  assert.equal(fixture.events[0]?.userId, "user-1");
  assert.equal(fixture.events[0]?.learnerId, "learner-1");
  assert.equal(Object.hasOwn(fixture.events[0] ?? {}, "subject"), false);
});

test("经服务端验证的材料上下文写入活动事件", async () => {
  const fixture = activityFixture();

  await fixture.service.record({
    subject: learnerSubject,
    eventType: "NODE_LEARNED",
    courseId: "course-1",
    courseRevisionId: "revision-1",
    courseRevisionItemId: "item-1",
    materialType: "VIDEO_GUIDE",
    materialId: "video-1",
    contentVersion: "approved-version-1",
    partKey: "GUIDED",
    itemKey: "node-1"
  });

  assert.deepEqual(
    {
      courseRevisionId: fixture.events[0]?.courseRevisionId,
      courseRevisionItemId: fixture.events[0]?.courseRevisionItemId,
      materialType: fixture.events[0]?.materialType,
      materialId: fixture.events[0]?.materialId,
      contentVersion: fixture.events[0]?.contentVersion,
      partKey: fixture.events[0]?.partKey,
      itemKey: fixture.events[0]?.itemKey
    },
    {
      courseRevisionId: "revision-1",
      courseRevisionItemId: "item-1",
      materialType: "VIDEO_GUIDE",
      materialId: "video-1",
      contentVersion: "approved-version-1",
      partKey: "GUIDED",
      itemKey: "node-1"
    }
  );
});

test("显式事务客户端承载事件写入而默认客户端不参与", async () => {
  const fixture = activityFixture();

  await fixture.service.record({
    subject: learnerSubject,
    eventType: "CREATE_STARTED",
    resourceType: "AI_TASK",
    resourceId: "task-transaction"
  }, fixture.transactionClient as never);

  assert.deepEqual(fixture.calls.map((call) => call.client), ["transaction"]);
});

test("低敏指标之外的正文、嵌套对象、数组、非有限数值和超限字段均在写库前拒绝", async () => {
  const invalidMetrics = [
    { body: "这是一段".repeat(30) },
    { prompt: "short prompt" },
    { password: "PASSWORD" },
    { password: 123456 },
    { accessToken: "TOKEN" },
    { accessToken: 123456 },
    { cookie: true },
    { secret: false },
    { transcript: "TRANSCRIPT" },
    { note: "PASSWORD" },
    { password: null },
    { inputTokens: true },
    { outputTokens: -1 },
    { totalTokens: 1.5 },
    { inputTokens: Number.POSITIVE_INFINITY },
    { outputTokens: 1_000_000_001 },
    { totalTokens: Number.MAX_SAFE_INTEGER + 1 },
    { cardCount: -1 },
    { pageCount: 1.5 },
    { narrationNodeCount: true },
    { nested: { score: 1 } },
    { values: [1, 2, 3] },
    { invalid: Number.POSITIVE_INFINITY },
    Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`metric${index}`, index]))
  ];

  for (const metrics of invalidMetrics) {
    const fixture = activityFixture();
    await assert.rejects(
      fixture.service.record({
        subject: learnerSubject,
        eventType: "CREATE_COMPLETED",
        metrics: metrics as never
      }),
      (error: AppException) => error.message === "学习活动指标不符合低敏数据要求"
    );
    assert.equal(fixture.events.length, 0);
  }
});

test("资源定位和幂等键长度在写库前受限", async () => {
  for (const input of [
    { resourceType: "x".repeat(81) },
    { resourceId: "x".repeat(81) },
    { idempotencyKey: "" },
    { idempotencyKey: "x".repeat(161) }
  ]) {
    const fixture = activityFixture();
    await assert.rejects(
      fixture.service.record({ subject: learnerSubject, eventType: "CREATE_STARTED", ...input }),
      (error: AppException) => error.message === "学习活动资源参数不正确"
    );
    assert.equal(fixture.events.length, 0);
  }
});

type RecentSource = "aiTask" | "audioTask" | "videoGuideLesson" | "englishGuidedStudyMaterial"
  | "learningFlashcardDeck" | "copybookRecord";

function homeFixture(options: { active?: boolean; empty?: boolean } = {}) {
  const queryArgs = new Map<RecentSource, unknown>();
  const authorizationArgs = new Map<"courses" | "scenarios", unknown>();
  const activityCountArgs: unknown[] = [];
  const activityLatestArgs: unknown[] = [];
  const baseTime = new Date("2026-08-14T12:00:00.000Z").getTime();
  const dates = (offset: number) => new Date(baseTime - offset * 60_000);
  const recentRows = {
    aiTask: Array.from({ length: 5 }, (_, index) => ({
      id: `ai-${index}`,
      status: index === 0 ? "SUCCEEDED" : "RUNNING",
      scenarioId: index === 0 ? "scenario-revoked" : "scenario-chat",
      scenario: index === 0
        ? { name: "已撤销应用", slug: "revoked-tool" }
        : { name: "AI 对话", slug: "experience-ai-chat" },
      input: { prompt: "不得返回" },
      output: "不得返回",
      createdAt: dates(index * 6)
    })),
    audioTask: Array.from({ length: 5 }, (_, index) => ({
      id: `audio-${index}`,
      type: "TTS",
      status: "SUCCEEDED",
      scenarioId: "scenario-voice",
      scenario: { name: "文章转语音", slug: "article-to-speech" },
      providerPayload: { secret: "不得返回" },
      createdAt: dates(index * 6 + 1)
    })),
    videoGuideLesson: Array.from({ length: 5 }, (_, index) => ({
      id: `video-${index}`,
      title: `视频导学 ${index}`,
      status: "SUCCEEDED",
      content: { sourceText: "不得返回" },
      createdAt: dates(index * 6 + 2)
    })),
    englishGuidedStudyMaterial: Array.from({ length: 5 }, (_, index) => ({
      id: `english-${index}`,
      title: `英文带学 ${index}`,
      audioUrl: index === 0 ? "https://cdn.example/audio.mp3" : null,
      sourceText: "不得返回",
      content: { generated: "不得返回" },
      createdAt: dates(index * 6 + 3)
    })),
    learningFlashcardDeck: Array.from({ length: 5 }, (_, index) => ({
      id: `deck-${index}`,
      title: `学习闪卡 ${index}`,
      status: "READY",
      sourceText: "不得返回",
      createdAt: dates(index * 6 + 4)
    })),
    copybookRecord: Array.from({ length: 5 }, (_, index) => ({
      id: `copybook-${index}`,
      templateName: `字帖 ${index}`,
      contentPreview: "不得返回",
      createdAt: dates(index * 6 + 5)
    }))
  };
  const scenarios = options.empty ? [] : [
    {
      learnerId: "learner-1",
      scenarioId: "scenario-chat",
      scenario: {
        id: "scenario-chat",
        name: "AI 对话",
        slug: "experience-ai-chat",
        description: "对话应用",
        isEnabled: true,
        toolCategory: null
      }
    },
    {
      learnerId: "learner-1",
      scenarioId: "scenario-voice",
      scenario: {
        id: "scenario-voice",
        name: "文章转语音",
        slug: "article-to-speech",
        description: "语音应用",
        isEnabled: true,
        toolCategory: null
      }
    },
    {
      learnerId: "learner-1",
      scenarioId: "scenario-flashcards",
      scenario: {
        id: "scenario-flashcards",
        name: "学习闪卡",
        slug: "learning-flashcards-deck",
        description: "闪卡应用",
        isEnabled: true,
        toolCategory: null
      }
    }
  ];
  const courses = options.empty ? [] : [{
    learnerId: "learner-1",
    courseId: "course-1",
    course: {
      id: "course-1",
      userId: "user-1",
      approvedRevisionId: "revision-1",
      publishedAt: new Date("2026-08-13T08:00:00.000Z"),
      approvedRevision: {
        id: "revision-1",
        name: "语文课程",
        summary: "课程摘要",
        tags: ["语文"],
        coverMedia: { url: "https://cdn.example/course.png", filename: "course.png", storageProvider: "LOCAL" }
      },
      enrollments: []
    }
  }];

  const prisma: Record<string, unknown> = {
    learner: {
      findFirst: async ({ where }: { where: { id: string; userId: string; status: string } }) => (
        options.active === false
        || where.id !== "learner-1"
        || where.userId !== "user-1"
        || where.status !== "ACTIVE"
          ? null
          : {
              id: "learner-1",
              userId: "user-1",
              nickname: "小明",
              grade: "GRADE_2",
              avatarUrl: null,
              status: "ACTIVE"
            }
      )
    },
    learnerScenarioAuthorization: {
      findMany: async (args: unknown) => {
        authorizationArgs.set("scenarios", args);
        return scenarios;
      }
    },
    learnerCourseAuthorization: {
      findMany: async (args: unknown) => {
        authorizationArgs.set("courses", args);
        return courses;
      }
    },
    learnerActivityEvent: {
      count: async (args: { where: { occurredAt?: unknown } }) => {
        activityCountArgs.push(args);
        if (options.empty) return 0;
        return args.where.occurredAt ? 2 : 8;
      },
      findFirst: async (args: unknown) => {
        activityLatestArgs.push(args);
        return options.empty ? null : { occurredAt: new Date("2026-08-14T11:30:00.000Z") };
      }
    }
  };

  for (const source of Object.keys(recentRows) as RecentSource[]) {
    prisma[source] = {
      findMany: async (args: { take: number }) => {
        queryArgs.set(source, args);
        return options.empty ? [] : recentRows[source].slice(0, args.take);
      }
    };
  }

  return {
    activityCountArgs,
    activityLatestArgs,
    authorizationArgs,
    queryArgs,
    service: new LearnerAccessService(prisma as never)
  };
}

test("学习者首页逐表按所有者和当前学习者各取五条并稳定合并前十二条", async () => {
  const fixture = homeFixture();
  const result = await fixture.service.listAuthorizedHome(learnerSubject);

  for (const source of [
    "aiTask",
    "audioTask",
    "videoGuideLesson",
    "englishGuidedStudyMaterial",
    "learningFlashcardDeck",
    "copybookRecord"
  ] as RecentSource[]) {
    const args = fixture.queryArgs.get(source) as {
      where: unknown;
      take: number;
      orderBy: unknown;
    };
    assert.deepEqual(args.where, { userId: "user-1", learnerId: "learner-1" });
    assert.equal(args.take, 5);
    assert.deepEqual(args.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  }

  assert.deepEqual(result.learner, {
    id: "learner-1",
    nickname: "小明",
    grade: "GRADE_2",
    gradeLabel: "二年级",
    avatarUrl: null
  });
  assert.equal("statistics" in result, false);
  assert.equal(fixture.activityCountArgs.length, 0);
  assert.equal(fixture.activityLatestArgs.length, 0);
  assert.deepEqual(
    await fixture.service.listLearningStatistics(learnerSubject),
    {
      completedActivityCount: 8,
      recentCompletedActivityCount: 2,
      lastActivityAt: "2026-08-14T11:30:00.000Z"
    }
  );
  assert.equal(fixture.activityCountArgs.length, 2);
  assert.equal(fixture.activityLatestArgs.length, 1);
  const [allCompleted, recentCompleted] = fixture.activityCountArgs as Array<{
    where: {
      userId: string;
      learnerId: string;
      eventType: { in: string[] };
      occurredAt?: { gte: Date };
    };
  }>;
  assert.deepEqual(allCompleted?.where, {
    userId: "user-1",
    learnerId: "learner-1",
    eventType: { in: ["CREATE_COMPLETED", "LEARNING_COMPLETED", "REVIEW_COMPLETED"] }
  });
  assert.deepEqual(recentCompleted?.where.userId, "user-1");
  assert.deepEqual(recentCompleted?.where.learnerId, "learner-1");
  assert.deepEqual(recentCompleted?.where.eventType, {
    in: ["CREATE_COMPLETED", "LEARNING_COMPLETED", "REVIEW_COMPLETED"]
  });
  assert.ok(recentCompleted?.where.occurredAt?.gte instanceof Date);
  assert.deepEqual(
    (fixture.authorizationArgs.get("scenarios") as { where: unknown }).where,
    { learnerId: "learner-1" }
  );
  assert.deepEqual(
    (fixture.authorizationArgs.get("courses") as { where: unknown }).where,
    {
      learnerId: "learner-1",
      course: {
        approvedRevisionId: { not: null },
        publishedAt: { not: null }
      }
    }
  );
  assert.equal(result.recentRecords.length, 12);
  assert.deepEqual(result.recentRecords.map((record) => record.id), [
    "ai-0",
    "audio-0",
    "video-0",
    "english-0",
    "deck-0",
    "copybook-0",
    "ai-1",
    "audio-1",
    "video-1",
    "english-1",
    "deck-1",
    "copybook-1"
  ]);
});

test("学习者首页只返回最小安全投影且已撤权记录不生成详情绕过链接", async () => {
  const result = await homeFixture().service.listAuthorizedHome(learnerSubject);
  const expectedKeys = ["createdAt", "href", "id", "status", "title", "type"];

  for (const record of result.recentRecords) {
    assert.deepEqual(Object.keys(record).sort(), expectedKeys);
    assert.equal(record.href.startsWith("/"), true);
    assert.equal(record.href.startsWith("/dashboard"), false);
    assert.equal(JSON.stringify(record).includes("不得返回"), false);
  }

  const revoked = result.recentRecords.find((record) => record.id === "ai-0");
  const privateFlashcards = result.recentRecords.find((record) => record.id === "deck-0");
  assert.equal(revoked?.href, "/learn");
  assert.equal(privateFlashcards?.href, "/flashcard/deck-0");
});

test("学习者首页空授权和空历史不回退到公开内容", async () => {
  const fixture = homeFixture({ empty: true });
  const result = await fixture.service.listAuthorizedHome(learnerSubject);

  assert.deepEqual(result.scenarios, []);
  assert.deepEqual(result.courses, []);
  assert.deepEqual(result.recentRecords, []);
  assert.deepEqual(await fixture.service.listLearningStatistics(learnerSubject), {
    completedActivityCount: 0,
    recentCompletedActivityCount: 0,
    lastActivityAt: null
  });
});

test("学习者首页每次重新验证有效学习者并拒绝已停用身份", async () => {
  await assert.rejects(
    homeFixture({ active: false }).service.listAuthorizedHome(learnerSubject),
    (error: AppException) => error.message === "当前学习者身份已失效"
  );
});

test("学习者首页控制器只接受服务端解析出的学习者身份", async () => {
  let homeCalls = 0;
  const controller = new ProfilesController(
    { me: async () => ({ id: "user-1" }) } as never,
    { requireSelected: async () => accountSubject } as never,
    {} as never,
    { listAuthorizedHome: async () => {
      homeCalls += 1;
      return {};
    } } as never,
    {} as never
  );

  await assert.rejects(
    controller.learnerHome({} as never),
    (error: AppException) => error.message === "请使用学习者身份访问学习首页"
  );
  assert.equal(homeCalls, 0);
});

function transactionalActivityRecorder() {
  const events = new Map<string, Record<string, unknown>>();
  const writes: Array<{ transactionId: number; data: Record<string, unknown> }> = [];
  const defaultClient = {
    learnerActivityEvent: {
      create: async () => {
        throw new Error("活动事件必须使用业务事务客户端");
      },
      upsert: async () => {
        throw new Error("活动事件必须使用业务事务客户端");
      }
    }
  };
  const service = new LearnerActivityService(defaultClient as never);

  return {
    events,
    service,
    writes,
    delegate(transactionId: number) {
      return {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const id = `event-${events.size + 1}`;
          const event = { id, ...data };
          events.set(id, event);
          writes.push({ transactionId, data });
          return event;
        },
        upsert: async ({ where, create }: {
          where: { idempotencyKey: string };
          create: Record<string, unknown>;
        }) => {
          const existing = events.get(where.idempotencyKey);
          if (existing) return existing;
          const event = { id: `event-${events.size + 1}`, ...create };
          events.set(where.idempotencyKey, event);
          writes.push({ transactionId, data: create });
          return event;
        }
      };
    }
  };
}

test("内部 AI 任务的开始和首次成功事件与对应根记录变更处于同一事务", async () => {
  const recorder = transactionalActivityRecorder();
  const operations: Array<{ transactionId: number; action: string; taskId: string }> = [];
  let transactionId = 0;
  const taskState: Record<string, unknown> = {};
  const scenario = {
    id: "scenario-child",
    name: "学习生成",
    slug: "video-guide-practice-questions",
    costCredits: 0,
    modelBinding: null
  };
  const transaction = (id: number) => ({
    aiTask: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        operations.push({ transactionId: id, action: "create", taskId: "ai-task-1" });
        Object.assign(taskState, data, { id: "ai-task-1" });
        return { id: "ai-task-1", ...data };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        operations.push({ transactionId: id, action: `update:${String(data.status)}`, taskId: where.id });
        Object.assign(taskState, data);
        return { id: where.id, ...taskState };
      }
    },
    learnerActivityEvent: recorder.delegate(id)
  });
  const prisma = {
    aiScenario: { findFirst: async () => scenario },
    aiTask: {
      create: async (args: never) => transaction(0).aiTask.create(args),
      update: async (args: never) => transaction(0).aiTask.update(args)
    },
    $transaction: async (callback: (client: ReturnType<typeof transaction>) => Promise<unknown>) => {
      transactionId += 1;
      return callback(transaction(transactionId));
    }
  };
  const service = new AiService({} as never, {
    assertInternalScenarioAuthorized: async () => undefined
  } as never);
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma,
    learnerActivityService: recorder.service,
    ensureVideoGuidePracticeQuestionsScenario: async () => scenario,
    preparePromptInput: async () => ({
      renderedPrompt: "prompt",
      variables: {},
      knowledgeBaseId: null,
      knowledgeContext: ""
    }),
    getModelForScenario: async () => null,
    shouldSaveFullAiContent: async () => false,
    generateTextWithFallback: async () => ({
      text: "完成",
      provider: null,
      model: null,
      usage: { totalTokens: 12 }
    })
  });

  await service.generateScenarioTextForExternalBilling({
    userId: "user-1",
    learnerId: "learner-1",
    rootScenarioId: "scenario-root",
    scenarioSlug: "video-guide-practice-questions",
    input: "学习"
  });

  assert.deepEqual(recorder.writes.map((write) => write.data.idempotencyKey), [
    "ai-task:ai-task-1:create-started",
    "ai-task:ai-task-1:create-completed"
  ]);
  const created = operations.find((operation) => operation.action === "create");
  const completed = operations.find((operation) => operation.action === "update:SUCCEEDED");
  assert.equal(recorder.writes[0]?.transactionId, created?.transactionId);
  assert.equal(recorder.writes[1]?.transactionId, completed?.transactionId);
  assert.equal(recorder.writes.every((write) => write.transactionId > 0), true);
  assert.equal(recorder.writes[1]?.data.userId, "user-1");
  assert.equal(recorder.writes[1]?.data.learnerId, "learner-1");
});

test("失败的内部 AI 任务只保留开始事件而不写完成事件", async () => {
  const recorder = transactionalActivityRecorder();
  let transactionId = 0;
  const transaction = (id: number) => ({
    aiTask: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "ai-failed", ...data }),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data })
    },
    learnerActivityEvent: recorder.delegate(id)
  });
  const service = new AiService({} as never, {
    assertInternalScenarioAuthorized: async () => undefined
  } as never);
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: {
      aiScenario: {
        findFirst: async () => ({
          id: "scenario-child",
          name: "学习生成",
          slug: "video-guide-practice-questions",
          costCredits: 0,
          modelBinding: null
        })
      },
      aiTask: {
        create: async (args: never) => transaction(0).aiTask.create(args),
        update: async (args: never) => transaction(0).aiTask.update(args)
      },
      $transaction: async (callback: (client: ReturnType<typeof transaction>) => Promise<unknown>) => {
        transactionId += 1;
        return callback(transaction(transactionId));
      }
    },
    learnerActivityService: recorder.service,
    ensureVideoGuidePracticeQuestionsScenario: async () => ({
      id: "scenario-child",
      name: "学习生成",
      slug: "video-guide-practice-questions",
      costCredits: 0,
      modelBinding: null
    }),
    preparePromptInput: async () => ({ renderedPrompt: "prompt", variables: {}, knowledgeBaseId: null, knowledgeContext: "" }),
    getModelForScenario: async () => null,
    shouldSaveFullAiContent: async () => false,
    generateTextWithFallback: async () => {
      throw new Error("provider failed");
    }
  });

  await assert.rejects(service.generateScenarioTextForExternalBilling({
    userId: "user-1",
    learnerId: "learner-1",
    rootScenarioId: "scenario-root",
    scenarioSlug: "video-guide-practice-questions",
    input: "学习"
  }));
  assert.deepEqual(recorder.writes.map((write) => write.data.idempotencyKey), [
    "ai-task:ai-failed:create-started"
  ]);
});

test("外部计费音频任务创建时在同一事务写入持久化学习者的开始事件", async () => {
  const recorder = transactionalActivityRecorder();
  const operations: Array<{ transactionId: number; action: string }> = [];
  let transactionId = 0;
  const transaction = (id: number) => ({
    audioTask: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        operations.push({ transactionId: id, action: "create" });
        return { id: "audio-1", ...data };
      }
    },
    learnerActivityEvent: recorder.delegate(id)
  });
  const service = new AudioService();
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: {
      audioTask: { create: async (args: never) => transaction(0).audioTask.create(args) },
      $transaction: async (callback: (client: ReturnType<typeof transaction>) => Promise<unknown>) => {
        transactionId += 1;
        return callback(transaction(transactionId));
      }
    },
    learnerActivityService: recorder.service,
    ensureDashScopeAudioDefaults: async () => undefined,
    resolvePreferredTtsModel: async () => ({ modelNames: [], label: "默认音色" }),
    getModelByAlias: async () => ({
      providerName: "provider",
      providerKey: "provider",
      modelName: "model",
      providerInstanceId: "provider-instance",
      modelInstanceId: "model-instance"
    }),
    resolveVoice: async () => ({ providerVoiceId: "voice", voiceAssetId: null }),
    executeTtsTask: async () => ({ id: "audio-1", status: "SUCCEEDED" })
  });

  await service.synthesizeTtsForExternalBilling({
    userId: "user-1",
    learnerId: "learner-1",
    rootScenarioId: "scenario-root"
  }, {
    text: "学习内容",
    source: "ENGLISH_GUIDED_STUDY"
  });

  assert.equal(operations[0]?.transactionId > 0, true);
  assert.equal(recorder.writes[0]?.transactionId, operations[0]?.transactionId);
  assert.equal(recorder.writes[0]?.data.idempotencyKey, "audio-task:audio-1:create-started");
  assert.equal(recorder.writes[0]?.data.learnerId, "learner-1");
});

test("音频任务仅在首次成功状态迁移的同一事务写入完成事件", async () => {
  const recorder = transactionalActivityRecorder();
  const operations: Array<{ transactionId: number; action: string }> = [];
  let transactionId = 0;
  const task = {
    id: "audio-completed",
    userId: "user-1",
    learnerId: "learner-persisted",
    scenarioId: "scenario-root",
    status: "PROCESSING",
    billingContext: "PERSONAL",
    estimatedCredits: 0,
    reservation: null,
    providerPayload: null
  };
  const transaction = (id: number) => ({
    audioTask: {
      findUnique: async () => ({ ...task }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (task.status !== "PROCESSING") return { count: 0 };
        operations.push({ transactionId: id, action: `update:${String(data.status)}` });
        Object.assign(task, data);
        return { count: 1 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(task, data);
        return { ...task };
      }
    },
    learnerActivityEvent: recorder.delegate(id)
  });
  const service = new AudioService();
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: {
      audioTask: { findUnique: async () => ({ ...task }) },
      $transaction: async (callback: (client: ReturnType<typeof transaction>) => Promise<unknown>) => {
        transactionId += 1;
        return callback(transaction(transactionId));
      }
    },
    learnerActivityService: recorder.service,
    createOutputAudioAsset: async () => null,
    writeAudioUsageLog: async () => undefined,
    getTaskForExecution: async () => ({ id: task.id, status: task.status })
  });
  const settle = (service as unknown as {
    settleSuccessfulAudioTask(id: string, payload: Record<string, unknown>): Promise<unknown>;
  }).settleSuccessfulAudioTask.bind(service);

  await Promise.all([
    settle(task.id, { requestId: "provider-request" }),
    settle(task.id, { requestId: "provider-retry" })
  ]);

  assert.deepEqual(recorder.writes.map((write) => write.data.idempotencyKey), [
    "audio-task:audio-completed:create-completed"
  ]);
  assert.equal(recorder.writes[0]?.transactionId, operations[0]?.transactionId);
  assert.equal(recorder.writes[0]?.data.learnerId, "learner-persisted");
  assert.equal(operations.length, 1);
});

test("失败或取消的零点音频任务不能被旧成功回调覆盖且不写完成事件", async () => {
  for (const terminalStatus of ["FAILED", "CANCELLED", "COMPENSATED"] as const) {
    const recorder = transactionalActivityRecorder();
    let transactionId = 0;
    const task = {
      id: `audio-${terminalStatus.toLowerCase()}`,
      userId: "user-1",
      learnerId: "learner-persisted",
      scenarioId: "scenario-root",
      status: terminalStatus,
      billingContext: "PERSONAL",
      estimatedCredits: 0,
      reservation: null,
      providerPayload: null
    };
    const transaction = (id: number) => ({
      audioTask: {
        findUnique: async () => ({ ...task }),
        updateMany: async () => ({ count: 0 }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(task, data);
          return { ...task };
        }
      },
      learnerActivityEvent: recorder.delegate(id)
    });
    const service = new AudioService();
    Object.assign(service as unknown as Record<string, unknown>, {
      prisma: {
        audioTask: { findUnique: async () => ({ ...task }) },
        $transaction: async (callback: (client: ReturnType<typeof transaction>) => Promise<unknown>) => {
          transactionId += 1;
          return callback(transaction(transactionId));
        }
      },
      learnerActivityService: recorder.service,
      createOutputAudioAsset: async () => null,
      writeAudioUsageLog: async () => undefined,
      getTaskForExecution: async () => ({ id: task.id, status: task.status })
    });

    await (service as unknown as {
      settleSuccessfulAudioTask(id: string, payload: Record<string, unknown>): Promise<unknown>;
    }).settleSuccessfulAudioTask(task.id, { requestId: "late-success" });

    assert.equal(task.status, terminalStatus);
    assert.equal(recorder.writes.length, 0);
  }
});

test("视频导学仅在持久化任务首次成功迁移的同一事务写入完成事件", async () => {
  const recorder = transactionalActivityRecorder();
  const operations: Array<{ transactionId: number; action: string }> = [];
  let transactionId = 0;
  const job = {
    version: 1 as const,
    jobId: "video-job-1",
    attemptId: "video-attempt-1",
    operation: "NARRATION_TTS" as const,
    operationKey: "video-operation-1",
    estimatedCredits: 0,
    input: {
      narrationTtsModelAlias: "tts-default",
      narrationVoice: "default-voice"
    },
    createdAt: "2026-08-14T08:00:00.000Z"
  };
  const draft = {
    id: "intro",
    type: "INTRO" as const,
    title: "导入",
    script: "今天学习重点内容。",
    chunks: []
  };
  const lesson = {
    id: "video-1",
    userId: "user-1",
    learnerId: "learner-persisted",
    status: "GENERATING",
    content: {
      narrationDraftTimeline: [draft],
      narrationTtsGenerationJob: job
    }
  };
  const transaction = (id: number) => ({
    videoGuideLesson: {
      findFirst: async () => ({ ...lesson }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        operations.push({ transactionId: id, action: `update:${String(data.status)}` });
        if (lesson.status !== "GENERATING") return { count: 0 };
        Object.assign(lesson, data);
        return { count: 1 };
      }
    },
    learnerActivityEvent: recorder.delegate(id)
  });
  const service = new VideoGuideService({} as never, {} as never, undefined, undefined);
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: {
      $transaction: async (callback: (client: ReturnType<typeof transaction>) => Promise<unknown>) => {
        transactionId += 1;
        return callback(transaction(transactionId));
      }
    },
    learnerActivityService: recorder.service,
    claimLessonOperation: async () => ({ job, lesson: { ...lesson } }),
    synthesizeNarrationTimeline: async () => ({
      nodes: [{
        ...draft,
        audioTaskId: "audio-1",
        audioAssetId: "asset-1",
        audioUrl: "https://cdn.example/audio.mp3",
        audioObjectKey: "audio.mp3",
        audioSizeBytes: 100,
        audioSha256: "sha256",
        durationMs: 1_000
      }],
      progress: { completed: 1, failed: 0, pending: 0, total: 1 }
    }),
    lockVideoGuideLesson: async () => undefined,
    nextOperationProgress: () => ({ status: "SUCCEEDED" }),
    settleVideoGuideCredits: async () => undefined,
    recordCourseMaterialChange: async () => undefined
  });
  const run = (service as unknown as {
    runStoredNarrationTtsGeneration(
      id: string,
      attribution: { userId: string; learnerId: string | null; rootScenarioId: string | null }
    ): Promise<void>;
  }).runStoredNarrationTtsGeneration.bind(service);
  const attribution = {
    userId: "user-1",
    learnerId: "learner-persisted",
    rootScenarioId: "scenario-root"
  };

  await run(lesson.id, attribution);
  await run(lesson.id, attribution);

  assert.deepEqual(recorder.writes.map((write) => write.data.idempotencyKey), [
    "video-guide:video-1:create-completed"
  ]);
  assert.equal(recorder.writes[0]?.transactionId, operations[0]?.transactionId);
  assert.equal(recorder.writes[0]?.data.learnerId, "learner-persisted");
  assert.equal(operations.length, 1);
});

test("英文伴学内容持久化成功时在同一事务写入已存学习者的完成事件", async () => {
  const recorder = transactionalActivityRecorder();
  const operations: Array<{ transactionId: number; action: string }> = [];
  let transactionId = 0;
  const now = new Date("2026-08-14T08:00:00.000Z");
  const job = {
    version: 1 as const,
    jobId: "english-job-1",
    attemptId: "english-attempt-1",
    operation: "CONTENT" as const,
    operationKey: "english-operation-1",
    estimatedCredits: 0,
    input: {},
    createdAt: now.toISOString()
  };
  const material: Record<string, unknown> = {
    id: "english-1",
    userId: "user-1",
    learnerId: "learner-persisted",
    title: "旧标题",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Old text.",
    levelStandardName: "学段年级",
    levelOptionLabel: "二年级",
    aiLevel: "A1",
    summary: "",
    narration: "",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: { contentGenerationJob: job },
    pinnedAt: null,
    createdAt: now,
    updatedAt: now
  };
  const transaction = (id: number) => ({
    englishGuidedStudyMaterial: {
      findFirst: async () => ({ ...material }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        operations.push({ transactionId: id, action: "content:update" });
        Object.assign(material, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...material })
    },
    learnerActivityEvent: recorder.delegate(id)
  });
  const service = new EnglishGuidedStudyService({} as never, {} as never, {} as never, undefined);
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: {
      englishGuidedStudyMaterial: { findFirst: async () => ({ ...material }) },
      $transaction: async (callback: (client: ReturnType<typeof transaction>) => Promise<unknown>) => {
        transactionId += 1;
        return callback(transaction(transactionId));
      }
    },
    learnerActivityService: recorder.service,
    createBillingEstimate: async () => ({ estimatedCredits: 0, requestId: "request-12345678", revision: "revision-1" }),
    generateMaterialContent: async () => ({
      title: "新标题",
      summary: "摘要",
      narration: "讲解",
      audioDurationSeconds: 0,
      sentences: [],
      questions: []
    }),
    completedEnglishGuidedStudyOperationContent: ({ generatedContent }: { generatedContent: unknown }) => generatedContent,
    lockEnglishGuidedStudyMaterial: async () => undefined,
    settleEnglishGuidedStudyCredits: async () => undefined,
    cleanupNarrationAudioBestEffort: async () => undefined,
    cleanupReadAlongAudioBestEffort: async () => undefined,
    recordCourseMaterialChange: async () => undefined
  });

  await service.generateMaterial("user-1", {
    billingConfirmed: true,
    billingRequestId: "request-12345678",
    billingRevision: "revision-1",
    materialId: "english-1",
    title: "新标题",
    sourceType: "TEXT",
    sourceText: "Learning is useful.",
    levelStandardName: "学段年级",
    levelOptionLabel: "二年级",
    aiLevel: "A1"
  }, {
    attribution: {
      userId: "user-1",
      learnerId: "learner-persisted",
      rootScenarioId: "scenario-root"
    },
    billingAlreadyReserved: true,
    operationJob: job,
    targetMaterialId: "english-1"
  });

  assert.deepEqual(recorder.writes.map((write) => write.data.idempotencyKey), [
    "guided-study:english-1:create-completed"
  ]);
  assert.equal(recorder.writes[0]?.transactionId, operations[0]?.transactionId);
  assert.equal(recorder.writes[0]?.data.learnerId, "learner-persisted");
});

test("账号字帖在记录和扣点事务内调用统一活动记录器但不创建学习者事件", async () => {
  const previousEnv = {
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY
  };
  const originalFetch = globalThis.fetch;
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_BUCKET = "test-bucket";
  process.env.S3_ENDPOINT = "https://storage.example";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret";
  globalThis.fetch = async () => new Response(null, { status: 200 });
  const transaction = {
    copybookRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "copybook-1",
        createdAt: new Date("2026-08-14T08:00:00.000Z"),
        ...data
      })
    }
  };
  const activityCalls: Array<{ subject: ProfileSubject; transaction: unknown }> = [];
  const service = new CopybooksService(
    { renderPdf: async () => Buffer.from("pdf") } as never,
    {
      getWallet: async () => ({ availableCredits: 100 }),
      consumeCopybookGenerateCreditsInTransaction: async () => ({
        credits: 2,
        wallet: { availableCredits: 98 }
      })
    } as never,
    {
      record: async (input: { subject: ProfileSubject }, client: unknown) => {
        activityCalls.push({ subject: input.subject, transaction: client });
        return null;
      }
    } as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: {
      wallet: { findUnique: async () => ({ availableCredits: 100 }) },
      $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)
    }
  });

  try {
    await service.generate(accountSubject, {
      templateId: "calligraphy",
      content: "学习",
      layout: {
        pages: [{
          page: { width: 595, height: 842, margin: 40 },
          grid: {
            type: "fang", cell: 48, cellWidth: 48, cellHeight: 48,
            rowGap: 0, rows: 1, cols: 10, x: 40, y: 80
          },
          content: [],
          style: {
            strokeColor: "#2F8F6B", guideColor: "#BFE7D2", textColor: "#EF1D28",
            traceColor: "#FFB6BD", font: "serif", fontSize: 24
          }
        }]
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.deepEqual(activityCalls.map((call) => call.subject.mode), ["ACCOUNT"]);
  assert.equal(activityCalls[0]?.transaction, transaction);
});

test("闪卡卡组和复习完成事件与各自主记录写入使用同一事务", async () => {
  const recorder = transactionalActivityRecorder();
  const operations: Array<{ transactionId: number; action: string }> = [];
  let transactionId = 0;
  const now = new Date("2026-08-14T08:00:00.000Z");
  const deckRecord = {
    id: "deck-1",
    userId: "user-1",
    learnerId: "learner-1",
    title: "学习卡组",
    sourceType: "IMPORT",
    sourceName: "导入卡组",
    sourceText: "",
    textbookId: null,
    textbookRange: null,
    detailRequest: "",
    strategy: "SUBJECT_KNOWLEDGE",
    cardTypes: [],
    targetCardCount: 1,
    summary: "",
    knowledgeMap: [],
    status: "READY",
    aiTaskId: null,
    providerName: null,
    modelName: null,
    errorMessage: null,
    cards: [],
    reviews: [],
    textbook: null,
    aiTask: null,
    createdAt: now,
    updatedAt: now
  };
  const transaction = (id: number) => ({
    learningFlashcardDeck: {
      create: async () => {
        operations.push({ transactionId: id, action: "deck:create" });
        return deckRecord;
      }
    },
    learningFlashcardReview: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        operations.push({ transactionId: id, action: "review:create" });
        return { id: "review-1", createdAt: now, ...data };
      }
    },
    learnerActivityEvent: recorder.delegate(id)
  });
  const service = new LearningFlashcardsService({} as never, {} as never);
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma: {
      learningFlashcardDeck: { create: async () => deckRecord },
      $transaction: async (callback: (client: ReturnType<typeof transaction>) => Promise<unknown>) => {
        transactionId += 1;
        return callback(transaction(transactionId));
      }
    },
    learnerActivityService: recorder.service,
    findReviewableCard: async () => ({ id: "card-1", deckId: "deck-1" })
  });

  await (service as unknown as {
    createDeckRecord(attribution: { userId: string; learnerId: string }, input: Record<string, unknown>): Promise<unknown>;
  }).createDeckRecord({ userId: "user-1", learnerId: "learner-1" }, {
    cardTypes: [],
    generated: { title: "学习卡组", summary: "", knowledgeMap: [], cards: [] },
    sourceName: "导入卡组",
    sourceType: "IMPORT",
    strategy: "SUBJECT_KNOWLEDGE",
    targetCardCount: 1
  });
  await service.reviewCard(learnerSubject, "card-1", { grade: "GOOD" });

  assert.deepEqual(recorder.writes.map((write) => write.data.idempotencyKey), [
    "flashcard-deck:deck-1:create-completed",
    "flashcard-review:review-1:review-completed"
  ]);
  assert.equal(recorder.writes[0]?.transactionId, operations.find((item) => item.action === "deck:create")?.transactionId);
  assert.equal(recorder.writes[1]?.transactionId, operations.find((item) => item.action === "review:create")?.transactionId);
  assert.equal(recorder.writes[1]?.data.learnerId, "learner-1");
});

import assert from "node:assert/strict";
import test from "node:test";

import { AppException } from "../src/common/app-exception.js";
import {
  LearnerAccessService,
  learnerScenarioRoots
} from "../src/profiles/learner-access.service.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";

const learnerSubject: ProfileSubject = { userId: "user-1", mode: "LEARNER", learnerId: "learner-1" };
const accountSubject: ProfileSubject = { userId: "user-1", mode: "ACCOUNT", learnerId: null };

type ScenarioRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isEnabled: boolean;
  sortOrder: number;
  toolCategory: { id: string; name: string; slug: string; isVisible: boolean } | null;
};

type CourseRow = {
  id: string;
  userId: string;
  approvedRevisionId: string | null;
  publishedAt: Date | null;
  approvedRevision: null | {
    id: string;
    name: string;
    summary: string;
    tags: string[];
    coverMedia: { url: string; filename?: string; storageProvider?: string };
    items: [];
  };
  enrollments: Array<{ userId: string }>;
};

function scenario(id: string, slug: string, input: Partial<ScenarioRow> = {}): ScenarioRow {
  return {
    id,
    name: `场景 ${slug}`,
    slug,
    description: `${slug} 说明`,
    isEnabled: true,
    sortOrder: 1,
    toolCategory: null,
    ...input
  };
}

function course(id: string, input: Partial<CourseRow> = {}): CourseRow {
  return {
    id,
    userId: "user-other",
    approvedRevisionId: `${id}-revision`,
    publishedAt: new Date("2026-08-13T08:00:00Z"),
    approvedRevision: {
      id: `${id}-revision`,
      name: `课程 ${id}`,
      summary: `${id} 摘要`,
      tags: ["语文"],
      coverMedia: { url: `https://cdn.example/${id}.png` },
      items: []
    },
    enrollments: [],
    ...input
  };
}

function accessFixture(options: {
  learnerStatus?: "ACTIVE" | "INACTIVE";
  learnerUserId?: string;
  scenarios?: ScenarioRow[];
  courses?: CourseRow[];
  scenarioGrants?: string[];
  courseGrants?: string[];
} = {}) {
  const learners = [
    {
      id: "learner-1",
      userId: options.learnerUserId ?? "user-1",
      nickname: "小明",
      grade: "GRADE_2",
      avatarUrl: null,
      status: options.learnerStatus ?? "ACTIVE",
      deactivatedAt: null,
      createdAt: new Date("2026-08-13T08:00:00Z"),
      updatedAt: new Date("2026-08-13T08:00:00Z")
    }
  ];
  const scenarios = options.scenarios ?? [];
  const courses = options.courses ?? [];
  const scenarioGrants = new Set((options.scenarioGrants ?? []).map((id) => `learner-1:${id}`));
  const courseGrants = new Set((options.courseGrants ?? []).map((id) => `learner-1:${id}`));
  let transactionIsolation: string | undefined;

  const matchesId = (where: { id?: string; OR?: Array<{ id?: string; slug?: string }> }, row: ScenarioRow) =>
    where.id ? row.id === where.id : where.OR?.some((condition) => condition.id === row.id || condition.slug === row.slug);
  const prisma = {
    learner: {
      findFirst: async ({ where }: { where: { id: string; userId: string; status?: string } }) =>
        learners.find(
          (learner) =>
            learner.id === where.id &&
            learner.userId === where.userId &&
            (!where.status || learner.status === where.status)
        ) ?? null
    },
    aiScenario: {
      findFirst: async ({ where }: { where: { id?: string; slug?: string; OR?: Array<{ id?: string; slug?: string }> } }) =>
        scenarios.find((row) =>
          where.slug ? row.slug === where.slug : matchesId(where, row)
        ) ?? null,
      findMany: async ({ where }: { where?: { id?: { in: string[] }; isEnabled?: boolean } }) =>
        scenarios.filter(
          (row) =>
            (!where?.id?.in || where.id.in.includes(row.id)) &&
            (where?.isEnabled === undefined || row.isEnabled === where.isEnabled)
        )
    },
    course: {
      findFirst: async ({ where }: { where: { id: string; OR?: unknown } }) => {
        const row = courses.find((item) => item.id === where.id);
        const hasAccess = row?.userId === "user-1" || row?.enrollments.some((item) => item.userId === "user-1");
        return row?.approvedRevisionId && row.publishedAt && (!where.OR || hasAccess) ? row : null;
      },
      findMany: async ({ where }: { where?: { id?: { in: string[] }; approvedRevisionId?: unknown; publishedAt?: unknown; OR?: unknown } }) =>
        courses.filter(
          (row) =>
            (!where?.id?.in || where.id.in.includes(row.id)) &&
            (!where?.approvedRevisionId || row.approvedRevisionId !== null) &&
            (!where?.publishedAt || row.publishedAt !== null) &&
            (!where?.OR || row.userId === "user-1" || row.enrollments.some((item) => item.userId === "user-1"))
        )
    },
    learnerScenarioAuthorization: {
      findUnique: async ({ where }: { where: { learnerId_scenarioId: { learnerId: string; scenarioId: string } } }) => {
        const key = `${where.learnerId_scenarioId.learnerId}:${where.learnerId_scenarioId.scenarioId}`;
        return scenarioGrants.has(key) ? { learnerId: "learner-1", scenarioId: key.split(":")[1] } : null;
      },
      findMany: async ({ where }: { where: { learnerId: string } }) =>
        [...scenarioGrants]
          .filter((key) => key.startsWith(`${where.learnerId}:`))
          .map((key) => {
            const scenarioId = key.slice(key.indexOf(":") + 1);
            return { learnerId: where.learnerId, scenarioId, scenario: scenarios.find((row) => row.id === scenarioId)! };
          }),
      deleteMany: async ({ where }: { where: { learnerId: string; scenarioId?: { notIn: string[] } } }) => {
        let count = 0;
        for (const key of [...scenarioGrants]) {
          if (key.startsWith(`${where.learnerId}:`)) {
            const id = key.slice(key.indexOf(":") + 1);
            if (!where.scenarioId || !where.scenarioId.notIn.includes(id)) {
              scenarioGrants.delete(key);
              count += 1;
            }
          }
        }
        return { count };
      },
      createMany: async ({ data }: { data: Array<{ learnerId: string; scenarioId: string }> }) => {
        const before = scenarioGrants.size;
        data.forEach((item) => scenarioGrants.add(`${item.learnerId}:${item.scenarioId}`));
        return { count: scenarioGrants.size - before };
      }
    },
    learnerCourseAuthorization: {
      findUnique: async ({ where }: { where: { learnerId_courseId: { learnerId: string; courseId: string } } }) => {
        const key = `${where.learnerId_courseId.learnerId}:${where.learnerId_courseId.courseId}`;
        return courseGrants.has(key) ? { learnerId: "learner-1", courseId: key.split(":")[1] } : null;
      },
      findMany: async ({ where }: { where: { learnerId: string; course?: { OR?: unknown } } }) =>
        [...courseGrants]
          .filter((key) => key.startsWith(`${where.learnerId}:`))
          .map((key) => {
            const courseId = key.slice(key.indexOf(":") + 1);
            return { learnerId: where.learnerId, courseId, course: courses.find((row) => row.id === courseId)! };
          })
          .filter(({ course: row }) => !where.course?.OR || row.userId === "user-1" || row.enrollments.some((item) => item.userId === "user-1")),
      deleteMany: async ({ where }: { where: { learnerId: string; courseId?: { notIn: string[] } } }) => {
        let count = 0;
        for (const key of [...courseGrants]) {
          if (key.startsWith(`${where.learnerId}:`)) {
            const id = key.slice(key.indexOf(":") + 1);
            if (!where.courseId || !where.courseId.notIn.includes(id)) {
              courseGrants.delete(key);
              count += 1;
            }
          }
        }
        return { count };
      },
      createMany: async ({ data }: { data: Array<{ learnerId: string; courseId: string }> }) => {
        const before = courseGrants.size;
        data.forEach((item) => courseGrants.add(`${item.learnerId}:${item.courseId}`));
        return { count: courseGrants.size - before };
      }
    },
    aiTask: { findMany: async () => [] },
    audioTask: { findMany: async () => [] },
    videoGuideLesson: { findMany: async () => [] },
    englishGuidedStudyMaterial: { findMany: async () => [] },
    learningFlashcardDeck: { findMany: async () => [] },
    copybookRecord: { findMany: async () => [] },
    learnerActivityEvent: {
      count: async () => 0,
      findFirst: async () => null
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>, settings?: { isolationLevel?: string }) => {
      transactionIsolation = settings?.isolationLevel;
      return callback(prisma);
    }
  };

  return {
    service: new LearnerAccessService(prisma as never),
    scenarioGrants,
    courseGrants,
    transactionIsolation: () => transactionIsolation
  };
}

test("内部场景根映射固定归并八个子场景而不产生额外授权入口", () => {
  assert.deepEqual([...learnerScenarioRoots], [
    ["video-guide-practice-questions", "video-guide-narration"],
    ["video-guide-narration-timeline", "video-guide-narration"],
    ["english-guided-study-practice", "english-guided-study-material"],
    ["english-guided-study-narration-nodes", "english-guided-study-material"],
    ["english-guided-study-image-extraction", "english-guided-study-material"],
    ["gushiwen-guided-study-practice", "gushiwen-guided-study-material"],
    ["daodu-image-extraction", "daodu"],
    ["daodu-practice", "daodu"]
  ]);
});

test("学习者授权为空时首页和直接场景课程访问均保持严格拒绝", async () => {
  const fixture = accessFixture({
    scenarios: [scenario("scenario-1", "experience-ai-chat")],
    courses: [course("course-1", { userId: "user-1" })]
  });

  assert.deepEqual(await fixture.service.listAuthorizedHome(learnerSubject), {
    learner: {
      id: "learner-1",
      nickname: "小明",
      grade: "GRADE_2",
      gradeLabel: "二年级",
      avatarUrl: null
    },
    scenarios: [],
    courses: [],
    recentRecords: []
  });
  await assert.rejects(
    fixture.service.assertScenarioAuthorized(learnerSubject, "scenario-1"),
    (error: AppException) => error.message === "当前学习者未获得此应用授权"
  );
  await assert.rejects(
    fixture.service.assertCourseAuthorized(learnerSubject, "course-1"),
    (error: AppException) => error.message === "当前学习者未获得此课程授权"
  );
});

test("账号身份绕过学习者授权行检查", async () => {
  const service = accessFixture({ scenarios: [scenario("public", "typing")] }).service;

  await service.assertScenarioAuthorized(accountSubject, "typing");
  await service.assertCourseAuthorized(accountSubject, "missing-course");
});

test("学习者课程封面使用旧 R2 公共域名而不返回私有对象地址", async () => {
  const previousS3Base = process.env.S3_PUBLIC_BASE_URL;
  const previousR2Base = process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
  const previousPrefix = process.env.S3_KEY_PREFIX;
  delete process.env.S3_PUBLIC_BASE_URL;
  process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = "https://legacy-r2.example";
  process.env.S3_KEY_PREFIX = "uploads";
  try {
    const fixture = accessFixture({
      courses: [course("course-r2", {
        userId: "user-1",
        approvedRevision: {
          id: "course-r2-revision",
          name: "R2 课程",
          summary: "课程摘要",
          tags: ["英语"],
          coverMedia: {
            url: "https://private-r2.example/internal/object",
            filename: "course-r2.png",
            storageProvider: "S3"
          },
          items: []
        }
      })],
      courseGrants: ["course-r2"]
    });

    const projected = await fixture.service.getAuthorizedCourse(learnerSubject, "course-r2");
    assert.equal(projected.coverUrl, "https://legacy-r2.example/uploads/course-r2.png");
  } finally {
    if (previousS3Base === undefined) delete process.env.S3_PUBLIC_BASE_URL;
    else process.env.S3_PUBLIC_BASE_URL = previousS3Base;
    if (previousR2Base === undefined) delete process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
    else process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = previousR2Base;
    if (previousPrefix === undefined) delete process.env.S3_KEY_PREFIX;
    else process.env.S3_KEY_PREFIX = previousPrefix;
  }
});

test("内部场景 id 和 slug 都先归一到根场景授权", async () => {
  const fixture = accessFixture({
    scenarios: [
      scenario("scenario-root", "video-guide-narration"),
      scenario("scenario-child", "video-guide-practice-questions")
    ],
    scenarioGrants: ["scenario-root"]
  });

  const byId = await fixture.service.assertScenarioAuthorized(learnerSubject, "scenario-child");
  const bySlug = await fixture.service.assertScenarioAuthorized(learnerSubject, "video-guide-practice-questions");
  assert.equal(byId?.id, "scenario-root");
  assert.equal(bySlug?.id, "scenario-root");
});

test("内部目标场景已停用时不能借根场景授权继续执行", async () => {
  const fixture = accessFixture({
    scenarios: [
      scenario("scenario-root", "video-guide-narration"),
      scenario("scenario-child", "video-guide-practice-questions", { isEnabled: false })
    ],
    scenarioGrants: ["scenario-root"]
  });

  await assert.rejects(
    fixture.service.assertScenarioAuthorized(learnerSubject, "scenario-child"),
    (error: AppException) => error.message === "当前应用暂不可用"
  );
});

test("应用授权只包含四个体验应用和七个场景应用", async () => {
  const visibleCategory = { id: "category-1", name: "写作", slug: "writing", isVisible: true };
  const hiddenCategory = { id: "category-2", name: "隐藏", slug: "hidden", isVisible: false };
  const fixture = accessFixture({
    scenarios: [
      scenario("generic", "visible-tool", { toolCategory: visibleCategory }),
      scenario("chat", "experience-ai-chat", { toolCategory: hiddenCategory }),
      scenario("image", "experience-image-generation", { toolCategory: hiddenCategory }),
      scenario("video", "experience-video-generation", { toolCategory: hiddenCategory }),
      scenario("voice", "article-to-speech", { toolCategory: hiddenCategory }),
      scenario("media-tutor", "video-guide-narration", { toolCategory: hiddenCategory }),
      scenario("text2lesson", "english-guided-study-material", { toolCategory: hiddenCategory }),
      scenario("gushiwen", "gushiwen-guided-study-material", { toolCategory: hiddenCategory }),
      scenario("flashcard", "learning-flashcards-deck", { toolCategory: hiddenCategory }),
      scenario("zitie", "zitie", { toolCategory: hiddenCategory }),
      scenario("daodu", "daodu", { toolCategory: hiddenCategory }),
      scenario("typing", "typing", { toolCategory: hiddenCategory }),
      scenario("hidden", "hidden-tool", { toolCategory: hiddenCategory }),
      scenario("disabled", "experience-ai-chat", { isEnabled: false }),
      scenario("child", "english-guided-study-practice", { toolCategory: visibleCategory })
    ]
  });

  const options = await fixture.service.listAuthorizationOptions();
  assert.deepEqual(options.scenarios.map((item) => item.id), [
    "chat",
    "image",
    "video",
    "voice",
    "media-tutor",
    "text2lesson",
    "gushiwen",
    "flashcard",
    "zitie",
    "daodu",
    "typing"
  ]);
});

test("读取旧授权时不再返回已退出应用目录的普通 AI 场景", async () => {
  const fixture = accessFixture({
    scenarios: [
      scenario("chat", "experience-ai-chat"),
      scenario("generic", "writing-review")
    ],
    scenarioGrants: ["chat", "generic"]
  });

  assert.deepEqual(
    await fixture.service.getAuthorizations("user-1", "learner-1"),
    { scenarioIds: ["chat"], courseIds: [] }
  );
});

test("课程授权选项包含资源中心全部已发布课程且不要求主账号创建或加入", async () => {
  const fixture = accessFixture({
    courses: [
      course("course-owned", { userId: "user-1" }),
      course("course-enrolled", { enrollments: [{ userId: "user-1" }] }),
      course("course-public"),
      course("course-draft", { approvedRevisionId: null, publishedAt: null, approvedRevision: null })
    ]
  });

  const options = await fixture.service.listAuthorizationOptions();

  assert.deepEqual(options.courses.map((item) => item.id), [
    "course-owned",
    "course-enrolled",
    "course-public"
  ]);
});

test("完整替换去重并在同一 Serializable 事务验证后写入场景和课程", async () => {
  const fixture = accessFixture({
    scenarios: [scenario("scenario-root", "experience-ai-chat")],
    courses: [course("course-owned", { userId: "user-1" }), course("course-enrolled", { enrollments: [{ userId: "user-1" }] })],
    scenarioGrants: ["scenario-old"],
    courseGrants: ["course-old"]
  });

  const result = await fixture.service.replaceAuthorizations("user-1", "learner-1", {
    scenarioIds: ["scenario-root", "scenario-root"],
    courseIds: ["course-owned", "course-enrolled", "course-owned"]
  });

  assert.deepEqual(result, {
    scenarioIds: ["scenario-root"],
    courseIds: ["course-owned", "course-enrolled"]
  });
  assert.deepEqual([...fixture.scenarioGrants], ["learner-1:scenario-root"]);
  assert.deepEqual([...fixture.courseGrants], ["learner-1:course-owned", "learner-1:course-enrolled"]);
  assert.equal(fixture.transactionIsolation(), "Serializable");
});

test("主账号可将资源中心已发布课程授权给自己的学习账号", async () => {
  const fixture = accessFixture({
    courses: [course("course-public")],
    courseGrants: ["course-old"]
  });

  const result = await fixture.service.replaceAuthorizations("user-1", "learner-1", {
    scenarioIds: [],
    courseIds: ["course-public"]
  });

  assert.deepEqual(result, { scenarioIds: [], courseIds: ["course-public"] });
  assert.deepEqual([...fixture.courseGrants], ["learner-1:course-public"]);
});

test("不可授权场景或未发布课程在删除旧授权前整体拒绝", async () => {
  const fixture = accessFixture({
    scenarios: [scenario("scenario-hidden", "hidden-tool")],
    courses: [course("course-draft", { approvedRevisionId: null, publishedAt: null, approvedRevision: null })],
    scenarioGrants: ["scenario-old"],
    courseGrants: ["course-old"]
  });

  await assert.rejects(
    fixture.service.replaceAuthorizations("user-1", "learner-1", {
      scenarioIds: ["scenario-hidden"],
      courseIds: []
    }),
    (error: AppException) => error.message === "包含当前账号不可授权的应用"
  );
  assert.deepEqual([...fixture.scenarioGrants], ["learner-1:scenario-old"]);

  await assert.rejects(
    fixture.service.replaceAuthorizations("user-1", "learner-1", {
      scenarioIds: [],
      courseIds: ["course-draft"]
    }),
    (error: AppException) => error.message === "包含当前账号不可授权的课程"
  );
  assert.deepEqual([...fixture.courseGrants], ["learner-1:course-old"]);
});

test("空白授权 ID 在完整替换删除旧授权前拒绝", async () => {
  const scenarioFixture = accessFixture({
    scenarioGrants: ["scenario-old"],
    courseGrants: ["course-old"]
  });
  await assert.rejects(
    scenarioFixture.service.replaceAuthorizations("user-1", "learner-1", {
      scenarioIds: ["   "],
      courseIds: []
    }),
    (error: AppException) => error.message === "授权项不能为空"
  );
  assert.deepEqual([...scenarioFixture.scenarioGrants], ["learner-1:scenario-old"]);
  assert.deepEqual([...scenarioFixture.courseGrants], ["learner-1:course-old"]);

  const courseFixture = accessFixture({
    scenarioGrants: ["scenario-old"],
    courseGrants: ["course-old"]
  });
  await assert.rejects(
    courseFixture.service.replaceAuthorizations("user-1", "learner-1", {
      scenarioIds: [],
      courseIds: ["\t"]
    }),
    (error: AppException) => error.message === "授权项不能为空"
  );
  assert.deepEqual([...courseFixture.scenarioGrants], ["learner-1:scenario-old"]);
  assert.deepEqual([...courseFixture.courseGrants], ["learner-1:course-old"]);
});

test("跨用户或停用学习者不能读取和替换白名单", async () => {
  for (const fixture of [
    accessFixture({ learnerUserId: "user-other" }),
    accessFixture({ learnerStatus: "INACTIVE" })
  ]) {
    await assert.rejects(
      fixture.service.replaceAuthorizations("user-1", "learner-1", { scenarioIds: [], courseIds: [] }),
      (error: AppException) => error.message === "学习者不存在或无权操作"
    );
  }
});

test("课程授权即使仍有授权行也会在撤稿后失去可学习资格", async () => {
  const fixture = accessFixture({
    courses: [course("course-draft", { approvedRevisionId: null, publishedAt: null, approvedRevision: null })],
    courseGrants: ["course-draft"]
  });

  await assert.rejects(
    fixture.service.assertCourseAuthorized(learnerSubject, "course-draft"),
    (error: AppException) => error.message === "当前课程暂不可学习"
  );
  assert.deepEqual(await fixture.service.listAuthorizedCourses(learnerSubject), []);
  assert.deepEqual((await fixture.service.listAuthorizedHome(learnerSubject)).courses, []);
});

test("资源中心公开课程获得授权后不依赖主账号创建或加入即可学习", async () => {
  const fixture = accessFixture({
    courses: [course("course-public", { userId: "user-other", enrollments: [] })],
    courseGrants: ["course-public"]
  });

  assert.deepEqual(
    (await fixture.service.listAuthorizedCourses(learnerSubject)).map((item) => item.id),
    ["course-public"]
  );
  assert.equal(
    (await fixture.service.getAuthorizedCourse(learnerSubject, "course-public")).id,
    "course-public"
  );
  assert.deepEqual(
    (await fixture.service.listAuthorizedHome(learnerSubject)).courses.map((item) => item.id),
    ["course-public"]
  );
});

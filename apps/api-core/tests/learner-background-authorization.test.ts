import assert from "node:assert/strict";
import test from "node:test";

import { AiService } from "../src/ai/ai.service.js";
import { AppException } from "../src/common/app-exception.js";
import { EnglishGuidedStudyController } from "../src/english-guided-study/english-guided-study.controller.js";
import { EnglishGuidedStudyService } from "../src/english-guided-study/english-guided-study.service.js";
import { LearnerAccessService } from "../src/profiles/learner-access.service.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";
import { VideoGuideController } from "../src/video-guide/video-guide.controller.js";
import { VideoGuideService } from "../src/video-guide/video-guide.service.js";

const learnerSubject: ProfileSubject = { userId: "user-1", mode: "LEARNER", learnerId: "learner-1" };
const accountSubject: ProfileSubject = { userId: "user-1", mode: "ACCOUNT", learnerId: null };
const request = { marker: "background-auth-request" };

function accessFixture() {
  const state = {
    learnerActive: true,
    grantActive: true,
    rootEnabled: true,
    childEnabled: true
  };
  const scenarios = [
    { id: "video-root", slug: "video-guide-narration", name: "视频导学", description: null, requiredCapabilities: ["TEXT"], toolCategory: null },
    { id: "video-child", slug: "video-guide-practice-questions", name: "视频练习", description: null, requiredCapabilities: ["TEXT"], toolCategory: null },
    { id: "english-root", slug: "english-guided-study-material", name: "英文带学", description: null, requiredCapabilities: ["TEXT"], toolCategory: null },
    { id: "english-child", slug: "english-guided-study-practice", name: "英文练习", description: null, requiredCapabilities: ["TEXT"], toolCategory: null }
  ];
  const prisma = {
    learner: {
      findFirst: async () => state.learnerActive ? { id: "learner-1" } : null
    },
    aiScenario: {
      findFirst: async ({ where }: { where: { slug?: string; OR?: Array<{ id?: string; slug?: string }> } }) => {
        const scenario = scenarios.find((item) => where.slug === item.slug || where.OR?.some((part) => part.id === item.id || part.slug === item.slug));
        if (!scenario) return null;
        const isChild = scenario.slug.endsWith("practice-questions") || scenario.slug.endsWith("practice");
        return { ...scenario, isEnabled: isChild ? state.childEnabled : state.rootEnabled };
      }
    },
    learnerScenarioAuthorization: {
      findUnique: async () => state.grantActive ? { learnerId: "learner-1" } : null
    }
  };
  return { access: new LearnerAccessService(prisma as never), state };
}

test("AiService 缺少显式执行主体时在场景读取和 provider 前失败关闭", async () => {
  let scenarioReads = 0;
  const access = new LearnerAccessService({} as never);
  const ai = new AiService({} as never, access);
  (ai as unknown as { ensureVideoGuidePracticeQuestionsScenario: () => Promise<unknown> }).ensureVideoGuidePracticeQuestionsScenario = async () => {
    scenarioReads += 1;
    throw new Error("不应读取场景");
  };

  await assert.rejects(
    ai.generateScenarioTextForExternalBilling({ userId: "user-1", scenarioSlug: "video-guide-practice-questions", input: "测试" }),
    (error: unknown) => error instanceof AppException && error.message === "内部任务缺少执行身份"
  );
  assert.equal(scenarioReads, 0);
});

test("AiService 必须 await 当前授权重检再进入场景和 provider 链路", async () => {
  let scenarioReads = 0;
  const ai = new AiService({} as never, {
    assertInternalScenarioAuthorized: async () => {
      await Promise.resolve();
      throw new AppException(40301, "当前学习者未获得此应用授权", 403);
    }
  } as never);
  (ai as unknown as { ensureVideoGuidePracticeQuestionsScenario: () => Promise<unknown> }).ensureVideoGuidePracticeQuestionsScenario = async () => {
    scenarioReads += 1;
    throw new Error("不应读取场景");
  };

  await assert.rejects(
    ai.generateScenarioTextForExternalBilling({ userId: "user-1", scenarioSlug: "video-guide-practice-questions", input: "测试" }),
    (error: unknown) => error instanceof AppException && error.message === "当前学习者未获得此应用授权"
  );
  assert.equal(scenarioReads, 0);
});

test("主账号内部任务可跨场景根执行且不套用学习者应用授权", async () => {
  const access = new LearnerAccessService({aiScenario: {findFirst: async () => ({id:"root",slug:"english-guided-study-material",isEnabled:true,minimumMembershipRank:0,membershipEarlyAccessUntil:null})}} as never);

  await access.runWithScenarioAuthorization(
    accountSubject,
    "english-guided-study-material",
    () => access.assertInternalScenarioAuthorized(
      { userId: "user-1", learnerId: null, rootScenarioId: null },
      "gushiwen-guided-study-material"
    )
  );
});

test("当前授权重检拒绝停用学习者、撤销授权、停用根或停用子场景", async () => {
  const { access, state } = accessFixture();
  for (const key of ["learnerActive", "grantActive", "rootEnabled", "childEnabled"] as const) {
    Object.assign(state, { learnerActive: true, grantActive: true, rootEnabled: true, childEnabled: true, [key]: false });
    let providerCalls = 0;
    await assert.rejects(
      access.runWithScenarioAuthorization(learnerSubject, "video-guide-narration", async () => {
        await access.assertInternalScenarioAuthorized({
          userId: "user-1",
          learnerId: "learner-1",
          rootScenarioId: "video-root"
        }, "video-guide-practice-questions");
        providerCalls += 1;
      }),
      (error: unknown) => error instanceof AppException
    );
    assert.equal(providerCalls, 0, `${key} 失效时不得进入 provider`);
  }
});

test("视频和英文恢复执行从持久化 root 重建 LEARNER/ACCOUNT 主体", async () => {
  const { access, state } = accessFixture();
  const video = new VideoGuideService({} as never, {} as never, undefined, access);
  const english = new EnglishGuidedStudyService({} as never, {} as never, {} as never, access);
  Object.defineProperty(video, "prisma", {
    value: { videoGuideLesson: { findUnique: async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      userId: "user-1",
      learnerId: where.id === "missing-provenance" ? undefined : "learner-1"
    }) } }
  });
  Object.defineProperty(english, "prisma", {
    value: { englishGuidedStudyMaterial: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, userId: "user-1", learnerId: null }) } }
  });
  const runVideo = (video as unknown as {
    runWithStoredLessonAuthorization?: <T>(
      id: string,
      callback: (attribution: { userId: string; learnerId: string | null; rootScenarioId: string | null }) => Promise<T>
    ) => Promise<T>;
  }).runWithStoredLessonAuthorization;
  const runEnglish = (english as unknown as {
    runWithStoredMaterialAuthorization?: <T>(
      id: string,
      callback: (attribution: { userId: string; learnerId: string | null; rootScenarioId: string | null }) => Promise<T>
    ) => Promise<T>;
  }).runWithStoredMaterialAuthorization;
  assert.equal(typeof runVideo, "function", "视频恢复必须从持久化课件重建执行主体");
  assert.equal(typeof runEnglish, "function", "英文恢复必须从持久化材料重建执行主体");

  let providerCalls = 0;
  for (const key of ["learnerActive", "grantActive", "rootEnabled", "childEnabled"] as const) {
    Object.assign(state, { learnerActive: true, grantActive: true, rootEnabled: true, childEnabled: true, [key]: false });
    await assert.rejects(
      runVideo!.call(video, "lesson-1", async (attribution) => {
        assert.deepEqual(attribution, {
          userId: "user-1",
          learnerId: "learner-1",
          rootScenarioId: "video-root"
        });
        await access.assertInternalScenarioAuthorized(attribution, "video-guide-practice-questions");
        providerCalls += 1;
      }),
      (error: unknown) => error instanceof AppException
    );
    assert.equal(providerCalls, 0, `恢复执行在 ${key} 失效时不得进入 provider`);
  }

  Object.assign(state, { learnerActive: true, grantActive: true, rootEnabled: true, childEnabled: true });
  await assert.rejects(
    runVideo!.call(video, "missing-provenance", async () => { providerCalls += 1; }),
    (error: unknown) => error instanceof AppException && error.message === "内部任务缺少执行身份"
  );
  assert.equal(providerCalls, 0);

  await runEnglish!.call(english, "material-account", async (attribution) => {
    assert.deepEqual(attribution, {
      userId: "user-1",
      learnerId: null,
      rootScenarioId: null
    });
    await access.assertInternalScenarioAuthorized(attribution, "english-guided-study-practice");
    providerCalls += 1;
  });
  assert.equal(providerCalls, 1, "learnerId=null 的旧记录必须显式作为 ACCOUNT 执行");
});

test("新建视频和英文根记录只写入服务端解析的 learnerId", async () => {
  const captured: Array<[string, string | null | undefined]> = [];
  const context = { requireSelected: async () => learnerSubject };
  const access = {
    assertScenarioAuthorized: async (_subject: ProfileSubject, slug: string) => ({ slug }),
    runWithScenarioAuthorization: async (_subject: ProfileSubject, _root: string, callback: () => Promise<unknown>) => callback()
  };
  const video = new VideoGuideController(
    { createDraftLesson: async (subject: ProfileSubject) => { captured.push(["video", subject.learnerId]); return {}; } } as never,
    { me: async () => ({ id: "user-1" }) } as never,
    context as never,
    access as never
  );
  const english = new EnglishGuidedStudyController(
    { submitMaterialGeneration: async (subject: ProfileSubject) => { captured.push(["english", subject.learnerId]); return {}; } } as never,
    { me: async () => ({ id: "user-1" }) } as never,
    context as never,
    access as never
  );

  await video.createDraftLesson(request, {} as never);
  await english.generateMaterial(request, {} as never);
  assert.deepEqual(captured, [["video", "learner-1"], ["english", "learner-1"]]);
});

test("视频草稿实际 Prisma create data 写入服务端 learnerId", async () => {
  let createData: Record<string, unknown> | undefined;
  const video = new VideoGuideService({} as never, {} as never, undefined, {} as never);
  Object.defineProperty(video, "prisma", {
    value: {
      videoGuideLesson: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createData = data;
          return {
            ...data,
            id: "lesson-1",
            errorMessage: null,
            createdAt: new Date("2026-08-14T00:00:00Z"),
            updatedAt: new Date("2026-08-14T00:00:00Z"),
            finishedAt: null
          };
        }
      }
    }
  });

  await video.createDraftLesson(learnerSubject, {
    mediaName: "lesson.mp4",
    mediaType: "VIDEO",
    mediaMimeType: "video/mp4",
    mediaSizeBytes: 1024,
    mediaUrl: "https://cdn.example/lesson.mp4"
  });
  assert.equal(createData?.learnerId, "learner-1");
});

test("视频与英文生产调度入口先走持久化主体授权包装再运行任务", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const pending: Array<() => void> = [];
  globalThis.setTimeout = ((callback: () => void) => {
    pending.push(callback);
    return { unref: () => undefined } as never;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;
  try {
    const order: string[] = [];
    const executions: unknown[] = [];
    const video = new VideoGuideService({} as never, {} as never, undefined, {} as never);
    Object.assign(video as unknown as Record<string, unknown>, {
      runWithStoredLessonAuthorization: async (_id: string, callback: (attribution: unknown) => Promise<void>) => {
        order.push("video-auth");
        return callback({ userId: "user-1", learnerId: "learner-1", rootScenarioId: "video-root" });
      },
      runPracticeGeneration: async (id: string, attribution: unknown) => {
        order.push("video-provider");
        executions.push(["video", id, attribution]);
      }
    });
    const english = new EnglishGuidedStudyService({} as never, {} as never, {} as never, {} as never);
    Object.assign(english as unknown as Record<string, unknown>, {
      runWithStoredMaterialAuthorization: async (_id: string, callback: (attribution: unknown) => Promise<void>) => {
        order.push("english-auth");
        return callback({ userId: "user-1", learnerId: "learner-1", rootScenarioId: "english-root" });
      },
      runQueuedEnglishGuidedStudyOperation: async (id: string, operation: string, attribution: unknown) => {
        order.push("english-provider");
        executions.push(["english", id, operation, attribution]);
      }
    });

    (video as unknown as { schedulePracticeGeneration(id: string): void }).schedulePracticeGeneration("lesson-1");
    (english as unknown as { scheduleEnglishGuidedStudyOperation(id: string, operation: string): void })
      .scheduleEnglishGuidedStudyOperation("material-1", "PRACTICE");
    pending.splice(0).forEach((callback) => callback());
    await new Promise((resolve) => originalSetTimeout(resolve, 0));

    assert.deepEqual(order, ["video-auth", "video-provider", "english-auth", "english-provider"]);
    assert.deepEqual(executions, [
      ["video", "lesson-1", { userId: "user-1", learnerId: "learner-1", rootScenarioId: "video-root" }],
      ["english", "material-1", "PRACTICE", {
        userId: "user-1",
        learnerId: "learner-1",
        rootScenarioId: "english-root"
      }]
    ]);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

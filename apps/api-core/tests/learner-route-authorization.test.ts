import assert from "node:assert/strict";
import test from "node:test";

import { AdvancedAiController } from "../src/ai/advanced-ai.controller.js";
import { AiController } from "../src/ai/ai.controller.js";
import { KnowledgeController } from "../src/ai/knowledge.controller.js";
import { AudioController } from "../src/audio/audio.controller.js";
import { AuthController } from "../src/auth/auth.controller.js";
import { AppException } from "../src/common/app-exception.js";
import { CopybookFontsController } from "../src/copybook-fonts/copybook-fonts.controller.js";
import { CopybooksController } from "../src/copybooks/copybooks.controller.js";
import { CoursesController, PublicCoursesController } from "../src/courses/courses.controller.js";
import {
  EnglishGuidedStudyController,
  PublicEnglishGuidedStudyController
} from "../src/english-guided-study/english-guided-study.controller.js";
import {
  LearningFlashcardsController,
  PublicLearningFlashcardsController
} from "../src/learning-flashcards/learning-flashcards.controller.js";
import { OrganizationsController } from "../src/organizations/organizations.controller.js";
import { PaymentController } from "../src/payment/payment.controller.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";
import { RenderEngineController } from "../src/render-engine/render-engine.controller.js";
import { VideoGuideController, PublicVideoGuideController } from "../src/video-guide/video-guide.controller.js";
import { WalletController } from "../src/wallet/wallet.controller.js";

const request = { marker: "server-request" };
const learnerSubject: ProfileSubject = { userId: "user-1", mode: "LEARNER", learnerId: "learner-1" };
const accountSubject: ProfileSubject = { userId: "user-1", mode: "ACCOUNT", learnerId: null };
const audioCapabilityFixture = {
  assertLearnerSample: () => undefined,
  issueLearnerSample: () => "test-proof"
};

function authFixture() {
  return { me: async () => ({ id: "user-1", nickname: "主账号" }) };
}

function contextFixture(subject: ProfileSubject) {
  const selectedRequests: unknown[] = [];
  const accountRequests: unknown[] = [];
  return {
    selectedRequests,
    accountRequests,
    service: {
      optional: async () => subject.mode === "LEARNER" ? { mode: "LEARNER", learnerId: subject.learnerId } : { mode: "ACCOUNT", learnerId: null },
      requireSelected: async (actualRequest: unknown, userId: string) => {
        selectedRequests.push(actualRequest);
        assert.equal(userId, "user-1");
        return subject;
      },
      requireAccount: async (actualRequest: unknown, userId: string) => {
        accountRequests.push(actualRequest);
        assert.equal(userId, "user-1");
        if (subject.mode !== "ACCOUNT") {
          throw new AppException(40301, "请切换到主账号身份后操作", 403);
        }
        return subject;
      }
    }
  };
}

function accessFixture(options: {
  authorized?: string[];
  disabled?: string[];
  capabilities?: Record<string, string[]>;
} = {}) {
  const authorized = new Set(options.authorized ?? []);
  const disabled = new Set(options.disabled ?? []);
  const checks: string[] = [];
  return {
    checks,
    service: {
      assertScenarioAuthorized: async (subject: ProfileSubject, scenario: string) => {
        checks.push(scenario);
        assert.equal(subject.userId, "user-1");
        if (subject.mode === "ACCOUNT") return null;
        if (disabled.has(scenario)) throw new AppException(40004, "当前应用暂不可用", 400);
        if (!authorized.has(scenario)) throw new AppException(40301, "当前学习者未获得此应用授权", 403);
        return {
          id: `${scenario}-id`,
          slug: scenario,
          name: scenario,
          description: null,
          isEnabled: true,
          requiredCapabilities: options.capabilities?.[scenario] ?? [],
          toolCategory: { isVisible: true }
        };
      },
      filterAuthorizedScenarios: async (_subject: ProfileSubject, rows: Array<{ slug: string }>) =>
        rows.filter((row) => authorized.has(row.slug)),
      filterAuthorizedTasks: async (_subject: ProfileSubject, rows: Array<{ scenario: { slug: string } }>) =>
        rows.filter((row) => authorized.has(row.scenario.slug)),
      assertHasAuthorizedCapability: async (subject: ProfileSubject, capability: string) => {
        if (subject.mode === "ACCOUNT") return;
        const hasCapability = [...authorized].some((scenario) => options.capabilities?.[scenario]?.includes(capability));
        if (!hasCapability) throw new AppException(40301, "当前学习者未获得可用的语音应用授权", 403);
      },
      runWithScenarioAuthorization: async (_subject: ProfileSubject, _root: unknown, callback: () => unknown) => callback()
    }
  };
}

async function rejectsBeforeMutation(action: () => Promise<unknown>, calls: () => number, message: string) {
  await assert.rejects(action, (error: unknown) => error instanceof AppException && error.message === message);
  assert.equal(calls(), 0, "授权失败后不得调用业务 mutation/read 方法");
}

test("学习者直接创建未授权 AI 任务时在 AI 与钱包副作用前拒绝", async () => {
  let createCalls = 0;
  const context = contextFixture(learnerSubject);
  const access = accessFixture();
  const controller = new AiController(
    {
      createTask: async () => {
        createCalls += 1;
        return { id: "task-1" };
      }
    } as never,
    authFixture() as never,
    context.service as never,
    access.service as never
  );

  await rejectsBeforeMutation(
    () => controller.createTask(request, { scenarioId: "scenario-forged", input: "测试输入" } as never),
    () => createCalls,
    "当前学习者未获得此应用授权"
  );
  assert.deepEqual(access.checks, ["scenario-forged"]);
});

test("授权根允许映射子场景，其他或停用根在 mutation 前拒绝", async () => {
  const { LearnerAccessService } = await import("../src/profiles/learner-access.service.js");
  const scenarios = [
    { id: "root-ok", slug: "video-guide-narration", isEnabled: true, name: "视频导学", description: null, requiredCapabilities: [], toolCategory: null },
    { id: "child-ok", slug: "video-guide-practice-questions", isEnabled: true, name: "练习", description: null, requiredCapabilities: [], toolCategory: null },
    { id: "root-disabled", slug: "english-guided-study-material", isEnabled: false, name: "英文", description: null, requiredCapabilities: [], toolCategory: null },
    { id: "child-disabled", slug: "english-guided-study-practice", isEnabled: true, name: "英文练习", description: null, requiredCapabilities: [], toolCategory: null }
  ];
  const prisma = {
    learner: { findFirst: async () => ({ id: "learner-1" }) },
    aiScenario: {
      findFirst: async ({ where }: { where: { slug?: string; OR?: Array<{ id?: string; slug?: string }> } }) =>
        scenarios.find((row) => where.slug === row.slug || where.OR?.some((part) => part.id === row.id || part.slug === row.slug)) ?? null
    },
    learnerScenarioAuthorization: {
      findUnique: async ({ where }: { where: { learnerId_scenarioId: { scenarioId: string } } }) =>
        where.learnerId_scenarioId.scenarioId === "root-ok" ? { scenarioId: "root-ok" } : null
    }
  };
  const service = new LearnerAccessService(prisma as never);

  assert.equal((await service.assertScenarioAuthorized(learnerSubject, "child-ok"))?.id, "root-ok");
  await assert.rejects(() => service.assertScenarioAuthorized(learnerSubject, "child-disabled"), /当前应用暂不可用/u);
  await assert.rejects(() => service.assertScenarioAuthorized(learnerSubject, "missing-child"), /当前应用暂不可用/u);
});

test("学习者场景发现仅返回已授权根，访客与账号结果保持原样", async () => {
  const rows = [
    { id: "root", slug: "video-guide-narration" },
    { id: "child", slug: "video-guide-practice-questions" },
    { id: "other", slug: "experience-ai-chat" }
  ];
  const ai = { listScenarios: async () => rows, listTools: async () => rows, getTool: async (slug: string) => rows.find((row) => row.slug === slug) };
  const learnerContext = contextFixture(learnerSubject);
  const access = accessFixture({ authorized: ["video-guide-narration"] });
  const learnerController = new AiController(ai as never, authFixture() as never, learnerContext.service as never, access.service as never);

  assert.deepEqual((await learnerController.scenarios(request)).data, [rows[0]]);
  assert.deepEqual((await learnerController.tools(request, undefined)).data, [rows[0]]);
  await assert.rejects(() => learnerController.tool(request, "video-guide-practice-questions"), /未获得此应用授权/u);

  const guestAuth = { me: async () => { throw new AppException(40101, "请先登录", 401); } };
  const guestController = new AiController(ai as never, guestAuth as never, learnerContext.service as never, access.service as never);
  assert.deepEqual((await guestController.scenarios(request)).data, rows);

  const accountContext = contextFixture(accountSubject);
  const accountController = new AiController(ai as never, authFixture() as never, accountContext.service as never, access.service as never);
  assert.deepEqual((await accountController.tools(request, undefined)).data, rows);

  const invalidContext = { optional: async () => { throw new AppException(40102, "身份状态已失效，请重新登录", 401); } };
  const invalidController = new AiController(ai as never, authFixture() as never, invalidContext as never, access.service as never);
  await assert.rejects(() => invalidController.scenarios(request), /身份状态已失效/u);
});

test("学习者视频轮询按当前主体重新校验场景授权", async () => {
  let reads = 0;
  const subjects: ProfileSubject[] = [];
  const ai = {
    listUserTasks: async (subject: ProfileSubject) => { reads += 1; subjects.push(subject); return []; },
    getTask: async (subject: ProfileSubject) => { reads += 1; subjects.push(subject); return {}; },
    getVideoGenerationTask: async (subject: ProfileSubject) => { reads += 1; subjects.push(subject); return {}; }
  };
  const access = accessFixture({ authorized: ["experience-video-generation"] });
  const controller = new AiController(
    ai as never,
    authFixture() as never,
    contextFixture(learnerSubject).service as never,
    access.service as never
  );
  await controller.tasks(request);
  await controller.task(request, "task-own");
  await controller.videoTask(request, "local-task-own");
  assert.deepEqual(subjects, [learnerSubject, learnerSubject, learnerSubject]);
  assert.equal(reads, 3);
  assert.deepEqual(access.checks, ["experience-video-generation"]);
});

test("通用 TTS 对学习者强制 AUDIO+TTS 已授权启用场景，账号可继续省略", async () => {
  let creates = 0;
  const audio = {
    createTtsTask: async () => { creates += 1; return { id: "audio-1" }; },
    toLearnerAudioTask: (task: unknown) => task
  };
  const capabilities = {
    valid: ["AUDIO", "TTS"],
    "not-tts": ["AUDIO"],
    ungranted: ["AUDIO", "TTS"],
    disabled: ["AUDIO", "TTS"]
  };
  const access = accessFixture({ authorized: ["valid", "not-tts"], disabled: ["disabled"], capabilities });
  const learner = new AudioController(audio as never, authFixture() as never, contextFixture(learnerSubject).service as never, access.service as never, audioCapabilityFixture as never);

  await rejectsBeforeMutation(() => learner.createTtsTask(request, { text: "你好" } as never), () => creates, "请选择已授权的语音应用");
  await rejectsBeforeMutation(() => learner.createTtsTask(request, { text: "你好", scenarioId: "not-tts" } as never), () => creates, "当前应用不支持语音合成");
  await rejectsBeforeMutation(() => learner.createTtsTask(request, { text: "你好", scenarioId: "disabled" } as never), () => creates, "当前应用暂不可用");
  await rejectsBeforeMutation(() => learner.createTtsTask(request, { text: "你好", scenarioId: "ungranted" } as never), () => creates, "当前学习者未获得此应用授权");
  await learner.createTtsTask(request, { text: "你好", scenarioId: "valid" } as never);
  assert.equal(creates, 1);

  const account = new AudioController(audio as never, authFixture() as never, contextFixture(accountSubject).service as never, access.service as never, audioCapabilityFixture as never);
  await account.createTtsTask(request, { text: "账号兼容" } as never);
  assert.equal(creates, 2);
});

test("学习者只有具备已授权 AUDIO 根场景时才能读取共享音色和模型", async () => {
  let reads = 0;
  const audio = {
    listModelOptions: async () => { reads += 1; return []; },
    listVoiceAssets: async () => { reads += 1; return []; },
    listLearnerVoiceAssets: async () => { reads += 1; return []; }
  };
  const denied = accessFixture();
  const learner = new AudioController(audio as never, authFixture() as never, contextFixture(learnerSubject).service as never, denied.service as never, audioCapabilityFixture as never);
  await rejectsBeforeMutation(() => learner.listModels(request), () => reads, "当前学习者未获得可用的语音应用授权");
  await rejectsBeforeMutation(() => learner.listVoices(request), () => reads, "当前学习者未获得可用的语音应用授权");

  const allowed = accessFixture({ authorized: ["article-to-speech"], capabilities: { "article-to-speech": ["AUDIO", "TTS"] } });
  const authorizedLearner = new AudioController(audio as never, authFixture() as never, contextFixture(learnerSubject).service as never, allowed.service as never, audioCapabilityFixture as never);
  await authorizedLearner.listModels(request);
  await authorizedLearner.listVoices(request);
  assert.equal(reads, 2);
});

test("Task 7 学习者音频历史把完整主体交给服务层做数据库隔离", async () => {
  const subjects: ProfileSubject[] = [];
  const audio = {
    listUserTasks: async (subject: ProfileSubject) => { subjects.push(subject); return []; },
    getUserTask: async (subject: ProfileSubject) => { subjects.push(subject); return {}; }
  };
  const access = accessFixture({ authorized: ["article-to-speech"], capabilities: { "article-to-speech": ["AUDIO", "TTS"] } });
  const controller = new AudioController(audio as never, authFixture() as never, contextFixture(learnerSubject).service as never, access.service as never, audioCapabilityFixture as never);
  await controller.listTasks(request);
  await controller.getTask(request, "audio-own");
  assert.deepEqual(subjects, [learnerSubject, learnerSubject]);
});

test("固定学习应用和声音能力使用服务端根场景，拒绝客户端企业计费", async () => {
  const access = accessFixture({
    authorized: [
      "video-guide-narration", "english-guided-study-material", "gushiwen-guided-study-material",
      "learning-flashcards-deck", "my-voice-clone", "brand-voice-design"
    ]
  });
  const context = contextFixture(learnerSubject);
  const noOp = new Proxy({}, { get: () => async () => ({}) });

  await new VideoGuideController(noOp as never, authFixture() as never, context.service as never, access.service as never)
    .createDraftLesson(request, {} as never);
  await new EnglishGuidedStudyController(noOp as never, authFixture() as never, context.service as never, access.service as never)
    .generateMaterial(request, {} as never);
  await new LearningFlashcardsController(authFixture() as never, noOp as never, context.service as never, access.service as never)
    .generateDeck(request, {} as never);
  const audio = new AudioController(noOp as never, authFixture() as never, context.service as never, access.service as never, audioCapabilityFixture as never);
  await audio.createVoiceCloneTask(request, {} as never);
  await audio.createVoiceDesignTask(request, {} as never);

  assert.deepEqual(access.checks, [
    "video-guide-narration", "english-guided-study-material", "learning-flashcards-deck",
    "my-voice-clone", "brand-voice-design"
  ]);

  let mutation = 0;
  const ai = new AiController({ createTask: async () => { mutation += 1; } } as never, authFixture() as never, context.service as never, access.service as never);
  await rejectsBeforeMutation(
    () => ai.createTask(request, { scenarioId: "video-guide-narration", input: "x", billingContext: "ORGANIZATION", organizationId: "org-forged" } as never),
    () => mutation,
    "学习者身份仅支持个人点数"
  );
});

test("Task 8 视频导学私有记录入口把完整学习者主体交给服务层隔离", async () => {
  const subjects: ProfileSubject[] = [];
  const service = new Proxy({}, { get: () => async (subject: ProfileSubject) => { subjects.push(subject); return {}; } });
  const access = accessFixture({ authorized: ["video-guide-narration"] });
  const controller = new VideoGuideController(service as never, authFixture() as never, contextFixture(learnerSubject).service as never, access.service as never);
  await controller.listLessons(request);
  await controller.getLesson(request, "lesson-1");
  await controller.updateLessonTitle(request, "lesson-1", {} as never);
  await controller.generateSubtitle(request, { lessonId: "lesson-1" } as never);
  assert.deepEqual(subjects, [learnerSubject, learnerSubject, learnerSubject, learnerSubject]);
  assert.deepEqual(access.checks, Array(4).fill("video-guide-narration"));
});

test("Task 8 英文带学私有记录入口把完整学习者主体交给服务层隔离", async () => {
  const subjects: ProfileSubject[] = [];
  const service = {
    listUserMaterials: async (subject: ProfileSubject) => { subjects.push(subject); return []; },
    getMaterialAuthorizationRoot: async () => "english-guided-study-material",
    getUserMaterial: async (subject: ProfileSubject) => { subjects.push(subject); return {}; },
    pinMaterial: async (subject: ProfileSubject) => { subjects.push(subject); return {}; }
  };
  const access = accessFixture({ authorized: ["english-guided-study-material"] });
  const controller = new EnglishGuidedStudyController(service as never, authFixture() as never, contextFixture(learnerSubject).service as never, access.service as never);
  await controller.listMaterials(request);
  await controller.getMaterial(request, "material-1");
  await controller.pinMaterial(request, "material-1");
  assert.deepEqual(subjects, [learnerSubject, learnerSubject, learnerSubject]);
  assert.deepEqual(access.checks, Array(3).fill("english-guided-study-material"));
});

test("开卷导读私有材料入口根据已保存场景校验 daodu 授权根", async () => {
  const subjects: ProfileSubject[] = [];
  const service = {
    getMaterialAuthorizationRoot: async (subject: ProfileSubject) => {
      subjects.push(subject);
      return "daodu";
    },
    getUserMaterial: async (subject: ProfileSubject) => {
      subjects.push(subject);
      return {};
    }
  };
  const access = accessFixture({ authorized: ["daodu"] });
  const controller = new EnglishGuidedStudyController(
    service as never,
    authFixture() as never,
    contextFixture(learnerSubject).service as never,
    access.service as never
  );

  await controller.getMaterial(request, "daodu-1");

  assert.deepEqual(subjects, [learnerSubject, learnerSubject]);
  assert.deepEqual(access.checks, ["daodu"]);
});

test("开卷导读创建入口校验 daodu 授权根", async () => {
  const subjects: ProfileSubject[] = [];
  const service = {
    submitMaterialGeneration: async (subject: ProfileSubject) => {
      subjects.push(subject);
      return {};
    }
  };
  const access = accessFixture({ authorized: ["daodu"] });
  const controller = new EnglishGuidedStudyController(
    service as never,
    authFixture() as never,
    contextFixture(learnerSubject).service as never,
    access.service as never
  );

  await controller.generateMaterial(request, { scene: "DAODU" } as never);

  assert.deepEqual(subjects, [learnerSubject]);
  assert.deepEqual(access.checks, ["daodu"]);
});

test("Task 8 学习闪卡入口把完整学习者主体交给服务层隔离", async () => {
  const subjects: ProfileSubject[] = [];
  const service = new Proxy({}, { get: () => async (subject: ProfileSubject) => { subjects.push(subject); return {}; } });
  const access = accessFixture({ authorized: ["learning-flashcards-deck"] });
  const controller = new LearningFlashcardsController(authFixture() as never, service as never, contextFixture(learnerSubject).service as never, access.service as never);
  await controller.listDecks(request);
  await controller.getDeck(request, "deck-1");
  await controller.reviewCard(request, "card-1", {} as never);
  assert.deepEqual(subjects, [learnerSubject, learnerSubject, learnerSubject]);
  assert.deepEqual(access.checks, Array(3).fill("learning-flashcards-deck"));
});

test("账号专属控制器在服务调用前统一拒绝学习者直连", async () => {
  let calls = 0;
  const mutationService = new Proxy({}, { get: () => async () => { calls += 1; return {}; } });
  const auth = authFixture();
  const context = contextFixture(learnerSubject);
  const media = mutationService;
  const admin = mutationService;

  const actions: Array<[string, () => Promise<unknown>]> = [
    ["wallet", () => new WalletController(mutationService as never, auth as never, context.service as never).me(request)],
    ["payment", () => new PaymentController(mutationService as never, auth as never, mutationService as never, context.service as never).createOrder(request as never, {} as never)],
    ["organization", () => new OrganizationsController(mutationService as never, auth as never, context.service as never).create(request, {} as never)],
    ["knowledge", () => new KnowledgeController(mutationService as never, auth as never, context.service as never).create(request, {} as never)],
    ["agent-tool", () => new AdvancedAiController(mutationService as never, auth as never, context.service as never).runTool(request, {} as never)],
    ["profile", () => new AuthController(auth as never, media as never, context.service as never).updateProfile(request, {} as never)],
    ["password-verify", () => new AuthController(auth as never, media as never, context.service as never).verifyPassword(request, {} as never)],
    ["course-edit", () => new CoursesController(auth as never, mutationService as never, media as never, context.service as never).create(request, {} as never)],
    ["font-write", () => new CopybookFontsController(mutationService as never, admin as never, auth as never, context.service as never).createUserFont(request, undefined, "字体", [])],
    ["copybook", () => new CopybooksController(auth as never, mutationService as never, mutationService as never, context.service as never).list(request)],
    ["render", () => new RenderEngineController(mutationService as never, auth as never, mutationService as never, context.service as never).renderSvg({ layout: {} } as never, request)]
  ];

  for (const [name, action] of actions) {
    await assert.rejects(action, (error: unknown) => error instanceof AppException && error.message === "请切换到主账号身份后操作", name);
  }
  assert.equal(calls, 0);
});

test("账号路由保留原有参数和业务行为", async () => {
  let calls = 0;
  const service = { getWallet: async (userId: string) => { calls += 1; return { userId, balance: 10 }; } };
  const controller = new WalletController(service as never, authFixture() as never, contextFixture(accountSubject).service as never);
  assert.deepEqual((await controller.me(request)).data, { userId: "user-1", balance: 10 });
  assert.equal(calls, 1);
});

test("支付公开产品和学习分享保持匿名，资源中心仅可选读取当前身份", async () => {
  let contextCalls = 0;
  const context = { requireAccount: async () => { contextCalls += 1; throw new Error("不应调用"); } };
  const paymentService = {
    listRechargeProducts: async () => ["product"],
    handleAlipayNotify: async () => ({ provider: "ALIPAY" }),
    handleWechatNotify: async () => ({ provider: "WECHAT_PAY" }),
    handleMockNotify: async () => ({ provider: "MOCK" })
  };
  const payment = new PaymentController(paymentService as never, authFixture() as never, {} as never, context as never);
  assert.deepEqual((await payment.listRechargeProducts()).data, ["product"]);
  assert.equal((await payment.alipayNotify({}, { headers: {} } as never)).data.provider, "ALIPAY");
  assert.equal((await payment.wechatNotify({}, { headers: {} } as never)).data.provider, "WECHAT_PAY");
  assert.equal((await payment.mockNotify("ALIPAY", {})).data.provider, "MOCK");

  const courseSubjects: unknown[] = [];
  const publicCourses = new PublicCoursesController(
    {
      listPublicCourses: async (subject: unknown) => {
        courseSubjects.push(subject);
        return ["course"];
      },
      getPublicCourse: async () => ({ id: "course" })
    } as never,
    authFixture() as never,
    contextFixture(accountSubject).service as never,
    { me: async () => { throw new AppException(40101, "请先登录管理员账号", 401); } } as never
  );
  const publicVideo = new PublicVideoGuideController({ getPublicLesson: async () => ({ id: "video" }) } as never);
  const publicEnglish = new PublicEnglishGuidedStudyController({ getPublicMaterial: async () => ({ id: "english" }) } as never);
  const publicFlashcards = new PublicLearningFlashcardsController({ getPublicCourseDeck: async () => ({ id: "deck" }) } as never);
  assert.deepEqual((await publicCourses.list(request)).data, ["course"]);
  assert.equal((await publicVideo.getPublicLesson("share")).data.id, "video");
  assert.equal((await publicEnglish.getPublicMaterial("material")).data.id, "english");
  assert.equal((await publicFlashcards.getDeck("deck")).data.id, "deck");
  assert.deepEqual(courseSubjects, [accountSubject]);
  assert.equal(contextCalls, 0);
});

test("学习者课程只读接口要求课程授权并仅返回审核发布投影", async () => {
  const context = contextFixture(learnerSubject);
  const projected = {
    id: "course-1",
    name: "审核版课程",
    summary: "仅审核版",
    tags: ["语文"],
    coverUrl: "https://cdn.example/approved.png",
    publishedAt: new Date("2026-08-13T00:00:00Z"),
    items: [{ id: "item-1", materialType: "VIDEO_GUIDE", displayName: "第一课", sortOrder: 0, approvedSnapshot: { title: "审核内容" } }]
  };
  const access = {
    listAuthorizedCourses: async () => [projected],
    getAuthorizedCourse: async (_subject: ProfileSubject, id: string) => id === "course-1" ? projected : Promise.reject(new AppException(40301, "当前学习者未获得此课程授权", 403))
  };
  const { ProfilesController } = await import("../src/profiles/profiles.controller.js");
  const controller = new ProfilesController(authFixture() as never, context.service as never, {} as never, access as never, {} as never);

  const list = (await controller.learnerCourses(request)).data as Array<Record<string, unknown>>;
  const detail = (await controller.learnerCourse(request, "course-1")).data as Record<string, unknown>;
  assert.deepEqual(list, [projected]);
  assert.deepEqual(detail, projected);
  assert.equal("workingRevision" in detail, false);
  assert.equal("reviewRequests" in detail, false);
  assert.equal("userId" in detail, false);
  await assert.rejects(() => controller.learnerCourse(request, "course-other"), /未获得此课程授权/u);
});

test("生产课程授权服务不投影工作版本、作者字段或审核意见", async () => {
  const { LearnerAccessService } = await import("../src/profiles/learner-access.service.js");
  const courseQueries: Array<Record<string, unknown>> = [];
  const prisma = {
    learner: { findFirst: async () => ({ id: "learner-1" }) },
    learnerCourseAuthorization: {
      findUnique: async () => ({ learnerId: "learner-1", courseId: "course-1" })
    },
    course: {
      findFirst: async (query: Record<string, unknown>) => {
        courseQueries.push(query);
        return {
          id: "course-1",
          userId: "user-other",
          approvedRevisionId: "approved-1",
          workingRevisionId: "working-secret",
          publishedAt: new Date("2026-08-13T00:00:00Z"),
          approvedRevision: {
            id: "approved-1",
            name: "审核版课程",
            summary: "审核摘要",
            tags: ["语文"],
            coverMedia: { url: "https://cdn.example/approved.png" },
            items: [{
              id: "item-1",
              materialType: "VIDEO_GUIDE",
              displayName: "第一课",
              sortOrder: 0,
              videoGuideLesson: { status: "SUCCEEDED" },
              englishGuidedStudyMaterial: null,
              learningFlashcardDeck: null,
              publication: { approvedSnapshot: { title: "审核内容" }, approvedHash: "hash-1", currentHash: "hash-1", reviewRequests: [{ reviewNote: "秘密" }] }
            }, {
              id: "item-stale",
              materialType: "VIDEO_GUIDE",
              displayName: "已变更课件",
              sortOrder: 1,
              videoGuideLesson: { status: "SUCCEEDED" },
              englishGuidedStudyMaterial: null,
              learningFlashcardDeck: null,
              publication: { approvedSnapshot: { title: "旧审核内容" }, approvedHash: "old-hash", currentHash: "new-hash" }
            }, {
              id: "item-unlearnable",
              materialType: "LEARNING_FLASHCARD",
              displayName: "已停用课件",
              sortOrder: 2,
              videoGuideLesson: null,
              englishGuidedStudyMaterial: null,
              learningFlashcardDeck: { status: "FAILED" },
              publication: { approvedSnapshot: { title: "旧闪卡" }, approvedHash: "hash-3", currentHash: "hash-3" }
            }]
          },
          workingRevision: { name: "未发布草稿", rejectionReason: "秘密意见" },
          reviewRequests: [{ reviewNote: "秘密意见" }]
        };
      }
    }
  };
  const service = new LearnerAccessService(prisma as never);
  const projected = await service.getAuthorizedCourse(learnerSubject, "course-1") as Record<string, unknown>;

  assert.deepEqual(projected, {
    id: "course-1",
    name: "审核版课程",
    summary: "审核摘要",
    tags: ["语文"],
    coverUrl: "https://cdn.example/approved.png",
    publishedAt: new Date("2026-08-13T00:00:00Z"),
    items: [{
      id: "item-1",
      materialType: "VIDEO_GUIDE",
      displayName: "第一课",
      sortOrder: 0,
      approvedSnapshot: { title: "审核内容" }
    }]
  });
  assert.equal(courseQueries.length, 2);
  const projectionSelect = courseQueries[1]!.select as Record<string, unknown>;
  assert.equal("userId" in projectionSelect, false);
  assert.equal("workingRevision" in projectionSelect, false);
  assert.equal("reviewRequests" in projectionSelect, false);
});

test("学习者课程列表忽略已撤稿的旧授权而不让整页失败", async () => {
  const { LearnerAccessService } = await import("../src/profiles/learner-access.service.js");
  const liveCourse = {
    id: "course-live",
    publishedAt: new Date("2026-08-13T00:00:00Z"),
    approvedRevisionId: "approved-live",
    approvedRevision: {
      name: "有效课程",
      summary: "有效摘要",
      tags: [],
      coverMedia: { url: "https://cdn.example/live.png" },
      items: []
    }
  };
  const prisma = {
    learner: { findFirst: async () => ({ id: "learner-1" }) },
    learnerCourseAuthorization: {
      findMany: async (query: { select: Record<string, unknown> }) => {
        if ("course" in query.select) return [{ course: liveCourse }];
        return [{ courseId: "course-live" }, { courseId: "course-withdrawn" }];
      },
      findUnique: async ({ where }: { where: { learnerId_courseId: { courseId: string } } }) =>
        ({ learnerId: "learner-1", courseId: where.learnerId_courseId.courseId })
    },
    course: {
      findFirst: async ({ where }: { where: { id: string } }) => where.id === "course-live" ? liveCourse : null
    }
  };
  const service = new LearnerAccessService(prisma as never);
  assert.deepEqual(await service.listAuthorizedCourses(learnerSubject), [{
    id: "course-live",
    name: "有效课程",
    summary: "有效摘要",
    tags: [],
    coverUrl: "https://cdn.example/live.png",
    publishedAt: new Date("2026-08-13T00:00:00Z"),
    items: []
  }]);
});

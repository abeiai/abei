import assert from "node:assert/strict";
import test from "node:test";

import { EnglishGuidedStudyService } from "../src/english-guided-study/english-guided-study.service.js";
import { LearningFlashcardsService } from "../src/learning-flashcards/learning-flashcards.service.js";
import { VideoGuideService } from "../src/video-guide/video-guide.service.js";

const accountSubject = { userId: "user-1", mode: "ACCOUNT", learnerId: null } as const;

function trackerSpy() {
  const calls: string[][] = [];

  return {
    calls,
    recordMaterialChange: async (materialType: string, materialId: string) => {
      calls.push([materialType, materialId]);
    }
  };
}

function videoServiceFixture(tracker: ReturnType<typeof trackerSpy>) {
  const current = {
    id: "video-1",
    userId: "user-1",
    learnerId: null,
    title: "测试视频导学",
    mediaName: "video.mp4",
    mediaType: "VIDEO",
    mediaMimeType: "video/mp4",
    mediaSizeBytes: 1024,
    mediaUrl: "https://cdn.example.com/video.mp4",
    mediaStorageKey: "video.mp4",
    subtitleName: "video.srt",
    subtitleFormat: "SRT",
    subtitleSizeBytes: 128,
    subtitleUrl: "https://cdn.example.com/video.srt",
    subtitleStorageKey: "video.srt",
    status: "SUCCEEDED",
    shareToken: "share-token",
    content: {
      narrationScript: "课程导入\n\n旧讲解",
      narrationTimeline: [
        {
          id: "intro",
          type: "INTRO",
          title: "课程导入",
          script: "课程导入",
          chunks: [{ id: "intro-c1", type: "intro", text: "课程导入", overlay: null }]
        },
        {
          id: "s_001",
          type: "SENTENCE",
          title: "第 1 句",
          sentenceId: "s_001",
          subtitle: "Hello world.",
          script: "旧讲解",
          chunks: [{ id: "s_001-c1", type: "phrase", text: "旧讲解", overlay: null }]
        }
      ]
    },
    errorMessage: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    finishedAt: new Date("2026-07-01T00:10:00.000Z")
  };
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    videoGuideLesson: {
      findFirst: async () => current,
      update: async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data })
    }
  };
  const prisma = {
    videoGuideLesson: {
      findFirst: async () => current,
      update: async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data })
    },
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)
  };
  const service = new VideoGuideService({} as never, {} as never, tracker as never);
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  return service;
}

function narrationInput() {
  return {
    nodes: [
      { id: "intro", originalScript: "课程导入", script: "课程导入" },
      { id: "s_001", originalScript: "旧讲解", script: "新讲解" }
    ]
  };
}

function englishServiceFixture(tracker: ReturnType<typeof trackerSpy>) {
  const current = {
    id: "english-1",
    userId: "user-1",
    learnerId: null,
    title: "Hello world",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "旧导入",
    narration: "旧讲解",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: { sentences: [] },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const englishGuidedStudyMaterial = {
    findFirst: async () => current,
    update: async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data })
  };
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    englishGuidedStudyMaterial
  };
  const prisma = {
    englishGuidedStudyMaterial,
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, tracker as never);
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  return service;
}

function flashcardServiceFixture(tracker: ReturnType<typeof trackerSpy>) {
  const updates: Array<Record<string, unknown>> = [];
  const card = {
    id: "card-1",
    deckId: "deck-1",
    type: "meaning",
    front: "old front",
    back: "old back",
    source: "source",
    tags: ["tag-a", "tag-b"],
    sortOrder: 0,
    reviews: [],
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const prisma = {
    $queryRaw: async () => [{ locked: 1 }],
    learningFlashcard: {
      findFirst: async () => card,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...card, ...data };
      }
    },
    learningFlashcardReview: {
      create: async ({ data }: { data: Record<string, string> }) => ({
        id: "review-1",
        ...data,
        createdAt: new Date("2026-07-18T00:00:00.000Z")
      })
    },
    $transaction: async <T>(callback: (client: unknown) => Promise<T>) => callback(prisma)
  };
  const service = new LearningFlashcardsService({} as never, tracker as never);
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  return { service, updates };
}

test("编辑视频导学讲解后记录视频课件变更", async () => {
  const tracker = trackerSpy();
  const service = videoServiceFixture(tracker);
  await service.updateLessonNarrationScript(accountSubject, "video-1", narrationInput());
  assert.deepEqual(tracker.calls, [["VIDEO_GUIDE", "video-1"]]);
});

test("替换视频导学字幕后记录视频课件变更", async () => {
  const tracker = trackerSpy();
  const service = videoServiceFixture(tracker);
  await service.updateLessonSubtitle(accountSubject, "video-1", {
    subtitleName: "new.srt",
    subtitleFormat: "SRT",
    subtitleText: "1\n00:00:00,000 --> 00:00:01,000\nHello world."
  });
  assert.deepEqual(tracker.calls, [["VIDEO_GUIDE", "video-1"]]);
});

test("修改视频导学课件名称后保存并记录变更", async () => {
  const tracker = trackerSpy();
  const service = videoServiceFixture(tracker);
  const lesson = await service.updateLessonTitle(accountSubject, "video-1", { title: " 新课件名称 " });
  assert.equal(lesson.title, "新课件名称");
  assert.deepEqual(tracker.calls, [["VIDEO_GUIDE", "video-1"]]);
});

test("编辑英文带读讲解后记录英文课件变更", async () => {
  const tracker = trackerSpy();
  const service = englishServiceFixture(tracker);
  await service.updateMaterialScript(accountSubject, "english-1", {
    targetType: "INTRO",
    originalScript: "旧导入",
    script: "新讲解"
  });
  assert.deepEqual(tracker.calls, [["ENGLISH_GUIDED_STUDY", "english-1"]]);
});

test("编辑闪卡内容会记录变更，复习反馈不会", async () => {
  const tracker = trackerSpy();
  const { service, updates } = flashcardServiceFixture(tracker);
  await service.updateCard(accountSubject, "card-1", { front: "new front" });
  await service.reviewCard(accountSubject, "card-1", { grade: "MASTERED" });
  assert.equal(updates.length, 1);
  assert.deepEqual(tracker.calls, [["LEARNING_FLASHCARD", "deck-1"]]);
});

test("闪卡归一化后内容未变化时不更新数据库或触发审核", async () => {
  const tracker = trackerSpy();
  const { service, updates } = flashcardServiceFixture(tracker);

  const card = await service.updateCard(accountSubject, "card-1", {
    type: "   ",
    front: "  old front  ",
    back: " old back ",
    source: " source ",
    tags: [" tag-a ", "", " tag-b"]
  });

  assert.equal(card.front, "old front");
  assert.equal(updates.length, 0);
  assert.deepEqual(tracker.calls, []);
});

test("英文材料置顶和视频媒体规范化不记录课件内容变更", async () => {
  const englishTracker = trackerSpy();
  const englishService = englishServiceFixture(englishTracker);
  await englishService.pinMaterial(accountSubject, "english-1");
  assert.deepEqual(englishTracker.calls, []);

  const videoTracker = trackerSpy();
  const videoService = videoServiceFixture(videoTracker);
  await videoService.normalizeUserLessonMediaForWeb(accountSubject, "video-1");
  assert.deepEqual(videoTracker.calls, []);
});

test("英文材料重新生成后审核记录失败不影响业务成功且不释放已结算点数", async () => {
  const existing = {
    id: "english-regenerate",
    userId: "user-1",
    title: "Old title",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "Old summary",
    narration: "Old narration",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: {},
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const transaction = {
    englishGuidedStudyMaterial: {
      update: async ({ data }: { data: Record<string, unknown> }) => ({ ...existing, ...data })
    }
  };
  const prisma = {
    englishGuidedStudyMaterial: {
      findFirst: async () => existing
    },
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)
  };
  let releaseCalls = 0;
  let trackerCalls = 0;
  const service = new EnglishGuidedStudyService(
    {} as never,
    {} as never,
    {
      recordMaterialChange: async () => {
        trackerCalls += 1;
        throw new Error("审核服务暂不可用");
      }
    } as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma,
    logger: { warn: () => undefined },
    createBillingEstimate: async () => ({
      availableCredits: 100,
      enoughCredits: true,
      estimatedCredits: 10,
      items: [],
      operation: "ENGLISH_GUIDED_STUDY_CONTENT",
      requestId: "billing-request-0001",
      revision: "revision-1",
      title: "生成英文带学讲稿"
    }),
    generateMaterialContent: async () => ({
      title: "New title",
      summary: "New summary",
      narration: "New narration",
      audioDurationSeconds: 0,
      sentences: [],
      questions: []
    }),
    reserveEnglishGuidedStudyCredits: async () => undefined,
    settleEnglishGuidedStudyCredits: async () => undefined,
    releaseEnglishGuidedStudyCredits: async () => {
      releaseCalls += 1;
    }
  });

  const material = await service.generateMaterial("user-1", {
    materialId: existing.id,
    sourceType: "TEXT",
    sourceText: existing.sourceText,
    levelStandardName: existing.levelStandardName,
    levelOptionLabel: existing.levelOptionLabel,
    aiLevel: existing.aiLevel,
    explanationMode: "SENTENCE",
    billingConfirmed: true,
    billingRequestId: "billing-request-0001",
    billingRevision: "revision-1"
  });

  assert.equal(material.id, existing.id);
  assert.equal(trackerCalls, 1);
  assert.equal(releaseCalls, 0);
});

test("视频后台练习生成后审核记录失败不回滚成功结果或释放点数", async () => {
  const job = {
    version: 1 as const,
    jobId: "job-1",
    attemptId: "attempt-1",
    operation: "PRACTICE" as const,
    operationKey: "operation-1",
    estimatedCredits: 10,
    input: {},
    createdAt: "2026-07-18T00:00:00.000Z"
  };
  const lesson = {
    id: "video-background",
    userId: "user-1",
    title: "Background lesson",
    content: { practiceGenerationJob: job }
  };
  const updates: Array<{ data: Record<string, unknown> }> = [];
  const transaction = {
    videoGuideLesson: {
      findFirst: async () => lesson,
      updateMany: async (input: { data: Record<string, unknown> }) => {
        updates.push(input);
        return { count: 1 };
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)
  };
  let releaseCalls = 0;
  let trackerCalls = 0;
  const service = new VideoGuideService(
    {} as never,
    {
      generateScenarioTextForExternalBilling: async () => ({
        taskId: "task-1",
        providerName: "provider",
        modelName: "model",
        text: JSON.stringify({
          questions: Array.from({ length: 10 }, (_, index) => ({
            question: `Question ${index + 1}?`,
            options: ["A", "B", "C", "D"],
            answer: index % 4,
            explanation: "Explanation"
          }))
        })
      })
    } as never,
    {
      recordMaterialChange: async () => {
        trackerCalls += 1;
        throw new Error("审核服务暂不可用");
      }
    } as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma,
    logger: { warn: () => undefined },
    claimLessonOperation: async () => ({ job, lesson }),
    findPracticeReadyLesson: async () => lesson,
    updateLessonOperationProgress: async () => undefined,
    lockVideoGuideLesson: async () => undefined,
    assertPracticeReadyLesson: () => undefined,
    nextOperationProgress: () => ({ status: "SUCCEEDED" }),
    settleVideoGuideCredits: async () => undefined,
    releaseVideoGuideCredits: async () => {
      releaseCalls += 1;
    }
  });

  await (service as unknown as { runPracticeGeneration(id: string): Promise<void> })
    .runPracticeGeneration(lesson.id);

  assert.equal(updates.length, 1);
  assert.equal(trackerCalls, 1);
  assert.equal(releaseCalls, 0);
});

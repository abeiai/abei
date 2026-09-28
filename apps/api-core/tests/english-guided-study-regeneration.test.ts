import { membershipWalletFixture } from "./helpers/membership-wallet-fixture.js";
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import {
  EnglishGuidedStudyService,
  isRetryableEnglishNarrationTask
} from "../src/english-guided-study/english-guided-study.service.js";

const courseReviewService = {
  recordMaterialChange: async () => undefined
};
const accountSubject = { userId: "user-1", mode: "ACCOUNT", learnerId: null } as const;

function generatedMaterialText(
  script = "我们先看这句问候。Hello world 是一个很短的表达，先记住 Hello 表示你好，world 表示世界。",
  title = "Regenerated lesson"
) {
  return JSON.stringify({
    title,
    summary: `${title}. 这个标题表示课程会重新带我们理解这句英文，并关注它的核心表达。`,
    narration: "Regenerated narration",
    sentences: [
      {
        id: "s1",
        segmentId: "s1",
        text: "Hello world.",
        script,
        explanation: "A simple greeting.",
        grammarFocus: "Subject and verb.",
        points: []
      }
    ],
    questions: Array.from({ length: 10 }, (_, index) => ({
      id: `q${index + 1}`,
      question: `Question ${index + 1}?`,
      options: ["A", "B", "C", "D"],
      answer: index % 4,
      explanation: "Because A matches the lesson."
    }))
});
}

test("英文带学文稿中文比例不足时自动纠偏后再保存", async () => {
  const existing = {
    id: "material-language-ratio",
    userId: "user-1",
    title: "Greeting",
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
    audioDurationSeconds: 30,
    content: {},
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  let generationCalls = 0;
  let savedContent: unknown;
  const prisma = withBillingPrisma({
    englishGuidedStudyMaterial: {
      findFirst: async () => existing,
      create: async () => existing,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        savedContent = data.content;
        return {
          ...existing,
          ...data,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: new Date("2026-07-16T00:00:00.000Z")
        };
      }
    }
  });
  const aiService = {
    generateScenarioTextForExternalBilling: async () => {
      generationCalls += 1;

      return {
        taskId: `task-${generationCalls}`,
        text: generatedMaterialText(
          generationCalls === 1
            ? "Let's learn this greeting in English. It is simple and friendly."
            : "我们先看这句最简单的问候。它是在向别人打招呼。Hello 是你好，world 是世界。你只要先听懂，再跟着读一遍 Hello world。",
          "Greeting"
        ),
        providerName: "test-provider",
        modelName: "test-model"
      };
    }
  };
  const service = new EnglishGuidedStudyService({} as never, aiService as never, courseReviewService as never);
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  const input = {
    materialId: existing.id,
    title: "Greeting",
    sourceType: "TEXT",
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    explanationMode: "SENTENCE" as const
  };
  const estimate = await service.estimateMaterialGeneration("user-1", input);

  await service.generateMaterial("user-1", {
    ...input,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });

  const savedSentences = (savedContent as { sentences: Array<{ script: string }> }).sentences;
  assert.equal(generationCalls, 2);
  assert.match(savedSentences[0]?.script ?? "", /我们先看/);
});

test("重新生成英文带学时更新原材料而不创建新记录", async () => {
  const existing = {
    id: "material-1",
    userId: "user-1",
    title: "Old lesson",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "B1",
    aiLevel: "B1",
    summary: "Old summary",
    narration: "Old narration",
    audioUrl: "https://example.com/old.mp3",
    audioTaskId: "audio-old",
    audioDurationSeconds: 30,
    content: {},
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  let createCalls = 0;
  let updateCalls = 0;
  const prisma = withBillingPrisma({
    englishGuidedStudyMaterial: {
      findFirst: async () => existing,
      create: async () => {
        createCalls += 1;
        return existing;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateCalls += 1;
        return {
          ...existing,
          ...data,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: new Date("2026-07-16T00:00:00.000Z")
        };
      }
    }
  });
  const aiService = {
    generateScenarioTextForExternalBilling: async () => ({
      taskId: "task-1",
      text: generatedMaterialText(),
      providerName: "test-provider",
      modelName: "test-model"
    })
  };
  const cleanedTaskIds: string[][] = [];
  const audioService = {
    cleanupExternalNarrationAudio: async (_userId: string, taskIds: string[]) => {
      cleanedTaskIds.push(taskIds);
      return { cleaned: taskIds.length };
    }
  };
  const service = new EnglishGuidedStudyService(
    audioService as never,
    aiService as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  const input = {
    materialId: existing.id,
    title: "Regenerated lesson",
    sourceType: "TEXT",
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "B1",
    aiLevel: "B1",
    explanationMode: "SENTENCE" as const
  };
  const estimate = await service.estimateMaterialGeneration("user-1", input);
  const result = await service.generateMaterial("user-1", {
    ...input,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });

  assert.equal(result.id, existing.id);
  assert.equal(createCalls, 0);
  assert.equal(updateCalls, 1);
  assert.equal(result.audioUrl, null);
  assert.equal(result.audioTaskId, null);
  assert.deepEqual(cleanedTaskIds, [["audio-old"]]);
});

test("已有讲解语音时未确认单句合成费用不能保存英文带学文稿", async () => {
  const existing = {
    id: "material-edit",
    userId: "user-1",
    title: "Greeting",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "Old summary",
    narration: "Old narration",
    audioUrl: "https://example.com/old.mp3",
    audioTaskId: "audio-old-edit",
    audioDurationSeconds: 30,
    content: {
      sentences: [{
        id: "s1",
        text: "Hello world.",
        script: "Old script",
        explanation: "Old explanation",
        points: []
      }]
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  let updateCalls = 0;
  const prisma = {
    englishGuidedStudyMaterial: {
      findFirst: async () => existing,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateCalls += 1;
        return {
          ...existing,
          ...data,
          updatedAt: new Date("2026-07-17T00:00:00.000Z")
        };
      }
    }
  };
  const cleanedTaskIds: string[][] = [];
  const audioService = {
    cleanupExternalNarrationAudio: async (_userId: string, taskIds: string[]) => {
      cleanedTaskIds.push(taskIds);
      return { cleaned: taskIds.length };
    }
  };
  const service = new EnglishGuidedStudyService(
    audioService as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  await assert.rejects(
    () =>
      service.updateMaterialScript(accountSubject, existing.id, {
        targetType: "SENTENCE",
        sentenceId: "s1",
        originalScript: "Old script",
        script: "新的讲解文本"
      }),
    /确认.*点数|计费确认/u
  );
  assert.equal(updateCalls, 0);
  assert.deepEqual(cleanedTaskIds, []);
});

test("英文带学文稿编辑只预估当前修改节点的语音费用", async () => {
  const existing = {
    id: "material-edit-estimate",
    userId: "user-1",
    title: "Greeting",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "Old summary",
    narration: "Old summary\nOld script\nOld closing",
    audioUrl: "https://example.com/intro.mp3",
    audioTaskId: "audio-intro",
    audioDurationSeconds: 30,
    content: {
      scene: "ENGLISH",
      closing: "Old closing",
      narrationVoice: {
        providerVoiceId: "voice-1",
        voiceAssetId: null,
        modelAlias: "tts-default",
        speed: 1
      },
      narrationTimelineV2: {
        version: 2,
        nodes: [
          { id: "intro", type: "INTRO", sentenceId: null, chunkType: "INTRO", script: "Old summary", focus: null, audioTaskId: "audio-intro", audioUrl: "https://example.com/intro.mp3", durationMs: 1000 },
          { id: "s1-c1", type: "SENTENCE", sentenceId: "s1", chunkType: "CONTEXT", script: "Old script", focus: null, audioTaskId: "audio-s1", audioUrl: "https://example.com/s1.mp3", durationMs: 1000 },
          { id: "summary", type: "SUMMARY", sentenceId: null, chunkType: "SUMMARY", script: "Old closing", focus: null, audioTaskId: "audio-summary", audioUrl: "https://example.com/summary.mp3", durationMs: 1000 }
        ]
      },
      sentences: [{ id: "s1", text: "Hello world.", script: "Old script", explanation: "Old explanation", points: [] }]
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const prisma = {
    englishGuidedStudyMaterial: {
      findFirst: async () => existing
    },
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => ({ availableCredits: 500 })
    }
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  const estimateMethod = Reflect.get(service, "estimateMaterialScriptUpdate");

  assert.equal(typeof estimateMethod, "function");
  const estimate = await estimateMethod.call(service, accountSubject, existing.id, {
    targetType: "SENTENCE",
    sentenceId: "s1",
    originalScript: "Old script",
    script: "新的讲解文本"
  });

  assert.equal(estimate.title, "更新本句讲解语音");
  assert.ok(estimate.estimatedCredits > 0);
  assert.equal(estimate.items.length, 1);
});

test("英文带学本句原语音变化后计费确认版本立即失效", async () => {
  const current: any = {
    id: "material-edit-revision",
    userId: "user-1",
    learnerId: null,
    title: "Greeting",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "Old summary",
    narration: "Old summary\nOld script\nOld closing",
    audioUrl: "https://example.com/intro.mp3",
    audioTaskId: "audio-intro",
    audioDurationSeconds: 3,
    content: {
      scene: "ENGLISH",
      closing: "Old closing",
      narrationVoice: { providerVoiceId: "voice-1", modelAlias: "tts-default", speed: 1 },
      narrationTimelineV2: {
        version: 2,
        nodes: [
          { id: "intro", type: "INTRO", sentenceId: null, chunkType: "INTRO", script: "Old summary", focus: null, audioTaskId: "audio-intro", audioUrl: "https://example.com/intro.mp3", durationMs: 1000 },
          { id: "s1-c1", type: "SENTENCE", sentenceId: "s1", chunkType: "CONTEXT", script: "Old script", focus: null, audioTaskId: "audio-s1", audioUrl: "https://example.com/s1.mp3", durationMs: 1000 },
          { id: "summary", type: "SUMMARY", sentenceId: null, chunkType: "SUMMARY", script: "Old closing", focus: null, audioTaskId: "audio-summary", audioUrl: "https://example.com/summary.mp3", durationMs: 1000 }
        ]
      },
      sentences: [{ id: "s1", text: "Hello world.", script: "Old script", explanation: "Old explanation", points: [] }]
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  Object.assign(service as any, {
    prisma: {
      englishGuidedStudyMaterial: { findFirst: async () => current },
      ...membershipWalletFixture(),
      wallet: { upsert: async () => ({ availableCredits: 500 }) }
    }
  });
  const request = {
    targetType: "SENTENCE" as const,
    sentenceId: "s1",
    originalScript: "Old script",
    script: "New script",
    billingRequestId: "same-edit-request"
  };
  const first = await service.estimateMaterialScriptUpdate(accountSubject, current.id, request);

  current.content.narrationTimelineV2.nodes[1].audioTaskId = "audio-s1-competing";
  const second = await service.estimateMaterialScriptUpdate(accountSubject, current.id, request);

  assert.notEqual(first.revision, second.revision);
});

test("确认计费后历史英文带学从原音频任务恢复音色并只重合成当前句", async () => {
  let current: any = {
    id: "material-edit-confirmed",
    userId: "user-1",
    learnerId: null,
    title: "Greeting",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "Old summary",
    narration: "Old summary\nOld script\nOld closing",
    audioUrl: "https://example.com/intro.mp3",
    audioTaskId: "audio-intro",
    audioDurationSeconds: 3,
    content: {
      scene: "ENGLISH",
      closing: "Old closing",
      narrationTimelineV2: {
        version: 2,
        nodes: [
          { id: "intro", type: "INTRO", sentenceId: null, chunkType: "INTRO", script: "Old summary", focus: null, audioTaskId: "audio-intro", audioUrl: "https://example.com/intro.mp3", durationMs: 1000 },
          { id: "s1-c1", type: "SENTENCE", sentenceId: "s1", chunkType: "CONTEXT", script: "Old script", focus: null, audioTaskId: "audio-s1", audioUrl: "https://example.com/s1.mp3", durationMs: 1000 },
          { id: "summary", type: "SUMMARY", sentenceId: null, chunkType: "SUMMARY", script: "Old closing", focus: null, audioTaskId: "audio-summary", audioUrl: "https://example.com/summary.mp3", durationMs: 1000 }
        ]
      },
      sentences: [{ id: "s1", text: "Hello world.", script: "Old script", explanation: "Old explanation", points: [] }],
      questions: [{ id: "q1" }]
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const englishGuidedStudyMaterial = {
    findFirst: async () => current,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      current = { ...current, ...data, updatedAt: new Date("2026-08-20T00:00:00.000Z") };
      return current;
    }
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<unknown>) => callback({
      $queryRaw: async () => [{ locked: 1 }],
      englishGuidedStudyMaterial
    }),
    englishGuidedStudyMaterial,
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => ({ availableCredits: 500 })
    },
    audioTask: {
      findUnique: async () => ({
        voiceAssetId: null,
        model: "cosyvoice-v3-flash",
        providerPayload: {
          voice: "voice-1",
          parameters: { speed: 1.1, pitch: 0.2, volume: 0.9, sampleRate: 24000 }
        }
      })
    }
  };
  const synthesized: Array<Record<string, unknown>> = [];
  const cleanedTaskIds: string[][] = [];
  const audioService = {
    cleanupExternalNarrationAudio: async (_userId: string, taskIds: string[]) => {
      cleanedTaskIds.push(taskIds);
      return { cleaned: taskIds.length };
    },
    synthesizeTtsForExternalBilling: async (_context: unknown, input: Record<string, unknown>) => {
      synthesized.push(input);
      return {
        id: "audio-s1-new",
        status: "SUCCEEDED",
        outputAudioAsset: {
          url: "https://example.com/s1-new.mp3",
          durationMs: 1200
        },
        providerPayload: {}
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    audioService as never,
    {} as never,
    courseReviewService as never
  );
  const originalAvailabilityCheck = Reflect.get(service, "assertEnglishGuidedStudyOperationAvailable").bind(service);
  let availabilityChecks = 0;
  Object.assign(service as any, {
    prisma,
    assertEnglishGuidedStudyOperationAvailable: (...args: unknown[]) => {
      availabilityChecks += 1;
      return originalAvailabilityCheck(...args);
    },
    reserveEnglishGuidedStudyCredits: async () => undefined,
    settleEnglishGuidedStudyCredits: async () => undefined,
    releaseEnglishGuidedStudyCredits: async () => undefined
  });
  const request = {
    targetType: "SENTENCE" as const,
    sentenceId: "s1",
    originalScript: "Old script",
    script: "新的讲解文本"
  };
  const estimate = await service.estimateMaterialScriptUpdate(accountSubject, current.id, request);
  const result = await service.updateMaterialScript(accountSubject, current.id, {
    ...request,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });
  assert.ok((result.content as any).narrationTimelineV2);
  const nodes = (result.content as any).narrationTimelineV2.nodes;

  assert.equal(synthesized.length, 1);
  assert.equal(synthesized[0]?.text, "新的讲解文本");
  assert.equal(synthesized[0]?.voice, "voice-1");
  assert.equal(nodes[0]?.audioTaskId, "audio-intro");
  assert.equal(nodes[1]?.audioTaskId, "audio-s1-new");
  assert.equal(nodes[2]?.audioTaskId, "audio-summary");
  assert.deepEqual(cleanedTaskIds, [["audio-s1"]]);
  assert.equal(availabilityChecks, 4);
});

test("英文带学文稿未变化时保留已有讲解语音且不写库", async () => {
  const current: any = {
    id: "material-edit-unchanged",
    userId: "user-1",
    learnerId: null,
    title: "Greeting",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "Old summary",
    narration: "Old summary\nOld script\nOld closing",
    audioUrl: "https://example.com/intro.mp3",
    audioTaskId: "audio-intro",
    audioDurationSeconds: 3,
    content: {
      scene: "ENGLISH",
      closing: "Old closing",
      narrationTimelineV2: {
        version: 2,
        nodes: [
          { id: "intro", type: "INTRO", sentenceId: null, chunkType: "INTRO", script: "Old summary", focus: null, audioTaskId: "audio-intro", audioUrl: "https://example.com/intro.mp3", durationMs: 1000 },
          { id: "s1-c1", type: "SENTENCE", sentenceId: "s1", chunkType: "CONTEXT", script: "Old script", focus: null, audioTaskId: "audio-s1", audioUrl: "https://example.com/s1.mp3", durationMs: 1000 },
          { id: "summary", type: "SUMMARY", sentenceId: null, chunkType: "SUMMARY", script: "Old closing", focus: null, audioTaskId: "audio-summary", audioUrl: "https://example.com/summary.mp3", durationMs: 1000 }
        ]
      },
      sentences: [{ id: "s1", text: "Hello world.", script: "Old script", explanation: "Old explanation", points: [] }],
      questions: []
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  let updateCalls = 0;
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  Object.assign(service as any, {
    prisma: {
      englishGuidedStudyMaterial: {
        findFirst: async () => current,
        update: async () => {
          updateCalls += 1;
          return current;
        }
      }
    }
  });

  const result = await service.updateMaterialScript(accountSubject, current.id, {
    targetType: "SENTENCE",
    sentenceId: "s1",
    originalScript: "Old script",
    script: "Old script"
  });

  assert.equal(result.audioUrl, current.audioUrl);
  assert.equal(updateCalls, 0);
});

test("保存英文带学学习内容时保留文稿等内容并清除旧跟读结果", async () => {
  const generatedContent = {
    contentTitle: "Old title",
    author: "Old author",
    authorIntroductionMode: "BRIEF",
    sourceText: "Old source text.",
    sentences: [{ id: "s1", text: "Old source text.", script: "旧讲解。", points: [] }],
    questions: [{ id: "q1", question: "Old question?", options: ["A", "B"], answer: 0 }],
    narrationTimelineV2: { version: 2, nodes: [{ id: "node-1" }] },
    readAlong: {
      version: 2,
      source: "UPLOAD",
      audioUrl: "https://example.com/read-along.mp3",
      audioName: "old-reading.mp3",
      audioAssetId: "old-read-along-asset",
      durationMs: 1_000,
      srtText: "",
      cues: [{
        id: "read-along-cue-1",
        unitId: "read-along-body-s1",
        unitType: "BODY",
        sentenceId: "s1",
        text: "Old source text.",
        startSeconds: 0,
        endSeconds: 1,
        timingSource: "ASR_CUE",
        words: []
      }],
      nodes: [],
      voice: null
    },
    readAlongGeneration: { mode: "UPLOAD" },
    readAlongGenerationProgress: {
      version: 1,
      operation: "READ_ALOUD",
      status: "SUCCEEDED"
    }
  };
  const existing = {
    id: "material-source-edit",
    userId: "user-1",
    title: "Old title",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Old source text.",
    levelStandardName: "CEFR",
    levelOptionLabel: "B1",
    aiLevel: "B1",
    summary: "旧导语。",
    narration: "旧完整文稿。",
    audioUrl: "https://example.com/guided.mp3",
    audioTaskId: "audio-guided-1",
    audioDurationSeconds: 42,
    content: generatedContent,
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  let savedData: Record<string, unknown> | null = null;
  let lockCalls = 0;
  const deletedAudioAssetIds: string[] = [];
  const englishGuidedStudyMaterial = {
    findFirst: async () => existing,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      savedData = data;
      return {
        ...existing,
        ...data,
        updatedAt: new Date("2026-08-12T00:00:00.000Z")
      };
    }
  };
  const prisma = {
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      $queryRaw: async () => {
        lockCalls += 1;
        return [{ locked: 1 }];
      },
      englishGuidedStudyMaterial
    }),
    englishGuidedStudyMaterial
  };
  const service = new EnglishGuidedStudyService(
    {
      deleteAudioAsset: async (_userId: string, audioAssetId: string) => {
        deletedAudioAssetIds.push(audioAssetId);
      }
    } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  const result = await service.updateMaterialSource("user-1", existing.id, {
    title: "New title",
    author: "New author",
    authorIntroductionMode: "DETAILED",
    sourceText: "First line.  \n\n\nSecond line."
  });

  assert.equal(result.title, "New title");
  assert.equal(result.sourceText, "First line.\n\nSecond line.");
  assert.equal(result.audioUrl, existing.audioUrl);
  assert.equal(result.audioTaskId, existing.audioTaskId);
  assert.equal(result.narration, existing.narration);
  assert.equal(result.content.contentTitle, "New title");
  assert.equal(result.content.author, "New author");
  assert.equal(result.content.authorIntroductionMode, "DETAILED");
  assert.deepEqual(result.content.sentences, generatedContent.sentences);
  assert.deepEqual(result.content.questions, generatedContent.questions);
  assert.deepEqual(result.content.narrationTimelineV2, generatedContent.narrationTimelineV2);
  assert.equal(result.content.readAlong, null);
  assert.equal(result.content.readAlongGeneration, undefined);
  assert.equal(result.content.readAlongGenerationProgress, undefined);
  assert.equal(savedData?.audioUrl, undefined);
  assert.equal(savedData?.narration, undefined);
  assert.deepEqual(deletedAudioAssetIds, ["old-read-along-asset"]);
  assert.equal(lockCalls, 1);
});

test("读取历史材料时不再返回与当前学习内容不一致的旧跟读结果", async () => {
  const existing = {
    id: "material-stale-read-along",
    userId: "user-1",
    learnerId: null,
    title: "静夜思",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "举头望明月，低头思故乡。",
    levelStandardName: "学段年级",
    levelOptionLabel: "七年级",
    aiLevel: "七年级",
    summary: "旧导语。",
    narration: "旧讲解。",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: {
      scene: "GUSHIWEN",
      contentTitle: "静夜思",
      author: "李白",
      sourceText: "举头望明月，低头思故乡。",
      sentences: [{ id: "s1", text: "床前明月光，疑是地上霜。", script: "旧讲解。", points: [] }],
      questions: [],
      readAlong: {
        version: 2,
        source: "UPLOAD",
        audioUrl: "https://example.com/old-reading.mp3",
        audioName: "old-reading.mp3",
        audioAssetId: "old-reading-asset",
        durationMs: 1_000,
        srtText: "",
        cues: [{
          id: "read-along-cue-1",
          unitId: "read-along-body-s1",
          unitType: "BODY",
          sentenceId: "s1",
          text: "床前明月光，疑是地上霜。",
          startSeconds: 0,
          endSeconds: 1,
          timingSource: "ASR_CUE",
          words: []
        }],
        nodes: [],
        voice: null
      }
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-12T00:00:00.000Z")
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as any, {
    prisma: {
      englishGuidedStudyMaterial: {
        findFirst: async () => existing
      }
    }
  });

  const result = await service.getUserMaterial(accountSubject, existing.id);

  assert.equal((result.content as { readAlong?: unknown }).readAlong, null);
});

test("生成式跟读音频节点与当前正文不一致时用户和公开材料都隐藏旧跟读", async () => {
  const existing = {
    id: "material-stale-generated-read-along",
    userId: "user-1",
    learnerId: null,
    title: "静夜思",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "举头望明月，低头思故乡。",
    levelStandardName: "学段年级",
    levelOptionLabel: "七年级",
    aiLevel: "七年级",
    summary: "导语。",
    narration: "讲解。",
    audioUrl: "https://example.com/guided.mp3",
    audioTaskId: "guided-audio-task",
    audioDurationSeconds: 10,
    content: {
      scene: "GUSHIWEN",
      contentTitle: "静夜思",
      author: "李白",
      sourceText: "举头望明月，低头思故乡。",
      sentences: [{ id: "s1", text: "举头望明月，低头思故乡。", script: "讲解。", points: [] }],
      questions: [],
      readAlong: {
        version: 2,
        source: "GENERATED",
        audioUrl: "https://example.com/generated-reading.mp3",
        audioName: "generated-reading.mp3",
        audioAssetId: null,
        durationMs: 3_000,
        srtText: "",
        cues: [
          {
            id: "cue-title",
            unitId: "read-along-title",
            unitType: "TITLE",
            sentenceId: null,
            text: "静夜思",
            startSeconds: 0,
            endSeconds: 0.5,
            timingSource: "ASR_CUE",
            words: []
          },
          {
            id: "cue-author",
            unitId: "read-along-author",
            unitType: "AUTHOR",
            sentenceId: null,
            text: "李白",
            startSeconds: 0.5,
            endSeconds: 1,
            timingSource: "ASR_CUE",
            words: []
          },
          {
            id: "cue-body",
            unitId: "read-along-body-s1",
            unitType: "BODY",
            sentenceId: "s1",
            text: "举头望明月，低头思故乡。",
            startSeconds: 1,
            endSeconds: 3,
            timingSource: "ASR_CUE",
            words: []
          }
        ],
        nodes: [
          {
            id: "node-title",
            unitId: "read-along-title",
            unitType: "TITLE",
            sentenceId: null,
            text: "静夜思",
            audioTaskId: "audio-title",
            audioUrl: "https://example.com/title.mp3",
            durationMs: 500,
            timingSource: "ASR_CUE",
            words: []
          },
          {
            id: "node-author",
            unitId: "read-along-author",
            unitType: "AUTHOR",
            sentenceId: null,
            text: "李白",
            audioTaskId: "audio-author",
            audioUrl: "https://example.com/author.mp3",
            durationMs: 500,
            timingSource: "ASR_CUE",
            words: []
          },
          {
            id: "node-body",
            unitId: "read-along-body-s1",
            unitType: "BODY",
            sentenceId: "s1",
            text: "床前明月光，疑是地上霜。",
            audioTaskId: "audio-old-body",
            audioUrl: "https://example.com/old-body.mp3",
            durationMs: 2_000,
            timingSource: "ASR_CUE",
            words: []
          }
        ],
        voice: "test-voice"
      }
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-12T00:00:00.000Z")
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as any, {
    prisma: {
      englishGuidedStudyMaterial: {
        findFirst: async () => existing,
        findUnique: async () => existing
      }
    }
  });

  const userMaterial = await service.getUserMaterial(accountSubject, existing.id);
  const publicMaterial = await service.getPublicMaterial(existing.id);

  assert.equal((userMaterial.content as { readAlong?: unknown }).readAlong, null);
  assert.equal((publicMaterial.content as { readAlong?: unknown }).readAlong, null);
});

test("英文带学结束语可以作为独立节点编辑并写回完整讲稿", async () => {
  const existing = {
    id: "material-edit-closing",
    userId: "user-1",
    title: "Greeting",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "自然导入。",
    narration: "旧文稿",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: {
      closing: "旧结束语。",
      sentences: [{
        id: "s1",
        text: "Hello world.",
        script: "逐句讲解。",
        explanation: "一句问候。",
        points: []
      }]
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  let lockCalls = 0;
  const englishGuidedStudyMaterial = {
    findFirst: async () => existing,
    update: async ({ data }: { data: Record<string, unknown> }) => ({
      ...existing,
      ...data,
      updatedAt: new Date("2026-07-29T00:00:00.000Z")
    })
  };
  const prisma = {
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      $queryRaw: async () => {
        lockCalls += 1;
        return [{ locked: 1 }];
      },
      englishGuidedStudyMaterial
    }),
    englishGuidedStudyMaterial: {
      ...englishGuidedStudyMaterial
    }
  };
  const service = new EnglishGuidedStudyService(
    { cleanupExternalNarrationAudio: async () => ({ cleaned: 0 }) } as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  const result = await service.updateMaterialScript(accountSubject, existing.id, {
    targetType: "SUMMARY",
    originalScript: "旧结束语。",
    script: "新的自然结束语。"
  });

  assert.equal((result.content as { closing?: string }).closing, "新的自然结束语。");
  assert.equal(result.narration, "自然导入。\n逐句讲解。\n新的自然结束语。");
  assert.equal(lockCalls, 1);
});

test("英文带学无语音编辑在事务锁内拒绝覆盖同一节点的新文稿", async () => {
  const initial = {
    id: "material-edit-stale",
    userId: "user-1",
    title: "Greeting",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "自然导入。",
    narration: "自然导入。\n旧逐句讲解。\n自然结束。",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: {
      closing: "自然结束。",
      sentences: [{
        id: "s1",
        text: "Hello world.",
        script: "旧逐句讲解。",
        explanation: "一句问候。",
        points: []
      }]
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const concurrent = {
    ...initial,
    narration: "自然导入。\n其他标签页的新讲解。\n自然结束。",
    content: {
      ...initial.content,
      sentences: [{
        ...initial.content.sentences[0],
        script: "其他标签页的新讲解。"
      }]
    }
  };
  let updateCalls = 0;
  const prisma = {
    englishGuidedStudyMaterial: {
      findFirst: async () => initial
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      $queryRaw: async () => [{ locked: 1 }],
      englishGuidedStudyMaterial: {
        findFirst: async () => concurrent,
        update: async () => {
          updateCalls += 1;
          return concurrent;
        }
      }
    })
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  await assert.rejects(
    () => service.updateMaterialScript(accountSubject, initial.id, {
      targetType: "SENTENCE",
      sentenceId: "s1",
      originalScript: "旧逐句讲解。",
      script: "当前标签页准备保存的讲解。"
    }),
    /文稿已发生变化|刷新后再编辑/u
  );
  assert.equal(updateCalls, 0);
});

test("英文带学旧课件按讲解和默认结束语回退后仍可编辑", async () => {
  let current: any = {
    id: "material-edit-legacy-fallback",
    userId: "user-1",
    title: "Greeting",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "自然导入。",
    narration: "自然导入。\n旧版讲解。",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: {
      sentences: [{
        id: "s1",
        text: "Hello world.",
        explanation: "旧版讲解。",
        points: []
      }]
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const englishGuidedStudyMaterial = {
    findFirst: async () => current,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      current = { ...current, ...data };
      return current;
    }
  };
  const prisma = {
    englishGuidedStudyMaterial,
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      $queryRaw: async () => [{ locked: 1 }],
      englishGuidedStudyMaterial
    })
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  await service.updateMaterialScript(accountSubject, current.id, {
    targetType: "SENTENCE",
    sentenceId: "s1",
    originalScript: "旧版讲解。",
    script: "新版逐句讲解。"
  });
  const defaultClosing = "我们就读到这里。回头看一遍原文，留意刚才讲过的关键词、句子结构和前后内容的联系，你会更容易把这些表达真正用起来。";
  const result = await service.updateMaterialScript(accountSubject, current.id, {
    targetType: "SUMMARY",
    originalScript: defaultClosing,
    script: "新的结束语。"
  });

  assert.equal((result.content as { closing?: string }).closing, "新的结束语。");
});

test("英文带学零费率语音仍记录并拒绝重复计费确认", async () => {
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const reserve = Reflect.get(service, "reserveEnglishGuidedStudyCredits").bind(service);
  let marker: Record<string, unknown> | null = null;
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    ledgerEntry: {
      findUnique: async () => marker,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        marker = data;
        return data;
      }
    },
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => ({ availableCredits: 500 }),
      findUniqueOrThrow: async () => ({ availableCredits: 500 })
    }
  };
  const input = {
    estimatedCredits: 0,
    note: "test",
    operationKey: "english-guided-study-script-tts:user-1:material-1:free-edit-1",
    userId: "user-1"
  };

  await reserve(transaction, input);
  assert.equal(marker?.amount, 0);
  await assert.rejects(() => reserve(transaction, input), /请勿重复/u);
});

test("英文带学只重试发生瞬时故障的语音节点", async () => {
  const existing = {
    id: "material-audio-retry",
    userId: "user-1",
    title: "Greeting",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "A short greeting.",
    narration: "A short narration.",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: {
      explanationMode: "SENTENCE",
      sentences: [
        {
          id: "s1",
          text: "Hello world.",
          script: "我们来学习 Hello world。",
          explanation: "这是一句简单问候。",
          grammarFocus: "",
          points: []
        }
      ]
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const prisma = withBillingPrisma({
    englishGuidedStudyMaterial: {
      findFirst: async () => existing,
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
        updatedAt: new Date("2026-07-26T00:00:00.000Z")
      })
    }
  });
  const aiService = {
    generateScenarioTextForExternalBilling: async () => {
      throw new Error("语音生成不应调用聊天模型");
    }
  };
  let synthesisCalls = 0;
  const audioService = {
    synthesizeTtsForExternalBilling: async () => {
      synthesisCalls += 1;

      if (synthesisCalls === 1) {
        const error = new Error("read ECONNRESET") as Error & { code: string };
        error.code = "ECONNRESET";
        throw error;
      }

      if (synthesisCalls === 2) {
        return {
          id: "audio-intro-failed",
          status: "FAILED",
          errorCode: "R2_UPLOAD_FAILED",
          errorMessage: "导学语音上传到对象存储失败，请稍后重试",
          providerPayload: null,
          outputAudioAsset: null
        };
      }

      return {
        id: `audio-${synthesisCalls}`,
        status: "SUCCEEDED",
        errorCode: null,
        errorMessage: null,
        providerPayload: null,
        outputAudioAsset: {
          url: `https://cdn.example.com/audio-${synthesisCalls}.mp3`,
          durationMs: 1_000
        }
      };
    },
    cleanupExternalNarrationAudio: async () => ({ cleaned: 0 })
  };
  const service = new EnglishGuidedStudyService(
    audioService as never,
    aiService as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  const estimate = await service.estimateMaterialAudioGeneration(accountSubject, existing.id, {
    voice: "longanyang",
    speed: 1
  });

  const result = await service.generateMaterialAudio("user-1", existing.id, {
    voice: "longanyang",
    speed: 1,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });

  assert.equal(synthesisCalls, 5);
  assert.equal(result.audioUrl, "https://cdn.example.com/audio-3.mp3");
  assert.equal(result.audioDurationSeconds, 3);
});

test("旧版古诗文无可定位关键词时直接降级为上下文音频而不重复调用 AI", async () => {
  const existing = {
    id: "material-gushiwen-v4",
    userId: "user-1",
    learnerId: null,
    title: "黄鹤楼送孟浩然之广陵",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "孤帆远影碧空尽。",
    levelStandardName: "学段年级",
    levelOptionLabel: "七年级",
    aiLevel: "G7",
    summary: "我们跟着李白的目光送别朋友。",
    narration: "我们跟着李白的目光送别朋友。\n先读原句：孤帆远影碧空尽。\n现在试着背诵。",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: {
      scene: "GUSHIWEN",
      contentTitle: "黄鹤楼送孟浩然之广陵",
      author: "李白",
      authorIntroductionMode: "BRIEF",
      explanationMode: "SENTENCE",
      closing: "现在试着背诵。",
      referenceMaterials: [
        { id: "ref-1", kind: "TEXT", name: "参考译文", content: "孤船的帆影渐渐远去。" }
      ],
      sentences: [
        {
          id: "s1",
          text: "孤帆远影碧空尽。",
          script: "先读原句：孤帆远影碧空尽。",
          explanation: "孤船的帆影渐渐远去。",
          grammarFocus: "",
          points: [
            { id: "p1-1", term: "孤帆", meaning: "一叶孤单的帆船" },
            { id: "p1-2", term: "远影", meaning: "远去的帆影" },
            { id: "p1-3", term: "碧空尽", meaning: "消失在碧蓝天空的尽头" }
          ]
        }
      ]
    },
    pinnedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const prisma = withBillingPrisma({
    englishGuidedStudyMaterial: {
      findFirst: async () => existing,
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
        updatedAt: new Date("2026-08-21T00:00:00.000Z")
      })
    }
  });
  let analysisCalls = 0;
  const aiService = {
    generateScenarioTextForExternalBilling: async () => {
      analysisCalls += 1;
      return {
        taskId: `gushiwen-analysis-${analysisCalls}`,
        text: JSON.stringify({
          title: "黄鹤楼送孟浩然之广陵",
          summary: "我们跟着李白的目光送别朋友。",
          closing: "现在顺着三个关键词试着背诵。",
          sentences: [
            {
              id: "s1",
              segmentId: "s1",
              text: "孤帆远影碧空尽。",
              script: "先看孤帆，它让我们看到一叶孤单的帆船。接着看远影，船已经越走越远。最后看碧空尽，帆影仿佛消失在碧蓝天空的尽头。",
              explanation: "孤船的帆影渐渐远去，消失在碧蓝天空的尽头。",
              grammarFocus: "",
              points: [
                { id: "p1-1", term: "孤帆", meaning: "一叶孤单的帆船" },
                { id: "p1-2", term: "远影", meaning: "远去的帆影" },
                { id: "p1-3", term: "碧空尽", meaning: "消失在碧蓝天空的尽头" }
              ]
            }
          ]
        }),
        providerName: "test-provider",
        modelName: "test-model"
      };
    }
  };
  let synthesisCalls = 0;
  const audioService = {
    synthesizeTtsForExternalBilling: async () => {
      synthesisCalls += 1;
      return {
        id: `audio-gushiwen-${synthesisCalls}`,
        status: "SUCCEEDED",
        errorCode: null,
        errorMessage: null,
        providerPayload: null,
        outputAudioAsset: {
          url: `https://cdn.example.com/gushiwen-${synthesisCalls}.mp3`,
          durationMs: 1_000
        }
      };
    },
    cleanupExternalNarrationAudio: async () => ({ cleaned: 0 })
  };
  const service = new EnglishGuidedStudyService(
    audioService as never,
    aiService as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  const estimate = await service.estimateMaterialAudioGeneration(accountSubject, existing.id, {
    voice: "longanyang",
    speed: 1
  });

  const result = await service.generateMaterialAudio("user-1", existing.id, {
    voice: "longanyang",
    speed: 1,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });
  const resultContent = result.content as {
    sentences: Array<{ points: Array<{ term: string }>; script: string }>;
  };

  assert.equal(analysisCalls, 0);
  assert.equal(synthesisCalls, 3);
  assert.equal(resultContent.sentences[0]?.script, "先读原句：孤帆远影碧空尽。");
  assert.deepEqual(resultContent.sentences[0]?.points, []);
});

test("英文带学不会重试确定性的模型和存储错误", () => {
  assert.equal(
    isRetryableEnglishNarrationTask({
      status: "FAILED",
      errorCode: "AUDIO_PROVIDER_HTTP_418"
    }),
    false
  );
  assert.equal(
    isRetryableEnglishNarrationTask({
      status: "FAILED",
      errorCode: "R2_CONFIG_MISSING"
    }),
    false
  );
  assert.equal(
    isRetryableEnglishNarrationTask({
      status: "FAILED",
      errorCode: "R2_VERIFY_INVALID"
    }),
    false
  );
  assert.equal(
    isRetryableEnglishNarrationTask({
      status: "FAILED",
      errorCode: "PROVIDER_TIMEOUT"
    }),
    true
  );
});

function withBillingPrisma<T extends Record<string, unknown>>(base: T) {
  const wallet = {
    availableCredits: 10_000,
    frozenCredits: 0,
    totalConsumedCredits: 0
  };
  const entries = new Map<string, { amount: number; idempotencyKey: string }>();
  const prisma = {
    ...base,
    $queryRaw: async () => [{ locked: 1 }],
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => wallet,
      updateMany: async ({ where, data }: any) => {
        if (wallet.availableCredits < (where.availableCredits?.gte ?? 0)) return { count: 0 };
        wallet.availableCredits -= data.availableCredits?.decrement ?? 0;
        wallet.frozenCredits += data.frozenCredits?.increment ?? 0;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => wallet,
      update: async ({ data }: any) => {
        wallet.availableCredits += data.availableCredits?.increment ?? 0;
        wallet.availableCredits -= data.availableCredits?.decrement ?? 0;
        wallet.frozenCredits += data.frozenCredits?.increment ?? 0;
        wallet.frozenCredits -= data.frozenCredits?.decrement ?? 0;
        wallet.totalConsumedCredits += data.totalConsumedCredits?.increment ?? 0;
        return wallet;
      }
    },
    ledgerEntry: {
      findUnique: async ({ where }: any) => entries.get(where.idempotencyKey) ?? null,
      create: async ({ data }: any) => {
        entries.set(data.idempotencyKey, data);
        return data;
      }
    },
    $transaction: async <TResult>(callback: (client: any) => Promise<TResult>) => callback(prisma)
  };

  return prisma;
}

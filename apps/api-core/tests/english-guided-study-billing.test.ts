import { membershipWalletFixture } from "./helpers/membership-wallet-fixture.js";
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { englishGuidedStudyReadAlongUploadMaxBytes, EstimateEnglishGuidedStudyReadAlongUploadDto, SubmitEnglishGuidedStudyReadAlongUploadDto } from "../src/english-guided-study/dto/english-guided-study.dto.js";
import {
  englishGuidedStudyAudioBillingItems,
  englishGuidedStudyAudioBillingRevision,
  englishGuidedStudyMaterialBillingItems,
  englishGuidedStudyMaterialBillingRevision
} from "../src/english-guided-study/english-guided-study-billing.js";
import * as englishGuidedStudyBillingModule from "../src/english-guided-study/english-guided-study-billing.js";
import { EnglishGuidedStudyService } from "../src/english-guided-study/english-guided-study.service.js";
import * as englishGuidedStudyServiceModule from "../src/english-guided-study/english-guided-study.service.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";

const courseReviewService = {
  recordMaterialChange: async () => undefined
};
const accountSubject: ProfileSubject = { userId: "user-1", mode: "ACCOUNT", learnerId: null };

test("跟读上传预估接受 30 MB 并拒绝超出上限的音频", async () => {
  assert.equal(englishGuidedStudyReadAlongUploadMaxBytes, 30 * 1024 * 1024);
  const dto = plainToInstance(EstimateEnglishGuidedStudyReadAlongUploadDto, {
    audioDurationMs: 180_000, audioName: "reading.mp3", audioMimeType: "audio/mpeg",
    audioSizeBytes: englishGuidedStudyReadAlongUploadMaxBytes
  });
  assert.deepEqual(await validate(dto), []);
  dto.audioSizeBytes += 1;
  assert.ok((await validate(dto)).some((error) => error.property === "audioSizeBytes"));
});

test("multipart 上传计费确认字符串转换为布尔值并通过 DTO 校验", async () => {
  const dto = plainToInstance(SubmitEnglishGuidedStudyReadAlongUploadDto, {
    billingConfirmed: "true",
    billingRequestId: "upload-billing-request-1234",
    billingRevision: "a".repeat(64)
  });

  assert.equal(dto.billingConfirmed, true);
  assert.deepEqual(await validate(dto), []);
});

test("上传跟读音频按每分钟两点向上取整", () => {
  const uploadBillingItems = (
    englishGuidedStudyBillingModule as typeof englishGuidedStudyBillingModule & {
      englishGuidedStudyReadAlongUploadBillingItems?: (durationMs: number) => unknown;
    }
  ).englishGuidedStudyReadAlongUploadBillingItems;

  assert.equal(typeof uploadBillingItems, "function");
  assert.deepEqual(uploadBillingItems?.(60_001), [
    {
      code: "ENGLISH_GUIDED_STUDY_ASR",
      name: "上传音频识别与时间轴生成",
      description: "音频时长 1 分 1 秒，按 2 分钟计费，每分钟 2 点。",
      estimatedCredits: 4
    }
  ]);
});

test("上传跟读音频确认版本只绑定计费分钟和确认身份", () => {
  const uploadBillingRevision = (
    englishGuidedStudyBillingModule as typeof englishGuidedStudyBillingModule & {
      englishGuidedStudyReadAlongUploadBillingRevision?: (input: {
        audioDurationMs: number;
        audioMimeType: string;
        audioName: string;
        audioSizeBytes: number;
        billingRequestId: string;
        materialId: string;
      }) => string;
    }
  ).englishGuidedStudyReadAlongUploadBillingRevision;
  const input = {
    audioDurationMs: 60_001,
    audioMimeType: "audio/mpeg",
    audioName: "teacher-reading.mp3",
    audioSizeBytes: 1024,
    billingRequestId: "upload-billing-request",
    materialId: "material-1"
  };

  assert.equal(typeof uploadBillingRevision, "function");
  assert.equal(uploadBillingRevision?.(input), uploadBillingRevision?.({ ...input, audioDurationMs: 119_999 }));
  assert.notEqual(uploadBillingRevision?.(input), uploadBillingRevision?.({ ...input, audioDurationMs: 120_001 }));
  assert.equal(uploadBillingRevision?.(input), uploadBillingRevision?.({
    ...input,
    audioMimeType: "audio/mp4",
    audioName: "è·è¯»è®­ç».mp3",
    audioSizeBytes: 2_048
  }));
  assert.notEqual(uploadBillingRevision?.(input), uploadBillingRevision?.({
    ...input,
    billingRequestId: "other-upload-billing-request"
  }));
  assert.notEqual(uploadBillingRevision?.(input), uploadBillingRevision?.({ ...input, materialId: "material-2" }));
});

test("上传跟读音频预估返回按时长计算的确定点数", async () => {
  const material = {
    id: "material-upload-estimate",
    userId: "user-1",
    learnerId: null,
    title: "Hello",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: "Summary",
    narration: "Narration",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    content: {
      scene: "ENGLISH",
      sentences: [{ id: "s1", text: "Hello world.", script: "Narration", points: [] }]
    },
    pinnedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  Object.assign(service as any, {
    prisma: {
      englishGuidedStudyMaterial: { findFirst: async () => material },
      ...membershipWalletFixture(),
      wallet: { upsert: async () => ({ availableCredits: 100 }) }
    }
  });
  const estimateUpload = (
    service as unknown as {
      estimateMaterialReadAlongUpload?: (
        subject: ProfileSubject,
        materialId: string,
        input: {
          audioDurationMs: number;
          audioMimeType: string;
          audioName: string;
          audioSizeBytes: number;
        }
      ) => Promise<{ estimatedCredits: number; operation: string; revision: string }>;
    }
  ).estimateMaterialReadAlongUpload;

  assert.equal(typeof estimateUpload, "function");
  const estimate = await estimateUpload?.call(service, accountSubject, material.id, {
    audioDurationMs: 60_001,
    audioMimeType: "audio/mpeg",
    audioName: "teacher-reading.mp3",
    audioSizeBytes: 1024
  });

  assert.equal(estimate?.estimatedCredits, 4);
  assert.equal(estimate?.operation, "ENGLISH_GUIDED_STUDY_ASR");
  assert.match(estimate?.revision ?? "", /^[a-f0-9]{64}$/u);
});

test("英文带学讲稿按原文字符数生成阶梯点数明细", () => {
  const items = englishGuidedStudyMaterialBillingItems("a".repeat(1_500));

  assert.deepEqual(items, [
    {
      code: "ENGLISH_GUIDED_STUDY_CONTENT",
      name: "英文带学讲稿生成",
      description: "分析 1,500 个原文字符，生成适配英语水平的带学文稿。",
      estimatedCredits: 42
    }
  ]);
});

test("剑桥 Pre-A1 使用启蒙级教学画像", () => {
  const levelBand = (
    englishGuidedStudyServiceModule as typeof englishGuidedStudyServiceModule & {
      englishGuidedStudyLevelBand?: (aiLevel: string) => string;
    }
  ).englishGuidedStudyLevelBand;

  assert.equal(typeof levelBand, "function");
  assert.equal(levelBand?.("Pre-A1"), "A0");
});

test("英文带学语音按讲解字符数生成阶梯点数明细", () => {
  const items = englishGuidedStudyAudioBillingItems("讲".repeat(2_200));

  assert.deepEqual(items, [
    {
      code: "ENGLISH_GUIDED_STUDY_TTS",
      name: "英文带学语音讲解",
      description: "整理讲解节点，并按 2,200 个实际合成字符生成逐节点语音。",
      estimatedCredits: 44
    }
  ]);
});

test("英文带学讲稿确认版本随原文、等级和讲解方式变化", () => {
  const base = {
    materialId: "material-1",
    title: "A lesson",
    sourceText: "Hello world.",
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "E1",
    explanationMode: "SENTENCE" as const
  };
  const revision = englishGuidedStudyMaterialBillingRevision(base);

  assert.match(revision, /^[a-f0-9]{64}$/);
  assert.equal(englishGuidedStudyMaterialBillingRevision({ ...base }), revision);
  assert.notEqual(englishGuidedStudyMaterialBillingRevision({ ...base, sourceText: "Hello again." }), revision);
  assert.notEqual(englishGuidedStudyMaterialBillingRevision({ ...base, aiLevel: "E2" }), revision);
  assert.notEqual(
    englishGuidedStudyMaterialBillingRevision({ ...base, explanationMode: "PARAGRAPH" }),
    revision
  );
  assert.notEqual(
    englishGuidedStudyMaterialBillingRevision({ ...base, author: "Robert Frost" }),
    revision
  );
  assert.notEqual(
    englishGuidedStudyMaterialBillingRevision({ ...base, authorIntroductionMode: "DETAILED" }),
    revision
  );
  assert.notEqual(
    englishGuidedStudyMaterialBillingRevision({
      ...base,
      referenceMaterials: [
        {
          id: "ref-1",
          kind: "TEXT",
          name: "经典译文",
          content: "我独自漫游，像一朵云。"
        }
      ]
    }),
    revision
  );
});

test("英文带学语音确认版本随讲稿、音色和语速变化", () => {
  const base = {
    materialId: "material-1",
    narration: "我们先学习 Hello world.",
    modelAlias: "tts-default",
    voice: "longanyang",
    voiceAssetId: null,
    speed: 1
  };
  const revision = englishGuidedStudyAudioBillingRevision(base);

  assert.match(revision, /^[a-f0-9]{64}$/);
  assert.equal(englishGuidedStudyAudioBillingRevision({ ...base }), revision);
  assert.notEqual(englishGuidedStudyAudioBillingRevision({ ...base, narration: "新的讲稿" }), revision);
  assert.notEqual(englishGuidedStudyAudioBillingRevision({ ...base, voice: "longanhuan" }), revision);
  assert.notEqual(englishGuidedStudyAudioBillingRevision({ ...base, speed: 1.2 }), revision);
});

test("英文带学讲稿预估返回钱包余额并要求服务端确认", async () => {
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const prisma = {
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => ({ availableCredits: 35 })
    }
  };
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  const input = {
    title: "A lesson",
    sourceType: "TEXT" as const,
    sourceText: "Hello world.",
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "E1",
    explanationMode: "SENTENCE" as const
  };
  const estimate = await service.estimateMaterialGeneration("user-1", input);

  assert.equal(estimate.availableCredits, 35);
  assert.equal(estimate.estimatedCredits, 36);
  assert.equal(estimate.enoughCredits, false);
  assert.match(estimate.requestId, /^[a-f0-9]{32}$/);
  assert.match(estimate.revision, /^[a-f0-9]{64}$/);
  await assert.rejects(
    () => service.generateMaterial("user-1", input),
    (error: unknown) => error instanceof Error && error.message.includes("请先确认本次预计消耗 36 点")
  );
});

test("英文带学语音预估绑定当前讲稿和用户选择的音色语速", async () => {
  const material = {
    id: "material-1",
    userId: "user-1",
    title: "A lesson",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "E1",
    summary: "",
    narration: "讲".repeat(1_200),
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 30,
    content: {
      scene: "ENGLISH",
      closing: "结",
      sentences: [{
        id: "s1",
        text: "Hello world.",
        script: "讲".repeat(1_200),
        explanation: "讲".repeat(1_200),
        points: []
      }]
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const prisma = {
    englishGuidedStudyMaterial: {
      findFirst: async () => material
    },
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => ({ availableCredits: 100 })
    }
  };
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  const estimate = await service.estimateMaterialAudioGeneration(accountSubject, material.id, {
    voice: "longanyang",
    speed: 1
  });

  assert.equal(estimate.estimatedCredits, 36);
  assert.equal(estimate.enoughCredits, true);
  assert.match(estimate.requestId, /^[a-f0-9]{32}$/);
  assert.match(estimate.revision, /^[a-f0-9]{64}$/);
  await assert.rejects(
    () => service.generateMaterialAudio("user-1", material.id, { voice: "longanyang", speed: 1 }),
    (error: unknown) => error instanceof Error && error.message.includes("请先确认本次消耗 36 点")
  );
});

test("英文带学讲解语音按实际节点字符计费且不计算节点分隔换行", async () => {
  const intro = "甲".repeat(300);
  const sentenceScript = "乙".repeat(500);
  const closing = "丙".repeat(200);
  const material = {
    id: "material-exact-audio-billing",
    userId: "user-1",
    title: "准确计费",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world.",
    levelStandardName: "CEFR",
    levelOptionLabel: "A1",
    aiLevel: "A1",
    summary: intro,
    narration: [intro, sentenceScript, closing].join("\n"),
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: null,
    content: {
      scene: "ENGLISH",
      explanationMode: "SENTENCE",
      closing,
      sentences: [{
        id: "s1",
        segmentId: "s1",
        text: "Hello world.",
        script: sentenceScript,
        explanation: sentenceScript,
        points: []
      }]
    },
    pinnedAt: null,
    learnerId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  Object.assign(service as any, {
    prisma: {
      englishGuidedStudyMaterial: { findFirst: async () => material },
      ...membershipWalletFixture(),
      wallet: { upsert: async () => ({ availableCredits: 100 }) }
    }
  });

  const estimate = await service.estimateMaterialAudioGeneration(accountSubject, material.id, {
    voice: "longanyang",
    speed: 1
  });

  assert.equal(estimate.estimatedCredits, 28);
  assert.equal(
    estimate.items[0]?.description,
    "整理讲解节点，并按 1,000 个实际合成字符生成逐节点语音。"
  );
});

test("英文带学全文诵读按标题作者正文实际单元字符计费", async () => {
  const material = {
    id: "material-exact-read-along-billing",
    userId: "user-1",
    title: "课件标题",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "文".repeat(900),
    levelStandardName: "学段年级",
    levelOptionLabel: "七年级",
    aiLevel: "七年级",
    summary: "摘要",
    narration: "讲解",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: null,
    content: {
      scene: "GUSHIWEN",
      explanationMode: "FREEFORM",
      contentTitle: "题".repeat(50),
      author: "作".repeat(50)
    },
    pinnedAt: null,
    learnerId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  Object.assign(service as any, {
    prisma: {
      englishGuidedStudyMaterial: { findFirst: async () => material },
      ...membershipWalletFixture(),
      wallet: { upsert: async () => ({ availableCredits: 100 }) }
    }
  });

  const estimate = await service.estimateMaterialReadAlongGeneration(accountSubject, material.id, {
    voice: "longanyang",
    speed: 1
  });

  assert.equal(estimate.estimatedCredits, 28);
  assert.equal(
    estimate.items[0]?.description,
    "按标题、作者和正文共 1,000 个实际合成字符逐段生成全文诵读，并生成同步字幕。"
  );
});

test("开卷导读旧时间轴迁移时按实际自然段节点字符计费", async () => {
  const firstParagraph = "甲".repeat(500);
  const secondParagraph = "乙".repeat(500);
  const narration = `${firstParagraph}\n\n${secondParagraph}`;
  const material = {
    id: "material-exact-daodu-edit-billing",
    userId: "user-1",
    title: "开卷导读",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "阅读正文",
    levelStandardName: "学段年级",
    levelOptionLabel: "七年级",
    aiLevel: "七年级",
    summary: "",
    narration,
    audioUrl: "https://example.com/guide.mp3",
    audioTaskId: "guide-audio",
    audioDurationSeconds: 60,
    content: {
      scene: "DAODU",
      guideScript: narration,
      narrationVoice: {
        providerVoiceId: "longanyang",
        modelAlias: "tts-default",
        speed: 1
      },
      narrationTimelineV2: {
        version: 2,
        nodes: [{
          id: "legacy-guide",
          type: "SENTENCE",
          sentenceId: "legacy-guide",
          chunkType: "CONTEXT",
          script: narration,
          focus: null,
          audioTaskId: "guide-audio",
          audioUrl: "https://example.com/guide.mp3",
          durationMs: 60_000
        }]
      },
      sentences: [{
        id: "s1",
        text: "阅读正文",
        script: narration,
        explanation: narration,
        points: []
      }]
    },
    pinnedAt: null,
    learnerId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  Object.assign(service as any, {
    prisma: {
      englishGuidedStudyMaterial: { findFirst: async () => material },
      ...membershipWalletFixture(),
      wallet: { upsert: async () => ({ availableCredits: 100 }) }
    }
  });

  const estimate = await service.estimateMaterialScriptUpdate(accountSubject, material.id, {
    targetType: "SENTENCE",
    sentenceId: "reading-guide-p1",
    originalScript: firstParagraph,
    script: "丙".repeat(500)
  });

  assert.equal(estimate.estimatedCredits, 28);
  assert.equal(
    estimate.items[0]?.description,
    "按 1,000 个实际合成字符分段生成导读讲解音频。"
  );
});

test("古诗文已有讲解语音时只合成修改句并按实际字符结算", async () => {
  const harness = createBillingHarness(100);
  const createdAt = new Date("2026-08-29T00:00:00.000Z");
  const summary = "导".repeat(300);
  const originalScript = "旧".repeat(300);
  const unchangedScript = "保".repeat(700);
  const closing = "收".repeat(300);
  const editedScript = "新".repeat(1_000);
  let storedMaterial: any = {
    id: "material-gushiwen-exact-edit-billing",
    userId: "user-1",
    learnerId: null,
    title: "古诗文精确计费",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "第一句。第二句。",
    levelStandardName: "学段年级",
    levelOptionLabel: "七年级",
    aiLevel: "七年级",
    summary,
    narration: [summary, originalScript, unchangedScript, closing].join("\n"),
    audioUrl: "https://example.com/intro.mp3",
    audioTaskId: "old-intro",
    audioDurationSeconds: 40,
    content: {
      scene: "GUSHIWEN",
      explanationMode: "SENTENCE",
      closing,
      narrationVoice: {
        providerVoiceId: "longanyang",
        voiceAssetId: null,
        modelAlias: "tts-default",
        speed: 1
      },
      sentences: [
        {
          id: "s1",
          text: "第一句。",
          script: originalScript,
          explanation: originalScript,
          points: []
        },
        {
          id: "s2",
          text: "第二句。",
          script: unchangedScript,
          explanation: unchangedScript,
          points: []
        }
      ],
      questions: [],
      narrationTimelineV2: {
        version: 2,
        nodes: [
          {
            id: "intro",
            type: "INTRO",
            sentenceId: null,
            chunkType: "INTRO",
            script: summary,
            focus: null,
            audioTaskId: "old-intro",
            audioUrl: "https://example.com/intro.mp3",
            durationMs: 10_000
          },
          {
            id: "s1-c1",
            type: "SENTENCE",
            sentenceId: "s1",
            chunkType: "CONTEXT",
            script: originalScript,
            focus: null,
            audioTaskId: "old-s1",
            audioUrl: "https://example.com/s1.mp3",
            durationMs: 10_000
          },
          {
            id: "s2-c1",
            type: "SENTENCE",
            sentenceId: "s2",
            chunkType: "CONTEXT",
            script: unchangedScript,
            focus: null,
            audioTaskId: "old-s2",
            audioUrl: "https://example.com/s2.mp3",
            durationMs: 10_000
          },
          {
            id: "summary",
            type: "SUMMARY",
            sentenceId: null,
            chunkType: "SUMMARY",
            script: closing,
            focus: null,
            audioTaskId: "old-summary",
            audioUrl: "https://example.com/summary.mp3",
            durationMs: 10_000
          }
        ]
      }
    },
    pinnedAt: null,
    createdAt,
    updatedAt: createdAt
  };
  const synthesizedTexts: string[] = [];
  const cleanedTaskIds: string[][] = [];
  const materialStore = {
    findFirst: async () => storedMaterial,
    update: async ({ data }: any) => {
      storedMaterial = { ...storedMaterial, ...data, updatedAt: createdAt };
      return storedMaterial;
    }
  };
  const transaction = {
    ...harness.transaction,
    englishGuidedStudyMaterial: materialStore
  };
  const prisma = {
    ...transaction,
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => callback(transaction)
  };
  const audioService = {
    cleanupExternalNarrationAudio: async (_userId: string, taskIds: string[]) => {
      cleanedTaskIds.push(taskIds);
      return { cleaned: taskIds.length };
    },
    synthesizeTtsForExternalBilling: async (_attribution: unknown, input: any) => {
      synthesizedTexts.push(input.text);
      return {
        id: "new-s1",
        status: "SUCCEEDED",
        errorMessage: null,
        providerPayload: null,
        outputAudioAsset: {
          url: "https://example.com/new-s1.mp3",
          durationMs: 12_000
        }
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    audioService as never,
    {} as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  const edit = {
    targetType: "SENTENCE" as const,
    sentenceId: "s1",
    originalScript,
    script: editedScript
  };
  const estimate = await service.estimateMaterialScriptUpdate(accountSubject, storedMaterial.id, edit);
  const updated = await service.updateMaterialScript(accountSubject, storedMaterial.id, {
    ...edit,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });

  assert.equal(estimate.estimatedCredits, 28);
  assert.equal(
    estimate.items[0]?.description,
    "整理讲解节点，并按 1,000 个实际合成字符生成逐节点语音。"
  );
  assert.deepEqual(synthesizedTexts, [editedScript]);
  assert.deepEqual(cleanedTaskIds, [["old-s1"]]);
  assert.deepEqual(
    (updated.content as any).narrationTimelineV2.nodes.map((node: any) => node.audioTaskId),
    ["old-intro", "new-s1", "old-s2", "old-summary"]
  );
  assert.deepEqual(harness.wallet, {
    availableCredits: 72,
    frozenCredits: 0,
    totalConsumedCredits: 28
  });
});

test("英文带学点数冻结后成功结算且重复结算保持幂等", async () => {
  const harness = createBillingHarness(50);
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const billingService = service as unknown as {
    reserveEnglishGuidedStudyCredits: ReserveCredits;
    settleEnglishGuidedStudyCredits: SettleCredits;
  };

  await billingService.reserveEnglishGuidedStudyCredits(harness.transaction as never, {
    estimatedCredits: 36,
    note: "冻结 36 点",
    operationKey: "english-guided-study:test-success",
    userId: "user-1"
  });
  assert.deepEqual(harness.wallet, {
    availableCredits: 14,
    frozenCredits: 36,
    totalConsumedCredits: 0
  });

  const settlement = {
    actualCredits: 36,
    consumeNote: "消耗 36 点",
    operationKey: "english-guided-study:test-success",
    releaseNote: "释放多余点数",
    userId: "user-1"
  };
  await billingService.settleEnglishGuidedStudyCredits(harness.transaction as never, settlement);
  await billingService.settleEnglishGuidedStudyCredits(harness.transaction as never, settlement);

  assert.deepEqual(harness.wallet, {
    availableCredits: 14,
    frozenCredits: 0,
    totalConsumedCredits: 36
  });
  assert.equal(harness.entries.get("english-guided-study:test-success:consume")?.amount, -36);
});

test("英文带学同一次计费请求不能重复冻结点数", async () => {
  const harness = createBillingHarness(100);
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const billingService = service as unknown as {
    reserveEnglishGuidedStudyCredits: ReserveCredits;
  };
  const reservation = {
    estimatedCredits: 36,
    note: "冻结 36 点",
    operationKey: "english-guided-study:duplicate-request",
    userId: "user-1"
  };

  await billingService.reserveEnglishGuidedStudyCredits(harness.transaction as never, reservation);
  await assert.rejects(
    () => billingService.reserveEnglishGuidedStudyCredits(harness.transaction as never, reservation),
    (error: unknown) => error instanceof Error && error.message === "该次生成请求已提交，请勿重复操作"
  );
  assert.deepEqual(harness.wallet, {
    availableCredits: 64,
    frozenCredits: 36,
    totalConsumedCredits: 0
  });
});

test("英文带学生成失败返还全部冻结点数", async () => {
  const harness = createBillingHarness(50);
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const billingService = service as unknown as {
    releaseEnglishGuidedStudyCredits: ReleaseCredits;
    reserveEnglishGuidedStudyCredits: ReserveCredits;
  };

  await billingService.reserveEnglishGuidedStudyCredits(harness.transaction as never, {
    estimatedCredits: 36,
    note: "冻结 36 点",
    operationKey: "english-guided-study:test-failed",
    userId: "user-1"
  });
  await billingService.releaseEnglishGuidedStudyCredits(harness.transaction as never, {
    note: "生成失败返还",
    operationKey: "english-guided-study:test-failed",
    userId: "user-1"
  });

  assert.deepEqual(harness.wallet, {
    availableCredits: 50,
    frozenCredits: 0,
    totalConsumedCredits: 0
  });
  assert.equal(harness.entries.get("english-guided-study:test-failed:release-failed")?.amount, 36);
});

test("英文带学启动后会自动释放超时未结算的冻结点数", async () => {
  const harness = createBillingHarness(50);
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const billingService = service as unknown as {
    recoverExpiredEnglishGuidedStudyCredits?: () => Promise<void>;
    reserveEnglishGuidedStudyCredits: ReserveCredits;
  };
  const operationKey = "english-guided-study:stale-request";
  let page = 0;

  await billingService.reserveEnglishGuidedStudyCredits(harness.transaction as never, {
    estimatedCredits: 36,
    note: "冻结 36 点",
    operationKey,
    userId: "user-1"
  });
  const prisma = {
    englishGuidedStudyMaterial: {
      findFirst: async () => null
    },
    ledgerEntry: {
      findMany: async ({ where }: any) => {
        if (where.idempotencyKey) {
          return [];
        }

        const cutoff = where.createdAt.lt as Date;
        const cutoffAgeHours = (Date.now() - cutoff.getTime()) / (60 * 60 * 1_000);

        assert.ok(cutoffAgeHours >= 23 && cutoffAgeHours <= 25);
        page += 1;
        return page === 1
          ? [{ id: "reserve-1", idempotencyKey: `${operationKey}:reserve`, userId: "user-1" }]
          : [];
      }
    },
    $transaction: async <T>(callback: (client: BillingTransaction) => Promise<T>) => callback(harness.transaction)
  };
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  assert.equal(typeof billingService.recoverExpiredEnglishGuidedStudyCredits, "function");
  await billingService.recoverExpiredEnglishGuidedStudyCredits?.();
  assert.deepEqual(harness.wallet, {
    availableCredits: 50,
    frozenCredits: 0,
    totalConsumedCredits: 0
  });
});

test("英文带学超时冻结清理会批量跳过已结算记录且不查询材料 JSON", async () => {
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const billingService = service as unknown as {
    recoverExpiredEnglishGuidedStudyCredits: () => Promise<void>;
  };
  const operationKeys = ["english-guided-study:settled-consume", "english-guided-study:settled-release"];
  let reservePageLoaded = false;

  const prisma = {
    englishGuidedStudyMaterial: {
      findFirst: async () => {
        throw new Error("已结算记录不应查询材料 JSON");
      }
    },
    ledgerEntry: {
      findMany: async (query: any) => {
        if (!reservePageLoaded) {
          reservePageLoaded = true;
          return operationKeys.map((operationKey, index) => ({
            id: `reserve-${index + 1}`,
            idempotencyKey: `${operationKey}:reserve`,
            userId: "user-1"
          }));
        }

        assert.deepEqual(query.where.idempotencyKey.in, [
          `${operationKeys[0]}:consume`,
          `${operationKeys[0]}:release`,
          `${operationKeys[0]}:release-failed`,
          `${operationKeys[1]}:consume`,
          `${operationKeys[1]}:release`,
          `${operationKeys[1]}:release-failed`
        ]);
        return [
          { idempotencyKey: `${operationKeys[0]}:consume` },
          { idempotencyKey: `${operationKeys[1]}:release` }
        ];
      }
    },
    $transaction: async () => {
      throw new Error("已结算记录不应重复释放点数");
    }
  };
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  await billingService.recoverExpiredEnglishGuidedStudyCredits();
});

test("英文带学超时冻结清理运行中会忽略并发重入", async () => {
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const billingService = service as unknown as {
    recoverExpiredEnglishGuidedStudyCredits: () => Promise<void>;
  };
  let markFirstQueryStarted!: () => void;
  let finishFirstQuery!: () => void;
  const firstQueryStarted = new Promise<void>((resolve) => {
    markFirstQueryStarted = resolve;
  });
  const firstQueryFinished = new Promise<void>((resolve) => {
    finishFirstQuery = resolve;
  });
  let queryRunning = false;

  const prisma = {
    ledgerEntry: {
      findMany: async () => {
        if (queryRunning) {
          throw new Error("上一轮清理未结束时不应启动新查询");
        }

        queryRunning = true;
        markFirstQueryStarted();
        await firstQueryFinished;
        queryRunning = false;
        return [];
      }
    }
  };
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  const firstRecovery = billingService.recoverExpiredEnglishGuidedStudyCredits();
  await firstQueryStarted;
  await billingService.recoverExpiredEnglishGuidedStudyCredits();
  finishFirstQuery();
  await firstRecovery;
});

test("英文带学超时冻结清理会继续扫描第二页", async () => {
  const harness = createBillingHarness(50);
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const billingService = service as unknown as {
    recoverExpiredEnglishGuidedStudyCredits: () => Promise<void>;
    reserveEnglishGuidedStudyCredits: ReserveCredits;
  };
  const operationKey = "english-guided-study:second-page";

  await billingService.reserveEnglishGuidedStudyCredits(harness.transaction as never, {
    estimatedCredits: 36,
    note: "冻结 36 点",
    operationKey,
    userId: "user-1"
  });

  let page = 0;
  const prisma = {
    englishGuidedStudyMaterial: {
      findFirst: async () => null
    },
    ledgerEntry: {
      findMany: async (query: any) => {
        if (query.where.idempotencyKey) {
          return page === 1
            ? Array.from({ length: 100 }, (_, index) => ({
                idempotencyKey: `english-guided-study:settled-${index + 1}:consume`
              }))
            : [];
        }

        page += 1;

        if (page === 1) {
          assert.equal(query.cursor, undefined);
          return Array.from({ length: 100 }, (_, index) => ({
            id: `settled-${index + 1}`,
            idempotencyKey: `english-guided-study:settled-${index + 1}:reserve`,
            userId: "user-1"
          }));
        }

        assert.deepEqual(query.cursor, { id: "settled-100" });
        return [{
          id: "reserve-second-page",
          idempotencyKey: `${operationKey}:reserve`,
          userId: "user-1"
        }];
      }
    },
    $transaction: async <T>(callback: (client: BillingTransaction) => Promise<T>) => callback(harness.transaction)
  };
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  await billingService.recoverExpiredEnglishGuidedStudyCredits();

  assert.equal(page, 2);
  assert.deepEqual(harness.wallet, {
    availableCredits: 50,
    frozenCredits: 0,
    totalConsumedCredits: 0
  });
});

test("英文带学冻结点数时再次原子校验钱包余额", async () => {
  const harness = createBillingHarness(35);
  const service = new EnglishGuidedStudyService({} as never, {} as never, courseReviewService as never);
  const billingService = service as unknown as {
    reserveEnglishGuidedStudyCredits: ReserveCredits;
  };

  await assert.rejects(
    () =>
      billingService.reserveEnglishGuidedStudyCredits(harness.transaction as never, {
        estimatedCredits: 36,
        note: "冻结 36 点",
        operationKey: "english-guided-study:test-insufficient",
        userId: "user-1"
      }),
    (error: unknown) => error instanceof Error && error.message === "点数余额不足，请先充值或开通会员"
  );
  assert.deepEqual(harness.wallet, {
    availableCredits: 35,
    frozenCredits: 0,
    totalConsumedCredits: 0
  });
});

test("英文带学讲稿生成前冻结点数并在保存成功后结算", async () => {
  const harness = createBillingHarness(50);
  const createdAt = new Date("2026-07-17T00:00:00.000Z");
  const materialStore = {
    findFirst: async () => null,
    create: async ({ data }: any) => ({
      ...data,
      id: "material-created",
      createdAt,
      updatedAt: createdAt
    })
  };
  const transaction = {
    ...harness.transaction,
    englishGuidedStudyMaterial: materialStore
  };
  const prisma = {
    ...transaction,
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => callback(transaction)
  };
  const aiService = {
    generateScenarioTextForExternalBilling: async () => ({
      taskId: "ai-task-1",
      providerName: "test-provider",
      modelName: "test-model",
      text: generatedLessonJson()
    })
  };
  const service = new EnglishGuidedStudyService({} as never, aiService as never, courseReviewService as never);
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  const input = {
    title: "Hello",
    sourceType: "TEXT" as const,
    sourceText: "Hello world.",
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "E1",
    explanationMode: "SENTENCE" as const
  };
  const estimate = await service.estimateMaterialGeneration("user-1", input);
  const material = await service.generateMaterial("user-1", {
    ...input,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });

  assert.equal(material.id, "material-created");
  assert.deepEqual(harness.wallet, {
    availableCredits: 14,
    frozenCredits: 0,
    totalConsumedCredits: 36
  });
});

test("英文带学语音只合成已确认节点并统一冻结结算", async () => {
  const harness = createBillingHarness(50);
  const createdAt = new Date("2026-07-17T00:00:00.000Z");
  const material = {
    id: "material-audio",
    userId: "user-1",
    title: "Hello",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "Hello world. This sentence is not present in the confirmed lesson script.",
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "E1",
    summary: "学习简单问候。",
    narration: "讲".repeat(1_200),
    audioUrl: "https://example.com/old-audio.mp3",
    audioTaskId: "old-audio-task",
    audioDurationSeconds: 30,
    content: {
      explanationMode: "SENTENCE",
      sentences: [
        {
          id: "s1",
          segmentId: "s1",
          text: "Hello world.",
          script: "我们来学习 Hello world.",
          explanation: "一句问候。",
          grammarFocus: "陈述句。",
          points: []
        }
      ],
      questions: [],
      narrationTimelineV2: {
        version: 2,
        nodes: [{ audioTaskId: "old-audio-task" }]
      }
    },
    pinnedAt: null,
    createdAt,
    updatedAt: createdAt
  };
  const materialStore = {
    findFirst: async () => material,
    update: async ({ data }: any) => ({ ...material, ...data, updatedAt: createdAt })
  };
  const transaction = {
    ...harness.transaction,
    englishGuidedStudyMaterial: materialStore
  };
  const prisma = {
    ...transaction,
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => callback(transaction)
  };
  const aiService = {
    generateScenarioTextForExternalBilling: async () => {
      throw new Error("语音节点不应再次调用模型改写已确认文稿");
    }
  };
  let externalTtsCalls = 0;
  const externalTtsInputs: any[] = [];
  const cleanedTaskIds: string[][] = [];
  const audioService = {
    cleanupExternalNarrationAudio: async (_userId: string, taskIds: string[]) => {
      cleanedTaskIds.push(taskIds);
      return { cleaned: taskIds.length };
    },
    createTtsTask: async () => {
      throw new Error("节点语音不应再次独立扣费");
    },
    synthesizeTtsForExternalBilling: async (_userId: string, input: any) => {
      externalTtsCalls += 1;
      externalTtsInputs.push(input);
      return {
        id: `audio-task-${externalTtsCalls}`,
        status: "SUCCEEDED",
        errorMessage: null,
        providerPayload: null,
        outputAudioAsset: {
          url: `https://example.com/audio-${externalTtsCalls}.mp3`,
          durationMs: 1_000
        }
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    audioService as never,
    aiService as never,
    courseReviewService as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  const settings = { voice: "longanyang", speed: 1 };
  const estimate = await service.estimateMaterialAudioGeneration(accountSubject, material.id, settings);
  const updated = await service.generateMaterialAudio("user-1", material.id, {
    ...settings,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });

  assert.equal(externalTtsCalls, 3);
  assert.deepEqual(
    externalTtsInputs.map((input) => input.text),
    [
      "学习简单问候。",
      "我们来学习 Hello world.",
      "我们就读到这里。回头看一遍原文，留意刚才讲过的关键词、句子结构和前后内容的联系，你会更容易把这些表达真正用起来。"
    ]
  );
  assert.equal(
    externalTtsInputs.every((input) =>
      input.videoGuidePersistence?.lessonId === material.id &&
      input.videoGuidePersistence?.generationId === estimate.requestId &&
      input.videoGuidePersistence?.namespace === "english-guided-study" &&
      input.videoGuidePersistence?.format === "mp3"
    ),
    true
  );
  assert.equal(updated.audioUrl, "https://example.com/audio-1.mp3");
  assert.deepEqual(cleanedTaskIds, [["old-audio-task"]]);
  assert.deepEqual(harness.wallet, {
    availableCredits: 22,
    frozenCredits: 0,
    totalConsumedCredits: 28
  });
});

test("英文带学长文分批生成后完整覆盖全文且不在文稿阶段生成练习", async () => {
  const sourceText = Array.from(
    { length: 220 },
    (_, index) => `This is sentence ${index + 1}, written to verify complete long-document lesson generation.`
  ).join(" ");
  const harness = createBillingHarness(2_000);
  const createdAt = new Date("2026-07-17T00:00:00.000Z");
  let generatedRecord: any = null;
  const materialStore = {
    findFirst: async () => null,
    create: async ({ data }: any) => {
      generatedRecord = {
        ...data,
        id: "material-long",
        pinnedAt: null,
        createdAt,
        updatedAt: createdAt
      };
      return generatedRecord;
    }
  };
  const transaction = {
    ...harness.transaction,
    englishGuidedStudyMaterial: materialStore
  };
  const prisma = {
    ...transaction,
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => callback(transaction)
  };
  const generationInputs: any[] = [];
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: any) => {
      generationInputs.push(input);
      const segments = JSON.parse(input.variables.sourceSegmentsJson) as Array<{ id: string; text: string }>;

      return {
        taskId: `ai-task-${generationInputs.length}`,
        providerName: "test-provider",
        modelName: "test-model",
        text: JSON.stringify({
          title: "Long lesson",
          summary: "Long lesson. 这个标题点出这是一节较长的课程，也提示我们分批理解全文。",
          sentences: segments.map((segment) => ({
            id: segment.id,
            segmentId: segment.id,
            text: segment.text,
            script: "我们先用中文把这句话的场景和主干讲清楚，再保留一个核心英文表达帮助你理解和模仿。",
            explanation: "用中文梳理句意和表达作用。",
            grammarFocus: "关注句子的主语和动作。",
            points: []
          })),
          questions: [],
          narration: ""
        })
      };
    }
  };
  const service = new EnglishGuidedStudyService({} as never, aiService as never, courseReviewService as never);
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  const input = {
    title: "Long lesson",
    sourceType: "TEXT" as const,
    sourceText,
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "E1",
    explanationMode: "SENTENCE" as const
  };
  const estimate = await service.estimateMaterialGeneration("user-1", input);
  const material = await service.generateMaterial("user-1", {
    ...input,
    billingConfirmed: true,
    billingRequestId: estimate.requestId,
    billingRevision: estimate.revision
  });
  const content = material.content as any;

  assert.ok(generationInputs.length > 1);
  assert.equal(generationInputs.every((item) => item.variables.questionCount === undefined), true);
  assert.equal(content.sentences.length, 220);
  assert.equal(content.questions.length, 0);
  assert.equal(generatedRecord.id, "material-long");
});

type BillingInput = {
  estimatedCredits: number;
  note: string;
  operationKey: string;
  userId: string;
};
type SettlementInput = {
  actualCredits?: number;
  consumeNote: string;
  operationKey: string;
  releaseNote: string;
  userId: string;
};
type ReleaseInput = {
  note: string;
  operationKey: string;
  userId: string;
};
type BillingTransaction = ReturnType<typeof createBillingHarness>["transaction"];

type ReserveCredits = (transaction: BillingTransaction, input: BillingInput) => Promise<void>;
type SettleCredits = (transaction: BillingTransaction, input: SettlementInput) => Promise<void>;
type ReleaseCredits = (transaction: BillingTransaction, input: ReleaseInput) => Promise<void>;

function createBillingHarness(availableCredits: number) {
  const wallet = {
    availableCredits,
    frozenCredits: 0,
    totalConsumedCredits: 0
  };
  const entries = new Map<string, { amount: number; idempotencyKey: string }>();
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => wallet,
      updateMany: async ({ where, data }: any) => {
        const required = where.availableCredits?.gte ?? 0;

        if (wallet.availableCredits < required) {
          return { count: 0 };
        }

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
    }
  };

  return { entries, transaction, wallet };
}

function generatedLessonJson() {
  return JSON.stringify({
    title: "Hello",
    summary: "Hello. 这个标题点出这是一句简单问候，也提示我们关注开口打招呼的表达。",
    narration: "我们来学习 Hello world.",
    sentences: [
      {
        id: "s1",
        segmentId: "s1",
        text: "Hello world.",
        script: "我们先看这句简单问候。Hello 表示你好，world 表示世界。跟老师读一遍 Hello world。",
        explanation: "一句简单问候。",
        grammarFocus: "陈述句。",
        points: []
      }
    ],
    questions: []
  });
}

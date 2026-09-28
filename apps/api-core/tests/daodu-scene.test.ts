import { membershipWalletFixture } from "./helpers/membership-wallet-fixture.js";
import assert from "node:assert/strict";
import test from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AiService } from "../src/ai/ai.service.js";
import * as guidedStudyDto from "../src/english-guided-study/dto/english-guided-study.dto.js";
import * as narrationNodes from "../src/english-guided-study/english-guided-study-narration-nodes.js";
import { extractEnglishGuidedStudyReferenceDocument } from "../src/english-guided-study/english-guided-study-reference-materials.js";
import { EnglishGuidedStudyService } from "../src/english-guided-study/english-guided-study.service.js";
import { englishGuidedStudyAudioBillingRevision } from "../src/english-guided-study/english-guided-study-billing.js";
import {
  createEnglishGuidedStudyJob,
  createEnglishGuidedStudyProgress,
  leaseEnglishGuidedStudyJob
} from "../src/english-guided-study/english-guided-study-operation.js";
import { learnerScenarioRoots } from "../src/profiles/learner-access.service.js";

test("开卷导读后端只接受约定的学习时长和题目数", () => {
  assert.deepEqual(Reflect.get(guidedStudyDto, "readingGuideDurations"), [1, 3, 5, 8, 10, 15]);
  assert.deepEqual(Reflect.get(guidedStudyDto, "readingGuideQuestionCounts"), [3, 5, 10, 20]);
  assert.ok((guidedStudyDto.guidedStudyScenes as readonly string[]).includes("DAODU"));
});

test("开卷导读允许长正文且保持与英文正文 30000 字符上限隔离", async () => {
  const baseInput = {
    title: "阅读材料",
    sourceType: "TEXT",
    sourceText: "中".repeat(30_001),
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学三四年级",
    aiLevel: "G4"
  };
  const englishErrors = await validate(plainToInstance(
    guidedStudyDto.GenerateEnglishGuidedStudyMaterialDto,
    { ...baseInput, scene: "ENGLISH" }
  ));
  const readingGuideErrors = await validate(plainToInstance(
    guidedStudyDto.GenerateEnglishGuidedStudyMaterialDto,
    { ...baseInput, scene: "DAODU", durationMinutes: 3 }
  ));

  assert.ok(englishErrors.some((error) => error.property === "sourceText"));
  assert.equal(readingGuideErrors.some((error) => error.property === "sourceText"), false);
});

test("开卷导读全文文稿按自然段生成连续音频节点", () => {
  const buildDrafts = Reflect.get(narrationNodes, "buildReadingGuideNarrationNodeDrafts");
  const firstParagraph = "这是第一段完整导读。";
  const secondParagraph = "这是第二段完整导读。";

  assert.equal(typeof buildDrafts, "function");
  assert.deepEqual(buildDrafts(`${firstParagraph}\n\n${secondParagraph}`), [
    {
      id: "reading-guide-p1",
      type: "SENTENCE",
      sentenceId: "reading-guide-p1",
      chunkType: "CONTEXT",
      script: firstParagraph,
      focus: null
    },
    {
      id: "reading-guide-p2",
      type: "SENTENCE",
      sentenceId: "reading-guide-p2",
      chunkType: "CONTEXT",
      script: secondParagraph,
      focus: null
    }
  ]);
});

test("开卷导读主文档允许 10MB 内文件且不改变参考资料默认限制", async () => {
  const extractSourceDocument = extractEnglishGuidedStudyReferenceDocument as unknown as (
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    options: { maxBytes: number; maxLength: number }
  ) => Promise<{ content: string; truncated: boolean }>;
  const content = "开卷导读正文".repeat(400_000);
  const buffer = Buffer.from(content, "utf8");

  assert.ok(buffer.length > 2 * 1024 * 1024);
  assert.ok(buffer.length < 10 * 1024 * 1024);
  const result = await extractSourceDocument(
    {
      originalname: "阅读材料.txt",
      mimetype: "text/plain",
      size: buffer.length,
      buffer
    },
    { maxBytes: 10 * 1024 * 1024, maxLength: 256_000 }
  );

  assert.equal(result.content.length, 256_000);
  assert.equal(result.truncated, true);
});

test("开卷导读练习属于 daodu 授权根", () => {
  assert.equal(learnerScenarioRoots.get("daodu-practice"), "daodu");
  assert.equal(learnerScenarioRoots.get("daodu-image-extraction"), "daodu");
});

test("开卷导读图片识别使用独立的 daodu 授权场景", async () => {
  const calls: Array<{ scenarioSlug: string }> = [];
  const service = new EnglishGuidedStudyService(
    {} as never,
    {
      generateScenarioTextForExternalBilling: async (input: { scenarioSlug: string }) => {
        calls.push(input);
        return {
          taskId: "task-daodu-image",
          text: JSON.stringify({ title: "散文标题", author: "作者", bodyText: "识别出的中文正文", ignoredContent: [] }),
          providerName: "test-provider",
          modelName: "test-model"
        };
      }
    } as never,
    { recordMaterialChange: async () => undefined } as never
  );

  const result = await service.extractImageText(
    { userId: "user-1", learnerId: null, rootScenarioId: null },
    {
      scene: "DAODU",
      imageName: "阅读内容.png",
      imageMimeType: "image/png",
      imageSizeBytes: 128,
      imageDataUrl: "data:image/png;base64,AA=="
    }
  );

  assert.equal(calls[0]?.scenarioSlug, "daodu-image-extraction");
  assert.equal(result.bodyText, "识别出的中文正文");
});

test("开卷导读提示词生成一篇整体导读且由系统自动选择方向", () => {
  const promptBuilder = Reflect.get(AiService.prototype, "daoduPromptTemplate");

  assert.equal(typeof promptBuilder, "function");
  const prompt = Reflect.apply(promptBuilder, AiService.prototype, []);
  assert.match(prompt, /完整的一篇导读文稿/);
  assert.match(prompt, /写作背景.*内容梗概.*奇闻轶事.*思想情感.*文学赏析.*写作方法/s);
  assert.match(prompt, /自动选择/);
  assert.match(prompt, /每分钟 180 字/);
  assert.doesNotMatch(prompt, /逐句讲解|逐段讲解/);
});

test("开卷导读内容生成保存为一篇全文文稿", async () => {
  const calls: Array<{ scenarioSlug: string; variables: Record<string, unknown> }> = [];
  const guideScript = "这是一篇面向五年级学生的完整导读文稿。".repeat(30);
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      scenarioSlug: string;
      variables: Record<string, unknown>;
    }) => {
      calls.push(input);
      return {
        taskId: "task-daodu-1",
        text: JSON.stringify({ title: "阅读材料导读", guideScript }),
        providerName: "test-provider",
        modelName: "test-model"
      };
    }
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    aiService as never,
    { recordMaterialChange: async () => undefined } as never
  );
  const generateContent = Reflect.get(service, "generateMaterialContent") as (
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  const content = await Reflect.apply(generateContent, service, [{
    attribution: { userId: "user-1", learnerId: null, rootScenarioId: "daodu-id" },
    inputLabel: "阅读材料",
    maxTokens: 4_000,
    aiLevel: "G5",
    scene: "DAODU",
    author: null,
    authorIntroductionMode: "NONE",
    explanationMode: "FREEFORM",
    levelOptionLabel: "五年级",
    levelStandardName: "学段年级",
    levelProfile: "适合五年级学生",
    sourceSegments: [{ id: "reading-guide", text: "阅读材料正文" }],
    sourceName: "阅读材料.txt",
    sourceText: "阅读材料正文",
    sourceType: "TEXT",
    title: "阅读材料",
    referenceMaterials: [],
    durationMinutes: 3
  }]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.scenarioSlug, "daodu");
  assert.equal(calls[0]?.variables.durationMinutes, "3");
  assert.equal(calls[0]?.variables.targetCharacters, "540");
  assert.equal(content.scene, "DAODU");
  assert.equal(content.narration, guideScript);
  assert.equal(content.summary, "");
  assert.equal(content.closing, "");
  assert.equal(content.durationMinutes, 3);
  assert.deepEqual(content.sentences, [
    {
      id: "reading-guide",
      text: "阅读材料正文",
      explanation: guideScript,
      grammarFocus: "",
      script: guideScript,
      startSeconds: 0,
      endSeconds: 180,
      points: []
    }
  ]);
});

test("开卷导读按用户选择生成指定数量的同步练习", async () => {
  const now = "2026-08-26T00:00:00.000Z";
  const job = leaseEnglishGuidedStudyJob(createEnglishGuidedStudyJob({
    operation: "PRACTICE",
    jobId: "job-daodu-practice",
    operationKey: "daodu-practice:user-1:material-1",
    estimatedCredits: 0,
    input: { questionCount: 3 },
    now
  }), "attempt-daodu-practice", now);
  const progress = createEnglishGuidedStudyProgress({
    operation: "PRACTICE",
    phase: "RUNNING",
    message: "正在生成",
    now,
    total: 100
  });
  let currentContent: Record<string, unknown> = {
    scene: "DAODU",
    durationMinutes: 3,
    guideScript: "完整导读文稿",
    referenceMaterials: [],
    sentences: [{
      id: "reading-guide",
      text: "阅读材料正文",
      explanation: "完整导读文稿",
      grammarFocus: "",
      script: "完整导读文稿",
      points: []
    }],
    questions: [],
    practiceGenerationJob: job,
    practiceGenerationProgress: progress
  };
  const material = {
    id: "material-1",
    userId: "user-1",
    learnerId: null,
    title: "阅读材料",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "阅读材料正文",
    levelStandardName: "学段年级",
    levelOptionLabel: "五年级",
    aiLevel: "G5",
    summary: "",
    narration: "完整导读文稿",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 180,
    content: currentContent,
    pinnedAt: null,
    createdAt: new Date(now),
    updatedAt: new Date(now)
  };
  const calls: Array<{ scenarioSlug: string; variables: Record<string, unknown> }> = [];
  const aiService = {
    generateScenarioTextForExternalBilling: async (input: {
      scenarioSlug: string;
      variables: Record<string, unknown>;
    }) => {
      calls.push(input);
      return {
        taskId: "task-daodu-practice",
        text: JSON.stringify({
          questions: Array.from({ length: 20 }, (_, index) => ({
            id: `q${index + 1}`,
            question: `第 ${index + 1} 题`,
            options: ["选项 A", "选项 B", "选项 C", "选项 D"],
            answer: index % 4,
            explanation: "依据阅读内容作答。"
          }))
        }),
        providerName: "test-provider",
        modelName: "test-model"
      };
    }
  };
  const englishGuidedStudyMaterial = {
    findFirst: async () => ({ ...material, content: currentContent }),
    updateMany: async ({ data }: { data: { content: Record<string, unknown> } }) => {
      currentContent = data.content;
      return { count: 1 };
    },
    findUniqueOrThrow: async () => ({ ...material, content: currentContent })
  };
  const prisma = {
    englishGuidedStudyMaterial,
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      $queryRaw: async () => [{ locked: 1 }],
      englishGuidedStudyMaterial
    })
  };
  const service = new EnglishGuidedStudyService(
    {} as never,
    aiService as never,
    { recordMaterialChange: async () => undefined } as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  const result = await service.generateMaterialPractice(
    "user-1",
    material.id,
    { questionCount: 20 },
    {
      attribution: { userId: "user-1", learnerId: null, rootScenarioId: "daodu-id" },
      operationJob: job
    }
  );

  assert.equal(calls[0]?.scenarioSlug, "daodu-practice");
  assert.equal(calls[0]?.variables.questionCount, "20");
  assert.equal((result.content as { questions: unknown[] }).questions.length, 20);
  assert.equal(
    (result.content as { practiceGeneration: { scenarioSlug: string } }).practiceGeneration.scenarioSlug,
    "daodu-practice"
  );
});

test("开卷导读音频按自然段生成多个连续播放节点", async () => {
  const paragraphs = ["第一段导读。", "第二段导读。", "第三段导读。"];
  const guideScript = paragraphs.join("\n\n");
  let currentMaterial = {
    id: "material-audio",
    userId: "user-1",
    learnerId: null,
    title: "阅读材料",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "阅读材料正文",
    levelStandardName: "学段年级",
    levelOptionLabel: "五年级",
    aiLevel: "G5",
    summary: "",
    narration: guideScript,
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 180,
    content: {
      scene: "DAODU",
      durationMinutes: 3,
      guideScript,
      closing: "",
      sentences: [{
        id: "reading-guide",
        text: "阅读材料正文",
        explanation: guideScript,
        grammarFocus: "",
        script: guideScript,
        points: []
      }]
    },
    pinnedAt: null,
    createdAt: new Date("2026-08-26T00:00:00.000Z"),
    updatedAt: new Date("2026-08-26T00:00:00.000Z")
  };
  const syntheses: string[] = [];
  const audioService = {
    synthesizeTtsForExternalBilling: async (_attribution: unknown, input: { text: string }) => {
      syntheses.push(input.text);
      return {
        id: `audio-${syntheses.length}`,
        status: "SUCCEEDED",
        outputAudioAsset: {
          url: "https://example.com/daodu.mp3",
          durationMs: 180_000
        },
        providerPayload: {}
      };
    },
    cleanupExternalNarrationAudio: async () => ({ cleaned: 0 })
  };
  const englishGuidedStudyMaterial = {
    findFirst: async () => currentMaterial,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      currentMaterial = { ...currentMaterial, ...data } as typeof currentMaterial;
      return currentMaterial;
    }
  };
  const prisma = billingPrisma({ englishGuidedStudyMaterial });
  const service = new EnglishGuidedStudyService(
    audioService as never,
    {} as never,
    { recordMaterialChange: async () => undefined } as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });
  const billingRequestId = "request-daodu-audio-0001";
  const input = {
    billingConfirmed: true,
    billingRequestId,
    billingRevision: englishGuidedStudyAudioBillingRevision({
      billingRequestId,
      materialId: currentMaterial.id,
      narration: paragraphs,
      modelAlias: "tts-default",
      voice: "longanyang",
      speed: 1,
      format: "mp3"
    }),
    modelAlias: "tts-default",
    voice: "longanyang",
    speed: 1,
    format: "mp3"
  };

  const result = await service.generateMaterialAudio("user-1", currentMaterial.id, input);

  assert.deepEqual(syntheses, paragraphs);
  assert.equal(result.narration, guideScript);
  assert.deepEqual(
    (result.content as { narrationTimelineV2: { nodes: Array<{ sentenceId: string }> } }).narrationTimelineV2.nodes.map((node) => node.sentenceId),
    ["reading-guide-p1", "reading-guide-p2", "reading-guide-p3"]
  );
});

test("开卷导读按自然段编辑并保持整篇文稿结构", async () => {
  const originalParagraphs = ["原来的第一段导读。", "原来的第二段导读。"];
  const originalScript = originalParagraphs.join("\n\n");
  const nextParagraph = "修改后的第二段导读，仍然保持上下文连贯。";
  const nextScript = [originalParagraphs[0], nextParagraph].join("\n\n");
  let currentMaterial = {
    id: "material-edit",
    userId: "user-1",
    learnerId: null,
    title: "阅读材料",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "阅读材料正文",
    levelStandardName: "学段年级",
    levelOptionLabel: "五年级",
    aiLevel: "G5",
    summary: "",
    narration: originalScript,
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 180,
    content: {
      scene: "DAODU",
      durationMinutes: 3,
      guideScript: originalScript,
      closing: "",
      sentences: [{
        id: "reading-guide",
        text: "阅读材料正文",
        explanation: originalScript,
        grammarFocus: "",
        script: originalScript,
        points: []
      }],
      questions: []
    },
    pinnedAt: null,
    createdAt: new Date("2026-08-26T00:00:00.000Z"),
    updatedAt: new Date("2026-08-26T00:00:00.000Z")
  };
  const englishGuidedStudyMaterial = {
    findFirst: async () => currentMaterial,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      currentMaterial = { ...currentMaterial, ...data } as typeof currentMaterial;
      return currentMaterial;
    }
  };
  const prisma = {
    englishGuidedStudyMaterial,
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      $queryRaw: async () => [{ locked: 1 }],
      englishGuidedStudyMaterial
    })
  };
  const service = new EnglishGuidedStudyService(
    { cleanupExternalNarrationAudio: async () => ({ cleaned: 0 }) } as never,
    {} as never,
    { recordMaterialChange: async () => undefined } as never
  );
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  const result = await service.updateMaterialScript(
    { userId: "user-1", mode: "ACCOUNT", learnerId: null },
    currentMaterial.id,
    {
      targetType: "SENTENCE",
      sentenceId: "reading-guide-p2",
      originalScript: originalParagraphs[1],
      script: nextParagraph
    }
  );

  assert.equal(result.narration, nextScript);
  assert.equal((result.content as { guideScript: string }).guideScript, nextScript);
  assert.equal((result.content as { closing: string }).closing, "");
  assert.equal((result.content as { questions: unknown[] }).questions.length, 0);
});

test("已有讲解音频时只重生成修改自然段并保留其他段音频", async () => {
  const originalParagraphs = ["第一段原文。", "第二段原文。", "第三段原文。"];
  const nextParagraph = "第二段修改后的导读。";
  let currentMaterial = {
    id: "material-paragraph-audio-edit",
    userId: "user-1",
    learnerId: null,
    title: "阅读材料",
    sourceType: "TEXT",
    sourceName: null,
    sourceText: "阅读材料正文",
    levelStandardName: "学段年级",
    levelOptionLabel: "五年级",
    aiLevel: "G5",
    summary: "",
    narration: originalParagraphs.join("\n\n"),
    audioUrl: "https://example.com/p1.mp3",
    audioTaskId: "audio-p1",
    audioDurationSeconds: 3,
    content: {
      scene: "DAODU",
      durationMinutes: 3,
      guideScript: originalParagraphs.join("\n\n"),
      closing: "",
      narrationVoice: { providerVoiceId: "longanyang", modelAlias: "tts-default", speed: 1 },
      narrationTimelineV2: {
        version: 2,
        nodes: originalParagraphs.map((script, index) => ({
          id: `reading-guide-p${index + 1}`,
          type: "SENTENCE",
          sentenceId: `reading-guide-p${index + 1}`,
          chunkType: "CONTEXT",
          script,
          focus: null,
          audioTaskId: `audio-p${index + 1}`,
          audioUrl: `https://example.com/p${index + 1}.mp3`,
          durationMs: 1_000
        }))
      },
      sentences: [{
        id: "reading-guide",
        text: "阅读材料正文",
        explanation: originalParagraphs.join("\n\n"),
        grammarFocus: "",
        script: originalParagraphs.join("\n\n"),
        points: []
      }],
      questions: []
    },
    pinnedAt: null,
    createdAt: new Date("2026-08-26T00:00:00.000Z"),
    updatedAt: new Date("2026-08-26T00:00:00.000Z")
  };
  const synthesized: string[] = [];
  const cleanedTaskIds: string[][] = [];
  const audioService = {
    cleanupExternalNarrationAudio: async (_userId: string, taskIds: string[]) => {
      cleanedTaskIds.push(taskIds);
      return { cleaned: taskIds.length };
    },
    synthesizeTtsForExternalBilling: async (_context: unknown, input: { text: string }) => {
      synthesized.push(input.text);
      return {
        id: "audio-p2-new",
        status: "SUCCEEDED",
        outputAudioAsset: { url: "https://example.com/p2-new.mp3", durationMs: 1_200 },
        providerPayload: {}
      };
    }
  };
  const englishGuidedStudyMaterial = {
    findFirst: async () => currentMaterial,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      currentMaterial = { ...currentMaterial, ...data } as typeof currentMaterial;
      return currentMaterial;
    }
  };
  const wallet = { upsert: async () => ({ availableCredits: 10_000 }) };
  const prisma = {
    englishGuidedStudyMaterial,
    ...membershipWalletFixture(),
    wallet,
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      $queryRaw: async () => [{ locked: 1 }],
      englishGuidedStudyMaterial
    })
  };
  const service = new EnglishGuidedStudyService(
    audioService as never,
    {} as never,
    { recordMaterialChange: async () => undefined } as never
  );
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma,
    reserveEnglishGuidedStudyCredits: async () => undefined,
    settleEnglishGuidedStudyCredits: async () => undefined,
    releaseEnglishGuidedStudyCredits: async () => undefined
  });
  const request = {
    targetType: "SENTENCE" as const,
    sentenceId: "reading-guide-p2",
    originalScript: originalParagraphs[1],
    script: nextParagraph
  };
  const estimate = await service.estimateMaterialScriptUpdate(
    { userId: "user-1", mode: "ACCOUNT", learnerId: null },
    currentMaterial.id,
    request
  );
  const result = await service.updateMaterialScript(
    { userId: "user-1", mode: "ACCOUNT", learnerId: null },
    currentMaterial.id,
    {
      ...request,
      billingConfirmed: true,
      billingRequestId: estimate.requestId,
      billingRevision: estimate.revision
    }
  );
  const nodes = (result.content as { narrationTimelineV2: { nodes: Array<{ audioTaskId: string }> } }).narrationTimelineV2.nodes;

  assert.deepEqual(synthesized, [nextParagraph]);
  assert.deepEqual(nodes.map((node) => node.audioTaskId), ["audio-p1", "audio-p2-new", "audio-p3"]);
  assert.deepEqual(cleanedTaskIds, [["audio-p2"]]);
  assert.equal(result.narration, [originalParagraphs[0], nextParagraph, originalParagraphs[2]].join("\n\n"));
});

function billingPrisma<T extends Record<string, unknown>>(base: T) {
  const wallet = { availableCredits: 10_000, frozenCredits: 0, totalConsumedCredits: 0 };
  const entries = new Map<string, { amount: number; idempotencyKey: string }>();
  const prisma = {
    ...base,
    $queryRaw: async () => [{ locked: 1 }],
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => wallet,
      updateMany: async ({ where, data }: {
        where: { availableCredits?: { gte?: number } };
        data: { availableCredits?: { decrement?: number }; frozenCredits?: { increment?: number } };
      }) => {
        if (wallet.availableCredits < (where.availableCredits?.gte ?? 0)) return { count: 0 };
        wallet.availableCredits -= data.availableCredits?.decrement ?? 0;
        wallet.frozenCredits += data.frozenCredits?.increment ?? 0;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => wallet,
      update: async ({ data }: {
        data: {
          availableCredits?: { increment?: number; decrement?: number };
          frozenCredits?: { increment?: number; decrement?: number };
          totalConsumedCredits?: { increment?: number };
        };
      }) => {
        wallet.availableCredits += data.availableCredits?.increment ?? 0;
        wallet.availableCredits -= data.availableCredits?.decrement ?? 0;
        wallet.frozenCredits += data.frozenCredits?.increment ?? 0;
        wallet.frozenCredits -= data.frozenCredits?.decrement ?? 0;
        wallet.totalConsumedCredits += data.totalConsumedCredits?.increment ?? 0;
        return wallet;
      }
    },
    ledgerEntry: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => entries.get(where.idempotencyKey) ?? null,
      create: async ({ data }: { data: { amount: number; idempotencyKey: string } }) => {
        entries.set(data.idempotencyKey, data);
        return data;
      }
    },
    $transaction: async <TResult>(callback: (client: unknown) => Promise<TResult>) => callback(prisma)
  };

  return prisma;
}

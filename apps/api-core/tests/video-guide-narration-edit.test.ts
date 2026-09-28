import { membershipWalletFixture } from "./helpers/membership-wallet-fixture.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeLessonNarrationAudioContent,
  VideoGuideService
} from "../src/video-guide/video-guide.service.js";
import { mergeEditedNarrationDraftContent } from "../src/video-guide/video-guide-generation-state.js";
import type { ProfileSubject } from "../src/profiles/profile-context.types.js";

const courseReviewService = {
  recordMaterialChange: async () => undefined
};
const accountSubject: ProfileSubject = { userId: "user-1", mode: "ACCOUNT", learnerId: null };

const draftTimeline = [
  {
    id: "intro",
    type: "INTRO" as const,
    title: "课程导入",
    script: "今天学习垃圾分类。",
    chunks: [{ id: "intro-c1", type: "intro", text: "今天学习垃圾分类。", overlay: null }]
  },
  {
    id: "s_001",
    type: "SENTENCE" as const,
    title: "第 1 句",
    sentenceId: "s_001",
    subtitle: "There are lots of things.",
    script: "lots of 表示很多。",
    chunks: [{ id: "s_001-c1", type: "phrase", text: "lots of 表示很多。", overlay: null }]
  }
];

function legacyNarrationContent() {
  return {
    narrationScript: draftTimeline.map((node) => node.script).join("\n\n"),
    narrationVoice: {
      providerVoiceId: "voice-1",
      voiceAssetId: null,
      modelAlias: "tts-default"
    },
    narrationTimeline: draftTimeline.map((node) => ({
      ...node,
      audioUrl: `https://cdn.example.com/${node.id}.mp3`,
      audioTaskId: `${node.id}-audio`
    }))
  };
}

function lessonRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    userId: "user-1",
    title: "测试导学课件",
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
    content: legacyNarrationContent(),
    errorMessage: null,
    createdAt: new Date("2026-07-15T00:00:00.000Z"),
    updatedAt: new Date("2026-07-15T00:00:00.000Z"),
    finishedAt: new Date("2026-07-15T00:10:00.000Z"),
    ...overrides
  };
}

function narrationUpdates(firstSentenceScript = draftTimeline[1]!.script) {
  return [
    {
      id: "intro",
      originalScript: draftTimeline[0]!.script,
      script: draftTimeline[0]!.script
    },
    {
      id: "s_001",
      originalScript: draftTimeline[1]!.script,
      script: firstSentenceScript
    }
  ];
}

function successfulNarrationAudioTask(generationId: string, nodeId = "s_001") {
  const objectKey = `video-guide/narration/lesson-1/${generationId}/${nodeId}.mp3`;
  const url = `https://cdn.example.com/${objectKey}`;

  return {
    id: `${nodeId}-audio-${generationId}`,
    status: "SUCCEEDED",
    errorCode: null,
    errorMessage: null,
    providerPayload: {
      durationMs: 1200,
      persistence: {
        status: "SUCCEEDED",
        storageProvider: "S3",
        objectKey,
        url,
        mimeType: "audio/mpeg",
        sizeBytes: 2048,
        sha256: "a".repeat(64)
      }
    },
    outputAudioAsset: {
      id: `asset-${generationId}`,
      storageProvider: "S3",
      objectKey,
      url,
      mimeType: "audio/mpeg",
      sizeBytes: 2048,
      durationMs: 1200
    }
  };
}

function serviceWithTransaction(
  current: ReturnType<typeof lessonRecord>,
  audioService: Record<string, unknown> = {}
) {
  const updates: Array<Record<string, unknown>> = [];
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    videoGuideLesson: {
      findFirst: async (input: { where: { id: string; userId: string } }) =>
        input.where.id === current.id && input.where.userId === current.userId ? current : null,
      update: async (input: { data: Record<string, unknown> }) => {
        updates.push(input);
        return {
          ...current,
          ...input.data,
          updatedAt: new Date("2026-07-16T02:00:00.000Z")
        };
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
    videoGuideLesson: {
      findFirst: transaction.videoGuideLesson.findFirst
    },
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => ({ availableCredits: 500 })
    }
  };

  const service = new VideoGuideService(audioService as never, {} as never, courseReviewService as never);
  Object.assign(service as unknown as { prisma: typeof prisma }, { prisma });

  return { service, updates };
}

test("视频导学文稿编辑只预估当前修改节点的语音费用", async () => {
  const current = lessonRecord();
  const { service, updates } = serviceWithTransaction(current);
  const estimateMethod = Reflect.get(service, "estimateLessonNarrationScriptUpdate");
  const editedScript = `# ${"甲".repeat(499)}\n- ${"乙".repeat(500)}`;

  assert.equal(typeof estimateMethod, "function");
  const estimate = await estimateMethod.call(service, accountSubject, current.id, {
    nodes: narrationUpdates(editedScript)
  });

  assert.equal(estimate.title, "更新本句讲解语音");
  assert.equal(estimate.estimatedCredits, 28);
  assert.match(estimate.items[0]?.description ?? "", /1000 个字符/);
  assert.equal(updates.length, 0);
});

test("视频导学本句原语音变化后计费确认版本立即失效", async () => {
  const current = lessonRecord();
  const { service } = serviceWithTransaction(current);
  const request = { nodes: narrationUpdates("修改后的第一句讲解") };
  const first = await service.estimateLessonNarrationScriptUpdate(accountSubject, current.id, request);
  const timeline = (current.content as Record<string, unknown>).narrationTimeline as Array<Record<string, unknown>>;

  timeline[1] = { ...timeline[1], audioTaskId: "s_001-audio-competing" };
  const second = await service.estimateLessonNarrationScriptUpdate(accountSubject, current.id, request);

  assert.notEqual(first.revision, second.revision);
});

test("异常文稿快照在冻结点数和调用语音模型前被拒绝", async () => {
  const current = lessonRecord();
  let reserveCalls = 0;
  let synthesisCalls = 0;
  const { service } = serviceWithTransaction(current, {
    synthesizeTtsForExternalBilling: async () => {
      synthesisCalls += 1;
      throw new Error("不应调用语音模型");
    }
  });
  Object.assign(service, {
    reserveVideoGuideCredits: async () => {
      reserveCalls += 1;
    },
    narrationTtsRateLimiter: { acquire: async () => undefined }
  });
  const malformedRequest = {
    nodes: [narrationUpdates("修改后的第一句讲解")[1]!],
    billingConfirmed: true,
    billingRequestId: "edit-invalid",
    billingRevision: "invalid-revision"
  };

  await assert.rejects(
    () => service.estimateLessonNarrationScriptUpdate(accountSubject, current.id, malformedRequest),
    /文案已发生变化/
  );
  await assert.rejects(
    () => service.updateLessonNarrationScript(accountSubject, current.id, malformedRequest),
    /文案已发生变化/
  );
  assert.equal(reserveCalls, 0);
  assert.equal(synthesisCalls, 0);
});

test("已有语音的文稿编辑同样遵守文稿总长度上限", async () => {
  const oversizedTimeline = Array.from({ length: 17 }, (_, index) => ({
    id: `s_${String(index + 1).padStart(3, "0")}`,
    type: "SENTENCE" as const,
    title: `第 ${index + 1} 句`,
    sentenceId: `s_${String(index + 1).padStart(3, "0")}`,
    subtitle: `Sentence ${index + 1}.`,
    script: "a".repeat(12_000),
    chunks: []
  }));
  const current = lessonRecord({
    content: {
      narrationVoice: {
        providerVoiceId: "voice-1",
        voiceAssetId: null,
        modelAlias: "tts-default"
      },
      narrationTimeline: oversizedTimeline.map((node) => ({
        ...node,
        audioUrl: `https://cdn.example.com/${node.id}.mp3`,
        audioTaskId: `${node.id}-audio`
      }))
    }
  });
  const { service } = serviceWithTransaction(current);
  const nodes = oversizedTimeline.map((node, index) => ({
    id: node.id,
    originalScript: node.script,
    script: index === 0 ? `${node.script.slice(0, -1)}b` : node.script
  }));

  await assert.rejects(
    () => service.estimateLessonNarrationScriptUpdate(accountSubject, current.id, { nodes }),
    /总长度不能超过 200000 个字符/
  );
});

test("已有讲解语音时未确认单句合成费用不能保存文稿", async () => {
  const current = lessonRecord();
  const { service, updates } = serviceWithTransaction(current);

  await assert.rejects(
    () =>
      service.updateLessonNarrationScript(accountSubject, current.id, {
        nodes: narrationUpdates("修改后的第一句讲解")
      }),
    /确认.*点数|计费确认/u
  );
  assert.equal(updates.length, 0);
});

test("其他用户和活跃后台任务不能保存文案", async () => {
  const current = lessonRecord();
  const otherUserService = serviceWithTransaction(current).service;
  const activeService = serviceWithTransaction(lessonRecord({ status: "GENERATING" })).service;

  await assert.rejects(
    () =>
      otherUserService.updateLessonNarrationScript(
        { userId: "user-2", mode: "ACCOUNT", learnerId: null },
        current.id,
        {
        nodes: narrationUpdates("新文案")
        }
      ),
    /导学课件不存在/
  );
  await assert.rejects(
    () =>
      activeService.updateLessonNarrationScript(accountSubject, current.id, {
        nodes: narrationUpdates("新文案")
      }),
    /正在生成中/
  );
});

test("讲解语音发布成功后清除文案修改产生的过期标记", () => {
  const content = mergeLessonNarrationAudioContent(
    {
      ...legacyNarrationContent(),
      narrationAudioStale: true
    },
    {
      audioTaskId: "audio-new",
      audioUrl: "https://cdn.example.com/new.mp3",
      narrationAudioProgress: { version: 1, total: 2, completed: 2, failed: 0, nodes: [] },
      narrationTimeline: [],
      ttsModelAlias: "default-tts",
      voice: "voice-1",
      wasTtsTextTruncated: false
    }
  ) as Record<string, unknown>;

  assert.equal(content.narrationAudioStale, false);
});

test("视频导学单句重合成只替换当前节点并同步更新文稿", () => {
  const current = legacyNarrationContent();
  const content = mergeEditedNarrationDraftContent(
    current,
    narrationUpdates("修改后的第一句讲解"),
    "2026-08-20T00:00:00.000Z",
    {
      nodeId: "s_001",
      audio: {
        audioTaskId: "s_001-audio-new",
        audioAssetId: "asset-new",
        audioUrl: "https://cdn.example.com/s_001-new.mp3",
        audioObjectKey: "video-guide/lesson-1/s_001-new.mp3",
        audioSizeBytes: 2048,
        audioSha256: "a".repeat(64),
        durationMs: 1200
      }
    }
  ) as Record<string, unknown>;
  const draft = content.narrationDraftTimeline as Array<Record<string, unknown>>;
  const timeline = content.narrationTimeline as Array<Record<string, unknown>>;

  assert.equal(draft[1]?.script, "修改后的第一句讲解");
  assert.equal(timeline[0]?.audioTaskId, "intro-audio");
  assert.equal(timeline[1]?.audioTaskId, "s_001-audio-new");
  assert.equal(timeline[1]?.script, "修改后的第一句讲解");
  assert.equal(content.narrationAudioStale, false);
});

test("确认计费后视频导学沿用原音色并只重合成当前句", async () => {
  const previousPublicBaseUrl = process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
  process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = "https://cdn.example.com";
  const stale = lessonRecord();
  const current = lessonRecord({
    content: {
      ...legacyNarrationContent(),
      narrationVoice: {
        providerVoiceId: "voice-2",
        voiceAssetId: null,
        modelAlias: "tts-default"
      }
    }
  });
  const updates: Array<Record<string, unknown>> = [];
  const synthesized: Array<Record<string, unknown>> = [];
  const cleanedTaskIds: string[][] = [];
  const ledgerEntries = new Map<string, Record<string, unknown>>();
  const wallet = {
    availableCredits: 500,
    frozenCredits: 0,
    totalConsumedCredits: 0
  };
  let transactionActive = false;
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    ledgerEntry: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        ledgerEntries.get(where.idempotencyKey) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        ledgerEntries.set(String(data.idempotencyKey), data);
        return data;
      }
    },
    videoGuideLesson: {
      findFirst: async () => current,
      update: async (input: { data: Record<string, unknown> }) => {
        updates.push(input);
        Object.assign(current, input.data);
        return current;
      }
    },
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => wallet,
      findUniqueOrThrow: async () => wallet,
      updateMany: async ({ where, data }: {
        where: { availableCredits?: { gte?: number } };
        data: {
          availableCredits?: { decrement?: number };
          frozenCredits?: { increment?: number };
        };
      }) => {
        const required = Number(where.availableCredits?.gte ?? 0);
        if (wallet.availableCredits < required) return { count: 0 };
        wallet.availableCredits -= Number(data.availableCredits?.decrement ?? 0);
        wallet.frozenCredits += Number(data.frozenCredits?.increment ?? 0);
        return { count: 1 };
      },
      update: async ({ data }: {
        data: {
          availableCredits?: { increment?: number; decrement?: number };
          frozenCredits?: { decrement?: number; increment?: number };
          totalConsumedCredits?: { increment?: number };
        };
      }) => {
        wallet.availableCredits += Number(data.availableCredits?.increment ?? 0);
        wallet.availableCredits -= Number(data.availableCredits?.decrement ?? 0);
        wallet.frozenCredits += Number(data.frozenCredits?.increment ?? 0);
        wallet.frozenCredits -= Number(data.frozenCredits?.decrement ?? 0);
        wallet.totalConsumedCredits += Number(data.totalConsumedCredits?.increment ?? 0);
        return wallet;
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => {
      assert.equal(transactionActive, false);
      transactionActive = true;
      try {
        return await callback(transaction);
      } finally {
        transactionActive = false;
      }
    },
    videoGuideLesson: {
      findFirst: async () => {
        if (!updateStarted) return current;
        topLevelReads += 1;
        return topLevelReads === 1 ? stale : current;
      }
    },
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => wallet
    }
  };
  const audioService = {
    cleanupExternalNarrationAudio: async (_userId: string, taskIds: string[]) => {
      cleanedTaskIds.push(taskIds);
      return { cleaned: taskIds.length };
    },
    findVerifiedVideoGuideNarrationTask: async () => null,
    synthesizeTtsForExternalBilling: async (_context: unknown, input: Record<string, unknown>) => {
      assert.equal(transactionActive, false);
      synthesized.push(input);
      return successfulNarrationAudioTask("edit-1");
    }
  };
  const service = new VideoGuideService(audioService as never, {} as never, courseReviewService as never);
  const originalAvailabilityCheck = Reflect.get(service, "assertLessonOperationAvailable").bind(service);
  let availabilityChecks = 0;
  Object.assign(service, {
    prisma,
    assertLessonOperationAvailable: (...args: unknown[]) => {
      availabilityChecks += 1;
      return originalAvailabilityCheck(...args);
    },
    narrationTtsRateLimiter: { acquire: async () => undefined }
  });
  const request = {
    nodes: narrationUpdates("修改后的第一句讲解"),
    billingRequestId: "edit-1"
  };
  let updateStarted = false;
  let topLevelReads = 0;
  try {
    const estimate = await service.estimateLessonNarrationScriptUpdate(accountSubject, current.id, request);

    updateStarted = true;
    await service.updateLessonNarrationScript(accountSubject, current.id, {
      ...request,
      billingConfirmed: true,
      billingRevision: estimate.revision
    });

    const content = current.content as Record<string, unknown>;
    const timeline = content.narrationTimeline as Array<Record<string, unknown>>;
    assert.equal(synthesized.length, 1);
    assert.equal(synthesized[0]?.text, "修改后的第一句讲解");
    assert.equal(synthesized[0]?.voice, "voice-2");
    assert.equal(timeline[0]?.audioTaskId, "intro-audio");
    assert.equal(timeline[1]?.audioTaskId, "s_001-audio-edit-1");
    assert.deepEqual(cleanedTaskIds, [["s_001-audio"]]);
    assert.equal(updates.length, 3);
    assert.equal(
      ((updates[0]?.data as Record<string, unknown>)?.content as Record<string, unknown>)
        ?.narrationScriptEditJob instanceof Object,
      true
    );
    assert.equal(
      ((updates[2]?.data as Record<string, unknown>)?.content as Record<string, unknown>)
        ?.narrationScriptEditJob,
      null
    );
    assert.equal(availabilityChecks, 4);
    assert.equal(wallet.availableCredits, 500 - estimate.estimatedCredits);
    assert.equal(wallet.frozenCredits, 0);
    assert.equal(wallet.totalConsumedCredits, estimate.estimatedCredits);
    assert.equal(
      ledgerEntries.get("video-guide-script-tts:user-1:lesson-1:edit-1:reserve")?.type,
      "RESERVE"
    );
    assert.equal(
      ledgerEntries.get("video-guide-script-tts:user-1:lesson-1:edit-1:consume")?.type,
      "CONSUME"
    );
  } finally {
    if (previousPublicBaseUrl === undefined) delete process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
    else process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = previousPublicBaseUrl;
  }
});

test("并发保存同一句时持久化租约会阻止第二个请求调用语音模型", async () => {
  const previousPublicBaseUrl = process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
  process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = "https://cdn.example.com";
  const current = lessonRecord();
  let synthesisCalls = 0;
  let releaseFirstTts: (() => void) | null = null;
  let notifyFirstTtsStarted: (() => void) | null = null;
  const firstTtsStarted = new Promise<void>((resolve) => {
    notifyFirstTtsStarted = resolve;
  });
  const firstTtsGate = new Promise<void>((resolve) => {
    releaseFirstTts = resolve;
  });
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    videoGuideLesson: {
      findFirst: async () => current,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(current, data);
        return current;
      }
    }
  };
  const prisma = {
    $transaction: (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
    videoGuideLesson: {
      findFirst: async () => current
    },
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => ({ availableCredits: 500 })
    }
  };
  const audioService = {
    cleanupExternalNarrationAudio: async () => ({ cleaned: 0 }),
    findVerifiedVideoGuideNarrationTask: async () => null,
    synthesizeTtsForExternalBilling: async (
      _context: unknown,
      input: { videoGuidePersistence: { generationId: string } }
    ) => {
      synthesisCalls += 1;
      if (synthesisCalls === 1) {
        notifyFirstTtsStarted?.();
        await firstTtsGate;
      }
      return successfulNarrationAudioTask(String(input.videoGuidePersistence.generationId));
    }
  };
  const service = new VideoGuideService(audioService as never, {} as never, courseReviewService as never);
  Object.assign(service, {
    prisma,
    reserveVideoGuideCredits: async () => undefined,
    settleVideoGuideCredits: async () => undefined,
    narrationTtsRateLimiter: { acquire: async () => undefined }
  });
  const nodes = narrationUpdates("并发修改后的第一句讲解");

  try {
    const estimate = await service.estimateLessonNarrationScriptUpdate(accountSubject, current.id, { nodes });
    const first = service.updateLessonNarrationScript(accountSubject, current.id, {
      nodes,
      billingConfirmed: true,
      billingRequestId: "concurrent-1",
      billingRevision: estimate.revision
    });
    await firstTtsStarted;
    const second = service.updateLessonNarrationScript(accountSubject, current.id, {
      nodes,
      billingConfirmed: true,
      billingRequestId: "concurrent-2",
      billingRevision: estimate.revision
    });
    await assert.rejects(() => second, /已有后台任务|正在执行/u);
    releaseFirstTts?.();

    await first;
    assert.equal(synthesisCalls, 1);
  } finally {
    releaseFirstTts?.();
    if (previousPublicBaseUrl === undefined) delete process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
    else process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = previousPublicBaseUrl;
  }
});

test("限速等待结束后租约失效时不会调用付费语音模型", async () => {
  const previousPublicBaseUrl = process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
  process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = "https://cdn.example.com";
  const current = lessonRecord();
  let synthesisCalls = 0;
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    videoGuideLesson: {
      findFirst: async () => current,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(current, data);
        return current;
      }
    }
  };
  const prisma = {
    $transaction: (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
    videoGuideLesson: {
      findFirst: async () => current
    },
    ...membershipWalletFixture(),
    wallet: {
      upsert: async () => ({ availableCredits: 500 })
    }
  };
  const audioService = {
    cleanupExternalNarrationAudioByPersistence: async () => ({ cleaned: 0 }),
    findVerifiedVideoGuideNarrationTask: async () => null,
    synthesizeTtsForExternalBilling: async () => {
      synthesisCalls += 1;
      return successfulNarrationAudioTask("expired-lease");
    }
  };
  const service = new VideoGuideService(audioService as never, {} as never, courseReviewService as never);
  Object.assign(service, {
    prisma,
    reserveVideoGuideCredits: async () => undefined,
    releaseVideoGuideCredits: async () => undefined,
    narrationTtsRateLimiter: {
      acquire: async () => {
        const content = current.content as Record<string, unknown>;
        const job = content.narrationScriptEditJob as Record<string, unknown>;
        current.content = {
          ...content,
          narrationScriptEditJob: {
            ...job,
            ownerId: "owner-recovered-elsewhere"
          }
        };
      }
    }
  });
  const nodes = narrationUpdates("等待限速后的第一句讲解");

  try {
    const estimate = await service.estimateLessonNarrationScriptUpdate(accountSubject, current.id, { nodes });

    await assert.rejects(
      () => service.updateLessonNarrationScript(accountSubject, current.id, {
        nodes,
        billingConfirmed: true,
        billingRequestId: "expired-lease",
        billingRevision: estimate.revision
      }),
      /任务已失效/u
    );
    assert.equal(synthesisCalls, 0);
  } finally {
    if (previousPublicBaseUrl === undefined) delete process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
    else process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = previousPublicBaseUrl;
  }
});

test("服务重启后会恢复已经上传成功的单句讲解语音", async () => {
  const current = lessonRecord({
    content: {
      ...legacyNarrationContent(),
      narrationScriptEditJob: {
        version: 1,
        status: "RUNNING",
        ownerId: "owner-recover-1",
        requestId: "recover-1",
        operationKey: "video-guide-script-tts:user-1:lesson-1:recover-1",
        estimatedCredits: 1,
        nodeId: "s_001",
        originalScript: draftTimeline[1]!.script,
        script: "恢复后的第一句讲解",
        revision: "revision-1",
        createdAt: "2026-08-19T00:00:00.000Z",
        updatedAt: "2026-08-19T00:00:00.000Z"
      }
    }
  });
  let finalizeCalls = 0;
  let failCalls = 0;
  const cleaned: string[][] = [];
  const recoveredTask = successfulNarrationAudioTask("recover-1");
  const audioService = {
    cleanupExternalNarrationAudio: async (_userId: string, ids: string[]) => {
      cleaned.push(ids);
      return { cleaned: ids.length };
    },
    findVerifiedVideoGuideNarrationTask: async () => recoveredTask
  };
  const service = new VideoGuideService(audioService as never, {} as never, courseReviewService as never);
  Object.assign(service, {
    failNarrationScriptEdit: async () => {
      failCalls += 1;
      return true;
    },
    finalizeNarrationScriptEdit: async () => {
      finalizeCalls += 1;
      return { previousTaskIds: ["s_001-audio"], saved: current };
    }
  });

  await Reflect.get(service, "recoverNarrationScriptEdit").call(service, current);

  assert.equal(finalizeCalls, 1);
  assert.equal(failCalls, 0);
  assert.deepEqual(cleaned, [["s_001-audio"]]);
});

test("服务重启后会释放没有生成结果的超时单句语音冻结点数", async () => {
  const current = lessonRecord({
    content: {
      ...legacyNarrationContent(),
      narrationScriptEditJob: {
        version: 1,
        status: "RUNNING",
        ownerId: "owner-recover-empty",
        requestId: "recover-empty",
        operationKey: "video-guide-script-tts:user-1:lesson-1:recover-empty",
        estimatedCredits: 1,
        nodeId: "s_001",
        originalScript: draftTimeline[1]!.script,
        script: "没有生成结果的讲解",
        revision: "revision-empty",
        createdAt: "2026-08-19T00:00:00.000Z",
        updatedAt: "2026-08-19T00:00:00.000Z"
      }
    }
  });
  let releasedOperationKey = "";
  let cleanupCalls = 0;
  const audioService = {
    cleanupExternalNarrationAudioByPersistence: async () => {
      cleanupCalls += 1;
      return { cleaned: 0 };
    },
    findVerifiedVideoGuideNarrationTask: async () => null
  };
  const service = new VideoGuideService(audioService as never, {} as never, courseReviewService as never);
  Object.assign(service, {
    failNarrationScriptEdit: async (_lessonId: string, _userId: string, job: { operationKey: string }) => {
      releasedOperationKey = job.operationKey;
      return true;
    }
  });

  await Reflect.get(service, "recoverNarrationScriptEdit").call(service, current);

  assert.equal(releasedOperationKey, "video-guide-script-tts:user-1:lesson-1:recover-empty");
  assert.equal(cleanupCalls, 1);
});

test("超时任务的外部清理失败后保留待清理状态并可由巡检重试", async () => {
  const storedJob = {
    version: 1 as const,
    status: "RUNNING" as const,
    ownerId: "owner-cleanup-retry",
    requestId: "cleanup-retry",
    operationKey: "video-guide-script-tts:user-1:lesson-1:cleanup-retry",
    estimatedCredits: 1,
    nodeId: "s_001",
    originalScript: draftTimeline[1]!.script,
    script: "等待清理的第一句讲解",
    revision: "revision-cleanup-retry",
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z"
  };
  const current = lessonRecord({
    content: {
      ...legacyNarrationContent(),
      narrationScriptEditJob: storedJob
    }
  });
  let cleanupShouldFail = true;
  let cleanupCalls = 0;
  let releaseCalls = 0;
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    videoGuideLesson: {
      findFirst: async () => current,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(current, data);
        return current;
      }
    }
  };
  const audioService = {
    cleanupExternalNarrationAudioByPersistence: async () => {
      cleanupCalls += 1;
      if (cleanupShouldFail) throw new Error("temporary cleanup failure");
      return { cleaned: 1 };
    },
    findVerifiedVideoGuideNarrationTask: async () => null
  };
  const service = new VideoGuideService(audioService as never, {} as never, courseReviewService as never);
  Object.assign(service, {
    prisma: {
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)
    },
    releaseVideoGuideCredits: async () => {
      releaseCalls += 1;
    }
  });

  await Reflect.get(service, "recoverNarrationScriptEdit").call(service, current);
  assert.equal(
    ((current.content as Record<string, unknown>).narrationScriptEditJob as Record<string, unknown>).status,
    "CLEANUP_PENDING"
  );
  assert.equal(cleanupCalls, 1);
  assert.equal(releaseCalls, 1);

  cleanupShouldFail = false;
  await Reflect.get(service, "recoverNarrationScriptEdit").call(service, current);
  assert.equal((current.content as Record<string, unknown>).narrationScriptEditJob, null);
  assert.equal(cleanupCalls, 2);
  assert.equal(releaseCalls, 1);
});

test("失败副本不能释放相同计费请求下其他执行实例持有的租约", async () => {
  const storedJob = {
    version: 1 as const,
    status: "RUNNING" as const,
    ownerId: "owner-active",
    requestId: "same-request",
    operationKey: "video-guide-script-tts:user-1:lesson-1:same-request",
    estimatedCredits: 1,
    nodeId: "s_001",
    originalScript: draftTimeline[1]!.script,
    script: "有效执行实例的讲解",
    revision: "revision-same",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z"
  };
  const current = lessonRecord({
    content: {
      ...legacyNarrationContent(),
      narrationScriptEditJob: storedJob
    }
  });
  let updateCalls = 0;
  let releaseCalls = 0;
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    videoGuideLesson: {
      findFirst: async () => current,
      update: async () => {
        updateCalls += 1;
        return current;
      }
    }
  };
  const service = new VideoGuideService({} as never, {} as never, courseReviewService as never);
  Object.assign(service, {
    prisma: {
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)
    },
    releaseVideoGuideCredits: async () => {
      releaseCalls += 1;
    }
  });

  const released = await Reflect.get(service, "failNarrationScriptEdit").call(
    service,
    current.id,
    current.userId,
    { ...storedJob, ownerId: "owner-failed-copy" }
  );

  assert.equal(released, false);
  assert.equal(updateCalls, 0);
  assert.equal(releaseCalls, 0);
});

test("视频导学单句语音计费请求不能重复使用", async () => {
  const service = new VideoGuideService({} as never, {} as never, courseReviewService as never);
  const reserve = Reflect.get(service, "reserveVideoGuideCredits").bind(service);
  const transaction = {
    $queryRaw: async () => [{ locked: 1 }],
    ledgerEntry: {
      findUnique: async () => ({ id: "existing-reserve" })
    }
  };

  await assert.rejects(
    () => reserve(transaction, {
      estimatedCredits: 1,
      note: "test",
      operationKey: "video-guide-script-tts:user-1:lesson-1:edit-1",
      rejectExisting: true,
      userId: "user-1"
    }),
    /请勿重复|重新确认/u
  );
});

test("视频导学零费率单句语音仍记录并拒绝重复计费确认", async () => {
  const service = new VideoGuideService({} as never, {} as never, courseReviewService as never);
  const reserve = Reflect.get(service, "reserveVideoGuideCredits").bind(service);
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
    operationKey: "video-guide-script-tts:user-1:lesson-1:free-edit-1",
    rejectExisting: true,
    userId: "user-1"
  };

  await reserve(transaction, input);
  assert.equal(marker?.amount, 0);
  await assert.rejects(() => reserve(transaction, input), /重新确认/u);
});

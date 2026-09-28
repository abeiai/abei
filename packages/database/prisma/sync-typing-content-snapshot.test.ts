import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPepIncrementTargetBaseline,
  buildTypingContentBootstrapPlan,
  buildTypingContentIncrementPlan,
  type SourceTypingContentLibrary
} from "./sync-typing-content-snapshot.js";

const sourceLibrary = {
  id: "library-source",
  slug: "hujiao-test-wordlist",
  title: "沪教版测试词汇",
  libraryType: "WORDLIST",
  language: "en-GB",
  description: "测试",
  sourceTextbookId: "textbook-source",
  sourceHash: "source-hash",
  status: "PUBLISHED",
  sortOrder: 20,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  sourceTextbook: { slug: "smartedu-test" },
  units: [{
    id: "unit-source",
    libraryId: "library-source",
    code: "unit-01",
    title: "Unit 1",
    sourcePageStart: 1,
    sourcePageEnd: 10,
    status: "PUBLISHED",
    mediaStatus: "READY",
    sortOrder: 1,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    items: [{
      id: "item-source",
      unitId: "unit-source",
      dictionaryEntryId: "dictionary-local-only",
      text: "happy",
      normalizedText: "happy",
      itemType: "WORD",
      translation: "开心的",
      britishPhonetic: "/ˈhæpi/",
      partOfSpeech: "adj.",
      isSpellingRequired: true,
      sourceOrder: 1,
      sourcePage: 2,
      sourceRaw: "happy /ˈhæpi/ adj. 开心的",
      reviewStatus: "VERIFIED",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      acceptedAnswers: [{
        id: "answer-source",
        itemId: "item-source",
        answer: "happy",
        normalizedAnswer: "happy",
        isPrimary: true,
        sortOrder: 0,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z")
      }],
      media: [{
        id: "media-source",
        itemId: "item-source",
        kind: "ILLUSTRATION",
        status: "READY",
        mediaAssetId: "asset-source",
        generatorProvider: "openai-imagegen",
        generatorModel: "built-in",
        voice: null,
        prompt: "prompt",
        inputHash: "sha256",
        errorMessage: null,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
        mediaAsset: {
          id: "asset-source",
          filename: "01-happy.png",
          originalName: "01-happy.png",
          mimeType: "image/png",
          size: 123,
          url: "https://cdn.xueleai.com/uploads/typing-content/hj-test/unit-01/images/01-happy.png",
          mediaType: "IMAGE",
          sourceType: "AI_GENERATED",
          storageProvider: "S3",
          createdByAdminId: null,
          createdByUserId: null,
          createdAt: new Date("2026-09-01T00:00:00.000Z")
        }
      }]
    }]
  }]
} satisfies SourceTypingContentLibrary;

const expectedLibraries = [{
  expectedUnitCounts: [1],
  librarySlug: sourceLibrary.slug
}];

test("生产内容表非空时拒绝执行首次内容快照同步", () => {
  assert.throws(
    () => buildTypingContentBootstrapPlan({
      createId: () => "asset-target",
      expectedLibraries,
      sourceLibraries: [sourceLibrary],
      targetLibraryCount: 1,
      targetTextbooks: [{ id: "textbook-target", slug: "smartedu-test" }]
    }),
    /生产内容库不是空库/u
  );
});

test("目标库缺少来源教材时拒绝同步", () => {
  assert.throws(
    () => buildTypingContentBootstrapPlan({
      createId: () => "asset-target",
      expectedLibraries,
      sourceLibraries: [sourceLibrary],
      targetLibraryCount: 0,
      targetTextbooks: []
    }),
    /缺少来源教材/u
  );
});

test("内容快照按教材 slug 重新绑定并移除仅本地存在的词典外键", () => {
  const plan = buildTypingContentBootstrapPlan({
    createId: () => "asset-target",
    expectedLibraries,
    sourceLibraries: [sourceLibrary],
    targetLibraryCount: 0,
    targetTextbooks: [{ id: "textbook-target", slug: "smartedu-test" }]
  });

  assert.equal(plan.libraries[0]?.sourceTextbookId, "textbook-target");
  assert.equal(plan.items[0]?.dictionaryEntryId, null);
  assert.equal(plan.mediaAssets[0]?.id, "asset-target");
  assert.equal(plan.media[0]?.mediaAssetId, "asset-target");
  assert.deepEqual(plan.summary, {
    answers: 1,
    items: 1,
    libraries: 1,
    media: 1,
    mediaAssets: 1,
    units: 1
  });
});

test("READY 媒体不是已上传的 S3 HTTPS 资源时拒绝同步", () => {
  const invalid = structuredClone(sourceLibrary);
  invalid.units[0]!.items[0]!.media[0]!.mediaAsset!.storageProvider = "LOCAL";
  invalid.units[0]!.items[0]!.media[0]!.mediaAsset!.url = "/uploads/typing-content/happy.png";

  assert.throws(
    () => buildTypingContentBootstrapPlan({
      createId: () => "asset-target",
      expectedLibraries,
      sourceLibraries: [invalid],
      targetLibraryCount: 0,
      targetTextbooks: [{ id: "textbook-target", slug: "smartedu-test" }]
    }),
    /必须恰有一个 READY S3 HTTPS 插图/u
  );
});

test("尚未上传 R2 的本地音频降级为待生成且不复制本地媒体资源", () => {
  const localAudio = structuredClone(sourceLibrary);
  const audio = structuredClone(localAudio.units[0]!.items[0]!.media[0]!);
  audio.id = "audio-source";
  audio.kind = "BRITISH_PRONUNCIATION";
  audio.voice = "loongemily_v3";
  audio.mediaAssetId = "audio-asset-source";
  audio.mediaAsset!.id = "audio-asset-source";
  audio.mediaAsset!.mediaType = "AUDIO";
  audio.mediaAsset!.mimeType = "audio/mpeg";
  audio.mediaAsset!.storageProvider = "LOCAL";
  audio.mediaAsset!.url = "/uploads/typing-content/happy.mp3";
  localAudio.units[0]!.items[0]!.media.push(audio);

  const plan = buildTypingContentBootstrapPlan({
    createId: () => "asset-target",
    expectedLibraries,
    sourceLibraries: [localAudio],
    targetLibraryCount: 0,
    targetTextbooks: [{ id: "textbook-target", slug: "smartedu-test" }]
  });

  const pendingAudio = plan.media.find((entry) => entry.kind === "BRITISH_PRONUNCIATION");
  assert.equal(pendingAudio?.status, "PENDING");
  assert.equal(pendingAudio?.mediaAssetId, null);
  assert.equal(pendingAudio?.errorMessage, null);
  assert.equal(plan.units[0]?.mediaStatus, "PENDING");
  assert.equal(plan.mediaAssets.length, 1);
});

test("源内容库集合出现遗漏或额外库时拒绝同步", () => {
  const extra = structuredClone(sourceLibrary);
  extra.id = "library-extra";
  extra.slug = "hujiao-extra-wordlist";

  assert.throws(
    () => buildTypingContentBootstrapPlan({
      createId: () => "asset-target",
      expectedLibraries,
      sourceLibraries: [sourceLibrary, extra],
      targetLibraryCount: 0,
      targetTextbooks: [{ id: "textbook-target", slug: "smartedu-test" }]
    }),
    /源内容库集合不完整/u
  );
});

test("源内容库的逐单元词条数量与固定快照不一致时拒绝同步", () => {
  assert.throws(
    () => buildTypingContentBootstrapPlan({
      createId: () => "asset-target",
      expectedLibraries: [{ expectedUnitCounts: [2], librarySlug: sourceLibrary.slug }],
      sourceLibraries: [sourceLibrary],
      targetLibraryCount: 0,
      targetTextbooks: [{ id: "textbook-target", slug: "smartedu-test" }]
    }),
    /词条数量/u
  );
});

test("任一词条缺少唯一 READY S3 HTTPS 插图时拒绝同步", () => {
  const missingImage = structuredClone(sourceLibrary);
  missingImage.units[0]!.items[0]!.media = [];

  assert.throws(
    () => buildTypingContentBootstrapPlan({
      createId: () => "asset-target",
      expectedLibraries,
      sourceLibraries: [missingImage],
      targetLibraryCount: 0,
      targetTextbooks: [{ id: "textbook-target", slug: "smartedu-test" }]
    }),
    /必须恰有一个 READY S3 HTTPS 插图/u
  );
});

test("增量同步允许目标库已有其他版别，但拒绝覆盖同 slug 内容库", () => {
  const plan = buildTypingContentIncrementPlan({
    createId: () => "asset-target",
    expectedLibraries,
    sourceLibraries: [sourceLibrary],
    targetLibrarySlugs: ["yilin-existing-wordlist"],
    targetTextbooks: [{ id: "textbook-target", slug: "smartedu-test" }]
  });

  assert.equal(plan.libraries.length, 1);
  assert.throws(() => buildTypingContentIncrementPlan({
    createId: () => "asset-target",
    expectedLibraries,
    sourceLibraries: [sourceLibrary],
    targetLibrarySlugs: [sourceLibrary.slug],
    targetTextbooks: [{ id: "textbook-target", slug: "smartedu-test" }]
  }), /已存在待增量同步内容库/u);
});

test("PEP 增量同步拒绝偏离既定公共内容库基线的目标库", () => {
  assert.doesNotThrow(() => assertPepIncrementTargetBaseline({
    answers: 11_049,
    items: 11_049,
    libraries: 46,
    media: 16_549,
    mediaAssets: 11_049,
    units: 322
  }));
  assert.throws(() => assertPepIncrementTargetBaseline({
    answers: 11_048,
    items: 11_048,
    libraries: 45,
    media: 16_548,
    mediaAssets: 11_048,
    units: 321
  }), /生产公共内容库基线不一致/u);
});

test("PEP 增量同步明确拒绝任何音频媒体记录", () => {
  const withAudio = structuredClone(sourceLibrary);
  const audio = structuredClone(withAudio.units[0]!.items[0]!.media[0]!);
  audio.id = "audio-source";
  audio.kind = "BRITISH_PRONUNCIATION";
  audio.mediaAssetId = null;
  audio.mediaAsset = null;
  audio.status = "PENDING";
  withAudio.units[0]!.items[0]!.media.push(audio);

  assert.throws(() => buildTypingContentIncrementPlan({
    createId: () => "asset-target",
    expectedLibraries,
    sourceLibraries: [withAudio],
    targetLibrarySlugs: ["yilin-existing-wordlist"],
    targetTextbooks: [{ id: "textbook-target", slug: "smartedu-test" }]
  }), /只能包含插图媒体/u);
});

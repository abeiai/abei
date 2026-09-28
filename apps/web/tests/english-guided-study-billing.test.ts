import assert from "node:assert/strict";
import test from "node:test";

import * as englishGuidedStudyApi from "../src/lib/english-guided-study-api.js";
import {
  estimateEnglishGuidedStudyAudio,
  estimateEnglishGuidedStudyMaterial,
  extractReadingGuideDocument,
  generateEnglishGuidedStudyPractice,
  updateEnglishGuidedStudyScript,
  type EnglishGuidedStudyBillingEstimate
} from "../src/lib/english-guided-study-api.js";
import { englishLevelGroups } from "../src/lib/english-guided-study-data.js";

const estimate: EnglishGuidedStudyBillingEstimate = {
  availableCredits: 100,
  enoughCredits: true,
  estimatedCredits: 36,
  items: [
    {
      code: "ENGLISH_GUIDED_STUDY_CONTENT",
      name: "英文带学讲稿生成",
      description: "生成讲稿和练习。",
      estimatedCredits: 36
    }
  ],
  operation: "ENGLISH_GUIDED_STUDY_CONTENT",
  requestId: "b".repeat(32),
  revision: "a".repeat(64),
  title: "生成英文带学讲稿"
};

test("英文带学讲稿预估请求携带完整学习设置", async () => {
  const calls: Array<{ body: string; path: string }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ path: String(input), body: String(init?.body ?? "") });
    return Response.json({ code: 0, message: "成功", data: estimate });
  };

  try {
    const result = await estimateEnglishGuidedStudyMaterial({
      title: "Hello",
      sourceType: "TEXT",
      sourceText: "Hello world.",
      levelStandardName: "基于所在学段年级",
      levelOptionLabel: "小学三四年级",
      aiLevel: "E1",
      explanationMode: "SENTENCE"
    });

    assert.equal(result.estimatedCredits, 36);
    assert.equal(calls[0]?.path, "/api/english-guided-study/materials/generate/estimate");
    assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
      title: "Hello",
      sourceType: "TEXT",
      sourceText: "Hello world.",
      levelStandardName: "基于所在学段年级",
      levelOptionLabel: "小学三四年级",
      aiLevel: "E1",
      explanationMode: "SENTENCE"
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("开卷导读预估携带导读时长和场景", async () => {
  const calls: Array<{ body: string; path: string }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ path: String(input), body: String(init?.body ?? "") });
    return Response.json({ code: 0, message: "成功", data: estimate });
  };

  try {
    await estimateEnglishGuidedStudyMaterial({
      scene: "DAODU",
      sourceType: "TEXT",
      sourceText: "一篇中文阅读材料",
      levelStandardName: "学段年级",
      levelOptionLabel: "七年级",
      aiLevel: "G7",
      explanationMode: "FREEFORM",
      durationMinutes: 5
    });

    assert.equal(calls[0]?.path, "/api/english-guided-study/materials/generate/estimate");
    assert.equal(JSON.parse(calls[0]?.body ?? "{}").scene, "DAODU");
    assert.equal(JSON.parse(calls[0]?.body ?? "{}").durationMinutes, 5);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("开卷导读主文档走独立的 10MB 文档提取路由", async () => {
  const calls: Array<{ body: unknown; method: string; path: string }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ path: String(input), method: String(init?.method ?? "GET"), body: init?.body });
    return Response.json({
      code: 0,
      message: "成功",
      data: { document: { name: "文章.txt", content: "文章正文", mimeType: "text/plain", sizeBytes: 12 } }
    });
  };

  try {
    const file = new File(["文章正文"], "文章.txt", { type: "text/plain" });
    const result = await extractReadingGuideDocument(file);

    assert.equal(result.document.content, "文章正文");
    assert.equal(calls[0]?.path, "/api/english-guided-study/documents/extract");
    assert.equal(calls[0]?.method, "POST");
    assert.ok(calls[0]?.body instanceof FormData);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("开卷导读同步练习携带用户选择的题目数", async () => {
  const calls: Array<{ body: string; path: string }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ path: String(input), body: String(init?.body ?? "") });
    return Response.json({ code: 40001, message: "测试在请求边界停止", data: null }, { status: 400 });
  };

  try {
    await assert.rejects(
      generateEnglishGuidedStudyPractice("daodu-1", { questionCount: 20 }),
      /测试在请求边界停止/
    );
    assert.equal(calls[0]?.path, "/api/english-guided-study/materials/daodu-1/practice");
    assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), { questionCount: 20 });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("英文带学语音预估携带当前音色和语速", async () => {
  const calls: Array<{ body: string; path: string }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({ path: String(input), body: String(init?.body ?? "") });
    return Response.json({
      code: 0,
      message: "成功",
      data: {
        ...estimate,
        operation: "ENGLISH_GUIDED_STUDY_TTS",
        title: "生成英文带学语音讲解"
      }
    });
  };

  try {
    await estimateEnglishGuidedStudyAudio("material-1", {
      billingRequestId: estimate.requestId,
      voice: "longanyang",
      speed: 1.2
    });

    assert.equal(
      calls[0]?.path,
      "/api/english-guided-study/materials/material-1/audio/estimate"
    );
    assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
      modelAlias: "tts-default",
      billingRequestId: estimate.requestId,
      voice: "longanyang",
      speed: 1.2,
      format: "mp3"
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("古诗文文稿修改请求提交到文稿更新路由", async () => {
  const calls: Array<{ body: string; method: string; path: string }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({
      path: String(input),
      method: String(init?.method ?? "GET"),
      body: String(init?.body ?? "")
    });
    return Response.json(
      { code: 40001, message: "测试在请求边界停止", data: null },
      { status: 400 }
    );
  };

  try {
    await assert.rejects(
      updateEnglishGuidedStudyScript("gushiwen-1", {
        targetType: "SENTENCE",
        sentenceId: "sentence-1",
        originalScript: "原古诗文讲解",
        script: "修改后的古诗文讲解"
      }),
      /测试在请求边界停止/
    );

    assert.deepEqual(calls, [
      {
        path: "/api/english-guided-study/materials/gushiwen-1/script",
        method: "PATCH",
        body: JSON.stringify({
          targetType: "SENTENCE",
          sentenceId: "sentence-1",
          originalScript: "原古诗文讲解",
          script: "修改后的古诗文讲解"
        })
      }
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("已有语音的古诗文文稿修改先请求本句语音费用预估", async () => {
  const estimateScriptUpdate = Reflect.get(
    englishGuidedStudyApi,
    "estimateEnglishGuidedStudyScriptUpdate"
  );

  assert.equal(typeof estimateScriptUpdate, "function");

  const calls: Array<{ body: string; method: string; path: string }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    calls.push({
      path: String(input),
      method: String(init?.method ?? "GET"),
      body: String(init?.body ?? "")
    });
    return Response.json({ code: 0, message: "成功", data: estimate });
  };

  try {
    const input = {
      targetType: "SENTENCE" as const,
      sentenceId: "sentence-1",
      originalScript: "原古诗文讲解",
      script: "修改后的古诗文讲解"
    };
    const result = await estimateScriptUpdate("gushiwen-1", input);

    assert.equal(result.revision, estimate.revision);
    assert.deepEqual(calls, [
      {
        path: "/api/english-guided-study/materials/gushiwen-1/script/estimate",
        method: "POST",
        body: JSON.stringify(input)
      }
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("剑桥英语等级完整映射九个产品显示项和 CEFR 等级", () => {
  const cambridge = englishLevelGroups.find((group) => group.standardName === "剑桥英语等级");

  assert.ok(cambridge);
  assert.deepEqual(cambridge.options, [
    { label: "Starters / Pre A1 启蒙", aiLevel: "Pre-A1", note: "Starters / Pre A1" },
    { label: "Movers / A1 基础", aiLevel: "A1", note: "Movers / A1" },
    { label: "Flyers / A2 高阶少儿", aiLevel: "A2", note: "Flyers / A2" },
    { label: "KET / A2 Key", aiLevel: "A2", note: "KET / A2 Key" },
    {
      label: "KET 青少版 / A2 Key for Schools",
      aiLevel: "A2",
      note: "KET for Schools / A2 Key for Schools"
    },
    { label: "PET / B1 Preliminary", aiLevel: "B1", note: "PET / B1 Preliminary" },
    {
      label: "PET 青少版 / B1 Preliminary for Schools",
      aiLevel: "B1",
      note: "PET for Schools / B1 Preliminary for Schools"
    },
    { label: "FCE / B2 First", aiLevel: "B2", note: "FCE / B2 First" },
    {
      label: "FCE 青少版 / B2 First for Schools",
      aiLevel: "B2",
      note: "FCE for Schools / B2 First for Schools"
    }
  ]);
});

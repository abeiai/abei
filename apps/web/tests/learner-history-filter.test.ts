import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { registerHooks } from "node:module";

interface HistoryFilterMocks {
  requestUrls: string[];
}

declare global {
  var __learnerHistoryFilterMocks: HistoryFilterMocks;
}

globalThis.__learnerHistoryFilterMocks = { requestUrls: [] };

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function cookies(){return {getAll(){return []}}}"
      };
    }
    if (specifier === "next/cache") {
      return { shortCircuit: true, url: "data:text/javascript,export function revalidatePath(){}" };
    }
    if (specifier === "next/navigation") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export function redirect(path){throw Object.assign(new Error('NEXT_REDIRECT'),{destination:path})}"
      };
    }
    if (specifier === "@/lib/ai-api") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function getAiTool(slug){return {id:'scenario-'+slug,slug,requiredCapabilities:['AUDIO','TTS'],defaultModelAlias:'tts-default'}};export function historyProfileQuery(value){return value?'?profile='+encodeURIComponent(value):''}"
      };
    }
    if (specifier === "@/lib/cosyvoice-v35-presets") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export function getCosyVoiceV35Preset(){return null};export function findPublishedCosyVoiceV35Preset(){return null}"
      };
    }
    return nextResolve(specifier, context);
  }
});

const aiApi = await import("../src/lib/ai-api.js");
const audioApi = await import("../src/lib/audio-api.js");
const videoGuideApi = await import("../src/lib/video-guide-api.js");
const originalFetch = globalThis.fetch;

const learners = [
  {
    id: "learner-active",
    nickname: "小明",
    grade: "GRADE_3",
    gradeLabel: "三年级",
    avatarUrl: null,
    status: "ACTIVE",
    deactivatedAt: null,
    createdAt: "2026-08-15T01:00:00.000Z",
    updatedAt: "2026-08-15T01:00:00.000Z"
  },
  {
    id: "learner-inactive",
    nickname: "小华",
    grade: "GRADE_5",
    gradeLabel: "五年级",
    avatarUrl: null,
    status: "INACTIVE",
    deactivatedAt: "2026-08-15T02:00:00.000Z",
    createdAt: "2026-08-15T01:00:00.000Z",
    updatedAt: "2026-08-15T02:00:00.000Z"
  }
];

beforeEach(() => {
  globalThis.__learnerHistoryFilterMocks = { requestUrls: [] };
  globalThis.fetch = async (input) => {
    globalThis.__learnerHistoryFilterMocks.requestUrls.push(String(input));
    return new Response(JSON.stringify({ code: 0, message: "成功", data: [] }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("历史筛选只接受 all、account 和属于账号的学习者", () => {
  assert.equal(aiApi.parseHistoryProfileFilter(undefined, learners), "all");
  assert.equal(aiApi.parseHistoryProfileFilter("all", learners), "all");
  assert.equal(aiApi.parseHistoryProfileFilter("account", learners), "account");
  assert.equal(
    aiApi.parseHistoryProfileFilter("learner:learner-active", learners),
    "learner:learner-active"
  );
  assert.equal(
    aiApi.parseHistoryProfileFilter("learner:learner-inactive", learners),
    "learner:learner-inactive"
  );
});

test("空值、重复、空白夹带、畸形和跨账号学习者筛选固定失败", () => {
  for (const value of [
    "",
    [],
    ["all"],
    ["all", "account"],
    " all",
    "all ",
    "learner:",
    "learner:learner-active ",
    "learner:foreign",
    "learner:learner-active:extra",
    "creator"
  ]) {
    assert.throws(
      () => aiApi.parseHistoryProfileFilter(value, learners),
      (error: Error) => error.message === "学习者筛选无效",
      JSON.stringify(value)
    );
  }
});

test("筛选控件把我的账号、有效学习者和已停用学习者分组", () => {
  assert.deepEqual(aiApi.historyProfileFilterGroups(learners), [
    {
      label: null,
      options: [
        { label: "全部", value: "all" },
        { label: "我的账号", value: "account" }
      ]
    },
    {
      label: "有效学习者",
      options: [{ label: "小明（三年级）", value: "learner:learner-active" }]
    },
    {
      label: "已停用学习者",
      options: [{ label: "小华（五年级）", value: "learner:learner-inactive" }]
    }
  ]);
});

test("AI、音频和视频导学历史都把同一筛选交给服务端 API", async () => {
  await aiApi.getAiTasks("account");
  await audioApi.getAudioTasks("learner:learner-active");
  await videoGuideApi.getUserVideoGuideLessons("all");

  assert.deepEqual(
    globalThis.__learnerHistoryFilterMocks.requestUrls.map((value) => new URL(value).pathname + new URL(value).search),
    [
      "/api/ai/tasks?profile=account",
      "/api/audio/tasks?profile=learner%3Alearner-active",
      "/api/video-guide/lessons?profile=all"
    ]
  );
});

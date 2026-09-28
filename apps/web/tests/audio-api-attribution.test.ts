import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { registerHooks } from "node:module";

interface AudioApiMocks {
  requests: Array<{ path: string; body: Record<string, unknown> }>;
  redirects: string[];
}

declare global {
  var __audioApiAttributionMocks: AudioApiMocks;
}

globalThis.__audioApiAttributionMocks = { requests: [], redirects: [] };

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
        url: "data:text/javascript,export function redirect(path){globalThis.__audioApiAttributionMocks.redirects.push(path);throw Object.assign(new Error('NEXT_REDIRECT'),{destination:path})}"
      };
    }
    if (specifier === "@/lib/ai-api") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export async function getAiTool(slug){return {id:'scenario-'+slug,slug,requiredCapabilities:['AUDIO','TTS'],defaultModelAlias:'tts-default'}}"
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

const audioApi = await import("../src/lib/audio-api.js");
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.__audioApiAttributionMocks = { requests: [], redirects: [] };
  globalThis.fetch = async (url, init) => {
    globalThis.__audioApiAttributionMocks.requests.push({
      path: new URL(String(url)).pathname,
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    });
    return new Response(JSON.stringify({
      code: 0,
      message: "成功",
      data: { id: "audio-task-1", status: "SUCCEEDED" }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test("动态语音工具和固定语音体验只发送服务端解析的场景 ID", async () => {
  const dynamic = new FormData();
  dynamic.set("scenarioSlug", "article-to-speech");
  dynamic.set("input", "动态工具语音");
  await assert.rejects(audioApi.createAudioToolTaskAction(dynamic), /NEXT_REDIRECT/);

  const dedicated = new FormData();
  dedicated.set("text", "专用语音工具");
  await assert.rejects(audioApi.createTtsAudioTaskAction(dedicated), /NEXT_REDIRECT/);

  const experience = new FormData();
  experience.set("text", "语音体验");
  await assert.rejects(audioApi.createExperienceTtsAudioTaskAction(experience), /NEXT_REDIRECT/);

  assert.deepEqual(
    globalThis.__audioApiAttributionMocks.requests.map((request) => ({
      path: request.path,
      scenarioId: request.body.scenarioId,
      learnerId: request.body.learnerId
    })),
    [
      { path: "/api/audio/tasks/tts", scenarioId: "scenario-article-to-speech", learnerId: undefined },
      { path: "/api/audio/tasks/tts", scenarioId: "scenario-article-to-speech", learnerId: undefined },
      { path: "/api/audio/tasks/tts", scenarioId: "scenario-article-to-speech", learnerId: undefined }
    ]
  );
});

test("语音体验忽略手动模型并由所选语音角色自动匹配", async () => {
  const formData = new FormData();
  formData.set("text", "语音体验");
  formData.set("modelAlias", "manual-model");
  formData.set("voiceChoice", "system:longanyang");

  await assert.rejects(audioApi.createExperienceTtsAudioTaskAction(formData), /NEXT_REDIRECT/);

  const request = globalThis.__audioApiAttributionMocks.requests.at(-1);
  assert.equal(request?.body.modelAlias, "tts-default");
  assert.equal(request?.body.voice, "longanyang");
});

test("语音体验生成成功后在结果页保留已选语音角色", async () => {
  const formData = new FormData();
  formData.set("text", "语音体验");
  formData.set("voiceChoice", "system:longanyang");

  await assert.rejects(audioApi.createExperienceTtsAudioTaskAction(formData), /NEXT_REDIRECT/);

  assert.equal(
    globalThis.__audioApiAttributionMocks.redirects.at(-1),
    "/voice?task=audio-task-1&created=1&voice=system%3Alonganyang"
  );
});

test("语音体验将网络连接失败转换为中文提示", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };

  const formData = new FormData();
  formData.set("text", "语音体验");
  formData.set("voiceChoice", "system:longanyang");

  await assert.rejects(audioApi.createExperienceTtsAudioTaskAction(formData), /NEXT_REDIRECT/);

  assert.equal(
    globalThis.__audioApiAttributionMocks.redirects.at(-1),
    "/voice?error=%E6%9C%8D%E5%8A%A1%E6%9A%82%E6%97%B6%E6%97%A0%E6%B3%95%E8%BF%9E%E6%8E%A5%EF%BC%8C%E8%AF%B7%E7%A8%8D%E5%90%8E%E9%87%8D%E8%AF%95"
  );
});

test("语音结果可以直接播放 Provider 返回的内嵌音频", () => {
  const url = audioApi.audioUrl({
    outputAudioAsset: null,
    providerPayload: {
      audioBase64: "SUQzdGVzdA==",
      audioMimeType: "audio/mpeg"
    }
  } as Parameters<typeof audioApi.audioUrl>[0]);

  assert.equal(url, "data:audio/mpeg;base64,SUQzdGVzdA==");
});

test("语音体验历史排除英文带学和其他语音场景任务", () => {
  const visibleTaskIds = [
    { id: "voice-experience", type: "TTS" as const, providerPayload: { source: "EXPERIENCE" as const } },
    {
      id: "english-guided-study",
      type: "TTS" as const,
      providerPayload: {
        source: "EXPERIENCE" as const,
        videoGuidePersistence: { namespace: "english-guided-study" }
      }
    },
    { id: "tool-tts", type: "TTS" as const, providerPayload: { source: "TOOL" as const } },
    {
      id: "legacy-english-guided-study",
      isVoiceExperience: false,
      type: "TTS" as const,
      providerPayload: { source: "EXPERIENCE" as const }
    },
    { id: "voice-design", type: "VOICE_DESIGN" as const, providerPayload: { source: "EXPERIENCE" as const } }
  ].filter((task) => audioApi.isVoiceExperienceTask(task)).map((task) => task.id);

  assert.deepEqual(visibleTaskIds, ["voice-experience"]);
});

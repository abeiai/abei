import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateVideoGenerationDto } from "../src/ai/dto/create-video-generation.dto.js";
import { providerPresets } from "../../../packages/database/prisma/ai-preset-data.js";
import { encryptSecret } from "@xueleai/database";

process.env.SECRET_ENCRYPTION_KEY ??= `test-secret-${randomUUID()}-${randomUUID()}`;
const modelName = "wan3.0-video-prime";
const baseUrl = "https://test-workspace.cn-beijing.maas.aliyuncs.com/api/v1";
type Reference = { name: string; type: string; mimeType: string; size: number; dataUrl: string };
type VideoClient = {
  callDashScopeVideoGeneration(input: {
    baseUrl: string; apiKeyEncrypted: string; modelName: string; prompt: string;
    ratio: string; resolution: string; duration: number; referenceFiles: Reference[]; promptRewrite?: boolean;
  }): Promise<unknown>;
  queryDashScopeVideoTask(input: { baseUrl: string; apiKeyEncrypted: string; taskId: string }): Promise<unknown>;
};

for (const resolution of ["480P", "720P", "1080P"]) {
  for (const withImages of [false, true]) {
    test(`Wan3.0 ${resolution} ${withImages ? "参考图" : "文本"}请求使用统一协议`, async context => {
      const { encryptSecret } = await import("@xueleai/database");
      const { AiService } = await import("../src/ai/ai.service.js");
      const service = Object.create(AiService.prototype) as VideoClient;
      const requests: Array<{ url: string; init: RequestInit }> = [];
      context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
        requests.push({ url: String(url), init });
        return Response.json({ output: { task_id: "wan3-task", task_status: "PENDING" } });
      });
      const referenceFiles = withImages ? Array.from({ length: 10 }, (_, i) => ({
        name: `${i}.png`, type: "image", mimeType: "image/png", size: 128, dataUrl: "data:image/png;base64,aW1hZ2U="
      })) : [];
      await service.callDashScopeVideoGeneration({ baseUrl, apiKeyEncrypted: encryptSecret("sk-unit-test"),
        modelName, prompt: "小熊在森林里散步", ratio: "21:9", resolution: `高清 ${resolution}`, duration: 30,
        referenceFiles, promptRewrite: false });
      assert.equal(requests.length, 1);
      const { url, init } = requests[0]!;
      assert.equal(url, `${new URL(baseUrl).origin}/api/v1/services/aigc/video-generation/video-synthesis`);
      assert.equal(new Headers(init.headers).get("X-DashScope-Async"), "enable");
      assert.equal(new Headers(init.headers).get("Authorization"), "Bearer sk-unit-test");
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body.input, { prompt: "小熊在森林里散步", ...(withImages ? {
        media: referenceFiles.map(item => ({ type: "reference_image", url: item.dataUrl }))
      } : {}) });
      assert.deepEqual(body.parameters, { resolution, ratio: "21:9", duration: 30,
        audio: true, watermark: false, prompt_extend: false });
    });
  }
}

test("Wan3.0 查询任务保留工作空间域名和成功结果", async context => {
  const { encryptSecret } = await import("@xueleai/database");
  const { AiService } = await import("../src/ai/ai.service.js");
  const result = { output: { task_id: "wan3-task", task_status: "SUCCEEDED", video_url: "https://example.com/video.mp4" },
    usage: { duration: 2, input_video_duration: 0, output_video_duration: 2 } };
  context.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(String(url), `${new URL(baseUrl).origin}/api/v1/tasks/wan3-task`);
    return Response.json(result);
  });
  const service = Object.create(AiService.prototype) as VideoClient;
  assert.deepEqual(await service.queryDashScopeVideoTask({ baseUrl, apiKeyEncrypted: encryptSecret("sk-unit-test"), taskId: "wan3-task" }), result);
});

test("视频 DTO 接受 Wan3.0 的 2–30 秒并拒绝越界时长", async () => {
  for (const duration of [2, 30, 1, 31, 2.5]) {
    const dto = plainToInstance(CreateVideoGenerationDto, { modelInstanceId: "wan3-model", prompt: "森林里的小熊", duration });
    const errors = await validate(dto);
    assert.equal(errors.length === 0, duration === 2 || duration === 30, `duration=${duration}`);
  }
});

test("Wan3.0 列表声明 10 张参考图、全部画幅、2–30 秒和三档分辨率，且可选用", async () => {
  const { AiService } = await import("../src/ai/ai.service.js");
  const model = primeModel();
  const service = Object.assign(Object.create(AiService.prototype), {
    prisma: { aiModelInstance: { findMany: async () => [model], findUnique: async () => model } }
  }) as AiService & { getVideoGenerationModel(id: string): Promise<unknown> };
  const [listed] = await service.listVideoModels();
  assert.equal(listed?.maxReferenceFiles, 10);
  assert.deepEqual(listed?.acceptedReferenceTypes, ["image/*"]);
  assert.deepEqual(listed?.supportedDurations, Array.from({ length: 29 }, (_, i) => i + 2));
  assert.deepEqual(listed?.supportedRatios, ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);
  assert.deepEqual(listed?.supportedResolutions, ["高清 480P", "高清 720P", "高清 1080P"]);
  assert.equal(listed?.defaultResolution, "高清 1080P");
  assert.equal(listed?.supportsPromptRewrite, true);
  assert.equal(await service.getVideoGenerationModel("wan3-model"), model);
});

for (const [resolution, expectedCredits] of [["480P", 225], ["720P", 450], ["1080P", 900]] as const) {
  test(`Wan3.0 ${resolution} 生成 5 秒按对应单价预扣 ${expectedCredits} 点`, async () => {
    const { AiService } = await import("../src/ai/ai.service.js");
    const stop = new Error("已捕获预扣点数");
    const service = Object.assign(Object.create(AiService.prototype), {
      ensureExperienceVideoScenario: async () => ({}), getVideoGenerationModel: async () => primeModel(),
      activeModelFromInstance: () => ({}),
      reserveCredits: async (...args: unknown[]) => { assert.equal(args[5], expectedCredits); throw stop; }
    }) as AiService;
    await assert.rejects(service.generateVideo({ mode: "ACCOUNT", userId: "unit-user", learnerId: null }, {
      modelInstanceId: "wan3-model", prompt: "小熊散步", resolution: `高清 ${resolution}`, duration: 5
    }), error => error === stop);
  });
}

function primeModel() {
  const preset = providerPresets.find(item => item.providerKey === "dashscope")?.models.find(item => item.providerModelName === modelName);
  assert.ok(preset, "必须包含 Wan3.0 视频预设");
  return { id: "wan3-model", displayName: preset.displayName, providerModelName: modelName, isEnabled: true,
    capabilityTags: [...preset.capabilityTags], aliases: [], inputPrice: "0", outputPrice: "0.45",
    pricingMode: "VIDEO_SECONDS", pricingUnit: "SECOND", pricingConfig: "pricingConfig" in preset ? preset.pricingConfig : null,
    providerInstance: { name: "阿里云", baseUrl, webSocketUrl: null, region: "CHINA", status: "ENABLED",
      credential: { apiKeyEncrypted: encryptSecret("sk-unit-test") }, providerPreset: { displayName: "阿里云百炼", adapterType: "OPENAI_COMPATIBLE", apiKeyEnvName: "DASHSCOPE_API_KEY", region: "CHINA" } } };
}

test("Wan3.0 缺少所选分辨率价格时不预扣或调用供应商", async () => {
  const { AiService } = await import("../src/ai/ai.service.js");
  const model = primeModel();
  const service = Object.assign(Object.create(AiService.prototype), {
    ensureExperienceVideoScenario: async () => ({}),
    getVideoGenerationModel: async () => ({ ...model, pricingConfig: { mode: "VIDEO_SECONDS", unit: "SECOND", currency: "CNY",
      variants: [{ resolution: "480P", taskType: "OTHER", input: 0, output: 0.45 }] } }),
    activeModelFromInstance: () => ({}), reserveCredits: () => { assert.fail("无有效价格不能预扣点数"); }
  }) as AiService;
  await assert.rejects(service.generateVideo({ mode: "ACCOUNT", userId: "unit-user", learnerId: null }, {
    modelInstanceId: "wan3-model", prompt: "小熊散步", resolution: "高清 1080P", duration: 5
  }), /尚未配置.*有效计费价格/);
});

test("Wan3.0 拒绝尚未接入的视频或音频参考，避免静默丢弃素材后扣费", async () => {
  const { AiService } = await import("../src/ai/ai.service.js");
  const service = Object.assign(Object.create(AiService.prototype), {
    ensureExperienceVideoScenario: async () => ({}), getVideoGenerationModel: async () => primeModel(),
    activeModelFromInstance: () => ({}), reserveCredits: () => { assert.fail("不应预扣点数"); }
  }) as AiService;
  for (const type of ["video", "audio"] as const) {
    await assert.rejects(service.generateVideo({ mode: "ACCOUNT", userId: "unit-user", learnerId: null }, {
      modelInstanceId: "wan3-model", prompt: "小熊散步", referenceFiles: [{ name: "reference", type,
        mimeType: `${type}/mp4`, size: 128, dataUrl: `data:${type}/mp4;base64,cmVm` }]
    }), /当前仅支持图片参考/);
  }
  await assert.rejects(service.generateVideo({ mode: "ACCOUNT", userId: "unit-user", learnerId: null }, {
    modelInstanceId: "wan3-model", prompt: "小熊散步", referenceFiles: [
      ...Array.from({ length: 10 }, (_, i) => ({ name: `${i}.png`, type: "image" as const,
        mimeType: "image/png", size: 128, dataUrl: "data:image/png;base64,aW1hZ2U=" })),
      { name: "audio.mp4", type: "audio", mimeType: "audio/mp4", size: 128, dataUrl: "data:audio/mp4;base64,cmVm" }
    ]
  }), /当前仅支持图片参考/);
});

for (const duration of [2, 30]) {
  test(`Wan3.0 生成入口保留 ${duration} 秒时长`, async () => {
    const { AiService } = await import("../src/ai/ai.service.js");
    const stop = new Error("已捕获时长");
    const service = Object.assign(Object.create(AiService.prototype), {
      ensureExperienceVideoScenario: async () => ({}), getVideoGenerationModel: async () => primeModel(),
      activeModelFromInstance: () => ({}), reserveCredits: async (...args: unknown[]) => {
        assert.equal((args[4] as { variables: { duration: string } }).variables.duration, String(duration)); throw stop;
      }
    }) as AiService;
    await assert.rejects(service.generateVideo({ mode: "ACCOUNT", userId: "unit-user", learnerId: null }, {
      modelInstanceId: "wan3-model", prompt: "小熊散步", duration
    }), error => error === stop);
  });
}

test("旧视频模型仍拒绝原 DTO 范围外的时长且不预扣点数", async () => {
  const { AiService } = await import("../src/ai/ai.service.js");
  for (const legacyName of ["wan2.7-t2v", "happyhorse-1.0-t2v", "MiniMax-H3"]) {
    const service = Object.assign(Object.create(AiService.prototype), {
      ensureExperienceVideoScenario: async () => ({}),
      getVideoGenerationModel: async () => ({ ...primeModel(), providerModelName: legacyName }),
      activeModelFromInstance: () => ({}), reserveCredits: () => { assert.fail("越界时长不能预扣点数"); }
    }) as AiService;
    for (const duration of [2, 30]) {
      await assert.rejects(service.generateVideo({ mode: "ACCOUNT", userId: "unit-user", learnerId: null }, {
        modelInstanceId: "legacy-model", prompt: "小熊散步", duration
      }), /视频时长应为 3–15 秒/);
    }
  }
});

test("Wan3.0 生成入口保留全部 10 张参考图", async () => {
  const { AiService } = await import("../src/ai/ai.service.js");
  const stop = new Error("已捕获参考图数量");
  const service = Object.assign(Object.create(AiService.prototype), {
    ensureExperienceVideoScenario: async () => ({}), getVideoGenerationModel: async () => primeModel(),
    activeModelFromInstance: () => ({}), reserveCredits: async (...args: unknown[]) => {
      assert.equal((args[4] as { variables: { referenceFileCount: string } }).variables.referenceFileCount, "10"); throw stop;
    }
  }) as AiService;
  await assert.rejects(service.generateVideo({ mode: "ACCOUNT", userId: "unit-user", learnerId: null }, {
    modelInstanceId: "wan3-model", prompt: "小熊散步", referenceFiles: Array.from({ length: 10 }, (_, i) => ({
      name: `${i}.png`, type: "image", mimeType: "image/png", size: 128, dataUrl: "data:image/png;base64,aW1hZ2U="
    }))
  }), error => error === stop);
});

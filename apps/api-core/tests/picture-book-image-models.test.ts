import "reflect-metadata";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { encryptSecret, getPrismaClient } from "@xueleai/database";
import { validate } from "class-validator";
import { AiService } from "../src/ai/ai.service.js";
import { AppException } from "../src/common/app-exception.js";
import { GeneratePictureBookImageDto } from "../src/picture-books/picture-book.dto.js";

process.env.SECRET_ENCRYPTION_KEY ??= "picture-book-image-test-key-at-least-32-characters";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test.after(async () => { await getPrismaClient().$disconnect(); });

const models = [
  { id: "other", providerKey: "volcengine_ark_image", modelName: "other", maxReferenceImages: 10 },
  { id: "backup", providerKey: "dashscope", modelName: "qwen-image-3.0", maxReferenceImages: 3 },
  { id: "primary", providerKey: "abeiai", modelName: "Qwen-Image-2.1", maxReferenceImages: 10 }
];
const subject = { userId: "user", mode: "ACCOUNT", learnerId: null };
const generation = { prompt: "小狐狸在森林里寻找秋天", width: 1536, height: 1024, count: 1,
  referenceImages: [{ name: "狐狸.png", type: "image", mimeType: "image/png", size: 3, dataUrl: "data:image/png;base64,AAAA" }] };
const result = { id: "result", images: [{ url: "https://cdn.abei.example/page.png" }] };

function createService() {
  const service = Object.create(AiService.prototype) as {
    listImageModels(): Promise<typeof models>;
    generateImage(subject: unknown, dto: Record<string, unknown>, options: { pictureBookR2: boolean }): Promise<unknown>;
    generatePictureBookImage(subject: unknown, dto: unknown): Promise<unknown>;
    callAbeiaiImageGeneration(input: unknown): Promise<unknown>;
  };
  service.listImageModels = async () => models;
  const attempts: Array<{ dto: Record<string, unknown>; options: { pictureBookR2: boolean } }> = [];
  let primaryFailure: (() => Promise<unknown>) | null = null;
  let backupFailure: Error | null = null;
  service.generateImage = async (_subject, dto, options) => {
    attempts.push({ dto, options });
    if (dto.modelInstanceId === "primary" && primaryFailure) await primaryFailure();
    if (dto.modelInstanceId === "backup" && backupFailure) throw backupFailure;
    return result;
  };
  const providerInput = { ...generation, baseUrl: "https://abeiai.example/v1", apiKeyEncrypted: encryptSecret("test-key"), modelName: "Qwen-Image-2.1" };
  return { service, attempts, failPrimary: (failure: () => Promise<unknown>) => { primaryFailure = failure; },
    failBackup: (error: Error) => { backupFailure = error; },
    callPrimary: (extra = {}) => service.callAbeiaiImageGeneration({ ...providerInput, ...extra }) };
}

test("绘本固定优先 Abei 2.1，忽略列表排序和旧页面模型选择", async () => {
  const { service, attempts } = createService();
  assert.deepEqual(await service.generatePictureBookImage(subject, { ...generation, modelInstanceId: "other" }), result);
  assert.deepEqual(attempts.map(item => item.dto.modelInstanceId), ["primary"]);
  assert.equal(attempts[0].options.pictureBookR2, true);
});

test("Abei 连接超时后只调用一次 Qwen Image 3.0，并保留提示词、比例、参考图和 R2 存储", async () => {
  const { service, attempts, failPrimary, callPrimary } = createService();
  globalThis.fetch = async () => { throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" }) }); };
  failPrimary(callPrimary);
  assert.deepEqual(await service.generatePictureBookImage(subject, generation), result);
  assert.deepEqual(attempts.map(item => item.dto.modelInstanceId), ["primary", "backup"]);
  assert.deepEqual(attempts[1].dto, { ...attempts[0].dto, modelInstanceId: "backup" });
  assert.deepEqual(attempts[1].options, { pictureBookR2: true });
});

test("Abei 请求超过期限会中止请求并切换备用模型", async () => {
  const { service, attempts, failPrimary, callPrimary } = createService();
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  failPrimary(() => callPrimary({ timeoutMs: 5 }));
  await service.generatePictureBookImage(subject, generation);
  assert.deepEqual(attempts.map(item => item.dto.modelInstanceId), ["primary", "backup"]);
});

test("Abei 上游网关超时后切换备用模型", async () => {
  const { service, attempts, failPrimary, callPrimary } = createService();
  globalThis.fetch = async () => new Response("gateway timeout", { status: 504 });
  failPrimary(callPrimary);
  await service.generatePictureBookImage(subject, generation);
  assert.deepEqual(attempts.map(item => item.dto.modelInstanceId), ["primary", "backup"]);
});

test("参数、点数和 R2 保存错误不会额外调用备用模型", async () => {
  for (const error of [new AppException(40001, "请求参数错误"), new AppException(40001, "点数不足"), new AppException(50201, "图片上传失败", 502)]) {
    const { service, attempts, failPrimary } = createService();
    failPrimary(async () => { throw error; });
    await assert.rejects(service.generatePictureBookImage(subject, generation), failure => failure === error);
    assert.deepEqual(attempts.map(item => item.dto.modelInstanceId), ["primary"]);
  }
});

test("Abei 拒绝请求不会被当作连接失败", async () => {
  const { service, attempts, failPrimary, callPrimary } = createService();
  globalThis.fetch = async () => Response.json({ error: { message: "forbidden" } }, { status: 403 });
  failPrimary(callPrimary);
  await assert.rejects(service.generatePictureBookImage(subject, generation));
  assert.deepEqual(attempts.map(item => item.dto.modelInstanceId), ["primary"]);
});

test("备用模型失败后返回错误，最多生成两次", async () => {
  const { service, attempts, failPrimary, failBackup, callPrimary } = createService();
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  failPrimary(callPrimary);
  failBackup(new AppException(50201, "备用图片生成接口调用失败", 502));
  await assert.rejects(service.generatePictureBookImage(subject, generation), /备用图片生成接口调用失败/);
  assert.deepEqual(attempts.map(item => item.dto.modelInstanceId), ["primary", "backup"]);
});

test("主模型未配置时明确提示，不随机使用其他供应商", async () => {
  const { service, attempts } = createService();
  service.listImageModels = async () => models.slice(0, 2);
  await assert.rejects(service.generatePictureBookImage(subject, generation), /Abei 2.1/);
  assert.equal(attempts.length, 0);
});

test("没有备用模型时保留主模型连接错误", async () => {
  const { service, attempts, failPrimary, callPrimary } = createService();
  service.listImageModels = async () => [models[2]];
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  failPrimary(callPrimary);
  await assert.rejects(service.generatePictureBookImage(subject, generation), /阿贝智能图片生成/);
  assert.deepEqual(attempts.map(item => item.dto.modelInstanceId), ["primary"]);
});

test("绘本生成请求可以省略模型，旧模型字段仍接受校验", async () => {
  assert.equal((await validate(new GeneratePictureBookImageDto())).length, 0);
  assert.equal((await validate(Object.assign(new GeneratePictureBookImageDto(), { modelInstanceId: "old-model" }))).length, 0);
  assert.ok((await validate(Object.assign(new GeneratePictureBookImageDto(), { modelInstanceId: 123 }))).length);
});

test("主模型失败释放预留点数后才调用备用，成功图片只结算一次并归档 R2", async () => {
  const { service } = createService();
  const events: string[] = [];
  const model = (id: string) => ({
    id, displayName: id === "primary" ? "Abei 2.1" : "Qwen Image 3.0",
    providerModelName: id === "primary" ? "Qwen-Image-2.1" : "qwen-image-3.0",
    capabilityTags: ["IMAGE_GENERATION", "IMAGE_INPUT", "REFERENCE_IMAGE"],
    inputPrice: 0, outputPrice: id === "primary" ? 0.02 : 0.18,
    pricingMode: "IMAGES", pricingUnit: "IMAGE",
    pricingConfig: { mode: "IMAGES", unit: "IMAGE", currency: "CNY", input: 0, output: id === "primary" ? 0.02 : 0.18 },
    providerInstance: { name: id, providerPreset: { providerKey: id === "primary" ? "abeiai" : "dashscope" } }
  });
  let task = 0;
  Object.assign(service, {
    generateImage: AiService.prototype.generateImage,
    prisma: { aiTask: { update: async () => ({}) } },
    getImageGenerationModel: async (id: string) => model(id),
    ensureExperienceImageScenario: async () => ({}),
    activeModelFromInstance: (m: { id: string }) => m,
    resolveModelRuntimeConfig: () => ({ baseUrl: "https://abeiai.example", apiKeyEncrypted: encryptSecret("test-key") }),
    reserveCredits: async (_attribution: unknown, _scenario: unknown, _prompt: unknown, m: { id: string }, _input: unknown, credits: number) => {
      events.push(`reserve:${m.id}:${credits}`);
      return { id: `task-${++task}`, createdAt: new Date() };
    },
    releaseFailedTask: async (id: string) => { events.push(`release:${id}`); },
    settleSuccessfulTask: async (id: string, _output: unknown, credits: number) => { events.push(`settle:${id}:${credits}`); },
    writeAiCallLog: async () => {},
    callDashScopeImageGeneration: async () => ({ output: { choices: [{ message: { content: [{ image: "https://provider.example/image.png" }] } }] } }),
    mediaService: {
      assertAbeiaiImageStorageReady: () => {},
      archivePictureBookGeneratedImage: async () => { events.push("archive:R2"); return result.images[0]; }
    }
  });
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  const output = await service.generatePictureBookImage(subject, generation) as { modelId: string; images: Array<{ url: string }> };
  assert.equal(output.modelId, "backup");
  assert.equal(output.images[0].url, result.images[0].url);
  assert.deepEqual(events, ["reserve:primary:2", "release:task-1", "reserve:backup:18", "archive:R2", "settle:task-2:18"]);
});


test("风格图固定占首位，角色参考图按主模型与备用模型各自容量截取", async () => {
  const { service, attempts, failPrimary, callPrimary } = createService();
  const references = Array.from({ length: 10 }, (_, index) => ({ name: index === 0 ? "风格参考图.png" : `角色${index}.png`, type: "image", mimeType: "image/png", size: 3, dataUrl: `data:image/png;base64,REF${index}` }));
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  failPrimary(callPrimary);
  await service.generatePictureBookImage(subject, { ...generation, referenceImages: references });
  assert.deepEqual(attempts.map(item => item.dto.modelInstanceId), ["primary", "backup"]);
  assert.deepEqual((attempts[0].dto.referenceImages as Array<{name:string}>).map(item => item.name), ["风格参考图.png", "角色1.png", "角色2.png", "角色3.png", "角色4.png", "角色5.png", "角色6.png", "角色7.png", "角色8.png", "角色9.png"]);
  assert.deepEqual((attempts[1].dto.referenceImages as Array<{name:string}>).map(item => item.name), ["风格参考图.png", "角色1.png", "角色2.png"]);
});

test("真实生成链路向 Abei 传递风格图和九个角色，备用链路只传风格图和两个角色", async () => {
  const { service } = createService();
  const references = Array.from({ length: 10 }, (_, index) => ({ name: index === 0 ? "风格参考图.png" : `角色${index}.png`, type: "image", mimeType: "image/png", size: 3, dataUrl: "data:image/png;base64,AAAA" }));
  const received: string[][] = [];
  const providerResponse = { data: [{ url: "https://provider.example/image.png" }] };
  let failPrimary = false;
  Object.assign(service, {
    generateImage: AiService.prototype.generateImage,
    prisma: { aiTask: { update: async () => ({}) } },
    getImageGenerationModel: async (id: string) => ({ id, displayName: id,
      providerModelName: id === "primary" ? "Qwen-Image-2.1" : "qwen-image-3.0",
      capabilityTags: ["IMAGE_GENERATION", "IMAGE_INPUT", "REFERENCE_IMAGE"],
      inputPrice: 0, outputPrice: 0.02, pricingMode: "IMAGES", pricingUnit: "IMAGE",
      pricingConfig: { mode: "IMAGES", unit: "IMAGE", currency: "CNY", input: 0, output: 0.02 },
      providerInstance: { providerPreset: { providerKey: id === "primary" ? "abeiai" : "dashscope" } } }),
    ensureExperienceImageScenario: async () => ({}), activeModelFromInstance: (model: unknown) => model,
    resolveModelRuntimeConfig: () => ({ baseUrl: "https://abeiai.example", apiKeyEncrypted: encryptSecret("test-key") }),
    reserveCredits: async () => ({ id: "task", createdAt: new Date() }),
    settleSuccessfulTask: async () => {}, releaseFailedTask: async () => {}, writeAiCallLog: async () => {},
    callAbeiaiImageGeneration: async (input: { referenceImages: Array<{ name: string }> }) => {
      received.push(input.referenceImages.map(image => image.name));
      if (failPrimary) {
        globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
        await AiService.prototype["callAbeiaiImageGeneration"].call(service, { ...generation, baseUrl: "https://abeiai.example", apiKeyEncrypted: encryptSecret("test-key"), modelName: "Qwen-Image-2.1" });
      }
      return providerResponse;
    },
    callDashScopeImageGeneration: async (input: { referenceImages: Array<{ name: string }> }) => { received.push(input.referenceImages.map(image => image.name)); return providerResponse; },
    mediaService: { assertAbeiaiImageStorageReady: () => {}, archivePictureBookGeneratedImage: async () => result.images[0] }
  });
  await service.generatePictureBookImage(subject, { ...generation, referenceImages: references });
  assert.deepEqual(received, [references.map(image => image.name)]);
  received.length = 0; failPrimary = true;
  await service.generatePictureBookImage(subject, { ...generation, referenceImages: references });
  assert.deepEqual(received, [references.map(image => image.name), references.slice(0, 3).map(image => image.name)]);
});

test("后台统一封面通过真实图片执行流程以零点预留和结算，普通生成仍要求有效价格", async () => {
  const service = Object.create(AiService.prototype) as { generateImage(subject: unknown, input: unknown, options: unknown): Promise<{ images: Array<{ url: string }> }> };
  const charged: number[] = [];
  const model = { id: "primary", displayName: "阿贝图片", providerModelName: "Qwen-Image-2.1", capabilityTags: ["image-edit", "image-generation"], inputPrice: 0, outputPrice: 0, pricingMode: "IMAGES", pricingUnit: "IMAGE", providerInstance: { name: "阿贝", providerPreset: { providerKey: "abeiai" } } };
  Object.assign(service, {
    prisma: { aiTask: { update: async () => ({}) } },
    ensureExperienceImageScenario: async () => ({ id: "image", costCredits: 0 }),
    getImageGenerationModel: async () => model,
    activeModelFromInstance: () => ({}),
    resolveModelRuntimeConfig: () => ({ apiKeyEncrypted: "configured", baseUrl: "https://model.test.invalid" }),
    mediaService: { assertAbeiaiImageStorageReady: () => {}, archivePictureBookGeneratedImage: async () => ({ url: "https://r.abeiai.com/picture-books/cover.png" }) },
    reserveCredits: async (_attribution: unknown, _scenario: unknown, _prompt: unknown, _active: unknown, _input: unknown, credits: number) => { charged.push(credits); return { id: "cover-task", createdAt: new Date("2026-10-10T00:00:00Z") }; },
    callAbeiaiImageGeneration: async () => ({ data: [{ url: "https://generated.test.invalid/image.png" }] }),
    writeAiCallLog: async () => {},
    settleSuccessfulTask: async (_id: string, _result: unknown, credits: number) => { charged.push(credits); }
  });
  const cover = await service.generateImage(subject, { ...generation, modelInstanceId: "primary" }, { pictureBookR2: true, fixedCredits: 0 });
  assert.equal(cover.images[0].url, "https://r.abeiai.com/picture-books/cover.png");
  assert.deepEqual(charged, [0, 0]);
  await assert.rejects(service.generateImage(subject, { ...generation, modelInstanceId: "primary" }, { pictureBookR2: true }), /配置有效的点数价格/);
});

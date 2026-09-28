import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { getPrismaClient } from "@xueleai/database";
import { AiService } from "../src/ai/ai.service.js";
import { AppException } from "../src/common/app-exception.js";

const models = [
  { id: "qwen", providerKey: "abeiai", modelName: "Qwen-Image-2.1", maxReferenceImages: 10 },
  { id: "doubao", providerKey: "volcengine_ark_image", modelName: "doubao-seedream-5-0-pro-260628", maxReferenceImages: 10 }
];
const photo = {
  sourceImage: { name: "学生.png", type: "image", mimeType: "image/png", size: 4, dataUrl: "data:image/png;base64,AAAA" },
  outfit: "CUSTOM",
  outfitImage: { name: "服装.png", type: "image", mimeType: "image/png", size: 4, dataUrl: "data:image/png;base64,BBBB" },
  widthMm: 26,
  heightMm: 32,
  backgroundColor: "#95c9eb"
};
const subject = { userId: "test-user", mode: "ACCOUNT", learnerId: null };

function createService() {
  const service = new AiService(undefined as never, undefined as never) as unknown as {
    listImageModels(): Promise<typeof models>;
    getImageGenerationModel(id: string): Promise<unknown>;
    generateImage(subject: unknown, input: { modelInstanceId: string; prompt: string }, options: { fixedCredits: number }): Promise<unknown>;
    generateStudentPhoto(subject: unknown, input: unknown): Promise<unknown>;
  };
  service.listImageModels = async () => models;
  service.getImageGenerationModel = async (id) => ({
    providerModelName: id === "doubao" ? "doubao-seedream-5-0-pro-260628" : "Qwen-Image-2.1",
    capabilityTags: ["IMAGE_GENERATION", "IMAGE_INPUT"],
    providerInstance: { providerPreset: { providerKey: id === "doubao" ? "volcengine_ark_image" : "abeiai" } }
  });
  return service;
}

test("学生证照优先 Qwen，供应商失败时自动改用 Doubao", async () => {
  const service = createService();
  const attempts: Array<{ modelId: string; prompt: string; credits: number }> = [];
  service.generateImage = async (_subject, input, options) => {
    attempts.push({ modelId: input.modelInstanceId, prompt: input.prompt, credits: options.fixedCredits });
    if (input.modelInstanceId === "qwen") throw new AppException(50201, "阿贝智能图片生成请求超时，请稍后重试。", 502);
    return { id: "success" };
  };
  assert.deepEqual(await service.generateStudentPhoto(subject, photo), { id: "success" });
  assert.deepEqual(attempts.map((attempt) => attempt.modelId), ["qwen", "doubao"]);
  assert.equal(attempts[0].prompt, attempts[1].prompt);
  assert.deepEqual(attempts.map((attempt) => attempt.credits), [50, 50]);
});

test("学生证照参数错误不会触发后备模型", async () => {
  const service = createService();
  const attempts: string[] = [];
  service.generateImage = async (_subject, input) => {
    attempts.push(input.modelInstanceId);
    throw new AppException(40001, "请求参数错误");
  };
  await assert.rejects(() => service.generateStudentPhoto(subject, photo), /请求参数错误/);
  assert.deepEqual(attempts, ["qwen"]);
});

test("证照保存失败不会误切到后备模型", async () => {
  const service = createService();
  const attempts: string[] = [];
  service.generateImage = async (_subject, input) => {
    attempts.push(input.modelInstanceId);
    throw new AppException(50201, "证照保存失败，请稍后重试", 502);
  };
  await assert.rejects(() => service.generateStudentPhoto(subject, photo), /证照保存失败/);
  assert.deepEqual(attempts, ["qwen"]);
});

test("Qwen 产物无法读取时自动改用 Doubao", async () => {
  const service = createService();
  const attempts: string[] = [];
  service.generateImage = async (_subject, input) => {
    attempts.push(input.modelInstanceId);
    if (input.modelInstanceId === "qwen") {
      throw new AppException(50201, "证照图片读取失败，请稍后重试", 502);
    }
    return { id: "success" };
  };
  assert.deepEqual(await service.generateStudentPhoto(subject, photo), { id: "success" });
  assert.deepEqual(attempts, ["qwen", "doubao"]);
});

test("Qwen 未配置时直接使用 Doubao", async () => {
  const service = createService();
  service.listImageModels = async () => [models[1]];
  const attempts: string[] = [];
  service.generateImage = async (_subject, input) => {
    attempts.push(input.modelInstanceId);
    return { id: "success" };
  };
  assert.deepEqual(await service.generateStudentPhoto(subject, photo), { id: "success" });
  assert.deepEqual(attempts, ["doubao"]);
});

test.after(async () => { await getPrismaClient().$disconnect(); });

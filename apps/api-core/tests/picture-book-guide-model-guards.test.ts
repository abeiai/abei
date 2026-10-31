import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { AiService } from "../src/ai/ai.service.js";

test("绘本识图在预留点数前拒绝收费场景和不支持图片的模型", async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:3606/test";
  const service = new AiService({} as never, {} as never);
  let credits = 1, tags = ["VISION"], reserved = false;
  Object.assign(service, {
    prisma: { aiScenario: { findFirst: async () => ({ id: "analysis", costCredits: credits }) } },
    preparePromptInput: async () => ({ renderedPrompt: "测试", variables: {}, knowledgeBaseId: null, knowledgeContext: "" }),
    getModelForScenario: async () => ({ capabilityTags: tags }),
    reserveCredits: async () => { reserved = true; throw new Error("不应预留点数"); }
  });
  const subject = { userId: "owner", mode: "ACCOUNT" as const, learnerId: null };
  const request = { scenarioId: "analysis", input: "测试" };
  await assert.rejects(service.createTaskStream(subject, request, () => {}, undefined, { requireFree: true, requireVision: true }), /收费配置/);
  assert.equal(reserved, false);
  credits = 0; tags = ["TEXT", "AUDIO_INPUT"];
  await assert.rejects(service.createTaskStream(subject, request, () => {}, undefined, { requireFree: true, requireVision: true }), /支持识图/);
  assert.equal(reserved, false);
  tags = ["TEXT", "IMAGE"];
  await assert.rejects(service.createTaskStream(subject, request, () => {}, undefined, { requireFree: true, requireVision: true }), /支持识图/);
  assert.equal(reserved, false);
});

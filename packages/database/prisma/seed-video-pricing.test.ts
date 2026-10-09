import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../generated/client/index.js";
import { seedAiPresets } from "./seed-ai-presets.js";

test("首次 seed 的 Wan3.0 视频实例继承三档计费且保留已有默认模型", async () => {
  const presets: Array<Record<string, unknown>> = [];
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    aiProviderPreset: { upsert: async ({ create }: { create: object }) => ({ ...create, id: "provider" }) },
    aiProviderInstance: {
      findFirst: async () => ({ id: "instance" }),
      upsert: async () => ({ id: "instance" }),
      findUnique: async () => ({ baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", region: "CHINA" })
    },
    aiModelPreset: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        const saved = { ...create, id: `preset-${presets.length}` }; presets.push(saved); return saved;
      },
      findMany: async () => presets
    },
    aiModelInstance: {
      updateMany: async () => ({ count: 0 }),
      upsert: async ({ create }: { create: Record<string, unknown> }) => { created.push(create); return { ...create, id: "model" }; }
    },
    aiModelAlias: { findUnique: async () => ({ modelInstanceId: "existing-default-model" }),
      upsert: async () => { assert.fail("已有默认模型不应被替换"); } }
  } as unknown as PrismaClient;
  await seedAiPresets(prisma, ["dashscope"]);
  const prime = created.find(item => item.providerModelName === "wan3.0-video-prime");
  assert.ok(prime);
  assert.equal(prime.pricingMode, "VIDEO_SECONDS");
  assert.equal(prime.pricingUnit, "SECOND");
  assert.equal(prime.inputPrice, "0");
  assert.equal(prime.outputPrice, "0.45");
  assert.deepEqual((prime.pricingConfig as { variants: Array<{ resolution: string; output: number }> }).variants.map(item => [item.resolution, item.output]),
    [["480P", 0.45], ["720P", 0.9], ["1080P", 1.8]]);
});

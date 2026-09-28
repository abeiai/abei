import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { encryptSecret, getPrismaClient } from "@xueleai/database";
import { AiService } from "../src/ai/ai.service.js";

process.env.SECRET_ENCRYPTION_KEY ??= `test-${randomUUID()}`;

test("阿贝智能 Qwen Image 2.1 支持最多十张参考图", async () => {
  const service = new AiService(undefined as never, undefined as never) as unknown as {
    callAbeiaiImageGeneration(input: unknown): Promise<unknown>;
  };
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (url, init) => {
    fetchCount += 1;
    requestUrl = String(url);
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ data: [{ url: "https://example.com/result.png" }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await service.callAbeiaiImageGeneration({
      baseUrl: "https://dmx04.sdts.net.cn/v1",
      apiKeyEncrypted: encryptSecret("test-api-key"),
      modelName: "Qwen-Image-2.1",
      prompt: "按第二张图更换服装",
      width: 768,
      height: 1024,
      count: 1,
      referenceImages: [
        { type: "image", mimeType: "image/png", size: 4, dataUrl: "data:image/png;base64,AAAA" },
        { type: "image", mimeType: "image/jpeg", size: 4, dataUrl: "data:image/jpeg;base64,BBBB" }
      ]
    });
    assert.equal(requestUrl, "https://dmx04.sdts.net.cn/v1/images/edits");
    assert.deepEqual(requestBody.image, ["data:image/png;base64,AAAA", "data:image/jpeg;base64,BBBB"]);
    assert.equal(requestBody.model, "Qwen-Image-2.1");
    const input = {
      baseUrl: "https://dmx04.sdts.net.cn/v1",
      apiKeyEncrypted: encryptSecret("test-api-key"),
      modelName: "Qwen-Image-2.1",
      prompt: "多参考图测试",
      width: 768,
      height: 1024,
      count: 1
    };
    const references = Array.from({ length: 10 }, (_, index) => ({
      type: "image", mimeType: "image/png", size: 4, dataUrl: `data:image/png;base64,REF${index}`
    }));
    await service.callAbeiaiImageGeneration({ ...input, referenceImages: references });
    assert.deepEqual(requestBody.image, references.map((reference) => reference.dataUrl));
    assert.equal(fetchCount, 2);
    await assert.rejects(() => service.callAbeiaiImageGeneration({
      ...input, referenceImages: [...references, references[0]]
    }), /最多支持十张有效参考图/);
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    await getPrismaClient().$disconnect();
  }
});

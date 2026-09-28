import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.SECRET_ENCRYPTION_KEY ??= `test-secret-${randomUUID()}-${randomUUID()}`;

test("阿贝智能图片按有无参考图分别调用生成与编辑接口", async () => {
  const { encryptSecret } = await import("@xueleai/database");
  const { AiService } = await import("../src/ai/ai.service.js");
  const service = new AiService(undefined as never, undefined as never) as unknown as {
    callAbeiaiImageGeneration(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return Response.json({ data: [{ url: "https://dmx04.sdts.net.cn/dl/images/test.png" }] });
  };

  try {
    const common = {
      baseUrl: "https://dmx04.sdts.net.cn/v1/",
      apiKeyEncrypted: encryptSecret("sk-test"),
      modelName: "Qwen-Image-2.1",
      prompt: "一张海报",
      width: 1024,
      height: 1024,
      count: 1
    };
    await service.callAbeiaiImageGeneration({ ...common, referenceImages: [] });
    await service.callAbeiaiImageGeneration({
      ...common,
      referenceImages: [{ name: "reference.png", type: "image", mimeType: "image/png", size: 3, dataUrl: "data:image/png;base64,AAAA" }]
    });
    assert.equal(requests[0]?.url, "https://dmx04.sdts.net.cn/v1/images/generations");
    assert.deepEqual(requests[0]?.body, {
      model: "Qwen-Image-2.1", prompt: "一张海报", n: 1, response_format: "url", size: "1024x1024"
    });
    assert.equal(requests[1]?.url, "https://dmx04.sdts.net.cn/v1/images/edits");
    assert.equal(requests[1]?.body.image, "data:image/png;base64,AAAA");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("阿贝智能临时图片只从可信地址归档到对象存储", async () => {
  const { MediaService } = await import("../src/media/media.service.js");
  const service = new MediaService() as unknown as {
    archiveAbeiaiGeneratedImage(userId: string, sourceUrl: string): Promise<{ url: string }>;
    assertAbeiaiImageStorageReady(requirePublicUrl?: boolean): void;
    persistFile(input: Record<string, unknown>): Promise<{ url: string }>;
  };
  const originalFetch = globalThis.fetch;
  let saved: Record<string, unknown> | null = null;
  service.persistFile = async (input) => {
    saved = input;
    return { url: "https://cdn.xueleai.com/uploads/abeiai.png" };
  };
  globalThis.fetch = async () => new Response(new Uint8Array([137, 80, 78, 71]), {
    headers: { "content-type": "image/png" }
  });

  try {
    await assert.rejects(
      service.archiveAbeiaiGeneratedImage("user-1", "https://dmx04.sdts.net.cn.evil.example/dl/images/test.png"),
      /生成图片地址无效/
    );
    const result = await service.archiveAbeiaiGeneratedImage("user-1", "https://dmx04.sdts.net.cn/dl/images/test.png");
    assert.equal(result.url, "https://cdn.xueleai.com/uploads/abeiai.png");
    assert.equal(saved?.storageProvider, "S3");
    assert.equal(saved?.createdByUserId, "user-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("阿贝智能生图在未配置 R2 时先拒绝调用", async () => {
  const { MediaService } = await import("../src/media/media.service.js");
  const service = new MediaService();
  const names = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BASE_URL", "VIDEO_GUIDE_R2_PUBLIC_BASE_URL"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.throws(() => service.assertAbeiaiImageStorageReady(), /请先配置 R2/);
    for (const name of names.slice(0, 4)) process.env[name] = "test-value";
    assert.throws(() => service.assertAbeiaiImageStorageReady(), /请先配置 R2/);
    assert.doesNotThrow(() => service.assertAbeiaiImageStorageReady(false));
    process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = "https://cdn.xueleai.com";
    assert.doesNotThrow(() => service.assertAbeiaiImageStorageReady());
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

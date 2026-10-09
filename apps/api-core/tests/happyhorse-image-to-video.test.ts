import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.SECRET_ENCRYPTION_KEY ??= `test-secret-${randomUUID()}-${randomUUID()}`;

for (const resolution of ["720P", "1080P"]) {
  test(`HappyHorse 1.0 图生视频传入首帧 URL 和所选 ${resolution} 分辨率`, async context => {
    const { encryptSecret } = await import("@xueleai/database");
    const { AiService } = await import("../src/ai/ai.service.js");
    const service = Object.create(AiService.prototype) as {
      callDashScopeVideoGeneration(input: {
        baseUrl: string; apiKeyEncrypted: string; modelName: string; prompt: string;
        ratio: string; resolution: string; duration: number;
        referenceFiles: Array<{ name: string; type: string; mimeType: string; size: number; dataUrl: string }>;
      }): Promise<unknown>;
    };
    const requests: RequestInit[] = [];
    context.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
      requests.push(options);
      return Response.json({ output: { task_id: "horse-task", task_status: "PENDING" } });
    });
    const firstFrame = "data:image/png;base64,Zmlyc3Q=";
    await service.callDashScopeVideoGeneration({
      baseUrl: "https://dashscope.aliyuncs.com/api/v1", apiKeyEncrypted: encryptSecret("sk-unit-test"),
      modelName: "happyhorse-1.0-i2v", prompt: "小熊分享绘本", ratio: "16:9", resolution: `高清 ${resolution}`, duration: 5,
      referenceFiles: [{ name: "first.png", type: "image", mimeType: "image/png", size: 128, dataUrl: firstFrame }]
    });
    assert.equal(requests.length, 1);
    const body = JSON.parse(String(requests[0]!.body));
    assert.deepEqual(body.input, { prompt: "小熊分享绘本", media: [{ type: "first_frame", url: firstFrame }] });
    assert.deepEqual(body.parameters, { resolution, duration: 5, watermark: false });
    assert.equal(new Headers(requests[0]!.headers).get("X-DashScope-Async"), "enable");
  });
}

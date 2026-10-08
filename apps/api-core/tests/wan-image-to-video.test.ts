import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.SECRET_ENCRYPTION_KEY ??= `test-secret-${randomUUID()}-${randomUUID()}`;

const cases = ["wan2.7-i2v", "wan2.7-i2v-2026-04-25"].flatMap(modelName => ["720P", "1080P"].map(resolution => ({ modelName, resolution })));
for (const { modelName, resolution } of cases) {
  test(`${modelName} 使用官方首尾帧字段和所选 ${resolution} 分辨率`, async context => {
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
      return Response.json({ output: { task_id: "provider-task", task_status: "PENDING" } });
    });
    const firstFrame = "data:image/png;base64,Zmlyc3Q=";
    const lastFrame = "data:image/png;base64,bGFzdA==";
    await service.callDashScopeVideoGeneration({
      baseUrl: "https://dashscope.aliyuncs.com/api/v1", apiKeyEncrypted: encryptSecret("sk-unit-test"),
      modelName, prompt: "小熊翻动绘本", ratio: "16:9", resolution: `高清 ${resolution}`, duration: 5,
      referenceFiles: [firstFrame, lastFrame].map((dataUrl, index) => ({ name: `${index}.png`, type: "image", mimeType: "image/png", size: 128, dataUrl }))
    });
    assert.equal(requests.length, 1);
    assert.equal(new Headers(requests[0]!.headers).get("X-DashScope-Async"), "enable");
    const body = JSON.parse(String(requests[0]!.body));
    assert.deepEqual(body.input, { prompt: "小熊翻动绘本", media: [
      { type: "first_frame", url: firstFrame }, { type: "last_frame", url: lastFrame }
    ] });
    assert.deepEqual(body.parameters, { resolution, duration: 5, watermark: false, prompt_extend: true });
  });
}

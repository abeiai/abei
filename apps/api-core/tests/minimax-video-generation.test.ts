import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.SECRET_ENCRYPTION_KEY ??= `test-secret-${randomUUID()}-${randomUUID()}`;

test("MiniMax H3s 视频客户端遵循官方异步协议并传递提示词重写参数", async () => {
  const { encryptSecret } = await import("@xueleai/database");
  const { AiService } = await import("../src/ai/ai.service.js");
  const service = new AiService(undefined as never, { assertInternalScenarioAuthorized: () => undefined } as never) as unknown as {
    callMiniMaxVideoGeneration(input: {
      baseUrl: string;
      apiKeyEncrypted: string;
      modelName: string;
      prompt: string;
      ratio: string;
      resolution: string;
      duration: number;
      referenceFiles: Array<{
        name: string;
        type: string;
        mimeType: string;
        size: number;
        dataUrl: string;
      }>;
      promptRewrite?: boolean;
    }): Promise<Record<string, unknown>>;
    queryMiniMaxVideoTask(input: {
      baseUrl: string;
      apiKeyEncrypted: string;
      taskId: string;
    }): Promise<Record<string, unknown>>;
  };
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    new Response(
      JSON.stringify({
        task_id: "h3s-task-1",
        request_id: "h3s-create-request"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ),
    new Response(
      JSON.stringify({
        task_id: "h3s-task-default-rewrite",
        request_id: "h3s-default-request"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ),
    new Response(
      JSON.stringify({
        task: {
          id: "h3s-task-1",
          model: "MiniMax-H3",
          status: "succeeded",
          content: {
            url: "https://cdn.example.com/h3s-video.mp4"
          },
          resolution: "768P",
          duration: 6,
          ratio: "adaptive"
        },
        request_id: "h3s-query-request"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ),
    new Response(
      JSON.stringify({
        task: {
          id: "h3s-task-without-url",
          model: "MiniMax-H3",
          status: "succeeded"
        },
        request_id: "h3s-query-without-url"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  ];

  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    const response = responses.shift();
    assert.ok(response, "不应产生额外的 MiniMax 请求");
    return response;
  };

  try {
    const apiKeyEncrypted = encryptSecret("sk-h3s-unit-test");
    const created = await service.callMiniMaxVideoGeneration({
      baseUrl: "https://video.example.com/",
      apiKeyEncrypted,
      modelName: "MiniMax-H3",
      prompt: "一名教师走进明亮的教室",
      ratio: "16:9",
      resolution: "高清 768P",
      duration: 6,
      referenceFiles: [
        {
          name: "first.png",
          type: "image",
          mimeType: "image/png",
          size: 128,
          dataUrl: "data:image/png;base64,Zmlyc3Q="
        }
      ],
      promptRewrite: true
    });
    await service.callMiniMaxVideoGeneration({
      baseUrl: "https://video.example.com/",
      apiKeyEncrypted,
      modelName: "MiniMax-H3",
      prompt: "海边日落",
      ratio: "21:9",
      resolution: "高清 480P",
      duration: 4,
      referenceFiles: []
    });
    const completed = await service.queryMiniMaxVideoTask({
      baseUrl: "https://video.example.com/",
      apiKeyEncrypted,
      taskId: "h3s-task-1"
    });
    const completedWithoutUrl = await service.queryMiniMaxVideoTask({
      baseUrl: "https://video.example.com/",
      apiKeyEncrypted,
      taskId: "h3s-task-without-url"
    });
    const createBody = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>;
    const defaultRewriteBody = JSON.parse(String(requests[1]?.init?.body)) as Record<string, unknown>;

    assert.equal(requests[0]?.url, "https://video.example.com/v2/video_generation");
    assert.equal(requests[0]?.init?.method, "POST");
    assert.equal(new Headers(requests[0]?.init?.headers).get("Authorization"), "Bearer sk-h3s-unit-test");
    assert.deepEqual(createBody, {
      model: "MiniMax-H3",
      content: [
        {
          type: "text",
          text: "一名教师走进明亮的教室"
        },
        {
          type: "image_url",
          image_url: {
            url: "data:image/png;base64,Zmlyc3Q="
          },
          role: "first_frame"
        }
      ],
      duration: 6,
      resolution: "768P",
      ratio: "adaptive",
      prompt_rewrite: true,
      aigc_watermark: false
    });
    assert.equal(defaultRewriteBody.prompt_rewrite, false);
    assert.equal(defaultRewriteBody.resolution, "480P");
    assert.equal(defaultRewriteBody.ratio, "21:9");
    assert.equal(requests[2]?.url, "https://video.example.com/v2/query/video_generation/h3s-task-1");
    assert.equal(requests[3]?.url, "https://video.example.com/v2/query/video_generation/h3s-task-without-url");
    assert.equal(requests.length, 4);
    assert.deepEqual(created, {
      request_id: "h3s-create-request",
      output: {
        task_id: "h3s-task-1",
        task_status: undefined,
        video_url: undefined,
        error_message: undefined
      }
    });
    assert.deepEqual(completed, {
      request_id: "h3s-query-request",
      output: {
        task_id: "h3s-task-1",
        task_status: "succeeded",
        video_url: "https://cdn.example.com/h3s-video.mp4",
        error_message: undefined
      }
    });
    assert.deepEqual(completedWithoutUrl, {
      request_id: "h3s-query-without-url",
      output: {
        task_id: "h3s-task-without-url",
        task_status: "failed",
        video_url: undefined,
        error_message: "视频任务已完成，但服务未返回视频地址。"
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

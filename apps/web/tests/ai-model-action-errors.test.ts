import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

declare global {
  var __aiModelRevalidations: string[];
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") {
      return { shortCircuit: true, url: "data:text/javascript,export async function cookies(){return {getAll(){return []}}}" };
    }
    if (specifier === "next/cache") {
      return { shortCircuit: true, url: "data:text/javascript,export function revalidatePath(path){globalThis.__aiModelRevalidations.push(path)}" };
    }
    return nextResolve(specifier, context);
  }
});

const api = await import("../src/lib/ai-admin-api.js");
const actions = [api.updateAiModelInstanceAction, api.enableAiModelPresetAction, api.createAiModelInstanceAction];
const priceError = "请先为 MiniMax H3s 配置 480P 和 768P 两档大于 0 的视频计费价格。";

beforeEach(() => { globalThis.__aiModelRevalidations = []; });

function modelForm() {
  const form = new FormData();
  form.set("providerId", "builtin-minimax-h3s-video");
  form.set("id", "builtin-minimax-h3s-model-instance");
  form.set("modelPresetId", "minimax-h3s");
  form.set("isEnabled", "on");
  return form;
}

for (const action of actions) {
  for (const status of [200, 400]) {
    test(`${action.name} 将价格校验失败作为可序列化结果返回（HTTP ${status}）`, async (context) => {
      context.mock.method(globalThis, "fetch", async () => Response.json({ code: 40001, message: priceError, data: null }, { status }));
      const result = await action(modelForm());
      assert.deepEqual(JSON.parse(JSON.stringify(result)), { error: priceError });
      assert.deepEqual(globalThis.__aiModelRevalidations, []);
    });
  }

  test(`${action.name} 成功后返回成功结果并刷新模型列表`, async (context) => {
    context.mock.method(globalThis, "fetch", async () => Response.json({ code: 0, message: "成功", data: { id: "model" } }));
    assert.deepEqual(await action(modelForm()), { error: null });
    assert.deepEqual(globalThis.__aiModelRevalidations, [
      "/admin/ai/providers", "/admin/ai/providers/builtin-minimax-h3s-video", "/admin/ai/model-aliases"
    ]);
  });
}

test("网络错误返回中文提示，隐藏底层异常详情", async (context) => {
  context.mock.method(globalThis, "fetch", async () => { throw new Error("connect ECONNREFUSED private-host"); });
  assert.deepEqual(await api.updateAiModelInstanceAction(modelForm()), { error: "模型操作失败，请稍后重试。" });
});

test("服务端内部错误返回中文提示，隐藏内部错误信息", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ code: 50001, message: "Prisma error: private data", data: null }, { status: 500 }));
  assert.deepEqual(await api.updateAiModelInstanceAction(modelForm()), { error: "模型操作失败，请稍后重试。" });
});

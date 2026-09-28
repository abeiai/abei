import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("后台 AI 场景管理使用七列表格并通过浮层配置和删除", async () => {
  const [page, manager] = await Promise.all([
    source("src/app/admin/ai-scenarios/page.tsx"),
    source("src/components/ai/admin-ai-scenario-manager.tsx")
  ]);

  assert.match(page, /<AdminAiScenarioManager/);
  for (const heading of ["场景名称", "英文名", "排序", "提示词配置", "模型配置", "是否启用", "操作"]) {
    assert.match(manager, new RegExp(`<TableHead[^>]*>${heading}</TableHead>`));
  }
  assert.match(manager, /type:\s*"prompt"/);
  assert.match(manager, /type:\s*"model"/);
  assert.match(manager, /checkAiScenarioDeleteAction/);
  assert.match(manager, /DeleteScenarioModal/);
  assert.match(manager, /deleteAiScenarioAction/);
  assert.match(manager, /确认删除/);
});

test("提示词配置浮层只提交 Prompt、Schema 和模板变量", async () => {
  const manager = await source("src/components/ai/admin-ai-scenario-manager.tsx");
  const promptModal = functionSource(manager, "PromptConfigModal");

  for (const field of ["promptTemplate", "inputSchema", "promptVariables"]) {
    assert.match(promptModal, new RegExp(`name=["']${field}["']`));
  }
  assert.match(promptModal, /updateAiScenarioPromptAction/);
});

test("模型配置浮层展示当前场景和模型绑定字段", async () => {
  const manager = await source("src/components/ai/admin-ai-scenario-manager.tsx");
  const modelModal = functionSource(manager, "ModelConfigModal");

  for (const field of [
    "name",
    "description",
    "costCredits",
    "defaultModelAlias",
    "fallbackModelAlias",
    "requiredCapabilities",
    "templateVersion",
    "defaultModelId",
    "fallbackModelId"
  ]) {
    assert.match(modelModal, new RegExp(`name=["']${field}["']`));
  }
  assert.match(modelModal, /value=\{scenario\.slug\}/);
  assert.match(modelModal, /readOnly/);
  assert.match(modelModal, /updateAiScenarioModelAction/);
});

test("场景配置按弹窗、排序和启用状态执行局部 PATCH", async () => {
  const actions = await source("src/lib/ai-admin-api.ts");

  for (const action of [
    "updateAiScenarioPromptAction",
    "updateAiScenarioModelAction",
    "updateAiScenarioSortAction",
    "updateAiScenarioEnabledAction"
  ]) {
    const contents = functionSource(actions, action);
    assert.match(contents, /method:\s*"PATCH"/);
    assert.match(contents, /revalidateAiScenarioPaths\(\)/);
  }
});

test("场景删除先检查关联，再调用删除接口", async () => {
  const actions = await source("src/lib/ai-admin-api.ts");
  const manager = await source("src/components/ai/admin-ai-scenario-manager.tsx");

  assert.match(actions, /export async function checkAiScenarioDeleteAction/);
  assert.match(actions, /\/admin\/ai-scenarios\/\$\{scenarioId\}\/delete-check/);
  assert.match(actions, /ok:\s*false/);
  const deleteAction = functionSource(actions, "deleteAiScenarioAction");
  assert.match(deleteAction, /method:\s*"DELETE"/);
  assert.match(deleteAction, /revalidateAiScenarioPaths\(\)/);
  assert.match(deleteAction, /ok:\s*false/);
  assert.match(manager, /state\.check\.canDelete/);
  assert.match(manager, /deleteCheckPendingRef\.current/);
  assert.match(manager, /disabled=\{isChecking\}/);
  assert.match(manager, /学习时长/);
  assert.match(manager, /每日学习汇总/);
});

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

function functionSource(contents: string, name: string) {
  const declarations = [`function ${name}`, `export async function ${name}`];
  const start = declarations.reduce((found, declaration) => {
    const index = contents.indexOf(declaration);
    return found === -1 || (index !== -1 && index < found) ? index : found;
  }, -1);
  assert.notEqual(start, -1, `缺少 ${name}`);
  const nextFunction = contents.indexOf("\nfunction ", start + 1);
  const nextExport = contents.indexOf("\nexport async function ", start + 1);
  const candidates = [nextFunction, nextExport].filter((index) => index !== -1);
  const end = candidates.length ? Math.min(...candidates) : contents.length;
  return contents.slice(start, end);
}

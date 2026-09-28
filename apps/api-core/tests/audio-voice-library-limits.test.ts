import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("用户音色库查询不截断平台音色或个人音色", () => {
  const source = readFileSync(new URL("../src/audio/audio.service.ts", import.meta.url), "utf8");
  const methodStart = source.indexOf("async listVoiceAssets(userId: string)");
  const methodEnd = source.indexOf("async listLearnerVoiceAssets(userId: string)", methodStart);
  const methodSource = source.slice(methodStart, methodEnd);

  assert.ok(methodStart >= 0);
  assert.ok(methodEnd > methodStart);
  assert.doesNotMatch(methodSource, /take:\s*100/u);
});

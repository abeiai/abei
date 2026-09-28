import assert from "node:assert/strict";
import test from "node:test";

import { AiService } from "../src/ai/ai.service.js";

test("英文带学全文片段变量不会被通用 2000 字符上限截断", () => {
  const service = Object.create(AiService.prototype) as {
    normalizeVariables(
      scenarioSlug: string,
      input: Record<string, unknown>
    ): Record<string, string>;
  };
  const sourceSegmentsJson = "x".repeat(256_001);
  const normalized = service.normalizeVariables("english-guided-study-material", {
    sourceSegmentsJson,
    referenceMaterialsJson: "r".repeat(180_000),
    titleAnalysisContext: "t".repeat(10_000),
    ordinaryVariable: "x".repeat(3_000)
  });

  assert.equal(normalized.sourceSegmentsJson?.length, 256_000);
  assert.equal(normalized.referenceMaterialsJson?.length, 180_000);
  assert.equal(normalized.titleAnalysisContext?.length, 10_000);
  assert.equal(normalized.ordinaryVariable?.length, 2_000);
});

test("英文带学练习文稿变量支持长文输入", () => {
  const service = new AiService({} as never, { assertInternalScenarioAuthorized: () => undefined } as never);
  const normalized = service.normalizeVariables("english-guided-study-practice", {
    lessonContentJson: "l".repeat(180_000),
    referenceMaterialsJson: "r".repeat(96_000)
  });

  assert.equal(normalized.lessonContentJson?.length, 180_000);
  assert.equal(normalized.referenceMaterialsJson?.length, 96_000);
});

test("英文带学节点文稿的全文句子不会被通用 2000 字符上限截断", () => {
  const service = Object.create(AiService.prototype) as {
    normalizeVariables(
      scenarioSlug: string,
      input: Record<string, unknown>
    ): Record<string, string>;
  };
  const sentencesJson = "x".repeat(18_452);
  const normalized = service.normalizeVariables("english-guided-study-narration-nodes", {
    sentencesJson
  });

  assert.equal(normalized.sentencesJson, sentencesJson);
});

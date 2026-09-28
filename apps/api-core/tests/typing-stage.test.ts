import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTypingStage,
  typingLibraryStageWhere,
  typingSessionTargetCount
} from "../src/typing/typing-stage.js";

test("显式大学学段不依赖教材来源即可参与筛选和展示", () => {
  assert.equal(resolveTypingStage("UNIVERSITY", null), "UNIVERSITY");
  assert.deepEqual(typingLibraryStageWhere("UNIVERSITY"), {
    educationStage: "UNIVERSITY"
  });
});

test("既有教材词库继续按教材学制映射学段", () => {
  assert.equal(resolveTypingStage(null, "PRIMARY_FIVE_FOUR"), "PRIMARY");
  assert.equal(resolveTypingStage(null, "JUNIOR"), "JUNIOR_HIGH");
  assert.equal(resolveTypingStage(null, "SENIOR"), "SENIOR_HIGH");
  assert.deepEqual(typingLibraryStageWhere("JUNIOR_HIGH"), {
    OR: [
      { educationStage: "JUNIOR_HIGH" },
      {
        educationStage: null,
        sourceTextbook: { educationType: { in: ["JUNIOR", "JUNIOR_FIVE_FOUR"] } }
      }
    ]
  });
});

test("显式学段优先且特殊教育仍可通过其他学段筛选", () => {
  assert.equal(resolveTypingStage("PRIMARY", "JUNIOR"), "PRIMARY");
  assert.deepEqual(typingLibraryStageWhere("OTHER"), {
    OR: [
      { educationStage: "OTHER" },
      { educationStage: null, sourceTextbook: { educationType: "SPECIAL_EDUCATION" } }
    ]
  });
});

test("大学整库请求强制分批，教材词库保持原有全册语义", () => {
  assert.equal(typingSessionTargetCount("UNIVERSITY", 0), 20);
  assert.equal(typingSessionTargetCount("UNIVERSITY", 30), 30);
  assert.equal(typingSessionTargetCount(null, 0), 0);
});

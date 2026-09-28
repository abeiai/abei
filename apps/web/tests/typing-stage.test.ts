import assert from "node:assert/strict";
import test from "node:test";

import {
  typingLibraryGradeLabel,
  typingLibraryPracticeDefaults,
  typingLibraryStageLabel,
  typingLibraryVersionLabel
} from "../src/lib/typing-stage.js";

test("大学学段和无教材考试词库使用面向用户的中文标签", () => {
  assert.equal(typingLibraryStageLabel("UNIVERSITY"), "大学");
  assert.equal(typingLibraryVersionLabel({ stage: "UNIVERSITY", version: null }), "大学英语考试");
  assert.equal(typingLibraryGradeLabel({ grade: null, stage: "UNIVERSITY" }), "大学");
  assert.deepEqual(typingLibraryPracticeDefaults("UNIVERSITY"), {
    initialSelection: "UNIT",
    requestScope: "NEW",
    targetItemCount: 20
  });
});

test("教材词库继续显示原有版本和年级", () => {
  assert.equal(typingLibraryStageLabel("JUNIOR_HIGH"), "初中");
  assert.equal(typingLibraryVersionLabel({ stage: "JUNIOR_HIGH", version: "译林版" }), "译林版");
  assert.equal(typingLibraryGradeLabel({ grade: "七年级", stage: "JUNIOR_HIGH" }), "七年级");
  assert.deepEqual(typingLibraryPracticeDefaults("JUNIOR_HIGH"), {
    initialSelection: "ALL",
    requestScope: "UNIT",
    targetItemCount: 0
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { typingVolumeLabel } from "../src/lib/typing-api.js";

test("内容库详情按教材卷册显示上册或下册", () => {
  assert.equal(typingVolumeLabel("FIRST_VOLUME"), "上册");
  assert.equal(typingVolumeLabel("SECOND_VOLUME"), "下册");
  assert.equal(typingVolumeLabel("FULL_VOLUME"), "全一册");
  assert.equal(typingVolumeLabel(null), "全册");
});

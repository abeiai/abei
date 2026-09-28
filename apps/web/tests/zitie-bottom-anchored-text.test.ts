import assert from "node:assert/strict";
import test from "node:test";

import { bottomAnchoredTextOffsetY } from "../src/components/zitie/bottom-anchored-text";

test("作文纸和横线纸默认文字基线位于底线上方", () => {
  const cellHeight = 28;
  const fontSize = 24;
  const baselineY = cellHeight * 2 / 3 + bottomAnchoredTextOffsetY(cellHeight, fontSize, 0);

  assert.ok(baselineY < cellHeight);
  assert.ok(cellHeight - baselineY >= fontSize * 0.15);
});

test("底线定位按格高限制字号并保留上下微调", () => {
  const baseOffset = bottomAnchoredTextOffsetY(28, 60, 0);

  assert.equal(bottomAnchoredTextOffsetY(28, 60, 3), baseOffset + 3);
  assert.ok(28 * 2 / 3 + baseOffset > 28 * 0.75);
});

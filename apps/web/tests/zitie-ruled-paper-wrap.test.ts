import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateRuledPaperTextWidth,
  ruledPaperSlotWidth,
  wrapRuledPaperLines,
  wrapRuledPaperText
} from "../src/components/zitie/ruled-paper-wrap";

test("横线纸全角空格按整格宽度参与换行", () => {
  assert.equal(estimateRuledPaperTextWidth("　", 28), 28);
  assert.deepEqual(wrapRuledPaperText("甲   乙", 300, 28), ["甲　乙"]);
});

test("横线纸默认隔行内容按可用宽度自动换行", () => {
  const defaultText =
    "　　夏天的飞鸟，飞到我的窗前唱歌，又飞去了。\n　　秋天的黄叶，它们没有什么可唱，只叹息一声，飞落在那里。";
  const maxWidth = 507;
  const lineLayouts = wrapRuledPaperLines(defaultText, maxWidth, 28);
  const lines = wrapRuledPaperText(defaultText, maxWidth, 28);

  assert.deepEqual(lines, [
    "　　夏天的飞鸟，飞到我的窗前唱歌，又飞",
    "去了。",
    "　　秋天的黄叶，它们没有什么可唱，只叹",
    "息一声，飞落在那里。"
  ]);
  assert.ok(lineLayouts.every((line) => line.fitWidth <= maxWidth));
});

test("横线纸用有限字间距收紧避免右侧浪费", () => {
  const fontSize = 24;
  const maxWidth = 507;
  const sentence = "　　夏天的飞鸟，飞到我的窗前唱歌，又飞去了。";
  const lines = wrapRuledPaperLines(sentence, maxWidth, fontSize);

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.text, sentence);
  assert.ok((lines[0]?.letterSpacing ?? 0) < 0);
  assert.ok((lines[0]?.letterSpacing ?? 0) >= -fontSize * 0.08);
  assert.ok((lines[0]?.fitWidth ?? Number.POSITIVE_INFINITY) <= maxWidth);
});

test("横线纸按有限压缩槽位排版并保证分配宽度不超过行框", () => {
  const maxWidth = 507;
  const fontSize = 28;
  const slotWidth = ruledPaperSlotWidth(fontSize);
  const slotsPerLine = Math.floor(maxWidth / slotWidth);
  const lines = wrapRuledPaperLines("秋".repeat(80), maxWidth, fontSize);

  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => line.slotCount <= slotsPerLine + 1));
  assert.ok(lines.every((line) => line.fitWidth <= maxWidth));
});

test("横线纸允许有限字距压缩但不越过行框", () => {
  const fontSize = 28;
  const maxWidth = fontSize * 18;
  const lines = wrapRuledPaperLines("字".repeat(19), maxWidth, fontSize);

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.text, "字".repeat(19));
  assert.ok((lines[0]?.letterSpacing ?? 0) < 0);
  assert.ok((lines[0]?.fitWidth ?? Number.POSITIVE_INFINITY) <= maxWidth);
});

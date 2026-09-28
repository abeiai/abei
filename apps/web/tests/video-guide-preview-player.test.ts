import assert from "node:assert/strict";
import test from "node:test";

import {
  findPreviewSubtitleCue,
  findPreviewSubtitleLoopRange
} from "../src/lib/video-guide-preview-player.js";

const cues = [
  { startSeconds: 0, endSeconds: 2.5, text: "First sentence." },
  { startSeconds: 2.5, endSeconds: 5, text: "Second sentence." }
];

test("预览字幕按真实时间轴匹配当前句", () => {
  assert.equal(findPreviewSubtitleCue(cues, 3)?.text, "Second sentence.");
  assert.equal(findPreviewSubtitleCue(cues, 5), null);
});

test("单句循环返回当前字幕句的起止时间", () => {
  assert.deepEqual(findPreviewSubtitleLoopRange(cues, 3), {
    startSeconds: 2.5,
    endSeconds: 5
  });
});

test("无效时间不会匹配字幕或循环范围", () => {
  assert.equal(findPreviewSubtitleCue(cues, Number.NaN), null);
  assert.equal(findPreviewSubtitleLoopRange([], 1), null);
});

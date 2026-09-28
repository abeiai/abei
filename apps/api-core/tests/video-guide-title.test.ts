import assert from "node:assert/strict";
import test from "node:test";

import {
  createVideoGuideLessonTitle,
  videoGuideLessonTitleMaxLength
} from "../src/video-guide/video-guide-title.js";

test("长媒体文件名生成课件标题时保留后缀并限制长度", () => {
  const title = createVideoGuideLessonTitle({
    mediaName: "Do You Know? Season 1 - 018 - Blood Pressure Monitor and Cast | Maddie's Do You Know? Series 1, Episode 8 - Full Episode.mp4"
  });

  assert.equal(Array.from(title).length, videoGuideLessonTitleMaxLength);
  assert.match(title, / 导学课件$/);
});

test("旧版前端提交的长标题在落库前安全截断", () => {
  const title = createVideoGuideLessonTitle({
    mediaName: "fallback.mp4",
    title: "课程".repeat(100)
  });

  assert.equal(Array.from(title).length, videoGuideLessonTitleMaxLength);
});

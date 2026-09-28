import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolCreatorId,
  creatorIdFromSegments,
  flashcardCreatorPath,
  mediaTutorCreatorPath,
  text2lessonCreatorPath
} from "../src/lib/tool-creator-routes.js";

test("三个制作台使用统一的 creator 记录地址", () => {
  assert.equal(mediaTutorCreatorPath("lesson id"), "/media-tutor/creator/lesson%20id");
  assert.equal(text2lessonCreatorPath("material id"), "/text2lesson/creator/material%20id");
  assert.equal(flashcardCreatorPath("deck id"), "/flashcard/creator/deck%20id");
});

test("新建制作地址使用二十四位十六进制临时 ID", () => {
  const first = createToolCreatorId();
  const second = createToolCreatorId();

  assert.match(first, /^[a-f0-9]{24}$/u);
  assert.match(second, /^[a-f0-9]{24}$/u);
  assert.notEqual(first, second);
});

test("闪卡路由只把 creator 后的单个参数识别为制作记录", () => {
  assert.equal(creatorIdFromSegments(["creator", "deck-1"]), "deck-1");
  assert.equal(creatorIdFromSegments(["deck-1"]), "");
  assert.equal(creatorIdFromSegments(["creator"]), "");
});

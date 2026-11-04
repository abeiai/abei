import assert from "node:assert/strict";
import test from "node:test";
import { pictureBookEnglishLevelLabel } from "../src/lib/picture-book-english-level.js";

test("来源分级正确展示，启蒙读者不是 Level 5", () => {
  assert.equal(pictureBookEnglishLevelLabel(1), "英语 Level 1");
  assert.equal(pictureBookEnglishLevelLabel(4), "英语 Level 4");
  assert.equal(pictureBookEnglishLevelLabel(5), "英语 Level 1（启蒙）");
  for (const value of [null, undefined, 0, 6, 1.5]) assert.equal(pictureBookEnglishLevelLabel(value), null);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  getTypingLibraryConfig,
  hujiaoTypingLibraryConfigList,
  pepTypingLibraryConfigList,
  typingLibraryConfigList
} from "./typing-library-config.js";

test("公共词汇库配置解析器兼容既有译林编号和带版别前缀的沪教编号", () => {
  assert.equal(getTypingLibraryConfig("7a").assetKey, "yl-7a");
  assert.equal(getTypingLibraryConfig("yl-xb4").assetKey, "yl-xb4");
  assert.equal(getTypingLibraryConfig("hj-54-6b").librarySlug, "hujiao-five-four-english-grade-6-second-volume-wordlist");
  assert.equal(hujiaoTypingLibraryConfigList.length, 25);
});

test("公共词汇库配置解析器支持 PEP 三至六年级上下册", () => {
  assert.equal(getTypingLibraryConfig("pep-3a").librarySlug, "pep-english-grade-3-first-volume-wordlist");
  assert.equal(getTypingLibraryConfig("pep-6b").assetKey, "pep-6b");
  assert.equal(pepTypingLibraryConfigList.length, 8);
});

test("平台公共词汇库固定为 54 套、368 个单元和 11973 条词汇", () => {
  assert.equal(typingLibraryConfigList.length, 54);
  assert.equal(
    typingLibraryConfigList.reduce((total, config) => total + config.expectedUnitCounts.length, 0),
    368
  );
  assert.equal(
    typingLibraryConfigList.reduce(
      (total, config) => total + config.expectedUnitCounts.reduce((sum, count) => sum + count, 0),
      0
    ),
    11_973
  );
});

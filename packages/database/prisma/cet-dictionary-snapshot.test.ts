import assert from "node:assert/strict";
import test from "node:test";

import { mergeCetDictionarySnapshot } from "./cet-dictionary-snapshot.js";

const abandon = {
  britishPhonetic: "əˈbændən",
  normalizedText: "abandon",
  partOfSpeech: "vt. / n.",
  sourceRaw: "ECDICT:gk cet4 ky",
  text: "abandon",
  translation: "vt. 放弃\nn. 放任"
};

test("CET 字典快照按规范词形合并并补齐考试标签", () => {
  const snapshot = mergeCetDictionarySnapshot({
    cet4: [abandon],
    cet6: [{ ...abandon, sourceRaw: "ECDICT:cet6 toefl" }]
  });

  assert.deepEqual(snapshot, [{
    normalizedWord: "abandon",
    partOfSpeech: "vt. / n.",
    phonetic: "əˈbændən",
    tag: "cet4 cet6 gk ky toefl",
    translation: "vt. 放弃\nn. 放任",
    word: "abandon"
  }]);
});

test("CET 字典快照拒绝同一规范词形出现冲突内容", () => {
  assert.throws(() => mergeCetDictionarySnapshot({
    cet4: [abandon],
    cet6: [{ ...abandon, translation: "不一致的释义" }]
  }), /内容不一致/u);
});

test("CET 字典快照拒绝媒体来源标记和空释义", () => {
  assert.throws(() => mergeCetDictionarySnapshot({
    cet4: [{ ...abandon, sourceRaw: "教材词汇" }],
    cet6: []
  }), /ECDICT 来源/u);
  assert.throws(() => mergeCetDictionarySnapshot({
    cet4: [{ ...abandon, translation: "" }],
    cet6: []
  }), /缺少释义/u);
});

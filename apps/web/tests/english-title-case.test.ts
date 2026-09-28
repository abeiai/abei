import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cycleEnglishTitleCase,
  formatEnglishTitleCase
} from "../src/lib/english-title-case";

test("英文标题支持句首、逐词和全部大写", () => {
  const title = "  the ROAD not-taken: don't stop  ";

  assert.equal(
    formatEnglishTitleCase(title, "SENTENCE"),
    "  The road not-taken: don't stop  "
  );
  assert.equal(
    formatEnglishTitleCase(title, "TITLE"),
    "  The Road Not-Taken: Don't Stop  "
  );
  assert.equal(
    formatEnglishTitleCase(title, "UPPER"),
    "  THE ROAD NOT-TAKEN: DON'T STOP  "
  );
});

test("标题式大小写保留标题中间的小词为小写", () => {
  assert.equal(
    formatEnglishTitleCase("the old man and the sea", "TITLE"),
    "The Old Man and the Sea"
  );
  assert.equal(
    formatEnglishTitleCase("a tale of two cities", "TITLE"),
    "A Tale of Two Cities"
  );
  assert.equal(
    formatEnglishTitleCase("from here to eternity", "TITLE"),
    "From Here to Eternity"
  );
  assert.equal(
    formatEnglishTitleCase("a walk out of time", "TITLE"),
    "A Walk out of Time"
  );
});

test("标题首尾的小词仍然首字母大写", () => {
  assert.equal(formatEnglishTitleCase("in and out", "TITLE"), "In and Out");
  assert.equal(formatEnglishTitleCase("this is the end of", "TITLE"), "This Is the End Of");
});

test("连字符标题中的小词遵循标题式大小写", () => {
  assert.equal(
    formatEnglishTitleCase("state-of-the-art learning", "TITLE"),
    "State-of-the-Art Learning"
  );
});

test("句首大写会跳过标题开头的数字和标点", () => {
  assert.equal(
    formatEnglishTitleCase("2026: a NEW beginning", "SENTENCE"),
    "2026: A new beginning"
  );
});

test("英文标题大小写转换支持带重音字母", () => {
  assert.equal(formatEnglishTitleCase("naïVE café", "TITLE"), "Naïve Café");
  assert.equal(
    formatEnglishTitleCase("ÉCOLE supérieure", "SENTENCE"),
    "École supérieure"
  );
});

test("标题按钮按三种格式循环并回到第一步", () => {
  const first = cycleEnglishTitleCase("the ROAD not taken", "SENTENCE");
  const second = cycleEnglishTitleCase(first.title, first.nextMode);
  const third = cycleEnglishTitleCase(second.title, second.nextMode);

  assert.deepEqual(first, {
    title: "The road not taken",
    nextMode: "TITLE"
  });
  assert.deepEqual(second, {
    title: "The Road Not Taken",
    nextMode: "UPPER"
  });
  assert.deepEqual(third, {
    title: "THE ROAD NOT TAKEN",
    nextMode: "SENTENCE"
  });
});

test("英文带学标题输入框内提供循环大小写按钮", () => {
  const source = readFileSync(
    new URL("../src/components/experience/english-guided-study-console.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /!isGushiwen\s*\?\s*\(/u);
  assert.match(source, /aria-label=\{nextTitleCaseOption\.label\}/u);
  assert.match(source, /onClick=\{cycleTitleCase\}/u);
  assert.match(source, /<CaseUpper className="size-4" \/>/u);
  assert.match(source, /setTitleCaseMode\("SENTENCE"\)/u);
});

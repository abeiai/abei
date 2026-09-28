import assert from "node:assert/strict";
import test from "node:test";

import {
  compareTypingAnswer,
  normalizeTypingSubmission,
  tokenizeTypingAnswer
} from "../src/typing/typing-answer.js";

test("规范化弯引号、全角标点和多余首尾空白但保留词间空格事实", () => {
  assert.equal(normalizeTypingSubmission("  I don’t know。  "), "I don't know.");
  assert.equal(normalizeTypingSubmission("good  morning"), "good  morning");
});

test("把连字符和撇号词保留为单个输入槽并把标点拆开", () => {
  assert.deepEqual(tokenizeTypingAnswer("I don't know my e-friend."), [
    { kind: "WORD", text: "I", length: 1 },
    { kind: "WORD", text: "don't", length: 5 },
    { kind: "WORD", text: "know", length: 4 },
    { kind: "WORD", text: "my", length: 2 },
    { kind: "WORD", text: "e-friend", length: 8 },
    { kind: "PUNCTUATION", text: ".", length: 1 }
  ]);
});

test("完全匹配返回正确且不产生错误位置", () => {
  assert.deepEqual(compareTypingAnswer("I don't know.", "I don’t know。"), {
    correct: true,
    errorTypes: [],
    firstErrorTokenIndex: null,
    tokenResults: [
      { tokenIndex: 0, status: "CORRECT", charErrors: [], characterErrors: [] },
      { tokenIndex: 1, status: "CORRECT", charErrors: [], characterErrors: [] },
      { tokenIndex: 2, status: "CORRECT", charErrors: [], characterErrors: [] }
    ]
  });
});

test("拼写错误返回首个错误词和缺失字符位置", () => {
  assert.deepEqual(compareTypingAnswer("good morning", "good moring"), {
    correct: false,
    errorTypes: ["SPELLING_ERROR"],
    firstErrorTokenIndex: 1,
    tokenResults: [
      { tokenIndex: 0, status: "CORRECT", charErrors: [], characterErrors: [] },
      {
        tokenIndex: 1,
        status: "SPELLING_ERROR",
        charErrors: [3],
        characterErrors: [{ type: "MISSING", expectedIndex: 3, actualIndex: 3 }]
      }
    ]
  });
});

test("替换、缺少和多余字母返回相对于用户输入的准确位置", () => {
  assert.deepEqual(compareTypingAnswer("greet", "great").tokenResults[0]?.characterErrors, [
    { type: "SUBSTITUTION", expectedIndex: 3, actualIndex: 3 }
  ]);
  assert.deepEqual(compareTypingAnswer("greet", "gret").tokenResults[0]?.characterErrors, [
    { type: "MISSING", expectedIndex: 3, actualIndex: 3 }
  ]);
  assert.deepEqual(compareTypingAnswer("greet", "greett").tokenResults[0]?.characterErrors, [
    { type: "EXTRA", expectedIndex: 5, actualIndex: 5 }
  ]);
});

test("大小写、标点、空格和不完整输入使用不同错误类型", () => {
  assert.deepEqual(compareTypingAnswer("Hello", "hello").errorTypes, ["CASE_ERROR"]);
  assert.deepEqual(compareTypingAnswer("Good morning.", "Good morning!").errorTypes, ["PUNCTUATION_ERROR"]);
  assert.deepEqual(compareTypingAnswer("good morning", "good  morning").errorTypes, ["WHITESPACE_ERROR"]);
  const incomplete = compareTypingAnswer("good morning", "good");
  assert.deepEqual(incomplete.errorTypes, ["INCOMPLETE"]);
  assert.equal(incomplete.firstErrorTokenIndex, 1);
});

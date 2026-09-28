import assert from "node:assert/strict";
import test from "node:test";

import * as typingPracticeState from "../src/lib/typing-practice-state.js";

const { initialTypingPracticeState, typingPracticeReducer } = typingPracticeState;

test("练习状态按加载、输入、校验、错误、答对和完成顺序变化", () => {
  const ready = typingPracticeReducer(initialTypingPracticeState, {
    type: "LOADED",
    sessionId: "session-1",
    questionId: "item-1"
  });
  const typing = typingPracticeReducer(ready, { type: "INPUT_CHANGED", answer: "helo" });
  const checking = typingPracticeReducer(typing, { type: "SUBMITTING" });
  const incorrect = typingPracticeReducer(checking, {
    type: "INCORRECT",
    result: [{ tokenIndex: 0, status: "SPELLING_ERROR", charErrors: [2] }]
  });
  const correct = typingPracticeReducer(incorrect, { type: "CORRECT" });
  const completed = typingPracticeReducer(correct, { type: "COMPLETED" });

  assert.equal(ready.phase, "READY");
  assert.equal(typing.phase, "TYPING");
  assert.equal(checking.phase, "CHECKING");
  assert.equal(incorrect.phase, "INCORRECT");
  assert.equal(correct.phase, "CORRECT_REVEAL");
  assert.equal(completed.phase, "COMPLETED");
});

test("加载新题时清空上一题输入和错误", () => {
  const old = {
    ...initialTypingPracticeState,
    phase: "INCORRECT" as const,
    answer: "wrong",
    result: [{ tokenIndex: 0, status: "SPELLING_ERROR", charErrors: [0] }]
  };
  const next = typingPracticeReducer(old, {
    type: "QUESTION_CHANGED",
    questionId: "item-2"
  });

  assert.equal(next.phase, "READY");
  assert.equal(next.answer, "");
  assert.deepEqual(next.result, []);
});

test("用户修改答案时立即清除上一轮错误位置", () => {
  const incorrect = {
    ...initialTypingPracticeState,
    phase: "INCORRECT" as const,
    result: [{
      tokenIndex: 0,
      status: "SPELLING_ERROR",
      charErrors: [3],
      characterErrors: [{ type: "SUBSTITUTION" as const, expectedIndex: 3, actualIndex: 3 }]
    }]
  };

  const typing = typingPracticeReducer(incorrect, { type: "INPUT_CHANGED", answer: "greet" });

  assert.equal(typing.phase, "TYPING");
  assert.deepEqual(typing.result, []);
});

test("字符反馈只标记错误字母，并在缺字位置插入匿名占位", () => {
  const buildTypingCharacterFeedback = (
    typingPracticeState as unknown as {
      buildTypingCharacterFeedback?: (
        value: string,
        errors: Array<{ type: string; expectedIndex: number; actualIndex: number }>
      ) => unknown;
    }
  ).buildTypingCharacterFeedback;
  assert.equal(typeof buildTypingCharacterFeedback, "function");
  assert.deepEqual(buildTypingCharacterFeedback!("great", [
    { type: "SUBSTITUTION", expectedIndex: 3, actualIndex: 3 }
  ]), [
    { character: "g", status: "CORRECT" },
    { character: "r", status: "CORRECT" },
    { character: "e", status: "CORRECT" },
    { character: "a", status: "INCORRECT" },
    { character: "t", status: "CORRECT" }
  ]);
  assert.deepEqual(buildTypingCharacterFeedback!("gret", [
    { type: "MISSING", expectedIndex: 3, actualIndex: 3 }
  ]), [
    { character: "g", status: "CORRECT" },
    { character: "r", status: "CORRECT" },
    { character: "e", status: "CORRECT" },
    { character: "□", status: "MISSING" },
    { character: "t", status: "CORRECT" }
  ]);
});

test("自动聚焦输入框并把光标放到现有内容末尾", () => {
  const focusTypingInput = (
    typingPracticeState as unknown as {
      focusTypingInput?: (input: {
        disabled: boolean;
        value: string;
        focus: (options?: { preventScroll?: boolean }) => void;
        setSelectionRange: (start: number, end: number) => void;
      } | null) => boolean;
    }
  ).focusTypingInput;
  assert.equal(typeof focusTypingInput, "function");

  let focused = false;
  let selection: [number, number] | null = null;
  const result = focusTypingInput!({
    disabled: false,
    value: "great",
    focus: () => { focused = true; },
    setSelectionRange: (start, end) => { selection = [start, end]; }
  });

  assert.equal(result, true);
  assert.equal(focused, true);
  assert.deepEqual(selection, [5, 5]);
});

test("组装小学词条答案时保留括号和省略号前的教材空格", () => {
  const assembleTypingAnswer = (
    typingPracticeState as unknown as {
      assembleTypingAnswer?: (
        slots: Array<{ kind: "WORD"; length: number } | { kind: "PUNCTUATION"; text: string }>,
        words: string[]
      ) => string;
    }
  ).assembleTypingAnswer;
  assert.equal(typeof assembleTypingAnswer, "function");

  assert.equal(assembleTypingAnswer!([
    { kind: "WORD", length: 5 },
    { kind: "PUNCTUATION", text: "(" },
    { kind: "WORD", length: 2 },
    { kind: "PUNCTUATION", text: "." },
    { kind: "WORD", length: 8 },
    { kind: "PUNCTUATION", text: ")" }
  ], ["child", "pl", "children"]), "child (pl. children)");

  assert.equal(assembleTypingAnswer!([
    { kind: "WORD", length: 4 },
    { kind: "WORD", length: 6 },
    { kind: "WORD", length: 2 },
    { kind: "PUNCTUATION", text: "...?" }
  ], ["What", "colour", "is"]), "What colour is ...?");
});

test("英文输入允许词汇、数字、半角符号，拒绝中文和混合粘贴", () => {
  for (const value of ["", "hello", "don't", "well-known", "café", "Unit 2", "good morning"]) {
    assert.equal(typingPracticeState.isEnglishTypingInput(value), true);
  }
  for (const value of ["你好", "hello你好", "ｈｅｌｌｏ。", "hello😀"]) {
    assert.equal(typingPracticeState.isEnglishTypingInput(value), false);
  }
});

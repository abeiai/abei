import assert from "node:assert/strict";
import test from "node:test";

import { presentTypingQuestion } from "../src/typing/typing-presenter.js";

const question = {
  id: "item-1",
  version: "hash-1",
  translation: "早上好。",
  answerSnapshot: "Good morning.",
  britishPhonetic: "/ɡʊd ˈmɔːnɪŋ/",
  partOfSpeech: "phrase",
  imageUrl: "/uploads/typing/good-morning.webp",
  audioUrl: "/uploads/typing/good-morning.mp3",
  hintLevel: 0,
  lastErrorTokenIndex: null
};

test("答对前题目只返回中文、媒体和不可逆槽位，不返回答案或音标", () => {
  const result = presentTypingQuestion({ ...question, revealed: false });
  const serialized = JSON.stringify(result);

  assert.deepEqual(result.slots, [
    { kind: "WORD", length: 4 },
    { kind: "WORD", length: 7 },
    { kind: "PUNCTUATION", text: "." }
  ]);
  assert.equal(serialized.includes("Good morning"), false);
  assert.equal(serialized.includes("mɔːnɪŋ"), false);
  assert.equal("explanation" in result, false);
});

test("一级和二级提示只逐步揭示允许的信息", () => {
  const levelOne = presentTypingQuestion({ ...question, revealed: false, hintLevel: 1 });
  const levelTwo = presentTypingQuestion({
    ...question,
    revealed: false,
    hintLevel: 2,
    lastErrorTokenIndex: 1
  });

  assert.deepEqual(levelOne.hint, {
    level: 1,
    words: [
      { tokenIndex: 0, initial: "G", length: 4 },
      { tokenIndex: 1, initial: "m", length: 7 }
    ]
  });
  assert.deepEqual(levelTwo.hint, {
    level: 2,
    tokenIndex: 1,
    word: "morning"
  });
  assert.equal(JSON.stringify(levelTwo).includes("Good morning"), false);
});

test("答对或三级提示后才返回完整讲解", () => {
  const result = presentTypingQuestion({ ...question, revealed: true });

  assert.deepEqual(result.explanation, {
    text: "Good morning.",
    britishPhonetic: "/ɡʊd ˈmɔːnɪŋ/",
    partOfSpeech: "phrase",
    translation: "早上好。",
    tokens: [
      { kind: "WORD", text: "Good", length: 4 },
      { kind: "WORD", text: "morning", length: 7 },
      { kind: "PUNCTUATION", text: ".", length: 1 }
    ]
  });
});

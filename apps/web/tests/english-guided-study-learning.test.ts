import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOriginalDocumentLayout,
  expandLegacyStudySentences,
  globalTimeForNode,
  nextSentenceNodeIndex,
  nextPracticeQuestionIndex,
  nodePositionAtGlobalTime,
  practiceResult
} from "../src/lib/english-guided-study-learning.js";
import * as englishGuidedStudyLearning from "../src/lib/english-guided-study-learning.js";

test("旧英文带学材料按语法句展开并按文本长度分配原时间轴", () => {
  const sentences = expandLegacyStudySentences(
    [{
      id: "s1",
      text: "A smile shows happiness. People smile for many reasons.",
      explanation: "讲解",
      grammarFocus: "语法",
      script: "文稿",
      startSeconds: 10,
      endSeconds: 30,
      points: [
        {
          id: "p1",
          term: "many reasons",
          meaning: "许多原因",
          note: "短语",
          startSeconds: 24,
          endSeconds: 27
        }
      ]
    }],
    [{
      sentenceId: "s1",
      startSeconds: 5,
      endSeconds: 25,
      terms: [{
        pointId: "p1",
        term: "many reasons",
        startSeconds: 19,
        endSeconds: 22
      }]
    }]
  );

  assert.equal(sentences.length, 2);
  assert.deepEqual(sentences.map((sentence) => sentence.id), ["s1-1", "s1-2"]);
  assert.equal(sentences[0]?.startSeconds, 5);
  assert.equal(sentences[1]?.endSeconds, 25);
  assert.equal(sentences[0]?.endSeconds, sentences[1]?.startSeconds);
  assert.deepEqual(sentences[0]?.points, []);
  assert.equal(sentences[1]?.points[0]?.term, "many reasons");
});

test("学习文档保留原文换行并压缩连续空行", () => {
  const layout = buildOriginalDocumentLayout(
    [
      "First sentence. Second sentence.",
      "",
      "",
      "Third sentence begins",
      "on the next line."
    ].join("\n"),
    [
      { id: "s1", text: "First sentence." },
      { id: "s2", text: "Second sentence." },
      { id: "s3", text: "Third sentence begins on the next line." }
    ]
  );

  assert.deepEqual(layout, [
    { sentenceId: "s1", text: "First sentence.", separatorAfter: " " },
    { sentenceId: "s2", text: "Second sentence.", separatorAfter: "\n" },
    { sentenceId: "s3", text: "Third sentence begins\non the next line.", separatorAfter: "" }
  ]);
});

test("练习定位从当前题之后循环寻找第一道未答题", () => {
  const questionIds = ["q1", "q2", "q3", "q4"];

  assert.equal(nextPracticeQuestionIndex(questionIds, { q1: 0, q3: 2 }, 2), 3);
  assert.equal(nextPracticeQuestionIndex(questionIds, { q1: 0, q3: 2, q4: 1 }, 3), 1);
  assert.equal(nextPracticeQuestionIndex(questionIds, { q1: 0, q2: 1, q3: 2, q4: 1 }, 0), null);
});

test("练习结果同时返回正确数、错题和未答题", () => {
  const result = practiceResult(
    [
      { id: "q1", answer: 1 },
      { id: "q2", answer: 2 },
      { id: "q3", answer: 0 }
    ],
    { q1: 1, q2: 0 }
  );

  assert.equal(result.correctCount, 1);
  assert.deepEqual(result.wrongQuestionIds, ["q2"]);
  assert.deepEqual(result.unansweredQuestionIds, ["q3"]);
});

const narrationNodes = [
  { id: "intro", type: "INTRO" as const, sentenceId: null, durationMs: 1_000 },
  { id: "s1-c1", type: "SENTENCE" as const, sentenceId: "s1", durationMs: 2_000 },
  { id: "s1-c2", type: "SENTENCE" as const, sentenceId: "s1", durationMs: 3_000 },
  { id: "s2-c1", type: "SENTENCE" as const, sentenceId: "s2", durationMs: 4_000 },
  { id: "summary", type: "SUMMARY" as const, sentenceId: null, durationMs: 1_500 }
];

test("总进度时间可以精确映射到节点和节点内时间", () => {
  assert.deepEqual(nodePositionAtGlobalTime(narrationNodes, 5.5), { nodeIndex: 2, nodeTimeSeconds: 2.5 });
  assert.deepEqual(nodePositionAtGlobalTime(narrationNodes, 20), { nodeIndex: 4, nodeTimeSeconds: 1.5 });
  assert.equal(globalTimeForNode(narrationNodes, 3, 1.25), 7.25);
});

test("上一句和下一句按 sentenceId 分组跳转", () => {
  assert.equal(nextSentenceNodeIndex(narrationNodes, 2, 1), 3);
  assert.equal(nextSentenceNodeIndex(narrationNodes, 3, -1), 1);
  assert.equal(nextSentenceNodeIndex(narrationNodes, 1, -1), 1);
  assert.equal(nextSentenceNodeIndex(narrationNodes, 3, 1), 3);
});

test("已过期的 Provider 签名音频返回重新生成提示", () => {
  const playbackErrorMessage = (
    englishGuidedStudyLearning as typeof englishGuidedStudyLearning & {
      audioPlaybackErrorMessage?: (audioUrl: string, error: unknown, nowMs: number) => string;
    }
  ).audioPlaybackErrorMessage;
  const expiredUrl = "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.mp3?Expires=1783315122";

  assert.equal(typeof playbackErrorMessage, "function");
  assert.equal(
    playbackErrorMessage?.(expiredUrl, new DOMException("Failed to load", "NotSupportedError"), 1784260800000),
    "讲解音频链接已过期，请返回制作台重新生成语音讲解"
  );
});

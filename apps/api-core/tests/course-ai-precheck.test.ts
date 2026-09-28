import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCourseAiPrecheckPayload,
  combineCourseAiPrecheckResults,
  parseCourseAiPrecheckResult
} from "../src/courses/course-ai-precheck.js";

test("AI 预审收集课程资料、全部课件文本和上传示范朗读识别文本", () => {
  const payload = buildCourseAiPrecheckPayload({
    scope: "COURSE_REVISION",
    afterSnapshot: {
      name: "飞鸟集英语精读",
      summary: "诗歌中的爱与自然",
      tags: ["诗歌", "英语"],
      coverUrl: "https://cdn.example.com/cover.png",
      items: [
        {
          displayName: "英文带读课件",
          materialType: "ENGLISH_GUIDED_STUDY",
          materialSnapshot: {
            title: "Where the mind is without fear",
            narration: "这是一段带学文稿",
            readAlong: {
              source: "UPLOAD",
              srtText: "1\n00:00:00,000 --> 00:00:02,000\nWhere the mind is without fear"
            }
          }
        },
        {
          displayName: "学习闪卡",
          materialType: "LEARNING_FLASHCARD",
          materialSnapshot: {
            cards: [{ front: "fear", back: "恐惧" }]
          }
        }
      ]
    }
  });

  assert.equal(payload.resourceName, "飞鸟集英语精读");
  assert.equal(payload.coverUrl, "https://cdn.example.com/cover.png");
  const allText = payload.textSections.map((section) => `${section.path}:${section.text}`).join("\n");
  assert.match(allText, /这是一段带学文稿/);
  assert.match(allText, /readAlong\.srtText/);
  assert.match(allText, /Where the mind is without fear/);
  assert.match(allText, /fear/);
  assert.match(allText, /恐惧/);
});

test("AI 预审结果只接受结构化通过或不通过结论", () => {
  const passed = parseCourseAiPrecheckResult('```json\n{"verdict":"PASS","summary":"内容合规","reasons":[]}\n```');
  const rejected = parseCourseAiPrecheckResult(JSON.stringify({
    verdict: "REJECT",
    summary: "发现风险",
    reasons: [{ category: "版权", location: "课件 1", reason: "来源不明", evidence: "节选" }]
  }));

  assert.equal(passed.verdict, "PASS");
  assert.equal(rejected.verdict, "REJECT");
  assert.equal(rejected.reasons[0]?.reason, "来源不明");
  assert.throws(() => parseCourseAiPrecheckResult("审核通过"), /结构化结果/);
});

test("分批预审任一批次不通过时汇总结果为不通过", () => {
  const combined = combineCourseAiPrecheckResults([
    { verdict: "PASS", summary: "基本信息通过", reasons: [] },
    {
      verdict: "REJECT",
      summary: "文本存在风险",
      reasons: [{ category: "内容规范", location: "文稿", reason: "包含违规内容", evidence: "风险片段" }]
    }
  ]);

  assert.equal(combined.verdict, "REJECT");
  assert.equal(combined.reasons.length, 1);
  assert.match(combined.summary, /文本存在风险/);
});

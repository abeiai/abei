import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeEditedNarrationDraftContent,
  mergeVideoGuideScriptDraftContent,
  narrationDraftFromContent,
  narrationScriptCharacterCount,
  narrationTtsDraftFromContent,
  narrationTtsScriptCharacterCount,
  narrationTimelineForDerivedContent,
  videoGuideScriptIsReady
} from "../src/video-guide/video-guide-generation-state.js";

const draftTimeline = [
  {
    id: "intro",
    type: "INTRO",
    title: "课程导入",
    script: "今天我们一起学习消防车。",
    chunks: []
  },
  {
    id: "sentence-s_001",
    type: "SENTENCE",
    title: "逐句讲解",
    script: "这里的 put out 表示扑灭。",
    chunks: [],
    sentenceId: "s_001",
    subtitle: "They put out the fire."
  }
];

test("文案成功后保存草稿并清除旧语音和旧练习", () => {
  const content = mergeVideoGuideScriptDraftContent(
    {
      summary: "保留摘要",
      narrationGenerationCheckpoint: { version: 1, nodes: [{ id: "partial" }] },
      questions: [{ id: "q1" }],
      practiceQuestionsAiTaskId: "practice-old",
      narrationTimeline: [{ id: "old-audio" }],
      narrationAudioUrl: "https://cdn.example.com/old.mp3",
      narrationAudioTaskId: "audio-old",
      narrationAudioProgress: { total: 1 },
      narrationVoice: { providerVoiceId: "old-voice" },
      narrationTtsGenerationProgress: { status: "SUCCEEDED" }
    },
    {
      aiModelName: "deepseek-v4",
      aiProviderName: "provider",
      aiTaskId: "ai-task-1",
      narrationDraftTimeline: draftTimeline,
      narrationScript: draftTimeline.map((node) => node.script).join("\n\n"),
      words: [{ id: "w1", word: "put out" }]
    }
  );

  assert.equal(content.summary, "保留摘要");
  assert.equal("narrationGenerationCheckpoint" in content, false);
  assert.deepEqual(content.narrationDraftTimeline, draftTimeline);
  assert.deepEqual(content.words, [{ id: "w1", word: "put out" }]);
  assert.deepEqual(content.questions, []);
  assert.equal("narrationTimeline" in content, false);
  assert.equal("narrationAudioUrl" in content, false);
  assert.equal("narrationVoice" in content, false);
  assert.equal("narrationTtsGenerationProgress" in content, false);
  assert.equal("practiceQuestionsAiTaskId" in content, false);
});

test("重新生成文案没有设计词语时清空旧词卡", () => {
  const content = mergeVideoGuideScriptDraftContent(
    {
      words: [{ id: "old", word: "旧词卡" }]
    },
    {
      aiModelName: "deepseek-v4",
      aiProviderName: "provider",
      aiTaskId: "ai-task-empty-words",
      narrationDraftTimeline: draftTimeline,
      narrationScript: "新文案",
      words: []
    }
  );

  assert.deepEqual(content.words, []);
});

test("有效文案和草稿存在时文案就绪且不受历史失败进度影响", () => {
  const ready = {
    narrationGenerationProgress: { status: "SUCCEEDED" },
    narrationDraftTimeline: draftTimeline,
    narrationScript: "有效文案"
  };

  assert.equal(videoGuideScriptIsReady(ready), true);
  assert.equal(videoGuideScriptIsReady({ ...ready, narrationGenerationProgress: { status: "FAILED" } }), true);
  assert.equal(videoGuideScriptIsReady({ ...ready, narrationDraftTimeline: [] }), false);
  assert.equal(videoGuideScriptIsReady({ ...ready, narrationScript: "" }), true);
});

test("旧课件的已发布时间线可直接作为文案草稿", () => {
  const legacyNode = {
    id: "s_001",
    type: "SENTENCE" as const,
    title: "第 1 句",
    sentenceId: "s_001",
    subtitle: "There are lots of things.",
    script: "lots of 表示很多。",
    chunks: [{ id: "s_001-c1", type: "phrase", text: "lots of 表示很多。", overlay: null }],
    audioUrl: "https://cdn.example.com/s_001.mp3",
    audioTaskId: "audio-1",
    audioSha256: "hash"
  };
  const content = { narrationTimeline: [legacyNode] };

  assert.equal(videoGuideScriptIsReady(content), true);
  assert.deepEqual(narrationDraftFromContent(content), [
    {
      id: "s_001",
      type: "SENTENCE",
      title: "第 1 句",
      sentenceId: "s_001",
      subtitle: "There are lots of things.",
      script: "lots of 表示很多。",
      chunks: legacyNode.chunks
    }
  ]);
});

test("新版文案草稿优先于旧发布时间线", () => {
  assert.deepEqual(
    narrationDraftFromContent({
      narrationDraftTimeline: draftTimeline,
      narrationTimeline: [{ ...draftTimeline[0], script: "旧文案" }]
    }),
    draftTimeline
  );
});

test("不完整的新草稿整体失效并回退到完整的发布时间线", () => {
  const published = draftTimeline.map((node) => ({ ...node, audioUrl: `${node.id}.mp3` }));

  assert.deepEqual(
    narrationDraftFromContent({
      narrationDraftTimeline: [draftTimeline[0], { id: "broken" }],
      narrationTimeline: published
    }),
    draftTimeline
  );
});

test("人工编辑写入草稿并保留已发布语音时间线", () => {
  const published = draftTimeline.map((node) => ({
    ...node,
    audioUrl: `https://cdn.example.com/${node.id}.mp3`
  }));
  const content = mergeEditedNarrationDraftContent(
    {
      narrationScript: draftTimeline.map((node) => node.script).join("\n\n"),
      narrationTimeline: published,
      narrationTtsGenerationProgress: { status: "SUCCEEDED" },
      narrationTtsGenerationJob: { jobId: "old-job" }
    },
    [
      { id: "intro", originalScript: draftTimeline[0]!.script, script: draftTimeline[0]!.script },
      {
        id: "sentence-s_001",
        originalScript: draftTimeline[1]!.script,
        script: "put out 在这里表示扑灭火焰。"
      }
    ],
    "2026-07-16T02:00:00.000Z"
  );
  const editedTimeline = content.narrationDraftTimeline as typeof draftTimeline;

  assert.deepEqual(content.narrationTimeline, published);
  assert.equal(content.narrationAudioStale, true);
  assert.equal(content.narrationDraftUpdatedAt, "2026-07-16T02:00:00.000Z");
  assert.equal("narrationTtsGenerationJob" in content, false);
  assert.equal("narrationTtsGenerationProgress" in content, false);
  assert.deepEqual(editedTimeline[0]?.chunks, draftTimeline[0]?.chunks);
  assert.deepEqual(editedTimeline[1]?.chunks, [
    {
      id: "sentence-s_001-manual",
      type: "manual",
      text: "put out 在这里表示扑灭火焰。",
      overlay: null
    }
  ]);
});

test("人工编辑拒绝缺失、重复、未知和空文案节点", () => {
  const content = { narrationScript: "有效文案", narrationDraftTimeline: draftTimeline };

  assert.throws(
    () => mergeEditedNarrationDraftContent(content, [{ id: "intro", originalScript: draftTimeline[0]!.script, script: "只提交一项" }], "now"),
    /文案已发生变化/
  );
  assert.throws(
    () =>
      mergeEditedNarrationDraftContent(
        content,
        [
          { id: "intro", originalScript: draftTimeline[0]!.script, script: "一" },
          { id: "intro", originalScript: draftTimeline[0]!.script, script: "二" }
        ],
        "now"
      ),
    /文案节点不能重复/
  );
  assert.throws(
    () =>
      mergeEditedNarrationDraftContent(
        content,
        [
          { id: "intro", originalScript: draftTimeline[0]!.script, script: "一" },
          { id: "unknown", originalScript: "未知", script: "二" }
        ],
        "now"
      ),
    /文案已发生变化/
  );
  assert.throws(
    () =>
      mergeEditedNarrationDraftContent(
        content,
        [
          { id: "intro", originalScript: draftTimeline[0]!.script, script: "一" },
          { id: "sentence-s_001", originalScript: draftTimeline[1]!.script, script: "   " }
        ],
        "now"
      ),
    /讲解文案不能为空/
  );
});

test("人工编辑拒绝过期快照且原样保存不会使语音过期", () => {
  const content = {
    narrationTimeline: draftTimeline.map((node) => ({ ...node, audioUrl: `${node.id}.mp3` }))
  };
  const unchanged = mergeEditedNarrationDraftContent(
    content,
    draftTimeline.map((node) => ({
      id: node.id,
      originalScript: node.script,
      script: node.script
    })),
    "now"
  );

  assert.equal(unchanged, content);
  assert.equal("narrationAudioStale" in unchanged, false);
  assert.throws(
    () =>
      mergeEditedNarrationDraftContent(
        content,
        draftTimeline.map((node) => ({
          id: node.id,
          originalScript: node.id === "intro" ? "旧的导入文案" : node.script,
          script: node.script
        })),
        "now"
      ),
    /文案已发生变化/
  );
});

test("语音费用按照已生成文案的真实字符数估算", () => {
  const content = {
    narrationGenerationProgress: { status: "SUCCEEDED" },
    narrationDraftTimeline: draftTimeline,
    narrationScript: "不应使用这个兼容字段覆盖逐节点字符数"
  };

  assert.equal(
    narrationScriptCharacterCount(content),
    draftTimeline.reduce((total, node) => total + node.script.length, 0)
  );
  assert.deepEqual(narrationDraftFromContent(content), draftTimeline);
});

test("语音费用只计算实际送入 TTS 的清洗与截断后文本", () => {
  const content = {
    narrationDraftTimeline: [
      {
        id: "intro",
        type: "INTRO",
        title: "课程导入",
        script: `# ${"甲".repeat(499)}\n- ${"乙".repeat(500)}`,
        chunks: []
      },
      {
        id: "summary",
        type: "SUMMARY",
        title: "课程总结",
        script: "丙".repeat(8_100),
        chunks: []
      }
    ]
  };
  const ttsDraft = narrationTtsDraftFromContent(content);

  assert.equal(ttsDraft[0]?.script, `${"甲".repeat(499)}\n${"乙".repeat(500)}`);
  assert.equal(ttsDraft[1]?.script.length, 7_900);
  assert.equal(narrationTtsScriptCharacterCount(content), 8_900);
});

test("练习生成和计费在语音生成前统一使用文案草稿时间线", () => {
  const finalTimeline = [{ id: "old-final-audio", script: "旧语音文稿" }];

  assert.deepEqual(
    narrationTimelineForDerivedContent({
      narrationDraftTimeline: draftTimeline,
      narrationTimeline: finalTimeline
    }),
    draftTimeline
  );
  assert.deepEqual(
    narrationTimelineForDerivedContent({ narrationTimeline: finalTimeline }),
    finalTimeline
  );
});

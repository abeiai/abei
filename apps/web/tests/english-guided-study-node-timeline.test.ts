import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as englishGuidedStudyData from "../src/lib/english-guided-study-data";
import * as englishGuidedStudyLearning from "../src/lib/english-guided-study-learning";
import {
  buildLearningTimeline,
  narrationPreviewSourceSignature,
  nextReadAlongCueIndex,
  readAlongCueIndexAtTime,
  readAlongPlaybackPositionAtTime,
  readAlongWaitSeconds,
  readAlongWordIndexAtTime,
  resumeNarrationPreviewAfterLoad,
  sequentialPlaybackFinished
} from "../src/lib/english-guided-study-learning";
import { getUserEnglishGuidedStudyMaterials } from "../src/lib/english-guided-study-api";
import { getPublicEnglishGuidedStudyMaterial } from "../src/lib/english-guided-study-public-api";

const {
  englishGuidedStudyDraftFromMaterial,
  parseEnglishReadAlongTrack,
  parseEnglishGuidedStudyOperationProgress,
  parseEnglishGuidedStudyReferenceMaterials,
  parseEnglishNarrationTimelineV2
} = englishGuidedStudyData;
const learningPlayerSource = readFileSync(
  new URL("../src/components/experience/english-guided-study-learning-player.tsx", import.meta.url),
  "utf8"
);
const guidedStudyConsoleSource = readFileSync(
  new URL("../src/components/experience/english-guided-study-console.tsx", import.meta.url),
  "utf8"
);

test("示范语音回填生成时音色，兼容系统音色、自定义音色和历史记录", () => {
  const select = englishGuidedStudyData.englishGuidedStudyReadAlongVoiceSelection;
  const material = {
    readAlong: { source: "GENERATED", voice: "longanyang" },
    readAlongGeneration: { billingRequestId: "completed-audio" },
    readAlongGenerationJob: {
      input: {
        mode: "GENERATE",
        settings: { billingRequestId: "completed-audio", voiceAssetId: "custom-voice", voice: "longanyang" }
      }
    }
  };
  assert.equal(select(material), "voice:custom-voice");
  assert.equal(select({ readAlong: { source: "GENERATED", voice: "longxiaochun" } }), "system:longxiaochun");
  assert.equal(select({ ...material, readAlong: { source: "UPLOAD", voice: null } }), null);
  assert.equal(select(null), null);
  assert.equal(select({ readAlong: { source: "GENERATED", voice: null } }), null);
  material.readAlongGenerationJob.input.settings.voiceAssetId = "";
  material.readAlongGenerationJob.input.settings.voice = "longxiaochun";
  assert.equal(select(material), "system:longxiaochun");
  material.readAlongGenerationJob.input.settings.billingRequestId = "pending-regeneration";
  assert.equal(select(material), "system:longanyang");
});

test("解析英文带学后台生成进度", () => {
  const progress = parseEnglishGuidedStudyOperationProgress({
    version: 1,
    operation: "CONTENT",
    status: "RUNNING",
    phase: "WRITING",
    completed: 35,
    total: 100,
    percent: 35,
    message: "正在生成带学文稿",
    canLeave: true,
    errorMessage: null,
    startedAt: "2026-07-27T00:00:00.000Z",
    finishedAt: null,
    updatedAt: "2026-07-27T00:00:01.000Z"
  }, "CONTENT");

  assert.equal(progress?.percent, 35);
  assert.equal(progress?.canLeave, true);
  assert.equal(parseEnglishGuidedStudyOperationProgress(progress, "AUDIO"), null);
});

test("多节点整体播放结束后再次播放应回到第一句", () => {
  assert.equal(sequentialPlaybackFinished(2, 3, 3, 3), true);
  assert.equal(sequentialPlaybackFinished(1, 3, 3, 3), false);
  assert.equal(sequentialPlaybackFinished(0, 1, 3, 3), false);
});

test("右栏讲解预览在下一段媒体就绪后续播且成功后不重复启动", async () => {
  const state = { attemptPending: false, requested: true };
  let playCount = 0;
  const firstAttempt = resumeNarrationPreviewAfterLoad(
    state,
    async () => {
      playCount += 1;
    }
  );
  const duplicateAttempt = await resumeNarrationPreviewAfterLoad(
    state,
    async () => {
      playCount += 1;
    }
  );

  assert.equal(duplicateAttempt, false);
  assert.equal(await firstAttempt, true);
  assert.equal(playCount, 1);
  assert.deepEqual(state, { attemptPending: false, requested: false });
});

test("右栏讲解预览续播失败后保留状态供媒体可播放时重试", async () => {
  const state = { attemptPending: false, requested: true };
  assert.equal(
    await resumeNarrationPreviewAfterLoad(state, async () => {
      throw new Error("媒体尚未就绪");
    }),
    false
  );
  assert.deepEqual(state, { attemptPending: false, requested: true });
  assert.equal(await resumeNarrationPreviewAfterLoad(state, async () => undefined), true);
  assert.deepEqual(state, { attemptPending: false, requested: false });
});

test("相同讲解节点的新数组引用不会改变右栏预览来源签名", () => {
  const first = narrationPreviewSourceSignature("fallback.mp3", [
    { audioUrl: "one.mp3" },
    { audioUrl: "two.mp3" }
  ]);
  const refreshed = narrationPreviewSourceSignature("fallback.mp3", [
    { audioUrl: "one.mp3" },
    { audioUrl: "two.mp3" }
  ]);
  const changed = narrationPreviewSourceSignature("fallback.mp3", [
    { audioUrl: "one.mp3" },
    { audioUrl: "three.mp3" }
  ]);

  assert.equal(first, refreshed);
  assert.notEqual(first, changed);
});

test("跟读时间按停顿、延迟和影子模式计算", () => {
  assert.equal(readAlongWaitSeconds("pause", 3.5, 2, 1), 5.5);
  assert.equal(readAlongWaitSeconds("pause", 3.5, 20, 1), 13.5);
  assert.equal(readAlongWaitSeconds("delay", 3.5, 0, 4), 4);
  assert.equal(readAlongWaitSeconds("delay", 3.5, 0, 9), 5);
  assert.equal(readAlongWaitSeconds("shadow", 3.5, 10, 5), 0);
});

test("跟读等待结束后按播放方式确定目标句", () => {
  assert.equal(nextReadAlongCueIndex(1, 3, "sentence-repeat"), 1);
  assert.equal(nextReadAlongCueIndex(1, 3, "all-once"), 2);
  assert.equal(nextReadAlongCueIndex(2, 3, "all-once"), null);
  assert.equal(nextReadAlongCueIndex(2, 3, "all-repeat"), 0);
});

test("连续音频的每一个非影子跟读节点都在句末进入等待", () => {
  const shouldWait = Reflect.get(englishGuidedStudyLearning, "shouldWaitAtReadAlongBoundary");

  assert.equal(typeof shouldWait, "function");
  assert.equal(shouldWait("delay", false, 4.01, 4), true);
  assert.equal(shouldWait("pause", false, 9.02, 9), true);
  assert.equal(shouldWait("shadow", false, 4.01, 4), false);
  assert.equal(shouldWait("delay", true, 4.01, 4), false);
  assert.equal(shouldWait("delay", false, 4.01, 4, false, false), false);
  assert.equal(shouldWait("delay", false, 4.01, 4, false, true), true);
  assert.equal(shouldWait("delay", false, 3.95, 4, true, true), true);
});

test("跟读播放时间可以定位当前高亮单词并处理词间停顿", () => {
  const words = [
    { startSeconds: 0.2, endSeconds: 0.5 },
    { startSeconds: 0.7, endSeconds: 1.1 },
    { startSeconds: 1.1, endSeconds: 1.6 }
  ];

  assert.equal(readAlongWordIndexAtTime(words, 0.1), -1);
  assert.equal(readAlongWordIndexAtTime(words, 0.35), 0);
  assert.equal(readAlongWordIndexAtTime(words, 0.6), 0);
  assert.equal(readAlongWordIndexAtTime(words, 0.8), 1);
  assert.equal(readAlongWordIndexAtTime(words, 1.6), 2);
});

test("拖动跟读进度可同时定位标题作者节点和正文高亮单词", () => {
  const cues = [
    {
      unitType: "TITLE" as const,
      startSeconds: 0,
      endSeconds: 1,
      words: []
    },
    {
      unitType: "AUTHOR" as const,
      startSeconds: 1,
      endSeconds: 2,
      words: []
    },
    {
      unitType: "BODY" as const,
      startSeconds: 2,
      endSeconds: 4,
      words: [
        { startSeconds: 2.1, endSeconds: 2.5 },
        { startSeconds: 2.5, endSeconds: 3 },
        { startSeconds: 3, endSeconds: 3.6 }
      ]
    }
  ];

  assert.deepEqual(readAlongPlaybackPositionAtTime(cues, 0.5), {
    cueIndex: 0,
    wordIndex: -1
  });
  assert.deepEqual(readAlongPlaybackPositionAtTime(cues, 2.7), {
    cueIndex: 2,
    wordIndex: 1
  });
  assert.deepEqual(readAlongPlaybackPositionAtTime(cues, 2.05), {
    cueIndex: 2,
    wordIndex: -1
  });
  assert.deepEqual(readAlongPlaybackPositionAtTime(cues.slice(2), 2.2), {
    cueIndex: 0,
    wordIndex: 0
  });
});

test("解析带标题、作者和单词时间轴的第二版跟读轨道", () => {
  const track = parseEnglishReadAlongTrack({
    version: 2,
    source: "GENERATED",
    audioUrl: "https://example.com/title.mp3",
    audioName: "全文诵读.mp3",
    audioAssetId: null,
    durationMs: 1800,
    srtText: "",
    voice: "longanyang",
    cues: [
      {
        id: "cue-title",
        unitId: "read-along-title",
        unitType: "TITLE",
        sentenceId: null,
        text: "The Road",
        startSeconds: 0,
        endSeconds: 1.8,
        timingSource: "ASR_WORDS",
        words: [
          { text: "The", startChar: 0, endChar: 3, startSeconds: 0.1, endSeconds: 0.4 },
          { text: "Road", startChar: 4, endChar: 8, startSeconds: 0.4, endSeconds: 1.2 }
        ]
      }
    ],
    nodes: [
      {
        id: "node-title",
        unitId: "read-along-title",
        unitType: "TITLE",
        sentenceId: null,
        text: "The Road",
        audioUrl: "https://example.com/title.mp3",
        durationMs: 1800,
        timingSource: "ASR_WORDS",
        words: [
          { text: "The", startChar: 0, endChar: 3, startSeconds: 0.1, endSeconds: 0.4 }
        ]
      }
    ]
  });

  assert.equal(track?.version, 2);
  assert.equal(track?.cues[0]?.unitType, "TITLE");
  assert.equal(track?.cues[0]?.words[1]?.startChar, 4);
});

test("历史第一版跟读轨道补齐可用于黄底高亮的估算词轴", () => {
  const track = parseEnglishReadAlongTrack({
    version: 1,
    source: "UPLOAD",
    audioUrl: "https://example.com/legacy.mp3",
    audioName: "legacy.mp3",
    audioAssetId: "legacy",
    durationMs: 1000,
    srtText: "",
    voice: null,
    cues: [
      { id: "legacy-cue", sentenceId: "s1", text: "Hello world.", startSeconds: 0, endSeconds: 1 }
    ],
    nodes: []
  });

  assert.equal(track?.version, 2);
  assert.equal(track?.cues[0]?.timingSource, "DURATION_ESTIMATE");
  assert.deepEqual(track?.cues[0]?.words.map((word) => ({
    text: word.text,
    startChar: word.startChar,
    endChar: word.endChar
  })), [
    { text: "Hello", startChar: 0, endChar: 5 },
    { text: "world", startChar: 6, endChar: 11 }
  ]);
  assert.equal(track?.cues[0]?.words[0]?.startSeconds, 0);
  assert.equal(track?.cues[0]?.words.at(-1)?.endSeconds, 1);
});

test("跟读音频上传代理采用限长流式转发而不整包读入内存", () => {
  const source = readFileSync(
    new URL(
      "../src/app/api/english-guided-study/materials/[id]/read-along/upload/route.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(source, /content-length/u);
  assert.equal(englishGuidedStudyData.englishGuidedStudyReadAlongUploadMaxBytes, 30 * 1024 * 1024);
  assert.match(source, /englishGuidedStudyReadAlongUploadMaxBytes \+ 1024 \* 1024/u);
  assert.doesNotMatch(source, /AUDIO_UPLOAD_MAX_BYTES/u);
  assert.match(guidedStudyConsoleSource, /file\.size > englishGuidedStudyReadAlongUploadMaxBytes/u);
  assert.match(guidedStudyConsoleSource, /跟读音频不能超过 30 MB/u);
  assert.match(source, /body:\s*request\.body/u);
  assert.doesNotMatch(source, /request\.arrayBuffer\(\)/u);
});

test("跟读音频上传计费核算通过独立代理转发到 API", () => {
  const source = readFileSync(
    new URL(
      "../src/app/api/english-guided-study/materials/[id]/read-along/upload/estimate/route.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(source, /read-along\/upload\/estimate/u);
  assert.match(source, /Cookie:\s*requestHeaders\.get\("cookie"\)/u);
  assert.match(source, /body:\s*await request\.text\(\)/u);
});

test("编辑文稿将结束语作为最后一个独立节点", () => {
  const source = readFileSync(
    new URL("../src/components/experience/english-guided-study-console.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /label:\s*"结束语"/u);
  assert.match(source, /targetType:\s*"SUMMARY"/u);
  assert.match(source, /script:\s*material\.closing/u);
});

test("学习内容提供作者及三种导语介绍方式", () => {
  const source = readFileSync(
    new URL("../src/components/experience/english-guided-study-console.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /aria-label="作者"/u);
  assert.match(source, /简单介绍/u);
  assert.match(source, /详细介绍/u);
  assert.match(source, /不做介绍/u);
  assert.match(source, /author:\s*extracted\.author/u);
  assert.match(source, /authorIntroductionMode,/u);
});

test("已生成材料可以只保存标题作者和正文更新", () => {
  const source = readFileSync(
    new URL("../src/components/experience/english-guided-study-console.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /保存更新/u);
  assert.match(source, /updateEnglishGuidedStudySource/u);
  assert.match(source, /saveSourceUpdate/u);
});

test("登录状态变化后英文带学重新加载账号完整音色库", () => {
  const source = readFileSync(
    new URL("../src/components/experience/english-guided-study-console.tsx", import.meta.url),
    "utf8"
  );
  const effectStart = source.indexOf("async function loadVoiceOptions()");
  const effectEnd = source.indexOf("useEffect(() => {\n    return () =>", effectStart);
  const voiceLoadingEffect = source.slice(effectStart, effectEnd);

  assert.ok(effectStart >= 0);
  assert.ok(effectEnd > effectStart);
  assert.match(voiceLoadingEffect, /\}, \[currentUser\?\.id\]\);/u);
});

test("重新打开材料时恢复作者及介绍方式", () => {
  const draft = englishGuidedStudyDraftFromMaterial({
    title: "The Road Not Taken",
    author: "Robert Frost",
    authorIntroductionMode: "DETAILED",
    sourceText: "Two roads diverged in a yellow wood.",
    sourceType: "TEXT",
    sourceName: null,
    level: { standardName: "CEFR", optionLabel: "B1", aiLevel: "B1" }
  });

  assert.equal(draft.author, "Robert Frost");
  assert.equal(draft.authorIntroductionMode, "DETAILED");
});

test("解析完整的英文带学节点时间轴", () => {
  const timeline = parseEnglishNarrationTimelineV2({
    version: 2,
    nodes: [
      {
        id: "s1-c1",
        type: "SENTENCE",
        sentenceId: "s1",
        chunkType: "PHRASE",
        script: "这里重点看 as a result。",
        focus: { pointId: "p1", text: "as a result" },
        audioTaskId: "audio-1",
        audioUrl: "https://example.com/audio-1.mp3",
        durationMs: 3200
      }
    ]
  });

  assert.equal(timeline?.nodes[0]?.sentenceId, "s1");
  assert.equal(timeline?.nodes[0]?.focus?.pointId, "p1");
});

test("公开英文带读隐藏音频任务编号后仍可解析节点时间轴", () => {
  const timeline = parseEnglishNarrationTimelineV2({
    version: 2,
    nodes: [
      {
        id: "s1-c1",
        type: "SENTENCE",
        sentenceId: "s1",
        chunkType: "PHRASE",
        script: "这里重点看 as a result。",
        focus: { pointId: "p1", text: "as a result" },
        audioUrl: "https://example.com/audio-1.mp3",
        durationMs: 3200
      }
    ]
  });

  assert.equal(timeline?.nodes[0]?.audioTaskId, "");
  assert.equal(timeline?.nodes[0]?.audioUrl, "https://example.com/audio-1.mp3");
});

test("公开英文带读兼容缺少嵌套数组的历史内容", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 0,
    message: "成功",
    data: {
      id: "material-1",
      title: "历史英文带读",
      sourceType: "TEXT",
      sourceName: "历史原文",
      sourceText: "Learning is a journey.",
      levelStandardName: "CEFR",
      levelOptionLabel: "A2",
      aiLevel: "A2",
      summary: "历史摘要",
      narration: "开始学习。",
      audioUrl: "https://example.com/lesson.mp3",
      audioDurationSeconds: 12,
      content: {
        id: "material-1",
        title: "历史英文带读",
        sourceText: "Learning is a journey.",
        level: { standardName: "CEFR", optionLabel: "A2", aiLevel: "A2" },
        sentences: [{ id: "s1", text: "Learning is a journey.", explanation: "学习是一段旅程。" }],
        questions: [{ id: "q1", question: "Ready?" }],
        audioDurationSeconds: 12,
        audioTimeline: [{ sentenceId: "s1", startSeconds: 0, endSeconds: 12 }]
      },
      createdAt: "2026-07-19T00:00:00.000Z"
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

  try {
    const material = await getPublicEnglishGuidedStudyMaterial("material-1");

    assert.ok(material);
    assert.equal(material.contentTitle, "历史英文带读");
    assert.equal(material.author, null);
    assert.equal(material.authorIntroductionMode, "BRIEF");
    assert.deepEqual(material.sentences[0]?.points, []);
    assert.deepEqual(material.questions[0]?.options, []);
    assert.deepEqual(material.audioTimeline[0]?.terms, []);
    assert.doesNotThrow(() => buildLearningTimeline(material.sentences));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("拒绝缺少真实时长或音频地址的节点时间轴", () => {
  assert.equal(parseEnglishNarrationTimelineV2({
    version: 2,
    nodes: [
      {
        id: "intro",
        type: "INTRO",
        sentenceId: null,
        chunkType: "INTRO",
        script: "开始学习。",
        focus: null,
        audioTaskId: "audio-1",
        durationMs: 0
      }
    ]
  }), null);
});

test("历史材料转换为中栏输入状态时保留标题、原文、来源和等级", () => {
  const draftFromMaterial = (
    englishGuidedStudyData as typeof englishGuidedStudyData & {
      englishGuidedStudyDraftFromMaterial?: (material: {
        title: string;
        author?: string | null;
        authorIntroductionMode?: "BRIEF" | "DETAILED" | "NONE";
        sourceText: string;
        sourceType: "TEXT" | "IMAGE";
        sourceName: string | null;
        level: {
          standardName: string;
          optionLabel: string;
        };
      }) => unknown;
    }
  ).englishGuidedStudyDraftFromMaterial;

  assert.equal(typeof draftFromMaterial, "function");
  assert.deepEqual(draftFromMaterial?.({
    title: "The Power of Smiling",
    sourceText: "A smile shows that a person is happy.",
    sourceType: "IMAGE",
    sourceName: "smile.png",
    level: {
      standardName: "CET 大学英语四/六级",
      optionLabel: "CET-4 500-599"
    }
  }), {
    title: "The Power of Smiling",
    author: "",
    authorIntroductionMode: "BRIEF",
    sourceText: "A smile shows that a person is happy.",
    inputMode: "IMAGE",
    imageName: "smile.png",
    referenceMaterials: [],
    standardName: "CET 大学英语四/六级",
    levelOptionLabel: "CET-4 500-599",
    explanationMode: "SENTENCE"
  });
});

test("自动生成的课件标题不会回填为内容标题", () => {
  assert.equal(englishGuidedStudyDraftFromMaterial({
    title: "理解森林中的两条路",
    contentTitle: null,
    author: null,
    authorIntroductionMode: "BRIEF",
    sourceText: "Two roads diverged in a yellow wood,",
    sourceType: "TEXT",
    sourceName: null,
    level: {
      standardName: "基于所在学段年级",
      optionLabel: "初二初三",
      aiLevel: "E4"
    }
  }).title, "");
});

test("账号历史中的旧课件标题不会被当作用户填写的内容标题", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 0,
    message: "成功",
    data: [{
      id: "legacy-material",
      userId: "user-1",
      title: "自动生成的旧课件标题",
      sourceType: "TEXT",
      sourceName: null,
      sourceText: "A smile can brighten someone's day.",
      levelStandardName: "基于所在学段年级",
      levelOptionLabel: "初二初三",
      aiLevel: "E4",
      summary: "导语",
      narration: "讲解",
      audioUrl: null,
      audioTaskId: null,
      audioDurationSeconds: 8,
      content: {
        id: "legacy-material",
        title: "自动生成的旧课件标题",
        sourceText: "A smile can brighten someone's day.",
        level: { standardName: "基于所在学段年级", optionLabel: "初二初三", aiLevel: "E4" },
        sentences: [],
        questions: [],
        audioDurationSeconds: 8
      },
      pinnedAt: null,
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z"
    }]
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

  try {
    const [material] = await getUserEnglishGuidedStudyMaterials();

    assert.equal(material?.contentTitle, null);
    assert.equal(material ? englishGuidedStudyDraftFromMaterial(material).title : null, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("账号材料解析会保留生成讲解语音时实际使用的音色", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 0,
    message: "成功",
    data: [{
      id: "voice-material",
      userId: "user-1",
      title: "已生成讲解语音",
      sourceType: "TEXT",
      sourceName: null,
      sourceText: "学而时习之，不亦说乎？",
      levelStandardName: "学段年级",
      levelOptionLabel: "七年级",
      aiLevel: "G7",
      summary: "先来了解这句话。",
      narration: "先来了解这句话。学而时习之，是说学过后按时温习。",
      audioUrl: "https://example.com/narration.mp3",
      audioTaskId: "audio-task-1",
      audioDurationSeconds: 12,
      content: {
        id: "voice-material",
        scene: "GUSHIWEN",
        title: "已生成讲解语音",
        sourceText: "学而时习之，不亦说乎？",
        level: {
          standardName: "学段年级",
          optionLabel: "七年级",
          aiLevel: "G7"
        },
        audioDurationSeconds: 12,
        sentences: [{
          id: "sentence-1",
          text: "学而时习之，不亦说乎？",
          script: "学而时习之，是说学过后按时温习。",
          explanation: "学过后按时温习。",
          points: []
        }],
        questions: [],
        narrationVoice: {
          providerVoiceId: "provider-designed",
          voiceAssetId: "voice-asset-1",
          modelAlias: "tts-default",
          speed: 1
        }
      },
      pinnedAt: null,
      createdAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z"
    }]
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

  try {
    const [material] = await getUserEnglishGuidedStudyMaterials("GUSHIWEN");

    assert.deepEqual(material?.narrationVoice, {
      providerVoiceId: "provider-designed",
      voiceAssetId: "voice-asset-1"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("讲解音色回显优先使用已保存的音色资产，其次使用系统音色", () => {
  const selectionFromMaterial = Reflect.get(
    englishGuidedStudyData,
    "englishGuidedStudyNarrationVoiceSelection"
  );

  assert.equal(typeof selectionFromMaterial, "function");
  assert.equal(selectionFromMaterial?.({
    narrationVoice: {
      providerVoiceId: "provider-designed",
      voiceAssetId: "voice-asset-1"
    }
  }), "voice:voice-asset-1");
  assert.equal(selectionFromMaterial?.({
    narrationVoice: {
      providerVoiceId: "longanyang",
      voiceAssetId: null
    }
  }), "system:longanyang");
  assert.equal(selectionFromMaterial?.({ narrationVoice: null }), null);
  assert.match(guidedStudyConsoleSource, /voices=\{audioVoiceOptions\}/u);
  assert.match(guidedStudyConsoleSource, /name: "此前使用的音色"/u);
  assert.match(guidedStudyConsoleSource, /setAudioVoice\(storedAudioVoice\)/u);
  assert.match(
    guidedStudyConsoleSource,
    /\[material\?\.id, storedAudioVoice, voiceOptions\]/u
  );
});

test("解析并保留英文带学参考资料", () => {
  const references = parseEnglishGuidedStudyReferenceMaterials([
    {
      id: "ref-1",
      kind: "DOCUMENT",
      name: "经典译文.pdf",
      content: "我独自漫游，像一朵云。",
      mimeType: "application/pdf",
      sizeBytes: 1024
    },
    {
      id: "invalid",
      kind: "UNKNOWN",
      name: "无效资料",
      content: "不会保留"
    }
  ]);

  assert.equal(references.length, 1);
  assert.equal(references[0]?.name, "经典译文.pdf");
  assert.equal(references[0]?.content, "我独自漫游，像一朵云。");
});

test("英文带学前端能解析独立练习任务进度", () => {
  const progress = parseEnglishGuidedStudyOperationProgress(
    {
      version: 1,
      operation: "PRACTICE",
      status: "RUNNING",
      phase: "ANALYZING_PRACTICE",
      completed: 30,
      total: 100,
      percent: 30,
      message: "正在生成练习",
      canLeave: true,
      errorMessage: null,
      startedAt: "2026-07-27T00:00:00.000Z",
      finishedAt: null,
      updatedAt: "2026-07-27T00:00:01.000Z"
    },
    "PRACTICE"
  );

  assert.equal(progress?.operation, "PRACTICE");
  assert.equal(progress?.percent, 30);
});

test("英文带学前端解析跟读轨道与跟读生成进度", () => {
  const track = parseEnglishReadAlongTrack({
    version: 1,
    source: "GENERATED",
    audioUrl: "https://example.com/read-along-1.mp3",
    audioName: "全文诵读.mp3",
    durationMs: 5200,
    srtText: "1\n00:00:00,000 --> 00:00:02,000\nHello world.",
    cues: [
      {
        id: "read-along-cue-1",
        sentenceId: "s1",
        text: "Hello world.",
        startSeconds: 0,
        endSeconds: 2
      }
    ],
    nodes: [
      {
        id: "read-along-node-1",
        sentenceId: "s1",
        text: "Hello world.",
        audioUrl: "https://example.com/read-along-1.mp3",
        durationMs: 2000
      }
    ]
  });
  const progress = parseEnglishGuidedStudyOperationProgress({
    version: 1,
    operation: "READ_ALOUD",
    status: "RUNNING",
    phase: "SYNTHESIZING_READ_ALOUD",
    completed: 1,
    total: 2,
    percent: 50,
    message: "正在生成全文诵读音频",
    canLeave: true,
    errorMessage: null,
    startedAt: "2026-07-29T00:00:00.000Z",
    finishedAt: null,
    updatedAt: "2026-07-29T00:00:01.000Z"
  }, "READ_ALOUD");

  assert.equal(track?.cues[0]?.sentenceId, "s1");
  assert.equal(track?.nodes[0]?.durationMs, 2000);
  assert.equal(progress?.operation, "READ_ALOUD");
  assert.equal(progress?.percent, 50);
});

test("跟读播放器按 SRT 时间定位当前句并处理句间停顿", () => {
  const cues = [
    { startSeconds: 0, endSeconds: 2 },
    { startSeconds: 2.5, endSeconds: 5 },
    { startSeconds: 5, endSeconds: 7 }
  ];

  assert.equal(readAlongCueIndexAtTime(cues, 0), 0);
  assert.equal(readAlongCueIndexAtTime(cues, 2.25), 0);
  assert.equal(readAlongCueIndexAtTime(cues, 2.5), 1);
  assert.equal(readAlongCueIndexAtTime(cues, 7), 2);
});

test("英文带学使用新的唯一页面地址", () => {
  const routeData = englishGuidedStudyData as typeof englishGuidedStudyData & {
    text2lessonHomePath?: string;
    text2lessonStudyPath?: (materialId: string) => string;
  };

  assert.equal(routeData.text2lessonHomePath, "/text2lesson");
  assert.equal(routeData.text2lessonStudyPath?.("lesson id"), "/text2lesson/lesson%20id");
});

test("英文带学只把历史浏览器材料 ID 识别为本地材料", () => {
  const isLocalMaterialId = (
    englishGuidedStudyData as typeof englishGuidedStudyData & {
      isLocalEnglishGuidedStudyMaterialId?: (id: string) => boolean;
    }
  ).isLocalEnglishGuidedStudyMaterialId;

  assert.equal(typeof isLocalMaterialId, "function");
  assert.equal(isLocalMaterialId?.("egs-43ae61188125f5868e0bf2dc"), false);
  assert.equal(isLocalMaterialId?.("cmr7c5wkt01ic4y8out3we6x4"), false);
  assert.equal(isLocalMaterialId?.("d3d2a9f0-c541-4b58-88cb-a39c1333f88d"), true);
  assert.equal(isLocalMaterialId?.("english-guided-1753682400000-abc123"), true);
});

test("示范诵读与跟读训练使用独立播放器实例", () => {
  assert.match(learningPlayerSource, /<ReadAlongPanel\s+key="demonstration"/);
  assert.match(learningPlayerSource, /<ReadAlongPanel\s+key="read-along-practice"/);
});

test("语音带学固定头部和播放器且只滚动正文容器", () => {
  assert.match(learningPlayerSource, /guidedDocumentScrollRef/);
  assert.match(learningPlayerSource, /container\.scrollTo\(/);
  assert.doesNotMatch(learningPlayerSource, /scrollIntoView\(/);
  assert.match(learningPlayerSource, /h-\[calc\(100dvh-112px\)\] min-h-\[500px\]/);
  assert.match(learningPlayerSource, /min-h-0 flex-1 overscroll-contain overflow-y-auto pr-1/);
  assert.match(learningPlayerSource, /mt-auto grid shrink-0 gap-2 bg-background pt-6/);
});

test("跟读手动定位和设置切换会取消旧等待与迟到播放", () => {
  const seekSource = learningPlayerSource.slice(
    learningPlayerSource.indexOf("function seekGlobalTime"),
    learningPlayerSource.indexOf("function changeReadAlongPlaybackMode")
  );
  const settingsSource = learningPlayerSource.slice(
    learningPlayerSource.indexOf("function changeReadAlongPlaybackMode"),
    learningPlayerSource.indexOf("function seekDisplayedTime")
  );

  assert.match(seekSource, /clearFollowWait\(\);\s+continuePlaybackRef\.current = false/);
  assert.equal(settingsSource.match(/continuePlaybackRef\.current = false/g)?.length, 3);
});

test("跟读等待期间主按钮可暂停自动继续并从待播放句恢复", () => {
  const toggleSource = learningPlayerSource.slice(
    learningPlayerSource.indexOf("function togglePlayback"),
    learningPlayerSource.indexOf("function handleTimeUpdate")
  );

  assert.match(toggleSource, /followWaitTimerRef\.current !== null[\s\S]*clearFollowWait\(true\)[\s\S]*return/);
  assert.match(toggleSource, /pendingFollowCueIndexRef\.current[\s\S]*selectCue\(pendingCueIndex, true, 0\)/);
  assert.match(learningPlayerSource, /const playbackActive = isPlaying \|\| isWaiting/);
  assert.match(learningPlayerSource, /aria-label=\{playbackActive \? "暂停诵读音频" : "播放诵读音频"\}/);
});

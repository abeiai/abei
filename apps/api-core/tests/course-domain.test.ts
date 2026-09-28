import assert from "node:assert/strict";
import test from "node:test";
import {
  createCourseId,
  diffCourseMaterial,
  diffCourseRevision,
  hashCourseSnapshot,
  normalizeCourseTags,
  projectPublicCourseMaterial,
  snapshotCourseMaterial
} from "../src/courses/course-domain.js";

test("课程 ID 是 24 位小写十六进制且每次不同", () => {
  const first = createCourseId();
  const second = createCourseId();
  assert.match(first, /^[0-9a-f]{24}$/);
  assert.notEqual(first, second);
});

test("课程标签去空白、去重并保留原顺序", () => {
  assert.deepEqual(normalizeCourseTags([" 英语 ", "小学", "英语", ""]), ["英语", "小学"]);
});

test("课程差异明确列出标题、标签、改名和排序", () => {
  const diff = diffCourseRevision(
    { name: "旧课程", coverUrl: "/old.jpg", summary: "旧简介", tags: ["英语"], items: [{ materialKey: "v:1", displayName: "第一课", sortOrder: 0 }] },
    { name: "新课程", coverUrl: "/new.jpg", summary: "新简介", tags: ["英语", "口语"], items: [{ materialKey: "v:1", displayName: "导学第一课", sortOrder: 1 }] }
  );
  assert.deepEqual(diff.map((item) => item.kind), ["NAME", "COVER", "SUMMARY", "TAG_ADDED", "ITEM_RENAMED", "ITEM_REORDERED"]);
});

test("课件快照忽略学习记录并生成稳定指纹", () => {
  const first = snapshotCourseMaterial("LEARNING_FLASHCARD", { id: "d1", title: "单词", cards: [{ id: "c1", front: "cat", back: "猫", tags: ["动物"], reviews: [{ grade: "MASTERED" }] }] });
  const second = snapshotCourseMaterial("LEARNING_FLASHCARD", { id: "d1", title: "单词", cards: [{ id: "c1", front: "cat", back: "猫", tags: ["动物"], reviews: [] }] });
  assert.equal(hashCourseSnapshot(first), hashCourseSnapshot(second));
});

test("闪卡快照只保留公开字段并按排序号和 ID 排序", () => {
  const snapshot = snapshotCourseMaterial("LEARNING_FLASHCARD", {
    title: "动物单词",
    summary: "基础词汇",
    knowledgeMap: [{ title: "动物", description: "常见动物名称", priority: 1 }],
    pinnedAt: new Date("2026-01-01"),
    user: { email: "hidden@example.com" },
    cards: [
      { id: "c2", front: "dog", back: "狗", sortOrder: 1, storageKey: "private/dog", reviews: [] },
      { id: "c1", front: "cat", back: "猫", sortOrder: 1, reviews: [{ grade: "MASTERED" }] }
    ]
  });

  assert.deepEqual(snapshot, {
    type: "LEARNING_FLASHCARD",
    title: "动物单词",
    summary: "基础词汇",
    knowledgeMap: [{ title: "动物", description: "常见动物名称", priority: 1 }],
    cards: [
      { id: "c1", front: "cat", back: "猫", sortOrder: 1 },
      { id: "c2", front: "dog", back: "狗", sortOrder: 1 }
    ]
  });
});

test("课件差异区分普通字段和闪卡增删改", () => {
  const diff = diffCourseMaterial(
    { type: "LEARNING_FLASHCARD", title: "旧卡组", cards: [{ id: "c1", front: "cat", back: "猫" }, { id: "c2", front: "dog", back: "狗" }] },
    { type: "LEARNING_FLASHCARD", title: "新卡组", cards: [{ id: "c1", front: "cat", back: "猫咪" }, { id: "c3", front: "bird", back: "鸟" }] }
  );

  assert.deepEqual(diff.map((item) => item.kind), ["MATERIAL_FIELD", "CARD_ADDED", "CARD_REMOVED", "CARD_CHANGED"]);
});

test("视频快照对字幕、讲解、练习和音频使用严格嵌套白名单", () => {
  const snapshot = snapshotCourseMaterial("VIDEO_GUIDE", {
    title: "动物导学",
    mediaUrl: "https://cdn.example.com/lesson.mp4",
    narrationVoice: "voice-1",
    voice: "不应进入快照",
    content: {
      subtitleText: "hello",
      subtitleCues: [{ sentenceId: "s1", text: "hello", timeRange: "00:00", startSeconds: 0, endSeconds: 1, providerName: "hidden" }],
      teacherSegments: [{ id: "t1", timeRange: "00:00", startSeconds: 0, endSeconds: 1, subtitle: "hello", explanation: "讲解", adminUserId: "hidden" }],
      questions: [{ id: "q1", question: "cat 是什么？", options: ["猫", "狗"], answer: 0, explanation: "cat 是猫", requestId: "hidden" }],
      narrationTimeline: [{
        id: "n1",
        type: "SENTENCE",
        title: "第一句",
        script: "讲解",
        sentenceId: "s1",
        chunks: [{ id: "ch1", type: "CONTEXT", text: "context", modelName: "hidden", overlay: { text: "cat", subText: "猫", storageKey: "hidden" } }],
        audioUrl: "https://cdn.example.com/n1.mp3",
        audioSizeBytes: 32,
        durationMs: 1000,
        jobId: "hidden"
      }]
    }
  });

  assert.deepEqual(snapshot, {
    type: "VIDEO_GUIDE",
    title: "动物导学",
    mediaUrl: "https://cdn.example.com/lesson.mp4",
    subtitleText: "hello",
    subtitleCues: [{ sentenceId: "s1", text: "hello", timeRange: "00:00", startSeconds: 0, endSeconds: 1 }],
    teacherSegments: [{ id: "t1", timeRange: "00:00", startSeconds: 0, endSeconds: 1, subtitle: "hello", explanation: "讲解" }],
    questions: [{ id: "q1", question: "cat 是什么？", options: ["猫", "狗"], answer: 0, explanation: "cat 是猫" }],
    narrationTimeline: [{
      id: "n1",
      type: "SENTENCE",
      title: "第一句",
      script: "讲解",
      sentenceId: "s1",
      chunks: [{ id: "ch1", type: "CONTEXT", text: "context", overlay: { text: "cat", subText: "猫" } }],
      audioUrl: "https://cdn.example.com/n1.mp3",
      audioSizeBytes: 32,
      durationMs: 1000
    }],
    narrationVoice: "voice-1"
  });
});

test("英文带学快照对逐句讲解和音频使用严格嵌套白名单", () => {
  const snapshot = snapshotCourseMaterial("ENGLISH_GUIDED_STUDY", {
    title: "逐句带学",
    sourceText: "A cat sleeps.",
    summary: "学习简单句",
    narration: "逐句讲解",
    audioUrl: "https://cdn.example.com/intro.mp3",
    audioDurationSeconds: 12,
    content: {
      sentences: [{
        id: "s1",
        text: "A cat sleeps.",
        explanation: "一只猫在睡觉。",
        grammarFocus: "一般现在时",
        script: "先找到主语。",
        startSeconds: 0,
        endSeconds: 2,
        providerName: "hidden",
        points: [{ id: "p1", term: "sleeps", meaning: "睡觉", note: "第三人称单数", startSeconds: 1, endSeconds: 2, requestId: "hidden" }]
      }],
      audioTimeline: [{ sentenceId: "s1", startSeconds: 0, endSeconds: 2, jobId: "hidden", terms: [{ pointId: "p1", term: "sleeps", startSeconds: 1, endSeconds: 2, storageKey: "hidden" }] }],
      narrationTimelineV2: {
        version: 2,
        provider: "hidden",
        nodes: [{ id: "n1", type: "SENTENCE", sentenceId: "s1", chunkType: "GRAMMAR", script: "讲解 sleeps", focus: { pointId: "p1", text: "sleeps", adminUserId: "hidden" }, audioUrl: "https://cdn.example.com/n1.mp3", durationMs: 900, audioTaskId: "hidden" }]
      }
    }
  });

  assert.deepEqual(snapshot, {
    type: "ENGLISH_GUIDED_STUDY",
    title: "逐句带学",
    sourceText: "A cat sleeps.",
    summary: "学习简单句",
    narration: "逐句讲解",
    sentences: [{
      id: "s1",
      text: "A cat sleeps.",
      explanation: "一只猫在睡觉。",
      grammarFocus: "一般现在时",
      script: "先找到主语。",
      startSeconds: 0,
      endSeconds: 2,
      points: [{ id: "p1", term: "sleeps", meaning: "睡觉", note: "第三人称单数", startSeconds: 1, endSeconds: 2 }]
    }],
    audioUrl: "https://cdn.example.com/intro.mp3",
    audioDurationSeconds: 12,
    audioTimeline: [{ sentenceId: "s1", startSeconds: 0, endSeconds: 2, terms: [{ pointId: "p1", term: "sleeps", startSeconds: 1, endSeconds: 2 }] }],
    narrationTimelineV2: {
      version: 2,
      nodes: [{ id: "n1", type: "SENTENCE", sentenceId: "s1", chunkType: "GRAMMAR", script: "讲解 sleeps", focus: { pointId: "p1", text: "sleeps" }, audioUrl: "https://cdn.example.com/n1.mp3", durationMs: 900 }]
    },
    explanationMode: "SENTENCE",
    questions: []
  });
});

test("英文带学播放器公开字段全部进入审核指纹和差异", () => {
  const before = snapshotCourseMaterial("ENGLISH_GUIDED_STUDY", {
    title: "练习课",
    levelStandardName: "CEFR",
    levelOptionLabel: "A2",
    aiLevel: "A2",
    content: {
      explanationMode: "SENTENCE",
      questions: [{ id: "q1", question: "cat 是什么？", options: ["猫", "狗"], answer: 0, explanation: "cat 是猫" }]
    }
  });
  const after = snapshotCourseMaterial("ENGLISH_GUIDED_STUDY", {
    title: "练习课",
    levelStandardName: "CEFR",
    levelOptionLabel: "A2",
    aiLevel: "A2",
    content: {
      explanationMode: "SENTENCE",
      questions: [{ id: "q1", question: "cat 是什么？", options: ["猫", "狗"], answer: 1, explanation: "更新后的答案" }]
    }
  });

  assert.deepEqual(before.level, {
    standardName: "CEFR",
    optionLabel: "A2",
    aiLevel: "A2"
  });
  assert.equal(before.explanationMode, "SENTENCE");
  assert.ok(Array.isArray(before.questions));
  assert.notEqual(hashCourseSnapshot(before), hashCourseSnapshot(after));
  assert.deepEqual(diffCourseMaterial(before, after).map((entry) => entry.label), ["练习题"]);
});

test("公开古诗文带学材料保留播放器识别场景所需的元数据", () => {
  const material = projectPublicCourseMaterial("ENGLISH_GUIDED_STUDY", {
    title: "静夜思",
    content: {
      scene: "GUSHIWEN",
      author: "李白",
      authorIntroductionMode: "DETAILED",
      contentGenerationJob: { id: "private-job" }
    }
  });

  assert.deepEqual(material, {
    title: "静夜思",
    scene: "GUSHIWEN",
    author: "李白",
    authorIntroductionMode: "DETAILED",
    explanationMode: "SENTENCE",
    questions: []
  });
});

test("闪卡快照对知识图谱和卡片使用严格嵌套白名单", () => {
  const snapshot = snapshotCourseMaterial("LEARNING_FLASHCARD", {
    title: "动物单词",
    summary: "基础词汇",
    knowledgeMap: [{ title: "动物", description: "常见动物名称", priority: 1, providerName: "hidden", nested: { storageKey: "hidden" } }],
    cards: [{ id: "c1", type: "词义", front: "cat", back: "猫", source: "第一课", tags: ["动物"], sortOrder: 0, requestId: "hidden", reviews: [{ grade: "MASTERED" }] }]
  });

  assert.deepEqual(snapshot, {
    type: "LEARNING_FLASHCARD",
    title: "动物单词",
    summary: "基础词汇",
    knowledgeMap: [{ title: "动物", description: "常见动物名称", priority: 1 }],
    cards: [{ id: "c1", type: "词义", front: "cat", back: "猫", source: "第一课", tags: ["动物"], sortOrder: 0 }]
  });
});

test("视频讲解音色进入快照并影响稳定指纹", () => {
  const first = snapshotCourseMaterial("VIDEO_GUIDE", { title: "导学", narrationVoice: "voice-1" });
  const second = snapshotCourseMaterial("VIDEO_GUIDE", { title: "导学", narrationVoice: "voice-2" });

  assert.notEqual(hashCourseSnapshot(first), hashCourseSnapshot(second));
});

test("稳定指纹对规范等价键的插入顺序不敏感", () => {
  const composedFirst = { "é": "composed", "e\u0301": "decomposed" };
  const decomposedFirst = { "e\u0301": "decomposed", "é": "composed" };

  assert.equal(hashCourseSnapshot(composedFirst), hashCourseSnapshot(decomposedFirst));
});

test("闪卡与课件字段使用环境无关的 UTF-16 全序", () => {
  const snapshot = snapshotCourseMaterial("LEARNING_FLASHCARD", {
    cards: [{ id: "é", front: "composed" }, { id: "e\u0301", front: "decomposed" }]
  });
  assert.deepEqual((snapshot.cards as Array<{ id: string }>).map((card) => card.id), ["e\u0301", "é"]);

  const diff = diffCourseMaterial(
    { "é": "before", "e\u0301": "before" },
    { "é": "after", "e\u0301": "after" }
  );
  assert.deepEqual(diff.map((item) => item.label), ["e\u0301", "é"]);
});

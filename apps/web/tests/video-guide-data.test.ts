import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasActiveVideoGuideGeneration,
  isCompletedVideoGuideLesson,
  mergeStoredVideoGuideLessons,
  parseVideoGuideLessonContent,
  preferredActiveVideoGuideLesson,
  reconcileStoredVideoGuideLessons,
  reusableVideoGuideLessonId,
  sortStoredVideoGuideLessonsForEntry,
  upsertStoredVideoGuideLesson,
  videoGuideStorageKeyForUser,
  videoGuideScriptReady,
  videoGuideLessonIdsToRefresh,
  type StoredVideoGuideLesson
} from "../src/lib/video-guide-data.js";

test("已完成课件在直接打开制作页时仍可进入学习页面", () => {
  const baseLesson = {
    id: "lesson-ready-for-learning",
    title: "测试课件",
    mediaName: "video.mp4",
    createdAt: "2026-07-27T00:00:00.000Z"
  } satisfies Omit<StoredVideoGuideLesson, "status">;

  assert.equal(
    isCompletedVideoGuideLesson({ ...baseLesson, status: "SUCCEEDED" }),
    true
  );
  assert.equal(isCompletedVideoGuideLesson(baseLesson), true);
  assert.equal(
    isCompletedVideoGuideLesson({ ...baseLesson, status: "GENERATING" }),
    false
  );
  assert.equal(
    isCompletedVideoGuideLesson({ ...baseLesson, status: "FAILED" }),
    false
  );
});

test("视频导学历史缓存按登录用户隔离且不复用旧全局缓存", () => {
  const firstUserKey = videoGuideStorageKeyForUser("user-a");
  const secondUserKey = videoGuideStorageKeyForUser("user-b");
  const guestKey = videoGuideStorageKeyForUser(null);

  assert.notEqual(firstUserKey, secondUserKey);
  assert.notEqual(firstUserKey, guestKey);
  assert.notEqual(secondUserKey, guestKey);
  assert.notEqual(firstUserKey, "xueleai:video-guide:lessons");
  assert.notEqual(guestKey, "xueleai:video-guide:lessons");
});

test("公开视频导学学习页不读取未按用户隔离的制作历史", () => {
  const source = readFileSync(
    new URL("../src/components/experience/video-guide-learning-player.tsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /localStorage\.getItem\(videoGuideStorageKey\)/u);
});

test("讲解语音进度和文案草稿可在刷新后恢复", () => {
  const draftNode = {
    id: "intro",
    type: "INTRO",
    title: "导读开场",
    script: "今天我们学习消防车。",
    chunks: [{ id: "intro-chunk", type: "TEACHER", text: "今天我们学习消防车。" }]
  };
  const content = parseVideoGuideLessonContent({
    narrationScript: draftNode.script,
    narrationDraftTimeline: [draftNode],
    narrationGenerationProgress: {
      version: 1,
      operation: "NARRATION",
      status: "SUCCEEDED",
      phase: "COMPLETED",
      completed: 100,
      total: 100,
      percent: 100,
      message: "导学文案已生成",
      canLeave: true,
      errorMessage: null,
      startedAt: "2026-07-15T00:00:00.000Z",
      finishedAt: "2026-07-15T00:01:00.000Z",
      updatedAt: "2026-07-15T00:01:00.000Z"
    },
    narrationTtsGenerationProgress: {
      version: 1,
      operation: "NARRATION_TTS",
      status: "RUNNING",
      phase: "SYNTHESIZING_AUDIO",
      completed: 1,
      total: 3,
      percent: 33,
      message: "正在生成讲解语音",
      canLeave: true,
      errorMessage: null,
      startedAt: "2026-07-15T00:02:00.000Z",
      finishedAt: null,
      updatedAt: "2026-07-15T00:03:00.000Z"
    }
  });
  const lesson = {
    id: "lesson-script-ready",
    title: "测试课件",
    mediaName: "video.mp4",
    status: "GENERATING",
    createdAt: "2026-07-15T00:00:00.000Z",
    content: content!
  } satisfies StoredVideoGuideLesson;

  assert.equal(content?.narrationTtsGenerationProgress?.operation, "NARRATION_TTS");
  assert.equal(content?.narrationTtsGenerationProgress?.percent, 33);
  assert.equal(content?.narrationDraftTimeline?.length, 1);
  assert.equal(content?.narrationDraftTimeline?.[0]?.script, draftNode.script);
  assert.equal(videoGuideScriptReady(lesson), true);
  assert.equal(hasActiveVideoGuideGeneration(lesson), true);
});

test("旧课件解析后直接识别为文案已就绪", () => {
  const legacyNode = {
    id: "s_001",
    type: "SENTENCE",
    title: "第 1 句",
    sentenceId: "s_001",
    subtitle: "There are lots of things.",
    script: "lots of 表示很多。",
    chunks: [{ id: "s_001-c1", type: "phrase", text: "lots of 表示很多。" }],
    audioUrl: "https://cdn.example.com/s_001.mp3",
    audioTaskId: "audio-1"
  };
  const content = parseVideoGuideLessonContent({
    narrationTimeline: [legacyNode]
  });
  const lesson = {
    id: "legacy-lesson",
    title: "旧课件",
    mediaName: "legacy.mp4",
    status: "SUCCEEDED",
    createdAt: "2026-07-15T00:00:00.000Z",
    content: content!
  } satisfies StoredVideoGuideLesson;

  assert.equal(content?.narrationDraftTimeline?.[0]?.script, legacyNode.script);
  assert.equal(videoGuideScriptReady(lesson), true);
});

test("旧课件从互动讲解时间线补齐超过十二张的全部词卡", () => {
  const overlays = Array.from({ length: 15 }, (_, index) => ({
    text: `learning phrase ${String.fromCharCode(97 + index)}`,
    subText: `重点表达 ${index + 1}`
  }));
  const storedWords = overlays.slice(0, 12).map((overlay, index) => ({
    id: `word-${index}`,
    word: overlay.text,
    phonetic: "跟读时重点模仿",
    meaning: overlay.subText,
    note: `讲解 ${index + 1}`,
    appearsAt: `00:${String(index).padStart(2, "0")}`,
    appearsAtSeconds: index
  }));
  const content = parseVideoGuideLessonContent({
    words: storedWords,
    narrationDraftTimeline: overlays.map((overlay, index) => ({
      id: `s_${String(index + 1).padStart(3, "0")}`,
      type: "SENTENCE",
      title: `第 ${index + 1} 句`,
      script: `${overlay.text} 是本句的重点表达。`,
      chunks: [
        {
          id: `s_${index + 1}-c1`,
          type: "phrase",
          text: `${overlay.text} 是本句的重点表达。`,
          overlay
        }
      ],
      subtitle: `Subtitle ${index + 1}`,
      timeRange: `00:${String(index).padStart(2, "0")} - 00:${String(index + 1).padStart(2, "0")}`,
      startSeconds: index,
      endSeconds: index + 1
    }))
  });

  assert.equal(content?.words.length, overlays.length);
  assert.deepEqual(content?.words.map((word) => word.word), overlays.map((overlay) => overlay.text));
  assert.equal(content?.words.at(-1)?.meaning, "重点表达 15");
});

test("旧课件允许讲解节点暂时没有拆分片段", () => {
  const content = parseVideoGuideLessonContent({
    narrationTimeline: [
      {
        id: "s_001",
        type: "SENTENCE",
        title: "第 1 句",
        sentenceId: "s_001",
        subtitle: "There are lots of things.",
        script: "这里说明 lots of 表示很多。",
        chunks: [],
        audioUrl: "https://cdn.example.com/s_001.mp3"
      }
    ]
  });

  assert.equal(content?.narrationTimeline?.[0]?.chunks.length, 0);
  assert.equal(content?.narrationDraftTimeline?.[0]?.script, "这里说明 lots of 表示很多。");
});

test("不完整的文案草稿不会遮蔽完整的已发布时间线", () => {
  const validNode = {
    id: "intro",
    type: "INTRO",
    title: "导读开场",
    script: "有效导入",
    chunks: [{ id: "intro-c1", type: "intro", text: "有效导入" }]
  };
  const content = parseVideoGuideLessonContent({
    narrationDraftTimeline: [validNode, { id: "broken" }],
    narrationTimeline: [validNode]
  });

  assert.deepEqual(content?.narrationDraftTimeline, content?.narrationTimeline);
});

test("课件内容解析器保留人工编辑后的语音过期状态", () => {
  const content = parseVideoGuideLessonContent({
    narrationAudioStale: true,
    narrationDraftUpdatedAt: "2026-07-16T02:00:00.000Z"
  });

  assert.equal(content?.narrationAudioStale, true);
  assert.equal(content?.narrationDraftUpdatedAt, "2026-07-16T02:00:00.000Z");
});

test("页面刷新后优先恢复仍在后台生成的课件", () => {
  const lessons = [
    {
      id: "lesson-completed",
      title: "已完成课件",
      mediaName: "completed.mp4",
      status: "SUCCEEDED",
      createdAt: "2026-07-15T00:00:00.000Z"
    },
    {
      id: "lesson-active",
      title: "生成中课件",
      mediaName: "active.mp4",
      status: "DRAFT",
      createdAt: "2026-07-15T00:01:00.000Z",
      content: parseVideoGuideLessonContent({
        subtitleGenerationProgress: {
          version: 1,
          operation: "SUBTITLE",
          status: "RUNNING",
          phase: "RECOGNIZING",
          completed: 1,
          total: 4,
          percent: 25,
          message: "正在识别语音",
          canLeave: true,
          errorMessage: null,
          startedAt: "2026-07-15T00:01:00.000Z",
          finishedAt: null,
          updatedAt: "2026-07-15T00:02:00.000Z"
        }
      })!
    }
  ] satisfies StoredVideoGuideLesson[];

  assert.equal(preferredActiveVideoGuideLesson(lessons)?.id, "lesson-active");
  assert.equal(preferredActiveVideoGuideLesson([lessons[0]!]), null);
  assert.equal(hasActiveVideoGuideGeneration(lessons[1]!), true);
  assert.equal(hasActiveVideoGuideGeneration(lessons[0]!), false);
});

test("课件内容解析器保留后台异步生成进度", () => {
  const content = parseVideoGuideLessonContent({
    narrationGenerationProgress: {
      version: 1,
      operation: "NARRATION",
      status: "RUNNING",
      phase: "WRITING",
      completed: 18,
      total: 100,
      percent: 18,
      message: "正在分批生成导学文案",
      canLeave: true,
      errorMessage: null,
      startedAt: "2026-07-15T00:00:00.000Z",
      finishedAt: null,
      updatedAt: "2026-07-15T00:01:00.000Z"
    }
  });

  assert.equal(content?.narrationGenerationProgress?.status, "RUNNING");
  assert.equal(content?.narrationGenerationProgress?.percent, 18);
  assert.equal(content?.narrationGenerationProgress?.canLeave, true);
});

test("课件内容解析器忽略不完整的异步进度", () => {
  const content = parseVideoGuideLessonContent({
    subtitleGenerationProgress: {
      operation: "SUBTITLE",
      status: "RUNNING"
    }
  });

  assert.equal(content?.subtitleGenerationProgress, undefined);
});

test("尚未生成随堂练习时保留空题目而不是回退到演示题", () => {
  const content = parseVideoGuideLessonContent({
    questions: []
  });

  assert.deepEqual(content?.questions, []);
});

test("失败课件重新生成时复用原记录 ID", () => {
  const lesson = {
    id: "lesson-failed",
    title: "测试课件",
    mediaName: "video.mp4",
    status: "FAILED",
    createdAt: "2026-07-15T00:00:00.000Z"
  } satisfies StoredVideoGuideLesson;

  assert.equal(reusableVideoGuideLessonId(lesson), "lesson-failed");
  assert.equal(reusableVideoGuideLessonId({ ...lesson, status: "DRAFT" }), "lesson-failed");
  assert.equal(reusableVideoGuideLessonId({ ...lesson, status: "SUCCEEDED" }), "lesson-failed");
  assert.equal(reusableVideoGuideLessonId({ ...lesson, status: "GENERATING" }), null);
  assert.equal(reusableVideoGuideLessonId({ ...lesson, status: "QUEUED" }), null);
});

test("轮询会直接查询不在最近列表中的活跃课件", () => {
  const lessons = [
    {
      id: "old-active-lesson",
      title: "较早的生成中课件",
      mediaName: "old.mp4",
      status: "GENERATING",
      createdAt: "2026-06-01T00:00:00.000Z"
    },
    {
      id: "completed-lesson",
      title: "已完成课件",
      mediaName: "done.mp4",
      status: "SUCCEEDED",
      createdAt: "2026-07-15T00:00:00.000Z"
    }
  ] satisfies StoredVideoGuideLesson[];

  assert.deepEqual(videoGuideLessonIdsToRefresh(lessons, "explicit-lesson", lessons[0]), [
    "explicit-lesson",
    "old-active-lesson"
  ]);
});

test("接口课件按数据库 ID 覆盖分享标识不同的本地旧状态", () => {
  const apiLesson = {
    id: "lesson-1",
    shareToken: "new-share-token",
    title: "当前课件",
    mediaName: "video.mp4",
    status: "DRAFT",
    createdAt: "2026-07-23T00:00:00.000Z"
  } satisfies StoredVideoGuideLesson;
  const staleLocalLesson = {
    ...apiLesson,
    shareToken: undefined,
    status: "GENERATING",
    content: parseVideoGuideLessonContent({
      narrationGenerationProgress: {
        version: 1,
        operation: "NARRATION",
        status: "RUNNING",
        phase: "WRITING",
        completed: 100,
        total: 100,
        percent: 100,
        message: "正在生成导学文案",
        canLeave: true,
        errorMessage: null,
        startedAt: "2026-07-22T00:00:00.000Z",
        finishedAt: null,
        updatedAt: "2026-07-22T00:10:00.000Z"
      }
    })!
  } satisfies StoredVideoGuideLesson;

  const merged = mergeStoredVideoGuideLessons([apiLesson], [staleLocalLesson]);

  assert.deepEqual(merged, [apiLesson]);
  assert.equal(hasActiveVideoGuideGeneration(merged[0]!), false);
});

test("进入页面时按新建或最后成功完成时间排序", () => {
  const newerLesson = {
    id: "newer",
    title: "新课件",
    mediaName: "new.mp4",
    status: "DRAFT",
    createdAt: "2026-07-23T02:00:00.000Z"
  } satisfies StoredVideoGuideLesson;
  const regeneratedLesson = {
    id: "regenerated",
    title: "重新生成的课件",
    mediaName: "old.mp4",
    status: "DRAFT",
    createdAt: "2026-07-20T02:00:00.000Z",
    content: parseVideoGuideLessonContent({
      subtitleGenerationProgress: {
        version: 1,
        operation: "SUBTITLE",
        status: "SUCCEEDED",
        phase: "COMPLETED",
        completed: 6,
        total: 6,
        percent: 100,
        message: "字幕已生成",
        canLeave: true,
        errorMessage: null,
        startedAt: "2026-07-23T02:30:00.000Z",
        finishedAt: "2026-07-23T03:00:00.000Z",
        updatedAt: "2026-07-23T03:00:00.000Z"
      }
    })!
  } satisfies StoredVideoGuideLesson;

  assert.deepEqual(
    sortStoredVideoGuideLessonsForEntry([newerLesson, regeneratedLesson]).map(
      (lesson) => lesson.id
    ),
    ["regenerated", "newer"]
  );
});

test("页面停留期间原位更新已有课件且只把新课件放到顶部", () => {
  const first = {
    id: "first",
    title: "第一课件",
    mediaName: "first.mp4",
    status: "DRAFT",
    createdAt: "2026-07-23T02:00:00.000Z"
  } satisfies StoredVideoGuideLesson;
  const second = {
    id: "second",
    title: "第二课件",
    mediaName: "second.mp4",
    status: "GENERATING",
    createdAt: "2026-07-23T01:00:00.000Z"
  } satisfies StoredVideoGuideLesson;
  const completedSecond = {
    ...second,
    status: "SUCCEEDED"
  } satisfies StoredVideoGuideLesson;
  const third = {
    id: "third",
    title: "第三课件",
    mediaName: "third.mp4",
    status: "DRAFT",
    createdAt: "2026-07-23T03:00:00.000Z"
  } satisfies StoredVideoGuideLesson;

  assert.deepEqual(
    reconcileStoredVideoGuideLessons([first, second], [completedSecond]).map(
      (lesson) => lesson.id
    ),
    ["first", "second"]
  );
  assert.deepEqual(
    upsertStoredVideoGuideLesson([first, completedSecond], third).map(
      (lesson) => lesson.id
    ),
    ["third", "first", "second"]
  );
});

test("历史已有二十条时接口新课件仍进入顶部", () => {
  const currentLessons = Array.from({ length: 20 }, (_, index) => ({
    id: `current-${index}`,
    title: `当前课件 ${index}`,
    mediaName: `current-${index}.mp4`,
    status: "DRAFT" as const,
    createdAt: `2026-07-${String(20 - index).padStart(2, "0")}T00:00:00.000Z`
  }));
  const incomingLesson = {
    id: "incoming",
    title: "接口新课件",
    mediaName: "incoming.mp4",
    status: "DRAFT",
    createdAt: "2026-07-23T00:00:00.000Z"
  } satisfies StoredVideoGuideLesson;

  const reconciled = reconcileStoredVideoGuideLessons(
    currentLessons,
    [incomingLesson]
  );

  assert.equal(reconciled.length, 20);
  assert.equal(reconciled[0]?.id, "incoming");
  assert.equal(reconciled.some((lesson) => lesson.id === "current-19"), false);
});

test("置顶课件在刷新排序和接口状态更新后保持顶部", () => {
  const pinnedLesson = {
    id: "pinned",
    title: "置顶课件",
    mediaName: "pinned.mp4",
    status: "DRAFT",
    pinnedAt: "2026-07-23T04:00:00.000Z",
    createdAt: "2026-07-20T00:00:00.000Z"
  } satisfies StoredVideoGuideLesson;
  const newerLesson = {
    id: "newer",
    title: "较新课件",
    mediaName: "newer.mp4",
    status: "DRAFT",
    createdAt: "2026-07-23T03:00:00.000Z"
  } satisfies StoredVideoGuideLesson;
  const updatedPinnedLesson = {
    ...pinnedLesson,
    pinnedAt: undefined,
    status: "SUCCEEDED"
  } satisfies StoredVideoGuideLesson;

  const reconciled = reconcileStoredVideoGuideLessons(
    [pinnedLesson, newerLesson],
    [updatedPinnedLesson]
  );

  assert.equal(reconciled[0]?.pinnedAt, pinnedLesson.pinnedAt);
  assert.deepEqual(
    sortStoredVideoGuideLessonsForEntry(reconciled).map((lesson) => lesson.id),
    ["pinned", "newer"]
  );
});

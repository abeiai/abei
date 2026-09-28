import assert from "node:assert/strict";
import test from "node:test";
import {
  PublicEnglishGuidedStudyController
} from "../src/english-guided-study/english-guided-study.controller.js";
import { EnglishGuidedStudyService } from "../src/english-guided-study/english-guided-study.service.js";
import { PublicVideoGuideController } from "../src/video-guide/video-guide.controller.js";
import { VideoGuideService } from "../src/video-guide/video-guide.service.js";

const privateKeys = new Set([
  "userId",
  "mediaStorageKey",
  "subtitleStorageKey",
  "audioTaskId",
  "narrationAudioTaskId",
  "narrationAiTaskId",
  "practiceQuestionsAiTaskId",
  "providerName",
  "modelName",
  "pinnedAt",
  "errorMessage",
  "requestId",
  "storageKey",
  "jobId"
]);

function assertNoPrivateFields(value: unknown, path = "data") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateFields(item, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    assert.equal(privateKeys.has(key), false, `${path}.${key} 不应公开`);
    assertNoPrivateFields(item, `${path}.${key}`);
  }
}

test("公开视频导学服务和控制器仅返回播放器需要的递归白名单字段", async () => {
  const now = new Date("2026-07-18T08:00:00.000Z");
  const lesson = {
    id: "video-1",
    userId: "owner-private",
    title: "分数导学",
    mediaName: "fraction.mp4",
    mediaType: "VIDEO",
    mediaMimeType: "video/mp4",
    mediaSizeBytes: 1024,
    mediaUrl: "https://cdn.example.com/fraction.mp4",
    mediaStorageKey: "private/video.mp4",
    subtitleName: "fraction.srt",
    subtitleFormat: "SRT",
    subtitleSizeBytes: 128,
    subtitleUrl: "https://cdn.example.com/fraction.srt",
    subtitleStorageKey: "private/fraction.srt",
    status: "SUCCEEDED",
    shareToken: "share-token",
    content: {
      summary: "认识分数",
      stageNames: ["自主视听"],
      words: [{ id: "w1", word: "half", meaning: "一半", providerName: "private" }],
      teacherSegments: [{ id: "t1", explanation: "理解一半", jobId: "private" }],
      questions: [{ id: "q1", question: "一半是多少？", options: ["1/2"], answer: 0, requestId: "private" }],
      repeatLines: [],
      narrationAiTaskId: "private-ai-task",
      narrationModel: { providerName: "private-provider", modelName: "private-model" }
    },
    errorMessage: "private stack trace",
    createdAt: now,
    updatedAt: now,
    finishedAt: now
  };
  const service = new VideoGuideService({} as never, {} as never);
  (service as unknown as { prisma: object }).prisma = {
    videoGuideLesson: { findUnique: async () => lesson }
  };

  const projected = await service.getPublicLesson("share-token");
  const response = await new PublicVideoGuideController(service).getPublicLesson("share-token");

  assert.equal(projected.shareToken, "share-token");
  assert.equal(projected.mediaUrl, lesson.mediaUrl);
  assert.deepEqual(projected.content.questions, [{
    id: "q1",
    question: "一半是多少？",
    options: ["1/2"],
    answer: 0
  }]);
  assertNoPrivateFields(projected);
  assertNoPrivateFields(response.data);
});

test("公开英文带读服务和控制器移除任务与归属字段并保留学习播放器内容", async () => {
  const now = new Date("2026-07-18T08:00:00.000Z");
  const material = {
    id: "english-1",
    userId: "owner-private",
    title: "A cat sleeps",
    sourceType: "TEXT",
    sourceName: "第一课",
    sourceText: "A cat sleeps.",
    levelStandardName: "基于所在学段年级",
    levelOptionLabel: "小学五六年级",
    aiLevel: "E2",
    summary: "学习一般现在时",
    narration: "逐句讲解",
    audioUrl: "https://cdn.example.com/english.mp3",
    audioTaskId: "private-audio-task",
    audioDurationSeconds: 12,
    pinnedAt: now,
    content: {
      id: "english-1",
      title: "A cat sleeps",
      sourceText: "A cat sleeps.",
      explanationMode: "SENTENCE",
      level: { standardName: "基于所在学段年级", optionLabel: "小学五六年级", aiLevel: "E2" },
      sentences: [{
        id: "s1",
        text: "A cat sleeps.",
        explanation: "一只猫在睡觉。",
        grammarFocus: "一般现在时",
        points: [{ id: "p1", term: "sleeps", meaning: "睡觉", requestId: "private" }]
      }],
      questions: [{ id: "q1", question: "谁在睡觉？", options: ["猫", "狗"], answer: 0, explanation: "cat 是猫", jobId: "private" }],
      audioTimeline: [],
      narrationTimelineV2: {
        version: 2,
        nodes: [{
          id: "n1",
          type: "SENTENCE",
          sentenceId: "s1",
          chunkType: "GRAMMAR",
          script: "讲解",
          focus: null,
          audioTaskId: "private-node-task",
          audioUrl: "https://cdn.example.com/n1.mp3",
          durationMs: 900
        }]
      },
      providerName: "private-provider"
    },
    createdAt: now,
    updatedAt: now
  };
  const service = new EnglishGuidedStudyService({} as never, {} as never, {} as never);
  (service as unknown as { prisma: object }).prisma = {
    englishGuidedStudyMaterial: { findUnique: async () => material }
  };

  const projected = await service.getPublicMaterial("english-1");
  const response = await new PublicEnglishGuidedStudyController(service).getPublicMaterial("english-1");

  assert.equal(projected.sourceText, material.sourceText);
  assert.equal(projected.audioUrl, material.audioUrl);
  assert.equal(projected.content.sentences.length, 1);
  assert.equal(projected.content.questions.length, 1);
  assertNoPrivateFields(projected);
  assertNoPrivateFields(response.data);
});

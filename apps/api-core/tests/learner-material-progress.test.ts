import assert from "node:assert/strict";
import test from "node:test";

import { LearnerLearningQueryService } from "../src/learner-learning/learner-learning-query.service.js";

const progress = {
  id: "progress-1",
  userId: "user-1",
  learnerId: "learner-1",
  materialType: "VIDEO_GUIDE",
  materialId: "lesson-1",
  contentVersion: "version-1",
  status: "IN_PROGRESS",
  progressPercent: 60,
  activeStudySeconds: 0,
  firstStartedAt: new Date("2026-08-19T01:00:00.000Z"),
  lastStudiedAt: new Date("2026-08-19T02:00:00.000Z"),
  completedAt: null,
  studyCount: 2,
  completionCount: 0,
  parts: [
    {
      partKey: "AUTONOMOUS",
      status: "IN_PROGRESS",
      progressPercent: 60,
      activeStudySeconds: 0,
      progressData: {
        playedRanges: [{ startSeconds: 0, endSeconds: 30 }, { startSeconds: 32, endSeconds: 50 }],
        privateRanges: [[0, 48]]
      },
      metrics: { secret: 9 }
    },
    {
      partKey: "PRACTICE",
      status: "IN_PROGRESS",
      progressPercent: 50,
      activeStudySeconds: 0,
      progressData: {
        submittedIds: ["q-1", "q-2"],
        correctIds: ["q-1"],
        answers: [{ itemId: "q-1", selectedIndex: 0, isCorrect: true }]
      },
      metrics: {}
    }
  ]
};

function createService() {
  const prisma = {
    learnerMaterialProgress: {
      async findMany({ where }: { where: { learnerId: string } }) {
        return where.learnerId === progress.learnerId ? [progress] : [];
      },
      async findFirst({ where }: { where: { userId: string; learnerId: string } }) {
        return where.userId === progress.userId && where.learnerId === progress.learnerId
          ? progress
          : null;
      }
    },
    learnerLearningTimeSlice: {
      async findFirst({ where }: { where: { learnerId: string } }) {
        return where.learnerId === progress.learnerId
          ? { courseId: "course-1", courseRevisionItemId: "item-1" }
          : null;
      },
      async findMany() {
        return [
          { durationSeconds: 60, partKey: "AUTONOMOUS" },
          { durationSeconds: 30, partKey: "PRACTICE" }
        ];
      }
    },
    videoGuideLesson: {
      async findUnique() {
        return { title: "原始标题", shareToken: "share-1" };
      }
    },
    englishGuidedStudyMaterial: { findUnique: async () => null },
    learningFlashcardDeck: { findUnique: async () => null },
    courseRevisionItem: {
      async findUnique() {
        return {
          displayName: "课程内视频课件",
          revision: { courseId: "course-1", name: "英语入门" }
        };
      }
    },
    course: { findUnique: async () => null }
  };
  return new LearnerLearningQueryService(prisma as never);
}

test("学习者课件列表返回最近版本和可继续学习地址", async () => {
  const materials = await createService().getMaterials({
    userId: "user-1",
    learnerId: "learner-1"
  });
  assert.equal(materials.length, 1);
  assert.equal(materials[0]?.title, "课程内视频课件");
  assert.equal(materials[0]?.course?.name, "英语入门");
  assert.equal(
    materials[0]?.continueHref,
    "/media-tutor/share-1?courseId=course-1&courseRevisionItemId=item-1"
  );
  assert.equal(
    materials[0]?.detailHref,
    "/learn/center/materials/VIDEO_GUIDE/lesson-1"
  );
});

test("课件详情汇总规范时间片并只暴露白名单指标", async () => {
  const detail = await createService().getMaterialDetail({
    userId: "user-1",
    learnerId: "learner-1",
    materialType: "VIDEO_GUIDE",
    materialId: "lesson-1"
  });
  assert.equal(detail.activeStudySeconds, 90);
  assert.equal(detail.parts.length, 5);
  assert.deepEqual(detail.parts[0]?.metrics, {
    coveragePercent: 60,
    playedSeconds: 48
  });
  assert.deepEqual(detail.parts[3]?.metrics, {
    submittedCount: 2,
    correctCount: 1
  });
  assert.doesNotMatch(JSON.stringify(detail), /selectedIndex|isCorrect|privateRanges|answers/u);
});

test("课件详情隔离同一主账号下的其他学习者", async () => {
  await assert.rejects(
    createService().getMaterialDetail({
      userId: "user-1",
      learnerId: "learner-2",
      materialType: "VIDEO_GUIDE",
      materialId: "lesson-1"
    }),
    /学习记录不存在/u
  );
});

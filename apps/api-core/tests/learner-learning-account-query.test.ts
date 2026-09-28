import assert from "node:assert/strict";
import test from "node:test";

import { AppException } from "../src/common/app-exception.js";
import { LearnerLearningQueryService } from "../src/learner-learning/learner-learning-query.service.js";

const allSlices = [
  {
    bucketStartedAt: new Date("2026-08-10T02:00:00.000Z"),
    durationSeconds: 600,
    isLearning: true,
    scenarioId: "scenario-1",
    courseId: "course-1",
    resourceType: "TEXTBOOK",
    resourceId: "resource-1",
    materialType: "VIDEO_GUIDE",
    materialId: "video-1"
  },
  {
    bucketStartedAt: new Date("2026-08-11T02:00:00.000Z"),
    durationSeconds: 300,
    isLearning: true,
    scenarioId: "scenario-2",
    courseId: "course-2",
    resourceType: "TEXTBOOK",
    resourceId: "resource-2",
    materialType: "LEARNING_FLASHCARD",
    materialId: "deck-1"
  }
];

const progress = [
  {
    id: "progress-1",
    materialType: "VIDEO_GUIDE",
    materialId: "video-1",
    contentVersion: "v1",
    status: "IN_PROGRESS",
    progressPercent: 60,
    activeStudySeconds: 600,
    firstStartedAt: new Date("2026-08-10T02:00:00.000Z"),
    lastStudiedAt: new Date("2026-08-10T02:10:00.000Z"),
    completedAt: null,
    studyCount: 1,
    completionCount: 0
  },
  {
    id: "progress-2",
    materialType: "LEARNING_FLASHCARD",
    materialId: "deck-1",
    contentVersion: "v1",
    status: "COMPLETED",
    progressPercent: 100,
    activeStudySeconds: 300,
    firstStartedAt: new Date("2026-08-11T02:00:00.000Z"),
    lastStudiedAt: new Date("2026-08-11T02:05:00.000Z"),
    completedAt: new Date("2026-08-11T02:05:00.000Z"),
    studyCount: 1,
    completionCount: 1
  }
];

function createService() {
  const prisma = {
    learner: {
      async findFirst({ where }: { where: { id: string; userId: string } }) {
        return where.id === "learner-1" && where.userId === "user-1"
          ? { id: where.id }
          : null;
      }
    },
    learnerLearningTimeSlice: {
      async findMany({ where }: { where: Record<string, unknown> }) {
        if (!(where.bucketStartedAt as { gte?: Date } | undefined)?.gte) {
          return allSlices
            .filter(
              (slice) =>
                !where.materialType ||
                (slice.materialType === where.materialType &&
                  slice.materialId === where.materialId)
            )
            .map(({ durationSeconds }) => ({ durationSeconds }));
        }
        return allSlices.filter(
          (slice) =>
            (!where.courseId || slice.courseId === where.courseId) &&
            (!where.scenarioId || slice.scenarioId === where.scenarioId) &&
            (!where.resourceType || slice.resourceType === where.resourceType) &&
            (!where.resourceId || slice.resourceId === where.resourceId) &&
            (!where.materialType || slice.materialType === where.materialType) &&
            (!where.materialId || slice.materialId === where.materialId)
        );
      },
      findFirst: async () => null
    },
    learnerMaterialProgress: { findMany: async () => progress },
    learnerActivityEvent: {
      async findMany({ where }: { where: Record<string, unknown> }) {
        return allSlices
          .filter((slice) => !where.courseId || slice.courseId === where.courseId)
          .map((slice) => ({ scenarioId: slice.scenarioId }));
      }
    },
    course: {
      async findFirst({ where }: { where: { id: string } }) {
        return where.id === "course-1" ? { id: where.id } : null;
      },
      async findUnique({ where }: { where: { id: string } }) {
        return { approvedRevision: { name: where.id === "course-1" ? "英语课程" : "复习课程" } };
      }
    },
    courseRevisionItem: { findUnique: async () => null },
    aiScenario: {
      async findUnique({ where }: { where: { id: string } }) {
        return { name: where.id === "scenario-1" ? "视频导学" : "学习闪卡" };
      }
    },
    videoGuideLesson: {
      findUnique: async () => ({ title: "发音视频", shareToken: "share-1" })
    },
    englishGuidedStudyMaterial: { findUnique: async () => null },
    learningFlashcardDeck: {
      findUnique: async () => ({ title: "单词闪卡" })
    }
  };
  return new LearnerLearningQueryService(prisma as never);
}

test("主账号只能查询自己创建的学习者", async () => {
  await assert.rejects(
    createService().getAccountOverview("user-1", "learner-of-user-2", {
      from: "2026-08-01",
      to: "2026-08-19"
    }),
    (error: unknown) => error instanceof AppException && error.code === 40301
  );
});

test("课程筛选只返回该课程启动上下文的数据", async () => {
  const result = await createService().getAccountOverview("user-1", "learner-1", {
    from: "2026-08-01",
    to: "2026-08-19",
    courseId: "course-1"
  });
  assert.equal(result.totals.studySeconds, 600);
  assert.equal(result.courseBreakdown.every((row) => row.courseId === "course-1"), true);
  assert.deepEqual(result.materialBreakdown.map((row) => row.materialId), ["video-1"]);
  assert.equal(result.scenarioBreakdown[0]?.scenarioName, "视频导学");
  assert.equal(result.scenarioBreakdown[0]?.meaningfulActionCount, 1);
});

test("主账号组合筛选保留连续日趋势并拒绝无权课程", async () => {
  const result = await createService().getAccountOverview("user-1", "learner-1", {
    from: "2026-08-10",
    to: "2026-08-11",
    materialType: "LEARNING_FLASHCARD",
    materialId: "deck-1"
  });
  assert.equal(result.daily.length, 2);
  assert.equal(result.totals.studySeconds, 300);
  await assert.rejects(
    createService().getAccountOverview("user-1", "learner-1", {
      from: "2026-08-01",
      to: "2026-08-19",
      courseId: "course-of-user-2"
    }),
    /无权查看该课程/u
  );
});

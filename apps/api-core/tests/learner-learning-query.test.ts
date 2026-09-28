import assert from "node:assert/strict";
import test from "node:test";
import { LearnerLearningQueryService } from "../src/learner-learning/learner-learning-query.service.js";

const slices = [
  {
    userId: "user-1",
    learnerId: "learner-1",
    bucketStartedAt: new Date("2026-08-17T02:00:00.000Z"),
    durationSeconds: 60,
    isLearning: true
  },
  {
    userId: "user-1",
    learnerId: "learner-1",
    bucketStartedAt: new Date("2026-08-18T02:00:00.000Z"),
    durationSeconds: 90,
    isLearning: true
  },
  {
    userId: "user-1",
    learnerId: "learner-1",
    bucketStartedAt: new Date("2026-08-18T02:01:30.000Z"),
    durationSeconds: 30,
    isLearning: false
  },
  {
    userId: "user-1",
    learnerId: "learner-1",
    bucketStartedAt: new Date("2026-08-19T02:00:00.000Z"),
    durationSeconds: 30,
    isLearning: false
  },
  {
    userId: "user-2",
    learnerId: "learner-2",
    bucketStartedAt: new Date("2026-08-19T02:00:00.000Z"),
    durationSeconds: 999,
    isLearning: true
  }
];

const prisma = {
  learnerDailyLearningSummary: { findMany: async () => [] },
  learnerLearningTimeSlice: {
    async findMany({ where }: { where: Record<string, unknown> }) {
      const range = where.bucketStartedAt as { gte: Date; lt: Date };
      return slices.filter(
        (slice) =>
          slice.userId === where.userId &&
          slice.learnerId === where.learnerId &&
          slice.bucketStartedAt >= range.gte &&
          slice.bucketStartedAt < range.lt
      );
    }
  },
  learnerMaterialProgress: {
    count: async () => 0,
    findMany: async () => []
  }
};

const service = new LearnerLearningQueryService(prisma as never);

test("概览总计使用规范时间片且返回连续日期", async () => {
  const result = await service.getOverview({
    userId: "user-1",
    learnerId: "learner-1",
    from: "2026-08-17",
    to: "2026-08-19"
  });

  assert.deepEqual(result.totals, {
    onlineSeconds: 210,
    studySeconds: 150,
    learningDays: 2,
    startedMaterialCount: 0,
    completedMaterialCount: 0,
    completionRate: null
  });
  assert.deepEqual(
    result.daily.map((day) => day.date),
    ["2026-08-17", "2026-08-18", "2026-08-19"]
  );
});

test("概览拒绝超长和倒置日期范围并隔离其他学习者", async () => {
  await assert.rejects(() =>
    service.getOverview({
      userId: "user-1",
      learnerId: "learner-1",
      from: "2025-08-18",
      to: "2026-08-19"
    })
  );
  await assert.rejects(() =>
    service.getOverview({
      userId: "user-1",
      learnerId: "learner-1",
      from: "2026-08-20",
      to: "2026-08-19"
    })
  );
  const isolated = await service.getOverview({
    userId: "user-1",
    learnerId: "learner-1",
    from: "2026-08-19",
    to: "2026-08-19"
  });
  assert.equal(isolated.totals.onlineSeconds, 30);
  assert.equal(isolated.totals.studySeconds, 0);
  assert.equal(isolated.totals.completionRate, null);
});

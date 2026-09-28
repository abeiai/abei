import assert from "node:assert/strict";
import test from "node:test";

import { backfillLearnerLearning } from "../src/learner-learning/backfill-learner-learning.js";
import {
  buildDailySummaryRows,
  LearnerLearningMaintenanceService
} from "../src/learner-learning/learner-learning-maintenance.service.js";

const oldDate = new Date("2025-01-01T02:00:00.000Z");

function createMaintenanceFixture() {
  const summaries = new Map<string, Record<string, unknown>>();
  const slices = [
    {
      id: "slice-old",
      userId: "user-1",
      learnerId: "learner-1",
      bucketStartedAt: new Date("2026-08-19T02:00:00.000Z"),
      durationSeconds: 30,
      isLearning: true,
      scenarioId: "scenario-1",
      courseId: "course-1",
      resourceType: "TEXTBOOK",
      resourceId: "resource-1",
      materialType: "VIDEO_GUIDE",
      materialId: "video-1",
      contentVersion: "v1",
      partKey: "AUTONOMOUS"
    }
  ];
  const events = [
    {
      id: "event-old",
      userId: "user-1",
      learnerId: "learner-1",
      occurredAt: new Date("2026-08-19T02:00:01.000Z"),
      eventType: "PRACTICE_SUBMITTED",
      scenarioId: "scenario-1",
      courseId: "course-1",
      resourceType: "TEXTBOOK",
      resourceId: "resource-1",
      materialType: "VIDEO_GUIDE",
      materialId: "video-1",
      partKey: "PRACTICE",
      metrics: { isCorrect: true }
    }
  ];
  let sessions = [{ id: "session-old", lastHeartbeatAt: oldDate, endedAt: oldDate }];
  const keyOf = (input: { learnerId: string; summaryDate: Date; scopeType: string; scopeKey: string }) => `${input.learnerId}:${input.summaryDate.toISOString()}:${input.scopeType}:${input.scopeKey}`;
  const prisma = {
    async $transaction<T>(promises: Promise<T>[]) { return Promise.all(promises); },
    learnerLearningTimeSlice: {
      async findMany({ where }: { where: Record<string, unknown> }) {
        if (where.userId) return slices.map(({ durationSeconds, partKey }) => ({ durationSeconds, partKey }));
        if (!(where.bucketStartedAt as { gte?: Date }).gte) return [{ id: "slice-retention", learnerId: "learner-1", bucketStartedAt: oldDate }];
        return slices;
      },
      async deleteMany() { return { count: 1 }; }
    },
    learnerActivityEvent: {
      async findMany({ where }: { where: Record<string, unknown> }) {
        return !(where.occurredAt as { gte?: Date }).gte
          ? [{ id: "event-retention", learnerId: "learner-1", occurredAt: oldDate }]
          : events;
      },
      async deleteMany() { return { count: 1 }; }
    },
    learnerDailyLearningSummary: {
      async upsert({ where, create, update }: { where: { learnerId_summaryDate_scopeType_scopeKey: { learnerId: string; summaryDate: Date; scopeType: string; scopeKey: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) {
        const key = keyOf(where.learnerId_summaryDate_scopeType_scopeKey);
        const row = summaries.get(key) ?? create;
        const next = { ...row, ...update };
        summaries.set(key, next);
        return next;
      },
      async findUnique() { return { id: "summary-1" }; }
    },
    learnerMaterialProgress: {
      findUnique: async () => ({ id: "progress-1" }),
      update: async () => ({ id: "progress-1" })
    },
    learnerMaterialPartProgress: { updateMany: async () => ({ count: 1 }) },
    learnerLearningSession: {
      async findMany({ where }: { where: { endedAt?: null } }) {
        return where.endedAt === null ? [] : sessions;
      },
      async updateMany() { return { count: 1 }; },
      async deleteMany() { const count = sessions.length; sessions = []; return { count }; }
    }
  };
  return { service: new LearnerLearningMaintenanceService(prisma as never), summaries };
}

test("汇总幂等重跑且使用北京时间日期", async () => {
  const { service, summaries } = createMaintenanceFixture();
  const first = await service.reconcileDate("2026-08-19");
  const second = await service.reconcileDate("2026-08-19");
  assert.deepEqual(second, first);
  const total = [...summaries.values()].find((row) => row.scopeType === "TOTAL");
  assert.equal(total?.onlineSeconds, 30);
  assert.equal(total?.studySeconds, 30);
  assert.equal(total?.practiceCorrectCount, 1);
});

test("每日汇总按总计和各上下文维度生成", () => {
  const rows = buildDailySummaryRows(
    [{ userId: "user-1", learnerId: "learner-1", durationSeconds: 30, isLearning: true, scenarioId: "scenario-1", materialType: "VIDEO_GUIDE", materialId: "video-1", partKey: "AUTONOMOUS" }],
    [{ userId: "user-1", learnerId: "learner-1", eventType: "MATERIAL_COMPLETED", scenarioId: "scenario-1", materialType: "VIDEO_GUIDE", materialId: "video-1" }]
  );
  assert.deepEqual(new Set(rows.map((row) => row.scopeType)), new Set(["TOTAL", "SCENARIO", "MATERIAL", "PART"]));
  assert.equal(rows.find((row) => row.scopeType === "TOTAL")?.completedMaterialCount, 1);
});

test("只删除 180 天前且已汇总的原始数据", async () => {
  const { service } = createMaintenanceFixture();
  const result = await service.deleteExpiredRawData(new Date("2026-08-19T00:00:00.000Z"));
  assert.equal(result.deletedUnaggregatedCount, 0);
  assert.equal(result.deletedAggregatedCount, 3);
});

test("历史回填幂等且不生成在线或学习时长", async () => {
  const progress = new Map<string, Record<string, unknown>>();
  let dailySummary: Record<string, unknown> = {};
  const prisma = {
    learningFlashcardReview: { findMany: async () => [{ id: "review-1", userId: "user-1", learnerId: "learner-1", deckId: "deck-1", grade: "MASTERED", createdAt: new Date("2026-08-19T02:00:00.000Z"), deck: { updatedAt: new Date("2026-08-18T02:00:00.000Z") } }] },
    learnerActivityEvent: { findMany: async () => [] },
    learnerMaterialProgress: {
      async findUnique() { return progress.get("deck-1") ?? null; },
      async upsert({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) { const row = progress.get("deck-1") ?? { id: "progress-1", ...create }; const next = { ...row, ...update }; progress.set("deck-1", next); return next; }
    },
    learnerMaterialPartProgress: { upsert: async () => ({ id: "part-1" }) },
    learnerDailyLearningSummary: { async upsert({ create }: { create: Record<string, unknown> }) { dailySummary = { ...dailySummary, ...create }; return dailySummary; } }
  };
  const first = await backfillLearnerLearning(prisma as never);
  const second = await backfillLearnerLearning(prisma as never);
  assert.equal(first.createdProgressCount, 1);
  assert.equal(second.createdProgressCount, 0);
  assert.equal(dailySummary.onlineSeconds, 0);
  assert.equal(dailySummary.studySeconds, 0);
});

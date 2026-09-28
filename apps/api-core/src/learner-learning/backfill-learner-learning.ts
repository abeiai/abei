import { pathToFileURL } from "node:url";

import { getPrismaClient, type PrismaClient } from "@xueleai/database";

import { shanghaiDateKey } from "./learner-learning-time.js";

export interface LearnerLearningBackfillResult {
  scannedCount: number;
  createdProgressCount: number;
  skippedCount: number;
  failedCount: number;
}

export async function backfillLearnerLearning(
  prisma: PrismaClient = getPrismaClient()
): Promise<LearnerLearningBackfillResult> {
  const [reviews, completedEvents] = await Promise.all([
    prisma.learningFlashcardReview.findMany({
      where: { learnerId: { not: null } },
      select: {
        id: true,
        userId: true,
        learnerId: true,
        deckId: true,
        grade: true,
        createdAt: true,
        deck: { select: { updatedAt: true } }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    prisma.learnerActivityEvent.findMany({
      where: {
        eventType: "LEARNING_COMPLETED",
        materialType: { not: null },
        materialId: { not: null },
        contentVersion: { not: null }
      },
      select: {
        id: true,
        userId: true,
        learnerId: true,
        materialType: true,
        materialId: true,
        contentVersion: true,
        occurredAt: true
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }]
    })
  ]);
  const result: LearnerLearningBackfillResult = {
    scannedCount: reviews.length + completedEvents.length,
    createdProgressCount: 0,
    skippedCount: 0,
    failedCount: 0
  };
  const groupedReviews = new Map<string, (typeof reviews)[number][]>()
  for (const review of reviews) {
    if (!review.learnerId) {
      result.skippedCount += 1;
      continue;
    }
    const key = `${review.learnerId}:${review.deckId}`;
    const group = groupedReviews.get(key) ?? [];
    group.push(review);
    groupedReviews.set(key, group);
  }
  for (const group of groupedReviews.values()) {
    const first = group[0]!;
    const learnerId = first.learnerId!;
    const contentVersion = `historical:${first.deck.updatedAt.toISOString()}`;
    try {
      const key = {
        learnerId,
        materialType: "LEARNING_FLASHCARD" as const,
        materialId: first.deckId,
        contentVersion
      };
      const existing = await prisma.learnerMaterialProgress.findUnique({
        where: { learnerId_materialType_materialId_contentVersion: key },
        select: { id: true }
      });
      const last = group.at(-1)!;
      const progress = await prisma.learnerMaterialProgress.upsert({
        where: { learnerId_materialType_materialId_contentVersion: key },
        create: {
          userId: first.userId,
          learnerId,
          materialType: "LEARNING_FLASHCARD",
          materialId: first.deckId,
          contentVersion,
          status: "IN_PROGRESS",
          progressPercent: 1,
          firstStartedAt: first.createdAt,
          lastStudiedAt: last.createdAt,
          studyCount: 1
        },
        update: { lastStudiedAt: last.createdAt }
      });
      if (!existing) result.createdProgressCount += 1;
      const counts = { HARD: 0, BLURRY: 0, MASTERED: 0 };
      for (const review of group) counts[review.grade] += 1;
      await prisma.learnerMaterialPartProgress.upsert({
        where: {
          materialProgressId_partKey: {
            materialProgressId: progress.id,
            partKey: "FLASHCARD_ROUND"
          }
        },
        create: {
          materialProgressId: progress.id,
          partKey: "FLASHCARD_ROUND",
          status: "IN_PROGRESS",
          progressPercent: 1,
          firstStartedAt: first.createdAt,
          lastStudiedAt: last.createdAt,
          metrics: {
            reviewCount: group.length,
            hardCount: counts.HARD,
            blurryCount: counts.BLURRY,
            masteredCount: counts.MASTERED
          }
        },
        update: {
          lastStudiedAt: last.createdAt,
          metrics: {
            reviewCount: group.length,
            hardCount: counts.HARD,
            blurryCount: counts.BLURRY,
            masteredCount: counts.MASTERED
          }
        }
      });
      await ensureZeroTimeSummary(prisma, first.userId, learnerId, first.createdAt);
    } catch {
      result.failedCount += 1;
    }
  }
  for (const event of completedEvents) {
    if (!event.materialType || !event.materialId || !event.contentVersion) {
      result.skippedCount += 1;
      continue;
    }
    try {
      const key = {
        learnerId: event.learnerId,
        materialType: event.materialType,
        materialId: event.materialId,
        contentVersion: event.contentVersion
      };
      const existing = await prisma.learnerMaterialProgress.findUnique({
        where: { learnerId_materialType_materialId_contentVersion: key },
        select: { id: true }
      });
      await prisma.learnerMaterialProgress.upsert({
        where: { learnerId_materialType_materialId_contentVersion: key },
        create: {
          userId: event.userId,
          learnerId: event.learnerId,
          materialType: event.materialType,
          materialId: event.materialId,
          contentVersion: event.contentVersion,
          status: "COMPLETED",
          progressPercent: 100,
          firstStartedAt: event.occurredAt,
          lastStudiedAt: event.occurredAt,
          completedAt: event.occurredAt,
          studyCount: 1,
          completionCount: 1
        },
        update: {
          status: "COMPLETED",
          progressPercent: 100,
          completedAt: event.occurredAt,
          lastStudiedAt: event.occurredAt
        }
      });
      if (!existing) result.createdProgressCount += 1;
      await ensureZeroTimeSummary(
        prisma,
        event.userId,
        event.learnerId,
        event.occurredAt
      );
    } catch {
      result.failedCount += 1;
    }
  }
  return result;
}

async function ensureZeroTimeSummary(
  prisma: PrismaClient,
  userId: string,
  learnerId: string,
  occurredAt: Date
) {
  const summaryDate = new Date(`${shanghaiDateKey(occurredAt)}T00:00:00.000Z`);
  await prisma.learnerDailyLearningSummary.upsert({
    where: {
      learnerId_summaryDate_scopeType_scopeKey: {
        learnerId,
        summaryDate,
        scopeType: "TOTAL",
        scopeKey: "TOTAL"
      }
    },
    create: {
      userId,
      learnerId,
      summaryDate,
      scopeType: "TOTAL",
      scopeKey: "TOTAL",
      onlineSeconds: 0,
      studySeconds: 0
    },
    update: {}
  });
}

async function main() {
  const result = await backfillLearnerLearning();
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(`学习分析历史回填失败：${error instanceof Error ? error.name : "未知错误"}`);
    process.exitCode = 1;
  });
}

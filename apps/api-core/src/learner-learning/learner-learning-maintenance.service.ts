import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional
} from "@nestjs/common";
import { getPrismaClient, type PrismaClient } from "@xueleai/database";

import {
  learnerIdleSeconds,
  learnerLearningEnabled,
  learnerRawRetentionDays
} from "./learner-learning.constants.js";
import { shanghaiDateKey } from "./learner-learning-time.js";

export interface ReconcileResult {
  date: string;
  totalRows: number;
  dimensionRows: number;
}

export interface RetentionResult {
  deletedAggregatedCount: number;
  deletedUnaggregatedCount: 0;
}

type SummaryScope = "TOTAL" | "SCENARIO" | "COURSE" | "RESOURCE" | "MATERIAL" | "PART";
type SummaryRow = {
  userId: string;
  learnerId: string;
  scopeType: SummaryScope;
  scopeKey: string;
  scenarioId: string | null;
  courseId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  materialType: "VIDEO_GUIDE" | "ENGLISH_GUIDED_STUDY" | "LEARNING_FLASHCARD" | null;
  materialId: string | null;
  partKey: string | null;
  onlineSeconds: number;
  studySeconds: number;
  meaningfulActionCount: number;
  startedMaterialCount: number;
  completedPartCount: number;
  completedMaterialCount: number;
  practiceSubmittedCount: number;
  practiceCorrectCount: number;
  readAlongCompletedCount: number;
  flashcardReviewedCount: number;
};

const expirableLearningEventTypes = [
  "MATERIAL_STARTED",
  "MEDIA_PROGRESS",
  "NODE_LEARNED",
  "PRACTICE_SUBMITTED",
  "READ_ALONG_COMPLETED",
  "FLASHCARD_REVIEWED",
  "PART_COMPLETED",
  "MATERIAL_COMPLETED"
] as const;

const advisoryLockId = 782_609_319;

@Injectable()
export class LearnerLearningMaintenanceService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly prisma: PrismaClient;
  private readonly logger = new Logger(LearnerLearningMaintenanceService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(@Optional() prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  onModuleInit() {
    if (!learnerLearningEnabled() || process.env.LEARNER_LEARNING_MAINTENANCE_ENABLED !== "1") {
      return;
    }
    const retentionDays = this.retentionDays();
    if (process.env.NODE_ENV === "production" && retentionDays < learnerRawRetentionDays) {
      this.logger.error("学习分析原始数据保留期不能少于 180 天，维护任务未启动");
      return;
    }
    const interval = positiveInteger(
      process.env.LEARNER_LEARNING_MAINTENANCE_INTERVAL_MS,
      3_600_000
    );
    this.timer = setInterval(() => void this.runScheduled(), interval);
    this.timer.unref();
    void this.runScheduled();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async expireStaleSessions(now = new Date()) {
    const cutoff = new Date(now.getTime() - learnerIdleSeconds * 1000);
    const stale = await this.prisma.learnerLearningSession.findMany({
      where: { endedAt: null, lastHeartbeatAt: { lt: cutoff } },
      select: { id: true, lastHeartbeatAt: true }
    });
    if (!stale.length) return 0;
    const results = await this.prisma.$transaction(
      stale.map((session) =>
        this.prisma.learnerLearningSession.updateMany({
          where: { id: session.id, endedAt: null },
          data: { endedAt: session.lastHeartbeatAt, endReason: "TIMED_OUT" }
        })
      )
    );
    return results.reduce((sum, result) => sum + result.count, 0);
  }

  async reconcileDate(dateKey: string): Promise<ReconcileResult> {
    const range = dateRange(dateKey);
    const [slices, events] = await Promise.all([
      this.prisma.learnerLearningTimeSlice.findMany({
        where: { bucketStartedAt: { gte: range.start, lt: range.end } },
        select: {
          userId: true,
          learnerId: true,
          durationSeconds: true,
          isLearning: true,
          scenarioId: true,
          courseId: true,
          resourceType: true,
          resourceId: true,
          materialType: true,
          materialId: true,
          contentVersion: true,
          partKey: true
        }
      }),
      this.prisma.learnerActivityEvent.findMany({
        where: {
          occurredAt: { gte: range.start, lt: range.end },
          eventType: { in: [...expirableLearningEventTypes] }
        },
        select: {
          userId: true,
          learnerId: true,
          eventType: true,
          scenarioId: true,
          courseId: true,
          resourceType: true,
          resourceId: true,
          materialType: true,
          materialId: true,
          partKey: true,
          metrics: true
        }
      })
    ]);
    const rows = buildDailySummaryRows(slices, events);
    const summaryDate = new Date(`${dateKey}T00:00:00.000Z`);
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.learnerDailyLearningSummary.upsert({
          where: {
            learnerId_summaryDate_scopeType_scopeKey: {
              learnerId: row.learnerId,
              summaryDate,
              scopeType: row.scopeType,
              scopeKey: row.scopeKey
            }
          },
          create: { ...row, summaryDate },
          update: summaryMetrics(row)
        })
      )
    );
    await this.reconcileMaterialSeconds(slices);
    return {
      date: dateKey,
      totalRows: rows.filter((row) => row.scopeType === "TOTAL").length,
      dimensionRows: rows.filter((row) => row.scopeType !== "TOTAL").length
    };
  }

  async deleteExpiredRawData(now = new Date()): Promise<RetentionResult> {
    const cutoff = new Date(
      now.getTime() - this.retentionDays() * 86_400_000
    );
    let deletedAggregatedCount = 0;
    deletedAggregatedCount += await this.deleteAggregatedSlices(cutoff);
    deletedAggregatedCount += await this.deleteAggregatedEvents(cutoff);
    const sessions = await this.prisma.learnerLearningSession.deleteMany({
      where: {
        endedAt: { lt: cutoff },
        timeSlices: { none: {} }
      }
    });
    deletedAggregatedCount += sessions.count;
    return { deletedAggregatedCount, deletedUnaggregatedCount: 0 };
  }

  private async runScheduled() {
    const startedAt = Date.now();
    let locked = false;
    try {
      const result = await this.prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
        "SELECT pg_try_advisory_lock($1) AS locked",
        advisoryLockId
      );
      locked = result[0]?.locked === true;
      if (!locked) return;
      const now = new Date();
      await this.expireStaleSessions(now);
      const today = shanghaiDateKey(now);
      await this.reconcileDate(addDateDays(today, -1));
      await this.reconcileDate(today);
      await this.deleteExpiredRawData(now);
      this.logger.log(`学习分析维护完成，耗时 ${Date.now() - startedAt} 毫秒`);
    } catch (error) {
      this.logger.error(
        `学习分析维护失败：${error instanceof Error ? error.name : "未知错误"}`
      );
    } finally {
      if (locked) {
        await this.prisma
          .$queryRawUnsafe("SELECT pg_advisory_unlock($1)", advisoryLockId)
          .catch(() => undefined);
      }
    }
  }

  private async reconcileMaterialSeconds(
    slices: Array<{
      userId: string;
      learnerId: string;
      materialType: "VIDEO_GUIDE" | "ENGLISH_GUIDED_STUDY" | "LEARNING_FLASHCARD" | null;
      materialId: string | null;
      contentVersion: string | null;
    }>
  ) {
    const keys = new Map<string, (typeof slices)[number]>();
    for (const slice of slices) {
      if (slice.materialType && slice.materialId && slice.contentVersion) {
        keys.set(
          `${slice.learnerId}:${slice.materialType}:${slice.materialId}:${slice.contentVersion}`,
          slice
        );
      }
    }
    for (const context of keys.values()) {
      const all = await this.prisma.learnerLearningTimeSlice.findMany({
        where: {
          userId: context.userId,
          learnerId: context.learnerId,
          materialType: context.materialType!,
          materialId: context.materialId!,
          contentVersion: context.contentVersion!,
          isLearning: true
        },
        select: { durationSeconds: true, partKey: true }
      });
      const progress = await this.prisma.learnerMaterialProgress.findUnique({
        where: {
          learnerId_materialType_materialId_contentVersion: {
            learnerId: context.learnerId,
            materialType: context.materialType!,
            materialId: context.materialId!,
            contentVersion: context.contentVersion!
          }
        },
        select: { id: true }
      });
      if (!progress) continue;
      await this.prisma.learnerMaterialProgress.update({
        where: { id: progress.id },
        data: {
          activeStudySeconds: all.reduce(
            (sum, slice) => sum + slice.durationSeconds,
            0
          )
        }
      });
      const secondsByPart = new Map<string, number>();
      for (const slice of all) {
        if (!slice.partKey) continue;
        secondsByPart.set(
          slice.partKey,
          (secondsByPart.get(slice.partKey) ?? 0) + slice.durationSeconds
        );
      }
      for (const [partKey, activeStudySeconds] of secondsByPart) {
        await this.prisma.learnerMaterialPartProgress.updateMany({
          where: { materialProgressId: progress.id, partKey },
          data: { activeStudySeconds }
        });
      }
    }
  }

  private async deleteAggregatedSlices(cutoff: Date) {
    return this.deleteBatches(
      () =>
        this.prisma.learnerLearningTimeSlice.findMany({
          where: { bucketStartedAt: { lt: cutoff } },
          orderBy: [{ bucketStartedAt: "asc" }, { id: "asc" }],
          take: 1000,
          select: { id: true, learnerId: true, bucketStartedAt: true }
        }),
      (row) => row.bucketStartedAt,
      (ids) => this.prisma.learnerLearningTimeSlice.deleteMany({ where: { id: { in: ids } } })
    );
  }

  private async deleteAggregatedEvents(cutoff: Date) {
    return this.deleteBatches(
      () =>
        this.prisma.learnerActivityEvent.findMany({
          where: {
            occurredAt: { lt: cutoff },
            eventType: { in: [...expirableLearningEventTypes] }
          },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          take: 1000,
          select: { id: true, learnerId: true, occurredAt: true }
        }),
      (row) => row.occurredAt,
      (ids) => this.prisma.learnerActivityEvent.deleteMany({ where: { id: { in: ids } } })
    );
  }

  private async deleteBatches<T extends { id: string; learnerId: string }>(
    load: () => Promise<T[]>,
    dateOf: (row: T) => Date,
    remove: (ids: string[]) => Promise<{ count: number }>
  ) {
    let deleted = 0;
    let unaggregatedOffset = 0;
    while (true) {
      const batch = await load();
      if (!batch.length || unaggregatedOffset >= batch.length) break;
      const candidates = batch.slice(unaggregatedOffset);
      const eligible: string[] = [];
      let unaggregated = 0;
      for (const row of candidates) {
        const summary = await this.prisma.learnerDailyLearningSummary.findUnique({
          where: {
            learnerId_summaryDate_scopeType_scopeKey: {
              learnerId: row.learnerId,
              summaryDate: new Date(`${shanghaiDateKey(dateOf(row))}T00:00:00.000Z`),
              scopeType: "TOTAL",
              scopeKey: "TOTAL"
            }
          },
          select: { id: true }
        });
        if (summary) eligible.push(row.id);
        else unaggregated += 1;
      }
      if (eligible.length) deleted += (await remove(eligible)).count;
      unaggregatedOffset += unaggregated;
      if (batch.length < 1000 || !eligible.length) break;
    }
    return deleted;
  }

  private retentionDays() {
    return positiveInteger(
      process.env.LEARNER_LEARNING_RAW_RETENTION_DAYS,
      learnerRawRetentionDays
    );
  }
}

export function buildDailySummaryRows(
  slices: Array<Record<string, unknown>>,
  events: Array<Record<string, unknown>>
): SummaryRow[] {
  const rows = new Map<string, SummaryRow>();
  const scopes = (source: Record<string, unknown>) => {
    const result: Array<[SummaryScope, string]> = [["TOTAL", "TOTAL"]];
    if (source.scenarioId) result.push(["SCENARIO", String(source.scenarioId)]);
    if (source.courseId) result.push(["COURSE", String(source.courseId)]);
    if (source.resourceType && source.resourceId) result.push(["RESOURCE", `${source.resourceType}:${source.resourceId}`]);
    if (source.materialType && source.materialId) result.push(["MATERIAL", `${source.materialType}:${source.materialId}`]);
    if (source.materialType && source.materialId && source.partKey) result.push(["PART", `${source.materialType}:${source.materialId}:${source.partKey}`]);
    return result;
  };
  const get = (source: Record<string, unknown>, scopeType: SummaryScope, scopeKey: string) => {
    const key = `${source.learnerId}:${scopeType}:${scopeKey}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        userId: String(source.userId), learnerId: String(source.learnerId), scopeType, scopeKey,
        scenarioId: stringOrNull(source.scenarioId), courseId: stringOrNull(source.courseId),
        resourceType: stringOrNull(source.resourceType), resourceId: stringOrNull(source.resourceId),
        materialType: (source.materialType ?? null) as SummaryRow["materialType"], materialId: stringOrNull(source.materialId), partKey: stringOrNull(source.partKey),
        onlineSeconds: 0, studySeconds: 0, meaningfulActionCount: 0, startedMaterialCount: 0,
        completedPartCount: 0, completedMaterialCount: 0, practiceSubmittedCount: 0,
        practiceCorrectCount: 0, readAlongCompletedCount: 0, flashcardReviewedCount: 0
      };
      rows.set(key, row);
    }
    return row;
  };
  for (const slice of slices) for (const [scopeType, scopeKey] of scopes(slice)) {
    const row = get(slice, scopeType, scopeKey);
    row.onlineSeconds += Number(slice.durationSeconds) || 0;
    if (slice.isLearning) row.studySeconds += Number(slice.durationSeconds) || 0;
  }
  for (const event of events) for (const [scopeType, scopeKey] of scopes(event)) {
    const row = get(event, scopeType, scopeKey);
    row.meaningfulActionCount += 1;
    if (event.eventType === "MATERIAL_STARTED") row.startedMaterialCount += 1;
    if (event.eventType === "PART_COMPLETED") row.completedPartCount += 1;
    if (event.eventType === "MATERIAL_COMPLETED") row.completedMaterialCount += 1;
    if (event.eventType === "PRACTICE_SUBMITTED") {
      row.practiceSubmittedCount += 1;
      if (jsonObject(event.metrics).isCorrect === true) row.practiceCorrectCount += 1;
    }
    if (event.eventType === "READ_ALONG_COMPLETED") row.readAlongCompletedCount += 1;
    if (event.eventType === "FLASHCARD_REVIEWED") row.flashcardReviewedCount += 1;
  }
  return [...rows.values()];
}

function summaryMetrics(row: SummaryRow) {
  return {
    scenarioId: row.scenarioId,
    courseId: row.courseId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    materialType: row.materialType,
    materialId: row.materialId,
    partKey: row.partKey,
    onlineSeconds: row.onlineSeconds,
    studySeconds: row.studySeconds,
    meaningfulActionCount: row.meaningfulActionCount,
    startedMaterialCount: row.startedMaterialCount,
    completedPartCount: row.completedPartCount,
    completedMaterialCount: row.completedMaterialCount,
    practiceSubmittedCount: row.practiceSubmittedCount,
    practiceCorrectCount: row.practiceCorrectCount,
    readAlongCompletedCount: row.readAlongCompletedCount,
    flashcardReviewedCount: row.flashcardReviewedCount
  };
}

function dateRange(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error("汇总日期格式不正确");
  const start = new Date(`${value}T00:00:00.000+08:00`);
  if (Number.isNaN(start.getTime()) || shanghaiDateKey(start) !== value) throw new Error("汇总日期格式不正确");
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

function addDateDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

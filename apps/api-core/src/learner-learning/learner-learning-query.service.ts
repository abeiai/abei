import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import { getPrismaClient, type PrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { shanghaiDateKey } from "./learner-learning-time.js";
import type { LearningMaterialType } from "./learner-learning.types.js";

export interface LearnerMaterialSummary {
  materialType: LearningMaterialType;
  materialId: string;
  title: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  progressPercent: number;
  activeStudySeconds: number;
  lastStudiedAt: string;
  course: { id: string; name: string } | null;
  continueHref: string;
  detailHref: string;
}

export interface LearnerMaterialDetail extends LearnerMaterialSummary {
  contentVersion: string;
  firstStartedAt: string | null;
  completedAt: string | null;
  studyCount: number;
  completionCount: number;
  parts: Array<{
    key: string;
    label: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    progressPercent: number;
    activeStudySeconds: number;
    metrics: Record<string, number>;
  }>;
}

export interface LearnerLearningOverview {
  range: { from: string; to: string };
  totals: {
    onlineSeconds: number;
    studySeconds: number;
    learningDays: number;
    startedMaterialCount: number;
    completedMaterialCount: number;
    completionRate: number | null;
  };
  daily: Array<{ date: string; onlineSeconds: number; studySeconds: number }>;
  recentMaterials: LearnerMaterialSummary[];
}

export interface AccountLearnerLearningOverview extends LearnerLearningOverview {
  courseBreakdown: Array<{
    courseId: string;
    courseName: string;
    studySeconds: number;
    startedMaterialCount: number;
    completedMaterialCount: number;
  }>;
  materialBreakdown: Array<{
    materialType: LearningMaterialType;
    materialId: string;
    title: string;
    studySeconds: number;
    progressPercent: number;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  }>;
  scenarioBreakdown: Array<{
    scenarioId: string;
    scenarioName: string;
    onlineSeconds: number;
    studySeconds: number;
    meaningfulActionCount: number;
  }>;
  resourceBreakdown: Array<{
    resourceType: string;
    resourceId: string;
    resourceName: string;
    studySeconds: number;
    startedMaterialCount: number;
    completedMaterialCount: number;
  }>;
}

interface OverviewInput {
  userId: string;
  learnerId: string;
  from: string;
  to: string;
}

interface MaterialInput {
  userId: string;
  learnerId: string;
}

export interface AccountLearningFilters {
  from?: string;
  to?: string;
  scenarioId?: string;
  courseId?: string;
  resourceType?: string;
  resourceId?: string;
  materialType?: LearningMaterialType;
  materialId?: string;
  limit?: number;
}

type MaterialProgressRow = {
  id: string;
  materialType: LearningMaterialType;
  materialId: string;
  contentVersion: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  progressPercent: number;
  activeStudySeconds: number;
  firstStartedAt: Date | null;
  lastStudiedAt: Date | null;
  completedAt: Date | null;
  studyCount: number;
  completionCount: number;
  parts?: Array<{
    partKey: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    progressPercent: number;
    activeStudySeconds: number;
    progressData: unknown;
    metrics: unknown;
  }>;
};

const materialParts: Record<LearningMaterialType, Array<{ key: string; label: string }>> = {
  VIDEO_GUIDE: [
    { key: "AUTONOMOUS", label: "自主观看" },
    { key: "GUIDED", label: "互动讲解" },
    { key: "HIGHLIGHTS", label: "重点学习" },
    { key: "PRACTICE", label: "随堂练习" },
    { key: "READ_ALONG", label: "跟读训练" }
  ],
  ENGLISH_GUIDED_STUDY: [
    { key: "DEMONSTRATION", label: "示范朗读" },
    { key: "GUIDED", label: "逐句学习" },
    { key: "PRACTICE", label: "练习巩固" },
    { key: "READ_ALONG", label: "跟读训练" }
  ],
  LEARNING_FLASHCARD: [{ key: "FLASHCARD_ROUND", label: "闪卡复习" }],
  PICTURE_BOOK: [{ key: "READING", label: "绘本阅读" }]
};

@Injectable()
export class LearnerLearningQueryService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  defaultRange(now = new Date()) {
    const to = shanghaiDateKey(now);
    return { from: addDateDays(to, -6), to };
  }

  async getOverview(input: OverviewInput): Promise<LearnerLearningOverview> {
    const range = validateDateRange(input.from, input.to);
    const [summaries, slices, startedMaterialCount, completedMaterialCount, recent] =
      await Promise.all([
        this.prisma.learnerDailyLearningSummary.findMany({
          where: {
            userId: input.userId,
            learnerId: input.learnerId,
            scopeType: "TOTAL",
            scopeKey: "TOTAL",
            summaryDate: { gte: range.start, lt: range.endExclusive }
          },
          select: {
            summaryDate: true,
            onlineSeconds: true,
            studySeconds: true
          }
        }),
        this.prisma.learnerLearningTimeSlice.findMany({
          where: {
            userId: input.userId,
            learnerId: input.learnerId,
            bucketStartedAt: { gte: range.start, lt: range.endExclusive }
          },
          select: {
            bucketStartedAt: true,
            durationSeconds: true,
            isLearning: true
          }
        }),
        this.prisma.learnerMaterialProgress.count({
          where: {
            userId: input.userId,
            learnerId: input.learnerId,
            firstStartedAt: { gte: range.start, lt: range.endExclusive }
          }
        }),
        this.prisma.learnerMaterialProgress.count({
          where: {
            userId: input.userId,
            learnerId: input.learnerId,
            completedAt: { gte: range.start, lt: range.endExclusive }
          }
        }),
        this.prisma.learnerMaterialProgress.findMany({
          where: {
            userId: input.userId,
            learnerId: input.learnerId,
            lastStudiedAt: { not: null }
          },
          orderBy: [{ lastStudiedAt: "desc" }, { id: "desc" }],
          take: 5,
          select: {
            materialType: true,
            materialId: true,
            status: true,
            progressPercent: true,
            activeStudySeconds: true,
            lastStudiedAt: true
          }
        })
      ]);

    const summaryByDate = new Map(
      summaries.map((row) => [plainDateKey(row.summaryDate), row])
    );
    const slicesByDate = new Map<string, { onlineSeconds: number; studySeconds: number }>();
    for (const slice of slices) {
      const date = shanghaiDateKey(slice.bucketStartedAt);
      const current = slicesByDate.get(date) ?? { onlineSeconds: 0, studySeconds: 0 };
      current.onlineSeconds += slice.durationSeconds;
      if (slice.isLearning) current.studySeconds += slice.durationSeconds;
      slicesByDate.set(date, current);
    }

    const daily = range.dateKeys.map((date) => {
      const summary = summaryByDate.get(date);
      if (summary) {
        return {
          date,
          onlineSeconds: summary.onlineSeconds,
          studySeconds: summary.studySeconds
        };
      }
      const current = slicesByDate.get(date);
      return {
        date,
        onlineSeconds: current?.onlineSeconds ?? 0,
        studySeconds: current?.studySeconds ?? 0
      };
    });
    const onlineSeconds = daily.reduce((total, day) => total + day.onlineSeconds, 0);
    const studySeconds = daily.reduce((total, day) => total + day.studySeconds, 0);

    return {
      range: { from: input.from, to: input.to },
      totals: {
        onlineSeconds,
        studySeconds,
        learningDays: daily.filter((day) => day.studySeconds > 0).length,
        startedMaterialCount,
        completedMaterialCount,
        completionRate:
          startedMaterialCount > 0
            ? Math.round((completedMaterialCount / startedMaterialCount) * 100)
            : null
      },
      daily,
      recentMaterials: await Promise.all(
        recent.flatMap((row) =>
          row.lastStudiedAt
            ? [this.toMaterialSummary(input, row as MaterialProgressRow)]
            : []
        )
      )
    };
  }

  async getMaterials(input: MaterialInput & { limit?: number }) {
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const rows = await this.prisma.learnerMaterialProgress.findMany({
      where: {
        userId: input.userId,
        learnerId: input.learnerId,
        lastStudiedAt: { not: null }
      },
      orderBy: [{ lastStudiedAt: "desc" }, { id: "desc" }],
      take: limit * 3,
      select: {
        id: true,
        materialType: true,
        materialId: true,
        contentVersion: true,
        status: true,
        progressPercent: true,
        activeStudySeconds: true,
        firstStartedAt: true,
        lastStudiedAt: true,
        completedAt: true,
        studyCount: true,
        completionCount: true
      }
    });
    const seen = new Set<string>();
    const current = (rows as MaterialProgressRow[]).filter((row) => {
      const key = `${row.materialType}:${row.materialId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
    return Promise.all(current.map((row) => this.toMaterialSummary(input, row)));
  }

  async getMaterialDetail(
    input: MaterialInput & { materialType: string; materialId: string }
  ): Promise<LearnerMaterialDetail> {
    const materialType = parseMaterialType(input.materialType);
    if (!input.materialId || input.materialId.length > 128) {
      throw new AppException(40001, "课件参数不正确", HttpStatus.BAD_REQUEST);
    }
    const row = await this.prisma.learnerMaterialProgress.findFirst({
      where: {
        userId: input.userId,
        learnerId: input.learnerId,
        materialType,
        materialId: input.materialId,
        lastStudiedAt: { not: null }
      },
      orderBy: [{ lastStudiedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        materialType: true,
        materialId: true,
        contentVersion: true,
        status: true,
        progressPercent: true,
        activeStudySeconds: true,
        firstStartedAt: true,
        lastStudiedAt: true,
        completedAt: true,
        studyCount: true,
        completionCount: true,
        parts: {
          select: {
            partKey: true,
            status: true,
            progressPercent: true,
            activeStudySeconds: true,
            progressData: true,
            metrics: true
          }
        }
      }
    });
    if (!row || !row.lastStudiedAt) {
      throw new AppException(40401, "学习记录不存在", HttpStatus.NOT_FOUND);
    }
    const typedRow = row as MaterialProgressRow;
    const [summary, studySlices] = await Promise.all([
      this.toMaterialSummary(input, typedRow),
      this.prisma.learnerLearningTimeSlice.findMany({
        where: {
          userId: input.userId,
          learnerId: input.learnerId,
          materialType,
          materialId: input.materialId,
          contentVersion: typedRow.contentVersion,
          isLearning: true
        },
        select: { durationSeconds: true, partKey: true }
      })
    ]);
    const secondsByPart = new Map<string, number>();
    for (const slice of studySlices) {
      if (!slice.partKey) continue;
      secondsByPart.set(
        slice.partKey,
        (secondsByPart.get(slice.partKey) ?? 0) + slice.durationSeconds
      );
    }
    const rowsByPart = new Map((typedRow.parts ?? []).map((part) => [part.partKey, part]));
    const activeStudySeconds = studySlices.reduce(
      (total, slice) => total + slice.durationSeconds,
      0
    );
    return {
      ...summary,
      activeStudySeconds,
      contentVersion: typedRow.contentVersion,
      firstStartedAt: typedRow.firstStartedAt?.toISOString() ?? null,
      completedAt: typedRow.completedAt?.toISOString() ?? null,
      studyCount: typedRow.studyCount,
      completionCount: typedRow.completionCount,
      parts: materialParts[materialType].map(({ key, label }) => {
        const part = rowsByPart.get(key);
        return {
          key,
          label,
          status: part?.status ?? "NOT_STARTED",
          progressPercent: part?.progressPercent ?? 0,
          activeStudySeconds: secondsByPart.get(key) ?? part?.activeStudySeconds ?? 0,
          metrics: publicPartMetrics(materialType, key, part)
        };
      })
    };
  }

  async getAccountOverview(
    userId: string,
    learnerId: string,
    filters: AccountLearningFilters
  ): Promise<AccountLearnerLearningOverview> {
    await this.assertOwnedLearner(userId, learnerId);
    const defaults = this.defaultRange();
    const from = filters.from ?? defaults.from;
    const to = filters.to ?? defaults.to;
    const range = validateDateRange(from, to);
    if (filters.courseId) await this.assertAccessibleCourse(userId, filters.courseId);

    const sliceWhere = {
      userId,
      learnerId,
      bucketStartedAt: { gte: range.start, lt: range.endExclusive },
      ...(filters.scenarioId ? { scenarioId: filters.scenarioId } : {}),
      ...(filters.courseId ? { courseId: filters.courseId } : {}),
      ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
      ...(filters.resourceId ? { resourceId: filters.resourceId } : {}),
      ...(filters.materialType ? { materialType: filters.materialType } : {}),
      ...(filters.materialId ? { materialId: filters.materialId } : {})
    };
    const [slices, activityEvents] = await Promise.all([
      this.prisma.learnerLearningTimeSlice.findMany({
        where: sliceWhere,
        select: {
          bucketStartedAt: true,
          durationSeconds: true,
          isLearning: true,
          scenarioId: true,
          courseId: true,
          resourceType: true,
          resourceId: true,
          materialType: true,
          materialId: true
        }
      }),
      this.prisma.learnerActivityEvent.findMany({
        where: {
          userId,
          learnerId,
          occurredAt: { gte: range.start, lt: range.endExclusive },
          ...(filters.scenarioId ? { scenarioId: filters.scenarioId } : {}),
          ...(filters.courseId ? { courseId: filters.courseId } : {}),
          ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
          ...(filters.resourceId ? { resourceId: filters.resourceId } : {}),
          ...(filters.materialType ? { materialType: filters.materialType } : {}),
          ...(filters.materialId ? { materialId: filters.materialId } : {})
        },
        select: { scenarioId: true }
      })
    ]);
    const materialKeys = new Set(
      slices.flatMap((slice) =>
        slice.materialType && slice.materialId
          ? [`${slice.materialType}:${slice.materialId}`]
          : []
      )
    );
    const allProgress = (await this.prisma.learnerMaterialProgress.findMany({
      where: { userId, learnerId },
      orderBy: [{ lastStudiedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        materialType: true,
        materialId: true,
        contentVersion: true,
        status: true,
        progressPercent: true,
        activeStudySeconds: true,
        firstStartedAt: true,
        lastStudiedAt: true,
        completedAt: true,
        studyCount: true,
        completionCount: true
      }
    })) as MaterialProgressRow[];
    const currentProgress = latestMaterialVersions(allProgress).filter((row) => {
      if (filters.materialType && row.materialType !== filters.materialType) return false;
      if (filters.materialId && row.materialId !== filters.materialId) return false;
      const hasContextFilter = Boolean(
        filters.scenarioId ||
          filters.courseId ||
          filters.resourceType ||
          filters.resourceId
      );
      return !hasContextFilter || materialKeys.has(`${row.materialType}:${row.materialId}`);
    });
    const startedMaterialCount = currentProgress.filter(
      (row) => row.firstStartedAt && row.firstStartedAt >= range.start && row.firstStartedAt < range.endExclusive
    ).length;
    const completedMaterialCount = currentProgress.filter(
      (row) => row.completedAt && row.completedAt >= range.start && row.completedAt < range.endExclusive
    ).length;
    const dailyMap = new Map<string, { onlineSeconds: number; studySeconds: number }>();
    for (const slice of slices) {
      const date = shanghaiDateKey(slice.bucketStartedAt);
      const day = dailyMap.get(date) ?? { onlineSeconds: 0, studySeconds: 0 };
      day.onlineSeconds += slice.durationSeconds;
      if (slice.isLearning) day.studySeconds += slice.durationSeconds;
      dailyMap.set(date, day);
    }
    const daily = range.dateKeys.map((date) => ({
      date,
      onlineSeconds: dailyMap.get(date)?.onlineSeconds ?? 0,
      studySeconds: dailyMap.get(date)?.studySeconds ?? 0
    }));
    const onlineSeconds = daily.reduce((sum, day) => sum + day.onlineSeconds, 0);
    const studySeconds = daily.reduce((sum, day) => sum + day.studySeconds, 0);
    const [courseBreakdown, materialBreakdown, scenarioBreakdown, resourceBreakdown] =
      await Promise.all([
        this.buildCourseBreakdown(slices, currentProgress),
        this.buildMaterialBreakdown(slices, currentProgress),
        this.buildScenarioBreakdown(slices, activityEvents),
        this.buildResourceBreakdown(slices, currentProgress)
      ]);
    const recentRows = currentProgress
      .filter((row) => row.lastStudiedAt)
      .slice(0, Math.min(100, Math.max(1, filters.limit ?? 5)));
    return {
      range: { from, to },
      totals: {
        onlineSeconds,
        studySeconds,
        learningDays: daily.filter((day) => day.studySeconds > 0).length,
        startedMaterialCount,
        completedMaterialCount,
        completionRate:
          startedMaterialCount > 0
            ? Math.round((completedMaterialCount / startedMaterialCount) * 100)
            : null
      },
      daily,
      recentMaterials: await Promise.all(
        recentRows.map((row) => this.toMaterialSummary({ userId, learnerId }, row))
      ),
      courseBreakdown,
      materialBreakdown,
      scenarioBreakdown,
      resourceBreakdown
    };
  }

  async getAccountMaterials(
    userId: string,
    learnerId: string,
    filters: AccountLearningFilters
  ) {
    const overview = await this.getAccountOverview(userId, learnerId, {
      ...filters,
      limit: filters.limit ?? 20
    });
    const allowed = new Set(
      overview.materialBreakdown.map((row) => `${row.materialType}:${row.materialId}`)
    );
    return overview.recentMaterials.filter((row) =>
      allowed.has(`${row.materialType}:${row.materialId}`)
    );
  }

  async getAccountMaterialDetail(
    userId: string,
    learnerId: string,
    materialType: string,
    materialId: string
  ) {
    await this.assertOwnedLearner(userId, learnerId);
    return this.getMaterialDetail({ userId, learnerId, materialType, materialId });
  }

  private async assertOwnedLearner(userId: string, learnerId: string) {
    const learner = await this.prisma.learner.findFirst({
      where: { id: learnerId, userId },
      select: { id: true }
    });
    if (!learner) {
      throw new AppException(40301, "无权查看该学习者", HttpStatus.FORBIDDEN);
    }
  }

  private async assertAccessibleCourse(userId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        OR: [{ userId }, { enrollments: { some: { userId } } }]
      },
      select: { id: true }
    });
    if (!course) {
      throw new AppException(40301, "无权查看该课程", HttpStatus.FORBIDDEN);
    }
  }

  private async buildCourseBreakdown(
    slices: Array<{
      durationSeconds: number;
      isLearning: boolean;
      courseId: string | null;
      materialType: LearningMaterialType | null;
      materialId: string | null;
    }>,
    progress: MaterialProgressRow[]
  ) {
    const grouped = groupSlices(slices, (slice) => slice.courseId);
    return Promise.all(
      [...grouped.entries()].map(async ([courseId, group]) => {
        const course = await this.prisma.course.findUnique({
          where: { id: courseId },
          select: { approvedRevision: { select: { name: true } } }
        });
        const keys = materialKeySet(group);
        return {
          courseId,
          courseName: course?.approvedRevision?.name ?? "课程",
          studySeconds: learningSeconds(group),
          startedMaterialCount: progress.filter((row) => keys.has(materialKey(row))).length,
          completedMaterialCount: progress.filter(
            (row) => keys.has(materialKey(row)) && row.status === "COMPLETED"
          ).length
        };
      })
    );
  }

  private async buildMaterialBreakdown(
    slices: Array<{
      durationSeconds: number;
      isLearning: boolean;
      materialType: LearningMaterialType | null;
      materialId: string | null;
    }>,
    progress: MaterialProgressRow[]
  ) {
    const grouped = groupSlices(slices, (slice) =>
      slice.materialType && slice.materialId
        ? `${slice.materialType}:${slice.materialId}`
        : null
    );
    return Promise.all(
      [...grouped.entries()].map(async ([key, group]) => {
        const [materialType, ...idParts] = key.split(":");
        const materialId = idParts.join(":");
        const type = parseMaterialType(materialType!);
        const row = progress.find(
          (candidate) => candidate.materialType === type && candidate.materialId === materialId
        );
        return {
          materialType: type,
          materialId,
          title: (await this.loadMaterial(type, materialId)).title,
          studySeconds: learningSeconds(group),
          progressPercent: row?.progressPercent ?? 0,
          status: row?.status ?? "NOT_STARTED"
        };
      })
    );
  }

  private async buildScenarioBreakdown(
    slices: Array<{
      durationSeconds: number;
      isLearning: boolean;
      scenarioId: string | null;
    }>,
    events: Array<{ scenarioId: string | null }>
  ) {
    const grouped = groupSlices(slices, (slice) => slice.scenarioId);
    const eventCounts = new Map<string, number>();
    for (const event of events) {
      if (!event.scenarioId) continue;
      eventCounts.set(event.scenarioId, (eventCounts.get(event.scenarioId) ?? 0) + 1);
      if (!grouped.has(event.scenarioId)) grouped.set(event.scenarioId, []);
    }
    return Promise.all(
      [...grouped.entries()].map(async ([scenarioId, group]) => {
        const scenario = await this.prisma.aiScenario.findUnique({
          where: { id: scenarioId },
          select: { name: true }
        });
        return {
          scenarioId,
          scenarioName: scenario?.name ?? "应用",
          onlineSeconds: group.reduce((sum, slice) => sum + slice.durationSeconds, 0),
          studySeconds: learningSeconds(group),
          meaningfulActionCount: eventCounts.get(scenarioId) ?? 0
        };
      })
    );
  }

  private async buildResourceBreakdown(
    slices: Array<{
      durationSeconds: number;
      isLearning: boolean;
      resourceType: string | null;
      resourceId: string | null;
      materialType: LearningMaterialType | null;
      materialId: string | null;
    }>,
    progress: MaterialProgressRow[]
  ) {
    const grouped = groupSlices(slices, (slice) =>
      slice.resourceType && slice.resourceId
        ? `${slice.resourceType}:${slice.resourceId}`
        : null
    );
    return [...grouped.entries()].map(([key, group]) => {
      const [resourceType, ...idParts] = key.split(":");
      const resourceId = idParts.join(":");
      const keys = materialKeySet(group);
      return {
        resourceType: resourceType!,
        resourceId,
        resourceName: resourceId,
        studySeconds: learningSeconds(group),
        startedMaterialCount: progress.filter((row) => keys.has(materialKey(row))).length,
        completedMaterialCount: progress.filter(
          (row) => keys.has(materialKey(row)) && row.status === "COMPLETED"
        ).length
      };
    });
  }

  private async toMaterialSummary(
    input: MaterialInput,
    row: MaterialProgressRow
  ): Promise<LearnerMaterialSummary> {
    if (!row.lastStudiedAt) {
      throw new AppException(40401, "学习记录不存在", HttpStatus.NOT_FOUND);
    }
    const sliceWhere = {
      userId: input.userId,
      learnerId: input.learnerId,
      materialType: row.materialType,
      materialId: row.materialId,
      contentVersion: row.contentVersion
    };
    const [context, studySlices] = await Promise.all([
      this.prisma.learnerLearningTimeSlice.findFirst({
        where: sliceWhere,
        orderBy: [{ bucketStartedAt: "desc" }, { id: "desc" }],
        select: { courseId: true, courseRevisionItemId: true }
      }),
      this.prisma.learnerLearningTimeSlice.findMany({
        where: { ...sliceWhere, isLearning: true },
        select: { durationSeconds: true }
      })
    ]);
    const presentation = await this.materialPresentation(row, context);
    return {
      materialType: row.materialType,
      materialId: row.materialId,
      title: presentation.title,
      status: row.status,
      progressPercent: row.progressPercent,
      activeStudySeconds: studySlices.reduce(
        (total, slice) => total + slice.durationSeconds,
        0
      ) || row.activeStudySeconds,
      lastStudiedAt: row.lastStudiedAt.toISOString(),
      course: presentation.course,
      continueHref: appendCourseContext(presentation.href, context),
      detailHref: `/learn/center/materials/${row.materialType}/${encodeURIComponent(row.materialId)}`
    };
  }

  private async materialPresentation(
    row: Pick<MaterialProgressRow, "materialType" | "materialId">,
    context: { courseId: string | null; courseRevisionItemId: string | null } | null
  ) {
    const [material, item, course] = await Promise.all([
      this.loadMaterial(row.materialType, row.materialId),
      context?.courseRevisionItemId
        ? this.prisma.courseRevisionItem.findUnique({
            where: { id: context.courseRevisionItemId },
            select: {
              displayName: true,
              revision: { select: { courseId: true, name: true } }
            }
          })
        : null,
      !context?.courseRevisionItemId && context?.courseId
        ? this.prisma.course.findUnique({
            where: { id: context.courseId },
            select: {
              id: true,
              approvedRevision: { select: { name: true } }
            }
          })
        : null
    ]);
    const courseInfo = item
      ? { id: item.revision.courseId, name: item.revision.name }
      : course
        ? { id: course.id, name: course.approvedRevision?.name ?? "课程" }
        : null;
    return {
      title: item?.displayName ?? material.title,
      href: material.href,
      course: courseInfo
    };
  }

  private async loadMaterial(type: LearningMaterialType, id: string) {
    if (type === "VIDEO_GUIDE") {
      const row = await this.prisma.videoGuideLesson.findUnique({
        where: { id },
        select: { title: true, shareToken: true }
      });
      return {
        title: row?.title ?? materialTypeLabel(type),
        href: `/media-tutor/${encodeURIComponent(row?.shareToken ?? id)}`
      };
    }
    if (type === "ENGLISH_GUIDED_STUDY") {
      const row = await this.prisma.englishGuidedStudyMaterial.findUnique({
        where: { id },
        select: { title: true, content: true }
      });
      const scene = jsonObject(row?.content)?.scene;
      return {
        title: row?.title ?? materialTypeLabel(type),
        href: `/${scene === "GUSHIWEN" ? "gushiwen" : "text2lesson"}/${encodeURIComponent(id)}`
      };
    }
    if (type === "PICTURE_BOOK") {
      const row = await this.prisma.pictureBook.findUnique({ where: { id }, select: { title: true } });
      return { title: row?.title ?? "绘本", href: `/picture-books/${encodeURIComponent(id)}/play` };
    }
    const row = await this.prisma.learningFlashcardDeck.findUnique({
      where: { id },
      select: { title: true }
    });
    return {
      title: row?.title ?? materialTypeLabel(type),
      href: `/flashcard/${encodeURIComponent(id)}`
    };
  }
}

function groupSlices<T>(rows: T[], keyOf: (row: T) => string | null) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function learningSeconds(rows: Array<{ durationSeconds: number; isLearning: boolean }>) {
  return rows.reduce(
    (sum, row) => sum + (row.isLearning ? row.durationSeconds : 0),
    0
  );
}

function materialKey(row: {
  materialType: LearningMaterialType;
  materialId: string;
}) {
  return `${row.materialType}:${row.materialId}`;
}

function materialKeySet(
  rows: Array<{
    materialType: LearningMaterialType | null;
    materialId: string | null;
  }>
) {
  return new Set(
    rows.flatMap((row) =>
      row.materialType && row.materialId
        ? [`${row.materialType}:${row.materialId}`]
        : []
    )
  );
}

function latestMaterialVersions(rows: MaterialProgressRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = materialKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validateDateRange(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(from) || !/^\d{4}-\d{2}-\d{2}$/u.test(to)) {
    throw new AppException(40001, "日期格式不正确", HttpStatus.BAD_REQUEST);
  }
  const start = new Date(`${from}T00:00:00.000+08:00`);
  const inclusiveEnd = new Date(`${to}T00:00:00.000+08:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(inclusiveEnd.getTime()) ||
    shanghaiDateKey(start) !== from ||
    shanghaiDateKey(inclusiveEnd) !== to ||
    start > inclusiveEnd
  ) {
    throw new AppException(40001, "日期范围不正确", HttpStatus.BAD_REQUEST);
  }
  const days = Math.floor((inclusiveEnd.getTime() - start.getTime()) / 86_400_000);
  if (days > 365) {
    throw new AppException(40001, "查询范围不能超过 366 天", HttpStatus.BAD_REQUEST);
  }
  const dateKeys = Array.from({ length: days + 1 }, (_, index) =>
    addDateDays(from, index)
  );
  return {
    start,
    endExclusive: new Date(inclusiveEnd.getTime() + 86_400_000),
    dateKeys
  };
}

function addDateDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

function plainDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function materialTypeLabel(type: LearningMaterialType) {
  if (type === "VIDEO_GUIDE") return "视频导学";
  if (type === "ENGLISH_GUIDED_STUDY") return "英文带学";
  return type === "PICTURE_BOOK" ? "绘本" : "学习闪卡";
}

function parseMaterialType(value: string): LearningMaterialType {
  if (
    value === "VIDEO_GUIDE" ||
    value === "ENGLISH_GUIDED_STUDY" ||
    value === "LEARNING_FLASHCARD" ||
    value === "PICTURE_BOOK"
  ) {
    return value;
  }
  throw new AppException(40001, "课件类型不正确", HttpStatus.BAD_REQUEST);
}

function appendCourseContext(
  href: string,
  context: { courseId: string | null; courseRevisionItemId: string | null } | null
) {
  const params = new URLSearchParams();
  if (context?.courseId) params.set("courseId", context.courseId);
  if (context?.courseRevisionItemId) {
    params.set("courseRevisionItemId", context.courseRevisionItemId);
  }
  const query = params.toString();
  return query ? `${href}?${query}` : href;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function publicPartMetrics(
  materialType: LearningMaterialType,
  partKey: string,
  part:
    | {
        progressPercent: number;
        progressData: unknown;
        metrics: unknown;
      }
    | undefined
): Record<string, number> {
  if (!part) return {};
  const data = jsonObject(part.progressData);
  const metrics = jsonObject(part.metrics);
  if (materialType === "LEARNING_FLASHCARD") {
    return Object.fromEntries(
      ["reviewCount", "hardCount", "blurryCount", "masteredCount"].map((key) => [
        key,
        numberMetric(metrics[key])
      ])
    );
  }
  if (partKey === "AUTONOMOUS" || partKey === "DEMONSTRATION") {
    return {
      coveragePercent: part.progressPercent,
      playedSeconds: playbackSeconds(data.playedRanges)
    };
  }
  if (partKey === "PRACTICE") {
    return {
      submittedCount: Array.isArray(data.submittedIds)
        ? data.submittedIds.length
        : numberMetric(metrics.submittedCount),
      correctCount: Array.isArray(data.correctIds)
        ? data.correctIds.length
        : numberMetric(metrics.correctCount)
    };
  }
  return {
    completedNodeCount: Array.isArray(data.completedIds)
      ? data.completedIds.length
      : numberMetric(metrics.completedNodeCount)
  };
}

function playbackSeconds(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return Math.round(
    value.reduce((total, range) => {
      const item = jsonObject(range);
      const start = numberMetric(item.startSeconds);
      const end = numberMetric(item.endSeconds);
      return total + Math.max(0, end - start);
    }, 0)
  );
}

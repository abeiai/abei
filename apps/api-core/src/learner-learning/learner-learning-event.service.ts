import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { getPrismaClient, type Prisma, type PrismaClient } from "@xueleai/database";
import { createHash } from "node:crypto";
import { AppException } from "../common/app-exception.js";
import { LearnerActivityService } from "../profiles/learner-activity.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import type {
  LearnerLearningEventDto,
  RecordLearnerLearningEventsDto
} from "./dto/learner-learning.dto.js";
import { LearnerLearningContextService } from "./learner-learning-context.service.js";
import {
  coveragePercent,
  evaluateMaterialProgress,
  evaluatePartProgress,
  mergePlaybackRanges,
  mergeStableIds,
  type PartProgressResult,
  type PlaybackRange
} from "./learner-learning-progress.js";
import type {
  LearningMaterialType,
  ResolvedLearningContext
} from "./learner-learning.types.js";

interface MaterialFacts {
  snapshot: Record<string, unknown>;
  partKeys: string[];
  questions: Map<string, number>;
  guidedIds: Set<string>;
  highlightIds: Set<string>;
  readAlongIds: Set<string>;
  cardIds: Set<string>;
  mediaDurationSeconds: number | null;
}

interface EventProgressUpdate {
  result: PartProgressResult;
  progressData: Record<string, unknown>;
  metrics: Record<string, boolean | number | string>;
  itemKey: string | null;
}

type MaterialLearningContext = ResolvedLearningContext & {
  materialType: LearningMaterialType;
  materialId: string;
  contentVersion: string;
};

const partsByEventType: Partial<Record<LearnerLearningEventDto["type"], readonly string[]>> = {
  MEDIA_PROGRESS: ["AUTONOMOUS", "DEMONSTRATION"],
  NODE_LEARNED: ["GUIDED", "HIGHLIGHTS", "READING"],
  PRACTICE_SUBMITTED: ["PRACTICE"],
  READ_ALONG_COMPLETED: ["READ_ALONG"],
  FLASHCARD_REVIEWED: ["FLASHCARD_ROUND"]
};

@Injectable()
export class LearnerLearningEventService {
  private readonly prisma: PrismaClient;

  constructor(
    @Inject(LearnerLearningContextService)
    private readonly contextService: LearnerLearningContextService,
    @Inject(LearnerActivityService)
    private readonly activityService: LearnerActivityService,
    @Optional() prisma?: PrismaClient
  ) {
    this.prisma = prisma ?? getPrismaClient();
  }

  async recordBatch(
    subject: ProfileSubject,
    refreshTokenId: string,
    sessionId: string,
    dto: RecordLearnerLearningEventsDto,
    now = new Date()
  ) {
    if (subject.mode !== "LEARNER") {
      throw new AppException(40301, "请使用学习者身份记录学习情况", HttpStatus.FORBIDDEN);
    }
    this.validateBatch(dto.events, now);

    return this.prisma.$transaction(
      async (transaction) => {
        const session = await transaction.learnerLearningSession.findFirst({
          where: {
            id: sessionId,
            userId: subject.userId,
            learnerId: subject.learnerId,
            profileSessionId: refreshTokenId,
            endedAt: null
          },
          select: { id: true }
        });
        if (!session) {
          throw new AppException(40301, "学习会话不存在或已结束", HttpStatus.FORBIDDEN);
        }

        const acceptedEventIds: string[] = [];
        let acceptedCount = 0;
        for (const event of dto.events) {
          const idempotencyKey = learningEventIdempotencyKey(sessionId, event.eventId);
          const existing = await transaction.learnerActivityEvent.findUnique({
            where: { idempotencyKey },
            select: { id: true }
          });
          if (existing) {
            acceptedEventIds.push(event.eventId);
            continue;
          }

          const context = requireMaterialContext(
            await this.contextService.resolve(subject, {
              ...event.context,
              isLearning: true,
              partKey: event.partKey
            })
          );
          const facts = await this.loadMaterialFacts(transaction, context);
          this.assertPartExists(event.partKey, facts.partKeys);
          this.assertEventPart(event);
          await this.applyEvent(
            transaction,
            subject,
            sessionId,
            event,
            context,
            facts,
            idempotencyKey,
            now
          );
          acceptedEventIds.push(event.eventId);
          acceptedCount += 1;
        }

        return { acceptedCount, acceptedEventIds };
      },
      { isolationLevel: "Serializable" }
    );
  }

  private async applyEvent(
    transaction: Prisma.TransactionClient,
    subject: Extract<ProfileSubject, { mode: "LEARNER" }>,
    sessionId: string,
    event: LearnerLearningEventDto,
    context: MaterialLearningContext,
    facts: MaterialFacts,
    idempotencyKey: string,
    now: Date
  ) {
    const materialKey = {
      learnerId: subject.learnerId,
      materialType: context.materialType,
      materialId: context.materialId,
      contentVersion: context.contentVersion
    };
    const existingMaterial = await transaction.learnerMaterialProgress.findUnique({
      where: { learnerId_materialType_materialId_contentVersion: materialKey }
    });
    const materialProgress = await transaction.learnerMaterialProgress.upsert({
      where: { learnerId_materialType_materialId_contentVersion: materialKey },
      create: {
        userId: subject.userId,
        learnerId: subject.learnerId,
        materialType: context.materialType,
        materialId: context.materialId,
        contentVersion: context.contentVersion,
        status: "IN_PROGRESS",
        progressPercent: 0,
        firstStartedAt: now,
        lastStudiedAt: now,
        studyCount: 1
      },
      update: {
        firstStartedAt: existingMaterial?.firstStartedAt ?? now,
        lastStudiedAt: now,
        ...(event.type === "MATERIAL_STARTED" && existingMaterial
          ? { studyCount: { increment: 1 } }
          : {})
      }
    });
    const existingPart = await transaction.learnerMaterialPartProgress.findUnique({
      where: {
        materialProgressId_partKey: {
          materialProgressId: materialProgress.id,
          partKey: event.partKey
        }
      }
    });
    const progressUpdate = await this.eventProgressUpdate(
      transaction,
      subject,
      event,
      context,
      facts,
      jsonRecord(existingPart?.progressData)
    );
    const partCompletedNow =
      existingPart?.status !== "COMPLETED" &&
      progressUpdate.result.status === "COMPLETED";
    const part = await transaction.learnerMaterialPartProgress.upsert({
      where: {
        materialProgressId_partKey: {
          materialProgressId: materialProgress.id,
          partKey: event.partKey
        }
      },
      create: {
        materialProgressId: materialProgress.id,
        partKey: event.partKey,
        status: progressUpdate.result.status,
        progressPercent: progressUpdate.result.progressPercent,
        firstStartedAt: now,
        lastStudiedAt: now,
        completedAt: progressUpdate.result.status === "COMPLETED" ? now : null,
        progressData: progressUpdate.progressData as Prisma.InputJsonValue,
        metrics: progressUpdate.metrics as Prisma.InputJsonValue
      },
      update: {
        status: progressUpdate.result.status,
        progressPercent: progressUpdate.result.progressPercent,
        firstStartedAt: existingPart?.firstStartedAt ?? now,
        lastStudiedAt: now,
        completedAt: partCompletedNow ? now : existingPart?.completedAt,
        progressData: progressUpdate.progressData as Prisma.InputJsonValue,
        metrics: progressUpdate.metrics as Prisma.InputJsonValue
      }
    });

    const storedParts = await transaction.learnerMaterialPartProgress.findMany({
      where: { materialProgressId: materialProgress.id },
      select: { partKey: true, status: true, progressPercent: true }
    });
    const storedByKey = new Map(storedParts.map((row) => [row.partKey, row]));
    storedByKey.set(part.partKey, part);
    const materialResult = evaluateMaterialProgress(
      facts.partKeys.map((partKey) => {
        const row = storedByKey.get(partKey);
        return row
          ? { status: row.status, progressPercent: row.progressPercent }
          : { status: "NOT_STARTED" as const, progressPercent: 0 };
      })
    );
    const materialCompletedNow =
      existingMaterial?.status !== "COMPLETED" && materialResult.status === "COMPLETED";
    await transaction.learnerMaterialProgress.update({
      where: { id: materialProgress.id },
      data: {
        status: materialResult.status,
        progressPercent: materialResult.progressPercent,
        lastStudiedAt: now,
        lastPosition: {
          partKey: event.partKey,
          itemKey: progressUpdate.itemKey
        },
        completedAt: materialCompletedNow ? now : existingMaterial?.completedAt,
        ...(materialCompletedNow ? { completionCount: { increment: 1 } } : {})
      }
    });

    await this.activityService.record(
      {
        subject,
        eventType: event.type,
        ...this.activityContext(context),
        partKey: event.partKey,
        itemKey: progressUpdate.itemKey,
        idempotencyKey,
        occurredAt: new Date(event.occurredAt),
        metrics: progressUpdate.metrics
      },
      transaction
    );
    if (partCompletedNow) {
      await this.activityService.record(
        {
          subject,
          eventType: "PART_COMPLETED",
          ...this.activityContext(context),
          partKey: event.partKey,
          idempotencyKey: `${idempotencyKey}:part`,
          occurredAt: now,
          metrics: { coveragePercent: progressUpdate.result.progressPercent }
        },
        transaction
      );
    }
    if (materialCompletedNow) {
      await this.activityService.record(
        {
          subject,
          eventType: "MATERIAL_COMPLETED",
          ...this.activityContext(context),
          idempotencyKey: `${idempotencyKey}:material`,
          occurredAt: now,
          metrics: { coveragePercent: materialResult.progressPercent }
        },
        transaction
      );
    }
  }

  private async eventProgressUpdate(
    transaction: Prisma.TransactionClient,
    subject: Extract<ProfileSubject, { mode: "LEARNER" }>,
    event: LearnerLearningEventDto,
    context: MaterialLearningContext,
    facts: MaterialFacts,
    current: Record<string, unknown>
  ): Promise<EventProgressUpdate> {
    if (event.type === "MATERIAL_STARTED") {
      return {
        result: { status: "IN_PROGRESS", progressPercent: 1 },
        progressData: current,
        metrics: {},
        itemKey: null
      };
    }

    if (event.type === "MEDIA_PROGRESS") {
      if (
        event.startSeconds === undefined ||
        event.endSeconds === undefined ||
        event.mediaDurationSeconds === undefined ||
        event.endSeconds <= event.startSeconds ||
        event.endSeconds - event.startSeconds > 30
      ) {
        throw new AppException(40001, "播放区间不正确", HttpStatus.BAD_REQUEST);
      }
      const duration = facts.mediaDurationSeconds ?? event.mediaDurationSeconds;
      if (duration <= 0 || event.startSeconds > duration || event.endSeconds > duration + 1) {
        throw new AppException(40001, "播放区间超出课件范围", HttpStatus.BAD_REQUEST);
      }
      const ranges = mergePlaybackRanges(
        playbackRanges(current.playedRanges),
        [{ startSeconds: event.startSeconds, endSeconds: event.endSeconds }]
      );
      const covered = coveragePercent(ranges, duration);
      return {
        result: evaluatePartProgress({ kind: "COVERAGE", completed: covered, total: 100 }),
        progressData: { playedRanges: ranges, mediaDurationSeconds: duration },
        metrics: {
          startSeconds: event.startSeconds,
          endSeconds: event.endSeconds,
          coveragePercent: covered
        },
        itemKey: null
      };
    }

    if (event.type === "PRACTICE_SUBMITTED") {
      if (!event.itemId || event.selectedIndex === undefined) {
        throw new AppException(40001, "练习提交参数不完整", HttpStatus.BAD_REQUEST);
      }
      const answer = facts.questions.get(event.itemId);
      if (answer === undefined) {
        throw new AppException(40004, "练习题不存在", HttpStatus.BAD_REQUEST);
      }
      const submittedIds = mergeStableIds(
        stringArray(current.submittedIds),
        [event.itemId],
        facts.questions.keys()
      );
      const isCorrect = answer === event.selectedIndex;
      const correctIds = mergeStableIds(
        stringArray(current.correctIds),
        isCorrect ? [event.itemId] : [],
        facts.questions.keys()
      );
      return {
        result: evaluatePartProgress({
          kind: "PRACTICE",
          completed: submittedIds.length,
          total: facts.questions.size
        }),
        progressData: { submittedIds, correctIds },
        metrics: { isCorrect },
        itemKey: event.itemId
      };
    }

    if (event.type === "FLASHCARD_REVIEWED") {
      if (!event.reviewId || context.materialType !== "LEARNING_FLASHCARD") {
        throw new AppException(40001, "闪卡复习参数不完整", HttpStatus.BAD_REQUEST);
      }
      const review = await transaction.learningFlashcardReview.findFirst({
        where: {
          id: event.reviewId,
          learnerId: subject.learnerId,
          deckId: context.materialId
        },
        select: { id: true, cardId: true, grade: true }
      });
      if (!review || !facts.cardIds.has(review.cardId)) {
        throw new AppException(40004, "闪卡复习记录不存在", HttpStatus.BAD_REQUEST);
      }
      const reviews = await transaction.learningFlashcardReview.findMany({
        where: { learnerId: subject.learnerId, deckId: context.materialId },
        select: { cardId: true, grade: true, createdAt: true },
        orderBy: { createdAt: "desc" }
      });
      const latest = new Map<string, string>();
      for (const row of reviews) {
        if (facts.cardIds.has(row.cardId) && !latest.has(row.cardId)) {
          latest.set(row.cardId, row.grade);
        }
      }
      const counts = { hardCount: 0, blurryCount: 0, masteredCount: 0 };
      for (const grade of latest.values()) {
        if (grade === "HARD") counts.hardCount += 1;
        else if (grade === "BLURRY") counts.blurryCount += 1;
        else if (grade === "MASTERED") counts.masteredCount += 1;
      }
      return {
        result: evaluatePartProgress({
          kind: "FLASHCARD_ROUND",
          completed: latest.size,
          total: facts.cardIds.size
        }),
        progressData: { reviewedCardIds: [...latest.keys()].sort() },
        metrics: { ...counts, reviewCount: latest.size },
        itemKey: review.cardId
      };
    }

    if (!event.itemId) {
      throw new AppException(40001, "学习节点参数不完整", HttpStatus.BAD_REQUEST);
    }
    const allowed = event.type === "READ_ALONG_COMPLETED"
      ? facts.readAlongIds
      : event.partKey === "HIGHLIGHTS"
        ? facts.highlightIds
        : facts.guidedIds;
    if (!allowed.has(event.itemId)) {
      throw new AppException(40004, "学习节点不存在", HttpStatus.BAD_REQUEST);
    }
    const completedIds = mergeStableIds(
      stringArray(current.completedIds),
      [event.itemId],
      allowed
    );
    return {
      result: evaluatePartProgress({
        kind: event.type === "READ_ALONG_COMPLETED" ? "READ_ALONG" : "NODES",
        completed: completedIds.length,
        total: allowed.size
      }),
      progressData: { completedIds },
      metrics: { completedNodeCount: completedIds.length },
      itemKey: event.itemId
    };
  }

  private async loadMaterialFacts(
    transaction: Prisma.TransactionClient,
    context: MaterialLearningContext
  ): Promise<MaterialFacts> {
    let snapshot: Record<string, unknown>;
    if (context.courseRevisionItemId) {
      const item = await transaction.courseRevisionItem.findFirst({
        where: {
          id: context.courseRevisionItemId,
          revisionId: context.courseRevisionId ?? undefined
        },
        select: { publication: { select: { approvedSnapshot: true, approvedHash: true } } }
      });
      if (!item?.publication.approvedSnapshot || item.publication.approvedHash !== context.contentVersion) {
        throw new AppException(40004, "课程课件版本已变更", HttpStatus.BAD_REQUEST);
      }
      snapshot = jsonRecord(item.publication.approvedSnapshot);
    } else {
      snapshot = await this.loadStandaloneSnapshot(transaction, context);
    }
    return materialFacts(context.materialType, snapshot);
  }

  private async loadStandaloneSnapshot(
    transaction: Prisma.TransactionClient,
    context: MaterialLearningContext
  ) {
    if (context.materialType === "VIDEO_GUIDE") {
      const row = await transaction.videoGuideLesson.findUnique({
        where: { id: context.materialId },
        select: { content: true }
      });
      if (!row) this.materialUnavailable();
      return jsonRecord(row.content);
    }
    if (context.materialType === "ENGLISH_GUIDED_STUDY") {
      const row = await transaction.englishGuidedStudyMaterial.findUnique({
        where: { id: context.materialId },
        select: { content: true, audioDurationSeconds: true }
      });
      if (!row) this.materialUnavailable();
      return { ...jsonRecord(row.content), audioDurationSeconds: row.audioDurationSeconds };
    }
    const row = await transaction.learningFlashcardDeck.findUnique({
      where: { id: context.materialId },
      select: { cards: { select: { id: true } } }
    });
    if (!row) this.materialUnavailable();
    return { cards: row.cards };
  }

  private materialUnavailable(): never {
    throw new AppException(40004, "学习材料不可用", HttpStatus.BAD_REQUEST);
  }

  private assertPartExists(partKey: string, partKeys: string[]) {
    if (!partKeys.includes(partKey)) {
      throw new AppException(40004, "课件学习部分不存在", HttpStatus.BAD_REQUEST);
    }
  }

  private assertEventPart(event: LearnerLearningEventDto) {
    const allowedParts = partsByEventType[event.type];
    if (allowedParts && !allowedParts.includes(event.partKey)) {
      throw new AppException(40001, "学习事件与课件部分不匹配", HttpStatus.BAD_REQUEST);
    }
  }

  private validateBatch(events: LearnerLearningEventDto[], now: Date) {
    if (!Array.isArray(events) || events.length === 0 || events.length > 50) {
      throw new AppException(40001, "学习事件参数不正确", HttpStatus.BAD_REQUEST);
    }
    const eventIds = new Set<string>();
    let previousSequence = 0;
    for (const event of events) {
      const occurredAt = new Date(event.occurredAt);
      if (
        eventIds.has(event.eventId) ||
        event.sequence <= previousSequence ||
        Number.isNaN(occurredAt.getTime()) ||
        occurredAt.getTime() > now.getTime() + 5 * 60_000
      ) {
        throw new AppException(40001, "学习事件序号或时间不正确", HttpStatus.BAD_REQUEST);
      }
      eventIds.add(event.eventId);
      previousSequence = event.sequence;
    }
  }

  private activityContext(context: ResolvedLearningContext) {
    return {
      scenarioId: context.scenarioId,
      courseId: context.courseId,
      courseRevisionId: context.courseRevisionId,
      courseRevisionItemId: context.courseRevisionItemId,
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      materialType: context.materialType,
      materialId: context.materialId,
      contentVersion: context.contentVersion
    };
  }
}

function requireMaterialContext(context: ResolvedLearningContext): MaterialLearningContext {
  if (!context.materialType || !context.materialId || !context.contentVersion) {
    throw new AppException(40004, "学习内容不存在", HttpStatus.BAD_REQUEST);
  }
  return {
    ...context,
    materialType: context.materialType,
    materialId: context.materialId,
    contentVersion: context.contentVersion
  };
}

export function learningEventIdempotencyKey(sessionId: string, eventId: string) {
  const eventHash = createHash("sha256").update(eventId).digest("hex");
  return `learning:${sessionId}:${eventHash}`;
}

function materialFacts(type: LearningMaterialType, snapshot: Record<string, unknown>): MaterialFacts {
  const questions = new Map(
    recordArray(snapshot.questions).flatMap((question) =>
      typeof question.id === "string" && Number.isInteger(question.answer)
        ? [[question.id, Number(question.answer)] as const]
        : []
    )
  );
  const narration = recordArray(snapshot.narrationTimeline);
  const narrationV2 = jsonRecord(snapshot.narrationTimelineV2);
  const guidedIds = new Set(
    [
      ...narration,
      ...recordArray(narrationV2.nodes),
      ...recordArray(snapshot.teacherSegments),
      ...recordArray(snapshot.sentences),
      ...(type === "PICTURE_BOOK" ? recordArray(snapshot.pages).map((page) => ({ id: String(page.position) })) : [])
    ]
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string")
  );
  const highlightIds = new Set(
    [...recordArray(snapshot.words), ...recordArray(snapshot.guideWords)]
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string")
  );
  const readAlong = jsonRecord(snapshot.readAlong);
  const readAlongIds = new Set(
    [
      ...recordArray(snapshot.repeatLines),
      ...recordArray(readAlong.cues),
      ...recordArray(readAlong.nodes)
    ]
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string")
  );
  const cardIds = new Set(
    recordArray(snapshot.cards)
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string")
  );
  const partKeys = type === "VIDEO_GUIDE"
    ? [
        "AUTONOMOUS",
        ...(guidedIds.size > 0 ? ["GUIDED"] : []),
        ...(highlightIds.size > 0 ? ["HIGHLIGHTS"] : []),
        ...(questions.size > 0 ? ["PRACTICE"] : []),
        ...(readAlongIds.size > 0 ? ["READ_ALONG"] : [])
      ]
    : type === "ENGLISH_GUIDED_STUDY"
      ? [
          ...(Object.keys(readAlong).length > 0 ? ["DEMONSTRATION"] : []),
          ...(guidedIds.size > 0 ? ["GUIDED"] : []),
          ...(questions.size > 0 ? ["PRACTICE"] : []),
          ...(readAlongIds.size > 0 ? ["READ_ALONG"] : [])
        ]
      : type === "PICTURE_BOOK" ? ["READING"] : ["FLASHCARD_ROUND"];
  const timelineDuration = maximumEndSeconds([
    ...recordArray(snapshot.subtitleCues),
    ...recordArray(snapshot.cues),
    ...recordArray(readAlong.cues)
  ]);
  const mediaDuration = type === "ENGLISH_GUIDED_STUDY"
    ? millisecondsToSeconds(readAlong.durationMs)
      ?? numberValue(snapshot.audioDurationSeconds)
      ?? timelineDuration
    : numberValue(snapshot.audioDurationSeconds)
      ?? millisecondsToSeconds(snapshot.audioDurationMs)
      ?? timelineDuration;
  return {
    snapshot,
    partKeys,
    questions,
    guidedIds,
    highlightIds,
    readAlongIds,
    cardIds,
    mediaDurationSeconds: mediaDuration
  };
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function playbackRanges(value: unknown): PlaybackRange[] {
  return recordArray(value).flatMap((row) => {
    const startSeconds = numberValue(row.startSeconds);
    const endSeconds = numberValue(row.endSeconds);
    return startSeconds !== null && endSeconds !== null
      ? [{ startSeconds, endSeconds }]
      : [];
  });
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function millisecondsToSeconds(value: unknown) {
  const milliseconds = numberValue(value);
  return milliseconds === null ? null : milliseconds / 1000;
}

function maximumEndSeconds(rows: Record<string, unknown>[]) {
  const values = rows
    .map((row) => numberValue(row.endSeconds))
    .filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

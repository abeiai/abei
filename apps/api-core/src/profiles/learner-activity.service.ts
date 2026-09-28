import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import { getPrismaClient, type Prisma, type PrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import type { ProfileSubject } from "./profile-context.types.js";

type LearnerActivityEventType = Prisma.LearnerActivityEventUncheckedCreateInput["eventType"];
type LearnerActivityMetrics = Record<string, boolean | number | string>;
const learnerActivityStatusPattern = /^[A-Z][A-Z0-9_]{0,79}$/;
const sensitiveMetricKeyPattern = /(prompt|password|token|cookie|secret|text|content|input|output|transcript|body|credential|authorization)/i;
const allowedTokenCountMetricKeyPattern = /^(inputTokens|outputTokens|totalTokens)$/;
const countMetricKeyPattern = /Count$/;
const statusMetricKeyPattern = /(status|state|grade|result|mode|type)$/i;
const maxActivityCountMetric = 1_000_000_000;

export interface RecordLearnerActivityInput {
  subject: ProfileSubject;
  eventType: LearnerActivityEventType;
  scenarioId?: string | null;
  courseId?: string | null;
  courseRevisionId?: string | null;
  courseRevisionItemId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  materialType?: "VIDEO_GUIDE" | "ENGLISH_GUIDED_STUDY" | "LEARNING_FLASHCARD" | null;
  materialId?: string | null;
  contentVersion?: string | null;
  partKey?: string | null;
  itemKey?: string | null;
  idempotencyKey?: string | null;
  occurredAt?: Date;
  metrics?: LearnerActivityMetrics | null;
}

@Injectable()
export class LearnerActivityService {
  private readonly prisma: PrismaClient;

  constructor(@Optional() prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  async record(input: RecordLearnerActivityInput, transaction?: Prisma.TransactionClient) {
    if (input.subject.mode !== "LEARNER") {
      return null;
    }

    this.assertResourceValue(input.resourceType, 80);
    this.assertResourceValue(input.resourceId, 80);
    this.assertResourceValue(input.courseRevisionId, 128);
    this.assertResourceValue(input.courseRevisionItemId, 128);
    this.assertResourceValue(input.materialId, 128);
    this.assertResourceValue(input.contentVersion, 160);
    this.assertResourceValue(input.partKey, 64);
    this.assertResourceValue(input.itemKey, 128);
    this.assertResourceValue(input.idempotencyKey, 160, true);
    this.assertLowSensitivityMetrics(input.metrics);

    const client = transaction ?? this.prisma;
    const create = {
      userId: input.subject.userId,
      learnerId: input.subject.learnerId,
      eventType: input.eventType,
      scenarioId: input.scenarioId ?? null,
      courseId: input.courseId ?? null,
      courseRevisionId: input.courseRevisionId ?? null,
      courseRevisionItemId: input.courseRevisionItemId ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      materialType: input.materialType ?? null,
      materialId: input.materialId ?? null,
      contentVersion: input.contentVersion ?? null,
      partKey: input.partKey ?? null,
      itemKey: input.itemKey ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      metrics: input.metrics ? input.metrics as Prisma.InputJsonValue : undefined
    } satisfies Prisma.LearnerActivityEventUncheckedCreateInput;

    if (input.idempotencyKey) {
      return client.learnerActivityEvent.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        update: {},
        create
      });
    }

    return client.learnerActivityEvent.create({ data: create });
  }

  private assertResourceValue(value: string | null | undefined, maxLength: number, requireNonEmpty = false) {
    if (value === null || value === undefined) return;
    if (typeof value !== "string" || value.length > maxLength || (requireNonEmpty && value.length === 0)) {
      throw new AppException(40001, "学习活动资源参数不正确", HttpStatus.BAD_REQUEST);
    }
  }

  private assertLowSensitivityMetrics(metrics: LearnerActivityMetrics | null | undefined) {
    if (metrics === null || metrics === undefined) return;
    if (typeof metrics !== "object" || Array.isArray(metrics)) {
      throw new AppException(40001, "学习活动指标不符合低敏数据要求", HttpStatus.BAD_REQUEST);
    }

    const entries = Object.entries(metrics);
    if (entries.length > 20) {
      throw new AppException(40001, "学习活动指标不符合低敏数据要求", HttpStatus.BAD_REQUEST);
    }

    for (const [key, value] of entries) {
      const requiresCountValue = allowedTokenCountMetricKeyPattern.test(key)
        || countMetricKeyPattern.test(key);
      if (
        key.length === 0
        || key.length > 80
        || (sensitiveMetricKeyPattern.test(key) && !allowedTokenCountMetricKeyPattern.test(key))
        || (requiresCountValue && (
          typeof value !== "number"
          || !Number.isSafeInteger(value)
          || value < 0
          || value > maxActivityCountMetric
        ))
        || (typeof value === "number" && !Number.isFinite(value))
        || (typeof value === "string" && (
          !statusMetricKeyPattern.test(key)
          || !learnerActivityStatusPattern.test(value)
        ))
        || !["boolean", "number", "string"].includes(typeof value)
      ) {
        throw new AppException(40001, "学习活动指标不符合低敏数据要求", HttpStatus.BAD_REQUEST);
      }
    }
  }
}

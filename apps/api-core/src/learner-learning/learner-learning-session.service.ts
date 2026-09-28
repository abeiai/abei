import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { getPrismaClient, type Prisma, type PrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import type {
  LearnerLearningHeartbeatDto,
  StartLearnerLearningSessionDto
} from "./dto/learner-learning.dto.js";
import { LearnerLearningContextService } from "./learner-learning-context.service.js";
import {
  canonicalBucketStart,
  heartbeatDeltaSeconds,
  heartbeatIsActive,
  preferTimeSlice,
  shanghaiDateKey
} from "./learner-learning-time.js";
import type { ResolvedLearningContext } from "./learner-learning.types.js";

type SessionTransaction = Prisma.TransactionClient;

@Injectable()
export class LearnerLearningSessionService {
  private readonly prisma: PrismaClient;

  constructor(
    @Inject(LearnerLearningContextService)
    private readonly contextService: LearnerLearningContextService,
    @Optional() prisma?: PrismaClient
  ) {
    this.prisma = prisma ?? getPrismaClient();
  }

  async start(
    subject: ProfileSubject,
    refreshTokenId: string,
    dto: StartLearnerLearningSessionDto,
    now = new Date()
  ) {
    const learner = this.requireLearner(subject);
    const session = await this.prisma.learnerLearningSession.upsert({
      where: {
        profileSessionId_clientSessionKey: {
          profileSessionId: refreshTokenId,
          clientSessionKey: dto.clientSessionKey
        }
      },
      create: {
        userId: learner.userId,
        learnerId: learner.learnerId,
        profileSessionId: refreshTokenId,
        clientSessionKey: dto.clientSessionKey,
        startedAt: now,
        lastHeartbeatAt: now,
        endedAt: null,
        endReason: null,
        lastSequence: 0
      },
      update: {}
    });

    if (
      session.userId !== learner.userId ||
      session.learnerId !== learner.learnerId ||
      session.endedAt
    ) {
      throw new AppException(40301, "学习会话已失效", HttpStatus.FORBIDDEN);
    }
    return session;
  }

  async heartbeat(
    subject: ProfileSubject,
    refreshTokenId: string,
    sessionId: string,
    dto: LearnerLearningHeartbeatDto,
    now = new Date()
  ) {
    const learner = this.requireLearner(subject);
    const clientSentAt = new Date(dto.clientSentAt);
    if (
      Number.isNaN(clientSentAt.getTime()) ||
      clientSentAt.getTime() > now.getTime() + 5_000
    ) {
      throw new AppException(40001, "客户端时间不正确", HttpStatus.BAD_REQUEST);
    }

    const context = await this.contextService.resolve(learner, dto.context);

    return this.prisma.$transaction(
      async (transaction) => {
        const session = await transaction.learnerLearningSession.findFirst({
          where: {
            id: sessionId,
            userId: learner.userId,
            learnerId: learner.learnerId,
            profileSessionId: refreshTokenId
          }
        });
        if (!session) {
          throw new AppException(40301, "学习会话不属于当前身份", HttpStatus.FORBIDDEN);
        }
        if (session.endedAt) {
          throw new AppException(40301, "学习会话已结束", HttpStatus.FORBIDDEN);
        }
        if (dto.sequence <= session.lastSequence) {
          throw new AppException(40001, "心跳序号已处理", HttpStatus.BAD_REQUEST);
        }

        const accepted = await transaction.learnerLearningSession.updateMany({
          where: {
            id: session.id,
            userId: learner.userId,
            learnerId: learner.learnerId,
            profileSessionId: refreshTokenId,
            endedAt: null,
            lastSequence: { lt: dto.sequence }
          },
          data: {
            lastHeartbeatAt: now,
            lastSequence: dto.sequence
          }
        });
        if (accepted.count !== 1) {
          throw new AppException(40001, "心跳序号已处理", HttpStatus.BAD_REQUEST);
        }

        const durationSeconds = heartbeatDeltaSeconds(session.lastHeartbeatAt, now);
        const active = heartbeatIsActive(dto, now);
        if (active && durationSeconds > 0) {
          for (const segment of this.splitAtShanghaiMidnight(
            session.lastHeartbeatAt,
            now,
            durationSeconds
          )) {
            await this.writeTimeSlice(
              transaction,
              learner,
              session.id,
              segment.bucketStartedAt,
              segment.durationSeconds,
              dto.mediaPlaying ? "MEDIA_PLAYING" : "INTERACTION",
              context,
              now
            );
          }
        }

        return {
          id: session.id,
          sequence: dto.sequence,
          acceptedSeconds: active ? durationSeconds : 0,
          active
        };
      },
      { isolationLevel: "Serializable" }
    );
  }

  async end(
    subject: ProfileSubject,
    refreshTokenId: string,
    sessionId: string,
    now = new Date()
  ) {
    const learner = this.requireLearner(subject);
    const result = await this.prisma.learnerLearningSession.updateMany({
      where: {
        id: sessionId,
        userId: learner.userId,
        learnerId: learner.learnerId,
        profileSessionId: refreshTokenId,
        endedAt: null
      },
      data: { endedAt: now, endReason: "LEFT", lastHeartbeatAt: now }
    });
    if (result.count !== 1) {
      throw new AppException(40301, "学习会话不存在或已结束", HttpStatus.FORBIDDEN);
    }
    return { id: sessionId, endedAt: now, endReason: "LEFT" as const };
  }

  private requireLearner(subject: ProfileSubject) {
    if (subject.mode !== "LEARNER") {
      throw new AppException(40301, "请使用学习者身份记录学习情况", HttpStatus.FORBIDDEN);
    }
    return subject;
  }

  private async writeTimeSlice(
    transaction: SessionTransaction,
    subject: Extract<ProfileSubject, { mode: "LEARNER" }>,
    sessionId: string,
    bucketStartedAt: Date,
    durationSeconds: number,
    activitySignal: "INTERACTION" | "MEDIA_PLAYING",
    context: ResolvedLearningContext,
    receivedAt: Date
  ) {
    const key = {
      learnerId: subject.learnerId,
      bucketStartedAt
    };
    const current = await transaction.learnerLearningTimeSlice.findUnique({
      where: { learnerId_bucketStartedAt: key }
    });
    const candidate = { activitySignal, receivedAt };
    const preferred = current
      ? preferTimeSlice(
          { activitySignal: current.activitySignal, receivedAt: current.updatedAt },
          candidate
        )
      : candidate;
    const candidateWins = preferred === candidate;
    const contextData = this.timeSliceContext(context);

    await transaction.learnerLearningTimeSlice.upsert({
      where: { learnerId_bucketStartedAt: key },
      create: {
        userId: subject.userId,
        learnerId: subject.learnerId,
        sessionId,
        bucketStartedAt,
        durationSeconds,
        isLearning: context.isLearning,
        activitySignal,
        ...contextData
      },
      update: candidateWins
        ? {
            userId: subject.userId,
            sessionId,
            durationSeconds: Math.max(current?.durationSeconds ?? 0, durationSeconds),
            isLearning: context.isLearning,
            activitySignal,
            ...contextData
          }
        : {
            durationSeconds: Math.max(current?.durationSeconds ?? 0, durationSeconds)
          }
    });
  }

  private timeSliceContext(context: ResolvedLearningContext) {
    return {
      scenarioId: context.scenarioId,
      courseId: context.courseId,
      courseRevisionId: context.courseRevisionId,
      courseRevisionItemId: context.courseRevisionItemId,
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      materialType: context.materialType,
      materialId: context.materialId,
      contentVersion: context.contentVersion,
      partKey: context.partKey
    };
  }

  private splitAtShanghaiMidnight(previousAt: Date, now: Date, durationSeconds: number) {
    const effectiveStart = new Date(
      Math.max(previousAt.getTime(), now.getTime() - durationSeconds * 1000)
    );
    if (shanghaiDateKey(effectiveStart) === shanghaiDateKey(now)) {
      return [{ bucketStartedAt: canonicalBucketStart(now), durationSeconds }];
    }

    const midnight = new Date(`${shanghaiDateKey(now)}T00:00:00.000+08:00`);
    const beforeSeconds = Math.max(
      0,
      Math.floor((midnight.getTime() - effectiveStart.getTime()) / 1000)
    );
    const afterSeconds = durationSeconds - beforeSeconds;
    return [
      beforeSeconds > 0
        ? {
            bucketStartedAt: canonicalBucketStart(
              new Date(midnight.getTime() - 1)
            ),
            durationSeconds: beforeSeconds
          }
        : null,
      afterSeconds > 0
        ? { bucketStartedAt: canonicalBucketStart(now), durationSeconds: afterSeconds }
        : null
    ].filter(
      (segment): segment is { bucketStartedAt: Date; durationSeconds: number } =>
        segment !== null
    );
  }
}

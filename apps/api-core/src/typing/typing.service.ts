import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import {
  getPrismaClient,
  type Prisma,
  type PrismaClient,
  type TypingPracticeScope,
  type TypingPracticeSessionItemSource,
  type TypingReviewStateStatus
} from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { mediaAssetPublicUrl } from "../media/media-object-url.js";
import { LearnerActivityService } from "../profiles/learner-activity.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import {
  CreateTypingReviewSessionDto,
  CreateTypingSessionDto,
  ListTypingLibrariesDto,
  ListTypingReviewsDto,
  SubmitTypingAttemptDto,
  UpdateTypingPreferencesDto,
  UpdateTypingSessionTimeDto
} from "./dto/typing.dto.js";
import { compareTypingAnswer } from "./typing-answer.js";
import { presentTypingQuestion } from "./typing-presenter.js";
import { scheduleTypingReview } from "./typing-review.js";
import {
  resolveTypingStage,
  typingLibraryStageWhere,
  typingSessionTargetCount
} from "./typing-stage.js";

const typingAlgorithmVersion = "typing-stages-v1";

const questionItemInclude = {
  acceptedAnswers: {
    orderBy: { sortOrder: "asc" as const }
  },
  media: {
    where: { status: "READY" as const },
    include: { mediaAsset: true }
  },
  unit: {
    select: {
      id: true,
      code: true,
      title: true,
      libraryId: true
    }
  }
} satisfies Prisma.EnglishContentItemInclude;

type CandidateItem = {
  id: string;
  unitId: string;
  text: string;
  updatedAt: Date;
  source: TypingPracticeSessionItemSource;
};

@Injectable()
export class TypingService {
  private readonly prisma: PrismaClient;

  constructor(
    @Inject(LearnerActivityService)
    private readonly learnerActivityService: LearnerActivityService,
    @Optional() prisma?: PrismaClient
  ) {
    this.prisma = prisma ?? getPrismaClient();
  }

  async listLibraries(dto: ListTypingLibrariesDto) {
    const textbookWhere: Prisma.LearningMaterialTextbookWhereInput = {};
    if (dto.version) textbookWhere.version = dto.version;
    if (dto.grade) textbookWhere.grade = dto.grade;
    if (dto.volume) textbookWhere.volume = dto.volume;

    const libraries = await this.prisma.englishContentLibrary.findMany({
      where: {
        status: "PUBLISHED",
        ...(dto.type ? { libraryType: dto.type } : {}),
        ...(dto.q?.trim()
          ? {
              OR: [
                { title: { contains: dto.q.trim(), mode: "insensitive" } },
                { description: { contains: dto.q.trim(), mode: "insensitive" } }
              ]
            }
          : {}),
        AND: [
          ...(dto.stage ? [typingLibraryStageWhere(dto.stage)] : []),
          ...(Object.keys(textbookWhere).length > 0 ? [{ sourceTextbook: textbookWhere }] : [])
        ]
      },
      include: {
        sourceTextbook: true,
        units: {
          where: { status: "PUBLISHED" },
          select: {
            id: true,
            _count: { select: { items: true } }
          }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    });
    const filterSources = await this.prisma.englishContentLibrary.findMany({
      where: { status: "PUBLISHED" },
      select: {
        educationStage: true,
        libraryType: true,
        sourceTextbook: {
          select: { educationType: true, version: true, grade: true, volume: true }
        }
      }
    });

    return {
      items: libraries.map((library) => publicLibrarySummary(library)),
      filters: {
        types: uniqueSorted(filterSources.map((item) => item.libraryType)),
        stages: uniqueSorted(filterSources.map((item) => resolveTypingStage(
          item.educationStage,
          item.sourceTextbook?.educationType
        ))),
        versions: uniqueSorted(filterSources.map((item) => item.sourceTextbook?.version)),
        grades: uniqueSorted(filterSources.map((item) => item.sourceTextbook?.grade)),
        volumes: uniqueSorted(filterSources.map((item) => item.sourceTextbook?.volume))
      }
    };
  }

  async getLibrary(id: string) {
    const library = await this.prisma.englishContentLibrary.findFirst({
      where: { id, status: "PUBLISHED" },
      include: {
        sourceTextbook: true,
        units: {
          where: { status: "PUBLISHED" },
          orderBy: { sortOrder: "asc" },
          include: { _count: { select: { items: true } } }
        }
      }
    });
    if (!library) throw new AppException(40401, "英文词库不存在", HttpStatus.NOT_FOUND);

    return {
      ...publicLibrarySummary(library),
      description: library.description,
      units: library.units.map((unit) => ({
        id: unit.id,
        code: unit.code,
        title: unit.title,
        itemCount: unit._count.items,
        mediaStatus: unit.mediaStatus
      }))
    };
  }

  async getLibraryProgress(subject: ProfileSubject, libraryId: string) {
    await this.requirePublishedLibrary(libraryId);
    return this.recalculateLibraryProgress(subject, libraryId);
  }

  async createSession(
    subject: ProfileSubject,
    scenarioId: string | null,
    dto: CreateTypingSessionDto
  ) {
    const subjectKey = typingSubjectKey(subject);
    const idempotent = await this.prisma.typingPracticeSession.findUnique({
      where: { clientSessionKey: dto.clientSessionKey },
      select: { id: true, subjectKey: true }
    });
    if (idempotent) {
      if (idempotent.subjectKey !== subjectKey) {
        throw new AppException(40901, "练习请求标识已被使用", HttpStatus.CONFLICT);
      }
      return this.getSession(subject, idempotent.id);
    }

    const open = await this.prisma.typingPracticeSession.findFirst({
      where: { subjectKey, status: { in: ["ACTIVE", "PAUSED"] } },
      select: { id: true }
    });
    if (open && !dto.abandonExisting) {
      throw new AppException(40902, "已有未完成练习，请先继续或放弃", HttpStatus.CONFLICT);
    }
    if (open) {
      await this.prisma.typingPracticeSession.update({
        where: { id: open.id },
        data: { status: "ABANDONED", completedAt: new Date() }
      });
    }

    const library = await this.requirePublishedLibrary(dto.libraryId);
    // UNIT 按教材顺序练习；不指定单元时覆盖全册。
    if (dto.unitId) await this.requirePublishedUnit(dto.libraryId, dto.unitId);
    const candidates = await this.selectCandidates(subjectKey, dto.libraryId, dto.unitId, dto.scope);
    const targetItemCount = typingSessionTargetCount(library.educationStage, dto.targetItemCount);
    const selected = targetItemCount === 0
      ? candidates
      : candidates.slice(0, targetItemCount);
    if (selected.length === 0) {
      throw new AppException(40002, "当前范围没有可练习内容", HttpStatus.BAD_REQUEST);
    }

    const now = new Date();
    const session = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.typingPracticeSession.create({
        data: {
          subjectKey,
          userId: subject.userId,
          learnerId: subject.learnerId,
          libraryId: dto.libraryId,
          unitId: dto.unitId ?? null,
          scope: dto.scope,
          targetItemCount: selected.length,
          clientSessionKey: dto.clientSessionKey,
          items: {
            create: selected.map((item, index) => ({
              itemId: item.id,
              itemVersion: itemVersion(library.sourceHash, item.updatedAt),
              source: item.source,
              queueOrder: index,
              answerSnapshot: item.text,
              status: index === 0 ? "ACTIVE" : "PENDING",
              firstShownAt: index === 0 ? now : null
            }))
          }
        },
        select: { id: true }
      });
      await transaction.typingLibraryProgress.upsert({
        where: { subjectKey_libraryId: { subjectKey, libraryId: dto.libraryId } },
        update: {
          lastSessionId: created.id,
          lastUnitId: dto.unitId ?? null,
          lastPracticedAt: now
        },
        create: {
          subjectKey,
          userId: subject.userId,
          learnerId: subject.learnerId,
          libraryId: dto.libraryId,
          lastSessionId: created.id,
          lastUnitId: dto.unitId ?? null,
          lastPracticedAt: now
        }
      });
      return created;
    }, { isolationLevel: "Serializable" });

    await this.learnerActivityService.record({
      subject,
      eventType: "LEARNING_STARTED",
      scenarioId,
      resourceType: "TYPING_LIBRARY",
      resourceId: dto.libraryId,
      idempotencyKey: `typing-session:${dto.clientSessionKey}`,
      metrics: { itemCount: selected.length, mode: dto.scope }
    });
    return this.getSession(subject, session.id);
  }

  async getActiveSession(subject: ProfileSubject) {
    const session = await this.prisma.typingPracticeSession.findFirst({
      where: {
        subjectKey: typingSubjectKey(subject),
        status: { in: ["ACTIVE", "PAUSED"] }
      },
      orderBy: { lastActiveAt: "desc" },
      select: { id: true }
    });
    return session ? this.getSession(subject, session.id) : null;
  }

  async getSession(subject: ProfileSubject, id: string) {
    const session = await this.prisma.typingPracticeSession.findFirst({
      where: { id, subjectKey: typingSubjectKey(subject) },
      include: {
        library: { select: { id: true, title: true, sourceHash: true } },
        unit: { select: { id: true, code: true, title: true } },
        _count: { select: { items: true } }
      }
    });
    if (!session) throw new AppException(40401, "练习会话不存在", HttpStatus.NOT_FOUND);

    const visibleItems = await this.prisma.typingPracticeSessionItem.findMany({
      where: { sessionId: session.id },
      orderBy: { queueOrder: "asc" },
      skip: session.currentIndex,
      take: 2,
      include: { item: { include: questionItemInclude } }
    });
    const current = visibleItems[0] ?? null;
    const upcoming = session.status === "COMPLETED" ? null : visibleItems[1] ?? null;
    const mediaItems = [current, upcoming].filter((item) => item !== null);
    const audioAssets = mediaItems.length ? await this.prisma.dictionaryAudioAsset.findMany({
      where: { dictionaryEntry: { normalizedWord: { in: mediaItems.map((item) => item.answerSnapshot.trim().toLowerCase()) } } },
      select: { variant: true, url: true, dictionaryEntry: { select: { normalizedWord: true } } },
      orderBy: { id: "asc" }
    }) : [];
    const audioUrlsFor = (word: string): Record<string, string> => Object.fromEntries(
      audioAssets.filter((asset) => asset.dictionaryEntry.normalizedWord === word.trim().toLowerCase())
        .map((asset) => [asset.variant, asset.url])
    );
    const nextQuestion = upcoming ? this.presentSessionItem(upcoming) : null;
    return {
      id: session.id,
      status: session.status,
      scope: session.scope,
      library: session.library,
      unit: session.unit,
      currentIndex: session.currentIndex,
      totalItems: session._count.items,
      progressPercent: session._count.items > 0
        ? Math.round((session.correctCount / session._count.items) * 100)
        : 0,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      hintedCount: session.hintedCount,
      activeSeconds: session.activeSeconds,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      question: current ? { ...this.presentSessionItem(current), audioUrls: audioUrlsFor(current.answerSnapshot) } : null,
      nextMedia: upcoming && nextQuestion ? {
        id: nextQuestion.id,
        imageUrl: nextQuestion.imageUrl,
        audioUrls: audioUrlsFor(upcoming.answerSnapshot)
      } : null
    };
  }

  async submitAttempt(
    subject: ProfileSubject,
    scenarioId: string | null,
    sessionId: string,
    dto: SubmitTypingAttemptDto
  ) {
    const subjectKey = typingSubjectKey(subject);
    const duplicate = await this.prisma.typingAttempt.findUnique({
      where: { clientAttemptId: dto.clientAttemptId },
      include: {
        session: { select: { id: true, subjectKey: true } },
        sessionItem: true
      }
    });
    if (duplicate) {
      if (duplicate.session.id !== sessionId || duplicate.session.subjectKey !== subjectKey) {
        throw new AppException(40901, "作答请求标识已被使用", HttpStatus.CONFLICT);
      }
      return {
        correct: duplicate.isCorrect,
        result: duplicate.errorPositions,
        nextHintLevel: duplicate.isCorrect ? null : Math.min(3, duplicate.sessionItem.hintLevel + 1),
        session: await this.getSession(subject, sessionId)
      };
    }

    const now = new Date();
    const writeResult = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.typingPracticeSession.findFirst({
        where: { id: sessionId, subjectKey, status: "ACTIVE" },
        include: {
          items: {
            orderBy: { queueOrder: "asc" },
            include: { item: { include: questionItemInclude } }
          }
        }
      });
      if (!session) throw new AppException(40401, "练习会话不存在或未开始", HttpStatus.NOT_FOUND);
      const sessionItem = session.items[session.currentIndex];
      if (!sessionItem) throw new AppException(40903, "当前题目不存在", HttpStatus.CONFLICT);
      if (sessionItem.status === "CORRECT") {
        throw new AppException(40904, "当前题已答对，请进入下一题", HttpStatus.CONFLICT);
      }

      const answers = [sessionItem.answerSnapshot];
      const comparison = bestAnswerComparison(answers, dto.answer);
      const attemptNumber = await transaction.typingAttempt.count({
        where: { sessionItemId: sessionItem.id }
      }) + 1;
      const priorReview = await transaction.typingReviewState.findUnique({
        where: { subjectKey_itemId: { subjectKey, itemId: sessionItem.itemId } }
      });
      const scheduled = scheduleTypingReview({
        now,
        current: priorReview ? {
          state: reviewScheduleState(priorReview.state),
          stage: priorReview.stage,
          dueAt: priorReview.dueAt
        } : null,
        correct: comparison.correct,
        hintLevel: sessionItem.hintLevel,
        isDueReview: sessionItem.source === "DUE_REVIEW"
          || Boolean(priorReview?.dueAt && priorReview.dueAt <= now)
      });

      await transaction.typingAttempt.create({
        data: {
          sessionId,
          sessionItemId: sessionItem.id,
          itemId: sessionItem.itemId,
          itemVersion: sessionItem.itemVersion,
          clientAttemptId: dto.clientAttemptId,
          attemptNumber,
          isCorrect: comparison.correct,
          errorTypes: comparison.errorTypes,
          errorPositions: comparison.tokenResults as unknown as Prisma.InputJsonValue,
          durationMs: dto.durationMs,
          hintLevel: sessionItem.hintLevel,
          audioReplayCount: dto.audioReplayCount ?? 0,
          isReview: sessionItem.source === "DUE_REVIEW"
        }
      });

      await transaction.typingReviewState.upsert({
        where: { subjectKey_itemId: { subjectKey, itemId: sessionItem.itemId } },
        update: {
          itemVersion: sessionItem.itemVersion,
          state: scheduled.state,
          stage: scheduled.stage,
          dueAt: scheduled.dueAt,
          lastReviewedAt: now,
          masteredAt: scheduled.masteredAt,
          totalAttempts: { increment: 1 },
          totalCorrect: comparison.correct ? { increment: 1 } : undefined,
          lapseCount: comparison.correct ? undefined : { increment: 1 },
          correctStreak: comparison.correct ? { increment: 1 } : 0,
          algorithmVersion: typingAlgorithmVersion
        },
        create: {
          subjectKey,
          userId: subject.userId,
          learnerId: subject.learnerId,
          itemId: sessionItem.itemId,
          itemVersion: sessionItem.itemVersion,
          state: scheduled.state,
          stage: scheduled.stage,
          dueAt: scheduled.dueAt,
          lastReviewedAt: now,
          masteredAt: scheduled.masteredAt,
          totalAttempts: 1,
          totalCorrect: comparison.correct ? 1 : 0,
          lapseCount: comparison.correct ? 0 : 1,
          hintCount: sessionItem.hintLevel > 0 ? 1 : 0,
          correctStreak: comparison.correct ? 1 : 0,
          algorithmVersion: typingAlgorithmVersion
        }
      });

      if (comparison.correct) {
        await transaction.typingPracticeSessionItem.update({
          where: { id: sessionItem.id },
          data: {
            status: "CORRECT",
            completedAt: now,
            audioReplayCount: dto.audioReplayCount ?? sessionItem.audioReplayCount
          }
        });
        await transaction.typingPracticeSession.update({
          where: { id: sessionId },
          data: { correctCount: { increment: 1 }, lastActiveAt: now }
        });
      } else {
        await transaction.typingPracticeSessionItem.update({
          where: { id: sessionItem.id },
          data: {
            lastErrorTokenIndex: comparison.firstErrorTokenIndex,
            audioReplayCount: dto.audioReplayCount ?? sessionItem.audioReplayCount,
            hasLapse: true
          }
        });
        if (!sessionItem.hasLapse) {
          await transaction.typingPracticeSession.update({
            where: { id: sessionId },
            data: { wrongCount: { increment: 1 }, lastActiveAt: now }
          });
          if (!sessionItem.repeatOfSessionItemId) {
            const repeatExists = await transaction.typingPracticeSessionItem.count({
              where: { repeatOfSessionItemId: sessionItem.id }
            });
            if (repeatExists === 0) {
              const last = session.items.at(-1)!;
              await transaction.typingPracticeSessionItem.create({
                data: {
                  sessionId,
                  itemId: sessionItem.itemId,
                  itemVersion: sessionItem.itemVersion,
                  source: "RELEARNING",
                  queueOrder: last.queueOrder + 1,
                  repeatOfSessionItemId: sessionItem.id,
                  answerSnapshot: sessionItem.answerSnapshot
                }
              });
            }
          }
        }
      }

      return {
        comparison,
        stage: scheduled.stage,
        itemId: sessionItem.itemId,
        libraryId: session.libraryId,
        hintLevel: sessionItem.hintLevel
      };
    }, { isolationLevel: "Serializable" });

    await this.recalculateLibraryProgress(subject, writeResult.libraryId);
    await this.learnerActivityService.record({
      subject,
      eventType: "PRACTICE_SUBMITTED",
      scenarioId,
      resourceType: "TYPING_LIBRARY",
      resourceId: writeResult.libraryId,
      itemKey: writeResult.itemId,
      idempotencyKey: `typing-attempt:${dto.clientAttemptId}`,
      metrics: {
        correct: writeResult.comparison.correct,
        errorCount: writeResult.comparison.errorTypes.length,
        hintLevel: writeResult.hintLevel,
        durationMs: dto.durationMs,
        stage: writeResult.stage,
        result: writeResult.comparison.correct ? "CORRECT" : "INCORRECT"
      }
    });

    return {
      correct: writeResult.comparison.correct,
      result: writeResult.comparison.tokenResults,
      nextHintLevel: writeResult.comparison.correct ? null : Math.min(3, writeResult.hintLevel + 1),
      session: await this.getSession(subject, sessionId)
    };
  }

  async requestHint(subject: ProfileSubject, sessionId: string) {
    const subjectKey = typingSubjectKey(subject);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.typingPracticeSession.findFirst({
        where: { id: sessionId, subjectKey, status: "ACTIVE" },
        include: { items: { orderBy: { queueOrder: "asc" } } }
      });
      if (!session) throw new AppException(40401, "练习会话不存在或未开始", HttpStatus.NOT_FOUND);
      const item = session.items[session.currentIndex];
      if (!item || item.status === "CORRECT") {
        throw new AppException(40904, "当前状态不能查看提示", HttpStatus.CONFLICT);
      }
      const nextLevel = Math.min(3, item.hintLevel + 1);
      if (nextLevel === item.hintLevel) return;

      await transaction.typingPracticeSessionItem.update({
        where: { id: item.id },
        data: { hintLevel: nextLevel }
      });
      await transaction.typingPracticeSession.update({
        where: { id: session.id },
        data: {
          hintedCount: item.hintLevel === 0 ? { increment: 1 } : undefined,
          lastActiveAt: now
        }
      });
      const prior = await transaction.typingReviewState.findUnique({
        where: { subjectKey_itemId: { subjectKey, itemId: item.itemId } }
      });
      const scheduled = scheduleTypingReview({
        now,
        current: prior ? {
          state: reviewScheduleState(prior.state),
          stage: prior.stage,
          dueAt: prior.dueAt
        } : null,
        correct: false,
        hintLevel: nextLevel,
        isDueReview: item.source === "DUE_REVIEW"
      });
      await transaction.typingReviewState.upsert({
        where: { subjectKey_itemId: { subjectKey, itemId: item.itemId } },
        update: {
          state: scheduled.state,
          stage: scheduled.stage,
          dueAt: scheduled.dueAt,
          masteredAt: scheduled.masteredAt,
          hintCount: { increment: 1 },
          algorithmVersion: typingAlgorithmVersion
        },
        create: {
          subjectKey,
          userId: subject.userId,
          learnerId: subject.learnerId,
          itemId: item.itemId,
          itemVersion: item.itemVersion,
          state: scheduled.state,
          stage: scheduled.stage,
          dueAt: scheduled.dueAt,
          masteredAt: scheduled.masteredAt,
          hintCount: 1,
          algorithmVersion: typingAlgorithmVersion
        }
      });
    }, { isolationLevel: "Serializable" });
    return this.getSession(subject, sessionId);
  }

  async nextQuestion(subject: ProfileSubject, scenarioId: string | null, sessionId: string) {
    const subjectKey = typingSubjectKey(subject);
    const now = new Date();
    const result = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.typingPracticeSession.findFirst({
        where: { id: sessionId, subjectKey, status: "ACTIVE" },
        include: { items: { orderBy: { queueOrder: "asc" } } }
      });
      if (!session) throw new AppException(40401, "练习会话不存在或未开始", HttpStatus.NOT_FOUND);
      const current = session.items[session.currentIndex];
      if (!current || current.status !== "CORRECT") {
        throw new AppException(40904, "请先正确完成当前题", HttpStatus.CONFLICT);
      }
      const nextIndex = session.currentIndex + 1;
      const next = session.items[nextIndex];
      if (!next) {
        await transaction.typingPracticeSession.update({
          where: { id: session.id },
          data: { status: "COMPLETED", currentIndex: nextIndex, completedAt: now, lastActiveAt: now }
        });
        return { completed: true, libraryId: session.libraryId };
      }
      await transaction.typingPracticeSessionItem.update({
        where: { id: next.id },
        data: { status: "ACTIVE", firstShownAt: next.firstShownAt ?? now }
      });
      await transaction.typingPracticeSession.update({
        where: { id: session.id },
        data: { currentIndex: nextIndex, lastActiveAt: now }
      });
      return { completed: false, libraryId: session.libraryId };
    }, { isolationLevel: "Serializable" });

    if (result.completed) {
      const session = await this.getSession(subject, sessionId);
      await this.recalculateLibraryProgress(subject, result.libraryId);
      await this.learnerActivityService.record({
        subject,
        eventType: "LEARNING_COMPLETED",
        scenarioId,
        resourceType: "TYPING_LIBRARY",
        resourceId: result.libraryId,
        idempotencyKey: `typing-session-completed:${sessionId}`,
        metrics: {
          correctCount: session.correctCount,
          wrongCount: session.wrongCount,
          hintedCount: session.hintedCount,
          status: "COMPLETED"
        }
      });
      return session;
    }
    return this.getSession(subject, sessionId);
  }

  async pauseSession(subject: ProfileSubject, id: string, dto: UpdateTypingSessionTimeDto) {
    await this.updateOwnedOpenSession(subject, id, {
      status: "PAUSED",
      activeSeconds: dto.activeSeconds,
      lastActiveAt: new Date()
    });
    return this.getSession(subject, id);
  }

  async resumeSession(subject: ProfileSubject, id: string) {
    const updated = await this.prisma.typingPracticeSession.updateMany({
      where: { id, subjectKey: typingSubjectKey(subject), status: "PAUSED" },
      data: { status: "ACTIVE", lastActiveAt: new Date() }
    });
    if (updated.count === 0) throw new AppException(40904, "该练习不能恢复", HttpStatus.CONFLICT);
    return this.getSession(subject, id);
  }

  async finishSession(
    subject: ProfileSubject,
    scenarioId: string | null,
    id: string,
    dto: UpdateTypingSessionTimeDto
  ) {
    const session = await this.prisma.typingPracticeSession.findFirst({
      where: { id, subjectKey: typingSubjectKey(subject) },
      select: { libraryId: true, status: true }
    });
    if (!session) throw new AppException(40401, "练习会话不存在", HttpStatus.NOT_FOUND);
    if (["ACTIVE", "PAUSED"].includes(session.status)) {
      await this.prisma.typingPracticeSession.update({
        where: { id },
        data: {
          status: "ABANDONED",
          completedAt: new Date(),
          activeSeconds: dto.activeSeconds
        }
      });
    }
    const result = await this.getSession(subject, id);
    await this.learnerActivityService.record({
      subject,
      eventType: "LEARNING_COMPLETED",
      scenarioId,
      resourceType: "TYPING_LIBRARY",
      resourceId: session.libraryId,
      idempotencyKey: `typing-session-finished:${id}`,
      metrics: {
        correctCount: result.correctCount,
        wrongCount: result.wrongCount,
        hintedCount: result.hintedCount,
        status: result.status
      }
    });
    return result;
  }

  async reviewSummary(subject: ProfileSubject) {
    const subjectKey = typingSubjectKey(subject);
    const now = new Date();
    const endToday = new Date(now);
    endToday.setHours(23, 59, 59, 999);
    const endTomorrow = new Date(endToday);
    endTomorrow.setDate(endTomorrow.getDate() + 1);
    const [dueToday, dueTomorrow, mastered, total] = await Promise.all([
      this.prisma.typingReviewState.count({
        where: { subjectKey, state: { not: "SUSPENDED" }, dueAt: { lte: endToday } }
      }),
      this.prisma.typingReviewState.count({
        where: { subjectKey, state: { not: "SUSPENDED" }, dueAt: { gt: endToday, lte: endTomorrow } }
      }),
      this.prisma.typingReviewState.count({ where: { subjectKey, state: "MASTERED" } }),
      this.prisma.typingReviewState.count({ where: { subjectKey } })
    ]);
    return { dueToday, dueTomorrow, mastered, total };
  }

  async listReviews(subject: ProfileSubject, dto: ListTypingReviewsDto) {
    const page = typingPaginationValue(dto.page, 1, 1000);
    const pageSize = typingPaginationValue(dto.pageSize, 20, 100);
    const where: Prisma.TypingReviewStateWhereInput = {
      subjectKey: typingSubjectKey(subject),
      ...(dto.libraryId ? { item: { unit: { libraryId: dto.libraryId } } } : {})
    };
    const [total, items] = await Promise.all([
      this.prisma.typingReviewState.count({ where }),
      this.prisma.typingReviewState.findMany({
        where,
        include: {
          item: {
            select: {
              id: true,
              text: true,
              translation: true,
              britishPhonetic: true,
              unit: { select: { id: true, title: true, library: { select: { id: true, title: true } } } }
            }
          }
        },
        orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    return { items, total, page, pageSize };
  }

  async createReviewSession(
    subject: ProfileSubject,
    scenarioId: string | null,
    dto: CreateTypingReviewSessionDto
  ) {
    let libraryId = dto.libraryId;
    if (!libraryId) {
      const firstDue = await this.prisma.typingReviewState.findFirst({
        where: {
          subjectKey: typingSubjectKey(subject),
          dueAt: { lte: new Date() },
          state: { not: "SUSPENDED" },
          item: { unit: { library: { status: "PUBLISHED" } } }
        },
        select: { item: { select: { unit: { select: { libraryId: true } } } } },
        orderBy: { dueAt: "asc" }
      });
      libraryId = firstDue?.item.unit.libraryId;
    }
    if (!libraryId) throw new AppException(40002, "当前没有到期复习内容", HttpStatus.BAD_REQUEST);

    return this.createSession(subject, scenarioId, {
      libraryId,
      scope: "DUE_REVIEW",
      targetItemCount: dto.targetItemCount,
      clientSessionKey: dto.clientSessionKey,
      abandonExisting: dto.abandonExisting
    });
  }

  async resetReview(subject: ProfileSubject, itemId: string, confirm: boolean) {
    if (!confirm) throw new AppException(40001, "请确认重置记忆进度", HttpStatus.BAD_REQUEST);
    const review = await this.prisma.typingReviewState.findFirst({
      where: { subjectKey: typingSubjectKey(subject), itemId },
      select: { id: true, item: { select: { unit: { select: { libraryId: true } } } } }
    });
    if (!review) throw new AppException(40401, "记忆记录不存在", HttpStatus.NOT_FOUND);
    await this.prisma.typingReviewState.delete({ where: { id: review.id } });
    await this.recalculateLibraryProgress(subject, review.item.unit.libraryId);
    return { reset: true };
  }

  async history(subject: ProfileSubject) {
    const subjectKey = typingSubjectKey(subject);
    const [sessions, totals] = await Promise.all([
      this.prisma.typingPracticeSession.findMany({
        where: { subjectKey },
        include: {
          library: { select: { id: true, title: true } },
          unit: { select: { id: true, title: true } }
        },
        orderBy: { startedAt: "desc" },
        take: 50
      }),
      this.prisma.typingAttempt.aggregate({
        where: { session: { subjectKey } },
        _count: true,
        _sum: { durationMs: true }
      })
    ]);
    return {
      summary: {
        sessionCount: sessions.length,
        attemptCount: totals._count,
        durationMs: totals._sum.durationMs ?? 0
      },
      sessions
    };
  }

  async getPreferences(subject: ProfileSubject) {
    const subjectKey = typingSubjectKey(subject);
    const preference = await this.prisma.typingPreference.findUnique({ where: { subjectKey } });
    return preference ?? defaultTypingPreferences(subject);
  }

  async updatePreferences(subject: ProfileSubject, dto: UpdateTypingPreferencesDto) {
    const subjectKey = typingSubjectKey(subject);
    return this.prisma.typingPreference.upsert({
      where: { subjectKey },
      update: dto,
      create: {
        subjectKey,
        userId: subject.userId,
        learnerId: subject.learnerId,
        ...dto
      }
    });
  }

  private presentSessionItem(sessionItem: Prisma.TypingPracticeSessionItemGetPayload<{
    include: { item: { include: typeof questionItemInclude } };
  }>) {
    const image = sessionItem.item.media.find((media) => media.kind === "ILLUSTRATION")?.mediaAsset;
    const audio = sessionItem.item.media.find((media) => media.kind === "BRITISH_PRONUNCIATION")?.mediaAsset;
    return presentTypingQuestion({
      id: sessionItem.itemId,
      version: sessionItem.itemVersion,
      translation: sessionItem.item.translation,
      answerSnapshot: sessionItem.answerSnapshot,
      britishPhonetic: sessionItem.item.britishPhonetic,
      partOfSpeech: sessionItem.item.partOfSpeech,
      imageUrl: image ? mediaAssetPublicUrl(image) : null,
      audioUrl: audio ? mediaAssetPublicUrl(audio) : null,
      hintLevel: sessionItem.hintLevel,
      lastErrorTokenIndex: sessionItem.lastErrorTokenIndex,
      revealed: sessionItem.status === "CORRECT"
    });
  }

  private async selectCandidates(
    subjectKey: string,
    libraryId: string,
    unitId: string | undefined,
    scope: TypingPracticeScope
  ): Promise<CandidateItem[]> {
    const baseItemWhere: Prisma.EnglishContentItemWhereInput = {
      isSpellingRequired: true,
      unit: {
        libraryId,
        status: "PUBLISHED",
        ...(unitId ? { id: unitId } : {})
      }
    };
    const due = await this.prisma.typingReviewState.findMany({
      where: {
        subjectKey,
        state: { not: "SUSPENDED" },
        dueAt: { lte: new Date() },
        item: baseItemWhere
      },
      select: { item: { select: { id: true, unitId: true, text: true, updatedAt: true } } },
      orderBy: { dueAt: "asc" }
    });
    const dueItems = due.map(({ item }) => ({ ...item, source: "DUE_REVIEW" as const }));
    if (scope === "DUE_REVIEW") return dueItems;

    const newItems = await this.prisma.englishContentItem.findMany({
      where: {
        ...baseItemWhere,
        reviewStates: { none: { subjectKey } }
      },
      select: { id: true, unitId: true, text: true, updatedAt: true },
      orderBy: [{ unit: { sortOrder: "asc" } }, { sourceOrder: "asc" }]
    });
    const normalizedNew = newItems.map((item) => ({ ...item, source: "NEW" as const }));
    if (scope === "NEW") return normalizedNew;
    if (scope === "MIXED") return dedupeCandidates([...dueItems, ...normalizedNew]);

    const allItems = await this.prisma.englishContentItem.findMany({
      where: baseItemWhere,
      select: {
        id: true,
        unitId: true,
        text: true,
        updatedAt: true,
        reviewStates: {
          where: { subjectKey },
          select: { dueAt: true, state: true },
          take: 1
        }
      },
      orderBy: [{ unit: { sortOrder: "asc" } }, { sourceOrder: "asc" }]
    });
    return allItems.map(({ reviewStates, ...item }) => ({
      ...item,
      source: reviewStates[0]?.dueAt && reviewStates[0].dueAt <= new Date()
        ? "DUE_REVIEW"
        : "NEW"
    }));
  }

  private async recalculateLibraryProgress(
    subject: ProfileSubject,
    libraryId: string,
    transaction?: Prisma.TransactionClient
  ) {
    const client = transaction ?? this.prisma;
    const subjectKey = typingSubjectKey(subject);
    const [total, learned, mastered, existing] = await Promise.all([
      client.englishContentItem.count({ where: { unit: { libraryId, status: "PUBLISHED" } } }),
      client.typingReviewState.count({ where: { subjectKey, item: { unit: { libraryId } } } }),
      client.typingReviewState.count({ where: { subjectKey, state: "MASTERED", item: { unit: { libraryId } } } }),
      client.typingLibraryProgress.findUnique({
        where: { subjectKey_libraryId: { subjectKey, libraryId } }
      })
    ]);
    const values = {
      newItemCount: Math.max(0, total - learned),
      learnedItemCount: learned,
      masteredItemCount: mastered,
      progressPercent: total > 0 ? Math.round((learned / total) * 100) : 0
    };
    const progress = await client.typingLibraryProgress.upsert({
      where: { subjectKey_libraryId: { subjectKey, libraryId } },
      update: {
        newItemCount: values.newItemCount,
        learnedItemCount: values.learnedItemCount,
        masteredItemCount: values.masteredItemCount
      },
      create: {
        subjectKey,
        userId: subject.userId,
        learnerId: subject.learnerId,
        libraryId,
        newItemCount: values.newItemCount,
        learnedItemCount: values.learnedItemCount,
        masteredItemCount: values.masteredItemCount
      }
    });
    return { ...progress, ...values, lastSessionId: existing?.lastSessionId ?? progress.lastSessionId };
  }

  private async requirePublishedLibrary(id: string) {
    const library = await this.prisma.englishContentLibrary.findFirst({
      where: { id, status: "PUBLISHED" },
      select: { educationStage: true, id: true, sourceHash: true }
    });
    if (!library) throw new AppException(40401, "英文词库不存在", HttpStatus.NOT_FOUND);
    return library;
  }

  private async requirePublishedUnit(libraryId: string, id: string) {
    const unit = await this.prisma.englishContentUnit.findFirst({
      where: { id, libraryId, status: "PUBLISHED" },
      select: { id: true }
    });
    if (!unit) throw new AppException(40401, "内容单元不存在", HttpStatus.NOT_FOUND);
    return unit;
  }

  private async updateOwnedOpenSession(
    subject: ProfileSubject,
    id: string,
    data: Prisma.TypingPracticeSessionUpdateManyMutationInput
  ) {
    const result = await this.prisma.typingPracticeSession.updateMany({
      where: {
        id,
        subjectKey: typingSubjectKey(subject),
        status: { in: ["ACTIVE", "PAUSED"] }
      },
      data
    });
    if (result.count === 0) throw new AppException(40401, "练习会话不存在", HttpStatus.NOT_FOUND);
  }
}

export function typingSubjectKey(subject: ProfileSubject) {
  return subject.mode === "LEARNER"
    ? `learner:${subject.learnerId}`
    : `account:${subject.userId}`;
}

function publicLibrarySummary(library: {
  id: string;
  slug: string;
  title: string;
  libraryType: string;
  educationStage: string | null;
  language: string;
  sourceHash: string | null;
  sourceTextbook: {
    educationType: string;
    version: string | null;
    grade: string | null;
    volume: string | null;
    coverUrl: string | null;
    publisher: string | null;
  } | null;
  units: Array<{ id: string; _count: { items: number } }>;
}) {
  return {
    id: library.id,
    slug: library.slug,
    title: library.title,
    libraryType: library.libraryType,
    language: library.language,
    contentVersion: library.sourceHash,
    stage: resolveTypingStage(library.educationStage, library.sourceTextbook?.educationType),
    version: library.sourceTextbook?.version ?? null,
    grade: library.sourceTextbook?.grade ?? null,
    volume: library.sourceTextbook?.volume ?? null,
    publisher: library.sourceTextbook?.publisher ?? null,
    coverUrl: library.sourceTextbook?.coverUrl ?? null,
    unitCount: library.units.length,
    itemCount: library.units.reduce((total, unit) => total + unit._count.items, 0)
  };
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function itemVersion(sourceHash: string | null, updatedAt: Date) {
  return `${sourceHash ?? "content"}:${updatedAt.toISOString()}`;
}

function dedupeCandidates(items: CandidateItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function bestAnswerComparison(expectedAnswers: string[], actual: string) {
  const comparisons = expectedAnswers.map((expected) => compareTypingAnswer(expected, actual));
  return comparisons.find((comparison) => comparison.correct) ?? comparisons[0]!;
}

function reviewScheduleState(state: TypingReviewStateStatus) {
  if (state === "MASTERED") return "MASTERED" as const;
  if (state === "REVIEW") return "REVIEW" as const;
  if (state === "RELEARNING") return "RELEARNING" as const;
  return "LEARNING" as const;
}

function defaultTypingPreferences(subject: ProfileSubject) {
  return {
    subjectKey: typingSubjectKey(subject),
    userId: subject.userId,
    learnerId: subject.learnerId,
    accent: "UK" as const,
    autoPlayAudio: true,
    replayAfterCorrect: true,
    showImage: true,
    feedbackSoundEnabled: true,
    soundVolume: 0.8,
    inputStyle: "UNDERLINE" as const
  };
}

function typingPaginationValue(value: number | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new AppException(40001, "请求参数错误", HttpStatus.BAD_REQUEST);
  }
  return parsed;
}

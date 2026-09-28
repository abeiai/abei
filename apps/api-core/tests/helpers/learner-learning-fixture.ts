import assert from "node:assert/strict";
import { LearnerLearningContextService } from "../../src/learner-learning/learner-learning-context.service.js";
import { LearnerLearningSessionService } from "../../src/learner-learning/learner-learning-session.service.js";
import { LearnerLearningEventService } from "../../src/learner-learning/learner-learning-event.service.js";
import { LearnerActivityService } from "../../src/profiles/learner-activity.service.js";
import type { LearnerLearningEventDto } from "../../src/learner-learning/dto/learner-learning.dto.js";

export interface SessionFixtureOptions {
  endedAt?: Date | null;
  authorizedCourseId?: string;
  approvedItemId?: string;
}

interface SessionRow {
  id: string;
  userId: string;
  learnerId: string;
  profileSessionId: string;
  clientSessionKey: string;
  startedAt: Date;
  lastHeartbeatAt: Date;
  endedAt: Date | null;
  endReason: string | null;
  lastSequence: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TimeSliceRow {
  id: string;
  userId: string;
  learnerId: string;
  sessionId: string;
  bucketStartedAt: Date;
  durationSeconds: number;
  isLearning: boolean;
  activitySignal: string;
  updatedAt: Date;
  [key: string]: unknown;
}

export interface SessionFixture {
  context: LearnerLearningContextService;
  service: LearnerLearningSessionService;
  sessions: SessionRow[];
  timeSlices: TimeSliceRow[];
  courseAuthorizations: Array<{ learnerId: string; courseId: string }>;
  courseRevisionItems: Array<{ id: string; revisionId: string }>;
}

export const subject = {
  userId: "user-1",
  learnerId: "learner-1",
  mode: "LEARNER"
} as const;

export const accountSubject = {
  userId: "user-1",
  learnerId: null,
  mode: "ACCOUNT"
} as const;

export const now = new Date("2026-08-19T08:00:30.000Z");

export function activeHeartbeat(sequence: number) {
  return {
    sequence,
    clientSentAt: now.toISOString(),
    pageVisible: true,
    hasFocus: true,
    mediaPlaying: false,
    lastInteractionAt: now.toISOString(),
    context: { isLearning: false }
  };
}

function matchesSession(row: SessionRow, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "endedAt") return row.endedAt === value;
    if (key === "lastSequence" && typeof value === "object" && value) {
      const comparison = value as { lt?: number };
      return comparison.lt === undefined || row.lastSequence < comparison.lt;
    }
    return row[key as keyof SessionRow] === value;
  });
}

export function createSessionFixture(options: SessionFixtureOptions = {}): SessionFixture {
  const initialTime = new Date("2026-08-19T08:00:00.000Z");
  const sessions: SessionRow[] = [
    {
      id: "session-1",
      userId: "user-1",
      learnerId: "learner-1",
      profileSessionId: "refresh-1",
      clientSessionKey: "client-session-key-0001",
      startedAt: initialTime,
      lastHeartbeatAt: initialTime,
      endedAt: options.endedAt ?? null,
      endReason: null,
      lastSequence: 0,
      createdAt: initialTime,
      updatedAt: initialTime
    }
  ];
  const timeSlices: TimeSliceRow[] = [];
  const courseAuthorizations = options.authorizedCourseId
    ? [{ learnerId: "learner-1", courseId: options.authorizedCourseId }]
    : [];
  const courseRevisionItems = options.approvedItemId
    ? [{ id: options.approvedItemId, revisionId: "revision-1" }]
    : [];

  const sessionDelegate = {
    async upsert(input: {
      where: { profileSessionId_clientSessionKey: { profileSessionId: string; clientSessionKey: string } };
      create: Omit<SessionRow, "id" | "createdAt" | "updatedAt">;
    }) {
      const key = input.where.profileSessionId_clientSessionKey;
      const existing = sessions.find(
        (row) =>
          row.profileSessionId === key.profileSessionId &&
          row.clientSessionKey === key.clientSessionKey
      );
      if (existing) return existing;
      const row: SessionRow = {
        ...input.create,
        id: `session-${sessions.length + 1}`,
        createdAt: input.create.startedAt,
        updatedAt: input.create.startedAt
      };
      sessions.push(row);
      return row;
    },
    async findFirst({ where }: { where: Record<string, unknown> }) {
      const row = sessions.find((candidate) => matchesSession(candidate, where));
      return row ? { ...row } : null;
    },
    async updateMany({
      where,
      data
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) {
      const row = sessions.find((candidate) => matchesSession(candidate, where));
      if (!row) return { count: 0 };
      Object.assign(row, data, { updatedAt: data.lastHeartbeatAt ?? data.endedAt ?? row.updatedAt });
      return { count: 1 };
    }
  };

  const timeSliceDelegate = {
    async findUnique({
      where
    }: {
      where: { learnerId_bucketStartedAt: { learnerId: string; bucketStartedAt: Date } };
    }) {
      const key = where.learnerId_bucketStartedAt;
      return (
        timeSlices.find(
          (row) =>
            row.learnerId === key.learnerId &&
            row.bucketStartedAt.getTime() === key.bucketStartedAt.getTime()
        ) ?? null
      );
    },
    async upsert(input: {
      where: { learnerId_bucketStartedAt: { learnerId: string; bucketStartedAt: Date } };
      create: Omit<TimeSliceRow, "id" | "updatedAt">;
      update: Record<string, unknown>;
    }) {
      const existing = await this.findUnique({ where: input.where });
      if (existing) {
        Object.assign(existing, input.update, { updatedAt: now });
        return existing;
      }
      const row: TimeSliceRow = {
        ...input.create,
        id: `slice-${timeSlices.length + 1}`,
        updatedAt: now
      };
      timeSlices.push(row);
      return row;
    }
  };

  const prisma = {
    learnerLearningSession: sessionDelegate,
    learnerLearningTimeSlice: timeSliceDelegate,
    courseRevisionItem: {
      async findFirst({ where }: { where: { id: string; revisionId: string } }) {
        const item = courseRevisionItems.find(
          (row) => row.id === where.id && row.revisionId === where.revisionId
        );
        return item
          ? {
              ...item,
              materialType: "VIDEO_GUIDE",
              videoGuideLessonId: "video-1",
              englishGuidedStudyMaterialId: null,
              learningFlashcardDeckId: null,
              publication: {
                approvedHash: "approved-version-1",
                currentHash: "approved-version-1",
                approvedSnapshot: {}
              }
            }
          : null;
      }
    },
    async $transaction<T>(run: (transaction: typeof prisma) => Promise<T>) {
      return run(prisma);
    }
  };

  const learnerAccess = {
    async assertCourseAuthorized(currentSubject: typeof subject, courseId: string) {
      assert.equal(currentSubject.learnerId, "learner-1");
      const authorized = courseAuthorizations.some(
        (row) => row.learnerId === currentSubject.learnerId && row.courseId === courseId
      );
      return authorized
        ? {
            id: courseId,
            approvedRevisionId: "revision-1",
            approvedRevision: { id: "revision-1" }
          }
        : null;
    },
    async assertScenarioAuthorized() {
      return { id: "scenario-1", slug: "video-guide-narration" };
    }
  };

  const context = new LearnerLearningContextService(
    learnerAccess as never,
    prisma as never
  );
  const service = new LearnerLearningSessionService(context, prisma as never);

  return {
    context,
    service,
    sessions,
    timeSlices,
    courseAuthorizations,
    courseRevisionItems
  };
}

export function createEventFixture(options: {
  materialType?: "VIDEO_GUIDE" | "LEARNING_FLASHCARD";
} = {}) {
  const materialType = options.materialType ?? "VIDEO_GUIDE";
  const materialId = materialType === "LEARNING_FLASHCARD" ? "deck-1" : "video-1";
  const learningContext = {
    isLearning: true,
    courseId: "course-1",
    courseRevisionItemId: "item-1",
    materialType,
    materialId
  };
  const resolvedContext = {
    ...learningContext,
    scenarioId: null,
    courseRevisionId: "revision-1",
    resourceType: "COURSE_MATERIAL",
    resourceId: "item-1",
    contentVersion: "approved-version-1",
    partKey: null
  };
  const activityEvents: Array<{
    id: string;
    idempotencyKey: string;
    eventType: string;
    metrics: Record<string, boolean | number | string>;
    [key: string]: unknown;
  }> = [];
  let materialProgress: Record<string, unknown> | null = null;
  const partProgressRows: Array<Record<string, unknown>> = [];
  const flashcardReviews = [
    {
      id: "review-1",
      userId: "user-1",
      learnerId: "learner-1",
      deckId: "deck-1",
      cardId: "card-1",
      grade: "HARD",
      createdAt: now
    }
  ];

  const prisma = {
    learnerLearningSession: {
      async findFirst() {
        return { id: "session-1" };
      }
    },
    learnerActivityEvent: {
      async findUnique({ where }: { where: { idempotencyKey: string } }) {
        return activityEvents.find((event) => event.idempotencyKey === where.idempotencyKey) ?? null;
      },
      async upsert(input: {
        where: { idempotencyKey: string };
        create: Record<string, unknown> & { metrics?: Record<string, boolean | number | string> };
      }) {
        const existing = activityEvents.find(
          (event) => event.idempotencyKey === input.where.idempotencyKey
        );
        if (existing) return existing;
        const row = {
          id: `activity-${activityEvents.length + 1}`,
          ...input.create,
          idempotencyKey: input.where.idempotencyKey,
          eventType: String(input.create.eventType),
          metrics: input.create.metrics ?? {}
        };
        activityEvents.push(row);
        return row;
      }
    },
    courseRevisionItem: {
      async findFirst() {
        return {
          publication: {
            approvedHash: "approved-version-1",
            approvedSnapshot: materialType === "LEARNING_FLASHCARD"
              ? { cards: [{ id: "card-1" }, { id: "card-2" }] }
              : {
                  type: "VIDEO_GUIDE",
                  audioDurationSeconds: 100,
                  narrationTimeline: [{ id: "node-1" }],
                  questions: [
                    { id: "question-1", options: ["A", "B", "C"], answer: 2 }
                  ]
                }
          }
        };
      }
    },
    learnerMaterialProgress: {
      async findUnique() {
        return materialProgress;
      },
      async upsert(input: { create: Record<string, unknown>; update: Record<string, unknown> }) {
        if (!materialProgress) {
          materialProgress = {
            id: "progress-1",
            status: "IN_PROGRESS",
            progressPercent: 0,
            firstStartedAt: now,
            completedAt: null,
            ...input.create
          };
        } else {
          Object.assign(materialProgress, input.update);
        }
        return { ...materialProgress };
      },
      async update(input: { data: Record<string, unknown> }) {
        assert.ok(materialProgress);
        Object.assign(materialProgress, input.data);
        return materialProgress;
      }
    },
    learnerMaterialPartProgress: {
      async findUnique({
        where
      }: {
        where: { materialProgressId_partKey: { partKey: string } };
      }) {
        return (
          partProgressRows.find(
            (row) => row.partKey === where.materialProgressId_partKey.partKey
          ) ?? null
        );
      },
      async upsert(input: {
        where: { materialProgressId_partKey: { partKey: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        let row = partProgressRows.find(
          (candidate) =>
            candidate.partKey === input.where.materialProgressId_partKey.partKey
        );
        if (row) Object.assign(row, input.update);
        else {
          row = { id: `part-${partProgressRows.length + 1}`, ...input.create };
          partProgressRows.push(row);
        }
        return { ...row };
      },
      async findMany() {
        return partProgressRows.map((row) => ({ ...row }));
      }
    },
    learningFlashcardReview: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return flashcardReviews.find((row) =>
          Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value)
        ) ?? null;
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return flashcardReviews.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value)
        );
      }
    },
    async $transaction<T>(run: (transaction: typeof prisma) => Promise<T>) {
      return run(prisma);
    }
  };
  const contextService = {
    async resolve(_subject: typeof subject, input: { partKey?: string }) {
      return { ...resolvedContext, partKey: input.partKey ?? null };
    }
  };
  const activityService = new LearnerActivityService(prisma as never);
  const service = new LearnerLearningEventService(
    contextService as never,
    activityService,
    prisma as never
  );

  const record = (event: LearnerLearningEventDto) =>
    service.recordBatch(
      subject,
      "refresh-1",
      "session-1",
      { events: [event] },
      now
    );
  const mediaEvent = (
    eventId: string,
    startSeconds: number,
    endSeconds: number
  ): LearnerLearningEventDto => ({
    eventId,
    sequence: 1,
    type: "MEDIA_PROGRESS",
    occurredAt: now.toISOString(),
    partKey: "AUTONOMOUS",
    startSeconds,
    endSeconds,
    mediaDurationSeconds: 100,
    context: learningContext
  });
  const flashcardEvent = (
    eventId: string,
    reviewId = "review-1"
  ): LearnerLearningEventDto => ({
    eventId,
    sequence: 1,
    type: "FLASHCARD_REVIEWED",
    occurredAt: now.toISOString(),
    partKey: "FLASHCARD_ROUND",
    reviewId,
    context: learningContext
  });

  return {
    service,
    activityEvents,
    learningContext,
    flashcardReviews,
    flashcardEvent,
    record,
    mediaEvent,
    get partProgress() {
      return (partProgressRows[0] ?? { progressData: {} }) as {
        progressData: { playedRanges?: Array<{ startSeconds: number; endSeconds: number }> };
      };
    }
  };
}

import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  getPrismaClient,
  type LearningFlashcardReviewGrade,
  type LearningFlashcardStrategy,
  type Prisma
} from "@xueleai/database";
import { AiService, type AttributionContext } from "../ai/ai.service.js";
import { AppException } from "../common/app-exception.js";
import { hashCourseSnapshot, snapshotCourseMaterial } from "../courses/course-domain.js";
import { CourseReviewService } from "../courses/course-review.service.js";
import { LearnerActivityService } from "../profiles/learner-activity.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import {
  GenerateLearningFlashcardDeckDto,
  ImportLearningFlashcardDeckDto,
  ReviewLearningFlashcardDto,
  UpdateLearningFlashcardDto,
  learningFlashcardsSourceTextMaxLength
} from "./dto/learning-flashcards.dto.js";
import {
  parseGeneratedFlashcardDeck,
  type FlashcardGenerationInput,
  type GeneratedFlashcard,
  type GeneratedFlashcardDeck
} from "./learning-flashcards-generator.js";

const defaultCardTypes = ["meaning", "spelling", "example", "grammar", "compare"];
const maxPromptSourceTextLength = 60_000;

const deckInclude = {
  aiTask: {
    select: {
      id: true,
      status: true,
      providerName: true,
      modelName: true
    }
  },
  cards: {
    include: {
      reviews: {
        select: {
          cardId: true,
          createdAt: true,
          grade: true
        }
      }
    },
    orderBy: {
      sortOrder: "asc" as const
    }
  },
  reviews: {
    select: {
      cardId: true,
      createdAt: true,
      grade: true
    }
  },
  textbook: {
    select: {
      id: true,
      slug: true,
      title: true,
      subject: true,
      version: true,
      grade: true,
      volume: true,
      publisher: true,
      markdownConversionStatus: true,
      markdownPageCount: true
    }
  }
} satisfies Prisma.LearningFlashcardDeckInclude;

type DeckWithRelations = Prisma.LearningFlashcardDeckGetPayload<{
  include: typeof deckInclude;
}>;

type CardWithReviewSummary = Prisma.LearningFlashcardGetPayload<{
  include: {
    reviews: {
      select: {
        cardId: true;
        createdAt: true;
        grade: true;
      };
    };
  };
}>;

interface GenerationSource {
  sourceName: string;
  sourceText: string;
  textbookId: string | null;
  textbookRange: string | null;
  title: string;
}

@Injectable()
export class LearningFlashcardsService {
  private readonly prisma = getPrismaClient();
  private readonly logger = new Logger(LearningFlashcardsService.name);

  constructor(
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(CourseReviewService) private readonly courseReviewService: CourseReviewService,
    @Inject(LearnerActivityService) private readonly learnerActivityService?: LearnerActivityService
  ) {}

  async listUserDecks(subject: ProfileSubject) {
    const decks = await this.prisma.learningFlashcardDeck.findMany({
      where: flashcardSubjectWhere(subject),
      include: deckIncludeForSubject(subject),
      orderBy: {
        createdAt: "desc"
      },
      take: 40
    });

    return decks.map((deck) => this.toDeckForIdentity(subject.mode === "LEARNER", deck as DeckWithRelations));
  }

  async getUserDeck(subject: ProfileSubject, id: string) {
    const deck = await this.prisma.learningFlashcardDeck.findFirst({
      where: flashcardSubjectWhere(subject, { id }),
      include: deckIncludeForSubject(subject)
    });

    if (!deck) {
      throw new AppException(40401, "闪卡组不存在", HttpStatus.NOT_FOUND);
    }

    return this.toDeckForIdentity(subject.mode === "LEARNER", deck as DeckWithRelations);
  }

  async getPublicCourseDeck(id: string) {
    const publication = await this.prisma.courseMaterialPublication.findFirst({
      where: {
        learningFlashcardDeckId: id,
        approvedHash: {
          not: null
        }
      },
      include: {
        learningFlashcardDeck: {
          include: deckInclude
        }
      }
    });
    const deck = publication?.learningFlashcardDeck;

    if (!deck) {
      throw new AppException(40401, "闪卡组不存在或尚未公开", HttpStatus.NOT_FOUND);
    }

    return this.toPublicDeck(deck);
  }

  async generateDeck(attribution: AttributionContext, dto: GenerateLearningFlashcardDeckDto) {
    const { userId, learnerId, rootScenarioId } = attribution;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const source = await this.resolveGenerationSource(dto);
    const cardTypes = normalizeCardTypes(dto.cardTypes);
    const generationInput: FlashcardGenerationInput = {
      title: source.title,
      sourceText: source.sourceText,
      strategy: dto.strategy,
      detailRequest: dto.detailRequest?.trim() || "",
      cardTypes,
      targetCardCount: dto.targetCardCount
    };
    const aiResult = await this.aiService.generateScenarioTextForExternalBilling({
      userId,
      learnerId,
      rootScenarioId,
      scenarioSlug: "learning-flashcards-deck",
      input: source.title,
      maxTokens: 8192,
      modelInstanceId: dto.modelInstanceId?.trim() || undefined,
      variables: {
        title: source.title,
        sourceType: dto.sourceType,
        sourceName: source.sourceName,
        sourceText: source.sourceText.slice(0, maxPromptSourceTextLength),
        strategy: dto.strategy,
        detailRequest: generationInput.detailRequest ?? "",
        cardTypes: cardTypes.join(", "),
        targetCardCount: String(dto.targetCardCount),
        textbookRange: source.textbookRange ?? ""
      }
    });
    const generated = parseGeneratedFlashcardDeck(aiResult.text, generationInput);

    return this.createDeckRecord({ userId, learnerId }, {
      aiTaskId: aiResult.taskId,
      cardTypes,
      detailRequest: generationInput.detailRequest,
      generated,
      modelName: aiResult.modelName,
      providerName: aiResult.providerName,
      sourceName: source.sourceName,
      sourceText: source.sourceText,
      sourceType: dto.sourceType,
      strategy: dto.strategy,
      targetCardCount: dto.targetCardCount,
      textbookId: source.textbookId,
      textbookRange: source.textbookRange
    });
  }

  async importDeck(subject: ProfileSubject, dto: ImportLearningFlashcardDeckDto) {
    const { userId, learnerId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const cards = parseImportedCards(dto.importText);

    if (cards.length === 0) {
      throw new AppException(40001, "未识别到可导入的闪卡", HttpStatus.BAD_REQUEST);
    }

    const generated: GeneratedFlashcardDeck = {
      title: dto.title.trim(),
      summary: `导入 ${cards.length} 张闪卡`,
      knowledgeMap: [
        {
          title: dto.title.trim(),
          description: "导入卡组",
          priority: 80
        }
      ],
      cards
    };

    return this.createDeckRecord({ userId, learnerId }, {
      cardTypes: defaultCardTypes,
      detailRequest: "",
      generated,
      sourceName: dto.sourceName?.trim() || dto.title.trim(),
      sourceText: dto.importText.trim(),
      sourceType: "IMPORT",
      strategy: dto.strategy ?? "SUBJECT_KNOWLEDGE",
      targetCardCount: cards.length
    });
  }

  async updateCard(subject: ProfileSubject, cardId: string, dto: UpdateLearningFlashcardDto) {
    const card = await this.ensureEditableCard(subject, cardId);
    const currentTags = asStringArray(card.tags);
    const nextType = dto.type !== undefined ? dto.type.trim() || card.type : card.type;
    const nextFront = dto.front !== undefined ? dto.front.trim() : card.front;
    const nextBack = dto.back !== undefined ? dto.back.trim() : card.back;
    const nextSource = dto.source !== undefined ? dto.source.trim() || null : card.source;
    const nextTags = dto.tags !== undefined ? normalizeTags(dto.tags) : currentTags;
    const changed =
      nextType !== card.type ||
      nextFront !== card.front ||
      nextBack !== card.back ||
      nextSource !== card.source ||
      !sameStringArray(nextTags, currentTags);

    if (!changed) {
      return this.toCard(card);
    }

    const updated = await this.prisma.learningFlashcard.update({
      where: {
        id: card.id
      },
      data: {
        ...(dto.type !== undefined ? { type: nextType } : {}),
        ...(dto.front !== undefined ? { front: nextFront } : {}),
        ...(dto.back !== undefined ? { back: nextBack } : {}),
        ...(dto.source !== undefined ? { source: nextSource } : {}),
        ...(dto.tags !== undefined ? { tags: nextTags as Prisma.InputJsonValue } : {})
      },
      include: {
        reviews: {
          select: {
            cardId: true,
            createdAt: true,
            grade: true
          }
        }
      }
    });

    await this.recordCourseMaterialChange(card.deckId);

    return this.toCard(updated);
  }

  private async recordCourseMaterialChange(deckId: string) {
    try {
      await this.courseReviewService.recordMaterialChange("LEARNING_FLASHCARD", deckId);
    } catch (error) {
      this.logger.warn(
        `记录闪卡课件变更失败，将在审核列表对账时重试：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async reviewCard(subject: ProfileSubject, cardId: string, dto: ReviewLearningFlashcardDto) {
    return this.prisma.$transaction(async (transaction) => {
      const card = await this.findReviewableCard(transaction, subject, cardId);
      const review = await transaction.learningFlashcardReview.create({
        data: {
          userId: subject.userId,
          learnerId: subject.learnerId,
          deckId: card.deckId,
          cardId: card.id,
          grade: dto.grade
        }
      });

      if (this.learnerActivityService) {
        await this.learnerActivityService.record({
          subject,
          eventType: "REVIEW_COMPLETED",
          resourceType: "FLASHCARD_REVIEW",
          resourceId: review.id,
          idempotencyKey: `flashcard-review:${review.id}:review-completed`,
          metrics: { grade: dto.grade }
        }, transaction);
      }

      return {
        id: review.id,
        cardId: review.cardId,
        deckId: review.deckId,
        grade: review.grade,
        createdAt: review.createdAt
      };
    });
  }

  private async resolveGenerationSource(dto: GenerateLearningFlashcardDeckDto): Promise<GenerationSource> {
    if (dto.sourceType === "TEXTBOOK") {
      const textbookId = dto.textbookId?.trim();

      if (!textbookId) {
        throw new AppException(40001, "请选择电子教材", HttpStatus.BAD_REQUEST);
      }

      const textbook = await this.prisma.learningMaterialTextbook.findUnique({
        where: {
          id: textbookId
        }
      });

      if (!textbook) {
        throw new AppException(40401, "教材不存在", HttpStatus.NOT_FOUND);
      }

      const markdown = textbook.markdownContent?.trim();

      if (!markdown) {
        throw new AppException(40001, "该教材尚未准备好可生成闪卡的 Markdown 内容", HttpStatus.BAD_REQUEST);
      }

      const textbookRange = dto.textbookRange?.trim() || "book";
      const sourceText = textbookRange === "book" ? markdown : extractTextbookRange(markdown, textbookRange) || markdown;

      return {
        title: textbookRange === "book" ? textbook.title : `${textbook.title} ${textbookRange}`,
        sourceName: textbook.title,
        sourceText: sourceText.slice(0, learningFlashcardsSourceTextMaxLength),
        textbookId: textbook.id,
        textbookRange
      };
    }

    const sourceText = dto.sourceText?.trim() ?? "";

    if (!sourceText) {
      throw new AppException(40001, "请先输入或上传学习材料文本", HttpStatus.BAD_REQUEST);
    }

    const sourceName = dto.sourceName?.trim() || "上传材料";

    return {
      title: sourceName,
      sourceName,
      sourceText: sourceText.slice(0, learningFlashcardsSourceTextMaxLength),
      textbookId: null,
      textbookRange: null
    };
  }

  private async createDeckRecord(
    attribution: Pick<ProfileSubject, "userId" | "learnerId">,
    input: {
      aiTaskId?: string;
      cardTypes: string[];
      detailRequest?: string;
      generated: GeneratedFlashcardDeck;
      modelName?: string | null;
      providerName?: string | null;
      sourceName: string;
      sourceText?: string;
      sourceType: "IMPORT" | "TEXTBOOK" | "UPLOAD";
      strategy: LearningFlashcardStrategy;
      targetCardCount: number;
      textbookId?: string | null;
      textbookRange?: string | null;
    }
  ) {
    const cards = input.generated.cards.slice(0, 500);
    const createDeck = (client: Prisma.TransactionClient | typeof this.prisma) => client.learningFlashcardDeck.create({
      data: {
        userId: attribution.userId,
        learnerId: attribution.learnerId,
        title: input.generated.title.slice(0, 120),
        sourceType: input.sourceType,
        sourceName: input.sourceName.slice(0, 240),
        sourceText: input.sourceText ?? "",
        textbookId: input.textbookId ?? null,
        textbookRange: input.textbookRange ?? null,
        detailRequest: input.detailRequest ?? "",
        strategy: input.strategy,
        cardTypes: normalizeCardTypes(input.cardTypes) as Prisma.InputJsonValue,
        targetCardCount: input.targetCardCount,
        summary: input.generated.summary,
        knowledgeMap: input.generated.knowledgeMap as unknown as Prisma.InputJsonValue,
        status: "READY",
        aiTaskId: input.aiTaskId ?? null,
        providerName: input.providerName ?? null,
        modelName: input.modelName ?? null,
        cards: {
          create: cards.map((card, index) => ({
            type: card.type.slice(0, 80),
            front: card.front,
            back: card.back,
            source: card.source || input.sourceName,
            tags: normalizeTags(card.tags) as Prisma.InputJsonValue,
            sortOrder: index
          }))
        }
      },
      include: deckInclude
    });
    const deck = this.learnerActivityService
      ? await this.prisma.$transaction(async (transaction) => {
          const created = await createDeck(transaction);
          await this.learnerActivityService!.record({
            subject: attribution.learnerId
              ? { userId: attribution.userId, mode: "LEARNER", learnerId: attribution.learnerId }
              : { userId: attribution.userId, mode: "ACCOUNT", learnerId: null },
            eventType: "CREATE_COMPLETED",
            resourceType: "FLASHCARD_DECK",
            resourceId: created.id,
            idempotencyKey: `flashcard-deck:${created.id}:create-completed`,
            metrics: { cardCount: cards.length }
          }, transaction);
          return created;
        })
      : await createDeck(this.prisma);

    return this.toDeckForIdentity(attribution.learnerId !== null, deck);
  }

  private async ensureEditableCard(subject: ProfileSubject, cardId: string) {
    if (!subject.userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const card = await this.prisma.learningFlashcard.findFirst({
      where: {
        id: cardId,
        deck: flashcardSubjectWhere(subject)
      },
      include: {
        reviews: {
          select: {
            cardId: true,
            createdAt: true,
            grade: true
          }
        }
      }
    });

    if (!card) {
      throw new AppException(40401, "闪卡不存在", HttpStatus.NOT_FOUND);
    }

    return card;
  }

  private async findReviewableCard(
    transaction: Prisma.TransactionClient,
    subject: ProfileSubject,
    cardId: string
  ) {
    if (!subject.userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const ownedCandidate = await transaction.learningFlashcard.findFirst({
      where: {
        id: cardId,
        deck: flashcardSubjectWhere(subject)
      },
      select: { id: true, deckId: true }
    });

    if (ownedCandidate) {
      await this.lockFlashcardDeckAndCards(transaction, ownedCandidate.deckId);
      const ownedCard = await transaction.learningFlashcard.findFirst({
        where: {
          id: cardId,
          deck: flashcardSubjectWhere(subject)
        },
        select: { id: true, deckId: true }
      });

      if (ownedCard) {
        return ownedCard;
      }
    }

    const candidate = await transaction.courseRevisionItem.findFirst({
      where: sharedCourseFlashcardReviewWhere(subject, cardId),
      select: sharedCourseFlashcardReviewSelect
    });

    if (!candidate?.learningFlashcardDeckId) {
      throw new AppException(40401, "闪卡不存在", HttpStatus.NOT_FOUND);
    }

    const course = candidate.revision.approvedFor;

    if (!course) {
      throw new AppException(40401, "闪卡不存在", HttpStatus.NOT_FOUND);
    }

    await this.lockSharedFlashcardReviewEligibility(transaction, {
      courseId: course.id,
      deckId: candidate.learningFlashcardDeckId,
      itemId: candidate.id,
      publicationId: candidate.publicationId,
      subject
    });

    const current = await transaction.courseRevisionItem.findFirst({
      where: {
        ...sharedCourseFlashcardReviewWhere(subject, cardId),
        id: candidate.id
      },
      select: sharedCourseFlashcardReviewSelect
    });

    if (!current?.learningFlashcardDeckId || !current.revision.approvedFor) {
      throw new AppException(40401, "闪卡不存在", HttpStatus.NOT_FOUND);
    }

    const publication = current.publication;
    const currentCourse = current.revision.approvedFor;

    if (
      currentCourse.approvedRevisionId !== current.revisionId
      || publication.learningFlashcardDeckId !== current.learningFlashcardDeckId
      || !publication.approvedHash
      || publication.approvedHash !== publication.currentHash
    ) {
      throw new AppException(40401, "闪卡不存在", HttpStatus.NOT_FOUND);
    }

    const deck = await transaction.learningFlashcardDeck.findUnique({
      where: { id: current.learningFlashcardDeckId },
      include: {
        cards: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
        }
      }
    });

    if (
      !deck
      || deck.status !== "READY"
      || hashCourseSnapshot(snapshotCourseMaterial("LEARNING_FLASHCARD", deck)) !== publication.approvedHash
    ) {
      throw new AppException(40401, "闪卡不存在", HttpStatus.NOT_FOUND);
    }

    const sharedCard = deck.cards.find((card) => card.id === cardId);

    if (!sharedCard) {
      throw new AppException(40401, "闪卡不存在", HttpStatus.NOT_FOUND);
    }

    return { id: sharedCard.id, deckId: sharedCard.deckId };
  }

  private async lockFlashcardDeckAndCards(
    transaction: Prisma.TransactionClient,
    deckId: string,
    preventCardInsert = false
  ) {
    if (preventCardInsert) {
      await transaction.$queryRaw`SELECT "id" FROM "learning_flashcard_decks" WHERE "id" = ${deckId} FOR UPDATE`;
    } else {
      await transaction.$queryRaw`SELECT "id" FROM "learning_flashcard_decks" WHERE "id" = ${deckId} FOR SHARE`;
    }
    await transaction.$queryRaw`SELECT "id" FROM "learning_flashcards" WHERE "deckId" = ${deckId} FOR SHARE`;
  }

  private async lockSharedFlashcardReviewEligibility(
    transaction: Prisma.TransactionClient,
    input: {
      courseId: string;
      deckId: string;
      itemId: string;
      publicationId: string;
      subject: ProfileSubject;
    }
  ) {
    await transaction.$queryRaw`SELECT "id" FROM "courses" WHERE "id" = ${input.courseId} FOR SHARE`;
    await transaction.$queryRaw`SELECT "id" FROM "course_material_publications" WHERE "id" = ${input.publicationId} FOR SHARE`;
    await this.lockFlashcardDeckAndCards(transaction, input.deckId, true);
    await transaction.$queryRaw`SELECT "id" FROM "course_revision_items" WHERE "id" = ${input.itemId} FOR SHARE`;
    await transaction.$queryRaw`SELECT "userId" FROM "course_enrollments" WHERE "courseId" = ${input.courseId} AND "userId" = ${input.subject.userId} FOR SHARE`;

    if (input.subject.mode === "LEARNER") {
      await transaction.$queryRaw`SELECT "learnerId" FROM "learner_course_authorizations" WHERE "courseId" = ${input.courseId} AND "learnerId" = ${input.subject.learnerId} FOR SHARE`;
    }
  }

  private toDeck(deck: DeckWithRelations) {
    return {
      id: deck.id,
      userId: deck.userId,
      learnerId: deck.learnerId,
      title: deck.title,
      sourceType: deck.sourceType,
      sourceName: deck.sourceName,
      textbookId: deck.textbookId,
      textbookRange: deck.textbookRange,
      textbook: deck.textbook,
      detailRequest: deck.detailRequest,
      strategy: deck.strategy,
      cardTypes: asStringArray(deck.cardTypes),
      targetCardCount: deck.targetCardCount,
      summary: deck.summary,
      knowledgeMap: Array.isArray(deck.knowledgeMap) ? deck.knowledgeMap : [],
      status: deck.status,
      aiTask: deck.aiTask,
      providerName: deck.providerName,
      modelName: deck.modelName,
      errorMessage: deck.errorMessage,
      cards: deck.cards.map((card) => this.toCard(card)),
      reviewSummary: reviewSummary(deck.reviews),
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt
    };
  }

  private toDeckForIdentity(isLearner: boolean, deck: DeckWithRelations) {
    const result = this.toDeck(deck);

    if (!isLearner) {
      return result;
    }

    const learnerDeck: Partial<typeof result> = { ...result };
    delete learnerDeck.userId;
    delete learnerDeck.learnerId;
    delete learnerDeck.aiTask;
    delete learnerDeck.providerName;
    delete learnerDeck.modelName;

    return learnerDeck;
  }

  private toPublicDeck(deck: DeckWithRelations) {
    return {
      id: deck.id,
      title: deck.title,
      sourceType: deck.sourceType,
      sourceName: deck.sourceName,
      textbookId: deck.textbookId,
      textbookRange: deck.textbookRange,
      textbook: deck.textbook,
      strategy: deck.strategy,
      cardTypes: asStringArray(deck.cardTypes),
      targetCardCount: deck.targetCardCount,
      summary: deck.summary,
      knowledgeMap: Array.isArray(deck.knowledgeMap) ? deck.knowledgeMap : [],
      status: deck.status,
      cards: deck.cards.map((card) => ({
        id: card.id,
        deckId: card.deckId,
        type: card.type,
        front: card.front,
        back: card.back,
        source: card.source,
        tags: asStringArray(card.tags),
        sortOrder: card.sortOrder,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt
      })),
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt
    };
  }

  private toCard(card: CardWithReviewSummary) {
    return {
      id: card.id,
      deckId: card.deckId,
      type: card.type,
      front: card.front,
      back: card.back,
      source: card.source,
      tags: asStringArray(card.tags),
      sortOrder: card.sortOrder,
      reviewSummary: reviewSummary(card.reviews),
      createdAt: card.createdAt,
      updatedAt: card.updatedAt
    };
  }
}

function normalizeCardTypes(cardTypes?: string[]) {
  const values = (cardTypes?.length ? cardTypes : defaultCardTypes)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);

  return values.length > 0 ? values : defaultCardTypes;
}

const sharedCourseFlashcardReviewSelect = {
  id: true,
  revisionId: true,
  publicationId: true,
  learningFlashcardDeckId: true,
  publication: {
    select: {
      approvedHash: true,
      currentHash: true,
      learningFlashcardDeckId: true,
      status: true
    }
  },
  revision: {
    select: {
      courseId: true,
      approvedFor: {
        select: {
          id: true,
          userId: true,
          approvedRevisionId: true,
          publishedAt: true
        }
      }
    }
  }
} satisfies Prisma.CourseRevisionItemSelect;

function sharedCourseFlashcardReviewWhere(
  subject: ProfileSubject,
  cardId: string
): Prisma.CourseRevisionItemWhereInput {
  const courseAccess: Prisma.CourseWhereInput = {
    approvedRevisionId: { not: null },
    publishedAt: { not: null },
    ...(subject.mode === "LEARNER"
      ? { learnerAuthorizations: { some: { learnerId: subject.learnerId } } }
      : {
          OR: [
            { userId: subject.userId },
            { enrollments: { some: { userId: subject.userId } } }
          ]
        })
  };

  return {
    materialType: "LEARNING_FLASHCARD",
    learningFlashcardDeckId: { not: null },
    learningFlashcardDeck: {
      is: {
        status: "READY",
        cards: { some: { id: cardId } }
      }
    },
    publication: {
      is: {
        materialType: "LEARNING_FLASHCARD",
        learningFlashcardDeckId: { not: null },
        status: "APPROVED",
        approvedHash: { not: null }
      }
    },
    revision: {
      is: {
        approvedFor: {
          is: courseAccess
        }
      }
    }
  };
}

function flashcardSubjectWhere(subject: ProfileSubject, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    userId: subject.userId,
    ...(subject.mode === "LEARNER" ? { learnerId: subject.learnerId } : {})
  };
}

function deckIncludeForSubject(subject: ProfileSubject) {
  if (subject.mode === "ACCOUNT") {
    return deckInclude;
  }

  const reviewWhere = {
    userId: subject.userId,
    learnerId: subject.learnerId
  };

  return {
    ...deckInclude,
    cards: {
      ...deckInclude.cards,
      include: {
        reviews: {
          ...deckInclude.cards.include.reviews,
          where: reviewWhere
        }
      }
    },
    reviews: {
      ...deckInclude.reviews,
      where: reviewWhere
    }
  };
}

function normalizeTags(tags?: string[]) {
  return (tags ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function asStringArray(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function parseImportedCards(importText: string): GeneratedFlashcard[] {
  const trimmed = importText.trim();

  if (!trimmed) {
    return [];
  }

  const jsonCards = parseJsonCards(trimmed);

  if (jsonCards.length > 0) {
    return jsonCards;
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitCsvLine(line))
    .map((columns) => ({
      front: columns[0]?.trim() ?? "",
      back: columns[1]?.trim() ?? "",
      type: columns[2]?.trim() || "导入卡",
      source: columns[3]?.trim() || "导入卡组",
      tags: columns[4]?.split(/[|、;；]/).map((item) => item.trim()).filter(Boolean) ?? []
    }))
    .filter((card) => card.front && card.back)
    .slice(0, 500);
}

function parseJsonCards(text: string): GeneratedFlashcard[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    const cards = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { cards?: unknown }).cards)
        ? (parsed as { cards: unknown[] }).cards
        : [];

    return cards
      .map((item) => normalizeImportedCard(item))
      .filter((card): card is GeneratedFlashcard => Boolean(card))
      .slice(0, 500);
  } catch {
    return [];
  }
}

function normalizeImportedCard(value: unknown): GeneratedFlashcard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const front = stringValue(record.front);
  const back = stringValue(record.back);

  if (!front || !back) {
    return null;
  }

  return {
    type: stringValue(record.type) || "导入卡",
    front,
    back,
    source: stringValue(record.source) || "导入卡组",
    tags: Array.isArray(record.tags) ? record.tags.map(stringValue).filter(Boolean).slice(0, 12) : []
  };
}

function splitCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function extractTextbookRange(markdown: string, range: string) {
  const normalizedRange = range.toLowerCase();
  const headings = markdown.split(/\n(?=#{1,4}\s+)/);
  const matched = headings.find((section) => section.toLowerCase().includes(normalizedRange));

  return matched?.trim() ?? "";
}

function reviewSummary(
  reviews: Array<{
    cardId?: string | null;
    createdAt?: Date | string | null;
    grade: LearningFlashcardReviewGrade;
  }>
) {
  const summary = { hard: 0, blurry: 0, mastered: 0 };
  const orderedReviews = [...reviews].sort((left, right) => reviewCreatedAt(right) - reviewCreatedAt(left));
  const hasCardIds = orderedReviews.some((review) => Boolean(review.cardId));

  if (hasCardIds) {
    const countedCardIds = new Set<string>();

    for (const review of orderedReviews) {
      if (!review.cardId || countedCardIds.has(review.cardId)) {
        continue;
      }

      countedCardIds.add(review.cardId);
      addReviewGrade(summary, review.grade);
    }

    return summary;
  }

  const latestReview = orderedReviews[0];

  if (latestReview) {
    addReviewGrade(summary, latestReview.grade);
  }

  return summary;
}

function addReviewGrade(summary: { hard: number; blurry: number; mastered: number }, grade: LearningFlashcardReviewGrade) {
  if (grade === "HARD") {
    summary.hard += 1;
  } else if (grade === "BLURRY") {
    summary.blurry += 1;
  } else if (grade === "MASTERED") {
    summary.mastered += 1;
  }
}

function reviewCreatedAt(review: { createdAt?: Date | string | null }) {
  if (review.createdAt instanceof Date) {
    return review.createdAt.getTime();
  }

  if (typeof review.createdAt === "string") {
    const time = Date.parse(review.createdAt);
    return Number.isFinite(time) ? time : 0;
  }

  return 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

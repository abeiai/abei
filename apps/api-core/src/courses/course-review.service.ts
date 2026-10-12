import { HttpStatus, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AiService } from "../ai/ai.service.js";
import type { ProviderTextAttachment } from "../ai/provider-adapters.js";
import { AppException } from "../common/app-exception.js";
import { MediaService } from "../media/media.service.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import {
  buildCourseAiPrecheckPayload,
  chunkCourseAiPrecheckText,
  combineCourseAiPrecheckResults,
  parseCourseAiPrecheckResult,
  type CourseAiPrecheckResult
} from "./course-ai-precheck.js";
import {
  diffCourseMaterial,
  diffCourseRevision,
  hashCourseSnapshot,
  snapshotCourseMaterial,
  type CourseRevisionSnapshot,
  type CourseMaterialType
} from "./course-domain.js";

export type CourseReviewFilters = {
  scope?: string;
  status?: string;
};

const revisionInclude = {
  coverMedia: {
    select: {
      id: true,
      url: true
    }
  },
  items: {
    include: {
      publication: true,
      videoGuideLesson: true,
      englishGuidedStudyMaterial: true,
      pictureBook: true,
      learningFlashcardDeck: {
        include: {
          cards: {
            orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }]
          }
        }
      }
    },
    orderBy: {
      sortOrder: "asc" as const
    }
  }
} satisfies Prisma.CourseRevisionInclude;

const reviewRequestInclude = {
  course: {
    include: {
      user: {
        select: {
          id: true,
          email: true,
          nickname: true
        }
      },
      approvedRevision: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  courseRevision: {
    include: revisionInclude
  },
  materialPublication: true,
  submittedByUser: {
    select: {
      id: true,
      email: true,
      nickname: true
    }
  },
  reviewedByAdmin: {
    select: {
      id: true,
      email: true,
      name: true
    }
  }
} satisfies Prisma.CourseReviewRequestInclude;

type ReviewRequestRecord = Prisma.CourseReviewRequestGetPayload<{
  include: typeof reviewRequestInclude;
}>;

type RevisionRecord = Prisma.CourseRevisionGetPayload<{
  include: typeof revisionInclude;
}>;

type MaterialRecord = {
  audioUrl?: string | null;
  cards?: unknown[];
  content?: unknown;
  pages?: unknown;
  style?: string;
  aspectRatio?: string;
  id: string;
  knowledgeMap?: unknown;
  status?: string;
  summary?: string | null;
  title: string;
  updatedAt: Date;
  userId: string;
};

type SubmittedMaterialSnapshot = {
  firstPublication: boolean;
  materialHash: string;
  materialType: CourseMaterialType;
  materialSnapshot: Prisma.InputJsonValue;
};

type MaterialReference = {
  key: string;
  materialId: string;
  materialType: CourseMaterialType;
  publicationId: string;
};

const reviewScopes = new Set(["COURSE_REVISION", "MATERIAL_CHANGE"]);
const reviewStatuses = new Set(["PENDING", "APPROVED", "REJECTED"]);
const aiPrecheckPromptVersion = "2026.08.15-v1";
const aiPrecheckPrompt = `你是中国教育内容平台的合规预审员。请审核输入中的资源信息与本批全部文本；如果附带封面图，还必须检查封面图。

审核范围：
1. 标题、简介、标签、资源结构是否清晰、准确、与内容一致，不含误导、低俗、违法违规或明显低质量信息。
2. 封面图是否与资源相关，是否包含违法违规、低俗、暴力、仇恨、色情、广告引流、二维码、水印侵权或明显版权风险。
3. 本批文本中的所有文稿、字幕、讲解、练习、闪卡、用户上传示范朗读语音的识别文本及其他文本是否合规。
4. 检查政治安全、违法犯罪、色情低俗、暴力血腥、歧视仇恨、未成年人风险、隐私泄露、广告引流、版权风险、事实性误导和明显内容质量问题。

只输出一个 JSON 对象，禁止 Markdown 和额外文字：
{"verdict":"PASS 或 REJECT","summary":"本批结论摘要","reasons":[{"category":"风险类型","location":"具体字段或文本位置","reason":"不通过理由","evidence":"必要的短证据，不复制大段原文"}]}

只有本批全部通过时 verdict 才能为 PASS；REJECT 必须给出至少一个具体理由。

待审核数据：
{{reviewData}}`;
const reviewTransactionOptions = {
  maxWait: 5_000,
  timeout: 30_000
} as const;

@Injectable()
export class CourseReviewService {
  private readonly prisma = getPrismaClient();
  private readonly logger = new Logger(CourseReviewService.name);

  constructor(
    @Optional() @Inject(AiService) private readonly aiService?: AiService,
    @Optional() @Inject(LearnerAccessService) private readonly learnerAccessService?: LearnerAccessService,
    @Optional() @Inject(MediaService) private readonly mediaService?: MediaService
  ) {}

  async submitCourse(userId: string, courseId: string) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.lockCourse(transaction, courseId);
      const course = await transaction.course.findUnique({
        where: { id: courseId },
        include: {
          approvedRevision: {
            include: revisionInclude
          },
          workingRevision: {
            include: revisionInclude
          }
        }
      });

      if (!course) {
        throw new AppException(40401, "课程不存在", HttpStatus.NOT_FOUND);
      }

      if (course.userId !== userId) {
        throw new AppException(40301, "只能提交自己的课程审核", HttpStatus.FORBIDDEN);
      }

      const revision = course.workingRevision;

      if (!revision) {
        throw new AppException(40001, "课程没有可提交的工作版本", HttpStatus.BAD_REQUEST);
      }

      if (course.reviewState === "PENDING_REVIEW" || revision.status === "PENDING") {
        throw new AppException(40901, "课程正在审核中", HttpStatus.CONFLICT);
      }

      if (!['DRAFT', 'REJECTED'].includes(revision.status)) {
        throw new AppException(40001, "课程没有可提交的工作版本", HttpStatus.BAD_REQUEST);
      }

      if (revision.items.length === 0) {
        throw new AppException(40001, "课程至少需要一个课件", HttpStatus.BAD_REQUEST);
      }

      const materialReferences = this.materialReferences(revision.items);

      await this.lockRevisionMaterials(transaction, revision.id);
      await this.lockRevisionMaterialPublications(transaction, revision.id);

      const submittedMaterials = new Map<string, SubmittedMaterialSnapshot>();

      for (const reference of materialReferences) {
        const material = this.requireLearnableMaterial(
          userId,
          reference.materialType,
          await this.readMaterial(transaction, reference.materialType, reference.materialId)
        );
        const publication = await transaction.courseMaterialPublication.findUnique({
          where: { id: reference.publicationId }
        });

        if (!publication) {
          throw new AppException(40901, "课件公开状态已发生变化，请刷新后重试", HttpStatus.CONFLICT);
        }

        const snapshot = snapshotCourseMaterial(reference.materialType, material);
        const currentSnapshot = toJson(snapshot);
        const currentHash = hashCourseSnapshot(snapshot);
        const status = publication.approvedHash === currentHash ? "APPROVED" : "PENDING";
        if (publication.currentHash !== currentHash || publication.status !== status) {
          await transaction.courseMaterialPublication.update({
            where: { id: reference.publicationId },
            data: {
              currentSnapshot,
              currentHash,
              status
            }
          });
        }
        if (publication.approvedHash === null) {
          submittedMaterials.set(reference.publicationId, {
            firstPublication: true,
            materialHash: currentHash,
            materialType: reference.materialType,
            materialSnapshot: currentSnapshot
          });
        }
      }

      const beforeSnapshot = course.approvedRevision
        ? this.snapshotRevision(course.approvedRevision)
        : {};
      const afterSnapshot = this.snapshotRevision(revision, submittedMaterials);
      const submittedAt = new Date();

      await transaction.courseRevision.update({
        where: { id: revision.id },
        data: {
          status: "PENDING",
          submittedAt,
          reviewedAt: null,
          rejectionReason: null
        }
      });
      await transaction.course.update({
        where: { id: course.id },
        data: {
          reviewState: "PENDING_REVIEW"
        }
      });

      return transaction.courseReviewRequest.create({
        data: {
          scope: "COURSE_REVISION",
          courseId: course.id,
          courseRevisionId: revision.id,
          submittedByUserId: userId,
          beforeSnapshot: toJson(beforeSnapshot),
          afterSnapshot: toJson(afterSnapshot),
          diff: toJson(diffCourseRevision(beforeSnapshot, afterSnapshot)),
          submittedAt
        },
        include: reviewRequestInclude
      });
    }, reviewTransactionOptions);
  }

  async recordMaterialChange(materialType: CourseMaterialType, materialId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockMaterial(transaction, materialType, materialId);
      const publicationReference = await transaction.courseMaterialPublication.findUnique({
        where: publicationWhere(materialType, materialId)
      });

      if (!publicationReference) {
        return null;
      }

      await this.lockMaterialPublication(transaction, publicationReference.id);
      const material = await this.readMaterial(transaction, materialType, materialId);

      if (!material) {
        throw new AppException(40401, "课件不存在", HttpStatus.NOT_FOUND);
      }

      const publication = await transaction.courseMaterialPublication.findUnique({
        where: { id: publicationReference.id }
      });

      if (!publication) {
        throw new AppException(40901, "课件公开状态已发生变化，请刷新后重试", HttpStatus.CONFLICT);
      }

      const snapshot = snapshotCourseMaterial(materialType, material);
      const currentHash = hashCourseSnapshot(snapshot);
      const currentSnapshot = toJson(snapshot);

      if (publication.approvedHash && publication.approvedHash === currentHash) {
        await transaction.courseMaterialPublication.update({
          where: { id: publication.id },
          data: {
            currentHash,
            currentSnapshot,
            status: "APPROVED"
          }
        });
        await transaction.courseReviewRequest.deleteMany({
          where: {
            scope: "MATERIAL_CHANGE",
            status: "PENDING",
            materialPublicationId: publication.id
          }
        });
        return null;
      }

      await transaction.courseMaterialPublication.update({
        where: { id: publication.id },
        data: {
          currentHash,
          currentSnapshot,
          status: "PENDING"
        }
      });

      if (!publication.approvedHash) {
        await this.syncPendingCourseReviewsForFirstPublication(
          transaction,
          publication.id,
          materialType,
          currentHash,
          currentSnapshot
        );
        return null;
      }

      const affectedCourses = await this.listAffectedCourses(transaction, publication.id);

      if (affectedCourses.length === 0) {
        await transaction.courseReviewRequest.deleteMany({
          where: {
            scope: "MATERIAL_CHANGE",
            status: "PENDING",
            materialPublicationId: publication.id
          }
        });
        return null;
      }

      const requestData = {
        submittedByUserId: material.userId,
        beforeSnapshot: publication.approvedSnapshot ?? toJson({}),
        afterSnapshot: currentSnapshot,
        diff: toJson(diffCourseMaterial(publication.approvedSnapshot, snapshot)),
        submittedAt: new Date()
      };
      const pending = await transaction.courseReviewRequest.findFirst({
        where: {
          scope: "MATERIAL_CHANGE",
          status: "PENDING",
          materialPublicationId: publication.id
        },
        select: {
          id: true
        }
      });
      const request = pending
        ? await transaction.courseReviewRequest.update({
          where: { id: pending.id },
          data: requestData,
          include: reviewRequestInclude
        })
        : await transaction.courseReviewRequest.create({
          data: {
            scope: "MATERIAL_CHANGE",
            materialPublicationId: publication.id,
            ...requestData
          },
          include: reviewRequestInclude
        });

      return { ...request, affectedCourses };
    });
  }

  private async syncPendingCourseReviewsForFirstPublication(
    transaction: Prisma.TransactionClient,
    publicationId: string,
    materialType: CourseMaterialType,
    materialHash: string,
    materialSnapshot: Prisma.InputJsonValue
  ) {
    const requests = await transaction.courseReviewRequest.findMany({
      where: {
        scope: "COURSE_REVISION",
        status: "PENDING",
        courseRevision: {
          is: {
            items: {
              some: { publicationId, pinnedHash: null }
            }
          }
        }
      },
      select: {
        id: true,
        beforeSnapshot: true,
        afterSnapshot: true
      }
    });

    for (const request of requests) {
      const afterSnapshot = replaceFirstPublicationMaterialSnapshot(
        request.afterSnapshot,
        publicationId,
        materialType,
        materialHash,
        materialSnapshot
      );

      if (!afterSnapshot) {
        continue;
      }

      await transaction.courseReviewRequest.updateMany({
        where: {
          id: request.id,
          status: "PENDING"
        },
        data: {
          afterSnapshot,
          diff: toJson(diffCourseRevision(
            (request.beforeSnapshot ?? {}) as unknown as CourseRevisionSnapshot,
            afterSnapshot as unknown as CourseRevisionSnapshot
          )),
          submittedAt: new Date(),
          aiPrecheckStatus: "NOT_STARTED",
          aiPrecheckProgress: 0,
          aiPrecheckMessage: null,
          aiPrecheckResult: toJson({}),
          aiPrecheckTaskId: null,
          aiPrecheckTrigger: null,
          aiPrecheckStartedAt: null,
          aiPrecheckCompletedAt: null
        }
      });
    }
  }

  async listReviews(filters: CourseReviewFilters = {}) {
    const where = this.reviewWhere(filters);
    const reviews = await this.prisma.courseReviewRequest.findMany({
      where,
      include: reviewRequestInclude,
      orderBy: [{ status: "asc" }, { submittedAt: "desc" }]
    });

    const enrichedReviews = await Promise.all(
      reviews.map((review) => this.withAffectedCourses(this.prisma, review))
    );

    return enrichedReviews.filter((review) =>
      review.scope !== "MATERIAL_CHANGE"
      || review.status !== "PENDING"
      || review.affectedCourses.length > 0
    );
  }

  async getReview(id: string) {
    const review = await this.prisma.courseReviewRequest.findUnique({
      where: { id },
      include: reviewRequestInclude
    });

    if (!review) {
      throw new AppException(40401, "审核请求不存在", HttpStatus.NOT_FOUND);
    }

    return this.withAffectedCourses(this.prisma, review);
  }

  async runAiPrecheck(
    id: string,
    trigger: "MANUAL" | "AUTOMATIC" = "MANUAL",
    waitForCompletion = true
  ) {
    const aiService = this.aiService;

    if (!aiService) {
      throw new AppException(50001, "AI 预审服务暂不可用", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const claimed = await this.prisma.courseReviewRequest.updateMany({
      where: {
        id,
        status: "PENDING",
        aiPrecheckStatus: {
          not: "RUNNING"
        }
      },
      data: {
        aiPrecheckStatus: "RUNNING",
        aiPrecheckProgress: 5,
        aiPrecheckMessage: "正在整理资源内容",
        aiPrecheckResult: toJson({}),
        aiPrecheckTaskId: null,
        aiPrecheckTrigger: trigger,
        aiPrecheckStartedAt: new Date(),
        aiPrecheckCompletedAt: null
      }
    });

    if (claimed.count !== 1) {
      const existing = await this.prisma.courseReviewRequest.findUnique({
        where: { id },
        select: { id: true, status: true, aiPrecheckStatus: true }
      });

      if (!existing) {
        throw new AppException(40401, "审核请求不存在", HttpStatus.NOT_FOUND);
      }
      if (existing.status !== "PENDING") {
        throw new AppException(40901, "该资源已完成人工审核，不能再次预审", HttpStatus.CONFLICT);
      }

      throw new AppException(40901, "AI 预审正在进行中，请稍后查看结果", HttpStatus.CONFLICT);
    }

    const execute = async () => {
      try {
        const review = await this.prisma.courseReviewRequest.findUnique({
          where: { id },
          include: reviewRequestInclude
        });

        if (!review) {
          throw new AppException(40401, "审核请求不存在", HttpStatus.NOT_FOUND);
        }

        await this.ensureAiPrecheckScenario();
        const payload = buildCourseAiPrecheckPayload({
          scope: review.scope,
          afterSnapshot: review.afterSnapshot
        });
        const textChunks = chunkCourseAiPrecheckText(payload.textSections);
        const coverAttachment = payload.resourceType === "COURSE_REVISION"
          ? await this.courseCoverAttachment(payload.coverUrl)
          : null;
        const batchResults: CourseAiPrecheckResult[] = [];
        const taskIds: string[] = [];

        for (let index = 0; index < textChunks.length; index += 1) {
          const progress = 15 + Math.round((index / Math.max(1, textChunks.length)) * 75);
          await this.prisma.courseReviewRequest.update({
            where: { id },
            data: {
              aiPrecheckProgress: progress,
              aiPrecheckMessage: `正在审核第 ${index + 1}/${textChunks.length} 批内容`
            }
          });

          const reviewData = {
            resourceName: payload.resourceName,
            resourceType: payload.resourceType,
            batch: `${index + 1}/${textChunks.length}`,
            basicInfo: index === 0 ? payload.basicInfo : undefined,
            coverAttached: index === 0 && Boolean(coverAttachment),
            textSections: textChunks[index]
          };
          const subject = {
            mode: "ACCOUNT" as const,
            userId: review.submittedByUserId,
            learnerId: null
          };
          const generate = () =>
            aiService.generateScenarioTextForExternalBilling({
              userId: subject.userId,
              learnerId: subject.learnerId,
              scenarioSlug: "course-resource-ai-precheck",
              input: `审核资源“${payload.resourceName}”的第 ${index + 1}/${textChunks.length} 批内容`,
              variables: {
                reviewData: JSON.stringify(reviewData)
              },
              attachments: index === 0 && coverAttachment ? [coverAttachment] : [],
              maxTokens: 3_000
            });
          const generated = this.learnerAccessService
            ? await this.learnerAccessService.runWithScenarioAuthorization(
                subject,
                "course-resource-ai-precheck",
                generate
              )
            : await generate();

          taskIds.push(generated.taskId);
          batchResults.push(parseCourseAiPrecheckResult(generated.text));
          await this.prisma.courseReviewRequest.update({
            where: { id },
            data: {
              aiPrecheckTaskId: generated.taskId,
              aiPrecheckProgress: 15 + Math.round(((index + 1) / textChunks.length) * 75)
            }
          });
        }

        const combined = combineCourseAiPrecheckResults(batchResults);
        await this.prisma.courseReviewRequest.update({
          where: { id },
          data: {
            aiPrecheckStatus: combined.verdict === "PASS" ? "PASSED" : "REJECTED",
            aiPrecheckProgress: 100,
            aiPrecheckMessage: combined.verdict === "PASS" ? "AI 预审通过" : "AI 预审不通过",
            aiPrecheckResult: toJson({
              ...combined,
              batchCount: textChunks.length,
              textSectionCount: payload.textSections.length,
              coverReviewed: Boolean(coverAttachment),
              taskIds
            }),
            aiPrecheckCompletedAt: new Date()
          }
        });
      } catch (error) {
        await this.prisma.courseReviewRequest.update({
          where: { id },
          data: {
            aiPrecheckStatus: "FAILED",
            aiPrecheckProgress: 100,
            aiPrecheckMessage: "AI 预审执行失败",
            aiPrecheckResult: toJson({
              verdict: "FAILED",
              summary: this.aiPrecheckFailureMessage(error),
              reasons: []
            }),
            aiPrecheckCompletedAt: new Date()
          }
        });
      }
    };

    if (!waitForCompletion) {
      void execute().catch(() => undefined);
      return this.getReview(id);
    }

    await execute();

    return this.getReview(id);
  }

  async approve(adminId: string, id: string, expectedUpdatedAt: string) {
    const expectedVersion = this.parseExpectedUpdatedAt(expectedUpdatedAt);

    const approval = await this.prisma.$transaction(async (transaction) => {
      let coverCleanup: { assetIds: string[]; userId: string } | null = null;
      const preview = await this.requireReviewRequest(transaction, id);

      if (preview.scope === "COURSE_REVISION") {
        if (!preview.courseId || !preview.courseRevision) {
          throw new AppException(50001, "课程审核数据不完整", HttpStatus.INTERNAL_SERVER_ERROR);
        }
        await this.lockCourse(transaction, preview.courseId);
        const lockedRequest = await this.requireReviewRequest(transaction, id);
        const references = this.materialReferences(lockedRequest.courseRevision?.items ?? []);

        for (const reference of references) {
          await this.lockMaterial(transaction, reference.materialType, reference.materialId);
        }
        for (const reference of references) {
          await this.lockMaterialPublication(transaction, reference.publicationId);
        }
      } else {
        const reference = this.requestMaterialReference(preview);
        await this.lockMaterial(transaction, reference.materialType, reference.materialId);
        await this.lockMaterialPublication(transaction, reference.publicationId);
      }

      const reviewedAt = new Date();
      const claimed = await transaction.courseReviewRequest.updateMany({
        where: {
          id,
          status: "PENDING",
          updatedAt: expectedVersion
        },
        data: {
          status: "APPROVED",
          reviewedByAdminId: adminId,
          reviewedAt
        }
      });

      this.assertReviewClaimed(claimed.count);
      const request = await this.requireReviewRequest(transaction, id);

      if (request.scope === "COURSE_REVISION") {
        const submittedMaterials = await this.verifySubmittedCourseMaterials(transaction, request);
        coverCleanup = await this.approveCourseRevision(
          transaction,
          request,
          reviewedAt,
          submittedMaterials
        );
      } else {
        const affectedCourses = request.materialPublicationId
          ? await this.listAffectedCourses(transaction, request.materialPublicationId)
          : [];

        if (affectedCourses.length === 0) {
          throw new AppException(40901, "课件已不再被公开课程引用，请刷新后重试", HttpStatus.CONFLICT);
        }
        await this.verifySubmittedMaterial(transaction, request);
        await this.approveMaterial(transaction, request);
      }

      const result = await this.requireReviewRequest(transaction, id);
      return {
        coverCleanup,
        result: await this.withAffectedCourses(transaction, result)
      };
    }, reviewTransactionOptions);

    if (approval.coverCleanup?.assetIds.length && this.mediaService) {
      try {
        await this.mediaService.cleanupUnreferencedCourseCoverAssets(
          approval.coverCleanup.userId,
          approval.coverCleanup.assetIds
        );
      } catch (error) {
        this.logger.error(
          "课程审核已通过，但旧封面清理失败",
          error instanceof Error ? error.stack : undefined
        );
      }
    }

    return approval.result;
  }

  async unpublish(adminId: string, courseId: string, expectedRevisionId: string) {
    return this.prisma.$transaction(async tx => {
      await this.lockCourse(tx, courseId);
      const changed = await tx.course.updateMany({ where: { id: courseId, approvedRevisionId: expectedRevisionId, publishedAt: { not: null } }, data: { publishedAt: null } });
      if (!changed.count) throw new AppException(40901, "发布版本已变化，请刷新", HttpStatus.CONFLICT);
      await tx.adminOperationLog.create({ data: { adminUserId: adminId, action: "UNPUBLISH_COURSE", resourceType: "COURSE", resourceId: courseId, description: "下架已发布专辑，保留待审稿" } });
      return { unpublished: true };
    });
  }

  async reject(adminId: string, id: string, reason: string, expectedUpdatedAt: string) {
    const reviewNote = reason.trim();
    const expectedVersion = this.parseExpectedUpdatedAt(expectedUpdatedAt);

    if (reviewNote.length < 2 || reviewNote.length > 500) {
      throw new AppException(40001, "拒绝原因长度必须为 2 到 500 个字符", HttpStatus.BAD_REQUEST);
    }

    return this.prisma.$transaction(async (transaction) => {
      const preview = await this.requireReviewRequest(transaction, id);

      if (preview.scope === "COURSE_REVISION") {
        if (!preview.courseId) {
          throw new AppException(50001, "课程审核数据不完整", HttpStatus.INTERNAL_SERVER_ERROR);
        }
        await this.lockCourse(transaction, preview.courseId);
      } else {
        const reference = this.requestMaterialReference(preview);
        await this.lockMaterial(transaction, reference.materialType, reference.materialId);
        await this.lockMaterialPublication(transaction, reference.publicationId);
      }

      const reviewedAt = new Date();
      const claimed = await transaction.courseReviewRequest.updateMany({
        where: {
          id,
          status: "PENDING",
          updatedAt: expectedVersion
        },
        data: {
          status: "REJECTED",
          reviewedByAdminId: adminId,
          reviewedAt,
          reviewNote
        }
      });

      this.assertReviewClaimed(claimed.count);
      const request = await this.requireReviewRequest(transaction, id);

      if (request.scope === "COURSE_REVISION") {
        if (!request.courseId || !request.courseRevisionId || !request.course) {
          throw new AppException(50001, "课程审核数据不完整", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        await transaction.courseRevision.update({
          where: { id: request.courseRevisionId },
          data: {
            status: "REJECTED",
            reviewedAt,
            rejectionReason: reviewNote
          }
        });
        await transaction.course.update({
          where: { id: request.courseId },
          data: {
            reviewState: request.course.approvedRevisionId ? "PUBLISHED" : "REJECTED"
          }
        });
      } else {
        if (!request.materialPublicationId) {
          throw new AppException(50001, "课件审核数据不完整", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        await transaction.courseMaterialPublication.update({
          where: { id: request.materialPublicationId },
          data: {
            status: "REJECTED"
          }
        });
      }

      const result = await this.requireReviewRequest(transaction, id);
      return this.withAffectedCourses(transaction, result);
    });
  }

  private async approveCourseRevision(
    transaction: Prisma.TransactionClient,
    request: ReviewRequestRecord,
    reviewedAt: Date,
    submittedMaterials: Map<string, SubmittedMaterialSnapshot>
  ) {
    if (!request.courseId || !request.courseRevisionId || !request.courseRevision || !request.course) {
      throw new AppException(50001, "课程审核数据不完整", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const approvedCoverMediaId = request.courseRevision.coverMediaId;
    const supersededCovers = await transaction.courseRevision.findMany({
      where: {
        courseId: request.courseId,
        coverMediaId: { not: approvedCoverMediaId }
      },
      select: {
        coverMediaId: true
      }
    });

    await transaction.courseRevision.update({
      where: { id: request.courseRevisionId },
      data: {
        status: "APPROVED",
        reviewedAt,
        rejectionReason: null
      }
    });
    const frozenAlbum = request.courseRevision.items.some(item => item.materialType === "PICTURE_BOOK");
    if (!frozenAlbum) await transaction.courseRevision.updateMany({
      where: {
        courseId: request.courseId,
        coverMediaId: { not: approvedCoverMediaId }
      },
      data: {
        coverMediaId: approvedCoverMediaId
      }
    });
    await transaction.course.update({
      where: { id: request.courseId },
      data: {
        approvedRevisionId: request.courseRevisionId,
        workingRevisionId: request.course.workingRevisionId === request.courseRevisionId ? null : request.course.workingRevisionId,
        reviewState: "PUBLISHED",
        publishedAt: request.course?.publishedAt ?? reviewedAt
      }
    });

    for (const item of request.courseRevision.items) {
      const submitted = submittedMaterials.get(item.publicationId);
      if (item.materialType === "PICTURE_BOOK" && !item.pinnedHash) {
        const snapshot = submitted?.materialSnapshot ?? item.publication.approvedSnapshot;
        const hash = submitted?.materialHash ?? item.publication.approvedHash;
        if (snapshot && hash) await transaction.courseRevisionItem.update({ where: { id: item.id }, data: { pinnedSnapshot: snapshot as Prisma.InputJsonValue, pinnedHash: hash } });
      }

      if (submitted?.firstPublication && item.publication.approvedHash === null) {
        await transaction.courseMaterialPublication.update({
          where: { id: item.publicationId },
          data: {
            status: "APPROVED",
            approvedHash: submitted.materialHash,
            approvedSnapshot: submitted.materialSnapshot,
            currentHash: submitted.materialHash,
            currentSnapshot: submitted.materialSnapshot
          }
        });
      }
    }

    return {
      assetIds: frozenAlbum ? [] : [...new Set(supersededCovers.map((item) => item.coverMediaId))],
      userId: request.course.userId
    };
  }

  private async approveMaterial(
    transaction: Prisma.TransactionClient,
    request: ReviewRequestRecord
  ) {
    if (!request.materialPublicationId || !request.materialPublication) {
      throw new AppException(50001, "课件审核数据不完整", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    await transaction.courseMaterialPublication.update({
      where: { id: request.materialPublicationId },
      data: {
        status: "APPROVED",
        approvedHash: hashCourseSnapshot(request.afterSnapshot),
        approvedSnapshot: toJson(request.afterSnapshot),
        currentHash: hashCourseSnapshot(request.afterSnapshot),
        currentSnapshot: toJson(request.afterSnapshot)
      }
    });
  }

  private async verifySubmittedCourseMaterials(
    transaction: Prisma.TransactionClient,
    request: ReviewRequestRecord
  ) {
    if (!request.courseRevision) {
      throw new AppException(50001, "课程审核数据不完整", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const snapshotItems = snapshotItemsByPublication(request.afterSnapshot);
    const submitted = new Map<string, SubmittedMaterialSnapshot>();

    const itemsByPublication = new Map(
      request.courseRevision.items.map((item) => [item.publicationId, item])
    );

    for (const reference of this.materialReferences(request.courseRevision.items)) {
      const revisionItem = itemsByPublication.get(reference.publicationId);

      if (revisionItem?.pinnedHash && revisionItem.pinnedSnapshot) {
        const frozen = snapshotItems.get(reference.publicationId);
        if (reference.materialType !== "PICTURE_BOOK" || !frozen || frozen.materialHash !== revisionItem.pinnedHash || hashCourseSnapshot(revisionItem.pinnedSnapshot) !== revisionItem.pinnedHash || hashCourseSnapshot(frozen.materialSnapshot) !== revisionItem.pinnedHash) {
          throw new AppException(40901, "审核快照已变化，请刷新后重试", HttpStatus.CONFLICT);
        }
        submitted.set(reference.publicationId, frozen);
        continue;
      }
      if (revisionItem?.publication.approvedHash !== null) {
        continue;
      }

      const snapshot = snapshotItems.get(reference.publicationId);

      if (
        !snapshot
        || snapshot.firstPublication !== true
        || snapshot.materialType !== reference.materialType
      ) {
        throw new AppException(40901, "审核内容已发生变化，请刷新后重试", HttpStatus.CONFLICT);
      }

      const material = await this.readMaterial(
        transaction,
        reference.materialType,
        reference.materialId
      );

      if (!material) {
        throw new AppException(40901, "审核内容已发生变化，请刷新后重试", HttpStatus.CONFLICT);
      }
      if (!this.isLearnableMaterial(request.submittedByUserId, reference.materialType, material)) {
        throw new AppException(40901, "课件状态已发生变化，请刷新后重试", HttpStatus.CONFLICT);
      }
      const actualSnapshot = snapshotCourseMaterial(reference.materialType, material);
      const actualHash = hashCourseSnapshot(actualSnapshot);

      if (
        actualHash !== snapshot.materialHash
        || hashCourseSnapshot(snapshot.materialSnapshot) !== snapshot.materialHash
      ) {
        throw new AppException(40901, "审核内容已发生变化，请刷新后重试", HttpStatus.CONFLICT);
      }

      submitted.set(reference.publicationId, snapshot);
    }

    return submitted;
  }

  private async verifySubmittedMaterial(
    transaction: Prisma.TransactionClient,
    request: ReviewRequestRecord
  ) {
    const reference = this.requestMaterialReference(request);
    const material = await this.readMaterial(transaction, reference.materialType, reference.materialId);

    if (!material) {
      throw new AppException(40901, "审核内容已发生变化，请刷新后重试", HttpStatus.CONFLICT);
    }
    if (!this.isLearnableMaterial(request.submittedByUserId, reference.materialType, material)) {
      throw new AppException(40901, "课件状态已发生变化，请刷新后重试", HttpStatus.CONFLICT);
    }
    const actualHash = hashCourseSnapshot(snapshotCourseMaterial(reference.materialType, material));
    const submittedHash = hashCourseSnapshot(request.afterSnapshot);

    if (actualHash !== submittedHash) {
      throw new AppException(40901, "审核内容已发生变化，请刷新后重试", HttpStatus.CONFLICT);
    }
  }

  private async requireReviewRequest(transaction: Prisma.TransactionClient, id: string) {
    const request = await transaction.courseReviewRequest.findUnique({
      where: { id },
      include: reviewRequestInclude
    });

    if (!request) {
      throw new AppException(50001, "审核请求读取失败", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return request;
  }

  private assertReviewClaimed(count: number) {
    if (count !== 1) {
      throw new AppException(40901, "审核状态已发生变化，请刷新后重试", HttpStatus.CONFLICT);
    }
  }

  private reviewWhere(filters: CourseReviewFilters): Prisma.CourseReviewRequestWhereInput {
    const where: Prisma.CourseReviewRequestWhereInput = {};

    if (filters.scope) {
      if (!reviewScopes.has(filters.scope)) {
        throw new AppException(40001, "审核范围参数错误", HttpStatus.BAD_REQUEST);
      }
      where.scope = filters.scope as Prisma.EnumCourseReviewScopeFilter["equals"];
    }

    if (filters.status) {
      if (!reviewStatuses.has(filters.status)) {
        throw new AppException(40001, "审核状态参数错误", HttpStatus.BAD_REQUEST);
      }
      where.status = filters.status as Prisma.EnumCourseReviewRequestStatusFilter["equals"];
    }

    return where;
  }

  private snapshotRevision(
    revision: RevisionRecord,
    submittedMaterials?: Map<string, SubmittedMaterialSnapshot>
  ) {
    return {
      name: revision.name,
      coverMediaId: revision.coverMediaId,
      coverUrl: revision.coverMedia.url,
      summary: revision.summary,
      tags: revision.tags,
      items: revision.items.map((item) => {
        const submitted = submittedMaterials?.get(item.publicationId);

        return {
          publicationId: item.publicationId,
          materialType: item.materialType,
          videoGuideLessonId: item.videoGuideLessonId,
          englishGuidedStudyMaterialId: item.englishGuidedStudyMaterialId,
          learningFlashcardDeckId: item.learningFlashcardDeckId,
          pictureBookId: item.pictureBookId,
          displayName: item.displayName,
          sortOrder: item.sortOrder,
          ...(submitted ?? {})
        };
      })
    };
  }

  private requireLearnableMaterial(
    userId: string,
    materialType: CourseMaterialType,
    material: MaterialRecord | null
  ) {
    if (!material) {
      throw new AppException(40401, "课件不存在", HttpStatus.NOT_FOUND);
    }

    if (material.userId !== userId) {
      throw new AppException(40301, "只能提交自己创建的课件", HttpStatus.FORBIDDEN);
    }

    if (materialType === "VIDEO_GUIDE" && material.status !== "SUCCEEDED") {
      throw new AppException(40001, "只能提交已完成的视频导学课件", HttpStatus.BAD_REQUEST);
    }

    if (materialType === "ENGLISH_GUIDED_STUDY" && !material.audioUrl) {
      throw new AppException(40001, "只能提交可学习的英文带学课件", HttpStatus.BAD_REQUEST);
    }

    if (materialType === "LEARNING_FLASHCARD" && material.status !== "READY") {
      throw new AppException(40001, "只能提交已完成的闪卡课件", HttpStatus.BAD_REQUEST);
    }

    if (materialType === "PICTURE_BOOK" && material.status !== "COMPLETED") {
      throw new AppException(40001, "只能提交已完成的绘本", HttpStatus.BAD_REQUEST);
    }

    return material;
  }

  private isLearnableMaterial(
    userId: string,
    materialType: CourseMaterialType,
    material: MaterialRecord | null
  ) {
    if (!material || material.userId !== userId) {
      return false;
    }

    if (materialType === "VIDEO_GUIDE") {
      return material.status === "SUCCEEDED";
    }

    if (materialType === "ENGLISH_GUIDED_STUDY") {
      return Boolean(material.audioUrl);
    }

    return material.status === (materialType === "PICTURE_BOOK" ? "COMPLETED" : "READY");
  }

  private async readMaterial(
    transaction: Prisma.TransactionClient,
    materialType: CourseMaterialType,
    materialId: string
  ): Promise<MaterialRecord | null> {
    if (materialType === "VIDEO_GUIDE") {
      return transaction.videoGuideLesson.findUnique({ where: { id: materialId } });
    }

    if (materialType === "ENGLISH_GUIDED_STUDY") {
      return transaction.englishGuidedStudyMaterial.findUnique({ where: { id: materialId } });
    }

    if (materialType === "PICTURE_BOOK") {
      return transaction.pictureBook.findUnique({ where: { id: materialId } });
    }

    return transaction.learningFlashcardDeck.findUnique({
      where: { id: materialId },
      include: {
        cards: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
        }
      }
    });
  }

  private async ensureAiPrecheckScenario() {
    return this.prisma.aiScenario.upsert({
      where: {
        slug: "course-resource-ai-precheck"
      },
      update: {
        name: "资源发布 AI 预审",
        description: "审核资源基本信息、封面图及全部课件文本的合规性。",
        promptTemplate: aiPrecheckPrompt,
        promptVariables: [{
          name: "reviewData",
          label: "待审核资源数据",
          required: true,
          placeholder: "资源基本信息和分批文本 JSON"
        }],
        requiredCapabilities: ["TEXT", "VISION"],
        costCredits: 0,
        isEnabled: true,
        sortOrder: 36,
        isBuiltIn: true,
        templateVersion: aiPrecheckPromptVersion,
        modelBinding: {
          upsert: {
            create: {
              defaultModelAlias: "vision"
            },
            update: {
              defaultModelAlias: "vision",
              fallbackModelAlias: null
            }
          }
        }
      },
      create: {
        name: "资源发布 AI 预审",
        slug: "course-resource-ai-precheck",
        description: "审核资源基本信息、封面图及全部课件文本的合规性。",
        promptTemplate: aiPrecheckPrompt,
        promptVariables: [{
          name: "reviewData",
          label: "待审核资源数据",
          required: true,
          placeholder: "资源基本信息和分批文本 JSON"
        }],
        requiredCapabilities: ["TEXT", "VISION"],
        costCredits: 0,
        isEnabled: true,
        sortOrder: 36,
        isBuiltIn: true,
        templateVersion: aiPrecheckPromptVersion,
        modelBinding: {
          create: {
            defaultModelAlias: "vision"
          }
        }
      }
    });
  }

  private async courseCoverAttachment(
    coverUrl: string | null
  ): Promise<ProviderTextAttachment> {
    if (!coverUrl) {
      throw new AppException(40001, "课程封面缺失，无法完成 AI 预审", HttpStatus.BAD_REQUEST);
    }

    const baseUrl = process.env.S3_PUBLIC_BASE_URL
      ?? process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL
      ?? process.env.PUBLIC_API_BASE_URL;
    let resolvedUrl: URL;

    try {
      resolvedUrl = /^https?:\/\//iu.test(coverUrl)
        ? new URL(coverUrl)
        : new URL(coverUrl, baseUrl?.endsWith("/") ? baseUrl : `${baseUrl ?? ""}/`);
    } catch {
      throw new AppException(40001, "课程封面地址无效，无法完成 AI 预审", HttpStatus.BAD_REQUEST);
    }

    if (!/^https?:$/u.test(resolvedUrl.protocol)) {
      throw new AppException(40001, "课程封面地址无效，无法完成 AI 预审", HttpStatus.BAD_REQUEST);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(resolvedUrl, { signal: controller.signal });
      const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      const declaredSize = Number(response.headers.get("content-length") ?? 0);

      if (!response.ok || !mimeType.startsWith("image/")) {
        throw new Error("invalid cover response");
      }
      if (declaredSize > 10 * 1024 * 1024) {
        throw new Error("cover image too large");
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
        throw new Error("invalid cover size");
      }

      return {
        name: "课程封面",
        type: "image",
        mimeType,
        size: buffer.length,
        dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`
      };
    } catch {
      throw new AppException(40001, "课程封面读取失败，无法完成 AI 预审", HttpStatus.BAD_REQUEST);
    } finally {
      clearTimeout(timeout);
    }
  }

  private aiPrecheckFailureMessage(error: unknown) {
    if (error instanceof AppException && error.code === 40001) {
      return error.message;
    }

    return "AI 预审执行失败，请检查视觉模型配置后重试。";
  }

  private materialReferences(items: RevisionRecord["items"]) {
    return items.map((item) => {
      const materialId = item.videoGuideLessonId
        ?? item.englishGuidedStudyMaterialId
        ?? item.learningFlashcardDeckId
        ?? item.pictureBookId;

      if (!materialId) {
        throw new AppException(50001, "课程课件数据不完整", HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        key: `${item.materialType}:${materialId}`,
        materialId,
        materialType: item.materialType,
        publicationId: item.publicationId
      } satisfies MaterialReference;
    }).sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  }

  private requestMaterialReference(request: ReviewRequestRecord): MaterialReference {
    const publication = request.materialPublication;
    const materialId = publication?.videoGuideLessonId
      ?? publication?.englishGuidedStudyMaterialId
      ?? publication?.learningFlashcardDeckId
      ?? publication?.pictureBookId;

    if (!publication || !materialId || !request.materialPublicationId) {
      throw new AppException(50001, "课件审核数据不完整", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
      key: `${publication.materialType}:${materialId}`,
      materialId,
      materialType: publication.materialType,
      publicationId: request.materialPublicationId
    };
  }

  private parseExpectedUpdatedAt(value: string) {
    const expected = typeof value === "string" ? new Date(value) : new Date(Number.NaN);

    if (Number.isNaN(expected.getTime())) {
      throw new AppException(40001, "审核版本参数错误", HttpStatus.BAD_REQUEST);
    }

    return expected;
  }

  private async listAffectedCourses(
    client: Prisma.TransactionClient | ReturnType<typeof getPrismaClient>,
    publicationId: string
  ) {
    const courses = await client.course.findMany({
      where: {
        publishedAt: {
          not: null
        },
        approvedRevision: {
          is: {
            items: {
              some: {
                publicationId
              }
            }
          }
        }
      },
      select: {
        id: true,
        reviewState: true,
        publishedAt: true,
        approvedRevision: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        publishedAt: "desc"
      }
    });

    return courses.map((course) => ({
      id: course.id,
      name: course.approvedRevision?.name ?? "未命名课程",
      reviewState: course.reviewState,
      publishedAt: course.publishedAt
    }));
  }

  private async withAffectedCourses(
    client: Prisma.TransactionClient | ReturnType<typeof getPrismaClient>,
    review: ReviewRequestRecord
  ) {
    const affectedCourses = review.scope === "MATERIAL_CHANGE" && review.materialPublicationId
      ? await this.listAffectedCourses(client, review.materialPublicationId)
      : [];

    return { ...review, affectedCourses };
  }

  private async lockCourse(transaction: Prisma.TransactionClient, courseId: string) {
    await transaction.$queryRaw`SELECT "id" FROM "courses" WHERE "id" = ${courseId} FOR UPDATE`;
  }

  private async lockRevisionMaterials(
    transaction: Prisma.TransactionClient,
    revisionId: string
  ) {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtext(ordered_materials."lockKey"))::text AS "locked"
      FROM (
        SELECT CONCAT(
          'course-material:',
          "materialType"::text,
          ':',
          COALESCE("videoGuideLessonId", "englishGuidedStudyMaterialId", "learningFlashcardDeckId", "pictureBookId")
        ) AS "lockKey"
        FROM "course_revision_items"
        WHERE "revisionId" = ${revisionId}
        ORDER BY "lockKey"
      ) AS ordered_materials
    `;
  }

  private async lockRevisionMaterialPublications(
    transaction: Prisma.TransactionClient,
    revisionId: string
  ) {
    await transaction.$queryRaw`
      SELECT publications."id"
      FROM "course_material_publications" AS publications
      JOIN "course_revision_items" AS items ON items."publicationId" = publications."id"
      WHERE items."revisionId" = ${revisionId}
      ORDER BY publications."id"
      FOR UPDATE OF publications
    `;
  }

  private async lockMaterial(
    transaction: Prisma.TransactionClient,
    materialType: CourseMaterialType,
    materialId: string
  ) {
    await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`course-material:${materialType}:${materialId}`}))`;
  }

  private async lockMaterialPublication(
    transaction: Prisma.TransactionClient,
    publicationId: string
  ) {
    await transaction.$queryRaw`SELECT "id" FROM "course_material_publications" WHERE "id" = ${publicationId} FOR UPDATE`;
  }
}

function publicationWhere(materialType: CourseMaterialType, materialId: string) {
  if (materialType === "VIDEO_GUIDE") {
    return { videoGuideLessonId: materialId };
  }

  if (materialType === "ENGLISH_GUIDED_STUDY") {
    return { englishGuidedStudyMaterialId: materialId };
  }

  if (materialType === "PICTURE_BOOK") return { pictureBookId: materialId };

  return { learningFlashcardDeckId: materialId };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_key, item) => item === undefined ? null : item)) as Prisma.InputJsonValue;
}

function snapshotItemsByPublication(value: Prisma.JsonValue) {
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
  const items = Array.isArray(root.items) ? root.items : [];
  const result = new Map<string, SubmittedMaterialSnapshot>();

  for (const valueItem of items) {
    if (!valueItem || typeof valueItem !== "object" || Array.isArray(valueItem)) {
      continue;
    }

    const item = valueItem as Record<string, Prisma.JsonValue>;
    const publicationId = item.publicationId;
    const materialType = item.materialType;
    const materialHash = item.materialHash;
    const materialSnapshot = item.materialSnapshot;

    if (
      typeof publicationId !== "string"
      || !isCourseMaterialType(materialType)
      || typeof materialHash !== "string"
      || !/^[0-9a-f]{64}$/u.test(materialHash)
      || !materialSnapshot
      || typeof materialSnapshot !== "object"
      || Array.isArray(materialSnapshot)
      || typeof item.firstPublication !== "boolean"
    ) {
      continue;
    }

    result.set(publicationId, {
      firstPublication: item.firstPublication,
      materialHash,
      materialSnapshot: toJson(materialSnapshot),
      materialType
    });
  }

  return result;
}

function replaceFirstPublicationMaterialSnapshot(
  value: Prisma.JsonValue,
  publicationId: string,
  materialType: CourseMaterialType,
  materialHash: string,
  materialSnapshot: Prisma.InputJsonValue
): Prisma.InputJsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const root = value as Prisma.JsonObject;
  const items = Array.isArray(root.items) ? root.items : [];
  let changed = false;
  const nextItems = items.map((valueItem) => {
    if (!valueItem || typeof valueItem !== "object" || Array.isArray(valueItem)) {
      return valueItem;
    }

    const item = valueItem as Prisma.JsonObject;

    if (
      item.publicationId !== publicationId
      || item.materialType !== materialType
      || item.firstPublication !== true
      || item.materialHash === materialHash
    ) {
      return item;
    }

    changed = true;
    return {
      ...item,
      materialHash,
      materialSnapshot
    };
  });

  return changed ? toJson({ ...root, items: nextItems }) as Prisma.InputJsonObject : null;
}

function isCourseMaterialType(value: Prisma.JsonValue | undefined): value is CourseMaterialType {
  return value === "VIDEO_GUIDE"
    || value === "ENGLISH_GUIDED_STUDY"
    || value === "LEARNING_FLASHCARD"
    || value === "PICTURE_BOOK";
}

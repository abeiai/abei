import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { getPrismaClient, type PrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import type {
  LearnerLearningContextInput,
  LearningMaterialType,
  ResolvedLearningContext
} from "./learner-learning.types.js";

const scenarioSlugByMaterialType: Record<LearningMaterialType, string> = {
  VIDEO_GUIDE: "video-guide-narration",
  ENGLISH_GUIDED_STUDY: "english-guided-study-material",
  LEARNING_FLASHCARD: "learning-flashcards-deck"
};

@Injectable()
export class LearnerLearningContextService {
  private readonly prisma: PrismaClient;

  constructor(
    @Inject(LearnerAccessService)
    private readonly learnerAccessService: LearnerAccessService,
    @Optional() prisma?: PrismaClient
  ) {
    this.prisma = prisma ?? getPrismaClient();
  }

  async resolve(
    subject: ProfileSubject,
    input: LearnerLearningContextInput
  ): Promise<ResolvedLearningContext> {
    if (subject.mode !== "LEARNER") {
      throw new AppException(40301, "请使用学习者身份记录学习情况", HttpStatus.FORBIDDEN);
    }

    if (input.courseId || input.courseRevisionItemId) {
      return this.resolveCourseMaterial(subject, input);
    }

    if (input.materialType || input.materialId) {
      return this.resolveStandaloneMaterial(subject, input);
    }

    if (input.isLearning) {
      throw new AppException(40004, "学习内容不存在", HttpStatus.BAD_REQUEST);
    }

    return {
      isLearning: false,
      scenarioId: null,
      courseId: null,
      courseRevisionId: null,
      courseRevisionItemId: null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      materialType: null,
      materialId: null,
      contentVersion: null,
      partKey: null
    };
  }

  private async resolveCourseMaterial(
    subject: Extract<ProfileSubject, { mode: "LEARNER" }>,
    input: LearnerLearningContextInput
  ): Promise<ResolvedLearningContext> {
    if (
      !input.courseId ||
      !input.courseRevisionItemId ||
      !input.materialType ||
      !input.materialId
    ) {
      throw new AppException(40004, "课程学习上下文不完整", HttpStatus.BAD_REQUEST);
    }

    const course = await this.learnerAccessService.assertCourseAuthorized(
      subject,
      input.courseId
    );
    if (!course?.approvedRevisionId) {
      throw new AppException(40301, "当前学习者未获得此课程授权", HttpStatus.FORBIDDEN);
    }

    const item = await this.prisma.courseRevisionItem.findFirst({
      where: {
        id: input.courseRevisionItemId,
        revisionId: course.approvedRevisionId
      },
      select: {
        id: true,
        materialType: true,
        videoGuideLessonId: true,
        englishGuidedStudyMaterialId: true,
        learningFlashcardDeckId: true,
        publication: {
          select: {
            approvedHash: true,
            currentHash: true,
            approvedSnapshot: true
          }
        }
      }
    });

    const actualMaterialId = item
      ? this.materialIdFromItem(item.materialType, item)
      : null;
    if (
      !item ||
      item.materialType !== input.materialType ||
      actualMaterialId !== input.materialId ||
      !item.publication.approvedSnapshot ||
      !item.publication.approvedHash ||
      item.publication.approvedHash !== item.publication.currentHash
    ) {
      throw new AppException(40004, "课程课件不存在或版本已变更", HttpStatus.BAD_REQUEST);
    }

    return {
      isLearning: input.isLearning,
      scenarioId: null,
      courseId: input.courseId,
      courseRevisionId: course.approvedRevisionId,
      courseRevisionItemId: item.id,
      resourceType: "COURSE_MATERIAL",
      resourceId: item.id,
      materialType: item.materialType,
      materialId: actualMaterialId,
      contentVersion: item.publication.approvedHash,
      partKey: input.partKey ?? null
    };
  }

  private async resolveStandaloneMaterial(
    subject: Extract<ProfileSubject, { mode: "LEARNER" }>,
    input: LearnerLearningContextInput
  ): Promise<ResolvedLearningContext> {
    if (!input.materialType || !input.materialId) {
      throw new AppException(40004, "学习内容参数不完整", HttpStatus.BAD_REQUEST);
    }

    const scenario = await this.learnerAccessService.assertScenarioAuthorized(
      subject,
      scenarioSlugByMaterialType[input.materialType]
    );
    if (!scenario) {
      throw new AppException(40301, "当前学习者未获得此应用授权", HttpStatus.FORBIDDEN);
    }

    const contentVersion = await this.resolveStandaloneContentVersion(
      subject,
      input.materialType,
      input.materialId
    );

    return {
      isLearning: input.isLearning,
      scenarioId: scenario.id,
      courseId: null,
      courseRevisionId: null,
      courseRevisionItemId: null,
      resourceType: input.resourceType ?? input.materialType,
      resourceId: input.resourceId ?? input.materialId,
      materialType: input.materialType,
      materialId: input.materialId,
      contentVersion,
      partKey: input.partKey ?? null
    };
  }

  private async resolveStandaloneContentVersion(
    subject: Extract<ProfileSubject, { mode: "LEARNER" }>,
    materialType: LearningMaterialType,
    materialId: string
  ) {
    if (materialType === "VIDEO_GUIDE") {
      const row = await this.prisma.videoGuideLesson.findFirst({
        where: {
          id: materialId,
          userId: subject.userId,
          learnerId: subject.learnerId,
          status: "SUCCEEDED"
        },
        select: { updatedAt: true, materialPublication: { select: { approvedHash: true, currentHash: true } } }
      });
      if (!row) this.materialUnavailable();
      return this.safeVersion(row.materialPublication, row.updatedAt);
    }

    if (materialType === "ENGLISH_GUIDED_STUDY") {
      const row = await this.prisma.englishGuidedStudyMaterial.findFirst({
        where: {
          id: materialId,
          userId: subject.userId,
          learnerId: subject.learnerId,
          audioUrl: { not: null }
        },
        select: { updatedAt: true, materialPublication: { select: { approvedHash: true, currentHash: true } } }
      });
      if (!row) this.materialUnavailable();
      return this.safeVersion(row.materialPublication, row.updatedAt);
    }

    const row = await this.prisma.learningFlashcardDeck.findFirst({
      where: {
        id: materialId,
        userId: subject.userId,
        learnerId: subject.learnerId,
        status: "READY"
      },
      select: { updatedAt: true, materialPublication: { select: { approvedHash: true, currentHash: true } } }
    });
    if (!row) this.materialUnavailable();
    return this.safeVersion(row.materialPublication, row.updatedAt);
  }

  private safeVersion(
    publication: { approvedHash: string | null; currentHash: string } | null,
    updatedAt: Date
  ) {
    return publication?.approvedHash && publication.approvedHash === publication.currentHash
      ? publication.approvedHash
      : updatedAt.toISOString();
  }

  private materialUnavailable(): never {
    throw new AppException(40004, "学习材料不可用", HttpStatus.BAD_REQUEST);
  }

  private materialIdFromItem(
    materialType: LearningMaterialType,
    item: {
      videoGuideLessonId: string | null;
      englishGuidedStudyMaterialId: string | null;
      learningFlashcardDeckId: string | null;
    }
  ) {
    if (materialType === "VIDEO_GUIDE") return item.videoGuideLessonId;
    if (materialType === "ENGLISH_GUIDED_STUDY") {
      return item.englishGuidedStudyMaterialId;
    }
    return item.learningFlashcardDeckId;
  }
}

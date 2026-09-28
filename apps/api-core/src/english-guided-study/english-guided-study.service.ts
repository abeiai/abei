import { getPersonalCreditBalance, getPersonalWallet, reservePersonalCredits, settlePersonalCredits } from "../wallet/personal-credits.js";
import { randomBytes } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import {
  AiService,
  englishGuidedStudyMaterialPromptVersion,
  gushiwenGuidedStudyMaterialPromptVersion,
  type AttributionContext,
  type ExternalScenarioTextGenerationResult
} from "../ai/ai.service.js";
import {
  audioProviderErrorCode,
  AudioService,
  isRetryableAudioProviderError,
  type UploadedAudioFileLike
} from "../audio/audio.service.js";
import { AppException } from "../common/app-exception.js";
import { projectPublicCourseMaterial } from "../courses/course-domain.js";
import { CourseReviewService } from "../courses/course-review.service.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import { LearnerActivityService } from "../profiles/learner-activity.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import {
  probeAudioDurationMs,
  totalNarrationDurationMs
} from "./english-guided-study-audio-duration.js";
import {
  englishGuidedStudyReadAlongUploadMaxBytes,
  englishGuidedStudySourceTextMaxLength,
  EstimateEnglishGuidedStudyReadAlongUploadDto,
  ExtractEnglishGuidedStudyImageDto,
  GenerateEnglishGuidedStudyAudioDto,
  GenerateEnglishGuidedStudyMaterialDto,
  GenerateEnglishGuidedStudyPracticeDto,
  guidedStudySourceInputMaxLength,
  readingGuideDurations,
  readingGuideQuestionCounts,
  SubmitEnglishGuidedStudyReadAlongUploadDto,
  type GuidedStudyScene,
  type EnglishGuidedStudyAuthorIntroductionMode,
  UpdateEnglishGuidedStudySourceDto,
  UpdateEnglishGuidedStudyScriptDto
} from "./dto/english-guided-study.dto.js";
import {
  batchEnglishStudySourceSegments,
  buildGuidedStudySourceSegments,
  englishGuidedStudyMaterialMaxTokens,
  normalizeEnglishStudySourceText,
  type EnglishStudyExplanationMode
} from "./english-guided-study-segmentation.js";
import {
  englishGuidedStudyAudioBillingItems,
  englishGuidedStudyAudioBillingRevision,
  englishGuidedStudyReadAlongBillingItems,
  englishGuidedStudyReadAlongBillingRevision,
  englishGuidedStudyReadAlongUploadBillingItems,
  englishGuidedStudyReadAlongUploadBillingRevision,
  type EnglishGuidedStudyBillingEstimate,
  type EnglishGuidedStudyBillingItem,
  englishGuidedStudyMaterialBillingItems,
  englishGuidedStudyMaterialBillingRevision
} from "./english-guided-study-billing.js";
import {
  alignReadAlongWordsToText,
  buildEnglishReadAlongSourceUnits,
  buildGeneratedReadAlongTrack,
  buildUploadedReadAlongTrack,
  readAlongCheckpointNodes,
  recognizedWordTimingsFromValue,
  unreferencedReadAlongTaskIds,
  type EnglishReadAlongNode,
  type EnglishReadAlongTrack
} from "./english-guided-study-read-along.js";
import {
  alignEnglishNarrationPointsToScript,
  buildEnglishNarrationNodeDrafts,
  buildReadingGuideNarrationNodeDrafts,
  replaceEnglishNarrationTargetNodes,
  splitReadingGuideParagraphs,
  type EnglishNarrationNodeDraft,
  type EnglishNarrationNode
} from "./english-guided-study-narration-nodes.js";
import {
  createEnglishGuidedStudyJob,
  createEnglishGuidedStudyProgress,
  englishGuidedStudyAttemptMatches,
  englishGuidedStudyJobFromValue,
  englishGuidedStudyProgressFromValue,
  failedEnglishGuidedStudyProgress,
  isActiveEnglishGuidedStudyProgress,
  leaseEnglishGuidedStudyJob,
  mergeEnglishGuidedStudyOperationContent,
  shouldRecoverEnglishGuidedStudyOperation,
  updateEnglishGuidedStudyProgress,
  type EnglishGuidedStudyOperation,
  type EnglishGuidedStudyOperationJob
} from "./english-guided-study-operation.js";
import {
  buildEnglishGuidedStudyReferenceMaterialsJson,
  englishGuidedStudyReferenceDocumentMaxCount,
  extractEnglishGuidedStudyReferenceDocument,
  normalizeEnglishGuidedStudyReferenceMaterials,
  readingGuideDocumentMaxBytes,
  readingGuideDocumentMaxLength,
  type ExtractedEnglishGuidedStudyReferenceDocument,
  type EnglishGuidedStudyReferenceMaterial,
  type EnglishGuidedStudyReferenceUploadedFile
} from "./english-guided-study-reference-materials.js";
import { fetchBaiduHanyuGushiwenReference } from "./gushiwen-baidu-hanyu-reference.js";

interface EnglishGuidedStudyMaterialRecord {
  id: string;
  userId: string;
  learnerId: string | null;
  title: string;
  sourceType: string;
  sourceName: string | null;
  sourceText: string;
  levelStandardName: string;
  levelOptionLabel: string;
  aiLevel: string;
  summary: string;
  narration: string;
  audioUrl: string | null;
  audioTaskId: string | null;
  audioDurationSeconds: number;
  content: Prisma.JsonValue;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface EnglishGuidedStudyGenerationExecution {
  attribution?: AttributionContext;
  billingAlreadyReserved?: boolean;
  onProgress?: (input: { completed: number; message: string; phase: string; total: number }) => Promise<void>;
  operationJob?: EnglishGuidedStudyOperationJob;
  targetMaterialId?: string;
}

function englishTaskAttribution(
  userId: string,
  learnerId: string | null | undefined,
  provided?: AttributionContext
): AttributionContext {
  const attribution = provided ?? {
    userId,
    learnerId: learnerId ?? null,
    rootScenarioId: null
  };
  if (
    attribution.userId !== userId
    || (learnerId !== undefined && attribution.learnerId !== (learnerId ?? null))
  ) {
    throw new AppException(40301, "内部任务缺少执行身份", HttpStatus.FORBIDDEN);
  }
  return {
    userId: attribution.userId,
    learnerId: attribution.learnerId,
    rootScenarioId: attribution.rootScenarioId ?? null
  };
}

interface EnglishGuidedStudyContentBatchCheckpoint {
  batchIndex: number;
  modelName: string | null;
  promptVersion: string;
  providerName: string | null;
  taskId: string;
  text: string;
}

interface EnglishGuidedStudyReadAlongAsrCheckpoint {
  version: 1;
  providerTaskId: string;
  providerStatus: string;
  modelInstanceId: string;
  providerInstanceId: string;
  modelName: string;
  providerName: string;
  requestId: string | null;
  submittedAt: string;
  lastPolledAt: string | null;
  pollAttempts: number;
  transientFailures: number;
}

type EnglishGuidedStudyContentJobInput = GenerateEnglishGuidedStudyMaterialDto & {
  generatedBatches?: EnglishGuidedStudyContentBatchCheckpoint[];
};

type EnglishGuidedStudyReadAlongJobInput =
  | {
      mode: "GENERATE";
      settings: GenerateEnglishGuidedStudyAudioDto;
      generatedNodes?: EnglishReadAlongNode[];
    }
  | {
      mode: "UPLOAD";
      audioAsset: {
        durationMs?: number;
        id: string;
        mimeType: string;
        name: string;
        sizeBytes: number;
        url: string;
      };
      asrCheckpoint?: EnglishGuidedStudyReadAlongAsrCheckpoint;
      asrSubmissionAttempts?: number;
    };

@Injectable()
export class EnglishGuidedStudyService implements OnModuleDestroy, OnModuleInit {
  private readonly prisma = getPrismaClient();
  private readonly logger = new Logger(EnglishGuidedStudyService.name);
  private recoveryInterval: ReturnType<typeof setInterval> | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private creditRecoveryRunning = false;
  private recoveryRunning = false;

  constructor(
    @Inject(AudioService) private readonly audioService: AudioService,
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(CourseReviewService) private readonly courseReviewService: CourseReviewService,
    @Inject(LearnerAccessService) private readonly learnerAccessService?: LearnerAccessService,
    @Inject(LearnerActivityService) private readonly learnerActivityService?: LearnerActivityService
  ) {}

  onModuleInit() {
    this.recoveryTimer = setTimeout(() => {
      this.runBackgroundTask("恢复英文带学后台任务", async () => {
        await this.recoverEnglishGuidedStudyOperations();
        await this.recoverExpiredEnglishGuidedStudyCredits();
      });
    }, 1_000);
    this.recoveryTimer.unref?.();
    this.recoveryInterval = setInterval(() => {
      this.runBackgroundTask("巡检英文带学后台任务", async () => {
        await this.recoverEnglishGuidedStudyOperations();
        await this.recoverExpiredEnglishGuidedStudyCredits();
      });
    }, englishGuidedStudyRecoverySweepMs());
    this.recoveryInterval.unref?.();
  }

  onModuleDestroy() {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
    }
  }

  private async recordCourseMaterialChange(materialId: string) {
    try {
      await this.courseReviewService.recordMaterialChange("ENGLISH_GUIDED_STUDY", materialId);
    } catch (error) {
      this.logger.warn(
        `记录英文课件变更失败，将在审核列表对账时重试：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async extractImageText(attribution: AttributionContext, dto: ExtractEnglishGuidedStudyImageDto) {
    const { userId } = attribution;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const imageName = dto.imageName.trim();
    const imageMimeType = dto.imageMimeType.trim().toLowerCase();
    const imageDataUrl = dto.imageDataUrl.trim();

    if (!imageMimeType.startsWith("image/") || !imageDataUrl.startsWith("data:image/")) {
      throw new AppException(40001, "请上传有效的图片文件", HttpStatus.BAD_REQUEST);
    }

    const aiResult = await this.aiService.generateScenarioTextForExternalBilling({
      ...attribution,
      scenarioSlug: dto.scene === "DAODU" ? "daodu-image-extraction" : "english-guided-study-image-extraction",
      input: imageName || (dto.scene === "DAODU" ? "开卷导读图片正文提取" : "英文图片正文提取"),
      modelInstanceId: dto.modelInstanceId?.trim() || undefined,
      variables: {
        imageName: imageName || "未命名图片",
        imageMimeType
      },
      attachments: [
        {
          name: imageName || "english-guided-study-image",
          type: "image",
          mimeType: imageMimeType,
          size: dto.imageSizeBytes,
          dataUrl: imageDataUrl
        }
      ]
    });
    const extracted = normalizeImageExtractionResult(aiResult.text);

    return {
      title: extracted.title,
      author: extracted.author,
      bodyText: extracted.bodyText,
      ignoredContent: extracted.ignoredContent,
      imageName,
      aiTaskId: aiResult.taskId,
      providerName: aiResult.providerName,
      modelName: aiResult.modelName
    };
  }

  async extractReferenceDocuments(
    userId: string,
    files: EnglishGuidedStudyReferenceUploadedFile[] | undefined
  ) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    if (!files?.length) {
      throw new AppException(40001, "请选择要上传的参考文档", HttpStatus.BAD_REQUEST);
    }

    if (files.length > englishGuidedStudyReferenceDocumentMaxCount) {
      throw new AppException(
        40001,
        `最多支持 ${englishGuidedStudyReferenceDocumentMaxCount} 个参考文档`,
        HttpStatus.BAD_REQUEST
      );
    }

    const documents: ExtractedEnglishGuidedStudyReferenceDocument[] = [];
    const failures: Array<{ name: string; message: string }> = [];

    for (const file of files) {
      try {
        documents.push(await extractEnglishGuidedStudyReferenceDocument(file));
      } catch (error) {
        failures.push({
          name: file.originalname,
          message: error instanceof Error ? error.message : "文档文本提取失败"
        });
      }
    }

    if (documents.length === 0) {
      throw new AppException(
        40001,
        failures[0]?.message ?? "参考文档未提取到有效文本",
        HttpStatus.BAD_REQUEST
      );
    }

    return {
      documents,
      failures
    };
  }

  async extractReadingGuideDocument(
    userId: string,
    file: EnglishGuidedStudyReferenceUploadedFile | undefined
  ) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    if (!file) {
      throw new AppException(40001, "请选择要阅读的文档", HttpStatus.BAD_REQUEST);
    }

    return {
      document: await extractEnglishGuidedStudyReferenceDocument(file, {
        maxBytes: readingGuideDocumentMaxBytes,
        maxLength: readingGuideDocumentMaxLength
      })
    };
  }

  async getMaterialAuthorizationRoot(subject: ProfileSubject, id: string) {
    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id }),
      select: { content: true }
    });

    if (!material) {
      throw new AppException(40401, "带学材料不存在", HttpStatus.NOT_FOUND);
    }

    return guidedStudyAuthorizationRoot(guidedStudyScene(jsonObject(material.content)?.scene));
  }

  async submitMaterialGeneration(
    subject: ProfileSubject,
    dto: GenerateEnglishGuidedStudyMaterialDto
  ) {
    const { userId, learnerId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const billingRequestId = requiredEnglishGuidedStudyBillingRequestId(dto.billingRequestId);
    const requestedMaterialId = dto.materialId?.trim() || null;
    const targetMaterialId = requestedMaterialId || `egs-${randomBytes(12).toString("hex")}`;
    const sourceText = normalizeEnglishStudySourceText(dto.sourceText);

    if (!sourceText) {
      throw new AppException(40001, "请先输入或识别需要带学的英文文本", HttpStatus.BAD_REQUEST);
    }

    const scene = guidedStudyScene(dto.scene);
    assertGuidedStudySourceLength(scene, sourceText);
    const explanationMode = dto.explanationMode ?? "SENTENCE";
    const title = dto.title?.trim();
    const author = dto.author?.trim();
    const authorIntroductionMode = dto.authorIntroductionMode ?? "BRIEF";
    const sourceName = dto.sourceName?.trim();
    const modelInstanceId = dto.modelInstanceId?.trim();
    const referenceMaterials = normalizeEnglishGuidedStudyReferenceMaterials(dto.referenceMaterials);
    const normalizedInput: GenerateEnglishGuidedStudyMaterialDto = {
      billingConfirmed: true,
      billingRequestId,
      scene,
      ...(scene === "DAODU" ? { durationMinutes: readingGuideDuration(dto.durationMinutes) } : {}),
      sourceType: dto.sourceType,
      sourceText,
      levelStandardName: dto.levelStandardName,
      levelOptionLabel: dto.levelOptionLabel,
      aiLevel: dto.aiLevel,
      authorIntroductionMode,
      explanationMode,
      ...(referenceMaterials.length > 0 ? { referenceMaterials } : {}),
      ...(requestedMaterialId ? { materialId: requestedMaterialId } : {}),
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      ...(sourceName ? { sourceName } : {}),
      ...(modelInstanceId ? { modelInstanceId } : {})
    };
    const estimate = await this.estimateMaterialGeneration(userId, normalizedInput);
    this.assertBillingConfirmed(dto.billingConfirmed, estimate);

    if (dto.billingRevision?.trim() !== estimate.revision) {
      throw new AppException(40001, "英文原文或带学设置已发生变化，请重新确认本次点数消耗", HttpStatus.BAD_REQUEST);
    }

    const operationKey = `english-guided-study-content:${userId}:${billingRequestId}`;
    const now = new Date().toISOString();
    const job = createEnglishGuidedStudyJob({
      operation: "CONTENT",
      jobId: randomBytes(12).toString("hex"),
      operationKey,
      estimatedCredits: estimate.estimatedCredits,
      input: {
        ...normalizedInput,
        billingRevision: estimate.revision
      },
      now
    });
    const progress = createEnglishGuidedStudyProgress({
      operation: "CONTENT",
      phase: "QUEUED",
      message: "带学文稿任务已提交，可以关闭页面，后台会继续生成",
      now,
      total: 100
    });
    const queued = await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, targetMaterialId);
      const current = await transaction.englishGuidedStudyMaterial.findFirst({
        where: englishMaterialSubjectWhere(subject, { id: targetMaterialId })
      });

      if (requestedMaterialId && !current) {
        throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
      }

      this.assertEnglishGuidedStudyOperationAvailable(current?.content);
      await this.reserveEnglishGuidedStudyCredits(transaction, {
        estimatedCredits: estimate.estimatedCredits,
        note: `英文带学讲稿生成冻结 ${estimate.estimatedCredits} 点`,
        operationKey,
        userId
      });

      const content = mergeEnglishGuidedStudyOperationContent(
        current?.content ?? queuedEnglishGuidedStudyContent(targetMaterialId, normalizedInput),
        {
          job,
          jobKey: "contentGenerationJob",
          progress,
          progressKey: "contentGenerationProgress"
        }
      ) as Prisma.InputJsonValue;

      if (current) {
        return transaction.englishGuidedStudyMaterial.update({
          where: {
            id: current.id
          },
          data: {
            content
          }
        });
      }

      return transaction.englishGuidedStudyMaterial.create({
        data: {
          id: targetMaterialId,
          userId,
          learnerId,
          title: guidedStudyCoursewareTitle(
            normalizedInput.title,
            sourceText,
            guidedStudyScene(normalizedInput.scene)
          ),
          sourceType: normalizedInput.sourceType,
          sourceName: normalizedInput.sourceName || null,
          sourceText,
          levelStandardName: normalizedInput.levelStandardName,
          levelOptionLabel: normalizedInput.levelOptionLabel,
          aiLevel: normalizedInput.aiLevel,
          summary: "",
          narration: "",
          audioUrl: null,
          audioTaskId: null,
          audioDurationSeconds: 0,
          content
        }
      });
    });

    this.scheduleEnglishGuidedStudyOperation(queued.id, "CONTENT");

    return this.toMaterial(queued);
  }

  async submitMaterialPracticeGeneration(
    subject: ProfileSubject,
    id: string,
    dto: GenerateEnglishGuidedStudyPracticeDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    const content = jsonObject(material.content);

    if (!content || !Array.isArray(content.sentences) || content.sentences.length === 0) {
      throw new AppException(40001, "请先生成带学文稿", HttpStatus.BAD_REQUEST);
    }

    this.assertEnglishGuidedStudyOperationAvailable(material.content);
    const operationKey = `english-guided-study-practice:${userId}:${material.id}:${randomBytes(12).toString("hex")}`;
    const now = new Date().toISOString();
    const input: GenerateEnglishGuidedStudyPracticeDto = {
      ...(dto.modelInstanceId?.trim() ? { modelInstanceId: dto.modelInstanceId.trim() } : {}),
      ...(dto.questionCount !== undefined ? { questionCount: dto.questionCount } : {})
    };
    const job = createEnglishGuidedStudyJob({
      operation: "PRACTICE",
      jobId: randomBytes(12).toString("hex"),
      operationKey,
      estimatedCredits: 0,
      input,
      now
    });
    const progress = createEnglishGuidedStudyProgress({
      operation: "PRACTICE",
      phase: "QUEUED",
      message: "练习生成任务已提交，可以关闭页面，后台会继续生成",
      now,
      total: 100
    });
    const queued = await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, material.id);
      const current = await transaction.englishGuidedStudyMaterial.findFirst({
        where: englishMaterialSubjectWhere(subject, { id: material.id })
      });

      if (!current) {
        throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
      }

      this.assertEnglishGuidedStudyOperationAvailable(current.content);

      return transaction.englishGuidedStudyMaterial.update({
        where: {
          id: current.id
        },
        data: {
          content: mergeEnglishGuidedStudyOperationContent(current.content, {
            job,
            jobKey: "practiceGenerationJob",
            progress,
            progressKey: "practiceGenerationProgress"
          }) as Prisma.InputJsonValue
        }
      });
    });

    this.scheduleEnglishGuidedStudyOperation(queued.id, "PRACTICE");

    return this.toMaterial(queued);
  }

  async submitMaterialAudioGeneration(
    subject: ProfileSubject,
    id: string,
    dto: GenerateEnglishGuidedStudyAudioDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const billingRequestId = requiredEnglishGuidedStudyBillingRequestId(dto.billingRequestId);
    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    const modelAlias = dto.modelAlias?.trim();
    const voiceAssetId = dto.voiceAssetId?.trim();
    const voice = dto.voice?.trim();
    const format = dto.format?.trim();
    const normalizedInput: GenerateEnglishGuidedStudyAudioDto = {
      billingConfirmed: true,
      billingRequestId,
      billingRevision: dto.billingRevision?.trim() || "",
      ...(modelAlias ? { modelAlias } : {}),
      ...(voiceAssetId ? { voiceAssetId } : {}),
      ...(voice ? { voice } : {}),
      ...(dto.speed !== undefined ? { speed: dto.speed } : {}),
      ...(dto.pitch !== undefined ? { pitch: dto.pitch } : {}),
      ...(dto.volume !== undefined ? { volume: dto.volume } : {}),
      ...(format ? { format } : {}),
      ...(dto.sampleRate !== undefined ? { sampleRate: dto.sampleRate } : {})
    };
    const estimate = await this.materialAudioBillingEstimate(userId, material, normalizedInput);
    this.assertBillingConfirmed(dto.billingConfirmed, estimate);

    if (dto.billingRevision?.trim() !== estimate.revision) {
      throw new AppException(40001, "带学讲稿或语音设置已发生变化，请重新确认本次点数消耗", HttpStatus.BAD_REQUEST);
    }

    const operationKey = `english-guided-study-tts:${userId}:${material.id}:${billingRequestId}`;
    const now = new Date().toISOString();
    const job = createEnglishGuidedStudyJob({
      operation: "AUDIO",
      jobId: randomBytes(12).toString("hex"),
      operationKey,
      estimatedCredits: estimate.estimatedCredits,
      input: normalizedInput,
      now
    });
    const sourceSentenceCount = narrationNodeSourceSentences(
      jsonObject(material.content)?.sentences
    ).length;
    const progress = createEnglishGuidedStudyProgress({
      operation: "AUDIO",
      phase: "QUEUED",
      message: "语音讲解任务已提交，可以关闭页面，后台会继续生成",
      now,
      total: Math.max(1, sourceSentenceCount + (material.summary.trim() ? 1 : 0))
    });
    const queued = await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, material.id);
      const current = await transaction.englishGuidedStudyMaterial.findFirst({
        where: englishMaterialSubjectWhere(subject, { id: material.id })
      });

      if (!current) {
        throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
      }

      this.assertEnglishGuidedStudyOperationAvailable(current.content);

      const currentRevision = englishGuidedStudyAudioBillingRevision({
        ...normalizedInput,
        billingRequestId,
        materialId: current.id,
        narration: englishGuidedStudyMaterialNarrationDrafts(current).map(
          (node) => node.script
        )
      });

      if (currentRevision !== estimate.revision) {
        throw new AppException(40001, "带学讲稿或语音设置已发生变化，请重新确认本次点数消耗", HttpStatus.BAD_REQUEST);
      }

      await this.reserveEnglishGuidedStudyCredits(transaction, {
        estimatedCredits: estimate.estimatedCredits,
        note: `英文带学语音讲解冻结 ${estimate.estimatedCredits} 点`,
        operationKey,
        userId
      });

      return transaction.englishGuidedStudyMaterial.update({
        where: {
          id: current.id
        },
        data: {
          content: mergeEnglishGuidedStudyOperationContent(current.content, {
            job,
            jobKey: "audioGenerationJob",
            progress,
            progressKey: "audioGenerationProgress"
          }) as Prisma.InputJsonValue
        }
      });
    });

    this.scheduleEnglishGuidedStudyOperation(queued.id, "AUDIO");

    return this.toMaterial(queued);
  }

  async submitMaterialReadAlongGeneration(
    subject: ProfileSubject,
    id: string,
    dto: GenerateEnglishGuidedStudyAudioDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const billingRequestId = requiredEnglishGuidedStudyBillingRequestId(dto.billingRequestId);
    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    const sourceUnits = readAlongSourceUnits(material);
    const normalizedSettings = normalizedEnglishGuidedStudyAudioInput(dto, billingRequestId);
    const estimate = await this.materialReadAlongBillingEstimate(
      userId,
      material,
      normalizedSettings
    );
    this.assertBillingConfirmed(dto.billingConfirmed, estimate);

    if (dto.billingRevision?.trim() !== estimate.revision) {
      throw new AppException(40001, "原文断句或音色设置已发生变化，请重新确认本次点数消耗", HttpStatus.BAD_REQUEST);
    }

    const operationKey = `english-guided-study-read-aloud:${userId}:${material.id}:${billingRequestId}`;
    const now = new Date().toISOString();
    const input: EnglishGuidedStudyReadAlongJobInput = {
      mode: "GENERATE",
      settings: {
        ...normalizedSettings,
        billingConfirmed: true,
        billingRevision: estimate.revision
      }
    };
    const job = createEnglishGuidedStudyJob({
      operation: "READ_ALOUD",
      jobId: randomBytes(12).toString("hex"),
      operationKey,
      estimatedCredits: estimate.estimatedCredits,
      input,
      now
    });
    const progress = createEnglishGuidedStudyProgress({
      operation: "READ_ALOUD",
      phase: "QUEUED",
      message: "跟读音频任务已提交，可以关闭页面，后台会继续生成",
      now,
      total: sourceUnits.length
    });
    const queued = await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, material.id);
      const current = await transaction.englishGuidedStudyMaterial.findFirst({
        where: englishMaterialSubjectWhere(subject, { id: material.id })
      });

      if (!current) {
        throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
      }

      this.assertEnglishGuidedStudyOperationAvailable(current.content);
      const currentUnits = readAlongSourceUnits(current);
      const currentRevision = englishGuidedStudyReadAlongBillingRevision({
        ...normalizedSettings,
        billingRequestId,
        materialId: current.id,
        narration: currentUnits.map((unit) => unit.text)
      });

      if (currentRevision !== estimate.revision) {
        throw new AppException(40001, "原文断句或音色设置已发生变化，请重新确认本次点数消耗", HttpStatus.BAD_REQUEST);
      }

      await this.reserveEnglishGuidedStudyCredits(transaction, {
        estimatedCredits: estimate.estimatedCredits,
        note: `英文跟读音频生成冻结 ${estimate.estimatedCredits} 点`,
        operationKey,
        userId
      });

      return transaction.englishGuidedStudyMaterial.update({
        where: {
          id: current.id
        },
        data: {
          content: mergeEnglishGuidedStudyOperationContent(current.content, {
            job,
            jobKey: "readAlongGenerationJob",
            progress,
            progressKey: "readAlongGenerationProgress"
          }) as Prisma.InputJsonValue
        }
      });
    });

    this.scheduleEnglishGuidedStudyOperation(queued.id, "READ_ALOUD");

    return this.toMaterial(queued);
  }

  async submitMaterialReadAlongUpload(
    subject: ProfileSubject,
    id: string,
    file: UploadedAudioFileLike | undefined,
    dto: SubmitEnglishGuidedStudyReadAlongUploadDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const billingRequestId = requiredEnglishGuidedStudyBillingRequestId(dto.billingRequestId);

    if (!dto.billingConfirmed || !dto.billingRevision?.trim()) {
      throw new AppException(40001, "请先确认本次上传音频的点数消耗", HttpStatus.BAD_REQUEST);
    }

    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    readAlongSourceUnits(material);
    this.assertEnglishGuidedStudyOperationAvailable(material.content);
    const audioAsset = await this.audioService.uploadAudioAssetForTranscription(
      userId,
      "TTS_OUTPUT",
      file,
      englishGuidedStudyReadAlongUploadMaxBytes
    );

    try {
      const durationMs = audioAsset.durationMs ?? await probeAudioDurationMs(audioAsset.url);
      const audioName = file?.originalname.trim() || "跟读音频";
      const estimateInput = {
        audioDurationMs: durationMs,
        audioMimeType: audioAsset.mimeType,
        audioName,
        audioSizeBytes: audioAsset.sizeBytes,
        billingRequestId
      };
      const estimate = await this.materialReadAlongUploadBillingEstimate(
        userId,
        material,
        estimateInput
      );
      this.assertBillingConfirmed(dto.billingConfirmed, estimate);

      if (dto.billingRevision.trim() !== estimate.revision) {
        throw new AppException(
          40001,
          `音频实际时长对应消耗 ${estimate.estimatedCredits} 点，请重新确认`,
          HttpStatus.BAD_REQUEST
        );
      }

      const operationKey = `english-guided-study-read-aloud-upload:${userId}:${material.id}:${billingRequestId}`;
      const now = new Date().toISOString();
      const input: EnglishGuidedStudyReadAlongJobInput = {
        mode: "UPLOAD",
        audioAsset: {
          durationMs,
          id: audioAsset.id,
          mimeType: audioAsset.mimeType,
          name: audioName,
          sizeBytes: audioAsset.sizeBytes,
          url: audioAsset.url
        }
      };
      const job = createEnglishGuidedStudyJob({
        operation: "READ_ALOUD",
        jobId: randomBytes(12).toString("hex"),
        operationKey,
        estimatedCredits: estimate.estimatedCredits,
        input,
        now
      });
      const progress = createEnglishGuidedStudyProgress({
        operation: "READ_ALOUD",
        phase: "QUEUED",
        message: "音频已上传，字幕生成任务正在排队",
        now,
        total: 100
      });
      const queued = await this.prisma.$transaction(async (transaction) => {
        await this.lockEnglishGuidedStudyMaterial(transaction, material.id);
        const current = await transaction.englishGuidedStudyMaterial.findFirst({
          where: englishMaterialSubjectWhere(subject, { id: material.id })
        });

        if (!current) {
          throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
        }

        readAlongSourceUnits(current);
        this.assertEnglishGuidedStudyOperationAvailable(current.content);
        const currentRevision = englishGuidedStudyReadAlongUploadBillingRevision({
          ...estimateInput,
          materialId: current.id
        });

        if (currentRevision !== estimate.revision) {
          throw new AppException(40001, "材料状态已发生变化，请重新确认本次点数消耗", HttpStatus.BAD_REQUEST);
        }

        await this.reserveEnglishGuidedStudyCredits(transaction, {
          estimatedCredits: estimate.estimatedCredits,
          note: `跟读上传音频识别冻结 ${estimate.estimatedCredits} 点`,
          operationKey,
          userId
        });

        return transaction.englishGuidedStudyMaterial.update({
          where: {
            id: current.id
          },
          data: {
            content: mergeEnglishGuidedStudyOperationContent(current.content, {
              job,
              jobKey: "readAlongGenerationJob",
              progress,
              progressKey: "readAlongGenerationProgress"
            }) as Prisma.InputJsonValue
          }
        });
      });

      this.scheduleEnglishGuidedStudyOperation(queued.id, "READ_ALOUD");
      return this.toMaterial(queued);
    } catch (error) {
      await this.audioService.deleteAudioAsset(userId, audioAsset.id).catch(() => undefined);
      throw error;
    }
  }

  async generateMaterial(
    userId: string,
    dto: GenerateEnglishGuidedStudyMaterialDto,
    execution: EnglishGuidedStudyGenerationExecution = {}
  ) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const billingRequestId = dto.billingConfirmed
      ? requiredEnglishGuidedStudyBillingRequestId(dto.billingRequestId)
      : optionalEnglishGuidedStudyBillingRequestId(dto.billingRequestId);
    const requestedMaterialId = dto.materialId?.trim() || null;
    const materialId = execution.targetMaterialId?.trim() || requestedMaterialId;
    const existingMaterial = materialId
      ? await this.prisma.englishGuidedStudyMaterial.findFirst({
          where: {
            id: materialId,
            userId
          }
        })
      : null;

    if (materialId && !existingMaterial) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }
    const attribution = englishTaskAttribution(
      userId,
      existingMaterial?.learnerId,
      execution.attribution
    );
    const previousAudioTaskIds = existingMaterial
      ? narrationAudioTaskIds(existingMaterial.content, existingMaterial.audioTaskId)
      : [];
    const previousReadAlongCleanup = existingMaterial
      ? mergeReadAlongCleanup(
          {
            audioAssetIds: [readAlongAudioAssetId(existingMaterial.content)].filter(
              (value): value is string => Boolean(value)
            ),
            taskIds: readAlongAudioTaskIds(existingMaterial.content)
          },
          readAlongJobCleanup(existingMaterial.content)
        )
      : {
          audioAssetIds: [],
          taskIds: []
        };

    const sourceText = normalizeEnglishStudySourceText(dto.sourceText);

    if (!sourceText) {
      throw new AppException(40001, "请先输入或识别需要带学的英文文本", HttpStatus.BAD_REQUEST);
    }

    const explanationMode = dto.explanationMode ?? "SENTENCE";
    const scene = guidedStudyScene(dto.scene);
    assertGuidedStudySourceLength(scene, sourceText);
    const sourceSegments = guidedStudySourceSegments(sourceText, explanationMode, scene);
    const title = dto.title?.trim() ?? "";
    const author = dto.author?.trim() || null;
    const authorIntroductionMode = dto.authorIntroductionMode ?? "BRIEF";
    const sourceName = dto.sourceName?.trim() || null;
    const levelStandardName = dto.levelStandardName.trim();
    const levelOptionLabel = dto.levelOptionLabel.trim();
    const aiLevel = dto.aiLevel.trim();
    const referenceMaterials = normalizeEnglishGuidedStudyReferenceMaterials(dto.referenceMaterials);
    const estimate = await this.createBillingEstimate(userId, {
      items: englishGuidedStudyMaterialBillingItems(sourceText, scene),
      operation: "ENGLISH_GUIDED_STUDY_CONTENT",
      requestId: billingRequestId,
      revision: englishGuidedStudyMaterialBillingRevision({
        ...dto,
        aiLevel,
        author,
        authorIntroductionMode,
        explanationMode,
        levelOptionLabel,
        levelStandardName,
        materialId: requestedMaterialId,
        sourceName,
        sourceText,
        title,
        referenceMaterials
      }),
      title: scene === "DAODU"
        ? "生成开卷导读文稿"
        : scene === "GUSHIWEN"
          ? "生成古诗文带学讲稿"
          : "生成英文带学讲稿"
    });
    this.assertBillingConfirmed(dto.billingConfirmed, estimate);

    if (dto.billingRevision?.trim() !== estimate.revision) {
      throw new AppException(40001, "英文原文或带学设置已发生变化，请重新确认本次点数消耗", HttpStatus.BAD_REQUEST);
    }

    const operationKey = `english-guided-study-content:${userId}:${billingRequestId}`;
    if (!execution.billingAlreadyReserved) {
      await this.prisma.$transaction((transaction) =>
        this.reserveEnglishGuidedStudyCredits(transaction, {
          estimatedCredits: estimate.estimatedCredits,
          note: `英文带学讲稿生成冻结 ${estimate.estimatedCredits} 点`,
          operationKey,
          userId
        })
      );
    }

    try {
      const levelProfile = guidedStudyLevelProfile(scene, levelStandardName, levelOptionLabel, aiLevel);
      const content = await this.generateMaterialContent({
        attribution,
        inputLabel: title || sourceName || (scene === "DAODU"
          ? "开卷导读材料"
          : scene === "GUSHIWEN"
            ? "古诗文带学材料"
            : "英文带学材料"),
        maxTokens: englishGuidedStudyMaterialMaxTokens(sourceSegments.length, sourceText.length),
        modelInstanceId: dto.modelInstanceId?.trim() || undefined,
        aiLevel,
        scene,
        author,
        authorIntroductionMode,
        explanationMode,
        levelOptionLabel,
        levelStandardName,
        levelProfile,
        sourceSegments,
        sourceName,
        sourceText,
        sourceType: dto.sourceType,
        title,
        durationMinutes: dto.durationMinutes,
        referenceMaterials,
        onProgress: execution.onProgress,
        existingBatchResults: englishGuidedStudyContentBatchResults(
          execution.operationJob?.input
        ),
        onBatchCompleted:
          existingMaterial && execution.operationJob
            ? (batchIndex, result) =>
                this.saveContentGenerationCheckpoint(
                  existingMaterial.id,
                  userId,
                  execution.operationJob as EnglishGuidedStudyOperationJob,
                  batchIndex,
                  result
                )
            : undefined
      });
      const materialData = {
        title: content.title,
        sourceType: dto.sourceType,
        sourceName,
        sourceText,
        levelStandardName,
        levelOptionLabel,
        aiLevel,
        summary: content.summary,
        narration: content.narration,
        audioUrl: null,
        audioTaskId: null,
        audioDurationSeconds: content.audioDurationSeconds,
        content: content as unknown as Prisma.InputJsonValue
      };
      const material = await this.prisma.$transaction(async (transaction) => {
        let saved: EnglishGuidedStudyMaterialRecord;

        if (existingMaterial && execution.operationJob) {
          const operationJob = execution.operationJob;
          const attemptId = operationJob.attemptId;

          if (!attemptId) {
            throw new AppException(40901, "当前英文带学任务缺少执行租约", HttpStatus.CONFLICT);
          }

          await this.lockEnglishGuidedStudyMaterial(transaction, existingMaterial.id);
          const current = await transaction.englishGuidedStudyMaterial.findFirst({
            where: {
              id: existingMaterial.id,
              userId
            }
          });
          const completedContent = this.completedEnglishGuidedStudyOperationContent({
            currentContent: current?.content,
            generatedContent: content,
            job: operationJob,
            operation: "CONTENT"
          });
          const updated = await transaction.englishGuidedStudyMaterial.updateMany({
            where: {
              id: existingMaterial.id,
              userId,
              AND: [
                {
                  content: {
                    path: ["contentGenerationJob", "jobId"],
                    equals: operationJob.jobId
                  }
                },
                {
                  content: {
                    path: ["contentGenerationJob", "attemptId"],
                    equals: attemptId
                  }
                }
              ]
            },
            data: {
              ...materialData,
              content: completedContent as Prisma.InputJsonValue
            }
          });

          if (updated.count !== 1) {
            throw new AppException(40901, "当前英文带学任务已由新的执行器接管", HttpStatus.CONFLICT);
          }

          saved = await transaction.englishGuidedStudyMaterial.findUniqueOrThrow({
            where: {
              id: existingMaterial.id
            }
          });
        } else if (existingMaterial) {
          saved = await transaction.englishGuidedStudyMaterial.update({
            where: {
              id: existingMaterial.id
            },
            data: materialData
          });
        } else {
          saved = await transaction.englishGuidedStudyMaterial.create({
            data: {
              userId,
              ...materialData
            }
          });
        }

        await this.settleEnglishGuidedStudyCredits(transaction, {
          actualCredits: estimate.estimatedCredits,
          consumeNote: `英文带学讲稿生成消耗 ${estimate.estimatedCredits} 点`,
          operationKey,
          releaseNote: "英文带学讲稿生成释放多余冻结点数",
          userId
        });
        if (this.learnerActivityService) {
          await this.learnerActivityService.record({
            subject: saved.learnerId
              ? { userId: saved.userId, mode: "LEARNER", learnerId: saved.learnerId }
              : { userId: saved.userId, mode: "ACCOUNT", learnerId: null },
            eventType: "CREATE_COMPLETED",
            scenarioId: attribution.rootScenarioId,
            resourceType: "GUIDED_STUDY",
            resourceId: saved.id,
            idempotencyKey: `guided-study:${saved.id}:create-completed`
          }, transaction);
        }

        return saved;
      });
      await this.cleanupNarrationAudioBestEffort(userId, previousAudioTaskIds);
      await this.cleanupReadAlongAudioBestEffort(userId, previousReadAlongCleanup);

      if (existingMaterial) {
        await this.recordCourseMaterialChange(material.id);
      }

      return this.toMaterial(material);
    } catch (error) {
      if (!execution.billingAlreadyReserved) {
        await this.prisma.$transaction((transaction) =>
          this.releaseEnglishGuidedStudyCredits(transaction, {
            note: "英文带学讲稿生成失败，已释放冻结点数",
            operationKey,
            userId
          })
        );
      }
      throw error;
    }
  }

  async estimateMaterialGeneration(userId: string, dto: GenerateEnglishGuidedStudyMaterialDto) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const sourceText = normalizeEnglishStudySourceText(dto.sourceText);

    if (!sourceText) {
      throw new AppException(40001, "请先输入或识别需要带学的英文文本", HttpStatus.BAD_REQUEST);
    }

    const explanationMode = dto.explanationMode ?? "SENTENCE";
    const billingRequestId = optionalEnglishGuidedStudyBillingRequestId(dto.billingRequestId);
    const scene = guidedStudyScene(dto.scene);
    assertGuidedStudySourceLength(scene, sourceText);
    const items = englishGuidedStudyMaterialBillingItems(sourceText, scene);
    const referenceMaterials = normalizeEnglishGuidedStudyReferenceMaterials(dto.referenceMaterials);

    return this.createBillingEstimate(userId, {
      items,
      operation: "ENGLISH_GUIDED_STUDY_CONTENT",
      requestId: billingRequestId,
      revision: englishGuidedStudyMaterialBillingRevision({
        ...dto,
        billingRequestId,
        explanationMode,
        materialId: dto.materialId?.trim() || null,
        sourceName: dto.sourceName?.trim() || null,
        sourceText,
        title: dto.title?.trim() || "",
        referenceMaterials
      }),
      title: scene === "DAODU"
        ? "生成开卷导读文稿"
        : scene === "GUSHIWEN"
          ? "生成古诗文带学讲稿"
          : "生成英文带学讲稿"
    });
  }

  async generateMaterialPractice(
    userId: string,
    id: string,
    dto: GenerateEnglishGuidedStudyPracticeDto,
    execution: EnglishGuidedStudyGenerationExecution = {}
  ) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }
    const attribution = englishTaskAttribution(userId, material.learnerId, execution.attribution);

    const content = jsonObject(material.content);

    if (!content || !Array.isArray(content.sentences) || content.sentences.length === 0) {
      throw new AppException(40001, "请先生成带学文稿", HttpStatus.BAD_REQUEST);
    }

    await execution.onProgress?.({
      completed: 12,
      message: "正在根据带学文稿设计练习考点",
      phase: "ANALYZING_PRACTICE",
      total: 100
    });

    const explanationMode = englishGuidedStudyExplanationMode(content.explanationMode);
    const scene = guidedStudyScene(content.scene);
    const sourceSegments = guidedStudySourceSegments(material.sourceText, explanationMode, scene);
    const questionCount = scene === "DAODU" ? readingGuideQuestionCount(dto.questionCount) : 10;
    const referenceMaterials = referenceMaterialsFromValue(content.referenceMaterials);
    const referenceMaterialsJson = buildEnglishGuidedStudyReferenceMaterialsJson({
      batchCount: 1,
      batchIndex: 0,
      materials: referenceMaterials,
      maxLength: 48_000,
      sourceSegments
    });
    const aiResult = await this.aiService.generateScenarioTextForExternalBilling({
      ...attribution,
      scenarioSlug: guidedStudyPracticeScenarioSlug(scene),
      input: `${material.title} 练习巩固`,
      maxTokens: 8_000,
      modelInstanceId: dto.modelInstanceId?.trim() || undefined,
      variables: {
        title: material.title,
        levelStandardName: material.levelStandardName,
        levelOptionLabel: material.levelOptionLabel,
        aiLevel: material.aiLevel,
        levelProfile: guidedStudyLevelProfile(
          scene,
          material.levelStandardName,
          material.levelOptionLabel,
          material.aiLevel
        ),
        sourceText: material.sourceText,
        guideScript: scene === "DAODU" ? material.narration : "",
        questionCount: String(questionCount),
        lessonContentJson: englishGuidedStudyPracticeLessonJson(material, content),
        referenceMaterialsJson
      }
    });
    const object = parseAiMaterialObject(aiResult.text);
    const questions = normalizeGeneratedQuestions(object.questions, questionCount)
      .slice(0, questionCount)
      .map((question, index) => ({
        ...question,
        id: `q${index + 1}`
      }));

    if (questions.length !== questionCount) {
      throw new AppException(
        50201,
        `AI 未返回完整的 ${questionCount} 道练习题，请稍后重试`,
        HttpStatus.BAD_GATEWAY
      );
    }

    await execution.onProgress?.({
      completed: 90,
      message: "练习已生成，正在校验答案和保存结果",
      phase: "VALIDATING_PRACTICE",
      total: 100
    });

    const updated = await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, material.id);
      const current = await transaction.englishGuidedStudyMaterial.findFirst({
        where: {
          id: material.id,
          userId
        }
      });

      if (!current) {
        throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
      }

      const operationJob = execution.operationJob;

      if (!operationJob?.attemptId) {
        throw new AppException(40901, "当前练习生成任务缺少执行租约", HttpStatus.CONFLICT);
      }

      const currentContent = jsonObject(current.content);
      const generatedContent = {
        ...(currentContent ?? {}),
        questions,
        practiceGeneration: {
          scenarioSlug: guidedStudyPracticeScenarioSlug(scene),
          aiTaskId: aiResult.taskId,
          providerName: aiResult.providerName,
          modelName: aiResult.modelName,
          generatedAt: new Date().toISOString()
        }
      };
      const completedContent = this.completedEnglishGuidedStudyOperationContent({
        currentContent: current.content,
        generatedContent,
        job: operationJob,
        operation: "PRACTICE"
      });
      const saved = await transaction.englishGuidedStudyMaterial.updateMany({
        where: {
          id: current.id,
          userId,
          AND: [
            {
              content: {
                path: ["practiceGenerationJob", "jobId"],
                equals: operationJob.jobId
              }
            },
            {
              content: {
                path: ["practiceGenerationJob", "attemptId"],
                equals: operationJob.attemptId
              }
            }
          ]
        },
        data: {
          content: completedContent as Prisma.InputJsonValue
        }
      });

      if (saved.count !== 1) {
        throw new AppException(40901, "当前练习生成任务已由新的执行器接管", HttpStatus.CONFLICT);
      }

      return transaction.englishGuidedStudyMaterial.findUniqueOrThrow({
        where: {
          id: current.id
        }
      });
    });
    await this.recordCourseMaterialChange(updated.id);

    return this.toMaterial(updated);
  }

  async updateMaterialSource(
    inputSubject: ProfileSubject | string,
    id: string,
    dto: UpdateEnglishGuidedStudySourceDto
  ) {
    const subject = typeof inputSubject === "string"
      ? { mode: "ACCOUNT" as const, userId: inputSubject, learnerId: null }
      : inputSubject;
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const sourceText = normalizeEnglishStudySourceText(dto.sourceText);

    if (!sourceText) {
      throw new AppException(40001, "学习内容正文不能为空", HttpStatus.BAD_REQUEST);
    }

    const contentTitle = dto.title?.trim() || null;
    const author = dto.author?.trim() || null;
    const result = await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, id);
      const material = await transaction.englishGuidedStudyMaterial.findFirst({
        where: englishMaterialSubjectWhere(subject, { id })
      });

      if (!material) {
        throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
      }

      this.assertEnglishGuidedStudyOperationAvailable(material.content);
      const existingContent = jsonObject(material.content) ?? {};
      const maxSourceLength = guidedStudySourceInputMaxLength(guidedStudyScene(existingContent.scene));
      if (dto.sourceText.length > maxSourceLength) {
        throw new AppException(
          40001,
          `学习原文不能超过 ${maxSourceLength.toLocaleString("zh-CN")} 个字符`,
          HttpStatus.BAD_REQUEST
        );
      }
      const coursewareTitle = guidedStudyCoursewareTitle(
        contentTitle ?? undefined,
        sourceText,
        guidedStudyScene(existingContent.scene)
      );
      const authorIntroductionMode = englishGuidedStudyAuthorIntroductionMode(
        dto.authorIntroductionMode ?? existingContent.authorIntroductionMode
      );
      const nextContent = {
        ...existingContent,
        title: coursewareTitle,
        contentTitle,
        author,
        authorIntroductionMode,
        sourceText
      };
      const nextMaterial = {
        ...material,
        title: coursewareTitle,
        sourceText,
        content: nextContent as Prisma.JsonValue
      };
      const shouldInvalidateReadAlong =
        !sameReadAlongSource(material, nextMaterial) ||
        !readAlongTrackMatchesSource(material);
      const readAlongCleanup = shouldInvalidateReadAlong
        ? mergeReadAlongCleanup(
            {
              audioAssetIds: [readAlongAudioAssetId(material.content)].filter(
                (value): value is string => Boolean(value)
              ),
              taskIds: readAlongAudioTaskIds(material.content)
            },
            readAlongJobCleanup(material.content)
          )
        : { audioAssetIds: [], taskIds: [] };

      const updated = await transaction.englishGuidedStudyMaterial.update({
        where: {
          id: material.id
        },
        data: {
          title: coursewareTitle,
          sourceText,
          content: (shouldInvalidateReadAlong
            ? contentWithoutReadAlongArtifacts(nextContent)
            : nextContent) as Prisma.InputJsonValue
        }
      });

      return { readAlongCleanup, updated };
    });
    await this.cleanupReadAlongAudioBestEffort(userId, result.readAlongCleanup);
    await this.recordCourseMaterialChange(result.updated.id);

    return this.toMaterial(result.updated);
  }

  async generateMaterialAudio(
    userId: string,
    id: string,
    dto: GenerateEnglishGuidedStudyAudioDto,
    execution: EnglishGuidedStudyGenerationExecution = {}
  ) {
    const billingRequestId = dto.billingConfirmed
      ? requiredEnglishGuidedStudyBillingRequestId(dto.billingRequestId)
      : optionalEnglishGuidedStudyBillingRequestId(dto.billingRequestId);
    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }
    const attribution = englishTaskAttribution(userId, material.learnerId, execution.attribution);

    const estimate = await this.materialAudioBillingEstimate(userId, material, {
      ...dto,
      billingRequestId
    });
    this.assertBillingConfirmed(dto.billingConfirmed, estimate);

    if (dto.billingRevision?.trim() !== estimate.revision) {
      throw new AppException(40001, "带学讲稿或语音设置已发生变化，请重新确认本次点数消耗", HttpStatus.BAD_REQUEST);
    }

    const operationKey = `english-guided-study-tts:${userId}:${material.id}:${billingRequestId}`;
    const previousAudioTaskIds = narrationAudioTaskIds(material.content, material.audioTaskId);
    const generatedAudioTaskIds: string[] = [];
    if (!execution.billingAlreadyReserved) {
      await this.prisma.$transaction((transaction) =>
        this.reserveEnglishGuidedStudyCredits(transaction, {
          estimatedCredits: estimate.estimatedCredits,
          note: `英文带学语音讲解冻结 ${estimate.estimatedCredits} 点`,
          operationKey,
          userId
        })
      );
    }

    try {
      let workingContent = jsonObject(material.content) ?? {};
      const scene = guidedStudyScene(workingContent.scene);
      const workingSummary = material.summary;
      const workingClosing =
        scene === "DAODU"
          ? ""
          : stringValue(workingContent.closing) ?? defaultGuidedStudyClosing(scene);

      if (scene === "GUSHIWEN") {
        workingContent = {
          ...workingContent,
          sentences: alignGushiwenContentTeachingPoints(workingContent.sentences)
        };
      }

      const readingGuideNarration = scene === "DAODU" ? material.narration : null;
      const nodeDrafts = englishGuidedStudyMaterialNarrationDrafts({
        ...material,
        content: workingContent as Prisma.JsonValue
      });
      const nodes: EnglishNarrationNode[] = [];

      for (const [index, draft] of nodeDrafts.entries()) {
        await execution.onProgress?.({
          completed: index,
          message: `正在生成并校验讲解语音，已完成 ${index}/${nodeDrafts.length} 段`,
          phase: "SYNTHESIZING_AUDIO",
          total: nodeDrafts.length
        });
        let audioTask: Awaited<ReturnType<AudioService["synthesizeTtsForExternalBilling"]>> | null = null;

        for (let attempt = 1; attempt <= englishNarrationNodeMaxAttempts; attempt += 1) {
          try {
            audioTask = await this.audioService.synthesizeTtsForExternalBilling(attribution, {
              text: draft.script,
              voiceAssetId: dto.voiceAssetId,
              voice: dto.voice?.trim() || "longanyang",
              modelAlias: dto.modelAlias?.trim() || "tts-default",
              source: "EXPERIENCE",
              speed: dto.speed,
              pitch: dto.pitch,
              volume: dto.volume,
              format: "mp3",
              sampleRate: dto.sampleRate,
              videoGuidePersistence: {
                lessonId: material.id,
                generationId: billingRequestId,
                nodeId: draft.id,
                format: "mp3",
                namespace: "english-guided-study"
              }
            });
          } catch (error) {
            if (!isRetryableEnglishNarrationError(error) || attempt >= englishNarrationNodeMaxAttempts) {
              throw error;
            }

            this.logger.warn(
              `英文带学第 ${index + 1} 个语音节点遇到瞬时网络异常，正在重试（${attempt}/${englishNarrationNodeMaxAttempts}）`
            );
            await delay(englishNarrationNodeRetryBaseDelayMs * attempt);
            continue;
          }
          generatedAudioTaskIds.push(audioTask.id);

          if (audioUrlFromTask(audioTask) || !isRetryableEnglishNarrationTask(audioTask)) {
            break;
          }

          if (attempt < englishNarrationNodeMaxAttempts) {
            this.logger.warn(
              `英文带学第 ${index + 1} 个语音节点生成失败，正在重试（${audioTask.errorCode ?? "UNKNOWN"}，${attempt}/${englishNarrationNodeMaxAttempts}）`
            );
            await delay(englishNarrationNodeRetryBaseDelayMs * attempt);
          }
        }

        if (!audioTask) {
          throw new AppException(50001, `第 ${index + 1} 个讲解节点未能创建语音任务`, HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const audioUrl = audioUrlFromTask(audioTask);

        if (!audioUrl) {
          throw new AppException(
            50001,
            audioTask.status === "FAILED"
              ? `第 ${index + 1} 个讲解节点生成失败：${audioTask.errorMessage ?? "语音服务暂不可用"}`
              : `第 ${index + 1} 个讲解节点仍在生成中，请稍后重试`,
            HttpStatus.INTERNAL_SERVER_ERROR
          );
        }

        const durationMs = audioDurationMsFromTask(audioTask) ?? await probeAudioDurationMs(audioUrl);
        nodes.push({
          ...draft,
          audioTaskId: audioTask.id,
          audioUrl,
          durationMs
        });
        await execution.onProgress?.({
          completed: index + 1,
          message: `正在生成并校验讲解语音，已完成 ${index + 1}/${nodeDrafts.length} 段`,
          phase: "SYNTHESIZING_AUDIO",
          total: nodeDrafts.length
        });
      }

      const firstNode = nodes[0];

      if (!firstNode) {
        throw new AppException(50201, "没有生成可播放的讲解节点", HttpStatus.BAD_GATEWAY);
      }

      const totalDurationMs = totalNarrationDurationMs(nodes);
      const durationSeconds = Math.max(1, Math.ceil(totalDurationMs / 1000));
      const narration = readingGuideNarration ?? nodes.map((node) => node.script).join("\n");
      const generatedContent = {
        ...workingContent,
        ...(scene === "DAODU" ? { guideScript: narration } : {}),
        summary: workingSummary,
        closing: workingClosing,
        narration,
        audioUrl: firstNode.audioUrl,
        audioTaskId: firstNode.audioTaskId,
        audioDurationSeconds: durationSeconds,
        narrationVoice: {
          providerVoiceId: dto.voice?.trim() || "longanyang",
          voiceAssetId: dto.voiceAssetId?.trim() || null,
          modelAlias: dto.modelAlias?.trim() || "tts-default",
          speed: dto.speed ?? 1,
          pitch: dto.pitch ?? null,
          volume: dto.volume ?? null,
          sampleRate: dto.sampleRate ?? null
        },
        narrationTimelineV2: {
          version: 2,
          nodes
        }
      };
      const updated = await this.prisma.$transaction(async (transaction) => {
        const materialData = {
          summary: workingSummary,
          narration,
          audioUrl: firstNode.audioUrl,
          audioTaskId: firstNode.audioTaskId,
          audioDurationSeconds: durationSeconds,
          content: generatedContent as unknown as Prisma.InputJsonValue
        };
        let saved: EnglishGuidedStudyMaterialRecord;

        if (execution.operationJob) {
          const operationJob = execution.operationJob;
          const attemptId = operationJob.attemptId;

          if (!attemptId) {
            throw new AppException(40901, "当前英文带学任务缺少执行租约", HttpStatus.CONFLICT);
          }

          await this.lockEnglishGuidedStudyMaterial(transaction, material.id);
          const current = await transaction.englishGuidedStudyMaterial.findFirst({
            where: {
              id: material.id,
              userId
            }
          });
          const completedContent = this.completedEnglishGuidedStudyOperationContent({
            currentContent: current?.content,
            generatedContent,
            job: operationJob,
            operation: "AUDIO"
          });
          const changed = await transaction.englishGuidedStudyMaterial.updateMany({
            where: {
              id: material.id,
              userId,
              AND: [
                {
                  content: {
                    path: ["audioGenerationJob", "jobId"],
                    equals: operationJob.jobId
                  }
                },
                {
                  content: {
                    path: ["audioGenerationJob", "attemptId"],
                    equals: attemptId
                  }
                }
              ]
            },
            data: {
              ...materialData,
              content: completedContent as Prisma.InputJsonValue
            }
          });

          if (changed.count !== 1) {
            throw new AppException(40901, "当前英文带学任务已由新的执行器接管", HttpStatus.CONFLICT);
          }

          saved = await transaction.englishGuidedStudyMaterial.findUniqueOrThrow({
            where: {
              id: material.id
            }
          });
        } else {
          saved = await transaction.englishGuidedStudyMaterial.update({
            where: {
              id: material.id
            },
            data: materialData
          });
        }

        await this.settleEnglishGuidedStudyCredits(transaction, {
          actualCredits: estimate.estimatedCredits,
          consumeNote: `英文带学语音讲解消耗 ${estimate.estimatedCredits} 点`,
          operationKey,
          releaseNote: "英文带学语音讲解释放多余冻结点数",
          userId
        });

        return saved;
      });

      await this.cleanupNarrationAudioBestEffort(
        userId,
        previousAudioTaskIds.filter((taskId) => !generatedAudioTaskIds.includes(taskId))
      );
      await this.recordCourseMaterialChange(updated.id);

      return this.toMaterial(updated);
    } catch (error) {
      await this.cleanupNarrationAudioBestEffort(userId, generatedAudioTaskIds);

      if (!execution.billingAlreadyReserved) {
        await this.prisma.$transaction((transaction) =>
          this.releaseEnglishGuidedStudyCredits(transaction, {
            note: "英文带学语音讲解生成失败，已释放冻结点数",
            operationKey,
            userId
          })
        );
      }
      throw error;
    }
  }

  async generateMaterialReadAlong(
    userId: string,
    id: string,
    input: EnglishGuidedStudyReadAlongJobInput,
    execution: EnglishGuidedStudyGenerationExecution = {}
  ) {
    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }
    const attribution = englishTaskAttribution(userId, material.learnerId, execution.attribution);

    const operationJob = execution.operationJob;

    if (!operationJob?.attemptId) {
      throw new AppException(40901, "当前跟读训练任务缺少执行租约", HttpStatus.CONFLICT);
    }

    const sourceUnits = readAlongSourceUnits(
      material,
      input.mode === "GENERATE" ? input.generatedNodes : undefined
    );
    const recognitionLanguage = guidedStudyScene(jsonObject(material.content)?.scene) === "GUSHIWEN"
      ? "zh-CN"
      : "en";
    const previousTaskIds = readAlongAudioTaskIds(material.content);
    const previousAudioAssetId = readAlongAudioAssetId(material.content);
    const generatedTaskIds: string[] = [];
    let track: EnglishReadAlongTrack;
    let generationMetadata: Record<string, unknown>;
    let billingOperationKey: string | null = operationJob.operationKey;

    try {
      if (input.mode === "GENERATE") {
        const settings = input.settings;
        const billingRequestId = requiredEnglishGuidedStudyBillingRequestId(settings.billingRequestId);
        const billingEstimate = await this.materialReadAlongBillingEstimate(userId, material, settings);
        billingOperationKey = `english-guided-study-read-aloud:${userId}:${material.id}:${billingRequestId}`;

        if (settings.billingRevision?.trim() !== billingEstimate.revision) {
          throw new AppException(
            40001,
            "原文断句或音色设置已发生变化，请重新确认本次点数消耗",
            HttpStatus.BAD_REQUEST
          );
        }

        const nodes = readAlongCheckpointNodes(input.generatedNodes, sourceUnits);

        for (let index = nodes.length; index < sourceUnits.length; index += 1) {
          const unit = sourceUnits[index]!;
          await execution.onProgress?.({
            completed: index,
            message: `正在生成全文诵读音频，已完成 ${index}/${sourceUnits.length} 个讲解点`,
            phase: "SYNTHESIZING_READ_ALOUD",
            total: sourceUnits.length
          });
          let audioTask: Awaited<ReturnType<AudioService["synthesizeTtsForExternalBilling"]>> | null = null;

          for (let attempt = 1; attempt <= englishNarrationNodeMaxAttempts; attempt += 1) {
            try {
              audioTask = await this.audioService.synthesizeTtsForExternalBilling(attribution, {
                text: unit.text,
                voiceAssetId: settings.voiceAssetId,
                voice: settings.voice?.trim() || "longanyang",
                modelAlias: settings.modelAlias?.trim() || "tts-default",
                source: "EXPERIENCE",
                speed: settings.speed,
                pitch: settings.pitch,
                volume: settings.volume,
                format: "mp3",
                sampleRate: settings.sampleRate,
                videoGuidePersistence: {
                  lessonId: material.id,
                  generationId: billingRequestId,
                  nodeId: unit.id,
                  format: "mp3",
                  namespace: "english-guided-study-read-along"
                }
              });
            } catch (error) {
              if (!isRetryableEnglishNarrationError(error) || attempt >= englishNarrationNodeMaxAttempts) {
                throw error;
              }

              this.logger.warn(
                `英文带学第 ${index + 1} 个诵读节点遇到瞬时网络异常，正在重试（${attempt}/${englishNarrationNodeMaxAttempts}）`
              );
              await delay(englishNarrationNodeRetryBaseDelayMs * attempt);
              continue;
            }
            generatedTaskIds.push(audioTask.id);

            if (audioUrlFromTask(audioTask) || !isRetryableEnglishNarrationTask(audioTask)) {
              break;
            }

            if (attempt < englishNarrationNodeMaxAttempts) {
              await delay(englishNarrationNodeRetryBaseDelayMs * attempt);
            }
          }

          if (!audioTask) {
            throw new AppException(
              50001,
              `第 ${index + 1} 个诵读节点未能创建语音任务`,
              HttpStatus.INTERNAL_SERVER_ERROR
            );
          }

          const audioUrl = audioUrlFromTask(audioTask);

          if (!audioUrl) {
            throw new AppException(
              50001,
              audioTask.status === "FAILED"
                ? `第 ${index + 1} 个诵读节点生成失败：${audioTask.errorMessage ?? "语音服务暂不可用"}`
                : `第 ${index + 1} 个诵读节点仍在生成中，请稍后重试`,
              HttpStatus.INTERNAL_SERVER_ERROR
            );
          }

          const durationMs = audioDurationMsFromTask(audioTask) ?? await probeAudioDurationMs(audioUrl);
          const generatedNode: EnglishReadAlongNode = {
            id: `read-along-node-${index + 1}`,
            audioTaskId: audioTask.id,
            audioUrl,
            durationMs,
            unitId: unit.id,
            unitType: unit.type,
            sentenceId: unit.sentenceId,
            text: unit.text,
            timingSource: "DURATION_ESTIMATE",
            words: alignReadAlongWordsToText(unit.text, [], durationMs)
          };
          nodes.push(generatedNode);
          await this.saveReadAlongGenerationCheckpoint(
            material.id,
            userId,
            operationJob,
            nodes
          );
          await execution.onProgress?.({
            completed: index + 1,
            message: `正在生成全文诵读音频，已完成 ${index + 1}/${sourceUnits.length} 个讲解点`,
            phase: "SYNTHESIZING_READ_ALOUD",
            total: sourceUnits.length
          });
        }

        await execution.onProgress?.({
          completed: 0,
          message: "正在校准逐词高亮时间",
          phase: "ALIGNING_READ_ALOUD_WORDS",
          total: sourceUnits.length
        });
        let alignedNodeCount = 0;
        await mapWithConcurrency(nodes, 4, async (node, index) => {
          if (node.timingSource === "ASR_WORDS" && node.words.length > 0) {
            alignedNodeCount += 1;
            return;
          }

          try {
            const recognized = await this.audioService.generateSrtFromMediaUrl({
              language: recognitionLanguage,
              mediaMimeType: "audio/mpeg",
              mediaName: `${node.unitId}.mp3`,
              mediaUrl: node.audioUrl
            });
            const wordTimeline = recognizedWordTimingsFromValue(recognized.wordTimeline);
            if (wordTimeline.length > 0) {
              const words = alignReadAlongWordsToText(node.text, wordTimeline, node.durationMs);
              if (words.length > 0) {
                nodes[index] = {
                  ...node,
                  timingSource: "ASR_WORDS",
                  words
                };
              }
            }
          } catch (error) {
            this.logger.warn(
              `第 ${index + 1} 个诵读节点未取得单词时间轴，将使用时长估算：${error instanceof Error ? error.message : String(error)}`
            );
          } finally {
            alignedNodeCount += 1;
          }
        });
        await this.saveReadAlongGenerationCheckpoint(
          material.id,
          userId,
          operationJob,
          nodes
        );
        await execution.onProgress?.({
          completed: alignedNodeCount,
          message: "逐词高亮时间已校准",
          phase: "ALIGNING_READ_ALOUD_WORDS",
          total: sourceUnits.length
        });

        track = buildGeneratedReadAlongTrack({
          nodes,
          voice: settings.voice?.trim() || "longanyang"
        });
        generationMetadata = {
          mode: "GENERATE",
          generatedAt: new Date().toISOString(),
          billingRequestId
        };
      } else {
        await execution.onProgress?.({
          completed: 15,
          message: "正在识别上传音频并生成英文字幕",
          phase: "RECOGNIZING_READ_ALOUD",
          total: 100
        });
        try {
          const recognition = await this.resolveUploadedReadAlongRecognition({
            input,
            job: operationJob,
            language: recognitionLanguage,
            material,
            onProgress: execution.onProgress,
            userId
          });

          if (recognition.status === "DEFERRED") {
            this.scheduleEnglishGuidedStudyOperation(
              material.id,
              "READ_ALOUD",
              englishGuidedStudyReadAlongAsrPollMs()
            );
            return this.toMaterial(recognition.material);
          }

          const recognized = recognition.result;
          await execution.onProgress?.({
            completed: 82,
            message: "正在将字幕时间轴与带学文稿断句对齐",
            phase: "ALIGNING_READ_ALOUD",
            total: 100
          });
          track = buildUploadedReadAlongTrack({
            audioAssetId: input.audioAsset.id,
            audioName: input.audioAsset.name,
            audioUrl: input.audioAsset.url,
            durationMs: Math.max(
              recognized.durationMs ?? 0,
              input.audioAsset.durationMs ?? 0
            ),
            recognizedSrt: recognized.subtitleText,
            recognizedWords: recognizedWordTimingsFromValue(recognized.wordTimeline),
            units: sourceUnits
          });
          generationMetadata = {
            mode: "UPLOAD",
            generatedAt: new Date().toISOString(),
            modelName: recognized.modelName,
            providerName: recognized.providerName,
            requestId: recognized.requestId,
            timingSource: "ASR"
          };
        } catch (error) {
          this.logger.warn(
            `上传跟读音频识别失败：${error instanceof Error ? error.message : String(error)}`
          );
          throw new AppException(
            50201,
            "上传音频识别失败，请重新上传音频或稍后重试",
            HttpStatus.BAD_GATEWAY
          );
        }
      }

      const attemptId = operationJob.attemptId;

      const updated = await this.prisma.$transaction(async (transaction) => {
        await this.lockEnglishGuidedStudyMaterial(transaction, material.id);
        const current = await transaction.englishGuidedStudyMaterial.findFirst({
          where: {
            id: material.id,
            userId
          }
        });

        if (!current) {
          throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
        }

        const currentContent = jsonObject(current.content) ?? {};
        const completedContent = this.completedEnglishGuidedStudyOperationContent({
          currentContent,
          generatedContent: {
            ...currentContent,
            readAlong: track,
            readAlongGeneration: generationMetadata
          },
          job: operationJob,
          operation: "READ_ALOUD"
        });
        const changed = await transaction.englishGuidedStudyMaterial.updateMany({
          where: {
            id: current.id,
            userId,
            AND: [
              {
                content: {
                  path: ["readAlongGenerationJob", "jobId"],
                  equals: operationJob.jobId
                }
              },
              {
                content: {
                  path: ["readAlongGenerationJob", "attemptId"],
                  equals: attemptId
                }
              }
            ]
          },
          data: {
            content: completedContent as Prisma.InputJsonValue
          }
        });

        if (changed.count !== 1) {
          throw new AppException(40901, "当前跟读训练任务已由新的执行器接管", HttpStatus.CONFLICT);
        }

        if (billingOperationKey) {
          await this.settleEnglishGuidedStudyCredits(transaction, {
            actualCredits: operationJob.estimatedCredits,
            consumeNote: input.mode === "UPLOAD"
              ? `跟读上传音频识别消耗 ${operationJob.estimatedCredits} 点`
              : `英文跟读音频生成消耗 ${operationJob.estimatedCredits} 点`,
            operationKey: billingOperationKey,
            releaseNote: input.mode === "UPLOAD"
              ? "跟读上传音频识别释放多余冻结点数"
              : "英文跟读音频生成释放多余冻结点数",
            userId
          });
        }

        return transaction.englishGuidedStudyMaterial.findUniqueOrThrow({
          where: {
            id: current.id
          }
        });
      });

      await this.cleanupReadAlongAudioBestEffort(userId, {
        audioAssetId:
          previousAudioAssetId && previousAudioAssetId !== track.audioAssetId
            ? previousAudioAssetId
            : null,
        taskIds: previousTaskIds.filter((taskId) => !generatedTaskIds.includes(taskId))
      });
      const activeTaskIds = new Set(track.nodes.map((node) => node.audioTaskId));
      await this.cleanupNarrationAudioBestEffort(
        userId,
        generatedTaskIds.filter((taskId) => !activeTaskIds.has(taskId))
      );
      await this.recordCourseMaterialChange(updated.id);

      return this.toMaterial(updated);
    } catch (error) {
      if (error instanceof AppException && error.code === 40901) {
        await this.cleanupUnreferencedReadAlongTasks(
          userId,
          material.id,
          generatedTaskIds
        );
      } else {
        await this.cleanupNarrationAudioBestEffort(userId, generatedTaskIds);
      }
      throw error;
    }
  }

  private scheduleEnglishGuidedStudyOperation(
    materialId: string,
    operation: EnglishGuidedStudyOperation,
    delayMs = 0
  ) {
    const timer = setTimeout(() => {
      this.runBackgroundTask(
        operation === "CONTENT"
          ? "生成英文带学文稿"
          : operation === "PRACTICE"
            ? "生成英文带学练习"
            : operation === "AUDIO"
              ? "生成英文带学语音"
              : "生成英文跟读音频",
        () => this.runWithStoredMaterialAuthorization(
          materialId,
          (attribution) => this.runQueuedEnglishGuidedStudyOperation(materialId, operation, attribution)
        )
      );
    }, Math.max(0, delayMs));
    timer.unref?.();
  }

  private async runWithStoredMaterialAuthorization<T>(
    materialId: string,
    callback: (attribution: AttributionContext) => Promise<T>
  ) {
    if (!this.learnerAccessService) {
      throw new AppException(40301, "内部任务缺少执行身份", HttpStatus.FORBIDDEN);
    }

    const material = await this.prisma.englishGuidedStudyMaterial.findUnique({
      where: { id: materialId },
      select: {
        userId: true,
        learnerId: true,
        content: true
      }
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    if (material.learnerId !== null && typeof material.learnerId !== "string") {
      throw new AppException(40301, "内部任务缺少执行身份", HttpStatus.FORBIDDEN);
    }

    const subject: ProfileSubject = material.learnerId
      ? { mode: "LEARNER", userId: material.userId, learnerId: material.learnerId }
      : { mode: "ACCOUNT", userId: material.userId, learnerId: null };
    const rootSlug = guidedStudyAuthorizationRoot(
      guidedStudyScene(jsonObject(material.content)?.scene)
    );
    const root = await this.learnerAccessService.assertScenarioAuthorized(subject, rootSlug);

    return this.learnerAccessService.runWithScenarioAuthorization(
      subject,
      root?.slug ?? rootSlug,
      () => callback({
        userId: subject.userId,
        learnerId: subject.learnerId,
        rootScenarioId: root?.id ?? null
      })
    );
  }

  private async runQueuedEnglishGuidedStudyOperation(
    materialId: string,
    operation: EnglishGuidedStudyOperation,
    attribution: AttributionContext
  ) {
    const claimed = await this.claimEnglishGuidedStudyOperation(materialId, operation);

    if (!claimed) {
      return;
    }

    const config = englishGuidedStudyOperationConfig(operation);
    const onProgress = (input: {
      completed: number;
      message: string;
      phase: string;
      total: number;
    }) => this.updateEnglishGuidedStudyOperationProgress(
      materialId,
      operation,
      {
        status: "RUNNING",
        ...input
      },
      claimed.job
    );
    const stopHeartbeat = this.startEnglishGuidedStudyOperationHeartbeat(
      materialId,
      operation,
      claimed.job
    );

    try {
      if (operation === "CONTENT") {
        await this.generateMaterial(
          claimed.material.userId,
            claimed.job.input as EnglishGuidedStudyContentJobInput,
          {
            attribution,
            billingAlreadyReserved: true,
            onProgress,
            operationJob: claimed.job,
            targetMaterialId: materialId
          }
        );
      } else if (operation === "PRACTICE") {
        await this.generateMaterialPractice(
          claimed.material.userId,
          materialId,
          claimed.job.input as GenerateEnglishGuidedStudyPracticeDto,
          {
            attribution,
            onProgress,
            operationJob: claimed.job
          }
        );
      } else if (operation === "AUDIO") {
        await this.generateMaterialAudio(
          claimed.material.userId,
          materialId,
          claimed.job.input as GenerateEnglishGuidedStudyAudioDto,
          {
            attribution,
            billingAlreadyReserved: true,
            onProgress,
            operationJob: claimed.job
          }
        );
      } else {
        await this.generateMaterialReadAlong(
          claimed.material.userId,
          materialId,
          claimed.job.input as EnglishGuidedStudyReadAlongJobInput,
          {
            attribution,
            billingAlreadyReserved: true,
            onProgress,
            operationJob: claimed.job
          }
        );
      }
    } catch (error) {
      this.logger.error(
        `英文带学后台任务失败：${materialId} ${operation}`,
        error instanceof Error ? error.stack : String(error)
      );
      const errorMessage = englishGuidedStudyBackgroundErrorMessage(error);
      await this.failEnglishGuidedStudyOperation(
        materialId,
        config,
        claimed.job,
        errorMessage,
        claimed.material.userId
      );
    } finally {
      await stopHeartbeat();
    }
  }

  private async claimEnglishGuidedStudyOperation(
    materialId: string,
    operation: EnglishGuidedStudyOperation
  ) {
    const config = englishGuidedStudyOperationConfig(operation);
    const material = await this.prisma.englishGuidedStudyMaterial.findUnique({
      where: {
        id: materialId
      }
    });
    const content = jsonObject(material?.content);
    const progress = englishGuidedStudyProgressFromValue(content?.[config.progressKey]);
    const job = englishGuidedStudyJobFromValue(content?.[config.jobKey]);

    if (!material || !content || !progress || progress.status !== "QUEUED" || !job || job.operation !== operation) {
      return null;
    }

    const leasedJob = leaseEnglishGuidedStudyJob(job, randomBytes(12).toString("hex"));
    const runningProgress = updateEnglishGuidedStudyProgress(
      progress,
      {
        status: "RUNNING",
        phase:
          operation === "CONTENT"
            ? "PREPARING"
            : operation === "PRACTICE"
              ? "PREPARING_PRACTICE"
              : operation === "AUDIO"
                ? "PREPARING_AUDIO"
                : "PREPARING_READ_ALOUD",
        completed: 2,
        total: 100,
        message:
          operation === "CONTENT"
            ? "正在分析英语水平和原文结构"
            : operation === "PRACTICE"
              ? "正在整理文稿中的学习重点"
              : operation === "AUDIO"
                ? "正在整理讲解节点和语音设置"
                : "正在整理原文断句和跟读音频设置"
      },
      new Date().toISOString()
    );
    const runningContent = mergeEnglishGuidedStudyOperationContent(content, {
      job: leasedJob,
      jobKey: config.jobKey,
      progress: runningProgress,
      progressKey: config.progressKey
    });
    const updated = await this.prisma.englishGuidedStudyMaterial.updateMany({
      where: {
        id: material.id,
        AND: [
          {
            content: {
              path: [config.progressKey, "status"],
              equals: "QUEUED"
            }
          },
          {
            content: {
              path: [config.jobKey, "jobId"],
              equals: job.jobId
            }
          }
        ]
      },
      data: {
        content: runningContent as Prisma.InputJsonValue
      }
    });

    return updated.count === 1
      ? {
          job: leasedJob,
          material
        }
      : null;
  }

  private async updateEnglishGuidedStudyOperationProgress(
    materialId: string,
    operation: EnglishGuidedStudyOperation,
    patch: Parameters<typeof updateEnglishGuidedStudyProgress>[1],
    job: EnglishGuidedStudyOperationJob
  ) {
    const config = englishGuidedStudyOperationConfig(operation);
    await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, materialId);
      const material = await transaction.englishGuidedStudyMaterial.findUnique({
        where: {
          id: materialId
        },
        select: {
          content: true
        }
      });
      const content = jsonObject(material?.content);
      const currentProgress = englishGuidedStudyProgressFromValue(content?.[config.progressKey]);

      if (
        !content ||
        !currentProgress ||
        currentProgress.status !== "RUNNING" ||
        !job.attemptId ||
        !englishGuidedStudyAttemptMatches(content[config.jobKey], job.jobId, job.attemptId)
      ) {
        throw new AppException(40901, "当前英文带学任务已由新的执行器接管", HttpStatus.CONFLICT);
      }

      const progress = updateEnglishGuidedStudyProgress(
        currentProgress,
        patch,
        new Date().toISOString()
      );
      const updated = await transaction.englishGuidedStudyMaterial.updateMany({
        where: {
          id: materialId,
          AND: [
            {
              content: {
                path: [config.jobKey, "jobId"],
                equals: job.jobId
              }
            },
            {
              content: {
                path: [config.jobKey, "attemptId"],
                equals: job.attemptId
              }
            }
          ]
        },
        data: {
          content: {
            ...content,
            [config.progressKey]: progress
          } as Prisma.InputJsonValue
        }
      });

      if (updated.count !== 1) {
        throw new AppException(40901, "当前英文带学任务已由新的执行器接管", HttpStatus.CONFLICT);
      }
    });
  }

  private async resolveUploadedReadAlongRecognition(input: {
    input: Extract<EnglishGuidedStudyReadAlongJobInput, { mode: "UPLOAD" }>;
    job: EnglishGuidedStudyOperationJob;
    language: string;
    material: EnglishGuidedStudyMaterialRecord;
    onProgress?: EnglishGuidedStudyGenerationExecution["onProgress"];
    userId: string;
  }) {
    let checkpoint = readAlongAsrCheckpointFromValue(input.input.asrCheckpoint);

    if (!checkpoint) {
      let submitted: Awaited<ReturnType<AudioService["submitSrtGenerationTask"]>>;

      try {
        submitted = await this.audioService.submitSrtGenerationTask({
          language: input.language,
          mediaMimeType: input.input.audioAsset.mimeType,
          mediaName: input.input.audioAsset.name,
          mediaUrl: input.input.audioAsset.url
        });
      } catch (error) {
        if (!isRetryableAudioProviderError(error)) {
          throw error;
        }

        const submissionAttempts = (
          nonNegativeInteger(input.input.asrSubmissionAttempts)
            ? input.input.asrSubmissionAttempts
            : 0
        ) + 1;

        if (submissionAttempts >= englishGuidedStudyReadAlongAsrMaxSubmissionAttempts()) {
          throw new AppException(
            50201,
            "上传音频识别任务多次提交失败，请稍后重新上传",
            HttpStatus.BAD_GATEWAY
          );
        }

        this.logger.warn(
          `上传跟读音频识别任务提交暂时失败，将保留音频后重试：${audioProviderErrorCode(error) ?? (error instanceof Error ? error.message : String(error))}`
        );
        const material = await this.requeueUploadedReadAlongRecognition({
          checkpoint: null,
          job: input.job,
          materialId: input.material.id,
          message: "识别服务暂时无响应，系统会自动重试，无需重新上传音频",
          submissionAttempts,
          userId: input.userId
        });

        return { material, status: "DEFERRED" as const };
      }

      const now = new Date().toISOString();
      checkpoint = {
        version: 1,
        providerTaskId: submitted.providerTaskId,
        providerStatus: submitted.providerStatus,
        modelInstanceId: submitted.modelInstanceId,
        providerInstanceId: submitted.providerInstanceId,
        modelName: submitted.modelName,
        providerName: submitted.providerName,
        requestId: submitted.requestId,
        submittedAt: now,
        lastPolledAt: null,
        pollAttempts: 0,
        transientFailures: 0
      };
      await this.saveReadAlongAsrCheckpoint(
        input.material.id,
        input.userId,
        input.job,
        checkpoint
      );
      await input.onProgress?.({
        completed: 50,
        message: "语音识别任务已提交，正在等待识别结果，可以关闭页面稍后查看",
        phase: "RECOGNIZING_READ_ALOUD",
        total: 100
      });
    }

    let recognized: Awaited<ReturnType<AudioService["querySrtGenerationTask"]>>;

    try {
      recognized = await this.audioService.querySrtGenerationTask({
        mediaMimeType: input.input.audioAsset.mimeType,
        mediaName: input.input.audioAsset.name,
        modelInstanceId: checkpoint.modelInstanceId,
        modelName: checkpoint.modelName,
        providerInstanceId: checkpoint.providerInstanceId,
        providerTaskId: checkpoint.providerTaskId
      });
    } catch (error) {
      if (!isRetryableAudioProviderError(error)) {
        throw error;
      }

      const retryCheckpoint: EnglishGuidedStudyReadAlongAsrCheckpoint = {
        ...checkpoint,
        providerStatus: `RETRYING:${audioProviderErrorCode(error) ?? "NETWORK"}`,
        lastPolledAt: new Date().toISOString(),
        pollAttempts: checkpoint.pollAttempts + 1,
        transientFailures: checkpoint.transientFailures + 1
      };

      if (
        retryCheckpoint.transientFailures >= englishGuidedStudyReadAlongAsrMaxTransientFailures()
        || retryCheckpoint.pollAttempts >= englishGuidedStudyReadAlongAsrMaxPollAttempts()
      ) {
        throw new AppException(
          50201,
          "上传音频识别服务持续无响应，请稍后重新上传",
          HttpStatus.BAD_GATEWAY
        );
      }
      this.logger.warn(
        `上传跟读音频识别查询暂时失败，将继续查询：task=${checkpoint.providerTaskId} code=${audioProviderErrorCode(error) ?? "NETWORK"}`
      );
      const material = await this.requeueUploadedReadAlongRecognition({
        checkpoint: retryCheckpoint,
        job: input.job,
        materialId: input.material.id,
        message: "识别服务暂时无响应，系统会继续查询，无需重新上传音频",
        userId: input.userId
      });

      return { material, status: "DEFERRED" as const };
    }

    if (readAlongAsrProviderStatusFailed(recognized.providerStatus)) {
      throw new AppException(
        50201,
        "上传音频识别任务执行失败，请稍后重新上传",
        HttpStatus.BAD_GATEWAY
      );
    }

    if (recognized.status !== "SUCCEEDED" || !recognized.subtitleText) {
      const pendingCheckpoint: EnglishGuidedStudyReadAlongAsrCheckpoint = {
        ...checkpoint,
        providerStatus: recognized.providerStatus,
        requestId: recognized.requestId ?? checkpoint.requestId,
        lastPolledAt: new Date().toISOString(),
        pollAttempts: checkpoint.pollAttempts + 1,
        transientFailures: 0
      };

      if (pendingCheckpoint.pollAttempts >= englishGuidedStudyReadAlongAsrMaxPollAttempts()) {
        throw new AppException(
          50201,
          "上传音频识别等待时间过长，请稍后重新上传",
          HttpStatus.BAD_GATEWAY
        );
      }
      const material = await this.requeueUploadedReadAlongRecognition({
        checkpoint: pendingCheckpoint,
        job: input.job,
        materialId: input.material.id,
        message: "语音识别仍在处理中，系统会继续查询，无需重新上传音频",
        userId: input.userId
      });

      return { material, status: "DEFERRED" as const };
    }

    return { result: recognized, status: "SUCCEEDED" as const };
  }

  private async saveReadAlongAsrCheckpoint(
    materialId: string,
    userId: string,
    job: EnglishGuidedStudyOperationJob,
    checkpoint: EnglishGuidedStudyReadAlongAsrCheckpoint
  ) {
    await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, materialId);
      const material = await transaction.englishGuidedStudyMaterial.findFirst({
        where: {
          id: materialId,
          userId
        },
        select: {
          content: true
        }
      });
      const content = jsonObject(material?.content);
      const currentJob = englishGuidedStudyJobFromValue<EnglishGuidedStudyReadAlongJobInput>(
        content?.readAlongGenerationJob
      );
      const currentInput = jsonObject(currentJob?.input);

      if (
        !content ||
        !currentJob ||
        !currentInput ||
        currentInput.mode !== "UPLOAD" ||
        !job.attemptId ||
        !englishGuidedStudyAttemptMatches(
          content.readAlongGenerationJob,
          job.jobId,
          job.attemptId
        )
      ) {
        throw new AppException(40901, "当前跟读训练任务已由新的执行器接管", HttpStatus.CONFLICT);
      }

      const updated = await transaction.englishGuidedStudyMaterial.updateMany({
        where: {
          id: materialId,
          userId,
          AND: [
            {
              content: {
                path: ["readAlongGenerationJob", "jobId"],
                equals: job.jobId
              }
            },
            {
              content: {
                path: ["readAlongGenerationJob", "attemptId"],
                equals: job.attemptId
              }
            }
          ]
        },
        data: {
          content: {
            ...content,
            readAlongGenerationJob: {
              ...currentJob,
              input: {
                ...currentInput,
                asrCheckpoint: checkpoint
              }
            }
          } as unknown as Prisma.InputJsonValue
        }
      });

      if (updated.count !== 1) {
        throw new AppException(40901, "当前跟读训练任务已由新的执行器接管", HttpStatus.CONFLICT);
      }
    });
  }

  private async requeueUploadedReadAlongRecognition(input: {
    checkpoint: EnglishGuidedStudyReadAlongAsrCheckpoint | null;
    job: EnglishGuidedStudyOperationJob;
    materialId: string;
    message: string;
    submissionAttempts?: number;
    userId: string;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, input.materialId);
      const material = await transaction.englishGuidedStudyMaterial.findFirst({
        where: {
          id: input.materialId,
          userId: input.userId
        }
      });
      const content = jsonObject(material?.content);
      const currentJob = englishGuidedStudyJobFromValue<EnglishGuidedStudyReadAlongJobInput>(
        content?.readAlongGenerationJob
      );
      const currentInput = jsonObject(currentJob?.input);
      const currentProgress = englishGuidedStudyProgressFromValue(
        content?.readAlongGenerationProgress
      );

      if (
        !content ||
        !currentJob ||
        !currentInput ||
        currentInput.mode !== "UPLOAD" ||
        !currentProgress ||
        !input.job.attemptId ||
        !englishGuidedStudyAttemptMatches(
          content.readAlongGenerationJob,
          input.job.jobId,
          input.job.attemptId
        )
      ) {
        throw new AppException(40901, "当前跟读训练任务已由新的执行器接管", HttpStatus.CONFLICT);
      }

      const now = new Date().toISOString();
      const queuedProgress = updateEnglishGuidedStudyProgress(
        currentProgress,
        {
          status: "QUEUED",
          phase: input.checkpoint ? "WAITING_FOR_ASR" : "RETRYING_ASR_SUBMISSION",
          completed: input.checkpoint ? 50 : 15,
          total: 100,
          message: input.message
        },
        now
      );
      const queuedJob = {
        ...currentJob,
        attemptId: null,
        input: input.checkpoint
          ? {
              ...currentInput,
              asrCheckpoint: input.checkpoint
            }
          : {
              ...currentInput,
              asrSubmissionAttempts: input.submissionAttempts ?? 0
            }
      };
      const updated = await transaction.englishGuidedStudyMaterial.updateMany({
        where: {
          id: input.materialId,
          userId: input.userId,
          AND: [
            {
              content: {
                path: ["readAlongGenerationJob", "jobId"],
                equals: input.job.jobId
              }
            },
            {
              content: {
                path: ["readAlongGenerationJob", "attemptId"],
                equals: input.job.attemptId
              }
            }
          ]
        },
        data: {
          content: {
            ...content,
            readAlongGenerationJob: queuedJob,
            readAlongGenerationProgress: queuedProgress
          } as unknown as Prisma.InputJsonValue
        }
      });

      if (updated.count !== 1) {
        throw new AppException(40901, "当前跟读训练任务已由新的执行器接管", HttpStatus.CONFLICT);
      }

      return transaction.englishGuidedStudyMaterial.findUniqueOrThrow({
        where: {
          id: input.materialId
        }
      });
    });
  }

  private async saveReadAlongGenerationCheckpoint(
    materialId: string,
    userId: string,
    job: EnglishGuidedStudyOperationJob,
    nodes: EnglishReadAlongNode[]
  ) {
    await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, materialId);
      const material = await transaction.englishGuidedStudyMaterial.findFirst({
        where: {
          id: materialId,
          userId
        },
        select: {
          content: true
        }
      });
      const content = jsonObject(material?.content);
      const currentJob = englishGuidedStudyJobFromValue<EnglishGuidedStudyReadAlongJobInput>(
        content?.readAlongGenerationJob
      );
      const currentInput = jsonObject(currentJob?.input);

      if (
        !content ||
        !currentJob ||
        !currentInput ||
        currentInput.mode !== "GENERATE" ||
        !job.attemptId ||
        !englishGuidedStudyAttemptMatches(
          content.readAlongGenerationJob,
          job.jobId,
          job.attemptId
        )
      ) {
        throw new AppException(40901, "当前跟读训练任务已由新的执行器接管", HttpStatus.CONFLICT);
      }

      const checkpointJob = {
        ...currentJob,
        input: {
          ...currentInput,
          generatedNodes: nodes
        }
      };
      const updated = await transaction.englishGuidedStudyMaterial.updateMany({
        where: {
          id: materialId,
          userId,
          AND: [
            {
              content: {
                path: ["readAlongGenerationJob", "jobId"],
                equals: job.jobId
              }
            },
            {
              content: {
                path: ["readAlongGenerationJob", "attemptId"],
                equals: job.attemptId
              }
            }
          ]
        },
        data: {
          content: {
            ...content,
            readAlongGenerationJob: checkpointJob
          } as unknown as Prisma.InputJsonValue
        }
      });

      if (updated.count !== 1) {
        throw new AppException(40901, "当前跟读训练任务已由新的执行器接管", HttpStatus.CONFLICT);
      }
    });
  }

  private async saveContentGenerationCheckpoint(
    materialId: string,
    userId: string,
    job: EnglishGuidedStudyOperationJob,
    batchIndex: number,
    result: ExternalScenarioTextGenerationResult
  ) {
    await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, materialId);
      const material = await transaction.englishGuidedStudyMaterial.findFirst({
        where: {
          id: materialId,
          userId
        },
        select: {
          content: true
        }
      });
      const content = jsonObject(material?.content);
      const currentJob = englishGuidedStudyJobFromValue<EnglishGuidedStudyContentJobInput>(
        content?.contentGenerationJob
      );
      const currentInput = jsonObject(currentJob?.input);

      if (
        !content ||
        !currentJob ||
        !currentInput ||
        !job.attemptId ||
        !englishGuidedStudyAttemptMatches(
          content.contentGenerationJob,
          job.jobId,
          job.attemptId
        )
      ) {
        throw new AppException(40901, "当前英文带学任务已由新的执行器接管", HttpStatus.CONFLICT);
      }

      const checkpoints = englishGuidedStudyContentBatchCheckpoints(currentInput);
      checkpoints.set(batchIndex, {
        batchIndex,
        modelName: result.modelName,
        promptVersion: guidedStudyMaterialPromptVersion(
          guidedStudyScene(currentInput.scene)
        ),
        providerName: result.providerName,
        taskId: result.taskId,
        text: result.text
      });
      const checkpointJob = {
        ...currentJob,
        input: {
          ...currentInput,
          generatedBatches: Array.from(checkpoints.values()).sort(
            (left, right) => left.batchIndex - right.batchIndex
          )
        }
      };
      const updated = await transaction.englishGuidedStudyMaterial.updateMany({
        where: {
          id: materialId,
          userId,
          AND: [
            {
              content: {
                path: ["contentGenerationJob", "jobId"],
                equals: job.jobId
              }
            },
            {
              content: {
                path: ["contentGenerationJob", "attemptId"],
                equals: job.attemptId
              }
            }
          ]
        },
        data: {
          content: {
            ...content,
            contentGenerationJob: checkpointJob
          } as unknown as Prisma.InputJsonValue
        }
      });

      if (updated.count !== 1) {
        throw new AppException(40901, "当前英文带学任务已由新的执行器接管", HttpStatus.CONFLICT);
      }
    });
  }

  private startEnglishGuidedStudyOperationHeartbeat(
    materialId: string,
    operation: EnglishGuidedStudyOperation,
    job: EnglishGuidedStudyOperationJob
  ) {
    let stopped = false;
    let heartbeat = Promise.resolve();
    const interval = setInterval(() => {
      if (stopped) {
        return;
      }

      heartbeat = heartbeat
        .then(() => this.updateEnglishGuidedStudyOperationProgress(
          materialId,
          operation,
          {
            status: "RUNNING"
          },
          job
        ))
        .catch((error: unknown) => {
          this.logger.warn(
            `续租英文带学后台任务失败：${error instanceof Error ? error.message : String(error)}`
          );
        });
    }, englishGuidedStudyHeartbeatMs);
    interval.unref?.();

    return async () => {
      stopped = true;
      clearInterval(interval);
      await heartbeat;
    };
  }

  private async failEnglishGuidedStudyOperation(
    materialId: string,
    config: ReturnType<typeof englishGuidedStudyOperationConfig>,
    job: EnglishGuidedStudyOperationJob,
    errorMessage: string,
    userId: string
  ) {
    const cleanup = await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, materialId);
      const material = await transaction.englishGuidedStudyMaterial.findFirst({
        where: {
          id: materialId,
          userId
        }
      });
      const content = jsonObject(material?.content);

      if (
        !content ||
        !job.attemptId ||
        !englishGuidedStudyAttemptMatches(content[config.jobKey], job.jobId, job.attemptId)
      ) {
        return null;
      }

      const failedProgress = failedEnglishGuidedStudyProgress(
        content[config.progressKey],
        {
          operation: config.operation,
          errorMessage,
          message:
            config.operation === "CONTENT"
              ? "带学文稿生成失败，可以在当前材料上重新生成"
              : config.operation === "PRACTICE"
                ? "练习生成失败，带学文稿不受影响，可以重新生成练习"
                : config.operation === "AUDIO"
                  ? "语音讲解生成失败，可以在当前材料上重新生成"
                  : "跟读训练生成失败，可以重新生成或上传音频",
          now: new Date().toISOString()
        }
      );
      const updated = await transaction.englishGuidedStudyMaterial.updateMany({
        where: {
          id: materialId,
          userId,
          AND: [
            {
              content: {
                path: [config.jobKey, "jobId"],
                equals: job.jobId
              }
            },
            {
              content: {
                path: [config.jobKey, "attemptId"],
                equals: job.attemptId
              }
            }
          ]
        },
        data: {
          content: {
            ...content,
            [config.progressKey]: failedProgress
          } as Prisma.InputJsonValue
        }
      });

      if (updated.count === 1 && config.operation !== "PRACTICE") {
        const readAlongMode = stringValue(jsonObject(job.input)?.mode);
        await this.releaseEnglishGuidedStudyCredits(transaction, {
          note:
            config.operation === "CONTENT"
              ? "英文带学讲稿生成失败，已释放冻结点数"
              : config.operation === "AUDIO"
                ? "英文带学语音讲解生成失败，已释放冻结点数"
                : readAlongMode === "UPLOAD"
                  ? "跟读上传音频识别失败，已释放冻结点数"
                  : "英文跟读音频生成失败，已释放冻结点数",
          operationKey: job.operationKey,
          userId
        });
      }

      return updated.count === 1 && config.operation === "READ_ALOUD"
        ? readAlongJobCleanup(content)
        : null;
    });

    if (cleanup) {
      await this.cleanupReadAlongAudioBestEffort(userId, cleanup);
    }
  }

  private completedEnglishGuidedStudyOperationContent(input: {
    currentContent: unknown;
    generatedContent: Record<string, unknown>;
    job: EnglishGuidedStudyOperationJob;
    operation: EnglishGuidedStudyOperation;
  }) {
    const config = englishGuidedStudyOperationConfig(input.operation);
    const currentContent = jsonObject(input.currentContent);
    const progress = englishGuidedStudyProgressFromValue(currentContent?.[config.progressKey]);
    const currentJob = englishGuidedStudyJobFromValue(currentContent?.[config.jobKey]);

    if (
      !currentContent ||
      !progress ||
      !currentJob ||
      !input.job.attemptId ||
      !englishGuidedStudyAttemptMatches(
        currentContent[config.jobKey],
        input.job.jobId,
        input.job.attemptId
      )
    ) {
      throw new AppException(40901, "当前英文带学任务已由新的执行器接管", HttpStatus.CONFLICT);
    }

    const completedProgress = updateEnglishGuidedStudyProgress(
      progress,
      {
        status: "SUCCEEDED",
        phase: "COMPLETED",
        completed: progress.total,
        total: progress.total,
        message:
          input.operation === "CONTENT"
            ? "已生成"
            : input.operation === "PRACTICE"
              ? "同步练习已生成"
              : input.operation === "AUDIO"
                ? "讲解语音已生成"
                : "跟读训练已生成"
      },
      new Date().toISOString()
    );

    return mergeEnglishGuidedStudyOperationContent(input.generatedContent, {
      job:
        input.operation === "CONTENT"
          ? englishGuidedStudyJobWithoutContentCheckpoints(currentJob)
          : currentJob,
      jobKey: config.jobKey,
      progress: completedProgress,
      progressKey: config.progressKey
    });
  }

  private async recoverEnglishGuidedStudyOperations() {
    if (this.recoveryRunning) {
      return;
    }

    this.recoveryRunning = true;

    try {
      const materials = await this.prisma.englishGuidedStudyMaterial.findMany({
        where: {
          OR: [
            { content: { path: ["contentGenerationProgress", "status"], equals: "QUEUED" } },
            { content: { path: ["contentGenerationProgress", "status"], equals: "RUNNING" } },
            { content: { path: ["practiceGenerationProgress", "status"], equals: "QUEUED" } },
            { content: { path: ["practiceGenerationProgress", "status"], equals: "RUNNING" } },
            { content: { path: ["audioGenerationProgress", "status"], equals: "QUEUED" } },
            { content: { path: ["audioGenerationProgress", "status"], equals: "RUNNING" } },
            { content: { path: ["readAlongGenerationProgress", "status"], equals: "QUEUED" } },
            { content: { path: ["readAlongGenerationProgress", "status"], equals: "RUNNING" } }
          ]
        },
        orderBy: {
          updatedAt: "asc"
        },
        take: 100
      });

      for (const material of materials) {
        await this.recoverStoredEnglishGuidedStudyOperation(material, "CONTENT");
        await this.recoverStoredEnglishGuidedStudyOperation(material, "PRACTICE");
        await this.recoverStoredEnglishGuidedStudyOperation(material, "AUDIO");
        await this.recoverStoredEnglishGuidedStudyOperation(material, "READ_ALOUD");
      }
    } finally {
      this.recoveryRunning = false;
    }
  }

  private async recoverStoredEnglishGuidedStudyOperation(
    material: EnglishGuidedStudyMaterialRecord,
    operation: EnglishGuidedStudyOperation
  ) {
    const config = englishGuidedStudyOperationConfig(operation);
    const content = jsonObject(material.content);
    const progress = englishGuidedStudyProgressFromValue(content?.[config.progressKey]);
    const job = englishGuidedStudyJobFromValue(content?.[config.jobKey]);

    if (
      !content ||
      !progress ||
      !job ||
      job.operation !== operation ||
      !shouldRecoverEnglishGuidedStudyOperation(
        progress,
        new Date().toISOString(),
        englishGuidedStudyRecoveryStaleMs()
      )
    ) {
      return;
    }

    const now = new Date().toISOString();
    const recoveredJob = {
      ...job,
      attemptId: null
    };
    const recoveredProgress = updateEnglishGuidedStudyProgress(
      progress,
      {
        status: "QUEUED",
        phase: "RECOVERED",
        completed: 0,
        message: "后台任务已恢复，正在重新排队执行"
      },
      now
    );
    const recoveredContent = mergeEnglishGuidedStudyOperationContent(content, {
      job: recoveredJob,
      jobKey: config.jobKey,
      progress: recoveredProgress,
      progressKey: config.progressKey
    });
    const updated = await this.prisma.englishGuidedStudyMaterial.updateMany({
      where: {
        id: material.id,
        AND: [
          {
            content: {
              path: [config.jobKey, "jobId"],
              equals: job.jobId
            }
          },
          {
            content: {
              path: [config.progressKey, "updatedAt"],
              equals: progress.updatedAt
            }
          }
        ]
      },
      data: {
        content: recoveredContent as Prisma.InputJsonValue
      }
    });

    if (updated.count === 1) {
      this.scheduleEnglishGuidedStudyOperation(material.id, operation);
    }
  }

  private async cleanupNarrationAudioBestEffort(userId: string, taskIds: string[]) {
    if (taskIds.length === 0) {
      return;
    }

    try {
      await this.audioService.cleanupExternalNarrationAudio(userId, taskIds);
    } catch (error) {
      this.logger.warn(
        `清理英文带学旧语音失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async cleanupUnreferencedReadAlongTasks(
    userId: string,
    materialId: string,
    generatedTaskIds: string[]
  ) {
    if (generatedTaskIds.length === 0) {
      return;
    }

    try {
      const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
        where: {
          id: materialId,
          userId
        },
        select: {
          content: true
        }
      });
      const referencedTaskIds = material
        ? [
            ...readAlongAudioTaskIds(material.content),
            ...readAlongJobCleanup(material.content).taskIds
          ]
        : [];
      await this.cleanupNarrationAudioBestEffort(
        userId,
        unreferencedReadAlongTaskIds(generatedTaskIds, referencedTaskIds)
      );
    } catch (error) {
      this.logger.warn(
        `核对租约冲突后的跟读音频失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async cleanupReadAlongAudioBestEffort(
    userId: string,
    input: {
      audioAssetId?: string | null;
      audioAssetIds?: string[];
      taskIds: string[];
    }
  ) {
    await this.cleanupNarrationAudioBestEffort(userId, input.taskIds);

    const audioAssetIds = Array.from(new Set([
      ...(input.audioAssetIds ?? []),
      ...(input.audioAssetId ? [input.audioAssetId] : [])
    ]));

    for (const audioAssetId of audioAssetIds) {
      try {
        await this.audioService.deleteAudioAsset(userId, audioAssetId);
      } catch (error) {
        this.logger.warn(
          `清理英文跟读上传音频失败：${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  async estimateMaterialAudioGeneration(subject: ProfileSubject, id: string, dto: GenerateEnglishGuidedStudyAudioDto) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    return this.materialAudioBillingEstimate(userId, material, {
      ...dto,
      billingRequestId: optionalEnglishGuidedStudyBillingRequestId(dto.billingRequestId)
    });
  }

  async estimateMaterialScriptUpdate(
    subject: ProfileSubject,
    id: string,
    dto: UpdateEnglishGuidedStudyScriptDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    this.assertEnglishGuidedStudyOperationAvailable(material.content);
    const script = dto.script.trim();

    if (!script) {
      throw new AppException(40001, "带学文本不能为空", HttpStatus.BAD_REQUEST);
    }

    assertEnglishGuidedStudyScriptBaseCurrent(material, dto);

    const edited = buildEditedMaterialContent(material, {
      script,
      sentenceId: dto.sentenceId?.trim() || null,
      targetType: dto.targetType
    });
    const requestId = optionalEnglishGuidedStudyBillingRequestId(dto.billingRequestId);
    const settings = await this.resolveMaterialNarrationVoiceSettings(material);
    const scene = guidedStudyScene(jsonObject(material.content)?.scene);
    const target = {
      sentenceId: dto.sentenceId?.trim() || null,
      targetType: dto.targetType
    };
    const targetDrafts = material.audioUrl && edited.narration !== material.narration
      ? englishGuidedStudyScriptUpdateNarrationDrafts(material, edited, target)
      : [];
    const items = material.audioUrl && edited.narration !== material.narration
      ? englishGuidedStudyAudioBillingItems(
          targetDrafts.map((draft) => draft.script),
          scene
        )
      : [];

    return this.createBillingEstimate(userId, {
      items,
      operation: "ENGLISH_GUIDED_STUDY_TTS",
      requestId,
      revision: englishGuidedStudyScriptAudioRevision(
        material,
        { ...dto, billingRequestId: requestId },
        requestId,
        settings,
        targetDrafts.map((draft) => draft.script)
      ),
      title: guidedStudyScene(jsonObject(material.content)?.scene) === "DAODU"
        ? "更新本段导读讲解音频"
        : "更新本句讲解语音"
    });
  }

  async estimateMaterialReadAlongGeneration(
    subject: ProfileSubject,
    id: string,
    dto: GenerateEnglishGuidedStudyAudioDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    return this.materialReadAlongBillingEstimate(userId, material, {
      ...dto,
      billingRequestId: optionalEnglishGuidedStudyBillingRequestId(dto.billingRequestId)
    });
  }

  async estimateMaterialReadAlongUpload(
    subject: ProfileSubject,
    id: string,
    dto: EstimateEnglishGuidedStudyReadAlongUploadDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    readAlongSourceUnits(material);
    this.assertEnglishGuidedStudyOperationAvailable(material.content);

    return this.materialReadAlongUploadBillingEstimate(userId, material, {
      ...dto,
      billingRequestId: optionalEnglishGuidedStudyBillingRequestId(dto.billingRequestId)
    });
  }

  async listUserMaterials(subject: ProfileSubject, scene?: GuidedStudyScene) {
    const materials = await this.prisma.englishGuidedStudyMaterial.findMany({
      where: englishMaterialSubjectWhere(subject, {
        ...(scene && scene !== "ENGLISH"
          ? { content: { path: ["scene"], equals: scene } }
          : {})
      }),
      orderBy: [
        { pinnedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" }
      ],
      take: scene === "ENGLISH" ? 250 : 50
    });

    return materials
      .map((material) => this.toMaterial(material))
      .filter((material) => scene !== "ENGLISH" || guidedStudyScene(jsonObject(material.content)?.scene) === "ENGLISH")
      .slice(0, 50);
  }

  async listUserMaterialHistory(
    subject: ProfileSubject,
    scene: GuidedStudyScene,
    input: { page?: string; search?: string } = {}
  ) {
    const pageSize = 20;
    const requestedPage = positiveHistoryPage(input.page);
    const search = input.search?.trim().slice(0, 120) ?? "";
    const searchWhere = search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { sourceName: { contains: search, mode: "insensitive" as const } },
            { sourceText: { contains: search, mode: "insensitive" as const } }
          ]
        }
      : {};
    const orderBy = [
      { pinnedAt: { sort: "desc" as const, nulls: "last" as const } },
      { createdAt: "desc" as const }
    ];

    if (scene === "ENGLISH") {
      const candidates = await this.prisma.englishGuidedStudyMaterial.findMany({
        where: englishMaterialSubjectWhere(subject, searchWhere),
        orderBy
      });
      const materials = candidates
        .map((material) => this.toMaterial(material))
        .filter((material) => guidedStudyScene(jsonObject(material.content)?.scene) === "ENGLISH");
      const total = materials.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);

      return {
        items: materials.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total,
        totalPages
      };
    }

    const where = englishMaterialSubjectWhere(subject, {
      content: { path: ["scene"], equals: scene },
      ...searchWhere
    });
    const total = await this.prisma.englishGuidedStudyMaterial.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const materials = await this.prisma.englishGuidedStudyMaterial.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      items: materials.map((material) => this.toMaterial(material)),
      page,
      pageSize,
      total,
      totalPages
    };
  }

  async getUserMaterial(subject: ProfileSubject, id: string) {
    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    return this.toMaterial(material);
  }

  async pinMaterial(subject: ProfileSubject, id: string) {
    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    const updated = await this.prisma.englishGuidedStudyMaterial.update({
      where: { id: material.id },
      data: { pinnedAt: new Date() }
    });

    return this.toMaterial(updated);
  }

  async deleteMaterial(subject: ProfileSubject, id: string) {
    const { userId } = subject;
    const audioCleanup = await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, id);
      const material = await transaction.englishGuidedStudyMaterial.findFirst({
        where: englishMaterialSubjectWhere(subject, { id })
      });

      if (!material) {
        throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
      }

      if (
        isActiveEnglishGuidedStudyProgress(jsonObject(material.content)?.contentGenerationProgress) ||
        isActiveEnglishGuidedStudyProgress(jsonObject(material.content)?.practiceGenerationProgress) ||
        isActiveEnglishGuidedStudyProgress(jsonObject(material.content)?.audioGenerationProgress) ||
        isActiveEnglishGuidedStudyProgress(jsonObject(material.content)?.readAlongGenerationProgress)
      ) {
        throw new AppException(40001, "当前材料正在后台生成，完成后才能删除", HttpStatus.BAD_REQUEST);
      }

      const jobCleanup = readAlongJobCleanup(material.content);
      const taskIds = [
        ...narrationAudioTaskIds(material.content, material.audioTaskId),
        ...readAlongAudioTaskIds(material.content),
        ...jobCleanup.taskIds
      ];
      const audioAssetIds = [
        readAlongAudioAssetId(material.content),
        ...jobCleanup.audioAssetIds
      ].filter((value): value is string => Boolean(value));
      await transaction.englishGuidedStudyMaterial.delete({
        where: { id: material.id }
      });

      return {
        audioAssetIds: Array.from(new Set(audioAssetIds)),
        taskIds: Array.from(new Set(taskIds))
      };
    });
    await this.cleanupReadAlongAudioBestEffort(userId, audioCleanup);

    return {};
  }

  async getPublicMaterial(id: string) {
    const material = await this.prisma.englishGuidedStudyMaterial.findUnique({
      where: {
        id
      }
    });

    if (!material || !material.audioUrl) {
      throw new AppException(40401, "英文带学材料不存在或尚未生成讲解音频", HttpStatus.NOT_FOUND);
    }

    return this.toPublicMaterial(material);
  }

  async updateMaterialScript(subject: ProfileSubject, id: string, dto: UpdateEnglishGuidedStudyScriptDto) {
    const { userId } = subject;
    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: englishMaterialSubjectWhere(subject, { id })
    });

    if (!material) {
      throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
    }

    this.assertEnglishGuidedStudyOperationAvailable(material.content);

    const script = dto.script.trim();

    if (!script) {
      throw new AppException(40001, "带学文本不能为空", HttpStatus.BAD_REQUEST);
    }

    assertEnglishGuidedStudyScriptBaseCurrent(material, dto);

    const edited = buildEditedMaterialContent(material, {
      script,
      sentenceId: dto.sentenceId?.trim() || null,
      targetType: dto.targetType
    });

    if (edited.narration === material.narration) {
      return this.toMaterial(material);
    }

    if (material.audioUrl && edited.narration !== material.narration && !dto.billingConfirmed) {
      throw new AppException(
        40001,
        guidedStudyScene(jsonObject(material.content)?.scene) === "DAODU"
          ? "已有讲解音频，请确认本段音频合成点数后再保存"
          : "已有讲解语音，请确认本句语音合成点数后再保存",
        HttpStatus.BAD_REQUEST
      );
    }

    if (material.audioUrl && edited.narration !== material.narration) {
      return this.updateMaterialScriptWithAudio(subject, material, dto, edited);
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      await this.lockEnglishGuidedStudyMaterial(transaction, material.id);
      const current = await transaction.englishGuidedStudyMaterial.findFirst({
        where: englishMaterialSubjectWhere(subject, { id: material.id })
      });

      if (!current) {
        throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
      }

      this.assertEnglishGuidedStudyOperationAvailable(current.content);
      assertEnglishGuidedStudyScriptBaseCurrent(current, dto);
      const currentEdited = buildEditedMaterialContent(current, {
        script,
        sentenceId: dto.sentenceId?.trim() || null,
        targetType: dto.targetType
      });

      if (currentEdited.narration === current.narration) {
        return { changed: false, cleanupTaskIds: [] as string[], material: current };
      }

      if (current.audioUrl) {
        throw new AppException(
          40001,
          guidedStudyScene(jsonObject(current.content)?.scene) === "DAODU"
            ? "已有讲解音频，请确认本段音频合成点数后再保存"
            : "已有讲解语音，请确认本句语音合成点数后再保存",
          HttpStatus.BAD_REQUEST
        );
      }

      const saved = await transaction.englishGuidedStudyMaterial.update({
        where: { id: current.id },
        data: {
          summary: currentEdited.summary,
          narration: currentEdited.narration,
          audioUrl: null,
          audioTaskId: null,
          content: currentEdited.content
        }
      });

      return {
        changed: true,
        cleanupTaskIds: narrationAudioTaskIds(current.content, current.audioTaskId),
        material: saved
      };
    });
    await this.cleanupNarrationAudioBestEffort(userId, result.cleanupTaskIds);

    if (result.changed) {
      await this.recordCourseMaterialChange(result.material.id);
    }

    return this.toMaterial(result.material);
  }

  private async updateMaterialScriptWithAudio(
    subject: ProfileSubject,
    material: EnglishGuidedStudyMaterialRecord,
    dto: UpdateEnglishGuidedStudyScriptDto,
    edited: ReturnType<typeof buildEditedMaterialContent>
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const billingRequestId = requiredEnglishGuidedStudyBillingRequestId(dto.billingRequestId);
    const estimate = await this.estimateMaterialScriptUpdate(subject, material.id, {
      ...dto,
      billingRequestId
    });
    this.assertBillingConfirmed(dto.billingConfirmed, estimate);

    if (dto.billingRevision?.trim() !== estimate.revision) {
      throw new AppException(40001, "文稿或原语音角色已发生变化，请重新确认本句点数消耗", HttpStatus.BAD_REQUEST);
    }

    const settings = await this.resolveMaterialNarrationVoiceSettings(material);
    const operationKey = `english-guided-study-script-tts:${userId}:${material.id}:${billingRequestId}`;
    const target = {
      sentenceId: dto.sentenceId?.trim() || null,
      targetType: dto.targetType
    };
    const existingNodes = englishGuidedStudyNarrationNodes(material.content);
    const migrateReadingGuideTimeline = guidedStudyScene(jsonObject(material.content)?.scene) === "DAODU"
      && readingGuideTimelineNeedsParagraphMigration(material.content);
    const targetDrafts = englishGuidedStudyScriptUpdateNarrationDrafts(
      material,
      edited,
      target
    );
    const previousTargetTaskIds = existingNodes
      .filter((node) => migrateReadingGuideTimeline || englishGuidedStudyNarrationNodeMatchesTarget(node, target))
      .map((node) => node.audioTaskId);
    const generatedNodes: EnglishNarrationNode[] = [];
    let committed = false;

    await this.prisma.$transaction((transaction) =>
      this.reserveEnglishGuidedStudyCredits(transaction, {
        estimatedCredits: estimate.estimatedCredits,
        note: `带学文稿局部语音合成冻结 ${estimate.estimatedCredits} 点`,
        operationKey,
        userId
      })
    );

    try {
      const attribution = englishTaskAttribution(userId, material.learnerId);

      for (const draft of targetDrafts) {
        const audioTask = await this.audioService.synthesizeTtsForExternalBilling(attribution, {
          text: draft.script,
          voiceAssetId: settings.voiceAssetId,
          voice: settings.voice,
          modelAlias: settings.modelAlias,
          source: "EXPERIENCE",
          speed: settings.speed,
          pitch: settings.pitch,
          volume: settings.volume,
          format: "mp3",
          sampleRate: settings.sampleRate,
          videoGuidePersistence: {
            lessonId: material.id,
            generationId: billingRequestId,
            nodeId: draft.id,
            format: "mp3",
            namespace: "english-guided-study"
          }
        });
        const audioUrl = audioUrlFromTask(audioTask);

        if (!audioUrl) {
          throw new AppException(50001, "本段讲解音频生成失败，请稍后重试", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        generatedNodes.push({
          ...draft,
          audioTaskId: audioTask.id,
          audioUrl,
          durationMs: audioDurationMsFromTask(audioTask) ?? await probeAudioDurationMs(audioUrl)
        });
      }

      const updated = await this.prisma.$transaction(async (transaction) => {
        await this.lockEnglishGuidedStudyMaterial(transaction, material.id);
        const current = await transaction.englishGuidedStudyMaterial.findFirst({
          where: englishMaterialSubjectWhere(subject, { id: material.id })
        });

        if (!current) {
          throw new AppException(40401, "英文带学材料不存在", HttpStatus.NOT_FOUND);
        }

        this.assertEnglishGuidedStudyOperationAvailable(current.content);

        const currentEdited = buildEditedMaterialContent(current, {
          script: dto.script.trim(),
          sentenceId: target.sentenceId,
          targetType: target.targetType
        });
        const currentRevision = englishGuidedStudyScriptAudioRevision(
          current,
          dto,
          billingRequestId,
          settings,
          englishGuidedStudyScriptUpdateNarrationDrafts(
            current,
            currentEdited,
            target
          ).map((draft) => draft.script)
        );

        if (currentRevision !== estimate.revision) {
          throw new AppException(40001, "文稿或原语音角色已发生变化，请重新确认本句点数消耗", HttpStatus.BAD_REQUEST);
        }

        const currentNodes = englishGuidedStudyNarrationNodes(current.content);
        const mergedNodes = guidedStudyScene(jsonObject(current.content)?.scene) === "DAODU"
          && readingGuideTimelineNeedsParagraphMigration(current.content)
          ? generatedNodes
          : replaceEnglishNarrationTargetNodes(currentNodes, generatedNodes, target);
        const firstNode = mergedNodes[0]!;
        const durationSeconds = Math.max(1, Math.ceil(totalNarrationDurationMs(mergedNodes) / 1000));
        const content = {
          ...(jsonObject(currentEdited.content) ?? {}),
          audioUrl: firstNode.audioUrl,
          audioTaskId: firstNode.audioTaskId,
          audioDurationSeconds: durationSeconds,
          narrationTimelineV2: { version: 2, nodes: mergedNodes },
          narrationVoice: settings
        } as unknown as Prisma.InputJsonValue;
        const saved = await transaction.englishGuidedStudyMaterial.update({
          where: { id: current.id },
          data: {
            summary: currentEdited.summary,
            narration: currentEdited.narration,
            audioUrl: firstNode.audioUrl,
            audioTaskId: firstNode.audioTaskId,
            audioDurationSeconds: durationSeconds,
            content
          }
        });

        await this.settleEnglishGuidedStudyCredits(transaction, {
          actualCredits: estimate.estimatedCredits,
          consumeNote: `带学文稿局部语音合成消耗 ${estimate.estimatedCredits} 点`,
          operationKey,
          releaseNote: "带学文稿局部语音合成释放多余冻结点数",
          userId
        });

        return saved;
      });
      committed = true;

      await this.cleanupNarrationAudioBestEffort(userId, previousTargetTaskIds);
      try {
        await this.recordCourseMaterialChange(updated.id);
      } catch (error) {
        this.logger.warn(
          `记录带学文稿更新失败：${error instanceof Error ? error.message : String(error)}`
        );
      }
      return this.toMaterial(updated);
    } catch (error) {
      if (committed) {
        throw error;
      }

      await this.cleanupNarrationAudioBestEffort(
        userId,
        generatedNodes.map((node) => node.audioTaskId)
      );
      await this.prisma.$transaction((transaction) =>
        this.releaseEnglishGuidedStudyCredits(transaction, {
          note: "带学文稿局部语音合成失败，已释放冻结点数",
          operationKey,
          userId
        })
      );
      throw error;
    }
  }

  private async resolveMaterialNarrationVoiceSettings(material: EnglishGuidedStudyMaterialRecord) {
    const storedVoice = jsonObject(jsonObject(material.content)?.narrationVoice);

    if (stringValue(storedVoice?.providerVoiceId) || stringValue(storedVoice?.voiceAssetId)) {
      return englishGuidedStudyNarrationVoiceSettings(material.content);
    }

    const taskId = englishGuidedStudyNarrationNodes(material.content)[0]?.audioTaskId
      ?? material.audioTaskId;
    const task = taskId
      ? await this.prisma.audioTask.findUnique({
          where: { id: taskId },
          select: {
            voiceAssetId: true,
            providerPayload: true
          }
        })
      : null;
    const payload = jsonObject(task?.providerPayload);
    const parameters = jsonObject(payload?.parameters);

    return {
      modelAlias: "tts-default",
      voice: stringValue(payload?.voice) ?? "longanyang",
      voiceAssetId: stringValue(task?.voiceAssetId) ?? undefined,
      speed: numberValue(parameters?.speed) ?? 1,
      pitch: numberValue(parameters?.pitch) ?? undefined,
      volume: numberValue(parameters?.volume) ?? undefined,
      sampleRate: numberValue(parameters?.sampleRate) ?? undefined,
      format: "mp3"
    };
  }

  private async generateMaterialContent(input: GenerateEnglishGuidedStudyContentInput) {
    if (input.scene === "DAODU") {
      return this.generateReadingGuideMaterialContent(input);
    }

    const promptReferenceMaterials = await this.resolvePromptReferenceMaterials(input);
    const languagePolicy = input.scene === "GUSHIWEN"
      ? gushiwenTeachingPolicy(input.levelOptionLabel)
      : englishGuidedStudyLanguagePolicy(input.aiLevel);
    const paragraphGeneration = input.scene !== "GUSHIWEN" && input.explanationMode === "PARAGRAPH";
    const batches = paragraphGeneration
      ? batchEnglishStudySourceSegments(input.sourceSegments, 3_500, 3)
      : batchEnglishStudySourceSegments(input.sourceSegments);
    const contents = new Array<GeneratedMaterialContent>(batches.length);
    const totalSegments = Math.max(1, input.sourceSegments.length);
    let nextBatchIndex = 0;
    let completedSegments = 0;
    let firstError: unknown;
    let progressQueue = Promise.resolve();

    const generateBatch = async (batchIndex: number, sourceSegments: SourceSegment[]) => {
      await input.onProgress?.({
        completed: Math.max(8, Math.round((completedSegments / totalSegments) * 82) + 8),
        message: batches.length > 1
          ? `正在生成第 ${batchIndex + 1}/${batches.length} 批带学文稿`
          : `正在根据${input.scene === "GUSHIWEN" ? "学段年级" : "英语水平"}生成带学文稿`,
        phase: "WRITING",
        total: 100
      });
      const batchLabel = batches.length > 1 ? `第 ${batchIndex + 1}/${batches.length} 部分` : "全文";
      const generate = (policy: string, correctionLabel?: string, repairSegments?: SourceSegment[]) =>
        this.aiService.generateScenarioTextForExternalBilling({
          ...input.attribution,
          scenarioSlug: input.scene === "GUSHIWEN"
            ? "gushiwen-guided-study-material"
            : "english-guided-study-material",
          input: `${input.inputLabel} ${batchLabel}${correctionLabel ? ` ${correctionLabel}` : ""}`,
          maxTokens: Math.min(
            input.maxTokens,
            englishGuidedStudyMaterialMaxTokens(
              (repairSegments ?? sourceSegments).length,
              (repairSegments ?? sourceSegments).reduce((total, segment) => total + segment.text.length, 0)
            )
          ),
          modelInstanceId: input.modelInstanceId,
          variables: {
            title: input.title || "未提供",
            author: input.author ?? "未提供作者",
            authorIntroductionPolicy: guidedStudyAuthorIntroductionPolicy(
              input.author,
              input.authorIntroductionMode,
              input.scene,
              input.levelOptionLabel,
              input.aiLevel
            ),
            sourceType: input.sourceType,
            sourceName: input.sourceName ?? "用户直接输入文本",
            sourceSegmentsJson: JSON.stringify(repairSegments ?? sourceSegments),
            titleAnalysisContext: !repairSegments && batchIndex === 0 && input.title
                ? input.sourceText
                : "当前批次不需要生成标题导语",
            materialScope: repairSegments
              ? `${batchLabel}的正文片段定向补写，只输出当前提供的片段；summary 和 closing 输出空字符串，不重写标题导语或结束语`
              : `${batchLabel}，整份材料共 ${batches.length} 个生成批次`,
            levelStandardName: input.levelStandardName,
            levelOptionLabel: input.levelOptionLabel,
            aiLevel: input.aiLevel,
            levelProfile: input.levelProfile,
            languagePolicy: policy,
            explanationMode: input.explanationMode,
            explanationModeProfile: guidedStudyExplanationModeProfile(input.scene, input.explanationMode),
            referenceMaterialsJson: buildEnglishGuidedStudyReferenceMaterialsJson({
              batchCount: batches.length,
              batchIndex,
              materials: promptReferenceMaterials,
              sourceSegments: repairSegments ?? sourceSegments
            })
          }
        });
      const buildContent = (aiResult: ExternalScenarioTextGenerationResult) =>
        buildGeneratedMaterialContent({
          aiLevel: input.aiLevel,
          author: input.author,
          authorIntroductionMode: input.authorIntroductionMode,
          aiResult,
          batchCount: batches.length,
          batchIndex,
          explanationMode: input.explanationMode,
          levelOptionLabel: input.levelOptionLabel,
          levelStandardName: input.levelStandardName,
          requiredQuestionCount: 0,
          scene: input.scene,
          sourceSegments,
          sourceName: input.sourceName,
          sourceText: input.sourceText,
          sourceType: input.sourceType,
          title: input.title,
          referenceMaterials: input.referenceMaterials
        });

      const checkpoint = input.existingBatchResults?.get(batchIndex);
      let generatedFresh = !checkpoint;
      let aiResult = checkpoint ?? await generate(languagePolicy);
      let content: GeneratedMaterialContent;
      const buildWithValidationCorrections = async (
        result: ExternalScenarioTextGenerationResult,
        activePolicy = languagePolicy
      ) => {
        aiResult = result;
        let persistentCorrectionPolicy = activePolicy;
        let correctionPolicy: string;

        for (let correctionIndex = 0; correctionIndex <= 3; correctionIndex += 1) {
          try {
            return buildContent(aiResult);
          } catch (error) {
            if (correctionIndex === 3) {
              throw error;
            }

            let correctionLabel: string;

            if (error instanceof FormalTitleIntroductionError) {
              correctionLabel = "标题导语纠偏";
              persistentCorrectionPolicy = [
                persistentCorrectionPolicy,
                "硬性纠偏：上一版导语没有完整说出正式英文标题，或只说了标题但没有给出必要解释。",
                "请重新完整生成当前批次的全部 JSON；summary 先完整说出原始英文标题，再用自然语言解释标题的含义、关键表达及其与正文的联系。"
              ].join("\n");
              correctionPolicy = persistentCorrectionPolicy;
            } else if (error instanceof GeneratedCoursewareTitleLeakError) {
              correctionLabel = "标题隔离纠偏";
              persistentCorrectionPolicy = [
                persistentCorrectionPolicy,
                "硬性纠偏：上一版把自动生成的课件标题写进了导语、逐句讲解或结束语。",
                "请重新完整生成当前批次的全部 JSON；课件标题只写入 title 字段，教学文稿中不得提及或解读它。"
              ].join("\n");
              correctionPolicy = persistentCorrectionPolicy;
            } else if (isRetryableEnglishGuidedStudyMaterialValidationError(error)) {
              correctionLabel = "结构纠偏";
              correctionPolicy = englishGuidedStudyStructureRecoveryPolicy(
                persistentCorrectionPolicy,
                error
              );
            } else {
              throw error;
            }

            generatedFresh = true;
            aiResult = await generate(correctionPolicy, correctionLabel);
          }
        }

        throw incompleteAiMaterialException();
      };

      try {
        content = await buildWithValidationCorrections(aiResult);
      } catch (error) {
        if (!isRetryableEnglishGuidedStudyMaterialValidationError(error)) {
          throw error;
        }

        generatedFresh = true;
        aiResult = await generate(
          englishGuidedStudyStructureRecoveryPolicy(languagePolicy, error),
          "结构纠偏"
        );
        content = await buildWithValidationCorrections(aiResult);
      }

      if (paragraphGeneration) {
        for (const sourceSegment of sourceSegments) {
          let sentence = content.sentences.find((item) => item.id === sourceSegment.id)!;
          let validationFeedback = "";

          for (let attempt = 0; attempt < 2 && !englishGuidedStudyHasEnoughChinese([sentence], input.aiLevel); attempt += 1) {
            await input.onProgress?.({
              completed: Math.min(90, 8 + Math.round((completedSegments / totalSegments) * 82)),
              message: `正在补充第 ${input.sourceSegments.indexOf(sourceSegment) + 1} 段的中文讲解`,
              phase: "WRITING",
              total: 100
            });
            const correctionPolicy = [
              languagePolicy,
              englishGuidedStudyParagraphRepairPolicy(sentence, input.aiLevel),
              validationFeedback
            ].filter(Boolean).join("\n");
            generatedFresh = true;
            const repairResult = await generate(correctionPolicy, "段落中文定向补写", [sourceSegment]);

            try {
              const repaired = normalizeGeneratedSentences(
                parseAiMaterialObject(repairResult.text).sentences,
                [sourceSegment],
                input.scene
              )[0]!;
              sentence = repaired;
              if (!englishGuidedStudyHasEnoughChinese([repaired], input.aiLevel)) {
                continue;
              }

              // Rebuild timing and narration from the merged scripts without rewriting accepted sections.
              const mergedResult = {
                ...repairResult,
                text: JSON.stringify({
                  ...parseAiMaterialObject(aiResult.text),
                  narration: undefined,
                  sentences: content.sentences.map((current) => {
                    const next = current.id === repaired.id ? repaired : current;
                    return { segmentId: next.id, script: next.script, points: next.points };
                  })
                })
              };
              content = buildContent(mergedResult);
              aiResult = mergedResult;
            } catch (error) {
              if (!isRetryableEnglishGuidedStudyMaterialValidationError(error) && !(error instanceof GeneratedCoursewareTitleLeakError)) {
                throw error;
              }
              sentence = content.sentences.find((item) => item.id === sourceSegment.id)!;
              validationFeedback = error instanceof GeneratedCoursewareTitleLeakError
                ? "课件自动标题不得出现在正文讲解中。"
                : englishGuidedStudyStructureRecoveryPolicy("只修复当前提供的段落，返回合法 JSON。", error);
            }
          }

          if (!englishGuidedStudyHasEnoughChinese([content.sentences.find((item) => item.id === sourceSegment.id)!], input.aiLevel)) {
            throw new AppException(
              50201,
              `AI 部分段落缺少符合当前英语水平的中文讲解（第 ${input.sourceSegments.indexOf(sourceSegment) + 1} 段），自动补写后仍未达标，请重新生成`,
              HttpStatus.BAD_GATEWAY
            );
          }
        }
      } else if (input.scene !== "GUSHIWEN" && !englishGuidedStudyHasEnoughChinese(content.sentences, input.aiLevel)) {
        const detectedShare = Math.round(englishGuidedStudyChineseShare(content.sentences) * 100);
        const correctionPolicy = [
          languagePolicy,
          `硬性纠偏：上一版 sentences.script 检测到的中文支持约为 ${detectedShare}%，明显低于当前等级要求。`,
          "请重新完整生成当前批次的全部 JSON；先用中文完成必要教学脚手架，再加入符合等级的英文释义和例句。",
          "逐段讲解时逐句补足理解、必要词汇和语法，不能只复制或删节原文；points 中的中文不计入比例。校验反馈和片段编号不得写入文稿。"
        ].join("\n");
        generatedFresh = true;
        aiResult = await generate(correctionPolicy, "语言比例纠偏");
        content = await buildWithValidationCorrections(aiResult, correctionPolicy);

        // Sentence-mode batches retain the combined-lesson tolerance below.
      }

      if (generatedFresh) {
        await input.onBatchCompleted?.(batchIndex, aiResult);
      }
      contents[batchIndex] = content;
      completedSegments += sourceSegments.length;
      const completed = Math.min(90, 8 + Math.round((completedSegments / totalSegments) * 82));
      const message = batches.length > 1
        ? `已完成 ${completedSegments}/${totalSegments} 句，正在继续生成`
        : "带学文稿已生成，正在校验全文覆盖";
      const phase = completedSegments >= totalSegments ? "VALIDATING" : "WRITING";
      progressQueue = progressQueue.then(() => input.onProgress?.({
        completed,
        message,
        phase,
        total: 100
      }));
      await progressQueue;
    };

    const worker = async () => {
      while (!firstError) {
        const batchIndex = nextBatchIndex;
        nextBatchIndex += 1;

        if (batchIndex >= batches.length) {
          return;
        }

        try {
          await generateBatch(batchIndex, batches[batchIndex] ?? []);
        } catch (error) {
          firstError ??= error;
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(englishGuidedStudyGenerationConcurrency, batches.length) },
        () => worker()
      )
    );

    if (firstError) {
      throw firstError;
    }

    const combined = combineGeneratedMaterialContents(input, contents);

    if (input.scene !== "GUSHIWEN" && !englishGuidedStudyHasEnoughChinese(combined.sentences, input.aiLevel)) {
      throw new AppException(
        50201,
        "AI 未按当前英语水平生成足够的中文讲解（全文），请重试或在后台配置更强的聊天模型",
        HttpStatus.BAD_GATEWAY
      );
    }

    return combined;
  }

  private async generateReadingGuideMaterialContent(input: GenerateEnglishGuidedStudyContentInput) {
    const durationMinutes = readingGuideDuration(input.durationMinutes);
    const targetCharacters = durationMinutes * 180;
    const referenceMaterialsJson = buildEnglishGuidedStudyReferenceMaterialsJson({
      batchCount: 1,
      batchIndex: 0,
      materials: input.referenceMaterials,
      sourceSegments: input.sourceSegments
    });

    await input.onProgress?.({
      completed: 12,
      message: "正在分析阅读内容和适合当前学段的导读方向",
      phase: "ANALYZING",
      total: 100
    });
    const checkpoint = input.existingBatchResults?.get(0);
    const aiResult = checkpoint ?? await this.aiService.generateScenarioTextForExternalBilling({
      ...input.attribution,
      scenarioSlug: "daodu",
      input: `${input.inputLabel} 开卷导读`,
      maxTokens: input.maxTokens,
      modelInstanceId: input.modelInstanceId,
      variables: {
        title: input.title || "未提供标题",
        sourceName: input.sourceName ?? "用户直接输入文本",
        sourceText: input.sourceText,
        levelOptionLabel: input.levelOptionLabel,
        levelProfile: input.levelProfile,
        durationMinutes: String(durationMinutes),
        targetCharacters: String(targetCharacters),
        referenceMaterialsJson
      }
    });

    if (!checkpoint) {
      await input.onBatchCompleted?.(0, aiResult);
    }

    await input.onProgress?.({
      completed: 90,
      message: "完整导读文稿已生成，正在校验篇幅和保存结果",
      phase: "VALIDATING",
      total: 100
    });

    return buildReadingGuideGeneratedMaterialContent(input, aiResult, durationMinutes);
  }

  private async resolvePromptReferenceMaterials(input: GenerateEnglishGuidedStudyContentInput) {
    if (input.scene !== "GUSHIWEN" || input.referenceMaterials.length > 0) {
      return input.referenceMaterials;
    }

    try {
      const material = await fetchBaiduHanyuGushiwenReference({
        author: input.author,
        sourceText: input.sourceText,
        title: input.title
      });
      return material ? [material] : [];
    } catch (error) {
      this.logger.warn(
        `百度汉语参考资料获取失败，继续使用原流程：${error instanceof Error ? error.message : "未知错误"}`
      );
      return [];
    }
  }

  private async materialAudioBillingEstimate(
    userId: string,
    material: EnglishGuidedStudyMaterialRecord,
    dto: GenerateEnglishGuidedStudyAudioDto
  ) {
    const billingRequestId = requiredEnglishGuidedStudyBillingRequestId(dto.billingRequestId);
    const scene = guidedStudyScene(jsonObject(material.content)?.scene);
    const narrationTexts = englishGuidedStudyMaterialNarrationDrafts(material)
      .map((node) => node.script);

    return this.createBillingEstimate(userId, {
      items: englishGuidedStudyAudioBillingItems(
        narrationTexts,
        scene
      ),
      operation: "ENGLISH_GUIDED_STUDY_TTS",
      requestId: billingRequestId,
      revision: englishGuidedStudyAudioBillingRevision({
        ...dto,
        billingRequestId,
        materialId: material.id,
        narration: narrationTexts
      }),
      title: scene === "DAODU"
        ? "生成开卷导读讲解音频"
        : scene === "GUSHIWEN"
          ? "生成古诗文带学语音讲解"
          : "生成英文带学语音讲解"
    });
  }

  private async materialReadAlongBillingEstimate(
    userId: string,
    material: EnglishGuidedStudyMaterialRecord,
    dto: GenerateEnglishGuidedStudyAudioDto
  ) {
    const billingRequestId = requiredEnglishGuidedStudyBillingRequestId(dto.billingRequestId);
    const sourceTexts = readAlongSourceUnits(material).map((unit) => unit.text);

    return this.createBillingEstimate(userId, {
      items: englishGuidedStudyReadAlongBillingItems(sourceTexts),
      operation: "ENGLISH_GUIDED_STUDY_TTS",
      requestId: billingRequestId,
      revision: englishGuidedStudyReadAlongBillingRevision({
        ...dto,
        billingRequestId,
        materialId: material.id,
        narration: sourceTexts
      }),
      title: "生成全文诵读音频"
    });
  }

  private async materialReadAlongUploadBillingEstimate(
    userId: string,
    material: EnglishGuidedStudyMaterialRecord,
    dto: EstimateEnglishGuidedStudyReadAlongUploadDto & { billingRequestId: string }
  ) {
    return this.createBillingEstimate(userId, {
      items: englishGuidedStudyReadAlongUploadBillingItems(dto.audioDurationMs),
      operation: "ENGLISH_GUIDED_STUDY_ASR",
      requestId: dto.billingRequestId,
      revision: englishGuidedStudyReadAlongUploadBillingRevision({
        ...dto,
        materialId: material.id
      }),
      title: "上传跟读音频"
    });
  }

  private async createBillingEstimate(
    userId: string,
    input: {
      items: EnglishGuidedStudyBillingItem[];
      operation: EnglishGuidedStudyBillingEstimate["operation"];
      requestId: string;
      revision: string;
      title: string;
    }
  ): Promise<EnglishGuidedStudyBillingEstimate> {
    const wallet = await getPersonalCreditBalance(this.prisma, userId);
    const estimatedCredits = input.items.reduce((sum, item) => sum + item.estimatedCredits, 0);

    return {
      availableCredits: wallet.availableCredits,
      enoughCredits: wallet.availableCredits >= estimatedCredits,
      estimatedCredits,
      items: input.items,
      operation: input.operation,
      requestId: input.requestId,
      revision: input.revision,
      title: input.title
    };
  }

  private assertBillingConfirmed(confirmed: boolean | undefined, estimate: EnglishGuidedStudyBillingEstimate) {
    if (!confirmed) {
      const consumptionLabel = ["ENGLISH_GUIDED_STUDY_ASR", "ENGLISH_GUIDED_STUDY_TTS"].includes(
        estimate.operation
      )
        ? "本次消耗"
        : "本次预计消耗";
      throw new AppException(40001, `请先确认${consumptionLabel} ${estimate.estimatedCredits} 点`, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureWallet(transaction: Prisma.TransactionClient, userId: string) {
    await transaction.wallet.upsert({
      where: {
        userId
      },
      update: {},
      create: {
        userId
      }
    });
  }

  private async lockEnglishGuidedStudyBillingOperation(
    transaction: Prisma.TransactionClient,
    operationKey: string
  ) {
    await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`billing:${operationKey}`}))`;
  }

  private async lockEnglishGuidedStudyMaterial(
    transaction: Prisma.TransactionClient,
    materialId: string
  ) {
    await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`english-guided-study:${materialId}`}))`;
  }

  private assertEnglishGuidedStudyOperationAvailable(contentValue: unknown) {
    const content = jsonObject(contentValue);
    const activeProgress = [
      content?.contentGenerationProgress,
      content?.practiceGenerationProgress,
      content?.audioGenerationProgress,
      content?.readAlongGenerationProgress
    ].find(isActiveEnglishGuidedStudyProgress);

    if (activeProgress) {
      throw new AppException(
        40001,
        "当前材料已有后台生成任务，请等待完成后再操作",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private async reserveEnglishGuidedStudyCredits(
    transaction: Prisma.TransactionClient,
    input: {
      estimatedCredits: number;
      note: string;
      operationKey: string;
      userId: string;
    }
  ) {
    const credits = Math.max(0, Math.ceil(input.estimatedCredits));

    await this.lockEnglishGuidedStudyBillingOperation(transaction, input.operationKey);
    const reserveKey = `${input.operationKey}:reserve`;
    const existing = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey: reserveKey
      }
    });

    if (existing) {
      throw new AppException(40901, "该次生成请求已提交，请勿重复操作", HttpStatus.CONFLICT);
    }

    if (credits <= 0) {
      await this.ensureWallet(transaction, input.userId);
      const wallet = await getPersonalWallet(transaction, input.userId);
      await transaction.ledgerEntry.create({
        data: {
          userId: input.userId,
          type: "RESERVE",
          amount: 0,
          balanceAfter: wallet.availableCredits,
          relatedTaskType: "ENGLISH_GUIDED_STUDY",
          idempotencyKey: reserveKey,
          note: input.note
        }
      });
      return;
    }

    await this.ensureWallet(transaction, input.userId);
    const wallet = await reservePersonalCredits(transaction, input.userId, input.operationKey, credits);

    await transaction.ledgerEntry.create({
      data: {
        userId: input.userId,
        type: "RESERVE",
        amount: -credits,
        balanceAfter: wallet.availableCredits,
        relatedTaskType: "ENGLISH_GUIDED_STUDY",
        idempotencyKey: reserveKey,
        note: input.note
      }
    });
  }

  private async settleEnglishGuidedStudyCredits(
    transaction: Prisma.TransactionClient,
    input: {
      actualCredits?: number;
      consumeNote: string;
      operationKey: string;
      releaseNote: string;
      userId: string;
    }
  ) {
    await this.lockEnglishGuidedStudyBillingOperation(transaction, input.operationKey);
    const consumeKey = `${input.operationKey}:consume`;
    const releaseKey = `${input.operationKey}:release`;
    const failureReleaseKey = `${input.operationKey}:release-failed`;
    const [consumed, released, failedRelease, reserve] = await Promise.all([
      transaction.ledgerEntry.findUnique({ where: { idempotencyKey: consumeKey } }),
      transaction.ledgerEntry.findUnique({ where: { idempotencyKey: releaseKey } }),
      transaction.ledgerEntry.findUnique({ where: { idempotencyKey: failureReleaseKey } }),
      transaction.ledgerEntry.findUnique({ where: { idempotencyKey: `${input.operationKey}:reserve` } })
    ]);

    if (consumed || released || failedRelease || !reserve || reserve.amount >= 0) {
      return;
    }

    const reservedCredits = Math.abs(reserve.amount);
    const actualCredits = Math.min(
      Math.max(0, Math.ceil(input.actualCredits ?? reservedCredits)),
      reservedCredits
    );
    const releaseCredits = reservedCredits - actualCredits;
    const wallet = await settlePersonalCredits(transaction, input.userId, input.operationKey, reservedCredits, actualCredits);

    if (actualCredits > 0) {
      await transaction.ledgerEntry.create({
        data: {
          userId: input.userId,
          type: "CONSUME",
          amount: -actualCredits,
          balanceAfter: wallet.availableCredits,
          relatedTaskType: "ENGLISH_GUIDED_STUDY",
          idempotencyKey: consumeKey,
          note: input.consumeNote
        }
      });
    }

    if (releaseCredits > 0) {
      await transaction.ledgerEntry.create({
        data: {
          userId: input.userId,
          type: "RELEASE",
          amount: releaseCredits,
          balanceAfter: wallet.availableCredits,
          relatedTaskType: "ENGLISH_GUIDED_STUDY",
          idempotencyKey: releaseKey,
          note: input.releaseNote
        }
      });
    }
  }

  private async releaseEnglishGuidedStudyCredits(
    transaction: Prisma.TransactionClient,
    input: {
      note: string;
      operationKey: string;
      userId: string;
    }
  ) {
    await this.lockEnglishGuidedStudyBillingOperation(transaction, input.operationKey);
    const releaseKey = `${input.operationKey}:release-failed`;
    const [released, consumed, settledRelease, reserve] = await Promise.all([
      transaction.ledgerEntry.findUnique({ where: { idempotencyKey: releaseKey } }),
      transaction.ledgerEntry.findUnique({ where: { idempotencyKey: `${input.operationKey}:consume` } }),
      transaction.ledgerEntry.findUnique({ where: { idempotencyKey: `${input.operationKey}:release` } }),
      transaction.ledgerEntry.findUnique({ where: { idempotencyKey: `${input.operationKey}:reserve` } })
    ]);

    if (released || consumed || settledRelease || !reserve || reserve.amount >= 0) {
      return;
    }

    const reservedCredits = Math.abs(reserve.amount);
    const wallet = await settlePersonalCredits(transaction, input.userId, input.operationKey, reservedCredits, 0);

    await transaction.ledgerEntry.create({
      data: {
        userId: input.userId,
        type: "RELEASE",
        amount: reservedCredits,
        balanceAfter: wallet.availableCredits,
        relatedTaskType: "ENGLISH_GUIDED_STUDY",
        idempotencyKey: releaseKey,
        note: input.note
      }
    });
  }

  private runBackgroundTask(label: string, task: () => Promise<void>) {
    void task().catch((error: unknown) => {
      this.logger.error(`${label}失败`, error instanceof Error ? error.stack : String(error));
    });
  }

  private async recoverExpiredEnglishGuidedStudyCredits() {
    if (this.creditRecoveryRunning) {
      return;
    }

    this.creditRecoveryRunning = true;
    const expiredBefore = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    let cursorId: string | undefined;

    try {
      while (true) {
        const reserves = await this.prisma.ledgerEntry.findMany({
          where: {
            createdAt: {
              lt: expiredBefore
            },
            relatedTaskType: "ENGLISH_GUIDED_STUDY",
            type: "RESERVE"
          },
          orderBy: [
            { createdAt: "asc" },
            { id: "asc" }
          ],
          select: {
            id: true,
            idempotencyKey: true,
            userId: true
          },
          take: 100,
          ...(cursorId
            ? {
                cursor: { id: cursorId },
                skip: 1
              }
            : {})
        });
        const operationKeys = new Map(
          reserves.flatMap((reserve) =>
            reserve.idempotencyKey.endsWith(":reserve")
              ? [[reserve.id, reserve.idempotencyKey.slice(0, -":reserve".length)] as const]
              : []
          )
        );
        const settlementSuffixes = ["consume", "release", "release-failed"] as const;
        const settlementKeys = Array.from(operationKeys.values()).flatMap((operationKey) =>
          settlementSuffixes.map((suffix) => `${operationKey}:${suffix}`)
        );
        const settledEntries = settlementKeys.length > 0
          ? await this.prisma.ledgerEntry.findMany({
              where: {
                idempotencyKey: {
                  in: settlementKeys
                }
              },
              select: {
                idempotencyKey: true
              }
            })
          : [];
        const settledKeys = new Set(settledEntries.map((entry) => entry.idempotencyKey));

        for (const reserve of reserves) {
          const operationKey = operationKeys.get(reserve.id);

          if (
            !operationKey
            || settlementSuffixes.some((suffix) => settledKeys.has(`${operationKey}:${suffix}`))
          ) {
            continue;
          }

          if (await this.hasActiveEnglishGuidedStudyBillingOperation(operationKey)) {
            continue;
          }

          await this.prisma.$transaction((transaction) =>
            this.releaseEnglishGuidedStudyCredits(transaction, {
              note: "英文带学生成超时或服务中断，已自动释放冻结点数",
              operationKey,
              userId: reserve.userId
            })
          );
        }

        if (reserves.length < 100) {
          break;
        }

        cursorId = reserves[reserves.length - 1]?.id;

        if (!cursorId) {
          break;
        }
      }
    } finally {
      this.creditRecoveryRunning = false;
    }
  }

  private async hasActiveEnglishGuidedStudyBillingOperation(operationKey: string) {
    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({
      where: {
        OR: [
          {
            content: {
              path: ["contentGenerationJob", "operationKey"],
              equals: operationKey
            }
          },
          {
            content: {
              path: ["audioGenerationJob", "operationKey"],
              equals: operationKey
            }
          },
          {
            content: {
              path: ["readAlongGenerationJob", "operationKey"],
              equals: operationKey
            }
          }
        ]
      },
      select: {
        content: true
      }
    });
    const content = jsonObject(material?.content);

    if (!content) {
      return false;
    }

    return [
      {
        job: englishGuidedStudyJobFromValue(content.contentGenerationJob),
        progress: content.contentGenerationProgress
      },
      {
        job: englishGuidedStudyJobFromValue(content.practiceGenerationJob),
        progress: content.practiceGenerationProgress
      },
      {
        job: englishGuidedStudyJobFromValue(content.audioGenerationJob),
        progress: content.audioGenerationProgress
      },
      {
        job: englishGuidedStudyJobFromValue(content.readAlongGenerationJob),
        progress: content.readAlongGenerationProgress
      }
    ].some(({ job, progress }) =>
      job?.operationKey === operationKey && isActiveEnglishGuidedStudyProgress(progress)
    );
  }

  private toMaterial(material: EnglishGuidedStudyMaterialRecord) {
    const pendingDraft = pendingEnglishGuidedStudyMaterialDraft(material);
    const title = pendingDraft?.title ?? material.title;
    const sourceText = pendingDraft?.sourceText ?? material.sourceText;
    const content = currentReadAlongContent({
      title,
      sourceText,
      content: pendingDraft?.content ?? material.content
    });

    return {
      id: material.id,
      userId: material.userId,
      learnerId: material.learnerId,
      title,
      sourceType: pendingDraft?.sourceType ?? material.sourceType,
      sourceName: pendingDraft?.sourceName ?? material.sourceName,
      sourceText,
      levelStandardName: pendingDraft?.levelStandardName ?? material.levelStandardName,
      levelOptionLabel: pendingDraft?.levelOptionLabel ?? material.levelOptionLabel,
      aiLevel: pendingDraft?.aiLevel ?? material.aiLevel,
      summary: material.summary,
      narration: material.narration,
      audioUrl: material.audioUrl,
      audioTaskId: material.audioTaskId,
      audioDurationSeconds: material.audioDurationSeconds,
      content,
      pinnedAt: material.pinnedAt,
      createdAt: material.createdAt,
      updatedAt: material.updatedAt
    };
  }

  private toPublicMaterial(material: EnglishGuidedStudyMaterialRecord) {
    const currentContent = currentReadAlongContent(material);
    const projected = projectPublicCourseMaterial(
      "ENGLISH_GUIDED_STUDY",
      {
        ...material,
        content: currentContent
      }
    );
    const content = {
      ...projected,
      id: material.id,
      title: material.title,
      sourceText: material.sourceText,
      level: projected.level ?? {
        standardName: material.levelStandardName,
        optionLabel: material.levelOptionLabel,
        aiLevel: material.aiLevel
      },
      sentences: projected.sentences ?? [],
      questions: projected.questions ?? [],
      audioDurationSeconds: material.audioDurationSeconds
    };

    return {
      id: material.id,
      title: material.title,
      sourceType: material.sourceType,
      sourceName: material.sourceName,
      sourceText: material.sourceText,
      levelStandardName: material.levelStandardName,
      levelOptionLabel: material.levelOptionLabel,
      aiLevel: material.aiLevel,
      summary: material.summary,
      narration: material.narration,
      audioUrl: material.audioUrl,
      audioDurationSeconds: material.audioDurationSeconds,
      content,
      createdAt: material.createdAt
    };
  }
}

function pendingEnglishGuidedStudyMaterialDraft(
  material: EnglishGuidedStudyMaterialRecord
) {
  const content = jsonObject(material.content);
  const progress = jsonObject(content?.contentGenerationProgress);
  const status = stringValue(progress?.status);

  if (!content || !status || !["QUEUED", "RUNNING", "FAILED"].includes(status)) {
    return null;
  }

  const job = englishGuidedStudyJobFromValue<EnglishGuidedStudyContentJobInput>(
    content.contentGenerationJob
  );
  const input = jsonObject(job?.input);
  const sourceType =
    input?.sourceType === "TEXT" || input?.sourceType === "IMAGE"
      ? input.sourceType
      : null;
  const sourceText = stringValue(input?.sourceText);
  const levelStandardName = stringValue(input?.levelStandardName);
  const levelOptionLabel = stringValue(input?.levelOptionLabel);
  const aiLevel = stringValue(input?.aiLevel);

  if (
    !input ||
    !sourceType ||
    !sourceText ||
    !levelStandardName ||
    !levelOptionLabel ||
    !aiLevel
  ) {
    return null;
  }

  const contentTitle = typeof input.title === "string" ? input.title : "";
  const author = stringValue(input.author);
  const authorIntroductionMode = englishGuidedStudyAuthorIntroductionMode(
    input.authorIntroductionMode
  );
  const sourceName = stringValue(input.sourceName);
  const explanationMode = englishGuidedStudyExplanationMode(input.explanationMode);
  const referenceMaterials = referenceMaterialsFromValue(input.referenceMaterials);

  return {
    title: guidedStudyCoursewareTitle(contentTitle, sourceText, guidedStudyScene(input.scene)),
    author,
    authorIntroductionMode,
    sourceType,
    sourceName,
    sourceText,
    levelStandardName,
    levelOptionLabel,
    aiLevel,
    content: {
      ...content,
      scene: guidedStudyScene(input.scene),
      title: guidedStudyCoursewareTitle(contentTitle, sourceText, guidedStudyScene(input.scene)),
      contentTitle: contentTitle || null,
      author,
      authorIntroductionMode,
      sourceType,
      sourceName,
      sourceText,
      referenceMaterials,
      level: {
        standardName: levelStandardName,
        optionLabel: levelOptionLabel,
        aiLevel
      },
      explanationMode
    } as unknown as Prisma.JsonValue
  };
}

function englishMaterialSubjectWhere(subject: ProfileSubject, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    userId: subject.userId,
    ...(subject.mode === "LEARNER" ? { learnerId: subject.learnerId } : {})
  };
}

function positiveHistoryPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function englishGuidedStudyScriptTargetKey(
  targetType: "INTRO" | "SENTENCE" | "SUMMARY",
  sentenceId?: string
) {
  return targetType === "SENTENCE" ? `sentence:${sentenceId?.trim() || ""}` : targetType.toLowerCase();
}

function englishGuidedStudyNarrationVoiceSettings(contentValue: unknown) {
  const voice = jsonObject(jsonObject(contentValue)?.narrationVoice);

  return {
    modelAlias: stringValue(voice?.modelAlias) ?? "tts-default",
    voice: stringValue(voice?.providerVoiceId) ?? "longanyang",
    voiceAssetId: stringValue(voice?.voiceAssetId) ?? undefined,
    speed: numberValue(voice?.speed) ?? 1,
    pitch: numberValue(voice?.pitch) ?? undefined,
    volume: numberValue(voice?.volume) ?? undefined,
    sampleRate: numberValue(voice?.sampleRate) ?? undefined,
    format: "mp3"
  };
}

function englishGuidedStudyScriptAudioRevision(
  material: EnglishGuidedStudyMaterialRecord,
  dto: UpdateEnglishGuidedStudyScriptDto,
  billingRequestId: string,
  settings: ReturnType<typeof englishGuidedStudyNarrationVoiceSettings>,
  narrationTexts: readonly string[]
) {
  const target = {
    sentenceId: dto.sentenceId?.trim() || null,
    targetType: dto.targetType
  };
  const targetNodes = englishGuidedStudyNarrationNodes(material.content)
    .filter((node) => englishGuidedStudyNarrationNodeMatchesTarget(node, target))
    .map((node) => [node.id, node.script, node.audioTaskId]);
  const fallbackScript = englishGuidedStudyTargetScript(material, target);
  const targetRevision = targetNodes.length > 0
    ? JSON.stringify(targetNodes)
    : JSON.stringify([[englishGuidedStudyScriptTargetKey(dto.targetType, dto.sentenceId), fallbackScript, material.audioTaskId ?? ""]]);

  return englishGuidedStudyAudioBillingRevision({
    ...settings,
    billingRequestId,
    materialId: `${material.id}:${englishGuidedStudyScriptTargetKey(dto.targetType, dto.sentenceId)}:${targetRevision}`,
    narration: narrationTexts
  });
}

function englishGuidedStudyTargetScript(
  material: EnglishGuidedStudyMaterialRecord,
  target: { sentenceId: string | null; targetType: "INTRO" | "SENTENCE" | "SUMMARY" }
): string {
  if (target.targetType === "INTRO") {
    return stringValue(material.summary) ?? "";
  }

  if (target.targetType === "SUMMARY") {
    return stringValue(jsonObject(material.content)?.closing)?.trim() || defaultEnglishGuidedStudyClosing();
  }

  if (guidedStudyScene(jsonObject(material.content)?.scene) === "DAODU") {
    const paragraphIndex = readingGuideParagraphIndex(target.sentenceId);
    return paragraphIndex === null
      ? ""
      : splitReadingGuideParagraphs(material.narration)[paragraphIndex] ?? "";
  }

  const sentence = editableContentSentences(jsonObject(material.content)?.sentences)
    .find((candidate) => stringValue(candidate.id) === target.sentenceId);

  return stringValue(sentence?.script)?.trim() || stringValue(sentence?.explanation)?.trim() || "";
}

function readingGuideParagraphIndex(sentenceId: string | null) {
  const match = sentenceId?.match(/^reading-guide-p([1-9]\d*)$/u);
  return match ? Number(match[1]) - 1 : null;
}

function assertEnglishGuidedStudyScriptBaseCurrent(
  material: EnglishGuidedStudyMaterialRecord,
  dto: UpdateEnglishGuidedStudyScriptDto
) {
  const currentScript = englishGuidedStudyTargetScript(material, {
    sentenceId: dto.sentenceId?.trim() || null,
    targetType: dto.targetType
  }).trim();

  if (currentScript !== dto.originalScript.trim()) {
    throw new AppException(40901, "当前文稿已发生变化，请刷新后再编辑", HttpStatus.CONFLICT);
  }
}

function englishGuidedStudyNarrationNodes(contentValue: unknown) {
  const timeline = jsonObject(jsonObject(contentValue)?.narrationTimelineV2);
  const nodes = Array.isArray(timeline?.nodes) ? timeline.nodes : [];

  return nodes.filter((value): value is EnglishNarrationNode => {
    const node = jsonObject(value);
    return Boolean(
      node &&
      stringValue(node.id) &&
      stringValue(node.script) &&
      stringValue(node.audioTaskId) &&
      stringValue(node.audioUrl) &&
      numberValue(node.durationMs) !== null
    );
  });
}

function readingGuideTimelineNeedsParagraphMigration(contentValue: unknown) {
  const nodes = englishGuidedStudyNarrationNodes(contentValue);
  return !nodes.some((node) => /^reading-guide-p[1-9]\d*$/u.test(node.sentenceId ?? ""));
}

function englishGuidedStudyNarrationNodeMatchesTarget(
  node: EnglishNarrationNode,
  target: { sentenceId: string | null; targetType: "INTRO" | "SENTENCE" | "SUMMARY" }
) {
  return target.targetType === "SENTENCE"
    ? node.type === "SENTENCE" && node.sentenceId === target.sentenceId
    : node.type === target.targetType;
}

function englishGuidedStudyTargetNarrationDrafts(
  edited: ReturnType<typeof buildEditedMaterialContent>,
  target: { sentenceId: string | null; targetType: "INTRO" | "SENTENCE" | "SUMMARY" }
) {
  const content = jsonObject(edited.content);

  if (guidedStudyScene(content?.scene) === "DAODU") {
    const drafts = buildReadingGuideNarrationNodeDrafts(edited.narration);
    const targetDrafts = drafts.filter((node) => englishGuidedStudyNarrationDraftMatchesTarget(node, target));

    if (targetDrafts.length === 0) {
      throw new AppException(40001, "当前自然段没有可合成的讲解音频", HttpStatus.BAD_REQUEST);
    }

    return targetDrafts;
  }

  const sentences = narrationNodeSourceSentences(content?.sentences);
  const closing = stringValue(content?.closing) ?? defaultEnglishGuidedStudyClosing();
  const drafts = buildEnglishNarrationNodeDrafts(edited.summary, sentences, closing);
  const targetDrafts = drafts.filter((node) => englishGuidedStudyNarrationDraftMatchesTarget(node, target));

  if (targetDrafts.length === 0) {
    throw new AppException(40001, "当前文稿没有可合成的讲解语音", HttpStatus.BAD_REQUEST);
  }

  return targetDrafts;
}

function englishGuidedStudyScriptUpdateNarrationDrafts(
  material: EnglishGuidedStudyMaterialRecord,
  edited: ReturnType<typeof buildEditedMaterialContent>,
  target: { sentenceId: string | null; targetType: "INTRO" | "SENTENCE" | "SUMMARY" }
) {
  return guidedStudyScene(jsonObject(material.content)?.scene) === "DAODU"
    && readingGuideTimelineNeedsParagraphMigration(material.content)
      ? buildReadingGuideNarrationNodeDrafts(edited.narration)
      : englishGuidedStudyTargetNarrationDrafts(edited, target);
}

function englishGuidedStudyNarrationDraftMatchesTarget(
  node: EnglishNarrationNodeDraft,
  target: { sentenceId: string | null; targetType: "INTRO" | "SENTENCE" | "SUMMARY" }
) {
  return target.targetType === "SENTENCE"
    ? node.type === "SENTENCE" && node.sentenceId === target.sentenceId
    : node.type === target.targetType;
}

function englishGuidedStudyOperationConfig(operation: EnglishGuidedStudyOperation) {
  if (operation === "CONTENT") {
    return {
      operation,
      jobKey: "contentGenerationJob" as const,
      progressKey: "contentGenerationProgress" as const
    };
  }

  if (operation === "PRACTICE") {
    return {
      operation,
      jobKey: "practiceGenerationJob" as const,
      progressKey: "practiceGenerationProgress" as const
    };
  }

  return operation === "AUDIO"
    ? {
        operation,
        jobKey: "audioGenerationJob" as const,
        progressKey: "audioGenerationProgress" as const
      }
    : {
        operation,
        jobKey: "readAlongGenerationJob" as const,
        progressKey: "readAlongGenerationProgress" as const
      };
}

function queuedEnglishGuidedStudyContent(
  id: string,
  input: GenerateEnglishGuidedStudyMaterialDto
) {
  return {
    id,
    scene: guidedStudyScene(input.scene),
    title: guidedStudyCoursewareTitle(input.title, input.sourceText, guidedStudyScene(input.scene)),
    contentTitle: input.title?.trim() || null,
    author: input.author?.trim() || null,
    authorIntroductionMode: input.authorIntroductionMode ?? "BRIEF",
    sourceType: input.sourceType,
    sourceName: input.sourceName || null,
    sourceText: input.sourceText,
    referenceMaterials: normalizeEnglishGuidedStudyReferenceMaterials(input.referenceMaterials),
    level: {
      standardName: input.levelStandardName,
      optionLabel: input.levelOptionLabel,
      aiLevel: input.aiLevel
    },
    explanationMode: input.explanationMode ?? "SENTENCE",
    ...(guidedStudyScene(input.scene) === "DAODU"
      ? { durationMinutes: readingGuideDuration(input.durationMinutes), guideScript: "" }
      : {}),
    summary: "",
    narration: "",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: 0,
    audioTimeline: [],
    narrationTimelineV2: null,
    readAlong: null,
    sentences: [],
    questions: [],
    pinnedAt: null,
    createdAt: new Date().toISOString()
  };
}

function referenceMaterialsFromValue(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  try {
    return normalizeEnglishGuidedStudyReferenceMaterials(
      value as EnglishGuidedStudyReferenceMaterial[]
    );
  } catch {
    return [];
  }
}

function englishGuidedStudyPracticeLessonJson(
  material: EnglishGuidedStudyMaterialRecord,
  content: Record<string, unknown>
) {
  const sourceSentences = Array.isArray(content.sentences) ? content.sentences : [];
  const build = (textMaxLength: number, scriptMaxLength: number, noteMaxLength: number) =>
    JSON.stringify({
      title: material.title,
      summary: material.summary,
      explanationMode: englishGuidedStudyExplanationMode(content.explanationMode),
      sentences: sourceSentences
        .map((value) => jsonObject(value))
        .filter((value): value is Record<string, unknown> => Boolean(value))
        .map((sentence) => ({
          id: limitText(stringValue(sentence.id) ?? "", 80),
          text: limitText(stringValue(sentence.text) ?? "", textMaxLength),
          script: limitText(stringValue(sentence.script) ?? "", scriptMaxLength),
          grammarFocus: limitText(stringValue(sentence.grammarFocus) ?? "", 600),
          points: (Array.isArray(sentence.points) ? sentence.points : [])
            .map((value) => jsonObject(value))
            .filter((value): value is Record<string, unknown> => Boolean(value))
            .slice(0, 4)
            .map((point) => ({
              term: limitText(stringValue(point.term) ?? "", 160),
              meaning: limitText(stringValue(point.meaning) ?? "", 240),
              note: limitText(stringValue(point.note) ?? "", noteMaxLength)
            }))
        }))
    });
  const full = build(2_400, 12_000, 1_200);

  if (full.length <= 250_000) {
    return full;
  }

  const sentenceCount = Math.max(1, sourceSentences.length);
  const perSentenceBudget = Math.max(320, Math.floor(220_000 / sentenceCount));

  const compact = build(
    Math.max(80, Math.floor(perSentenceBudget * 0.35)),
    Math.max(160, Math.floor(perSentenceBudget * 0.5)),
    Math.max(80, Math.floor(perSentenceBudget * 0.15))
  );

  if (compact.length <= 256_000) {
    return compact;
  }

  return build(120, 160, 80);
}

export function englishGuidedStudyRecoveryStaleMs() {
  const configured = Number(process.env.ENGLISH_GUIDED_STUDY_RECOVERY_STALE_MS);

  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : 150_000;
}

export function englishGuidedStudyRecoverySweepMs() {
  const configured = Number(process.env.ENGLISH_GUIDED_STUDY_RECOVERY_SWEEP_MS);

  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : 30_000;
}

export function englishGuidedStudyReadAlongAsrPollMs() {
  const configured = Number(process.env.ENGLISH_GUIDED_STUDY_READ_ALONG_ASR_POLL_MS);

  return Number.isFinite(configured) && configured > 0
    ? Math.min(60_000, Math.max(2_000, Math.floor(configured)))
    : 10_000;
}

export function englishGuidedStudyReadAlongAsrMaxSubmissionAttempts() {
  const configured = Number(process.env.ENGLISH_GUIDED_STUDY_READ_ALONG_ASR_MAX_SUBMISSION_ATTEMPTS);

  return Number.isFinite(configured) && configured > 0
    ? Math.min(20, Math.max(1, Math.floor(configured)))
    : 6;
}

export function englishGuidedStudyReadAlongAsrMaxTransientFailures() {
  const configured = Number(process.env.ENGLISH_GUIDED_STUDY_READ_ALONG_ASR_MAX_TRANSIENT_FAILURES);

  return Number.isFinite(configured) && configured > 0
    ? Math.min(100, Math.max(1, Math.floor(configured)))
    : 12;
}

export function englishGuidedStudyReadAlongAsrMaxPollAttempts() {
  const configured = Number(process.env.ENGLISH_GUIDED_STUDY_READ_ALONG_ASR_MAX_POLL_ATTEMPTS);

  return Number.isFinite(configured) && configured > 0
    ? Math.min(10_000, Math.max(1, Math.floor(configured)))
    : 360;
}

function readAlongAsrProviderStatusFailed(value: string) {
  return /(?:^|[^A-Z])(FAILED|FAILURE|ERROR|CANCELED|CANCELLED|REJECTED)(?:$|[^A-Z])/u.test(
    value.trim().toUpperCase()
  );
}

function readAlongAsrCheckpointFromValue(
  value: unknown
): EnglishGuidedStudyReadAlongAsrCheckpoint | null {
  const checkpoint = jsonObject(value);

  if (
    !checkpoint ||
    checkpoint.version !== 1 ||
    !stringValue(checkpoint.providerTaskId) ||
    !stringValue(checkpoint.providerStatus) ||
    !stringValue(checkpoint.modelInstanceId) ||
    !stringValue(checkpoint.providerInstanceId) ||
    !stringValue(checkpoint.modelName) ||
    !stringValue(checkpoint.providerName) ||
    !(checkpoint.requestId === null || typeof checkpoint.requestId === "string") ||
    !stringValue(checkpoint.submittedAt) ||
    !(checkpoint.lastPolledAt === null || typeof checkpoint.lastPolledAt === "string") ||
    !nonNegativeInteger(checkpoint.pollAttempts) ||
    !nonNegativeInteger(checkpoint.transientFailures)
  ) {
    return null;
  }

  return checkpoint as unknown as EnglishGuidedStudyReadAlongAsrCheckpoint;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function englishGuidedStudyContentBatchCheckpoints(value: unknown) {
  const input = jsonObject(value);
  const items = Array.isArray(input?.generatedBatches) ? input.generatedBatches : [];
  const checkpoints = new Map<number, EnglishGuidedStudyContentBatchCheckpoint>();
  const promptVersionForScene = guidedStudyMaterialPromptVersion(
    guidedStudyScene(input?.scene)
  );

  for (const item of items) {
    const checkpoint = jsonObject(item);
    const batchIndex = numberValue(checkpoint?.batchIndex);
    const taskId = stringValue(checkpoint?.taskId);
    const text = stringValue(checkpoint?.text);
    const promptVersion = stringValue(checkpoint?.promptVersion);

    if (
      !checkpoint ||
      batchIndex === null ||
      !Number.isInteger(batchIndex) ||
      batchIndex < 0 ||
      promptVersion !== promptVersionForScene ||
      !taskId ||
      !text
    ) {
      continue;
    }

    checkpoints.set(batchIndex, {
      batchIndex,
      modelName: stringValue(checkpoint.modelName),
      promptVersion,
      providerName: stringValue(checkpoint.providerName),
      taskId,
      text
    });
  }

  return checkpoints;
}

export function englishGuidedStudyContentBatchResults(value: unknown) {
  return new Map<number, ExternalScenarioTextGenerationResult>(
    Array.from(
      englishGuidedStudyContentBatchCheckpoints(value),
      ([batchIndex, checkpoint]) => [
        batchIndex,
        {
          modelName: checkpoint.modelName,
          providerName: checkpoint.providerName,
          taskId: checkpoint.taskId,
          text: checkpoint.text
        }
      ]
    )
  );
}

function englishGuidedStudyJobWithoutContentCheckpoints(
  job: EnglishGuidedStudyOperationJob
) {
  const input = jsonObject(job.input);

  if (!input || !("generatedBatches" in input)) {
    return job;
  }

  const cleanInput = { ...input };
  delete cleanInput.generatedBatches;

  return {
    ...job,
    input: cleanInput
  };
}

function englishGuidedStudyBackgroundErrorMessage(error: unknown) {
  if (error instanceof AppException) {
    return error.message;
  }

  return "后台生成失败，请稍后重试";
}

interface GenerateEnglishGuidedStudyContentInput {
  attribution: AttributionContext;
  inputLabel: string;
  maxTokens: number;
  modelInstanceId?: string;
  scene: GuidedStudyScene;
  aiLevel: string;
  author: string | null;
  authorIntroductionMode: EnglishGuidedStudyAuthorIntroductionMode;
  explanationMode: EnglishStudyExplanationMode;
  levelOptionLabel: string;
  levelStandardName: string;
  levelProfile: string;
  sourceSegments: SourceSegment[];
  sourceName: string | null;
  sourceText: string;
  sourceType: "TEXT" | "IMAGE";
  title: string;
  durationMinutes?: number;
  referenceMaterials: EnglishGuidedStudyReferenceMaterial[];
  onProgress?: (input: { completed: number; message: string; phase: string; total: number }) => Promise<void>;
  existingBatchResults?: Map<number, ExternalScenarioTextGenerationResult>;
  onBatchCompleted?: (
    batchIndex: number,
    result: ExternalScenarioTextGenerationResult
  ) => Promise<void>;
}

function readingGuideDuration(value: unknown) {
  const numeric = Number(value);
  return readingGuideDurations.includes(numeric as (typeof readingGuideDurations)[number])
    ? numeric as (typeof readingGuideDurations)[number]
    : 3;
}

function buildReadingGuideGeneratedMaterialContent(
  input: GenerateEnglishGuidedStudyContentInput,
  aiResult: ExternalScenarioTextGenerationResult,
  durationMinutes: (typeof readingGuideDurations)[number]
) {
  const object = parseAiMaterialObject(aiResult.text);
  const guideScript = limitText(stringValue(object.guideScript) ?? "", 8_000);

  if (!guideScript) {
    throw new AppException(50201, "AI 未返回完整导读文稿，请稍后重试", HttpStatus.BAD_GATEWAY);
  }

  const createdAt = new Date().toISOString();
  const title = limitText(
    input.title || stringValue(object.title) || guidedStudyCoursewareTitle(undefined, input.sourceText, "DAODU"),
    120
  );
  const sentence = {
    id: "reading-guide",
    text: input.sourceText,
    explanation: guideScript,
    grammarFocus: "",
    script: guideScript,
    startSeconds: 0,
    endSeconds: durationMinutes * 60,
    points: []
  };

  return {
    id: `generated-${Date.now()}`,
    title,
    scene: "DAODU" as const,
    contentTitle: input.title || null,
    author: null,
    authorIntroductionMode: "NONE" as const,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceText: input.sourceText,
    referenceMaterials: input.referenceMaterials,
    contentType: "GENERAL",
    level: {
      standardName: input.levelStandardName,
      optionLabel: input.levelOptionLabel,
      aiLevel: input.aiLevel
    },
    explanationMode: "FREEFORM" as const,
    durationMinutes,
    guideScript,
    summary: "",
    closing: "",
    narration: guideScript,
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds: durationMinutes * 60,
    audioTimeline: [],
    sentences: [sentence],
    questions: [],
    createdAt,
    generation: {
      mode: "MODEL",
      scenarioSlug: "daodu",
      aiTaskId: aiResult.taskId,
      aiTaskIds: [aiResult.taskId],
      batchCount: 1,
      providerName: aiResult.providerName,
      modelName: aiResult.modelName,
      generatedAt: createdAt
    }
  };
}

interface BuildGeneratedMaterialContentInput {
  aiLevel: string;
  author: string | null;
  authorIntroductionMode: EnglishGuidedStudyAuthorIntroductionMode;
  aiResult: ExternalScenarioTextGenerationResult;
  batchCount: number;
  batchIndex: number;
  explanationMode: EnglishStudyExplanationMode;
  levelOptionLabel: string;
  levelStandardName: string;
  requiredQuestionCount: number;
  scene: GuidedStudyScene;
  sourceSegments: SourceSegment[];
  sourceName: string | null;
  sourceText: string;
  sourceType: "TEXT" | "IMAGE";
  title: string;
  referenceMaterials: EnglishGuidedStudyReferenceMaterial[];
}

interface SourceSegment {
  id: string;
  text: string;
}

interface GeneratedStudyPoint {
  id: string;
  term: string;
  meaning: string;
  note: string;
  startSeconds: number;
  endSeconds: number;
}

interface GeneratedStudySentence {
  id: string;
  text: string;
  explanation: string;
  grammarFocus: string;
  script: string;
  startSeconds: number;
  endSeconds: number;
  points: GeneratedStudyPoint[];
}

interface GeneratedStudyQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

function optionalEnglishGuidedStudyBillingRequestId(value: string | undefined) {
  const requestId = value?.trim() || randomBytes(16).toString("hex");

  if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) {
    throw new AppException(40001, "计费请求标识无效，请重新确认点数消耗", HttpStatus.BAD_REQUEST);
  }

  return requestId;
}

function requiredEnglishGuidedStudyBillingRequestId(value: string | undefined) {
  if (!value?.trim()) {
    throw new AppException(40001, "请重新确认本次点数消耗", HttpStatus.BAD_REQUEST);
  }

  return optionalEnglishGuidedStudyBillingRequestId(value);
}

function normalizeImageExtractionResult(text: string) {
  const object = parseAiImageExtractionObject(text);
  const title = nullableStringValue(object.title);
  const author = nullableStringValue(object.author);
  const bodyText = normalizeExtractedBodyText(
    stringValue(object.bodyText) ?? stringValue(object.text) ?? stringValue(object.content) ?? ""
  );

  if (!bodyText) {
    throw new AppException(40001, "图片中未识别到可用于带学的正文内容", HttpStatus.BAD_REQUEST);
  }

  return {
    title: title ? limitText(title, 120) : null,
    author: author ? limitText(author, 120) : null,
    bodyText: limitText(bodyText, englishGuidedStudySourceTextMaxLength),
    ignoredContent: normalizeIgnoredContent(object.ignoredContent)
  };
}

function parseAiImageExtractionObject(text: string) {
  const candidate = extractJsonCandidate(text);

  try {
    const parsed = JSON.parse(candidate);
    const object = jsonObject(parsed);

    if (!object) {
      throw new Error("not object");
    }

    return object;
  } catch {
    throw new AppException(50201, "AI 未返回有效图片识别结果，请稍后重试", HttpStatus.BAD_GATEWAY);
  }
}

function nullableStringValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return stringValue(value);
}

function normalizeExtractedBodyText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeIgnoredContent(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => limitText(stringValue(item) ?? "", 120)).filter(Boolean).slice(0, 20);
}

function normalizeEnglishGuidedStudyContentType(value: unknown) {
  const normalized = stringValue(value)?.trim().toUpperCase();

  if (
    normalized &&
    [
      "POETRY",
      "SCIENCE",
      "BIOGRAPHY_HISTORY",
      "DIALOGUE",
      "FICTION",
      "ARGUMENTATIVE",
      "GENERAL"
    ].includes(normalized)
  ) {
    return normalized;
  }

  return "GENERAL";
}

function buildGeneratedMaterialContent(input: BuildGeneratedMaterialContentInput) {
  const object = parseAiMaterialObject(input.aiResult.text);
  const sentences = normalizeGeneratedSentences(object.sentences, input.sourceSegments, input.scene);

  if (sentences.length === 0) {
    throw invalidAiMaterialException();
  }

  const questions = normalizeGeneratedQuestions(object.questions);

  if (questions.length < input.requiredQuestionCount) {
    throw invalidAiMaterialException();
  }

  const createdAt = new Date().toISOString();
  const displayTitle = limitText(
    input.title ||
      stringValue(object.title) ||
      guidedStudyCoursewareTitle(undefined, input.sourceText, input.scene),
    120
  );
  const contentType = normalizeEnglishGuidedStudyContentType(object.contentType);
  const rawSummary = input.batchIndex === 0
    ? limitText(
        stringValue(object.summary) ?? defaultGuidedStudyIntro(contentType, input.scene),
        1000
      )
    : "";
  const rawClosing = input.batchIndex === input.batchCount - 1
    ? limitText(
        stringValue(object.closing) ?? defaultGuidedStudyClosing(input.scene),
        1000
      )
    : "";

  if (input.scene === "GUSHIWEN") {
    const recoveryMetadataIssues: EnglishGuidedStudyMaterialRecoveryFeedback["issues"] = [];

    if (hasEnglishGuidedStudyRecoveryMetadataLeak(rawSummary)) {
      recoveryMetadataIssues.push({
        issueType: "FEEDBACK_METADATA_LEAK",
        section: "SUMMARY"
      });
    }
    if (hasEnglishGuidedStudyRecoveryMetadataLeak(rawClosing)) {
      recoveryMetadataIssues.push({
        issueType: "FEEDBACK_METADATA_LEAK",
        section: "CLOSING"
      });
    }

    if (recoveryMetadataIssues.length > 0) {
      throw incompleteAiMaterialException({ issues: recoveryMetadataIssues });
    }
  }

  const titleSections = englishGuidedStudyFormalTitleSections({
    closing: rawClosing,
    summary: rawSummary,
    title: input.title
  });
  const summary = titleSections.summary;
  const closing = titleSections.closing;
  const modelGeneratedTitle = input.title ? null : stringValue(object.title);

  if (
    modelGeneratedTitle &&
    englishGuidedStudyHasGeneratedTitleLeak({
      closing,
      scripts: sentences.map((sentence) => sentence.script),
      sourceText: input.sourceText,
      summary,
      title: modelGeneratedTitle
    })
  ) {
    throw new GeneratedCoursewareTitleLeakError();
  }

  const narration = buildNarrationFromGeneratedContent(
    summary,
    sentences,
    input.title ? stringValue(object.narration) : null,
    closing
  );
  const audioTimeline = sentences.map((sentence) => ({
    sentenceId: sentence.id,
    startSeconds: sentence.startSeconds,
    endSeconds: sentence.endSeconds,
    terms: sentence.points.map((point) => ({
      pointId: point.id,
      term: point.term,
      startSeconds: point.startSeconds,
      endSeconds: point.endSeconds
    }))
  }));
  const audioDurationSeconds = Math.max(30, Math.ceil(sentences[sentences.length - 1]?.endSeconds ?? 0));

  return {
    id: `generated-${Date.now()}`,
    title: displayTitle,
    scene: input.scene,
    contentTitle: input.title || null,
    author: input.author,
    authorIntroductionMode: input.authorIntroductionMode,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourceText: input.sourceText,
    referenceMaterials: input.referenceMaterials,
    contentType,
    level: {
      standardName: input.levelStandardName,
      optionLabel: input.levelOptionLabel,
      aiLevel: input.aiLevel
    },
    explanationMode: input.explanationMode,
    summary,
    closing,
    narration,
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds,
    audioTimeline,
    sentences,
    questions: questions.slice(0, input.requiredQuestionCount),
    createdAt,
    generation: {
      mode: "MODEL",
      scenarioSlug: input.scene === "GUSHIWEN"
        ? "gushiwen-guided-study-material"
        : "english-guided-study-material",
      aiTaskId: input.aiResult.taskId,
      aiTaskIds: [input.aiResult.taskId],
      batchCount: 1,
      providerName: input.aiResult.providerName,
      modelName: input.aiResult.modelName,
      generatedAt: createdAt
    }
  };
}

type GeneratedMaterialContent = ReturnType<typeof buildGeneratedMaterialContent>;

function combineGeneratedMaterialContents(
  input: GenerateEnglishGuidedStudyContentInput,
  contents: GeneratedMaterialContent[]
): GeneratedMaterialContent {
  const first = contents[0];

  if (!first) {
    throw invalidAiMaterialException();
  }

  if (contents.length === 1) {
    return first;
  }

  const sentences: GeneratedStudySentence[] = [];
  let cursor = 0;

  for (const content of contents) {
    for (const sentence of content.sentences) {
      const offset = cursor - sentence.startSeconds;
      const duration = Math.max(0, sentence.endSeconds - sentence.startSeconds);
      const shifted = {
        ...sentence,
        startSeconds: roundSeconds(sentence.startSeconds + offset),
        endSeconds: roundSeconds(sentence.endSeconds + offset),
        points: sentence.points.map((point) => ({
          ...point,
          startSeconds: roundSeconds(point.startSeconds + offset),
          endSeconds: roundSeconds(point.endSeconds + offset)
        }))
      };
      sentences.push(shifted);
      cursor += duration;
    }
  }

  if (sentences.length !== input.sourceSegments.length) {
    throw incompleteAiMaterialException();
  }

  const createdAt = new Date().toISOString();
  const title = limitText(input.title || first.title, 120);
  const summary = limitText(
    contents.find((content) => content.summary.trim())?.summary ??
      defaultGuidedStudyIntro(first.contentType, input.scene),
    1000
  );
  const closing = limitText(
    [...contents].reverse().find((content) => content.closing.trim())?.closing ??
      defaultGuidedStudyClosing(input.scene),
    1000
  );
  const narration = buildNarrationFromGeneratedContent(summary, sentences, null, closing);
  const audioTimeline = sentences.map((sentence) => ({
    sentenceId: sentence.id,
    startSeconds: sentence.startSeconds,
    endSeconds: sentence.endSeconds,
    terms: sentence.points.map((point) => ({
      pointId: point.id,
      term: point.term,
      startSeconds: point.startSeconds,
      endSeconds: point.endSeconds
    }))
  }));

  return {
    ...first,
    id: `generated-${Date.now()}`,
    title,
    summary,
    closing,
    narration,
    audioDurationSeconds: Math.max(30, Math.ceil(cursor)),
    audioTimeline,
    sentences,
    questions: [],
    createdAt,
    generation: {
      ...first.generation,
      aiTaskIds: contents.map((content) => content.generation.aiTaskId),
      batchCount: contents.length,
      generatedAt: createdAt
    }
  };
}

function parseAiMaterialObject(text: string) {
  const candidate = extractJsonCandidate(text);

  try {
    const parsed = JSON.parse(candidate);
    const object = jsonObject(parsed);

    if (!object) {
      throw new Error("not object");
    }

    return object;
  } catch {
    throw invalidAiMaterialException();
  }
}

function extractJsonCandidate(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const value = fenced?.[1]?.trim() ?? trimmed;
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw invalidAiMaterialException();
  }

  return value.slice(start, end + 1);
}

function normalizeGeneratedSentences(
  value: unknown,
  sourceSegments: SourceSegment[],
  scene: GuidedStudyScene
) {
  const items = Array.isArray(value) ? value : [];
  const sentences: GeneratedStudySentence[] = [];
  const bySegmentId = new Map<string, Record<string, unknown>>();

  for (const item of items) {
    const object = jsonObject(item);
    const segmentId = stringValue(object?.segmentId) ?? stringValue(object?.id);

    if (object && segmentId) {
      bySegmentId.set(segmentId, object);
    }
  }

  const missingSegmentIds = sourceSegments
    .filter((segment) => !bySegmentId.has(segment.id))
    .map((segment) => segment.id);

  if (missingSegmentIds.length > 0) {
    throw incompleteAiMaterialException({
      issues: missingSegmentIds.map((segmentId) => ({
          issueType: "MISSING_SEGMENT",
          segmentId
        }))
    });
  }

  if (scene === "GUSHIWEN") {
    const issues: EnglishGuidedStudyMaterialRecoveryFeedback["issues"] = [];

    sourceSegments.forEach((sourceSegment) => {
      const object = bySegmentId.get(sourceSegment.id);
      const script = limitText(
        stringValue(object?.script) ??
          stringValue(object?.teachingScript) ??
          stringValue(object?.narration) ??
          stringValue(object?.explanation) ??
          "",
        1800
      );

      if (!object || !script) {
        issues.push({
          issueType: "MISSING_SCRIPT" as const,
          segmentId: sourceSegment.id
        });
        return;
      }

      if (hasEnglishGuidedStudyRecoveryMetadataLeak(script)) {
        issues.push({
          issueType: "FEEDBACK_METADATA_LEAK",
          section: "SCRIPT",
          segmentId: sourceSegment.id
        });
        return;
      }
    });

    if (issues.length > 0) {
      throw incompleteAiMaterialException({ issues });
    }
  }

  let cursor = 0;

  for (const sourceSegment of sourceSegments) {
    const object = bySegmentId.get(sourceSegment.id);
    const text = limitText(sourceSegment.text, 2400);

    if (!object || !text) {
      throw incompleteAiMaterialException();
    }

    const index = sentences.length;
    const rawScript =
      stringValue(object.script) ??
        stringValue(object.teachingScript) ??
        stringValue(object.narration) ??
        stringValue(object.explanation) ??
        "";
    const script = scene === "GUSHIWEN" ? limitText(rawScript, 1800) : rawScript;

    if (!script) {
      throw incompleteAiMaterialException();
    }

    const explanation = limitText(
      stringValue(object.explanation) ?? script,
      1200
    );
    const grammarFocus = limitText(
      stringValue(object.grammarFocus) ?? stringValue(object.grammar) ?? "",
      800
    );
    const generatedPoints = normalizeGeneratedPoints(object.points, index);
    const basePoints = scene === "GUSHIWEN"
      ? alignEnglishNarrationPointsToScript(script, generatedPoints, sourceSegment.text)
      : generatedPoints;

    const durationSeconds = estimateSentenceSeconds(text, script, grammarFocus, basePoints);
    const startSeconds = cursor;
    const endSeconds = cursor + durationSeconds;
    const points = timeGeneratedPoints(basePoints, startSeconds, endSeconds);

    sentences.push({
      id: sourceSegment.id,
      text,
      explanation,
      grammarFocus,
      script,
      startSeconds,
      endSeconds,
      points
    });
    cursor = endSeconds;
  }

  return sentences;
}

function normalizeGeneratedPoints(value: unknown, sentenceIndex: number) {
  const items = Array.isArray(value) ? value : [];

  return items
    .map((item, index) => {
      const object = jsonObject(item);
      const term = limitText(stringValue(object?.term) ?? "", 120);
      const meaning = limitText(stringValue(object?.meaning) ?? "", 160);

      if (!object || !term || !meaning) {
        return null;
      }

      return {
        id: `p${sentenceIndex + 1}-${index + 1}`,
        term,
        meaning,
        note: limitText(stringValue(object.note) ?? "结合原句理解这个表达，不要孤立背中文释义。", 500),
        startSeconds: 0,
        endSeconds: 0
      };
    })
    .filter((item): item is GeneratedStudyPoint => Boolean(item))
    .slice(0, 4);
}

function timeGeneratedPoints(points: GeneratedStudyPoint[], startSeconds: number, endSeconds: number) {
  if (points.length === 0) {
    return [];
  }

  const duration = Math.max(1, endSeconds - startSeconds);
  const slot = duration / (points.length + 1);

  return points.map((point, index) => {
    const pointStart = startSeconds + slot * (index + 1);

    return {
      ...point,
      startSeconds: roundSeconds(pointStart),
      endSeconds: roundSeconds(Math.min(endSeconds, pointStart + Math.max(1.2, slot * 0.7)))
    };
  });
}

function normalizeGeneratedQuestions(value: unknown, maxCount = 10) {
  const items = Array.isArray(value) ? value : [];
  const questions: GeneratedStudyQuestion[] = [];

  for (const item of items) {
    const object = jsonObject(item);
    const question = limitText(stringValue(object?.question) ?? "", 500);
    const options = Array.isArray(object?.options)
      ? object.options.map((option) => stringValue(option)).filter((option): option is string => Boolean(option)).slice(0, 4)
      : [];
    const answer = normalizedAnswerIndex(object?.answer);
    const explanation = limitText(stringValue(object?.explanation) ?? "", 1000);

    if (!object || !question || options.length !== 4 || answer === null || !explanation) {
      continue;
    }

    questions.push({
      id: stringValue(object.id) ?? `q${questions.length + 1}`,
      question,
      options,
      answer,
      explanation
    });

    if (questions.length >= maxCount) {
      break;
    }
  }

  return questions;
}

function normalizedAnswerIndex(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toUpperCase();
  const letterIndex = ["A", "B", "C", "D"].indexOf(trimmed);

  if (letterIndex >= 0) {
    return letterIndex;
  }

  const number = Number(trimmed);

  if (Number.isInteger(number) && number >= 0 && number <= 3) {
    return number;
  }

  if (Number.isInteger(number) && number >= 1 && number <= 4) {
    return number - 1;
  }

  return null;
}

function buildNarrationFromGeneratedContent(
  summary: string,
  sentences: GeneratedStudySentence[],
  modelNarration: string | null,
  closing: string
) {
  const scripts = sentences.map((sentence) => sentence.script).filter(Boolean);
  const normalizedModelNarration = modelNarration?.trim();

  if (normalizedModelNarration && scripts.every((script) => normalizedModelNarration.includes(script.slice(0, Math.min(24, script.length))))) {
    return normalizedModelNarration;
  }

  const parts = [
    summary,
    ...scripts,
    closing
  ].filter((part) => part.trim());

  return parts.join("\n");
}

function defaultEnglishGuidedStudyIntro(contentType: string) {
  const descriptions: Record<string, string> = {
    POETRY: "我们先来读一首英文诗，顺着诗句看看画面和情感怎样展开。",
    SCIENCE: "我们先来读一篇英文科普文章，看看它怎样把一个科学话题说明清楚。",
    BIOGRAPHY_HISTORY: "我们先来读一篇英文人物或历史文章，顺着叙述了解事情怎样发展。",
    DIALOGUE: "我们先进入这段英文对话，看看人物在怎样的场景里交流。",
    FICTION: "我们先来读这个英文故事，跟着情节看看接下来发生了什么。",
    ARGUMENTATIVE: "我们先来读这篇英文观点文章，看看作者怎样展开自己的想法。",
    GENERAL: "我们先来读这篇英文内容，看看它主要讲了怎样一件事。"
  };

  return descriptions[contentType] ?? descriptions.GENERAL;
}

function defaultEnglishGuidedStudyClosing() {
  return "我们就读到这里。回头看一遍原文，留意刚才讲过的关键词、句子结构和前后内容的联系，你会更容易把这些表达真正用起来。";
}

function defaultGuidedStudyIntro(contentType: string, scene: GuidedStudyScene) {
  return scene === "GUSHIWEN"
    ? "我们先走进这篇古诗文的时代与情境，理解文字写了什么，再顺着画面和节奏把它读熟、记牢。"
    : defaultEnglishGuidedStudyIntro(contentType);
}

function defaultGuidedStudyClosing(scene: GuidedStudyScene) {
  return scene === "GUSHIWEN"
    ? "今天我们顺着原文，把人物、画面、关键词和前后联系都串起来了；这些线索连在一起，文字也就更容易留在心里。"
    : defaultEnglishGuidedStudyClosing();
}

function estimateSentenceSeconds(
  text: string,
  explanation: string,
  grammarFocus: string,
  points: Array<{ note: string; term: string; meaning: string }>
) {
  const pointLength = points.reduce((total, point) => total + point.term.length + point.meaning.length + point.note.length, 0);

  return Math.max(8, Math.ceil((text.length + explanation.length + grammarFocus.length + pointLength) / 12));
}

export function englishGuidedStudyLevelBand(aiLevel: string) {
  const normalizedLevel = aiLevel.toUpperCase();
  const educationLevel = normalizedLevel.match(/^E([0-7])$/)?.[1];
  const educationBands: Record<string, string> = {
    "0": "A0",
    "1": "A1",
    "2": "A2",
    "3": "A2",
    "4": "B1",
    "5": "B1",
    "6": "B2",
    "7": "B2"
  };

  if (educationLevel) {
    return educationBands[educationLevel];
  }

  if (normalizedLevel.includes("PRE-A1") || normalizedLevel.includes("PRE A1")) {
    return "A0";
  }

  return normalizedLevel.includes("C2")
    ? "C2"
    : normalizedLevel.includes("C1")
      ? "C1"
      : normalizedLevel.includes("B2")
        ? "B2"
        : normalizedLevel.includes("B1")
          ? "B1"
          : normalizedLevel.includes("A2")
            ? "A2"
            : normalizedLevel.includes("A1")
              ? "A1"
              : "A0";
}

export function englishGuidedStudyLanguagePolicy(aiLevel: string) {
  const policies: Record<string, string> = {
    A0: "A0 / Pre-A1：全部带学讲解以中文为主，中文约占 90% 到 95%，英文只保留原文、核心词和极短模仿句。",
    A1: "A1：全部带学讲解以中文为主，中文约占 85% 到 92%，先用中文讲懂，再穿插高频英文词语与短句。",
    A2: "A2：全部带学讲解中文约占 65% 到 75%，英文用于简单释义、短例句和模仿表达，随后用中文确认理解。",
    B1: "B1：全部带学讲解中英文大致均衡，中文约占 45% 到 55%，英文约占 45% 到 55%；用中文讲清句意、词义、逻辑、语法和易混点，再自然穿插英文改述和例句，不是先讲完整段英文再附中文词卡。",
    B2: "B2：全部带学讲解英文约占 55% 到 65%，中文约占 35% 到 45%，必须用中文解释复杂结构、关键结论和中英差异。",
    C1: "C1：全部带学讲解英文约占 70% 到 80%，中文至少占 20%，用于阶段归纳、跨语言对比和难点确认。",
    C2: "C2：全部带学讲解英文约占 70% 到 80%，中文至少占 20%，用于阶段归纳、跨语言对比和难点确认。"
  };

  return policies[englishGuidedStudyLevelBand(aiLevel)];
}

function englishGuidedStudyChineseShare(sentences: GeneratedStudySentence[]) {
  const script = sentences.map((sentence) => sentence.script).join("\n");
  const chineseCharacters = script.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const englishWords = script.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
  const languageUnits = chineseCharacters + englishWords;

  return languageUnits > 0 ? chineseCharacters / languageUnits : 0;
}

function englishGuidedStudyParagraphRepairPolicy(sentence: GeneratedStudySentence, aiLevel: string) {
  const targetShares: Record<string, number> = { A0: 0.92, A1: 0.88, A2: 0.7, B1: 0.5, B2: 0.4, C1: 0.25, C2: 0.25 };
  const target = targetShares[englishGuidedStudyLevelBand(aiLevel)]!;
  const englishWords = sentence.script.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
  const chineseCharacters = sentence.script.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return [
    `硬性纠偏：需要补足中文讲解的片段：${sentence.id}。只重新生成这个片段的连贯 script 及其 points。`,
    `上一版 script 的中文汉字数为 ${chineseCharacters}，英文单词数为 ${englishWords}；目标中文约 ${Math.round(target * 100)}%。`,
    `按中文汉字数 /（中文汉字数 + 英文单词数）统计；如保留约 ${englishWords} 个英文单词，就需要约 ${Math.ceil(englishWords * target / (1 - target))} 个中文汉字的实质讲解。改变英文篇幅后要同步调整中文篇幅。`,
    "请从第一句到最后一句逐句用中文讲清理解和语言难点，穿插符合等级的英文表达；中文要分布在讲解过程中，不能只写在 points 或结尾。",
    "保留必要英文引用、释义和例句，不能整段纯英文或仅删掉英文来凑比例，也不要整段直译、重复空话。仍按原定 JSON 格式输出，segmentId 不变；不要把统计数字、片段编号和纠偏说明读给学生。"
  ].join("\n");
}

function englishGuidedStudyHasEnoughChinese(
  sentences: GeneratedStudySentence[],
  aiLevel: string,
  explanationMode: EnglishStudyExplanationMode = "SENTENCE"
) {
  const minimumShares: Record<string, number> = {
    A0: 0.85,
    A1: 0.78,
    A2: 0.55,
    B1: 0.35,
    B2: 0.25,
    C1: 0.18,
    C2: 0.18
  };

  const minimumShare = minimumShares[englishGuidedStudyLevelBand(aiLevel)];
  return englishGuidedStudyChineseShare(sentences) >= minimumShare && (
    explanationMode !== "PARAGRAPH" ||
    sentences.every((sentence) => englishGuidedStudyChineseShare([sentence]) >= minimumShare)
  );
}

function englishGuidedStudyLevelProfile(levelStandardName: string, levelOptionLabel: string, aiLevel: string) {
  const levelBand = englishGuidedStudyLevelBand(aiLevel);
  const profiles: Record<string, string> = {
    A0: "A0 / Pre-A1：学习者可能只认识字母和极少量单词。讲解要慢、直观，一次只处理一个核心点，只挑最关键的单词和主谓动作，不使用语法术语。",
    A1: "A1：学习者能理解问候、自我介绍和极短句。先说明谁做什么，再讲高频词；语法只用主语、动作、时间、地点等简单说法。",
    A2: "A2：学习者能理解生活场景和简单段落。讲解覆盖句子主干、常见短语、基础时态和介词短语，并用生活化例子确认理解。",
    B1: "B1：学习者能读常见文章并表达简单观点。用易懂改述和例子讲清句间逻辑、常见从句、连接词、固定搭配和作者意图。",
    B2: "B2：学习者能理解较复杂话题。讲解加入语篇结构、观点推进、搭配差异、语气和复杂句层次，并突出表达迁移。",
    C1: "C1：学习者可处理学术或职场英文。讲解关注精细语义、修辞功能、语域、隐含立场和高级表达替换。",
    C2: "C2：学习者接近母语水平。讲解应精炼深入，聚焦风格选择、隐含立场、修辞效果和篇章策略。"
  };

  return profiles[levelBand];
}

function englishGuidedStudyExplanationModeProfile(explanationMode: EnglishStudyExplanationMode) {
  const profiles: Record<EnglishStudyExplanationMode, string> = {
    SENTENCE:
      "逐句讲解：sourceSegmentsJson 的每项是一个连续原文覆盖片段，通常对应一句英文；诗歌等特殊排版中可能包含跨行句法单元，必须先按语法和语义识别意思相对独立、学生可以一次理解的最小完整语义单元。意思已经闭合时，即使逗号结尾也可独立讲解；句法或语义仍依赖后文时必须跨行合并。每个 script 紧扣识别出的完整句子或自然教学子单元，依次讲清句意、主干、必要词语和语法，再说明它与上下文的关系。讲解细致但避免逐词翻译。",
    PARAGRAPH:
      "逐段讲解：sourceSegmentsJson 的每项是一个自然段或较长段落单元，一个片段对应一个连贯 script。先按语法和语义识别段内正确完整的句子与自然教学子单元，再从段首到段尾逐句讲清句意与必要语言点，边讲当前句边串联段落主旨、句间关系和信息推进；不得跳过后半段、只选关键句或机械逐句翻译。不要开头先完整诵读整段，只在讲到当前句时自然引用该句或必要片语。每段独立满足语言比例，不允许整段纯英文或用其他段落补足中文；中文必须承担具体教学作用。按原文词数、句数、信息密度和学习难度分配篇幅与口述时长，长段应有更长讲解，引用之外必须有充分的理解引导、词句分析和表达迁移，不能以复制原文或几句概括交差。依照 levelProfile 与 languagePolicy，在对应句子中讲解当前学生需要掌握的单词、短语和语法；释义采用自然口语，不用括号附加中文或英文解释，points 不能代替 script 中的讲解。诗歌等特殊排版按完整语义判断段内句子，不按换行机械切分，也不因缺少句号把整段视为一个长句。",
    FREEFORM:
      "自由发挥：sourceSegmentsJson 的每项是较大的主题单元。请像设计一节完整微课一样，围绕全文主旨、故事线或论证逻辑自由组织讲解，可使用贴合等级的类比、情境例子、表达对比和迁移练习；必须覆盖原文关键信息，但不要按原句或原段固定顺序机械解说。"
  };

  return profiles[explanationMode];
}

function guidedStudyExplanationModeProfile(
  scene: GuidedStudyScene,
  explanationMode: EnglishStudyExplanationMode
) {
  if (scene !== "GUSHIWEN") {
    return englishGuidedStudyExplanationModeProfile(explanationMode);
  }

  const profiles: Record<EnglishStudyExplanationMode, string> = {
    SENTENCE: "逐句讲解：按古诗文原句或分句依次带学，但人物提示语连同引号内不太长的连续发言应作为一个完整语意单元，不要因引语内部有多个句末标点就机械拆讲，也不得解析单独的标点片段。每次先看这一句自身的特点，再自然选择最值得讲的字词、句意、画面、逻辑、语气或前后联系；不要逐句套用固定栏目。短篇要在不同句子的讲解中逐步串起全文的回想线索。",
    PARAGRAPH: "逐段讲解：围绕每段独有的内容与作用组织口语讲解，结合必要的文言字词、句式、人物关系或观点推进，让段落之间自然衔接，并顺势帮助学生记住重点段的结构。",
    FREEFORM: "自由发挥：像一位资深语文老师面对面带学一样，围绕作品背景、情境、核心意象、人物故事或思想主题自然组织讲解；覆盖原文关键信息，并把诵读和背诵方法融入谈话，不得写成微课提纲。"
  };

  return profiles[explanationMode];
}

function englishGuidedStudyAuthorIntroductionMode(
  value: unknown
): EnglishGuidedStudyAuthorIntroductionMode {
  return value === "DETAILED" || value === "NONE" ? value : "BRIEF";
}

function englishGuidedStudyAuthorIntroductionPolicy(
  author: string | null,
  mode: EnglishGuidedStudyAuthorIntroductionMode
) {
  if (!author) {
    return "未提供作者。导语中不要猜测、补写或暗示作者身份。";
  }

  const policies = {
    BRIEF: `作者为“${author}”。在导语中自然用一个短分句或一句话简单说明作者身份以及与当前作品的关系；仅使用可靠信息。`,
    DETAILED: `作者为“${author}”。在导语中用 2 到 3 句做较详细介绍，可包括时代、国别、身份、代表性创作特点及与当前作品直接相关的背景；只使用可靠信息，不要写成生平履历。`,
    NONE: `作者为“${author}”，但导语中不得提及作者姓名、身份、生平或创作背景。`
  } satisfies Record<EnglishGuidedStudyAuthorIntroductionMode, string>;

  return policies[mode];
}

export function guidedStudyAuthorIntroductionPolicy(
  author: string | null,
  mode: EnglishGuidedStudyAuthorIntroductionMode,
  scene: GuidedStudyScene,
  levelOptionLabel: string,
  aiLevel: string
) {
  if (scene !== "GUSHIWEN") {
    return englishGuidedStudyAuthorIntroductionPolicy(author, mode);
  }

  if (!author) {
    return "未提供作者。导语中不要猜测、补写或暗示作者身份、经历、创作背景或心境。";
  }

  if (mode === "NONE") {
    return `作者为“${author}”，但导语中不得提及作者姓名、身份、生平、创作背景或心境。`;
  }

  if (mode === "BRIEF") {
    return `作者为“${author}”。面向${levelOptionLabel}学生，用一个自然短分句或一句话简单说明作者所处时代、身份以及与当前作品最直接的关系；仅使用可靠信息。`;
  }

  const grade = Number(aiLevel.match(/^G(\d{1,2})$/)?.[1] ?? 3);
  const duration = grade <= 2
    ? "25 到 40 秒"
    : grade <= 6
      ? "40 到 60 秒"
      : grade <= 9
        ? "50 到 75 秒"
        : "60 到 90 秒";
  const depth = grade <= 2
    ? "用短句和故事化表达，先说清他生活在什么时代、是怎样的人，再讲一个与当前作品直接有关的处境或感受；不使用生僻术语。"
    : grade <= 6
      ? "依次讲清时代和身份、对理解本文有帮助的一两项关键经历、鲜明的写作特点，再自然过渡到创作这篇作品时的处境、缘起和心境。"
      : grade <= 9
        ? "讲清时代和身份、与本文相关的关键经历与创作特点，并分析作者创作这篇作品时的现实处境、写作缘起、情感变化和表达选择。"
        : "在交代时代、身份、关键经历和创作特点的基础上，结合历史语境分析本文的写作缘起、作者处境、可能的心理张力、情感层次及其如何影响作品的意象、章法或语言。";

  return [
    `作者为“${author}”。请默认${levelOptionLabel}学生是第一次认识这位作者，不预设任何生平、时代或作品常识。`,
    `作者介绍与本文创作背景、心境分析合计控制在正常语速约 ${duration}，信息完整但不得挤占正文讲解。`,
    depth,
    "背景和心境分析必须服务于理解当前作品，并联系原文中具体的字句、意象、人物行动或语气，说明这些内容为什么会这样写；不要泛泛评价作者，也不要写成生平履历或年代清单。",
    "先区分可靠史实与文本分析：有可靠记载时可以说明具体创作背景；没有可靠记载时不得编造具体事件、时间、地点或动机，只能从原文证据出发，用“从这里可以感受到”“这可能反映出”等审慎表达分析作者心境。"
  ].join("\n");
}

function englishGuidedStudyExplanationMode(value: unknown): EnglishStudyExplanationMode {
  return value === "PARAGRAPH" || value === "FREEFORM" ? value : "SENTENCE";
}

function guidedStudyScene(value: unknown): GuidedStudyScene {
  return value === "DAODU" ? "DAODU" : value === "GUSHIWEN" ? "GUSHIWEN" : "ENGLISH";
}

function guidedStudyAuthorizationRoot(scene: GuidedStudyScene) {
  return scene === "DAODU"
    ? "daodu"
    : scene === "GUSHIWEN"
      ? "gushiwen-guided-study-material"
      : "english-guided-study-material";
}

function assertGuidedStudySourceLength(scene: GuidedStudyScene, sourceText: string) {
  if (scene === "DAODU" && sourceText.length > englishGuidedStudySourceTextMaxLength) {
    throw new AppException(
      40001,
      `阅读内容不能超过 ${englishGuidedStudySourceTextMaxLength.toLocaleString("zh-CN")} 个字符`,
      HttpStatus.BAD_REQUEST
    );
  }
}

function guidedStudyMaterialPromptVersion(scene: GuidedStudyScene) {
  return scene === "GUSHIWEN"
    ? gushiwenGuidedStudyMaterialPromptVersion
    : englishGuidedStudyMaterialPromptVersion;
}

function guidedStudyLevelProfile(
  scene: GuidedStudyScene,
  levelStandardName: string,
  levelOptionLabel: string,
  aiLevel: string
) {
  if (scene === "DAODU") {
    return readingGuideLevelProfile(levelStandardName, levelOptionLabel, aiLevel);
  }

  if (scene !== "GUSHIWEN") {
    return englishGuidedStudyLevelProfile(levelStandardName, levelOptionLabel, aiLevel);
  }

  const grade = Number(aiLevel.match(/^G(\d{1,2})$/)?.[1] ?? 3);
  const profile = grade <= 0
    ? "以亲子共读和听读感受为主，用非常简单的现代汉语讲画面、人物和情绪，通过重复朗读帮助记住名句，不使用术语。"
    : grade <= 2
      ? "用儿童能理解的短句讲清画面和大意，解释少量关键词，引导有节奏地熟读并记住重点句。"
      : grade <= 6
        ? "讲清创作背景、基本文意、重点字词、意象和情感，分层设置理解、熟读与背诵提示。"
        : grade <= 9
          ? "兼顾文言词义、句意、结构、写法和背景，帮助形成完整理解，并用线索回忆推进重点段落或全文背诵。"
          : grade <= 12
            ? "深入处理时代语境、典故、文言现象、章法、意象、情感和鉴赏，兼顾考试所需理解与准确背诵。"
            : "提供可靠的时代与文化背景、文本细读、章法和审美分析，解释古今关联，并设计有意义的诵读记忆线索。";

  return `${levelStandardName}：${levelOptionLabel}。${profile}最终目标是先真正理解，再做到部分背诵；适合全文背诵的作品应引导全文背诵。`;
}

function readingGuideLevelProfile(
  levelStandardName: string,
  levelOptionLabel: string,
  aiLevel: string
) {
  const grade = Number(aiLevel.match(/^G(\d{1,2})$/)?.[1] ?? 5);
  const profile = grade <= 2
    ? "使用短句和故事化表达，先说清人物、事件和最重要的感受，不堆叠背景知识或文学术语。"
    : grade <= 6
      ? "讲清内容梗概、关键背景、主要人物或观点，并用直白语言点出值得留意的情感与写法。"
      : grade <= 9
        ? "兼顾背景、结构、思想情感和典型写法，帮助学生带着明确问题进入完整阅读。"
        : grade <= 12
          ? "结合文本类型选择背景、结构、主题、语言和写作方法等角度，形成有证据的文学分析和阅读期待。"
          : "根据内容价值选择文化背景、思想脉络、叙事或论证结构、审美特点与现实关联，避免泛泛介绍。";

  return `${levelStandardName}：${levelOptionLabel}。${profile}`;
}

function readingGuideQuestionCount(value: unknown) {
  const numeric = Number(value);
  return readingGuideQuestionCounts.includes(numeric as (typeof readingGuideQuestionCounts)[number])
    ? numeric as (typeof readingGuideQuestionCounts)[number]
    : 5;
}

function guidedStudyPracticeScenarioSlug(scene: GuidedStudyScene) {
  return scene === "DAODU"
    ? "daodu-practice"
    : scene === "GUSHIWEN"
      ? "gushiwen-guided-study-practice"
      : "english-guided-study-practice";
}

function guidedStudySourceSegments(
  sourceText: string,
  explanationMode: EnglishStudyExplanationMode,
  scene: GuidedStudyScene
) {
  return scene === "DAODU"
    ? [{ id: "reading-guide", text: sourceText }]
    : buildGuidedStudySourceSegments(sourceText, explanationMode, scene);
}

function gushiwenTeachingPolicy(levelOptionLabel: string) {
  return [
    `当前学段为${levelOptionLabel}，全部讲解使用适合该年龄的简体中文。`,
    "必须加强作品时代、作者处境、写作缘起、文化常识或典故背景的介绍，但只使用可靠信息；不确定的信息明确省略，不得编造。",
    "整体教学要从理解原文自然推进到形成画面或逻辑线索、有感情诵读和逐步记住原文，但不要让每个片段机械重复全部步骤。根据各句特点，把画面顺序、关键词链、对仗结构、押韵节奏或情节发展自然融入老师会说出口的话；不要使用功能标签，也不要只说泛泛的“多读几遍”。",
    "作品较短或通常要求背诵时，把全文所需的记忆线索分散融入逐句理解；作品较长时把名句、核心段落和结构骨架融入对应讲解。结尾只自然收束全文，不再单独布置诵读或背诵任务。"
  ].join("\n");
}

function deriveGeneratedTitle(value: string) {
  const words = value.replace(/[^A-Za-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 7).join(" ");

  return words ? `${words} 带学` : "英文带学材料";
}

function englishGuidedStudyCoursewareTitle(contentTitle: string | undefined, sourceText: string) {
  return limitText(contentTitle?.trim() || deriveGeneratedTitle(sourceText), 120);
}

function guidedStudyCoursewareTitle(
  contentTitle: string | undefined,
  sourceText: string,
  scene: GuidedStudyScene
) {
  if (scene === "DAODU") {
    const excerpt = sourceText.replace(/\s+/g, "").slice(0, 12);
    return limitText(contentTitle?.trim() || (excerpt ? `${excerpt}…导读` : "开卷导读"), 120);
  }

  if (scene !== "GUSHIWEN") {
    return englishGuidedStudyCoursewareTitle(contentTitle, sourceText);
  }

  const excerpt = sourceText.replace(/\s+/g, "").slice(0, 12);
  return limitText(contentTitle?.trim() || (excerpt ? `${excerpt}…` : "古诗文带学材料"), 120);
}

export function englishGuidedStudyContentTitle(_coursewareTitle: string, contentValue: unknown) {
  const content = jsonObject(contentValue);

  if (content && Object.prototype.hasOwnProperty.call(content, "contentTitle")) {
    return stringValue(content.contentTitle);
  }

  return null;
}

export function englishGuidedStudyHasGeneratedTitleLeak(input: {
  closing: string;
  scripts: string[];
  sourceText: string;
  summary: string;
  title: string;
}) {
  const title = normalizeGeneratedTitleReference(input.title);
  const minimumLength = /[\u3400-\u9fff]/u.test(title) ? 1 : 4;

  if (title.length < minimumLength || normalizeGeneratedTitleReference(input.sourceText).includes(title)) {
    return false;
  }

  return [input.summary, ...input.scripts, input.closing]
    .some((value) => explicitlyReferencesGeneratedCoursewareTitle(value, title));
}

export function englishGuidedStudyFormalTitleSections(input: {
  closing: string;
  summary: string;
  title: string;
}) {
  const title = input.title.trim();

  if (!title || !/[A-Za-z]/.test(title)) {
    return {
      closing: input.closing,
      summary: input.summary
    };
  }

  const summary = input.summary.trim()
    ? hasFormalTitleMention(input.summary, title)
      ? input.summary
      : `${title}. ${input.summary}`.trim()
    : "";

  if (summary && !hasFormalTitleExplanation(summary, title)) {
    throw new FormalTitleIntroductionError();
  }

  const closingWithoutTitle = input.closing
    ? input.closing
        .replace(formalEnglishTitleRemovalPattern(title), " ")
        .replace(/\s+([,.;:!?。，；：！？])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .trim()
        .replace(/[\s,.;:!?。，；：！？]+$/g, "")
    : "";
  const closingBody = limitText(closingWithoutTitle, Math.max(0, 999 - title.length));

  return {
    closing: input.closing
      ? `${closingBody}${closingBody ? " " : ""}${title}`
      : "",
    summary
  };
}

function hasFormalTitleMention(value: string, title: string) {
  if (title.length <= 2) {
    return new RegExp(
      `^[\\s'"“‘]*${escapeRegExp(title)}(?=$|[\\s,.;:!?，。；：！？'"”’])`,
      "i"
    ).test(value);
  }

  return formalEnglishTitlePattern(title).test(value);
}

function formalEnglishTitleRemovalPattern(title: string) {
  if (title.length <= 2) {
    return new RegExp(
      `(?<![A-Za-z0-9])['"“‘]?${escapeRegExp(title)}['"”’]?[\\s,.;:!?，。；：！？]*$`,
      "i"
    );
  }

  return formalEnglishTitlePattern(title);
}

function formalEnglishTitlePattern(title: string) {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(title)}(?![A-Za-z0-9])`, "gi");
}

function hasFormalTitleExplanation(summary: string, title: string) {
  const explanation = summary
    .replace(formalEnglishTitlePattern(title), " ")
    .replace(/[\s,.;:!?，。；：！？'"“”‘’()（）《》]+/g, " ")
    .trim();
  const chineseCharacters = explanation.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  const englishWords = explanation.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
  const naturalEnglishVerbSource = "(?:describes?|shows?|presents?|captures?|centers?|contrasts?|explores?|highlights?|connects?|reflects?|is\\s+about|points?\\s+to)";
  const directChineseExplanationSignal = /标题|题目|意思|意为|含义|译为|理解为|可以理解|指的是|表达|暗示|呼应|关键词|这个词|这几个词|把(?:注意力|视线)|让(?:我们|人)想到|意味着/u.test(explanation);
  const naturalChineseExplanationSignal = /(?:标题|题目|这首诗|这篇(?:诗歌|文章|故事)|这段(?:文字|对话)|全文|开头)[^。！？]{0,60}(?:描写|呈现|展现|围绕|聚焦|点出|联系|对比)/u.test(summary);
  const directEnglishExplanationSignal = /\b(?:title|means?|meaning|suggests?|refers?|expresses?|implies?|evokes?|focuses?|literally|word|phrase)\b/i.test(explanation);
  const contentLinkedEnglishExplanationSignal = new RegExp(
    `\\b(?:(?:it|this)\\s+${naturalEnglishVerbSource}|(?:this\\s+)?(?:title|poem|article|story|passage|text|dialogue|conversation|chapter)\\b[^.!?]{0,120}\\b${naturalEnglishVerbSource})\\b`,
    "i"
  ).test(summary);
  const titleMatch = formalEnglishTitlePattern(title).exec(summary);
  const titleTail = titleMatch
    ? summary.slice(titleMatch.index + titleMatch[0].length).replace(/^[\s,.;:!?，。；：！？'"“”‘’()（）《》—–-]+/u, "")
    : "";
  const titleLedEnglishExplanationSignal = new RegExp(`^${naturalEnglishVerbSource}\\b`, "i").test(titleTail);
  const speakerSharingEnglishExplanationSignal = /\b(?:a|the)\s+(?:child|speaker|narrator|poet|author|writer|character)\s+shares?\b/i.test(summary);
  const naturalExplanationSignal = naturalChineseExplanationSignal ||
    contentLinkedEnglishExplanationSignal ||
    titleLedEnglishExplanationSignal ||
    speakerSharingEnglishExplanationSignal;
  const hasGenericLessonPhrase = /\b(?:welcome|today['’]?s\s+(?:english\s+)?lesson|english\s+lesson|let['’]?s\s+(?:begin|start))\b|欢迎|让我们开始|我们开始/u.test(explanation);
  const genericPhrasePassedOffAsTitleMeaning = /\b(?:title|word|phrase)\s+(?:means?|suggests?|refers?\s+to|expresses?|implies?)\s+(?:welcome|today['’]?s\s+(?:english\s+)?lesson|an?\s+english\s+lesson|let['’]?s\s+(?:begin|start))\b|(?:标题|题目|这个词|这几个词).{0,12}(?:意思|意为|含义|表达|意味着).{0,12}(?:欢迎|开始学习|英语课)/iu.test(explanation);

  if ((genericPhrasePassedOffAsTitleMeaning && !naturalExplanationSignal) ||
    (hasGenericLessonPhrase && !naturalExplanationSignal && !directChineseExplanationSignal && !directEnglishExplanationSignal)) {
    return false;
  }

  return (chineseCharacters >= 4 && (directChineseExplanationSignal || naturalChineseExplanationSignal)) ||
    (englishWords >= 4 && (directEnglishExplanationSignal || contentLinkedEnglishExplanationSignal || titleLedEnglishExplanationSignal || speakerSharingEnglishExplanationSignal));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function explicitlyReferencesGeneratedCoursewareTitle(value: string, title: string) {
  const text = normalizeGeneratedTitleReference(value);
  const directPrefixes = [
    "标题是",
    "标题为",
    "标题叫",
    "课件标题",
    "题目是",
    "题目为",
    "题为",
    "文章名",
    "篇名",
    "诗名",
    "故事名",
    "课文名",
    "titleis",
    "thetitleis"
  ];
  const namedSubjects = [
    "这节课",
    "本节课",
    "这堂课",
    "本堂课",
    "这门课程",
    "本课程",
    "这份课件",
    "本课件",
    "这篇文章",
    "本文",
    "这篇课文",
    "本课文",
    "这首诗",
    "这篇诗歌",
    "这个故事",
    "这部作品",
    "这篇篇章",
    "这段文本",
    "这份材料",
    "thislesson",
    "thelesson",
    "thiscourse",
    "thecourse",
    "thisarticle",
    "thearticle",
    "thistext",
    "thetext",
    "thisstory",
    "thestory",
    "thispoem",
    "thepoem",
    "thiswork",
    "thework"
  ];
  const namingVerbs = [
    "名为",
    "叫作",
    "叫做",
    "命名为",
    "题为",
    "是",
    "为",
    "iscalled",
    "istitled",
    "is"
  ];
  const suffixes = [
    "这个标题",
    "这一标题",
    "作为标题",
    "是课件标题",
    "是标题",
    "isthetitle",
    "asthetitle",
    "这篇文章",
    "这篇课文",
    "这首诗",
    "这篇诗歌",
    "这个故事",
    "这部作品",
    "这节课",
    "这门课程",
    "这份课件"
  ];

  return directPrefixes.some((prefix) => text.includes(`${prefix}${title}`))
    || namedSubjects.some((subject) => namingVerbs.some(
      (verb) => text.includes(`${subject}${verb}${title}`)
    ))
    || suffixes.some((suffix) => text.includes(`${title}${suffix}`));
}

function normalizeGeneratedTitleReference(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s"'“”‘’《》【】()[\]{}:：·•_—-]+/g, "");
}

class GeneratedCoursewareTitleLeakError extends AppException {
  constructor() {
    super(
      50201,
      "AI 将自动课件标题写入了带学文稿，请重新生成",
      HttpStatus.BAD_GATEWAY
    );
    this.name = "GeneratedCoursewareTitleLeakError";
  }
}

class FormalTitleIntroductionError extends AppException {
  constructor() {
    super(
      50201,
      "AI 未完整讲解正式英文标题，请重新生成",
      HttpStatus.BAD_GATEWAY
    );
    this.name = "FormalTitleIntroductionError";
  }
}

function limitText(value: string, maxLength: number) {
  const trimmed = value.trim();

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength - 1).trimEnd() : trimmed;
}

function roundSeconds(value: number) {
  return Math.max(0, Math.round(value * 100) / 100);
}

function invalidAiMaterialException() {
  return new AppException(50201, "AI 未返回有效英文带学材料，请稍后重试", HttpStatus.BAD_GATEWAY);
}

type EnglishGuidedStudyMaterialRecoveryFeedback = {
  issues: Array<{
    issueType:
      | "FEEDBACK_METADATA_LEAK"
      | "MISSING_SCRIPT"
      | "MISSING_SEGMENT";
    section?: "CLOSING" | "SCRIPT" | "SUMMARY";
    segmentId?: string;
  }>;
};

function hasEnglishGuidedStudyRecoveryMetadataLeak(value: string) {
  return /(?:校验反馈|反馈)\s*JSON|产品规则|硬性纠偏|上一次返回的\s*JSON|sourceSegmentsJson|unresolvedPointTerms|duplicatePointIds|POINTS_NOT_LOCATABLE|DUPLICATE_POINT_IDS|FEEDBACK_METADATA_LEAK|MISSING_(?:POINTS|SCRIPT|SEGMENT)|(?:segmentId|issueType)(?:["'”’]?\s*[:：]|\s*(?:是|为))/iu.test(value);
}

class IncompleteAiMaterialError extends AppException {
  constructor(readonly recoveryFeedback?: EnglishGuidedStudyMaterialRecoveryFeedback) {
    super(50201, "AI 未完整覆盖全文，请稍后重试", HttpStatus.BAD_GATEWAY);
    this.name = "IncompleteAiMaterialError";
  }
}

function incompleteAiMaterialException(feedback?: EnglishGuidedStudyMaterialRecoveryFeedback) {
  return new IncompleteAiMaterialError(feedback);
}

function isRetryableEnglishGuidedStudyMaterialValidationError(error: unknown) {
  return error instanceof AppException && (
    error.message === "AI 未返回有效英文带学材料，请稍后重试" ||
    error.message === "AI 未完整覆盖全文，请稍后重试"
  );
}

function englishGuidedStudyStructureRecoveryPolicy(languagePolicy: string, error?: unknown) {
  const recoveryFeedback = error instanceof IncompleteAiMaterialError
    ? error.recoveryFeedback
    : undefined;

  return [
    languagePolicy,
    "硬性纠偏：上一次返回的 JSON 无法解析或未完整覆盖当前批次。",
    "请从头完整返回当前批次；只输出单个合法、完整、闭合的 JSON 对象，sentences 必须逐项覆盖 sourceSegmentsJson 的所有 segmentId。",
    "points 只是可选的高亮增强项，每段可以是空数组；不要为了补 points 改写已经完整自然的 script。若输出 point，term 必须在对应 script 中自然讲解，服务端会自动保留能够稳定对齐的项。",
    recoveryFeedback
      ? `本次校验反馈 JSON：${JSON.stringify(recoveryFeedback)}`
      : "本次没有可用的结构化校验明细，请逐项自检全部片段。",
    recoveryFeedback
      ? "只针对反馈 JSON 中列出的片段或朗读区修正文稿内容，但返回时仍须完整输出当前批次；不要把校验反馈、segmentId、issueType 或产品规则写进 summary、每个 script 和 closing。"
      : "修正后仍须完整输出当前批次。"
  ].join("\n");
}

interface AudioTaskLike {
  id: string;
  status: string;
  errorCode?: string | null;
  errorMessage: string | null;
  providerPayload: Prisma.JsonValue | null;
  outputAudioAsset: {
    url: string;
    durationMs: number | null;
  } | null;
}

const englishGuidedStudyHeartbeatMs = 60 * 1_000;
const englishGuidedStudyGenerationConcurrency = 2;
const englishNarrationNodeMaxAttempts = 3;
const englishNarrationNodeRetryBaseDelayMs = 400;

export function isRetryableEnglishNarrationTask(task: {
  status: string;
  errorCode?: string | null;
}) {
  if (task.status !== "FAILED") {
    return false;
  }

  const code = task.errorCode?.trim().toUpperCase() ?? "";

  return (
    [
      "PROVIDER_NETWORK_ERROR",
      "PROVIDER_TIMEOUT",
      "R2_UPLOAD_FAILED",
      "R2_VERIFY_FAILED",
      "TTS_OUTPUT_DOWNLOAD_FAILED"
    ].includes(code) ||
    code.includes("HTTP_429") ||
    code.includes("HTTP_500") ||
    code.includes("HTTP_502") ||
    code.includes("HTTP_503") ||
    code.includes("THROTTL") ||
    code.includes("RATE_LIMIT") ||
    code.includes("TIMEOUT") ||
    code.includes("NETWORK")
  );
}

function isRetryableEnglishNarrationError(error: unknown) {
  const object = typeof error === "object" && error !== null
    ? error as { code?: unknown; cause?: unknown }
    : null;
  const cause = typeof object?.cause === "object" && object.cause !== null
    ? object.cause as { code?: unknown; message?: unknown }
    : null;
  const signal = [
    typeof object?.code === "string" ? object.code : "",
    error instanceof Error ? error.message : typeof error === "string" ? error : "",
    typeof cause?.code === "string" ? cause.code : "",
    typeof cause?.message === "string" ? cause.message : ""
  ].join(" ").toUpperCase();

  return [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ENETDOWN",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET",
    "SOCKET HANG UP",
    "NETWORK",
    "TIMED OUT",
    "TIMEOUT"
  ].some((token) => signal.includes(token));
}

function delay(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<void>
) {
  let nextIndex = 0;
  const workerCount = Math.min(values.length, Math.max(1, Math.floor(concurrency)));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(values[index]!, index);
    }
  }));
}

function audioUrlFromTask(task: AudioTaskLike) {
  return task.outputAudioAsset?.url ?? audioUrlFromPayload(task.providerPayload) ?? null;
}

function audioDurationMsFromTask(task: AudioTaskLike) {
  return task.outputAudioAsset?.durationMs ?? audioDurationMsFromPayload(task.providerPayload);
}

function audioUrlFromPayload(payload: Prisma.JsonValue | null): string | null {
  const object = jsonObject(payload);
  const output = jsonObject(object?.output);
  const audio = jsonObject(output?.audio);
  const raw = jsonObject(object?.raw);
  const rawOutput = jsonObject(raw?.output);
  const rawAudio = jsonObject(rawOutput?.audio);

  return (
    stringValue(object?.audioUrl) ??
    stringValue(object?.previewAudioUrl) ??
    stringValue(output?.url) ??
    stringValue(audio?.url) ??
    stringValue(rawOutput?.url) ??
    stringValue(rawAudio?.url) ??
    null
  );
}

function audioDurationMsFromPayload(payload: Prisma.JsonValue | null) {
  const object = jsonObject(payload);
  const output = jsonObject(object?.output);
  const audio = jsonObject(output?.audio);
  const usage = jsonObject(object?.usage);
  const seconds =
    numberValue(object?.audioDurationSeconds) ??
    numberValue(audio?.durationSeconds) ??
    numberValue(usage?.durationSeconds);

  return (
    numberValue(object?.audioDurationMs) ??
    numberValue(object?.durationMs) ??
    numberValue(audio?.durationMs) ??
    numberValue(usage?.audioDurationMs) ??
    (seconds ? Math.round(seconds * 1000) : null)
  );
}

function buildEditedMaterialContent(
  material: EnglishGuidedStudyMaterialRecord,
  input: {
    script: string;
    sentenceId: string | null;
    targetType: "INTRO" | "SENTENCE" | "SUMMARY";
  }
) {
  const object = { ...(jsonObject(material.content) ?? {}) };
  delete object.narrationTimelineV2;
  delete object.practiceGeneration;
  delete object.practiceGenerationJob;
  delete object.practiceGenerationProgress;
  object.questions = [];
  const scene = guidedStudyScene(object.scene);
  const sentences = editableContentSentences(object.sentences);
  let summary = material.summary;
  let closing = scene === "DAODU"
    ? ""
    : stringValue(object.closing) ?? defaultEnglishGuidedStudyClosing();
  let readingGuideNarration: string | null = null;

  if (input.targetType === "INTRO") {
    summary = input.script;
  } else if (input.targetType === "SUMMARY") {
    closing = input.script;
  } else {
    if (!input.sentenceId) {
      throw new AppException(40001, "请选择要修改的原文句子", HttpStatus.BAD_REQUEST);
    }

    if (scene === "DAODU") {
      if (/\n\s*\n/u.test(input.script)) {
        throw new AppException(40001, "单段文稿中不能新增空行，请分别修改自然段", HttpStatus.BAD_REQUEST);
      }
      const paragraphIndex = readingGuideParagraphIndex(input.sentenceId);
      const paragraphs = splitReadingGuideParagraphs(material.narration);

      if (paragraphIndex === null || !paragraphs[paragraphIndex]) {
        throw new AppException(40401, "要修改的导读自然段不存在", HttpStatus.NOT_FOUND);
      }

      paragraphs[paragraphIndex] = input.script;
      readingGuideNarration = paragraphs.join("\n\n");
      object.guideScript = readingGuideNarration;
      if (sentences[0]) {
        sentences[0] = {
          ...sentences[0],
          script: readingGuideNarration,
          explanation: readingGuideNarration
        };
        object.sentences = sentences;
      }
    } else {
      const sentenceIndex = sentences.findIndex((sentence) => stringValue(sentence.id) === input.sentenceId);

      if (sentenceIndex < 0) {
        throw new AppException(40401, "要修改的原文句子不存在", HttpStatus.NOT_FOUND);
      }

      sentences[sentenceIndex] = {
        ...sentences[sentenceIndex],
        script: input.script
      };
      object.sentences = sentences;
    }
  }

  const narration = scene === "DAODU"
    ? readingGuideNarration ?? material.narration
    : buildEditedNarration(summary, sentences, closing);

  return {
    summary,
    narration,
    content: {
      ...object,
      summary,
      closing,
      narration,
      audioUrl: null,
      audioTaskId: null
    } as Prisma.InputJsonValue
  };
}

function alignGushiwenContentTeachingPoints(value: unknown) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item, sentenceIndex) => {
    const sentence = jsonObject(item);
    const script = stringValue(sentence?.script) ?? stringValue(sentence?.explanation);
    const sourceText = stringValue(sentence?.text);

    if (!sentence || !script || !sourceText) {
      return item;
    }

    const candidates = Array.isArray(sentence.points)
      ? sentence.points.map((pointValue, pointIndex) => {
          const point = jsonObject(pointValue);
          const term = stringValue(point?.term);

          return point && term
            ? {
                ...point,
                id: `p${sentenceIndex + 1}-${pointIndex + 1}`,
                term,
                meaning: stringValue(point.meaning) ?? ""
              }
            : null;
        }).filter((point): point is Record<string, unknown> & {
          id: string;
          meaning: string;
          term: string;
        } => Boolean(point))
      : [];
    const points = alignEnglishNarrationPointsToScript(script, candidates, sourceText)
      .map((point, pointIndex) => ({
        ...point,
        id: `p${sentenceIndex + 1}-${pointIndex + 1}`
      }));

    return {
      ...sentence,
      points
    };
  });
}

function narrationAudioTaskIds(content: Prisma.JsonValue, materialAudioTaskId: string | null) {
  const timeline = jsonObject(jsonObject(content)?.narrationTimelineV2);
  const nodes = Array.isArray(timeline?.nodes) ? timeline.nodes : [];
  const taskIds = nodes
    .map((value) => stringValue(jsonObject(value)?.audioTaskId))
    .filter((value): value is string => Boolean(value));

  if (materialAudioTaskId) {
    taskIds.push(materialAudioTaskId);
  }

  return Array.from(new Set(taskIds));
}

function readAlongAudioTaskIds(content: Prisma.JsonValue) {
  const readAlong = jsonObject(jsonObject(content)?.readAlong);
  const nodes = Array.isArray(readAlong?.nodes) ? readAlong.nodes : [];

  return Array.from(new Set(
    nodes
      .map((value) => stringValue(jsonObject(value)?.audioTaskId))
      .filter((value): value is string => Boolean(value))
  ));
}

function readAlongAudioAssetId(content: Prisma.JsonValue) {
  return stringValue(jsonObject(jsonObject(content)?.readAlong)?.audioAssetId);
}

function readAlongJobCleanup(contentValue: unknown) {
  const content = jsonObject(contentValue);
  const job = englishGuidedStudyJobFromValue<EnglishGuidedStudyReadAlongJobInput>(
    content?.readAlongGenerationJob
  );
  const input = jsonObject(job?.input);

  if (!input) {
    return { audioAssetIds: [], taskIds: [] };
  }

  if (input.mode === "UPLOAD") {
    const audioAssetId = stringValue(jsonObject(input.audioAsset)?.id);

    return {
      audioAssetIds: audioAssetId ? [audioAssetId] : [],
      taskIds: []
    };
  }

  if (input.mode !== "GENERATE" || !Array.isArray(input.generatedNodes)) {
    return { audioAssetIds: [], taskIds: [] };
  }

  return {
    audioAssetIds: [],
    taskIds: Array.from(new Set(
      input.generatedNodes
        .map((value) => stringValue(jsonObject(value)?.audioTaskId))
        .filter((value): value is string => Boolean(value))
    ))
  };
}

function mergeReadAlongCleanup(
  left: { audioAssetIds: string[]; taskIds: string[] },
  right: { audioAssetIds: string[]; taskIds: string[] }
) {
  return {
    audioAssetIds: Array.from(new Set([...left.audioAssetIds, ...right.audioAssetIds])),
    taskIds: Array.from(new Set([...left.taskIds, ...right.taskIds]))
  };
}

function contentWithoutReadAlongTrack(content: Record<string, unknown>) {
  return {
    ...content,
    readAlong: null
  };
}

function contentWithoutReadAlongArtifacts(content: Record<string, unknown>) {
  const nextContent: Record<string, unknown> = {
    ...contentWithoutReadAlongTrack(content)
  };

  delete nextContent.readAlongGeneration;
  delete nextContent.readAlongGenerationJob;
  delete nextContent.readAlongGenerationProgress;

  return nextContent;
}

type ReadAlongMaterialSource = Pick<
  EnglishGuidedStudyMaterialRecord,
  "content" | "sourceText" | "title"
>;

function readAlongSourceUnits(
  material: ReadAlongMaterialSource,
  checkpointNodes?: Array<Pick<EnglishReadAlongNode, "text" | "unitType">>
) {
  const content = jsonObject(material.content);
  const scene = guidedStudyScene(content?.scene);

  if (scene === "DAODU") {
    throw new AppException(40001, "开卷导读不提供跟读训练", HttpStatus.BAD_REQUEST);
  }

  const sourceText = normalizeEnglishStudySourceText(material.sourceText);

  if (!sourceText) {
    throw new AppException(40001, "学习内容正文不能为空", HttpStatus.BAD_REQUEST);
  }

  const contentTitle = englishGuidedStudyContentTitle(material.title, content);
  const legacyCheckpointTitle =
    content && !Object.prototype.hasOwnProperty.call(content, "contentTitle")
      ? checkpointNodes?.find((node) => node.unitType === "TITLE")?.text ?? null
      : null;
  const sentences = buildGuidedStudySourceSegments(
    sourceText,
    englishGuidedStudyExplanationMode(content?.explanationMode),
    scene
  );

  return buildEnglishReadAlongSourceUnits({
    author: stringValue(content?.author),
    sentences,
    title: contentTitle ?? legacyCheckpointTitle
  });
}

function sameReadAlongSource(left: ReadAlongMaterialSource, right: ReadAlongMaterialSource) {
  const comparableUnits = (material: ReadAlongMaterialSource) =>
    readAlongSourceUnits(material).map((unit) => [unit.type, unit.text]);

  return JSON.stringify(comparableUnits(left)) === JSON.stringify(comparableUnits(right));
}

function readAlongTrackMatchesSource(material: ReadAlongMaterialSource) {
  const track = jsonObject(jsonObject(material.content)?.readAlong);

  if (!track) {
    return true;
  }

  const cues = Array.isArray(track.cues) ? track.cues : [];
  const nodes = Array.isArray(track.nodes) ? track.nodes : [];
  const legacyTitleUnits = [...nodes, ...cues]
    .map((value) => jsonObject(value))
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .map((value) => ({
      text: stringValue(value.text) ?? "",
      unitType: value.unitType === "TITLE" ? "TITLE" as const : "BODY" as const
    }));
  const expectedUnits = readAlongSourceUnits(material, legacyTitleUnits);
  const expected = (track.version === 1
    ? expectedUnits.filter((unit) => unit.type === "BODY")
    : expectedUnits
  ).map((unit) => [unit.type, unit.text]);
  const actual = cues.map((value) => {
    const cue = jsonObject(value);

    return [
      track.version === 1 ? "BODY" : stringValue(cue?.unitType),
      stringValue(cue?.text)
    ];
  });

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return false;
  }

  if (track.version !== 2 || track.source !== "GENERATED") {
    return true;
  }

  const generatedNodes = nodes.map((value) => {
    const node = jsonObject(value);

    return [stringValue(node?.unitType), stringValue(node?.text)];
  });

  return JSON.stringify(generatedNodes) === JSON.stringify(expected);
}

function currentReadAlongContent(material: ReadAlongMaterialSource) {
  if (readAlongTrackMatchesSource(material)) {
    return material.content;
  }

  const content = jsonObject(material.content);

  return content
    ? contentWithoutReadAlongTrack(content) as Prisma.JsonValue
    : material.content;
}

function normalizedEnglishGuidedStudyAudioInput(
  dto: GenerateEnglishGuidedStudyAudioDto,
  billingRequestId: string
): GenerateEnglishGuidedStudyAudioDto {
  const modelAlias = dto.modelAlias?.trim();
  const voiceAssetId = dto.voiceAssetId?.trim();
  const voice = dto.voice?.trim();
  const format = dto.format?.trim();

  return {
    billingConfirmed: true,
    billingRequestId,
    billingRevision: dto.billingRevision?.trim() || "",
    ...(modelAlias ? { modelAlias } : {}),
    ...(voiceAssetId ? { voiceAssetId } : {}),
    ...(voice ? { voice } : {}),
    ...(dto.speed !== undefined ? { speed: dto.speed } : {}),
    ...(dto.pitch !== undefined ? { pitch: dto.pitch } : {}),
    ...(dto.volume !== undefined ? { volume: dto.volume } : {}),
    ...(format ? { format } : {}),
    ...(dto.sampleRate !== undefined ? { sampleRate: dto.sampleRate } : {})
  };
}

function englishGuidedStudyMaterialNarrationDrafts(
  material: EnglishGuidedStudyMaterialRecord
) {
  const sourceContent = jsonObject(material.content) ?? {};
  const scene = guidedStudyScene(sourceContent.scene);
  const content = scene === "GUSHIWEN"
    ? {
        ...sourceContent,
        sentences: alignGushiwenContentTeachingPoints(sourceContent.sentences)
      }
    : sourceContent;
  const sourceSentences = narrationNodeSourceSentences(content.sentences);

  if (scene === "DAODU") {
    return buildReadingGuideNarrationNodeDrafts(
      sourceSentences[0]?.script ?? material.narration
    );
  }

  return buildEnglishNarrationNodeDrafts(
    material.summary,
    sourceSentences,
    stringValue(content.closing) ?? defaultGuidedStudyClosing(scene)
  );
}

function narrationNodeSourceSentences(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppException(50201, "带学材料缺少逐句文稿，无法生成精准音频", HttpStatus.BAD_GATEWAY);
  }

  return value.map((item) => {
    const sentence = jsonObject(item);
    const id = stringValue(sentence?.id);
    const text = stringValue(sentence?.text);
    const script = stringValue(sentence?.script) ?? stringValue(sentence?.explanation);

    if (!sentence || !id || !text || !script) {
      throw new AppException(50201, "带学材料逐句文稿不完整，无法生成精准音频", HttpStatus.BAD_GATEWAY);
    }

    const points = Array.isArray(sentence.points)
      ? sentence.points.map((pointValue) => {
          const point = jsonObject(pointValue);
          return {
            id: stringValue(point?.id) ?? "",
            term: stringValue(point?.term) ?? "",
            meaning: stringValue(point?.meaning) ?? "",
            note: stringValue(point?.note) ?? ""
          };
        }).filter((point) => point.id && point.term)
      : [];

    return {
      id,
      text,
      script,
      explanation: stringValue(sentence.explanation) ?? "",
      grammarFocus: stringValue(sentence.grammarFocus) ?? "",
      points
    };
  });
}

function editableContentSentences(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({ ...(jsonObject(item) ?? {}) }));
}

function buildEditedNarration(
  summary: string,
  sentences: Array<Record<string, unknown>>,
  closing: string
) {
  const scripts = sentences
    .map((sentence) => stringValue(sentence.script) ?? stringValue(sentence.explanation))
    .filter((script): script is string => Boolean(script));

  return [
    summary,
    ...scripts,
    closing
  ]
    .filter((part) => part.trim())
    .join("\n");
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(number) ? number : null;
}

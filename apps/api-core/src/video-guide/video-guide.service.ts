import { getPersonalCreditBalance, getPersonalWallet, reservePersonalCredits, settlePersonalCredits } from "../wallet/personal-credits.js";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { HttpStatus, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import {
  AiService,
  isRetryableAiProviderGenerationError,
  type AttributionContext
} from "../ai/ai.service.js";
import {
  AudioService,
  audioProviderErrorCode,
  isRetryableAudioProviderError,
  type AudioTaskAttributionContext
} from "../audio/audio.service.js";
import { AppException } from "../common/app-exception.js";
import { projectPublicCourseMaterial } from "../courses/course-domain.js";
import { CourseReviewService } from "../courses/course-review.service.js";
import { LearnerAccessService } from "../profiles/learner-access.service.js";
import { LearnerActivityService } from "../profiles/learner-activity.service.js";
import { resolveHistoryProfileWhere } from "../profiles/history-profile-filter.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import {
  CheckVideoGuideUploadDto,
  CreateVideoGuideDraftDto,
  CreateVideoGuideLessonDto,
  EstimateVideoGuideNarrationAudioDto,
  GenerateVideoGuideNarrationAudioDto,
  GenerateVideoGuidePracticeDto,
  GenerateVideoGuideSubtitleDto,
  ReadVideoGuideSubtitleTextDto,
  UpdateVideoGuideLessonSubtitleDto,
  UpdateVideoGuideNarrationScriptDto,
  videoGuideSubtitleMaxBytes,
  videoGuideSubtitleTextMaxLength
} from "./dto/video-guide.dto.js";
import {
  extractVideoGuideAsrAudio,
  extractVideoGuideAsrAudioFromBuffer,
  isVideoGuideWebPlaybackAsset,
  shouldTranscodeVideoGuideMediaForWeb,
  transcodeVideoGuideMediaToWebMp4,
  videoGuideWebPlaybackOriginalName
} from "./video-guide-media-transcode.js";
import { videoGuideMediaMaxBytesFor } from "./video-guide-upload-limits.js";
import { createVideoGuideLessonTitle } from "./video-guide-title.js";
import {
  videoGuideAsrCacheFromAsset,
  videoGuideAsrCacheObjectKey,
  type VideoGuideAsrCache
} from "./video-guide-asr-cache.js";
import {
  createVideoGuideSubtitleCheckpoint,
  mergeVideoGuideSubtitleCheckpointContent,
  shouldCleanupVideoGuideSubtitleAsrObject,
  videoGuideSubtitleCheckpointFromValue,
  type VideoGuideSubtitleCheckpoint
} from "./video-guide-subtitle-checkpoint.js";
import {
  resolveVideoGuideSubtitleRecognitionTimeoutMs,
  resolveVideoGuideSubtitleRecoveryStaleMs,
  videoGuideSubtitleRecognitionDeadline,
  videoGuideSubtitleRecognitionEstimatedPercent
} from "./video-guide-subtitle-runtime.js";
import {
  createNarrationAudioProgress,
  mergeNarrationAudioProgressContent,
  mergeNarrationGenerationLeaseContent,
  narrationGenerationLeaseMatches,
  updateNarrationAudioProgress,
  verifiedNarrationAudioFromTask,
  type NarrationAudioProgress
} from "./video-guide-narration-progress.js";
import { VideoGuideNarrationTtsRateLimiter } from "./video-guide-narration-rate-limit.js";
import { resumableNarrationTtsCheckpointId } from "./video-guide-narration-resume.js";
import {
  cumulativeNarrationTtsBilledCredits,
  narrationTtsAttemptActualCredits,
  narrationTtsBillingRevision,
  narrationTtsCreditsForCompletedNodes,
  remainingNarrationTtsCredits,
  successfulNarrationNodeIds
} from "./video-guide-narration-billing.js";
import {
  NarrationBatchOutputError,
  VIDEO_GUIDE_NARRATION_BATCH_SIZE,
  createNarrationBatches,
  mapWithConcurrency,
  runAdaptiveNarrationBatch
} from "./video-guide-narration-batches.js";
import {
  mergeNarrationGenerationCheckpoint,
  mergeNarrationGenerationCheckpointContent,
  narrationGenerationCheckpointFromContent,
  narrationGenerationSourceHash,
  type NarrationGenerationCheckpoint,
  type NarrationGenerationMetadata
} from "./video-guide-narration-checkpoint.js";
import {
  mergeEditedNarrationDraftContent,
  mergeVideoGuideScriptDraftContent,
  narrationDraftFromContent,
  narrationScriptCharacterCount,
  narrationTextForTts,
  narrationTtsDraftFromContent,
  narrationTtsScriptCharacterCount,
  narrationTimelineForDerivedContent,
  normalizeNarrationScript,
  videoGuideScriptIsReady
} from "./video-guide-generation-state.js";
import {
  resolveVideoGuideNarrationVoiceSelection,
  synthesizeVideoGuideNarrationTimeline
} from "./video-guide-narration-synthesis.js";
import {
  createVideoGuideOperationProgress,
  failedVideoGuideOperationProgress,
  isActiveVideoGuideOperationProgress,
  mergeVideoGuideOperationProgressContent,
  updateVideoGuideOperationProgress,
  videoGuideOperationProgressFromValue,
  VideoGuideMediaUploadProgressStore,
  type VideoGuideOperationProgressKey
} from "./video-guide-operation-progress.js";
import {
  createVideoGuideOperationJob,
  leaseVideoGuideOperationJob,
  mergeVideoGuideOperationJobContent,
  shouldRecoverVideoGuideOperation,
  videoGuideOperationAttemptMatches,
  videoGuideOperationJobFromValue,
  type VideoGuideOperationJob,
  type VideoGuideOperationJobKey
} from "./video-guide-operation-job.js";

interface VideoGuideLessonRecord {
  id: string;
  userId: string;
  learnerId: string | null;
  title: string;
  mediaName: string;
  mediaType: string;
  mediaMimeType: string | null;
  mediaSizeBytes: number;
  mediaUrl: string | null;
  mediaStorageKey: string | null;
  subtitleName: string | null;
  subtitleFormat: string | null;
  subtitleSizeBytes: number | null;
  subtitleUrl: string | null;
  subtitleStorageKey: string | null;
  status: string;
  shareToken: string;
  content: Prisma.JsonValue;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

export interface UploadedVideoGuideFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface SubtitleCue {
  endSeconds?: number;
  sentenceId?: string;
  startSeconds?: number;
  text: string;
  timeRange: string;
}

interface GuideWord {
  id: string;
  word: string;
  phonetic: string;
  meaning: string;
  note: string;
  subtitle?: string;
  timeRange?: string;
  appearsAt: string;
  appearsAtSeconds?: number;
  endSeconds?: number;
}

interface TeacherSegment {
  id: string;
  timeRange: string;
  startSeconds?: number;
  endSeconds?: number;
  subtitle: string;
  explanation: string;
}

type NarrationTimelineNodeType = "INTRO" | "SENTENCE" | "SUMMARY";

interface NarrationOverlay {
  text: string;
  subText?: string;
}

interface NarrationChunkDraft {
  id: string;
  type: string;
  text: string;
  overlay?: NarrationOverlay | null;
}

interface NarrationTimelineNodeDraft {
  id: string;
  type: NarrationTimelineNodeType;
  title: string;
  script: string;
  chunks: NarrationChunkDraft[];
  sentenceId?: string;
  timeRange?: string;
  startSeconds?: number;
  endSeconds?: number;
  subtitle?: string;
}

interface NarrationScriptEditJob {
  version: 1;
  status: "RUNNING" | "CLEANUP_PENDING";
  ownerId: string;
  requestId: string;
  operationKey: string;
  estimatedCredits: number;
  nodeId: string;
  originalScript: string;
  script: string;
  revision: string;
  createdAt: string;
  updatedAt: string;
}

interface NarrationTimelineNode extends NarrationTimelineNodeDraft {
  audioTaskId: string;
  audioAssetId: string;
  audioUrl: string;
  audioObjectKey: string;
  audioSizeBytes: number;
  audioSha256: string;
  durationMs?: number;
}

interface NarrationTtsJobInput {
  billedCreditsBeforeAttempt?: number;
  checkpointId?: string;
  draftRevision?: string;
  narrationTtsModelAlias: string;
  narrationVoice: string;
}

interface GuideQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

interface RepeatLine {
  id: string;
  timeRange: string;
  startSeconds?: number;
  endSeconds?: number;
  text: string;
  hint: string;
}

interface VideoGuideAssetResponseRecord {
  id: string;
  assetType: string;
  hash: string;
  sizeBytes: number;
  mimeType: string;
  mediaType: string | null;
  subtitleFormat: string | null;
  storageProvider: string;
  objectKey: string;
  url: string;
  asrObjectKey: string | null;
  asrMimeType: string | null;
  asrSizeBytes: number | null;
  asrPreparedAt: Date | null;
}

interface CreateVideoGuideAssetReferenceInput {
  assetId: string;
  originalName: string;
  source: "UPLOAD" | "GENERATED";
  userId: string;
}

interface CreateOrReferenceVideoGuideAssetInput {
  asrCache?: VideoGuideAsrCache;
  assetType: "MEDIA" | "SUBTITLE";
  hash: string;
  mediaType?: "VIDEO" | "AUDIO";
  mimeType: string;
  objectKey: string;
  originalName: string;
  sizeBytes: number;
  source: "UPLOAD" | "GENERATED";
  storageProvider: "LOCAL" | "S3";
  subtitleFormat?: "SRT" | "ASS";
  url: string;
  userId: string;
}

export interface VideoGuideBillingItem {
  code: string;
  description: string;
  estimatedCredits: number;
  name: string;
}

export interface VideoGuideBillingEstimate {
  availableCredits: number;
  enoughCredits: boolean;
  estimatedCredits: number;
  items: VideoGuideBillingItem[];
  operation:
    | "VIDEO_GUIDE_SUBTITLE"
    | "VIDEO_GUIDE_LESSON"
    | "VIDEO_GUIDE_NARRATION_TTS"
    | "VIDEO_GUIDE_PRACTICE";
  revision?: string;
  title: string;
}

const stageNames = ["自主视听", "互动讲解", "词语巩固", "随堂练习", "跟读训练"];
const generationQueuedDelayMs = 600;
const megabyte = 1024 * 1024;
const allowedMediaMimeTypes = new Map<string, "VIDEO" | "AUDIO">([
  ["video/mp4", "VIDEO"],
  ["video/webm", "VIDEO"],
  ["video/quicktime", "VIDEO"],
  ["video/x-matroska", "VIDEO"],
  ["audio/mpeg", "AUDIO"],
  ["audio/mp3", "AUDIO"],
  ["audio/wav", "AUDIO"],
  ["audio/x-wav", "AUDIO"],
  ["audio/webm", "AUDIO"],
  ["audio/ogg", "AUDIO"],
  ["audio/aac", "AUDIO"],
  ["audio/mp4", "AUDIO"],
  ["audio/flac", "AUDIO"],
  ["audio/x-flac", "AUDIO"]
]);

const mockContent = {
  summary: "这段内容讲的是：学习者如何通过例子、证据和反复修正，逐步从零散信息中看出规律，并形成自己的结论。",
  stageNames,
  words: [
    {
      id: "context",
      word: "context",
      phonetic: "/ˈkɒntekst/",
      meaning: "语境；背景",
      note: "听到观点或例子时，先判断它所在的上下文。",
      appearsAt: "00:38",
      appearsAtSeconds: 38
    },
    {
      id: "evidence",
      word: "evidence",
      phonetic: "/ˈevɪdəns/",
      meaning: "证据；依据",
      note: "老师会用这个词提醒学习者关注论点背后的事实。",
      appearsAt: "01:16",
      appearsAtSeconds: 76
    },
    {
      id: "assume",
      word: "assume",
      phonetic: "/əˈsuːm/",
      meaning: "假设；以为",
      note: "常出现在转折前，表示说话人准备修正一个直觉判断。",
      appearsAt: "02:05",
      appearsAtSeconds: 125
    },
    {
      id: "pattern",
      word: "pattern",
      phonetic: "/ˈpætən/",
      meaning: "模式；规律",
      note: "串讲时会把零散信息整理成可以复述的规律。",
      appearsAt: "03:12",
      appearsAtSeconds: 192
    },
    {
      id: "conclusion",
      word: "conclusion",
      phonetic: "/kənˈkluːʒn/",
      meaning: "结论",
      note: "结尾处通常承接前面的例子和证据。",
      appearsAt: "04:24",
      appearsAtSeconds: 264
    }
  ],
  teacherSegments: [
    {
      id: "opening",
      timeRange: "00:00 - 00:42",
      startSeconds: 0,
      endSeconds: 42,
      subtitle: "The speaker opens with a question about how people learn from repeated examples.",
      explanation: "开头不是在给定义，而是在抛问题。孩子可以先抓住 repeated examples 这个线索，它告诉我们后面会讲通过重复例子形成理解。"
    },
    {
      id: "evidence",
      timeRange: "00:42 - 02:10",
      startSeconds: 42,
      endSeconds: 130,
      subtitle: "Then she brings in evidence and compares two ways of making assumptions.",
      explanation: "这一段重点听 evidence 和 assume。老师串讲时会暂停在 assume 前后，因为这里的逻辑是：先有一个假设，再用证据检查它是否可靠。"
    },
    {
      id: "pattern",
      timeRange: "02:10 - 03:58",
      startSeconds: 130,
      endSeconds: 238,
      subtitle: "The examples slowly reveal a pattern instead of giving the conclusion first.",
      explanation: "这里不要逐句翻译。更好的听法是找 pattern：例子重复出现，孩子需要说出这些例子共同证明了什么。"
    },
    {
      id: "closing",
      timeRange: "03:58 - 05:00",
      startSeconds: 238,
      endSeconds: 300,
      subtitle: "The final part turns the pattern into a short conclusion.",
      explanation: "结尾的 conclusion 是对全文的收束。复述时可以用一句话说：作者认为理解不是一次完成的，而是在例子、证据和修正中形成。"
    }
  ],
  questions: [
    {
      id: "q1",
      question: "context 在这段内容里更接近哪个意思？",
      options: ["视频画面", "语境和背景", "最终答案", "字幕格式"],
      answer: 1,
      explanation: "context 指帮助理解信息的背景，而不是画面本身。"
    },
    {
      id: "q2",
      question: "speaker 提到 evidence 时，主要想让学习者关注什么？",
      options: ["观点背后的依据", "单词的拼写", "视频的长度", "老师的声音"],
      answer: 0,
      explanation: "evidence 是支撑判断的证据，常用来检查一个假设是否可靠。"
    },
    {
      id: "q3",
      question: "assume 通常表示什么动作？",
      options: ["确认事实", "做出假设", "开始播放", "删除字幕"],
      answer: 1,
      explanation: "assume 是先做一个假设，后面可能会被证据修正。"
    },
    {
      id: "q4",
      question: "pattern 在串讲中为什么重要？",
      options: ["帮助找到规律", "只用于描述颜色", "表示音量大小", "表示文件格式"],
      answer: 0,
      explanation: "pattern 能把多个例子连接起来，形成可复述的规律。"
    },
    {
      id: "q5",
      question: "结尾的 conclusion 通常承担什么功能？",
      options: ["提出新词", "收束全文", "隐藏字幕", "切换账号"],
      answer: 1,
      explanation: "conclusion 是对前面观点、例子和证据的总结。"
    },
    {
      id: "q6",
      question: "自主视听后，让孩子选择 1 到 10 的比例，目的是？",
      options: ["记录理解自评", "选择视频清晰度", "设置文件大小", "跳过练习"],
      answer: 0,
      explanation: "自评能帮助系统判断后续讲解要偏基础还是偏深入。"
    },
    {
      id: "q7",
      question: "词语巩固阶段主要使用什么形式？",
      options: ["单词卡片逐一展示", "隐藏所有讲解", "修改视频文件", "跳过跟读"],
      answer: 0,
      explanation: "词语巩固会把互动讲解里讲过的单词或短语做成卡片，帮助孩子回顾。"
    },
    {
      id: "q8",
      question: "互动讲解不应该只是？",
      options: ["老师串讲", "同步字幕", "简单逐句翻译", "按节奏暂停"],
      answer: 2,
      explanation: "需求强调像老师串讲一样解释结构和逻辑，而不是简单翻译。"
    },
    {
      id: "q9",
      question: "跟读阶段用户可以选择什么？",
      options: ["是否打开字幕", "是否修改管理员", "是否切换支付方式", "是否删除课程"],
      answer: 0,
      explanation: "跟读时可以根据孩子能力决定打开或关闭字幕。"
    },
    {
      id: "q10",
      question: "家长生成课件后，孩子通常通过什么进入学习？",
      options: ["后台管理菜单", "分享学习页面", "数据库控制台", "支付回调地址"],
      answer: 1,
      explanation: "这个场景的核心是家长生成课件，再分享给孩子学习。"
    }
  ],
  repeatLines: [
    {
      id: "r1",
      timeRange: "00:18 - 00:28",
      startSeconds: 18,
      endSeconds: 28,
      text: "We learn faster when examples repeat in a clear context.",
      hint: "注意 faster 和 clear context 的重音。"
    },
    {
      id: "r2",
      timeRange: "01:12 - 01:24",
      startSeconds: 72,
      endSeconds: 84,
      text: "Evidence helps us check what we assume at first.",
      hint: "helps us 可以连读，assume 前稍作停顿。"
    },
    {
      id: "r3",
      timeRange: "03:10 - 03:22",
      startSeconds: 190,
      endSeconds: 202,
      text: "A pattern becomes easier to see after the third example.",
      hint: "pattern 和 after the third example 是信息重点。"
    }
  ]
} satisfies Prisma.InputJsonValue;

@Injectable()
export class VideoGuideService implements OnModuleDestroy, OnModuleInit {
  private readonly prisma = getPrismaClient();
  private readonly logger = new Logger(VideoGuideService.name);
  private readonly mediaUploadProgress = new VideoGuideMediaUploadProgressStore();
  private readonly narrationTtsRateLimiter = new VideoGuideNarrationTtsRateLimiter();
  private recoveryInterval: ReturnType<typeof setInterval> | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryRunning = false;

  constructor(
    @Inject(AudioService) private readonly audioService: AudioService,
    @Inject(AiService) private readonly aiService: AiService,
    @Inject(CourseReviewService) private readonly courseReviewService?: CourseReviewService,
    @Inject(LearnerAccessService) private readonly learnerAccessService?: LearnerAccessService,
    @Inject(LearnerActivityService) private readonly learnerActivityService?: LearnerActivityService
  ) {}

  onModuleInit() {
    this.recoveryTimer = setTimeout(() => {
      this.runBackgroundTask("恢复视频导学后台任务", () => this.recoverVideoGuideOperations());
    }, 1_000);
    this.recoveryTimer.unref?.();
    this.recoveryInterval = setInterval(() => {
      this.runBackgroundTask("巡检视频导学后台任务", () => this.recoverVideoGuideOperations());
    }, videoGuideRecoveryIntervalMs());
    this.recoveryInterval.unref?.();
  }

  async onModuleDestroy() {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
    }

    await this.narrationTtsRateLimiter.close();
  }

  private runBackgroundTask(label: string, task: () => Promise<void>) {
    void task().catch((error: unknown) => {
      this.logger.error(`${label}失败`, error instanceof Error ? error.stack : String(error));
    });
  }

  private async recordCourseMaterialChange(materialId: string) {
    if (!this.courseReviewService) {
      return;
    }

    try {
      await this.courseReviewService.recordMaterialChange("VIDEO_GUIDE", materialId);
    } catch (error) {
      this.logger.warn(
        `记录视频课件变更失败，将在审核列表对账时重试：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async checkUploadedAsset(userId: string, dto: CheckVideoGuideUploadDto) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const hash = normalizeSha256(dto.hash);
    const originalName = normalizeOriginalName(dto.originalName);
    const asset = await this.prisma.videoGuideAsset.findUnique({
      where: {
        assetType_hash_sizeBytes: {
          assetType: dto.assetType,
          hash,
          sizeBytes: dto.sizeBytes
        }
      }
    });

    if (!asset) {
      return {
        exists: false as const
      };
    }

    if (
      asset.assetType === "MEDIA" &&
      videoGuideMediaUploadDriver() === "r2" &&
      optionalVideoGuideR2Config() &&
      !videoGuideAsrCacheFromAsset(asset)
    ) {
      return {
        exists: false as const
      };
    }

    const mediaAsset = asset.assetType === "MEDIA" ? await this.ensureVideoGuideMediaWebPlayback(asset) : asset;
    const referenced = await this.referenceVideoGuideAsset({
      assetId: mediaAsset.id,
      originalName,
      source: "UPLOAD",
      userId
    });

    if (mediaAsset.assetType === "MEDIA") {
      return {
        exists: true as const,
        media: videoGuideMediaUploadResponse(referenced.asset, originalName, referenced.ref.id, true)
      };
    }

    return {
      exists: true as const,
      subtitle: videoGuideSubtitleUploadResponse(referenced.asset, originalName, referenced.ref.id, true)
    };
  }

  async uploadMediaFile(userId: string, file: UploadedVideoGuideFileLike | undefined, uploadId?: string) {
    const trackedUploadId = normalizeVideoGuideMediaUploadId(uploadId);

    if (!trackedUploadId) {
      return this.uploadMediaFileInternal(userId, file);
    }

    this.mediaUploadProgress.begin(userId, trackedUploadId);

    try {
      const uploaded = await this.uploadMediaFileInternal(userId, file, (stage, percent) => {
        this.mediaUploadProgress.update(userId, trackedUploadId, { stage, percent });
      });

      this.mediaUploadProgress.complete(userId, trackedUploadId);
      return uploaded;
    } catch (error) {
      this.mediaUploadProgress.fail(
        userId,
        trackedUploadId,
        error instanceof Error ? error.message : "媒体文件处理失败"
      );
      throw error;
    }
  }

  getMediaUploadProgress(userId: string, uploadId: string) {
    const trackedUploadId = normalizeVideoGuideMediaUploadId(uploadId);

    return trackedUploadId ? this.mediaUploadProgress.get(userId, trackedUploadId) : null;
  }

  private async uploadMediaFileInternal(
    userId: string,
    file: UploadedVideoGuideFileLike | undefined,
    onProgress?: (stage: string, percent: number) => void
  ) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    if (!file) {
      throw new AppException(40001, "请选择要上传的视频或音频文件", HttpStatus.BAD_REQUEST);
    }

    const mediaType = resolveUploadedMediaType(file);

    if (!mediaType) {
      throw new AppException(40001, "请上传视频或音频文件", HttpStatus.BAD_REQUEST);
    }

    if (file.size <= 0 || file.size > videoGuideMediaMaxBytesFor(mediaType)) {
      const maxSizeMb = Math.floor(videoGuideMediaMaxBytesFor(mediaType) / 1024 / 1024);
      const mediaLabel = mediaType === "AUDIO" ? "音频" : "视频";
      throw new AppException(40001, `${mediaLabel}文件不能超过 ${maxSizeMb}M`, HttpStatus.BAD_REQUEST);
    }

    const hash = hashBuffer(file.buffer);
    const existing = await this.findVideoGuideAsset("MEDIA", hash, file.size);
    const originalName = normalizeOriginalName(file.originalname);
    const hasAsrPreparation = videoGuideMediaUploadDriver() === "r2" && Boolean(optionalVideoGuideR2Config());
    const asrProgressEnd = mediaType === "VIDEO" ? 25 : 90;

    if (existing) {
      const mediaAsset = await this.ensureVideoGuideMediaWebPlayback(existing, (percent) => {
        onProgress?.("TRANSCODING", Math.max(1, Math.round(percent * 0.94)));
      });

      if (!videoGuideAsrCacheFromAsset(mediaAsset)) {
        const asrCache = await this.prepareUploadedMediaAsrCache(hash, file, (percent) => {
          onProgress?.("PREPARING_AUDIO", Math.max(1, Math.round((percent / 100) * asrProgressEnd)));
        });

        if (asrCache) {
          onProgress?.("STORING", 95);
          await this.persistVideoGuideAsrCache(mediaAsset.id, asrCache);
        }
      }

      const referenced = await this.referenceVideoGuideAsset({
        assetId: mediaAsset.id,
        originalName,
        source: "UPLOAD",
        userId
      });

      return videoGuideMediaUploadResponse(referenced.asset, originalName, referenced.ref.id, true);
    }

    const asrCache = await this.prepareUploadedMediaAsrCache(hash, file, (percent) => {
      onProgress?.("PREPARING_AUDIO", Math.max(1, Math.round((percent / 100) * asrProgressEnd)));
    });
    const transcodeStart = hasAsrPreparation ? asrProgressEnd : 1;
    const uploadFile = shouldTranscodeVideoGuideMediaForWeb(mediaType)
      ? await transcodeVideoGuideMediaToWebMp4(file, {
          onProgress: (percent) => {
            const converted = transcodeStart + (percent / 100) * (94 - transcodeStart);
            onProgress?.("TRANSCODING", Math.max(transcodeStart, Math.round(converted)));
          }
        })
      : file;
    const uploadOriginalName = shouldTranscodeVideoGuideMediaForWeb(mediaType)
      ? videoGuideWebPlaybackOriginalName(file.originalname)
      : file.originalname;
    const filename = createDedupUploadFilename(
      "media",
      hash,
      uploadOriginalName,
      uploadFile.mimetype,
      shouldTranscodeVideoGuideMediaForWeb(mediaType) ? ".mp4" : undefined
    );
    onProgress?.("STORING", 95);
    const uploaded = await writeVideoGuideMediaUpload(filename, uploadFile);
    const referenced = await this.createOrReferenceVideoGuideAsset({
      asrCache,
      assetType: "MEDIA",
      hash,
      mediaType,
      mimeType: uploadFile.mimetype || mimeTypeFor(uploaded.objectKey),
      objectKey: uploaded.objectKey,
      originalName,
      sizeBytes: file.size,
      source: "UPLOAD",
      storageProvider: videoGuideMediaStorageProvider(),
      url: uploaded.url,
      userId
    });

    return videoGuideMediaUploadResponse(referenced.asset, originalName, referenced.ref.id, referenced.reused);
  }

  private async prepareUploadedMediaAsrCache(
    hash: string,
    file: UploadedVideoGuideFileLike,
    onProgress?: (percent: number) => void
  ) {
    if (videoGuideMediaUploadDriver() !== "r2" || !optionalVideoGuideR2Config()) {
      return undefined;
    }

    const asrFile = await extractVideoGuideAsrAudioFromBuffer(file, { onProgress });

    return uploadVideoGuideAsrCacheToR2(hash, asrFile);
  }

  async uploadSubtitleFile(userId: string, file: UploadedVideoGuideFileLike | undefined) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    if (!file) {
      throw new AppException(40001, "请选择要上传的字幕文件", HttpStatus.BAD_REQUEST);
    }

    if (file.size <= 0 || file.size > videoGuideSubtitleMaxBytes) {
      throw new AppException(40001, "字幕文件不能超过 20M", HttpStatus.BAD_REQUEST);
    }

    const subtitleFormat = resolveSubtitleFormat(file.originalname, file.buffer);

    if (!subtitleFormat) {
      throw new AppException(40001, "字幕文件内容需为 srt 或 ass 格式", HttpStatus.BAD_REQUEST);
    }

    const hash = hashBuffer(file.buffer);
    const existing = await this.findVideoGuideAsset("SUBTITLE", hash, file.size);
    const originalName = normalizeOriginalName(file.originalname);

    if (existing) {
      const referenced = await this.referenceVideoGuideAsset({
        assetId: existing.id,
        originalName,
        source: "UPLOAD",
        userId
      });

      return videoGuideSubtitleUploadResponse(referenced.asset, originalName, referenced.ref.id, true);
    }

    const filename = createDedupUploadFilename(
      "subtitle",
      hash,
      file.originalname,
      file.mimetype,
      subtitleFormat === "SRT" ? ".srt" : ".ass"
    );
    const url = await writeVideoGuideUpload(filename, file);
    const referenced = await this.createOrReferenceVideoGuideAsset({
      assetType: "SUBTITLE",
      hash,
      mimeType: file.mimetype || mimeTypeFor(filename),
      objectKey: filename,
      originalName,
      sizeBytes: file.size,
      source: "UPLOAD",
      storageProvider: "LOCAL",
      subtitleFormat,
      url,
      userId
    });

    return videoGuideSubtitleUploadResponse(referenced.asset, originalName, referenced.ref.id, referenced.reused);
  }

  private async findVideoGuideAsset(assetType: "MEDIA" | "SUBTITLE", hash: string, sizeBytes: number) {
    return this.prisma.videoGuideAsset.findUnique({
      where: {
        assetType_hash_sizeBytes: {
          assetType,
          hash,
          sizeBytes
        }
      }
    });
  }

  private async referenceVideoGuideAsset(input: CreateVideoGuideAssetReferenceInput) {
    const now = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const ref = await transaction.videoGuideAssetRef.create({
        data: {
          assetId: input.assetId,
          originalName: normalizeOriginalName(input.originalName),
          source: input.source,
          userId: input.userId
        }
      });
      const asset = await transaction.videoGuideAsset.update({
        where: {
          id: input.assetId
        },
        data: {
          lastReferencedAt: now,
          refCount: {
            increment: 1
          }
        }
      });

      return {
        asset,
        ref
      };
    });
  }

  private async releaseVideoGuideAssetReference(assetRefId: string) {
    if (!assetRefId) {
      return;
    }

    await this.prisma.$transaction(async (transaction) => {
      const reference = await transaction.videoGuideAssetRef.findUnique({
        where: {
          id: assetRefId
        },
        select: {
          assetId: true,
          id: true
        }
      });

      if (!reference) {
        return;
      }

      await transaction.videoGuideAssetRef.delete({
        where: {
          id: reference.id
        }
      });
      await transaction.videoGuideAsset.updateMany({
        where: {
          id: reference.assetId,
          refCount: {
            gt: 0
          }
        },
        data: {
          refCount: {
            decrement: 1
          }
        }
      });
    });
  }

  private async createOrReferenceVideoGuideAsset(input: CreateOrReferenceVideoGuideAssetInput) {
    const hash = normalizeSha256(input.hash);
    const createReference = async (assetId: string, reused: boolean) => {
      const referenced = await this.referenceVideoGuideAsset({
        assetId,
        originalName: input.originalName,
        source: input.source,
        userId: input.userId
      });

      return {
        ...referenced,
        reused
      };
    };

    const existing = await this.findVideoGuideAsset(input.assetType, hash, input.sizeBytes);

    if (existing) {
      return createReference(existing.id, true);
    }

    try {
      const asset = await this.prisma.videoGuideAsset.create({
        data: {
          asrMimeType: input.asrCache?.mimeType,
          asrObjectKey: input.asrCache?.objectKey,
          asrPreparedAt: input.asrCache ? new Date() : undefined,
          asrSizeBytes: input.asrCache?.sizeBytes,
          assetType: input.assetType,
          hash,
          mediaType: input.mediaType,
          mimeType: input.mimeType,
          objectKey: input.objectKey,
          sizeBytes: input.sizeBytes,
          storageProvider: input.storageProvider,
          subtitleFormat: input.subtitleFormat,
          url: input.url
        }
      });

      return createReference(asset.id, false);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const racedAsset = await this.findVideoGuideAsset(input.assetType, hash, input.sizeBytes);

      if (!racedAsset) {
        throw error;
      }

      return createReference(racedAsset.id, true);
    }
  }

  private async ensureVideoGuideMediaWebPlayback(
    asset: VideoGuideAssetResponseRecord,
    onProgress?: (percent: number) => void
  ): Promise<VideoGuideAssetResponseRecord> {
    if (asset.assetType !== "MEDIA" || asset.mediaType !== "VIDEO" || isVideoGuideWebPlaybackAsset(asset)) {
      return asset;
    }

    const sourceBuffer = await downloadVideoGuideAssetBuffer(asset.url);
    const playbackFile = await transcodeVideoGuideMediaToWebMp4(
      {
        buffer: sourceBuffer,
        mimetype: asset.mimeType,
        originalname: basename(asset.objectKey),
        size: sourceBuffer.length
      },
      { onProgress }
    );
    const filename = createDedupUploadFilename(
      "media",
      asset.hash,
      videoGuideWebPlaybackOriginalName(asset.objectKey),
      playbackFile.mimetype,
      ".mp4"
    );
    const uploaded = await writeVideoGuideMediaUpload(filename, playbackFile);

    return this.persistVideoGuideMediaPlaybackUpgrade(asset, playbackFile, uploaded);
  }

  private async persistVideoGuideMediaPlaybackUpgrade(
    asset: VideoGuideAssetResponseRecord,
    playbackFile: UploadedVideoGuideFileLike,
    uploaded: { objectKey: string; url: string }
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const updatedAsset = await transaction.videoGuideAsset.update({
        data: {
          mimeType: playbackFile.mimetype,
          objectKey: uploaded.objectKey,
          storageProvider: videoGuideMediaStorageProvider(),
          url: uploaded.url
        },
        where: {
          id: asset.id
        }
      });

      await transaction.videoGuideLesson.updateMany({
        data: {
          mediaMimeType: playbackFile.mimetype,
          mediaSizeBytes: playbackFile.size,
          mediaStorageKey: uploaded.objectKey,
          mediaUrl: uploaded.url
        },
        where: {
          OR: [
            {
              mediaStorageKey: asset.objectKey
            },
            {
              mediaUrl: asset.url
            }
          ]
        }
      });

      return updatedAsset;
    });
  }

  private async normalizeVideoGuideLessonMediaForWeb(lesson: VideoGuideLessonRecord) {
    if (
      lesson.mediaType !== "VIDEO" ||
      !lesson.mediaUrl?.trim() ||
      (lesson.mediaMimeType?.toLowerCase() === "video/mp4" && extname(lesson.mediaUrl).toLowerCase() === ".mp4")
    ) {
      return lesson;
    }

    const sourceBuffer = await downloadVideoGuideAssetBuffer(lesson.mediaUrl);
    const playbackFile = await transcodeVideoGuideMediaToWebMp4({
      buffer: sourceBuffer,
      mimetype: lesson.mediaMimeType || mimeTypeFor(lesson.mediaName),
      originalname: lesson.mediaName,
      size: sourceBuffer.length
    });
    const sourceHash = hashBuffer(sourceBuffer);
    const filename = createDedupUploadFilename(
      "media",
      sourceHash,
      videoGuideWebPlaybackOriginalName(lesson.mediaName),
      playbackFile.mimetype,
      ".mp4"
    );
    const uploaded = await writeVideoGuideMediaUpload(filename, playbackFile);
    const storageProvider = videoGuideMediaStorageProvider();
    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.videoGuideAsset.updateMany({
        data: {
          mimeType: playbackFile.mimetype,
          objectKey: uploaded.objectKey,
          storageProvider,
          url: uploaded.url
        },
        where: {
          OR: [
            lesson.mediaStorageKey
              ? {
                  objectKey: lesson.mediaStorageKey
                }
              : undefined,
            lesson.mediaUrl
              ? {
                  url: lesson.mediaUrl
                }
              : undefined
          ].filter((value): value is NonNullable<typeof value> => Boolean(value))
        }
      });

      return transaction.videoGuideLesson.update({
        data: {
          mediaMimeType: playbackFile.mimetype,
          mediaSizeBytes: playbackFile.size,
          mediaStorageKey: uploaded.objectKey,
          mediaUrl: uploaded.url
        },
        where: {
          id: lesson.id
        }
      });
    });

    return updated;
  }

  private async createGeneratedSubtitleUpload(
    input: {
      buffer: Buffer;
      hash: string;
      subtitleName: string;
    },
    userId: string
  ) {
    const filename = createDedupUploadFilename("subtitle", input.hash, input.subtitleName, "text/plain", ".srt");
    const url = await writeVideoGuideBufferUpload(filename, input.buffer);
    const referenced = await this.createOrReferenceVideoGuideAsset({
      assetType: "SUBTITLE",
      hash: input.hash,
      mimeType: mimeTypeFor(filename),
      objectKey: filename,
      originalName: input.subtitleName,
      sizeBytes: input.buffer.length,
      source: "GENERATED",
      storageProvider: "LOCAL",
      subtitleFormat: "SRT",
      url,
      userId
    });

    return videoGuideSubtitleUploadResponse(referenced.asset, input.subtitleName, referenced.ref.id, referenced.reused);
  }

  async generateSubtitleFile(subject: ProfileSubject, dto: GenerateVideoGuideSubtitleDto) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const lessonId = dto.lessonId?.trim();

    if (!lessonId) {
      throw new AppException(40001, "请先保存媒体文件，再生成字幕文件", HttpStatus.BAD_REQUEST);
    }

    const estimate = await this.estimateSubtitleGeneration(userId, dto);
    this.assertBillingConfirmed(dto.billingConfirmed, estimate);
    const operationKey = `video-guide-subtitle:${randomBytes(8).toString("hex")}`;
    const job = createVideoGuideOperationJob({
      operation: "SUBTITLE",
      jobId: randomBytes(12).toString("hex"),
      operationKey,
      estimatedCredits: estimate.estimatedCredits,
      input: serializableVideoGuideJobInput(dto),
      now: new Date().toISOString()
    });
    const progress = createVideoGuideOperationProgress({
      operation: "SUBTITLE",
      phase: "QUEUED",
      message: "字幕识别任务已提交，可以关闭页面，后台会继续生成",
      now: new Date().toISOString(),
      total: 6
    });

    const queuedLesson = await this.prisma.$transaction(async (transaction) => {
      await this.lockVideoGuideLesson(transaction, lessonId);
      const lesson = await transaction.videoGuideLesson.findFirst({
        where: videoGuideSubjectWhere(subject, { id: lessonId })
      });

      if (!lesson) {
        throw new AppException(40401, "导学课件草稿不存在", HttpStatus.NOT_FOUND);
      }

      this.assertLessonOperationAvailable(lesson, "SUBTITLE");
      await this.reserveVideoGuideCredits(transaction, {
        userId,
        operationKey,
        estimatedCredits: estimate.estimatedCredits,
        note: `视频导学字幕生成冻结 ${estimate.estimatedCredits} 点`
      });

      return transaction.videoGuideLesson.update({
        where: {
          id: lesson.id
        },
        data: {
          status: "DRAFT",
          errorMessage: null,
          finishedAt: null,
          content: mergeVideoGuideOperationProgressContent(
            mergeVideoGuideOperationJobContent(
              mergeVideoGuideSubtitleCheckpointContent(lesson.content, null),
              "subtitleGenerationJob",
              job
            ),
            "subtitleGenerationProgress",
            progress
          ) as unknown as Prisma.InputJsonValue
        }
      });
    });

    this.scheduleSubtitleGeneration(queuedLesson.id);

    return this.toLesson(queuedLesson);
  }

  private scheduleSubtitleGeneration(lessonId: string) {
    const timer = setTimeout(() => {
      this.runBackgroundTask("生成视频导学字幕", () =>
        this.runWithStoredLessonAuthorization(lessonId, () => this.runSubtitleGeneration(lessonId))
      );
    }, generationQueuedDelayMs);

    timer.unref?.();
  }

  private async runSubtitleGeneration(
    lessonId: string
  ) {
    const claimed = await this.claimLessonOperation<GenerateVideoGuideSubtitleDto>({
      lessonId,
      operation: "SUBTITLE",
      jobKey: "subtitleGenerationJob",
      progressKey: "subtitleGenerationProgress",
      phase: "RECOGNIZING",
      message: "正在识别视频或音频中的语音"
    });

    if (!claimed) {
      return;
    }

    const { job, lesson } = claimed;
    const dto = job.input;
    const userId = lesson.userId;
    const operationKey = job.operationKey;
    const estimatedCredits = job.estimatedCredits;
    const attemptId = job.attemptId;

    if (!attemptId) {
      return;
    }

    const lease = {
      attemptId,
      jobId: job.jobId,
      jobKey: "subtitleGenerationJob" as const
    };
    let checkpoint =
      videoGuideSubtitleCheckpointFromValue(
        isRecord(lesson.content) ? lesson.content.subtitleGenerationCheckpoint : null,
        job.jobId
      ) ??
      createVideoGuideSubtitleCheckpoint({
        jobId: job.jobId,
        now: new Date().toISOString()
      });

    try {
      const mediaName = normalizeOriginalName(dto.mediaName);
      const subtitleName = `${stripExtension(mediaName)}.srt`;
      const asrMedia = checkpoint.providerTaskId
        ? null
        : await this.prepareVideoGuideAsrMedia({
            checkpoint,
            dto,
            attemptId,
            jobId: job.jobId,
            mediaName,
            onExtracting: async () => {
              checkpoint = await this.updateSubtitleGenerationState(
                lessonId,
                lease,
                checkpoint,
                {},
                {
                  completed: 0,
                  phase: "PREPARING_AUDIO",
                  message: "正在提取适合语音识别的轻量音频"
                }
              );
            },
            onHeartbeat: async () => {
              checkpoint = await this.updateSubtitleGenerationState(
                lessonId,
                lease,
                checkpoint,
                {},
                {
                  completed: 0,
                  phase: "PREPARING_AUDIO",
                  message: "正在提取适合语音识别的轻量音频"
                }
              );
            },
            onUploading: async (prepared) => {
              checkpoint = await this.updateSubtitleGenerationState(
                lessonId,
                lease,
                checkpoint,
                {
                  asrMediaMimeType: prepared.mimetype,
                  asrMediaName: prepared.originalname,
                  asrMediaSizeBytes: prepared.size
                },
                {
                  completed: 1,
                  phase: "UPLOADING_AUDIO",
                  message: "轻量音频已准备，正在上传并校验识别文件"
                }
              );
            },
            onUploaded: async (prepared, objectKey, reusable) => {
              checkpoint = await this.updateSubtitleGenerationState(
                lessonId,
                lease,
                checkpoint,
                {
                  asrMediaMimeType: prepared.mimetype,
                  asrMediaName: prepared.originalname,
                  asrMediaSizeBytes: prepared.size,
                  asrObjectKey: objectKey,
                  asrReusable: reusable
                },
                {
                  completed: 1,
                  phase: "VALIDATING_AUDIO",
                  message: "轻量音频已上传，正在校验识别文件"
                }
              );
            }
          });

      if (!checkpoint.providerTaskId) {
        if (!asrMedia) {
          throw new AppException(50001, "字幕识别音频准备失败", HttpStatus.BAD_GATEWAY);
        }

        checkpoint = await this.updateSubtitleGenerationState(
          lessonId,
          lease,
          checkpoint,
          {
            asrMediaMimeType: asrMedia.mediaMimeType,
            asrMediaName: asrMedia.mediaName,
            asrMediaSizeBytes: asrMedia.sizeBytes,
            asrObjectKey: asrMedia.objectKey,
            asrReusable: asrMedia.reusable
          },
          {
            completed: 2,
            phase: "SUBMITTING",
            message: "识别文件已校验，正在提交语音识别任务"
          }
        );
        const submitted = await this.audioService.submitSrtGenerationTask({
          language: dto.language,
          mediaMimeType: asrMedia.mediaMimeType,
          mediaName: asrMedia.mediaName,
          mediaUrl: asrMedia.mediaUrl
        });
        const now = new Date().toISOString();
        checkpoint = await this.updateSubtitleGenerationState(
          lessonId,
          lease,
          checkpoint,
          {
            providerTaskId: submitted.providerTaskId,
            providerStatus: submitted.providerStatus,
            modelInstanceId: submitted.modelInstanceId,
            providerInstanceId: submitted.providerInstanceId,
            modelName: submitted.modelName,
            requestId: submitted.requestId,
            submittedAt: now
          },
          {
            completed: 3,
            percent: 50,
            phase: "RECOGNIZING",
            message: "语音识别任务处理中，当前为预估进度，可以关闭页面稍后再查看"
          }
        );
        this.logger.log(`视频导学字幕任务已提交：lesson=${lessonId} providerTask=${submitted.providerTaskId}`);
      }

      if (
        !checkpoint.providerTaskId ||
        !checkpoint.modelInstanceId ||
        !checkpoint.providerInstanceId ||
        !checkpoint.modelName
      ) {
        throw new AppException(50001, "语音识别任务编号未保存", HttpStatus.BAD_GATEWAY);
      }

      const providerTaskId = checkpoint.providerTaskId;
      const modelInstanceId = checkpoint.modelInstanceId;
      const providerInstanceId = checkpoint.providerInstanceId;
      const modelName = checkpoint.modelName;
      let result: Awaited<ReturnType<AudioService["querySrtGenerationTask"]>> | null = null;
      const recognitionTimeoutMs = resolveVideoGuideSubtitleRecognitionTimeoutMs(
        process.env.VIDEO_GUIDE_ASR_TASK_TIMEOUT_MS
      );
      const deadline = videoGuideSubtitleRecognitionDeadline({
        submittedAt: checkpoint.submittedAt,
        timeoutMs: recognitionTimeoutMs
      });

      while (Date.now() < deadline) {
        try {
          const queried = await this.audioService.querySrtGenerationTask({
            mediaMimeType: checkpoint.asrMediaMimeType ?? dto.mediaMimeType,
            mediaName: checkpoint.asrMediaName ?? mediaName,
            modelInstanceId,
            modelName,
            providerInstanceId,
            providerTaskId
          });
          const now = new Date().toISOString();
          checkpoint = await this.updateSubtitleGenerationState(
            lessonId,
            lease,
            checkpoint,
            {
              lastPolledAt: now,
              pollAttempts: checkpoint.pollAttempts + 1,
              providerStatus: queried.providerStatus,
              requestId: queried.requestId ?? checkpoint.requestId,
              transientFailures: 0
            },
            {
              completed: queried.status === "SUCCEEDED" ? 4 : 3,
              percent:
                queried.status === "SUCCEEDED"
                  ? undefined
                  : videoGuideSubtitleRecognitionEstimatedPercent({
                      asrMediaSizeBytes: checkpoint.asrMediaSizeBytes,
                      submittedAt: checkpoint.submittedAt
                    }),
              phase: queried.status === "SUCCEEDED" ? "VALIDATING" : "RECOGNIZING",
              message:
                queried.status === "SUCCEEDED"
                  ? "语音识别已完成，正在校验字幕时间轴"
                  : "语音识别任务处理中，当前为预估进度，可以关闭页面稍后再查看"
            }
          );

          if (queried.status === "SUCCEEDED") {
            this.logger.log(`视频导学字幕任务识别完成：lesson=${lessonId} providerTask=${providerTaskId}`);
            result = queried;
            break;
          }
        } catch (error) {
          if (!isRetryableAudioProviderError(error)) {
            throw error;
          }

          const failures = checkpoint.transientFailures + 1;
          checkpoint = await this.updateSubtitleGenerationState(
            lessonId,
            lease,
            checkpoint,
            {
              lastPolledAt: new Date().toISOString(),
              pollAttempts: checkpoint.pollAttempts + 1,
              transientFailures: failures,
              providerStatus: `RETRYING:${audioProviderErrorCode(error) ?? "NETWORK"}`
            },
            {
              completed: 3,
              percent: videoGuideSubtitleRecognitionEstimatedPercent({
                asrMediaSizeBytes: checkpoint.asrMediaSizeBytes,
                submittedAt: checkpoint.submittedAt
              }),
              phase: "RETRYING",
              message: `识别服务暂时无响应，正在进行第 ${failures} 次自动重试`
            }
          );
          this.logger.warn(
            `视频导学字幕任务轮询暂时失败，将自动重试：lesson=${lessonId} providerTask=${providerTaskId} code=${audioProviderErrorCode(error) ?? "NETWORK"}`
          );
          await waitForVideoGuideSubtitlePoll(subtitleRecognitionRetryDelayMs(failures));
          continue;
        }

        await waitForVideoGuideSubtitlePoll(subtitleRecognitionPollIntervalMs());
      }

      if (!result?.subtitleText) {
        this.logger.warn(`视频导学字幕任务超过等待时限：lesson=${lessonId} providerTask=${providerTaskId}`);
        throw new AppException(
          50201,
          "语音识别任务长时间未完成，请稍后重新生成字幕",
          HttpStatus.BAD_GATEWAY
        );
      }

      const subtitleText = normalizeGeneratedSrt(result.subtitleText);
      const subtitleFormat = resolveSubtitleFormat(subtitleName, subtitleText);

      if (subtitleFormat !== "SRT") {
        throw new AppException(50001, "语音识别未返回有效的 SRT 字幕", HttpStatus.BAD_GATEWAY);
      }

      const buffer = Buffer.from(subtitleText, "utf8");

      if (buffer.length <= 0 || buffer.length > videoGuideSubtitleMaxBytes) {
        throw new AppException(40001, "生成的字幕文件不能超过 20M", HttpStatus.BAD_REQUEST);
      }

      await this.updateLessonOperationProgress(
        lessonId,
        "subtitleGenerationProgress",
        {
          completed: 5,
          phase: "STORING",
          message: "字幕格式校验完成，正在保存字幕文件"
        },
        lease
      );

      const hash = hashBuffer(buffer);
      const existing = await this.findVideoGuideAsset("SUBTITLE", hash, buffer.length);
      let subtitleUpload;

      if (existing) {
        const referenced = await this.referenceVideoGuideAsset({
          assetId: existing.id,
          originalName: subtitleName,
          source: "GENERATED",
          userId
        });

        subtitleUpload = videoGuideSubtitleUploadResponse(
          referenced.asset,
          subtitleName,
          referenced.ref.id,
          true
        );
      } else {
        subtitleUpload = await this.createGeneratedSubtitleUpload({
          buffer,
          hash,
          subtitleName
        }, userId);
      }
      let referenceCommitted = false;

      try {
        await this.updateLessonOperationProgress(
          lessonId,
          "subtitleGenerationProgress",
          {
            completed: 5,
            phase: "LINKING",
            message: "字幕文件已保存，正在关联到当前课件"
          },
          lease
        );

        referenceCommitted = await this.prisma.$transaction(async (transaction) => {
          await this.lockVideoGuideLesson(transaction, lessonId);
          const current = await transaction.videoGuideLesson.findFirst({
            where: {
              id: lessonId,
              userId
            }
          });

          if (!current) {
            return false;
          }

          const currentContent = isRecord(current.content) ? current.content : {};

          if (
            !videoGuideOperationAttemptMatches(
              currentContent.subtitleGenerationJob,
              job.jobId,
              attemptId
            )
          ) {
            return false;
          }

          const completedProgress = this.nextOperationProgress(
            current.content,
            "subtitleGenerationProgress",
            {
              status: "SUCCEEDED",
              phase: "COMPLETED",
              completed: 6,
              message: "字幕文件已生成，可以继续校对或生成导学文案"
            }
          );
          const draftContent = buildDraftLessonContent(
            {
              title: current.title,
              mediaName: current.mediaName,
              mediaType: current.mediaType === "AUDIO" ? "AUDIO" : "VIDEO",
              mediaMimeType: current.mediaMimeType ?? undefined,
              mediaSizeBytes: current.mediaSizeBytes,
              mediaUrl: current.mediaUrl ?? undefined,
              mediaStorageKey: current.mediaStorageKey ?? undefined
            },
            {
              subtitleName,
              subtitleFormat: "SRT",
              subtitleSizeBytes: buffer.length,
              subtitleStorageKey: subtitleUpload.filename,
              subtitleText: subtitleText.slice(0, videoGuideSubtitleTextMaxLength),
              subtitleUrl: subtitleUpload.url
            }
          );
          const updated = await transaction.videoGuideLesson.updateMany({
            where: {
              id: current.id,
              AND: [
                { content: { path: ["subtitleGenerationJob", "jobId"], equals: job.jobId } },
                { content: { path: ["subtitleGenerationJob", "attemptId"], equals: attemptId } }
              ]
            },
            data: {
              subtitleName,
              subtitleFormat: "SRT",
              subtitleSizeBytes: buffer.length,
              subtitleStorageKey: subtitleUpload.filename,
              subtitleUrl: subtitleUpload.url,
              status: "DRAFT",
              errorMessage: null,
              finishedAt: null,
              content: mergeVideoGuideOperationProgressContent(
                draftContent,
                "subtitleGenerationProgress",
                completedProgress
              ) as unknown as Prisma.InputJsonValue
            }
          });

          if (updated.count !== 1) {
            return false;
          }

          await this.settleVideoGuideCredits(transaction, {
            userId,
            operationKey,
            actualCredits: estimatedCredits,
            consumeNote: `视频导学字幕生成消耗 ${estimatedCredits} 点`,
            releaseNote: "视频导学字幕生成释放多余冻结点数"
          });

          return true;
        });

        if (!referenceCommitted) {
          throw new AppException(40901, "当前后台任务已由新的执行器接管", HttpStatus.CONFLICT);
        }
      } finally {
        if (!referenceCommitted && subtitleUpload.assetRefId) {
          await this.releaseVideoGuideAssetReference(subtitleUpload.assetRefId).catch(() => undefined);
        }
      }

      if (
        checkpoint.asrObjectKey &&
        shouldCleanupVideoGuideSubtitleAsrObject(checkpoint, referenceCommitted)
      ) {
        await deleteVideoGuideR2Object(checkpoint.asrObjectKey).catch((error) => {
          this.logger.warn(
            `字幕识别临时文件清理失败：${videoGuideGenerationErrorMessage(error)}`
          );
        });
      }
    } catch (error) {
      const errorMessage = videoGuideGenerationErrorMessage(error);

      const failureCommitted = await this.prisma.$transaction(async (transaction) => {
        await this.lockVideoGuideLesson(transaction, lessonId);
        const current = await transaction.videoGuideLesson.findFirst({
          where: {
            id: lessonId,
            userId
          }
        });

        const currentContent = current && isRecord(current.content) ? current.content : {};

        if (
          current &&
          videoGuideOperationAttemptMatches(
            currentContent.subtitleGenerationJob,
            job.jobId,
            attemptId
          )
        ) {
          const failedProgress = this.failedOperationProgress(
            current.content,
            "subtitleGenerationProgress",
            "SUBTITLE",
            {
              errorMessage,
              message: "字幕文件生成失败，可以重新提交"
            }
          );

          const updated = await transaction.videoGuideLesson.updateMany({
            where: {
              id: current.id,
              AND: [
                { content: { path: ["subtitleGenerationJob", "jobId"], equals: job.jobId } },
                { content: { path: ["subtitleGenerationJob", "attemptId"], equals: attemptId } }
              ]
            },
            data: {
              content: mergeVideoGuideOperationProgressContent(
                current.content,
                "subtitleGenerationProgress",
                failedProgress
              ) as unknown as Prisma.InputJsonValue
            }
          });

          if (updated.count === 1) {
            await this.releaseVideoGuideCredits(transaction, {
              userId,
              operationKey,
              note: "视频导学字幕生成失败，已释放冻结点数"
            });
            return true;
          }
        }

        return false;
      });

      if (
        checkpoint.asrObjectKey &&
        shouldCleanupVideoGuideSubtitleAsrObject(checkpoint, failureCommitted)
      ) {
        await deleteVideoGuideR2Object(checkpoint.asrObjectKey).catch((cleanupError) => {
          this.logger.warn(
            `字幕识别失败后的临时文件清理失败：${videoGuideGenerationErrorMessage(cleanupError)}`
          );
        });
      }
    }
  }

  async estimateSubtitleGeneration(userId: string, dto: GenerateVideoGuideSubtitleDto) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    if (!dto.mediaUrl?.trim() && !dto.mediaStorageKey?.trim()) {
      throw new AppException(40001, "请先上传视频或音频文件", HttpStatus.BAD_REQUEST);
    }

    return this.createBillingEstimate(userId, {
      operation: "VIDEO_GUIDE_SUBTITLE",
      title: "生成字幕文件",
      items: subtitleBillingItems(dto)
    });
  }

  async readSubtitleText(userId: string, dto: ReadVideoGuideSubtitleTextDto) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const rawUrl = dto.url.trim();
    let subtitleUrl: URL;

    try {
      subtitleUrl = new URL(rawUrl);
    } catch {
      throw new AppException(40001, "字幕地址格式不正确", HttpStatus.BAD_REQUEST);
    }

    if (!isAllowedSubtitleTextUrl(subtitleUrl)) {
      throw new AppException(40001, "字幕地址不在允许的读取范围内", HttpStatus.BAD_REQUEST);
    }

    try {
      const response = await fetch(subtitleUrl, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new AppException(50001, "字幕文件读取失败", HttpStatus.BAD_GATEWAY);
      }

      const contentLength = Number(response.headers.get("content-length") ?? 0);

      if (contentLength > videoGuideSubtitleMaxBytes) {
        throw new AppException(40001, "字幕文件不能超过 20M", HttpStatus.BAD_REQUEST);
      }

      const buffer = await response.arrayBuffer();

      if (buffer.byteLength > videoGuideSubtitleMaxBytes) {
        throw new AppException(40001, "字幕文件不能超过 20M", HttpStatus.BAD_REQUEST);
      }

      return {
        text: new TextDecoder("utf-8").decode(buffer)
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      throw new AppException(50001, "字幕文件读取失败", HttpStatus.BAD_GATEWAY);
    }
  }

  async getPublicFile(filename: string) {
    const safeFilename = basename(filename);
    const filepath = resolve(videoGuideUploadDir(), safeFilename);

    if (!filepath.startsWith(videoGuideUploadDir()) || !existsSync(filepath)) {
      throw new AppException(40401, "文件不存在", HttpStatus.NOT_FOUND);
    }

    const stat = statSync(filepath);

    return {
      filepath,
      mimeType: mimeTypeFor(safeFilename),
      size: stat.size
    };
  }

  async createDraftLesson(
    subject: ProfileSubject,
    dto: CreateVideoGuideDraftDto
  ) {
    const { userId, learnerId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    this.assertDraftInput(dto, true);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const shareToken = this.createShareToken();
      const existing = await this.prisma.videoGuideLesson.findUnique({
        where: {
          shareToken
        },
        select: {
          id: true
        }
      });

      if (existing) {
        continue;
      }

      const lesson = await this.prisma.videoGuideLesson.create({
        data: {
          userId,
          learnerId,
          title: this.lessonTitleFromMedia(dto),
          mediaName: dto.mediaName.trim(),
          mediaType: dto.mediaType,
          mediaMimeType: dto.mediaMimeType?.trim() || null,
          mediaSizeBytes: dto.mediaSizeBytes,
          mediaUrl: dto.mediaUrl?.trim() || null,
          mediaStorageKey: dto.mediaStorageKey?.trim() || null,
          subtitleName: null,
          subtitleFormat: null,
          subtitleSizeBytes: null,
          subtitleUrl: null,
          subtitleStorageKey: null,
          status: "DRAFT",
          shareToken,
          content: buildDraftLessonContent(dto)
        }
      });

      return this.toLesson(lesson);
    }

    throw new AppException(50001, "创建课件草稿失败，请稍后重试", HttpStatus.INTERNAL_SERVER_ERROR);
  }

  async updateLessonTitle(subject: ProfileSubject, id: string, dto: { title: string }) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const title = dto.title.trim();

    if (!title) {
      throw new AppException(40001, "课件名称不能为空", HttpStatus.BAD_REQUEST);
    }

    const current = await this.prisma.videoGuideLesson.findFirst({
      where: videoGuideSubjectWhere(subject, { id })
    });

    if (!current) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    const lesson = await this.prisma.videoGuideLesson.update({
      where: { id: current.id },
      data: { title }
    });

    await this.recordCourseMaterialChange(lesson.id);

    return this.toLesson(lesson);
  }

  async updateLessonSubtitle(subject: ProfileSubject, id: string, dto: UpdateVideoGuideLessonSubtitleDto) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    this.assertSubtitleInput(dto);

    const lesson = await this.prisma.$transaction(async (transaction) => {
      await this.lockVideoGuideLesson(transaction, id);
      const current = await transaction.videoGuideLesson.findFirst({
        where: videoGuideSubjectWhere(subject, { id })
      });

      if (!current) {
        throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
      }

      if (!isReusableVideoGuideLessonStatus(current.status)) {
        throw new AppException(40001, "当前课件正在生成中，请稍后查看生成结果", HttpStatus.BAD_REQUEST);
      }

      this.assertLessonOperationAvailable(current, "SUBTITLE");

      return transaction.videoGuideLesson.update({
        where: {
          id: current.id
        },
        data: {
          subtitleName: dto.subtitleName.trim(),
          subtitleFormat: dto.subtitleFormat,
          subtitleSizeBytes: dto.subtitleSizeBytes ?? null,
          subtitleUrl: dto.subtitleUrl?.trim() || null,
          subtitleStorageKey: dto.subtitleStorageKey?.trim() || null,
          status: "DRAFT",
          errorMessage: null,
          finishedAt: null,
          content: buildDraftLessonContent({
            title: current.title,
            mediaName: current.mediaName,
            mediaType: current.mediaType === "AUDIO" ? "AUDIO" : "VIDEO",
            mediaMimeType: current.mediaMimeType ?? undefined,
            mediaSizeBytes: current.mediaSizeBytes,
            mediaUrl: current.mediaUrl ?? undefined,
            mediaStorageKey: current.mediaStorageKey ?? undefined
          }, dto)
        }
      });
    });

    await this.recordCourseMaterialChange(lesson.id);

    return this.toLesson(lesson);
  }

  async updateLessonNarrationScript(
    subject: ProfileSubject,
    id: string,
    dto: UpdateVideoGuideNarrationScriptDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const lessonId = id.trim();

    if (!lessonId) {
      throw new AppException(40001, "导学课件参数错误", HttpStatus.BAD_REQUEST);
    }

    const existing = await this.prisma.videoGuideLesson.findFirst({
      where: videoGuideSubjectWhere(subject, { id: lessonId })
    });

    if (!existing) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    if (existing.status === "QUEUED" || existing.status === "GENERATING") {
      throw new AppException(40001, "当前课件正在生成中，请稍后再编辑文案", HttpStatus.BAD_REQUEST);
    }

    this.assertLessonOperationAvailable(existing, "NARRATION");
    this.validatedEditedNarrationContent(existing.content, dto.nodes);
    const changedNode = videoGuideChangedNarrationNode(existing.content, dto.nodes);

    if (changedNode && videoGuideContentHasNarrationAudio(existing.content)) {
      if (!dto.billingConfirmed) {
        throw new AppException(
          40001,
          "已有讲解语音，请确认本句语音合成点数后再保存",
          HttpStatus.BAD_REQUEST
        );
      }

      return this.updateLessonNarrationScriptWithAudio(subject, existing, dto);
    }

    const lesson = await this.prisma.$transaction(async (transaction) => {
      await this.lockVideoGuideLesson(transaction, lessonId);
      const current = await transaction.videoGuideLesson.findFirst({
        where: videoGuideSubjectWhere(subject, { id: lessonId })
      });

      if (!current) {
        throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
      }

      if (current.status === "QUEUED" || current.status === "GENERATING") {
        throw new AppException(40001, "当前课件正在生成中，请稍后再编辑文案", HttpStatus.BAD_REQUEST);
      }

      this.assertLessonOperationAvailable(current, "NARRATION");

      const content = this.validatedEditedNarrationContent(current.content, dto.nodes);

      return transaction.videoGuideLesson.update({
        where: {
          id: current.id
        },
        data: {
          content: content as unknown as Prisma.InputJsonValue,
          errorMessage: null
        }
      });
    });

    await this.recordCourseMaterialChange(lesson.id);

    return this.toLesson(lesson);
  }

  private async updateLessonNarrationScriptWithAudio(
    subject: ProfileSubject,
    initialLesson: VideoGuideLessonRecord,
    dto: UpdateVideoGuideNarrationScriptDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const billingRequestId = dto.billingRequestId?.trim();

    if (!billingRequestId) {
      throw new AppException(40001, "本句语音计费确认已失效，请重新确认", HttpStatus.BAD_REQUEST);
    }

    const estimate = await this.estimateLessonNarrationScriptUpdate(subject, initialLesson.id, dto);
    this.assertBillingConfirmed(dto.billingConfirmed, estimate);

    if (dto.billingRevision?.trim() !== estimate.revision) {
      throw new AppException(40001, "文稿或原语音角色已发生变化，请重新确认本句点数消耗", HttpStatus.BAD_REQUEST);
    }

    const operationKey = `video-guide-script-tts:${userId}:${initialLesson.id}:${billingRequestId}`;
    let preparedJob: NarrationScriptEditJob | null = null;

    try {
      const prepared = await this.prisma.$transaction(async (transaction) => {
        await this.lockVideoGuideLesson(transaction, initialLesson.id);
        const current = await transaction.videoGuideLesson.findFirst({
          where: videoGuideSubjectWhere(subject, { id: initialLesson.id })
        });

        if (!current) {
          throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
        }

        if (current.status === "QUEUED" || current.status === "GENERATING") {
          throw new AppException(40001, "当前课件正在生成中，请稍后再编辑文案", HttpStatus.BAD_REQUEST);
        }

        this.assertLessonOperationAvailable(current, "NARRATION");
        this.validatedEditedNarrationContent(current.content, dto.nodes);
        const currentChangedNode = videoGuideChangedNarrationNode(current.content, dto.nodes);
        const storedVoice = videoGuideStoredNarrationVoice(current.content);
        const modelAlias = videoGuideStoredNarrationModelAlias(current.content);
        const lockedRevision = videoGuideNarrationScriptEditRevision({
          audioTaskId: videoGuideNarrationNodeAudioTaskId(current.content, currentChangedNode?.id),
          lessonId: current.id,
          modelAlias,
          node: currentChangedNode,
          voice: storedVoice
        });

        if (
          !currentChangedNode ||
          !videoGuideContentHasNarrationAudio(current.content) ||
          lockedRevision !== estimate.revision
        ) {
          throw new AppException(40001, "文稿或原语音角色已发生变化，请重新确认本句点数消耗", HttpStatus.BAD_REQUEST);
        }

        await this.reserveVideoGuideCredits(transaction, {
          estimatedCredits: estimate.estimatedCredits,
          note: `视频导学本句讲解语音合成冻结 ${estimate.estimatedCredits} 点`,
          operationKey,
          rejectExisting: true,
          userId
        });

        const existingTimeline = isRecord(current.content) && Array.isArray(current.content.narrationTimeline)
          ? current.content.narrationTimeline
          : [];
        const previousTaskIds = existingTimeline
          .map((value) => isRecord(value) ? value : null)
          .filter((value) => value?.id === currentChangedNode.id)
          .map((value) => stringFromUnknown(value?.audioTaskId))
          .filter(Boolean);
        const now = new Date().toISOString();
        const job: NarrationScriptEditJob = {
          version: 1,
          status: "RUNNING",
          ownerId: randomBytes(12).toString("hex"),
          requestId: billingRequestId,
          operationKey,
          estimatedCredits: estimate.estimatedCredits,
          nodeId: currentChangedNode.id,
          originalScript: narrationNodeScript(current.content, currentChangedNode.id),
          script: currentChangedNode.script,
          revision: lockedRevision,
          createdAt: now,
          updatedAt: now
        };
        const saved = await transaction.videoGuideLesson.update({
          where: { id: current.id },
          data: {
            content: mergeNarrationScriptEditJobContent(current.content, job) as unknown as Prisma.InputJsonValue,
            errorMessage: null
          }
        });

        return {
          job,
          learnerId: current.learnerId,
          modelAlias,
          previousTaskIds,
          saved,
          storedVoice
        };
      });
      preparedJob = prepared.job;

      const persistence = {
        lessonId: prepared.saved.id,
        generationId: prepared.job.requestId,
        nodeId: prepared.job.nodeId,
        format: "mp3" as const
      };
      let audioTask = await this.audioService.findVerifiedVideoGuideNarrationTask(userId, persistence);

      if (!audioTask) {
        const voiceSelection = resolveVideoGuideNarrationVoiceSelection(prepared.storedVoice);

        await this.narrationTtsRateLimiter.acquire();
        await this.heartbeatNarrationScriptEdit(prepared.saved.id, userId, prepared.job);
        audioTask = await this.audioService.synthesizeTtsForExternalBilling(
          {
            userId,
            learnerId: prepared.learnerId,
            rootScenarioId: null
          },
          {
            text: narrationTextForTts(prepared.job.script),
            voice: voiceSelection.voice,
            voiceAssetId: voiceSelection.voiceAssetId,
            modelAlias: prepared.modelAlias,
            source: "VIDEO_GUIDE",
            format: "mp3",
            videoGuidePersistence: {
              ...persistence,
              format: "mp3"
            },
            onPersistenceStatus: async () => {
              await this.heartbeatNarrationScriptEdit(prepared.saved.id, userId, prepared.job);
            }
          }
        );
      }

      const result = await this.finalizeNarrationScriptEdit(
        prepared.saved.id,
        userId,
        prepared.job,
        audioTask
      );

      try {
        await this.audioService.cleanupExternalNarrationAudio(userId, prepared.previousTaskIds);
      } catch (error) {
        this.logger.warn(`清理旧本句讲解语音失败：${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        await this.recordCourseMaterialChange(result.saved.id);
      } catch (error) {
        this.logger.warn(
          `记录视频导学文稿更新失败：${error instanceof Error ? error.message : String(error)}`
        );
      }
      return this.toLesson(result.saved);
    } catch (error) {
      let released = false;

      try {
        released = preparedJob
          ? await this.failNarrationScriptEdit(initialLesson.id, userId, preparedJob)
          : false;
      } catch (compensationError) {
        this.logger.error(
          "释放失败的本句讲解语音冻结点数失败",
          compensationError instanceof Error ? compensationError.stack : String(compensationError)
        );
      }
      if (released && preparedJob) {
        try {
          await this.cleanupNarrationScriptEdit(initialLesson.id, userId, preparedJob);
        } catch (cleanupError) {
          this.logger.warn(
            `清理失败的本句讲解语音失败：${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
          );
        }
      }
      throw error;
    }
  }

  private async finalizeNarrationScriptEdit(
    lessonId: string,
    userId: string,
    expectedJob: NarrationScriptEditJob,
    audioTask: Parameters<typeof verifiedNarrationAudioFromTask>[0]
  ) {
    const verified = verifiedNarrationAudioFromTask(
      audioTask,
      videoGuideNarrationR2Prefix(),
      videoGuideR2PublicBaseUrl()
    );

    return this.prisma.$transaction(async (transaction) => {
      await this.lockVideoGuideLesson(transaction, lessonId);
      const current = await transaction.videoGuideLesson.findFirst({
        where: {
          id: lessonId,
          userId
        }
      });
      const currentJob = narrationScriptEditJobFromContent(current?.content);

      if (
        !current ||
        currentJob?.status !== "RUNNING" ||
        !narrationScriptEditJobMatches(currentJob, expectedJob)
      ) {
        throw new AppException(40901, "本句文稿编辑任务已失效，请重新编辑", HttpStatus.CONFLICT);
      }

      const nodes = narrationScriptEditNodes(current.content, currentJob);
      this.validatedEditedNarrationContent(current.content, nodes);
      const changedNode = videoGuideChangedNarrationNode(current.content, nodes);
      const storedVoice = videoGuideStoredNarrationVoice(current.content);
      const modelAlias = videoGuideStoredNarrationModelAlias(current.content);
      const revision = videoGuideNarrationScriptEditRevision({
        audioTaskId: videoGuideNarrationNodeAudioTaskId(current.content, changedNode?.id),
        lessonId: current.id,
        modelAlias,
        node: changedNode,
        voice: storedVoice
      });

      if (!changedNode || revision !== currentJob.revision) {
        throw new AppException(40901, "文稿或原语音角色已发生变化，请重新编辑", HttpStatus.CONFLICT);
      }

      const previousTaskIds = isRecord(current.content) && Array.isArray(current.content.narrationTimeline)
        ? current.content.narrationTimeline
            .map((value) => isRecord(value) ? value : null)
            .filter((value) => value?.id === currentJob.nodeId)
            .map((value) => stringFromUnknown(value?.audioTaskId))
            .filter(Boolean)
        : [];

      const content = clearNarrationScriptEditJobContent(this.validatedEditedNarrationContent(
        current.content,
        nodes,
        {
          nodeId: currentJob.nodeId,
          audio: {
            audioTaskId: verified.audioTaskId,
            audioAssetId: verified.audioAssetId,
            audioUrl: verified.url,
            audioObjectKey: verified.objectKey,
            audioSizeBytes: verified.sizeBytes,
            audioSha256: verified.sha256,
            ...(verified.durationMs ? { durationMs: verified.durationMs } : {})
          }
        }
      ));
      const saved = await transaction.videoGuideLesson.update({
        where: { id: current.id },
        data: {
          content: content as unknown as Prisma.InputJsonValue,
          errorMessage: null
        }
      });

      await this.settleVideoGuideCredits(transaction, {
        actualCredits: currentJob.estimatedCredits,
        consumeNote: `视频导学本句讲解语音合成消耗 ${currentJob.estimatedCredits} 点`,
        operationKey: currentJob.operationKey,
        releaseNote: "视频导学本句讲解语音合成释放多余冻结点数",
        userId
      });

      return { previousTaskIds, saved };
    });
  }

  private async heartbeatNarrationScriptEdit(
    lessonId: string,
    userId: string,
    expectedJob: NarrationScriptEditJob
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockVideoGuideLesson(transaction, lessonId);
      const current = await transaction.videoGuideLesson.findFirst({
        where: {
          id: lessonId,
          userId
        }
      });
      const currentJob = narrationScriptEditJobFromContent(current?.content);

      if (
        !current ||
        currentJob?.status !== "RUNNING" ||
        !narrationScriptEditJobMatches(currentJob, expectedJob)
      ) {
        throw new AppException(40901, "本句文稿编辑任务已失效", HttpStatus.CONFLICT);
      }

      const refreshedJob = {
        ...currentJob,
        updatedAt: new Date().toISOString()
      };
      await transaction.videoGuideLesson.update({
        where: { id: current.id },
        data: {
          content: mergeNarrationScriptEditJobContent(current.content, refreshedJob) as unknown as Prisma.InputJsonValue
        }
      });

      return refreshedJob;
    });
  }

  private async failNarrationScriptEdit(
    lessonId: string,
    userId: string,
    expectedJob: NarrationScriptEditJob,
    onlyIfStale = false
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockVideoGuideLesson(transaction, lessonId);
      const current = await transaction.videoGuideLesson.findFirst({
        where: {
          id: lessonId,
          userId
        }
      });
      const currentJob = narrationScriptEditJobFromContent(current?.content);

      if (!current || !narrationScriptEditJobMatches(currentJob, expectedJob)) {
        return false;
      }

      if (currentJob.status === "CLEANUP_PENDING") {
        return true;
      }

      if (onlyIfStale && !narrationScriptEditJobIsStale(currentJob, new Date().toISOString())) {
        return false;
      }

      const cleanupJob: NarrationScriptEditJob = {
        ...currentJob,
        status: "CLEANUP_PENDING",
        updatedAt: new Date().toISOString()
      };
      await transaction.videoGuideLesson.update({
        where: { id: current.id },
        data: {
          content: mergeNarrationScriptEditJobContent(current.content, cleanupJob) as unknown as Prisma.InputJsonValue
        }
      });
      await this.releaseVideoGuideCredits(transaction, {
        userId,
        operationKey: currentJob.operationKey,
        note: "视频导学本句讲解语音失败，已释放冻结点数"
      });

      return true;
    });
  }

  private async cleanupNarrationScriptEdit(
    lessonId: string,
    userId: string,
    expectedJob: NarrationScriptEditJob
  ) {
    await this.audioService.cleanupExternalNarrationAudioByPersistence(userId, {
      lessonId,
      generationId: expectedJob.requestId,
      nodeId: expectedJob.nodeId,
      format: "mp3"
    });

    await this.prisma.$transaction(async (transaction) => {
      await this.lockVideoGuideLesson(transaction, lessonId);
      const current = await transaction.videoGuideLesson.findFirst({
        where: {
          id: lessonId,
          userId
        }
      });
      const currentJob = narrationScriptEditJobFromContent(current?.content);

      if (
        !current ||
        currentJob?.status !== "CLEANUP_PENDING" ||
        !narrationScriptEditJobMatches(currentJob, expectedJob)
      ) {
        return;
      }

      await transaction.videoGuideLesson.update({
        where: { id: current.id },
        data: {
          content: clearNarrationScriptEditJobContent(current.content) as unknown as Prisma.InputJsonValue
        }
      });
    });
  }

  private validatedEditedNarrationContent(
    contentValue: unknown,
    nodes: UpdateVideoGuideNarrationScriptDto["nodes"],
    replacement?: Parameters<typeof mergeEditedNarrationDraftContent>[3]
  ) {
    let content: ReturnType<typeof mergeEditedNarrationDraftContent>;

    try {
      content = mergeEditedNarrationDraftContent(
        contentValue,
        nodes,
        new Date().toISOString(),
        replacement
      );
    } catch (error) {
      throw new AppException(
        40001,
        error instanceof Error ? error.message : "文稿保存失败",
        HttpStatus.BAD_REQUEST
      );
    }

    if (narrationScriptCharacterCount(content) > videoGuideSubtitleTextMaxLength) {
      throw new AppException(
        40001,
        "讲解文案总长度不能超过 200000 个字符",
        HttpStatus.BAD_REQUEST
      );
    }

    return content;
  }

  async estimateLessonNarrationScriptUpdate(
    subject: ProfileSubject,
    id: string,
    dto: UpdateVideoGuideNarrationScriptDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const lessonId = id.trim();
    const lesson = await this.prisma.videoGuideLesson.findFirst({
      where: videoGuideSubjectWhere(subject, { id: lessonId })
    });

    if (!lesson) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    this.assertLessonOperationAvailable(lesson, "NARRATION");
    this.validatedEditedNarrationContent(lesson.content, dto.nodes);
    const changedNode = videoGuideChangedNarrationNode(lesson.content, dto.nodes);
    const ttsNode = changedNode
      ? { ...changedNode, script: narrationTextForTts(changedNode.script) }
      : null;
    const voice = videoGuideStoredNarrationVoice(lesson.content);
    const modelAlias = videoGuideStoredNarrationModelAlias(lesson.content);
    const items = ttsNode && videoGuideContentHasNarrationAudio(lesson.content)
      ? [{
          code: "TEACHER_NARRATION_TTS",
          name: "本句讲解语音合成",
          description: `按实际送入语音合成的 ${ttsNode.script.length} 个字符重新合成本句讲解语音。`,
          estimatedCredits: narrationTtsCreditsForCompletedNodes(
            [ttsNode],
            new Set([ttsNode.id]),
            narrationTtsRates()
          )
        }]
      : [];
    const estimate = await this.createBillingEstimate(userId, {
      operation: "VIDEO_GUIDE_NARRATION_TTS",
      title: "更新本句讲解语音",
      items
    });

    return {
      ...estimate,
      revision: videoGuideNarrationScriptEditRevision({
        audioTaskId: videoGuideNarrationNodeAudioTaskId(lesson.content, changedNode?.id),
        lessonId: lesson.id,
        modelAlias,
        node: changedNode,
        voice
      })
    };
  }

  async createLesson(
    subject: ProfileSubject,
    dto: CreateVideoGuideLessonDto
  ) {
    const { userId, learnerId } = subject;
    this.assertCreateInput(dto);
    const estimate = await this.estimateLessonGeneration(userId, dto);
    this.assertBillingConfirmed(dto.billingConfirmed, estimate);
    const draftLessonId = dto.lessonId?.trim();

    if (draftLessonId) {
      const operationKey = lessonGenerationOperationKey(draftLessonId);
      const lesson = await this.prisma.$transaction(async (transaction) => {
        await this.lockVideoGuideLesson(transaction, draftLessonId);
        const current = await transaction.videoGuideLesson.findFirst({
          where: videoGuideSubjectWhere(subject, { id: draftLessonId })
        });

        if (!current) {
          throw new AppException(40401, "导学课件草稿不存在", HttpStatus.NOT_FOUND);
        }

        if (!isReusableVideoGuideLessonStatus(current.status)) {
          throw new AppException(40001, "当前课件正在生成中，请稍后查看生成结果", HttpStatus.BAD_REQUEST);
        }

        this.assertLessonOperationAvailable(current, "NARRATION");
        const content = queuedNarrationJobContent(
          dto,
          operationKey,
          estimate.estimatedCredits,
          current.content
        );

        const updated = await transaction.videoGuideLesson.update({
          where: {
            id: current.id
          },
          data: {
            title: this.lessonTitle(dto),
            mediaName: dto.mediaName.trim(),
            mediaType: dto.mediaType,
            mediaMimeType: dto.mediaMimeType?.trim() || null,
            mediaSizeBytes: dto.mediaSizeBytes,
            mediaUrl: dto.mediaUrl?.trim() || null,
            mediaStorageKey: dto.mediaStorageKey?.trim() || null,
            subtitleName: dto.subtitleName.trim(),
            subtitleFormat: dto.subtitleFormat,
            subtitleSizeBytes: dto.subtitleSizeBytes ?? null,
            subtitleUrl: dto.subtitleUrl?.trim() || null,
            subtitleStorageKey: dto.subtitleStorageKey?.trim() || null,
            status: "QUEUED",
            content,
            errorMessage: null,
            finishedAt: null
          }
        });

        await this.reserveVideoGuideCredits(transaction, {
          userId,
          operationKey,
          estimatedCredits: estimate.estimatedCredits,
          note: `视频导学文案生成冻结 ${estimate.estimatedCredits} 点`
        });

        return updated;
      });

      this.scheduleGeneration(lesson.id);

      return this.toLesson(lesson);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const shareToken = this.createShareToken();
      const existing = await this.prisma.videoGuideLesson.findUnique({
        where: {
          shareToken
        },
        select: {
          id: true
        }
      });

      if (existing) {
        continue;
      }

      const createOperationKey = lessonGenerationOperationKey();
      const createContent = queuedNarrationJobContent(dto, createOperationKey, estimate.estimatedCredits);
      const lesson = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.videoGuideLesson.create({
          data: {
            userId,
            learnerId,
            title: this.lessonTitle(dto),
            mediaName: dto.mediaName.trim(),
            mediaType: dto.mediaType,
            mediaMimeType: dto.mediaMimeType?.trim() || null,
            mediaSizeBytes: dto.mediaSizeBytes,
            mediaUrl: dto.mediaUrl?.trim() || null,
            mediaStorageKey: dto.mediaStorageKey?.trim() || null,
            subtitleName: dto.subtitleName.trim(),
            subtitleFormat: dto.subtitleFormat,
            subtitleSizeBytes: dto.subtitleSizeBytes ?? null,
            subtitleUrl: dto.subtitleUrl?.trim() || null,
            subtitleStorageKey: dto.subtitleStorageKey?.trim() || null,
            status: "QUEUED",
            shareToken,
            content: createContent
          }
        });

        await this.reserveVideoGuideCredits(transaction, {
          userId,
          operationKey: createOperationKey,
          estimatedCredits: estimate.estimatedCredits,
          note: `视频导学文案生成冻结 ${estimate.estimatedCredits} 点`
        });

        return created;
      });

      this.scheduleGeneration(lesson.id);

      return this.toLesson(lesson);
    }

    throw new AppException(50001, "生成分享链接失败，请稍后重试", HttpStatus.INTERNAL_SERVER_ERROR);
  }

  async estimateLessonGeneration(userId: string, dto: CreateVideoGuideLessonDto) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    this.assertCreateInput(dto);

    return this.createBillingEstimate(userId, {
      operation: "VIDEO_GUIDE_LESSON",
      title: "生成导学文案",
      items: lessonBillingItems(dto)
    });
  }

  async estimateNarrationAudioGeneration(
    subject: ProfileSubject,
    lessonId: string,
    dto: EstimateVideoGuideNarrationAudioDto = {}
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const lesson = await this.findNarrationTtsReadyLesson(subject, lessonId);
    const draftNodes = narrationTtsDraftFromContent(lesson.content);
    const draftRevision = narrationDraftRevision(draftNodes);
    const narrationVoice = dto.narrationVoice?.trim();
    const narrationTtsModelAlias = dto.narrationTtsModelAlias?.trim() || "tts-default";
    const totalCredits = narrationTtsTotalCredits(lesson.content);
    const resume = narrationVoice
      ? await this.resolveNarrationTtsResumeBilling(this.prisma, lesson.content, {
          draftRevision,
          narrationTtsModelAlias,
          narrationVoice,
          totalCredits
        })
      : { billedCredits: 0, checkpointId: null, remainingCredits: totalCredits };
    const estimate = await this.createBillingEstimate(userId, {
      operation: "VIDEO_GUIDE_NARRATION_TTS",
      title: "合成导学讲解语音",
      items: narrationTtsBillingItems(lesson.content, resume.billedCredits)
    });

    return {
      ...estimate,
      revision:
        narrationVoice
          ? narrationTtsBillingRevision({
              billedCredits: resume.billedCredits,
              checkpointId: resume.checkpointId ?? "",
              draftRevision,
              modelAlias: narrationTtsModelAlias,
              totalCredits,
              voice: narrationVoice
            })
          : draftRevision
    };
  }

  async generateNarrationAudio(
    subject: ProfileSubject,
    lessonId: string,
    dto: GenerateVideoGuideNarrationAudioDto
  ) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const narrationVoice = dto.narrationVoice?.trim();

    if (!narrationVoice) {
      throw new AppException(40001, "请选择讲解音色", HttpStatus.BAD_REQUEST);
    }
    const narrationVoiceSelection = resolveVideoGuideNarrationVoiceSelection(narrationVoice);

    if (!narrationVoiceSelection.voice && !narrationVoiceSelection.voiceAssetId) {
      throw new AppException(40001, "请选择讲解音色", HttpStatus.BAD_REQUEST);
    }

    const estimateLesson = await this.findNarrationTtsReadyLesson(subject, lessonId);
    const draftNodes = narrationTtsDraftFromContent(estimateLesson.content);
    const draftRevision = narrationDraftRevision(draftNodes);
    const narrationTtsModelAlias = dto.narrationTtsModelAlias?.trim() || "tts-default";
    const totalCredits = narrationTtsTotalCredits(estimateLesson.content);
    const resume = await this.resolveNarrationTtsResumeBilling(this.prisma, estimateLesson.content, {
      draftRevision,
      narrationTtsModelAlias,
      narrationVoice,
      totalCredits
    });
    const estimate = await this.createBillingEstimate(userId, {
      operation: "VIDEO_GUIDE_NARRATION_TTS",
      title: "合成导学讲解语音",
      items: narrationTtsBillingItems(estimateLesson.content, resume.billedCredits)
    });
    this.assertBillingConfirmed(dto.billingConfirmed, estimate);

    const billingRevision = narrationTtsBillingRevision({
      billedCredits: resume.billedCredits,
      checkpointId: resume.checkpointId ?? "",
      draftRevision,
      modelAlias: narrationTtsModelAlias,
      totalCredits,
      voice: narrationVoice
    });

    if (dto.billingRevision?.trim() !== billingRevision) {
      throw new AppException(
        40001,
        "导学文案已发生变化，或讲解语音费用已更新，请重新确认本次点数消耗",
        HttpStatus.BAD_REQUEST
      );
    }

    const jobId = randomBytes(12).toString("hex");
    const checkpointId = resume.checkpointId ?? jobId;
    const operationKey = `video-guide-narration-tts:${lessonId}:generation:${randomBytes(8).toString("hex")}`;
    const now = new Date().toISOString();
    const job = createVideoGuideOperationJob({
      operation: "NARRATION_TTS",
      jobId,
      operationKey,
      estimatedCredits: estimate.estimatedCredits,
      input: serializableVideoGuideJobInput({
        billedCreditsBeforeAttempt: resume.billedCredits,
        checkpointId,
        draftRevision,
        narrationVoice,
        narrationTtsModelAlias
      }),
      now
    });
    const progress = createVideoGuideOperationProgress({
      operation: "NARRATION_TTS",
      phase: "QUEUED",
      message: "讲解语音任务已提交，可以关闭页面，后台会继续生成",
      now,
      total: draftNodes.length
    });
    const queuedLesson = await this.prisma.$transaction(async (transaction) => {
      await this.lockVideoGuideLesson(transaction, lessonId);
      const lesson = await transaction.videoGuideLesson.findFirst({
        where: videoGuideSubjectWhere(subject, { id: lessonId })
      });

      this.assertNarrationTtsReadyLesson(lesson);
      this.assertLessonOperationAvailable(lesson!, "NARRATION_TTS");

      const lockedDraftNodes = narrationTtsDraftFromContent(lesson!.content);
      const lockedDraftRevision = narrationDraftRevision(lockedDraftNodes);
      const lockedTotalCredits = narrationTtsTotalCredits(lesson!.content);
      const lockedResume = await this.resolveNarrationTtsResumeBilling(
        transaction,
        lesson!.content,
        {
          draftRevision: lockedDraftRevision,
          narrationTtsModelAlias,
          narrationVoice,
          totalCredits: lockedTotalCredits
        }
      );

      if (
        lockedDraftRevision !== draftRevision ||
        lockedTotalCredits !== totalCredits ||
        lockedResume.billedCredits !== resume.billedCredits ||
        lockedResume.remainingCredits !== resume.remainingCredits ||
        lockedResume.checkpointId !== resume.checkpointId
      ) {
        throw new AppException(
          40001,
          "导学文案已发生变化，或讲解语音费用已更新，请重新确认本次点数消耗",
          HttpStatus.BAD_REQUEST
        );
      }

      await this.reserveVideoGuideCredits(transaction, {
        userId,
        operationKey,
        estimatedCredits: estimate.estimatedCredits,
        note: `视频导学讲解语音合成冻结 ${estimate.estimatedCredits} 点`
      });

      return transaction.videoGuideLesson.update({
        where: {
          id: lesson!.id
        },
        data: {
          status: "QUEUED",
          content: mergeVideoGuideOperationProgressContent(
            mergeVideoGuideOperationJobContent(
              {
                ...(isRecord(lesson!.content) ? lesson!.content : {}),
                narrationVoice: {
                  providerVoiceId: narrationVoiceSelection.voice ?? null,
                  voiceAssetId: narrationVoiceSelection.voiceAssetId ?? null,
                  modelAlias: narrationTtsModelAlias,
                  modelName: null,
                  providerName: null
                }
              },
              "narrationTtsGenerationJob",
              job
            ),
            "narrationTtsGenerationProgress",
            progress
          ) as unknown as Prisma.InputJsonValue,
          errorMessage: null,
          finishedAt: null
        }
      });
    });

    this.scheduleNarrationTtsGeneration(queuedLesson.id);

    return this.toLesson(queuedLesson);
  }

  async estimatePracticeGeneration(subject: ProfileSubject, lessonId: string) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const lesson = await this.findPracticeReadyLesson(subject, lessonId);

    return this.createBillingEstimate(userId, {
      operation: "VIDEO_GUIDE_PRACTICE",
      title: "生成随堂练习",
      items: practiceBillingItems(lesson)
    });
  }

  async generatePracticeQuestions(subject: ProfileSubject, lessonId: string, dto: GenerateVideoGuidePracticeDto) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const estimateLesson = await this.findPracticeReadyLesson(subject, lessonId);
    const estimate = await this.createBillingEstimate(userId, {
      operation: "VIDEO_GUIDE_PRACTICE",
      title: "生成随堂练习",
      items: practiceBillingItems(estimateLesson)
    });

    this.assertBillingConfirmed(dto.billingConfirmed, estimate);

    const operationKey = `video-guide-practice:${lessonId}:generation:${randomBytes(8).toString("hex")}`;
    const job = createVideoGuideOperationJob({
      operation: "PRACTICE",
      jobId: randomBytes(12).toString("hex"),
      operationKey,
      estimatedCredits: estimate.estimatedCredits,
      input: {},
      now: new Date().toISOString()
    });
    const progress = createVideoGuideOperationProgress({
      operation: "PRACTICE",
      phase: "QUEUED",
      message: "随堂练习任务已提交，可以关闭页面，后台会继续生成",
      now: new Date().toISOString(),
      total: 3
    });
    const queuedLesson = await this.prisma.$transaction(async (transaction) => {
      await this.lockVideoGuideLesson(transaction, lessonId);
      const lesson = await transaction.videoGuideLesson.findFirst({
        where: videoGuideSubjectWhere(subject, { id: lessonId })
      });

      this.assertPracticeReadyLesson(lesson);
      this.assertLessonOperationAvailable(lesson!, "PRACTICE");
      await this.reserveVideoGuideCredits(transaction, {
        userId,
        operationKey,
        estimatedCredits: estimate.estimatedCredits,
        note: `视频导学随堂练习生成冻结 ${estimate.estimatedCredits} 点`
      });

      return transaction.videoGuideLesson.update({
        where: {
          id: lesson!.id
        },
        data: {
          content: mergeVideoGuideOperationProgressContent(
            mergeVideoGuideOperationJobContent(
              lesson!.content,
              "practiceGenerationJob",
              job
            ),
            "practiceGenerationProgress",
            progress
          ) as unknown as Prisma.InputJsonValue
        }
      });
    });

    this.schedulePracticeGeneration(queuedLesson.id);

    return this.toLesson(queuedLesson);
  }

  private schedulePracticeGeneration(lessonId: string) {
    const timer = setTimeout(() => {
      this.runBackgroundTask("生成视频导学随堂练习", () =>
        this.runWithStoredLessonAuthorization(lessonId, (attribution) =>
          this.runPracticeGeneration(lessonId, attribution))
      );
    }, generationQueuedDelayMs);

    timer.unref?.();
  }

  private async runPracticeGeneration(
    lessonId: string,
    attribution: AttributionContext
  ) {
    const claimed = await this.claimLessonOperation<Record<string, never>>({
      lessonId,
      operation: "PRACTICE",
      jobKey: "practiceGenerationJob",
      progressKey: "practiceGenerationProgress",
      phase: "GENERATING",
      message: "正在基于导学文案生成十道英语单选题"
    });

    if (!claimed) {
      return;
    }

    const { job, lesson: claimedLesson } = claimed;
    const userId = claimedLesson.userId;
    const operationKey = job.operationKey;
    const estimatedCredits = job.estimatedCredits;
    const attemptId = job.attemptId;

    if (!attemptId) {
      return;
    }

    const lease = {
      attemptId,
      jobId: job.jobId,
      jobKey: "practiceGenerationJob" as const
    };

    let materialChanged = false;

    try {
      const lesson = await this.findPracticeReadyLesson(
        profileSubjectFromRecord(claimedLesson),
        lessonId
      );
      const variables = practicePromptVariablesFromLesson(lesson);
      const practice = await this.aiService.generateScenarioTextForExternalBilling({
        ...attribution,
        scenarioSlug: "video-guide-practice-questions",
        input: lesson.title,
        variables
      });
      await this.updateLessonOperationProgress(
        lessonId,
        "practiceGenerationProgress",
        {
          completed: 1,
          phase: "VALIDATING",
          message: "题目已生成，正在检查题干、选项和答案"
        },
        lease
      );
      const questions = normalizeGeneratedPracticeQuestions(practice.text);

      if (questions.length < 10) {
        throw new AppException(50201, "AI 未返回有效的随堂练习题，请稍后重试", HttpStatus.BAD_GATEWAY);
      }

      await this.updateLessonOperationProgress(
        lessonId,
        "practiceGenerationProgress",
        {
          completed: 2,
          phase: "SAVING",
          message: "练习题校验完成，正在保存到当前课件"
        },
        lease
      );

      materialChanged = await this.prisma.$transaction(async (transaction) => {
        await this.lockVideoGuideLesson(transaction, lessonId);
        const current = await transaction.videoGuideLesson.findFirst({
          where: {
            id: lesson.id,
            userId
          }
        });

        this.assertPracticeReadyLesson(current);
        const currentContent = current && isRecord(current.content) ? current.content : {};

        if (
          !current ||
          !videoGuideOperationAttemptMatches(
            currentContent.practiceGenerationJob,
            job.jobId,
            attemptId
          )
        ) {
          return false;
        }
        const mergedContent = mergeLessonPracticeContent(current!.content, {
          aiModelName: practice.modelName,
          aiProviderName: practice.providerName,
          aiTaskId: practice.taskId,
          questions
        });
        const completedProgress = this.nextOperationProgress(
          mergedContent,
          "practiceGenerationProgress",
          {
            status: "SUCCEEDED",
            phase: "COMPLETED",
            completed: 3,
            message: "随堂练习已生成，可以进入学习页作答"
          }
        );

        const updated = await transaction.videoGuideLesson.updateMany({
          where: {
            id: lesson.id,
            AND: [
              { content: { path: ["practiceGenerationJob", "jobId"], equals: job.jobId } },
              { content: { path: ["practiceGenerationJob", "attemptId"], equals: attemptId } }
            ]
          },
          data: {
            content: mergeVideoGuideOperationProgressContent(
              mergedContent,
              "practiceGenerationProgress",
              completedProgress
            ) as unknown as Prisma.InputJsonValue
          }
        });

        if (updated.count !== 1) {
          return false;
        }

        await this.settleVideoGuideCredits(transaction, {
          userId,
          operationKey,
          actualCredits: estimatedCredits,
          consumeNote: `视频导学随堂练习生成消耗 ${estimatedCredits} 点`,
          releaseNote: "视频导学随堂练习生成释放多余冻结点数"
        });
        return true;
      });
    } catch (error) {
      const errorMessage = videoGuideGenerationErrorMessage(error);

      await this.prisma.$transaction(async (transaction) => {
        await this.lockVideoGuideLesson(transaction, lessonId);
        const current = await transaction.videoGuideLesson.findFirst({
          where: {
            id: lessonId,
            userId
          }
        });

        const currentContent = current && isRecord(current.content) ? current.content : {};

        if (
          current &&
          videoGuideOperationAttemptMatches(
            currentContent.practiceGenerationJob,
            job.jobId,
            attemptId
          )
        ) {
          const failedProgress = this.failedOperationProgress(
            current.content,
            "practiceGenerationProgress",
            "PRACTICE",
            {
              errorMessage,
              message: "随堂练习生成失败，可以重新提交"
            }
          );

          const updated = await transaction.videoGuideLesson.updateMany({
            where: {
              id: current.id,
              AND: [
                { content: { path: ["practiceGenerationJob", "jobId"], equals: job.jobId } },
                { content: { path: ["practiceGenerationJob", "attemptId"], equals: attemptId } }
              ]
            },
            data: {
              content: mergeVideoGuideOperationProgressContent(
                current.content,
                "practiceGenerationProgress",
                failedProgress
              ) as unknown as Prisma.InputJsonValue
            }
          });

          if (updated.count === 1) {
            await this.releaseVideoGuideCredits(transaction, {
              userId,
              operationKey,
              note: "视频导学随堂练习生成失败，已释放冻结点数"
            });
          }
        }
      });
    }

    if (materialChanged) {
      await this.recordCourseMaterialChange(lessonId);
    }
  }

  async normalizeUserLessonMediaForWeb(subject: ProfileSubject, id: string) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const lesson = await this.prisma.videoGuideLesson.findFirst({
      where: videoGuideSubjectWhere(subject, { id })
    });

    if (!lesson) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    return this.toLesson(await this.normalizeVideoGuideLessonMediaForWeb(lesson));
  }

  async normalizeLessonMediaForWebByShareToken(shareToken: string) {
    const lesson = await this.findLessonByShareToken(shareToken);

    if (!lesson) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    return this.toLesson(await this.normalizeVideoGuideLessonMediaForWeb(lesson));
  }

  async listUserLessons(subject: ProfileSubject, profile?: unknown) {
    const where = await resolveHistoryProfileWhere(this.prisma, subject, profile);
    const lessons = await this.prisma.videoGuideLesson.findMany({
      where,
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });

    return lessons.map((lesson) => this.toLesson(lesson));
  }

  async getUserLesson(subject: ProfileSubject, id: string) {
    const lesson = await this.prisma.videoGuideLesson.findFirst({
      where: videoGuideSubjectWhere(subject, { id })
    });

    if (!lesson) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    return this.toLesson(lesson);
  }

  async deleteUserLesson(subject: ProfileSubject, id: string) {
    const { userId } = subject;
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }

    const lessonId = id.trim();

    if (!lessonId) {
      throw new AppException(40001, "导学课件 ID 不能为空", HttpStatus.BAD_REQUEST);
    }

    await this.prisma.$transaction(async (transaction) => {
      await this.lockVideoGuideLesson(transaction, lessonId);
      const lesson = await transaction.videoGuideLesson.findFirst({
        where: videoGuideSubjectWhere(subject, { id: lessonId })
      });

      if (!lesson) {
        throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
      }

      const content = isRecord(lesson.content) ? lesson.content : {};
      const jobs = [
        videoGuideOperationJobFromValue(content.subtitleGenerationJob),
        videoGuideOperationJobFromValue(content.narrationGenerationJob),
        videoGuideOperationJobFromValue(content.narrationTtsGenerationJob),
        videoGuideOperationJobFromValue(content.practiceGenerationJob)
      ].filter((job): job is VideoGuideOperationJob => Boolean(job));
      const operationKeys = new Set(jobs.map((job) => job.operationKey));
      const narrationScriptEditJob = narrationScriptEditJobFromContent(content);

      if (narrationScriptEditJob) {
        operationKeys.add(narrationScriptEditJob.operationKey);
      }

      if (["QUEUED", "GENERATING"].includes(lesson.status)) {
        operationKeys.add(lessonBillingOperationKey(lesson));
      }

      for (const operationKey of operationKeys) {
        await this.releaseVideoGuideCredits(transaction, {
          userId,
          operationKey,
          note: "删除视频导学课件，释放生成冻结点数"
        });
      }

      await transaction.videoGuideLesson.delete({
        where: {
          id: lesson.id
        }
      });
    });

    return {
      deleted: true,
      id: lessonId
    };
  }

  private async findPracticeReadyLesson(subject: ProfileSubject, lessonId: string) {
    const lesson = await this.prisma.videoGuideLesson.findFirst({
      where: videoGuideSubjectWhere(subject, { id: lessonId })
    });

    this.assertPracticeReadyLesson(lesson);

    return lesson!;
  }

  private async findNarrationTtsReadyLesson(subject: ProfileSubject, lessonId: string) {
    const lesson = await this.prisma.videoGuideLesson.findFirst({
      where: videoGuideSubjectWhere(subject, { id: lessonId })
    });

    this.assertNarrationTtsReadyLesson(lesson);

    return lesson!;
  }

  private assertNarrationTtsReadyLesson(lesson: VideoGuideLessonRecord | null) {
    if (!lesson) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    if (lesson.status === "QUEUED" || lesson.status === "GENERATING") {
      throw new AppException(40001, "当前课件已有后台生成任务，请等待完成后再合成讲解语音", HttpStatus.BAD_REQUEST);
    }

    if (!videoGuideScriptIsReady(lesson.content)) {
      throw new AppException(40001, "请先完成导学文案生成，再合成讲解语音", HttpStatus.BAD_REQUEST);
    }
  }

  private assertPracticeReadyLesson(lesson: VideoGuideLessonRecord | null) {
    if (!lesson) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    if (lesson.status === "QUEUED" || lesson.status === "GENERATING") {
      throw new AppException(40001, "当前课件已有后台生成任务，请等待完成后再生成随堂练习", HttpStatus.BAD_REQUEST);
    }

    if (!videoGuideScriptIsReady(lesson.content)) {
      throw new AppException(40001, "当前课件还没有导学课件文案，请先生成导学课件文案", HttpStatus.BAD_REQUEST);
    }
  }

  private resolveAsrMediaUrl(dto: GenerateVideoGuideSubtitleDto) {
    const directUrl = dto.mediaUrl?.trim();
    const storageKey = dto.mediaStorageKey?.trim();
    const r2SignedUrl = storageKey ? signedVideoGuideMediaUrlFromStorageKey(storageKey) : null;
    const r2PublicUrl = storageKey ? publicVideoGuideMediaUrlFromStorageKey(storageKey) : null;

    if (r2SignedUrl) {
      return r2SignedUrl;
    }

    if (directUrl) {
      if (isLocalOnlyUrl(directUrl)) {
        if (r2PublicUrl) {
          return r2PublicUrl;
        }

        throw new AppException(40001, "当前媒体文件地址为本地地址，语音识别需要公网可访问的媒体文件，请重新上传后再生成字幕", HttpStatus.BAD_REQUEST);
      }

      return directUrl;
    }

    if (!storageKey) {
      throw new AppException(40001, "请先上传视频或音频文件", HttpStatus.BAD_REQUEST);
    }

    if (r2PublicUrl) {
      return r2PublicUrl;
    }

    const safeFilename = basename(storageKey);
    const filepath = resolve(videoGuideUploadDir(), safeFilename);

    if (!filepath.startsWith(videoGuideUploadDir()) || !existsSync(filepath)) {
      throw new AppException(40401, "媒体文件不存在，请重新上传", HttpStatus.NOT_FOUND);
    }

    const localUrl = `${publicApiBaseUrl()}/public/video-guide/files/${safeFilename}`;

    if (isLocalOnlyUrl(localUrl)) {
      throw new AppException(40001, "当前媒体文件地址为本地地址，语音识别需要公网可访问的媒体文件，请重新上传后再生成字幕", HttpStatus.BAD_REQUEST);
    }

    return localUrl;
  }

  private async prepareVideoGuideAsrMedia(input: {
    checkpoint: VideoGuideSubtitleCheckpoint;
    dto: GenerateVideoGuideSubtitleDto;
    attemptId: string;
    jobId: string;
    mediaName: string;
    onExtracting: () => Promise<void>;
    onHeartbeat: () => Promise<void>;
    onUploading: (file: UploadedVideoGuideFileLike) => Promise<void>;
    onUploaded: (file: UploadedVideoGuideFileLike, objectKey: string, reusable: boolean) => Promise<void>;
  }) {
    if (input.checkpoint.asrObjectKey) {
      const restoredUrl = signedVideoGuideR2UrlFromObjectKey(input.checkpoint.asrObjectKey);

      if (
        restoredUrl &&
        input.checkpoint.asrMediaName &&
        input.checkpoint.asrMediaMimeType &&
        input.checkpoint.asrMediaSizeBytes
      ) {
        try {
          await assertVideoGuideAsrUrlReadable(restoredUrl);
          return {
            mediaUrl: restoredUrl,
            mediaName: input.checkpoint.asrMediaName,
            mediaMimeType: input.checkpoint.asrMediaMimeType,
            sizeBytes: input.checkpoint.asrMediaSizeBytes,
            objectKey: input.checkpoint.asrObjectKey,
            reusable: input.checkpoint.asrReusable
          };
        } catch {
          // 对象已经过期或被清理时，从媒体资产重新构建。
        }
      }
    }

    const mediaAsset = await this.findVideoGuideMediaAssetForAsr(input.dto);
    const reusableCache = mediaAsset
      ? await this.readReusableVideoGuideAsrCache(mediaAsset, input.mediaName)
      : null;

    if (reusableCache) {
      return reusableCache;
    }

    const sourceUrl = this.resolveAsrMediaUrl(input.dto);

    if (
      process.env.VIDEO_GUIDE_ASR_PREPROCESS_DISABLED === "1" ||
      videoGuideMediaUploadDriver() !== "r2" ||
      !optionalVideoGuideR2Config()
    ) {
      return {
        mediaUrl: sourceUrl,
        mediaName: input.mediaName,
        mediaMimeType: input.dto.mediaMimeType?.trim() || "application/octet-stream",
        sizeBytes: input.dto.mediaSizeBytes,
        objectKey: null,
        reusable: false
      };
    }

    await input.onExtracting();
    const prepared = await extractVideoGuideAsrAudio({
      mediaName: input.mediaName,
      mediaUrl: sourceUrl,
      onHeartbeat: input.onHeartbeat
    });
    await input.onUploading(prepared);
    const reusable = Boolean(mediaAsset);
    const uploaded = mediaAsset
      ? await uploadVideoGuideAsrCacheToR2(mediaAsset.hash, prepared, input.onHeartbeat)
      : await uploadVideoGuideAsrAudioToR2(input.jobId, input.attemptId, prepared, input.onHeartbeat);
    const mediaUrl = signedVideoGuideR2UrlFromObjectKey(uploaded.objectKey);

    if (!mediaUrl) {
      throw new AppException(50001, "字幕识别音频地址生成失败", HttpStatus.BAD_GATEWAY);
    }

    await assertVideoGuideAsrUrlReadable(mediaUrl);

    if (mediaAsset) {
      await this.persistVideoGuideAsrCache(mediaAsset.id, {
        mimeType: prepared.mimetype,
        objectKey: uploaded.objectKey,
        sizeBytes: prepared.size
      });
    }

    try {
      await input.onUploaded(prepared, uploaded.objectKey, reusable);
    } catch (error) {
      if (!reusable) {
        await deleteVideoGuideR2Object(uploaded.objectKey).catch(() => undefined);
      }
      throw error;
    }

    return {
      mediaUrl,
      mediaName: prepared.originalname,
      mediaMimeType: prepared.mimetype,
      sizeBytes: prepared.size,
      objectKey: uploaded.objectKey,
      reusable
    };
  }

  private async findVideoGuideMediaAssetForAsr(dto: GenerateVideoGuideSubtitleDto) {
    const objectKey = dto.mediaStorageKey?.trim();

    if (!objectKey) {
      return null;
    }

    const exactAsset = await this.prisma.videoGuideAsset.findUnique({
      where: {
        objectKey
      }
    });

    if (exactAsset?.assetType === "MEDIA") {
      return exactAsset;
    }

    const hash = videoGuideMediaHashFromStorageKey(objectKey);

    if (!hash || !dto.mediaSizeBytes) {
      return null;
    }

    return this.prisma.videoGuideAsset.findUnique({
      where: {
        assetType_hash_sizeBytes: {
          assetType: "MEDIA",
          hash,
          sizeBytes: dto.mediaSizeBytes
        }
      }
    });
  }

  private async readReusableVideoGuideAsrCache(
    asset: VideoGuideAssetResponseRecord,
    mediaName: string
  ) {
    const cache = videoGuideAsrCacheFromAsset(asset);

    if (!cache) {
      return null;
    }

    const mediaUrl = signedVideoGuideR2UrlFromObjectKey(cache.objectKey);

    if (!mediaUrl) {
      return null;
    }

    try {
      await assertVideoGuideAsrUrlReadable(mediaUrl);
    } catch {
      await this.prisma.videoGuideAsset.updateMany({
        where: {
          id: asset.id,
          asrObjectKey: cache.objectKey,
          asrPreparedAt: asset.asrPreparedAt
        },
        data: {
          asrMimeType: null,
          asrObjectKey: null,
          asrPreparedAt: null,
          asrSizeBytes: null
        }
      });
      return null;
    }

    return {
      mediaMimeType: cache.mimeType,
      mediaName: `${stripExtension(normalizeOriginalName(mediaName))}.asr.m4a`,
      mediaUrl,
      objectKey: cache.objectKey,
      reusable: true,
      sizeBytes: cache.sizeBytes
    };
  }

  private async persistVideoGuideAsrCache(assetId: string, cache: VideoGuideAsrCache) {
    await this.prisma.videoGuideAsset.update({
      where: {
        id: assetId
      },
      data: {
        asrMimeType: cache.mimeType,
        asrObjectKey: cache.objectKey,
        asrPreparedAt: new Date(),
        asrSizeBytes: cache.sizeBytes
      }
    });
  }

  async getPublicLesson(shareToken: string) {
    const lesson = await this.findLessonByShareToken(shareToken);

    if (!lesson || lesson.status !== "SUCCEEDED") {
      throw new AppException(40401, "导学课件不存在或尚未生成完成", HttpStatus.NOT_FOUND);
    }

    return this.toPublicLesson(lesson);
  }

  private async findLessonByShareToken(shareToken: string) {
    return this.prisma.videoGuideLesson.findUnique({
      where: {
        shareToken
      }
    });
  }

  private scheduleGeneration(lessonId: string) {
    const generationTimer = setTimeout(() => {
      this.runBackgroundTask("生成视频导学文案", () =>
        this.runWithStoredLessonAuthorization(lessonId, (attribution) =>
          this.runStoredNarrationGeneration(lessonId, attribution)
        )
      );
    }, generationQueuedDelayMs);

    generationTimer.unref?.();
  }

  private scheduleNarrationTtsGeneration(lessonId: string) {
    const timer = setTimeout(() => {
      this.runBackgroundTask("合成视频导学讲解语音", () =>
        this.runWithStoredLessonAuthorization(lessonId, (attribution) =>
          this.runStoredNarrationTtsGeneration(lessonId, attribution)
        )
      );
    }, generationQueuedDelayMs);

    timer.unref?.();
  }

  private async runWithStoredLessonAuthorization<T>(
    lessonId: string,
    callback: (attribution: AttributionContext) => Promise<T>
  ) {
    if (!this.learnerAccessService) {
      throw new AppException(40301, "内部任务缺少执行身份", HttpStatus.FORBIDDEN);
    }

    const lesson = await this.prisma.videoGuideLesson.findUnique({
      where: { id: lessonId },
      select: {
        userId: true,
        learnerId: true
      }
    });

    if (!lesson) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    if (lesson.learnerId !== null && typeof lesson.learnerId !== "string") {
      throw new AppException(40301, "内部任务缺少执行身份", HttpStatus.FORBIDDEN);
    }

    const subject: ProfileSubject = lesson.learnerId
      ? { mode: "LEARNER", userId: lesson.userId, learnerId: lesson.learnerId }
      : { mode: "ACCOUNT", userId: lesson.userId, learnerId: null };
    const root = await this.learnerAccessService.assertScenarioAuthorized(
      subject,
      "video-guide-narration"
    );

    return this.learnerAccessService.runWithScenarioAuthorization(
      subject,
      root?.slug ?? "video-guide-narration",
      () => callback({
        userId: subject.userId,
        learnerId: subject.learnerId,
        rootScenarioId: root?.id ?? null
      })
    );
  }

  private async runStoredNarrationTtsGeneration(
    lessonId: string,
    attribution: AudioTaskAttributionContext
  ) {
    const claimed = await this.claimLessonOperation<NarrationTtsJobInput>({
      lessonId,
      operation: "NARRATION_TTS",
      jobKey: "narrationTtsGenerationJob",
      progressKey: "narrationTtsGenerationProgress",
      phase: "SYNTHESIZING_AUDIO",
      message: "正在逐段生成并校验讲解语音"
    });

    if (!claimed) {
      return;
    }

    const { job, lesson } = claimed;
    const attemptId = job.attemptId;

    if (!attemptId) {
      return;
    }

    const lease = {
      attemptId,
      jobId: job.jobId,
      jobKey: "narrationTtsGenerationJob" as const
    };
    const draftTimeline = narrationTtsDraftFromContent(lesson.content) as NarrationTimelineNodeDraft[];

    let materialChanged = false;

    try {
      if (draftTimeline.length === 0) {
        throw new AppException(40001, "当前课件没有可合成的导学文案", HttpStatus.BAD_REQUEST);
      }

      const narrationAudio = await this.synthesizeNarrationTimeline(
        lessonId,
        job.input.checkpointId?.trim() || job.jobId,
        attribution,
        draftTimeline,
        job.input,
        job.input.narrationVoice,
        lease
      );
      const narrationTimeline = narrationAudio.nodes;
      const firstAudioNode = narrationTimeline.find((node) => node.audioUrl);

      materialChanged = await this.prisma.$transaction(async (transaction) => {
        await this.lockVideoGuideLesson(transaction, lessonId);
        const current = await transaction.videoGuideLesson.findFirst({
          where: {
            id: lessonId,
            userId: lesson.userId
          }
        });
        const currentContent = current && isRecord(current.content) ? current.content : {};

        if (
          !current ||
          current.status !== "GENERATING" ||
          !videoGuideOperationAttemptMatches(
            currentContent.narrationTtsGenerationJob,
            job.jobId,
            attemptId
          )
        ) {
          return false;
        }

        const mergedContent = mergeLessonNarrationAudioContent(current.content, {
          audioTaskId: firstAudioNode?.audioTaskId ?? null,
          audioUrl: firstAudioNode?.audioUrl ?? null,
          narrationAudioProgress: narrationAudio.progress,
          narrationTimeline,
          ttsModelAlias: job.input.narrationTtsModelAlias,
          voice: job.input.narrationVoice,
          wasTtsTextTruncated: narrationTimeline.some((node) => node.script.length > 8000)
        });
        const completedProgress = this.nextOperationProgress(
          mergedContent,
          "narrationTtsGenerationProgress",
          {
            status: "SUCCEEDED",
            phase: "COMPLETED",
            completed: narrationTimeline.length,
            total: narrationTimeline.length,
            message: "讲解语音已生成，导学课件可以学习和分享"
          }
        );
        const updated = await transaction.videoGuideLesson.updateMany({
          where: {
            id: current.id,
            status: "GENERATING",
            AND: [
              { content: { path: ["narrationTtsGenerationJob", "jobId"], equals: job.jobId } },
              { content: { path: ["narrationTtsGenerationJob", "attemptId"], equals: attemptId } }
            ]
          },
          data: {
            status: "SUCCEEDED",
            content: mergeVideoGuideOperationProgressContent(
              mergedContent,
              "narrationTtsGenerationProgress",
              completedProgress
            ) as unknown as Prisma.InputJsonValue,
            errorMessage: null,
            finishedAt: new Date()
          }
        });

        if (updated.count !== 1) {
          return false;
        }

        await this.settleVideoGuideCredits(transaction, {
          userId: current.userId,
          operationKey: job.operationKey,
          actualCredits: job.estimatedCredits,
          consumeNote: `视频导学讲解语音合成消耗 ${job.estimatedCredits} 点`,
          releaseNote: "视频导学讲解语音合成释放多余冻结点数"
        });
        if (this.learnerActivityService) {
          await this.learnerActivityService.record({
            subject: current.learnerId
              ? { userId: current.userId, mode: "LEARNER", learnerId: current.learnerId }
              : { userId: current.userId, mode: "ACCOUNT", learnerId: null },
            eventType: "CREATE_COMPLETED",
            scenarioId: attribution.rootScenarioId,
            resourceType: "VIDEO_GUIDE",
            resourceId: current.id,
            idempotencyKey: `video-guide:${current.id}:create-completed`,
            metrics: { narrationNodeCount: narrationTimeline.length }
          }, transaction);
        }
        return true;
      });
    } catch (error) {
      const errorMessage = videoGuideGenerationErrorMessage(error);

      await this.prisma.$transaction(async (transaction) => {
        await this.lockVideoGuideLesson(transaction, lessonId);
        const current = await transaction.videoGuideLesson.findFirst({
          where: {
            id: lessonId,
            userId: lesson.userId
          }
        });
        const currentContent = current && isRecord(current.content) ? current.content : {};

        if (
          !current ||
          !videoGuideOperationAttemptMatches(
            currentContent.narrationTtsGenerationJob,
            job.jobId,
            attemptId
          )
        ) {
          return;
        }

        const failedProgress = this.failedOperationProgress(
          current.content,
          "narrationTtsGenerationProgress",
          "NARRATION_TTS",
          {
            errorMessage,
            message: "讲解语音合成失败，可以在当前课件上重新合成"
          }
        );
        const updated = await transaction.videoGuideLesson.updateMany({
          where: {
            id: current.id,
            AND: [
              { content: { path: ["narrationTtsGenerationJob", "jobId"], equals: job.jobId } },
              { content: { path: ["narrationTtsGenerationJob", "attemptId"], equals: attemptId } }
            ]
          },
          data: {
            status: "FAILED",
            content: mergeVideoGuideOperationProgressContent(
              current.content,
              "narrationTtsGenerationProgress",
              failedProgress
            ) as unknown as Prisma.InputJsonValue,
            errorMessage,
            finishedAt: new Date()
          }
        });

        if (updated.count === 1) {
          const actualCredits = this.calculateNarrationTtsAttemptActualCredits(
            current.content,
            job
          );
          await this.settleVideoGuideCredits(transaction, {
            userId: current.userId,
            operationKey: job.operationKey,
            actualCredits,
            consumeNote: `视频导学讲解语音已完成部分消耗 ${actualCredits} 点`,
            releaseNote: "视频导学讲解语音失败，已释放未使用冻结点数"
          });
        }
      });
    }

    if (materialChanged) {
      await this.recordCourseMaterialChange(lessonId);
    }
  }

  private async runStoredNarrationGeneration(
    lessonId: string,
    attribution: AttributionContext
  ) {
    const lesson = await this.prisma.videoGuideLesson.findUnique({
      where: {
        id: lessonId
      },
      select: {
        content: true
      }
    });
    const content = lesson && isRecord(lesson.content) ? lesson.content : {};
    const job = videoGuideOperationJobFromValue<CreateVideoGuideLessonDto>(
      content.narrationGenerationJob
    );

    if (!job || job.operation !== "NARRATION") {
      return;
    }

    await this.generateLessonContent(lessonId, job.input, job.operationKey, attribution);
  }

  private async markGenerating(lessonId: string, generationId: string) {
    const queuedLesson = await this.prisma.videoGuideLesson.findUnique({
      where: {
        id: lessonId
      },
      select: {
        content: true,
        status: true
      }
    });

    if (!queuedLesson || queuedLesson.status !== "QUEUED") {
      return false;
    }

    const generatingProgress = this.nextOperationProgress(
      queuedLesson.content,
      "narrationGenerationProgress",
      {
        status: "RUNNING",
        phase: "PREPARING",
        completed: 2,
        message: "正在整理字幕时间轴并准备分批生成文案"
      }
    );
    const leasedContent = mergeNarrationGenerationLeaseContent(queuedLesson.content, generationId);
    const generatingContent = mergeVideoGuideOperationProgressContent(
      leasedContent,
      "narrationGenerationProgress",
      generatingProgress
    );
    const result = await this.prisma.videoGuideLesson.updateMany({
      where: {
        id: lessonId,
        status: "QUEUED"
      },
      data: {
        status: "GENERATING",
        content: generatingContent as unknown as Prisma.InputJsonValue
      }
    });

    return result.count === 1;
  }

  private async generateLessonContent(
    lessonId: string,
    dto: CreateVideoGuideLessonDto,
    operationKey: string | undefined,
    attribution: AttributionContext
  ) {
    const generationId = randomBytes(12).toString("hex");
    const acquired = await this.markGenerating(lessonId, generationId);

    if (!acquired) {
      return;
    }

    const lesson = await this.prisma.videoGuideLesson.findUnique({
      where: {
        id: lessonId
      }
    });

    if (
      !lesson ||
      lesson.status !== "GENERATING" ||
      !narrationGenerationLeaseMatches(lesson.content, generationId)
    ) {
      return;
    }

    const billingOperationKey = operationKey ?? lessonBillingOperationKey(lesson);

    try {
      const generatedBaseContent = buildLessonContent(dto);
      const baseContent = withLessonBillingOperationKey(
        {
          ...(isRecord(lesson.content) ? lesson.content : {}),
          ...(isRecord(generatedBaseContent) ? generatedBaseContent : {})
        } as unknown as Prisma.InputJsonValue,
        billingOperationKey
      );
      const subtitleCues = withOriginalSentenceIds(extractSubtitleCues(dto.subtitleFormat, dto.subtitleText?.trim() ?? ""));
      const narrationCues = narratableSubtitleCues(subtitleCues);

      if (narrationCues.length === 0) {
        throw new AppException(40001, "字幕中没有可生成导学文案的文字，请至少保留一句字幕文字", HttpStatus.BAD_REQUEST);
      }

      const mediaTitle = this.lessonTitle(dto);
      const narrationDraft = await this.generateNarrationTimelineDraftInBatches({
        content: lesson.content,
        cues: narrationCues,
        generationId,
        lessonId,
        mediaTitle,
        attribution
      });
      const draftTimeline = narrationDraft.nodes;
      const narrationScript = narrationTimelineScript(draftTimeline);

      if (!narrationScript) {
        throw new AppException(50201, "AI 未返回串讲文稿，请稍后重试", HttpStatus.BAD_GATEWAY);
      }

      await this.updateLessonOperationProgress(
        lessonId,
        "narrationGenerationProgress",
        {
          status: "RUNNING",
          phase: "FINALIZING",
          completed: 95,
          total: 100,
          message: "导学文案已生成，正在保存逐句文稿"
        },
        { generationId }
      );

      const content = mergeVideoGuideScriptDraftContent(baseContent, {
        aiModelName: narrationDraft.modelName,
        aiProviderName: narrationDraft.providerName,
        aiTaskId: narrationDraft.taskId,
        narrationDraftTimeline: draftTimeline,
        narrationScript,
        words: extractGuideWordsFromNarrationTimeline(draftTimeline)
      });

      await this.prisma.$transaction(async (transaction) => {
        await this.lockVideoGuideLesson(transaction, lessonId);
        const current = await transaction.videoGuideLesson.findUnique({
          where: {
            id: lessonId
          }
        });

        if (!current) {
          return;
        }

        if (
          current.status !== "GENERATING" ||
          !narrationGenerationLeaseMatches(current.content, generationId)
        ) {
          return;
        }

        const completedProgress = this.nextOperationProgress(
          current.content,
          "narrationGenerationProgress",
          {
            status: "SUCCEEDED",
            phase: "COMPLETED",
            completed: 100,
            message: "导学文案已生成，可以继续合成语音或生成随堂练习"
          }
        );
        const completedContent = mergeVideoGuideOperationProgressContent(
          content,
          "narrationGenerationProgress",
          completedProgress
        );
        const updated = await transaction.videoGuideLesson.updateMany({
          where: {
            id: current.id,
            status: "GENERATING",
            content: {
              path: ["narrationGenerationId"],
              equals: generationId
            }
          },
          data: {
            status: "DRAFT",
            content: completedContent as unknown as Prisma.InputJsonValue,
            errorMessage: null,
            finishedAt: null
          }
        });

        if (updated.count !== 1) {
          return;
        }

        await this.settleVideoGuideCredits(transaction, {
          userId: current.userId,
          operationKey: billingOperationKey,
          consumeNote: "视频导学文案生成消耗点数",
          releaseNote: "视频导学文案生成释放多余冻结点数"
        });
      });
    } catch (error) {
      const errorMessage = videoGuideGenerationErrorMessage(error);

      await this.prisma.$transaction(async (transaction) => {
        await this.lockVideoGuideLesson(transaction, lessonId);
        const current = await transaction.videoGuideLesson.findUnique({
          where: {
            id: lessonId
          }
        });

        if (!current) {
          return;
        }

        const ownsGeneration =
          current.status === "GENERATING" && narrationGenerationLeaseMatches(current.content, generationId);

        if (ownsGeneration) {
          const failedProgress = this.failedOperationProgress(
            current.content,
            "narrationGenerationProgress",
            "NARRATION",
            {
              errorMessage,
              message: "导学文案生成失败，可以在当前课件上重新生成"
            }
          );
          const failedContent = mergeVideoGuideOperationProgressContent(
            current.content,
            "narrationGenerationProgress",
            failedProgress
          );
          const updated = await transaction.videoGuideLesson.updateMany({
            where: {
              id: current.id,
              status: "GENERATING",
              content: {
                path: ["narrationGenerationId"],
                equals: generationId
              }
            },
            data: {
              status: "FAILED",
              content: failedContent as unknown as Prisma.InputJsonValue,
              errorMessage,
              finishedAt: new Date()
            }
          });

          if (updated.count === 1) {
            await this.releaseVideoGuideCredits(transaction, {
              userId: current.userId,
              operationKey: billingOperationKey,
              note: "视频导学文案生成失败，释放冻结点数"
            });
          }
        }
      });
    }
  }

  private async synthesizeNarrationTimeline(
    lessonId: string,
    generationId: string,
    attribution: AudioTaskAttributionContext,
    draftNodes: NarrationTimelineNodeDraft[],
    dto: NarrationTtsJobInput,
    voice: string,
    lease: {
      attemptId: string;
      jobId: string;
      jobKey: "narrationTtsGenerationJob";
    }
  ): Promise<{ nodes: NarrationTimelineNode[]; progress: NarrationAudioProgress }> {
    const modelAlias = dto.narrationTtsModelAlias?.trim() || "tts-default";
    const voiceSelection = resolveVideoGuideNarrationVoiceSelection(voice);
    const preparedNodes = draftNodes
      .map((node) => ({
        ...node,
        script: narrationTextForTts(node.script)
      }))
      .filter((node) => Boolean(node.script));
    let progress = createNarrationAudioProgress(generationId, preparedNodes, new Date().toISOString());

    await this.persistNarrationAudioProgress(lessonId, progress, lease);

    const nodes = await synthesizeVideoGuideNarrationTimeline({
      nodes: preparedNodes,
      concurrency: 3,
      recoverCompleted: async (node) => {
        const task = await this.audioService.findVerifiedVideoGuideNarrationTask(attribution.userId, {
          lessonId,
          generationId,
          nodeId: node.id,
          format: "mp3"
        });

        return task
          ? verifiedNarrationAudioFromTask(
              task,
              videoGuideNarrationR2Prefix(),
              videoGuideR2PublicBaseUrl()
            )
          : null;
      },
      beforeSynthesize: () => this.narrationTtsRateLimiter.acquire(),
      synthesize: (node, onPersistenceStatus) =>
        this.audioService.synthesizeTtsForExternalBilling(attribution, {
          text: node.script,
          voice: voiceSelection.voice,
          voiceAssetId: voiceSelection.voiceAssetId,
          modelAlias,
          source: "VIDEO_GUIDE",
          format: "mp3",
          videoGuidePersistence: {
            lessonId,
            generationId,
            nodeId: node.id,
            format: "mp3"
          },
          onPersistenceStatus
        }),
      verifyTask: (task) =>
        verifiedNarrationAudioFromTask(task, videoGuideNarrationR2Prefix(), videoGuideR2PublicBaseUrl()),
      onProgress: async (event) => {
        progress = updateNarrationAudioProgress(progress, event.nodeId, event, new Date().toISOString());
        await this.persistNarrationAudioProgress(lessonId, progress, lease);
      },
      onRetry: async (event) => {
        this.logger.warn(
          `讲解语音节点临时失败，准备重试：lesson=${lessonId} node=${event.nodeId} attempt=${event.attempt}/${event.maxAttempts} code=${event.errorCode} message=${event.errorMessage}`
        );
      }
    });

    return {
      nodes,
      progress
    };
  }

  private async persistNarrationAudioProgress(
    lessonId: string,
    progress: NarrationAudioProgress,
    lease: {
      attemptId: string;
      jobId: string;
      jobKey: "narrationTtsGenerationJob";
    }
  ) {
    const lesson = await this.prisma.videoGuideLesson.findUnique({
      where: {
        id: lessonId
      },
      select: {
        content: true,
        status: true
      }
    });

    if (
      !lesson ||
      lesson.status !== "GENERATING" ||
      !isRecord(lesson.content) ||
      !videoGuideOperationAttemptMatches(
        lesson.content[lease.jobKey],
        lease.jobId,
        lease.attemptId
      )
    ) {
      throw new AppException(40901, "当前导学课件已开始新的生成任务", HttpStatus.CONFLICT);
    }

    const updated = await this.prisma.videoGuideLesson.updateMany({
      where: {
        id: lessonId,
        status: "GENERATING",
        AND: [
          { content: { path: [lease.jobKey, "jobId"], equals: lease.jobId } },
          { content: { path: [lease.jobKey, "attemptId"], equals: lease.attemptId } }
        ]
      },
      data: {
        content: mergeVideoGuideOperationProgressContent(
          mergeNarrationAudioProgressContent(lesson.content, progress),
          "narrationTtsGenerationProgress",
          this.nextOperationProgress(
            lesson.content,
            "narrationTtsGenerationProgress",
            {
              status: "RUNNING",
              phase: "SYNTHESIZING_AUDIO",
              completed: progress.completed,
              total: progress.total,
              message: `正在生成并校验讲解语音，已完成 ${progress.completed}/${progress.total} 段`
            }
          )
        ) as unknown as Prisma.InputJsonValue
      }
    });

    if (updated.count !== 1) {
      throw new AppException(40901, "当前导学课件已开始新的生成任务", HttpStatus.CONFLICT);
    }
  }

  private async persistNarrationGenerationCheckpoint(
    lessonId: string,
    generationId: string,
    input: {
      sourceHash: string;
      totalBatches: number;
      nodes: NarrationTimelineNodeDraft[];
      metadata: NarrationGenerationMetadata;
      completed: number;
      message: string;
    }
  ): Promise<NarrationGenerationCheckpoint> {
    const lesson = await this.prisma.videoGuideLesson.findUnique({
      where: {
        id: lessonId
      },
      select: {
        content: true,
        status: true
      }
    });

    if (
      !lesson ||
      lesson.status !== "GENERATING" ||
      !narrationGenerationLeaseMatches(lesson.content, generationId)
    ) {
      throw new AppException(40901, "当前后台任务已由新的执行器接管", HttpStatus.CONFLICT);
    }

    const checkpoint = mergeNarrationGenerationCheckpoint(
      narrationGenerationCheckpointFromContent(lesson.content, input.sourceHash),
      {
        sourceHash: input.sourceHash,
        batchSize: VIDEO_GUIDE_NARRATION_BATCH_SIZE,
        totalBatches: input.totalBatches,
        nodes: input.nodes,
        metadata: input.metadata,
        now: new Date().toISOString()
      }
    );
    const progress = this.nextOperationProgress(
      lesson.content,
      "narrationGenerationProgress",
      {
        status: "RUNNING",
        phase: "WRITING",
        completed: input.completed,
        total: 100,
        message: input.message
      }
    );
    const content = mergeVideoGuideOperationProgressContent(
      mergeNarrationGenerationCheckpointContent(lesson.content, checkpoint),
      "narrationGenerationProgress",
      progress
    );
    const updated = await this.prisma.videoGuideLesson.updateMany({
      where: {
        id: lessonId,
        status: "GENERATING",
        content: {
          path: ["narrationGenerationId"],
          equals: generationId
        }
      },
      data: {
        content: content as unknown as Prisma.InputJsonValue
      }
    });

    if (updated.count !== 1) {
      throw new AppException(40901, "当前后台任务已由新的执行器接管", HttpStatus.CONFLICT);
    }

    return checkpoint;
  }

  private nextOperationProgress(
    contentValue: unknown,
    key: VideoGuideOperationProgressKey,
    patch: Parameters<typeof updateVideoGuideOperationProgress>[1]
  ) {
    const content = isRecord(contentValue) ? contentValue : {};
    const current = videoGuideOperationProgressFromValue(content[key]);

    if (!current) {
      throw new AppException(40901, "当前生成任务进度不存在，请重新提交", HttpStatus.CONFLICT);
    }

    return updateVideoGuideOperationProgress(current, patch, new Date().toISOString());
  }

  private failedOperationProgress(
    contentValue: unknown,
    key: VideoGuideOperationProgressKey,
    operation: "SUBTITLE" | "NARRATION" | "NARRATION_TTS" | "PRACTICE",
    input: {
      errorMessage: string;
      message: string;
    }
  ) {
    const content = isRecord(contentValue) ? contentValue : {};

    return failedVideoGuideOperationProgress(content[key], {
      operation,
      errorMessage: input.errorMessage,
      message: input.message,
      now: new Date().toISOString()
    });
  }

  private async updateLessonOperationProgress(
    lessonId: string,
    key: VideoGuideOperationProgressKey,
    patch: Parameters<typeof updateVideoGuideOperationProgress>[1],
    lease?:
      | {
          attemptId: string;
          jobId: string;
          jobKey: VideoGuideOperationJobKey;
        }
      | {
          generationId: string;
        }
  ) {
    const lesson = await this.prisma.videoGuideLesson.findUnique({
      where: {
        id: lessonId
      },
      select: {
        content: true
      }
    });

    if (!lesson) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    const progress = this.nextOperationProgress(lesson.content, key, patch);

    const content = mergeVideoGuideOperationProgressContent(lesson.content, key, progress);

    if (lease && "generationId" in lease) {
      const updated = await this.prisma.videoGuideLesson.updateMany({
        where: {
          id: lessonId,
          status: "GENERATING",
          content: {
            path: ["narrationGenerationId"],
            equals: lease.generationId
          }
        },
        data: {
          content: content as unknown as Prisma.InputJsonValue
        }
      });

      if (updated.count !== 1) {
        throw new AppException(40901, "当前后台任务已由新的执行器接管", HttpStatus.CONFLICT);
      }
    } else if (lease) {
      const updated = await this.prisma.videoGuideLesson.updateMany({
        where: {
          id: lessonId,
          AND: [
            { content: { path: [lease.jobKey, "jobId"], equals: lease.jobId } },
            { content: { path: [lease.jobKey, "attemptId"], equals: lease.attemptId } }
          ]
        },
        data: {
          content: content as unknown as Prisma.InputJsonValue
        }
      });

      if (updated.count !== 1) {
        throw new AppException(40901, "当前后台任务已由新的执行器接管", HttpStatus.CONFLICT);
      }
    } else {
      await this.prisma.videoGuideLesson.update({
        where: {
          id: lessonId
        },
        data: {
          content: content as unknown as Prisma.InputJsonValue
        }
      });
    }

    return progress;
  }

  private async updateSubtitleGenerationState(
    lessonId: string,
    lease: {
      attemptId: string;
      jobId: string;
      jobKey: "subtitleGenerationJob";
    },
    fallbackCheckpoint: VideoGuideSubtitleCheckpoint,
    checkpointPatch: Partial<VideoGuideSubtitleCheckpoint>,
    progressPatch: Parameters<typeof updateVideoGuideOperationProgress>[1]
  ) {
    const lesson = await this.prisma.videoGuideLesson.findUnique({
      where: {
        id: lessonId
      },
      select: {
        content: true
      }
    });

    if (!lesson || !isRecord(lesson.content)) {
      throw new AppException(40401, "导学课件不存在", HttpStatus.NOT_FOUND);
    }

    if (
      !videoGuideOperationAttemptMatches(
        lesson.content.subtitleGenerationJob,
        lease.jobId,
        lease.attemptId
      )
    ) {
      throw new AppException(40901, "当前后台任务已由新的执行器接管", HttpStatus.CONFLICT);
    }

    const currentCheckpoint =
      videoGuideSubtitleCheckpointFromValue(
        lesson.content.subtitleGenerationCheckpoint,
        lease.jobId
      ) ?? fallbackCheckpoint;
    const now = new Date().toISOString();
    const checkpoint: VideoGuideSubtitleCheckpoint = {
      ...currentCheckpoint,
      ...checkpointPatch,
      version: 1,
      jobId: lease.jobId,
      updatedAt: now
    };
    const progress = this.nextOperationProgress(
      lesson.content,
      "subtitleGenerationProgress",
      progressPatch
    );
    const content = mergeVideoGuideOperationProgressContent(
      mergeVideoGuideSubtitleCheckpointContent(lesson.content, checkpoint),
      "subtitleGenerationProgress",
      progress
    );
    const updated = await this.prisma.videoGuideLesson.updateMany({
      where: {
        id: lessonId,
        AND: [
          { content: { path: [lease.jobKey, "jobId"], equals: lease.jobId } },
          { content: { path: [lease.jobKey, "attemptId"], equals: lease.attemptId } }
        ]
      },
      data: {
        content: content as unknown as Prisma.InputJsonValue
      }
    });

    if (updated.count !== 1) {
      throw new AppException(40901, "当前后台任务已由新的执行器接管", HttpStatus.CONFLICT);
    }

    return checkpoint;
  }

  private async lockVideoGuideLesson(transaction: Prisma.TransactionClient, lessonId: string) {
    await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${lessonId}))`;
  }

  private async lockVideoGuideBillingOperation(
    transaction: Prisma.TransactionClient,
    operationKey: string
  ) {
    await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`billing:${operationKey}`}))`;
  }

  private assertLessonOperationAvailable(
    lesson: VideoGuideLessonRecord,
    requestedOperation: "SUBTITLE" | "NARRATION" | "NARRATION_TTS" | "PRACTICE"
  ) {
    if (lesson.status === "QUEUED" || lesson.status === "GENERATING") {
      throw new AppException(40001, "当前课件已有后台生成任务，请等待完成后再操作", HttpStatus.BAD_REQUEST);
    }

    const content = isRecord(lesson.content) ? lesson.content : {};
    const narrationScriptEditJob = narrationScriptEditJobFromContent(content);

    if (narrationScriptEditJob) {
      throw new AppException(
        40001,
        "当前课件已有本句讲解语音任务正在执行",
        HttpStatus.BAD_REQUEST
      );
    }

    const activeOperation = [
      content.subtitleGenerationProgress,
      content.narrationGenerationProgress,
      content.narrationTtsGenerationProgress,
      content.practiceGenerationProgress
    ].find(isActiveVideoGuideOperationProgress);

    if (activeOperation) {
      const operationNames = {
        SUBTITLE: "字幕文件",
        NARRATION: "导学文案",
        NARRATION_TTS: "讲解语音",
        PRACTICE: "随堂练习"
      };
      throw new AppException(
        40001,
        `${operationNames[requestedOperation]}暂不能开始，当前课件已有后台任务正在执行`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private async claimLessonOperation<TInput>(input: {
    lessonId: string;
    operation: "SUBTITLE" | "NARRATION_TTS" | "PRACTICE";
    jobKey: VideoGuideOperationJobKey;
    progressKey: VideoGuideOperationProgressKey;
    phase: string;
    message: string;
  }): Promise<{ job: VideoGuideOperationJob<TInput>; lesson: VideoGuideLessonRecord } | null> {
    const lesson = await this.prisma.videoGuideLesson.findUnique({
      where: {
        id: input.lessonId
      }
    });

    if (!lesson || !isRecord(lesson.content)) {
      return null;
    }

    const progress = videoGuideOperationProgressFromValue(lesson.content[input.progressKey]);
    const job = videoGuideOperationJobFromValue<TInput>(lesson.content[input.jobKey]);

    if (!progress || progress.status !== "QUEUED" || !job || job.operation !== input.operation) {
      return null;
    }

    const leasedJob = leaseVideoGuideOperationJob(job, randomBytes(12).toString("hex"));
    const runningProgress = updateVideoGuideOperationProgress(
      progress,
      {
        status: "RUNNING",
        phase: input.phase,
        message: input.message
      },
      new Date().toISOString()
    );
    const runningContent = mergeVideoGuideOperationProgressContent(
      mergeVideoGuideOperationJobContent(lesson.content, input.jobKey, leasedJob),
      input.progressKey,
      runningProgress
    );
    const claimed = await this.prisma.videoGuideLesson.updateMany({
      where: {
        id: lesson.id,
        AND: [
          {
            content: {
              path: [input.progressKey, "status"],
              equals: "QUEUED"
            }
          },
          {
            content: {
              path: [input.jobKey, "jobId"],
              equals: job.jobId
            }
          }
        ]
      },
      data: {
        ...(input.operation === "NARRATION_TTS" ? { status: "GENERATING" } : {}),
        content: runningContent as unknown as Prisma.InputJsonValue
      }
    });

    return claimed.count === 1 ? { job: leasedJob, lesson } : null;
  }

  private async recoverVideoGuideOperations() {
    if (this.recoveryRunning) {
      return;
    }

    this.recoveryRunning = true;

    try {
      const lessons = await this.prisma.videoGuideLesson.findMany({
        where: {
          OR: [
            { status: { in: ["QUEUED", "GENERATING"] } },
            { content: { path: ["subtitleGenerationProgress", "status"], equals: "QUEUED" } },
            { content: { path: ["subtitleGenerationProgress", "status"], equals: "RUNNING" } },
            { content: { path: ["narrationTtsGenerationProgress", "status"], equals: "QUEUED" } },
            { content: { path: ["narrationTtsGenerationProgress", "status"], equals: "RUNNING" } },
            { content: { path: ["practiceGenerationProgress", "status"], equals: "QUEUED" } },
            { content: { path: ["practiceGenerationProgress", "status"], equals: "RUNNING" } },
            { content: { path: ["narrationScriptEditJob", "status"], equals: "RUNNING" } },
            { content: { path: ["narrationScriptEditJob", "status"], equals: "CLEANUP_PENDING" } }
          ]
        },
        orderBy: {
          updatedAt: "asc"
        },
        take: 200
      });

      for (const lesson of lessons) {
        await this.recoverStoredOperation(lesson, {
          operation: "SUBTITLE",
          jobKey: "subtitleGenerationJob",
          progressKey: "subtitleGenerationProgress"
        });
        await this.recoverStoredOperation(lesson, {
          operation: "PRACTICE",
          jobKey: "practiceGenerationJob",
          progressKey: "practiceGenerationProgress"
        });
        await this.recoverStoredOperation(lesson, {
          operation: "NARRATION",
          jobKey: "narrationGenerationJob",
          progressKey: "narrationGenerationProgress"
        });
        await this.recoverStoredOperation(lesson, {
          operation: "NARRATION_TTS",
          jobKey: "narrationTtsGenerationJob",
          progressKey: "narrationTtsGenerationProgress"
        });
        await this.recoverNarrationScriptEdit(lesson);
      }
    } finally {
      this.recoveryRunning = false;
    }
  }

  private async recoverNarrationScriptEdit(lesson: VideoGuideLessonRecord) {
    const job = narrationScriptEditJobFromContent(lesson.content);

    if (
      !job ||
      (job.status === "RUNNING" && !narrationScriptEditJobIsStale(job, new Date().toISOString()))
    ) {
      return;
    }

    if (job.status === "CLEANUP_PENDING") {
      try {
        await this.cleanupNarrationScriptEdit(lesson.id, lesson.userId, job);
      } catch (error) {
        this.logger.warn(
          `重试清理本句讲解语音失败：${error instanceof Error ? error.message : String(error)}`
        );
      }
      return;
    }

    const persistence = {
      lessonId: lesson.id,
      generationId: job.requestId,
      nodeId: job.nodeId,
      format: "mp3" as const
    };
    let audioTask: Awaited<ReturnType<AudioService["findVerifiedVideoGuideNarrationTask"]>>;

    try {
      audioTask = await this.audioService.findVerifiedVideoGuideNarrationTask(
        lesson.userId,
        persistence
      );
    } catch (error) {
      this.logger.warn(
        `查询待恢复的本句讲解语音失败：${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    if (audioTask) {
      try {
        const result = await this.finalizeNarrationScriptEdit(lesson.id, lesson.userId, job, audioTask);
        await this.audioService.cleanupExternalNarrationAudio(lesson.userId, result.previousTaskIds);
        await this.recordCourseMaterialChange(result.saved.id);
      } catch (error) {
        this.logger.warn(
          `恢复视频导学本句讲解语音失败：${error instanceof Error ? error.message : String(error)}`
        );
      }
      return;
    }

    const released = await this.failNarrationScriptEdit(lesson.id, lesson.userId, job, true);

    if (released) {
      try {
        await this.cleanupNarrationScriptEdit(lesson.id, lesson.userId, job);
      } catch (error) {
        this.logger.warn(
          `清理超时的本句讲解语音失败：${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  private async recoverStoredOperation(
    lesson: VideoGuideLessonRecord,
    input: {
      operation: "SUBTITLE" | "NARRATION" | "NARRATION_TTS" | "PRACTICE";
      jobKey: VideoGuideOperationJobKey;
      progressKey: VideoGuideOperationProgressKey;
    }
  ) {
    if (!isRecord(lesson.content)) {
      return;
    }

    const progress = videoGuideOperationProgressFromValue(lesson.content[input.progressKey]);
    const job = videoGuideOperationJobFromValue(lesson.content[input.jobKey]);

    if (
      !progress ||
      !job ||
      job.operation !== input.operation ||
      !shouldRecoverVideoGuideOperation(
        progress,
        new Date().toISOString(),
        input.operation === "SUBTITLE"
          ? resolveVideoGuideSubtitleRecoveryStaleMs(
              process.env.VIDEO_GUIDE_SUBTITLE_RECOVERY_STALE_SECONDS
            )
          : videoGuideRecoveryStaleMs()
      )
    ) {
      return;
    }

    const recoveredProgress = updateVideoGuideOperationProgress(
      progress,
      {
        status: "QUEUED",
        phase: "RECOVERED",
        completed: 0,
        message: "后台任务已恢复，正在重新排队执行"
      },
      new Date().toISOString()
    );
    const recoveredBaseContent =
      input.operation === "NARRATION"
        ? { ...lesson.content, narrationGenerationId: null }
        : lesson.content;
    const recoveredJobContent = mergeVideoGuideOperationJobContent(
      recoveredBaseContent,
      input.jobKey,
      {
        ...job,
        attemptId: null
      }
    );
    const recoveredContent = mergeVideoGuideOperationProgressContent(
      recoveredJobContent,
      input.progressKey,
      recoveredProgress
    );
    const updated = await this.prisma.videoGuideLesson.updateMany({
      where: {
        id: lesson.id,
        AND: [
          {
            content: {
              path: [input.jobKey, "jobId"],
              equals: job.jobId
            }
          },
          {
            content: {
              path: [input.progressKey, "updatedAt"],
              equals: progress.updatedAt
            }
          }
        ]
      },
      data: {
        ...(["NARRATION", "NARRATION_TTS"].includes(input.operation) ? { status: "QUEUED" } : {}),
        content: recoveredContent as unknown as Prisma.InputJsonValue,
        errorMessage: null,
        finishedAt: null
      }
    });

    if (updated.count !== 1) {
      return;
    }

    if (input.operation === "SUBTITLE") {
      this.scheduleSubtitleGeneration(lesson.id);
    } else if (input.operation === "PRACTICE") {
      this.schedulePracticeGeneration(lesson.id);
    } else if (input.operation === "NARRATION_TTS") {
      this.scheduleNarrationTtsGeneration(lesson.id);
    } else {
      this.scheduleGeneration(lesson.id);
    }
  }

  private async generateNarrationTimelineDraftInBatches(input: {
    attribution: AttributionContext;
    content: unknown;
    cues: SubtitleCue[];
    generationId: string;
    lessonId: string;
    mediaTitle: string;
  }) {
    const cues = narratableSubtitleCues(withOriginalSentenceIds(input.cues));

    if (cues.length === 0) {
      throw new AppException(40001, "字幕中没有可生成导学文案的文字，请至少保留一句字幕文字", HttpStatus.BAD_REQUEST);
    }

    const batches = createNarrationBatches(cues, VIDEO_GUIDE_NARRATION_BATCH_SIZE);
    const sourceHash = narrationGenerationSourceHash(input.mediaTitle, cues);
    let checkpoint = narrationGenerationCheckpointFromContent(input.content, sourceHash);
    let nodesById = new Map((checkpoint?.nodes ?? []).map((node) => [node.id, node]));
    const totalNodes = cues.length + 2;
    let sentenceGenerationStartedAt = Date.now();
    const initialGeneratedSentenceCount = cues.filter((cue, index) =>
      nodesById.has(cueSentenceId(cue, index))
    ).length;
    let persistTail = Promise.resolve();
    const persistNodes = (
      nodes: NarrationTimelineNodeDraft[],
      metadata: NarrationGenerationMetadata,
      stage: "INTRO" | "SENTENCES" | "SUMMARY"
    ) => {
      const operation = persistTail.then(async () => {
        const nextNodesById = new Map(nodesById);
        nodes.forEach((node) => nextNodesById.set(node.id, node));
        const generatedSentenceCount = cues.filter((cue, index) =>
          nextNodesById.has(cueSentenceId(cue, index))
        ).length;
        const completedNodeCount =
          generatedSentenceCount +
          (nextNodesById.has("intro") ? 1 : 0) +
          (nextNodesById.has("summary") ? 1 : 0);
        const completed = Math.min(95, 5 + Math.round((completedNodeCount / totalNodes) * 90));
        const generatedThisRun = generatedSentenceCount - initialGeneratedSentenceCount;
        const estimatedMinutes = narrationGenerationEstimatedMinutes({
          completed: generatedThisRun,
          elapsedMs: Date.now() - sentenceGenerationStartedAt,
          remaining: cues.length - generatedSentenceCount
        });
        const message =
          stage === "INTRO"
            ? "导入讲解已生成，正在生成逐句文案"
            : stage === "SUMMARY"
              ? `导学文案已生成，共完成 ${generatedSentenceCount}/${cues.length} 句`
              : `正在生成逐句文案，已完成 ${generatedSentenceCount}/${cues.length} 句${
                  estimatedMinutes ? `，预计还需约 ${estimatedMinutes} 分钟` : ""
                }`;

        checkpoint = await this.persistNarrationGenerationCheckpoint(
          input.lessonId,
          input.generationId,
          {
            sourceHash,
            totalBatches: batches.length,
            nodes,
            metadata,
            completed,
            message
          }
        );
        nodesById = new Map(checkpoint.nodes.map((node) => [node.id, node]));
      });

      persistTail = operation.then(() => undefined);
      return operation;
    };
    const generateStandaloneNode = async (
      mode: "INTRO" | "SUMMARY",
      buildNode: (text: string, mediaTitle: string) => NarrationTimelineNodeDraft
    ) => {
      let latestMetadata: NarrationGenerationMetadata | undefined;
      const [node] = await runAdaptiveNarrationBatch({
        items: [mode],
        maxAttempts: videoGuideNarrationBatchAttempts(),
        generate: async (_items, attempt) => {
          const generated = await this.aiService.generateScenarioTextForExternalBilling({
            ...input.attribution,
            scenarioSlug: "video-guide-narration-timeline",
            input: `${input.mediaTitle} 串讲文案${mode === "INTRO" ? "导入" : "总结"}，第 ${attempt} 次`,
            variables: {
              generationMode: mode,
              mediaTitle: input.mediaTitle,
              subtitleJson: subtitleTimelinePromptJson(cues)
            },
            maxTokens: 1600,
            reasoningEnabled: false
          });

          latestMetadata = narrationGenerationMetadata(generated);
          return [buildNode(generated.text, input.mediaTitle)];
        },
        shouldRetry: (error) =>
          error instanceof NarrationBatchOutputError ||
          isRetryableAiProviderGenerationError(error),
        retryDelayMs: (attempt, error) =>
          narrationGenerationRetryDelayMs(attempt, error)
      });

      if (!node || !latestMetadata) {
        throw narrationParseException("AI 串讲结果缺少模型信息，请重新生成导学课件文案");
      }

      return {
        metadata: latestMetadata,
        node
      };
    };

    if (!nodesById.has("intro")) {
      const generated = await generateStandaloneNode("INTRO", buildNarrationIntroDraft);

      await persistNodes(
        [generated.node],
        generated.metadata,
        "INTRO"
      );
    }

    sentenceGenerationStartedAt = Date.now();

    const pendingBatches = batches
      .map((cueGroup, batchIndex) => ({
        batchIndex,
        cues: cueGroup.filter((cue, index) => !nodesById.has(cueSentenceId(cue, index)))
      }))
      .filter((entry) => entry.cues.length > 0);

    await mapWithConcurrency(
      pendingBatches,
      videoGuideNarrationConcurrency(),
      async ({ batchIndex, cues: pendingCues }) => {
        let latestMetadata: NarrationGenerationMetadata | undefined;

        await runAdaptiveNarrationBatch({
          items: pendingCues,
          maxAttempts: videoGuideNarrationBatchAttempts(),
          generate: async (attemptCues, attempt) => {
            const generated = await this.aiService.generateScenarioTextForExternalBilling({
              ...input.attribution,
              scenarioSlug: "video-guide-narration-timeline",
              input: `${input.mediaTitle} 串讲文案第 ${batchIndex + 1} 批，第 ${attempt} 次`,
              variables: {
                generationMode: "SENTENCES",
                mediaTitle: input.mediaTitle,
                subtitleJson: subtitleTimelinePromptJson(attemptCues, cues)
              },
              maxTokens: videoGuideNarrationMaxTokens(attemptCues),
              reasoningEnabled: false
            });

            latestMetadata = narrationGenerationMetadata(generated);
            return buildNarrationSentenceDrafts(generated.text, attemptCues, input.mediaTitle);
          },
          onSuccess: async (generatedNodes) => {
            if (!latestMetadata) {
              throw narrationParseException("AI 串讲结果缺少模型信息，请重新生成导学课件文案");
            }

            await persistNodes(generatedNodes, latestMetadata, "SENTENCES");
          },
          shouldRetry: (error) =>
            error instanceof NarrationBatchOutputError ||
            isRetryableAiProviderGenerationError(error),
          retryDelayMs: (attempt, error) =>
            narrationGenerationRetryDelayMs(attempt, error)
        });
      }
    );

    if (!nodesById.has("summary")) {
      const generated = await generateStandaloneNode("SUMMARY", buildNarrationSummaryDraft);

      await persistNodes(
        [generated.node],
        generated.metadata,
        "SUMMARY"
      );
    }

    const orderedSentenceNodes = cues.map((cue, index) => {
      const sentenceId = cueSentenceId(cue, index);
      const node = nodesById.get(sentenceId);

      if (!node) {
        throw narrationParseException(`AI 串讲结果未覆盖 ${sentenceId}，请重新生成导学课件文案`);
      }

      return node;
    });

    const introNode = nodesById.get("intro");
    const summaryNode = nodesById.get("summary");
    const metadata = checkpoint?.metadata;

    if (!introNode || !summaryNode || !metadata) {
      throw narrationParseException("AI 串讲结果缺少导入或总结，请重新生成导学课件文案");
    }

    return {
      ...metadata,
      nodes: [introNode, ...orderedSentenceNodes, summaryNode]
    };
  }

  private async createBillingEstimate(
    userId: string,
    input: {
      items: VideoGuideBillingItem[];
      operation: VideoGuideBillingEstimate["operation"];
      title: string;
    }
  ): Promise<VideoGuideBillingEstimate> {
    const wallet = await getPersonalCreditBalance(this.prisma, userId);
    const estimatedCredits = input.items.reduce((sum, item) => sum + item.estimatedCredits, 0);

    return {
      availableCredits: wallet.availableCredits,
      enoughCredits: wallet.availableCredits >= estimatedCredits,
      estimatedCredits,
      items: input.items,
      operation: input.operation,
      title: input.title
    };
  }

  private async resolveNarrationTtsResumeBilling(
    client: Pick<Prisma.TransactionClient, "ledgerEntry">,
    contentValue: unknown,
    expected: {
      draftRevision: string;
      narrationTtsModelAlias: string;
      narrationVoice: string;
      totalCredits: number;
    }
  ) {
    const checkpointId = resumableNarrationTtsCheckpointId(contentValue, expected);

    if (!checkpointId) {
      return {
        billedCredits: 0,
        checkpointId: null,
        remainingCredits: expected.totalCredits
      };
    }

    const content = isRecord(contentValue) ? contentValue : {};
    const job = videoGuideOperationJobFromValue<NarrationTtsJobInput>(
      content.narrationTtsGenerationJob
    );
    const consumed = job
      ? await client.ledgerEntry.findUnique({
          where: {
            idempotencyKey: `${job.operationKey}:consume`
          }
        })
      : null;
    // A retry can finish no new nodes and therefore have no consume entry. Its input still carries
    // the amount settled by earlier attempts, which must remain deducted on the next resume.
    const billedCredits = cumulativeNarrationTtsBilledCredits({
      billedCreditsBeforeAttempt: numberFromUnknown(job?.input.billedCreditsBeforeAttempt) ?? 0,
      latestAttemptConsumedCredits: consumed ? Math.abs(Number(consumed.amount)) : 0,
      totalCredits: expected.totalCredits
    });

    return {
      billedCredits,
      checkpointId,
      remainingCredits: remainingNarrationTtsCredits(expected.totalCredits, billedCredits)
    };
  }

  private calculateNarrationTtsAttemptActualCredits(
    contentValue: unknown,
    job: Pick<VideoGuideOperationJob<NarrationTtsJobInput>, "estimatedCredits" | "input">
  ) {
    const content = isRecord(contentValue) ? contentValue : {};
    const totalCredits = narrationTtsTotalCredits(contentValue);
    const cumulativeCompletedCredits = narrationTtsCreditsForCompletedNodes(
      narrationTtsDraftFromContent(contentValue),
      successfulNarrationNodeIds(content.narrationAudioProgress),
      narrationTtsRates()
    );
    const attemptCredits = narrationTtsAttemptActualCredits({
      billedCreditsBeforeAttempt: numberFromUnknown(job.input.billedCreditsBeforeAttempt) ?? 0,
      cumulativeCompletedCredits,
      totalCredits
    });

    return Math.min(job.estimatedCredits, attemptCredits);
  }

  private assertBillingConfirmed(confirmed: boolean | undefined, estimate: VideoGuideBillingEstimate) {
    if (!confirmed) {
      const consumptionLabel = estimate.operation === "VIDEO_GUIDE_NARRATION_TTS"
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

  private async reserveVideoGuideCredits(
    transaction: Prisma.TransactionClient,
    input: {
      estimatedCredits: number;
      note: string;
      operationKey: string;
      rejectExisting?: boolean;
      userId: string;
    }
  ) {
    const credits = Math.max(0, Math.ceil(input.estimatedCredits));

    if (input.rejectExisting) {
      await this.lockVideoGuideBillingOperation(transaction, input.operationKey);
    }

    const existing = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey: `${input.operationKey}:reserve`
      }
    });

    if (existing) {
      if (input.rejectExisting) {
        throw new AppException(40901, "该次计费确认已使用，请重新确认点数消耗", HttpStatus.CONFLICT);
      }

      return;
    }

    if (credits <= 0) {
      if (!input.rejectExisting) {
        return;
      }

      await this.ensureWallet(transaction, input.userId);
      const wallet = await getPersonalWallet(transaction, input.userId);
      await transaction.ledgerEntry.create({
        data: {
          userId: input.userId,
          type: "RESERVE",
          amount: 0,
          balanceAfter: wallet.availableCredits,
          relatedTaskType: "VIDEO_GUIDE",
          idempotencyKey: `${input.operationKey}:reserve`,
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
        relatedTaskType: "VIDEO_GUIDE",
        idempotencyKey: `${input.operationKey}:reserve`,
        note: input.note
      }
    });
  }

  private async settleVideoGuideCredits(
    transaction: Prisma.TransactionClient,
    input: {
      actualCredits?: number;
      consumeNote: string;
      operationKey: string;
      releaseNote: string;
      userId: string;
    }
  ) {
    await this.lockVideoGuideBillingOperation(transaction, input.operationKey);
    const consumeKey = `${input.operationKey}:consume`;
    const releaseKey = `${input.operationKey}:release`;
    const failureReleaseKey = `${input.operationKey}:release-failed`;
    const consumed = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey: consumeKey
      }
    });

    const failedRelease = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey: failureReleaseKey
      }
    });

    if (consumed || failedRelease) {
      return;
    }

    const released = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey: releaseKey
      }
    });

    if (released) {
      return;
    }

    const reserve = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey: `${input.operationKey}:reserve`
      }
    });

    if (!reserve || reserve.amount >= 0) {
      return;
    }

    const reservedCredits = Math.abs(reserve.amount);
    const actualCredits = Math.min(Math.max(0, Math.ceil(input.actualCredits ?? reservedCredits)), reservedCredits);
    const releaseCredits = Math.max(0, reservedCredits - actualCredits);
    const wallet = await settlePersonalCredits(transaction, input.userId, input.operationKey, reservedCredits, actualCredits);

    if (actualCredits > 0) {
      await transaction.ledgerEntry.create({
        data: {
          userId: input.userId,
          type: "CONSUME",
          amount: -actualCredits,
          balanceAfter: wallet.availableCredits,
          relatedTaskType: "VIDEO_GUIDE",
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
          relatedTaskType: "VIDEO_GUIDE",
          idempotencyKey: releaseKey,
          note: input.releaseNote
        }
      });
    }
  }

  private async releaseVideoGuideCredits(
    transaction: Prisma.TransactionClient,
    input: {
      note: string;
      operationKey: string;
      userId: string;
    }
  ) {
    await this.lockVideoGuideBillingOperation(transaction, input.operationKey);
    const releaseKey = `${input.operationKey}:release-failed`;
    const released = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey: releaseKey
      }
    });

    if (released) {
      return;
    }

    const consumed = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey: `${input.operationKey}:consume`
      }
    });

    if (consumed) {
      return;
    }

    const settledRelease = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey: `${input.operationKey}:release`
      }
    });

    if (settledRelease) {
      return;
    }

    const reserve = await transaction.ledgerEntry.findUnique({
      where: {
        idempotencyKey: `${input.operationKey}:reserve`
      }
    });

    if (!reserve || reserve.amount >= 0) {
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
        relatedTaskType: "VIDEO_GUIDE",
        idempotencyKey: releaseKey,
        note: input.note
      }
    });
  }

  private assertCreateInput(dto: CreateVideoGuideLessonDto) {
    this.assertDraftInput(dto);
    this.assertSubtitleInput(dto);
  }

  private assertDraftInput(dto: CreateVideoGuideDraftDto, requireSavedMedia = false) {
    if (dto.mediaSizeBytes > videoGuideMediaMaxBytesFor(dto.mediaType)) {
      const maxSizeMb = Math.floor(videoGuideMediaMaxBytesFor(dto.mediaType) / 1024 / 1024);
      const mediaLabel = dto.mediaType === "AUDIO" ? "音频" : "视频";
      throw new AppException(40001, `${mediaLabel}文件不能超过 ${maxSizeMb}M`, HttpStatus.BAD_REQUEST);
    }

    if (requireSavedMedia && !dto.mediaUrl?.trim() && !dto.mediaStorageKey?.trim()) {
      throw new AppException(40001, "请先上传并成功保存视频或音频文件", HttpStatus.BAD_REQUEST);
    }
  }

  private assertSubtitleInput(dto: {
    subtitleFormat: "SRT" | "ASS";
    subtitleName: string;
    subtitleText?: string;
  }) {
    const subtitleFormat = resolveSubtitleFormat(dto.subtitleName, dto.subtitleText);

    if (!subtitleFormat) {
      throw new AppException(40001, "字幕文件内容需为 srt 或 ass 格式", HttpStatus.BAD_REQUEST);
    }

    if (subtitleFormat !== dto.subtitleFormat) {
      throw new AppException(40001, "字幕文件格式与文件名不一致", HttpStatus.BAD_REQUEST);
    }
  }

  private lessonTitle(dto: CreateVideoGuideLessonDto) {
    return this.lessonTitleFromMedia(dto);
  }

  private lessonTitleFromMedia(dto: CreateVideoGuideDraftDto) {
    return createVideoGuideLessonTitle({
      mediaName: dto.mediaName,
      title: dto.title
    });
  }

  private createShareToken() {
    return randomBytes(12).toString("hex");
  }

  private statusName(status: string) {
    const names: Record<string, string> = {
      DRAFT: "草稿",
      QUEUED: "排队中",
      GENERATING: "生成中",
      SUCCEEDED: "已完成",
      FAILED: "生成失败"
    };

    return names[status] ?? status;
  }

  private toLesson(lesson: VideoGuideLessonRecord) {
    return {
      id: lesson.id,
      userId: lesson.userId,
      learnerId: lesson.learnerId,
      title: lesson.title,
      mediaName: lesson.mediaName,
      mediaType: lesson.mediaType,
      mediaMimeType: lesson.mediaMimeType,
      mediaSizeBytes: lesson.mediaSizeBytes,
      mediaUrl: lesson.mediaUrl,
      mediaStorageKey: lesson.mediaStorageKey,
      subtitleName: lesson.subtitleName,
      subtitleFormat: lesson.subtitleFormat,
      subtitleSizeBytes: lesson.subtitleSizeBytes,
      subtitleUrl: lesson.subtitleUrl,
      subtitleStorageKey: lesson.subtitleStorageKey,
      status: lesson.status,
      statusName: this.statusName(lesson.status),
      shareToken: lesson.shareToken,
      sharePath: `/media-tutor/${lesson.shareToken}`,
      content: lesson.content,
      errorMessage: lesson.errorMessage,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
      finishedAt: lesson.finishedAt
    };
  }

  private toPublicLesson(lesson: VideoGuideLessonRecord) {
    const content = projectPublicCourseMaterial("VIDEO_GUIDE", lesson);

    return {
      id: lesson.id,
      title: lesson.title,
      mediaName: lesson.mediaName,
      mediaType: lesson.mediaType,
      mediaMimeType: lesson.mediaMimeType,
      mediaUrl: lesson.mediaUrl,
      subtitleName: lesson.subtitleName,
      subtitleFormat: lesson.subtitleFormat,
      subtitleUrl: lesson.subtitleUrl,
      shareToken: lesson.shareToken,
      sharePath: `/media-tutor/${lesson.shareToken}`,
      content,
      createdAt: lesson.createdAt
    };
  }
}

function videoGuideContentHasNarrationAudio(contentValue: unknown) {
  const content = isRecord(contentValue) ? contentValue : {};
  const timeline = Array.isArray(content.narrationTimeline) ? content.narrationTimeline : [];

  return timeline.some((value) => {
    const node = isRecord(value) ? value : null;
    return Boolean(node && typeof node.audioUrl === "string" && node.audioUrl.trim());
  });
}

function videoGuideChangedNarrationNode(
  contentValue: unknown,
  updates: UpdateVideoGuideNarrationScriptDto["nodes"]
) {
  const draft = narrationDraftFromContent(contentValue);
  const updatesById = new Map(updates.map((update) => [update.id.trim(), update]));
  const changed = draft.filter((node) => {
    const update = updatesById.get(node.id);
    return update && update.originalScript.trim() === node.script.trim() && update.script.trim() !== node.script.trim();
  });

  if (changed.length > 1) {
    throw new AppException(40001, "每次只能保存当前一句文稿", HttpStatus.BAD_REQUEST);
  }

  const node = changed[0];
  const update = node ? updatesById.get(node.id) : null;

  return node && update ? { ...node, script: update.script.trim() } : null;
}

function videoGuideStoredNarrationVoice(contentValue: unknown) {
  const voice = isRecord(contentValue) && isRecord(contentValue.narrationVoice)
    ? contentValue.narrationVoice
    : {};
  const voiceAssetId = stringFromUnknown(voice.voiceAssetId);
  const providerVoiceId = stringFromUnknown(voice.providerVoiceId);

  return voiceAssetId ? `voice:${voiceAssetId}` : `system:${providerVoiceId || "longanyang"}`;
}

function videoGuideStoredNarrationModelAlias(contentValue: unknown) {
  const voice = isRecord(contentValue) && isRecord(contentValue.narrationVoice)
    ? contentValue.narrationVoice
    : {};

  return stringFromUnknown(voice.modelAlias) || "tts-default";
}

function videoGuideNarrationScriptEditRevision(input: {
  audioTaskId: string;
  lessonId: string;
  modelAlias: string;
  node: NarrationTimelineNodeDraft | null;
  voice: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify([
      input.lessonId,
      input.node?.id ?? null,
      input.node?.script ?? null,
      input.audioTaskId,
      input.voice,
      input.modelAlias
    ]))
    .digest("hex");
}

function videoGuideNarrationNodeAudioTaskId(contentValue: unknown, nodeId: string | undefined) {
  if (!nodeId || !isRecord(contentValue) || !Array.isArray(contentValue.narrationTimeline)) {
    return "";
  }

  const node = contentValue.narrationTimeline
    .map((value) => isRecord(value) ? value : null)
    .find((value) => value?.id === nodeId);

  return stringFromUnknown(node?.audioTaskId);
}

function narrationNodeScript(contentValue: unknown, nodeId: string) {
  const node = narrationDraftFromContent(contentValue).find((value) => value.id === nodeId);

  if (!node) {
    throw new AppException(40001, "当前文稿句子不存在，请刷新后重试", HttpStatus.BAD_REQUEST);
  }

  return node.script;
}

function narrationScriptEditNodes(contentValue: unknown, job: NarrationScriptEditJob) {
  const draft = narrationDraftFromContent(contentValue);
  const target = draft.find((node) => node.id === job.nodeId);

  if (!target || target.script.trim() !== job.originalScript.trim()) {
    throw new AppException(40901, "文稿已发生变化，请重新编辑", HttpStatus.CONFLICT);
  }

  return draft.map((node) => ({
    id: node.id,
    originalScript: node.script,
    script: node.id === job.nodeId ? job.script : node.script
  }));
}

function mergeNarrationScriptEditJobContent(contentValue: unknown, job: NarrationScriptEditJob) {
  const content = isRecord(contentValue) ? contentValue : {};

  return {
    ...content,
    narrationScriptEditJob: job
  };
}

function clearNarrationScriptEditJobContent(contentValue: unknown) {
  const content = isRecord(contentValue) ? contentValue : {};

  return {
    ...content,
    narrationScriptEditJob: null
  };
}

function narrationScriptEditJobFromContent(contentValue: unknown): NarrationScriptEditJob | null {
  const content = isRecord(contentValue) ? contentValue : {};
  const value = isRecord(content.narrationScriptEditJob) ? content.narrationScriptEditJob : null;
  const ownerId = stringFromUnknown(value?.ownerId);
  const requestId = stringFromUnknown(value?.requestId);
  const operationKey = stringFromUnknown(value?.operationKey);
  const nodeId = stringFromUnknown(value?.nodeId);
  const script = stringFromUnknown(value?.script);
  const revision = stringFromUnknown(value?.revision);
  const createdAt = stringFromUnknown(value?.createdAt);
  const updatedAt = stringFromUnknown(value?.updatedAt);

  if (
    !value ||
    value.version !== 1 ||
    (value.status !== "RUNNING" && value.status !== "CLEANUP_PENDING") ||
    !ownerId ||
    !requestId ||
    !operationKey ||
    typeof value.estimatedCredits !== "number" ||
    !Number.isFinite(value.estimatedCredits) ||
    value.estimatedCredits < 0 ||
    !nodeId ||
    typeof value.originalScript !== "string" ||
    !script ||
    !revision ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    version: 1,
    status: value.status,
    ownerId,
    requestId,
    operationKey,
    estimatedCredits: Math.ceil(value.estimatedCredits),
    nodeId,
    originalScript: value.originalScript,
    script,
    revision,
    createdAt,
    updatedAt
  };
}

function narrationScriptEditJobMatches(
  current: NarrationScriptEditJob | null,
  expected: NarrationScriptEditJob
): current is NarrationScriptEditJob {
  return Boolean(
    current &&
    current.ownerId === expected.ownerId &&
    current.requestId === expected.requestId &&
    current.operationKey === expected.operationKey &&
    current.nodeId === expected.nodeId &&
    current.revision === expected.revision
  );
}

function narrationScriptEditJobIsStale(job: NarrationScriptEditJob, now: string) {
  const updatedAt = Date.parse(job.updatedAt);
  const nowTime = Date.parse(now);

  return (
    Number.isFinite(updatedAt) &&
    Number.isFinite(nowTime) &&
    nowTime - updatedAt >= videoGuideNarrationScriptEditStaleMs()
  );
}

function buildDraftLessonContent(
  media: CreateVideoGuideDraftDto,
  subtitle?: UpdateVideoGuideLessonSubtitleDto
): Prisma.InputJsonValue {
  const subtitleText = subtitle?.subtitleText?.trim() ?? "";
  const cues = subtitle ? extractSubtitleCues(subtitle.subtitleFormat, subtitleText) : [];

  return {
    ...mockContent,
    summary: subtitle
      ? `《${stripExtension(media.mediaName.trim())}》的媒体文件和字幕已经保存，当前字幕共读取 ${cues.length} 句。确认字幕文字后，可以先生成导学文案，再合成串讲语音。`
      : `《${stripExtension(media.mediaName.trim())}》的媒体文件已经保存为课件草稿。请继续上传字幕文件，或调用语音识别生成 srt 字幕文件。`
  } satisfies Prisma.InputJsonValue;
}

function videoGuideSubjectWhere(subject: ProfileSubject, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    userId: subject.userId,
    ...(subject.mode === "LEARNER" ? { learnerId: subject.learnerId } : {})
  };
}

function profileSubjectFromRecord(record: Pick<VideoGuideLessonRecord, "userId" | "learnerId">): ProfileSubject {
  return record.learnerId
    ? { mode: "LEARNER", userId: record.userId, learnerId: record.learnerId }
    : { mode: "ACCOUNT", userId: record.userId, learnerId: null };
}

function buildLessonContent(dto: CreateVideoGuideLessonDto): Prisma.InputJsonValue {
  const subtitleText = dto.subtitleText?.trim();

  if (!subtitleText) {
    return mockContent;
  }

  const cues = narratableSubtitleCues(withOriginalSentenceIds(extractSubtitleCues(dto.subtitleFormat, subtitleText)));

  if (cues.length === 0) {
    return mockContent;
  }

  const words = extractGuideWords(cues);
  const teacherSegments = buildTeacherSegments(cues, words);
  const repeatLines = buildRepeatLines(cues);
  const content = {
    summary: `系统已从《${dto.subtitleName.trim()}》读取 ${cues.length} 段字幕，并为《${stripExtension(dto.mediaName.trim())}》整理出学习主线。建议先整体看懂内容，再围绕关键词、段落逻辑和可跟读句子做精听练习。`,
    stageNames,
    words: words.length > 0 ? words : mockContent.words,
    teacherSegments: teacherSegments.length > 0 ? teacherSegments : mockContent.teacherSegments,
    questions: [],
    repeatLines: repeatLines.length > 0 ? repeatLines : mockContent.repeatLines
  };

  return content as unknown as Prisma.InputJsonValue;
}

function queuedNarrationJobContent(
  dto: CreateVideoGuideLessonDto,
  operationKey: string,
  estimatedCredits: number,
  previousContent?: Prisma.JsonValue
): Prisma.InputJsonValue {
  const now = new Date().toISOString();
  const job = createVideoGuideOperationJob({
    operation: "NARRATION",
    jobId: randomBytes(12).toString("hex"),
    operationKey,
    estimatedCredits,
    input: serializableVideoGuideJobInput(dto),
    now
  });
  const progress = createVideoGuideOperationProgress({
    operation: "NARRATION",
    phase: "QUEUED",
    message: "导学文案任务已提交，可以关闭页面，后台会继续生成",
    now,
    total: 100
  });
  const generatedContent = buildLessonContent(dto);
  const previousCheckpoint = isRecord(previousContent)
    ? previousContent.narrationGenerationCheckpoint
    : undefined;
  const resumableContent =
    previousCheckpoint === undefined
      ? generatedContent
      : {
          ...(isRecord(generatedContent) ? generatedContent : {}),
          narrationGenerationCheckpoint: previousCheckpoint
        };
  const contentWithJob = mergeVideoGuideOperationJobContent(
    withLessonBillingOperationKey(resumableContent as Prisma.InputJsonValue, operationKey),
    "narrationGenerationJob",
    job
  );

  return mergeVideoGuideOperationProgressContent(
    contentWithJob,
    "narrationGenerationProgress",
    progress
  ) as unknown as Prisma.InputJsonValue;
}

function serializableVideoGuideJobInput<TInput>(input: TInput) {
  return JSON.parse(JSON.stringify(input)) as TInput;
}

function narrationDraftRevision(nodes: Array<{ id: string; script: string }>) {
  return createHash("sha256")
    .update(JSON.stringify(nodes.map(({ id, script }) => [id, script])))
    .digest("hex");
}

export function mergeLessonNarrationAudioContent(
  baseContent: Prisma.JsonValue,
  input: {
    audioTaskId: string | null;
    audioUrl: string | null;
    narrationAudioProgress: NarrationAudioProgress;
    narrationTimeline: NarrationTimelineNode[];
    ttsModelAlias: string;
    voice: string;
    wasTtsTextTruncated: boolean;
  }
): Prisma.InputJsonValue {
  const base = isRecord(baseContent) ? baseContent : mockContent;
  const voiceSelection = resolveVideoGuideNarrationVoiceSelection(input.voice);

  return {
    ...base,
    narrationAudioUrl: input.audioUrl,
    narrationAudioTaskId: input.audioTaskId,
    narrationAudioProgress: input.narrationAudioProgress,
    narrationAudioTruncated: input.wasTtsTextTruncated,
    narrationAudioStale: false,
    narrationTimeline: input.narrationTimeline,
    narrationVoice: {
      providerVoiceId: voiceSelection.voice ?? null,
      voiceAssetId: voiceSelection.voiceAssetId ?? null,
      modelAlias: input.ttsModelAlias,
      modelName: null,
      providerName: null
    }
  } as unknown as Prisma.InputJsonValue;
}

function mergeLessonPracticeContent(
  baseContent: Prisma.JsonValue,
  input: {
    aiModelName: string | null;
    aiProviderName: string | null;
    aiTaskId: string;
    questions: GuideQuestion[];
  }
): Prisma.InputJsonValue {
  const base = isRecord(baseContent) ? baseContent : mockContent;

  return {
    ...base,
    questions: input.questions,
    practiceQuestionsAiTaskId: input.aiTaskId,
    practiceQuestionsModel: {
      modelName: input.aiModelName,
      providerName: input.aiProviderName
    }
  } as unknown as Prisma.InputJsonValue;
}

export function buildNarrationTimelineDraft(
  aiText: string,
  cues: SubtitleCue[],
  mediaTitle: string
): NarrationTimelineNodeDraft[] {
  void mediaTitle;
  const payload = parseNarrationTimelinePayload(aiText);
  assertValidNarrationPayload(payload, cues);
  return buildNarrationTimelineDraftFromPayload(payload, cues);
}

export function buildNarrationIntroDraft(
  aiText: string,
  mediaTitle: string
): NarrationTimelineNodeDraft {
  void mediaTitle;
  const payload = parseNarrationTimelinePayload(aiText);

  if (!isRecord(payload)) {
    throw narrationParseException("AI 串讲结果解析失败，请重新生成导学课件文案");
  }

  const script = normalizeNarrationScript(readNestedString(payload, "intro", "script"));

  if (!script) {
    throw narrationParseException("AI 串讲结果缺少导入讲解，请重新生成导学课件文案");
  }

  return narrationIntroNode(script);
}

export function buildNarrationSentenceDrafts(
  aiText: string,
  cues: SubtitleCue[],
  mediaTitle: string
): NarrationTimelineNodeDraft[] {
  void mediaTitle;
  const payload = parseNarrationTimelinePayload(aiText);

  if (!isRecord(payload)) {
    throw narrationParseException("AI 串讲结果解析失败，请重新生成导学课件文案");
  }

  if (!Array.isArray(payload.sentences)) {
    throw narrationParseException("AI 串讲结果缺少逐句讲解，请重新生成导学课件文案");
  }

  assertNarrationSentenceCoverage(payload, cues);

  return buildNarrationTimelineDraftFromPayload(payload, cues).filter(
    (node) => node.type === "SENTENCE"
  );
}

export function buildNarrationSummaryDraft(
  aiText: string,
  mediaTitle: string
): NarrationTimelineNodeDraft {
  void mediaTitle;
  const payload = parseNarrationTimelinePayload(aiText);

  if (!isRecord(payload)) {
    throw narrationParseException("AI 串讲结果解析失败，请重新生成导学课件文案");
  }

  const script = normalizeNarrationScript(readNestedString(payload, "summary", "script"));

  if (!script) {
    throw narrationParseException("AI 串讲结果缺少总结讲解，请重新生成导学课件文案");
  }

  return narrationSummaryNode(script);
}

export function buildPartialNarrationTimelineDraft(
  aiText: string,
  cues: SubtitleCue[],
  mediaTitle: string
): NarrationTimelineNodeDraft[] {
  void mediaTitle;
  const payload = parseNarrationTimelinePayload(aiText);
  assertNarrationPayloadEnvelope(payload);
  return buildNarrationTimelineDraftFromPayload(payload, cues, {
    requireAllSentences: false
  });
}

function buildNarrationTimelineDraftFromPayload(
  payload: Record<string, unknown>,
  cues: SubtitleCue[],
  options: { requireAllSentences?: boolean } = {}
): NarrationTimelineNodeDraft[] {
  const narratableCues = narratableSubtitleCues(withOriginalSentenceIds(cues));
  const sentencePayloads = narrationSentencePayloads(payload);
  const introScript = normalizeNarrationScript(readNestedString(payload, "intro", "script"));
  const summaryScript = normalizeNarrationScript(readNestedString(payload, "summary", "script"));
  const nodes: NarrationTimelineNodeDraft[] = [narrationIntroNode(introScript)];

  narratableCues.forEach((cue, index) => {
    const sentenceId = cueSentenceId(cue, index);
    const matched = sentencePayloads.find((item) => item.sentenceId === sentenceId);

    if (!matched && !options.requireAllSentences) {
      return;
    }

    const chunks = narrationChunksFromPayload(matched, cue, index, sentenceId);
    const script = normalizeNarrationScript(chunks.map((chunk) => chunk.text).join(" "));

    nodes.push({
      id: sentenceId,
      type: "SENTENCE",
      title: `第 ${cueDisplayIndex(cue, index)} 句`,
      sentenceId,
      timeRange: cue.timeRange,
      ...(cue.startSeconds === undefined ? {} : { startSeconds: cue.startSeconds }),
      ...(cue.endSeconds === undefined ? {} : { endSeconds: cue.endSeconds }),
      subtitle: cue.text,
      script,
      chunks
    });
  });

  nodes.push(narrationSummaryNode(summaryScript));

  return nodes.filter((node) => node.script.trim());
}

function assertNarrationPayloadEnvelope(payload: unknown): asserts payload is Record<string, unknown> {
  if (!isRecord(payload)) {
    throw narrationParseException("AI 串讲结果解析失败，请重新生成导学课件文案");
  }

  if (!normalizeNarrationScript(readNestedString(payload, "intro", "script"))) {
    throw narrationParseException("AI 串讲结果缺少导入讲解，请重新生成导学课件文案");
  }

  if (!normalizeNarrationScript(readNestedString(payload, "summary", "script"))) {
    throw narrationParseException("AI 串讲结果缺少总结讲解，请重新生成导学课件文案");
  }
}

function assertValidNarrationPayload(payload: unknown, cues: SubtitleCue[]): asserts payload is Record<string, unknown> {
  assertNarrationPayloadEnvelope(payload);

  assertNarrationSentenceCoverage(payload, cues);
}

function assertNarrationSentenceCoverage(payload: Record<string, unknown>, cues: SubtitleCue[]) {
  const sentencePayloads = narrationSentencePayloads(payload);
  const expectedIds = narratableSubtitleCues(withOriginalSentenceIds(cues)).map((cue, index) => cueSentenceId(cue, index));
  const payloadIds = new Set(sentencePayloads.map((item) => item.sentenceId));
  const missingId = expectedIds.find((sentenceId) => !payloadIds.has(sentenceId));

  if (missingId) {
    throw narrationParseException(`AI 串讲结果未覆盖 ${missingId}，请重新生成导学课件文案`);
  }
}

function narrationIntroNode(script: string): NarrationTimelineNodeDraft {
  return {
    id: "intro",
    type: "INTRO",
    title: "导入讲解",
    script,
    chunks: [
      {
        id: "intro-c1",
        type: "intro",
        text: script,
        overlay: null
      }
    ]
  };
}

function narrationSummaryNode(script: string): NarrationTimelineNodeDraft {
  return {
    id: "summary",
    type: "SUMMARY",
    title: "总结讲解",
    script,
    chunks: [
      {
        id: "summary-c1",
        type: "summary",
        text: script,
        overlay: null
      }
    ]
  };
}

function narrationParseException(message: string) {
  return new NarrationBatchOutputError(message);
}

export function extractGuideWordsFromNarrationTimeline(timeline: NarrationTimelineNodeDraft[]) {
  const words = new Map<string, GuideWord>();

  timeline.forEach((node) => {
    if (node.type !== "SENTENCE") {
      return;
    }

    node.chunks.forEach((chunk) => {
      const candidate = normalizeGuidePhrase(chunk.overlay?.text);

      if (!candidate) {
        return;
      }

      const id = candidate.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      if (!id || words.has(id)) {
        return;
      }

      words.set(id, {
        id: `word-${id}`,
        word: candidate,
        phonetic: "跟读时重点模仿",
        meaning: chunk.overlay?.subText || "互动讲解中的重点表达",
        note: truncatePlainText(chunk.text, 120),
        ...(node.subtitle ? { subtitle: node.subtitle } : {}),
        ...(node.timeRange ? { timeRange: node.timeRange } : {}),
        appearsAt: node.timeRange?.split(" - ")[0] ?? "00:00",
        ...(node.startSeconds === undefined ? {} : { appearsAtSeconds: node.startSeconds }),
        ...(node.endSeconds === undefined ? {} : { endSeconds: node.endSeconds })
      });
    });
  });

  return Array.from(words.values());
}

function normalizeGuidePhrase(value: string | undefined) {
  const text = value?.replace(/\s+/g, " ").trim();

  if (!text || !/[A-Za-z]/.test(text)) {
    return "";
  }

  const phrase = (text.match(/[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)*/)?.[0] ?? "").trim();

  if (phrase.length < 3) {
    return "";
  }

  return phrase;
}

function truncatePlainText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function parseJsonPayload(value: string) {
  const normalized = value.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const jsonStart = normalized.indexOf("{");
  const jsonEnd = normalized.lastIndexOf("}");

  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return null;
  }

  const jsonText = normalized.slice(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    const repairedJsonText = repairUnescapedJsonStringQuotes(jsonText);

    if (repairedJsonText === jsonText) {
      return null;
    }

    try {
      return JSON.parse(repairedJsonText) as unknown;
    } catch {
      return null;
    }
  }
}

function parseNarrationTimelinePayload(value: string) {
  return parseJsonPayload(value);
}

function repairUnescapedJsonStringQuotes(jsonText: string) {
  let repaired = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < jsonText.length; index += 1) {
    const character = jsonText[index];

    if (!inString) {
      if (character === '"') {
        inString = true;
      }

      repaired += character;
      continue;
    }

    if (escaped) {
      repaired += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      repaired += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      if (isJsonStringBoundary(jsonText, index)) {
        inString = false;
        repaired += character;
      } else {
        repaired += '\\"';
      }

      continue;
    }

    repaired += character;
  }

  return repaired;
}

function nextNonWhitespaceCharacter(value: string, startIndex: number) {
  for (let index = startIndex; index < value.length; index += 1) {
    const character = value[index];

    if (!/\s/.test(character)) {
      return { character, index };
    }
  }

  return { character: "", index: value.length };
}

function isJsonStringBoundary(value: string, quoteIndex: number) {
  const next = nextNonWhitespaceCharacter(value, quoteIndex + 1);

  if (next.character === "" || next.character === ":" || next.character === "}" || next.character === "]") {
    return true;
  }

  if (next.character !== ",") {
    return false;
  }

  const afterComma = nextNonWhitespaceCharacter(value, next.index + 1).character;

  return (
    afterComma === "" ||
    afterComma === '"' ||
    afterComma === "{" ||
    afterComma === "[" ||
    afterComma === "}" ||
    afterComma === "]" ||
    afterComma === "-" ||
    /[0-9tfn]/.test(afterComma)
  );
}

function normalizeGeneratedPracticeQuestions(value: string) {
  const payload = parseJsonPayload(value);

  if (!isRecord(payload) || !Array.isArray(payload.questions)) {
    return [];
  }

  const questions: GuideQuestion[] = [];

  for (const item of payload.questions) {
    if (!isRecord(item)) {
      continue;
    }

    const question = stringFromUnknown(item.question);
    const options = Array.isArray(item.options)
      ? item.options.map(stringFromUnknown).filter(Boolean).slice(0, 4)
      : [];
    const answer = questionAnswerIndex(item.answer);
    const explanation = stringFromUnknown(item.explanation);

    if (!question || options.length !== 4 || answer < 0 || answer > 3 || !explanation) {
      continue;
    }

    questions.push({
      id: `q${questions.length + 1}`,
      question,
      options,
      answer,
      explanation
    });

    if (questions.length >= 10) {
      break;
    }
  }

  return questions;
}

function questionAnswerIndex(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  const text = stringFromUnknown(value).toUpperCase();

  if (/^[0-3]$/.test(text)) {
    return Number(text);
  }

  const optionIndex = ["A", "B", "C", "D"].indexOf(text);

  return optionIndex;
}

function narrationSentencePayloads(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.sentences)) {
    return [];
  }

  return payload.sentences
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const sentenceId = narrationSentenceIdFromPayload(item);

      if (!sentenceId) {
        return null;
      }

      return {
        sentenceId,
        value: item
      };
    })
    .filter((item): item is { sentenceId: string; value: Record<string, unknown> } => Boolean(item));
}

function narrationSentenceIdFromPayload(item: Record<string, unknown>) {
  const directId = stringFromUnknown(item.sentenceId) || stringFromUnknown(item.id);

  if (/^s_\d{3,}$/.test(directId)) {
    return directId;
  }

  const directIdMatch = directId.match(/^s_(\d+)$/i);

  if (directIdMatch) {
    return sentenceCueId(Number(directIdMatch[1]) - 1);
  }

  const indexValue = typeof item.index === "number" ? item.index : Number(stringFromUnknown(item.index));

  if (Number.isInteger(indexValue) && indexValue > 0) {
    return sentenceCueId(indexValue - 1);
  }

  return directId;
}

function narrationChunksFromPayload(
  matched: { sentenceId: string; value: Record<string, unknown> } | undefined,
  cue: SubtitleCue,
  cueIndex: number,
  sentenceId = cueSentenceId(cue, cueIndex)
): NarrationChunkDraft[] {
  const rawChunks = narrationRawChunksFromPayload(matched, sentenceId);

  const chunks = rawChunks
    .map((item, index): NarrationChunkDraft | null => {
      const itemRecord = isRecord(item) ? item : null;
      const text = normalizeNarrationScript(
        itemRecord
          ? stringFromUnknown(itemRecord.text) ||
              stringFromUnknown(itemRecord.script) ||
              stringFromUnknown(itemRecord.explanation) ||
              stringFromUnknown(itemRecord.commentary)
          : stringFromUnknown(item)
      );

      if (!text) {
        return null;
      }

      const itemType = itemRecord ? stringFromUnknown(itemRecord.type) : "";

      const overlay = itemRecord ? narrationOverlayFromPayload(itemRecord.overlay) : null;

      return {
        id: `${sentenceId}-c${index + 1}`,
        type: itemType || "meaning",
        text,
        overlay
      };
    })
    .filter((item): item is NarrationChunkDraft => Boolean(item))
    .slice(0, 3);

  if (chunks.length === 0) {
    throw narrationParseException(`AI 串讲结果中 ${sentenceId} 的讲解片段为空，请重新生成导学课件文案`);
  }

  return chunks;
}

function narrationRawChunksFromPayload(
  matched: { sentenceId: string; value: Record<string, unknown> } | undefined,
  sentenceId: string
) {
  if (!matched) {
    throw narrationParseException(`AI 串讲结果缺少 ${sentenceId} 的讲解片段，请重新生成导学课件文案`);
  }

  const rawChunks =
    matched.value.teacherChunks ??
    matched.value.chunks ??
    matched.value.explanationChunks ??
    matched.value.explanations;

  if (Array.isArray(rawChunks)) {
    return rawChunks;
  }

  if (typeof rawChunks === "string" || isRecord(rawChunks)) {
    return [rawChunks];
  }

  const sentenceScript = normalizeNarrationScript(
    stringFromUnknown(matched.value.script) ||
      stringFromUnknown(matched.value.text) ||
      stringFromUnknown(matched.value.explanation) ||
      stringFromUnknown(matched.value.commentary) ||
      stringFromUnknown(matched.value.teacherScript)
  );

  if (sentenceScript) {
    return [
      {
        type: stringFromUnknown(matched.value.type) || "meaning",
        text: sentenceScript,
        overlay: matched.value.overlay
      }
    ];
  }

  throw narrationParseException(`AI 串讲结果缺少 ${sentenceId} 的讲解片段，请重新生成导学课件文案`);
}

function cueSentenceId(cue: SubtitleCue, index: number) {
  return cue.sentenceId ?? sentenceCueId(index);
}

function cueDisplayIndex(cue: SubtitleCue, index: number) {
  const sentenceId = cueSentenceId(cue, index);
  const match = sentenceId.match(/^s_(\d+)$/i);

  return match ? Number(match[1]) : index + 1;
}

function withOriginalSentenceIds(cues: SubtitleCue[]) {
  return cues.map((cue, index) => ({
    ...cue,
    sentenceId: cueSentenceId(cue, index)
  }));
}

function narratableSubtitleCues(cues: SubtitleCue[]) {
  return cues.filter((cue) => cue.text.trim().length > 0);
}

function narrationOverlayFromPayload(value: unknown): NarrationOverlay | null {
  if (!isRecord(value)) {
    return null;
  }

  const text = stringFromUnknown(value.text);

  if (!text) {
    return null;
  }

  const subText = stringFromUnknown(value.subText);

  return {
    text,
    ...(subText ? { subText } : {})
  };
}

function narrationTimelineScript(nodes: NarrationTimelineNodeDraft[]) {
  return nodes.map((node) => node.script).filter(Boolean).join("\n\n").trim();
}

function narrationGenerationMetadata(input: {
  modelName: string | null;
  providerName: string | null;
  taskId: string;
}): NarrationGenerationMetadata {
  return {
    modelName: input.modelName,
    providerName: input.providerName,
    taskId: input.taskId
  };
}

function subtitleTimelinePromptJson(cues: SubtitleCue[], contextCues: SubtitleCue[] = cues) {
  const promptCues = narratableSubtitleCues(withOriginalSentenceIds(cues));
  const fullContext = narratableSubtitleCues(withOriginalSentenceIds(contextCues));
  const contextIndexById = new Map(
    fullContext.map((cue, index) => [cueSentenceId(cue, index), index])
  );
  const total = fullContext.length;

  return JSON.stringify(
    promptCues.map((cue, index) => ({
      sentenceId: cueSentenceId(cue, index),
      index: (contextIndexById.get(cueSentenceId(cue, index)) ?? index) + 1,
      total,
      position: narrationCuePosition(
        contextIndexById.get(cueSentenceId(cue, index)) ?? index,
        total
      ),
      startSeconds: cue.startSeconds ?? null,
      endSeconds: cue.endSeconds ?? null,
      previousText:
        fullContext[(contextIndexById.get(cueSentenceId(cue, index)) ?? index) - 1]?.text ?? null,
      text: cue.text,
      nextText:
        fullContext[(contextIndexById.get(cueSentenceId(cue, index)) ?? index) + 1]?.text ?? null
    })),
    null,
    2
  );
}

function practicePromptVariablesFromLesson(lesson: VideoGuideLessonRecord) {
  const content = isRecord(lesson.content) ? lesson.content : {};
  const narrationTimeline = narrationTimelineForDerivedContent(content);
  const words = Array.isArray(content.words) ? content.words : [];

  return {
    mediaTitle: lesson.title,
    subtitleJson: subtitlePromptJsonFromStoredNarrationTimeline(narrationTimeline),
    narrationTimelineJson: JSON.stringify(narrationTimeline, null, 2),
    guideWordsJson: JSON.stringify(words, null, 2)
  };
}

function subtitlePromptJsonFromStoredNarrationTimeline(value: unknown[]) {
  const sentenceNodes = value.filter((node): node is Record<string, unknown> => {
    return isRecord(node) && stringFromUnknown(node.type) === "SENTENCE" && Boolean(stringFromUnknown(node.subtitle));
  });

  return JSON.stringify(
    sentenceNodes.map((node, index) => ({
      sentenceId: stringFromUnknown(node.sentenceId) || `s_${String(index + 1).padStart(3, "0")}`,
      index: index + 1,
      total: sentenceNodes.length,
      startSeconds: numberFromUnknown(node.startSeconds),
      endSeconds: numberFromUnknown(node.endSeconds),
      timeRange: stringFromUnknown(node.timeRange) || `片段 ${index + 1}`,
      text: stringFromUnknown(node.subtitle)
    })),
    null,
    2
  );
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function narrationCuePosition(index: number, total: number) {
  if (index === 0) {
    return "opening";
  }

  if (index === total - 1) {
    return "closing";
  }

  if (index < Math.ceil(total * 0.25)) {
    return "early";
  }

  if (index >= Math.floor(total * 0.75)) {
    return "late";
  }

  return "middle";
}

function sentenceCueId(index: number) {
  return `s_${String(index + 1).padStart(3, "0")}`;
}

function readNestedString(value: unknown, key: string, nestedKey: string) {
  if (!isRecord(value)) {
    return "";
  }

  const nested = value[key];

  if (!isRecord(nested)) {
    return "";
  }

  return stringFromUnknown(nested[nestedKey]);
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function videoGuideGenerationErrorMessage(error: unknown) {
  if (error instanceof AppException) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    const message = error.message.trim();

    if (message === "Not Found") {
      return "AI Gateway 接口不存在，请检查 AI_GATEWAY_BASE_URL 是否指向本项目的 xueleai AI Gateway。";
    }

    return message;
  }

  return "导学课件生成失败，请稍后重试";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractSubtitleCues(format: "SRT" | "ASS", value: string) {
  const cues = format === "ASS" ? extractAssCues(value) : extractSrtCues(value);

  if (cues.length > 0) {
    return cues;
  }

  return value
    .split(/\r?\n/)
    .map(cleanSubtitleText)
    .filter(Boolean)
    .map((text, index) => ({
      text,
      timeRange: `片段 ${index + 1}`
    }));
}

function extractSrtCues(value: string) {
  return value
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block): SubtitleCue | null => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timeIndex = lines.findIndex((line) => line.includes("-->"));

      if (timeIndex < 0) {
        return null;
      }

      const text = cleanSubtitleText(lines.slice(timeIndex + 1).join(" "));

      return {
        text,
        timeRange: normalizeTimeRange(lines[timeIndex]),
        ...readTimeRangeSeconds(lines[timeIndex])
      };
    })
    .filter((cue): cue is SubtitleCue => Boolean(cue));
}

function extractAssCues(value: string) {
  return value
    .split(/\r?\n/)
    .map((line): SubtitleCue | null => {
      if (!line.startsWith("Dialogue:")) {
        return null;
      }

      const parts = line.slice("Dialogue:".length).split(",");

      if (parts.length < 10) {
        return null;
      }

      const text = cleanSubtitleText(parts.slice(9).join(","));

      const startSeconds = parseSubtitleTimeToSeconds(parts[1]);
      const endSeconds = parseSubtitleTimeToSeconds(parts[2]);

      return {
        text,
        timeRange: `${normalizeTime(parts[1])} - ${normalizeTime(parts[2])}`,
        ...(startSeconds === null ? {} : { startSeconds }),
        ...(endSeconds === null ? {} : { endSeconds })
      };
    })
    .filter((cue): cue is SubtitleCue => Boolean(cue));
}

function cleanSubtitleText(value: string) {
  return value
    .replace(/\{[^}]*\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\\[Nn]/g, " ")
    .replace(/(?:^|\s)-\s*/g, " ")
    .replace(/(?:^|\s)#\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTimeRange(value: string) {
  const [start, end] = value.split("-->");

  return `${normalizeTime(start)} - ${normalizeTime(end)}`;
}

function readTimeRangeSeconds(value: string) {
  const [start, end] = value.split("-->");
  const startSeconds = parseSubtitleTimeToSeconds(start);
  const endSeconds = parseSubtitleTimeToSeconds(end);

  return {
    ...(startSeconds === null ? {} : { startSeconds }),
    ...(endSeconds === null ? {} : { endSeconds })
  };
}

function normalizeTime(value: string | undefined) {
  const match = value?.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);

  if (!match) {
    return "00:00";
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function parseSubtitleTimeToSeconds(value: string | undefined) {
  const match = value?.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number((match[4] ?? "0").padEnd(3, "0"));

  if (![hours, minutes, seconds, milliseconds].every(Number.isFinite)) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function extractGuideWords(cues: SubtitleCue[]) {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "because",
    "before",
    "being",
    "could",
    "from",
    "have",
    "into",
    "just",
    "like",
    "more",
    "only",
    "over",
    "some",
    "than",
    "that",
    "their",
    "then",
    "there",
    "they",
    "this",
    "when",
    "where",
    "which",
    "with",
    "would",
    "your"
  ]);
  const words = new Map<string, { count: number; cueIndex: number; original: string }>();

  cues.forEach((cue, cueIndex) => {
    const matches = cue.text.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? [];

    matches.forEach((match) => {
      const normalized = match.toLowerCase().replace(/^'+|'+$/g, "");

      if (normalized.length < 4 || stopWords.has(normalized)) {
        return;
      }

      const existing = words.get(normalized);

      words.set(normalized, {
        count: (existing?.count ?? 0) + 1,
        cueIndex: existing?.cueIndex ?? cueIndex,
        original: existing?.original ?? normalized
      });
    });
  });

  return Array.from(words.entries())
    .sort(([, left], [, right]) => right.count - left.count || right.original.length - left.original.length)
    .slice(0, 5)
    .map(([id, item]): GuideWord => {
      const cue = cues[item.cueIndex];

      return {
        id: `word-${id.replace(/[^a-z0-9]+/g, "-")}`,
        word: item.original,
        phonetic: "待生成音标",
        meaning: "字幕关键词（待 AI 精讲）",
        note: `这个词在字幕中出现 ${item.count} 次，建议结合 ${cue?.timeRange ?? "对应片段"} 前后句理解。`,
        ...(cue?.text ? { subtitle: cue.text } : {}),
        ...(cue?.timeRange ? { timeRange: cue.timeRange } : {}),
        appearsAt: cue?.timeRange.split(" - ")[0] ?? "00:00",
        ...(cue?.startSeconds === undefined ? {} : { appearsAtSeconds: cue.startSeconds }),
        ...(cue?.endSeconds === undefined ? {} : { endSeconds: cue.endSeconds })
      };
    });
}

function buildTeacherSegments(cues: SubtitleCue[], words: GuideWord[]) {
  return pickEvenly(cues, 4).map((cue, index): TeacherSegment => {
    const word = words[index % Math.max(words.length, 1)]?.word ?? "关键信息";

    return {
      id: `segment-${index + 1}`,
      timeRange: cue.timeRange,
      ...(cue.startSeconds === undefined ? {} : { startSeconds: cue.startSeconds }),
      ...(cue.endSeconds === undefined ? {} : { endSeconds: cue.endSeconds }),
      subtitle: cue.text,
      explanation: `这一段建议先抓主句，不急着逐词翻译。可以重点留意“${word}”，再判断它和前后内容之间的关系。`
    };
  });
}

function buildRepeatLines(cues: SubtitleCue[]) {
  return cues.filter((cue) => cue.text.length > 0).map((cue, index): RepeatLine => ({
    id: `repeat-${index + 1}`,
    timeRange: cue.timeRange,
    ...(cue.startSeconds === undefined ? {} : { startSeconds: cue.startSeconds }),
    ...(cue.endSeconds === undefined ? {} : { endSeconds: cue.endSeconds }),
    text: cue.text,
    hint: "先听完整句，再模仿停顿、重音和语气。"
  }));
}

function pickEvenly<TItem>(items: TItem[], count: number) {
  if (items.length <= count) {
    return items;
  }

  return Array.from({ length: count }, (_, index) => items[Math.round((index * (items.length - 1)) / (count - 1))]);
}

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/, "") || "视频";
}

function lessonOperationKey(lessonId: string) {
  return `video-guide-lesson:${lessonId}`;
}

function lessonGenerationOperationKey(lessonId?: string) {
  const baseKey = lessonId ? lessonOperationKey(lessonId) : "video-guide-lesson";

  return `${baseKey}:generation:${randomBytes(8).toString("hex")}`;
}

function withLessonBillingOperationKey(content: Prisma.InputJsonValue, operationKey: string): Prisma.InputJsonValue {
  const base = isRecord(content) ? content : {};

  return {
    ...base,
    billingOperationKey: operationKey
  } as unknown as Prisma.InputJsonValue;
}

function lessonBillingOperationKey(lesson: { content: Prisma.JsonValue | null; id: string }) {
  const content = isRecord(lesson.content) ? lesson.content : null;
  const operationKey = content ? stringFromUnknown(content.billingOperationKey) : "";

  return operationKey || lessonOperationKey(lesson.id);
}

function isReusableVideoGuideLessonStatus(status: string) {
  return status === "DRAFT" || status === "SUCCEEDED" || status === "FAILED";
}

function subtitleBillingItems(dto: GenerateVideoGuideSubtitleDto): VideoGuideBillingItem[] {
  const mediaSizeMb = dto.mediaSizeBytes ? Math.ceil(dto.mediaSizeBytes / megabyte) : 0;
  const baseCredits = envPositiveInt("VIDEO_GUIDE_ASR_BASE_CREDITS", 30);
  const stepCredits = envPositiveInt("VIDEO_GUIDE_ASR_CREDITS_PER_20MB", 2);
  const sizeCredits = mediaSizeMb > 0 ? Math.ceil(mediaSizeMb / 20) * stepCredits : stepCredits;

  return [
    {
      code: "ASR_SUBTITLE",
      name: "语音识别生成字幕",
      description: "从已上传的视频或音频中识别语音，并生成 SRT 字幕文件。",
      estimatedCredits: baseCredits + sizeCredits
    }
  ];
}

function lessonBillingItems(dto: CreateVideoGuideLessonDto): VideoGuideBillingItem[] {
  const subtitleText = dto.subtitleText?.trim() ?? "";
  const contentCredits = narratableSubtitleCues(
    withOriginalSentenceIds(extractSubtitleCues(dto.subtitleFormat, subtitleText))
  ).length;

  return [
    {
      code: "GUIDE_CONTENT",
      name: "导学讲解内容生成",
      description: "生成互动讲解、词语巩固和跟读训练内容。",
      estimatedCredits: contentCredits
    }
  ];
}

function narrationTtsBillingItems(
  content: Prisma.JsonValue,
  billedCredits = 0
): VideoGuideBillingItem[] {
  const narrationChars = narrationTtsScriptCharacterCount(content);
  const narrationCredits = remainingNarrationTtsCredits(
    narrationTtsTotalCredits(content),
    billedCredits
  );

  return [
    {
      code: "TEACHER_NARRATION_TTS",
      name: "老师串讲音频合成",
      description:
        billedCredits > 0
          ? "继续合成尚未完成的逐句讲解语音，已完成部分不会重复计费。"
          : `按实际送入语音合成的 ${narrationChars} 个文稿字符合成逐句讲解语音。`,
      estimatedCredits: narrationCredits
    }
  ];
}

function narrationTtsTotalCredits(content: unknown) {
  const nodes = narrationTtsDraftFromContent(content);

  return narrationTtsCreditsForCompletedNodes(
    nodes,
    new Set(nodes.map((node) => node.id)),
    narrationTtsRates()
  );
}

function narrationTtsRates() {
  return {
    baseCredits: envPositiveInt("VIDEO_GUIDE_NARRATION_TTS_BASE_CREDITS", 20),
    creditsPerThousandCharacters: envPositiveInt(
      "VIDEO_GUIDE_NARRATION_TTS_CREDITS_PER_1000_CHARS",
      8
    )
  };
}

function videoGuideNarrationMaxTokens(cues: SubtitleCue[]) {
  const configuredMax = envPositiveInt("VIDEO_GUIDE_NARRATION_MAX_TOKENS", 8192);
  const estimatedBySentence = 800 + cues.length * 350;

  return Math.min(configuredMax, Math.max(1200, estimatedBySentence));
}

function videoGuideNarrationBatchAttempts() {
  return Math.min(3, Math.max(1, envPositiveInt("VIDEO_GUIDE_NARRATION_BATCH_ATTEMPTS", 2)));
}

function videoGuideNarrationConcurrency() {
  return Math.min(3, Math.max(1, envPositiveInt("VIDEO_GUIDE_NARRATION_CONCURRENCY", 2)));
}

function narrationGenerationRetryDelayMs(attempt: number, error: unknown) {
  if (!isRetryableAiProviderGenerationError(error)) {
    return 0;
  }

  return Math.min(8_000, 1_500 * 2 ** Math.max(0, attempt - 1) + Math.floor(Math.random() * 500));
}

function narrationGenerationEstimatedMinutes(input: {
  completed: number;
  elapsedMs: number;
  remaining: number;
}) {
  if (
    input.completed < VIDEO_GUIDE_NARRATION_BATCH_SIZE ||
    input.elapsedMs <= 0 ||
    input.remaining <= 0
  ) {
    return null;
  }

  const millisecondsPerSentence = input.elapsedMs / input.completed;
  const remainingMs = millisecondsPerSentence * input.remaining;

  return Math.max(1, Math.ceil(remainingMs / 60_000));
}

function videoGuideRecoveryIntervalMs() {
  return envPositiveInt("VIDEO_GUIDE_RECOVERY_INTERVAL_SECONDS", 60) * 1_000;
}

function videoGuideRecoveryStaleMs() {
  return envPositiveInt("VIDEO_GUIDE_RECOVERY_STALE_SECONDS", 900) * 1_000;
}

function videoGuideNarrationScriptEditStaleMs() {
  return envPositiveInt("VIDEO_GUIDE_NARRATION_SCRIPT_EDIT_STALE_SECONDS", 1_200) * 1_000;
}

function practiceBillingItems(lesson: VideoGuideLessonRecord): VideoGuideBillingItem[] {
  const content = isRecord(lesson.content) ? lesson.content : {};
  const narrationScriptLength = stringFromUnknown(content.narrationScript).length;
  const narrationTimelineLength = JSON.stringify(narrationTimelineForDerivedContent(content)).length;
  const promptCharacters = Math.max(800, narrationScriptLength + Math.ceil(narrationTimelineLength * 0.35));
  const practiceCredits =
    envPositiveInt("VIDEO_GUIDE_PRACTICE_BASE_CREDITS", 12) +
    Math.ceil(promptCharacters / 1000) * envPositiveInt("VIDEO_GUIDE_PRACTICE_CREDITS_PER_1000_CHARS", 3);

  return [
    {
      code: "PRACTICE_QUESTIONS",
      name: "生成随堂练习",
      description: "基于导学课件文案中重点讲解的英文词汇、语法和内容理解生成 10 道单选题。",
      estimatedCredits: practiceCredits
    }
  ];
}

function envPositiveInt(name: string, fallback: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.ceil(value);
}

function hashBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeSha256(value: string) {
  return value.trim().toLowerCase();
}

function createDedupUploadFilename(
  prefix: "media" | "subtitle",
  hash: string,
  originalName: string,
  mimeType: string,
  forcedExtension?: string
) {
  const normalizedHash = normalizeSha256(hash);
  const extension = forcedExtension ?? extensionFor(originalName, mimeType);

  if (prefix === "media" && videoGuideMediaUploadDriver() === "r2") {
    return `sha256/${normalizedHash.slice(0, 2)}/${normalizedHash.slice(2, 4)}/${normalizedHash}${extension}`;
  }

  return `${prefix}-sha256-${normalizedHash}${extension}`;
}

function videoGuideMediaHashFromStorageKey(storageKey: string) {
  const match = basename(storageKey.trim()).match(/([a-f0-9]{64})(?=\.[a-z0-9]+$|$)/i);

  return match?.[1]?.toLowerCase() ?? null;
}

function videoGuideMediaStorageProvider(): "LOCAL" | "S3" {
  return videoGuideMediaUploadDriver() === "r2" ? "S3" : "LOCAL";
}

function videoGuideMediaUploadResponse(
  asset: VideoGuideAssetResponseRecord,
  originalName: string,
  assetRefId?: string,
  reused = false
) {
  return {
    filename: asset.objectKey,
    originalName: normalizeOriginalName(originalName),
    mediaType: asset.mediaType === "AUDIO" ? "AUDIO" as const : "VIDEO" as const,
    mimeType: asset.mimeType,
    size: asset.sizeBytes,
    url: asset.url,
    assetId: asset.id,
    assetRefId,
    reused
  };
}

function videoGuideSubtitleUploadResponse(
  asset: VideoGuideAssetResponseRecord,
  originalName: string,
  assetRefId?: string,
  reused = false
) {
  return {
    filename: asset.objectKey,
    originalName: normalizeOriginalName(originalName),
    subtitleFormat: asset.subtitleFormat === "ASS" ? "ASS" as const : "SRT" as const,
    mimeType: asset.mimeType,
    size: asset.sizeBytes,
    url: asset.url,
    assetId: asset.id,
    assetRefId,
    reused
  };
}

function isUniqueConstraintError(error: unknown) {
  return isRecord(error) && error.code === "P2002";
}

export function localVideoGuideFileStream(filepath: string, options?: { end?: number; start?: number }) {
  return createReadStream(filepath, options);
}

async function writeVideoGuideMediaUpload(filename: string, file: UploadedVideoGuideFileLike) {
  if (videoGuideMediaUploadDriver() === "r2") {
    return uploadVideoGuideMediaToR2(filename, file);
  }

  return {
    objectKey: filename,
    url: await writeVideoGuideUpload(filename, file)
  };
}

async function writeVideoGuideUpload(filename: string, file: UploadedVideoGuideFileLike) {
  const directory = videoGuideUploadDir();
  mkdirSync(directory, {
    recursive: true
  });
  await writeFile(join(directory, filename), file.buffer);

  return `${publicApiBaseUrl()}/public/video-guide/files/${filename}`;
}

async function downloadVideoGuideAssetBuffer(url: string) {
  const response = await fetch(absoluteVideoGuideAssetUrl(url));

  if (!response.ok) {
    throw new AppException(50004, "媒体文件下载失败，无法生成网页播放版", HttpStatus.BAD_GATEWAY);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length <= 0) {
    throw new AppException(50004, "媒体文件为空，无法生成网页播放版", HttpStatus.BAD_GATEWAY);
  }

  return buffer;
}

function absoluteVideoGuideAssetUrl(url: string) {
  const value = url.trim();

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return new URL(value, `${publicApiBaseUrl()}/`).toString();
}

async function uploadVideoGuideMediaToR2(
  filename: string,
  file: UploadedVideoGuideFileLike,
  prefix?: string,
  onHeartbeat?: () => Promise<void>
) {
  const config = videoGuideR2Config();
  const key = `${prefix ?? config.prefix}${filename}`;
  const endpoint = config.endpoint.replace(/\/+$/, "");
  const url = config.pathStyle
    ? `${endpoint}/${config.bucket}/${key}`
    : `${endpoint.replace("://", `://${config.bucket}.`)}/${key}`;
  const parsedUrl = new URL(url);
  const amzDate = amzTimestamp(new Date());
  const payloadHash = createHash("sha256").update(file.buffer).digest("hex");
  const headers: Record<string, string> = {
    "content-type": file.mimetype || mimeTypeFor(filename),
    host: parsedUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  const authorization = signS3Request({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    method: "PUT",
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    headers,
    payloadHash,
    amzDate
  });
  const controller = new AbortController();
  const uploadTimeoutMs = videoGuideR2UploadTimeoutMs();
  const uploadDeadline = Date.now() + uploadTimeoutMs;
  let uploadTimedOut = false;
  const timeout = setTimeout(() => {
    uploadTimedOut = true;
    controller.abort();
  }, uploadTimeoutMs);
  let heartbeatFailure: unknown;
  let heartbeatInFlight: Promise<void> | null = null;
  const heartbeat = onHeartbeat
    ? setInterval(() => {
        if (heartbeatInFlight) {
          return;
        }

        heartbeatInFlight = onHeartbeat()
          .catch((error: unknown) => {
            heartbeatFailure = error;
            controller.abort();
          })
          .finally(() => {
            heartbeatInFlight = null;
          });
      }, videoGuideAsrUploadHeartbeatIntervalMs())
    : null;
  heartbeat?.unref?.();
  let response: Response;
  const waitForHeartbeat = () => waitForVideoGuideUploadHeartbeat(heartbeatInFlight, uploadDeadline);

  try {
    response = await fetch(url, {
      body: file.buffer,
      headers: {
        ...headers,
        authorization
      },
      method: "PUT",
      signal: controller.signal
    });
    if (!await waitForHeartbeat()) {
      uploadTimedOut = true;
      controller.abort();
      throw new AppException(50002, "Cloudflare R2 媒体文件上传超时", HttpStatus.BAD_GATEWAY);
    }

    if (heartbeatFailure) {
      throw heartbeatFailure;
    }
  } catch {
    if (!await waitForHeartbeat()) {
      uploadTimedOut = true;
    }

    if (heartbeatFailure) {
      throw heartbeatFailure;
    }

    if (uploadTimedOut || controller.signal.aborted) {
      throw new AppException(50002, "Cloudflare R2 媒体文件上传超时", HttpStatus.BAD_GATEWAY);
    }

    throw new AppException(50002, "Cloudflare R2 媒体文件上传失败", HttpStatus.BAD_GATEWAY);
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new AppException(50002, "Cloudflare R2 媒体文件上传失败", HttpStatus.BAD_GATEWAY);
  }

  return {
    objectKey: key,
    url: config.publicBaseUrl ? `${config.publicBaseUrl.replace(/\/+$/, "")}/${key}` : url
  };
}

async function waitForVideoGuideUploadHeartbeat(
  heartbeat: Promise<void> | null,
  deadline: number
) {
  if (!heartbeat) {
    return true;
  }

  const remainingMs = deadline - Date.now();

  if (remainingMs <= 0) {
    return false;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      heartbeat.then(() => true),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), remainingMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function videoGuideR2UploadTimeoutMs() {
  const configured = Number(process.env.VIDEO_GUIDE_R2_UPLOAD_TIMEOUT_MS ?? 30 * 60 * 1_000);

  return Number.isFinite(configured) && configured >= 10
    ? Math.min(Math.round(configured), 90 * 60 * 1_000)
    : 30 * 60 * 1_000;
}

function videoGuideR2DeleteTimeoutMs() {
  const configured = Number(process.env.VIDEO_GUIDE_R2_DELETE_TIMEOUT_MS ?? 30_000);

  return Number.isFinite(configured) && configured >= 10
    ? Math.min(Math.round(configured), 2 * 60 * 1_000)
    : 30_000;
}

function videoGuideAsrUploadHeartbeatIntervalMs() {
  const configured = Number(process.env.VIDEO_GUIDE_ASR_UPLOAD_HEARTBEAT_INTERVAL_MS ?? 30_000);
  const maxInterval = Math.max(10, Math.floor(videoGuideRecoveryStaleMs() / 3));

  return Number.isFinite(configured) && configured >= 10
    ? Math.min(Math.round(configured), maxInterval)
    : Math.min(30_000, maxInterval);
}

async function uploadVideoGuideAsrAudioToR2(
  jobId: string,
  attemptId: string,
  file: UploadedVideoGuideFileLike,
  onHeartbeat: () => Promise<void>
) {
  const digest = createHash("sha256").update(file.buffer).digest("hex").slice(0, 16);
  const filename = `${jobId}-${attemptId}-${digest}.m4a`;
  const prefix = videoGuideAsrR2Prefix();

  try {
    return await uploadVideoGuideMediaToR2(filename, file, prefix, onHeartbeat);
  } catch (error) {
    await deleteVideoGuideR2Object(`${prefix}${filename}`).catch(() => undefined);
    throw error;
  }
}

async function uploadVideoGuideAsrCacheToR2(
  hash: string,
  file: UploadedVideoGuideFileLike,
  onHeartbeat?: () => Promise<void>
) {
  const objectKey = videoGuideAsrCacheObjectKey(hash);
  const uploaded = await uploadVideoGuideMediaToR2(objectKey, file, "", onHeartbeat);
  const signedUrl = signedVideoGuideR2UrlFromObjectKey(uploaded.objectKey);

  if (!signedUrl) {
    throw new AppException(50004, "识别音频缓存地址生成失败", HttpStatus.BAD_GATEWAY);
  }

  await assertVideoGuideAsrUrlReadable(signedUrl);

  return {
    mimeType: file.mimetype,
    objectKey: uploaded.objectKey,
    sizeBytes: file.size
  } satisfies VideoGuideAsrCache;
}

async function deleteVideoGuideR2Object(objectKey: string) {
  const key = normalizedR2ObjectKey(objectKey);
  const config = optionalVideoGuideR2Config();

  if (!key || !config) {
    return;
  }

  const endpoint = config.endpoint.replace(/\/+$/, "");
  const url = config.pathStyle
    ? `${endpoint}/${config.bucket}/${key}`
    : `${endpoint.replace("://", `://${config.bucket}.`)}/${key}`;
  const parsedUrl = new URL(url);
  const amzDate = amzTimestamp(new Date());
  const payloadHash = createHash("sha256").update("").digest("hex");
  const headers: Record<string, string> = {
    host: parsedUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  const authorization = signS3Request({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    method: "DELETE",
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    headers,
    payloadHash,
    amzDate
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), videoGuideR2DeleteTimeoutMs());
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        ...headers,
        authorization
      },
      method: "DELETE",
      signal: controller.signal
    });
  } catch {
    throw new AppException(50002, "Cloudflare R2 临时文件清理失败", HttpStatus.BAD_GATEWAY);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok && response.status !== 404) {
    throw new AppException(50002, "Cloudflare R2 临时文件清理失败", HttpStatus.BAD_GATEWAY);
  }
}

async function writeVideoGuideBufferUpload(filename: string, buffer: Buffer) {
  const directory = videoGuideUploadDir();
  mkdirSync(directory, {
    recursive: true
  });
  await writeFile(join(directory, filename), buffer);

  return `${publicApiBaseUrl()}/public/video-guide/files/${filename}`;
}

function videoGuideUploadDir() {
  return resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads"), "video-guide");
}

function publicApiBaseUrl() {
  return (process.env.PUBLIC_API_BASE_URL ?? process.env.API_PUBLIC_BASE_URL ?? "http://localhost:3322/api").replace(/\/+$/, "");
}

function videoGuideMediaUploadDriver() {
  const driver = (
    process.env.VIDEO_GUIDE_MEDIA_UPLOAD_DRIVER ??
    process.env.VIDEO_GUIDE_UPLOAD_DRIVER ??
    process.env.UPLOAD_DRIVER ??
    "local"
  )
    .trim()
    .toLowerCase();

  return driver === "r2" || driver === "s3" || driver === "s3-compatible" ? "r2" : "local";
}

function videoGuideR2Config() {
  const bucket = process.env.VIDEO_GUIDE_R2_BUCKET?.trim() || process.env.S3_BUCKET?.trim() || "xueleai";

  return {
    endpoint: requiredObjectStorageEnv("VIDEO_GUIDE_R2_ENDPOINT", "S3_ENDPOINT"),
    bucket,
    region: process.env.VIDEO_GUIDE_R2_REGION || process.env.S3_REGION || "auto",
    accessKeyId: requiredObjectStorageEnv("VIDEO_GUIDE_R2_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredObjectStorageEnv("VIDEO_GUIDE_R2_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY"),
    publicBaseUrl: videoGuideR2PublicBaseUrl(),
    pathStyle: (process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE ?? process.env.S3_FORCE_PATH_STYLE ?? "1") !== "0",
    prefix: videoGuideR2MediaPrefix()
  };
}

function optionalVideoGuideR2Config() {
  const endpoint = process.env.VIDEO_GUIDE_R2_ENDPOINT?.trim() || process.env.S3_ENDPOINT?.trim();
  const accessKeyId = process.env.VIDEO_GUIDE_R2_ACCESS_KEY_ID?.trim() || process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.VIDEO_GUIDE_R2_SECRET_ACCESS_KEY?.trim() || process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    accessKeyId,
    bucket: process.env.VIDEO_GUIDE_R2_BUCKET?.trim() || process.env.S3_BUCKET?.trim() || "xueleai",
    endpoint,
    pathStyle: (process.env.VIDEO_GUIDE_R2_FORCE_PATH_STYLE ?? process.env.S3_FORCE_PATH_STYLE ?? "1") !== "0",
    region: process.env.VIDEO_GUIDE_R2_REGION || process.env.S3_REGION || "auto",
    secretAccessKey
  };
}

function publicVideoGuideMediaUrlFromStorageKey(storageKey: string) {
  const publicBaseUrl = videoGuideR2PublicBaseUrl();

  if (!publicBaseUrl) {
    return null;
  }

  const normalizedKey = storageKey.trim().replace(/^\/+/, "");

  if (!normalizedKey) {
    return null;
  }

  const key = normalizedKey.includes("/") ? normalizedKey : `${videoGuideR2MediaPrefix()}${basename(normalizedKey)}`;

  return `${publicBaseUrl.replace(/\/+$/, "")}/${key}`;
}

function signedVideoGuideMediaUrlFromStorageKey(storageKey: string) {
  if (videoGuideMediaUploadDriver() !== "r2") {
    return null;
  }

  const key = normalizedR2ObjectKey(storageKey);

  return key ? signedVideoGuideR2UrlFromObjectKey(key) : null;
}

function signedVideoGuideR2UrlFromObjectKey(objectKey: string) {
  const key = normalizedR2ObjectKey(objectKey);

  if (!key) {
    return null;
  }

  const config = optionalVideoGuideR2Config();

  if (!config) {
    return null;
  }

  const endpoint = config.endpoint.replace(/\/+$/, "");
  const url = config.pathStyle
    ? `${endpoint}/${config.bucket}/${key}`
    : `${endpoint.replace("://", `://${config.bucket}.`)}/${key}`;

  return presignS3GetUrl({
    accessKeyId: config.accessKeyId,
    expiresSeconds: 7200,
    region: config.region,
    secretAccessKey: config.secretAccessKey,
    url
  });
}

function normalizedR2ObjectKey(storageKey: string) {
  const normalizedKey = storageKey.trim().replace(/^\/+/, "");

  if (!normalizedKey || !normalizedKey.includes("/")) {
    return null;
  }

  return normalizedKey;
}

function videoGuideR2PublicBaseUrl() {
  return (process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || "").trim();
}

function videoGuideR2MediaPrefix() {
  const prefixInput = (process.env.VIDEO_GUIDE_R2_MEDIA_PREFIX ?? "video-guide/media/").replace(/^\/+/, "");

  return prefixInput && !prefixInput.endsWith("/") ? `${prefixInput}/` : prefixInput;
}

function videoGuideNarrationR2Prefix() {
  const prefixInput = (process.env.VIDEO_GUIDE_R2_NARRATION_PREFIX ?? "video-guide/narration/").replace(/^\/+/, "");

  return prefixInput && !prefixInput.endsWith("/") ? `${prefixInput}/` : prefixInput;
}

function videoGuideAsrR2Prefix() {
  const prefixInput = (process.env.VIDEO_GUIDE_R2_ASR_PREFIX ?? "video-guide/asr-temp/").replace(/^\/+/, "");

  return prefixInput && !prefixInput.endsWith("/") ? `${prefixInput}/` : prefixInput;
}

async function assertVideoGuideAsrUrlReadable(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "audio/*,application/octet-stream;q=0.8,*/*;q=0.5",
        Range: "bytes=0-0",
        "User-Agent": "XueleAI-ASR-Preflight/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new AppException(
        50004,
        `字幕识别临时文件校验失败（HTTP ${response.status}）`,
        HttpStatus.BAD_GATEWAY
      );
    }

    await response.body?.cancel().catch(() => undefined);
  } catch (error) {
    if (error instanceof AppException) {
      throw error;
    }

    throw new AppException(50004, "字幕识别临时文件无法访问", HttpStatus.BAD_GATEWAY);
  } finally {
    clearTimeout(timeout);
  }
}

function subtitleRecognitionPollIntervalMs() {
  const configured = Number(process.env.VIDEO_GUIDE_ASR_POLL_INTERVAL_MS ?? 10_000);

  return Number.isFinite(configured) && configured >= 2_000
    ? Math.min(Math.round(configured), 30_000)
    : 10_000;
}

function subtitleRecognitionRetryDelayMs(failures: number) {
  return Math.min(30_000, 2_000 * 2 ** Math.min(4, Math.max(0, failures - 1)));
}

async function waitForVideoGuideSubtitlePoll(milliseconds: number) {
  await new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

function isAllowedSubtitleTextUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

  if (isLocalHost) {
    return process.env.NODE_ENV !== "production";
  }

  return (
    hostname === "cdn.xueleai.com" ||
    hostname === "xueleai.com" ||
    hostname.endsWith(".xueleai.com")
  );
}

function isLocalOnlyUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

function presignS3GetUrl(input: {
  accessKeyId: string;
  expiresSeconds: number;
  region: string;
  secretAccessKey: string;
  url: string;
}) {
  const parsedUrl = new URL(input.url);
  const amzDate = amzTimestamp(new Date());
  const date = amzDate.slice(0, 8);
  const credentialScope = `${date}/${input.region}/s3/aws4_request`;
  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": "host"
  };
  const canonicalQuery = canonicalS3QueryString(queryParams);
  const canonicalRequest = [
    "GET",
    encodeURI(parsedUrl.pathname),
    canonicalQuery,
    `host:${parsedUrl.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  parsedUrl.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;

  return parsedUrl.toString();
}

function canonicalS3QueryString(params: Record<string, string>) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(params[key])}`)
    .join("&");
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function requiredObjectStorageEnv(name: string, fallbackName: string) {
  const value = process.env[name]?.trim() || process.env[fallbackName]?.trim();

  if (!value) {
    throw new AppException(50001, `对象存储配置缺失：${name}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  return value;
}

function normalizeOriginalName(value: string) {
  return basename(value).trim() || "未命名文件";
}

function normalizeVideoGuideMediaUploadId(value: string | undefined) {
  if (value === undefined || !value.trim()) {
    return null;
  }

  const uploadId = value.trim();

  if (!/^[A-Za-z0-9_-]{8,80}$/.test(uploadId)) {
    throw new AppException(40001, "媒体上传批次标识无效", HttpStatus.BAD_REQUEST);
  }

  return uploadId;
}

function resolveUploadedMediaType(file: UploadedVideoGuideFileLike) {
  const normalizedMimeType = file.mimetype.trim().toLowerCase();
  const fromMimeType = allowedMediaMimeTypes.get(normalizedMimeType);

  if (fromMimeType) {
    return fromMimeType;
  }

  const extension = extname(file.originalname).toLowerCase();

  if ([".mp4", ".mov", ".webm", ".m4v", ".mkv"].includes(extension)) {
    return "VIDEO" as const;
  }

  if ([".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac"].includes(extension)) {
    return "AUDIO" as const;
  }

  return null;
}

function resolveSubtitleFormat(originalName: string, content?: Buffer | string) {
  const extension = extname(originalName).toLowerCase();

  if (extension === ".srt") {
    return "SRT" as const;
  }

  if (extension === ".ass") {
    return "ASS" as const;
  }

  return resolveSubtitleFormatFromContent(content);
}

function resolveSubtitleFormatFromContent(content: Buffer | string | undefined) {
  if (!content) {
    return null;
  }

  const sample = (Buffer.isBuffer(content) ? content.toString("utf8", 0, Math.min(content.length, 20_000)) : content.slice(0, 20_000)).trim();

  if (!sample) {
    return null;
  }

  if (sample.includes("[Script Info]") || /^\s*Dialogue:/m.test(sample)) {
    return "ASS" as const;
  }

  if (/(?:^|\n)\s*\d+\s*\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(sample)) {
    return "SRT" as const;
  }

  return null;
}

function normalizeGeneratedSrt(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().replace(/\n/g, "\r\n");
}

function extensionFor(originalName: string, mimeType: string) {
  const extension = extname(originalName).toLowerCase();

  if ([".mp4", ".mov", ".webm", ".m4v", ".mkv", ".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".srt", ".ass"].includes(extension)) {
    return extension;
  }

  const byMimeType: Record<string, string> = {
    "audio/aac": ".aac",
    "audio/flac": ".flac",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/x-flac": ".flac",
    "audio/x-wav": ".wav",
    "text/plain": ".srt",
    "text/x-ass": ".ass",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-matroska": ".mkv"
  };

  return byMimeType[mimeType.trim().toLowerCase()] ?? ".bin";
}

function mimeTypeFor(filename: string) {
  const extension = extname(filename).toLowerCase();
  const byExtension: Record<string, string> = {
    ".aac": "audio/aac",
    ".ass": "text/plain; charset=utf-8",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".m4v": "video/mp4",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
    ".srt": "text/plain; charset=utf-8",
    ".wav": "audio/wav",
    ".webm": "video/webm"
  };

  return byExtension[extension] ?? "application/octet-stream";
}

function amzTimestamp(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signS3Request(input: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  method: string;
  pathname: string;
  search: string;
  headers: Record<string, string>;
  payloadHash: string;
  amzDate: string;
}) {
  const date = input.amzDate.slice(0, 8);
  const signedHeaders = Object.keys(input.headers).sort().join(";");
  const canonicalHeaders = Object.keys(input.headers)
    .sort()
    .map((key) => `${key}:${input.headers[key]}`)
    .join("\n");
  const canonicalRequest = [
    input.method,
    encodeURI(input.pathname),
    input.search.replace(/^\?/, ""),
    `${canonicalHeaders}\n`,
    signedHeaders,
    input.payloadHash
  ].join("\n");
  const credentialScope = `${date}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

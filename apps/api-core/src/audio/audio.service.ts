import { reservePersonalCredits, settlePersonalCredits } from "../wallet/personal-credits.js";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { basename, extname, join, resolve } from "node:path";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { decryptSecret, encryptSecret, getPrismaClient, hashPassword, maskSecret, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { OrganizationsService } from "../organizations/organizations.service.js";
import { LearnerActivityService } from "../profiles/learner-activity.service.js";
import { resolveHistoryProfileWhere } from "../profiles/history-profile-filter.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import {
  type AiModelPricingMode,
  type AiModelPricingUnit,
  normalizeModelPricingConfig,
  normalizePricingMode,
  normalizePricingUnit,
  pricingConfigToJson,
  pricingSummaryFromConfig
} from "../ai/model-pricing.js";
import { getClientIp, getUserAgent, type HeaderRequestLike } from "../security/request-types.js";
import { cosyVoiceSystemVoices, type CosyVoiceSystemVoice } from "./cosyvoice-system-voices.js";
import { minimaxSystemVoices, type MinimaxSystemVoice } from "./minimax-system-voices.js";
import { qwenAudioTtsSystemVoices } from "./qwen-audio-system-voices.js";
import { confirmedQwenAudioCredits, estimateQwenAudioTokenUsage, extractQwenAudioTokenUsage, qwenAudioTokenCost } from "./qwen-audio-pricing.js";
import { dialogueFingerprint, stripDialogueAudioCache, type PreparedDialogueTts } from "./audio-dialogue.types.js";
import { DialogueAudioError, deleteDialogueClip, persistDialogueClip, type PersistedDialogueAudio } from "./dialogue-audio.js";
import {
  VideoGuideNarrationStorageError,
  audioAssetDataFromTtsPayload,
  deletePersistedVideoGuideNarrationAudio,
  persistVideoGuideNarrationAudio,
  persistedVideoGuideAudioFromPayload,
  sanitizePersistedTtsPayload,
  videoGuideNarrationObjectKey,
  verifyPersistedVideoGuideNarrationAudio,
  type PersistedVideoGuideNarrationAudio,
  type VideoGuideNarrationPersistenceRequest,
  type VideoGuideNarrationPersistenceStage
} from "./video-guide-narration-storage.js";
import {
  CreateAdminPlatformVoiceDesignDto,
  CreateAudioAssetDto,
  CreatePlatformVoiceAssetDto,
  DeleteVoiceAssetAdminDto,
  CreateTtsAudioTaskDto,
  CreateVoiceCloneTaskDto,
  CreateVoiceDesignTaskDto,
  ReviewVoiceAssetDto,
  SetDefaultVoiceDto,
  UpdateAdminVoiceAssetDto,
  UpdateAudioModelDto,
  UpdateSystemVoiceDto,
  UpdateVoiceAssetDto
} from "./dto/audio.dto.js";

type AudioTaskStatus =
  | "CREATED"
  | "RESERVED"
  | "UPLOADING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "COMPENSATED";

type AudioTaskType = "TTS" | "VOICE_CLONE" | "VOICE_DESIGN";
type AudioModelCapability = "ASR" | "TTS" | "VOICE_CLONE" | "VOICE_DESIGN";
interface AdminAudioTaskListFilters {
  user?: string;
  status?: string;
  type?: string;
  provider?: string;
  model?: string;
  startTime?: string;
  endTime?: string;
  page?: string;
  pageSize?: string;
}
type AudioBillingMode = "PER_CHARACTER" | "PER_TASK" | "PER_SECOND";
type CreditReservationStatus = "RESERVED" | "SETTLED" | "RELEASED" | "EXPIRED" | "FAILED";
type VoiceConsentType = "SELF_VOICE" | "AUTHORIZED_VOICE";
type VoiceAssetModerationAction = "APPROVE" | "REJECT" | "DISABLE";
type BillingContext = "PERSONAL" | "ORGANIZATION";

interface BillingContextOptions {
  billingContext: BillingContext;
  organizationId?: string;
}

interface ElevenLabsDefaultVoice {
  providerVoiceId: string;
  name: string;
  description: string | null;
  previewAudioUrl: string | null;
  language: string | null;
}

interface ActiveAudioModel {
  modelInstanceId: string;
  providerInstanceId: string;
  providerKey: string;
  providerName: string;
  providerDisplayName: string;
  adapterType: string;
  modelName: string;
  baseUrl: string;
  webSocketUrl: string | null;
  region: string | null;
  apiKeyEncrypted: string | null;
  apiKeyEnvName: string;
  capabilityTags: string[];
  inputPrice: number;
  outputPrice: number;
  pricingMode: AiModelPricingMode;
  pricingUnit: AiModelPricingUnit;
  pricingConfig: Prisma.JsonValue | null;
}

interface AudioTaskRecord {
  audioDialogueGenerationId?: string | null;
  dialogueBillingGeneration?: { id: string } | null;
  id: string;
  _count: {
    englishGuidedStudyMaterials: number;
  };
  userId: string;
  learnerId: string | null;
  scenarioId: string | null;
  billingContext: BillingContext;
  organizationId: string | null;
  organizationMemberId: string | null;
  type: AudioTaskType;
  status: AudioTaskStatus;
  provider: string;
  model: string;
  providerInstanceId: string | null;
  modelInstanceId: string | null;
  voiceAssetId: string | null;
  inputText: string | null;
  inputTextLength: number;
  sourceAudioAssetId: string | null;
  outputAudioAssetId: string | null;
  estimatedCredits: number;
  actualCredits: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  requestId: string | null;
  providerPayload: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  user?: {
    id: string;
    email: string;
    nickname: string;
  };
  voiceAsset?: {
    id: string;
    name: string;
    providerVoiceId: string | null;
    targetModel: string;
    status: string;
    visibility: string;
    consent?: VoiceConsentRecord | null;
  } | null;
  sourceAudioAsset?: AudioAssetRecord | null;
  outputAudioAsset?: AudioAssetRecord | null;
  reservation?: {
    id: string;
    amount: number;
    status: CreditReservationStatus;
    expiresAt: Date;
  } | null;
  ledgerEntries?: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    relatedTaskId: string | null;
    relatedAudioTaskId: string | null;
    relatedTaskType: string | null;
    operationType: AudioTaskType | null;
    note: string | null;
    createdAt: Date;
  }>;
  usageLogs?: Array<{
    id: string;
    taskId: string;
    userId: string;
    provider: string;
    model: string;
    providerInstanceId: string | null;
    modelInstanceId: string | null;
    voiceAssetId: string | null;
    operationType: AudioTaskType;
    characterCount: number;
    audioDurationMs: number | null;
    usageCount: number;
    latencyMs: number | null;
    success: boolean;
    estimatedCost: DecimalLike;
    consumedCredits: number;
    providerRequestId: string | null;
    createdAt: Date;
  }>;
}

interface AudioPricingQuote {
  ruleId: string;
  pricingSource: "RULE" | "MODEL";
  billingMode: AudioBillingMode;
  creditsPerUnit: number;
  minimumCredits: number;
  modelMultiplier: number;
  pricingMode?: AiModelPricingMode;
  pricingUnit?: AiModelPricingUnit;
  pricePerUnit?: number;
  inputPrice?: number;
  outputPrice?: number;
  unitSize?: number;
  creditsPerCny?: number;
  estimatedCost?: number;
  usageCount: number;
  estimatedCredits: number;
}

type DecimalLike = { toString(): string } | string | number;
type ActiveAudioModelRecord = Prisma.AiModelInstanceGetPayload<{ include: ReturnType<typeof activeAudioModelInclude> }>;
type AdminAudioModelRecord = Prisma.AiModelInstanceGetPayload<{ include: ReturnType<typeof adminAudioModelInclude> }>;
type AdminVoiceAssetRecord = Prisma.VoiceAssetGetPayload<{ include: ReturnType<typeof adminVoiceAssetInclude> }>;
type SystemVoiceStatus = "READY" | "DISABLED";

interface SystemVoiceOverride {
  name?: string;
  description?: string;
  trait?: string;
  scene?: string;
  language?: string;
  accent?: string | null;
  gender?: "男声" | "女声";
  ageCategory?: "儿童" | "青年" | "中年" | "老年" | null;
  status?: SystemVoiceStatus;
  disabledReason?: string | null;
  updatedAt?: string;
}

interface AdminVoiceFilters {
  keyword?: string;
  status?: string;
  language?: string;
  accent?: string;
  model?: string;
}

interface VoiceConsentRecord {
  id: string;
  userId: string;
  voiceAssetId: string | null;
  sourceAudioAssetId: string | null;
  statement: string;
  consentText: string;
  consentType: VoiceConsentType;
  ownerName: string | null;
  ownerContact: string | null;
  agreedAt: Date;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

interface AudioAssetRecord {
  id: string;
  userId: string;
  type: string;
  storageProvider: string;
  url: string;
  objectKey: string;
  mimeType: string;
  durationMs: number | null;
  sizeBytes: number;
  sampleRate: number | null;
  channels: number | null;
  createdAt: Date;
}

export interface UploadedAudioFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ExternalBillingTtsTaskInput {
  format?: string;
  modelAlias?: string;
  pitch?: number;
  sampleRate?: number;
  source?: "TOOL" | "EXPERIENCE" | "VIDEO_GUIDE";
  speed?: number;
  text: string;
  voice?: string;
  voiceAssetId?: string;
  volume?: number;
  videoGuidePersistence?: Omit<VideoGuideNarrationPersistenceRequest, "audioTaskId">;
  onPersistenceStatus?: (event: {
    stage: VideoGuideNarrationPersistenceStage;
    audioTaskId: string;
  }) => Promise<void>;
}

export interface AudioTaskAttributionContext {
  userId: string;
  learnerId: string | null;
  rootScenarioId?: string | null;
}

function snapshotAudioAttribution(input: AudioTaskAttributionContext): Required<AudioTaskAttributionContext> {
  return {
    userId: input.userId,
    learnerId: input.learnerId,
    rootScenarioId: input.rootScenarioId ?? null
  };
}

function profileSubjectFromAttribution(input: AudioTaskAttributionContext): ProfileSubject {
  const { userId, learnerId } = snapshotAudioAttribution(input);
  return learnerId
    ? { userId, mode: "LEARNER", learnerId }
    : { userId, mode: "ACCOUNT", learnerId: null };
}

function audioTaskSubjectWhere(subject: ProfileSubject) {
  return subject.mode === "LEARNER"
    ? { userId: subject.userId, learnerId: subject.learnerId }
    : { userId: subject.userId };
}

const allowedAudioMimeTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "video/mp4"
]);

const systemVoices: readonly (CosyVoiceSystemVoice | MinimaxSystemVoice)[] = [
  ...cosyVoiceSystemVoices,
  ...qwenAudioTtsSystemVoices,
  ...minimaxSystemVoices,
  {
    id: "sys-abeiai-indextts-default",
    providerVoiceId: "default",
    name: "阿贝智能默认音色",
    type: "SYSTEM",
    targetModel: "IndexTTS-2.5",
    supportedModels: ["IndexTTS-2.5"],
    sourceModels: ["IndexTTS-2.5"],
    status: "READY",
    visibility: "PUBLIC",
    language: "普通话",
    languages: ["普通话"],
    description: "IndexTTS 默认音色",
    trait: "自然",
    scene: "通用",
    age: "青年",
    ageCategory: null,
    avatarUrl: null,
    ssmlSupported: false,
    instructSupported: false,
    timestampSupported: false,
    previewAudioUrl: ""
  }
];
const systemVoiceOverrideConfigKey = "cosyVoiceSystemVoiceOverrides";

const audioModelAliases = [
  "speech-to-text",
  "tts-default",
  "tts-fast",
  "voice-clone-default",
  "voice-design-default",
  "audio-preview"
] as const;
const dashscopeAudioProviderKey = "aliyun_dashscope_audio";
const minimaxAudioProviderKey = "minimax_audio";
const elevenLabsAudioProviderKey = "elevenlabs_audio";
const abeiaiAudioProviderKey = "abeiai_audio";
const audioAdapterTypes = ["DASHSCOPE_AUDIO", "MINIMAX_AUDIO", "ELEVENLABS_AUDIO"] as const;

@Injectable()
export class AudioService {
  private readonly prisma = getPrismaClient();

  constructor(
    @Inject(OrganizationsService) private readonly organizationsService?: OrganizationsService,
    @Inject(LearnerActivityService) private readonly learnerActivityService?: LearnerActivityService
  ) {}

  private async ensureDashScopeAudioDefaults() {
    await this.ensureAudioProviderDefaults(dashscopeAudioProviderKey);
    await this.ensureAudioProviderDefaults(minimaxAudioProviderKey);
    await this.ensureAudioProviderDefaults(elevenLabsAudioProviderKey);
  }

  private async ensureAudioProviderDefaults(providerKey: string) {
    const preset = await this.prisma.aiProviderPreset.findUnique({
      where: {
        providerKey
      },
      include: {
        instances: {
          take: 1,
          orderBy: {
            createdAt: "asc"
          }
        },
        modelPresets: {
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    if (!preset) {
      return;
    }

    const instance =
      preset.instances[0] ??
      (await this.prisma.aiProviderInstance.create({
        data: {
          providerPresetId: preset.id,
          name: preset.displayName,
          baseUrl: preset.defaultBaseUrl,
          webSocketUrl: preset.defaultWebSocketUrl,
          region: preset.region?.split(",")[0] ?? null,
          status: "DISABLED"
        }
      }));
    await this.normalizeDefaultAudioModelPricing(instance.id, preset.modelPresets);

    for (const modelPreset of preset.modelPresets) {
      const recommendedAlias = emptyToNull(modelPreset.recommendedAlias ?? undefined);
      const capabilityTags = jsonStringArray(modelPreset.capabilityTags);
      const defaultPricing = defaultAudioModelPricing(capabilityTags);
      const existingModel = await this.prisma.aiModelInstance.findUnique({
        where: {
          providerInstanceId_providerModelName: {
            providerInstanceId: instance.id,
            providerModelName: modelPreset.providerModelName
          }
        },
        select: {
          id: true,
          isEnabled: true
        }
      });

      if (existingModel) {
        if (recommendedAlias && isAudioModelAliasKey(recommendedAlias) && existingModel.isEnabled) {
          await this.bindRecommendedAudioAlias(recommendedAlias, existingModel.id);
        }
        continue;
      }

      const model = await this.prisma.aiModelInstance.upsert({
        where: {
          providerInstanceId_providerModelName: {
            providerInstanceId: instance.id,
            providerModelName: modelPreset.providerModelName
          }
        },
        update: {
          displayName: modelPreset.displayName,
          capabilityTags: capabilityTags as Prisma.InputJsonValue,
          modelPresetId: modelPreset.id
        },
        create: {
          providerInstanceId: instance.id,
          modelPresetId: modelPreset.id,
          displayName: modelPreset.displayName,
          providerModelName: modelPreset.providerModelName,
          baseUrl: instance.baseUrl,
          webSocketUrl: instance.webSocketUrl,
          region: instance.region,
          capabilityTags: capabilityTags as Prisma.InputJsonValue,
          ...defaultPricing,
          isEnabled: true
        }
      });

      if (recommendedAlias && isAudioModelAliasKey(recommendedAlias) && model.isEnabled) {
        await this.bindRecommendedAudioAlias(recommendedAlias, model.id);
      }
    }
  }

  private async normalizeDefaultAudioModelPricing(
    providerInstanceId: string,
    modelPresets: Array<{
      providerModelName: string;
      capabilityTags: Prisma.JsonValue | null;
    }>
  ) {
    const ttsModelNames = modelPresets
      .filter((modelPreset) => jsonStringArray(modelPreset.capabilityTags).includes("TTS"))
      .map((modelPreset) => modelPreset.providerModelName);

    if (ttsModelNames.length === 0) {
      return;
    }

    const staleModels = await this.prisma.aiModelInstance.findMany({
      where: {
        providerInstanceId,
        providerModelName: {
          in: ttsModelNames
        },
        inputPrice: 0
      }
    });

    await Promise.all(
      staleModels
        .filter((model) => Math.abs(model.updatedAt.getTime() - model.createdAt.getTime()) < 1000)
        .map((model) =>
          this.prisma.aiModelInstance.update({
            where: {
              id: model.id
            },
            data: {
              inputPrice: "1",
              outputPrice: "0",
              pricingMode: "CHARACTERS",
              pricingUnit: "TEN_K_CHARACTERS"
            }
          })
        )
    );
  }

  private async bindRecommendedAudioAlias(aliasKey: (typeof audioModelAliases)[number], modelInstanceId: string) {
    const alias = await this.prisma.aiModelAlias.findUnique({
      where: {
        aliasKey
      },
      include: {
        modelInstance: {
          include: activeAudioModelInclude()
        }
      }
    });

    if (alias?.modelInstanceId) {
      return;
    }

    await this.prisma.aiModelAlias.upsert({
      where: {
        aliasKey
      },
      update: {
        displayName: alias?.displayName ?? audioAliasName(aliasKey),
        description: alias?.description ?? null,
        modelInstanceId
      },
      create: {
        aliasKey,
        displayName: audioAliasName(aliasKey),
        modelInstanceId
      }
    });
  }

  private async systemVoiceModelHealth(supportedModels: readonly string[]) {
    await this.ensureDashScopeAudioDefaults();

    const models = await this.prisma.aiModelInstance.findMany({
      where: {
        providerModelName: {
          in: [...supportedModels]
        },
        providerInstance: {
          providerPreset: {
            adapterType: "DASHSCOPE_AUDIO",
            modality: "AUDIO"
          }
        }
      },
      include: {
        aliases: true,
        providerInstance: {
          include: {
            providerPreset: true
          }
        }
      },
      orderBy: [
        {
          isEnabled: "desc"
        },
        {
          updatedAt: "desc"
        }
      ]
    });

    return supportedModels.map((modelName) => {
      const candidates = models.filter((model) => model.providerModelName === modelName);
      const available = candidates.find((model) => model.isEnabled && model.providerInstance.status === "ENABLED");
      const enabled = candidates.find((model) => model.isEnabled);
      const selected = available ?? enabled ?? candidates[0] ?? null;
      const aliases = candidates.flatMap((model) =>
        model.aliases
          .filter((alias) => isAudioModelAliasKey(alias.aliasKey))
          .map((alias) => ({
            aliasKey: alias.aliasKey,
            displayName: alias.displayName
          }))
      );

      return {
        modelName,
        isAvailable: Boolean(available),
        isEnabled: Boolean(selected?.isEnabled),
        providerStatus: selected?.providerInstance.status ?? null,
        providerName: selected?.providerInstance.name ?? null,
        statusName: available
          ? "可用"
          : candidates.length === 0
            ? "未创建模型实例"
            : selected?.isEnabled
              ? "Provider 未通过测试"
              : "模型未启用",
        aliases
      };
    });
  }

  async listModelOptions() {
    await this.ensureDashScopeAudioDefaults();
    const creditsPerCny = await this.getCreditsPerCny();

    const [aliases, configuredTtsModels] = await Promise.all([
      this.prisma.aiModelAlias.findMany({
        where: {
          aliasKey: {
            in: [...audioModelAliases]
          }
        },
        include: {
          modelInstance: {
            include: {
              providerInstance: {
                include: {
                  providerPreset: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      }),
      this.prisma.aiModelInstance.findMany({
        where: {
          isEnabled: true,
          providerInstance: {
            status: "ENABLED",
            providerPreset: {
              OR: [
                { adapterType: { in: [...audioAdapterTypes] }, modality: "AUDIO" },
                { providerKey: abeiaiAudioProviderKey }
              ]
            }
          }
        },
        include: {
          providerInstance: {
            include: {
              providerPreset: true
            }
          }
        },
        orderBy: {
          displayName: "asc"
        }
      })
    ]);
    const aliasMap = new Map(aliases.map((alias) => [alias.aliasKey, alias]));

    const aliasOptions = audioModelAliases.map((aliasKey) => {
      const alias = aliasMap.get(aliasKey);
      const model = alias?.modelInstance;
      const provider = model?.providerInstance;
      const preset = provider?.providerPreset;
      const isConfigured = Boolean(
        model?.isEnabled &&
          provider?.status === "ENABLED" &&
          isAudioProviderPreset(preset) &&
          preset.modality === "AUDIO"
      );

      return {
        aliasKey,
        displayName: alias?.displayName ?? audioAliasName(aliasKey),
        description: alias?.description ?? null,
        isConfigured,
        providerName: provider?.name ?? preset?.displayName ?? null,
        modelName: model?.providerModelName ?? null,
        capabilityTags: jsonStringArray(model?.capabilityTags),
        inputPrice: model?.inputPrice.toString() ?? "0",
        outputPrice: model?.outputPrice.toString() ?? "0",
        pricingMode: model ? normalizePricingMode(model.pricingMode) : "CHARACTERS",
        pricingUnit: model ? normalizePricingUnit(model.pricingUnit, model.pricingMode) : "TEN_K_CHARACTERS",
        pricingConfig: model?.pricingConfig ?? null,
        creditsPerCny,
        statusName: isConfigured ? "已配置" : "未配置"
      };
    });
    const aliasedModelIds = new Set(aliases.map((alias) => alias.modelInstanceId));
    const automaticTtsOptions = configuredTtsModels
      .filter((model) => jsonStringArray(model.capabilityTags).includes("TTS") && !aliasedModelIds.has(model.id))
      .map((model) => ({
        aliasKey: `tts-model:${model.id}`,
        displayName: model.displayName,
        description: "根据语音角色自动匹配",
        isConfigured: true,
        providerName: model.providerInstance.name ?? model.providerInstance.providerPreset.displayName,
        modelName: model.providerModelName,
        capabilityTags: jsonStringArray(model.capabilityTags),
        inputPrice: model.inputPrice.toString(),
        outputPrice: model.outputPrice.toString(),
        pricingMode: normalizePricingMode(model.pricingMode),
        pricingUnit: normalizePricingUnit(model.pricingUnit, model.pricingMode),
        pricingConfig: model.pricingConfig,
        creditsPerCny,
        statusName: "已配置"
      }));

    return [...aliasOptions, ...automaticTtsOptions];
  }

  async listAdminAudioModels() {
    await this.ensureDashScopeAudioDefaults();

    const models = await this.prisma.aiModelInstance.findMany({
      where: {
        providerInstance: {
          providerPreset: {
            OR: [
              { adapterType: { in: [...audioAdapterTypes] }, modality: "AUDIO" },
              { providerKey: abeiaiAudioProviderKey }
            ]
          }
        }
      },
      include: adminAudioModelInclude(),
      orderBy: [
        {
          providerInstance: {
            name: "asc"
          }
        },
        {
          displayName: "asc"
        }
      ]
    });

    return models.map((model) => this.toAdminAudioModel(model));
  }

  async updateAdminAudioModel(id: string, dto: UpdateAudioModelDto) {
    const existing = await this.prisma.aiModelInstance.findUnique({
      where: {
        id
      },
      include: adminAudioModelInclude()
    });

    if (!existing) {
      throw new AppException(40401, "语音模型不存在", HttpStatus.NOT_FOUND);
    }

    if (!isAudioProviderPreset(existing.providerInstance.providerPreset)) {
      throw new AppException(40001, "该模型不是语音模型", HttpStatus.BAD_REQUEST);
    }

    const pricingConfig =
      dto.pricingConfig === undefined ? undefined : normalizeModelPricingConfig(dto.pricingConfig);
    const pricingSummary =
      pricingConfig === undefined
        ? null
        : pricingSummaryFromConfig(pricingConfig, {
            inputPrice: dto.inputPrice === undefined ? existing.inputPrice.toString() : String(dto.inputPrice),
            outputPrice: dto.outputPrice === undefined ? existing.outputPrice.toString() : String(dto.outputPrice),
            pricingMode: dto.pricingMode === undefined ? normalizePricingMode(existing.pricingMode) : normalizePricingMode(dto.pricingMode),
            pricingUnit:
              dto.pricingUnit === undefined
                ? normalizePricingUnit(existing.pricingUnit, dto.pricingMode ?? existing.pricingMode)
                : normalizePricingUnit(dto.pricingUnit, dto.pricingMode ?? existing.pricingMode)
          });
    const normalizedCapabilityTags =
      dto.capabilityTags === undefined ? jsonStringArray(existing.capabilityTags) : normalizeCapabilityTags(dto.capabilityTags);
    const nextCapabilityTags =
      dto.capabilityTags === undefined ? undefined : (normalizedCapabilityTags as Prisma.InputJsonValue);
    const modelApiKey = dto.apiKey?.trim();
    const modelApiKeyData = modelApiKey
      ? {
          apiKeyEncrypted: encryptSecret(modelApiKey),
          apiKeyPreview: maskSecret(modelApiKey)
        }
      : dto.clearApiKey
        ? {
            apiKeyEncrypted: null,
            apiKeyPreview: null
          }
        : {};

    await this.prisma.aiModelInstance.update({
      where: {
        id
      },
      data: {
        displayName: dto.displayName === undefined ? undefined : emptyToNull(dto.displayName) ?? existing.displayName,
        providerModelName: dto.modelName === undefined ? undefined : emptyToNull(dto.modelName) ?? existing.providerModelName,
        baseUrl: normalizeOptionalBaseUrl(dto.baseUrl),
        webSocketUrl: dto.webSocketUrl === undefined ? undefined : emptyToNull(dto.webSocketUrl),
        region: dto.region === undefined ? undefined : emptyToNull(dto.region),
        ...modelApiKeyData,
        capabilityTags: nextCapabilityTags,
        inputPrice: pricingSummary ? pricingSummary.inputPrice : dto.inputPrice === undefined ? undefined : String(dto.inputPrice),
        outputPrice: pricingSummary ? pricingSummary.outputPrice : dto.outputPrice === undefined ? undefined : String(dto.outputPrice),
        pricingMode: pricingSummary
          ? pricingSummary.pricingMode
          : dto.pricingMode === undefined
            ? undefined
            : normalizePricingMode(dto.pricingMode),
        pricingUnit: pricingSummary
          ? pricingSummary.pricingUnit
          : dto.pricingUnit === undefined
            ? undefined
            : normalizePricingUnit(dto.pricingUnit, dto.pricingMode ?? existing.pricingMode),
        pricingConfig: pricingConfig === undefined ? undefined : pricingConfigToJson(pricingConfig),
        isEnabled: dto.isEnabled
      }
    });

    const aliasKey = emptyToNull(dto.aliasKey);
    if (aliasKey) {
      if (!isAudioModelAliasKey(aliasKey)) {
        throw new AppException(40001, "不支持的语音模型用途别名", HttpStatus.BAD_REQUEST);
      }

      const requiredCapability = audioAliasRequiredCapability(aliasKey);

      if (requiredCapability && !normalizedCapabilityTags.includes(requiredCapability)) {
        throw new AppException(40001, "该模型不支持所选用途别名", HttpStatus.BAD_REQUEST);
      }

      await this.prisma.aiModelAlias.upsert({
        where: {
          aliasKey
        },
        update: {
          displayName: emptyToNull(dto.aliasDisplayName) ?? audioAliasName(aliasKey),
          description: emptyToNull(dto.aliasDescription),
          modelInstanceId: id
        },
        create: {
          aliasKey,
          displayName: emptyToNull(dto.aliasDisplayName) ?? audioAliasName(aliasKey),
          description: emptyToNull(dto.aliasDescription),
          modelInstanceId: id
        }
      });
    }

    const [updated] = await Promise.all([
      this.prisma.aiModelInstance.findUnique({
        where: {
          id
        },
        include: adminAudioModelInclude()
      })
    ]);

    if (!updated) {
      throw new AppException(40401, "语音模型不存在", HttpStatus.NOT_FOUND);
    }

    return this.toAdminAudioModel(updated);
  }

  async checkAdminAudioModelDelete(modelInstanceId: string) {
    const model = await this.prisma.aiModelInstance.findUnique({
      where: {
        id: modelInstanceId
      },
      include: adminAudioModelInclude()
    });

    if (!model) {
      throw new AppException(40401, "语音模型不存在", HttpStatus.NOT_FOUND);
    }

    if (!isAudioProviderPreset(model.providerInstance.providerPreset)) {
      throw new AppException(40001, "该模型不是语音模型", HttpStatus.BAD_REQUEST);
    }

    const aliasKeys = model.aliases.filter((alias) => isAudioModelAliasKey(alias.aliasKey)).map((alias) => alias.aliasKey);
    const scenarioBindings = aliasKeys.length
      ? await this.prisma.aiScenarioModelBinding.findMany({
          where: {
            OR: [
              {
                defaultModelAlias: {
                  in: aliasKeys
                }
              },
              {
                fallbackModelAlias: {
                  in: aliasKeys
                }
              }
            ]
          },
          include: {
            scenario: {
              select: {
                name: true,
                slug: true,
                isEnabled: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        })
      : [];
    const boundScenarios = scenarioBindings.map((binding) => ({
      name: binding.scenario.name,
      slug: binding.scenario.slug,
      isEnabled: binding.scenario.isEnabled,
      aliasKey:
        binding.defaultModelAlias && aliasKeys.includes(binding.defaultModelAlias)
          ? binding.defaultModelAlias
          : binding.fallbackModelAlias
    }));

    return {
      modelInstanceId,
      canDelete: boundScenarios.length === 0,
      aliasKeys,
      boundScenarios,
      message:
        boundScenarios.length > 0
          ? `该语音模型仍被 ${boundScenarios.length} 个 AI 场景使用，请先解除模型别名绑定后再删除。`
          : "该语音模型未被 AI 场景使用，可以删除。"
    };
  }

  async deleteAdminAudioModel(modelInstanceId: string) {
    const check = await this.checkAdminAudioModelDelete(modelInstanceId);

    if (!check.canDelete) {
      throw new AppException(40001, check.message, HttpStatus.BAD_REQUEST);
    }

    await this.prisma.$transaction([
      this.prisma.aiModelAlias.updateMany({
        where: {
          modelInstanceId
        },
        data: {
          modelInstanceId: null
        }
      }),
      this.prisma.aiModelInstance.delete({
        where: {
          id: modelInstanceId
        }
      })
    ]);

    return {
      deleted: true,
      modelInstanceId
    };
  }

  async getUsageDashboard(filters: {
    from?: string;
    to?: string;
    operationType?: string;
    model?: string;
  }) {
    const range = normalizeAudioDateRange(filters, 7);
    const where: Prisma.AudioUsageLogWhereInput = {
      createdAt: {
        gte: range.startAt,
        lt: range.endAt
      }
    };

    if (isAudioTaskType(filters.operationType)) {
      where.operationType = filters.operationType;
    }

    if (filters.model?.trim()) {
      where.model = filters.model.trim();
    }

    const [logs, optionRows] = await Promise.all([
      this.prisma.audioUsageLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              nickname: true
            }
          },
          voiceAsset: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true
            }
          },
          task: {
            select: {
              id: true,
              status: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      this.prisma.audioUsageLog.findMany({
        where: {
          createdAt: {
            gte: range.startAt,
            lt: range.endAt
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      })
    ]);
    const todayKey = audioDateKeyInShanghai(new Date());

    return {
      filters: {
        from: range.from,
        to: range.to,
        operationType: isAudioTaskType(filters.operationType) ? filters.operationType : "",
        model: filters.model?.trim() ?? ""
      },
      total: summarizeAudioUsage(logs),
      today: summarizeAudioUsage(logs.filter((log) => audioDateKeyInShanghai(log.createdAt) === todayKey)),
      trend: range.keys.map((date) => ({
        date,
        ...summarizeAudioUsage(logs.filter((log) => audioDateKeyInShanghai(log.createdAt) === date))
      })),
      byOperation: groupAudioUsage(logs, (log) => log.operationType, (key) => audioTaskTypeName(key)),
      byModel: groupAudioUsage(logs, (log) => log.model, (key) => key),
      byUser: groupAudioUsage(logs, (log) => log.userId, (key, rows) => rows[0]?.user?.nickname ?? rows[0]?.user?.email ?? key),
      byVoice: groupAudioUsage(logs, (log) => log.voiceAssetId ?? "system", (key, rows) => rows[0]?.voiceAsset?.name ?? (key === "system" ? "系统音色" : "未知音色")),
      byStatus: groupAudioUsage(logs, (log) => log.task.status, (key) => audioTaskStatusName(key)),
      recentLogs: logs.slice(0, 50).map((log) => ({
        id: log.id,
        taskId: log.taskId,
        userId: log.userId,
        user: log.user,
        provider: log.provider,
        model: log.model,
        operationType: log.operationType,
        operationTypeName: audioTaskTypeName(log.operationType),
        voiceAssetId: log.voiceAssetId,
        voiceName: log.voiceAsset?.name ?? "系统音色",
        taskStatus: log.task.status,
        taskStatusName: audioTaskStatusName(log.task.status),
        characterCount: log.characterCount,
        audioDurationMs: log.audioDurationMs,
        usageCount: log.usageCount,
        latencyMs: log.latencyMs,
        success: log.success,
        estimatedCost: decimalNumber(log.estimatedCost),
        consumedCredits: log.consumedCredits,
        providerRequestId: log.providerRequestId,
        createdAt: log.createdAt
      })),
      operationTypes: [
        {
          id: "TTS",
          name: audioTaskTypeName("TTS")
        },
        {
          id: "VOICE_DESIGN",
          name: audioTaskTypeName("VOICE_DESIGN")
        },
        {
          id: "VOICE_CLONE",
          name: audioTaskTypeName("VOICE_CLONE")
        }
      ],
      models: Array.from(new Set(optionRows.map((row) => row.model))).map((model) => ({
        id: model,
        name: model
      })),
      updatedAt: new Date()
    };
  }

  async listVoiceAssets(userId: string) {
    const [voices, preference, platformVoices, systemVoiceItems] = await Promise.all([
      this.prisma.voiceAsset.findMany({
        where: {
          userId,
          isPlatform: false,
          status: {
            not: "DELETED"
          }
        },
        include: {
          sourceAudioAsset: true,
          previewAudioAsset: true,
          consent: true,
          targetConsent: true
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      this.prisma.userAudioPreference.findUnique({
        where: {
          userId
        }
      }),
      this.prisma.voiceAsset.findMany({
        where: {
          isPlatform: true,
          status: "READY",
          providerVoiceId: {
            not: null
          }
        },
        include: {
          sourceAudioAsset: true,
          previewAudioAsset: true,
          consent: true,
          targetConsent: true
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      this.listSystemVoiceItems()
    ]);

    return {
      systemVoices: systemVoiceItems.filter((voice) => voice.status === "READY").map((voice) => ({
        ...voice,
        typeName: voiceTypeName(voice.type),
        statusName: voiceStatusName(voice.status),
        isDefault: preference?.defaultSystemVoiceId === voice.providerVoiceId
      })),
      platformVoices: platformVoices.map((voice) => ({
        ...this.toVoiceAsset(voice),
        isDefault: preference?.defaultVoiceAssetId === voice.id
      })),
      customVoices: voices.map((voice) => ({
        ...this.toVoiceAsset(voice),
        isDefault: preference?.defaultVoiceAssetId === voice.id
      })),
      defaultVoice: {
        voiceAssetId: preference?.defaultVoiceAssetId ?? null,
        systemVoiceId: preference?.defaultSystemVoiceId ?? null
      }
    };
  }

  async listLearnerVoiceAssets(userId: string) {
    const safeSelect = {
      id: true,
      providerVoiceId: true,
      name: true,
      type: true,
      targetModel: true,
      status: true,
      language: true,
      accent: true,
      gender: true,
      ageCategory: true,
      avatarUrl: true,
      description: true,
      previewAudioUrl: true,
      isPlatform: true
    } as const;
    const [customVoices, preference, platformVoices, systemVoiceItems] = await Promise.all([
      this.prisma.voiceAsset.findMany({
        where: { userId, isPlatform: false, status: "READY", providerVoiceId: { not: null } },
        select: safeSelect,
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      this.prisma.userAudioPreference.findUnique({ where: { userId } }),
      this.prisma.voiceAsset.findMany({
        where: {
          isPlatform: true,
          visibility: "PUBLIC",
          status: "READY",
          providerVoiceId: { not: null }
        },
        select: safeSelect,
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      this.listSystemVoiceItems()
    ]);
    const readyCustomVoices = customVoices.filter((voice) => voice.status === "READY" && voice.providerVoiceId);
    const readyPlatformVoices = platformVoices.filter((voice) => voice.status === "READY" && voice.providerVoiceId);
    const readySystemVoices = systemVoiceItems.filter((voice) => voice.status === "READY");
    const readyVoiceAssetIds = new Set<string>([...readyCustomVoices, ...readyPlatformVoices].map((voice) => voice.id));
    const readySystemVoiceIds = new Set<string>(readySystemVoices.map((voice) => voice.providerVoiceId));

    return {
      systemVoices: readySystemVoices
        .map((voice) => ({
          id: voice.id,
          providerVoiceId: voice.providerVoiceId,
          name: voice.name,
          type: voice.type,
          typeName: voiceTypeName(voice.type),
          targetModel: voice.targetModel,
          supportedModels: voice.supportedModels,
          status: voice.status,
          statusName: voiceStatusName(voice.status),
          language: voice.language,
          languages: voice.languages,
          accent: voice.accent,
          gender: voice.gender,
          description: voice.description,
          trait: voice.trait,
          scene: voice.scene,
          age: voice.age,
          ageCategory: voice.ageCategory,
          avatarUrl: voice.avatarUrl,
          ssmlSupported: voice.ssmlSupported,
          instructSupported: voice.instructSupported,
          timestampSupported: voice.timestampSupported,
          previewAudioUrl: voice.previewAudioUrl,
          isDefault: preference?.defaultSystemVoiceId === voice.providerVoiceId
        })),
      platformVoices: readyPlatformVoices
        .map((voice) => ({ ...this.toLearnerVoiceAsset(voice), isDefault: preference?.defaultVoiceAssetId === voice.id })),
      customVoices: readyCustomVoices
        .map((voice) => ({ ...this.toLearnerVoiceAsset(voice), isDefault: preference?.defaultVoiceAssetId === voice.id })),
      defaultVoice: {
        voiceAssetId: preference?.defaultVoiceAssetId && readyVoiceAssetIds.has(preference.defaultVoiceAssetId)
          ? preference.defaultVoiceAssetId
          : null,
        systemVoiceId: preference?.defaultSystemVoiceId && readySystemVoiceIds.has(preference.defaultSystemVoiceId)
          ? preference.defaultSystemVoiceId
          : null
      }
    };
  }

  toLearnerAudioAsset(asset: AudioAssetRecord, learnerSampleProof: string) {
    return {
      id: asset.id,
      type: asset.type,
      mimeType: asset.mimeType,
      durationMs: asset.durationMs,
      sizeBytes: asset.sizeBytes,
      sampleRate: asset.sampleRate,
      channels: asset.channels,
      createdAt: asset.createdAt,
      learnerSampleProof
    };
  }

  toLearnerVoiceAsset(asset: {
    id: string;
    providerVoiceId: string | null;
    name: string;
    type: string;
    targetModel: string;
    status: string;
    language: string | null;
    accent?: string | null;
    gender?: string | null;
    ageCategory?: string | null;
    avatarUrl?: string | null;
    description: string | null;
    previewAudioUrl: string | null;
    isPlatform?: boolean;
  }) {
    return {
      id: asset.id,
      providerVoiceId: asset.providerVoiceId,
      name: asset.name,
      type: asset.type,
      typeName: voiceTypeName(asset.type),
      targetModel: asset.targetModel,
      status: asset.status,
      statusName: voiceStatusName(asset.status),
      language: asset.language,
      accent: asset.accent ?? null,
      gender: asset.gender ?? null,
      ageCategory: asset.ageCategory ?? null,
      avatarUrl: asset.avatarUrl ?? null,
      description: asset.description,
      previewAudioUrl: asset.previewAudioUrl,
      isPlatform: asset.isPlatform ?? false
    };
  }

  toLearnerAudioTask(task: ReturnType<AudioService["toAudioTask"]>) {
    return {
      id: task.id,
      isVoiceExperience: task.isVoiceExperience,
      type: task.type,
      typeName: task.typeName,
      status: task.status,
      statusName: task.statusName,
      model: task.model,
      voiceAssetId: task.voiceAssetId,
      inputText: task.inputText,
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt,
      finishedAt: task.finishedAt,
      outputAudioAsset: task.outputAudioAsset
        ? {
            id: task.outputAudioAsset.id,
            url: task.outputAudioAsset.url,
            mimeType: task.outputAudioAsset.mimeType,
            durationMs: task.outputAudioAsset.durationMs,
            sizeBytes: task.outputAudioAsset.sizeBytes
          }
        : null
    };
  }

  async getSafetySettings() {
    return this.audioSafetySettings();
  }

  async listAdminVoiceAssets(filters: AdminVoiceFilters = {}) {
    const keyword = emptyToNull(filters.keyword)?.toLowerCase();
    const status = emptyToNull(filters.status)?.toUpperCase();
    const language = emptyToNull(filters.language);
    const normalizedLanguage = language ? normaliseVoiceLanguage(language) : null;
    const accentFilter = emptyToNull(filters.accent);
    const accent = accentFilter ? normaliseVoiceAccent(accentFilter) ?? accentFilter : null;
    const model = emptyToNull(filters.model);
    const voices = await this.prisma.voiceAsset.findMany({
      include: adminVoiceAssetInclude(),
      orderBy: {
        createdAt: "desc"
      }
    });

    return voices
      .map((voice) => this.toAdminVoiceAsset(voice))
      .filter((voice) => {
        if (status && voice.status !== status) {
          return false;
        }

        if (normalizedLanguage && (!voice.language || normaliseVoiceLanguage(voice.language) !== normalizedLanguage)) {
          return false;
        }

        if (accent && normaliseVoiceAccent(voice.accent ?? voice.language ?? "") !== accent) {
          return false;
        }

        if (model && voice.targetModel !== model) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        return [
          voice.name,
          voice.providerVoiceId ?? "",
          voice.description ?? "",
          voice.targetModel,
          voice.language ?? "",
          voice.accent ?? "",
          voice.user.nickname,
          voice.user.email
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }

  async syncElevenLabsDefaultVoices(adminUserId: string) {
    await this.ensureDashScopeAudioDefaults();
    const model = await this.findFallbackAudioModel("TTS", "tts-default", ["eleven_multilingual_v2"]);

    if (!model || model.providerKey !== elevenLabsAudioProviderKey) {
      throw new AppException(
        40001,
        "请先配置、启用并测试 ElevenLabs 语音 Provider",
        HttpStatus.BAD_REQUEST
      );
    }

    const payload = await this.callAudioGateway("/audio/providers/elevenlabs/voices/defaults", model, {
      model: model.modelName,
      timeoutMs: 45_000
    });

    if (stringValue(payload.provider) !== elevenLabsAudioProviderKey || !Array.isArray(payload.voices)) {
      throw new AudioProviderException(
        "ELEVENLABS_INVALID_VOICE_RESPONSE",
        "ElevenLabs 默认音色返回格式不正确"
      );
    }

    const normalized = payload.voices
      .map((voice) => normalizeElevenLabsDefaultVoice(voice))
      .filter((voice): voice is ElevenLabsDefaultVoice => Boolean(voice));
    const voicesById = new Map<string, ElevenLabsDefaultVoice>();
    let skipped = payload.voices.length - normalized.length;

    for (const voice of normalized) {
      if (voicesById.has(voice.providerVoiceId)) {
        skipped += 1;
      }
      voicesById.set(voice.providerVoiceId, voice);
    }

    const voices = [...voicesById.values()];
    const owner = await this.ensurePlatformVoiceOwnerUser();
    const reviewedAt = new Date();
    let created = 0;
    let updated = 0;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${"audio:elevenlabs-default-voices"}))`;
      const existingVoices = voices.length
        ? await transaction.voiceAsset.findMany({
            where: {
              provider: elevenLabsAudioProviderKey,
              isPlatform: true,
              providerVoiceId: {
                in: voices.map((voice) => voice.providerVoiceId)
              }
            },
            select: {
              id: true,
              providerVoiceId: true,
              status: true
            }
          })
        : [];
      const existingByVoiceId = new Map(
        existingVoices
          .filter((voice) => Boolean(voice.providerVoiceId))
          .map((voice) => [voice.providerVoiceId as string, voice])
      );

      for (const voice of voices) {
        const existing = existingByVoiceId.get(voice.providerVoiceId);

        if (existing?.status === "DELETED") {
          skipped += 1;
          continue;
        }

        const metadata = {
          providerInstanceId: model.providerInstanceId,
          name: voice.name,
          targetModel: "eleven_multilingual_v2",
          language: voice.language,
          description: voice.description,
          previewAudioUrl: voice.previewAudioUrl,
          reviewedByAdminId: adminUserId,
          reviewedAt,
          reviewNote: "ElevenLabs 官方默认音色同步"
        };

        if (existing) {
          await transaction.voiceAsset.update({
            where: {
              id: existing.id
            },
            data: metadata
          });
          updated += 1;
          continue;
        }

        await transaction.voiceAsset.create({
          data: {
            userId: owner.id,
            providerInstanceId: model.providerInstanceId,
            provider: elevenLabsAudioProviderKey,
            providerVoiceId: voice.providerVoiceId,
            name: voice.name,
            type: "SYSTEM",
            targetModel: "eleven_multilingual_v2",
            status: "READY",
            visibility: "PUBLIC",
            language: voice.language,
            description: voice.description,
            previewAudioUrl: voice.previewAudioUrl,
            isPlatform: true,
            reviewedByAdminId: adminUserId,
            reviewedAt,
            reviewNote: "ElevenLabs 官方默认音色同步"
          }
        });
        created += 1;
      }
    });

    return {
      total: voices.length,
      created,
      updated,
      skipped
    };
  }

  async createPlatformVoiceAsset(dto: CreatePlatformVoiceAssetDto, adminUserId: string) {
    const providerVoiceId = dto.providerVoiceId.trim();
    const name = dto.name.trim();

    if (!providerVoiceId || !name) {
      throw new AppException(40001, "请填写平台音色名称和 Provider voice_id", HttpStatus.BAD_REQUEST);
    }

    const model = await this.prisma.aiModelInstance.findUnique({
      where: {
        id: dto.modelInstanceId
      },
      include: {
        providerInstance: {
          include: {
            providerPreset: true
          }
        }
      }
    });

    if (!model) {
      throw new AppException(40401, "语音模型不存在", HttpStatus.NOT_FOUND);
    }

    const capabilityTags = jsonStringArray(model.capabilityTags);
    if (!capabilityTags.includes("TTS")) {
      throw new AppException(40001, "平台音色必须绑定支持语音合成的模型", HttpStatus.BAD_REQUEST);
    }

    const duplicated = await this.prisma.voiceAsset.findFirst({
      where: {
        isPlatform: true,
        providerVoiceId,
        targetModel: model.providerModelName,
        status: {
          not: "DELETED"
        }
      }
    });

    if (duplicated) {
      throw new AppException(40001, "该模型下已存在相同 Provider voice_id 的平台音色", HttpStatus.BAD_REQUEST);
    }

    const owner = await this.ensurePlatformVoiceOwnerUser();
    const voice = await this.prisma.voiceAsset.create({
      data: {
        userId: owner.id,
        providerInstanceId: model.providerInstanceId,
        provider: model.providerInstance.providerPreset.providerKey,
        providerVoiceId,
        name,
        type: dto.type,
        targetModel: model.providerModelName,
        status: "READY",
        visibility: "PUBLIC",
        language: emptyToNull(dto.language),
        description: emptyToNull(dto.description),
        previewAudioUrl: emptyToNull(dto.previewAudioUrl),
        isPlatform: true,
        reviewedByAdminId: adminUserId,
        reviewedAt: new Date(),
        reviewNote: "平台音色由后台添加",
        disabledReason: null
      },
      include: adminVoiceAssetInclude()
    });

    return this.toAdminVoiceAsset(voice);
  }

  async createPlatformVoiceDesign(dto: CreateAdminPlatformVoiceDesignDto, adminUserId: string) {
    const prompt = dto.prompt.trim();
    const name = dto.name.trim();

    if (!prompt || !name) {
      throw new AppException(40001, "请填写提示词和音色名称", HttpStatus.BAD_REQUEST);
    }

    await this.ensureDashScopeAudioDefaults();

    const model = dto.modelInstanceId
      ? await this.getAudioModelById(dto.modelInstanceId, "VOICE_DESIGN")
      : await this.getModelByAlias(dto.modelAlias ?? "voice-design-default", "VOICE_DESIGN");
    const owner = await this.ensurePlatformVoiceOwnerUser();
    const voiceAsset = await this.prisma.voiceAsset.create({
      data: {
        userId: owner.id,
        providerInstanceId: model.providerInstanceId,
        provider: model.providerKey,
        name,
        type: "DESIGNED",
        targetModel: model.modelName,
        status: "CREATING",
        visibility: "PUBLIC",
        language: emptyToNull(dto.language) ?? "zh-CN",
        description: prompt,
        isPlatform: true,
        reviewedByAdminId: adminUserId,
        reviewedAt: new Date(),
        reviewNote: "平台音色由后台声音设计生成"
      }
    });
    const task = await this.prisma.audioTask.create({
      data: {
        userId: owner.id,
        learnerId: null,
        scenarioId: null,
        billingContext: "PERSONAL",
        type: "VOICE_DESIGN",
        status: "CREATED",
        provider: model.providerKey,
        model: model.modelName,
        providerInstanceId: model.providerInstanceId,
        modelInstanceId: model.modelInstanceId,
        voiceAssetId: voiceAsset.id,
        inputText: prompt,
        inputTextLength: prompt.length,
        estimatedCredits: 0,
        providerPayload: {
          previewText: emptyToNull(dto.previewText),
          source: "ADMIN",
          targetModel: model.modelName,
          pricing: {
            estimatedCredits: 0
          }
        }
      }
    });

    await this.executeVoiceDesignTask(task.id, voiceAsset.id, model, prompt, name, emptyToNull(dto.previewText));

    const voice = await this.prisma.voiceAsset.findUniqueOrThrow({
      where: {
        id: voiceAsset.id
      },
      include: adminVoiceAssetInclude()
    });

    if (voice.status === "FAILED") {
      throw new AppException(40001, voice.description ?? "平台音色生成失败", HttpStatus.BAD_REQUEST);
    }

    return this.toAdminVoiceAsset(voice);
  }

  async listAdminSystemVoiceAssets(filters: AdminVoiceFilters = {}) {
    const keyword = emptyToNull(filters.keyword)?.toLowerCase();
    const status = emptyToNull(filters.status);
    const language = emptyToNull(filters.language);
    const normalizedLanguage = language ? normaliseVoiceLanguage(language) : null;
    const accentFilter = emptyToNull(filters.accent);
    const accent = accentFilter ? normaliseVoiceAccent(accentFilter) ?? accentFilter : null;
    const model = emptyToNull(filters.model);
    const voices = await this.listSystemVoiceItems();

    return voices
      .filter((voice) => {
        if (status && voice.status !== status) {
          return false;
        }

        const voiceLanguages = [voice.language, ...voice.languages].map((value) => normaliseVoiceLanguage(value));
        if (normalizedLanguage && !voiceLanguages.includes(normalizedLanguage)) {
          return false;
        }

        const voiceAccents = [voice.accent, ...voice.languages, voice.language]
          .map((value) => normaliseVoiceAccent(value ?? ""));
        if (accent && !voiceAccents.some((value) => value === accent)) {
          return false;
        }

        if (model && !(voice.supportedModels as readonly string[]).includes(model)) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        return [
          voice.name,
          voice.providerVoiceId,
          voice.description,
          voice.trait,
          voice.scene,
          voice.language,
          voice.accent ?? "",
          ...voice.languages,
          voice.ageCategory ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .map((voice) => ({
        ...voice,
        typeName: voiceTypeName(voice.type),
        statusName: voiceStatusName(voice.status)
      }));
  }

  async getAdminSystemVoiceAsset(providerVoiceId: string) {
    const voice = await this.findSystemVoiceItem(providerVoiceId);

    if (!voice) {
      throw new AppException(40401, "系统音色不存在", HttpStatus.NOT_FOUND);
    }

    const [operationLogs, modelHealth] = await Promise.all([
      this.listAdminOperationLogs("SYSTEM_VOICE", providerVoiceId),
      this.systemVoiceModelHealth(voice.supportedModels)
    ]);

    return {
      ...voice,
      typeName: voiceTypeName(voice.type),
      statusName: voiceStatusName(voice.status),
      modelHealth,
      operationLogs
    };
  }

  async updateAdminSystemVoice(providerVoiceId: string, dto: UpdateSystemVoiceDto) {
    const voice = systemVoices.find((item) => item.providerVoiceId === providerVoiceId);

    if (!voice) {
      throw new AppException(40401, "系统音色不存在", HttpStatus.NOT_FOUND);
    }

    const overrides = await this.loadSystemVoiceOverrides();
    const currentOverride = overrides[providerVoiceId] ?? {};
    const currentLanguage = currentOverride.language ?? normaliseVoiceLanguage(voice.language);
    const name = emptyToNull(dto.name);
    const description = emptyToNull(dto.description);
    const trait = emptyToNull(dto.trait);
    const scene = emptyToNull(dto.scene);
    const language = dto.language === undefined
      ? currentOverride.language
      : normaliseVoiceLanguage(dto.language);
    const status = dto.status ?? currentOverride.status ?? "READY";
    const disabledReason = emptyToNull(dto.disabledReason);

    if (status === "DISABLED" && !disabledReason) {
      throw new AppException(40001, "禁用系统音色时请填写原因", HttpStatus.BAD_REQUEST);
    }

    const next: SystemVoiceOverride = {
      ...currentOverride,
      name: name ?? currentOverride.name ?? voice.name,
      description: description ?? currentOverride.description ?? voice.description,
      trait: trait ?? currentOverride.trait ?? voice.trait,
      scene: scene ?? currentOverride.scene ?? voice.scene,
      language,
      accent: dto.accent !== undefined
        ? emptyToNull(dto.accent ?? undefined)
        : currentOverride.accent !== undefined
          ? currentOverride.accent
          : inferSystemVoiceAccent(voice),
      gender: dto.gender ?? currentOverride.gender ?? inferSystemVoiceGender(voice),
      ageCategory: dto.ageCategory ?? (
        currentOverride.ageCategory !== undefined ? currentOverride.ageCategory : voice.ageCategory
      ),
      status,
      disabledReason: status === "DISABLED" ? disabledReason : null,
      updatedAt: new Date().toISOString()
    };

    assertVoiceClassification(next.language ?? currentLanguage, next.accent, currentLanguage);

    overrides[providerVoiceId] = next;
    await this.saveSystemVoiceOverrides(overrides);

    return this.getAdminSystemVoiceAsset(providerVoiceId);
  }

  async getAdminVoiceAsset(id: string) {
    const [voice, operationLogs] = await Promise.all([
      this.prisma.voiceAsset.findUnique({
        where: {
          id
        },
        include: adminVoiceAssetInclude()
      }),
      this.listAdminOperationLogs("VOICE_ASSET", id)
    ]);

    if (!voice) {
      throw new AppException(40401, "音色不存在", HttpStatus.NOT_FOUND);
    }

    return {
      ...this.toAdminVoiceAsset(voice),
      operationLogs
    };
  }

  async updateAdminPlatformVoiceAsset(id: string, dto: UpdateAdminVoiceAssetDto) {
    const name = dto.name?.trim();

    if (!name) {
      throw new AppException(40001, "音色名称不能为空", HttpStatus.BAD_REQUEST);
    }

    const existing = await this.prisma.voiceAsset.findUnique({
      where: {
        id
      },
      select: {
        isPlatform: true,
        status: true,
        type: true,
        language: true,
        accent: true,
        gender: true,
        ageCategory: true
      }
    });

    if (!existing || existing.status === "DELETED") {
      throw new AppException(40401, "音色不存在", HttpStatus.NOT_FOUND);
    }

    if (!existing.isPlatform || (existing.type !== "CLONED" && existing.type !== "DESIGNED")) {
      throw new AppException(
        40001,
        "仅支持修改平台复刻音色和平台设计音色信息",
        HttpStatus.BAD_REQUEST
      );
    }

    const language = dto.language !== undefined ? normaliseVoiceLanguage(dto.language) : existing.language;
    const accent = dto.accent !== undefined ? emptyToNull(dto.accent ?? undefined) : existing.accent;
    if (dto.language !== undefined || dto.accent !== undefined) {
      assertVoiceClassification(language, accent, existing.language);
    }

    const updated = await this.prisma.voiceAsset.updateMany({
      where: {
        id,
        isPlatform: true,
        type: {
          in: ["CLONED", "DESIGNED"]
        },
        status: {
          not: "DELETED"
        }
      },
      data: {
        name,
        ...(dto.language !== undefined ? { language } : {}),
        ...(dto.accent !== undefined ? { accent } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.ageCategory !== undefined ? { ageCategory: dto.ageCategory } : {})
      }
    });

    if (updated.count === 0) {
      throw new AppException(40401, "音色不存在", HttpStatus.NOT_FOUND);
    }

    return this.getAdminVoiceAsset(id);
  }

  async getAdminAudioAssetFile(id: string) {
    const asset = await this.prisma.audioAsset.findUnique({
      where: {
        id
      }
    });

    if (!asset || asset.type !== "SOURCE_SAMPLE") {
      throw new AppException(40401, "声音样本不存在", HttpStatus.NOT_FOUND);
    }

    if (asset.storageProvider !== "LOCAL") {
      throw new AppException(40001, "当前声音样本暂不支持本地临时访问", HttpStatus.BAD_REQUEST);
    }

    const safeFilename = basename(asset.objectKey);
    const filepath = resolve(audioUploadDir(), safeFilename);

    if (!filepath.startsWith(audioUploadDir()) || !existsSync(filepath)) {
      throw new AppException(40401, "声音样本文件不存在", HttpStatus.NOT_FOUND);
    }

    return {
      filepath,
      filename: safeFilename,
      mimeType: asset.mimeType,
      size: asset.sizeBytes
    };
  }

  async reviewVoiceAsset(id: string, dto: ReviewVoiceAssetDto, adminUserId: string) {
    const action = dto.action;
    const reason = emptyToNull(dto.reason);

    if ((action === "REJECT" || action === "DISABLE") && !reason) {
      throw new AppException(40001, "请填写审核原因", HttpStatus.BAD_REQUEST);
    }

    const existing = await this.prisma.voiceAsset.findUnique({
      where: {
        id
      }
    });

    if (!existing || existing.status === "DELETED") {
      throw new AppException(40401, "音色不存在", HttpStatus.NOT_FOUND);
    }

    if (action === "APPROVE" && !existing.providerVoiceId) {
      throw new AppException(40001, "该音色缺少 Provider Voice ID，不能审核通过", HttpStatus.BAD_REQUEST);
    }

    const data = moderationUpdateData(action, reason, adminUserId);
    await this.prisma.voiceAsset.update({
      where: {
        id
      },
      data
    });

    if (action !== "APPROVE") {
      await this.clearDefaultVoiceReferences(id);
    }

    return this.getAdminVoiceAsset(id);
  }

  async deleteVoiceAssetAsAdmin(id: string, dto: DeleteVoiceAssetAdminDto, adminUserId: string) {
    if (!dto.confirm) {
      throw new AppException(40001, "请先确认删除操作", HttpStatus.BAD_REQUEST);
    }

    const reason = emptyToNull(dto.reason);
    if (!reason) {
      throw new AppException(40001, "请填写删除原因", HttpStatus.BAD_REQUEST);
    }

    const existing = await this.prisma.voiceAsset.findUnique({
      where: {
        id
      }
    });

    if (!existing || existing.status === "DELETED") {
      throw new AppException(40401, "音色不存在", HttpStatus.NOT_FOUND);
    }

    await this.prisma.voiceAsset.update({
      where: {
        id
      },
      data: {
        status: "DELETED",
        reviewedByAdminId: adminUserId,
        reviewedAt: new Date(),
        reviewNote: reason,
        disabledReason: reason,
        deletedAt: new Date()
      }
    });
    await this.clearDefaultVoiceReferences(id);

    return {};
  }

  async uploadAudioAsset(userId: string, type: "SOURCE_SAMPLE" | "PREVIEW" | "TTS_OUTPUT", file: UploadedAudioFileLike | undefined) {
    return this.storeUploadedAudioAsset(userId, type, file, uploadDriver() === "s3" ? "S3" : "LOCAL");
  }

  async uploadAudioAssetForTranscription(
    userId: string,
    type: "SOURCE_SAMPLE" | "PREVIEW" | "TTS_OUTPUT",
    file: UploadedAudioFileLike | undefined,
    maxBytes = maxAudioUploadBytes()
  ) {
    return this.storeUploadedAudioAsset(userId, type, file, "S3", true, maxBytes);
  }

  private async storeUploadedAudioAsset(
    userId: string,
    type: "SOURCE_SAMPLE" | "PREVIEW" | "TTS_OUTPUT",
    file: UploadedAudioFileLike | undefined,
    provider: "LOCAL" | "S3",
    requirePublicUrl = false,
    maxBytes = maxAudioUploadBytes()
  ) {
    if (!file) {
      throw new AppException(40001, "请选择要上传的音频文件", HttpStatus.BAD_REQUEST);
    }

    this.assertUploadedAudioFile(file, maxBytes);

    const filename = this.createAudioFilename(file.originalname, file.mimetype);
    const uploaded = provider === "S3"
      ? await this.uploadAudioToS3(
          filename,
          file,
          requirePublicUrl,
          requirePublicUrl ? englishReadAlongUploadPrefix() : undefined
        )
      : {
          objectKey: filename,
          url: await this.uploadAudioToLocal(filename, file)
        };

    if (provider === "S3" && requirePublicUrl) {
      try {
        await this.assertPublicAudioUrlReadable(uploaded.url);
      } catch (error) {
        await this.deleteUploadedAudioObject({
          objectKey: uploaded.objectKey,
          storageProvider: provider
        }).catch(() => undefined);
        throw error;
      }
    }

    const asset = await this.prisma.audioAsset.create({
      data: {
        userId,
        type,
        storageProvider: provider,
        url: uploaded.url,
        objectKey: uploaded.objectKey,
        mimeType: file.mimetype.toLowerCase(),
        sizeBytes: file.size
      }
    });

    return this.toAudioAsset(asset);
  }

  async createAudioAsset(userId: string, dto: CreateAudioAssetDto) {
    this.assertAudioAsset(dto);

    const asset = await this.prisma.audioAsset.create({
      data: {
        userId,
        type: dto.type,
        storageProvider: dto.storageProvider ?? "LOCAL",
        url: dto.url.trim(),
        objectKey: dto.objectKey.trim(),
        mimeType: dto.mimeType.trim().toLowerCase(),
        durationMs: dto.durationMs ?? null,
        sizeBytes: dto.sizeBytes,
        sampleRate: dto.sampleRate ?? null,
        channels: dto.channels ?? null
      }
    });

    return this.toAudioAsset(asset);
  }

  async listUserAudioAssets(userId: string) {
    const assets = await this.prisma.audioAsset.findMany({
      where: {
        userId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    return assets.map((asset) => this.toAudioAsset(asset));
  }

  async deleteAudioAsset(userId: string, id: string) {
    const asset = await this.prisma.audioAsset.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!asset) {
      return {};
    }

    const usedCount = await this.prisma.audioTask.count({
      where: {
        userId,
        OR: [
          {
            sourceAudioAssetId: id
          },
          {
            outputAudioAssetId: id
          }
        ]
      }
    });

    if (usedCount > 0) {
      throw new AppException(40001, "音频文件已被任务使用，不能直接删除", HttpStatus.BAD_REQUEST);
    }

    await this.deleteUploadedAudioObject(asset);
    await this.prisma.audioAsset.deleteMany({
      where: {
        id,
        userId
      }
    });

    return {};
  }

  async cleanupExternalNarrationAudio(userId: string, taskIds: string[]) {
    const uniqueTaskIds = Array.from(new Set(taskIds.map((id) => id.trim()).filter(Boolean))).slice(0, 2_000);

    if (uniqueTaskIds.length === 0) {
      return { cleaned: 0 };
    }

    const tasks = await this.prisma.audioTask.findMany({
      where: {
        id: { in: uniqueTaskIds },
        userId
      },
      select: {
        id: true,
        outputAudioAssetId: true,
        providerPayload: true
      }
    });
    let cleaned = 0;

    for (const task of tasks) {
      const payload = jsonObject(task.providerPayload);
      const persisted = payload ? persistedVideoGuideAudioFromPayload(payload) : null;

      if (persisted) {
        try {
          await deletePersistedVideoGuideNarrationAudio(persisted);
        } catch {
          continue;
        }
      }

      await this.prisma.$transaction(async (transaction) => {
        await transaction.audioTask.updateMany({
          where: {
            id: task.id,
            userId
          },
          data: {
            outputAudioAssetId: null
          }
        });

        if (task.outputAudioAssetId) {
          await transaction.audioAsset.deleteMany({
            where: {
              id: task.outputAudioAssetId,
              userId
            }
          });
        }
      });
      cleaned += 1;
    }

    return { cleaned };
  }

  async cleanupExternalNarrationAudioByPersistence(
    userId: string,
    request: Omit<VideoGuideNarrationPersistenceRequest, "audioTaskId">
  ) {
    const tasks = await this.prisma.audioTask.findMany({
      where: {
        userId,
        type: "TTS",
        AND: [
          {
            providerPayload: {
              path: ["videoGuidePersistence", "lessonId"],
              equals: request.lessonId
            }
          },
          {
            providerPayload: {
              path: ["videoGuidePersistence", "generationId"],
              equals: request.generationId
            }
          },
          {
            providerPayload: {
              path: ["videoGuidePersistence", "nodeId"],
              equals: request.nodeId
            }
          }
        ]
      },
      select: {
        id: true
      },
      take: 20
    });
    const taskIds = tasks.map((task) => task.id);

    for (const task of tasks) {
      await deletePersistedVideoGuideNarrationAudio({
        objectKey: videoGuideNarrationObjectKey({
          ...request,
          audioTaskId: task.id
        })
      });
    }

    const result = await this.cleanupExternalNarrationAudio(userId, taskIds);

    if (taskIds.length > 0) {
      await this.prisma.audioTask.updateMany({
        where: {
          id: { in: taskIds },
          userId
        },
        data: {
          status: "COMPENSATED",
          errorCode: "VIDEO_GUIDE_EDIT_EXPIRED",
          errorMessage: "本句讲解语音任务已超时补偿",
          finishedAt: new Date()
        }
      });
    }

    return result;
  }

  async getLocalAudioFile(filename: string) {
    const safeFilename = basename(filename);
    const asset = await this.prisma.audioAsset.findFirst({
      where: {
        objectKey: safeFilename,
        storageProvider: "LOCAL"
      }
    });

    if (!asset) {
      throw new AppException(40401, "音频文件不存在", HttpStatus.NOT_FOUND);
    }

    const filepath = resolve(audioUploadDir(), safeFilename);

    if (!filepath.startsWith(audioUploadDir()) || !existsSync(filepath)) {
      throw new AppException(40401, "音频文件不存在", HttpStatus.NOT_FOUND);
    }

    return {
      filepath,
      mimeType: asset.mimeType,
      size: asset.sizeBytes
    };
  }

  async generateSrtFromMediaUrl(input: {
    language?: string | null;
    mediaMimeType?: string | null;
    mediaName?: string | null;
    mediaUrl: string;
  }) {
    const mediaUrl = input.mediaUrl.trim();

    if (!mediaUrl) {
      throw new AppException(40001, "请先上传视频或音频文件", HttpStatus.BAD_REQUEST);
    }

    await this.ensureDashScopeAudioDefaults();

    const model = await this.getModelByAlias("speech-to-text", "ASR");
    const providerMediaUrl = signedAudioUrlForTranscription(mediaUrl);
    let payload: Record<string, unknown>;

    try {
      if (providerMediaUrl !== mediaUrl) {
        await this.assertPublicAudioUrlReadable(providerMediaUrl);
      }
      payload = await this.callAudioGateway("/audio/asr", model, {
        format: "srt",
        language: input.language?.trim() || "auto",
        mediaMimeType: input.mediaMimeType?.trim() || undefined,
        mediaName: input.mediaName?.trim() || undefined,
        mediaUrl: providerMediaUrl,
        model: model.modelName,
        timeoutMs: asrGatewayTimeoutMs()
      });
    } catch (error) {
      throw new AppException(50201, providerErrorMessage(error), HttpStatus.BAD_GATEWAY);
    }

    const subtitleText = extractAsrSubtitleText(payload);

    if (!subtitleText) {
      throw new AppException(50201, "语音识别未返回字幕内容", HttpStatus.BAD_GATEWAY);
    }

    return {
      subtitleText,
      punctuatedText: extractAsrPunctuatedText(payload),
      sentenceSubtitles: extractAsrRecordArray(payload, "sentenceSubtitles"),
      wordTimeline: extractAsrRecordArray(payload, "wordTimeline"),
      modelName: model.modelName,
      providerName: model.providerName,
      requestId: extractProviderRequestId(payload),
      durationMs: extractAudioDurationMs(payload)
    };
  }

  async submitSrtGenerationTask(input: {
    language?: string | null;
    mediaMimeType?: string | null;
    mediaName?: string | null;
    mediaUrl: string;
  }) {
    const mediaUrl = input.mediaUrl.trim();

    if (!mediaUrl) {
      throw new AppException(40001, "请先上传视频或音频文件", HttpStatus.BAD_REQUEST);
    }

    await this.ensureDashScopeAudioDefaults();
    const model = await this.getModelByAlias("speech-to-text", "ASR");
    const providerMediaUrl = signedAudioUrlForTranscription(mediaUrl);

    if (providerMediaUrl !== mediaUrl) {
      await this.assertPublicAudioUrlReadable(providerMediaUrl);
    }

    const payload = await this.callAudioGateway("/audio/asr/tasks", model, {
      format: "srt",
      language: input.language?.trim() || "auto",
      mediaMimeType: input.mediaMimeType?.trim() || undefined,
      mediaName: input.mediaName?.trim() || undefined,
      mediaUrl: providerMediaUrl,
      model: model.modelName,
      timeoutMs: asrGatewayRequestTimeoutMs()
    });
    const providerTaskId = stringValue(payload.providerTaskId);

    if (!providerTaskId) {
      throw new AudioProviderException("ASR_TASK_ID_MISSING", "语音识别接口未返回任务编号");
    }

    return {
      providerTaskId,
      providerStatus: stringValue(payload.providerStatus) ?? "PENDING",
      status: asrTaskState(payload),
      modelInstanceId: model.modelInstanceId,
      providerInstanceId: model.providerInstanceId,
      modelName: model.modelName,
      providerName: model.providerName,
      requestId: extractProviderRequestId(payload)
    };
  }

  async querySrtGenerationTask(input: {
    mediaMimeType?: string | null;
    mediaName?: string | null;
    modelInstanceId: string;
    modelName: string;
    providerInstanceId: string;
    providerTaskId: string;
  }) {
    const providerTaskId = input.providerTaskId.trim();

    if (!providerTaskId) {
      throw new AppException(40001, "语音识别任务编号不能为空", HttpStatus.BAD_REQUEST);
    }

    const model = await this.getPinnedAudioModel({
      capability: "ASR",
      modelInstanceId: input.modelInstanceId,
      modelName: input.modelName,
      providerInstanceId: input.providerInstanceId
    });
    const payload = await this.callAudioGateway("/audio/asr/tasks/query", model, {
      format: "srt",
      mediaMimeType: input.mediaMimeType?.trim() || undefined,
      mediaName: input.mediaName?.trim() || undefined,
      model: model.modelName,
      taskId: providerTaskId,
      timeoutMs: asrGatewayRequestTimeoutMs()
    });
    const status = asrTaskState(payload);

    if (status !== "SUCCEEDED") {
      return {
        providerTaskId,
        providerStatus: stringValue(payload.providerStatus) ?? "PENDING",
        status,
        modelName: model.modelName,
        providerName: model.providerName,
        requestId: extractProviderRequestId(payload),
        durationMs: null,
        subtitleText: null,
        punctuatedText: "",
        sentenceSubtitles: [] as Record<string, unknown>[],
        wordTimeline: [] as Record<string, unknown>[]
      };
    }

    const subtitleText = extractAsrSubtitleText(payload);

    if (!subtitleText) {
      throw new AudioProviderException("ASR_EMPTY_RESULT", "语音识别未返回字幕内容");
    }

    return {
      providerTaskId,
      providerStatus: stringValue(payload.providerStatus) ?? "SUCCEEDED",
      status,
      subtitleText,
      punctuatedText: extractAsrPunctuatedText(payload),
      sentenceSubtitles: extractAsrRecordArray(payload, "sentenceSubtitles"),
      wordTimeline: extractAsrRecordArray(payload, "wordTimeline"),
      modelName: model.modelName,
      providerName: model.providerName,
      requestId: extractProviderRequestId(payload),
      durationMs: extractAudioDurationMs(payload)
    };
  }

  async createTtsTask(
    context: AudioTaskAttributionContext,
    dto: CreateTtsAudioTaskDto
  ) {
    const attribution = snapshotAudioAttribution(context);
    const { userId } = attribution;
    const text = dto.text.trim();
    const billingContext = this.billingContextFromDto(dto);
    if (text.length > 8000) {
      throw new AppException(40001, "语音合成文本不能超过 8000 字", HttpStatus.BAD_REQUEST);
    }

    const learnerPreferredModel = attribution.learnerId
      ? await this.resolvePreferredTtsModel(dto.voiceAssetId, dto.voice, userId)
      : null;
    await this.ensureDashScopeAudioDefaults();
    const preferredModel = learnerPreferredModel
      ?? await this.resolvePreferredTtsModel(dto.voiceAssetId, dto.voice);
    const model = await this.getModelByAlias(
      dto.modelAlias ?? "tts-default",
      "TTS",
      preferredModel.modelNames,
      preferredModel.label
    );
    assertTtsTextLimitForModel(text, model);
    const voice = await this.resolveVoice(
      userId,
      dto.voiceAssetId,
      dto.voice,
      model,
      Boolean(attribution.learnerId)
    );
    const pricing = await this.calculatePricingQuote("TTS", model, {
      characterCount: estimatedTtsBillingCharacters(text)
    });
    const estimatedCredits = pricing.estimatedCredits;
    if (model.providerKey === abeiaiAudioProviderKey && estimatedCredits <= 0) {
      throw new AppException(40001, "请先为阿贝智能语音模型配置有效的点数价格。", HttpStatus.BAD_REQUEST);
    }
    const parameters = normalizeTtsParameters(dto.source === "EXPERIENCE" ? { ...dto, format: "wav" } : dto);
    const timeoutMs = ttsGatewayTimeoutMs(text);
    const task = await this.reserveAudioTask({
      attribution,
      type: "TTS",
      model,
      estimatedCredits,
      inputText: text,
      voiceAssetId: voice.voiceAssetId ?? undefined,
      providerPayload: {
        voice: voice.providerVoiceId,
        source: dto.source ?? "TOOL",
        parameters,
        timeoutMs,
        pricing: pricingSnapshot(pricing)
      } as unknown as Prisma.InputJsonValue,
      reserveNote: `语音合成冻结 ${estimatedCredits} 点`,
      billingContext
    });

    if (!dto.execute) {
      return this.getTaskForExecution(attribution, task.id);
    }

    return this.executeTtsTask(task.id, model, voice.providerVoiceId, text, parameters, timeoutMs,
      dto.source === "EXPERIENCE" ? { voiceMasterUserId: userId } : undefined);
  }

  async prepareDialogueTts(context: AudioTaskAttributionContext, input: { text: string; voiceValue: string; speed: number }): Promise<PreparedDialogueTts> {
    const voiceAssetId = input.voiceValue.startsWith("voice:") ? input.voiceValue.slice(6) : undefined;
    const voiceId = input.voiceValue.startsWith("system:") ? input.voiceValue.slice(7) : undefined;
    if (!voiceAssetId && !voiceId) throw new AppException(40001, "请选择已就绪的音色", 400);
    await this.ensureDashScopeAudioDefaults();
    const preferred = await this.resolvePreferredTtsModel(voiceAssetId, voiceId, context.learnerId ? context.userId : undefined);
    const model = await this.getModelByAlias("tts-default", "TTS", preferred.modelNames, preferred.label);
    assertTtsTextLimitForModel(input.text, model);
    const minimum = model.adapterType === "ELEVENLABS_AUDIO" ? 0.7 : 0.5;
    const maximum = model.adapterType === "ELEVENLABS_AUDIO" ? 1.2 : 2;
    if (!Number.isFinite(input.speed) || input.speed < minimum || input.speed > maximum) {
      throw new AppException(40001, `${model.modelName} 的语速范围为 ${minimum}-${maximum} 倍，请调整后重新确认`, 400);
    }
    const voice = await this.resolveVoice(context.userId, voiceAssetId, voiceId, model, Boolean(context.learnerId));
    const billingCharacters = estimatedTtsBillingCharacters(input.text);
    const pricing = await this.calculatePricingQuote("TTS", model, { characterCount: billingCharacters });
    const voiceName = voice.voiceAssetId
      ? (await this.prisma.voiceAsset.findUnique({ where: { id: voice.voiceAssetId }, select: { name: true } }))?.name
      : (await this.findSystemVoiceItem(voice.providerVoiceId))?.name;
    return {
      modelInstanceId: model.modelInstanceId, providerInstanceId: model.providerInstanceId,
      providerKey: model.providerKey, modelName: model.modelName, providerVoiceId: voice.providerVoiceId,
      voiceAssetId: voice.voiceAssetId, voiceName: voiceName ?? "系统音色", billingCharacters,
      credits: pricing.estimatedCredits, speed: input.speed,
      pricingFingerprint: dialogueFingerprint(pricingSnapshot(pricing))
    };
  }

  async executeDialogueTts(
    context: AudioTaskAttributionContext,
    plan: PreparedDialogueTts & { fingerprint: string; id: string },
    input: { generationId: string; projectId: string; text: string },
    onCreated: (taskId: string) => Promise<void>
  ) {
    const model = await this.getAudioModelById(plan.modelInstanceId, "TTS");
    if (model.providerInstanceId !== plan.providerInstanceId || model.modelName !== plan.modelName) {
      throw new AppException(40901, "语音模型配置已变化，请重新确认", 409);
    }
    const task = await this.prisma.audioTask.create({ data: {
      userId: context.userId, learnerId: context.learnerId, scenarioId: context.rootScenarioId,
      type: "TTS", status: "PROCESSING", provider: plan.providerKey, model: plan.modelName,
      providerInstanceId: plan.providerInstanceId, modelInstanceId: plan.modelInstanceId,
      voiceAssetId: plan.voiceAssetId, audioDialogueGenerationId: input.generationId,
      inputText: input.text, inputTextLength: input.text.length, estimatedCredits: 0,
      providerPayload: { source: "EXPERIENCE", billing: "DIALOGUE_EXTERNAL", dialogueProjectId: input.projectId, dialogueSegmentId: plan.id, dialogueFingerprint: plan.fingerprint }
    } });
    // The parent checkpoints the child ID before any paid provider request.
    await onCreated(task.id);
    const qwenCreditsPerCny = model.modelName === "qwen-audio-3.1-tts-flash"
      ? await this.getCreditsPerCny()
      : null;
    const response = await postJsonWithLongTimeout(`${gatewayBaseUrl()}/audio/tts`, {
      baseUrl: model.baseUrl, webSocketUrl: model.webSocketUrl, apiKey: this.resolveProviderApiKey(model),
      region: model.region, providerKey: model.providerKey, adapterType: model.adapterType,
      model: model.modelName, voice: plan.providerVoiceId, text: input.text,
      timeoutMs: ttsGatewayTimeoutMs(input.text), ...normalizeTtsParameters({ text: input.text, speed: plan.speed, format: "wav", sampleRate: 24000 })
    });
    if (!response.ok) {
      const detail = audioGatewayErrorDetail(response.payload, response.status, "/audio/tts", "语音合成失败");
      await this.failAudioTask(task.id, detail.errorCode, detail.errorMessage);
      throw new AppException(40004, detail.errorMessage, 400);
    }
    const payload = response.payload ?? {};
    const result = {
      ...(typeof payload.audioBase64 === "string" ? { audioBase64: payload.audioBase64 } : {}),
      ...(typeof payload.audioMimeType === "string" ? { audioMimeType: payload.audioMimeType } : {}),
      ...(extractAudioUrl(payload) ? { audioUrl: extractAudioUrl(payload) } : {})
    };
    if (Buffer.byteLength(JSON.stringify(result)) > 28 * 1024 * 1024) throw new AppException(40001, "分句音频超过大小限制", 400);
    const credits = qwenCreditsPerCny !== null
      ? confirmedQwenAudioCredits(payload, model.inputPrice, model.outputPrice, qwenCreditsPerCny, plan.credits)
      : plan.credits;
    await this.prisma.audioTask.update({ where: { id: task.id }, data: {
      requestId: extractProviderRequestId(payload),
      providerPayload: { ...(task.providerPayload as Record<string, Prisma.InputJsonValue>), dialogueResult: result,
        dialogueActualCredits: credits, dialogueCachedAt: new Date().toISOString() }
    } });
    return { taskId: task.id, payload: result, credits };
  }

  async completeDialogueTts(transaction: Prisma.TransactionClient, taskId: string, persisted: PersistedDialogueAudio) {
    const task = await transaction.audioTask.findUniqueOrThrow({ where: { id: taskId } });
    const payload = jsonObject(stripDialogueAudioCache(task.providerPayload)) ?? {};
    const asset = await transaction.audioAsset.create({ data: { userId: task.userId, type: "TTS_OUTPUT", storageProvider: "S3", ...persisted } });
    await transaction.audioTask.update({ where: { id: taskId }, data: {
      status: "SUCCEEDED", actualCredits: 0, outputAudioAssetId: asset.id,
      providerPayload: { ...payload, audioUrl: persisted.url }, finishedAt: new Date(), errorMessage: null
    } });
    await this.writeAudioUsageLog(transaction, task, { success: true, consumedCredits: 0, providerPayload: {} });
    return asset;
  }

  async synthesizeTtsForExternalBilling(
    context: AudioTaskAttributionContext,
    dto: ExternalBillingTtsTaskInput
  ) {
    const attribution = snapshotAudioAttribution(context);
    const { userId, learnerId, rootScenarioId } = attribution;
    const text = dto.text.trim();

    if (!text) {
      throw new AppException(40001, "语音合成文本不能为空", HttpStatus.BAD_REQUEST);
    }

    if (text.length > 8000) {
      throw new AppException(40001, "语音合成文本不能超过 8000 字", HttpStatus.BAD_REQUEST);
    }

    const source = dto.source ?? "VIDEO_GUIDE";

    if (source === "VIDEO_GUIDE" && !dto.videoGuidePersistence) {
      throw new AppException(50001, "视频导学语音缺少对象存储参数", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const learnerPreferredModel = learnerId
      ? await this.resolvePreferredTtsModel(dto.voiceAssetId, dto.voice, userId)
      : null;
    await this.ensureDashScopeAudioDefaults();
    const preferredModel = learnerPreferredModel
      ?? await this.resolvePreferredTtsModel(dto.voiceAssetId, dto.voice);
    const model = await this.getModelByAlias(
      dto.modelAlias ?? "tts-default",
      "TTS",
      preferredModel.modelNames,
      preferredModel.label
    );
    assertTtsTextLimitForModel(text, model);
    const voice = await this.resolveVoice(
      userId,
      dto.voiceAssetId,
      dto.voice,
      model,
      Boolean(learnerId)
    );
    const parameters = normalizeTtsParameters(dto);
    const timeoutMs = ttsGatewayTimeoutMs(text);
    const createTask = (client: Prisma.TransactionClient | typeof this.prisma) => client.audioTask.create({
      data: {
        userId,
        learnerId,
        scenarioId: rootScenarioId,
        billingContext: "PERSONAL",
        type: "TTS",
        status: "CREATED",
        provider: model.providerName,
        model: model.modelName,
        providerInstanceId: model.providerInstanceId,
        modelInstanceId: model.modelInstanceId,
        voiceAssetId: voice.voiceAssetId ?? null,
        inputText: text,
        inputTextLength: text.length,
        estimatedCredits: 0,
        providerPayload: {
          voice: voice.providerVoiceId,
          source,
          parameters,
          timeoutMs,
          billing: "VIDEO_GUIDE_EXTERNAL",
          ...(dto.videoGuidePersistence
            ? { videoGuidePersistence: dto.videoGuidePersistence }
            : {})
        } as unknown as Prisma.InputJsonValue
      }
    });
    const task = this.learnerActivityService
      ? await this.prisma.$transaction(async (transaction) => {
          const created = await createTask(transaction);
          await this.recordAudioTaskActivity(transaction, {
            userId,
            learnerId,
            scenarioId: rootScenarioId,
            taskId: created.id,
            eventType: "CREATE_STARTED"
          });
          return created;
        })
      : await createTask(this.prisma);

    return this.executeTtsTask(task.id, model, voice.providerVoiceId, text, parameters, timeoutMs, {
      videoGuidePersistence: dto.videoGuidePersistence,
      onPersistenceStatus: dto.onPersistenceStatus
    });
  }

  async findVerifiedVideoGuideNarrationTask(
    userId: string,
    request: Omit<VideoGuideNarrationPersistenceRequest, "audioTaskId">
  ) {
    const tasks = await this.prisma.audioTask.findMany({
      where: {
        userId,
        type: "TTS",
        status: {
          in: ["PROCESSING", "SUCCEEDED"]
        },
        AND: [
          {
            providerPayload: {
              path: ["videoGuidePersistence", "lessonId"],
              equals: request.lessonId
            }
          },
          {
            providerPayload: {
              path: ["videoGuidePersistence", "generationId"],
              equals: request.generationId
            }
          },
          {
            providerPayload: {
              path: ["videoGuidePersistence", "nodeId"],
              equals: request.nodeId
            }
          }
        ]
      },
      select: {
        id: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        providerPayload: true,
        outputAudioAsset: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 3
    });

    for (const task of tasks) {
      const payload = jsonObject(task.providerPayload);
      const persisted = payload ? persistedVideoGuideAudioFromPayload(payload) : null;

      if (!persisted) {
        continue;
      }

      try {
        await this.verifyPersistedVideoGuideNarrationTask(persisted, {
          ...request,
          audioTaskId: task.id
        });

        if (task.status === "PROCESSING") {
          return this.settleSuccessfulAudioTask(task.id, payload!);
        }

        if (task.outputAudioAsset) {
          return task;
        }
      } catch (error) {
        if (
          error instanceof VideoGuideNarrationStorageError &&
          error.code === "R2_VERIFY_INVALID"
        ) {
          continue;
        }

        throw error;
      }
    }

    return null;
  }

  private async verifyPersistedVideoGuideNarrationTask(
    persisted: PersistedVideoGuideNarrationAudio,
    request: VideoGuideNarrationPersistenceRequest
  ) {
    await verifyPersistedVideoGuideNarrationAudio(persisted, { request });
  }

  private async checkpointPersistedVideoGuideTask(
    taskId: string,
    providerPayload: Record<string, unknown>
  ) {
    const task = await this.prisma.audioTask.findUnique({
      where: {
        id: taskId
      },
      select: {
        providerPayload: true,
        status: true
      }
    });

    if (!task || task.status === "SUCCEEDED") {
      return;
    }

    const updated = await this.prisma.audioTask.updateMany({
      where: {
        id: taskId,
        status: "PROCESSING"
      },
      data: {
        providerPayload: mergeProviderPayload(
          task.providerPayload,
          providerPayload
        ) as Prisma.InputJsonValue
      }
    });

    if (updated.count !== 1) {
      throw new AppException(
        40901,
        "讲解语音任务状态已发生变化",
        HttpStatus.CONFLICT
      );
    }
  }

  async createVoiceCloneTask(
    context: AudioTaskAttributionContext,
    dto: CreateVoiceCloneTaskDto,
    request?: HeaderRequestLike
  ) {
    const attribution = snapshotAudioAttribution(context);
    const { userId } = attribution;
    const billingContext = this.billingContextFromDto(dto);

    if (!dto.consentAccepted) {
      throw new AppException(40001, "请先勾选声音授权声明", HttpStatus.BAD_REQUEST);
    }

    await this.ensureDashScopeAudioDefaults();

    const sourceAsset = await this.assertUserAudioAsset(userId, dto.sourceAudioAssetId, "SOURCE_SAMPLE");
    const model = await this.getModelByAlias(dto.modelAlias ?? "voice-clone-default", "VOICE_CLONE");
    const safety = await this.audioSafetySettings();
    const consentType = dto.consentType ?? "SELF_VOICE";
    const ownerName = emptyToNull(dto.ownerName);
    const ownerContact = emptyToNull(dto.ownerContact);
    const consentText = emptyToNull(dto.consentStatement) ?? safety.cloneConsentText;

    if (consentType === "AUTHORIZED_VOICE" && (!ownerName || !ownerContact)) {
      throw new AppException(40001, "使用他人授权声音时，请填写权利人姓名和联系方式", HttpStatus.BAD_REQUEST);
    }

    const pricing = await this.calculatePricingQuote("VOICE_CLONE", model, {
      usageCount: 1
    });
    const estimatedCredits = pricing.estimatedCredits;
    const voiceAsset = await this.prisma.voiceAsset.create({
      data: {
        userId,
        providerInstanceId: model.providerInstanceId,
        provider: model.providerKey,
        name: dto.name.trim(),
        type: "CLONED",
        targetModel: model.modelName,
        status: "CREATING",
        visibility: defaultVoiceVisibility(safety.cloneDefaultVisibility, safety.userPublicVoiceEnabled),
        language: emptyToNull(dto.language),
        description: emptyToNull(dto.description),
        sourceAudioAssetId: sourceAsset.id
      }
    });
    const consent = await this.prisma.voiceConsent.create({
      data: {
        userId,
        voiceAssetId: voiceAsset.id,
        sourceAudioAssetId: sourceAsset.id,
        statement: consentText,
        consentText,
        consentType,
        ownerName,
        ownerContact,
        agreedAt: new Date(),
        ip: request ? getClientIp(request) : null,
        userAgent: request ? getUserAgent(request) : null
      }
    });

    await this.prisma.voiceAsset.update({
      where: {
        id: voiceAsset.id
      },
      data: {
        consentId: consent.id
      }
    });

    const task = await this.reserveAudioTask({
      attribution,
      type: "VOICE_CLONE",
      model,
      estimatedCredits,
      sourceAudioAssetId: sourceAsset.id,
      voiceAssetId: voiceAsset.id,
      providerPayload: {
        voiceAssetId: voiceAsset.id,
        source: dto.source ?? "TOOL",
        targetModel: model.modelName,
        pricing: pricingSnapshot(pricing)
      },
      reserveNote: `声音复刻冻结 ${estimatedCredits} 点`,
      billingContext
    });

    await this.executeVoiceCloneTask(task.id, voiceAsset.id, model, sourceAsset.url, dto.name.trim());

    return this.getVoiceAsset(userId, voiceAsset.id);
  }

  async createVoiceDesignTask(context: AudioTaskAttributionContext, dto: CreateVoiceDesignTaskDto) {
    const attribution = snapshotAudioAttribution(context);
    const { userId } = attribution;
    const prompt = dto.prompt.trim();
    const billingContext = this.billingContextFromDto(dto);

    await this.ensureDashScopeAudioDefaults();

    const model = dto.modelInstanceId
      ? await this.getAudioModelById(dto.modelInstanceId, "VOICE_DESIGN")
      : await this.getModelByAlias(dto.modelAlias ?? "voice-design-default", "VOICE_DESIGN");
    const safety = await this.audioSafetySettings();
    const pricing = await this.calculatePricingQuote("VOICE_DESIGN", model, {
      usageCount: 1
    });
    const estimatedCredits = pricing.estimatedCredits;
    const voiceAsset = await this.prisma.voiceAsset.create({
      data: {
        userId,
        providerInstanceId: model.providerInstanceId,
        provider: model.providerKey,
        name: dto.name.trim(),
        type: "DESIGNED",
        targetModel: model.modelName,
        status: "CREATING",
        visibility: defaultVoiceVisibility(safety.designDefaultVisibility, safety.userPublicVoiceEnabled),
        language: emptyToNull(dto.language),
        description: prompt
      }
    });

    const task = await this.reserveAudioTask({
      attribution,
      type: "VOICE_DESIGN",
      model,
      estimatedCredits,
      inputText: prompt,
      voiceAssetId: voiceAsset.id,
      providerPayload: {
        previewText: emptyToNull(dto.previewText),
        source: dto.source ?? "TOOL",
        targetModel: model.modelName,
        pricing: pricingSnapshot(pricing)
      },
      reserveNote: `声音设计冻结 ${estimatedCredits} 点`,
      billingContext
    });

    await this.executeVoiceDesignTask(task.id, voiceAsset.id, model, prompt, dto.name.trim(), emptyToNull(dto.previewText));

    return this.getVoiceAsset(userId, voiceAsset.id);
  }

  async updateVoiceAsset(userId: string, id: string, dto: UpdateVoiceAssetDto) {
    const name = dto.name?.trim();

    if (!name) {
      throw new AppException(40001, "音色名称不能为空", HttpStatus.BAD_REQUEST);
    }

    const updated = await this.prisma.voiceAsset.updateMany({
      where: {
        id,
        userId,
        status: {
          not: "DELETED"
        }
      },
      data: {
        name
      }
    });

    if (updated.count === 0) {
      throw new AppException(40401, "音色不存在", HttpStatus.NOT_FOUND);
    }

    return this.getVoiceAsset(userId, id);
  }

  async deleteVoiceAsset(userId: string, id: string) {
    const updated = await this.prisma.voiceAsset.updateMany({
      where: {
        id,
        userId,
        status: {
          not: "DELETED"
        }
      },
      data: {
        status: "DELETED"
      }
    });

    if (updated.count === 0) {
      throw new AppException(40401, "音色不存在", HttpStatus.NOT_FOUND);
    }

    await this.clearDefaultVoiceReferences(id);

    return {};
  }

  async setDefaultVoice(userId: string, dto: SetDefaultVoiceDto) {
    const voiceAssetId = emptyToNull(dto.voiceAssetId);
    const systemVoiceId = emptyToNull(dto.systemVoiceId);

    if (voiceAssetId && systemVoiceId) {
      throw new AppException(40001, "默认音色只能选择一种", HttpStatus.BAD_REQUEST);
    }

    if (voiceAssetId) {
      const voice = await this.prisma.voiceAsset.findFirst({
        where: {
          id: voiceAssetId,
          OR: [
            {
              userId,
              isPlatform: false
            },
            {
              isPlatform: true
            }
          ],
          status: "READY"
        }
      });

      if (!voice) {
        throw new AppException(40401, "音色不存在或不可用", HttpStatus.NOT_FOUND);
      }
    }

    if (systemVoiceId) {
      const systemVoice = await this.findSystemVoiceItem(systemVoiceId);

      if (!systemVoice) {
        throw new AppException(40001, "系统音色不存在", HttpStatus.BAD_REQUEST);
      }

      if (systemVoice.status !== "READY") {
        throw new AppException(40001, "该系统音色已禁用，不能设为默认", HttpStatus.BAD_REQUEST);
      }
    }

    await this.prisma.userAudioPreference.upsert({
      where: {
        userId
      },
      update: {
        defaultVoiceAssetId: voiceAssetId,
        defaultSystemVoiceId: systemVoiceId
      },
      create: {
        userId,
        defaultVoiceAssetId: voiceAssetId,
        defaultSystemVoiceId: systemVoiceId
      }
    });

    return this.listVoiceAssets(userId);
  }

  async listVoiceExperienceTasks(subject: ProfileSubject) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT task.id FROM audio_tasks task
      WHERE task."userId" = ${subject.userId}
        AND task."learnerId" IS NOT DISTINCT FROM ${subject.learnerId}
        AND task.type = 'TTS'
        AND task."audioDialogueGenerationId" IS NULL
        AND task."providerPayload" ->> 'source' = 'EXPERIENCE'
        AND NOT task."providerPayload" ? 'dialogueProjectId'
        AND NOT task."providerPayload" ? 'videoGuidePersistence'
        AND NOT EXISTS (SELECT 1 FROM audio_dialogue_generations generation WHERE generation."billingAudioTaskId" = task.id)
        AND NOT EXISTS (SELECT 1 FROM english_guided_study_materials material WHERE material."audioTaskId" = task.id)
      ORDER BY task."createdAt" DESC LIMIT 50
    `;
    const tasks = await this.prisma.audioTask.findMany({ where: { id: { in: rows.map(row => row.id) }, ...audioTaskSubjectWhere(subject) }, include: audioTaskInclude(), orderBy: { createdAt: "desc" } });
    return tasks.map(task => {
      const projected = this.toAudioTask(task);
      return subject.mode === "LEARNER" ? this.toLearnerAudioTask(projected) : projected;
    });
  }

  async listUserTasks(subject: ProfileSubject, profile?: unknown) {
    const where = await resolveHistoryProfileWhere(this.prisma, subject, profile);
    const tasks = await this.prisma.audioTask.findMany({
      where,
      include: audioTaskInclude(),
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    });

    return tasks.map((task) => {
      const projected = this.toAudioTask(task);
      return subject.mode === "LEARNER"
        ? this.toLearnerAudioTask(projected)
        : projected;
    });
  }

  async getUserTask(subject: ProfileSubject, id: string) {
    const task = await this.prisma.audioTask.findFirst({
      where: {
        id,
        ...audioTaskSubjectWhere(subject)
      },
      include: audioTaskInclude()
    });

    if (!task) {
      throw new AppException(40401, "语音任务不存在", HttpStatus.NOT_FOUND);
    }

    const projected = this.toAudioTask(task);
    return subject.mode === "LEARNER"
      ? this.toLearnerAudioTask(projected)
      : projected;
  }

  private async getTaskForExecution(context: AudioTaskAttributionContext, id: string) {
    const task = await this.prisma.audioTask.findFirst({
      where: {
        id,
        ...audioTaskSubjectWhere(profileSubjectFromAttribution(context))
      },
      include: audioTaskInclude()
    });

    if (!task) {
      throw new AppException(40401, "语音任务不存在", HttpStatus.NOT_FOUND);
    }

    return this.toAudioTask(task);
  }

  async listAdminTasks(filters: AdminAudioTaskListFilters = {}) {
    const where: Prisma.AudioTaskWhereInput = {};

    if (isAudioTaskStatus(filters.status)) {
      where.status = filters.status;
    }

    if (isAudioTaskType(filters.type)) {
      where.type = filters.type;
    }

    const userKeyword = emptyToNull(filters.user);
    if (userKeyword) {
      where.user = {
        OR: [
          {
            email: {
              contains: userKeyword,
              mode: "insensitive"
            }
          },
          {
            nickname: {
              contains: userKeyword,
              mode: "insensitive"
            }
          },
          {
            id: {
              contains: userKeyword,
              mode: "insensitive"
            }
          }
        ]
      };
    }

    const createdAt = adminAudioTaskDateFilter(filters.startTime, filters.endTime);
    if (createdAt) {
      where.createdAt = createdAt;
    }

    const andFilters: Prisma.AudioTaskWhereInput[] = [];
    const providerKeyword = emptyToNull(filters.provider);
    if (providerKeyword) {
      andFilters.push({
        OR: [
          {
            providerInstanceId: providerKeyword
          },
          {
            provider: {
              contains: providerKeyword,
              mode: "insensitive"
            }
          }
        ]
      });
    }

    const modelKeyword = emptyToNull(filters.model);
    if (modelKeyword) {
      andFilters.push({
        OR: [
          {
            modelInstanceId: modelKeyword
          },
          {
            model: {
              contains: modelKeyword,
              mode: "insensitive"
            }
          }
        ]
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const pageSize = parseAdminAudioListPageSize(filters.pageSize, filters.page ? 50 : 100);
    const page = parseAdminAudioListPage(filters.page);
    const tasks = await this.prisma.audioTask.findMany({
      where,
      include: {
        ...audioTaskInclude(),
        user: {
          select: {
            id: true,
            email: true,
            nickname: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return tasks.map((task) => this.toAdminAudioTask(task));
  }

  async getAdminTask(id: string) {
    const [task, operationLogs] = await Promise.all([
      this.prisma.audioTask.findUnique({
        where: {
          id
        },
        include: {
          ...audioTaskInclude(),
          user: {
            select: {
              id: true,
              email: true,
              nickname: true
            }
          }
        }
      }),
      this.listAdminOperationLogs("AUDIO_TASK", id)
    ]);

    if (!task) {
      throw new AppException(40401, "语音任务不存在", HttpStatus.NOT_FOUND);
    }

    return {
      ...this.toAdminAudioTask(task),
      operationLogs
    };
  }

  async failAudioTask(taskId: string, errorCode: string, errorMessage: string) {
    return this.releaseFailedAudioTask(taskId, errorCode, errorMessage);
  }

  private async executeTtsTask(
    taskId: string,
    model: ActiveAudioModel,
    providerVoiceId: string,
    text: string,
    parameters: TtsParameters,
    timeoutMs: number,
    output?: {
      voiceMasterUserId?: string;
      videoGuidePersistence?: Omit<VideoGuideNarrationPersistenceRequest, "audioTaskId">;
      onPersistenceStatus?: ExternalBillingTtsTaskInput["onPersistenceStatus"];
    }
  ) {
    let persistedVideoGuideAudio: PersistedVideoGuideNarrationAudio | null = null;
    let voiceMaster: PersistedDialogueAudio | null = null;

    try {
      await this.prisma.audioTask.update({
        where: {
          id: taskId
        },
        data: {
          status: "PROCESSING"
        }
      });

      const apiKey = this.resolveProviderApiKey(model);
      const response = await postJsonWithLongTimeout(`${gatewayBaseUrl()}/audio/tts`, {
          baseUrl: model.baseUrl,
          webSocketUrl: model.webSocketUrl,
          apiKey,
          region: model.region,
          providerKey: model.providerKey,
          adapterType: model.adapterType,
          model: model.modelName,
          voice: providerVoiceId,
          text,
        timeoutMs,
        ...parameters
      });
      const payload = response.payload;

      if (!response.ok) {
        const detail = audioGatewayErrorDetail(payload, response.status, "/audio/tts", "语音合成失败");
        throw new AudioProviderException(
          detail.errorCode,
          detail.errorMessage
        );
      }

      const providerPayload = payload ?? {};

      if (output?.voiceMasterUserId) {
        voiceMaster = await persistDialogueClip({ userId: output.voiceMasterUserId, projectId: taskId,
          generationId: taskId, segmentId: "master", payload: providerPayload, requireWav: true });
        const persistedPayload = { usage: providerPayload.usage ?? {}, characterCount: extractProviderCharacterCount(providerPayload),
          requestId: extractProviderRequestId(providerPayload), latencyMs: extractLatencyMs(providerPayload), durationMs: voiceMaster.durationMs,
          audioUrl: voiceMaster.url, voiceMaster };
        await this.checkpointPersistedVideoGuideTask(taskId, persistedPayload);
        return await this.settleSuccessfulAudioTask(taskId, persistedPayload, voiceMaster);
      }

      if (!output?.videoGuidePersistence) {
        return this.settleSuccessfulAudioTask(taskId, providerPayload);
      }

      persistedVideoGuideAudio = await persistVideoGuideNarrationAudio({
        providerPayload,
        request: {
          ...output.videoGuidePersistence,
          audioTaskId: taskId
        },
        onStage: async (stage) => {
          await output.onPersistenceStatus?.({
            stage,
            audioTaskId: taskId
          });
        }
      });

      const persistedProviderPayload = sanitizePersistedTtsPayload(
        providerPayload,
        persistedVideoGuideAudio
      );
      await this.checkpointPersistedVideoGuideTask(taskId, persistedProviderPayload);

      return await this.settleSuccessfulAudioTask(
        taskId,
        persistedProviderPayload
      );
    } catch (error) {
      if (voiceMaster && output?.voiceMasterUserId) {
        const task = await this.prisma.audioTask.findUnique({ where: { id: taskId }, select: { status: true, outputAudioAssetId: true } }).catch(() => null);
        if (task && task.status !== "SUCCEEDED") {
          await deleteDialogueClip({ userId: output.voiceMasterUserId, projectId: taskId, generationId: taskId, url: voiceMaster.url }).catch(() => undefined);
        }
      }
      if (persistedVideoGuideAudio) {
        await this.deleteUncommittedVideoGuideAudio(taskId, persistedVideoGuideAudio);
      }

      const code =
        error instanceof AudioProviderException || error instanceof VideoGuideNarrationStorageError || error instanceof DialogueAudioError
          ? error.code
          : "AUDIO_PROVIDER_FAILED";
      const message = error instanceof Error ? error.message : "语音任务执行失败";

      return this.releaseFailedAudioTask(taskId, code, message);
    }
  }

  private async deleteUncommittedVideoGuideAudio(
    taskId: string,
    persisted: PersistedVideoGuideNarrationAudio
  ) {
    try {
      const task = await this.prisma.audioTask.findUnique({
        where: {
          id: taskId
        },
        select: {
          status: true,
          outputAudioAssetId: true
        }
      });

      if (task?.status === "SUCCEEDED" && task.outputAudioAssetId) {
        return;
      }

      await deletePersistedVideoGuideNarrationAudio(persisted);
    } catch {
      // Best-effort compensation. The original task failure remains authoritative.
    }
  }

  private async executeVoiceCloneTask(
    taskId: string,
    voiceAssetId: string,
    model: ActiveAudioModel,
    sourceAudioUrl: string,
    name: string
  ) {
    await this.markAudioTaskProcessing(taskId);

    try {
      const payload = await this.callAudioGateway("/audio/voices/clone", model, {
        targetModel: model.modelName,
        sourceAudioUrl,
        name
      });
      await this.markVoiceSucceeded(voiceAssetId, payload);

      return this.settleSuccessfulAudioTask(taskId, payload);
    } catch (error) {
      await this.markVoiceFailed(voiceAssetId, providerErrorMessage(error));

      return this.releaseFailedAudioTask(
        taskId,
        error instanceof AudioProviderException ? error.code : "VOICE_CLONE_FAILED",
        providerErrorMessage(error)
      );
    }
  }

  private async executeVoiceDesignTask(
    taskId: string,
    voiceAssetId: string,
    model: ActiveAudioModel,
    voicePrompt: string,
    name: string,
    previewText: string | null
  ) {
    await this.markAudioTaskProcessing(taskId);

    try {
      const payload = await this.callAudioGateway("/audio/voices/design", model, {
        targetModel: model.modelName,
        voicePrompt,
        name,
        previewText
      });
      const previewAudioUrl = await this.markVoiceSucceeded(voiceAssetId, payload);

      return this.settleSuccessfulAudioTask(taskId, sanitizeVoiceDesignProviderPayload(payload, previewAudioUrl));
    } catch (error) {
      await this.markVoiceFailed(voiceAssetId, providerErrorMessage(error));

      return this.releaseFailedAudioTask(
        taskId,
        error instanceof AudioProviderException ? error.code : "VOICE_DESIGN_FAILED",
        providerErrorMessage(error)
      );
    }
  }

  private async callAudioGateway(path: string, model: ActiveAudioModel, body: Record<string, unknown>) {
    const apiKey = this.resolveProviderApiKey(model);
    const response = await postJsonWithLongTimeout(
      `${gatewayBaseUrl()}${path}`,
      {
        baseUrl: model.baseUrl,
        webSocketUrl: model.webSocketUrl,
        apiKey,
        region: model.region,
        providerKey: model.providerKey,
        adapterType: model.adapterType,
        ...body
      },
      gatewayProxyTimeoutMs(body.timeoutMs)
    );
    const payload = response.payload;

    if (!response.ok) {
      const detail = audioGatewayErrorDetail(payload, response.status, path, "语音 Provider 接口调用失败");
      throw new AudioProviderException(
        detail.errorCode,
        detail.errorMessage,
        detail.terminal
      );
    }

    return payload ?? {};
  }

  private async markAudioTaskProcessing(taskId: string) {
    await this.prisma.audioTask.update({
      where: {
        id: taskId
      },
      data: {
        status: "PROCESSING"
      }
    });
  }

  private async markVoiceSucceeded(voiceAssetId: string, payload: Record<string, unknown>) {
    const providerVoiceId = extractProviderVoiceId(payload);

    if (!providerVoiceId) {
      throw new AudioProviderException("VOICE_ID_MISSING", "阿里云语音接口未返回音色 ID");
    }

    const asset = await this.prisma.voiceAsset.findUnique({
      where: {
        id: voiceAssetId
      },
      select: {
        userId: true,
        type: true,
        isPlatform: true
      }
    });
    const needsReview = asset && !asset.isPlatform ? await this.voiceReviewRequired(asset.type) : false;
    const previewAudioAsset = asset ? await this.createPreviewAudioAssetFromBase64(asset.userId, payload) : null;
    const previewAudioUrl = previewAudioAsset?.url ?? extractAudioUrl(payload);

    await this.prisma.voiceAsset.update({
      where: {
        id: voiceAssetId
      },
      data: {
        providerVoiceId,
        previewAudioUrl,
        previewAudioAssetId: previewAudioAsset?.id,
        status: needsReview ? "PENDING_REVIEW" : "READY"
      }
    });

    return previewAudioUrl;
  }

  private async createPreviewAudioAssetFromBase64(userId: string, payload: Record<string, unknown>) {
    const audioBase64 = stringValue(payload.audioBase64);

    if (!audioBase64) {
      return null;
    }

    const buffer = Buffer.from(audioBase64, "base64");

    if (buffer.byteLength <= 0) {
      return null;
    }

    if (buffer.byteLength > maxAudioUploadBytes()) {
      throw new AudioProviderException("VOICE_PREVIEW_TOO_LARGE", "音色试听音频超过大小限制");
    }

    const mimeType = stringValue(payload.audioMimeType) ?? "audio/wav";
    const filename = this.createAudioFilename(`voice-preview${audioExtensionFor("voice-preview", mimeType)}`, mimeType);
    const directory = audioUploadDir();
    mkdirSync(directory, {
      recursive: true
    });
    await writeFile(join(directory, filename), buffer);

    return this.prisma.audioAsset.create({
      data: {
        userId,
        type: "PREVIEW",
        storageProvider: "LOCAL",
        url: `${publicApiBaseUrl()}/audio/files/${filename}`,
        objectKey: filename,
        mimeType,
        sizeBytes: buffer.byteLength
      }
    });
  }

  private async markVoiceFailed(voiceAssetId: string, errorMessage: string) {
    await this.prisma.voiceAsset.update({
      where: {
        id: voiceAssetId
      },
      data: {
        status: "FAILED",
        description: errorMessage
      }
    });
  }

  private async reserveAudioTask(input: {
    attribution: AudioTaskAttributionContext;
    type: AudioTaskType;
    model: ActiveAudioModel;
    estimatedCredits: number;
    inputText?: string;
    sourceAudioAssetId?: string;
    voiceAssetId?: string;
    providerPayload?: Prisma.InputJsonValue;
    reserveNote: string;
    billingContext: BillingContextOptions;
  }) {
    const { userId, learnerId, rootScenarioId } = snapshotAudioAttribution(input.attribution);
    if (input.billingContext.billingContext === "ORGANIZATION") {
      if (!input.billingContext.organizationId) {
        throw new AppException(40001, "请选择要使用的企业空间", HttpStatus.BAD_REQUEST);
      }

      if (!this.organizationsService) {
        throw new AppException(50001, "企业账号服务未初始化", HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const task = await this.prisma.audioTask.create({
        data: {
          userId,
          learnerId,
          scenarioId: rootScenarioId,
          billingContext: "ORGANIZATION",
          organizationId: input.billingContext.organizationId,
          type: input.type,
          status: "CREATED",
          provider: input.model.providerKey,
          model: input.model.modelName,
          providerInstanceId: input.model.providerInstanceId,
          modelInstanceId: input.model.modelInstanceId,
          voiceAssetId: input.voiceAssetId ?? null,
          inputText: input.inputText ?? null,
          inputTextLength: input.inputText?.length ?? 0,
          sourceAudioAssetId: input.sourceAudioAssetId ?? null,
          estimatedCredits: input.estimatedCredits,
          providerPayload: input.providerPayload ?? undefined
        }
      });

      try {
        const reservation = await this.organizationsService.reserveEnterpriseUsage({
          userId,
          orgId: input.billingContext.organizationId,
          points: input.estimatedCredits,
          featureCode: audioEnterpriseFeatureCode(input.type),
          usageRequestId: this.enterpriseUsageRequestId(task.id),
          resourceType: "audio_task",
          resourceId: task.id
        });

        return this.prisma.audioTask.update({
          where: {
            id: task.id
          },
          data: {
            status: "RESERVED",
            organizationMemberId: reservation.memberId
          }
        });
      } catch (error) {
        await this.prisma.audioTask.update({
          where: {
            id: task.id
          },
          data: {
            status: "FAILED",
            errorCode: "ENTERPRISE_RESERVE_FAILED",
            errorMessage: error instanceof Error ? error.message : "企业额度预占失败",
            finishedAt: new Date()
          }
        });
        throw error;
      }
    }

    return this.prisma.$transaction(async (transaction) => {
      const task = await transaction.audioTask.create({
        data: {
          userId,
          learnerId,
          scenarioId: rootScenarioId,
          billingContext: "PERSONAL",
          type: input.type,
          status: "CREATED",
          provider: input.model.providerKey,
          model: input.model.modelName,
          providerInstanceId: input.model.providerInstanceId,
          modelInstanceId: input.model.modelInstanceId,
          voiceAssetId: input.voiceAssetId ?? null,
          inputText: input.inputText ?? null,
          inputTextLength: input.inputText?.length ?? 0,
          sourceAudioAssetId: input.sourceAudioAssetId ?? null,
          estimatedCredits: input.estimatedCredits,
          providerPayload: input.providerPayload ?? undefined
        }
      });

      await this.recordAudioTaskActivity(transaction, {
        userId,
        learnerId,
        scenarioId: rootScenarioId,
        taskId: task.id,
        eventType: "CREATE_STARTED"
      });

      await this.ensureWallet(transaction, userId);

      const wallet = await reservePersonalCredits(transaction, userId, `audio-task:${task.id}`, input.estimatedCredits);

      await transaction.creditReservation.create({
        data: {
          userId,
          audioTaskId: task.id,
          amount: input.estimatedCredits,
          status: "RESERVED",
          idempotencyKey: `audio-task:${task.id}:reserve`,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        }
      });

      await transaction.ledgerEntry.create({
        data: {
          userId,
          type: "RESERVE",
          amount: -input.estimatedCredits,
          balanceAfter: wallet.availableCredits,
          relatedAudioTaskId: task.id,
          relatedTaskType: "AUDIO",
          operationType: input.type,
          idempotencyKey: `audio-task:${task.id}:ledger-reserve`,
          note: input.reserveNote
        }
      });

      return transaction.audioTask.update({
        where: {
          id: task.id
        },
        data: {
          status: "RESERVED"
        }
      });
    });
  }

  private async settleSuccessfulAudioTask(taskId: string, providerPayload: Record<string, unknown>, voiceMaster?: PersistedDialogueAudio) {
    const initialTask = await this.prisma.audioTask.findUnique({
      where: {
        id: taskId
      },
      include: {
        reservation: true
      }
    });

    if (!initialTask) {
      throw new AppException(40401, "语音任务不存在", HttpStatus.NOT_FOUND);
    }

    if (initialTask.status === "SUCCEEDED") {
      return this.getTaskForExecution({
        userId: initialTask.userId,
        learnerId: initialTask.learnerId ?? null
      }, initialTask.id);
    }

    if (initialTask.billingContext === "ORGANIZATION") {
      if (!this.organizationsService) {
        throw new AppException(50001, "企业账号服务未初始化", HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const mergedProviderPayload = mergeProviderPayload(initialTask.providerPayload, providerPayload);
      const actualCredits = calculateActualCreditsFromTask(initialTask, providerPayload);

      await this.organizationsService.settleEnterpriseUsage({
        usageRequestId: this.enterpriseUsageRequestId(initialTask.id),
        actualPoints: actualCredits,
        featureCode: audioEnterpriseFeatureCode(initialTask.type),
        resourceType: "audio_task",
        resourceId: initialTask.id,
        usageQuantity: billableCharacterCountForTask(initialTask, providerPayload),
        usageUnit: "character"
      });

      await this.prisma.$transaction(async (transaction) => {
        const outputAudioAssetId = await this.createOutputAudioAsset(transaction, initialTask.userId, providerPayload, voiceMaster);

        await transaction.audioTask.update({
          where: {
            id: initialTask.id
          },
          data: {
            status: "SUCCEEDED",
            outputAudioAssetId,
            actualCredits,
            errorCode: null,
            errorMessage: null,
            requestId: extractProviderRequestId(providerPayload),
            providerPayload: mergedProviderPayload as Prisma.InputJsonValue,
            finishedAt: new Date()
          }
        });

        await this.writeAudioUsageLog(transaction, initialTask, {
          success: true,
          consumedCredits: actualCredits,
          providerPayload
        });
      });

      return this.getTaskForExecution({
        userId: initialTask.userId,
        learnerId: initialTask.learnerId ?? null
      }, initialTask.id);
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const task = await transaction.audioTask.findUnique({
        where: {
          id: taskId
        },
        include: {
          reservation: true
        }
      });

      if (!task) {
        throw new AppException(40401, "语音任务不存在", HttpStatus.NOT_FOUND);
      }

      if (!task.reservation && task.estimatedCredits === 0) {
        const mergedProviderPayload = mergeProviderPayload(task.providerPayload, providerPayload);
        const transitioned = await transaction.audioTask.updateMany({
          where: {
            id: task.id,
            status: "PROCESSING"
          },
          data: {
            status: "SUCCEEDED",
            actualCredits: 0,
            errorCode: null,
            errorMessage: null,
            requestId: extractProviderRequestId(providerPayload),
            providerPayload: mergedProviderPayload as Prisma.InputJsonValue,
            finishedAt: new Date()
          }
        });

        if (transitioned.count !== 1) {
          return {
            userId: task.userId,
            learnerId: task.learnerId ?? null,
            taskId: task.id
          };
        }

        const outputAudioAssetId = await this.createOutputAudioAsset(transaction, task.userId, providerPayload, voiceMaster);
        await transaction.audioTask.update({
          where: { id: task.id },
          data: { outputAudioAssetId }
        });

        await this.recordAudioTaskActivity(transaction, {
          userId: task.userId,
          learnerId: task.learnerId,
          scenarioId: task.scenarioId,
          taskId: task.id,
          eventType: "CREATE_COMPLETED"
        });

        await this.writeAudioUsageLog(transaction, task, {
          success: true,
          consumedCredits: 0,
          providerPayload
        });

        return {
          userId: task.userId,
          learnerId: task.learnerId ?? null,
          taskId: task.id
        };
      }

      if (!task.reservation) {
        throw new AppException(40401, "语音任务不存在", HttpStatus.NOT_FOUND);
      }

      if (task.reservation.status !== "RESERVED") {
        return {
          userId: task.userId,
          learnerId: task.learnerId ?? null,
          taskId: task.id
        };
      }

      const mergedProviderPayload = mergeProviderPayload(task.providerPayload, providerPayload);
      const actualCredits = calculateActualCreditsFromTask(task, providerPayload);
      const reservedCredits = task.reservation.amount;
      const releaseCredits = Math.max(0, reservedCredits - actualCredits);
      const wallet = await settlePersonalCredits(transaction, task.userId, `audio-task:${task.id}`, reservedCredits, actualCredits);

      await transaction.creditReservation.update({
        where: {
          id: task.reservation.id
        },
        data: {
          status: "SETTLED"
        }
      });

      await transaction.ledgerEntry.create({
        data: {
          userId: task.userId,
          type: "CONSUME",
          amount: -actualCredits,
          balanceAfter: wallet.availableCredits,
          relatedAudioTaskId: task.id,
          relatedTaskType: "AUDIO",
          operationType: task.type,
          idempotencyKey: `audio-task:${task.id}:consume`,
          note: `语音任务消耗 ${actualCredits} 点`
        }
      });

      if (releaseCredits > 0) {
        await transaction.ledgerEntry.create({
          data: {
            userId: task.userId,
            type: "RELEASE",
            amount: releaseCredits,
            balanceAfter: wallet.availableCredits,
            relatedAudioTaskId: task.id,
            relatedTaskType: "AUDIO",
            operationType: task.type,
            idempotencyKey: `audio-task:${task.id}:release`,
            note: `语音任务释放多余冻结 ${releaseCredits} 点`
          }
        });
      }

      const outputAudioAssetId = await this.createOutputAudioAsset(transaction, task.userId, providerPayload, voiceMaster);

      await transaction.audioTask.update({
        where: {
          id: task.id
        },
        data: {
          status: "SUCCEEDED",
          outputAudioAssetId,
          actualCredits,
          errorCode: null,
          errorMessage: null,
          requestId: extractProviderRequestId(providerPayload),
          providerPayload: mergedProviderPayload as Prisma.InputJsonValue,
          finishedAt: new Date()
        }
      });

      await this.recordAudioTaskActivity(transaction, {
        userId: task.userId,
        learnerId: task.learnerId,
        scenarioId: task.scenarioId,
        taskId: task.id,
        eventType: "CREATE_COMPLETED"
      });

      await this.writeAudioUsageLog(transaction, task, {
        success: true,
        consumedCredits: actualCredits,
        providerPayload
      });

      return {
        userId: task.userId,
        learnerId: task.learnerId ?? null,
        taskId: task.id
      };
    });

    return this.getTaskForExecution(result, result.taskId);
  }

  private async recordAudioTaskActivity(
    transaction: Prisma.TransactionClient,
    input: {
      userId: string;
      learnerId: string | null;
      scenarioId: string | null;
      taskId: string;
      eventType: "CREATE_STARTED" | "CREATE_COMPLETED";
    }
  ) {
    if (!this.learnerActivityService) return;
    await this.learnerActivityService.record({
      subject: input.learnerId
        ? { userId: input.userId, mode: "LEARNER", learnerId: input.learnerId }
        : { userId: input.userId, mode: "ACCOUNT", learnerId: null },
      eventType: input.eventType,
      scenarioId: input.scenarioId,
      resourceType: "AUDIO_TASK",
      resourceId: input.taskId,
      idempotencyKey: `audio-task:${input.taskId}:${input.eventType === "CREATE_STARTED" ? "create-started" : "create-completed"}`
    }, transaction);
  }

  private async releaseFailedAudioTask(taskId: string, errorCode: string, errorMessage: string) {
    const initialTask = await this.prisma.audioTask.findUnique({
      where: {
        id: taskId
      },
      include: {
        reservation: true
      }
    });

    if (!initialTask) {
      throw new AppException(40401, "语音任务不存在", HttpStatus.NOT_FOUND);
    }

    if (initialTask.status === "SUCCEEDED") {
      return this.getTaskForExecution({
        userId: initialTask.userId,
        learnerId: initialTask.learnerId ?? null
      }, initialTask.id);
    }

    if (initialTask.billingContext === "ORGANIZATION") {
      if (!this.organizationsService) {
        throw new AppException(50001, "企业账号服务未初始化", HttpStatus.INTERNAL_SERVER_ERROR);
      }

      await this.organizationsService.releaseEnterpriseUsage({
        usageRequestId: this.enterpriseUsageRequestId(initialTask.id),
        reason: `语音任务失败释放企业预占点数`
      });

      await this.prisma.$transaction(async (transaction) => {
        await transaction.audioTask.update({
          where: {
            id: initialTask.id
          },
          data: {
            status: "FAILED",
            errorCode,
            errorMessage,
            finishedAt: new Date()
          }
        });

        await this.writeAudioUsageLog(transaction, initialTask, {
          success: false,
          consumedCredits: 0,
          providerPayload: {
            errorCode,
            errorMessage
          }
        });
      });

      return this.getTaskForExecution({
        userId: initialTask.userId,
        learnerId: initialTask.learnerId ?? null
      }, initialTask.id);
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const task = await transaction.audioTask.findUnique({
        where: {
          id: taskId
        },
        include: {
          reservation: true
        }
      });

      if (!task) {
        throw new AppException(40401, "语音任务不存在", HttpStatus.NOT_FOUND);
      }

      if (!task.reservation && task.estimatedCredits === 0) {
        await transaction.audioTask.update({
          where: {
            id: task.id
          },
          data: {
            status: "FAILED",
            errorCode,
            errorMessage,
            finishedAt: new Date()
          }
        });

        await this.writeAudioUsageLog(transaction, task, {
          success: false,
          consumedCredits: 0,
          providerPayload: {
            errorCode,
            errorMessage
          }
        });

        return {
          userId: task.userId,
          learnerId: task.learnerId ?? null,
          taskId: task.id
        };
      }

      if (!task.reservation) {
        throw new AppException(40401, "语音任务不存在", HttpStatus.NOT_FOUND);
      }

      if (task.reservation.status === "RESERVED") {
        const wallet = await settlePersonalCredits(transaction, task.userId, `audio-task:${task.id}`, task.reservation.amount, 0);

        await transaction.creditReservation.update({
          where: {
            id: task.reservation.id
          },
          data: {
            status: "RELEASED"
          }
        });

        await transaction.ledgerEntry.create({
          data: {
            userId: task.userId,
            type: "RELEASE",
            amount: task.reservation.amount,
            balanceAfter: wallet.availableCredits,
            relatedAudioTaskId: task.id,
            relatedTaskType: "AUDIO",
            operationType: task.type,
            idempotencyKey: `audio-task:${task.id}:release-failed`,
            note: `语音任务失败释放冻结 ${task.reservation.amount} 点`
          }
        });
      }

      await transaction.audioTask.update({
        where: {
          id: task.id
        },
        data: {
          status: "FAILED",
          errorCode,
          errorMessage,
          finishedAt: new Date()
        }
      });

      await this.writeAudioUsageLog(transaction, task, {
        success: false,
        consumedCredits: 0,
        providerPayload: {
          errorCode,
          errorMessage
        }
      });

      return {
        userId: task.userId,
        learnerId: task.learnerId ?? null,
        taskId: task.id
      };
    });

    return this.getTaskForExecution(result, result.taskId);
  }

  private async createOutputAudioAsset(
    transaction: Prisma.TransactionClient,
    userId: string,
    providerPayload: Record<string, unknown>,
    master?: PersistedDialogueAudio
  ) {
    if (master?.mimeType === "audio/wav" && master.sizeBytes > 0) {
      const asset = await transaction.audioAsset.create({ data: { userId, type: "TTS_OUTPUT", storageProvider: "S3", ...master } });
      return asset.id;
    }
    const persistedAsset = audioAssetDataFromTtsPayload(userId, providerPayload);

    if (persistedAsset) {
      const asset = await transaction.audioAsset.create({
        data: persistedAsset
      });

      return asset.id;
    }

    const audioBase64 = stringValue(providerPayload.audioBase64);

    if (audioBase64) {
      const encodedAudio = audioBase64.replace(/^data:audio\/[\w.+-]+;base64,/i, "").replace(/\s+/g, "");

      if (!encodedAudio || encodedAudio.length % 4 === 1 || !/^[a-z0-9+/]*={0,2}$/i.test(encodedAudio)) {
        throw new AudioProviderException("TTS_OUTPUT_INVALID", "语音模型返回的音频数据格式不正确");
      }

      const buffer = Buffer.from(encodedAudio, "base64");

      if (buffer.byteLength <= 0 || buffer.byteLength > maxAudioUploadBytes()) {
        throw new AudioProviderException("TTS_OUTPUT_INVALID", "语音模型返回的音频文件大小不正确");
      }

      const mimeType = stringValue(providerPayload.audioMimeType) ?? "audio/mpeg";
      const filename = this.createAudioFilename(`tts-output${audioExtensionFor("tts-output", mimeType)}`, mimeType);
      const uploaded = await this.uploadAudioToS3(filename, {
        originalname: filename,
        mimetype: mimeType,
        size: buffer.byteLength,
        buffer
      }, true);
      const asset = await transaction.audioAsset.create({
        data: {
          userId,
          type: "TTS_OUTPUT",
          storageProvider: "S3",
          url: uploaded.url,
          objectKey: uploaded.objectKey,
          mimeType,
          sizeBytes: buffer.byteLength
        }
      });

      return asset.id;
    }

    const audioUrl = extractAudioUrl(providerPayload);

    if (!audioUrl) {
      return null;
    }

    const asset = await transaction.audioAsset.create({
      data: {
        userId,
        type: "TTS_OUTPUT",
        storageProvider: "LOCAL",
        url: audioUrl,
        objectKey: `provider-output-${Date.now()}`,
        mimeType: mimeTypeFromAudioUrl(audioUrl),
        sizeBytes: 0
      }
    });

    return asset.id;
  }

  private async getModelByAlias(
    aliasKey: string,
    capability: AudioModelCapability,
    preferredModelNames: string[] = [],
    preferredContextLabel: string | null = null
  ) {
    const preferredModels = Array.from(new Set(preferredModelNames.map((item) => item.trim()).filter(Boolean)));
    const alias = await this.prisma.aiModelAlias.findUnique({
      where: {
        aliasKey
      },
      include: {
        modelInstance: {
          include: activeAudioModelInclude()
        }
      }
    });
    const model = alias?.modelInstance;

    if (!model || !model.providerInstance?.providerPreset) {
      const fallback = await this.findFallbackAudioModel(capability, aliasKey, preferredModels);
      if (fallback) {
        return fallback;
      }

      throw new AppException(
        40001,
        this.audioModelUnavailableMessage(aliasKey, preferredModels, preferredContextLabel),
        HttpStatus.BAD_REQUEST
      );
    }

    const providerInstance = model.providerInstance;
    const providerPreset = providerInstance.providerPreset;

    if (!model.isEnabled || providerInstance.status !== "ENABLED") {
      if (preferredModels.length > 0) {
        const fallback = await this.findFallbackAudioModel(capability, aliasKey, preferredModels);
        if (fallback) {
          return fallback;
        }

        throw new AppException(
          40001,
          this.audioModelUnavailableMessage(aliasKey, preferredModels, preferredContextLabel),
          HttpStatus.BAD_REQUEST
        );
      }

      if (!model.isEnabled) {
        throw new AppException(40001, `模型别名 ${aliasKey} 对应模型未启用`, HttpStatus.BAD_REQUEST);
      }

      throw new AppException(
        40001,
        `模型别名 ${aliasKey} 所属 Provider 未通过测试，请在后台重新测试或检查 API Key`,
        HttpStatus.BAD_REQUEST
      );
    }

    if (!isAudioProviderPreset(providerPreset)) {
      throw new AppException(40001, `模型别名 ${aliasKey} 不是语音模型`, HttpStatus.BAD_REQUEST);
    }

    const capabilityTags = jsonStringArray(model.capabilityTags);

    if (!capabilityTags.includes(capability)) {
      const fallback = await this.findFallbackAudioModel(capability, aliasKey, preferredModels);
      if (fallback) {
        return fallback;
      }

      throw new AppException(40001, `模型别名 ${aliasKey} 不支持当前语音任务`, HttpStatus.BAD_REQUEST);
    }

    if (preferredModels.length > 0 && !preferredModels.includes(model.providerModelName)) {
      const fallback = await this.findFallbackAudioModel(capability, aliasKey, preferredModels);
      if (fallback) {
        return fallback;
      }

      throw new AppException(
        40001,
        this.audioModelUnavailableMessage(aliasKey, preferredModels, preferredContextLabel),
        HttpStatus.BAD_REQUEST
      );
    }

    return this.toActiveAudioModel(model, capability) as ActiveAudioModel;
  }

  private async getAudioModelById(modelInstanceId: string, capability: AudioModelCapability) {
    const model = await this.prisma.aiModelInstance.findUnique({
      where: {
        id: modelInstanceId
      },
      include: activeAudioModelInclude()
    });
    const activeModel = model ? this.toActiveAudioModel(model, capability) : null;

    if (!activeModel) {
      throw new AppException(40001, "所选语音模型不可用或不支持当前任务", HttpStatus.BAD_REQUEST);
    }

    return activeModel;
  }

  private async getPinnedAudioModel(input: {
    capability: AudioModelCapability;
    modelInstanceId: string;
    modelName: string;
    providerInstanceId: string;
  }) {
    const model = await this.prisma.aiModelInstance.findUnique({
      where: {
        id: input.modelInstanceId
      },
      include: activeAudioModelInclude()
    });

    if (
      !model ||
      model.providerInstanceId !== input.providerInstanceId ||
      model.providerModelName !== input.modelName
    ) {
      throw new AudioProviderException(
        "ASR_MODEL_CHECKPOINT_INVALID",
        "语音识别任务使用的模型配置已经不存在，请重新生成字幕",
        true
      );
    }

    const activeModel = this.toActiveAudioModel(model, input.capability, true);

    if (!activeModel) {
      throw new AudioProviderException(
        "ASR_MODEL_CHECKPOINT_INVALID",
        "语音识别任务使用的模型配置已失效，请重新生成字幕",
        true
      );
    }

    return activeModel;
  }

  private audioModelUnavailableMessage(
    aliasKey: string,
    preferredModelNames: string[],
    preferredContextLabel: string | null
  ) {
    if (preferredModelNames.length > 0) {
      return `${preferredContextLabel ?? "所选音色"} 需要启用 ${preferredModelNames.join(" 或 ")}，并通过语音 Provider 测试`;
    }

    return `模型别名 ${aliasKey} 尚未绑定可用模型`;
  }

  private async findFallbackAudioModel(
    capability: AudioModelCapability,
    aliasKey: string,
    preferredModelNames: string[]
  ) {
    const candidates = await this.prisma.aiModelInstance.findMany({
      where: {
        isEnabled: true,
        ...(preferredModelNames.length > 0
          ? {
              providerModelName: {
                in: preferredModelNames
              }
            }
          : {}),
        providerInstance: {
          status: "ENABLED",
          providerPreset: {
            OR: [
              { adapterType: { in: [...audioAdapterTypes] }, modality: "AUDIO" },
              { providerKey: abeiaiAudioProviderKey }
            ]
          }
        }
      },
      include: activeAudioModelInclude(),
      orderBy: {
        updatedAt: "desc"
      },
      take: 50
    });
    const ranked = candidates
      .map((model) => ({
        model,
        activeModel: this.toActiveAudioModel(model, capability),
        preferredIndex: preferredModelNames.indexOf(model.providerModelName),
        aliasScore: model.modelPreset?.recommendedAlias === aliasKey ? 0 : 1
      }))
      .filter((item): item is { model: ActiveAudioModelRecord; activeModel: ActiveAudioModel; preferredIndex: number; aliasScore: number } =>
        Boolean(item.activeModel)
      )
      .sort((left, right) => {
        const leftPreferred = left.preferredIndex === -1 ? Number.MAX_SAFE_INTEGER : left.preferredIndex;
        const rightPreferred = right.preferredIndex === -1 ? Number.MAX_SAFE_INTEGER : right.preferredIndex;

        return leftPreferred - rightPreferred || left.aliasScore - right.aliasScore;
      });

    return ranked[0]?.activeModel ?? null;
  }

  private toActiveAudioModel(
    model: ActiveAudioModelRecord,
    capability: AudioModelCapability,
    allowDisabled = false
  ): ActiveAudioModel | null {
    const providerInstance = model.providerInstance;
    const providerPreset = providerInstance.providerPreset;

    if (!allowDisabled && (!model.isEnabled || providerInstance.status !== "ENABLED")) {
      return null;
    }

    if (!isAudioProviderPreset(providerPreset)) {
      return null;
    }

    const capabilityTags = jsonStringArray(model.capabilityTags);

    if (!capabilityTags.includes(capability)) {
      return null;
    }

    return {
      modelInstanceId: model.id,
      providerInstanceId: providerInstance.id,
      providerKey: providerPreset.providerKey,
      providerName: providerInstance.name,
      providerDisplayName: providerPreset.displayName,
      adapterType: providerPreset.adapterType,
      modelName: model.providerModelName,
      baseUrl: normalizeBaseUrl(model.baseUrl || providerInstance.baseUrl),
      webSocketUrl: model.webSocketUrl ?? providerInstance.webSocketUrl,
      region: model.region ?? providerInstance.region ?? providerPreset.region,
      apiKeyEncrypted: model.apiKeyEncrypted ?? providerInstance.credential?.apiKeyEncrypted ?? null,
      apiKeyEnvName: providerPreset.apiKeyEnvName,
      capabilityTags,
      inputPrice: decimalNumber(model.inputPrice),
      outputPrice: decimalNumber(model.outputPrice),
      pricingMode: normalizePricingMode(model.pricingMode),
      pricingUnit: normalizePricingUnit(model.pricingUnit, model.pricingMode),
      pricingConfig: model.pricingConfig
    } satisfies ActiveAudioModel;
  }

  private async resolvePreferredTtsModel(
    voiceAssetId: string | undefined,
    voice: string | undefined,
    learnerUserId?: string
  ) {
    if (voiceAssetId) {
      const select = { name: true, provider: true, targetModel: true } as const;
      const asset = learnerUserId
        ? await this.prisma.voiceAsset.findFirst({
            where: {
              id: voiceAssetId,
              status: "READY",
              providerVoiceId: { not: null },
              OR: [
                { userId: learnerUserId, isPlatform: false },
                { isPlatform: true, visibility: "PUBLIC" }
              ]
            },
            select
          })
        : await this.prisma.voiceAsset.findUnique({ where: { id: voiceAssetId }, select });

      if (learnerUserId && !asset) {
        throw new AppException(40401, "音色不存在或不可用", HttpStatus.NOT_FOUND);
      }

      return {
        modelNames: asset ? preferredTtsModelsForVoiceAsset(asset) : [],
        label: asset ? `所选音色 ${asset.name}` : null
      };
    }

    const providerVoiceId = emptyToNull(voice);
    if (!providerVoiceId) {
      return {
        modelNames: [] as string[],
        label: null
      };
    }

    const systemVoice = await this.findSystemVoiceItem(providerVoiceId);

    if (learnerUserId && systemVoice?.status !== "READY") {
      throw new AppException(40001, "系统音色不存在或不可用", HttpStatus.BAD_REQUEST);
    }

    return {
      modelNames: systemVoice ? [...systemVoice.supportedModels] : [],
      label: systemVoice ? `所选音色 ${systemVoice.providerVoiceId}` : `所选音色 ${providerVoiceId}`
    };
  }

  private async listSystemVoiceItems() {
    const overrides = await this.loadSystemVoiceOverrides();

    return systemVoices.map((voice) => applySystemVoiceOverride(voice, overrides[voice.providerVoiceId]));
  }

  private async findSystemVoiceItem(providerVoiceId: string) {
    const voice = systemVoices.find((item) => item.providerVoiceId === providerVoiceId);

    if (!voice) {
      return null;
    }

    const overrides = await this.loadSystemVoiceOverrides();

    return applySystemVoiceOverride(voice, overrides[providerVoiceId]);
  }

  private async loadSystemVoiceOverrides() {
    const config = await this.prisma.systemConfig.findUnique({
      where: {
        key: systemVoiceOverrideConfigKey
      }
    });

    if (!config?.value) {
      return {};
    }

    try {
      const parsed = JSON.parse(config.value) as unknown;

      if (!isPlainRecord(parsed)) {
        return {};
      }

      const overrides: Record<string, SystemVoiceOverride> = {};

      for (const [key, value] of Object.entries(parsed)) {
        if (!isPlainRecord(value)) {
          continue;
        }

        const override = normalizeSystemVoiceOverride(value);
        if (override) {
          overrides[key] = override;
        }
      }

      return overrides;
    } catch {
      return {};
    }
  }

  private async saveSystemVoiceOverrides(overrides: Record<string, SystemVoiceOverride>) {
    await this.prisma.systemConfig.upsert({
      where: {
        key: systemVoiceOverrideConfigKey
      },
      update: {
        value: JSON.stringify(overrides)
      },
      create: {
        key: systemVoiceOverrideConfigKey,
        label: "CosyVoice 系统音色覆盖配置",
        value: JSON.stringify(overrides),
        description: "后台对官方 CosyVoice 系统音色的名称、描述、启停等覆盖配置。",
        group: "audio",
        isPublic: false,
        sortOrder: 360
      }
    });
  }

  private async resolveVoice(
    userId: string,
    voiceAssetId: string | undefined,
    voice: string | undefined,
    model: ActiveAudioModel,
    learnerMode = false
  ) {
    const modelName = model.modelName;

    if (!voiceAssetId) {
      const providerVoiceId = emptyToNull(voice);

      if (!providerVoiceId) {
        throw new AppException(40001, "请选择系统音色或自定义音色", HttpStatus.BAD_REQUEST);
      }

      if (model.adapterType === "ELEVENLABS_AUDIO") {
        const registeredVoice = await this.prisma.voiceAsset.findFirst({
          where: {
            provider: elevenLabsAudioProviderKey,
            providerVoiceId,
            type: "SYSTEM",
            isPlatform: true,
            status: "READY",
            visibility: "PUBLIC"
          },
          select: {
            id: true,
            provider: true,
            providerVoiceId: true,
            targetModel: true
          }
        });

        if (!registeredVoice?.providerVoiceId || !isVoiceAssetCompatibleWithModel(registeredVoice, model)) {
          throw new AppException(
            40001,
            "请选择已同步且可用的 ElevenLabs 音色",
            HttpStatus.BAD_REQUEST
          );
        }

        return {
          voiceAssetId: registeredVoice.id,
          providerVoiceId: registeredVoice.providerVoiceId
        };
      }

      const systemVoice = await this.findSystemVoiceItem(providerVoiceId);
      if (learnerMode && systemVoice?.status !== "READY") {
        throw new AppException(40001, "系统音色不存在或不可用", HttpStatus.BAD_REQUEST);
      }
      if (systemVoice?.status === "DISABLED") {
        throw new AppException(
          40001,
          `系统音色「${systemVoice.name}」已禁用，不能用于合成`,
          HttpStatus.BAD_REQUEST
        );
      }

      if (systemVoice && !(systemVoice.supportedModels as readonly string[]).includes(modelName)) {
        throw new AppException(
          40001,
          `系统音色「${systemVoice.name}」不支持当前模型 ${modelName}`,
          HttpStatus.BAD_REQUEST
        );
      }

      return {
        voiceAssetId: null,
        providerVoiceId
      };
    }

    const asset = await this.prisma.voiceAsset.findFirst({
      where: {
        id: voiceAssetId,
        OR: [
          {
            userId,
            isPlatform: false
          },
          {
            isPlatform: true,
            ...(learnerMode ? { visibility: "PUBLIC" as const } : {})
          }
        ],
        ...(learnerMode ? { status: "READY" as const, providerVoiceId: { not: null } } : {})
      }
    });

    if (!asset) {
      throw new AppException(40401, "音色不存在", HttpStatus.NOT_FOUND);
    }

    if (asset.status !== "READY") {
      throw new AppException(40001, "该音色尚未就绪，不能用于语音合成", HttpStatus.BAD_REQUEST);
    }

    if (!asset.providerVoiceId) {
      throw new AppException(40001, "该音色缺少 Provider Voice ID", HttpStatus.BAD_REQUEST);
    }

    if (!isVoiceAssetCompatibleWithModel(asset, model)) {
      throw new AppException(40001, "自定义音色与当前合成模型不匹配", HttpStatus.BAD_REQUEST);
    }

    return {
      voiceAssetId: asset.id,
      providerVoiceId: asset.providerVoiceId
    };
  }

  private async assertUserAudioAsset(userId: string, id: string, type: "SOURCE_SAMPLE") {
    const asset = await this.prisma.audioAsset.findFirst({
      where: {
        id,
        userId,
        type
      }
    });

    if (!asset) {
      throw new AppException(40401, "声音样本不存在", HttpStatus.NOT_FOUND);
    }

    return asset;
  }

  private async getVoiceAsset(userId: string, id: string) {
    const asset = await this.prisma.voiceAsset.findFirst({
      where: {
        id,
        userId,
        isPlatform: false
      },
      include: {
        sourceAudioAsset: true,
        previewAudioAsset: true,
        consent: true,
        targetConsent: true
      }
    });

    if (!asset) {
      throw new AppException(40401, "音色不存在", HttpStatus.NOT_FOUND);
    }

    return {
      id: asset.id,
      userId: asset.userId,
      provider: asset.provider,
      providerVoiceId: asset.providerVoiceId,
      name: asset.name,
      type: asset.type,
      typeName: voiceTypeName(asset.type),
      targetModel: asset.targetModel,
      status: asset.status,
      statusName: voiceStatusName(asset.status),
      visibility: asset.visibility,
      language: asset.language,
      description: asset.description,
      previewAudioUrl: asset.previewAudioUrl,
      sourceAudioAsset: asset.sourceAudioAsset ? this.toAudioAsset(asset.sourceAudioAsset) : null,
      previewAudioAsset: asset.previewAudioAsset ? this.toAudioAsset(asset.previewAudioAsset) : null,
      consent: this.toVoiceConsent(asset.consent ?? asset.targetConsent ?? null),
      reviewNote: asset.reviewNote,
      disabledReason: asset.disabledReason,
      reviewedAt: asset.reviewedAt,
      deletedAt: asset.deletedAt,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt
    };
  }

  private async ensurePlatformVoiceOwnerUser() {
    const email = "platform-voice@xueleai.local";
    const existing = await this.prisma.user.findUnique({
      where: {
        email
      }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(randomBytes(24).toString("hex")),
        nickname: "平台音色",
        status: "ACTIVE"
      }
    });
  }

  private resolveProviderApiKey(model: ActiveAudioModel) {
    if (model.apiKeyEncrypted) {
      try {
        return decryptSecret(model.apiKeyEncrypted);
      } catch {
        const fallback = process.env[model.apiKeyEnvName]?.trim();

        if (fallback) {
          return fallback;
        }

        throw new AudioProviderException(
          "AUDIO_PROVIDER_API_KEY_DECRYPT_FAILED",
          "已保存的语音 Provider API Key 无法解密，请在后台重新填写或确认 SECRET_ENCRYPTION_KEY"
        );
      }
    }

    const apiKey = process.env[model.apiKeyEnvName]?.trim();

    if (!apiKey) {
      throw new AudioProviderException("AUDIO_PROVIDER_API_KEY_MISSING", `尚未配置 ${model.apiKeyEnvName}`);
    }

    return apiKey;
  }

  private async calculatePricingQuote(
    operationType: AudioTaskType,
    model: ActiveAudioModel,
    input: {
      characterCount?: number;
      audioDurationMs?: number | null;
      usageCount?: number;
    }
  ): Promise<AudioPricingQuote> {
    const ruleQuote = model.modelName === "qwen-audio-3.1-tts-flash"
      ? null
      : await this.quoteFromAudioPricingRule(operationType, model, input);

    if (ruleQuote) {
      return ruleQuote;
    }

    const modelQuote = await this.quoteFromAudioModel(model, input);

    if (!modelQuote) {
      throw new AppException(
        40001,
        `语音模型价格未配置或不支持当前计费方式：${audioTaskTypeName(operationType)} / ${model.modelName}`,
        HttpStatus.BAD_REQUEST
      );
    }

    return modelQuote;
  }

  private async quoteFromAudioModel(
    model: ActiveAudioModel,
    input: {
      characterCount?: number;
      audioDurationMs?: number | null;
      usageCount?: number;
    }
  ) {
    const creditsPerCny = await this.getCreditsPerCny();

    return quoteFromAudioModelPricing(model, input, creditsPerCny);
  }

  private async quoteFromAudioPricingRule(
    operationType: AudioTaskType,
    model: ActiveAudioModel,
    input: {
      characterCount?: number;
      audioDurationMs?: number | null;
      usageCount?: number;
    }
  ): Promise<AudioPricingQuote | null> {
    const modelKeys = [`${model.providerKey}:${model.modelName}`, model.modelName, "*"];
    const rules = await this.prisma.audioPricingRule.findMany({
      where: {
        operationType,
        isEnabled: true,
        model: {
          in: modelKeys
        }
      }
    });
    const rule = rules
      .map((item) => ({
        item,
        priority: modelKeys.indexOf(item.model)
      }))
      .filter((item) => item.priority >= 0)
      .sort((left, right) => left.priority - right.priority)[0]?.item;

    if (!rule) {
      return null;
    }

    const billingMode = rule.billingMode as AudioBillingMode;
    const usageCount = usageCountForBilling(billingMode, input);
    const creditsPerUnit = decimalNumber(rule.creditsPerUnit);
    const minimumCredits = rule.minimumCredits;
    const modelMultiplier = decimalNumber(rule.modelMultiplier);

    return {
      ruleId: rule.id,
      pricingSource: "RULE",
      billingMode,
      creditsPerUnit,
      minimumCredits,
      modelMultiplier,
      usageCount,
      estimatedCredits: calculatePricingCredits({
        usageCount,
        creditsPerUnit,
        minimumCredits,
        modelMultiplier
      })
    };
  }

  private async getCreditsPerCny() {
    const config = await this.prisma.systemConfig.findUnique({
      where: {
        key: "defaultCreditExchangeRate"
      },
      select: {
        value: true
      }
    });

    return parseCreditsPerCny(config?.value);
  }

  private async writeAudioUsageLog(
    transaction: Prisma.TransactionClient,
    task: {
      id: string;
      userId: string;
      provider: string;
      model: string;
      providerInstanceId: string | null;
      modelInstanceId: string | null;
      voiceAssetId: string | null;
      type: AudioTaskType;
      inputText: string | null;
      inputTextLength: number;
      estimatedCredits: number;
      providerPayload: Prisma.JsonValue | null;
    },
    input: {
      success: boolean;
      consumedCredits: number;
      providerPayload: Record<string, unknown>;
    }
  ) {
    const snapshot = pricingSnapshotFromTask(task.providerPayload);
    const durationMs = extractAudioDurationMs(input.providerPayload);
    const characterCount = billableCharacterCountForTask(task, input.providerPayload);
    const tokenUsage = snapshot?.pricingMode === "TOKENS"
      ? extractQwenAudioTokenUsage(input.providerPayload)
      : null;
    const usageCount = snapshot
      ? (snapshot.pricingMode === "TOKENS" ? (tokenUsage ? tokenUsage.inputTokens + tokenUsage.outputTokens : snapshot.usageCount)
        : usageCountForPricingSnapshot(snapshot, {
          characterCount,
          audioDurationMs: durationMs,
          usageCount: snapshot.usageCount
        }))
      : usageCountForBilling(undefined, {
          characterCount,
          audioDurationMs: durationMs,
          usageCount: 1
        });
    const data = {
      userId: task.userId,
      provider: task.provider,
      model: task.model,
      providerInstanceId: task.providerInstanceId,
      modelInstanceId: task.modelInstanceId,
      voiceAssetId: task.voiceAssetId,
      operationType: task.type,
      characterCount,
      audioDurationMs: durationMs,
      usageCount,
      latencyMs: extractLatencyMs(input.providerPayload),
      success: input.success,
      estimatedCost: actualEstimatedCostFromSnapshot(snapshot, usageCount, input.providerPayload) ?? estimatedAudioCost(input.providerPayload),
      consumedCredits: input.consumedCredits,
      providerRequestId: extractProviderRequestId(input.providerPayload)
    };

    await transaction.audioUsageLog.upsert({
      where: {
        taskId: task.id
      },
      update: data,
      create: {
        taskId: task.id,
        ...data
      }
    });
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

  private billingContextFromDto(dto: { billingContext?: BillingContext; organizationId?: string | null }): BillingContextOptions {
    if (dto.billingContext !== "ORGANIZATION") {
      return {
        billingContext: "PERSONAL"
      };
    }

    const organizationId = dto.organizationId?.trim();

    if (!organizationId) {
      throw new AppException(40001, "请选择要使用的企业空间", HttpStatus.BAD_REQUEST);
    }

    return {
      billingContext: "ORGANIZATION",
      organizationId
    };
  }

  private enterpriseUsageRequestId(taskId: string) {
    return `audio-task:${taskId}`;
  }

  private assertAudioAsset(dto: CreateAudioAssetDto) {
    const mimeType = dto.mimeType.trim().toLowerCase();

    if (!allowedAudioMimeTypes.has(mimeType)) {
      throw new AppException(40001, "仅支持 MP3、WAV、WebM、OGG、AAC、MP4 音频文件", HttpStatus.BAD_REQUEST);
    }

    if (dto.sizeBytes <= 0 || dto.sizeBytes > maxAudioUploadBytes()) {
      throw new AppException(40001, `音频文件大小不能超过 ${Math.floor(maxAudioUploadBytes() / 1024 / 1024)}MB`, HttpStatus.BAD_REQUEST);
    }
  }

  private assertUploadedAudioFile(file: UploadedAudioFileLike, maxBytes = maxAudioUploadBytes()) {
    const mimeType = file.mimetype.trim().toLowerCase();

    if (!allowedAudioMimeTypes.has(mimeType)) {
      throw new AppException(40001, "仅支持 MP3、WAV、WebM、OGG、AAC、MP4 音频文件", HttpStatus.BAD_REQUEST);
    }

    if (file.size <= 0 || file.size > maxBytes) {
      throw new AppException(40001, `音频文件大小不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`, HttpStatus.BAD_REQUEST);
    }
  }

  private createAudioFilename(originalName: string, mimeType: string) {
    const extension = audioExtensionFor(originalName, mimeType);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const hash = randomBytes(8).toString("hex");

    return `${date}-${hash}${extension}`;
  }

  private async uploadAudioToLocal(filename: string, file: UploadedAudioFileLike) {
    const directory = audioUploadDir();
    mkdirSync(directory, {
      recursive: true
    });
    await writeFile(join(directory, filename), file.buffer);

    return `${publicApiBaseUrl()}/audio/files/${filename}`;
  }

  private async uploadAudioToS3(
    filename: string,
    file: UploadedAudioFileLike,
    requirePublicUrl = false,
    prefixOverride?: string
  ) {
    const config = s3Config();

    if (requirePublicUrl && !config.publicBaseUrl) {
      throw new AppException(50001, "语音识别所需的公网音频存储尚未配置", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const key = `${prefixOverride ?? config.prefix}${filename}`;
    const endpoint = config.endpoint.replace(/\/+$/, "");
    const url = config.pathStyle
      ? `${endpoint}/${config.bucket}/${key}`
      : `${endpoint.replace("://", `://${config.bucket}.`)}/${key}`;
    const parsedUrl = new URL(url);
    const amzDate = amzTimestamp(new Date());
    const payloadHash = createHash("sha256").update(file.buffer).digest("hex");
    const headers: Record<string, string> = {
      "content-type": file.mimetype,
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
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...headers,
        authorization
      },
      body: file.buffer
    });

    if (!response.ok) {
      throw new AppException(50002, "对象存储上传失败", HttpStatus.BAD_GATEWAY);
    }

    return {
      objectKey: key,
      url: config.publicBaseUrl ? `${config.publicBaseUrl.replace(/\/+$/, "")}/${key}` : url
    };
  }

  private async assertPublicAudioUrlReadable(url: string) {
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      try {
        const response = await fetch(url, {
          headers: {
            Accept: "audio/*,application/octet-stream;q=0.8,*/*;q=0.5",
            Range: "bytes=0-0",
            "User-Agent": "XueleAI-ASR-Preflight/1.0"
          },
          signal: controller.signal
        });
        lastStatus = response.status;

        if (response.ok) {
          await response.body?.cancel().catch(() => undefined);
          return;
        }
      } catch {
        lastStatus = null;
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < 3) {
        await new Promise<void>((resolve) => setTimeout(resolve, attempt * 300));
      }
    }

    throw new AppException(
      50004,
      lastStatus
        ? `语音识别音频公网地址不可访问（HTTP ${lastStatus}）`
        : "语音识别音频公网地址不可访问",
      HttpStatus.BAD_GATEWAY
    );
  }

  private async deleteUploadedAudioObject(asset: {
    objectKey: string;
    storageProvider: string;
  }) {
    if (asset.storageProvider === "LOCAL") {
      const filename = basename(asset.objectKey);
      const directory = audioUploadDir();
      const filepath = resolve(directory, filename);

      if (filename && filepath.startsWith(`${resolve(directory)}/`)) {
        await rm(filepath, { force: true });
      }
      return;
    }

    if (asset.storageProvider !== "S3") {
      return;
    }

    const config = s3Config();
    const normalizedObjectKey = asset.objectKey.replace(/^\/+/, "");
    const key = normalizedObjectKey.includes("/")
      ? normalizedObjectKey
      : `${config.prefix}${normalizedObjectKey}`;
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
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        ...headers,
        authorization
      }
    });

    if (!response.ok && response.status !== 404) {
      throw new AppException(50002, "对象存储音频删除失败", HttpStatus.BAD_GATEWAY);
    }
  }

  private async audioSafetySettings() {
    const defaults = defaultAudioSafetySettings();
    const configs = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          in: Object.keys(defaults)
        }
      }
    });
    const values = new Map(configs.map((config) => [config.key, config.value]));
    const userPublicVoiceEnabled = booleanConfig(values.get("audioUserPublicVoiceEnabled"), defaults.audioUserPublicVoiceEnabled);

    return {
      cloneReviewRequired: booleanConfig(values.get("audioVoiceCloneReviewRequired"), defaults.audioVoiceCloneReviewRequired),
      designReviewRequired: booleanConfig(values.get("audioVoiceDesignReviewRequired"), defaults.audioVoiceDesignReviewRequired),
      userPublicVoiceEnabled,
      cloneDefaultVisibility: defaultVoiceVisibility(
        visibilityConfig(values.get("audioCloneDefaultVisibility"), defaults.audioCloneDefaultVisibility),
        userPublicVoiceEnabled
      ),
      designDefaultVisibility: defaultVoiceVisibility(
        visibilityConfig(values.get("audioDesignDefaultVisibility"), defaults.audioDesignDefaultVisibility),
        userPublicVoiceEnabled
      ),
      safetyNotice: values.get("audioSafetyNotice") ?? defaults.audioSafetyNotice,
      cloneConsentText: values.get("audioCloneConsentText") ?? defaults.audioCloneConsentText,
      downloadNotice: values.get("audioDownloadNotice") ?? defaults.audioDownloadNotice
    };
  }

  private async voiceReviewRequired(type: string) {
    const settings = await this.audioSafetySettings();

    if (type === "CLONED") {
      return settings.cloneReviewRequired;
    }

    if (type === "DESIGNED") {
      return settings.designReviewRequired;
    }

    return false;
  }

  private async clearDefaultVoiceReferences(voiceAssetId: string) {
    await this.prisma.userAudioPreference.updateMany({
      where: {
        defaultVoiceAssetId: voiceAssetId
      },
      data: {
        defaultVoiceAssetId: null
      }
    });
  }

  private toAudioAsset(asset: AudioAssetRecord) {
    return {
      id: asset.id,
      userId: asset.userId,
      type: asset.type,
      typeName: audioAssetTypeName(asset.type),
      storageProvider: asset.storageProvider,
      url: asset.url,
      objectKey: asset.objectKey,
      mimeType: asset.mimeType,
      durationMs: asset.durationMs,
      sizeBytes: asset.sizeBytes,
      sampleRate: asset.sampleRate,
      channels: asset.channels,
      createdAt: asset.createdAt
    };
  }

  private toAudioAssetMetadata(asset: AudioAssetRecord) {
    return {
      ...this.toAudioAsset(asset),
      url: null
    };
  }

  private toAdminAudioModel(model: AdminAudioModelRecord) {
    const capabilityTags = jsonStringArray(model.capabilityTags);
    const aliases = model.aliases
      .filter((alias) => isAudioModelAliasKey(alias.aliasKey))
      .map((alias) => ({
        id: alias.id,
        aliasKey: alias.aliasKey,
        displayName: alias.displayName,
        description: alias.description,
        updatedAt: alias.updatedAt
      }));
    const inputPrice = decimalNumber(model.inputPrice);
    const outputPrice = decimalNumber(model.outputPrice);
    const defaultCharacterPricing = model.pricingMode === "TOKENS" && inputPrice === 0 && outputPrice === 0;

    return {
      id: model.id,
      displayName: model.displayName,
      modelName: model.providerModelName,
      provider: model.providerInstance.providerPreset.providerKey,
      providerName: model.providerInstance.name,
      providerDisplayName: model.providerInstance.providerPreset.displayName,
      providerStatus: model.providerInstance.status,
      baseUrl: model.baseUrl,
      webSocketUrl: model.webSocketUrl,
      region: model.region ?? model.providerInstance.region ?? model.providerInstance.providerPreset.region,
      hasCustomApiKey: Boolean(model.apiKeyEncrypted),
      apiKeyPreview: model.apiKeyEncrypted ? model.apiKeyPreview ?? maskSecretPreview(model.apiKeyEncrypted) : "使用 Provider 默认",
      capabilityTags,
      isEnabled: model.isEnabled,
      statusName: model.isEnabled ? "启用" : "停用",
      inputPrice: inputPrice.toString(),
      outputPrice: outputPrice.toString(),
      pricingMode: defaultCharacterPricing ? "CHARACTERS" : model.pricingMode,
      pricingUnit: defaultCharacterPricing ? "TEN_K_CHARACTERS" : model.pricingUnit,
      pricingConfig: model.pricingConfig,
      aliases,
      defaultPurposes: aliases.map((alias) => alias.displayName),
      supportsSpeechToText: capabilityTags.includes("ASR") || capabilityTags.includes("SPEECH_TO_TEXT"),
      supportsTts: capabilityTags.includes("TTS"),
      supportsVoiceDesign: capabilityTags.includes("VOICE_DESIGN"),
      supportsVoiceClone: capabilityTags.includes("VOICE_CLONE"),
      createdAt: model.createdAt,
      updatedAt: model.updatedAt
    };
  }

  private toVoiceConsent(consent: VoiceConsentRecord | null) {
    return consent
      ? {
          id: consent.id,
          userId: consent.userId,
          voiceAssetId: consent.voiceAssetId,
          sourceAudioAssetId: consent.sourceAudioAssetId,
          consentText: consent.consentText || consent.statement,
          consentType: consent.consentType,
          consentTypeName: voiceConsentTypeName(consent.consentType),
          ownerName: consent.ownerName,
          ownerContact: consent.ownerContact,
          agreedAt: consent.agreedAt,
          ip: consent.ip,
          userAgent: consent.userAgent,
          createdAt: consent.createdAt
        }
      : null;
  }

  private toAdminVoiceAsset(voice: AdminVoiceAssetRecord) {
    return {
      ...this.toVoiceAsset(voice),
      sourceAudioAsset: voice.sourceAudioAsset ? this.toAudioAssetMetadata(voice.sourceAudioAsset) : null,
      sourceSampleFilePath: voice.sourceAudioAssetId ? `/admin/audio/assets/${voice.sourceAudioAssetId}/file` : null,
      user: voice.user,
      consent: this.toVoiceConsent(voice.consent ?? voice.targetConsent ?? null),
      taskCount: voice._count.audioTasks,
      recentTasks: voice.audioTasks.map((task) => ({
        id: task.id,
        type: task.type,
        typeName: audioTaskTypeName(task.type),
        status: task.status,
        statusName: audioTaskStatusName(task.status),
        createdAt: task.createdAt
      })),
      recentUsageLogs: voice.audioUsageLogs.map((log) => this.toAudioUsageLog(log))
    };
  }

  private toVoiceAsset(asset: {
    id: string;
    userId: string;
    provider: string;
    providerVoiceId: string | null;
    name: string;
    type: string;
    targetModel: string;
    status: string;
    visibility: string;
    language: string | null;
    accent?: string | null;
    gender?: string | null;
    ageCategory?: string | null;
    avatarUrl?: string | null;
    description: string | null;
    previewAudioUrl: string | null;
    sourceAudioAsset?: AudioAssetRecord | null;
    previewAudioAsset?: AudioAssetRecord | null;
    consent?: VoiceConsentRecord | null;
    targetConsent?: VoiceConsentRecord | null;
    reviewNote?: string | null;
    disabledReason?: string | null;
    reviewedAt?: Date | null;
    deletedAt?: Date | null;
    isPlatform?: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: asset.id,
      userId: asset.userId,
      provider: asset.provider,
      providerVoiceId: asset.providerVoiceId,
      name: asset.name,
      type: asset.type,
      typeName: voiceTypeName(asset.type),
      targetModel: asset.targetModel,
      status: asset.status,
      statusName: voiceStatusName(asset.status),
      visibility: asset.visibility,
      language: asset.language,
      accent: asset.accent ?? null,
      gender: asset.gender ?? null,
      ageCategory: asset.ageCategory ?? null,
      avatarUrl: asset.avatarUrl ?? null,
      description: asset.description,
      previewAudioUrl: asset.previewAudioUrl,
      sourceAudioAsset: asset.sourceAudioAsset ? this.toAudioAsset(asset.sourceAudioAsset) : null,
      previewAudioAsset: asset.previewAudioAsset ? this.toAudioAsset(asset.previewAudioAsset) : null,
      consent: this.toVoiceConsent(asset.consent ?? asset.targetConsent ?? null),
      reviewNote: asset.reviewNote ?? null,
      disabledReason: asset.disabledReason ?? null,
      reviewedAt: asset.reviewedAt ?? null,
      deletedAt: asset.deletedAt ?? null,
      isPlatform: asset.isPlatform ?? false,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt
    };
  }

  private toAudioTask(task: AudioTaskRecord) {
    const voiceConsent = this.toVoiceConsent(task.voiceAsset?.consent ?? null);

    return {
      id: task.id,
      isVoiceExperience: isVoiceExperienceAudioTask({
        type: task.type,
        providerPayload: task.providerPayload,
        englishGuidedStudyMaterialCount: task._count.englishGuidedStudyMaterials,
        dialogueGenerationId: task.audioDialogueGenerationId,
        isDialogueBilling: Boolean(task.dialogueBillingGeneration)
      }),
      userId: task.userId,
      user: task.user ?? null,
      billingContext: task.billingContext,
      organizationId: task.organizationId,
      organizationMemberId: task.organizationMemberId,
      type: task.type,
      typeName: audioTaskTypeName(task.type),
      status: task.status,
      statusName: audioTaskStatusName(task.status),
      provider: task.provider,
      model: task.model,
      providerInstanceId: task.providerInstanceId,
      modelInstanceId: task.modelInstanceId,
      voiceAssetId: task.voiceAssetId,
      inputText: task.inputText,
      inputTextLength: task.inputTextLength,
      sourceAudioAssetId: task.sourceAudioAssetId,
      outputAudioAssetId: task.outputAudioAssetId,
      estimatedCredits: task.estimatedCredits,
      actualCredits: task.actualCredits,
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
      requestId: task.requestId,
      providerPayload: stripDialogueAudioCache(task.providerPayload) as Prisma.JsonValue | null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      finishedAt: task.finishedAt,
      voiceAsset: task.voiceAsset
        ? {
            ...task.voiceAsset,
            consent: voiceConsent
          }
        : null,
      voiceConsent,
      sourceAudioAsset: task.sourceAudioAsset ? this.toAudioAsset(task.sourceAudioAsset) : null,
      outputAudioAsset: task.outputAudioAsset ? this.toAudioAsset(task.outputAudioAsset) : null,
      reservation: task.reservation
        ? {
            id: task.reservation.id,
            amount: task.reservation.amount,
            status: task.reservation.status,
            statusName: reservationStatusName(task.reservation.status),
            expiresAt: task.reservation.expiresAt
          }
        : null,
      ledgerEntries: task.ledgerEntries?.map((entry) => ({
        id: entry.id,
        type: entry.type,
        typeName: ledgerTypeName(entry.type),
        amount: entry.amount,
        balanceAfter: entry.balanceAfter,
        relatedTaskId: entry.relatedTaskId,
        relatedAudioTaskId: entry.relatedAudioTaskId,
        relatedTaskType: entry.relatedTaskType,
        operationType: entry.operationType,
        operationTypeName: entry.operationType ? audioTaskTypeName(entry.operationType) : null,
        note: entry.note,
        createdAt: entry.createdAt
      })) ?? [],
      usageLogs: task.usageLogs?.map((log) => this.toAudioUsageLog(log)) ?? []
    };
  }

  private toAdminAudioTask(task: AudioTaskRecord) {
    return {
      ...this.toAudioTask(task),
      sourceAudioAsset: task.sourceAudioAsset ? this.toAudioAssetMetadata(task.sourceAudioAsset) : null,
      sourceSampleFilePath: task.sourceAudioAssetId ? `/admin/audio/assets/${task.sourceAudioAssetId}/file` : null
    };
  }

  private toAudioUsageLog(log: NonNullable<AudioTaskRecord["usageLogs"]>[number]) {
    return {
      id: log.id,
      taskId: log.taskId,
      userId: log.userId,
      provider: log.provider,
      model: log.model,
      providerInstanceId: log.providerInstanceId,
      modelInstanceId: log.modelInstanceId,
      voiceAssetId: log.voiceAssetId,
      operationType: log.operationType,
      operationTypeName: audioTaskTypeName(log.operationType),
      characterCount: log.characterCount,
      audioDurationMs: log.audioDurationMs,
      usageCount: log.usageCount,
      latencyMs: log.latencyMs,
      success: log.success,
      estimatedCost: decimalNumber(log.estimatedCost),
      consumedCredits: log.consumedCredits,
      providerRequestId: log.providerRequestId,
      createdAt: log.createdAt
    };
  }

  private toAdminOperationLog(log: {
    id: string;
    adminUserId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    description: string;
    ip: string | null;
    userAgent: string | null;
    createdAt: Date;
    adminUser?: {
      id: string;
      email: string;
      name: string;
    } | null;
  }) {
    return {
      id: log.id,
      adminUserId: log.adminUserId,
      adminUser: log.adminUser ?? null,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      description: log.description,
      ip: log.ip,
      userAgent: log.userAgent,
      createdAt: log.createdAt
    };
  }

  private async listAdminOperationLogs(resourceType: string, resourceId: string) {
    const logs = await this.prisma.adminOperationLog.findMany({
      where: {
        resourceType,
        resourceId
      },
      include: {
        adminUser: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });

    return logs.map((log) => this.toAdminOperationLog(log));
  }
}

export class AudioProviderException extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly terminal = false
  ) {
    super(message);
  }
}

export function audioProviderErrorCode(error: unknown) {
  const visited = new Set<unknown>();
  let current = error;

  while (current && !visited.has(current)) {
    visited.add(current);

    if (current instanceof AudioProviderException) {
      return current.code;
    }

    if (typeof current !== "object") {
      return null;
    }

    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) {
      return code.trim();
    }

    current = (current as { cause?: unknown }).cause;
  }

  return null;
}

export function isRetryableAudioProviderError(error: unknown) {
  if (error instanceof AudioProviderException && error.terminal) {
    return false;
  }

  const code = (audioProviderErrorCode(error) ?? "").toUpperCase();
  const message = error instanceof Error ? error.message.toUpperCase() : "";
  const networkSignal = `${code} ${message}`;

  return (
    code === "PROVIDER_TIMEOUT" ||
    code === "PROVIDER_NETWORK_ERROR" ||
    /EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|SOCKET HANG UP|AI GATEWAY 请求等待超时/.test(networkSignal) ||
    code.includes("HTTP_429") ||
    code.includes("HTTP_500") ||
    code.includes("HTTP_502") ||
    code.includes("HTTP_503") ||
    code.includes("THROTTL") ||
    code.includes("RATE_LIMIT")
  );
}

interface TtsParameters {
  speed?: number;
  pitch?: number;
  volume?: number;
  format: string;
  sampleRate?: number;
}

function activeAudioModelInclude() {
  return {
    modelPreset: true,
    providerInstance: {
      include: {
        providerPreset: true,
        credential: true
      }
    }
  } satisfies Prisma.AiModelInstanceInclude;
}

function adminAudioModelInclude() {
  return {
    modelPreset: true,
    aliases: true,
    providerInstance: {
      include: {
        providerPreset: true
      }
    }
  } satisfies Prisma.AiModelInstanceInclude;
}

function adminVoiceAssetInclude() {
  return {
    user: {
      select: {
        id: true,
        email: true,
        nickname: true
      }
    },
    sourceAudioAsset: true,
    previewAudioAsset: true,
    consent: true,
    targetConsent: true,
    audioTasks: {
      orderBy: {
        createdAt: "desc"
      },
      take: 5,
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true
      }
    },
    audioUsageLogs: {
      orderBy: {
        createdAt: "desc"
      },
      take: 5
    },
    _count: {
      select: {
        audioTasks: true
      }
    }
  } satisfies Prisma.VoiceAssetInclude;
}

function audioTaskInclude() {
  return {
    dialogueBillingGeneration: { select: { id: true } },
    _count: {
      select: {
        englishGuidedStudyMaterials: true
      }
    },
    voiceAsset: {
      select: {
        id: true,
        name: true,
        providerVoiceId: true,
        targetModel: true,
        status: true,
        visibility: true,
        consent: true
      }
    },
    sourceAudioAsset: true,
    outputAudioAsset: true,
    reservation: true,
    ledgerEntries: {
      orderBy: {
        createdAt: "desc"
      },
      take: 5
    },
    usageLogs: {
      orderBy: {
        createdAt: "desc"
      },
      take: 5
    }
  } satisfies Prisma.AudioTaskInclude;
}

export function localAudioStream(filepath: string) {
  return createReadStream(filepath);
}

function normalizeTtsParameters(dto: CreateTtsAudioTaskDto | ExternalBillingTtsTaskInput): TtsParameters {
  return {
    speed: clampNumber(dto.speed, 0.5, 2),
    pitch: clampNumber(dto.pitch, -500, 500),
    volume: clampNumber(dto.volume, 0, 2),
    format: audioOutputFormat(dto.format),
    sampleRate: dto.sampleRate
  };
}

function clampNumber(value: number | undefined, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(max, Math.max(min, value));
}

function audioOutputFormat(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  return normalized && ["mp3", "wav", "opus"].includes(normalized) ? normalized : "mp3";
}

function extractProviderVoiceId(payload: Record<string, unknown>) {
  const direct = stringValue(payload.providerVoiceId) ?? stringValue(payload.voice_id) ?? stringValue(payload.voiceId);
  const output = typeof payload.output === "object" && payload.output ? (payload.output as Record<string, unknown>) : null;

  return direct ?? stringValue(output?.voice_id) ?? stringValue(output?.voiceId);
}

function normalizeElevenLabsDefaultVoice(value: unknown): ElevenLabsDefaultVoice | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const providerVoiceId = stringValue(value.providerVoiceId);
  const name = stringValue(value.name);

  if (!providerVoiceId || !name) {
    return null;
  }

  return {
    providerVoiceId,
    name,
    description: stringValue(value.description),
    previewAudioUrl: stringValue(value.previewAudioUrl),
    language: stringValue(value.language)
  };
}

function extractAudioUrl(payload: Record<string, unknown>) {
  const direct = stringValue(payload.audioUrl) ?? stringValue(payload.previewAudioUrl);
  const output = typeof payload.output === "object" && payload.output ? (payload.output as Record<string, unknown>) : null;
  const audio = typeof output?.audio === "object" && output.audio ? (output.audio as Record<string, unknown>) : null;

  return direct ?? stringValue(output?.url) ?? stringValue(audio?.url);
}

function sanitizeVoiceDesignProviderPayload(payload: Record<string, unknown>, previewAudioUrl?: string | null) {
  const safePayload = { ...payload };
  const output = jsonObject(safePayload.output);
  const previewAudio = jsonObject(output?.preview_audio);

  delete safePayload.audioBase64;

  if (previewAudio) {
    delete previewAudio.data;
  }

  if (output && previewAudio) {
    output.preview_audio = previewAudio;
    safePayload.output = output;
  }

  if (previewAudioUrl) {
    safePayload.previewAudioUrl = previewAudioUrl;
  }

  return safePayload;
}

function extractAsrSubtitleText(payload: Record<string, unknown>) {
  const output = typeof payload.output === "object" && payload.output ? (payload.output as Record<string, unknown>) : null;
  const transcript = typeof output?.transcript === "object" && output.transcript ? (output.transcript as Record<string, unknown>) : null;

  return (
    stringValue(payload.subtitleText) ??
    stringValue(payload.srtText) ??
    stringValue(payload.srt) ??
    stringValue(output?.subtitleText) ??
    stringValue(output?.srtText) ??
    stringValue(output?.srt) ??
    stringValue(transcript?.subtitleText) ??
    stringValue(transcript?.srtText) ??
    stringValue(transcript?.srt)
  );
}

function extractAsrPunctuatedText(payload: Record<string, unknown>) {
  const output = jsonObject(payload.output);
  const transcript = jsonObject(output?.transcript);

  return (
    stringValue(payload.punctuatedText) ??
    stringValue(payload.punctuated_text) ??
    stringValue(output?.punctuatedText) ??
    stringValue(output?.punctuated_text) ??
    stringValue(transcript?.punctuatedText) ??
    stringValue(transcript?.punctuated_text) ??
    ""
  );
}

function extractAsrRecordArray(payload: Record<string, unknown>, key: "sentenceSubtitles" | "wordTimeline") {
  const output = jsonObject(payload.output);
  const transcript = jsonObject(output?.transcript);

  return recordArrayValue(payload[key]) ?? recordArrayValue(output?.[key]) ?? recordArrayValue(transcript?.[key]) ?? [];
}

function asrTaskState(payload: Record<string, unknown>): "PENDING" | "SUCCEEDED" {
  return stringValue(payload.status)?.toUpperCase() === "SUCCEEDED" ? "SUCCEEDED" : "PENDING";
}

function recordArrayValue(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter(isPlainRecord);
}

function providerErrorMessage(error: unknown) {
  if (error instanceof AppException) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "语音任务执行失败";
}

function audioGatewayErrorDetail(
  payload: Record<string, unknown> | null,
  status: number,
  path: string,
  fallbackMessage: string
) {
  const detail = jsonObject(payload?.detail);
  const terminal = detail?.terminal === true || payload?.terminal === true;
  const errorCode =
    stringValue(detail?.errorCode) ??
    stringValue(detail?.error_code) ??
    stringValue(payload?.errorCode) ??
    stringValue(payload?.error_code) ??
    `AUDIO_PROVIDER_HTTP_${status}`;
  const errorMessage =
    stringValue(detail?.errorMessage) ??
    stringValue(detail?.error_message) ??
    stringValue(detail?.message) ??
    stringValue(payload?.errorMessage) ??
    stringValue(payload?.error_message) ??
    stringValue(payload?.message);

  if (errorMessage) {
    return {
      errorCode,
      errorMessage,
      terminal
    };
  }

  const plainDetail = stringValue(payload?.detail);

  if (status === 404 && path.startsWith("/audio/")) {
    return {
      errorCode: "AI_GATEWAY_AUDIO_ROUTE_NOT_FOUND",
      errorMessage: `AI Gateway 语音接口不可用：请确认 ${gatewayBaseUrl()} 运行的是 apps/ai-gateway，并且 /audio/health 可以访问。`,
      terminal: false
    };
  }

  return {
    errorCode,
    errorMessage: plainDetail ? `AI Gateway 返回错误：${plainDetail}` : fallbackMessage,
    terminal
  };
}

function audioAliasName(aliasKey: string) {
  const names: Record<string, string> = {
    "speech-to-text": "语音转文字模型",
    "tts-default": "默认语音合成模型",
    "tts-fast": "快速语音合成模型",
    "voice-clone-default": "默认声音复刻模型",
    "voice-design-default": "默认声音设计模型",
    "audio-preview": "音频预览模型"
  };

  return names[aliasKey] ?? aliasKey;
}

function isAudioModelAliasKey(value: string): value is (typeof audioModelAliases)[number] {
  return audioModelAliases.includes(value as (typeof audioModelAliases)[number]);
}

function audioAliasRequiredCapability(aliasKey: (typeof audioModelAliases)[number]) {
  const capabilities: Record<(typeof audioModelAliases)[number], string | null> = {
    "speech-to-text": "ASR",
    "tts-default": "TTS",
    "tts-fast": "TTS",
    "voice-clone-default": "VOICE_CLONE",
    "voice-design-default": "VOICE_DESIGN",
    "audio-preview": null
  };

  return capabilities[aliasKey];
}

function isAudioAdapterType(value: unknown): value is (typeof audioAdapterTypes)[number] {
  return typeof value === "string" && audioAdapterTypes.includes(value as (typeof audioAdapterTypes)[number]);
}

function isAudioProviderPreset<T extends { adapterType?: string | null; providerKey?: string | null; modality?: string | null }>(
  preset: T | null | undefined
): preset is T & { adapterType: (typeof audioAdapterTypes)[number] | "OPENAI_COMPATIBLE" } {
  return Boolean(
    (isAudioAdapterType(preset?.adapterType) && preset?.modality === "AUDIO") ||
    (preset?.providerKey === abeiaiAudioProviderKey && preset?.adapterType === "OPENAI_COMPATIBLE" && preset?.modality === "AUDIO")
  );
}

export function isVoiceAssetCompatibleWithModel(
  asset: {
    provider: string;
    targetModel: string;
  },
  model: ActiveAudioModel
) {
  if (asset.provider === model.providerKey && asset.targetModel === model.modelName) {
    return true;
  }

  if (
    asset.provider === "minimax_audio" &&
    model.providerKey === "minimax_audio" &&
    model.adapterType === "MINIMAX_AUDIO" &&
    asset.targetModel === "minimax-voice-design"
  ) {
    return model.modelName === "speech-2.8-hd" || model.modelName === "speech-2.8-turbo";
  }

  return (
    asset.provider === "elevenlabs_audio" &&
    model.providerKey === "elevenlabs_audio" &&
    model.adapterType === "ELEVENLABS_AUDIO" &&
    ["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5"].includes(model.modelName)
  );
}

export function preferredTtsModelsForVoiceAsset(asset: { provider: string; targetModel: string }) {
  if (asset.provider === "minimax_audio" && asset.targetModel === "minimax-voice-design") {
    return ["speech-2.8-turbo", "speech-2.8-hd"];
  }

  if (asset.provider === "elevenlabs_audio") {
    return ["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5"];
  }

  return asset.targetModel ? [asset.targetModel] : [];
}

export function isVoiceExperienceAudioTask(input: {
  type: string;
  providerPayload: unknown;
  englishGuidedStudyMaterialCount: number;
  dialogueGenerationId?: string | null;
  isDialogueBilling?: boolean;
}) {
  const providerPayload = jsonObject(input.providerPayload);
  const belongsToPersistedExperience = Boolean(
    providerPayload && Object.prototype.hasOwnProperty.call(providerPayload, "videoGuidePersistence")
  );

  return input.type === "TTS"
    && stringValue(providerPayload?.source) === "EXPERIENCE"
    && input.englishGuidedStudyMaterialCount === 0
    && !belongsToPersistedExperience
    && !input.dialogueGenerationId
    && !input.isDialogueBilling
    && !providerPayload?.dialogueProjectId;
}

export function assertTtsTextLimitForModel(
  text: string,
  model: Pick<ActiveAudioModel, "adapterType" | "modelName">
) {
  const limit = model.modelName === "IndexTTS-2.5"
    ? 7_000
    : model.adapterType === "ELEVENLABS_AUDIO" && model.modelName === "eleven_v3" ? 5_000 : 8_000;

  if (text.length > limit) {
    const modelName = model.modelName === "eleven_v3" ? "Eleven v3" : model.modelName;
    throw new AppException(40001, `${modelName} 单次最多合成 ${limit} 个字符`, HttpStatus.BAD_REQUEST);
  }
}

function defaultAudioModelPricing(capabilityTags: string[]) {
  if (capabilityTags.includes("ASR") || capabilityTags.includes("SPEECH_TO_TEXT")) {
    return {
      inputPrice: "0.0002",
      outputPrice: "0",
      pricingMode: "SECONDS",
      pricingUnit: "SECOND"
    };
  }

  if (capabilityTags.includes("TTS")) {
    return {
      inputPrice: "1",
      outputPrice: "0",
      pricingMode: "CHARACTERS",
      pricingUnit: "TEN_K_CHARACTERS"
    };
  }

  return {
    inputPrice: "0",
    outputPrice: "0",
    pricingMode: "REQUEST",
    pricingUnit: "REQUEST"
  };
}

function uploadDriver() {
  const driver = (process.env.UPLOAD_DRIVER ?? "local").trim().toLowerCase();

  return driver === "s3" || driver === "s3-compatible" ? "s3" : "local";
}

function audioUploadDir() {
  return resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads"), "audio");
}

function publicApiBaseUrl() {
  return (process.env.PUBLIC_API_BASE_URL ?? process.env.API_PUBLIC_BASE_URL ?? "http://localhost:3322/api").replace(/\/+$/, "");
}

function audioExtensionFor(originalName: string, mimeType: string) {
  const extension = extname(originalName).toLowerCase();

  if ([".mp3", ".wav", ".webm", ".ogg", ".aac", ".m4a", ".mp4"].includes(extension)) {
    return extension;
  }

  const byMimeType: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/aac": ".aac",
    "audio/mp4": ".m4a",
    "video/mp4": ".mp4"
  };

  return byMimeType[mimeType] ?? ".bin";
}

function mimeTypeFromAudioUrl(url: string) {
  const pathname = safePathname(url);

  if (pathname.endsWith(".wav")) {
    return "audio/wav";
  }

  if (pathname.endsWith(".webm")) {
    return "audio/webm";
  }

  if (pathname.endsWith(".ogg") || pathname.endsWith(".opus")) {
    return "audio/ogg";
  }

  return "audio/mpeg";
}

function safePathname(url: string) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function s3Config() {
  const endpoint = requiredEnv("S3_ENDPOINT");
  const bucket = requiredEnv("S3_BUCKET");
  const region = process.env.S3_REGION || "auto";
  const accessKeyId = requiredEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("S3_SECRET_ACCESS_KEY");
  const prefixInput = (process.env.S3_KEY_PREFIX ?? "uploads/").replace(/^\/+/, "");
  const prefix = `${prefixInput && !prefixInput.endsWith("/") ? `${prefixInput}/` : prefixInput}audio/`;

  return {
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL?.trim() ||
      process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL?.trim() ||
      "",
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "0",
    prefix
  };
}

function englishReadAlongUploadPrefix() {
  const narrationPrefixInput = (
    process.env.VIDEO_GUIDE_R2_NARRATION_PREFIX ?? "video-guide/narration/"
  ).replace(/^\/+/, "");
  const narrationPrefix = narrationPrefixInput && !narrationPrefixInput.endsWith("/")
    ? `${narrationPrefixInput}/`
    : narrationPrefixInput;
  const prefixInput = (
    process.env.ENGLISH_GUIDED_STUDY_READ_ALONG_R2_PREFIX ??
    `${narrationPrefix}english-guided-study/read-along-upload/`
  ).replace(/^\/+/, "");

  return prefixInput && !prefixInput.endsWith("/") ? `${prefixInput}/` : prefixInput;
}

function signedAudioUrlForTranscription(mediaUrl: string) {
  const config = s3Config();
  const publicBaseUrl = config.publicBaseUrl.trim();

  if (!publicBaseUrl) {
    return mediaUrl;
  }

  let sourceUrl: URL;
  let publicUrl: URL;

  try {
    sourceUrl = new URL(mediaUrl);
    publicUrl = new URL(publicBaseUrl);
  } catch {
    return mediaUrl;
  }

  const publicPath = publicUrl.pathname.replace(/\/+$/, "");
  if (
    sourceUrl.origin !== publicUrl.origin ||
    (publicPath && sourceUrl.pathname !== publicPath && !sourceUrl.pathname.startsWith(`${publicPath}/`))
  ) {
    return mediaUrl;
  }

  const objectKey = sourceUrl.pathname.slice(publicPath.length).replace(/^\/+/, "");
  if (!objectKey) {
    return mediaUrl;
  }

  const endpoint = config.endpoint.replace(/\/+$/, "");
  const objectUrl = config.pathStyle
    ? `${endpoint}/${config.bucket}/${objectKey}`
    : `${endpoint.replace("://", `://${config.bucket}.`)}/${objectKey}`;

  return presignS3GetUrl({
    accessKeyId: config.accessKeyId,
    expiresSeconds: 7200,
    region: config.region,
    secretAccessKey: config.secretAccessKey,
    url: objectUrl
  });
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new AppException(50001, `对象存储配置缺失：${name}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  return value;
}

function amzTimestamp(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
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
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
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

function defaultAudioSafetySettings() {
  return {
    audioVoiceCloneReviewRequired: true,
    audioVoiceDesignReviewRequired: false,
    audioUserPublicVoiceEnabled: false,
    audioCloneDefaultVisibility: "PRIVATE",
    audioDesignDefaultVisibility: "PRIVATE",
    audioSafetyNotice:
      "AI 生成语音可能被误用，请勿用于冒充他人、诈骗、侵权、虚假宣传或违法违规用途。声音复刻仅允许上传本人声音或已获得授权的声音。生成音频建议标注为 AI 生成语音。",
    audioCloneConsentText:
      "我确认上传的音频为本人声音，或我已获得声音权利人的明确授权。我承诺不会将该音色用于冒充他人、诈骗、侵权、虚假宣传或其他违法违规用途。",
    audioDownloadNotice: "下载或对外使用生成音频前，请确认用途合法合规，并建议标注为 AI 生成语音。"
  } as const;
}

function booleanConfig(value: string | undefined, fallback: boolean) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

function visibilityConfig(value: string | undefined, fallback: string) {
  return value === "PRIVATE" || value === "ADMIN_ONLY" || value === "PUBLIC" ? value : fallback;
}

function defaultVoiceVisibility(value: string, publicEnabled: boolean) {
  if (value === "PUBLIC" && publicEnabled) {
    return "PUBLIC";
  }

  if (value === "ADMIN_ONLY") {
    return "ADMIN_ONLY";
  }

  return "PRIVATE";
}

function moderationUpdateData(action: VoiceAssetModerationAction, reason: string | null, adminUserId: string) {
  const now = new Date();

  if (action === "APPROVE") {
    return {
      status: "READY" as const,
      reviewedByAdminId: adminUserId,
      reviewedAt: now,
      reviewNote: reason ?? "审核通过",
      disabledReason: null
    };
  }

  if (action === "REJECT") {
    return {
      status: "REJECTED" as const,
      reviewedByAdminId: adminUserId,
      reviewedAt: now,
      reviewNote: reason,
      disabledReason: reason
    };
  }

  return {
    status: "DISABLED" as const,
    reviewedByAdminId: adminUserId,
    reviewedAt: now,
    reviewNote: reason,
    disabledReason: reason
  };
}

function quoteFromAudioModelPricing(
  model: ActiveAudioModel,
  input: {
    characterCount?: number;
    audioDurationMs?: number | null;
    usageCount?: number;
  },
  creditsPerCny: number
): AudioPricingQuote | null {
  const pricingMode = normalizePricingMode(model.pricingMode);
  const pricingUnit = normalizePricingUnit(model.pricingUnit, pricingMode);
  const pricePerUnit = Math.max(0, model.inputPrice);
  let billingMode: AudioBillingMode;
  let usageCount: number;
  let unitSize: number;

  if (model.modelName === "qwen-audio-3.1-tts-flash" && pricingMode === "TOKENS") {
    if (input.characterCount === undefined) return null;
    const tokens = estimateQwenAudioTokenUsage(input.characterCount);
    const estimatedCost = qwenAudioTokenCost(tokens, model.inputPrice, model.outputPrice);
    return {
      ruleId: `model:${model.modelInstanceId}`,
      pricingSource: "MODEL",
      billingMode: "PER_TASK",
      creditsPerUnit: 0,
      minimumCredits: estimatedCost > 0 ? 1 : 0,
      modelMultiplier: 1,
      pricingMode: "TOKENS",
      pricingUnit: "M_TOKENS",
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
      creditsPerCny,
      estimatedCost: Number(estimatedCost.toFixed(6)),
      usageCount: tokens.inputTokens + tokens.outputTokens,
      estimatedCredits: Math.ceil(estimatedCost * creditsPerCny)
    };
  }

  if (pricingMode === "CHARACTERS") {
    if (input.characterCount === undefined) {
      return null;
    }

    billingMode = "PER_CHARACTER";
    usageCount = Math.max(0, Math.ceil(input.characterCount ?? 0));
    unitSize = audioModelPricingUnitSize(pricingUnit);
  } else if (pricingMode === "REQUEST") {
    billingMode = "PER_TASK";
    usageCount = Math.max(1, Math.ceil(input.usageCount ?? 1));
    unitSize = 1;
  } else if (pricingMode === "SECONDS") {
    billingMode = "PER_SECOND";
    const durationSeconds = Math.ceil(Math.max(0, input.audioDurationMs ?? 0) / 1000);
    usageCount = Math.max(1, durationSeconds || Math.ceil(input.usageCount ?? 1));
    unitSize = 1;
  } else {
    return null;
  }

  const pricing = calculateModelPricingCredits({
    usageCount,
    pricePerUnit,
    unitSize,
    creditsPerCny
  });

  return {
    ruleId: `model:${model.modelInstanceId}`,
    pricingSource: "MODEL",
    billingMode,
    creditsPerUnit: 0,
    minimumCredits: pricing.minimumCredits,
    modelMultiplier: 1,
    pricingMode,
    pricingUnit,
    pricePerUnit,
    unitSize,
    creditsPerCny,
    estimatedCost: pricing.estimatedCost,
    usageCount,
    estimatedCredits: pricing.credits
  };
}

function pricingSnapshot(quote: AudioPricingQuote) {
  return {
    ruleId: quote.ruleId,
    pricingSource: quote.pricingSource,
    billingMode: quote.billingMode,
    creditsPerUnit: quote.creditsPerUnit,
    minimumCredits: quote.minimumCredits,
    modelMultiplier: quote.modelMultiplier,
    pricingMode: quote.pricingMode,
    pricingUnit: quote.pricingUnit,
    pricePerUnit: quote.pricePerUnit,
    inputPrice: quote.inputPrice,
    outputPrice: quote.outputPrice,
    unitSize: quote.unitSize,
    creditsPerCny: quote.creditsPerCny,
    estimatedCost: quote.estimatedCost,
    usageCount: quote.usageCount,
    estimatedCredits: quote.estimatedCredits
  };
}

function pricingSnapshotFromTask(value: Prisma.JsonValue | null): AudioPricingQuote | null {
  const root = jsonObject(value);
  const pricing = jsonObject(root?.pricing);
  const billingMode = stringValue(pricing?.billingMode);

  if (!pricing || !isBillingMode(billingMode)) {
    return null;
  }

  return {
    ruleId: stringValue(pricing.ruleId) ?? "",
    pricingSource: stringValue(pricing.pricingSource) === "MODEL" ? "MODEL" : "RULE",
    billingMode,
    creditsPerUnit: numberValue(pricing.creditsPerUnit) ?? 0,
    minimumCredits: numberValue(pricing.minimumCredits) ?? 0,
    modelMultiplier: numberValue(pricing.modelMultiplier) ?? 1,
    pricingMode: pricing.pricingMode ? normalizePricingMode(pricing.pricingMode) : undefined,
    pricingUnit: pricing.pricingUnit ? normalizePricingUnit(pricing.pricingUnit, pricing.pricingMode) : undefined,
    pricePerUnit: numberValue(pricing.pricePerUnit) ?? undefined,
    inputPrice: numberValue(pricing.inputPrice) ?? undefined,
    outputPrice: numberValue(pricing.outputPrice) ?? undefined,
    unitSize: numberValue(pricing.unitSize) ?? undefined,
    creditsPerCny: numberValue(pricing.creditsPerCny) ?? undefined,
    estimatedCost: numberValue(pricing.estimatedCost) ?? undefined,
    usageCount: numberValue(pricing.usageCount) ?? 1,
    estimatedCredits: numberValue(pricing.estimatedCredits) ?? 0
  };
}

function calculateActualCreditsFromTask(
  task: {
    type: AudioTaskType;
    inputText: string | null;
    inputTextLength: number;
    estimatedCredits: number;
    providerPayload: Prisma.JsonValue | null;
  },
  providerPayload: Record<string, unknown>
) {
  const snapshot = pricingSnapshotFromTask(task.providerPayload);

  if (!snapshot) {
    return task.estimatedCredits;
  }

  if (snapshot.pricingSource === "MODEL" && snapshot.pricingMode === "TOKENS") {
    return confirmedQwenAudioCredits(
      providerPayload,
      snapshot.inputPrice ?? 0,
      snapshot.outputPrice ?? 0,
      snapshot.creditsPerCny ?? 100,
      task.estimatedCredits
    );
  }

  const characterCount = billableCharacterCountForTask(task, providerPayload);
  const usageCount = usageCountForPricingSnapshot(snapshot, {
    characterCount,
    audioDurationMs: extractAudioDurationMs(providerPayload),
    usageCount: snapshot.usageCount
  });

  if (snapshot.pricingSource === "MODEL") {
    return calculateModelPricingCredits({
      usageCount,
      pricePerUnit: snapshot.pricePerUnit ?? 0,
      unitSize: snapshot.unitSize ?? 1,
      creditsPerCny: snapshot.creditsPerCny ?? 100
    }).credits;
  }

  return calculatePricingCredits({
    usageCount,
    creditsPerUnit: snapshot.creditsPerUnit,
    minimumCredits: snapshot.minimumCredits,
    modelMultiplier: snapshot.modelMultiplier
  });
}

function calculatePricingCredits(input: {
  usageCount: number;
  creditsPerUnit: number;
  minimumCredits: number;
  modelMultiplier: number;
}) {
  const raw = input.usageCount * Math.max(0, input.creditsPerUnit) * Math.max(0, input.modelMultiplier);

  return Math.ceil(Math.max(input.minimumCredits, raw));
}

function calculateModelPricingCredits(input: {
  usageCount: number;
  pricePerUnit: number;
  unitSize: number;
  creditsPerCny: number;
}) {
  const safeUnitSize = Math.max(1, input.unitSize);
  const safeUsageCount = Math.max(0, input.usageCount);
  const estimatedCost = (safeUsageCount / safeUnitSize) * Math.max(0, input.pricePerUnit);
  const minimumCredits = estimatedCost > 0 ? 1 : 0;
  const credits = Math.ceil(Math.max(minimumCredits, estimatedCost * Math.max(0, input.creditsPerCny)));

  return {
    estimatedCost: Number(estimatedCost.toFixed(6)),
    minimumCredits,
    credits
  };
}

function actualEstimatedCostFromSnapshot(snapshot: AudioPricingQuote | null, usageCount: number, providerPayload: Record<string, unknown>) {
  if (snapshot?.pricingSource !== "MODEL") {
    return null;
  }

  if (snapshot.pricingMode === "TOKENS") {
    const tokens = extractQwenAudioTokenUsage(providerPayload);
    return tokens
      ? qwenAudioTokenCost(tokens, snapshot.inputPrice ?? 0, snapshot.outputPrice ?? 0)
      : snapshot.estimatedCost ?? null;
  }

  return calculateModelPricingCredits({
    usageCount,
    pricePerUnit: snapshot.pricePerUnit ?? 0,
    unitSize: snapshot.unitSize ?? 1,
    creditsPerCny: snapshot.creditsPerCny ?? 100
  }).estimatedCost;
}

function usageCountForPricingSnapshot(
  snapshot: AudioPricingQuote,
  input: {
    characterCount?: number;
    audioDurationMs?: number | null;
    usageCount?: number;
  }
) {
  if (snapshot.pricingSource === "MODEL" && snapshot.pricingMode === "CHARACTERS") {
    return Math.max(0, Math.ceil(input.characterCount ?? 0));
  }

  if (snapshot.pricingSource === "MODEL" && snapshot.pricingMode === "SECONDS") {
    const durationSeconds = Math.ceil(Math.max(0, input.audioDurationMs ?? 0) / 1000);
    return Math.max(1, durationSeconds || Math.ceil(input.usageCount ?? 1));
  }

  return usageCountForBilling(snapshot.billingMode, input);
}

function audioModelPricingUnitSize(unit: AiModelPricingUnit) {
  if (unit === "TEN_K_CHARACTERS") {
    return 10_000;
  }

  if (unit === "K_CHARACTERS") {
    return 1_000;
  }

  return 1;
}

function usageCountForBilling(
  billingMode: AudioBillingMode | undefined,
  input: {
    characterCount?: number;
    audioDurationMs?: number | null;
    usageCount?: number;
  }
) {
  if (billingMode === "PER_CHARACTER") {
    return Math.max(1, Math.ceil(Math.max(0, input.characterCount ?? 0) / 100));
  }

  if (billingMode === "PER_SECOND") {
    return Math.max(1, Math.ceil(Math.max(0, input.audioDurationMs ?? 0) / 1000));
  }

  return Math.max(1, Math.ceil(Math.max(1, input.usageCount ?? 1)));
}

function billableCharacterCountForTask(
  task: {
    inputText: string | null;
    inputTextLength: number;
  },
  providerPayload: Record<string, unknown>
) {
  const providerCharacters = extractProviderCharacterCount(providerPayload);

  if (providerCharacters !== null) {
    return providerCharacters;
  }

  const estimatedCharacters = task.inputText ? estimatedTtsBillingCharacters(task.inputText) : 0;

  return estimatedCharacters > 0 ? estimatedCharacters : task.inputTextLength;
}

function estimatedTtsBillingCharacters(text: string) {
  let count = 0;

  for (const char of text) {
    count += (char.codePointAt(0) ?? 0) <= 0x7f ? 1 : 2;
  }

  return count;
}

function ttsGatewayTimeoutMs(text: string) {
  const billableCharacters = estimatedTtsBillingCharacters(text);
  const extraBlocks = Math.ceil(Math.max(0, billableCharacters - 400) / 500);

  return Math.min(120_000, 45_000 + extraBlocks * 15_000);
}

function asrGatewayTimeoutMs() {
  const value = Number(process.env.ASR_GATEWAY_TIMEOUT_MS ?? 600_000);

  return Number.isFinite(value) && value >= 60_000 ? Math.min(Math.round(value), 600_000) : 600_000;
}

function asrGatewayRequestTimeoutMs() {
  const value = Number(process.env.ASR_GATEWAY_REQUEST_TIMEOUT_MS ?? 60_000);

  return Number.isFinite(value) && value >= 10_000 ? Math.min(Math.round(value), 120_000) : 60_000;
}

function extractProviderCharacterCount(payload: Record<string, unknown>) {
  const usage = jsonObject(payload.usage);
  const providerUsage = jsonObject(payload.providerUsage) ?? jsonObject(usage?.providerUsage);
  const raw = jsonObject(payload.raw);
  const rawUsage = jsonObject(raw?.usage);
  const output = jsonObject(payload.output);
  const outputUsage = jsonObject(output?.usage);
  const candidates = [
    providerUsage?.characters,
    providerUsage?.characterCount,
    usage?.characters,
    usage?.characterCount,
    usage?.inputCharacters,
    usage?.totalCharacters,
    rawUsage?.characters,
    rawUsage?.characterCount,
    outputUsage?.characters,
    outputUsage?.characterCount,
    payload.characters,
    payload.characterCount
  ];

  for (const candidate of candidates) {
    const value = numberValue(candidate);

    if (value !== null && value >= 0) {
      return Math.ceil(value);
    }
  }

  return null;
}

function parseCreditsPerCny(value: string | null | undefined) {
  const fallback = 100;
  const normalized = value?.trim();

  if (!normalized) {
    return fallback;
  }

  const numbers = normalized.match(/\d+(?:\.\d+)?/g)?.map(Number).filter((item) => Number.isFinite(item) && item > 0) ?? [];

  if (numbers.length >= 2) {
    return numbers[1] / numbers[0];
  }

  return numbers[0] ?? fallback;
}

function mergeProviderPayload(existing: Prisma.JsonValue | null, providerPayload: Record<string, unknown>) {
  const existingObject = jsonObject(existing) ?? {};
  const safeProviderPayload = { ...providerPayload };
  delete safeProviderPayload.audioBase64;

  return {
    ...existingObject,
    ...safeProviderPayload,
    pricing: existingObject.pricing ?? providerPayload.pricing
  };
}

function extractProviderRequestId(payload: Record<string, unknown>) {
  return stringValue(payload.requestId) ?? stringValue(payload.request_id);
}

function extractLatencyMs(payload: Record<string, unknown>) {
  return numberValue(payload.latencyMs) ?? numberValue(payload.latency_ms) ?? null;
}

function extractAudioDurationMs(payload: Record<string, unknown>) {
  const output = jsonObject(payload.output);
  const audio = jsonObject(output?.audio);
  const usage = jsonObject(payload.usage);
  const seconds =
    numberValue(payload.audioDurationSeconds) ??
    numberValue(audio?.durationSeconds) ??
    numberValue(usage?.durationSeconds);

  return (
    numberValue(payload.audioDurationMs) ??
    numberValue(payload.durationMs) ??
    numberValue(audio?.durationMs) ??
    numberValue(usage?.audioDurationMs) ??
    (seconds ? Math.round(seconds * 1000) : null)
  );
}

function estimatedAudioCost(payload: Record<string, unknown>) {
  return numberValue(payload.estimatedCost) ?? numberValue(payload.providerCost) ?? 0;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applySystemVoiceOverride(voice: (typeof systemVoices)[number], override?: SystemVoiceOverride) {
  return {
    ...voice,
    name: override?.name ?? voice.name,
    description: override?.description ?? voice.description,
    trait: override?.trait ?? voice.trait,
    scene: override?.scene ?? voice.scene,
    language: override?.language ?? normaliseVoiceLanguage(voice.language),
    languages: voice.languages,
    accent: override?.accent !== undefined ? override.accent : voice.accent ?? inferSystemVoiceAccent(voice),
    gender: override?.gender ?? voice.gender ?? inferSystemVoiceGender(voice),
    ageCategory: override?.ageCategory !== undefined ? override.ageCategory : voice.ageCategory,
    status: override?.status ?? voice.status,
    disabledReason: override?.disabledReason ?? null,
    isCustomized: Boolean(override),
    updatedAt: override?.updatedAt ?? null
  };
}

function normalizeSystemVoiceOverride(value: Record<string, unknown>): SystemVoiceOverride | null {
  const status = value.status === "DISABLED" ? "DISABLED" : value.status === "READY" ? "READY" : undefined;
  const ageCategory = isSystemVoiceAgeCategory(value.ageCategory) ? value.ageCategory : undefined;
  const override: SystemVoiceOverride = {};

  if (typeof value.name === "string" && value.name.trim()) {
    override.name = value.name.trim().slice(0, 80);
  }

  if (typeof value.description === "string" && value.description.trim()) {
    override.description = value.description.trim().slice(0, 300);
  }

  if (typeof value.trait === "string" && value.trait.trim()) {
    override.trait = value.trait.trim().slice(0, 120);
  }

  if (typeof value.scene === "string" && value.scene.trim()) {
    override.scene = value.scene.trim().slice(0, 120);
  }

  if (typeof value.language === "string" && value.language.trim()) {
    override.language = normaliseVoiceLanguage(value.language).slice(0, 40);
  }

  if (value.accent === null) {
    override.accent = null;
  } else if (typeof value.accent === "string") {
    override.accent = value.accent.trim().slice(0, 40) || null;
  }

  if (value.gender === "男声" || value.gender === "女声") {
    override.gender = value.gender;
  }

  if (value.ageCategory === null) {
    override.ageCategory = null;
  } else if (ageCategory) {
    override.ageCategory = ageCategory;
  }

  if (status) {
    override.status = status;
  }

  if (typeof value.disabledReason === "string") {
    override.disabledReason = value.disabledReason.trim().slice(0, 300) || null;
  }

  if (typeof value.updatedAt === "string") {
    override.updatedAt = value.updatedAt;
  }

  return Object.keys(override).length > 0 ? override : null;
}

function isSystemVoiceAgeCategory(value: unknown): value is "儿童" | "青年" | "中年" | "老年" {
  return value === "儿童" || value === "青年" || value === "中年" || value === "老年";
}

const supportedVoiceLanguages = new Set([
  "中文",
  "英语",
  "日语",
  "韩语",
  "西班牙语",
  "葡萄牙语",
  "法语",
  "印尼语",
  "德语",
  "俄语",
  "意大利语",
  "阿拉伯语",
  "土耳其语",
  "乌克兰语",
  "荷兰语",
  "越南语",
  "泰语",
  "波兰语",
  "罗马尼亚语",
  "希腊语",
  "捷克语",
  "芬兰语",
  "印地语"
]);

const voiceLanguageAliases: Record<string, string> = {
  日文: "日语",
  japanese: "日语",
  ja: "日语",
  "ja-jp": "日语",
  韩文: "韩语",
  korean: "韩语",
  ko: "韩语",
  "ko-kr": "韩语",
  西班牙文: "西班牙语",
  spanish: "西班牙语",
  es: "西班牙语",
  葡萄牙文: "葡萄牙语",
  portuguese: "葡萄牙语",
  pt: "葡萄牙语",
  法文: "法语",
  french: "法语",
  fr: "法语",
  印尼文: "印尼语",
  indonesian: "印尼语",
  id: "印尼语",
  德文: "德语",
  german: "德语",
  de: "德语",
  俄文: "俄语",
  russian: "俄语",
  ru: "俄语",
  意大利文: "意大利语",
  italian: "意大利语",
  it: "意大利语",
  阿拉伯文: "阿拉伯语",
  arabic: "阿拉伯语",
  ar: "阿拉伯语",
  土耳其文: "土耳其语",
  turkish: "土耳其语",
  tr: "土耳其语",
  乌克兰文: "乌克兰语",
  ukrainian: "乌克兰语",
  uk: "乌克兰语",
  荷兰文: "荷兰语",
  dutch: "荷兰语",
  nl: "荷兰语",
  越南文: "越南语",
  vietnamese: "越南语",
  vi: "越南语",
  泰文: "泰语",
  thai: "泰语",
  th: "泰语",
  波兰文: "波兰语",
  polish: "波兰语",
  pl: "波兰语",
  罗马尼亚文: "罗马尼亚语",
  romanian: "罗马尼亚语",
  ro: "罗马尼亚语",
  希腊文: "希腊语",
  greek: "希腊语",
  el: "希腊语",
  捷克文: "捷克语",
  czech: "捷克语",
  cs: "捷克语",
  芬兰文: "芬兰语",
  finnish: "芬兰语",
  fi: "芬兰语",
  印地文: "印地语",
  hindi: "印地语",
  hi: "印地语"
};

const voiceAccentLanguages: Record<string, string> = {
  普通话: "中文",
  粤语: "中文",
  闽南语: "中文",
  东北话: "中文",
  陕西话: "中文",
  台湾普通话: "中文",
  南方普通话: "中文",
  北方普通话: "中文",
  标准英语: "英语",
  美式英语: "英语",
  英式英语: "英语",
  澳大利亚英语: "英语",
  爱尔兰英语: "英语",
  印度英语: "英语",
  拉美英语: "英语",
  非洲英语: "英语",
  标准日语: "日语",
  标准韩语: "韩语",
  标准西班牙语: "西班牙语",
  标准葡萄牙语: "葡萄牙语",
  标准法语: "法语",
  标准印尼语: "印尼语",
  标准德语: "德语",
  标准俄语: "俄语",
  标准意大利语: "意大利语",
  标准阿拉伯语: "阿拉伯语",
  标准土耳其语: "土耳其语",
  标准乌克兰语: "乌克兰语",
  标准荷兰语: "荷兰语",
  标准越南语: "越南语",
  标准泰语: "泰语",
  标准波兰语: "波兰语",
  标准罗马尼亚语: "罗马尼亚语",
  标准希腊语: "希腊语",
  标准捷克语: "捷克语",
  标准芬兰语: "芬兰语",
  标准印地语: "印地语"
};

function normaliseVoiceLanguage(value: string) {
  const trimmed = value.trim();
  const language = trimmed.toLowerCase();
  if (/中文|汉语|普通话|粤语|闽南语|chinese|mandarin|cantonese|hokkien/.test(language) || /^(zh|yue|nan)(-|$)/.test(language)) {
    return "中文";
  }
  if (/英文|英语|english/.test(language) || /^(en)(-|$)/.test(language)) {
    return "英语";
  }
  return voiceLanguageAliases[language] ?? trimmed;
}

function normaliseVoiceAccent(value: string) {
  const trimmed = value.trim();
  const language = trimmed.toLowerCase();
  if (/普通话|mandarin/i.test(trimmed) || language === "zh-cn") return "普通话";
  if (/粤语|cantonese/i.test(trimmed) || /^(yue)(-|$)/.test(language)) return "粤语";
  if (/闽南语|闽南话|hokkien/i.test(trimmed) || /^(nan)(-|$)/.test(language)) return "闽南语";
  if (/东北话|东北口音/.test(trimmed)) return "东北话";
  if (/陕西话|陕西口音/.test(trimmed)) return "陕西话";
  if (/台湾普通话|台湾口音/.test(trimmed)) return "台湾普通话";
  if (/南方普通话|南方口音/.test(trimmed)) return "南方普通话";
  if (/北方普通话|北方口音/.test(trimmed)) return "北方普通话";
  if (/美式英语|美语英语|american english/i.test(trimmed) || language === "en-us") return "美式英语";
  if (/英式英语|british english/i.test(trimmed) || language === "en-gb") return "英式英语";
  if (voiceAccentLanguages[trimmed]) return trimmed;
  return null;
}

function assertVoiceClassification(
  language: string | null | undefined,
  accent: string | null | undefined,
  existingLanguage?: string | null
) {
  const accentLanguage = accent ? voiceAccentLanguages[accent] : undefined;
  if (accent && !accentLanguage) {
    throw new AppException(40001, `不支持的音色口音：${accent}`, HttpStatus.BAD_REQUEST);
  }
  if (!language) {
    if (accent) {
      throw new AppException(40001, `口音「${accent}」与语种不匹配`, HttpStatus.BAD_REQUEST);
    }
    return;
  }

  const normalizedLanguage = normaliseVoiceLanguage(language);
  const normalizedExistingLanguage = existingLanguage ? normaliseVoiceLanguage(existingLanguage) : null;
  if (!supportedVoiceLanguages.has(normalizedLanguage) && normalizedLanguage !== normalizedExistingLanguage) {
    throw new AppException(40001, `不支持的音色语种：${language}`, HttpStatus.BAD_REQUEST);
  }
  if (accentLanguage && normalizedLanguage !== accentLanguage) {
    throw new AppException(40001, `口音「${accent}」与语种不匹配`, HttpStatus.BAD_REQUEST);
  }
}

function inferSystemVoiceAccent(voice: (typeof systemVoices)[number]) {
  const values = [...voice.languages, voice.language];
  for (const value of values) {
    const accent = normaliseVoiceAccent(value);
    if (accent) return accent;
  }
  return null;
}

function inferSystemVoiceGender(voice: (typeof systemVoices)[number]): "男声" | "女声" {
  const text = `${voice.providerVoiceId} ${voice.name} ${voice.description} ${voice.trait}`.toLowerCase();
  return /女声|女性|女童|女孩|少女|女士|woman|girl|\bfemale\b/.test(text) ? "女声" : "男声";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function decimalNumber(value: DecimalLike | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(typeof value === "number" ? value : value.toString());

  return Number.isFinite(parsed) ? parsed : 0;
}

function isBillingMode(value: string | null): value is AudioBillingMode {
  return value === "PER_CHARACTER" || value === "PER_TASK" || value === "PER_SECOND";
}

function isAudioTaskType(value: string | undefined): value is AudioTaskType {
  return value === "TTS" || value === "VOICE_CLONE" || value === "VOICE_DESIGN";
}

function isAudioTaskStatus(value: string | undefined): value is AudioTaskStatus {
  return (
    value === "CREATED" ||
    value === "RESERVED" ||
    value === "UPLOADING" ||
    value === "PROCESSING" ||
    value === "SUCCEEDED" ||
    value === "FAILED" ||
    value === "CANCELLED" ||
    value === "COMPENSATED"
  );
}

function adminAudioTaskDateFilter(startTime: string | undefined, endTime: string | undefined) {
  const range: Prisma.DateTimeFilter = {};
  const startAt = parseAdminAudioListDate(startTime);
  const endAt = parseAdminAudioListDate(endTime);

  if (startAt) {
    range.gte = startAt;
  }

  if (endAt) {
    range.lte = endAt;
  }

  return Object.keys(range).length > 0 ? range : null;
}

function parseAdminAudioListDate(value: string | undefined) {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAdminAudioListPage(value: string | undefined) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseAdminAudioListPageSize(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 200);
}

interface AudioDateRange {
  from: string;
  to: string;
  startAt: Date;
  endAt: Date;
  keys: string[];
}

const audioShanghaiOffsetMs = 8 * 60 * 60 * 1000;

function normalizeAudioDateRange(
  filters: {
    from?: string;
    to?: string;
  },
  defaultDays: number
): AudioDateRange {
  const today = audioDateKeyInShanghai(new Date());
  const to = normalizeAudioDateKey(filters.to) ?? today;
  const from = normalizeAudioDateKey(filters.from) ?? addAudioDays(to, -(defaultDays - 1));
  const orderedFrom = from <= to ? from : to;
  const orderedTo = from <= to ? to : from;
  const keys: string[] = [];
  let cursor = orderedFrom;

  while (cursor <= orderedTo && keys.length < 366) {
    keys.push(cursor);
    cursor = addAudioDays(cursor, 1);
  }

  return {
    from: orderedFrom,
    to: orderedTo,
    startAt: audioShanghaiStart(orderedFrom),
    endAt: audioShanghaiStart(addAudioDays(orderedTo, 1)),
    keys
  };
}

function audioDateKeyInShanghai(date: Date) {
  const shifted = new Date(date.getTime() + audioShanghaiOffsetMs);

  return shifted.toISOString().slice(0, 10);
}

function normalizeAudioDateKey(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : audioDateKeyInShanghai(parsed);
}

function audioShanghaiStart(key: string) {
  const [year, month, day] = key.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day) - audioShanghaiOffsetMs);
}

function addAudioDays(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));

  return next.toISOString().slice(0, 10);
}

function summarizeAudioUsage(
  rows: Array<{
    operationType: AudioTaskType;
    characterCount: number;
    audioDurationMs: number | null;
    success: boolean;
    consumedCredits: number;
    estimatedCost: DecimalLike;
    latencyMs: number | null;
  }>
) {
  const total = rows.reduce(
    (acc, row) => {
      acc.requestCount += 1;
      acc.successCount += row.success ? 1 : 0;
      acc.failureCount += row.success ? 0 : 1;
      acc.ttsCount += row.operationType === "TTS" ? 1 : 0;
      acc.voiceCloneCount += row.operationType === "VOICE_CLONE" ? 1 : 0;
      acc.voiceDesignCount += row.operationType === "VOICE_DESIGN" ? 1 : 0;
      acc.characterCount += row.characterCount;
      acc.audioDurationMs += row.audioDurationMs ?? 0;
      acc.consumedCredits += row.consumedCredits;
      acc.estimatedCost += decimalNumber(row.estimatedCost);

      if (row.latencyMs && row.latencyMs > 0) {
        acc.latencyTotal += row.latencyMs;
        acc.latencyCount += 1;
      }

      return acc;
    },
    {
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      ttsCount: 0,
      voiceCloneCount: 0,
      voiceDesignCount: 0,
      characterCount: 0,
      audioDurationMs: 0,
      consumedCredits: 0,
      estimatedCost: 0,
      latencyTotal: 0,
      latencyCount: 0
    }
  );

  return {
    requestCount: total.requestCount,
    successCount: total.successCount,
    failureCount: total.failureCount,
    failureRate: total.requestCount > 0 ? (total.failureCount / total.requestCount) * 100 : 0,
    ttsCount: total.ttsCount,
    voiceCloneCount: total.voiceCloneCount,
    voiceDesignCount: total.voiceDesignCount,
    characterCount: total.characterCount,
    audioDurationMs: total.audioDurationMs,
    consumedCredits: total.consumedCredits,
    estimatedCost: Number(total.estimatedCost.toFixed(4)),
    avgLatencyMs: total.latencyCount > 0 ? Math.round(total.latencyTotal / total.latencyCount) : 0
  };
}

function groupAudioUsage<TRow extends Parameters<typeof summarizeAudioUsage>[0][number]>(
  rows: TRow[],
  idFor: (row: TRow) => string,
  nameFor: (id: string, rows: TRow[]) => string
) {
  const groups = new Map<string, TRow[]>();

  for (const row of rows) {
    const id = idFor(row);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }

  return Array.from(groups.entries())
    .map(([id, groupRows]) => ({
      id,
      name: nameFor(id, groupRows),
      ...summarizeAudioUsage(groupRows)
    }))
    .sort((first, second) => second.requestCount - first.requestCount);
}

function maxAudioUploadBytes() {
  const value = Number(process.env.AUDIO_UPLOAD_MAX_BYTES ?? 20 * 1024 * 1024);

  return Number.isFinite(value) && value > 0 ? value : 20 * 1024 * 1024;
}

function postJsonWithLongTimeout(url: string, body: Record<string, unknown>, timeoutMs = 600_000) {
  return new Promise<{ ok: boolean; payload: Record<string, unknown> | null; status: number }>((resolve, reject) => {
    const target = new URL(url);
    const serializedBody = JSON.stringify(body);
    const requestClient = target.protocol === "https:" ? httpsRequest : httpRequest;
    const request = requestClient(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(serializedBody)
        }
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const payload = parseJsonObject(text);

          resolve({
            ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
            payload,
            status: response.statusCode ?? 502
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("AI Gateway 请求等待超时"));
    });
    request.on("error", reject);
    request.end(serializedBody);
  });
}

function gatewayProxyTimeoutMs(value: unknown) {
  const requested = Number(value);
  const baseTimeout = Number.isFinite(requested) && requested >= 60_000 ? Math.round(requested) : 600_000;

  return Math.min(baseTimeout + 30_000, 720_000);
}

function parseJsonObject(text: string) {
  try {
    const payload = JSON.parse(text) as unknown;

    return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function gatewayBaseUrl() {
  return (process.env.AI_GATEWAY_BASE_URL ?? "http://127.0.0.1:3323").replace(/\/+$/, "");
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeOptionalBaseUrl(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = emptyToNull(value);

  return normalized ? normalizeBaseUrl(normalized) : null;
}

function maskSecretPreview(encrypted: string) {
  try {
    return maskSecret(decryptSecret(encrypted));
  } catch {
    return "已配置";
  }
}

function emptyToNull(value: string | undefined) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function jsonStringArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeCapabilityTags(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value.length > 0)
        .slice(0, 20)
    )
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function audioAssetTypeName(type: string) {
  const names: Record<string, string> = {
    SOURCE_SAMPLE: "声音样本",
    PREVIEW: "试听预览",
    TTS_OUTPUT: "语音合成结果"
  };

  return names[type] ?? type;
}

function audioTaskTypeName(type: string) {
  const names: Record<string, string> = {
    TTS: "语音合成",
    VOICE_CLONE: "声音复刻",
    VOICE_DESIGN: "声音设计"
  };

  return names[type] ?? type;
}

function audioEnterpriseFeatureCode(type: AudioTaskType) {
  const names: Record<AudioTaskType, string> = {
    TTS: "audio.tts",
    VOICE_CLONE: "audio.voice_clone",
    VOICE_DESIGN: "audio.voice_design"
  };

  return names[type];
}

function voiceConsentTypeName(type: string) {
  const names: Record<string, string> = {
    SELF_VOICE: "本人声音",
    AUTHORIZED_VOICE: "已获授权声音"
  };

  return names[type] ?? type;
}

function audioTaskStatusName(status: string) {
  const names: Record<string, string> = {
    CREATED: "已创建",
    RESERVED: "已冻结点数",
    UPLOADING: "上传中",
    PROCESSING: "处理中",
    SUCCEEDED: "处理成功",
    FAILED: "处理失败",
    CANCELLED: "已取消",
    COMPENSATED: "已补偿"
  };

  return names[status] ?? status;
}

function reservationStatusName(status: string) {
  const names: Record<string, string> = {
    RESERVED: "已冻结",
    SETTLED: "已结算",
    RELEASED: "已释放",
    EXPIRED: "已过期",
    FAILED: "冻结失败"
  };

  return names[status] ?? status;
}

function ledgerTypeName(type: string) {
  const names: Record<string, string> = {
    TOP_UP: "充值入账",
    RESERVE: "点数冻结",
    CONSUME: "点数消耗",
    RELEASE: "释放冻结",
    REFUND: "退款退回",
    ADMIN_ADJUST: "管理员调整"
  };

  return names[type] ?? type;
}

function voiceTypeName(type: string) {
  const names: Record<string, string> = {
    SYSTEM: "系统音色",
    CLONED: "复刻音色",
    DESIGNED: "设计音色"
  };

  return names[type] ?? type;
}

function voiceStatusName(status: string) {
  const names: Record<string, string> = {
    DRAFT: "草稿",
    CREATING: "创建中",
    PENDING_REVIEW: "待审核",
    READY: "可用",
    FAILED: "创建失败",
    REJECTED: "审核拒绝",
    DISABLED: "已禁用",
    DELETED: "已删除"
  };

  return names[status] ?? status;
}

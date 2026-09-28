import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/index.js";

export { hashPassword, verifyPassword } from "./password.js";
export { decryptSecret, encryptSecret, maskSecret } from "./secret-encryption.js";
export { PrismaClient };
export type {
  AdminRole,
  AudioBillingMode,
  AudioAssetType,
  AudioTaskStatus,
  AudioTaskType,
  BillingContextType,
  AiProviderAdapterType,
  AiProviderModality,
  AiProviderInstanceStatus,
  AiTaskStatus,
  AiProviderType,
  ContentModuleType,
  ContentStatus,
  CopybookRecord,
  CourseMaterialPublicationStatus,
  CourseMaterialType,
  CourseReviewRequestStatus,
  CourseReviewScope,
  CourseReviewState,
  CourseRevisionStatus,
  CreditReservationStatus,
  DictionaryAudioAsset,
  DictionaryEntry,
  EnglishContentAcceptedAnswer,
  EnglishContentEducationStage,
  EnglishContentItem,
  EnglishContentItemReviewStatus,
  EnglishContentItemType,
  EnglishContentLibrary,
  EnglishContentLibraryType,
  EnglishContentMedia,
  EnglishContentMediaKind,
  EnglishContentMediaStatus,
  EnglishContentUnit,
  EnglishGuidedStudySourceType,
  KnowledgeDocumentStatus,
  LearningFlashcardDeckStatus,
  LearningFlashcardReviewGrade,
  LearningFlashcardSourceType,
  LearningFlashcardStrategy,
  LedgerEntryType,
  MediaAssetSource,
  MediaAssetType,
  PaymentAction,
  PageCompositionTargetType,
  PaymentOrderStatus,
  PaymentProduct,
  PaymentProvider,
  PaymentScene,
  ProductBillingMode,
  OrganizationMemberRole,
  OrganizationMemberStatus,
  OrganizationPointLotStatus,
  OrganizationQuotaLedgerDirection,
  OrganizationQuotaStatus,
  OrganizationQuotaType,
  OrganizationReservationStatus,
  OrganizationStatus,
  OrganizationUsageEventStatus,
  OrganizationWalletLedgerDirection,
  OrganizationWalletStatus,
  OrganizationWalletTransactionType,
  Prisma,
  RefreshTokenType,
  SmsCodePurpose,
  TextbookEducationType,
  TextbookVolume,
  TypingAccent,
  TypingAttempt,
  TypingErrorType,
  TypingInputStyle,
  TypingLibraryProgress,
  TypingPracticeMode,
  TypingPracticeScope,
  TypingPracticeSession,
  TypingPracticeSessionItem,
  TypingPracticeSessionItemSource,
  TypingPracticeSessionItemStatus,
  TypingPracticeSessionStatus,
  TypingPreference,
  TypingReviewState,
  TypingReviewStateStatus,
  UserStatus,
  VideoGuideLessonStatus,
  VideoGuideMediaType,
  VideoGuideSubtitleFormat,
  VoiceConsent,
  VoiceConsentType,
  VoiceAssetStatus,
  VoiceAssetType,
  VoiceAssetVisibility
} from "../generated/client/index.js";

let prismaClient: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (prismaClient) {
    return prismaClient;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL 未配置");
  }

  const adapter = new PrismaPg({
    connectionString: databaseUrl
  });

  prismaClient = new PrismaClient({
    adapter
  });

  return prismaClient;
}

export const databasePackageName = "@xueleai/database";
export const prismaSchemaPath = "packages/database/prisma/schema.prisma";

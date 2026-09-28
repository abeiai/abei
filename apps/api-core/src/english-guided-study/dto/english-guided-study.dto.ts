import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  ValidateNested
} from "class-validator";
import {
  englishStudyExplanationModes,
  type EnglishStudyExplanationMode
} from "../english-guided-study-segmentation.js";
import {
  englishGuidedStudyReferenceDocumentMaxBytes,
  englishGuidedStudyReferenceDocumentMaxCount,
  englishGuidedStudyReferenceMaterialMaxLength
} from "../english-guided-study-reference-materials.js";

export const englishGuidedStudySourceTextMaxLength = 256_000;
export const englishGuidedStudySourceInputMaxLength = 30_000;
export const englishGuidedStudyReadAlongUploadMaxBytes = 30 * 1024 * 1024;
export const englishGuidedStudyNarrationMaxLength = 200_000;
export const englishGuidedStudyAuthorIntroductionModes = ["BRIEF", "DETAILED", "NONE"] as const;
export const readingGuideDurations = [1, 3, 5, 8, 10, 15] as const;
export const readingGuideQuestionCounts = [3, 5, 10, 20] as const;
export const guidedStudyScenes = ["ENGLISH", "GUSHIWEN", "DAODU"] as const;
export type GuidedStudyScene = (typeof guidedStudyScenes)[number];
export type ReadingGuideDuration = (typeof readingGuideDurations)[number];
export type ReadingGuideQuestionCount = (typeof readingGuideQuestionCounts)[number];
export type EnglishGuidedStudyAuthorIntroductionMode =
  (typeof englishGuidedStudyAuthorIntroductionModes)[number];

export function guidedStudySourceInputMaxLength(scene?: GuidedStudyScene) {
  return scene === "DAODU"
    ? englishGuidedStudySourceTextMaxLength
    : scene === "GUSHIWEN" ? 10_000 : englishGuidedStudySourceInputMaxLength;
}

@ValidatorConstraint({ name: "guidedStudySourceInputLength", async: false })
class GuidedStudySourceInputLengthConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, arguments_: ValidationArguments) {
    if (typeof value !== "string") {
      return true;
    }

    const scene = (arguments_.object as { scene?: GuidedStudyScene }).scene;
    const maxLength = guidedStudySourceInputMaxLength(scene);

    return value.length <= maxLength;
  }

  defaultMessage(arguments_: ValidationArguments) {
    const scene = (arguments_.object as { scene?: GuidedStudyScene }).scene;
    const maxLength = guidedStudySourceInputMaxLength(scene);

    return scene === "DAODU"
      ? `阅读内容不能超过 ${maxLength.toLocaleString("zh-CN")} 个字符`
      : `学习原文不能超过 ${maxLength.toLocaleString("zh-CN")} 个字符`;
  }
}

export class ExtractEnglishGuidedStudyImageDto {
  @IsOptional()
  @IsIn(guidedStudyScenes)
  scene?: GuidedStudyScene;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  imageName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  imageMimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12 * 1024 * 1024)
  imageSizeBytes!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(18 * 1024 * 1024)
  imageDataUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelInstanceId?: string;
}

export class EnglishGuidedStudyReferenceMaterialDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  id?: string;

  @IsIn(["TEXT", "DOCUMENT"])
  kind!: "TEXT" | "DOCUMENT";

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(englishGuidedStudyReferenceMaterialMaxLength)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(englishGuidedStudyReferenceDocumentMaxBytes)
  sizeBytes?: number;
}

export class GenerateEnglishGuidedStudyMaterialDto {
  @IsOptional()
  @IsBoolean()
  billingConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  billingRequestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  billingRevision?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  materialId?: string;

  @IsOptional()
  @IsIn(guidedStudyScenes)
  scene?: GuidedStudyScene;

  @IsOptional()
  @Type(() => Number)
  @IsIn(readingGuideDurations)
  durationMinutes?: ReadingGuideDuration;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  author?: string;

  @IsOptional()
  @IsIn(englishGuidedStudyAuthorIntroductionModes)
  authorIntroductionMode?: EnglishGuidedStudyAuthorIntroductionMode;

  @IsIn(["TEXT", "IMAGE"])
  sourceType!: "TEXT" | "IMAGE";

  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourceName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(englishGuidedStudySourceTextMaxLength)
  @Validate(GuidedStudySourceInputLengthConstraint)
  sourceText!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(englishGuidedStudyReferenceDocumentMaxCount + 1)
  @ValidateNested({ each: true })
  @Type(() => EnglishGuidedStudyReferenceMaterialDto)
  referenceMaterials?: EnglishGuidedStudyReferenceMaterialDto[];

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  levelStandardName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  levelOptionLabel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  aiLevel!: string;

  @IsOptional()
  @IsIn(englishStudyExplanationModes)
  explanationMode?: EnglishStudyExplanationMode;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelInstanceId?: string;
}

export class GenerateEnglishGuidedStudyAudioDto {
  @IsOptional()
  @IsBoolean()
  billingConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  billingRequestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  billingRevision?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelAlias?: string;

  @IsOptional()
  @IsString()
  voiceAssetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  voice?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  speed?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pitch?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  volume?: number;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  format?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(8000)
  sampleRate?: number;
}

export class EstimateEnglishGuidedStudyReadAlongUploadDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  billingRequestId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12 * 60 * 60 * 1_000)
  audioDurationMs!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  audioName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  audioMimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(englishGuidedStudyReadAlongUploadMaxBytes)
  audioSizeBytes!: number;
}

export class SubmitEnglishGuidedStudyReadAlongUploadDto {
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  billingConfirmed!: boolean;

  @IsString()
  @MinLength(16)
  @MaxLength(80)
  billingRequestId!: string;

  @IsString()
  @MinLength(64)
  @MaxLength(64)
  billingRevision!: string;
}

export class GenerateEnglishGuidedStudyPracticeDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelInstanceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn(readingGuideQuestionCounts)
  questionCount?: ReadingGuideQuestionCount;
}

export class UpdateEnglishGuidedStudyScriptDto {
  @IsIn(["INTRO", "SENTENCE", "SUMMARY"])
  targetType!: "INTRO" | "SENTENCE" | "SUMMARY";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sentenceId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(englishGuidedStudyNarrationMaxLength)
  script!: string;

  @IsString()
  @MaxLength(englishGuidedStudyNarrationMaxLength)
  originalScript!: string;

  @IsOptional()
  @IsBoolean()
  billingConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  billingRequestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  billingRevision?: string;
}

export class UpdateEnglishGuidedStudySourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  author?: string;

  @IsOptional()
  @IsIn(englishGuidedStudyAuthorIntroductionModes)
  authorIntroductionMode?: EnglishGuidedStudyAuthorIntroductionMode;

  @IsString()
  @MinLength(1)
  @MaxLength(englishGuidedStudySourceInputMaxLength)
  sourceText!: string;
}

import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";
import { videoGuideMediaMaxBytes } from "../video-guide-upload-limits.js";
import { videoGuideLessonTitleInputMaxLength } from "../video-guide-title.js";

export const videoGuideSubtitleMaxBytes = 20 * 1024 * 1024;
export const videoGuideSubtitleTextMaxLength = 200_000;

const sha256Pattern = /^[a-f0-9]{64}$/i;

export class CreateVideoGuideLessonDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lessonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(videoGuideLessonTitleInputMaxLength)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(videoGuideLessonTitleInputMaxLength)
  mediaName!: string;

  @IsIn(["VIDEO", "AUDIO"])
  mediaType!: "VIDEO" | "AUDIO";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mediaMimeType?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(videoGuideMediaMaxBytes)
  mediaSizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  mediaStorageKey?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  subtitleName!: string;

  @IsIn(["SRT", "ASS"])
  subtitleFormat!: "SRT" | "ASS";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(videoGuideSubtitleMaxBytes)
  subtitleSizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitleUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subtitleStorageKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(videoGuideSubtitleTextMaxLength)
  subtitleText?: string;

  @IsOptional()
  @IsBoolean()
  billingConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  narrationVoice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  narrationTtsModelAlias?: string;
}

export class CreateVideoGuideDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  mediaName!: string;

  @IsIn(["VIDEO", "AUDIO"])
  mediaType!: "VIDEO" | "AUDIO";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mediaMimeType?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(videoGuideMediaMaxBytes)
  mediaSizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  mediaStorageKey?: string;
}

export class UpdateVideoGuideLessonTitleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;
}

export class UpdateVideoGuideLessonSubtitleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  subtitleName!: string;

  @IsIn(["SRT", "ASS"])
  subtitleFormat!: "SRT" | "ASS";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(videoGuideSubtitleMaxBytes)
  subtitleSizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitleUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subtitleStorageKey?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(videoGuideSubtitleTextMaxLength)
  subtitleText!: string;
}

export class UpdateVideoGuideNarrationNodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(12_000)
  originalScript!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(12_000)
  script!: string;
}

export class UpdateVideoGuideNarrationScriptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2_000)
  @ValidateNested({ each: true })
  @Type(() => UpdateVideoGuideNarrationNodeDto)
  nodes!: UpdateVideoGuideNarrationNodeDto[];

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

export class GenerateVideoGuideSubtitleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lessonId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  mediaName!: string;

  @IsIn(["VIDEO", "AUDIO"])
  mediaType!: "VIDEO" | "AUDIO";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mediaMimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(videoGuideMediaMaxBytes)
  mediaSizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  mediaStorageKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  language?: string;

  @IsOptional()
  @IsBoolean()
  billingConfirmed?: boolean;
}

export class ReadVideoGuideSubtitleTextDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  url!: string;
}

export class GenerateVideoGuidePracticeDto {
  @IsOptional()
  @IsBoolean()
  billingConfirmed?: boolean;
}

export class EstimateVideoGuideNarrationAudioDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  narrationVoice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  narrationTtsModelAlias?: string;
}

export class GenerateVideoGuideNarrationAudioDto {
  @IsOptional()
  @IsBoolean()
  billingConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @Matches(sha256Pattern, {
    message: "导学文案版本格式不正确"
  })
  billingRevision?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  narrationVoice!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  narrationTtsModelAlias?: string;
}

export class CheckVideoGuideUploadDto {
  @IsIn(["MEDIA", "SUBTITLE"])
  assetType!: "MEDIA" | "SUBTITLE";

  @IsString()
  @Matches(sha256Pattern, {
    message: "文件指纹格式不正确"
  })
  hash!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(videoGuideMediaMaxBytes)
  sizeBytes!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  originalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mimeType?: string;
}

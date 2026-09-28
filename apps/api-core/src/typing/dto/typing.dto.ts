import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";

export class ListTypingLibrariesDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(["WORDLIST", "ARTICLE"])
  type?: "WORDLIST" | "ARTICLE";

  @IsOptional()
  @IsString()
  @MaxLength(40)
  stage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  grade?: string;

  @IsOptional()
  @IsIn(["FIRST_VOLUME", "SECOND_VOLUME", "FULL_VOLUME"])
  volume?: "FIRST_VOLUME" | "SECOND_VOLUME" | "FULL_VOLUME";
}

export class CreateTypingSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  libraryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  unitId?: string;

  @IsIn(["UNIT", "NEW", "DUE_REVIEW", "MIXED"])
  scope!: "UNIT" | "NEW" | "DUE_REVIEW" | "MIXED";

  @Type(() => Number)
  @IsInt()
  @IsIn([0, 10, 20, 30])
  targetItemCount!: 0 | 10 | 20 | 30;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  clientSessionKey!: string;

  @IsOptional()
  @IsBoolean()
  abandonExisting?: boolean;
}

export class SubmitTypingAttemptDto {
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  clientAttemptId!: string;

  @IsString()
  @MaxLength(2000)
  answer!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  durationMs!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  audioReplayCount?: number;
}

export class UpdateTypingSessionTimeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400)
  activeSeconds?: number;
}

export class ListTypingReviewsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  libraryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateTypingReviewSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  libraryId?: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([10, 20, 30])
  targetItemCount!: 10 | 20 | 30;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  clientSessionKey!: string;

  @IsOptional()
  @IsBoolean()
  abandonExisting?: boolean;
}

export class ResetTypingReviewDto {
  @IsBoolean()
  confirm!: boolean;
}

export class UpdateTypingPreferencesDto {
  @IsOptional()
  @IsIn(["UK", "US"])
  accent?: "UK" | "US";

  @IsOptional()
  @IsBoolean()
  autoPlayAudio?: boolean;

  @IsOptional()
  @IsBoolean()
  replayAfterCorrect?: boolean;

  @IsOptional()
  @IsBoolean()
  showImage?: boolean;

  @IsOptional()
  @IsBoolean()
  feedbackSoundEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  soundVolume?: number;

  @IsOptional()
  @IsIn(["UNDERLINE", "BOX"])
  inputStyle?: "UNDERLINE" | "BOX";
}

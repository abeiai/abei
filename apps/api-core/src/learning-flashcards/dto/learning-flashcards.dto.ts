import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

export const learningFlashcardsSourceTextMaxLength = 100_000;

export class GenerateLearningFlashcardDeckDto {
  @IsIn(["TEXTBOOK", "UPLOAD"])
  sourceType!: "TEXTBOOK" | "UPLOAD";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  textbookId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  textbookRange?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(learningFlashcardsSourceTextMaxLength)
  sourceText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detailRequest?: string;

  @IsIn(["SUBJECT_KNOWLEDGE", "SCIENCE_POPULARIZATION", "DAILY_MEMORY"])
  strategy!: "SUBJECT_KNOWLEDGE" | "SCIENCE_POPULARIZATION" | "DAILY_MEMORY";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  cardTypes?: string[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  targetCardCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelInstanceId?: string;
}

export class ImportLearningFlashcardDeckDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourceName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(learningFlashcardsSourceTextMaxLength)
  importText!: string;

  @IsOptional()
  @IsIn(["SUBJECT_KNOWLEDGE", "SCIENCE_POPULARIZATION", "DAILY_MEMORY"])
  strategy?: "SUBJECT_KNOWLEDGE" | "SCIENCE_POPULARIZATION" | "DAILY_MEMORY";
}

export class UpdateLearningFlashcardDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  type?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  front?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  back?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  source?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class ReviewLearningFlashcardDto {
  @IsIn(["HARD", "BLURRY", "MASTERED"])
  grade!: "HARD" | "BLURRY" | "MASTERED";
}

class ImportedLearningFlashcardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  front!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  back!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  source?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class CreateLearningFlashcardDeckDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourceName?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportedLearningFlashcardDto)
  cards!: ImportedLearningFlashcardDto[];
}

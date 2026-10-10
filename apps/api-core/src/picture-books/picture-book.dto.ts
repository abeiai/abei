import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { pictureBookAspectRatios, type PictureBookAspectRatio } from "./picture-book-ratio.js";

export class CreatePictureBookDto {
  @IsString() @MinLength(2) @MaxLength(30000)
  brief!: string;

  @IsOptional() @IsString() @MaxLength(100)
  title?: string;

  @IsOptional() @IsString() @MaxLength(100)
  audience?: string;

  @IsString() @MinLength(1) @MaxLength(80)
  style!: string;

  @Type(() => Number) @IsInt() @Min(4) @Max(24)
  pageCount!: number;

  @IsOptional() @IsIn(pictureBookAspectRatios)
  aspectRatio?: PictureBookAspectRatio;

  @IsOptional() @IsBoolean()
  isSpread?: boolean;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PictureBookCharacterSelectionDto)
  characters?: PictureBookCharacterSelectionDto[];
}

export class PictureBookCharacterSelectionDto {
  @IsOptional() @IsString() @MaxLength(80)
  id?: string;

  @IsString() @MinLength(1) @MaxLength(80)
  name!: string;

  @IsString() @MinLength(2) @MaxLength(1000)
  description!: string;

  @IsOptional() @IsString() @MaxLength(2048)
  imageUrl?: string;
}

export class UpdatePictureBookDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  title?: string;

  @IsOptional() @IsString() @MaxLength(100)
  audience?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  style?: string;

  @IsOptional() @IsIn(pictureBookAspectRatios)
  aspectRatio?: PictureBookAspectRatio;

  @IsOptional() @IsBoolean()
  isSpread?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(4) @Max(24)
  pageCount?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PictureBookCharacterSelectionDto)
  characters?: PictureBookCharacterSelectionDto[];
}

export class DiscussPictureBookDto {
  @IsString() @MinLength(1) @MaxLength(10000)
  message!: string;
}

export class UpdatePictureBookPageDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500)
  caption?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(2000)
  imagePrompt?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000)
  narration?: string;
}

export class GeneratePictureBookImageDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  modelInstanceId?: string;
}

export class GeneratePictureBookAudioDto {
  @IsOptional() @IsString() @MaxLength(80)
  voiceAssetId?: string;

  @IsOptional() @IsString() @MaxLength(160)
  voice?: string;
}

export class PictureBookGenerationCostDto extends GeneratePictureBookAudioDto {
  @IsIn(["outline", "blank", "image", "audio"])
  kind!: "outline" | "blank" | "image" | "audio";

  @IsOptional() @IsInt() @Min(0) @Max(24)
  position?: number;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000)
  narration?: string;
}

export class PictureBookImageCostDto {
  @IsOptional() @IsInt() @Min(1) @Max(2)
  referenceImageCount?: number;
}

export class CreatePictureBookCharacterDto {
  @IsString() @MinLength(1) @MaxLength(80)
  name!: string;

  @IsString() @MinLength(2) @MaxLength(1000)
  description!: string;

  @IsOptional() @IsString() @MaxLength(2048)
  imageUrl?: string;
}

export class PictureBookCharacterStyleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  style?: string;
}

export class GeneratePictureBookCharacterImageDto extends PictureBookCharacterStyleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  modelInstanceId?: string;
}

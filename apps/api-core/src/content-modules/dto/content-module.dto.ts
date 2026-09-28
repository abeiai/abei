import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

export const contentModuleTypes = ["SLIDESHOW", "IMAGE_CARD_LIST", "SPLIT_IMAGE_TEXT"] as const;
export const contentModuleLinkTypes = ["NONE", "CATEGORY", "PAGE", "ARTICLE", "EXTERNAL"] as const;

export type ContentModuleTypeValue = (typeof contentModuleTypes)[number];
export type ContentModuleLinkTypeValue = (typeof contentModuleLinkTypes)[number];

export class ContentModuleItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageAlt?: string;

  @IsOptional()
  @IsIn(contentModuleLinkTypes)
  linkType?: ContentModuleLinkTypeValue;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  linkTarget?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  @Type(() => Number)
  sortOrder?: number;
}

export class CreateContentModuleDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsIn(contentModuleTypes)
  type!: ContentModuleTypeValue;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentModuleItemDto)
  items?: ContentModuleItemDto[];
}

export class UpdateContentModuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @IsOptional()
  @IsIn(contentModuleTypes)
  type?: ContentModuleTypeValue;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentModuleItemDto)
  items?: ContentModuleItemDto[];
}

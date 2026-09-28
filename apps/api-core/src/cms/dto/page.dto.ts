import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength
} from "class-validator";

export class CreatePageDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED", "ARCHIVED"])
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";

  @IsOptional()
  @IsString()
  @MaxLength(160)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  seoKeywords?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  canonicalUrl?: string;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  ogTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogImage?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdatePageDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED", "ARCHIVED"])
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";

  @IsOptional()
  @IsString()
  @MaxLength(160)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  seoKeywords?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  canonicalUrl?: string;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  ogTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogImage?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

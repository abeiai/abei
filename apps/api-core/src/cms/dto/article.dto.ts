import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength
} from "class-validator";

export class CreateArticleDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsString()
  coverMediaId?: string;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImage?: string;

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

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagSlugs?: string[];
}

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsString()
  coverMediaId?: string;

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
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImage?: string;

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

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagSlugs?: string[];
}

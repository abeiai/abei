import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";
import type { CourseMaterialType } from "../course-domain.js";

export class CourseItemInputDto {
  @IsIn(["VIDEO_GUIDE", "ENGLISH_GUIDED_STUDY", "LEARNING_FLASHCARD", "PICTURE_BOOK"])
  materialType!: CourseMaterialType;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  materialId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;
}

export class SaveCourseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  coverMediaId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  summary!: string;

  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  tags!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200, { message: "单个专辑最多添加 200 个课件" })
  @ValidateNested({ each: true })
  @Type(() => CourseItemInputDto)
  items!: CourseItemInputDto[];
}

export class EnrollCoursesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  courseIds!: string[];
}

export class CoursePageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

export class CourseCatalogQueryDto extends CoursePageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  tag?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  includeTags = "true";
}

import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { AiAttachmentDto } from "./ai-attachment.dto.js";

export class CreateVideoGenerationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  prompt!: string;

  @IsString()
  @MaxLength(80)
  modelInstanceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  ratio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  resolution?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(30)
  duration?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  mode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => AiAttachmentDto)
  referenceFiles?: AiAttachmentDto[];

  @IsOptional()
  @IsBoolean()
  promptRewrite?: boolean;

  @IsOptional()
  @IsIn(["PERSONAL", "ORGANIZATION"])
  billingContext?: "PERSONAL" | "ORGANIZATION";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  organizationId?: string;
}

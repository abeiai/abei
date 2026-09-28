import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested
} from "class-validator";
import { AiAttachmentDto } from "./ai-attachment.dto.js";

export class CreateAiTaskDto {
  @IsString()
  @MinLength(1)
  scenarioId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  input!: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  knowledgeBaseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelInstanceId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiAttachmentDto)
  attachments?: AiAttachmentDto[];

  @IsOptional()
  @IsBoolean()
  reasoningEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  searchEnabled?: boolean;

  @IsOptional()
  @IsIn(["PERSONAL", "ORGANIZATION"])
  billingContext?: "PERSONAL" | "ORGANIZATION";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  organizationId?: string;
}

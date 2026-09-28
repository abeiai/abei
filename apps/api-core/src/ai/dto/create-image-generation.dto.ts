import { Type } from "class-transformer";
import {
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
import { AiAttachmentDto } from "./ai-attachment.dto.js";

export class CreateImageGenerationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  prompt!: string;

  @IsString()
  @MaxLength(80)
  modelInstanceId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(512)
  @Max(4096)
  width!: number;

  @Type(() => Number)
  @IsInt()
  @Min(512)
  @Max(4096)
  height!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  count!: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  ratio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  resolution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  mode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiAttachmentDto)
  referenceImages?: AiAttachmentDto[];

  @IsOptional()
  @IsIn(["PERSONAL", "ORGANIZATION"])
  billingContext?: "PERSONAL" | "ORGANIZATION";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  organizationId?: string;
}

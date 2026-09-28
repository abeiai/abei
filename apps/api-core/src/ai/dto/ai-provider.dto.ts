import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min
} from "class-validator";

export class CreateAiProviderDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsIn(["OPENAI_COMPATIBLE"])
  type?: "OPENAI_COMPATIBLE";

  @IsUrl({
    require_tld: false
  })
  baseUrl!: string;

  @IsString()
  @MaxLength(4000)
  apiKey!: string;

  @IsString()
  @MaxLength(80)
  modelDisplayName!: string;

  @IsString()
  @MaxLength(120)
  modelName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inputPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  outputPrice?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateAiProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsUrl({
    require_tld: false
  })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  apiKey?: string;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelDisplayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inputPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  outputPrice?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  modelEnabled?: boolean;
}

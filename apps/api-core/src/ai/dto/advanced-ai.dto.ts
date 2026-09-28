import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

export class PromptVariableDto {
  @IsString()
  @MaxLength(40)
  name!: string;

  @IsString()
  @MaxLength(60)
  label!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeholder?: string;
}

export class UpdateAiScenarioDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumMembershipRank?: number;

  @IsOptional()
  @IsISO8601()
  membershipEarlyAccessUntil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  promptTemplate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PromptVariableDto)
  promptVariables?: PromptVariableDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  costCredits?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  defaultModelId?: string;

  @IsOptional()
  @IsString()
  fallbackModelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultModelAlias?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fallbackModelAlias?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({
    each: true
  })
  requiredCapabilities?: string[];

  @IsOptional()
  @IsString()
  toolCategoryId?: string;

  @IsOptional()
  @IsDefined()
  inputSchema?: unknown;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  templateVersion?: string;
}

export class UpsertAiToolCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}

export class ImportAiToolTemplateDto {
  @IsDefined()
  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  skipConflicts?: boolean;
}

export class CreateAiProviderModelDto {
  @IsString()
  @MaxLength(80)
  displayName!: string;

  @IsString()
  @MaxLength(120)
  modelName!: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  inputPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  outputPrice?: number;

  @IsOptional()
  @IsBoolean()
  supportsStreaming?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsVision?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  fallbackModelId?: string;
}

export class UpdateAiModelDto extends CreateAiProviderModelDto {
  @IsOptional()
  @IsString()
  id?: string;
}

export class UpdateAiProviderInstanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  webSocketUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  apiKey?: string;

  @IsOptional()
  @IsIn(["DISABLED", "ENABLED", "TEST_FAILED"])
  status?: "DISABLED" | "ENABLED" | "TEST_FAILED";
}

export class CreateAiProviderPresetDto extends UpdateAiProviderInstanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  providerKey?: string;

  @IsString()
  @MaxLength(80)
  displayName!: string;

  @IsOptional()
  @IsIn(["OPENAI_COMPATIBLE", "ANTHROPIC", "GEMINI", "CUSTOM_OPENAI_COMPATIBLE", "DASHSCOPE_AUDIO", "MINIMAX_AUDIO", "ELEVENLABS_AUDIO", "MINIMAX_VIDEO"])
  adapterType?: "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI" | "CUSTOM_OPENAI_COMPATIBLE" | "DASHSCOPE_AUDIO" | "MINIMAX_AUDIO" | "ELEVENLABS_AUDIO" | "MINIMAX_VIDEO";

  @IsOptional()
  @IsIn(["TEXT", "AUDIO", "MULTIMODAL"])
  modality?: "TEXT" | "AUDIO" | "MULTIMODAL";

  @IsString()
  @MaxLength(400)
  defaultBaseUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  defaultWebSocketUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  apiKeyEnvName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  docsUrl?: string;
}

export class UpdateAiModelInstanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerModelName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  webSocketUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({
    each: true
  })
  capabilityTags?: string[];

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
  @IsIn(["TOKENS", "TOKEN_CACHE", "TOKEN_TIERED", "REQUEST", "CHARACTERS", "IMAGES", "SECONDS", "VIDEO_SECONDS"])
  pricingMode?:
    | "TOKENS"
    | "TOKEN_CACHE"
    | "TOKEN_TIERED"
    | "REQUEST"
    | "CHARACTERS"
    | "IMAGES"
    | "SECONDS"
    | "VIDEO_SECONDS";

  @IsOptional()
  @IsIn(["K_TOKENS", "M_TOKENS", "REQUEST", "CHARACTER", "K_CHARACTERS", "IMAGE", "SECOND"])
  pricingUnit?: "K_TOKENS" | "M_TOKENS" | "REQUEST" | "CHARACTER" | "K_CHARACTERS" | "IMAGE" | "SECOND";

  @IsOptional()
  @IsObject()
  pricingConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateAiModelAliasDto {
  @IsOptional()
  @IsString()
  modelInstanceId?: string;
}

export class CreateKnowledgeBaseDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;
}

export class SearchKnowledgeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  query!: string;
}

export class AgentToolRunDto {
  @IsString()
  @MaxLength(40)
  toolName!: string;

  @IsDefined()
  @IsObject()
  input!: Record<string, unknown>;
}

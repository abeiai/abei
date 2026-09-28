import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf
} from "class-validator";

export class CreateAudioAssetDto {
  @IsIn(["SOURCE_SAMPLE", "PREVIEW", "TTS_OUTPUT"])
  type!: "SOURCE_SAMPLE" | "PREVIEW" | "TTS_OUTPUT";

  @IsOptional()
  @IsIn(["LOCAL", "S3"])
  storageProvider?: "LOCAL" | "S3";

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  url!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  objectKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sampleRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  channels?: number;
}

export class CreateTtsAudioTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  scenarioId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelAlias?: string;

  @IsOptional()
  @IsString()
  voiceAssetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  voice?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  speed?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pitch?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  volume?: number;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  format?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(8000)
  sampleRate?: number;

  @IsOptional()
  @IsBoolean()
  execute?: boolean;

  @IsOptional()
  @IsIn(["TOOL", "EXPERIENCE"])
  source?: "TOOL" | "EXPERIENCE";

  @IsOptional()
  @IsIn(["PERSONAL", "ORGANIZATION"])
  billingContext?: "PERSONAL" | "ORGANIZATION";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  organizationId?: string;
}

export class CreateVoiceCloneTaskDto {
  @IsString()
  sourceAudioAssetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  learnerSampleProof?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelAlias?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsBoolean()
  consentAccepted!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  consentStatement?: string;

  @IsOptional()
  @IsIn(["SELF_VOICE", "AUTHORIZED_VOICE"])
  consentType?: "SELF_VOICE" | "AUTHORIZED_VOICE";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  ownerContact?: string;

  @IsOptional()
  @IsIn(["TOOL", "EXPERIENCE"])
  source?: "TOOL" | "EXPERIENCE";

  @IsOptional()
  @IsIn(["PERSONAL", "ORGANIZATION"])
  billingContext?: "PERSONAL" | "ORGANIZATION";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  organizationId?: string;
}

export class CreateVoiceDesignTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  prompt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelAlias?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelInstanceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  previewText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;

  @IsOptional()
  @IsIn(["TOOL", "EXPERIENCE"])
  source?: "TOOL" | "EXPERIENCE";

  @IsOptional()
  @IsIn(["PERSONAL", "ORGANIZATION"])
  billingContext?: "PERSONAL" | "ORGANIZATION";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  organizationId?: string;
}

export class UpdateVoiceAssetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}

export class UpdateAdminVoiceAssetDto extends UpdateVoiceAssetDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(40)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  accent?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(["男声", "女声"])
  gender?: "男声" | "女声";

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(["儿童", "青年", "中年", "老年"])
  ageCategory?: "儿童" | "青年" | "中年" | "老年";
}

export class CreatePlatformVoiceAssetDto {
  @IsIn(["CLONED", "DESIGNED"])
  type!: "CLONED" | "DESIGNED";

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(160)
  providerVoiceId!: string;

  @IsString()
  modelInstanceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  previewAudioUrl?: string;
}

export class CreateAdminPlatformVoiceDesignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  prompt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelAlias?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelInstanceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  previewText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class SetDefaultVoiceDto {
  @IsOptional()
  @IsString()
  voiceAssetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  systemVoiceId?: string;
}

export class ReviewVoiceAssetDto {
  @IsIn(["APPROVE", "REJECT", "DISABLE"])
  action!: "APPROVE" | "REJECT" | "DISABLE";

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class DeleteVoiceAssetAdminDto {
  @IsString()
  @MaxLength(300)
  reason!: string;

  @IsBoolean()
  confirm!: boolean;
}

export class UpdateSystemVoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trait?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  scene?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(40)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  accent?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(["男声", "女声"])
  gender?: "男声" | "女声";

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(["儿童", "青年", "中年", "老年"])
  ageCategory?: "儿童" | "青年" | "中年" | "老年";

  @IsOptional()
  @IsIn(["READY", "DISABLED"])
  status?: "READY" | "DISABLED";

  @IsOptional()
  @IsString()
  @MaxLength(300)
  disabledReason?: string;
}

export class UpdateAudioModelDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelName?: string;

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
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  capabilityTags?: string[];

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

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
  @IsIn(["TOKENS", "REQUEST", "CHARACTERS", "IMAGES", "SECONDS"])
  pricingMode?: "TOKENS" | "REQUEST" | "CHARACTERS" | "IMAGES" | "SECONDS";

  @IsOptional()
  @IsIn(["K_TOKENS", "M_TOKENS", "REQUEST", "CHARACTER", "K_CHARACTERS", "TEN_K_CHARACTERS", "IMAGE", "SECOND"])
  pricingUnit?:
    | "K_TOKENS"
    | "M_TOKENS"
    | "REQUEST"
    | "CHARACTER"
    | "K_CHARACTERS"
    | "TEN_K_CHARACTERS"
    | "IMAGE"
    | "SECOND";

  @IsOptional()
  @IsObject()
  pricingConfig?: Record<string, unknown>;

  @IsOptional()
  @IsIn(["speech-to-text", "tts-default", "tts-fast", "voice-clone-default", "voice-design-default", "audio-preview"])
  aliasKey?:
    | "speech-to-text"
    | "tts-default"
    | "tts-fast"
    | "voice-clone-default"
    | "voice-design-default"
    | "audio-preview";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  aliasDisplayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  aliasDescription?: string;
}

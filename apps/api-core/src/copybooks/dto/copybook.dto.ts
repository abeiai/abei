import { IsObject, IsOptional, IsString } from "class-validator";

export class GenerateCopybookDto {
  @IsObject()
  layout!: Record<string, unknown>;

  @IsOptional()
  credits?: unknown;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  sourceConfig?: Record<string, unknown>;
}

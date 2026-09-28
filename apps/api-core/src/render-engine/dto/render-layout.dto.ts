import { IsObject, IsOptional, IsString } from "class-validator";

export class RenderLayoutDto {
  @IsObject()
  layout!: Record<string, unknown>;
}

export class CreateCopybookLayoutDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  pinyin?: string;

  @IsOptional()
  @IsString()
  gridType?: string;

  @IsOptional()
  repeat?: unknown;

  @IsOptional()
  @IsObject()
  style?: Record<string, unknown>;
}

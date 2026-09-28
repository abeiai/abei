import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class AiAttachmentDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(30)
  type!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10 * 1024 * 1024)
  size!: number;

  @IsOptional()
  @IsString()
  @MaxLength(15 * 1024 * 1024)
  dataUrl?: string;
}

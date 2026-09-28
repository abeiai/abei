import { Type } from "class-transformer";
import { IsArray, IsHexColor, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { AiAttachmentDto } from "./ai-attachment.dto.js";

export class CreateStudentPhotoDto {
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelInstanceId?: string;

  @ValidateNested()
  @Type(() => AiAttachmentDto)
  sourceImage!: AiAttachmentDto;

  @IsIn(["NAVY_SUIT", "WHITE_SHIRT_SCARF", "CUSTOM"])
  outfit!: "NAVY_SUIT" | "WHITE_SHIRT_SCARF" | "CUSTOM";

  @IsOptional()
  @ValidateNested()
  @Type(() => AiAttachmentDto)
  outfitImage?: AiAttachmentDto;

  @Type(() => Number)
  @IsNumber()
  @Min(15)
  @Max(100)
  widthMm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(15)
  @Max(100)
  heightMm!: number;

  @IsHexColor()
  backgroundColor!: string;

  @IsOptional()
  @IsArray()
  @IsIn(["smoothSkin", "brightenSkin", "enlargeEyes"], { each: true })
  optimizations?: Array<"smoothSkin" | "brightenSkin" | "enlargeEyes">;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  naturalRetouchStrength?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  blemishRemovalStrength?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  otherRequirements?: string;
}

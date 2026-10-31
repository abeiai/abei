import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { pictureBookAudiences } from "../picture-books/picture-book-audience.js";
import { guideStyles } from "./picture-book-guide-content.js";

export class GuideVersionDto {
  @Type(() => Number) @IsInt() @Min(0)
  version!: number;
}
export class GuideSettingsDto extends GuideVersionDto {
  @IsIn(pictureBookAudiences)
  audience!: string;
  @IsIn(guideStyles.map(style => style.value))
  style!: string;
}
export class GuidePageDto extends GuideVersionDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  script!: string;
}
export class GuidePdfSelectionDto extends GuideVersionDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(80) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true })
  pageNumbers!: number[];
}
export class GuideAudioDto extends GuideVersionDto {
  @IsOptional() @IsString() @MaxLength(80)
  voiceAssetId?: string;
  @IsOptional() @IsString() @MaxLength(160)
  voice?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.5) @Max(1.5)
  speed?: number;
}

export class GuideBookQueryDto {
  @IsIn(["MINE", "PUBLIC"])
  scope: "MINE" | "PUBLIC" = "PUBLIC";
  @IsOptional() @IsString() @MaxLength(80)
  search?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000)
  page = 1;
}
export class GuideBookImportDto {
  @IsIn(["MINE", "PUBLIC"])
  scope!: "MINE" | "PUBLIC";
  @IsString() @MinLength(1) @MaxLength(80)
  bookId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  revisionItemId?: string;
}

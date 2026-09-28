import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";

export const pageCompositionTargetTypes = ["HOME", "PAGE"] as const;

export type PageCompositionTargetTypeValue = (typeof pageCompositionTargetTypes)[number];

export class PageCompositionModuleDto {
  @IsString()
  moduleId!: string;
}

export class UpsertPageCompositionDto {
  @IsIn(pageCompositionTargetTypes)
  targetType!: PageCompositionTargetTypeValue;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  showHeader?: boolean;

  @IsOptional()
  @IsBoolean()
  showFooter?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageCompositionModuleDto)
  modules?: PageCompositionModuleDto[];
}

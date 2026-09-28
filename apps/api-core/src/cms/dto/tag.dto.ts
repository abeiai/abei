import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CreateTagDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(80)
  slug!: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(80)
  slug?: string;
}

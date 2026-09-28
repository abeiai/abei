import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateFirstAdminDto {
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}

export class SetupSiteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  siteName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  siteDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  siteUrl?: string;
}

export class CompleteSetupDto {
  @IsOptional()
  @IsBoolean()
  aiSkipped?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentSkipped?: boolean;
}

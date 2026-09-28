import { Type } from "class-transformer";
import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeSize?: string;
}

export class AdminCreateOrganizationDto extends CreateOrganizationDto {
  @IsEmail()
  @MaxLength(160)
  ownerEmail!: string;

  @IsOptional()
  @IsIn(["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"])
  status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
}

export class AdminUpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeSize?: string;

  @IsOptional()
  @IsIn(["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"])
  status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
}

export class AddOrganizationMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  userId?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsIn(["ADMIN", "FINANCE_ADMIN", "MEMBER"])
  role?: "ADMIN" | "FINANCE_ADMIN" | "MEMBER";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

export class UpdateOrganizationMemberDto {
  @IsOptional()
  @IsIn(["OWNER", "ADMIN", "FINANCE_ADMIN", "MEMBER"])
  role?: "OWNER" | "ADMIN" | "FINANCE_ADMIN" | "MEMBER";

  @IsOptional()
  @IsIn(["ACTIVE", "SUSPENDED", "REMOVED"])
  status?: "ACTIVE" | "SUSPENDED" | "REMOVED";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

export class AllocateMemberQuotaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalQuota!: number;

  @IsOptional()
  @IsIn(["ONE_TIME", "MONTHLY"])
  quotaType?: "ONE_TIME" | "MONTHLY";

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class AdjustMemberQuotaDto {
  @Type(() => Number)
  @IsInt()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class AdjustOrganizationCreditsDto {
  @Type(() => Number)
  @IsInt()
  amount!: number;

  @IsOptional()
  @IsIn(["GIFT", "ADJUST"])
  transactionType?: "GIFT" | "ADJUST";

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason!: string;
}

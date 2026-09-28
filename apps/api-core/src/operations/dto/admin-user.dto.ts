import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdateUserStatusDto {
  @IsIn(["ACTIVE", "DISABLED"])
  status!: "ACTIVE" | "DISABLED";
}

export class AdjustUserCreditsDto {
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  amount!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason!: string;
}

export class RechargeUserCreditsDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  amount!: number;

  @IsIn(["TEST", "REWARD", "COMPENSATION", "OTHER"])
  reasonType!: "TEST" | "REWARD" | "COMPENSATION" | "OTHER";

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

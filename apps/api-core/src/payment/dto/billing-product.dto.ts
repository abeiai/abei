import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min
} from "class-validator";

export class UpsertBillingProductDto {
  @IsOptional()
  @IsString({ message: "产品编码格式不正确" })
  @MaxLength(64, { message: "产品编码不能超过 64 个字符" })
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: "产品编码只能使用小写字母、数字和短横线，且不能以短横线开头或结尾"
  })
  code?: string;

  @IsOptional()
  @IsIn(["RECHARGE", "SUBSCRIPTION", "MIXED"], { message: "产品模式不正确" })
  billingMode?: "RECHARGE" | "SUBSCRIPTION" | "MIXED";

  @IsString({ message: "套餐名称不能为空" })
  @MaxLength(40, { message: "套餐名称不能超过 40 个字符" })
  name!: string;

  @IsString({ message: "价格不能为空" })
  @Matches(/^\d+(\.\d{1,2})?$/, { message: "价格格式不正确" })
  amountCny!: string;

  @Type(() => Number)
  @IsInt({ message: "购买点数必须为整数" })
  @Min(1, { message: "购买点数必须大于 0" })
  credits!: number;

  @IsOptional()
  @IsString({ message: "套餐说明格式不正确" })
  @MaxLength(200, { message: "套餐说明不能超过 200 个字符" })
  description?: string;

  @IsOptional()
  @IsString({ message: "套餐权益格式不正确" })
  @MaxLength(10000, { message: "套餐权益不能超过 10000 个字符" })
  benefitsMarkdown?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "排序值必须为整数" })
  sortOrder?: number;

  @IsOptional()
  @IsBoolean({ message: "启用状态格式不正确" })
  isEnabled?: boolean;
}

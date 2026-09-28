import { IsIn, IsOptional, IsString } from "class-validator";

export class CreatePaymentOrderDto {
  @IsIn(["ALIPAY", "WECHAT_PAY"])
  provider!: "ALIPAY" | "WECHAT_PAY";

  @IsString()
  packageCode!: string;

  @IsOptional()
  @IsIn(["DESKTOP_WEB", "MOBILE_WEB", "WECHAT_BROWSER"])
  scene?: "DESKTOP_WEB" | "MOBILE_WEB" | "WECHAT_BROWSER";
}

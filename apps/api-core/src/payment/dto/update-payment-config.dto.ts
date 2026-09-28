import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdatePaymentConfigDto {
  @IsBoolean()
  alipayEnabled!: boolean;

  @IsBoolean()
  alipayPageEnabled!: boolean;

  @IsBoolean()
  alipayWapEnabled!: boolean;

  @IsString()
  @MaxLength(120)
  alipayAppId!: string;

  @IsIn(["production", "sandbox"])
  alipayEnvironment!: "production" | "sandbox";

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  alipayPrivateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  alipayPublicKey?: string;

  @IsString()
  @MaxLength(500)
  alipayNotifyUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  alipayReturnUrl?: string;

  @IsBoolean()
  wechatPayEnabled!: boolean;

  @IsBoolean()
  wechatPayNativeEnabled!: boolean;

  @IsBoolean()
  wechatPayH5Enabled!: boolean;

  @IsBoolean()
  wechatPayJsapiEnabled!: boolean;

  @IsString()
  @MaxLength(120)
  wechatPayAppId!: string;

  @IsString()
  @MaxLength(120)
  wechatPayMerchantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  wechatPayApiV3Key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  wechatPayMerchantPrivateKey?: string;

  @IsString()
  @MaxLength(240)
  wechatPayMerchantSerialNo!: string;

  @IsString()
  @MaxLength(500)
  wechatPayNotifyUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  wechatPayPublicKey?: string;

  @IsString()
  @MaxLength(240)
  wechatPayPublicKeyId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  wechatPayAppSecret?: string;

  @IsString()
  @MaxLength(500)
  wechatPayJsapiOauthCallbackUrl!: string;
}

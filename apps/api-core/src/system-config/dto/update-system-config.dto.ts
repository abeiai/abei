import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateSystemConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  siteName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  siteLogo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  siteFavicon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  themePrimaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  activeThemeTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  publicNavItems?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30000)
  siteMenus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  footerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  homeTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  homeDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  homeCtaText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  homeCtaHref?: string;

  @IsOptional()
  @IsString()
  @MaxLength(800)
  homeFeatureHighlights?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  homeLatestArticleCount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  seoDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  beianNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  copyrightText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  serviceQrCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  defaultCreditExchangeRate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultAiModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  aiSaveFullContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  analyticsCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  siteDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  registrationStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  mediaImageMaxSizeMb?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  mediaAudioMaxSizeMb?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  mediaVideoMaxSizeMb?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  enterpriseAccountEnabled?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  emailVerificationEnabled?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  emailVerificationProvider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aliyunMailAccessKeyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  aliyunMailAccessKeySecretEncrypted?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  aliyunMailEndpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  aliyunMailRegionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  aliyunMailAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  aliyunMailFromAlias?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  aliyunMailAddressType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  aliyunMailReplyToAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aliyunMailSubject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  aliyunMailBodyTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  smsVerificationEnabled?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  smsVerificationProvider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aliyunSmsAccessKeyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  aliyunSmsAccessKeySecretEncrypted?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  aliyunSmsEndpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  aliyunSmsRegionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  aliyunSmsSignName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  aliyunSmsTemplateCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  aliyunSmsTemplateParamCodeKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  aliyunSmsTemplateParamExtraJson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  smsCodeTtlSeconds?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  audioVoiceCloneReviewRequired?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  audioVoiceDesignReviewRequired?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  audioUserPublicVoiceEnabled?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  audioCloneDefaultVisibility?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  audioDesignDefaultVisibility?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  audioSafetyNotice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  audioCloneConsentText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  audioDownloadNotice?: string;
}

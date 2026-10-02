import { HttpStatus, Injectable } from "@nestjs/common";
import { decryptSecret, encryptSecret, getPrismaClient, maskSecret } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { UpdateSystemConfigDto } from "./dto/update-system-config.dto.js";
import { defaultSiteOrigin, normalizeSiteOrigin } from "./site-url.js";
import { defaultPictureBookStyles, parsePictureBookStyles, type PictureBookStyle } from "../picture-books/picture-book-styles.js";

const configDefinitions = [
  { key: "pictureBookStyles", label: "绘本绘画风格", value: JSON.stringify(defaultPictureBookStyles), description: "绘本风格名称、生成描述与示意图片。", isPublic: true, sortOrder: 320 },
  {
    key: "siteName",
    label: "站点名称",
    value: "AI SaaS",
    description: "用于前台、后台和浏览器标题的站点名称。",
    isPublic: true,
    sortOrder: 10
  },
  {
    key: "siteLogo",
    label: "站点 Logo",
    value: "",
    description: "前台导航和运营物料可使用的 Logo 图片地址。",
    isPublic: true,
    sortOrder: 15
  },
  {
    key: "siteFavicon",
    label: "网站图标",
    value: "",
    description: "浏览器标签页使用的 ico 图标地址。",
    isPublic: true,
    sortOrder: 16
  },
  {
    key: "themePrimaryColor",
    label: "主题主色",
    value: "#0a0a0a",
    description: "前台按钮、链接和强调元素使用的主色，只允许 6 位十六进制颜色。",
    isPublic: true,
    sortOrder: 17
  },
  {
    key: "activeThemeTemplate",
    label: "当前主题模板",
    value: "default",
    description: "前台使用的主题模板。主题只影响展示样式，不影响菜单、CMS、支付、AI 和用户数据。",
    isPublic: true,
    sortOrder: 18
  },
  {
    key: "publicNavItems",
    label: "前台导航菜单",
    value: "首页|/\n功能|/features\n场景|/use-cases\n价格|/pricing\n文章|/articles\n用户中心|/dashboard",
    description: "每行一个菜单，格式为 名称|站内路径，最多 12 项。",
    isPublic: true,
    sortOrder: 17
  },
  {
    key: "siteMenus",
    label: "站点菜单结构",
    value: "",
    description: "菜单管理保存的结构化菜单数据，包含菜单项、层级和展示位置。",
    isPublic: true,
    sortOrder: 18
  },
  {
    key: "footerText",
    label: "Footer 文案",
    value: "面向中国市场的简体中文 AI SaaS / 内容型工具站底座。",
    description: "前台页脚展示的站点说明。",
    isPublic: true,
    sortOrder: 18
  },
  {
    key: "homeTitle",
    label: "首页标题",
    value: "面向内容型 AI SaaS 的第一批可运营页面",
    description: "前台首页首屏标题。",
    isPublic: true,
    sortOrder: 19
  },
  {
    key: "homeDescription",
    label: "首页描述",
    value: "首页、文章、单页、用户中心和管理后台已经连成可访问的中文界面。",
    description: "前台首页首屏描述。",
    isPublic: true,
    sortOrder: 20
  },
  {
    key: "homeCtaText",
    label: "首页 CTA 文案",
    value: "免费注册",
    description: "首页首屏主按钮文案。",
    isPublic: true,
    sortOrder: 21
  },
  {
    key: "homeCtaHref",
    label: "首页 CTA 链接",
    value: "/register",
    description: "首页首屏主按钮链接。",
    isPublic: true,
    sortOrder: 22
  },
  {
    key: "homeFeatureHighlights",
    label: "首页功能亮点",
    value: "可访问路由\n中文界面\n真实 CMS\n后台管理\n登录闭环",
    description: "首页展示的功能亮点，每行一个项目。",
    isPublic: true,
    sortOrder: 23
  },
  {
    key: "homeLatestArticleCount",
    label: "首页最新文章数量",
    value: "3",
    description: "首页展示的最新文章数量。",
    isPublic: true,
    sortOrder: 24
  },
  {
    key: "seoTitle",
    label: "SEO 标题",
    value: "AI SaaS - 简体中文内容型工具站底座",
    description: "默认 SEO 标题。",
    isPublic: true,
    sortOrder: 25
  },
  {
    key: "seoDescription",
    label: "SEO 描述",
    value: "面向中国市场的简体中文 AI SaaS / 内容型工具站底座。",
    description: "默认 SEO 描述。",
    isPublic: true,
    sortOrder: 26
  },
  {
    key: "siteUrl",
    label: "前台地址",
    value: defaultSiteOrigin(process.env.APP_BASE_URL, process.env.NODE_ENV === "production"),
    description: "对外展示和运营校验使用的前台访问地址。",
    isPublic: true,
    sortOrder: 27
  },
  {
    key: "analyticsCode",
    label: "统计代码",
    value: "",
    description: "添加到网站全部页面 </head> 标签前的第三方统计代码。",
    isPublic: true,
    sortOrder: 28
  },
  {
    key: "siteDescription",
    label: "站点描述",
    value: "面向中国市场的简体中文 AI SaaS / 内容型工具站底座。",
    description: "用于首页、SEO 和后台识别的简短介绍。",
    isPublic: true,
    sortOrder: 30
  },
  {
    key: "beianNo",
    label: "备案号",
    value: "待备案",
    description: "前台页脚展示的备案号。",
    isPublic: true,
    sortOrder: 35
  },
  {
    key: "copyrightText",
    label: "版权信息",
    value: "© 2026 AI SaaS 版权所有",
    description: "前台页脚展示的版权信息。",
    isPublic: true,
    sortOrder: 36
  },
  {
    key: "serviceQrCode",
    label: "客服二维码",
    value: "",
    description: "客服二维码图片地址，仅对前台展示需要的地址公开。",
    isPublic: true,
    sortOrder: 37
  },
  {
    key: "defaultCreditExchangeRate",
    label: "默认点数兑换比例",
    value: "1 元 = 100 点",
    description: "后台展示使用的默认点数兑换说明。",
    isPublic: false,
    sortOrder: 37
  },
  {
    key: "defaultAiModel",
    label: "默认 AI 模型",
    value: "本地 mock",
    description: "后台运营识别使用的默认 AI 模型名称。",
    isPublic: false,
    sortOrder: 38
  },
  {
    key: "aiSaveFullContent",
    label: "AI 完整内容保存",
    value: "false",
    description: "默认仅保存输入输出预览与哈希；明确启用后才保存完整 Prompt 和生成内容。",
    isPublic: false,
    sortOrder: 39
  },
  {
    key: "apiBaseUrl",
    label: "API 地址",
    value: "http://localhost:3322/api",
    description: "核心业务 API 的基础地址。",
    isPublic: false,
    sortOrder: 40
  },
  {
    key: "registrationStatus",
    label: "注册入口",
    value: "开放",
    description: "前台用户注册入口的运营状态。",
    isPublic: false,
    sortOrder: 50
  },
  {
    key: "mediaImageMaxSizeMb",
    label: "图片上传大小",
    value: "10",
    description: "媒体素材中图片文件的最大上传大小，单位 MB。",
    isPublic: false,
    sortOrder: 90
  },
  {
    key: "mediaAudioMaxSizeMb",
    label: "音频上传大小",
    value: "20",
    description: "媒体素材中音频文件的最大上传大小，单位 MB。",
    isPublic: false,
    sortOrder: 91
  },
  {
    key: "mediaVideoMaxSizeMb",
    label: "视频上传大小",
    value: "200",
    description: "媒体素材中视频文件的最大上传大小，单位 MB。",
    isPublic: false,
    sortOrder: 92
  },
  {
    key: "enterpriseAccountEnabled",
    label: "企业账号体系",
    value: "false",
    description: "启用后开放企业/组织账号、企业钱包、成员额度和企业用量归集能力。",
    isPublic: false,
    sortOrder: 100
  },
  {
    key: "emailVerificationEnabled",
    label: "邮件验证启用",
    value: "false",
    description: "启用后，邮件验证码相关流程使用阿里云邮件推送配置。",
    isPublic: false,
    sortOrder: 120
  },
  {
    key: "emailVerificationProvider",
    label: "邮件验证方案",
    value: "ALIYUN_DIRECT_MAIL",
    description: "当前支持阿里云邮件推送 DirectMail。",
    isPublic: false,
    sortOrder: 121
  },
  {
    key: "aliyunMailAccessKeyId",
    label: "阿里云邮件 AccessKey ID",
    value: "",
    description: "用于调用阿里云邮件推送 API 的 AccessKey ID。",
    isPublic: false,
    sortOrder: 122
  },
  {
    key: "aliyunMailAccessKeySecretEncrypted",
    label: "阿里云邮件 AccessKey Secret",
    value: "",
    description: "用于调用阿里云邮件推送 API 的 AccessKey Secret，保存前会加密。",
    isPublic: false,
    sortOrder: 123
  },
  {
    key: "aliyunMailEndpoint",
    label: "阿里云邮件 Endpoint",
    value: "https://dm.aliyuncs.com/",
    description: "阿里云邮件推送 API Endpoint。",
    isPublic: false,
    sortOrder: 124
  },
  {
    key: "aliyunMailRegionId",
    label: "阿里云邮件区域",
    value: "cn-hangzhou",
    description: "阿里云邮件推送 RegionId。",
    isPublic: false,
    sortOrder: 125
  },
  {
    key: "aliyunMailAccountName",
    label: "发信地址",
    value: "",
    description: "阿里云邮件推送控制台配置的发信地址 AccountName。",
    isPublic: false,
    sortOrder: 126
  },
  {
    key: "aliyunMailFromAlias",
    label: "发信人昵称",
    value: "",
    description: "邮件中展示的发信人昵称 FromAlias。",
    isPublic: false,
    sortOrder: 127
  },
  {
    key: "aliyunMailAddressType",
    label: "发信地址类型",
    value: "1",
    description: "阿里云邮件推送 AddressType，1 表示发信地址。",
    isPublic: false,
    sortOrder: 128
  },
  {
    key: "aliyunMailReplyToAddress",
    label: "使用回信地址",
    value: "true",
    description: "阿里云邮件推送 ReplyToAddress。",
    isPublic: false,
    sortOrder: 129
  },
  {
    key: "aliyunMailSubject",
    label: "邮件验证码标题",
    value: "邮箱验证码",
    description: "邮件验证码默认标题。",
    isPublic: false,
    sortOrder: 130
  },
  {
    key: "aliyunMailBodyTemplate",
    label: "邮件验证码模板",
    value: "您的验证码是 ${code}，5 分钟内有效。如非本人操作，请忽略本邮件。",
    description: "邮件验证码正文模板，使用 ${code} 作为验证码变量。",
    isPublic: false,
    sortOrder: 131
  },
  {
    key: "smsVerificationEnabled",
    label: "短信验证启用",
    value: "false",
    description: "启用后，手机验证码使用阿里云短信服务发送。",
    isPublic: false,
    sortOrder: 140
  },
  {
    key: "smsVerificationProvider",
    label: "短信验证方案",
    value: "ALIYUN_SMS",
    description: "当前支持阿里云短信服务 SendSms 和号码认证服务 SendSmsVerifyCode。",
    isPublic: false,
    sortOrder: 141
  },
  {
    key: "aliyunSmsAccessKeyId",
    label: "阿里云短信 AccessKey ID",
    value: "",
    description: "用于调用阿里云短信 API 的 AccessKey ID。",
    isPublic: false,
    sortOrder: 142
  },
  {
    key: "aliyunSmsAccessKeySecretEncrypted",
    label: "阿里云短信 AccessKey Secret",
    value: "",
    description: "用于调用阿里云短信 API 的 AccessKey Secret，保存前会加密。",
    isPublic: false,
    sortOrder: 143
  },
  {
    key: "aliyunSmsEndpoint",
    label: "阿里云短信 Endpoint",
    value: "https://dysmsapi.aliyuncs.com/",
    description: "普通短信使用 Dysmsapi，号码认证使用 Dypnsapi。",
    isPublic: false,
    sortOrder: 144
  },
  {
    key: "aliyunSmsRegionId",
    label: "阿里云短信区域",
    value: "cn-hangzhou",
    description: "阿里云短信接口 RegionId。",
    isPublic: false,
    sortOrder: 145
  },
  {
    key: "aliyunSmsSignName",
    label: "短信签名",
    value: "",
    description: "阿里云短信服务审核通过的 SignName。",
    isPublic: false,
    sortOrder: 146
  },
  {
    key: "aliyunSmsTemplateCode",
    label: "短信模板 Code",
    value: "",
    description: "阿里云短信服务审核通过的 TemplateCode。",
    isPublic: false,
    sortOrder: 147
  },
  {
    key: "aliyunSmsTemplateParamCodeKey",
    label: "验证码变量名",
    value: "code",
    description: "短信模板中接收验证码的变量名。",
    isPublic: false,
    sortOrder: 148
  },
  {
    key: "aliyunSmsTemplateParamExtraJson",
    label: "短信模板扩展参数",
    value: "{}",
    description: "短信模板除验证码外的额外变量，JSON 格式。例如 {\"min\":\"5\"}。",
    isPublic: false,
    sortOrder: 149
  },
  {
    key: "smsCodeTtlSeconds",
    label: "验证码有效期",
    value: "300",
    description: "手机验证码有效期，单位秒。",
    isPublic: false,
    sortOrder: 150
  },
  {
    key: "audioVoiceCloneReviewRequired",
    label: "声音复刻审核",
    value: "true",
    description: "声音复刻生成的自定义音色是否需要管理员审核后才能使用。",
    isPublic: false,
    sortOrder: 310
  },
  {
    key: "audioVoiceDesignReviewRequired",
    label: "声音设计审核",
    value: "false",
    description: "声音设计生成的自定义音色是否需要管理员审核后才能使用。",
    isPublic: false,
    sortOrder: 311
  },
  {
    key: "audioUserPublicVoiceEnabled",
    label: "允许公开用户音色",
    value: "false",
    description: "是否允许用户创建 PUBLIC 可见性的自定义音色。",
    isPublic: false,
    sortOrder: 312
  },
  {
    key: "audioCloneDefaultVisibility",
    label: "复刻音色默认可见性",
    value: "PRIVATE",
    description: "声音复刻生成音色的默认可见性。",
    isPublic: false,
    sortOrder: 313
  },
  {
    key: "audioDesignDefaultVisibility",
    label: "设计音色默认可见性",
    value: "PRIVATE",
    description: "声音设计生成音色的默认可见性。",
    isPublic: false,
    sortOrder: 314
  },
  {
    key: "audioSafetyNotice",
    label: "语音安全提示",
    value: "AI 生成语音可能被误用，请勿用于冒充他人、诈骗、侵权、虚假宣传或违法违规用途。声音复刻仅允许上传本人声音或已获得授权的声音。生成音频建议标注为 AI 生成语音。",
    description: "前台语音工具和音色库展示的统一风险提示。",
    isPublic: true,
    sortOrder: 315
  },
  {
    key: "audioCloneConsentText",
    label: "声音复刻授权声明",
    value: "我确认上传的音频为本人声音，或我已获得声音权利人的明确授权。我承诺不会将该音色用于冒充他人、诈骗、侵权、虚假宣传或其他违法违规用途。",
    description: "声音复刻提交前必须勾选并保存快照的授权声明。",
    isPublic: true,
    sortOrder: 316
  },
  {
    key: "audioDownloadNotice",
    label: "音频下载提示",
    value: "下载或对外使用生成音频前，请确认用途合法合规，并建议标注为 AI 生成语音。",
    description: "生成音频下载区域展示的轻量提示。",
    isPublic: true,
    sortOrder: 317
  }
] as const;

type ConfigKey = (typeof configDefinitions)[number]["key"];

@Injectable()
export class SystemConfigService {
  private readonly prisma = getPrismaClient();

  async listConfigs() {
    await this.ensureDefaults();

    const configs = await this.prisma.systemConfig.findMany({
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
    });

    return configs.map((config) =>
      this.isEncryptedConfigKey(config.key)
        ? {
            ...config,
            value: this.secretPreview(config.value)
          }
        : config
    );
  }

  async listPublicConfigs() {
    await this.ensureDefaults();

    const configs = await this.prisma.systemConfig.findMany({
      where: {
        isPublic: true
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
    });

    return configs.map((config) => ({
      key: config.key,
      label: config.label,
      value: config.value,
      description: config.description,
      group: config.group,
      sortOrder: config.sortOrder,
      updatedAt: config.updatedAt
    }));
  }

  async pictureBookStyles() {
    const config = await this.prisma.systemConfig.findUnique({ where: { key: "pictureBookStyles" } });
    return parsePictureBookStyles(config?.value);
  }

  async assertPictureBookStyleImage(style: PictureBookStyle) {
    if (defaultPictureBookStyles.some(item => item.imageUrl === style.imageUrl)) return;
    const base = process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    if (!base || !style.imageUrl.startsWith(`${base}/`)) throw new AppException(40001, "请上传 abeiai R2 中的风格参考图", HttpStatus.BAD_REQUEST);
    const asset = await this.prisma.mediaAsset.findFirst({ where: {
      url: style.imageUrl, mediaType: "IMAGE", storageProvider: "S3", createdByAdminId: { not: null }
    } });
    if (!asset) throw new AppException(40001, "风格参考图必须由管理员上传", HttpStatus.BAD_REQUEST);
  }

  async updateConfigs(dto: UpdateSystemConfigDto) {
    await this.ensureDefaults();

    const currentConfigs = await this.prisma.systemConfig.findMany();
    const currentValues = configDefinitions.reduce(
      (values, definition) => ({
        ...values,
        [definition.key]: currentConfigs.find((config) => config.key === definition.key)?.value ?? definition.value
      }),
      {} as Record<ConfigKey, string>
    );
    const updates = Object.entries(dto)
      .filter(([key, value]) => this.isConfigKey(key) && value !== undefined)
      .map(([key, value]) => ({
        key: key as ConfigKey,
        value: this.normalizeConfigValue(key as ConfigKey, String(value).trim(), currentValues)
      }));

    if (updates.length === 0) {
      throw new AppException(40001, "请求参数错误", HttpStatus.BAD_REQUEST);
    }

    const nextValues = {
      ...currentValues,
      ...Object.fromEntries(updates.map((update) => [update.key, update.value]))
    } as Record<ConfigKey, string>;

    this.validateSendConfigs(nextValues);
    if (dto.pictureBookStyles !== undefined) {
      for (const style of parsePictureBookStyles(nextValues.pictureBookStyles)) await this.assertPictureBookStyleImage(style);
    }

    for (const update of updates) {
      if (!update.value && !this.isEmptyAllowed(update.key)) {
        throw new AppException(40001, "配置值不能为空", HttpStatus.BAD_REQUEST);
      }
    }

    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.systemConfig.update({
          where: {
            key: update.key
          },
          data: {
            value: update.value
          }
        })
      )
    );

    return this.listConfigs();
  }

  private async ensureDefaults() {
    await this.prisma.$transaction(
      configDefinitions.map((definition) =>
        this.prisma.systemConfig.upsert({
          where: {
            key: definition.key
          },
          update: {
            label: definition.label,
            description: definition.description,
            isPublic: definition.isPublic,
            sortOrder: definition.sortOrder
          },
          create: {
            key: definition.key,
            label: definition.label,
            value: definition.value,
            description: definition.description,
            group: "site",
            isPublic: definition.isPublic,
            sortOrder: definition.sortOrder
          }
        })
      )
    );
  }

  private isConfigKey(key: string): key is ConfigKey {
    return configDefinitions.some((definition) => definition.key === key);
  }

  private isEmptyAllowed(key: ConfigKey) {
    return (
      key === "siteLogo" ||
      key === "siteFavicon" ||
      key === "copyrightText" ||
      key === "serviceQrCode" ||
      key === "siteMenus" ||
      key === "analyticsCode" ||
      key.startsWith("aliyunMail") ||
      key.startsWith("aliyunSms")
    );
  }

  private normalizeConfigValue(key: ConfigKey, value: string, currentValues: Record<ConfigKey, string>) {
    if (key === "pictureBookStyles") return JSON.stringify(parsePictureBookStyles(value));
    if (this.isEncryptedConfigKey(key)) {
      return value ? encryptSecret(value) : currentValues[key];
    }

    if (key === "themePrimaryColor") {
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
        throw new AppException(40001, "主题主色必须是 6 位十六进制颜色", HttpStatus.BAD_REQUEST);
      }

      return value.toLowerCase();
    }

    if (key === "siteUrl") {
      try {
        return normalizeSiteOrigin(value, process.env.NODE_ENV === "production");
      } catch (error) {
        throw new AppException(
          40001,
          error instanceof Error ? error.message : "前台地址不合法",
          HttpStatus.BAD_REQUEST
        );
      }
    }

    if (key === "activeThemeTemplate") {
      if (value !== "default" && value !== "blue-tech") {
        throw new AppException(40001, "主题模板不存在", HttpStatus.BAD_REQUEST);
      }
    }

    if (key === "publicNavItems") {
      return normalizePublicNavItems(value);
    }

    if (key === "siteMenus") {
      return normalizeSiteMenus(value);
    }

    if (
      key === "audioVoiceCloneReviewRequired" ||
      key === "audioVoiceDesignReviewRequired" ||
      key === "audioUserPublicVoiceEnabled"
    ) {
      if (value !== "true" && value !== "false") {
        throw new AppException(40001, "语音审核开关只能选择开启或关闭", HttpStatus.BAD_REQUEST);
      }
    }

    if (key === "audioCloneDefaultVisibility" || key === "audioDesignDefaultVisibility") {
      if (value !== "PRIVATE" && value !== "ADMIN_ONLY" && value !== "PUBLIC") {
        throw new AppException(40001, "音色默认可见性不合法", HttpStatus.BAD_REQUEST);
      }
    }

    if (
      key === "emailVerificationEnabled" ||
      key === "smsVerificationEnabled" ||
      key === "enterpriseAccountEnabled" ||
      key === "aliyunMailReplyToAddress"
    ) {
      if (value !== "true" && value !== "false") {
        throw new AppException(40001, "启用状态只能选择开启或关闭", HttpStatus.BAD_REQUEST);
      }
    }

    if (key === "emailVerificationProvider" && value !== "ALIYUN_DIRECT_MAIL") {
      throw new AppException(40001, "邮件验证方案暂只支持阿里云邮件推送", HttpStatus.BAD_REQUEST);
    }

    if (key === "smsVerificationProvider" && value !== "ALIYUN_DYPNS" && value !== "ALIYUN_SMS") {
      throw new AppException(40001, "短信验证方案暂只支持阿里云短信服务或号码认证服务", HttpStatus.BAD_REQUEST);
    }

    if (key === "aliyunMailAddressType" && value !== "0" && value !== "1") {
      throw new AppException(40001, "发信地址类型只能是 0 或 1", HttpStatus.BAD_REQUEST);
    }

    if (key === "smsCodeTtlSeconds") {
      return normalizeSmsCodeTtlSeconds(value);
    }

    if (key === "aliyunSmsTemplateParamExtraJson") {
      return normalizeJsonObjectConfig(value, "短信模板扩展参数必须是 JSON 对象");
    }

    if (key === "mediaImageMaxSizeMb" || key === "mediaAudioMaxSizeMb" || key === "mediaVideoMaxSizeMb") {
      return normalizeMediaUploadSizeMb(value);
    }

    return value;
  }

  private isEncryptedConfigKey(key: string): key is ConfigKey {
    return key === "aliyunMailAccessKeySecretEncrypted" || key === "aliyunSmsAccessKeySecretEncrypted";
  }

  private secretPreview(value: string) {
    if (!value) {
      return "尚未配置";
    }

    try {
      return maskSecret(decryptSecret(value));
    } catch {
      return "密钥无法解密，请重新保存";
    }
  }

  private validateSendConfigs(values: Record<ConfigKey, string>) {
    if (values.emailVerificationEnabled === "true") {
      assertRequiredConfig(values.aliyunMailAccessKeyId, "请填写阿里云邮件 AccessKey ID");
      assertRequiredConfig(values.aliyunMailAccessKeySecretEncrypted, "请填写阿里云邮件 AccessKey Secret");
      assertRequiredConfig(values.aliyunMailEndpoint, "请填写阿里云邮件 Endpoint");
      assertRequiredConfig(values.aliyunMailRegionId, "请填写阿里云邮件区域");
      assertRequiredConfig(values.aliyunMailAccountName, "请填写阿里云邮件发信地址");
      assertRequiredConfig(values.aliyunMailSubject, "请填写邮件验证码标题");
      assertRequiredConfig(values.aliyunMailBodyTemplate, "请填写邮件验证码模板");
    }

    if (values.smsVerificationEnabled === "true") {
      assertRequiredConfig(values.aliyunSmsAccessKeyId, "请填写阿里云短信 AccessKey ID");
      assertRequiredConfig(values.aliyunSmsAccessKeySecretEncrypted, "请填写阿里云短信 AccessKey Secret");
      assertRequiredConfig(values.aliyunSmsEndpoint, "请填写阿里云短信 Endpoint");
      assertRequiredConfig(values.aliyunSmsRegionId, "请填写阿里云短信区域");
      assertRequiredConfig(values.aliyunSmsSignName, "请填写阿里云短信签名");
      assertRequiredConfig(values.aliyunSmsTemplateCode, "请填写阿里云短信模板 Code");
      assertRequiredConfig(values.aliyunSmsTemplateParamCodeKey, "请填写短信验证码变量名");
      assertRequiredConfig(values.aliyunSmsTemplateParamExtraJson, "请填写短信模板扩展参数，留空请填写 {}");
    }
  }
}

function assertRequiredConfig(value: string, message: string) {
  if (!value.trim()) {
    throw new AppException(40001, message, HttpStatus.BAD_REQUEST);
  }
}

function normalizeSmsCodeTtlSeconds(value: string) {
  if (!/^\d+$/.test(value)) {
    throw new AppException(40001, "验证码有效期必须是整数秒", HttpStatus.BAD_REQUEST);
  }

  const seconds = Number(value);

  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 1800) {
    throw new AppException(40001, "验证码有效期必须在 60 到 1800 秒之间", HttpStatus.BAD_REQUEST);
  }

  return String(seconds);
}

function normalizeJsonObjectConfig(value: string, message: string) {
  const trimmedValue = value.trim() || "{}";

  try {
    const parsed = JSON.parse(trimmedValue) as unknown;

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("invalid json");
    }

    return JSON.stringify(parsed);
  } catch {
    throw new AppException(40001, message, HttpStatus.BAD_REQUEST);
  }
}

function normalizeMediaUploadSizeMb(value: string) {
  if (!/^\d+$/.test(value)) {
    throw new AppException(40001, "媒体上传大小必须是整数 MB", HttpStatus.BAD_REQUEST);
  }

  const sizeMb = Number(value);

  if (!Number.isInteger(sizeMb) || sizeMb < 1 || sizeMb > 200) {
    throw new AppException(40001, "媒体上传大小必须在 1 到 200 MB 之间", HttpStatus.BAD_REQUEST);
  }

  return String(sizeMb);
}

function normalizePublicNavItems(value: string) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (lines.length === 0) {
    throw new AppException(40001, "前台导航菜单不能为空", HttpStatus.BAD_REQUEST);
  }

  return lines
    .map((line) => {
      const [labelInput, hrefInput] = line.split("|");
      const label = String(labelInput ?? "").trim();
      const href = String(hrefInput ?? "").trim();

      if (!label || label.length > 20) {
        throw new AppException(40001, "导航名称不能为空且不能超过 20 个字符", HttpStatus.BAD_REQUEST);
      }

      if (!isSafeInternalHref(href)) {
        throw new AppException(40001, "导航路径必须是安全的站内路径", HttpStatus.BAD_REQUEST);
      }

      return `${label}|${href}`;
    })
    .join("\n");
}

function normalizeSiteMenus(value: string) {
  if (!value.trim()) {
    return "";
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AppException(40001, "菜单结构不是合法 JSON", HttpStatus.BAD_REQUEST);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppException(40001, "菜单结构格式错误", HttpStatus.BAD_REQUEST);
  }

  const source = parsed as {
    version?: unknown;
    menus?: unknown;
    locations?: unknown;
  };

  if (!Array.isArray(source.menus) || source.menus.length > 8) {
    throw new AppException(40001, "菜单数量不能超过 8 个", HttpStatus.BAD_REQUEST);
  }

  const menus = source.menus.map((menuInput, menuIndex) => {
    if (!menuInput || typeof menuInput !== "object" || Array.isArray(menuInput)) {
      throw new AppException(40001, "菜单数据格式错误", HttpStatus.BAD_REQUEST);
    }

    const menu = menuInput as {
      id?: unknown;
      name?: unknown;
      items?: unknown;
    };
    const id = String(menu.id ?? `menu-${menuIndex + 1}`).trim();
    const name = String(menu.name ?? "").trim();

    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
      throw new AppException(40001, "菜单 ID 格式不合法", HttpStatus.BAD_REQUEST);
    }

    if (!name || name.length > 40) {
      throw new AppException(40001, "菜单名称不能为空且不能超过 40 个字符", HttpStatus.BAD_REQUEST);
    }

    if (!Array.isArray(menu.items) || menu.items.length > 80) {
      throw new AppException(40001, "单个菜单最多包含 80 个菜单项", HttpStatus.BAD_REQUEST);
    }

    return {
      id,
      name,
      items: menu.items.map((itemInput, itemIndex) => normalizeSiteMenuItem(itemInput, itemIndex))
    };
  });

  const menuIds = new Set(menus.map((menu) => menu.id));
  const locationsInput =
    source.locations && typeof source.locations === "object" && !Array.isArray(source.locations)
      ? (source.locations as { primaryMenuId?: unknown; footerMenuId?: unknown })
      : {};
  const primaryMenuId = String(locationsInput.primaryMenuId ?? "").trim();
  const footerMenuId = String(locationsInput.footerMenuId ?? "").trim();

  return JSON.stringify({
    version: 1,
    menus,
    locations: {
      primaryMenuId: menuIds.has(primaryMenuId) ? primaryMenuId : "",
      footerMenuId: menuIds.has(footerMenuId) ? footerMenuId : ""
    }
  });
}

function normalizeSiteMenuItem(itemInput: unknown, itemIndex: number) {
  if (!itemInput || typeof itemInput !== "object" || Array.isArray(itemInput)) {
    throw new AppException(40001, "菜单项格式错误", HttpStatus.BAD_REQUEST);
  }

  const item = itemInput as {
    id?: unknown;
    type?: unknown;
    label?: unknown;
    href?: unknown;
    referenceId?: unknown;
    depth?: unknown;
  };
  const id = String(item.id ?? `item-${itemIndex + 1}`).trim();
  const type = String(item.type ?? "custom").trim();
  const label = String(item.label ?? "").trim();
  const href = String(item.href ?? "").trim();
  const depth = Number(item.depth ?? 0);

  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    throw new AppException(40001, "菜单项 ID 格式不合法", HttpStatus.BAD_REQUEST);
  }

  if (!["page", "article", "category", "custom"].includes(type)) {
    throw new AppException(40001, "菜单项类型不合法", HttpStatus.BAD_REQUEST);
  }

  if (!label || label.length > 40) {
    throw new AppException(40001, "菜单项名称不能为空且不能超过 40 个字符", HttpStatus.BAD_REQUEST);
  }

  if (!isSafeMenuHref(href)) {
    throw new AppException(40001, "菜单项链接必须是安全的站内路径或 http(s) 链接", HttpStatus.BAD_REQUEST);
  }

  return {
    id,
    type,
    label,
    href,
    referenceId: String(item.referenceId ?? "").trim(),
    depth: depth === 1 ? 1 : 0
  };
}

function isSafeInternalHref(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("<") &&
    !value.includes(">") &&
    !value.toLowerCase().includes("javascript:")
  );
}

function isSafeMenuHref(value: string) {
  if (isSafeInternalHref(value)) {
    return true;
  }

  if (value.includes("<") || value.includes(">")) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

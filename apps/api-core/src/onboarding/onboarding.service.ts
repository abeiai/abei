import { createConnection } from "node:net";
import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, hashPassword } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { normalizeSiteOrigin } from "../system-config/site-url.js";
import { CompleteSetupDto, CreateFirstAdminDto, SetupSiteDto } from "./dto/onboarding.dto.js";

export type CheckState = "PASS" | "WARN" | "FAIL";
export type EnvState = "已配置" | "未配置" | "连接正常" | "连接失败";

export interface SetupCheck {
  key: string;
  label: string;
  state: CheckState;
  required: boolean;
  message: string;
}

@Injectable()
export class OnboardingService {
  private readonly prisma = getPrismaClient();

  async getSetupStatus() {
    const [
      adminCount,
      siteName,
      setupCompletedAt,
      aiProviderCount,
      enabledModelCount,
      defaultAlias,
      systemConfigCount,
      cmsSeedCount,
      toolTemplateCount
    ] = await Promise.all([
      this.prisma.adminUser.count(),
      this.systemConfigValue("siteName"),
      this.systemConfigValue("developerOnboardingCompletedAt"),
      this.configuredAiProviderCount(),
      this.enabledAiModelCount(),
      this.prisma.aiModelAlias.findUnique({
        where: {
          aliasKey: "default-chat"
        },
        select: {
          modelInstanceId: true
        }
      }),
      this.prisma.systemConfig.count(),
      this.prisma.articleCategory.count(),
      this.prisma.aiScenario.count({
        where: {
          OR: [
            {
              isBuiltIn: true
            },
            {
              templateVersion: {
                not: null
              }
            }
          ]
        }
      })
    ]);
    const hasAdmin = adminCount > 0;
    const hasSiteName = Boolean(siteName?.trim());
    const hasAiProvider = aiProviderCount > 0;
    const hasEnabledModel = enabledModelCount > 0;
    const hasDefaultModelAlias = Boolean(defaultAlias?.modelInstanceId);
    const hasPaymentConfig = await this.paymentConfigured();
    const hasBaseSeed = systemConfigCount >= 5 && cmsSeedCount > 0;
    const hasPresetTools = toolTemplateCount > 0;
    const checks: SetupCheck[] = [
      {
        key: "admin",
        label: "管理员账号",
        state: hasAdmin ? "PASS" : "FAIL",
        required: true,
        message: hasAdmin ? "已存在管理员账号" : "尚未创建管理员"
      },
      {
        key: "siteName",
        label: "站点名称",
        state: hasSiteName ? "PASS" : "FAIL",
        required: true,
        message: hasSiteName ? `当前站点：${siteName}` : "尚未设置站点名称"
      },
      {
        key: "aiProvider",
        label: "AI Provider",
        state: hasAiProvider ? "PASS" : "WARN",
        required: false,
        message: hasAiProvider ? "已配置至少一个 Provider" : "可先跳过，体验区会提示未配置模型"
      },
      {
        key: "enabledModel",
        label: "启用模型",
        state: hasEnabledModel ? "PASS" : "WARN",
        required: false,
        message: hasEnabledModel ? "已启用至少一个模型" : "可先跳过，后续在模型预置中启用"
      },
      {
        key: "defaultAlias",
        label: "默认模型别名",
        state: hasDefaultModelAlias ? "PASS" : "WARN",
        required: false,
        message: hasDefaultModelAlias ? "default-chat 已绑定模型" : "未绑定时 AI 生成会提示配置模型"
      },
      {
        key: "payment",
        label: "支付配置",
        state: hasPaymentConfig ? "PASS" : "WARN",
        required: false,
        message: hasPaymentConfig ? "已检测到支付宝或微信支付配置" : "本地可使用模拟回调，生产前需配置真实支付"
      },
      {
        key: "baseSeed",
        label: "基础 seed",
        state: hasBaseSeed ? "PASS" : "FAIL",
        required: true,
        message: hasBaseSeed ? "已检测到 CMS 和系统配置 seed" : "请先执行 pnpm db:seed"
      },
      {
        key: "presetTools",
        label: "场景应用准备",
        state: hasPresetTools ? "PASS" : "WARN",
        required: false,
        message: hasPresetTools ? `已检测到 ${toolTemplateCount} 个历史模板，可迁移为场景应用` : "后续通过场景应用体系接入"
      }
    ];
    const requiredReady = hasAdmin && hasSiteName && hasBaseSeed;

    return {
      isInitialized: Boolean(setupCompletedAt) && requiredReady,
      completedAt: setupCompletedAt,
      requiredReady,
      checks,
      summary: {
        hasAdmin,
        hasSiteName,
        hasAiProvider,
        hasEnabledModel,
        hasDefaultModelAlias,
        hasPaymentConfig,
        hasBaseSeed,
        hasPresetTools
      }
    };
  }

  async createFirstAdmin(dto: CreateFirstAdminDto) {
    const count = await this.prisma.adminUser.count();

    if (count > 0) {
      throw new AppException(40002, "已存在管理员账号，请登录后继续初始化", HttpStatus.BAD_REQUEST);
    }

    const admin = await this.prisma.adminUser.create({
      data: {
        email: dto.email.trim().toLowerCase(),
        passwordHash: await hashPassword(dto.password),
        name: dto.name.trim(),
        role: "SUPER_ADMIN",
        status: "ACTIVE"
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true
      }
    });

    return admin;
  }

  async updateSite(dto: SetupSiteDto) {
    let siteUrl: string;

    try {
      siteUrl = normalizeSiteOrigin(
        dto.siteUrl?.trim() || process.env.APP_BASE_URL || "http://localhost:3321",
        process.env.NODE_ENV === "production"
      );
    } catch (error) {
      throw new AppException(
        40001,
        error instanceof Error ? error.message : "前台地址不合法",
        HttpStatus.BAD_REQUEST
      );
    }

    const configs = [
      {
        key: "siteName",
        label: "站点名称",
        value: dto.siteName.trim(),
        description: "初始化向导设置的站点名称。",
        isPublic: true,
        sortOrder: 10
      },
      {
        key: "siteDescription",
        label: "站点描述",
        value: dto.siteDescription?.trim() || "面向中国市场的简体中文 AI SaaS / 内容型工具站底座。",
        description: "初始化向导设置的站点描述。",
        isPublic: true,
        sortOrder: 30
      },
      {
        key: "siteUrl",
        label: "前台地址",
        value: siteUrl,
        description: "初始化向导设置的前台访问地址。",
        isPublic: true,
        sortOrder: 24
      }
    ];

    await Promise.all(
      configs.map((config) =>
        this.prisma.systemConfig.upsert({
          where: {
            key: config.key
          },
          update: {
            label: config.label,
            value: config.value,
            description: config.description,
            isPublic: config.isPublic,
            sortOrder: config.sortOrder
          },
          create: {
            ...config,
            group: "site"
          }
        })
      )
    );

    return this.getSetupStatus();
  }

  async enablePresetTools() {
    const result = await this.prisma.aiScenario.updateMany({
      where: {
        OR: [
          {
            isBuiltIn: true
          },
          {
            templateVersion: {
              not: null
            }
          }
        ]
      },
      data: {
        isEnabled: true
      }
    });

    return {
      enabledCount: result.count,
      message: result.count > 0 ? "历史模板已启用，可迁移为场景应用" : "未检测到历史模板"
    };
  }

  async completeSetup(dto: CompleteSetupDto, adminUserId: string) {
    const status = await this.getSetupStatus();

    if (!status.requiredReady) {
      throw new AppException(40001, "管理员、站点名称和基础 seed 完成后才能结束初始化", HttpStatus.BAD_REQUEST);
    }

    const completedAt = new Date().toISOString();
    const configs = [
      {
        key: "developerOnboardingCompletedAt",
        label: "开发者初始化完成时间",
        value: completedAt,
        description: "后台初始化向导完成时间。",
        isPublic: false,
        sortOrder: 900
      },
      {
        key: "developerOnboardingCompletedBy",
        label: "开发者初始化完成人",
        value: adminUserId,
        description: "完成后台初始化向导的管理员 ID。",
        isPublic: false,
        sortOrder: 901
      },
      {
        key: "developerOnboardingAiSkipped",
        label: "初始化是否跳过 AI",
        value: dto.aiSkipped ? "1" : "0",
        description: "初始化向导中是否跳过 AI Provider 配置。",
        isPublic: false,
        sortOrder: 902
      },
      {
        key: "developerOnboardingPaymentSkipped",
        label: "初始化是否跳过支付",
        value: dto.paymentSkipped ? "1" : "0",
        description: "初始化向导中是否跳过支付配置。",
        isPublic: false,
        sortOrder: 903
      }
    ];

    await Promise.all(
      configs.map((config) =>
        this.prisma.systemConfig.upsert({
          where: {
            key: config.key
          },
          update: {
            value: config.value,
            description: config.description,
            isPublic: config.isPublic,
            sortOrder: config.sortOrder
          },
          create: {
            ...config,
            group: "onboarding"
          }
        })
      )
    );

    return this.getSetupStatus();
  }

  async getEnvCheck() {
    const database = await this.databaseState();
    const redis = await this.redisState();
    const aiProviderCount = await this.configuredAiProviderCount();
    const hasPaymentConfig = await this.paymentConfigured();

    return [
      database,
      redis,
      envItem("jwtAccessSecret", "JWT Access Secret", Boolean(process.env.JWT_ACCESS_SECRET)),
      envItem("jwtRefreshSecret", "JWT Refresh Secret", Boolean(process.env.JWT_REFRESH_SECRET)),
      {
        key: "payment",
        label: "支付配置状态",
        status: hasPaymentConfig ? "已配置" : "未配置",
        detail: hasPaymentConfig ? "已检测到正式启用的支付方式" : "生产前需在后台完成支付配置并正式启用"
      },
      {
        key: "aiProvider",
        label: "AI Provider 配置状态",
        status: aiProviderCount > 0 ? "已配置" : "未配置",
        detail: aiProviderCount > 0 ? `已启用 ${aiProviderCount} 个 Provider` : "未启用 Provider 或未配置 API Key"
      },
      {
        key: "objectStorage",
        label: "对象存储配置状态",
        status: s3Configured() ? "已配置" : "未配置",
        detail: s3Configured() ? "已检测到 S3 兼容对象存储变量" : "当前可使用本地上传目录"
      },
      {
        key: "email",
        label: "邮件服务配置状态",
        status: emailConfigured() ? "已配置" : "未配置",
        detail: emailConfigured() ? "已检测到邮件服务变量" : "当前项目尚未强依赖邮件发送"
      },
      envItem("appBaseUrl", "APP_BASE_URL", Boolean(process.env.APP_BASE_URL), safePublicValue(process.env.APP_BASE_URL)),
      envItem("apiBaseUrl", "API_BASE_URL", Boolean(process.env.API_BASE_URL), safePublicValue(process.env.API_BASE_URL))
    ];
  }

  private async systemConfigValue(key: string) {
    const config = await this.prisma.systemConfig.findUnique({
      where: {
        key
      },
      select: {
        value: true
      }
    });

    return config?.value ?? null;
  }

  private async configuredAiProviderCount() {
    const [newProviderCount, legacyProviderCount] = await Promise.all([
      this.prisma.aiProviderInstance.count({
        where: {
          status: "ENABLED",
          credential: {
            isNot: null
          }
        }
      }),
      this.prisma.aiProvider.count({
        where: {
          isEnabled: true,
          apiKeyEncrypted: {
            not: ""
          }
        }
      })
    ]);

    return newProviderCount + legacyProviderCount;
  }

  private async enabledAiModelCount() {
    const [newModelCount, legacyModelCount] = await Promise.all([
      this.prisma.aiModelInstance.count({
        where: {
          isEnabled: true,
          providerInstance: {
            status: "ENABLED"
          }
        }
      }),
      this.prisma.aiModel.count({
        where: {
          isEnabled: true,
          provider: {
            isEnabled: true
          }
        }
      })
    ]);

    return newModelCount + legacyModelCount;
  }

  private async databaseState() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        key: "database",
        label: "数据库连接",
        status: "连接正常" as EnvState,
        detail: databasePreview(process.env.DATABASE_URL)
      };
    } catch {
      return {
        key: "database",
        label: "数据库连接",
        status: "连接失败" as EnvState,
        detail: databasePreview(process.env.DATABASE_URL)
      };
    }
  }

  private async redisState() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      return {
        key: "redis",
        label: "Redis 连接",
        status: "未配置" as EnvState,
        detail: "REDIS_URL 未配置"
      };
    }

    const connected = await pingTcp(redisUrl);

    return {
      key: "redis",
      label: "Redis 连接",
      status: connected ? "连接正常" : "连接失败",
      detail: redisPreview(redisUrl)
    };
  }

  private async paymentConfigured() {
    const configs = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          in: [
            "paymentAlipayEnabled",
            "paymentAlipayAppId",
            "paymentAlipayPrivateKeyEncrypted",
            "paymentAlipayPublicKeyEncrypted",
            "paymentAlipayNotifyUrl",
            "paymentAlipayPageEnabled",
            "paymentAlipayWapEnabled",
            "paymentWechatEnabled",
            "paymentWechatAppId",
            "paymentWechatMerchantId",
            "paymentWechatApiV3KeyEncrypted",
            "paymentWechatMerchantPrivateKeyEncrypted",
            "paymentWechatMerchantSerialNo",
            "paymentWechatNotifyUrl",
            "paymentWechatPublicKeyEncrypted",
            "paymentWechatPublicKeyId",
            "paymentWechatAppSecretEncrypted",
            "paymentWechatJsapiOauthCallbackUrl",
            "paymentWechatNativeEnabled",
            "paymentWechatH5Enabled",
            "paymentWechatJsapiEnabled"
          ]
        }
      },
      select: {
        key: true,
        value: true
      }
    });
    const values = new Map(configs.map((config) => [config.key, config.value]));
    const alipay = Boolean(
      values.get("paymentAlipayEnabled") === "true" &&
      values.get("paymentAlipayAppId") &&
      values.get("paymentAlipayPrivateKeyEncrypted") &&
      values.get("paymentAlipayPublicKeyEncrypted") &&
      values.get("paymentAlipayNotifyUrl") &&
      (values.get("paymentAlipayPageEnabled") === "true" || values.get("paymentAlipayWapEnabled") === "true")
    );
    const wechat = Boolean(
      values.get("paymentWechatEnabled") === "true" &&
      values.get("paymentWechatAppId") &&
      values.get("paymentWechatMerchantId") &&
      values.get("paymentWechatApiV3KeyEncrypted") &&
      values.get("paymentWechatMerchantPrivateKeyEncrypted") &&
      values.get("paymentWechatMerchantSerialNo") &&
      values.get("paymentWechatNotifyUrl") &&
      values.get("paymentWechatPublicKeyEncrypted") &&
      values.get("paymentWechatPublicKeyId") &&
      (
        values.get("paymentWechatNativeEnabled") === "true" ||
        values.get("paymentWechatH5Enabled") === "true" ||
        (
          values.get("paymentWechatJsapiEnabled") === "true" &&
          values.get("paymentWechatAppSecretEncrypted") &&
          values.get("paymentWechatJsapiOauthCallbackUrl")
        )
      )
    );

    return alipay || wechat || process.env.ENABLE_MOCK_PAYMENT_NOTIFY === "1";
  }
}

function envItem(key: string, label: string, configured: boolean, detail?: string) {
  return {
    key,
    label,
    status: configured ? "已配置" : "未配置",
    detail: detail ?? (configured ? "已配置，内容已隐藏" : "未配置")
  };
}

function s3Configured() {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );
}

function emailConfigured() {
  return Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY || process.env.MAIL_PROVIDER);
}

function safePublicValue(value: string | undefined) {
  return value?.trim() || "未配置";
}

function databasePreview(value: string | undefined) {
  if (!value) {
    return "DATABASE_URL 未配置";
  }

  try {
    const url = new URL(value);

    return `${url.protocol}//${url.hostname}:${url.port || "默认端口"}/${url.pathname.replace(/^\//, "") || "默认库"}`;
  } catch {
    return "DATABASE_URL 已配置，格式无法解析";
  }
}

function redisPreview(value: string) {
  try {
    const url = new URL(value);

    return `${url.protocol}//${url.hostname}:${url.port || "3325"}`;
  } catch {
    return "REDIS_URL 已配置，格式无法解析";
  }
}

async function pingTcp(urlValue: string) {
  return new Promise<boolean>((resolve) => {
    let url: URL;

    try {
      url = new URL(urlValue);
    } catch {
      resolve(false);
      return;
    }

    const socket = createConnection({
      host: url.hostname,
      port: Number(url.port || 3325)
    });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1500);

    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(false);
    });
  });
}

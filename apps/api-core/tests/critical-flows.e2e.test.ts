import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

process.env.JWT_ACCESS_SECRET ??= `test-access-${randomUUID()}`;
process.env.JWT_REFRESH_SECRET ??= `test-refresh-${randomUUID()}`;
process.env.SECRET_ENCRYPTION_KEY ??= `test-secret-${randomUUID()}`;
process.env.ENABLE_MOCK_PAYMENT_NOTIFY ??= "1";

const unique = `e2e-${Date.now()}`;
const uploadDir = join(tmpdir(), `xueleai-uploads-${unique}`);
process.env.UPLOAD_DIR = uploadDir;
process.env.PUBLIC_API_BASE_URL = "http://127.0.0.1:3322/api";
process.env.CMS_SCHEDULED_PUBLISHER_ENABLED = "0";

interface ApiPayload<TData> {
  code: number;
  message: string;
  data: TData;
}

type CookieJar = Record<string, string>;

function captureCookies(headers: Headers, jar: CookieJar) {
  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);

  for (const value of setCookies.flatMap((item) => String(item).split(/,(?=[^;,]+=)/))) {
    const pair = value.split(";")[0] ?? "";
    const index = pair.indexOf("=");

    if (index > 0) {
      jar[pair.slice(0, index)] = pair.slice(index + 1);
    }
  }
}

function cookieHeader(jar: CookieJar) {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

async function startApp() {
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../src/app.module.js");
  const { HttpExceptionFilter } = await import("../src/common/http-exception.filter.js");
  const { createValidationPipe } = await import("../src/common/validation.js");
  const app = await NestFactory.create(AppModule, {
    logger: false,
    rawBody: true
  });

  app.setGlobalPrefix("api");
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(createValidationPipe());

  await app.listen(0, "127.0.0.1");

  return {
    app,
    baseUrl: `${await app.getUrl()}/api`
  };
}

test("关键业务 e2e 链路", { timeout: 180_000 }, async (t) => {
  const { encryptSecret, getPrismaClient, hashPassword } = await import("@xueleai/database");
  const prisma = getPrismaClient();
  const { app, baseUrl } = await startApp();
  const userJar: CookieJar = {};
  const adminJar: CookieJar = {};
  const originalFetch = globalThis.fetch;
  let capturedRegisterEmailCode = "";
  const systemConfigSnapshotKeys = [
    "siteName",
    "siteDescription",
    "siteUrl",
    "homeTitle",
    "themePrimaryColor",
    "publicNavItems",
    "footerText",
    "developerOnboardingCompletedAt",
    "developerOnboardingCompletedBy",
    "developerOnboardingAiSkipped",
    "developerOnboardingPaymentSkipped",
    "emailVerificationEnabled",
    "emailVerificationProvider",
    "aliyunMailAccessKeyId",
    "aliyunMailAccessKeySecretEncrypted",
    "aliyunMailEndpoint",
    "aliyunMailRegionId",
    "aliyunMailAccountName",
    "aliyunMailFromAlias",
    "aliyunMailAddressType",
    "aliyunMailReplyToAddress",
    "aliyunMailSubject",
    "aliyunMailBodyTemplate"
  ];

  async function request<TData>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      jar?: CookieJar;
      expectedCode?: number;
    } = {}
  ) {
    const headers = new Headers();
    headers.set("Content-Type", "application/json");

    if (options.jar) {
      headers.set("Cookie", cookieHeader(options.jar));
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (options.jar) {
      captureCookies(response.headers, options.jar);
    }

    const payload = (await response.json()) as ApiPayload<TData | null>;

    assert.equal(typeof payload.code, "number");
    assert.equal(typeof payload.message, "string");
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "data"), true);

    if (options.expectedCode !== undefined) {
      assert.equal(payload.code, options.expectedCode);
      assert.equal(payload.data, null);
      return payload as ApiPayload<null>;
    }

    assert.equal(payload.code, 0, `${path}: ${payload.message}`);
    assert.notEqual(payload.data, null);

    return payload as ApiPayload<TData>;
  }

  const originalDefaultChatAlias = await prisma.aiModelAlias.findUnique({
    where: {
      aliasKey: "default-chat"
    },
    select: {
      displayName: true,
      description: true,
      modelInstanceId: true
    }
  });
  const originalSystemConfigs = await prisma.systemConfig.findMany({
    where: {
      key: {
        in: systemConfigSnapshotKeys
      }
    }
  });

  await t.after(async () => {
    globalThis.fetch = originalFetch;
    await app.close();
    await prisma.systemAlert.deleteMany({
      where: {
        OR: [
          {
            title: {
              contains: unique
            }
          },
          {
            message: {
              contains: unique
            }
          },
          {
            fingerprint: {
              contains: unique
            }
          }
        ]
      }
    });
    await prisma.aiUsageDailyStat.deleteMany({
      where: {
        OR: [
          {
            userEmail: {
              contains: unique
            }
          },
          {
            scenarioName: {
              contains: unique
            }
          },
          {
            providerName: {
              contains: unique
            }
          },
          {
            modelName: {
              contains: unique
            }
          }
        ]
      }
    });
    await prisma.adminOperationLog.deleteMany({
      where: {
        description: {
          contains: unique
        }
      }
    });
    const paymentOrders = await prisma.paymentOrder.findMany({
      where: {
        user: {
          email: {
            contains: unique
          }
        }
      },
      select: {
        orderNo: true
      }
    });

    if (paymentOrders.length > 0) {
      await prisma.paymentNotifyLog.deleteMany({
        where: {
          orderNo: {
            in: paymentOrders.map((order) => order.orderNo)
          }
        }
      });
    }

    await prisma.ledgerEntry.deleteMany({
      where: {
        user: {
          email: {
            contains: unique
          }
        }
      }
    });
    await prisma.aiCallLog.deleteMany({
      where: {
        task: {
          user: {
            email: {
              contains: unique
            }
          }
        }
      }
    });
    await prisma.creditReservation.deleteMany({
      where: {
        user: {
          email: {
            contains: unique
          }
        }
      }
    });
    await prisma.aiTask.deleteMany({
      where: {
        user: {
          email: {
            contains: unique
          }
        }
      }
    });
    await prisma.aiScenario.deleteMany({
      where: {
        slug: {
          contains: unique
        }
      }
    });
    await prisma.aiToolCategory.deleteMany({
      where: {
        slug: {
          contains: unique
        }
      }
    });
    if (originalDefaultChatAlias) {
      await prisma.aiModelAlias.upsert({
        where: {
          aliasKey: "default-chat"
        },
        update: {
          displayName: originalDefaultChatAlias.displayName,
          description: originalDefaultChatAlias.description,
          modelInstanceId: originalDefaultChatAlias.modelInstanceId
        },
        create: {
          aliasKey: "default-chat",
          displayName: originalDefaultChatAlias.displayName,
          description: originalDefaultChatAlias.description,
          modelInstanceId: originalDefaultChatAlias.modelInstanceId
        }
      });
    } else {
      await prisma.aiModelAlias.deleteMany({
        where: {
          aliasKey: "default-chat"
        }
      });
    }
    await prisma.aiProviderInstance.deleteMany({
      where: {
        providerPreset: {
          providerKey: {
            contains: unique
          }
        }
      }
    });
    await prisma.aiProviderPreset.deleteMany({
      where: {
        providerKey: {
          contains: unique
        }
      }
    });
    await prisma.paymentOrder.deleteMany({
      where: {
        user: {
          email: {
            contains: unique
          }
        }
      }
    });
    await prisma.wallet.deleteMany({
      where: {
        user: {
          email: {
            contains: unique
          }
        }
      }
    });
    await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          {
            user: {
              email: {
                contains: unique
              }
            }
          },
          {
            adminUser: {
              email: {
                contains: unique
              }
            }
          }
        ]
      }
    });
    await prisma.emailVerificationCode.deleteMany({
      where: {
        email: {
          contains: unique
        }
      }
    });
    await prisma.adminOperationLog.deleteMany({
      where: {
        adminUser: {
          email: {
            contains: unique
          }
        }
      }
    });
    await prisma.adminUser.deleteMany({
      where: {
        email: {
          contains: unique
        }
      }
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: unique
        }
      }
    });
    await prisma.article.deleteMany({
      where: {
        slug: {
          contains: unique
        }
      }
    });
    await prisma.tag.deleteMany({
      where: {
        slug: {
          contains: unique
        }
      }
    });
    await prisma.mediaAsset.deleteMany({
      where: {
        originalName: {
          contains: unique
        }
      }
    });
    await prisma.articleCategory.deleteMany({
      where: {
        slug: {
          contains: unique
        }
      }
    });
    await prisma.page.deleteMany({
      where: {
        slug: {
          contains: unique
        }
      }
    });
    await prisma.loginFailure.deleteMany({
      where: {
        subject: {
          contains: unique
        }
      }
    });
    await prisma.$transaction(async (tx) => {
      await tx.systemConfig.deleteMany({
        where: {
          key: {
            in: systemConfigSnapshotKeys
          }
        }
      });

      if (originalSystemConfigs.length > 0) {
        await tx.systemConfig.createMany({
          data: originalSystemConfigs.map((config) => ({
            id: config.id,
            key: config.key,
            label: config.label,
            value: config.value,
            description: config.description,
            group: config.group,
            isPublic: config.isPublic,
            sortOrder: config.sortOrder,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt
          }))
        });
      }
    });
    await rm(uploadDir, {
      recursive: true,
      force: true
    });
  });

  async function configureE2eEmailVerification() {
    const configs = [
      ["emailVerificationEnabled", "邮件验证启用", "true"],
      ["emailVerificationProvider", "邮件验证方案", "ALIYUN_DIRECT_MAIL"],
      ["aliyunMailAccessKeyId", "阿里云邮件 AccessKey ID", "e2e-mail-key"],
      ["aliyunMailAccessKeySecretEncrypted", "阿里云邮件 AccessKey Secret", encryptSecret("e2e-mail-secret")],
      ["aliyunMailEndpoint", "阿里云邮件 Endpoint", "https://dm.aliyuncs.com/"],
      ["aliyunMailRegionId", "阿里云邮件区域", "cn-hangzhou"],
      ["aliyunMailAccountName", "发信地址", "notice@example.com"],
      ["aliyunMailFromAlias", "发信人昵称", "学乐AI"],
      ["aliyunMailAddressType", "发信地址类型", "1"],
      ["aliyunMailReplyToAddress", "使用回信地址", "true"],
      ["aliyunMailSubject", "邮件验证码标题", "邮箱验证码"],
      ["aliyunMailBodyTemplate", "邮件验证码模板", "您的验证码是 ${code}，5 分钟内有效。"]
    ] as const;

    for (const [key, label, value] of configs) {
      await prisma.systemConfig.upsert({
        where: {
          key
        },
        update: {
          value
        },
        create: {
          key,
          label,
          value,
          description: "端到端测试邮件验证码配置。",
          group: "send",
          isPublic: false,
          sortOrder: 120
        }
      });
    }
  }

  const userEmail = `flow-${unique}@example.com`;
  const password = "Test123456";
  const adminEmail = `admin-${unique}@example.com`;
  const adminPassword = "AdminTest123456";

  await prisma.adminUser.create({
    data: {
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      name: "链路测试管理员",
      role: "SUPER_ADMIN",
      status: "ACTIVE"
    }
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url === "https://dm.aliyuncs.com/") {
      const body = init?.body?.toString() ?? "";
      const params = new URLSearchParams(body);
      capturedRegisterEmailCode = (params.get("HtmlBody") ?? params.get("TextBody") ?? "").match(/\b(\d{6})\b/)?.[1] ?? "";

      return new Response(
        JSON.stringify({
          EnvId: "e2e-mail-env",
          RequestId: `mail-request-${unique}`,
          Code: "OK"
        }),
        {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        }
      );
    }

    return originalFetch(input, init);
  }) as typeof fetch;
  await configureE2eEmailVerification();
  await request("/auth/email-code", {
    method: "POST",
    body: {
      email: userEmail,
      purpose: "REGISTER"
    }
  });
  assert.match(capturedRegisterEmailCode, /^\d{6}$/);

  const registered = await request<{
    user: {
      id: string;
      email: string;
    };
  }>("/auth/register", {
    method: "POST",
    jar: userJar,
    body: {
      email: userEmail,
      password,
      nickname: "链路测试用户",
      emailCode: capturedRegisterEmailCode
    }
  });
  assert.equal(registered.data.user.email, userEmail);

  await request("/auth/logout", {
    method: "POST",
    jar: userJar
  });
  await request("/auth/login", {
    method: "POST",
    jar: userJar,
    body: {
      email: userEmail,
      password
    }
  });
  await request("/auth/me", {
    jar: userJar
  });
  await request("/profiles/select", {
    method: "POST",
    jar: userJar,
    body: {
      mode: "ACCOUNT"
    }
  });
  const updatedProfile = await request<{
    nickname: string;
  }>("/auth/profile", {
    method: "PATCH",
    jar: userJar,
    body: {
      nickname: `链路用户 ${unique}`
    }
  });
  assert.equal(updatedProfile.data.nickname, `链路用户 ${unique}`);
  const changedPassword = `${password}7`;
  await request("/auth/password", {
    method: "PATCH",
    jar: userJar,
    body: {
      currentPassword: password,
      newPassword: changedPassword
    }
  });
  await request("/auth/login", {
    method: "POST",
    jar: userJar,
    body: {
      email: userEmail,
      password: changedPassword
    }
  });
  await request("/profiles/select", {
    method: "POST",
    jar: userJar,
    body: {
      mode: "ACCOUNT"
    }
  });

  await request("/admin-auth/login", {
    method: "POST",
    jar: adminJar,
    body: {
      email: adminEmail,
      password: adminPassword
    }
  });

  const setupStatus = await request<{
    isInitialized: boolean;
    checks: Array<{
      key: string;
      message: string;
    }>;
    summary: {
      hasAdmin: boolean;
    };
  }>("/setup/status");
  assert.equal(setupStatus.data.summary.hasAdmin, true);
  assert.ok(setupStatus.data.checks.some((item) => item.key === "admin"));

  const duplicateSetupAdmin = await request("/setup/admin", {
    method: "POST",
    expectedCode: 40002,
    body: {
      email: `blocked-${unique}@example.com`,
      password: "AdminTest123456",
      name: "不应创建"
    }
  });
  assert.match(duplicateSetupAdmin.message, /已存在管理员/);

  const setupSite = await request<{
    summary: {
      hasSiteName: boolean;
    };
  }>("/admin/setup/site", {
    method: "POST",
    jar: adminJar,
    body: {
      siteName: `链路站点 ${unique}`,
      siteDescription: "链路初始化测试站点",
      siteUrl: "http://localhost:3321"
    }
  });
  assert.equal(setupSite.data.summary.hasSiteName, true);

  const envChecks = await request<
    Array<{
      key: string;
      status: string;
      detail: string;
    }>
  >("/admin/system/env-check", {
    jar: adminJar
  });
  assert.ok(envChecks.data.some((item) => item.key === "database"));
  assert.equal(
    envChecks.data.some(
      (item) =>
        item.detail.includes(process.env.JWT_ACCESS_SECRET ?? "__missing__") ||
        item.detail.includes(process.env.JWT_REFRESH_SECRET ?? "__missing__") ||
        item.detail.includes(process.env.DATABASE_URL ?? "__missing__")
    ),
    false
  );

  const { seedAiToolTemplates } = await import("../../../packages/database/prisma/seed-ai-tool-templates.js");
  const { seedAiPresets } = await import("../../../packages/database/prisma/seed-ai-presets.js");
  await seedAiToolTemplates(prisma);
  await seedAiPresets(prisma);
  const setupTools = await request<{
    enabledCount: number;
  }>("/admin/setup/tools", {
    method: "POST",
    jar: adminJar
  });
  assert.ok(setupTools.data.enabledCount >= 1);
  const publicToolCategories = await request<
    Array<{
      slug: string;
      name: string;
    }>
  >("/ai/tool-categories");
  assert.ok(publicToolCategories.data.some((item) => item.slug === "writing"));

  const publicTools = await request<
    Array<{
      slug: string;
      inputSchema: {
        fields: Array<{
          name: string;
          type: string;
        }>;
      } | null;
      toolCategory: {
        slug: string;
      } | null;
    }>
  >("/ai/tools");
  assert.ok(publicTools.data.some((item) => item.slug === "copywriting" && item.inputSchema?.fields.length));

  const copywritingTool = await request<{
    slug: string;
    inputSchema: {
      fields: Array<{
        name: string;
      }>;
    } | null;
  }>("/ai/tools/copywriting");
  assert.equal(copywritingTool.data.slug, "copywriting");
  assert.ok(copywritingTool.data.inputSchema?.fields.some((field) => field.name === "input"));

  const aiToolCategory = await request<{
    id: string;
    slug: string;
    isVisible: boolean;
  }>("/admin/ai/tool-categories", {
    method: "POST",
    jar: adminJar,
    body: {
      name: `链路工具分类 ${unique}`,
      slug: `${unique}-tools`,
      description: "链路测试 AI 工具分类",
      sortOrder: 900,
      isVisible: true
    }
  });
  assert.equal(aiToolCategory.data.slug, `${unique}-tools`);

  const importPayload = {
    templates: [
      {
        toolKey: `tool-template-${unique}`,
        name: `链路导入工具 ${unique}`,
        slug: `tool-template-${unique}`,
        description: "链路测试导入工具",
        category: {
          name: `链路导入分类 ${unique}`,
          slug: `tool-category-${unique}`,
          description: "链路测试导入分类",
          sortOrder: 901,
          isVisible: true
        },
        inputSchema: {
          fields: [
            {
              name: "input",
              label: "输入内容",
              type: "textarea",
              required: true
            },
            {
              name: "tone",
              label: "语气",
              type: "select",
              required: true,
              options: ["克制", "直接"]
            }
          ]
        },
        promptTemplate: "请用 {{tone}} 的语气处理：{input}",
        modelAlias: "default-chat",
        fallbackModelAlias: "fast-chat",
        requiredCapabilities: ["TEXT"],
        costRule: {
          type: "fixed",
          credits: 5
        },
        isEnabled: true,
        sortOrder: 902,
        templateVersion: "test"
      }
    ]
  };

  const importPreview = await request<{
    createCount: number;
    conflictCount: number;
  }>("/admin/ai/tool-templates/import/preview", {
    method: "POST",
    jar: adminJar,
    body: {
      payload: importPayload
    }
  });
  assert.equal(importPreview.data.createCount, 1);
  assert.equal(importPreview.data.conflictCount, 0);

  const importResult = await request<{
    createdCount: number;
    skippedCount: number;
  }>("/admin/ai/tool-templates/import", {
    method: "POST",
    jar: adminJar,
    body: {
      payload: importPayload,
      skipConflicts: true
    }
  });
  assert.equal(importResult.data.createdCount, 1);
  assert.equal(importResult.data.skippedCount, 0);

  const conflictPreview = await request<{
    createCount: number;
    conflictCount: number;
  }>("/admin/ai/tool-templates/import/preview", {
    method: "POST",
    jar: adminJar,
    body: {
      payload: importPayload
    }
  });
  assert.equal(conflictPreview.data.createCount, 0);
  assert.equal(conflictPreview.data.conflictCount, 1);

  const secretTemplateImport = await request("/admin/ai/tool-templates/import/preview", {
    method: "POST",
    jar: adminJar,
    expectedCode: 40001,
    body: {
      payload: {
        ...importPayload,
        templates: [
          {
            ...importPayload.templates[0],
            slug: `secret-template-${unique}`,
            toolKey: `secret-template-${unique}`,
            apiKey: `sk-${unique}`
          }
        ]
      }
    }
  });
  assert.match(secretTemplateImport.message, /密钥字段/);

  const importedTool = await request<{
    id: string;
    slug: string;
    inputSchema: {
      fields: Array<{
        name: string;
      }>;
    } | null;
  }>(`/ai/tools/tool-template-${unique}`);
  assert.ok(importedTool.data.inputSchema?.fields.some((field) => field.name === "tone"));

  const schemaValidationTask = await request("/ai/tasks", {
    method: "POST",
    jar: userJar,
    expectedCode: 40001,
    body: {
      scenarioId: importedTool.data.id,
      input: "缺少语气"
    }
  });
  assert.match(schemaValidationTask.message, /请填写语气/);

  const exportedToolTemplates = await request<{
    templates: Array<{
      toolKey: string;
      slug: string;
      modelAlias: string;
      costRule: {
        type: string;
        credits: number;
      };
    }>;
  }>("/admin/ai/tool-templates/export", {
    jar: adminJar
  });
  const exportedTool = exportedToolTemplates.data.templates.find((item) => item.slug === `tool-template-${unique}`);
  assert.ok(exportedTool);
  assert.equal(exportedTool.toolKey, `tool-template-${unique}`);
  assert.equal(exportedTool.modelAlias, "default-chat");
  assert.equal(exportedTool.costRule.credits, 5);

  const aiProviderPreset = await prisma.aiProviderPreset.create({
    data: {
      providerKey: `test-provider-${unique}`,
      displayName: `链路测试 Provider ${unique}`,
      adapterType: "OPENAI_COMPATIBLE",
      defaultBaseUrl: "http://127.0.0.1:3329/v1",
      apiKeyEnvName: "TEST_AI_API_KEY",
      isBuiltIn: false,
      isEnabledByDefault: false,
      presetVersion: "test",
      lastUpdatedAt: new Date(),
      modelPresets: {
        create: {
          modelKey: `test-model-${unique}`,
          displayName: "链路测试模型",
          providerModelName: `test-model-${unique}`,
          capabilityTags: ["TEXT", "STREAMING"],
          supportsStreaming: true,
          recommendedAlias: "default-chat"
        }
      }
    },
    include: {
      modelPresets: true
    }
  });
  const providerPresets = await request<
    Array<{
      id: string;
      providerKey: string;
      displayName: string;
      instance: {
        status: string;
      } | null;
    }>
  >("/admin/ai/providers", {
    jar: adminJar
  });
  assert.ok(providerPresets.data.some((item) => item.providerKey === "openai"));
  assert.ok(providerPresets.data.some((item) => item.id === aiProviderPreset.id));

  const configuredProvider = await request<{
    id: string;
    displayName: string;
    instance: {
      id: string;
      status: string;
      hasApiKey: boolean;
      apiKeyPreview: string;
    };
  }>(`/admin/ai/providers/${aiProviderPreset.id}`, {
    method: "PATCH",
    jar: adminJar,
    body: {
      name: `链路 Provider 实例 ${unique}`,
      baseUrl: "http://127.0.0.1:3329/v1",
      apiKey: `sk-test-${unique}`,
      status: "ENABLED"
    }
  });
  assert.equal(configuredProvider.data.instance.status, "ENABLED");
  assert.equal(configuredProvider.data.instance.hasApiKey, true);
  assert.notEqual(configuredProvider.data.instance.apiKeyPreview, `sk-test-${unique}`);

  const providerWithModel = await request<{
    instance: {
      modelInstances: Array<{
        id: string;
        providerModelName: string;
        capabilityTags: string[];
        isEnabled: boolean;
      }>;
    };
  }>(`/admin/ai/providers/${aiProviderPreset.id}/model-presets/${aiProviderPreset.modelPresets[0].id}/enable`, {
    method: "POST",
    jar: adminJar,
    body: {
      displayName: "链路测试模型",
      providerModelName: `test-model-${unique}`,
      capabilityTags: ["TEXT", "STREAMING"],
      inputPrice: 1,
      outputPrice: 2,
      isEnabled: true
    }
  });
  const enabledModelInstance = providerWithModel.data.instance.modelInstances.find(
    (item) => item.providerModelName === `test-model-${unique}`
  );
  assert.ok(enabledModelInstance);
  assert.equal(enabledModelInstance.isEnabled, true);
  assert.deepEqual(enabledModelInstance.capabilityTags, ["TEXT", "STREAMING"]);

  const modelAliases = await request<{
    aliases: Array<{
      aliasKey: string;
      modelInstanceId: string | null;
    }>;
    modelInstances: Array<{
      id: string;
      providerModelName: string;
    }>;
  }>("/admin/ai/model-aliases", {
    jar: adminJar
  });
  assert.ok(modelAliases.data.aliases.some((item) => item.aliasKey === "default-chat"));
  assert.ok(modelAliases.data.modelInstances.some((item) => item.id === enabledModelInstance.id));

  const updatedAliases = await request<{
    aliases: Array<{
      aliasKey: string;
      modelInstanceId: string | null;
    }>;
  }>("/admin/ai/model-aliases/default-chat", {
    method: "PATCH",
    jar: adminJar,
    body: {
      modelInstanceId: enabledModelInstance.id
    }
  });
  assert.equal(
    updatedAliases.data.aliases.find((item) => item.aliasKey === "default-chat")?.modelInstanceId,
    enabledModelInstance.id
  );

  const rejectedDefaultChatUnbind = await request("/admin/ai/model-aliases/default-chat", {
    method: "PATCH",
    jar: adminJar,
    expectedCode: 40001,
    body: {
      modelInstanceId: ""
    }
  });
  assert.match(rejectedDefaultChatUnbind.message, /默认聊天模型/);
  const defaultChatAliasAfterRejectedUnbind = await prisma.aiModelAlias.findUniqueOrThrow({
    where: {
      aliasKey: "default-chat"
    }
  });
  assert.equal(defaultChatAliasAfterRejectedUnbind.modelInstanceId, enabledModelInstance.id);

  const missingAliasScenario = await prisma.aiScenario.create({
    data: {
      name: `未绑定别名 ${unique}`,
      slug: `alias-missing-${unique}`,
      promptTemplate: "{input}",
      promptVariables: [],
      requiredCapabilities: ["TEXT"],
      costCredits: 1,
      isEnabled: true,
      modelBinding: {
        create: {
          defaultModelAlias: `missing-${unique}`
        }
      }
    }
  });
  const missingAliasTask = await request("/ai/tasks", {
    method: "POST",
    jar: userJar,
    expectedCode: 40001,
    body: {
      scenarioId: missingAliasScenario.id,
      input: "测试未配置别名"
    }
  });
  assert.match(missingAliasTask.message, /模型别名|未配置/);

  const capabilityScenario = await prisma.aiScenario.create({
    data: {
      name: `能力不匹配 ${unique}`,
      slug: `capability-missing-${unique}`,
      promptTemplate: "{input}",
      promptVariables: [],
      requiredCapabilities: ["VISION"],
      costCredits: 1,
      isEnabled: true,
      modelBinding: {
        create: {
          defaultModelAlias: "default-chat"
        }
      }
    }
  });
  const capabilityTask = await request("/ai/tasks", {
    method: "POST",
    jar: userJar,
    expectedCode: 40001,
    body: {
      scenarioId: capabilityScenario.id,
      input: "测试视觉能力缺失"
    }
  });
  assert.match(capabilityTask.message, /不支持视觉理解/);

  const providerTest = await request<{
    success: boolean;
    message: string;
  }>(`/admin/ai/providers/${aiProviderPreset.id}/test`, {
    method: "POST",
    jar: adminJar
  });
  assert.equal(providerTest.data.success, false);
  assert.match(providerTest.data.message, /Base URL|连接/);

  const category = await request<{
    id: string;
    name: string;
    slug: string;
  }>("/cms/categories", {
    method: "POST",
    jar: adminJar,
    body: {
      name: `链路分类 ${unique}`,
      slug: `${unique}-category`,
      description: `链路测试分类 ${unique}`,
      sortOrder: 300,
      isVisible: true
    }
  });
  assert.equal(category.data.slug, `${unique}-category`);

  const mediaForm = new FormData();
  mediaForm.set(
    "file",
    new Blob([Buffer.from("89504e470d0a1a0a", "hex")], {
      type: "image/png"
    }),
    `${unique}-cover.png`
  );
  const mediaHeaders = new Headers();
  mediaHeaders.set("Cookie", cookieHeader(adminJar));
  const mediaResponse = await fetch(`${baseUrl}/media/admin/upload`, {
    method: "POST",
    headers: mediaHeaders,
    body: mediaForm
  });
  const mediaPayload = (await mediaResponse.json()) as ApiPayload<{
    id: string;
    url: string;
    storageProvider: string;
  } | null>;
  assert.equal(mediaPayload.code, 0, mediaPayload.message);
  assert.ok(mediaPayload.data);
  assert.equal(mediaPayload.data.storageProvider, "LOCAL");
  assert.match(mediaPayload.data.url, /\/media\/files\//);

  const tag = await request<{
    id: string;
    name: string;
    slug: string;
  }>("/cms/tags", {
    method: "POST",
    jar: adminJar,
    body: {
      name: `链路标签 ${unique}`,
      slug: `${unique}-tag`
    }
  });
  assert.equal(tag.data.slug, `${unique}-tag`);

  const article = await request<{
    id: string;
    slug: string;
  }>("/cms/articles", {
    method: "POST",
    jar: adminJar,
    body: {
      categoryId: category.data.id,
      title: `链路文章 ${unique}`,
      slug: `${unique}-article`,
      summary: "链路测试文章",
      coverMediaId: mediaPayload.data.id,
      content: "链路测试文章正文",
      status: "DRAFT",
      tagSlugs: [tag.data.slug],
      seoKeywords: "链路测试,AI SaaS"
    }
  });
  const previewArticle = await request<{
    status: string;
    coverMediaId: string | null;
    tags: Array<{
      slug: string;
    }>;
  }>(`/cms/articles/${article.data.id}/preview`, {
    jar: adminJar
  });
  assert.equal(previewArticle.data.status, "DRAFT");
  assert.equal(previewArticle.data.coverMediaId, mediaPayload.data.id);
  assert.ok(previewArticle.data.tags.some((item) => item.slug === tag.data.slug));
  await request(`/public/articles/${article.data.slug}`, {
    expectedCode: 40401
  });
  await request(`/cms/articles/${article.data.id}/publish`, {
    method: "POST",
    jar: adminJar
  });
  await request(`/public/articles/${article.data.slug}`);

  const dueArticle = await request<{
    id: string;
    slug: string;
  }>("/cms/articles", {
    method: "POST",
    jar: adminJar,
    body: {
      categoryId: category.data.id,
      title: `定时文章 ${unique}`,
      slug: `${unique}-scheduled-article`,
      summary: "定时发布测试文章",
      content: "定时发布测试文章正文",
      status: "DRAFT",
      scheduledAt: new Date(Date.now() - 60_000).toISOString()
    }
  });
  const publishDue = await request<{
    articles: number;
    pages: number;
  }>("/cms/scheduled/publish-due", {
    method: "POST",
    jar: adminJar
  });
  assert.ok(publishDue.data.articles >= 1);
  await request(`/public/articles/${dueArticle.data.slug}`);

  const order = await request<{
    id: string;
    orderNo: string;
    credits: number;
  }>("/payment/orders", {
    method: "POST",
    jar: userJar,
    body: {
      provider: "ALIPAY",
      packageCode: "starter"
    }
  });
  await request("/payment/mock/ALIPAY/notify", {
    method: "POST",
    body: {
      orderNo: order.data.orderNo,
      providerTradeNo: `${unique}-trade`
    }
  });
  const adminPaymentOrders = await request<
    Array<{
      orderNo: string;
      status: string;
    }>
  >("/admin/payments", {
    jar: adminJar
  });
  assert.ok(
    adminPaymentOrders.data.some((item) => item.orderNo === order.data.orderNo && item.status === "PAID")
  );

  const notifyLogs = await request<
    Array<{
      orderNo: string | null;
      verifyResult: string;
      processResult: string;
    }>
  >("/admin/payments/notify-logs", {
    jar: adminJar
  });
  assert.ok(
    notifyLogs.data.some(
      (item) =>
        item.orderNo === order.data.orderNo &&
        item.verifyResult === "SUCCESS" &&
        item.processResult === "CREDITED"
    )
  );

  const walletAfterPay = await request<{
    availableCredits: number;
    totalTopUpCredits: number;
  }>("/wallet/me", {
    jar: userJar
  });
  assert.equal(walletAfterPay.data.totalTopUpCredits, order.data.credits);

  const scenarios = await request<
    Array<{
      id: string;
      promptVariables?: Array<{
        name: string;
      }>;
      costCredits: number;
    }>
  >("/ai/scenarios", {
    jar: userJar
  });
  const visibleScenario = scenarios.data[0];
  assert.ok(visibleScenario);
  const mockScenario = await prisma.aiScenario.create({
    data: {
      name: `链路 Mock 场景 ${unique}`,
      slug: `mock-scenario-${unique}`,
      description: "链路测试专用场景",
      promptTemplate: "请围绕 {{topic}} 面向 {{audience}}，用 {{tone}} 的语气输出。\n\n{knowledge}\n\n{input}",
      promptVariables: [
        {
          name: "topic",
          label: "主题",
          required: true
        },
        {
          name: "audience",
          label: "目标受众",
          required: true
        },
        {
          name: "tone",
          label: "语气",
          required: true
        }
      ],
      costCredits: 20,
      isEnabled: true
    }
  });

  const knowledgeBase = await request<{
    id: string;
    name: string;
  }>("/knowledge-bases", {
    method: "POST",
    jar: userJar,
    body: {
      name: `链路知识库 ${unique}`,
      description: "链路测试知识库"
    }
  });
  const knowledgeForm = new FormData();
  knowledgeForm.set(
    "file",
    new Blob([`AI SaaS 高级能力链路测试资料 ${unique}`], {
      type: "text/plain"
    }),
    `${unique}.txt`
  );
  const knowledgeHeaders = new Headers();
  knowledgeHeaders.set("Cookie", cookieHeader(userJar));
  const knowledgeResponse = await fetch(`${baseUrl}/knowledge-bases/${knowledgeBase.data.id}/documents`, {
    method: "POST",
    headers: knowledgeHeaders,
    body: knowledgeForm
  });
  const knowledgePayload = (await knowledgeResponse.json()) as ApiPayload<{
    id: string;
    status: string;
    chunks: Array<{
      content: string;
    }>;
  } | null>;
  assert.equal(knowledgePayload.code, 0, knowledgePayload.message);
  assert.ok(knowledgePayload.data);
  assert.equal(knowledgePayload.data.status, "READY");
  assert.ok(knowledgePayload.data.chunks.length > 0);

  const successTask = await request<{
    id: string;
    status: string;
    renderedPrompt: string | null;
    inputPreview: string | null;
    inputHash: string | null;
    saveFullContent: boolean;
    actualCredits: number | null;
  }>("/ai/tasks", {
    method: "POST",
    jar: userJar,
    body: {
      scenarioId: mockScenario.id,
      input: "链路测试成功文案",
      variables: {
        topic: "高级 AI 能力",
        audience: "内容运营团队",
        tone: "克制专业"
      },
      knowledgeBaseId: knowledgeBase.data.id
    }
  });
  assert.equal(successTask.data.status, "SUCCEEDED");
  assert.match(successTask.data.renderedPrompt ?? "", /高级 AI 能力/);
  assert.equal(successTask.data.saveFullContent, false);
  assert.ok(successTask.data.inputPreview?.includes("链路测试成功文案"));
  assert.equal(successTask.data.inputHash?.length, 64);

  const walletBeforeFailure = await request<{
    availableCredits: number;
    frozenCredits: number;
  }>("/wallet/me", {
    jar: userJar
  });
  const failedTask = await request<{
    id: string;
    status: string;
  }>("/ai/tasks", {
    method: "POST",
    jar: userJar,
    body: {
      scenarioId: mockScenario.id,
      input: "触发失败",
      variables: {
        topic: "失败释放",
        audience: "测试用户",
        tone: "直接"
      }
    }
  });
  const walletAfterFailure = await request<{
    availableCredits: number;
    frozenCredits: number;
  }>("/wallet/me", {
    jar: userJar
  });

  assert.equal(failedTask.data.status, "FAILED");
  assert.equal(walletAfterFailure.data.frozenCredits, 0);
  assert.equal(walletAfterFailure.data.availableCredits, walletBeforeFailure.data.availableCredits);

  const userAiTasks = await request<
    Array<{
      id: string;
      status: string;
    }>
  >("/ai/tasks", {
    jar: userJar
  });
  assert.ok(userAiTasks.data.some((item) => item.id === successTask.data.id && item.status === "SUCCEEDED"));
  assert.ok(userAiTasks.data.some((item) => item.id === failedTask.data.id && item.status === "FAILED"));

  const agentTool = await request<{
    output: {
      result: number;
    };
  }>("/ai/agent-tools/run", {
    method: "POST",
    jar: userJar,
    body: {
      toolName: "calculate",
      input: {
        expression: "1 + 2 * 3"
      }
    }
  });
  assert.equal(agentTool.data.output.result, 7);

  const adminAiTasks = await request<
    Array<{
      id: string;
      status: string;
      modelName: string | null;
      inputHash: string | null;
      saveFullContent: boolean;
    }>
  >("/admin/ai-tasks", {
    jar: adminJar
  });
  assert.ok(adminAiTasks.data.some((item) => item.id === successTask.data.id));
  assert.ok(adminAiTasks.data.some((item) => item.id === failedTask.data.id && item.status === "FAILED"));
  assert.ok(adminAiTasks.data.some((item) => item.id === successTask.data.id && item.inputHash && !item.saveFullContent));

  const usageAggregate = await request<{
    scannedCallLogs: number;
    statRows: number;
  }>(`/admin/ai/usage/aggregate`, {
    method: "POST",
    jar: adminJar
  });
  assert.ok(usageAggregate.data.scannedCallLogs >= 2);
  assert.ok(usageAggregate.data.statRows >= 1);

  const usageDashboard = await request<{
    total: {
      requestCount: number;
      consumedCredits: number;
      estimatedCost: number;
      failureRate: number;
    };
    today: {
      requestCount: number;
    };
    top: {
      mostUsedModel: {
        name: string;
      } | null;
      mostUsedTool: {
        name: string;
      } | null;
    };
    trend: Array<{
      date: string;
      requestCount: number;
    }>;
  }>("/admin/ai/usage", {
    jar: adminJar
  });
  assert.ok(usageDashboard.data.total.requestCount >= 2);
  assert.ok(usageDashboard.data.today.requestCount >= 2);
  assert.ok(usageDashboard.data.total.consumedCredits >= (successTask.data.actualCredits ?? 0));
  assert.ok(usageDashboard.data.trend.length >= 1);
  assert.ok(usageDashboard.data.top.mostUsedModel);
  assert.ok(usageDashboard.data.top.mostUsedTool);

  const usageAlerts = await request<
    Array<{
      id: string;
      type: string;
      status: string;
      message: string;
    }>
  >("/admin/ai/usage/alerts", {
    jar: adminJar
  });
  const providerAlert = usageAlerts.data.find(
    (item) => item.type === "PROVIDER_UNAVAILABLE" && item.message.includes(unique)
  );
  assert.ok(providerAlert);

  const resolvedAlert = await request<{
    id: string;
    status: string;
  }>(`/admin/ai/usage/alerts/${providerAlert.id}/resolve`, {
    method: "POST",
    jar: adminJar
  });
  assert.equal(resolvedAlert.data.status, "RESOLVED");

  const adminUsers = await request<
    Array<{
      id: string;
      email: string;
      status: string;
      availableCredits: number;
      lastLoginAt: string | null;
    }>
  >("/admin/users", {
    jar: adminJar
  });
  const adminUserRow = adminUsers.data.find((item) => item.email === userEmail);
  assert.ok(adminUserRow);
  assert.equal(adminUserRow.status, "ACTIVE");
  assert.ok(adminUserRow.lastLoginAt);

  const adminUserDetail = await request<{
    user: {
      id: string;
      email: string;
    };
    wallet: {
      availableCredits: number;
      frozenCredits: number;
    };
    ledgerEntries: Array<{
      type: string;
    }>;
    paymentOrders: Array<{
      orderNo: string;
    }>;
    aiTasks: Array<{
      id: string;
    }>;
  }>(`/admin/users/${registered.data.user.id}`, {
    jar: adminJar
  });
  assert.equal(adminUserDetail.data.user.email, userEmail);
  assert.ok(adminUserDetail.data.paymentOrders.some((item) => item.orderNo === order.data.orderNo));
  assert.ok(adminUserDetail.data.aiTasks.some((item) => item.id === successTask.data.id));

  const adjusted = await request<{
    wallet: {
      availableCredits: number;
    };
    ledgerEntry: {
      type: string;
      amount: number;
    };
  }>(`/admin/users/${registered.data.user.id}/credits/adjust`, {
    method: "POST",
    jar: adminJar,
    body: {
      amount: 25,
      reason: `链路测试调点 ${unique}`
    }
  });
  assert.equal(adjusted.data.ledgerEntry.type, "ADMIN_ADJUST");
  assert.equal(adjusted.data.ledgerEntry.amount, 25);

  const adminRecharge = await request<{
    wallet: {
      availableCredits: number;
      totalTopUpCredits: number;
    };
    ledgerEntry: {
      type: string;
      amount: number;
      note: string;
    };
  }>(`/admin/users/${registered.data.user.id}/credits/recharge`, {
    method: "POST",
    jar: adminJar,
    body: {
      amount: 40,
      reasonType: "COMPENSATION"
    }
  });
  assert.equal(adminRecharge.data.ledgerEntry.type, "TOP_UP");
  assert.equal(adminRecharge.data.ledgerEntry.amount, 40);
  assert.equal(adminRecharge.data.ledgerEntry.note, "管理员充值：补偿");
  assert.ok(adminRecharge.data.wallet.totalTopUpCredits >= order.data.credits + 40);

  await request(`/admin/users/${registered.data.user.id}/status`, {
    method: "PATCH",
    jar: adminJar,
    body: {
      status: "DISABLED"
    }
  });
  await request("/wallet/me", {
    jar: userJar,
    expectedCode: 40101
  });
  await request(`/admin/users/${registered.data.user.id}/status`, {
    method: "PATCH",
    jar: adminJar,
    body: {
      status: "ACTIVE"
    }
  });

  await request("/system-config", {
    method: "PATCH",
    jar: adminJar,
    body: {
      homeTitle: `链路首页 ${unique}`,
      themePrimaryColor: "#123456",
      publicNavItems: `首页|/\n工具|/tools\n链路页|/pages/about`,
      footerText: `链路 Footer ${unique}`
    }
  });
  const invalidThemeConfig = await request("/system-config", {
    method: "PATCH",
    jar: adminJar,
    expectedCode: 40001,
    body: {
      themePrimaryColor: "javascript:alert(1)"
    }
  });
  assert.match(invalidThemeConfig.message, /主题主色/);
  const invalidNavConfig = await request("/system-config", {
    method: "PATCH",
    jar: adminJar,
    expectedCode: 40001,
    body: {
      publicNavItems: "坏链接|javascript:alert(1)"
    }
  });
  assert.match(invalidNavConfig.message, /导航路径/);
  const publicConfigs = await request<
    Array<{
      key: string;
      value: string;
      isPublic?: boolean;
    }>
  >("/system-config/public");
  assert.ok(publicConfigs.data.some((item) => item.key === "homeTitle" && item.value === `链路首页 ${unique}`));
  assert.ok(publicConfigs.data.some((item) => item.key === "themePrimaryColor" && item.value === "#123456"));
  assert.ok(publicConfigs.data.some((item) => item.key === "publicNavItems" && item.value.includes("工具|/tools")));
  assert.ok(publicConfigs.data.some((item) => item.key === "footerText" && item.value === `链路 Footer ${unique}`));
  assert.equal(publicConfigs.data.some((item) => item.key === "apiBaseUrl"), false);

  const operationLogs = await request<
    Array<{
      action: string;
      resourceType: string;
      description: string;
    }>
  >(`/admin/operation-logs?resourceType=USER`, {
    jar: adminJar
  });
  assert.ok(operationLogs.data.some((item) => item.action === "ADMIN_ADJUST_CREDITS"));
  assert.ok(operationLogs.data.some((item) => item.action === "ADMIN_RECHARGE_CREDITS"));
  assert.ok(operationLogs.data.some((item) => item.action === "UPDATE_USER_STATUS"));

  const adminLogCount = await prisma.adminOperationLog.count({
    where: {
      OR: [
        {
          action: "ADMIN_LOGIN"
        },
        {
          description: {
            contains: unique
          }
        }
      ]
    }
  });
  assert.ok(adminLogCount >= 3);
});

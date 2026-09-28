import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.JWT_ACCESS_SECRET ??= `test-access-${randomUUID()}`;
process.env.JWT_REFRESH_SECRET ??= `test-refresh-${randomUUID()}`;
process.env.SECRET_ENCRYPTION_KEY ??= `test-secret-${randomUUID()}-${randomUUID()}`;
delete process.env.ALIYUN_SMS_ACCESS_KEY_ID;
delete process.env.ALIYUN_SMS_ACCESS_KEY_SECRET;
delete process.env.ALIYUN_SMS_SIGN_NAME;
delete process.env.ALIYUN_SMS_TEMPLATE_CODE;

function responseMock() {
  return {
    cookie() {},
    clearCookie() {}
  };
}

test("阿里云普通短信方案使用 SendSms 并本地校验验证码", { timeout: 60_000 }, async () => {
  const { encryptSecret, getPrismaClient } = await import("@xueleai/database");
  const { AuthService } = await import("../src/auth/auth.service.js");
  const prisma = getPrismaClient();
  const authService = new AuthService();
  const phone = `137${String(Date.now()).slice(-8)}`;
  const keys = [
    "smsVerificationEnabled",
    "smsVerificationProvider",
    "aliyunSmsAccessKeyId",
    "aliyunSmsAccessKeySecretEncrypted",
    "aliyunSmsEndpoint",
    "aliyunSmsRegionId",
    "aliyunSmsSignName",
    "aliyunSmsTemplateCode",
    "aliyunSmsTemplateParamCodeKey",
    "aliyunSmsTemplateParamExtraJson",
    "smsCodeTtlSeconds"
  ];
  const snapshots = await prisma.systemConfig.findMany({
    where: {
      key: {
        in: keys
      }
    }
  });
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; params: URLSearchParams }> = [];

  globalThis.fetch = (async (input, init) => {
    const params = new URLSearchParams(String(init?.body ?? ""));
    requests.push({
      url: String(input),
      params
    });

    return new Response(JSON.stringify({ Code: "OK", RequestId: "unit-sms-request" }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    });
  }) as typeof fetch;

  try {
    const values = {
      smsVerificationEnabled: "true",
      smsVerificationProvider: "ALIYUN_SMS",
      aliyunSmsAccessKeyId: "unit-access-key",
      aliyunSmsAccessKeySecretEncrypted: encryptSecret("unit-secret"),
      aliyunSmsEndpoint: "https://dysmsapi.aliyuncs.com/",
      aliyunSmsRegionId: "cn-hangzhou",
      aliyunSmsSignName: "学乐AI",
      aliyunSmsTemplateCode: "SMS_UNIT",
      aliyunSmsTemplateParamCodeKey: "code",
      aliyunSmsTemplateParamExtraJson: "{}",
      smsCodeTtlSeconds: "300"
    };

    for (const [key, value] of Object.entries(values)) {
      await prisma.systemConfig.upsert({
        where: {
          key
        },
        update: {
          value
        },
        create: {
          key,
          label: key,
          value,
          group: "send",
          isPublic: false,
          sortOrder: 0
        }
      });
    }

    await authService.sendPhoneCode({
      phone,
      purpose: "LOGIN"
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://dysmsapi.aliyuncs.com/");
    assert.equal(requests[0]?.params.get("Action"), "SendSms");

    const templateParam = JSON.parse(requests[0]?.params.get("TemplateParam") ?? "{}") as {
      code?: string;
    };

    assert.match(templateParam.code ?? "", /^\d{6}$/);

    const savedCode = await prisma.smsVerificationCode.findFirst({
      where: {
        phone,
        purpose: "LOGIN"
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    assert.equal(savedCode?.sendProvider, "ALIYUN_SMS");

    await authService.loginByPhone(
      {
        phone,
        code: templateParam.code ?? "",
        nickname: "普通短信用户"
      },
      responseMock()
    );

    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;

    await prisma.smsVerificationCode.deleteMany({
      where: {
        phone
      }
    });
    await prisma.wallet.deleteMany({
      where: {
        user: {
          phone
        }
      }
    });
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          phone
        }
      }
    });
    await prisma.user.deleteMany({
      where: {
        phone
      }
    });
    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: keys
        }
      }
    });

    for (const config of snapshots) {
      await prisma.systemConfig.create({
        data: {
          key: config.key,
          label: config.label,
          value: config.value,
          description: config.description,
          group: config.group,
          isPublic: config.isPublic,
          sortOrder: config.sortOrder,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt
        }
      });
    }
  }
});

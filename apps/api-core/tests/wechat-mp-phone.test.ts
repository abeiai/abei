import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { AuthService } from "../src/auth/auth.service.js";
process.env.JWT_REFRESH_SECRET = "wechat-phone-test-refresh-secret";
function service(record: Record<string, unknown> | null) {
  const auth = new AuthService();
  let consumed = false;
  Object.assign(auth, {
    prisma: {
      systemConfig: {
        async findUnique() {
          return null;
        },
        async findMany() {
          return [];
        },
      },
      smsVerificationCode: {
        async create({ data }: { data: Record<string, unknown> }) {
          return { id: "created-record", ...data };
        },
        async findFirst({ where }: { where: { id?: string } }) {
          return record && (!where.id || where.id === record.id) && !consumed
            ? record
            : null;
        },
        async updateMany() {
          if (consumed) return { count: 0 };
          consumed = true;
          return { count: 1 };
        },
      },
    },
  });
  return auth;
}
test("微信账号绑定拒绝默认验证码和未发送的短信记录", async () => {
  const auth = service(null);
  await assert.rejects(() =>
    auth.verifyWechatPhoneCode("13800000001", "199599", "expected-record"),
  );
  const local = service({
    id: "expected-record",
    sendProvider: "LOCAL_DEFAULT",
    codeHash: "any",
    phone: "13800000001",
    purpose: "LOGIN",
    expiresAt: new Date(Date.now() + 60_000),
  });
  await assert.rejects(() =>
    local.verifyWechatPhoneCode("13800000001", "199599", "expected-record"),
  );
});
test("真实短信记录须关联本次 ID，验证通过后只能消费一次", async () => {
  const record = {
    id: "expected-record",
    phone: "13800000001",
    purpose: "LOGIN",
    sendProvider: "ALIYUN_SMS",
    expiresAt: new Date(Date.now() + 60_000),
    codeHash: createHmac("sha256", process.env.JWT_REFRESH_SECRET!)
      .update("13800000001:LOGIN:123456")
      .digest("hex"),
  };
  const auth = service(record);
  await assert.rejects(() =>
    auth.verifyWechatPhoneCode("13800000001", "123456", "other-context-record"),
  );
  await auth.verifyWechatPhoneCode("13800000001", "123456", "expected-record");
  await assert.rejects(() =>
    auth.verifyWechatPhoneCode("13800000001", "123456", "expected-record"),
  );
});
test("生产环境短信未配置时不签发开发默认码", async () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(
      () =>
        service(null).sendPhoneCode({ phone: "13800000001", purpose: "LOGIN" }),
      (error) =>
        error instanceof Error && error.message.includes("短信服务尚未配置"),
    );
  } finally {
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
  }
});

test("公众号关联拒绝无法绑定本条发送记录的 DYPNS 验证码", async () => {
  const auth = service({
    id: "record",
    phone: "13800000001",
    purpose: "LOGIN",
    sendProvider: "ALIYUN_DYPNS",
    expiresAt: new Date(Date.now() + 60_000),
    codeHash: "request-id-hash",
  });
  await assert.rejects(
    () => auth.verifyWechatPhoneCode("13800000001", "123456", "record"),
    /验证码错误/,
  );
});

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { planPaymentValues, preservedConfigState, readSourcePayment, readTargetPayment, writeTargetPayment } from "./transfer.mjs";

const pair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});
function source() {
  return {
    paymentAlipayEnabled: "false", paymentAlipayAppId: "", paymentAlipayEnvironment: "production",
    paymentAlipayPrivateKeyEncrypted: "", paymentAlipayPublicKeyEncrypted: "",
    paymentAlipayNotifyUrl: "", paymentAlipayReturnUrl: "",
    paymentAlipayPageEnabled: "true", paymentAlipayWapEnabled: "true",
    paymentWechatEnabled: "true", paymentWechatAppId: "wx-fixture", paymentWechatMerchantId: "fixture-merchant",
    paymentWechatApiV3KeyEncrypted: "a".repeat(32), paymentWechatMerchantPrivateKeyEncrypted: pair.privateKey.trim(),
    paymentWechatMerchantSerialNo: "fixture-serial", paymentWechatNotifyUrl: "https://xueleai.com/api/payment/wechat/notify",
    paymentWechatPublicKeyEncrypted: pair.publicKey.trim(), paymentWechatPublicKeyId: "fixture-public-key-id",
    paymentWechatAppSecretEncrypted: "", paymentWechatJsapiOauthCallbackUrl: "",
    paymentWechatNativeEnabled: "true", paymentWechatH5Enabled: "false", paymentWechatJsapiEnabled: "false"
  };
}

test("线上配置保持商户身份，通知进入 abei，本地关闭真实支付", () => {
  const input = source();
  const online = planPaymentValues(input, "production");
  assert.equal(online.paymentWechatNotifyUrl, "https://new.abeiai.com/api/payment/wechat/notify");
  assert.equal(online.paymentWechatMerchantId, "fixture-merchant");
  assert.equal(online.paymentWechatEnabled, "true");
  assert.equal(online.paymentWechatH5Enabled, "false");
  assert.equal(online.paymentAlipayEnabled, "false");
  const local = planPaymentValues(input, "local");
  assert.equal(local.paymentWechatNotifyUrl, "http://localhost:3600/api/payment/wechat/notify");
  assert.equal(local.paymentWechatEnabled, "false");
  assert.equal(local.paymentAlipayEnabled, "false");
  assert.deepEqual(input, source());
});

test("完整支付宝和 JSAPI 凭据的回调及返回地址采用目标站点", () => {
  const input = { ...source(), paymentAlipayEnabled: "true", paymentAlipayAppId: "fixture-app",
    paymentAlipayPrivateKeyEncrypted: pair.privateKey, paymentAlipayPublicKeyEncrypted: pair.publicKey,
    paymentAlipayNotifyUrl: "https://xueleai.com/api/payment/alipay/notify",
    paymentAlipayReturnUrl: "https://xueleai.com/dashboard/billing?payment=success",
    paymentWechatJsapiEnabled: "true", paymentWechatAppSecretEncrypted: "fixture-secret",
    paymentWechatJsapiOauthCallbackUrl: "https://xueleai.com/api/payment/wechat/jsapi/callback" };
  const next = planPaymentValues(input, "production");
  assert.equal(next.paymentAlipayNotifyUrl, "https://new.abeiai.com/api/payment/alipay/notify");
  assert.equal(next.paymentAlipayReturnUrl, "https://new.abeiai.com/dashboard/billing");
  assert.equal(next.paymentWechatJsapiOauthCallbackUrl, "https://new.abeiai.com/api/payment/wechat/jsapi/callback");
});

test("不完整、错误密钥、未知字段和错误目标在写库前被拒绝", () => {
  for (const change of [
    { paymentWechatApiV3KeyEncrypted: "short" },
    { paymentWechatMerchantPrivateKeyEncrypted: "invalid" },
    { paymentWechatPublicKeyEncrypted: "invalid" },
    { paymentWechatMerchantId: "" }, { paymentWechatEnabled: "yes" },
    { paymentWechatMerchantId: "  " }, { paymentWechatMerchantSerialNo: "  " },
    { paymentWechatNotifyUrl: "  " }, { paymentWechatApiV3KeyEncrypted: " ".repeat(32) },
    { paymentWechatJsapiEnabled: "true" }, { paymentAlipayEnabled: "true" },
    { paymentWechatNativeEnabled: "false" },
    { siteUrl: "https://wrong.invalid" }
  ]) assert.throws(() => planPaymentValues({ ...source(), ...change }, "production"));
  const incomplete = source(); delete incomplete.paymentWechatMerchantId;
  assert.throws(() => planPaymentValues(incomplete, "production"));
  assert.throws(() => planPaymentValues(source(), "source"));
});

test("密钥边界空白按应用加密格式规范化", () => {
  assert.equal(planPaymentValues({ ...source(), paymentWechatMerchantPrivateKeyEncrypted: pair.privateKey }, "local")
    .paymentWechatMerchantPrivateKeyEncrypted, pair.privateKey.trim());
});

test("其他配置正常读取刷新的时间不影响复验，配置值和元数据变化仍被发现", () => {
  const before = [{ id: "fixture", key: "siteName", value: "原配置", label: "站点", createdAt: "2020", updatedAt: "2021" }];
  const refresh = [{ ...before[0], updatedAt: "2022" }];
  assert.deepEqual(preservedConfigState(before), preservedConfigState(refresh));
  for (const change of [{ value: "修改配置" }, { label: "修改标签" }, { createdAt: "2023" }]) {
    assert.notDeepEqual(preservedConfigState(before), preservedConfigState([{ ...before[0], ...change }]));
  }
  assert.equal(before[0].updatedAt, "2021");
});

test("真实 PostgreSQL 迁移重新加密、幂等重放、并发拒绝与失败回滚", {
  skip: !process.env.ABEI_LEGACY_TEST_DATABASE_URL
}, async () => {
  const { PrismaClient } = await import("../../packages/database/dist/index.js");
  const { PrismaPg } = await import("../../packages/database/node_modules/@prisma/adapter-pg/dist/index.mjs");
  const { encryptSecret, decryptSecret } = await import("../../packages/database/dist/secret-encryption.js");
  const url = new URL(process.env.ABEI_LEGACY_TEST_DATABASE_URL);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "3606"); assert.equal(url.pathname, "/abei_wechat_test");
  const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  const keys = Object.keys(source());
  const original = await p.systemConfig.findMany({ where: { key: { in: keys } } });
  const cipher = { encryptSecret: text => encryptSecret(text, "target-fixture-encryption-key-00000000"),
    decryptSecret: text => decryptSecret(text, "target-fixture-encryption-key-00000000") };
  const input = source();
  try {
    await p.systemConfig.deleteMany({ where: { key: { in: keys } } });
    await p.systemConfig.createMany({ data: keys.map(key => ({ key, label: "合成配置", value: key.endsWith("Enabled") ? "false" : "",
      group: "payment", isPublic: false })) });
    await p.systemConfig.create({ data: { key: "payment-transfer-unrelated-fixture", label: "保留配置", value: "保留", group: "fixture" } });
    const unrelated = await p.systemConfig.findUnique({ where: { key: "payment-transfer-unrelated-fixture" } });
    await p.user.create({ data: { id: "payment-transfer-user-fixture", email: "payment-transfer@example.invalid", nickname: "合成用户", passwordHash: "fixture" } });
    await p.wallet.create({ data: { userId: "payment-transfer-user-fixture", availableCredits: 37 } });
    const wallet = await p.wallet.findUnique({ where: { userId: "payment-transfer-user-fixture" } });
    await assert.rejects(readTargetPayment(p), /数据库身份/);
    await assert.rejects(readSourcePayment(p, cipher.decryptSecret), /数据库身份/);
    const before = await readTargetPayment(p, true);
    const result = await writeTargetPayment(p, input, "local", before, cipher, true);
    assert.ok(result.changed > 0);
    const after = await readTargetPayment(p, true);
    for (const row of after) {
      if (row.key === "paymentWechatNotifyUrl") assert.equal(row.value, "http://localhost:3600/api/payment/wechat/notify");
      else if (row.key === "paymentWechatEnabled") assert.equal(row.value, "false");
      else if (row.key.endsWith("Encrypted") && input[row.key]) {
        assert.match(row.value, /^v1:/); assert.notEqual(row.value, input[row.key]);
        assert.equal(cipher.decryptSecret(row.value), input[row.key]);
        assert.throws(() => decryptSecret(row.value, "source-fixture-encryption-key-00000000"));
      } else assert.equal(row.value, input[row.key]);
      assert.equal(row.isPublic, false);
    }
    assert.equal((await writeTargetPayment(p, input, "local", after, cipher, true)).changed, 0);
    assert.deepEqual(await readTargetPayment(p, true), after);
    await assert.rejects(writeTargetPayment(p, input, "local", before, cipher, true), /已改变/);
    assert.deepEqual(await readTargetPayment(p, true), after);
    const changedInput = { ...input, paymentAlipayAppId: "change-before-error", paymentWechatApiV3KeyEncrypted: "b".repeat(32) };
    await assert.rejects(writeTargetPayment(p, changedInput, "local", after,
      { ...cipher, encryptSecret: () => { throw Error("合成加密失败"); } }, true), /合成加密失败/);
    assert.deepEqual(await readTargetPayment(p, true), after);
    assert.deepEqual(await p.systemConfig.findUnique({ where: { key: unrelated.key } }), unrelated);
    let insertion, inserted = false;
    await assert.rejects(writeTargetPayment(p, { ...input, paymentAlipayAppId: "rollback-after-verification" }, "local", after, cipher, true,
      async () => {
        insertion = p.paymentOrder.create({ data: { id: "payment-transfer-order-fixture", userId: wallet.userId,
          orderNo: "fixture-transfer-order", provider: "WECHAT_PAY", amountCny: 1, credits: 1, status: "PAYING" } }).then(() => { inserted = true; });
        // Real concurrent insert must wait on the target transaction's table lock.
        let blocked = false;
        for (let retry = 0; retry < 50 && !blocked && !inserted; retry++) {
          const rows = await p.$queryRawUnsafe("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE relation='payment_orders'::regclass AND NOT granted) AS blocked");
          blocked = rows[0].blocked;
          if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(inserted, false); assert.equal(blocked, true);
        throw Error("合成保留数据校验失败");
      }), /合成保留数据校验失败/);
    await insertion;
    assert.equal(inserted, true);
    await assert.rejects(writeTargetPayment(p, input, "local", after, cipher, true), /未完成支付订单/);
    assert.deepEqual(await readTargetPayment(p, true), after);
    assert.deepEqual(await p.wallet.findUnique({ where: { userId: wallet.userId } }), wallet);
  } finally {
    await p.systemConfig.deleteMany({ where: { key: { in: [...keys, "payment-transfer-unrelated-fixture"] } } });
    if (original.length) await p.systemConfig.createMany({ data: original });
    await p.user.deleteMany({ where: { id: "payment-transfer-user-fixture" } });
    await p.$disconnect();
  }
});

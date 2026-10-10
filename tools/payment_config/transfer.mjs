import { createHash, createPrivateKey, createPublicKey } from "node:crypto";

// Normal public config reads call ensureDefaults(), refreshing only updatedAt.
// Keep all business fields; the payment-key CAS and financial rows stay exact.
export function preservedConfigState(rows) {
  return rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "updatedAt")));
}

// Only this allowlist may leave the source or be updated in the target.
export const paymentKeys = Object.freeze([
  "paymentAlipayEnabled", "paymentAlipayAppId", "paymentAlipayEnvironment",
  "paymentAlipayPrivateKeyEncrypted", "paymentAlipayPublicKeyEncrypted",
  "paymentAlipayNotifyUrl", "paymentAlipayReturnUrl", "paymentAlipayPageEnabled", "paymentAlipayWapEnabled",
  "paymentWechatEnabled", "paymentWechatAppId", "paymentWechatMerchantId", "paymentWechatApiV3KeyEncrypted",
  "paymentWechatMerchantPrivateKeyEncrypted", "paymentWechatMerchantSerialNo", "paymentWechatNotifyUrl",
  "paymentWechatPublicKeyEncrypted", "paymentWechatPublicKeyId", "paymentWechatAppSecretEncrypted",
  "paymentWechatJsapiOauthCallbackUrl", "paymentWechatNativeEnabled", "paymentWechatH5Enabled", "paymentWechatJsapiEnabled"
]);

function validate(values) {
  if (Object.keys(values).length !== paymentKeys.length ||
      !paymentKeys.every(key => typeof values[key] === "string")) throw Error("支付配置字段不完整或包含未知字段");
  for (const key of paymentKeys.filter(key => key.endsWith("Enabled"))) {
    if (!["true", "false"].includes(values[key])) throw Error("支付开关格式错误");
  }
  if (!["production", "sandbox"].includes(values.paymentAlipayEnvironment)) throw Error("支付宝环境错误");
  for (const [key, privateKey] of [
    ["paymentAlipayPrivateKeyEncrypted", true], ["paymentAlipayPublicKeyEncrypted", false],
    ["paymentWechatMerchantPrivateKeyEncrypted", true], ["paymentWechatPublicKeyEncrypted", false]
  ]) {
    if (!values[key]) continue;
    const text = values[key].trim().replace(/\\n/g, "\n");
    const headers = privateKey ? ["PRIVATE KEY", "RSA PRIVATE KEY"] : ["PUBLIC KEY", "RSA PUBLIC KEY"];
    const candidates = text.includes("-----BEGIN") ? [text] : headers.map(h => `-----BEGIN ${h}-----\n${text}\n-----END ${h}-----`);
    if (!candidates.some(candidate => {
      try { return (privateKey ? createPrivateKey(candidate) : createPublicKey(candidate)).asymmetricKeyType === "rsa"; }
      catch { return false; }
    })) throw Error("支付 RSA 密钥无效");
  }
  if (values.paymentWechatApiV3KeyEncrypted && Buffer.byteLength(values.paymentWechatApiV3KeyEncrypted) !== 32) {
    throw Error("微信 APIv3 密钥长度错误");
  }
  if (values.paymentAlipayEnabled === "true" && (
    !["paymentAlipayAppId", "paymentAlipayPrivateKeyEncrypted", "paymentAlipayPublicKeyEncrypted", "paymentAlipayNotifyUrl"].every(k => values[k]) ||
    ![values.paymentAlipayPageEnabled, values.paymentAlipayWapEnabled].includes("true")
  )) throw Error("已启用的支付宝配置不完整");
  if (values.paymentWechatEnabled === "true" && (
    !["paymentWechatAppId", "paymentWechatMerchantId", "paymentWechatApiV3KeyEncrypted", "paymentWechatMerchantPrivateKeyEncrypted",
      "paymentWechatMerchantSerialNo", "paymentWechatNotifyUrl", "paymentWechatPublicKeyEncrypted", "paymentWechatPublicKeyId"].every(k => values[k]) ||
    ![values.paymentWechatNativeEnabled, values.paymentWechatH5Enabled, values.paymentWechatJsapiEnabled].includes("true")
  )) throw Error("已启用的微信支付配置不完整");
  if (values.paymentWechatJsapiEnabled === "true" &&
    (!values.paymentWechatAppSecretEncrypted || !values.paymentWechatJsapiOauthCallbackUrl)) throw Error("JSAPI 配置不完整");
}

export function planPaymentValues(values, target) {
  if (!["local", "production"].includes(target)) throw Error("支付迁移目标错误");
  const next = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
  validate(next);
  const origin = target === "production" ? "https://new.abeiai.com" : "http://localhost:3600";
  for (const [key, path] of [
    ["paymentAlipayNotifyUrl", "/api/payment/alipay/notify"],
    ["paymentAlipayReturnUrl", "/dashboard/billing"],
    ["paymentWechatNotifyUrl", "/api/payment/wechat/notify"],
    ["paymentWechatJsapiOauthCallbackUrl", "/api/payment/wechat/jsapi/callback"]
  ]) if (next[key]) next[key] = origin + path;
  if (target === "local") {
    next.paymentAlipayEnabled = "false";
    next.paymentWechatEnabled = "false";
  }
  return next;
}

async function guard(tx, source, testing = false) {
  const rows = await tx.$queryRawUnsafe("SELECT current_database() AS db, current_setting('port') AS port");
  const expected = source ? ["xueleai", "3327"] : testing ? ["abei_wechat_test", "3606"] : ["abei", "3604"];
  if (rows[0]?.db !== expected[0] || rows[0]?.port !== expected[1]) throw Error("支付配置数据库身份错误");
}

async function configRows(tx) {
  const rows = await tx.systemConfig.findMany({ where: { key: { in: [...paymentKeys] } }, orderBy: { key: "asc" } });
  if (rows.length !== paymentKeys.length || rows.some(row => row.isPublic || row.group !== "payment")) {
    throw Error("支付配置缺失或公开属性错误");
  }
  return rows;
}

export async function readSourcePayment(prisma, decryptSecret) {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await guard(tx, true);
    const rows = await configRows(tx);
    const values = Object.fromEntries(rows.map(row => [row.key,
      row.key.endsWith("Encrypted") && row.value ? decryptSecret(row.value).trim() : row.value.trim()]));
    validate(values);
    return values;
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}

export async function readTargetPayment(prisma, testing = false) {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await guard(tx, false, testing);
    return configRows(tx);
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}

function digest(rows) { return createHash("sha256").update(JSON.stringify(rows)).digest("hex"); }

export async function writeTargetPayment(prisma, values, target, expectedRows, crypto, testing = false, verifyPreserved) {
  const next = planPaymentValues(values, target);
  return prisma.$transaction(async tx => {
    await guard(tx, false, testing);
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("LOCK TABLE system_configs, payment_orders IN SHARE ROW EXCLUSIVE MODE");
    const before = await configRows(tx);
    if (digest(before) !== digest(expectedRows)) throw Error("目标支付配置已改变，需重新备份后重试");
    if (await tx.paymentOrder.count({ where: { status: { in: ["CREATED", "PAYING"] } } })) {
      throw Error("存在未完成支付订单，禁止切换商户配置");
    }
    let changed = 0;
    for (const row of before) {
      const secret = row.key.endsWith("Encrypted");
      const current = secret && row.value ? crypto.decryptSecret(row.value) : row.value;
      if (current === next[row.key]) continue;
      const value = secret && next[row.key] ? crypto.encryptSecret(next[row.key]) : next[row.key];
      await tx.systemConfig.update({ where: { key: row.key }, data: { value } });
      changed++;
    }
    const after = await configRows(tx);
    for (const row of after) {
      const actual = row.key.endsWith("Encrypted") && row.value ? crypto.decryptSecret(row.value) : row.value;
      if (actual !== next[row.key]) throw Error("支付配置写入复验失败");
    }
    // The real runner checks unrelated configs and financial rows before commit.
    await verifyPreserved?.(tx);
    return { changed, verified: true };
  }, { timeout: 60000 });
}

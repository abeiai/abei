import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  isValidRsaPrivateKey,
  isValidRsaPublicKey,
  signRsaSha256,
  verifyRsaSha256
} from "../src/payment/payment-crypto.js";
import { buildAlipaySignContent } from "../src/payment/alipay.client.js";

test("支付 RSA 密钥校验支持 PEM 和密钥正文", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    }
  });
  const privateKeyBody = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const publicKeyBody = publicKey
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  const content = "order_no=TEST202605150001&total_amount=49.90";
  const signature = signRsaSha256(content, privateKeyBody);

  assert.equal(isValidRsaPrivateKey(privateKey), true);
  assert.equal(isValidRsaPrivateKey(privateKeyBody), true);
  assert.equal(isValidRsaPrivateKey("not-a-private-key"), false);
  assert.equal(isValidRsaPublicKey(publicKey), true);
  assert.equal(isValidRsaPublicKey(publicKeyBody), true);
  assert.equal(isValidRsaPublicKey("not-a-public-key"), false);
  assert.equal(verifyRsaSha256(content, signature, publicKeyBody), true);
});

test("支付签名兼容 RSA PRIVATE KEY 格式", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      type: "pkcs1",
      format: "pem"
    },
    publicKeyEncoding: {
      type: "pkcs1",
      format: "pem"
    }
  });
  const content = "appid=wx123&mchid=1900000109";
  const signature = signRsaSha256(content, privateKey);

  assert.equal(isValidRsaPrivateKey(privateKey), true);
  assert.equal(isValidRsaPublicKey(publicKey), true);
  assert.equal(verifyRsaSha256(content, signature, publicKey), true);
});

test("支付宝签名串保留 sign_type 并排除 sign", () => {
  const signContent = buildAlipaySignContent({
    sign: "ignored",
    method: "alipay.trade.page.pay",
    app_id: "2017032006304001",
    charset: "utf-8",
    sign_type: "RSA2",
    format: "JSON",
    version: "1.0",
    biz_content: "{\"out_trade_no\":\"PAY2026051509480622C0B830\",\"total_amount\":\"19.9\"}",
    notify_url: "http://localhost:3321/callback",
    timestamp: "2026-05-15 17:48:06"
  });

  assert.equal(
    signContent,
    "app_id=2017032006304001&biz_content={\"out_trade_no\":\"PAY2026051509480622C0B830\",\"total_amount\":\"19.9\"}&charset=utf-8&format=JSON&method=alipay.trade.page.pay&notify_url=http://localhost:3321/callback&sign_type=RSA2&timestamp=2026-05-15 17:48:06&version=1.0"
  );
});

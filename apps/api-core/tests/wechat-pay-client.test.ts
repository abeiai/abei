import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { WechatPayClient } from "../src/payment/wechat-pay.client.js";
import type { PaymentConfigService } from "../src/payment/payment-config.service.js";

async function withMockedWechatNativeOrder(gatewayUrl: string | undefined) {
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
  const originalGatewayUrl = process.env.WECHAT_PAY_GATEWAY_URL;
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const authorizationHeaders: string[] = [];
  const client = new WechatPayClient({
    getWechatRuntimeConfig: async () => ({
      appId: "wx-unit-app",
      merchantId: "1900000109",
      apiV3Key: "12345678901234567890123456789012",
      merchantPrivateKey: privateKey,
      merchantSerialNo: "unit-merchant-serial",
      notifyUrl: "https://xueleai.com/api/payment/wechat/notify",
      publicKey,
      publicKeyId: "PUB_KEY_ID_UNIT"
    })
  } as PaymentConfigService);

  if (gatewayUrl === undefined) {
    delete process.env.WECHAT_PAY_GATEWAY_URL;
  } else {
    process.env.WECHAT_PAY_GATEWAY_URL = gatewayUrl;
  }

  globalThis.fetch = (async (input, init) => {
    requestedUrls.push(String(input));
    authorizationHeaders.push(new Headers(init?.headers).get("authorization") ?? "");

    return new Response(JSON.stringify({ code_url: "weixin://wxpay/unit" }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    });
  }) as typeof fetch;

  try {
    const order = await client.createNativeOrder({
      orderNo: "PAYUNIT202607240001",
      amountCny: "9.90",
      credits: 99
    });

    return {
      order,
      requestedUrls,
      authorizationHeaders
    };
  } finally {
    globalThis.fetch = originalFetch;

    if (originalGatewayUrl === undefined) {
      delete process.env.WECHAT_PAY_GATEWAY_URL;
    } else {
      process.env.WECHAT_PAY_GATEWAY_URL = originalGatewayUrl;
    }
  }
}

test("微信支付网关环境变量为空时使用正式网关", async () => {
  const { order, requestedUrls } = await withMockedWechatNativeOrder("");

  assert.equal(order.qrCodeUrl, "weixin://wxpay/unit");
  assert.equal(requestedUrls[0], "https://api.mch.weixin.qq.com/v3/pay/transactions/native");
});

test("微信支付自定义网关会去掉尾部斜杠后再拼接路径", async () => {
  const { requestedUrls } = await withMockedWechatNativeOrder("https://wechat-gateway.example.com/");

  assert.equal(requestedUrls[0], "https://wechat-gateway.example.com/v3/pay/transactions/native");
});

test("微信支付签名请求头使用 API v3 认证格式", async () => {
  const { authorizationHeaders } = await withMockedWechatNativeOrder(undefined);
  const authorization = authorizationHeaders[0];

  assert.ok(authorization.startsWith('WECHATPAY2-SHA256-RSA2048 mchid="1900000109",'));
  assert.ok(!authorization.startsWith("WECHATPAY2-SHA256-RSA2048,"));
  assert.match(authorization, /nonce_str="[0-9a-f]{32}"/);
  assert.match(authorization, /timestamp="\d+"/);
  assert.match(authorization, /serial_no="unit-merchant-serial"/);
  assert.match(authorization, /signature="[^"]+"/);
});

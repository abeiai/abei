import { createDecipheriv, randomBytes } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";
import { getHeaderValue, type HeaderRequestLike } from "../security/request-types.js";
import { signRsaSha256, toInputJson, verifyRsaSha256 } from "./payment-crypto.js";
import { PaymentConfigService, type WechatRuntimeConfig } from "./payment-config.service.js";
import type {
  ChannelQueryResult,
  PaymentChannelOrder,
  VerifiedPaymentResult
} from "./payment-channel.types.js";

interface WechatOrderInput {
  orderNo: string;
  amountCny: string;
  credits: number;
}

@Injectable()
export class WechatPayClient {
  constructor(
    @Inject(PaymentConfigService)
    private readonly paymentConfigService: PaymentConfigService
  ) {}

  async createNativeOrder(order: WechatOrderInput): Promise<PaymentChannelOrder> {
    const config = await this.paymentConfigService.getWechatRuntimeConfig();

    if (!config) {
      return {
        product: "WECHAT_NATIVE",
        action: "QR_CODE",
        paymentUrl: null,
        qrCodeUrl: null,
        launchParams: null,
        providerPayload: null,
        paymentMode: "UNCONFIGURED"
      };
    }

    const body = {
      appid: config.appId,
      mchid: config.merchantId,
      description: `AI SaaS 点数充值 ${order.credits} 点`,
      out_trade_no: order.orderNo,
      notify_url: config.notifyUrl,
      amount: {
        total: amountToCents(order.amountCny),
        currency: "CNY"
      }
    };
    const payload = JSON.stringify(body);
    const result = await this.postJson<{
      code_url?: string;
      message?: string;
    }>("/v3/pay/transactions/native", payload, config, "微信支付下单失败");

    if (!result.code_url) {
      throw new AppException(40004, result.message || "微信支付下单失败", HttpStatus.BAD_REQUEST);
    }

    return {
      product: "WECHAT_NATIVE",
      action: "QR_CODE",
      paymentUrl: result.code_url,
      qrCodeUrl: result.code_url,
      launchParams: null,
      providerPayload: toInputJson(result),
      paymentMode: "REAL"
    };
  }

  async createH5Order(order: WechatOrderInput & { clientIp: string }): Promise<PaymentChannelOrder> {
    const config = await this.paymentConfigService.getWechatRuntimeConfig();

    if (!config) {
      return {
        product: "WECHAT_H5",
        action: "REDIRECT",
        paymentUrl: null,
        qrCodeUrl: null,
        launchParams: null,
        providerPayload: null,
        paymentMode: "UNCONFIGURED"
      };
    }

    const body = {
      appid: config.appId,
      mchid: config.merchantId,
      description: `AI SaaS 点数充值 ${order.credits} 点`,
      out_trade_no: order.orderNo,
      notify_url: config.notifyUrl,
      amount: {
        total: amountToCents(order.amountCny),
        currency: "CNY"
      },
      scene_info: {
        payer_client_ip: order.clientIp,
        h5_info: {
          type: "Wap"
        }
      }
    };
    const payload = JSON.stringify(body);
    const result = await this.postJson<{
      h5_url?: string;
      message?: string;
    }>("/v3/pay/transactions/h5", payload, config, "微信 H5 支付下单失败");

    if (!result.h5_url) {
      throw new AppException(40004, result.message || "微信 H5 支付下单失败", HttpStatus.BAD_REQUEST);
    }

    return {
      product: "WECHAT_H5",
      action: "REDIRECT",
      paymentUrl: result.h5_url,
      qrCodeUrl: null,
      launchParams: null,
      providerPayload: toInputJson(result),
      paymentMode: "REAL"
    };
  }

  async createJsapiOrder(order: WechatOrderInput & { openId: string }): Promise<PaymentChannelOrder> {
    const config = await this.paymentConfigService.getWechatRuntimeConfig();

    if (!config) {
      return {
        product: "WECHAT_JSAPI",
        action: "WECHAT_JSAPI",
        paymentUrl: null,
        qrCodeUrl: null,
        launchParams: null,
        providerPayload: null,
        paymentMode: "UNCONFIGURED"
      };
    }

    const body = {
      appid: config.appId,
      mchid: config.merchantId,
      description: `AI SaaS 点数充值 ${order.credits} 点`,
      out_trade_no: order.orderNo,
      notify_url: config.notifyUrl,
      amount: {
        total: amountToCents(order.amountCny),
        currency: "CNY"
      },
      payer: {
        openid: order.openId
      }
    };
    const payload = JSON.stringify(body);
    const result = await this.postJson<{
      prepay_id?: string;
      message?: string;
    }>("/v3/pay/transactions/jsapi", payload, config, "微信 JSAPI 支付下单失败");

    if (!result.prepay_id) {
      throw new AppException(40004, result.message || "微信 JSAPI 支付下单失败", HttpStatus.BAD_REQUEST);
    }

    const launchParams = this.createJsapiLaunchParams(result.prepay_id, config);

    return {
      product: "WECHAT_JSAPI",
      action: "WECHAT_JSAPI",
      paymentUrl: null,
      qrCodeUrl: null,
      launchParams: toInputJson(launchParams),
      providerPayload: toInputJson(result),
      paymentMode: "REAL"
    };
  }

  async verifyNotify(body: Record<string, unknown>, request: HeaderRequestLike): Promise<VerifiedPaymentResult> {
    const config = await this.paymentConfigService.getWechatRuntimeConfig();

    if (!config) {
      throw new AppException(50002, "微信支付配置缺失", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    this.verifyNotificationSignature(body, request, config);

    const resource = objectValue(body.resource);

    if (!resource) {
      throw new AppException(40001, "微信支付回调缺少资源数据", HttpStatus.BAD_REQUEST);
    }

    const decrypted = this.decryptResource(resource, config) as {
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      success_time?: string;
      amount?: {
        total?: number;
      };
    };

    if (decrypted.trade_state !== "SUCCESS") {
      throw new AppException(40004, "微信支付订单尚未支付成功", HttpStatus.BAD_REQUEST);
    }

    if (!decrypted.out_trade_no || !decrypted.transaction_id || !decrypted.amount?.total) {
      throw new AppException(40001, "微信支付回调参数不完整", HttpStatus.BAD_REQUEST);
    }

    return {
      orderNo: decrypted.out_trade_no,
      providerTradeNo: decrypted.transaction_id,
      paidAt: decrypted.success_time ? new Date(decrypted.success_time) : new Date(),
      amountCny: centsToAmount(decrypted.amount.total),
      raw: toInputJson({
        body,
        decrypted
      })
    };
  }

  async queryOrder(orderNo: string): Promise<ChannelQueryResult> {
    const config = await this.paymentConfigService.getWechatRuntimeConfig();

    if (!config) {
      throw new AppException(50002, "微信支付配置缺失", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(config.merchantId)}`;
    const payload = await this.getJson<{
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      success_time?: string;
      amount?: {
        total?: number;
      };
      message?: string;
    }>(path, config, "微信支付订单查询失败");

    const paid = payload.trade_state === "SUCCESS";

    return {
      orderNo: payload.out_trade_no ?? orderNo,
      providerTradeNo: payload.transaction_id ?? null,
      paid,
      closed: payload.trade_state === "CLOSED" || payload.trade_state === "REVOKED" || payload.trade_state === "PAYERROR",
      amountCny: typeof payload.amount?.total === "number" ? centsToAmount(payload.amount.total) : null,
      paidAt: paid ? (payload.success_time ? new Date(payload.success_time) : new Date()) : null,
      raw: toInputJson(payload)
    };
  }

  private verifyNotificationSignature(body: Record<string, unknown>, request: HeaderRequestLike, config: WechatRuntimeConfig) {
    const timestamp = header(request, "wechatpay-timestamp");
    const nonce = header(request, "wechatpay-nonce");
    const signature = header(request, "wechatpay-signature");
    const serial = header(request, "wechatpay-serial");
    const expectedSerial = config.publicKeyId;

    if (!timestamp || !nonce || !signature) {
      throw new AppException(40001, "微信支付回调签名头不完整", HttpStatus.BAD_REQUEST);
    }

    if (expectedSerial && serial && serial !== expectedSerial) {
      throw new AppException(40001, "微信支付平台证书序列号不匹配", HttpStatus.BAD_REQUEST);
    }

    const rawBody = request.rawBody?.toString("utf8") ?? JSON.stringify(body);
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;

    if (!verifyRsaSha256(message, signature, config.publicKey)) {
      throw new AppException(40001, "微信支付回调验签失败", HttpStatus.BAD_REQUEST);
    }
  }

  private decryptResource(resource: Record<string, unknown>, config: WechatRuntimeConfig) {
    const nonce = stringValue(resource.nonce);
    const associatedData = stringValue(resource.associated_data);
    const ciphertext = stringValue(resource.ciphertext);

    if (!nonce || !ciphertext) {
      throw new AppException(40001, "微信支付回调密文参数不完整", HttpStatus.BAD_REQUEST);
    }

    const apiV3Key = config.apiV3Key;

    if (Buffer.byteLength(apiV3Key) !== 32) {
      throw new AppException(50002, "微信支付 APIv3 密钥长度不正确", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const encrypted = Buffer.from(ciphertext, "base64");
    const authTag = encrypted.subarray(encrypted.length - 16);
    const data = encrypted.subarray(0, encrypted.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key), Buffer.from(nonce));

    if (associatedData) {
      decipher.setAAD(Buffer.from(associatedData));
    }

    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");

    return JSON.parse(plaintext) as Record<string, unknown>;
  }

  private authorization(method: string, pathWithQuery: string, body: string, config: WechatRuntimeConfig) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");
    const message = `${method}\n${pathWithQuery}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = signRsaSha256(message, config.merchantPrivateKey);

    const parameters = [
      `mchid="${config.merchantId}"`,
      `nonce_str="${nonce}"`,
      `signature="${signature}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${config.merchantSerialNo}"`
    ].join(",");

    return `WECHATPAY2-SHA256-RSA2048 ${parameters}`;
  }

  private createJsapiLaunchParams(prepayId: string, config: WechatRuntimeConfig) {
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = randomBytes(16).toString("hex");
    const packageValue = `prepay_id=${prepayId}`;
    const message = `${config.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;

    return {
      appId: config.appId,
      timeStamp,
      nonceStr,
      package: packageValue,
      signType: "RSA",
      paySign: signRsaSha256(message, config.merchantPrivateKey)
    };
  }

  private async postJson<T>(
    path: string,
    payload: string,
    config: WechatRuntimeConfig,
    fallbackMessage: string
  ) {
    return this.requestJson<T>("POST", path, payload, config, fallbackMessage);
  }

  private async getJson<T>(path: string, config: WechatRuntimeConfig, fallbackMessage: string) {
    return this.requestJson<T>("GET", path, "", config, fallbackMessage);
  }

  private async requestJson<T>(
    method: "GET" | "POST",
    path: string,
    body: string,
    config: WechatRuntimeConfig,
    fallbackMessage: string
  ) {
    let response: Awaited<ReturnType<typeof fetch>>;

    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        authorization: this.authorization(method, path, body, config)
      };

      if (body) {
        headers["content-type"] = "application/json";
      }

      response = await fetch(`${this.gatewayUrl()}${path}`, {
        method,
        headers,
        ...(body ? { body } : {})
      });
    } catch (error) {
      throw this.toWechatRequestException(error, fallbackMessage);
    }

    const text = await response.text();
    let payload: Record<string, unknown> = {};

    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new AppException(40004, `${fallbackMessage}：微信网关响应格式异常`, HttpStatus.BAD_REQUEST);
      }
    }

    if (!response.ok) {
      throw new AppException(40004, this.wechatGatewayMessage(payload, fallbackMessage), HttpStatus.BAD_REQUEST);
    }

    return payload as T;
  }

  private toWechatRequestException(error: unknown, fallbackMessage: string) {
    if (error instanceof AppException) {
      return error;
    }

    return new AppException(
      40004,
      `${fallbackMessage}，请检查微信支付商户号、证书序列号、商户私钥和通知地址配置`,
      HttpStatus.BAD_REQUEST
    );
  }

  private wechatGatewayMessage(payload: Record<string, unknown>, fallbackMessage: string) {
    const message = stringValue(payload.message ?? payload.msg ?? payload.code);

    return message ? `${fallbackMessage}：${message}` : fallbackMessage;
  }

  private gatewayUrl() {
    return (process.env.WECHAT_PAY_GATEWAY_URL?.trim() || "https://api.mch.weixin.qq.com").replace(/\/+$/, "");
  }

}

function header(request: HeaderRequestLike, name: string) {
  return getHeaderValue(request.headers[name]);
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function amountToCents(amountCny: string) {
  return Math.round(Number(amountCny) * 100);
}

export function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

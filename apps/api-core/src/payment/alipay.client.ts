import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";
import { signRsaSha256, toInputJson, verifyRsaSha256 } from "./payment-crypto.js";
import { PaymentConfigService } from "./payment-config.service.js";
import type {
  ChannelQueryResult,
  PaymentChannelOrder,
  VerifiedPaymentResult
} from "./payment-channel.types.js";

interface AlipayOrderInput {
  orderNo: string;
  amountCny: string;
  credits: number;
}

@Injectable()
export class AlipayClient {
  constructor(
    @Inject(PaymentConfigService)
    private readonly paymentConfigService: PaymentConfigService
  ) {}

  async createPrecreatePayOrder(order: AlipayOrderInput): Promise<PaymentChannelOrder> {
    const config = await this.paymentConfigService.getAlipayRuntimeConfig();

    if (!config) {
      return {
        product: "ALIPAY_PRECREATE",
        action: "QR_CODE",
        paymentUrl: null,
        qrCodeUrl: null,
        launchParams: null,
        providerPayload: null,
        paymentMode: "UNCONFIGURED"
      };
    }

    const bizContent = {
      out_trade_no: order.orderNo,
      total_amount: order.amountCny,
      subject: `AI SaaS 点数充值 ${order.credits} 点`
    };
    const params = this.buildSignedParams("alipay.trade.precreate", bizContent, {
      notify_url: config.notifyUrl
    }, config);
    const payload = await this.postGateway<{
      alipay_trade_precreate_response?: {
        code?: string;
        msg?: string;
        sub_code?: string;
        sub_msg?: string;
        out_trade_no?: string;
        qr_code?: string;
      };
    }>(config.gatewayUrl, params);
    const result = payload.alipay_trade_precreate_response;

    if (!result || result.code !== "10000" || !result.qr_code) {
      throw new AppException(
        40004,
        `支付宝扫码支付下单失败：${result?.sub_msg || result?.msg || "支付宝接口异常"}`,
        HttpStatus.BAD_REQUEST
      );
    }

    return {
      product: "ALIPAY_PRECREATE",
      action: "QR_CODE",
      paymentUrl: null,
      qrCodeUrl: result.qr_code,
      launchParams: null,
      providerPayload: toInputJson({
        method: "alipay.trade.precreate",
        bizContent,
        response: payload
      }),
      paymentMode: "REAL"
    };
  }

  async createPagePayOrder(order: AlipayOrderInput): Promise<PaymentChannelOrder> {
    const config = await this.paymentConfigService.getAlipayRuntimeConfig();

    if (!config) {
      return {
        product: "ALIPAY_PAGE",
        action: "REDIRECT",
        paymentUrl: null,
        qrCodeUrl: null,
        launchParams: null,
        providerPayload: null,
        paymentMode: "UNCONFIGURED"
      };
    }

    const bizContent = {
      out_trade_no: order.orderNo,
      total_amount: order.amountCny,
      subject: `AI SaaS 点数充值 ${order.credits} 点`,
      product_code: "FAST_INSTANT_TRADE_PAY"
    };
    const params = this.buildSignedParams("alipay.trade.page.pay", bizContent, {
      notify_url: config.notifyUrl,
      ...(config.returnUrl ? { return_url: config.returnUrl } : {})
    }, config);

    return {
      product: "ALIPAY_PAGE",
      action: "REDIRECT",
      paymentUrl: `${config.gatewayUrl}?${new URLSearchParams(params).toString()}`,
      qrCodeUrl: null,
      launchParams: null,
      providerPayload: toInputJson({
        method: "alipay.trade.page.pay",
        bizContent
      }),
      paymentMode: "REAL"
    };
  }

  async createWapPayOrder(order: AlipayOrderInput): Promise<PaymentChannelOrder> {
    const config = await this.paymentConfigService.getAlipayRuntimeConfig();

    if (!config) {
      return {
        product: "ALIPAY_WAP",
        action: "REDIRECT",
        paymentUrl: null,
        qrCodeUrl: null,
        launchParams: null,
        providerPayload: null,
        paymentMode: "UNCONFIGURED"
      };
    }

    const bizContent = {
      out_trade_no: order.orderNo,
      total_amount: order.amountCny,
      subject: `AI SaaS 点数充值 ${order.credits} 点`,
      product_code: "QUICK_WAP_WAY"
    };
    const params = this.buildSignedParams("alipay.trade.wap.pay", bizContent, {
      notify_url: config.notifyUrl,
      ...(config.returnUrl ? { return_url: config.returnUrl } : {})
    }, config);

    return {
      product: "ALIPAY_WAP",
      action: "REDIRECT",
      paymentUrl: `${config.gatewayUrl}?${new URLSearchParams(params).toString()}`,
      qrCodeUrl: null,
      launchParams: null,
      providerPayload: toInputJson({
        method: "alipay.trade.wap.pay",
        bizContent
      }),
      paymentMode: "REAL"
    };
  }

  async verifyNotify(body: Record<string, unknown>): Promise<VerifiedPaymentResult> {
    const config = await this.paymentConfigService.getAlipayRuntimeConfig();

    if (!config) {
      throw new AppException(50002, "支付宝支付配置缺失", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const sign = stringValue(body.sign);

    if (!sign) {
      throw new AppException(40001, "支付宝回调缺少签名", HttpStatus.BAD_REQUEST);
    }

    const content = buildAlipaySignContent(body);

    if (!verifyRsaSha256(content, sign, config.publicKey)) {
      throw new AppException(40001, "支付宝回调验签失败", HttpStatus.BAD_REQUEST);
    }

    const appId = stringValue(body.app_id);
    const configuredAppId = config.appId;

    if (appId && appId !== configuredAppId) {
      throw new AppException(40001, "支付宝应用编号不匹配", HttpStatus.BAD_REQUEST);
    }

    const tradeStatus = stringValue(body.trade_status);

    if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
      throw new AppException(40004, "支付宝订单尚未支付成功", HttpStatus.BAD_REQUEST);
    }

    const orderNo = stringValue(body.out_trade_no);
    const providerTradeNo = stringValue(body.trade_no);
    const amountCny = stringValue(body.total_amount);

    if (!orderNo || !providerTradeNo || !amountCny) {
      throw new AppException(40001, "支付宝回调参数不完整", HttpStatus.BAD_REQUEST);
    }

    return {
      orderNo,
      providerTradeNo,
      amountCny,
      paidAt: new Date(),
      raw: toInputJson(body)
    };
  }

  async queryOrder(orderNo: string): Promise<ChannelQueryResult> {
    const config = await this.paymentConfigService.getAlipayRuntimeConfig();

    if (!config) {
      throw new AppException(50002, "支付宝支付配置缺失", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const params = this.buildSignedParams("alipay.trade.query", {
      out_trade_no: orderNo
    }, {}, config);
    const response = await fetch(`${config.gatewayUrl}?${new URLSearchParams(params).toString()}`);
    const payload = await response.json() as {
      alipay_trade_query_response?: {
        code?: string;
        msg?: string;
        out_trade_no?: string;
        trade_no?: string;
        trade_status?: string;
        total_amount?: string;
      };
    };
    const result = payload.alipay_trade_query_response;

    if (!response.ok || !result || result.code !== "10000") {
      throw new AppException(40004, "支付宝订单查询失败", HttpStatus.BAD_REQUEST);
    }

    const paid = result.trade_status === "TRADE_SUCCESS" || result.trade_status === "TRADE_FINISHED";
    const closed = result.trade_status === "TRADE_CLOSED";

    return {
      orderNo: result.out_trade_no ?? orderNo,
      providerTradeNo: result.trade_no ?? null,
      paid,
      closed,
      amountCny: result.total_amount ?? null,
      paidAt: paid ? new Date() : null,
      raw: toInputJson(payload)
    };
  }

  private buildSignedParams(
    method: string,
    bizContent: Record<string, unknown>,
    extra: Record<string, string>,
    config: {
      appId: string;
      privateKey: string;
    }
  ) {
    const params: Record<string, string> = {
      app_id: config.appId,
      method,
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: formatAlipayTimestamp(new Date()),
      version: "1.0",
      biz_content: JSON.stringify(bizContent),
      ...extra
    };
    const signContent = buildAlipaySignContent(params);

    params.sign = signRsaSha256(signContent, config.privateKey);

    return params;
  }

  private async postGateway<TPayload>(gatewayUrl: string, params: Record<string, string>) {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
      },
      body: new URLSearchParams(params)
    });
    const payload = await response.json() as TPayload;

    if (!response.ok) {
      throw new AppException(40004, "支付宝接口请求失败", HttpStatus.BAD_REQUEST);
    }

    return payload;
  }

}

export function buildAlipaySignContent(params: Record<string, unknown>) {
  return Object.entries(params)
    .filter(([key, value]) => key !== "sign" && value !== undefined && value !== null)
    .map(([key, value]) => [key, stringValue(value)] as const)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => {
      if (left === right) {
        return 0;
      }

      return left < right ? -1 : 1;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function formatAlipayTimestamp(value: Date) {
  const pad = (input: number) => String(input).padStart(2, "0");

  return [
    value.getFullYear(),
    "-",
    pad(value.getMonth() + 1),
    "-",
    pad(value.getDate()),
    " ",
    pad(value.getHours()),
    ":",
    pad(value.getMinutes()),
    ":",
    pad(value.getSeconds())
  ].join("");
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

import type { Prisma } from "@xueleai/database";

export type PaymentProvider = "ALIPAY" | "WECHAT_PAY";
export type PaymentScene = "DESKTOP_WEB" | "MOBILE_WEB" | "WECHAT_BROWSER";
export type PaymentProduct =
  | "ALIPAY_PRECREATE"
  | "ALIPAY_PAGE"
  | "ALIPAY_WAP"
  | "WECHAT_NATIVE"
  | "WECHAT_H5"
  | "WECHAT_JSAPI";
export type PaymentAction = "REDIRECT" | "QR_CODE" | "WECHAT_JSAPI";

export interface PaymentChannelOrder {
  product: PaymentProduct;
  action: PaymentAction;
  paymentUrl: string | null;
  qrCodeUrl: string | null;
  launchParams: Prisma.InputJsonValue | null;
  providerPayload: Prisma.InputJsonValue | null;
  paymentMode: "REAL" | "UNCONFIGURED";
}

export interface VerifiedPaymentResult {
  orderNo: string;
  providerTradeNo: string;
  paidAt: Date;
  amountCny: string;
  raw: Prisma.InputJsonValue;
}

export interface ChannelQueryResult {
  orderNo: string;
  providerTradeNo: string | null;
  paidAt: Date | null;
  paid: boolean;
  closed: boolean;
  amountCny: string | null;
  raw: Prisma.InputJsonValue;
}

import type { PaymentProduct, PaymentProvider, PaymentScene } from "./payment-channel.types.js";

export function detectPaymentScene(userAgent: string | null | undefined): PaymentScene {
  const value = userAgent?.toLowerCase() ?? "";

  if (value.includes("micromessenger")) {
    return "WECHAT_BROWSER";
  }

  if (/(android|iphone|ipad|ipod|mobile)/i.test(value)) {
    return "MOBILE_WEB";
  }

  return "DESKTOP_WEB";
}

export function resolvePaymentProduct(provider: PaymentProvider, scene: PaymentScene): PaymentProduct | null {
  if (provider === "ALIPAY") {
    if (scene === "DESKTOP_WEB") {
      return "ALIPAY_PRECREATE";
    }

    if (scene === "MOBILE_WEB") {
      return "ALIPAY_WAP";
    }

    return null;
  }

  if (scene === "DESKTOP_WEB") {
    return "WECHAT_NATIVE";
  }

  if (scene === "MOBILE_WEB") {
    return "WECHAT_H5";
  }

  return "WECHAT_JSAPI";
}

export function paymentSceneName(scene: PaymentScene) {
  const names: Record<PaymentScene, string> = {
    DESKTOP_WEB: "PC 浏览器",
    MOBILE_WEB: "手机浏览器",
    WECHAT_BROWSER: "微信内浏览器"
  };

  return names[scene];
}

export function paymentProductName(product: PaymentProduct) {
  const names: Record<PaymentProduct, string> = {
    ALIPAY_PRECREATE: "支付宝扫码支付",
    ALIPAY_PAGE: "支付宝电脑网站支付",
    ALIPAY_WAP: "支付宝手机网站支付",
    WECHAT_NATIVE: "微信 Native 扫码支付",
    WECHAT_H5: "微信 H5 支付",
    WECHAT_JSAPI: "微信 JSAPI 支付"
  };

  return names[product];
}

export type PaymentScene = "DESKTOP_WEB" | "MOBILE_WEB" | "WECHAT_BROWSER";

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

export function paymentSceneName(scene: PaymentScene) {
  const names: Record<PaymentScene, string> = {
    DESKTOP_WEB: "PC 浏览器",
    MOBILE_WEB: "手机浏览器",
    WECHAT_BROWSER: "微信内浏览器"
  };

  return names[scene];
}

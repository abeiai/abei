"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface AdminPaymentConfig {
  alipay: {
    enabled: boolean;
    ready: boolean;
    pageEnabled: boolean;
    wapEnabled: boolean;
    appId: string;
    environment: "production" | "sandbox";
    privateKeyPreview: string;
    publicKeyPreview: string;
    notifyUrl: string;
    returnUrl: string;
  };
  wechatPay: {
    enabled: boolean;
    ready: boolean;
    nativeEnabled: boolean;
    h5Enabled: boolean;
    jsapiEnabled: boolean;
    jsapiReady: boolean;
    appId: string;
    merchantId: string;
    apiV3KeyPreview: string;
    merchantPrivateKeyPreview: string;
    merchantSerialNo: string;
    notifyUrl: string;
    publicKeyPreview: string;
    publicKeyId: string;
    appSecretPreview: string;
    jsapiOauthCallbackUrl: string;
  };
}

export interface PaymentConfigActionState {
  error?: string;
  success?: string;
}

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function getCookieHeader() {
  const cookieStore = await cookies();

  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

async function apiFetch<TData>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cookie", await getCookieHeader());

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<TData | null>;

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

export async function getAdminPaymentConfig() {
  return apiFetch<AdminPaymentConfig>("/admin/payment-config");
}

export async function updatePaymentConfigAction(
  _previousState: PaymentConfigActionState,
  formData: FormData
): Promise<PaymentConfigActionState> {
  try {
    await apiFetch<AdminPaymentConfig>("/admin/payment-config", {
      method: "PATCH",
      body: JSON.stringify({
        alipayEnabled: checked(formData, "alipayEnabled"),
        alipayPageEnabled: checked(formData, "alipayPageEnabled"),
        alipayWapEnabled: checked(formData, "alipayWapEnabled"),
        alipayAppId: text(formData, "alipayAppId"),
        alipayEnvironment: text(formData, "alipayEnvironment") === "sandbox" ? "sandbox" : "production",
        alipayPrivateKey: text(formData, "alipayPrivateKey"),
        alipayPublicKey: text(formData, "alipayPublicKey"),
        alipayNotifyUrl: text(formData, "alipayNotifyUrl"),
        alipayReturnUrl: text(formData, "alipayReturnUrl"),
        wechatPayEnabled: checked(formData, "wechatPayEnabled"),
        wechatPayNativeEnabled: checked(formData, "wechatPayNativeEnabled"),
        wechatPayH5Enabled: checked(formData, "wechatPayH5Enabled"),
        wechatPayJsapiEnabled: checked(formData, "wechatPayJsapiEnabled"),
        wechatPayAppId: text(formData, "wechatPayAppId"),
        wechatPayMerchantId: text(formData, "wechatPayMerchantId"),
        wechatPayApiV3Key: text(formData, "wechatPayApiV3Key"),
        wechatPayMerchantPrivateKey: text(formData, "wechatPayMerchantPrivateKey"),
        wechatPayMerchantSerialNo: text(formData, "wechatPayMerchantSerialNo"),
        wechatPayNotifyUrl: text(formData, "wechatPayNotifyUrl"),
        wechatPayPublicKey: text(formData, "wechatPayPublicKey"),
        wechatPayPublicKeyId: text(formData, "wechatPayPublicKeyId"),
        wechatPayAppSecret: text(formData, "wechatPayAppSecret"),
        wechatPayJsapiOauthCallbackUrl: text(formData, "wechatPayJsapiOauthCallbackUrl")
      })
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "支付配置保存失败"
    };
  }

  revalidatePath("/admin/payment-config");
  revalidatePath("/dashboard/billing");

  return {
    success: "支付配置已保存"
  };
}

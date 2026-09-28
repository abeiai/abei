"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

interface SystemConfig {
  key: string;
  value: string;
}

export interface AdminSendConfig {
  email: {
    enabled: boolean;
    ready: boolean;
    provider: string;
    accessKeyId: string;
    accessKeySecretPreview: string;
    endpoint: string;
    regionId: string;
    accountName: string;
    fromAlias: string;
    addressType: string;
    replyToAddress: boolean;
    subject: string;
    bodyTemplate: string;
  };
  sms: {
    enabled: boolean;
    ready: boolean;
    provider: string;
    accessKeyId: string;
    accessKeySecretPreview: string;
    endpoint: string;
    regionId: string;
    signName: string;
    templateCode: string;
    templateParamCodeKey: string;
    templateParamExtraJson: string;
    codeTtlSeconds: string;
  };
}

export interface SendConfigActionState {
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
  return formData.get(name) === "on" ? "true" : "false";
}

function configMap(configs: SystemConfig[]) {
  return new Map(configs.map((config) => [config.key, config.value]));
}

function valueOf(values: Map<string, string>, key: string, fallback = "") {
  return values.get(key) ?? fallback;
}

function hasSecretPreview(value: string) {
  return Boolean(value && value !== "尚未配置" && !value.includes("无法解密"));
}

function normalizeSmsProvider(value: string) {
  return value === "ALIYUN_DYPNS" ? "ALIYUN_DYPNS" : "ALIYUN_SMS";
}

function normalizeSmsEndpoint(provider: string, value: string) {
  if (provider === "ALIYUN_DYPNS") {
    if (!value || value.includes("dysmsapi.aliyuncs.com")) {
      return "https://dypnsapi.aliyuncs.com/";
    }

    return value;
  }

  if (!value || value.includes("dypnsapi.aliyuncs.com")) {
    return "https://dysmsapi.aliyuncs.com/";
  }

  return value;
}

function normalizeSmsReady(provider: string, sms: {
  accessKeyId: string;
  accessKeySecretPreview: string;
  endpoint: string;
  regionId: string;
  signName: string;
  templateCode: string;
  templateParamCodeKey: string;
}) {
  if (provider !== "ALIYUN_SMS" && provider !== "ALIYUN_DYPNS") {
    return false;
  }

  return Boolean(
    sms.accessKeyId &&
      hasSecretPreview(sms.accessKeySecretPreview) &&
      sms.endpoint &&
      sms.regionId &&
      sms.signName &&
      sms.templateCode &&
      sms.templateParamCodeKey
  );
}

function defaultSmsEndpoint(provider: string) {
  if (provider === "ALIYUN_DYPNS") {
    return "https://dypnsapi.aliyuncs.com/";
  }

  return "https://dysmsapi.aliyuncs.com/";
}

export async function getAdminSendConfig(): Promise<AdminSendConfig> {
  const values = configMap(await apiFetch<SystemConfig[]>("/system-config"));
  const emailSecretPreview = valueOf(values, "aliyunMailAccessKeySecretEncrypted", "尚未配置");
  const smsSecretPreview = valueOf(values, "aliyunSmsAccessKeySecretEncrypted", "尚未配置");
  const email = {
    enabled: valueOf(values, "emailVerificationEnabled", "false") === "true",
    provider: valueOf(values, "emailVerificationProvider", "ALIYUN_DIRECT_MAIL"),
    accessKeyId: valueOf(values, "aliyunMailAccessKeyId"),
    accessKeySecretPreview: emailSecretPreview,
    endpoint: valueOf(values, "aliyunMailEndpoint", "https://dm.aliyuncs.com/"),
    regionId: valueOf(values, "aliyunMailRegionId", "cn-hangzhou"),
    accountName: valueOf(values, "aliyunMailAccountName"),
    fromAlias: valueOf(values, "aliyunMailFromAlias"),
    addressType: valueOf(values, "aliyunMailAddressType", "1"),
    replyToAddress: valueOf(values, "aliyunMailReplyToAddress", "true") === "true",
    subject: valueOf(values, "aliyunMailSubject", "邮箱验证码"),
    bodyTemplate: valueOf(values, "aliyunMailBodyTemplate", "您的验证码是 ${code}，5 分钟内有效。")
  };
  const smsProvider = normalizeSmsProvider(valueOf(values, "smsVerificationProvider", "ALIYUN_SMS"));
  const sms = {
    enabled: valueOf(values, "smsVerificationEnabled", "false") === "true",
    provider: smsProvider,
    accessKeyId: valueOf(values, "aliyunSmsAccessKeyId"),
    accessKeySecretPreview: smsSecretPreview,
    endpoint: normalizeSmsEndpoint(
      smsProvider,
      valueOf(values, "aliyunSmsEndpoint", defaultSmsEndpoint(smsProvider))
    ),
    regionId: valueOf(values, "aliyunSmsRegionId", "cn-hangzhou"),
    signName: valueOf(values, "aliyunSmsSignName"),
    templateCode: valueOf(values, "aliyunSmsTemplateCode"),
    templateParamCodeKey: valueOf(values, "aliyunSmsTemplateParamCodeKey", "code") || "code",
    templateParamExtraJson: valueOf(values, "aliyunSmsTemplateParamExtraJson", "{}") || "{}",
    codeTtlSeconds: valueOf(values, "smsCodeTtlSeconds", "300") || "300"
  };

  return {
    email: {
      ...email,
      ready: Boolean(
        email.accessKeyId &&
          hasSecretPreview(email.accessKeySecretPreview) &&
          email.endpoint &&
          email.regionId &&
          email.accountName &&
          email.subject &&
          email.bodyTemplate
      )
    },
    sms: {
      ...sms,
      ready: normalizeSmsReady(sms.provider, sms)
    }
  };
}

export async function updateEmailSendConfigAction(
  _previousState: SendConfigActionState,
  formData: FormData
): Promise<SendConfigActionState> {
  try {
    await apiFetch<SystemConfig[]>("/system-config", {
      method: "PATCH",
      body: JSON.stringify({
        emailVerificationEnabled: checked(formData, "emailVerificationEnabled"),
        emailVerificationProvider: text(formData, "emailVerificationProvider"),
        aliyunMailAccessKeyId: text(formData, "aliyunMailAccessKeyId"),
        aliyunMailAccessKeySecretEncrypted: text(formData, "aliyunMailAccessKeySecret"),
        aliyunMailEndpoint: text(formData, "aliyunMailEndpoint"),
        aliyunMailRegionId: text(formData, "aliyunMailRegionId"),
        aliyunMailAccountName: text(formData, "aliyunMailAccountName"),
        aliyunMailFromAlias: text(formData, "aliyunMailFromAlias"),
        aliyunMailAddressType: text(formData, "aliyunMailAddressType"),
        aliyunMailReplyToAddress: checked(formData, "aliyunMailReplyToAddress"),
        aliyunMailSubject: text(formData, "aliyunMailSubject"),
        aliyunMailBodyTemplate: text(formData, "aliyunMailBodyTemplate")
      })
    });

    revalidatePath("/admin/send");
    return { success: "邮件验证配置已保存" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "邮件验证配置保存失败" };
  }
}

export async function updateSmsSendConfigAction(
  _previousState: SendConfigActionState,
  formData: FormData
): Promise<SendConfigActionState> {
  try {
    await apiFetch<SystemConfig[]>("/system-config", {
      method: "PATCH",
      body: JSON.stringify({
        smsVerificationEnabled: checked(formData, "smsVerificationEnabled"),
        smsVerificationProvider: text(formData, "smsVerificationProvider"),
        aliyunSmsAccessKeyId: text(formData, "aliyunSmsAccessKeyId"),
        aliyunSmsAccessKeySecretEncrypted: text(formData, "aliyunSmsAccessKeySecret"),
        aliyunSmsEndpoint: text(formData, "aliyunSmsEndpoint"),
        aliyunSmsRegionId: text(formData, "aliyunSmsRegionId"),
        aliyunSmsSignName: text(formData, "aliyunSmsSignName"),
        aliyunSmsTemplateCode: text(formData, "aliyunSmsTemplateCode"),
        aliyunSmsTemplateParamCodeKey: text(formData, "aliyunSmsTemplateParamCodeKey"),
        aliyunSmsTemplateParamExtraJson: text(formData, "aliyunSmsTemplateParamExtraJson"),
        smsCodeTtlSeconds: text(formData, "smsCodeTtlSeconds")
      })
    });

    revalidatePath("/admin/send");
    revalidatePath("/login");
    revalidatePath("/register");
    revalidatePath("/dashboard/profile");
    return { success: "短信验证配置已保存" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "短信验证配置保存失败" };
  }
}

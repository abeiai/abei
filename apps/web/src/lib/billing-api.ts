import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { JsapiParams } from "@/components/billing/wechat-jsapi-launcher";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

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
export type PaymentOrderStatus = "CREATED" | "PAYING" | "PAID" | "CLOSED" | "FAILED";
export type LedgerView = "all" | "source" | "consume";

export interface Wallet {
  id: string;
  userId: string;
  availableCredits: number;
  purchasedCredits?: number;
  membershipCredits?: number;
  frozenCredits: number;
  totalTopUpCredits: number;
  totalConsumedCredits: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentOrder {
  membershipSnapshot?: { planId: string; name: string; rank: number; storageGb: number; learnerLimit: number; benefits: import("./membership").MembershipPlan["benefits"]; period: import("./membership").MembershipTerm; credits: number; amountCny: string } | null;
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    nickname: string;
  } | null;
  provider: PaymentProvider;
  providerName: string;
  scene: PaymentScene;
  product: PaymentProduct;
  action: PaymentAction;
  orderNo: string;
  amountCny: string;
  credits: number;
  status: PaymentOrderStatus;
  statusName: string;
  providerTradeNo: string | null;
  paymentUrl: string | null;
  qrCodeUrl: string | null;
  launchParams: JsapiParams | null;
  providerPayload: unknown;
  notifyRaw: unknown;
  paymentMode: "REAL" | "UNCONFIGURED";
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  mockPaymentUrl: string;
  mockQrCodeUrl: string;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  type: "TOP_UP" | "RESERVE" | "CONSUME" | "RELEASE" | "REFUND" | "ADMIN_ADJUST";
  typeName: string;
  amount: number;
  balanceAfter: number;
  relatedOrderId: string | null;
  relatedTaskId: string | null;
  relatedAudioTaskId: string | null;
  relatedTaskType: string | null;
  operationType: "TTS" | "VOICE_CLONE" | "VOICE_DESIGN" | null;
  operationTypeName: string | null;
  idempotencyKey: string;
  note: string | null;
  createdAt: string;
  relatedOrder: {
    id: string;
    orderNo: string;
    provider: PaymentProvider;
    amountCny: string;
    credits: number;
    status: PaymentOrderStatus;
  } | null;
  relatedTask: {
    id: string;
    status: string;
    scenarioName: string | null;
  } | null;
}

export interface AvailablePaymentProduct {
  provider: PaymentProvider;
  providerName: string;
  scene: PaymentScene;
  sceneName: string;
  product: PaymentProduct;
  productName: string;
  description: string;
  requiresAuthorization: boolean;
}

export interface RechargeProduct {
  id: string;
  code: string;
  name: string;
  billingMode: "RECHARGE" | "SUBSCRIPTION" | "MIXED";
  billingModeName: string;
  amountCny: string;
  credits: number;
  description: string;
  benefitsMarkdown: string;
  sortOrder: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
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

async function apiFetch<TData>(path: string, init: RequestInit = {}, options = { user: true }) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  if (options.user) {
    headers.set("Cookie", await getCookieHeader());
  }

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

export async function getWallet() {
  return apiFetch<Wallet>("/wallet/me");
}

export async function getLedger(view: LedgerView = "all", startDate?: string) {
  const searchParams = new URLSearchParams();

  if (view !== "all") {
    searchParams.set("view", view);
  }

  if (startDate) {
    searchParams.set("startDate", startDate);
  }

  const query = searchParams.toString();

  return apiFetch<LedgerEntry[]>(`/wallet/ledger${query ? `?${query}` : ""}`);
}

export async function getPaymentOrder(id: string) {
  return apiFetch<PaymentOrder>(`/payment/orders/${id}`);
}

export async function getAvailablePaymentProducts() {
  return apiFetch<AvailablePaymentProduct[]>("/payment/products");
}

export async function getRechargeProducts() {
  return apiFetch<RechargeProduct[]>("/payment/recharge-products", {}, { user: false });
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败";
}

function safeReturnPath(value: string, fallback = "/dashboard/billing") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/admin")) {
    return fallback;
  }

  return value.split("?")[0] || fallback;
}

function paymentReturnTarget(returnPath: string, packageCode: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams();

  if ((returnPath === "/pricing" || returnPath === "/pricing/checkout") && packageCode) {
    searchParams.set("package", packageCode);
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();

  return query ? `${returnPath}?${query}` : returnPath;
}

export async function createPaymentOrderAction(formData: FormData) {
  "use server";

  let target: string;
  const requestHeaders = await headers();
  const packageCode = text(formData, "packageCode");
  const returnPath = safeReturnPath(text(formData, "returnPath"));

  try {
    const order = await apiFetch<PaymentOrder>("/payment/orders", {
      method: "POST",
      headers: {
        "x-client-user-agent": requestHeaders.get("user-agent") ?? "",
        "x-client-ip": requestHeaders.get("x-forwarded-for") ?? ""
      },
      body: JSON.stringify({
        provider: text(formData, "provider"),
        packageCode,
        scene: text(formData, "scene")
      })
    });
    target = paymentReturnTarget(returnPath, packageCode, { order: order.id });
  } catch (error) {
    target = paymentReturnTarget(returnPath, packageCode, { error: errorMessage(error) });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/billing");
  revalidatePath("/pricing");
  revalidatePath("/pricing/checkout");
  redirect(target);
}

export async function mockPayOrderAction(formData: FormData) {
  "use server";

  const orderId = text(formData, "orderId");
  const orderNo = text(formData, "orderNo");
  const provider = text(formData, "provider") as PaymentProvider;
  const packageCode = text(formData, "packageCode");
  const returnPath = safeReturnPath(text(formData, "returnPath"));
  const notifyPath = `/payment/mock/${provider}/notify`;
  let target: string;

  try {
    await apiFetch(
      notifyPath,
      {
        method: "POST",
        body: JSON.stringify({
          orderNo,
          providerTradeNo: `MOCK${Date.now()}`,
          tradeStatus: "SUCCESS"
        })
      },
      { user: false }
    );
    target = paymentReturnTarget(returnPath, packageCode, { order: orderId, paid: "1" });
  } catch (error) {
    target = paymentReturnTarget(returnPath, packageCode, {
      order: orderId,
      error: errorMessage(error)
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/billing");
  revalidatePath("/pricing");
  revalidatePath("/pricing/checkout");
  redirect(target);
}

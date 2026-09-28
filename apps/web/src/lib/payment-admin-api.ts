"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import type { PaymentOrder, PaymentProvider, RechargeProduct } from "@/lib/billing-api";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface PaymentNotifyLog {
  id: string;
  provider: PaymentProvider;
  providerName: string;
  orderNo: string | null;
  headers: unknown;
  body: unknown;
  verifyResult: string;
  processResult: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface PaymentSyncResult {
  synced: boolean;
  credited: boolean;
  order: PaymentOrder;
  channelStatus: "PAID" | "CLOSED" | "UNPAID";
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

export async function getAdminPaymentOrders() {
  return apiFetch<PaymentOrder[]>("/admin/payments");
}

export async function getAdminPaymentOrder(id: string) {
  return apiFetch<PaymentOrder>(`/admin/payments/${id}`);
}

export async function getPaymentNotifyLogs(orderNo?: string) {
  const query = orderNo ? `?orderNo=${encodeURIComponent(orderNo)}` : "";

  return apiFetch<PaymentNotifyLog[]>(`/admin/payments/notify-logs${query}`);
}

export async function getAdminBillingProducts() {
  return apiFetch<RechargeProduct[]>("/admin/products");
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function paymentMutation(path: string) {
  await apiFetch<PaymentSyncResult>(path, {
    method: "POST"
  });
  revalidatePath("/admin");
  revalidatePath("/admin/payments");
}

function numberValue(formData: FormData, name: string, fallback = 0) {
  const value = Number(text(formData, name));

  return Number.isFinite(value) ? value : fallback;
}

function checkboxValue(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function productPayload(formData: FormData) {
  return {
    code: text(formData, "code"),
    billingMode: text(formData, "billingMode") || "RECHARGE",
    name: text(formData, "name"),
    amountCny: text(formData, "amountCny"),
    credits: numberValue(formData, "credits"),
    description: text(formData, "description"),
    benefitsMarkdown: text(formData, "benefitsMarkdown"),
    sortOrder: numberValue(formData, "sortOrder", 100),
    isEnabled: checkboxValue(formData, "isEnabled")
  };
}

export async function createBillingProductAction(formData: FormData) {
  await apiFetch<RechargeProduct>("/admin/products", {
    method: "POST",
    body: JSON.stringify(productPayload(formData))
  });
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/dashboard/billing");
  revalidatePath("/pricing");
}

export async function updateBillingProductAction(formData: FormData) {
  await apiFetch<RechargeProduct>(`/admin/products/${text(formData, "id")}`, {
    method: "PATCH",
    body: JSON.stringify(productPayload(formData))
  });
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/dashboard/billing");
  revalidatePath("/pricing");
}

export async function deleteBillingProductAction(formData: FormData) {
  await apiFetch(`/admin/products/${text(formData, "id")}`, {
    method: "DELETE"
  });
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/dashboard/billing");
  revalidatePath("/pricing");
}

export async function syncPaymentOrderAction(formData: FormData) {
  await paymentMutation(`/admin/payments/${text(formData, "id")}/sync`);
}

export async function supplementPaymentOrderAction(formData: FormData) {
  await paymentMutation(`/admin/payments/${text(formData, "id")}/supplement`);
}

"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { adminUserQuery, type AdminUserFilters } from "./admin-user-query";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  nickname: string;
  status: "ACTIVE" | "DISABLED";
  statusName: string;
  availableCredits: number;
  frozenCredits: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUsersPage {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminWallet {
  id: string;
  userId: string;
  availableCredits: number;
  frozenCredits: number;
  totalTopUpCredits: number;
  totalConsumedCredits: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLedgerEntry {
  id: string;
  userId: string;
  type: string;
  typeName: string;
  amount: number;
  balanceAfter: number;
  relatedOrderId: string | null;
  relatedTaskId: string | null;
  idempotencyKey: string;
  note: string | null;
  createdAt: string;
  relatedOrder: {
    id: string;
    orderNo: string;
    provider: string;
    amountCny: string;
    credits: number;
    status: string;
  } | null;
  relatedTask: {
    id: string;
    status: string;
    scenarioName: string | null;
  } | null;
}

export interface AdminUserPaymentOrder {
  id: string;
  orderNo: string;
  provider: string;
  providerName: string;
  amountCny: string;
  credits: number;
  status: string;
  statusName: string;
  providerTradeNo: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserAiTask {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: string;
  statusName: string;
  estimatedCredits: number;
  actualCredits: number | null;
  providerName: string | null;
  modelName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  reservation: {
    id: string;
    amount: number;
    status: string;
  } | null;
}

export interface AdminUserDetail {
  user: {
    id: string;
    email: string;
    nickname: string;
    status: "ACTIVE" | "DISABLED";
    statusName: string;
    createdAt: string;
    lastLoginAt: string | null;
    updatedAt: string;
  };
  wallet: AdminWallet;
  paymentOrders: AdminUserPaymentOrder[];
  rechargeRecords: AdminLedgerEntry[];
  consumeRecords: AdminLedgerEntry[];
  ledgerEntries: AdminLedgerEntry[];
  aiTasks: AdminUserAiTask[];
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

function numberValue(formData: FormData, name: string) {
  const value = Number(formData.get(name) ?? 0);

  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function revalidateUserPaths(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/operation-logs");
}

export async function getAdminUsers() {
  return apiFetch<AdminUserListItem[]>("/admin/users");
}

export async function getAdminUsersPage(filters: AdminUserFilters = {}) {
  return apiFetch<AdminUsersPage>(`/admin/users/search?${adminUserQuery(filters)}`);
}

export async function getAdminUser(id: string) {
  return apiFetch<AdminUserDetail>(`/admin/users/${id}`);
}

export async function updateUserStatusAction(formData: FormData) {
  const id = text(formData, "id");
  await apiFetch<AdminUserListItem>(`/admin/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status: text(formData, "status")
    })
  });

  revalidateUserPaths(id);
}

export async function adjustUserCreditsAction(formData: FormData) {
  const id = text(formData, "id");
  await apiFetch(`/admin/users/${id}/credits/adjust`, {
    method: "POST",
    body: JSON.stringify({
      amount: numberValue(formData, "amount"),
      reason: text(formData, "reason")
    })
  });

  revalidateUserPaths(id);
}

export async function rechargeUserCreditsAction(formData: FormData) {
  const id = text(formData, "id");
  await apiFetch(`/admin/users/${id}/credits/recharge`, {
    method: "POST",
    body: JSON.stringify({
      amount: numberValue(formData, "amount"),
      reasonType: text(formData, "reasonType"),
      reason: text(formData, "reason") || undefined
    })
  });

  revalidateUserPaths(id);
}

"use server";

import { cookies } from "next/headers";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface OperationLogAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
  status?: string;
}

export interface OperationLog {
  id: string;
  adminUserId: string | null;
  adminUser: OperationLogAdmin | null;
  action: string;
  actionName: string;
  resourceType: string;
  resourceId: string | null;
  description: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface OperationLogFilters {
  adminUserId?: string;
  resourceType?: string;
  resourceId?: string;
  startedAt?: string;
  endedAt?: string;
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

function buildQuery(filters: OperationLogFilters = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

export async function getAdminOperationLogs(filters: OperationLogFilters = {}) {
  return apiFetch<OperationLog[]>(`/admin/operation-logs${buildQuery(filters)}`);
}

export async function getOperationLogAdmins() {
  return apiFetch<OperationLogAdmin[]>("/admin/operation-logs/admins");
}

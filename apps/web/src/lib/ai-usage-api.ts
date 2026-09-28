"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export interface UsageSummary {
  requestCount: number;
  successCount: number;
  failureCount: number;
  failureRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  consumedCredits: number;
  estimatedCost: number;
  avgLatencyMs: number;
}

export interface UsageTopItem {
  id: string;
  name: string;
  value: number;
}

export interface UsageGroup extends UsageSummary {
  id: string;
  name: string;
}

export interface UsageOption {
  id: string;
  name: string;
}

export interface AiUsageDashboard {
  filters: {
    from: string;
    to: string;
    providerId: string;
    modelId: string;
  };
  total: UsageSummary;
  today: UsageSummary;
  top: {
    mostUsedModel: UsageTopItem | null;
    mostCostlyModel: UsageTopItem | null;
    mostUsedTool: UsageTopItem | null;
  };
  trend: Array<
    {
      date: string;
    } & UsageSummary
  >;
  byProvider: UsageGroup[];
  byModel: UsageGroup[];
  byTool: UsageGroup[];
  providers: UsageOption[];
  models: UsageOption[];
  updatedAt: string;
}

export interface SystemAlert {
  id: string;
  type: string;
  typeName: string;
  level: "INFO" | "WARNING" | "ERROR" | string;
  levelName: string;
  title: string;
  message: string;
  status: "OPEN" | "RESOLVED" | string;
  statusName: string;
  relatedResourceType: string | null;
  relatedResourceId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByAdminId: string | null;
}

export interface AiUsageAggregateResult {
  from: string;
  to: string;
  scannedCallLogs: number;
  statRows: number;
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

function buildQuery(filters: {
  from?: string;
  to?: string;
  providerId?: string;
  modelId?: string;
  status?: string;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

export async function getAdminAiUsageDashboard(filters: {
  from?: string;
  to?: string;
  providerId?: string;
  modelId?: string;
}) {
  return apiFetch<AiUsageDashboard>(`/admin/ai/usage${buildQuery(filters)}`);
}

export async function getSystemAlerts(status = "OPEN") {
  return apiFetch<SystemAlert[]>(`/admin/ai/usage/alerts${buildQuery({ status })}`);
}

export async function aggregateAiUsageAction(formData: FormData) {
  const from = text(formData, "from");
  const to = text(formData, "to");

  await apiFetch<AiUsageAggregateResult>(`/admin/ai/usage/aggregate${buildQuery({ from, to })}`, {
    method: "POST",
    body: JSON.stringify({})
  });

  revalidatePath("/admin");
  revalidatePath("/admin/ai/usage");
}

export async function resolveSystemAlertAction(formData: FormData) {
  const id = text(formData, "id");

  await apiFetch<SystemAlert>(`/admin/ai/usage/alerts/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({})
  });

  revalidatePath("/admin");
  revalidatePath("/admin/ai/usage");
}

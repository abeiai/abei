import "server-only";
import { cookies } from "next/headers";
import type { LegacyLogSearch } from "./legacy-ai-log-query";

export interface LegacyAiLog {
  id: string;
  sourceSystem: string;
  sourceTable: string;
  sourcePk: string;
  sourceUserId: string | null;
  sourceStatus: string | null;
  kind: "CHAT" | "IMAGE" | "AUDIO" | "VIDEO";
  status: "WAITING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  application: string | null;
  providerName: string | null;
  modelName: string | null;
  versionName: string | null;
  inputPreview: string | null;
  outputPreview: string | null;
  requestedAt: string;
  respondedAt: string | null;
  user: { id: string; email: string; nickname: string } | null;
}
export interface LegacyAiLogDetail extends LegacyAiLog {
  sourceMsgId: string | null;
  sourceTaskId: string | null;
  voiceName: string | null;
  inputText: string | null;
  outputText: string | null;
  systemPrompt: string | null;
  parameters: unknown;
  errorMessage: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  textLength: number | null;
  durationRaw: string | null;
  durationUnit: string | null;
  usageVerified: boolean;
  sessions: Array<{ id: string; title: string | null; systemPrompt: string | null; page: number; pageSize: number; total: number; items: Array<{ position: number; sourceMsgId: string | null; log: { id: string; kind: string; requestedAt: string; inputText: string | null; outputText: string | null } | null }> }>;
  assets: Array<{ id: string; position: number; role: string; fieldPath: string; mediaType: "IMAGE" | "AUDIO" | "VIDEO"; status: "AVAILABLE" | "MISSING" | "PENDING"; filename: string | null; url: string | null }>;
}
export interface LegacyAiLogPage { items: LegacyAiLog[]; total: number; page: number; pageSize: number }

async function get<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  let response: Response;
  try { response = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:3602/api"}/admin/legacy-ai-logs${path}`, {
    headers: { Cookie: cookieStore.getAll().map(cookie => `${cookie.name}=${encodeURIComponent(cookie.value)}`).join("; ") },
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  }); } catch { throw new Error("日志服务暂不可用，请稍后重试"); }
  const payload = await response.json().catch(() => null) as { code: number; message?: string; data: T | null } | null;
  if (!response.ok || !payload || payload.code !== 0 || payload.data == null) throw new Error(payload?.message || "日志查询暂不可用");
  return payload.data;
}

export async function getLegacyAiLogs(query: LegacyLogSearch) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (key !== "source" && value !== "") params.set(key, String(value));
  return get<LegacyAiLogPage>(`?${params}`);
}
export async function getLegacyAiLog(id: string, sessionPage?: string) {
  const query = sessionPage ? "?" + new URLSearchParams({ sessionPage }) : "";
  return get<LegacyAiLogDetail>(`/${encodeURIComponent(id)}${query}`);
}

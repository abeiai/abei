import { cookies } from "next/headers";
import type {
  AccountLearnerLearningFilters,
  AccountLearnerLearningOverview,
  LearnerLearningOverview,
  LearnerMaterialDetail,
  LearnerMaterialSummary,
  LearningMaterialType
} from "./learner-learning-types";

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
}

function apiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function cookieHeader() {
  const store = await cookies();
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

export async function getLearnerLearningOverview(
  range?: { from: string; to: string }
): Promise<LearnerLearningOverview> {
  if (process.env.LEARNER_LEARNING_ENABLED !== "1") {
    return emptyOverview(range);
  }
  const query = range
    ? `?${new URLSearchParams({ from: range.from, to: range.to }).toString()}`
    : "";
  return learnerLearningRequest<LearnerLearningOverview>(`/overview${query}`);
}

export async function getLearnerLearningMaterials(
  limit = 20
): Promise<LearnerMaterialSummary[]> {
  if (process.env.LEARNER_LEARNING_ENABLED !== "1") return [];
  const query = new URLSearchParams({ limit: String(limit) });
  return learnerLearningRequest<LearnerMaterialSummary[]>(`/materials?${query}`);
}

export async function getLearnerMaterialDetail(
  materialType: LearningMaterialType,
  materialId: string
): Promise<LearnerMaterialDetail> {
  if (process.env.LEARNER_LEARNING_ENABLED !== "1") {
    throw new Error("学习记录功能暂未开放");
  }
  return learnerLearningRequest<LearnerMaterialDetail>(
    `/materials/${materialType}/${encodeURIComponent(materialId)}`
  );
}

export async function getAccountLearnerLearningOverview(
  learnerId: string,
  filters: AccountLearnerLearningFilters = {}
): Promise<AccountLearnerLearningOverview> {
  if (process.env.LEARNER_LEARNING_ENABLED !== "1") {
    const range = filters.from && filters.to
      ? { from: filters.from, to: filters.to }
      : undefined;
    return { ...emptyOverview(range), courseBreakdown: [], materialBreakdown: [], scenarioBreakdown: [], resourceBreakdown: [] };
  }
  return accountLearnerLearningRequest<AccountLearnerLearningOverview>(
    learnerId,
    `/overview${filterQuery(filters)}`
  );
}

export async function getAccountLearnerLearningMaterials(
  learnerId: string,
  filters: AccountLearnerLearningFilters = {}
): Promise<LearnerMaterialSummary[]> {
  if (process.env.LEARNER_LEARNING_ENABLED !== "1") return [];
  return accountLearnerLearningRequest<LearnerMaterialSummary[]>(
    learnerId,
    `/materials${filterQuery(filters)}`
  );
}

export async function getAccountLearnerMaterialDetail(
  learnerId: string,
  materialType: LearningMaterialType,
  materialId: string
): Promise<LearnerMaterialDetail> {
  if (process.env.LEARNER_LEARNING_ENABLED !== "1") {
    throw new Error("学习记录功能暂未开放");
  }
  return accountLearnerLearningRequest<LearnerMaterialDetail>(
    learnerId,
    `/materials/${materialType}/${encodeURIComponent(materialId)}`
  );
}

async function learnerLearningRequest<T>(path: string): Promise<T> {
  return apiRequest<T>(`${apiBaseUrl()}/profiles/learner/learning${path}`);
}

async function accountLearnerLearningRequest<T>(
  learnerId: string,
  path: string
): Promise<T> {
  return apiRequest<T>(
    `${apiBaseUrl()}/profiles/learners/${encodeURIComponent(learnerId)}/learning${path}`
  );
}

async function apiRequest<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Cookie: await cookieHeader() },
      cache: "no-store"
    });
  } catch {
    throw new Error("学习情况加载失败，请稍后再试");
  }
  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error("学习情况加载失败，请稍后再试");
  }
  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "学习情况加载失败，请稍后再试");
  }
  return payload.data;
}

function filterQuery(filters: AccountLearnerLearningFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function emptyOverview(range?: { from: string; to: string }): LearnerLearningOverview {
  const to = range?.to ?? shanghaiDateKey(new Date());
  const from = range?.from ?? addDays(to, -6);
  const days = Math.floor(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000
  );
  return {
    range: { from, to },
    totals: {
      onlineSeconds: 0,
      studySeconds: 0,
      learningDays: 0,
      startedMaterialCount: 0,
      completedMaterialCount: 0,
      completionRate: null
    },
    daily: Array.from({ length: Math.max(0, days) + 1 }, (_, index) => ({
      date: addDays(from, index),
      onlineSeconds: 0,
      studySeconds: 0
    })),
    recentMaterials: []
  };
}

function shanghaiDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

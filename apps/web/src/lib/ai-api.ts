import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

export type AiTaskStatus =
  | "CREATED"
  | "RESERVED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "COMPENSATED";

export interface AiScenario {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  toolCategoryId: string | null;
  toolCategory: AiToolCategory | null;
  promptTemplate: string;
  promptVariables: Array<{
    name: string;
    label: string;
    required: boolean;
    placeholder: string;
  }>;
  inputSchema: AiToolInputSchema | null;
  requiredCapabilities: string[];
  costCredits: number;
  isEnabled: boolean;
  defaultModelId: string | null;
  fallbackModelId: string | null;
  defaultModelAlias: string | null;
  fallbackModelAlias: string | null;
  sortOrder: number;
  isBuiltIn: boolean;
  templateVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiToolCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiToolInputField {
  name: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "select"
    | "number"
    | "switch"
    | "voice-select"
    | "audio-upload"
    | "slider"
    | "audio-preview"
    | "format-select";
  required: boolean;
  placeholder: string;
  options: string[];
  min?: number;
  max?: number;
  defaultValue?: string | number | boolean;
  accept?: string[];
  maxSizeMb?: number;
}

export interface AiToolInputSchema {
  fields: AiToolInputField[];
}

export interface AiTask {
  id: string;
  userId: string;
  billingContext?: "PERSONAL" | "ORGANIZATION";
  organizationId?: string | null;
  organizationMemberId?: string | null;
  user?: {
    id: string;
    email: string;
    nickname: string;
  } | null;
  scenarioId: string;
  knowledgeBaseId: string | null;
  aiProviderId: string | null;
  aiModelId: string | null;
  status: AiTaskStatus;
  statusName: string;
  input: {
    text?: string;
    variables?: Record<string, string>;
    knowledgeBaseId?: string | null;
    knowledgeContext?: string;
  };
  renderedPrompt: string | null;
  output: string | null;
  inputPreview: string | null;
  outputPreview: string | null;
  inputHash: string | null;
  outputHash: string | null;
  saveFullContent: boolean;
  errorMessage: string | null;
  estimatedCredits: number;
  actualCredits: number | null;
  providerName: string | null;
  modelName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  scenario: AiScenario;
  reservation: {
    id: string;
    amount: number;
    status: string;
    statusName: string;
    expiresAt: string;
  } | null;
  callLogs?: Array<{
    id: string;
    provider: string;
    model: string;
    requestId: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    latencyMs: number | null;
    success: boolean;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
}

export type HistoryProfileFilter = "all" | "account" | `learner:${string}`;

interface HistoryFilterLearner {
  id: string;
  nickname: string;
  gradeLabel: string;
  status: string;
}

export interface HistoryProfileFilterGroup {
  label: "有效学习者" | "已停用学习者" | null;
  options: Array<{
    label: string;
    value: HistoryProfileFilter;
  }>;
}

export function parseHistoryProfileFilter(
  value: unknown,
  learners: readonly HistoryFilterLearner[]
): HistoryProfileFilter {
  if (value === undefined) {
    return "all";
  }
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error("学习者筛选无效");
  }
  if (value === "all" || value === "account") {
    return value;
  }
  if (!value.startsWith("learner:")) {
    throw new Error("学习者筛选无效");
  }

  const learnerId = value.slice("learner:".length);
  if (!learnerId || learnerId.includes(":") || !learners.some((learner) => learner.id === learnerId)) {
    throw new Error("学习者筛选无效");
  }

  return `learner:${learnerId}`;
}

export function historyProfileFilterGroups(
  learners: readonly HistoryFilterLearner[]
): HistoryProfileFilterGroup[] {
  const learnerOptions = (status: string) => learners
    .filter((learner) => learner.status === status)
    .map((learner) => ({
      label: `${learner.nickname}（${learner.gradeLabel}）`,
      value: `learner:${learner.id}` as HistoryProfileFilter
    }));

  return [
    {
      label: null,
      options: [
        { label: "全部", value: "all" },
        { label: "我的账号", value: "account" }
      ]
    },
    { label: "有效学习者", options: learnerOptions("ACTIVE") },
    { label: "已停用学习者", options: learnerOptions("INACTIVE") }
  ];
}

export function historyProfileQuery(filter: HistoryProfileFilter | undefined) {
  return filter ? `?profile=${encodeURIComponent(filter)}` : "";
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

export async function getAiScenarios() {
  return apiFetch<AiScenario[]>("/ai/scenarios");
}

export async function getAiToolCategories() {
  return apiFetch<AiToolCategory[]>("/ai/tool-categories");
}

export async function getAiTools(categorySlug?: string) {
  const query = categorySlug ? `?category=${encodeURIComponent(categorySlug)}` : "";

  return apiFetch<AiScenario[]>(`/ai/tools${query}`);
}

export async function getAiTool(slug: string) {
  return apiFetch<AiScenario>(`/ai/tools/${slug}`);
}

export async function getAiTasks(profile?: HistoryProfileFilter) {
  return apiFetch<AiTask[]>(`/ai/tasks${historyProfileQuery(profile)}`);
}

export async function getAiTask(id: string) {
  return apiFetch<AiTask>(`/ai/tasks/${id}`);
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败";
}

function variables(formData: FormData) {
  const result: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("var_")) {
      result[key.slice(4)] = String(value ?? "").trim();
    }
  }

  return result;
}

export async function createAiTaskAction(formData: FormData) {
  "use server";

  let target: string;

  try {
    const task = await apiFetch<AiTask>("/ai/tasks", {
      method: "POST",
      body: JSON.stringify({
        scenarioId: text(formData, "scenarioId"),
        input: text(formData, "input")
      })
    });
    const resultFlag = task.status === "FAILED" ? "failed=1" : "created=1";
    target = `/dashboard/ai?task=${task.id}&${resultFlag}`;
  } catch (error) {
    target = `/dashboard/ai?error=${encodeURIComponent(errorMessage(error))}`;
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai");
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/billing");
  redirect(target);
}

export async function createToolTaskAction(formData: FormData) {
  "use server";

  const scenarioSlug = text(formData, "scenarioSlug");
  const toolPath = `/tools/${scenarioSlug}`;
  let target: string;

  try {
    const scenario = await getAiTool(scenarioSlug);

    const task = await apiFetch<AiTask>("/ai/tasks", {
      method: "POST",
      body: JSON.stringify({
        scenarioId: scenario.id,
        input: text(formData, "input"),
        variables: variables(formData),
        knowledgeBaseId: text(formData, "knowledgeBaseId") || undefined
      })
    });
    const resultFlag = task.status === "FAILED" ? "failed=1" : "created=1";
    target = `${toolPath}?task=${task.id}&${resultFlag}`;
  } catch (error) {
    const message = errorMessage(error);

    if (message.includes("登录")) {
      target = `/login?next=${encodeURIComponent(toolPath)}`;
    } else {
      target = `${toolPath}?error=${encodeURIComponent(message)}`;
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/billing");
  revalidatePath(toolPath);
  redirect(target);
}

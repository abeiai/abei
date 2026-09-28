import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  learnerScenarioHref,
  learnerEntryDecision,
  profileLoginHref,
  profileSelectionHref,
  selectionDestination,
  type SelectableProfileMode
} from "@/lib/profile-routing";

export { getLearnerLearningOverview } from "@/lib/learner-learning-api";
export type { LearnerLearningOverview } from "@/lib/learner-learning-types";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

export interface ProfileSelectionAccount {
  id: string;
  accountId: string;
  label: string;
  nickname: string;
  avatarUrl: string | null;
  hasLoginPassword: boolean;
}

export interface ProfileSelectionLearner {
  id: string;
  accountId: string;
  nickname: string;
  grade: string;
  gradeLabel: string;
  avatarUrl: string | null;
  status: string;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileSelection {
  account: ProfileSelectionAccount;
  learners: ProfileSelectionLearner[];
}

export interface ProfileActionState {
  error?: string;
  success?: string;
}

export interface LearnerGradeOption {
  value: string;
  label: string;
}

export interface LearnerAuthorizationOptions {
  scenarios: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    category: { id: string; name: string; slug: string } | null;
  }>;
  courses: Array<{
    id: string;
    name: string;
    summary: string;
    tags: string[];
    coverUrl: string;
    publishedAt: string;
  }>;
}

export interface LearnerAuthorizations {
  scenarioIds: string[];
  courseIds: string[];
}

export interface LearnerHome {
  learner: {
    id: string;
    nickname: string;
    grade: string;
    gradeLabel: string;
    avatarUrl: string | null;
  };
  scenarios: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
  }>;
  courses: Array<{
    id: string;
    name: string;
    summary: string;
    tags: string[];
    coverUrl: string;
    publishedAt: string;
  }>;
  recentRecords: Array<{
    id: string;
    type: "AI_TASK" | "AUDIO_TASK" | "VIDEO_GUIDE" | "GUIDED_STUDY" | "FLASHCARD_DECK" | "COPYBOOK";
    title: string;
    status: string;
    href: string;
    createdAt: string;
  }>;
}

export interface LearnerStatistics {
  completedActivityCount: number;
  recentCompletedActivityCount: number;
  lastActivityAt: string | null;
}

export type WebProfile =
  | { mode: "GUEST" }
  | { mode: "UNSELECTED" }
  | { mode: "ACCOUNT" }
  | { mode: "LEARNER"; home: LearnerHome };

interface SetCookieHeaders {
  get(name: string): string | null;
  getSetCookie?: () => string[];
}

interface CookieWriter {
  set(name: string, value: string, options: Record<string, unknown>): void;
}

interface ParsedProfileCookie {
  value: string;
  maxAge: number;
}

const profileContextCookie = "xueleai_profile_context";
const userAccessCookie = "xueleai_user_access";
const userRefreshCookie = "xueleai_user_refresh";
const safeCookieValue = /^[!#$%&'*+\-.^_`|~0-9A-Za-z:]+$/u;
const learnerManagementPath = "/dashboard/learners";
const learnerGradeValues = new Set([
  "PRESCHOOL",
  "GRADE_1",
  "GRADE_2",
  "GRADE_3",
  "GRADE_4",
  "GRADE_5",
  "GRADE_6",
  "GRADE_7",
  "GRADE_8",
  "GRADE_9",
  "HIGH_1",
  "HIGH_2",
  "HIGH_3",
  "UNIVERSITY_OR_WORK"
]);

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

function shouldUseSecureCookies() {
  const appBaseUrl = process.env.APP_BASE_URL?.trim().toLowerCase();

  if (appBaseUrl) {
    return appBaseUrl.startsWith("https://");
  }

  return process.env.NODE_ENV === "production";
}

async function getCookieHeader() {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

export async function getProfileSelection(next?: unknown): Promise<ProfileSelection> {
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}/profiles/selection`, {
      headers: { Cookie: await getCookieHeader() },
      cache: "no-store"
    });
  } catch {
    throw new Error("身份列表加载失败，请稍后再试");
  }

  if (response.status === 401) {
    redirect(profileLoginHref(next));
  }

  let payload: ApiResponse<ProfileSelection>;

  try {
    payload = (await response.json()) as ApiResponse<ProfileSelection>;
  } catch {
    throw new Error("身份列表加载失败，请稍后再试");
  }

  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(friendlyApiMessage(payload.message, "身份列表加载失败，请稍后再试"));
  }

  return payload.data;
}

export async function requireAccountProfile(next: unknown = "/dashboard") {
  const response = await profileRequest("/profiles/grades", "账号身份验证失败，请稍后再试");

  if (response.status === 401) {
    redirect(profileLoginHref(next));
  }

  const payload = await readProfilePayload<LearnerGradeOption[]>(
    response,
    "账号身份验证失败，请稍后再试"
  );

  if (response.status === 403 && payload.message === "请先选择使用身份") {
    redirect(profileSelectionHref(next));
  }
  if (response.status === 403 && payload.message === "请切换到主账号身份后操作") {
    redirect("/learn");
  }
  if (!response.ok || payload.code !== 0 || !Array.isArray(payload.data)) {
    throw new Error(friendlyApiMessage(payload.message, "账号身份验证失败，请稍后再试"));
  }

  return payload.data;
}

export async function getWebProfile(next: unknown = "/"): Promise<WebProfile> {
  const cookieStore = await cookies();

  if (!cookieStore.get(userAccessCookie) && !cookieStore.get(userRefreshCookie)) {
    return { mode: "GUEST" };
  }

  const fallback = "当前身份加载失败，请稍后再试";
  const response = await profileRequest("/profiles/learner/home", fallback);

  if (response.status === 401) {
    redirect(profileLoginHref(next));
  }

  const payload = await readProfilePayload<LearnerHome>(response, fallback);

  if (response.status === 403 && payload.message === "请先选择使用身份") {
    return { mode: "UNSELECTED" };
  }
  if (response.status === 403 && payload.message === "请使用学习者身份访问学习首页") {
    return { mode: "ACCOUNT" };
  }
  if (!response.ok || payload.code !== 0 || !isLearnerHome(payload.data)) {
    throw new Error(friendlyApiMessage(payload.message, fallback));
  }

  return { mode: "LEARNER", home: payload.data };
}

export async function requireLearnerProfile(next: unknown = "/learn") {
  const profile = await getWebProfile(next);

  if (profile.mode === "LEARNER") {
    return profile.home;
  }
  if (profile.mode === "ACCOUNT") {
    redirect("/dashboard");
  }
  if (profile.mode === "UNSELECTED") {
    redirect(profileSelectionHref(next));
  }

  redirect(profileLoginHref(next));
}

export async function getLearnerStatistics(): Promise<LearnerStatistics> {
  const fallback = "学习情况加载失败，请稍后再试";
  const statistics = await getProfileData<LearnerStatistics>(
    "/profiles/learner/statistics",
    fallback,
    "/learn/center"
  );

  if (!isLearnerStatistics(statistics)) {
    throw new Error(fallback);
  }

  return statistics;
}

export async function guardLearnerScenarioEntry(path: string) {
  const profile = await getWebProfile(path);
  const decision = learnerEntryDecision(
    profile.mode,
    path,
    profile.mode === "LEARNER" ? profile.home.scenarios.map((scenario) => scenario.slug) : []
  );

  if (decision === "SELECT") {
    redirect(profileSelectionHref(path));
  }
  if (decision === "DENY") {
    redirect(`/learn?error=${encodeURIComponent("当前学习者未获得此应用授权")}`);
  }

  return profile;
}

export async function getLearners(): Promise<ProfileSelectionLearner[]> {
  return getProfileData("/profiles/learners", "学习者列表加载失败，请稍后再试");
}

export async function getLearnerAuthorizationOptions(): Promise<LearnerAuthorizationOptions> {
  return getProfileData("/profiles/authorization-options", "可用内容加载失败，请稍后再试");
}

export async function getLearnerAuthorizations(learnerId: string): Promise<LearnerAuthorizations> {
  return getProfileData(
    `/profiles/learners/${encodeURIComponent(learnerId)}/authorizations`,
    "学习者授权加载失败，请稍后再试"
  );
}

export async function createLearnerAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  if (formData.get("canCreate") === "false") {
    return { error: "请先设置主账号登录密码" };
  }

  const validation = validateLearnerFields(
    formData,
    formData.get("requiresSwitchPassword") !== "false"
  );

  if (validation.error) {
    return { error: validation.error };
  }

  return mutateProfile(
    "/profiles/learners",
    {
      method: "POST",
      body: JSON.stringify({
        ...validation.data,
        scenarioIds: formData.getAll("scenarioIds").map(String),
        courseIds: formData.getAll("courseIds").map(String)
      })
    },
    "学习者已添加",
    "学习者添加失败，请稍后再试"
  );
}

export async function updateLearnerAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  const learnerId = String(formData.get("learnerId") ?? "").trim();
  const validation = validateLearnerFields(formData, false);

  if (!learnerId) {
    return { error: "请选择学习者" };
  }
  if (validation.error) {
    return { error: validation.error };
  }

  return mutateProfile(
    `/profiles/learners/${encodeURIComponent(learnerId)}`,
    { method: "PATCH", body: JSON.stringify(validation.data) },
    "学习者资料已保存",
    "学习者资料保存失败，请稍后再试"
  );
}

export async function uploadLearnerAvatarAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  const learnerId = String(formData.get("learnerId") ?? "").trim();
  const file = formData.get("file");

  if (!learnerId) {
    return { error: "请选择学习者" };
  }
  if (!(file instanceof File) || file.size <= 0) {
    return { error: "请选择头像图片" };
  }

  const upload = new FormData();
  upload.set("file", file);
  return mutateProfile(
    `/profiles/learners/${encodeURIComponent(learnerId)}/avatar`,
    { method: "PATCH", body: upload },
    "头像已更新",
    "头像上传失败，请稍后再试"
  );
}

export async function updateCurrentLearnerAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  const nickname = String(formData.get("nickname") ?? "").trim();

  if (Array.from(nickname).length < 1) {
    return { error: "请输入学习者昵称" };
  }
  if (Array.from(nickname).length > 30) {
    return { error: "昵称不能超过 30 个字符" };
  }

  return mutateProfile(
    "/profiles/learner/me",
    { method: "PATCH", body: JSON.stringify({ nickname }) },
    "昵称已更新",
    "昵称更新失败，请稍后再试",
    "/learn/center"
  );
}

export async function uploadCurrentLearnerAvatarAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  const file = formData.get("file");

  if (!(file instanceof File) || file.size <= 0) {
    return { error: "请选择头像图片" };
  }

  const upload = new FormData();
  upload.set("file", file);
  return mutateProfile(
    "/profiles/learner/me/avatar",
    { method: "PATCH", body: upload },
    "头像已更新",
    "头像上传失败，请稍后再试",
    "/learn/center"
  );
}

export async function replaceLearnerAuthorizationsAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  const learnerId = String(formData.get("learnerId") ?? "").trim();

  if (!learnerId) {
    return { error: "请选择学习者" };
  }

  return mutateProfile(
    `/profiles/learners/${encodeURIComponent(learnerId)}/authorizations`,
    {
      method: "PUT",
      body: JSON.stringify({
        scenarioIds: formData.getAll("scenarioIds").map(String),
        courseIds: formData.getAll("courseIds").map(String)
      })
    },
    "可用内容已保存",
    "可用内容保存失败，请稍后再试"
  );
}

export async function deactivateLearnerAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";
  return learnerStatusAction(formData, "deactivate", "学习者已停用", "学习者停用失败，请稍后再试");
}

export async function restoreLearnerAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";
  return learnerStatusAction(formData, "restore", "学习者已恢复", "学习者恢复失败，请稍后再试");
}

export async function updateSwitchPasswordAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const switchPassword = String(formData.get("switchPassword") ?? "");

  if (!currentPassword) {
    return { error: "请输入主账号登录密码" };
  }
  if (!/^\d{6}$/u.test(switchPassword)) {
    return { error: "切换密码必须为 6 位数字" };
  }

  return mutateProfile(
    "/profiles/switch-password",
    { method: "PATCH", body: JSON.stringify({ currentPassword, switchPassword }) },
    "切换密码已更新",
    "切换密码更新失败，请稍后再试"
  );
}

export async function selectProfileAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  const target = String(formData.get("target") ?? "") as SelectableProfileMode;
  const learnerId = String(formData.get("learnerId") ?? "").trim();
  const next = formData.get("next");

  if (target !== "ACCOUNT" && target !== "LEARNER") {
    return { error: "身份类型不正确" };
  }
  if ((target === "LEARNER" && !learnerId) || (target === "ACCOUNT" && learnerId)) {
    return { error: target === "LEARNER" ? "请选择学习者" : "账号身份不能指定学习者" };
  }

  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}/profiles/select`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await getCookieHeader()
      },
      body: JSON.stringify({ mode: target, learnerId: target === "LEARNER" ? learnerId : undefined }),
      cache: "no-store"
    });
  } catch {
    return { error: "身份选择失败，请稍后再试" };
  }

  if (response.status === 401) {
    redirect(profileLoginHref(next));
  }

  let payload: ApiResponse<unknown>;

  try {
    payload = (await response.json()) as ApiResponse<unknown>;
  } catch {
    return { error: "身份选择失败，请稍后再试" };
  }

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    return { error: friendlyApiMessage(payload.message, "身份选择失败，请稍后再试") };
  }

  try {
    await applyProfileTransitionSetCookies(response.headers);
  } catch {
    return { error: "身份选择失败，请稍后再试" };
  }

  revalidatePath("/", "layout");
  const authorizedEntryPaths = target === "LEARNER" ? await selectedLearnerEntryPaths() : [];
  redirect(selectionDestination(target, next, authorizedEntryPaths));
}

export async function enterLearnerAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  const learnerId = String(formData.get("learnerId") ?? "").trim();

  if (!learnerId) {
    return { error: "请选择学习者" };
  }

  return transitionProfile(
    "/profiles/enter-learner",
    { learnerId },
    "学习者进入失败，请稍后再试",
    "/learn"
  );
}

export async function switchLearnerAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  const learnerId = String(formData.get("learnerId") ?? "").trim();
  const switchPassword = String(formData.get("switchPassword") ?? "");

  if (!learnerId) {
    return { error: "请选择学习者" };
  }
  if (!/^\d{6}$/u.test(switchPassword)) {
    return { error: "切换密码必须为 6 位数字" };
  }

  return transitionProfile(
    "/profiles/switch-learner",
    { learnerId, switchPassword },
    "学习者切换失败，请稍后再试",
    "/learn"
  );
}

export async function returnToAccountAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  "use server";

  const password = String(formData.get("password") ?? "");

  if (!password) {
    return { error: "请输入主账号登录密码" };
  }

  return transitionProfile(
    "/profiles/return-account",
    { password },
    "返回我的账号失败，请稍后再试",
    "/dashboard"
  );
}

export async function applyProfileContextSetCookie(headers: SetCookieHeaders) {
  const parsed = parseProfileContextSetCookie(headers);
  const cookieStore: CookieWriter = await cookies();

  setParsedCookie(cookieStore, profileContextCookie, parsed);
}

export async function applyProfileTransitionSetCookies(headers: SetCookieHeaders) {
  const profile = parseSecureSetCookie(headers, profileContextCookie);
  const access = parseSecureSetCookie(headers, userAccessCookie);
  const cookieStore: CookieWriter = await cookies();

  setParsedCookie(cookieStore, profileContextCookie, profile);
  setParsedCookie(cookieStore, userAccessCookie, access);
}

function setParsedCookie(
  cookieStore: CookieWriter,
  name: string,
  parsed: ParsedProfileCookie
) {
  cookieStore.set(name, parsed.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: parsed.maxAge
  });
}

export function parseProfileContextSetCookie(headers: SetCookieHeaders): ParsedProfileCookie {
  return parseSecureSetCookie(headers, profileContextCookie);
}

function parseSecureSetCookie(
  headers: SetCookieHeaders,
  expectedName: string
): ParsedProfileCookie {
  const rawValues =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter((value): value is string => Boolean(value));
  const values = rawValues.flatMap(splitSetCookieHeader);
  const profileValues = values.filter((value) => setCookieName(value) === expectedName);

  if (profileValues.length !== 1) {
    throw new Error("身份 Cookie 响应不明确");
  }

  const header = profileValues[0]!;

  if (!header || hasControlCharacters(header)) {
    throw new Error("身份 Cookie 包含非法字符");
  }

  const parts = header.split(";").map((part) => part.trim());
  const cookiePair = parts.shift() ?? "";
  const separator = cookiePair.indexOf("=");
  const name = separator >= 0 ? cookiePair.slice(0, separator) : "";
  const value = separator >= 0 ? cookiePair.slice(separator + 1) : "";

  if (name !== expectedName || !value || !safeCookieValue.test(value)) {
    throw new Error("身份 Cookie 名称或内容不正确");
  }

  const attributes = new Map<string, string | null>();

  for (const part of parts) {
    if (!part) {
      throw new Error("身份 Cookie 属性不正确");
    }

    const attributeSeparator = part.indexOf("=");
    const attributeName = (attributeSeparator < 0 ? part : part.slice(0, attributeSeparator)).toLowerCase();
    const attributeValue = attributeSeparator < 0 ? null : part.slice(attributeSeparator + 1);

    if (!attributeName || attributes.has(attributeName)) {
      throw new Error("身份 Cookie 属性重复或缺失");
    }
    attributes.set(attributeName, attributeValue);
  }

  if (
    attributes.get("httponly") !== null ||
    attributes.get("samesite")?.toLowerCase() !== "lax" ||
    attributes.get("path") !== "/"
  ) {
    throw new Error("身份 Cookie 安全属性不正确");
  }

  const maxAgeValue = attributes.get("max-age");

  if (typeof maxAgeValue !== "string" || !/^[0-9]+$/u.test(maxAgeValue)) {
    throw new Error("身份 Cookie Max-Age 不正确");
  }

  const maxAge = Number(maxAgeValue);

  if (!Number.isSafeInteger(maxAge) || maxAge <= 0) {
    throw new Error("身份 Cookie Max-Age 不正确");
  }

  return { value, maxAge };
}

function splitSetCookieHeader(value: string) {
  return value
    .split(/,(?=\s*[^=;,\s]+=)/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setCookieName(value: string) {
  const cookiePair = value.split(";", 1)[0]?.trim() ?? "";
  const separator = cookiePair.indexOf("=");

  return separator > 0 ? cookiePair.slice(0, separator).trim() : "";
}

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function friendlyApiMessage(message: unknown, fallback: string) {
  return typeof message === "string" &&
    /[\u3400-\u9fff]/u.test(message) &&
    !/(?:internal server error|jwt|prisma|sql|stack|trace|constraint)/iu.test(message)
    ? message
    : fallback;
}

function isLearnerHome(value: LearnerHome | null): value is LearnerHome {
  return Boolean(
    value
    && typeof value.learner?.id === "string"
    && typeof value.learner.nickname === "string"
    && typeof value.learner.gradeLabel === "string"
    && Array.isArray(value.scenarios)
    && Array.isArray(value.courses)
    && Array.isArray(value.recentRecords)
  );
}

function isLearnerStatistics(value: LearnerStatistics | null): value is LearnerStatistics {
  return Boolean(
    value
    && typeof value.completedActivityCount === "number"
    && typeof value.recentCompletedActivityCount === "number"
    && (value.lastActivityAt === null || typeof value.lastActivityAt === "string")
  );
}

async function selectedLearnerEntryPaths() {
  const fallback = "学习者授权加载失败";

  try {
    const response = await profileRequest("/profiles/learner/home", fallback);
    const payload = await readProfilePayload<LearnerHome>(response, fallback);

    if (!response.ok || payload.code !== 0 || !isLearnerHome(payload.data)) {
      return [];
    }

    return payload.data.scenarios.map((scenario) => learnerScenarioHref(scenario.slug));
  } catch {
    return [];
  }
}

async function profileRequest(path: string, fallback: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Cookie", await getCookieHeader());

  try {
    return await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new Error(fallback);
  }
}

async function readProfilePayload<TData>(response: Response, fallback: string) {
  try {
    return (await response.json()) as ApiResponse<TData>;
  } catch {
    throw new Error(fallback);
  }
}

async function getProfileData<TData>(path: string, fallback: string, loginNext = learnerManagementPath): Promise<TData> {
  const response = await profileRequest(path, fallback);

  if (response.status === 401) {
    redirect(profileLoginHref(loginNext));
  }

  const payload = await readProfilePayload<TData>(response, fallback);

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(friendlyApiMessage(payload.message, fallback));
  }

  return payload.data;
}

async function mutateProfile(
  path: string,
  init: RequestInit,
  success: string,
  fallback: string,
  loginNext = learnerManagementPath
): Promise<ProfileActionState> {
  let response: Response;

  try {
    response = await profileRequest(path, fallback, init);
  } catch {
    return { error: fallback };
  }

  if (response.status === 401) {
    redirect(profileLoginHref(loginNext));
  }

  let payload: ApiResponse<unknown>;

  try {
    payload = await readProfilePayload(response, fallback);
  } catch {
    return { error: fallback };
  }

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    return { error: friendlyApiMessage(payload.message, fallback) };
  }

  revalidateLearnerPaths();
  return { success };
}

async function transitionProfile(
  path: string,
  body: Record<string, string>,
  fallback: string,
  destination: "/dashboard" | "/learn"
): Promise<ProfileActionState> {
  let response: Response;

  try {
    response = await profileRequest(path, fallback, {
      method: "POST",
      body: JSON.stringify(body)
    });
  } catch {
    return { error: fallback };
  }

  if (response.status === 401) {
    redirect(profileLoginHref(destination));
  }

  let payload: ApiResponse<unknown>;

  try {
    payload = await readProfilePayload(response, fallback);
  } catch {
    return { error: fallback };
  }

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    return { error: friendlyApiMessage(payload.message, fallback) };
  }

  try {
    await applyProfileTransitionSetCookies(response.headers);
  } catch {
    return { error: fallback };
  }

  revalidatePath("/", "layout");
  revalidatePath("/learn");
  redirect(destination);
}

async function learnerStatusAction(
  formData: FormData,
  action: "deactivate" | "restore",
  success: string,
  fallback: string
) {
  const learnerId = String(formData.get("learnerId") ?? "").trim();

  if (!learnerId) {
    return { error: "请选择学习者" };
  }

  return mutateProfile(
    `/profiles/learners/${encodeURIComponent(learnerId)}/${action}`,
    { method: "POST" },
    success,
    fallback
  );
}

function validateLearnerFields(formData: FormData, requireSwitchPassword: boolean) {
  const nickname = String(formData.get("nickname") ?? "").trim();
  const grade = String(formData.get("grade") ?? "");
  const switchPassword = String(formData.get("switchPassword") ?? "");

  if (Array.from(nickname).length < 1) {
    return { error: "请输入学习者昵称" } as const;
  }
  if (Array.from(nickname).length > 30) {
    return { error: "昵称不能超过 30 个字符" } as const;
  }
  if (!learnerGradeValues.has(grade)) {
    return { error: "请选择正确的学段" } as const;
  }
  if (requireSwitchPassword && !/^\d{6}$/u.test(switchPassword)) {
    return { error: "切换密码必须为 6 位数字" } as const;
  }

  return {
    data: {
      nickname,
      grade,
      ...(requireSwitchPassword ? { switchPassword } : {})
    }
  } as const;
}

function revalidateLearnerPaths() {
  revalidatePath("/dashboard/learners");
  revalidatePath("/dashboard/learners/data");
  revalidatePath("/dashboard/learners/resources");
  revalidatePath("/dashboard/learners/apps");
  revalidatePath("/select-profile");
  revalidatePath("/learn");
  revalidatePath("/learn/center");
}

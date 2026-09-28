"use server";

import { isIP } from "node:net";
import { cookies, headers as requestHeaders } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { forgotPasswordLoginHref, passwordConfirmationError } from "@/lib/email-auth";
import {
  normalizeSafeNextPath,
  profileLoginHref,
  profileSelectionHref
} from "@/lib/profile-routing";
import { applyProfileContextSetCookie } from "@/lib/profile-api";

export interface AuthActionState {
  error?: string;
  expiresIn?: number;
  method?: "EMAIL" | "PHONE";
  resetToken?: string;
  success?: string;
}

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

interface ProfileSelectionSummary {
  learners: Array<{ status: string }>;
}

export interface PublicUser {
  id: string;
  accountId: string;
  email: string;
  phone: string | null;
  phoneVerifiedAt: string | null;
  nickname: string;
  avatarUrl: string | null;
  status: string;
}

export interface PublicAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

const userAccessCookie = "xueleai_user_access";
const userRefreshCookie = "xueleai_user_refresh";
const adminAccessCookie = "xueleai_admin_access";
const adminRefreshCookie = "xueleai_admin_refresh";
const profileContextCookie = "xueleai_profile_context";
const resetPasswordEmailCodeMessage = "如果邮箱已注册，验证码将发送至该邮箱";

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

async function getTrustedIngressClientIp() {
  const incomingHeaders = await requestHeaders();
  const realIp = incomingHeaders.get("x-real-ip")?.trim() ?? "";

  if (isIP(realIp)) {
    return realIp;
  }

  const forwardedFor = incomingHeaders.get("x-forwarded-for");
  const ingressPeer = forwardedFor?.split(",").at(-1)?.trim() ?? "";

  return isIP(ingressPeer) ? ingressPeer : null;
}

async function getAuthJsonHeaders() {
  const result = new Headers({ "Content-Type": "application/json" });
  const clientIp = await getTrustedIngressClientIp();

  if (clientIp) {
    result.set("X-Forwarded-For", clientIp);
  }

  return result;
}

async function postJson<TData>(path: string, body: Record<string, string>) {
  const authHeaders = await getAuthJsonHeaders();
  if (path === "/auth/register" || path === "/auth/phone-login") authHeaders.set("Cookie", await getCookieHeader());
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<TData | null>;

  if (!response.ok || payload.code !== 0 || !payload.data) {
    return {
      ok: false as const,
      message: payload.message || "请求失败"
    };
  }

  return {
    ok: true as const,
    data: payload.data
  };
}

async function apiFetch<TData>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

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

function safeNextPath(value: FormDataEntryValue | string | null, fallback = "/dashboard") {
  return normalizeSafeNextPath(value) ?? fallback;
}

async function setSessionCookies(
  accessCookieName: string,
  refreshCookieName: string,
  tokens: AuthTokens
) {
  const cookieStore = await cookies();
  const baseOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(),
    path: "/"
  };

  cookieStore.set(accessCookieName, tokens.accessToken, {
    ...baseOptions,
    maxAge: tokens.accessTokenExpiresIn
  });
  cookieStore.set(refreshCookieName, tokens.refreshToken, {
    ...baseOptions,
    maxAge: tokens.refreshTokenExpiresIn
  });
}

async function clearSessionCookies(accessCookieName: string, refreshCookieName: string) {
  const cookieStore = await cookies();
  cookieStore.delete(accessCookieName);
  cookieStore.delete(refreshCookieName);
}

async function setUserSessionCookies(tokens: AuthTokens) {
  await setSessionCookies(userAccessCookie, userRefreshCookie, tokens);
  const cookieStore = await cookies();
  cookieStore.delete(profileContextCookie);
}

async function continueAfterUserAuthentication(next: string): Promise<never> {
  let selection: ProfileSelectionSummary;

  try {
    selection = await apiFetch<ProfileSelectionSummary>("/profiles/selection");
  } catch {
    redirect(profileSelectionHref(next));
  }

  if (selection.learners.some((learner) => learner.status === "ACTIVE")) {
    redirect(profileSelectionHref(next));
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/profiles/select`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await getCookieHeader()
      },
      body: JSON.stringify({ mode: "ACCOUNT" }),
      cache: "no-store"
    });
    const payload = (await response.json()) as ApiResponse<unknown>;

    if (!response.ok || payload.code !== 0 || payload.data === null) {
      redirect(profileSelectionHref(next));
    }

    await applyProfileContextSetCookie(response.headers);
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    redirect(profileSelectionHref(next));
  }

  revalidatePath("/", "layout");
  redirect(next);
}

function isNextRedirect(error: unknown) {
  return error instanceof Error && error.message === "NEXT_REDIRECT";
}

export async function userLoginAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"), "/");

  let result: Awaited<ReturnType<typeof postJson<AuthTokens>>>;

  try {
    result = await postJson<AuthTokens>("/auth/login", { email, password });
  } catch {
    return { error: "认证服务暂不可用，请稍后再试" };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  await setUserSessionCookies(result.data);
  revalidatePath("/", "layout");
  return continueAfterUserAuthentication(next);
}

export async function learnerLoginAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const accountId = String(formData.get("accountId") ?? "").trim();
  const learnerId = String(formData.get("learnerId") ?? "").trim();
  const switchPassword = String(formData.get("switchPassword") ?? "");
  const next = safeNextPath(formData.get("next"), "/learn");

  if (
    !/^[1-9]\d{4,9}$/u.test(accountId) ||
    Number(accountId) > 2_147_483_647 ||
    !/^\d{3}$/u.test(learnerId) ||
    !/^\d{6}$/u.test(switchPassword)
  ) {
    return { error: "请输入正确的主账号 ID、子账号 ID 和 6 位切换密码" };
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/learner-login`, {
      method: "POST",
      headers: await getAuthJsonHeaders(),
      body: JSON.stringify({ accountId, learnerId, switchPassword }),
      cache: "no-store"
    });
    const payload = (await response.json()) as ApiResponse<AuthTokens | null>;

    if (!response.ok || payload.code !== 0 || !payload.data) {
      return {
        error: payload.message === "主账号 ID、子账号 ID 或切换密码错误"
          ? payload.message
          : "学习账号登录失败，请稍后再试"
      };
    }

    await setUserSessionCookies(payload.data);
    await applyProfileContextSetCookie(response.headers);
  } catch {
    await clearSessionCookies(userAccessCookie, userRefreshCookie);
    (await cookies()).delete(profileContextCookie);
    return { error: "学习账号登录失败，请稍后再试" };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function registerAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const nickname = String(formData.get("nickname") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const emailCode = String(formData.get("emailCode") ?? "").trim();
  const next = safeNextPath(formData.get("next"), "/");

  let result: Awaited<ReturnType<typeof postJson<AuthTokens>>>;

  try {
    result = await postJson<AuthTokens>("/auth/register", {
      nickname,
      email,
      password,
      emailCode
    });
  } catch {
    return { error: "认证服务暂不可用，请稍后再试" };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  await setUserSessionCookies(result.data);
  revalidatePath("/", "layout");
  return continueAfterUserAuthentication(next);
}

export async function sendRegisterEmailCodeAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();

  try {
    const result = await postJson<{ message: string }>("/auth/email-code", {
      email,
      purpose: "REGISTER"
    });

    if (!result.ok) {
      return { error: result.message };
    }

    return { success: resetPasswordEmailCodeMessage };
  } catch {
    return { error: "邮箱验证码服务暂不可用，请联系管理员" };
  }
}

export async function sendLoginPhoneCodeAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "LOGIN") || "LOGIN";

  try {
    const result = await postJson<{ message: string }>("/auth/phone-code", {
      phone,
      purpose
    });

    if (!result.ok) {
      return { error: result.message };
    }

    return { success: result.data.message || "验证码已发送" };
  } catch {
    return { error: "短信服务暂不可用，请稍后再试" };
  }
}

export async function phoneLoginAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const next = safeNextPath(formData.get("next"), "/");

  let result: Awaited<ReturnType<typeof postJson<AuthTokens>>>;

  try {
    result = await postJson<AuthTokens>("/auth/phone-login", { phone, code, nickname });
  } catch {
    return { error: "认证服务暂不可用，请稍后再试" };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  await setUserSessionCookies(result.data);
  revalidatePath("/", "layout");
  return continueAfterUserAuthentication(next);
}

export async function sendResetPasswordEmailCodeAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();

  try {
    const result = await postJson<{ message: string }>("/auth/email-code", {
      email,
      purpose: "RESET_PASSWORD"
    });

    if (!result.ok) {
      return { error: result.message };
    }

    return { success: result.data.message || "验证码已发送" };
  } catch {
    return { error: "邮箱验证码服务暂不可用，请联系管理员" };
  }
}

export async function sendResetPasswordPhoneCodeAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const phone = String(formData.get("phone") ?? "").trim();

  try {
    const result = await postJson<{ message: string }>("/auth/phone-code", {
      phone,
      purpose: "RESET_PASSWORD"
    });

    if (!result.ok) {
      return { error: result.message };
    }

    return { success: result.data.message || "验证码已发送" };
  } catch {
    return { error: "短信服务暂不可用，请稍后再试" };
  }
}

export async function verifyPasswordResetCodeAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const method = String(formData.get("method") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (method !== "EMAIL" && method !== "PHONE") {
    return { error: "请选择验证方式" };
  }

  try {
    const result = await postJson<{
      expiresIn: number;
      method: "EMAIL" | "PHONE";
      message: string;
      resetToken: string;
    }>("/auth/password-reset/verify-code", {
      method,
      email,
      phone,
      code
    });

    if (!result.ok) {
      return { error: result.message };
    }

    return {
      expiresIn: result.data.expiresIn,
      method: result.data.method,
      resetToken: result.data.resetToken,
      success: result.data.message || "验证通过"
    };
  } catch {
    return { error: "验证码验证失败，请稍后再试" };
  }
}

export async function resetPasswordWithTokenAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const resetToken = String(formData.get("resetToken") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const confirmationError = passwordConfirmationError(password, confirmPassword, 6);

  if (confirmationError) {
    return { error: confirmationError };
  }

  try {
    const result = await postJson<{ message: string }>("/auth/password-reset/confirm", {
      resetToken,
      password
    });

    if (!result.ok) {
      return { error: result.message };
    }

    await clearSessionCookies(userAccessCookie, userRefreshCookie);
    revalidatePath("/", "layout");
    revalidatePath("/dashboard");
    return { success: result.data.message || "密码已重置，请重新登录" };
  } catch {
    return { error: "密码重置失败，请稍后再试" };
  }
}

export async function resetPasswordAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const emailCode = String(formData.get("emailCode") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const next = safeNextPath(formData.get("next"), "");
  const confirmationError = passwordConfirmationError(password, confirmPassword);

  if (confirmationError) {
    return { error: confirmationError };
  }

  let result: Awaited<ReturnType<typeof postJson<{ message: string }>>>;

  try {
    result = await postJson<{ message: string }>("/auth/reset-password", {
      email,
      emailCode,
      password
    });
  } catch {
    return { error: "认证服务暂不可用，请稍后再试" };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  await clearSessionCookies(userAccessCookie, userRefreshCookie);
  revalidatePath("/", "layout");
  revalidatePath("/login");
  redirect(forgotPasswordLoginHref(next));
}

export async function getCurrentUser(next?: unknown) {
  try {
    return await apiFetch<PublicUser>("/auth/me");
  } catch {
    redirect(profileLoginHref(next));
  }
}

export async function getOptionalCurrentUser() {
  try {
    return await apiFetch<PublicUser>("/auth/me");
  } catch {
    return null;
  }
}

export async function getCurrentAdmin() {
  try {
    return await apiFetch<PublicAdmin>("/admin-auth/me");
  } catch {
    redirect("/admin/login");
  }
}

export async function updateProfileAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const nickname = String(formData.get("nickname") ?? "").trim();

  try {
    await apiFetch<PublicUser>("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({
        nickname
      })
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "资料保存失败" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  return { success: "资料已保存" };
}

export async function uploadAvatarAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size <= 0) {
    return { error: "请选择头像图片" };
  }

  try {
    await apiFetch<PublicUser>("/auth/avatar", {
      method: "PATCH",
      body: formData
    });
    revalidatePath("/", "layout");
    revalidatePath("/dashboard/profile");

    return { success: "头像已更新。" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "头像上传失败，请稍后再试" };
  }
}

export async function verifyPasswordAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");

  try {
    await apiFetch<{ message: string }>("/auth/verify-password", {
      method: "POST",
      body: JSON.stringify({
        password
      })
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "登录密码验证失败" };
  }

  return { success: "验证通过" };
}

export async function sendChangeEmailCodeAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();

  try {
    const result = await apiFetch<{ message: string }>("/auth/email-change-code", {
      method: "POST",
      body: JSON.stringify({
        email
      })
    });

    return { success: result.message || "验证码已发送" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "验证码发送失败" };
  }
}

export async function changeEmailAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const emailCode = String(formData.get("emailCode") ?? "").trim();

  try {
    await apiFetch<PublicUser>("/auth/email", {
      method: "PATCH",
      body: JSON.stringify({
        email,
        currentPassword,
        emailCode
      })
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "邮箱更换失败" };
  }

  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  return { success: "邮箱已更换" };
}

export async function sendBindPhoneCodeAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const phone = String(formData.get("phone") ?? "").trim();

  try {
    const result = await apiFetch<{ message: string }>("/auth/phone-code", {
      method: "POST",
      body: JSON.stringify({
        phone,
        purpose: "BIND_PHONE"
      })
    });

    return { success: result.message || "验证码已发送" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "验证码发送失败" };
  }
}

export async function bindPhoneAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  try {
    await apiFetch<PublicUser>("/auth/phone", {
      method: "PATCH",
      body: JSON.stringify({
        phone,
        currentPassword,
        code
      })
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "手机号绑定失败" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  return { success: "手机号已绑定" };
}

export async function changePasswordAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirmPassword) {
    return { error: "两次输入的新密码不一致" };
  }

  if (newPassword.length < 6) {
    return { error: "新密码至少 6 位" };
  }

  try {
    await apiFetch("/auth/password", {
      method: "PATCH",
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "密码修改失败" };
  }

  return { success: "密码已修改，下次登录请使用新密码" };
}

export async function userLogoutAction() {
  try {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({})
    });
  } catch {
    return;
  }

  return completeUserLogout();
}

export async function learnerLogoutAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const switchPassword = String(formData.get("switchPassword") ?? "");

  if (!/^\d{6}$/u.test(switchPassword)) {
    return { error: "切换密码必须为 6 位数字" };
  }

  try {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ switchPassword })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "退出登录失败，请稍后再试";
    return {
      error: learnerLogoutErrorMessage(message)
    };
  }

  return completeUserLogout();
}

function learnerLogoutErrorMessage(message: string) {
  const publicMessages = new Set([
    "请输入 6 位切换密码",
    "切换密码必须为 6 位数字",
    "切换密码错误",
    "登录状态已失效，请重新登录"
  ]);

  return publicMessages.has(message) ? message : "退出登录失败，请稍后再试";
}

async function completeUserLogout(): Promise<never> {
  const cookieStore = await cookies();

  await clearSessionCookies(userAccessCookie, userRefreshCookie);
  cookieStore.delete(profileContextCookie);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function adminLoginAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  let result: Awaited<ReturnType<typeof postJson<AuthTokens>>>;

  try {
    result = await postJson<AuthTokens>("/admin-auth/login", { email, password });
  } catch {
    return { error: "认证服务暂不可用，请稍后再试" };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  await setSessionCookies(adminAccessCookie, adminRefreshCookie, result.data);
  redirect("/admin");
}

export async function adminLogoutAction() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(adminAccessCookie)?.value;
  const refreshToken = cookieStore.get(adminRefreshCookie)?.value;

  try {
    await fetch(`${getApiBaseUrl()}/admin-auth/logout`, {
      method: "POST",
      headers: {
        Cookie: `${adminAccessCookie}=${accessToken ?? ""}; ${adminRefreshCookie}=${refreshToken ?? ""}`
      },
      cache: "no-store"
    });
  } catch {
    // 本地 cookie 仍会清理，避免管理员卡在已登录状态。
  }

  await clearSessionCookies(adminAccessCookie, adminRefreshCookie);
  redirect("/admin/login");
}

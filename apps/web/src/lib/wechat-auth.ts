import { normalizeSafeNextPath } from "./profile-routing";
export interface WechatChallenge {
  challengeId: string;
  qrcodeUrl: string;
  expiresAt: number;
}
export interface WechatScanState {
  status: "WAITING" | "SCANNED" | "CONFIRMED" | "CONSUMED" | "CANCELLED";
  expiresAt: number;
  confirmationCode?: string;
}
export type WechatCompletion =
  | { status: "AUTHENTICATED"; next: string }
  | { status: "NEEDS_ACCOUNT_RESOLUTION" };
export class WechatScanClient {
  private csrf: string | null = null;
  registrationEnabled = false;
  constructor(
    private readonly request: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}
  private async json<T>(
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.method && init.method !== "GET") {
      if (!this.csrf) throw new Error("请刷新二维码后重试");
      headers.set("x-wechat-csrf", this.csrf);
      headers.set("Content-Type", "application/json");
    }
    const bounded = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000);
    let response: Response;
    try {
      response = await this.request("/api/auth/wechat/mp" + path, {
        ...init,
        headers,
        signal: bounded,
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error("网络连接异常，请稍后重试", { cause: error });
    }
    const payload = (await response.json().catch(() => null)) as {
      code: number;
      message?: string;
      data: T | null;
    } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data == null)
      throw new Error(payload?.message || "登录请求失败，请稍后重试");
    return payload.data;
  }
  async start(next?: string, signal?: AbortSignal) {
    const bootstrap = await this.json<{
      csrfToken: string;
      registrationEnabled?: boolean;
    }>("/bootstrap", {}, signal);
    if (typeof bootstrap.csrfToken !== "string" || !bootstrap.csrfToken)
      throw new Error("登录状态异常，请刷新页面");
    this.csrf = bootstrap.csrfToken;
    this.registrationEnabled = bootstrap.registrationEnabled === true;
    const challenge = await this.json<WechatChallenge>(
      "/challenges",
      {
        method: "POST",
        body: JSON.stringify({ next: normalizeSafeNextPath(next) ?? "/" }),
      },
      signal,
    );
    let valid: boolean;
    try {
      const image = new URL(challenge.qrcodeUrl);
      valid =
        image.protocol === "https:" &&
        image.hostname === "mp.weixin.qq.com" &&
        image.pathname === "/cgi-bin/showqrcode";
    } catch {
      valid = false;
    }
    if (
      !valid ||
      !Number.isFinite(challenge.expiresAt) ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(challenge.challengeId)
    )
      throw new Error("二维码获取失败，请重新尝试");
    return challenge;
  }
  async poll(id: string, signal?: AbortSignal) {
    const result = await this.json<WechatScanState>(
      "/challenges/" + encodeURIComponent(id),
      {},
      signal,
    );
    if (
      !["WAITING", "SCANNED", "CONFIRMED", "CONSUMED", "CANCELLED"].includes(
        result.status,
      ) ||
      !Number.isFinite(result.expiresAt) ||
      (result.status === "SCANNED" &&
        !/^\d{6}$/.test(result.confirmationCode ?? ""))
    )
      throw new Error("扫码状态异常，请刷新二维码");
    return result;
  }
  private validCompletion(result: WechatCompletion) {
    if (result.status === "AUTHENTICATED") {
      if (
        typeof result.next !== "string" ||
        normalizeSafeNextPath(result.next) !== result.next ||
        !result.next.startsWith("/select-profile?")
      )
        throw new Error("登录跳转异常，请重新尝试");
    } else if (result.status !== "NEEDS_ACCOUNT_RESOLUTION")
      throw new Error("登录状态异常，请重新尝试");
    return result;
  }
  async complete(id: string, signal?: AbortSignal) {
    return this.validCompletion(
      await this.json<WechatCompletion>(
        "/challenges/" + encodeURIComponent(id) + "/complete",
        { method: "POST", body: "{}" },
        signal,
      ),
    );
  }
  async cancel(id: string) {
    await this.json("/challenges/" + encodeURIComponent(id), {
      method: "DELETE",
    });
  }
  async sendPhoneCode(phone: string) {
    return this.json<{ expiresIn: number; message: string }>(
      "/resolution/phone-code",
      { method: "POST", body: JSON.stringify({ phone }) },
    );
  }
  async resolvePhone(phone: string, code: string, action: "BIND" | "CREATE") {
    return this.validCompletion(
      await this.json<WechatCompletion>("/resolution/phone", {
        method: "POST",
        body: JSON.stringify({ phone, code, action }),
      }),
    );
  }
  async resolveEmail(email: string, password: string) {
    return this.validCompletion(
      await this.json<WechatCompletion>("/resolution/email", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    );
  }
}

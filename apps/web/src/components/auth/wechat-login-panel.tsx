"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  WechatScanClient,
  type WechatChallenge,
} from "@/lib/wechat-auth";

type Phase =
  | "PREPARING"
  | "WAITING"
  | "COMPLETING"
  | "RESOLUTION"
  | "EXPIRED"
  | "ERROR";
export function WechatLoginPanel({
  next,
  onBusyChange,
}: {
  next?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("PREPARING"),
    [challenge, setChallenge] = useState<WechatChallenge | null>(null);
  const [error, setError] = useState<string | null>(null),
    [seconds, setSeconds] = useState(180),
    [busy, setBusy] = useState(false),
    [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [countdown, setCountdown] = useState(0),
    [action, setAction] = useState<"BIND" | "CREATE" | null>(null),
    [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [bindingMethod, setBindingMethod] = useState<"PHONE" | "EMAIL">(
      "PHONE",
    ),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const clientRef = useRef<WechatScanClient | null>(null),
    challengeRef = useRef<WechatChallenge | null>(null),
    requestRef = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(() => {
    onBusyChange?.(phase === "COMPLETING" || busy);
  }, [phase, busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  async function start() {
    const current = ++generation.current;
    requestRef.current?.abort();
    const abort = new AbortController();
    requestRef.current = abort;
    const client = new WechatScanClient();
    clientRef.current = client;
    setPhase("PREPARING");
    setError(null);
    setChallenge(null);
    setPhone("");
    setCode("");
    setAction(null);
    setCountdown(0);
    setBindingMethod("PHONE");
    setEmail("");
    setPassword("");
    try {
      const result = await client.start(next, abort.signal);
      if (current !== generation.current) return;
      setRegistrationEnabled(client.registrationEnabled);
      challengeRef.current = result;
      setChallenge(result);
      setPhase("WAITING");
    } catch (cause) {
      if (current === generation.current && !abort.signal.aborted) {
        setError(
          cause instanceof Error ? cause.message : "二维码获取失败，请重试",
        );
        setPhase("ERROR");
      }
    }
  }
  useEffect(() => {
    void start();
    return () => {
      ++generation.current;
      requestRef.current?.abort();
      const current = challengeRef.current;
      if (current && clientRef.current)
        void clientRef.current.cancel(current.challengeId).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!challenge || phase !== "WAITING") return;
    function tick() {
      const remaining = Math.max(
        0,
        Math.ceil((challenge!.expiresAt - Date.now()) / 1000),
      );
      setSeconds(remaining);
      if (!remaining) setPhase("EXPIRED");
    }
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [challenge, phase]);
  useEffect(() => {
    if (!challenge) return;
    let finished = false,
      stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      running = false;
    const id = generation.current,
      client = clientRef.current!,
      abort = new AbortController();
    async function poll() {
      if (finished || stopped || running || id !== generation.current) return;
      if (challenge!.expiresAt <= Date.now()) {
        finished = true;
        setPhase("EXPIRED");
        return;
      }
      if (document.hidden) {
        timer = setTimeout(poll, 2000);
        return;
      }
      running = true;
      try {
        const result = await client.poll(challenge!.challengeId, abort.signal);
        if (stopped || id !== generation.current) return;
        if (result.status === "CANCELLED" || result.status === "CONSUMED") {
          finished = true;
          setPhase("EXPIRED");
          return;
        }
        if (result.status === "CONFIRMED") {
          finished = true;
          setPhase("COMPLETING");
          const completed = await client.complete(
            challenge!.challengeId,
            abort.signal,
          );
          if (stopped || id !== generation.current) return;
          if (completed.status === "AUTHENTICATED")
            window.location.assign(completed.next);
          else setPhase("RESOLUTION");
          return;
        }
        setPhase("WAITING");
      } catch (cause) {
        if (!stopped && id === generation.current) {
          finished = true;
          setError(
            cause instanceof Error
              ? cause.message
              : "扫码状态查询失败，请刷新二维码",
          );
          setPhase("ERROR");
        }
      } finally {
        running = false;
      }
      if (!finished && !stopped && id === generation.current)
        timer = setTimeout(poll, 2000);
    }
    function visible() {
      if (!finished && !document.hidden && !running) {
        if (timer) clearTimeout(timer);
        void poll();
      }
    }
    timer = setTimeout(poll, 500);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      abort.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [challenge]);
  useEffect(() => {
    if (!countdown) return;
    const timer = setTimeout(
      () => setCountdown((x) => Math.max(0, x - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [countdown]);
  async function sendCode() {
    const current = generation.current;
    setBusy(true);
    setError(null);
    try {
      await clientRef.current!.sendPhoneCode(phone);
      if (current !== generation.current) return;
      setCountdown(60);
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof Error ? cause.message : "验证码发送失败");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function resolveAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;
    const current = generation.current;
    setBusy(true);
    setError(null);
    try {
      const result =
        bindingMethod === "EMAIL" && action === "BIND"
          ? await clientRef.current!.resolveEmail(email, password)
          : await clientRef.current!.resolvePhone(phone, code, action);
      if (current !== generation.current) return;
      if (result.status === "AUTHENTICATED")
        window.location.assign(result.next);
    } catch (cause) {
      if (current !== generation.current) return;
      setError(
        cause instanceof Error ? cause.message : "验证未完成，请刷新二维码重试",
      );
      setPhase("ERROR");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <section
      aria-label="微信扫码登录"
    >
      <div aria-live="polite" className="flex flex-col items-center gap-3">
        {phase === "PREPARING" ? (
          <p className="text-sm text-muted-foreground">正在获取二维码…</p>
        ) : null}
        {phase === "WAITING" && challenge ? (
          <>
            <img
              alt="本次微信登录二维码"
              className="size-52 rounded-lg border bg-white p-2"
              src={challenge.qrcodeUrl}
              width={208}
              height={208}
              referrerPolicy="no-referrer"
            />
            <p className="text-sm">微信扫码后自动登录，首次使用请关注公众号</p>
            <p className="text-xs text-muted-foreground">{seconds} 秒后失效</p>
          </>
        ) : null}
        {phase === "COMPLETING" ? (
          <p className="text-sm">扫码成功，正在登录…</p>
        ) : null}
        {phase === "RESOLUTION" ? (
          <form onSubmit={resolveAccount} className="w-full space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">关联账号</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="wechat-account-action"
                  checked={action === "BIND"}
                  onChange={() => setAction("BIND")}
                />
                绑定已有账号
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="wechat-account-action"
                  disabled={!registrationEnabled}
                  checked={action === "CREATE"}
                  onChange={() => {
                    setAction("CREATE");
                    setBindingMethod("PHONE");
                  }}
                />
                创建新账号
                {!registrationEnabled ? (
                  <span className="text-xs text-muted-foreground">
                    暂未开放
                  </span>
                ) : null}
              </label>
            </fieldset>
            {action === "CREATE" ? (
              <p className="text-xs text-muted-foreground">
                已有账号请先绑定，新账号不会带入原有资产。手机号已有账号时将关联原账号。
              </p>
            ) : null}
            {action === "BIND" ? (
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="wechat-binding-method"
                    checked={bindingMethod === "PHONE"}
                    onChange={() => setBindingMethod("PHONE")}
                  />
                  手机号验证
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="wechat-binding-method"
                    checked={bindingMethod === "EMAIL"}
                    onChange={() => setBindingMethod("EMAIL")}
                  />
                  邮箱和密码
                </label>
              </div>
            ) : null}
            {bindingMethod === "EMAIL" && action === "BIND" ? (
              <>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="wechat-binding-email"
                >
                  已有账号邮箱
                </label>
                <Input
                  id="wechat-binding-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                />
                <label
                  className="block text-sm font-semibold"
                  htmlFor="wechat-binding-password"
                >
                  账号密码
                </label>
                <Input
                  id="wechat-binding-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={busy}
                />
              </>
            ) : (
              <>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="wechat-resolution-phone"
                >
                  手机号
                </label>
                <Input
                  id="wechat-resolution-phone"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setCode("");
                  }}
                  maxLength={11}
                  placeholder="请输入手机号"
                  disabled={busy}
                />
                <label
                  className="block text-sm font-semibold"
                  htmlFor="wechat-resolution-code"
                >
                  短信验证码
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                  <Input
                    id="wechat-resolution-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={8}
                    placeholder="请输入验证码"
                    disabled={busy}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void sendCode()}
                    disabled={
                      busy || !/^1[3-9]\d{9}$/.test(phone) || countdown > 0
                    }
                  >
                    {countdown ? `${countdown}秒` : "获取验证码"}
                  </Button>
                </div>
              </>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={
                busy ||
                !action ||
                (bindingMethod === "EMAIL" && action === "BIND"
                  ? !email || !password
                  : !code || !/^1[3-9]\d{9}$/.test(phone))
              }
            >
              {busy
                ? "验证中…"
                : action === "CREATE"
                  ? "验证并创建账号"
                  : "验证并绑定账号"}
            </Button>
          </form>
        ) : null}
        {phase === "EXPIRED" ? (
          <p className="text-sm">二维码已失效，请刷新</p>
        ) : null}
        {error ? (
          <p className="w-full text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {phase === "ERROR" ||
        phase === "EXPIRED" ||
        phase === "WAITING" ? (
          <Button type="button" variant="outline" onClick={() => void start()}>
            刷新二维码
          </Button>
        ) : null}
      </div>
    </section>
  );
}

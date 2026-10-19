"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { ArrowRight, GraduationCap, Mail, Smartphone } from "lucide-react";
import { faWeixin } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  learnerLoginAction,
  phoneLoginAction,
  sendLoginPhoneCodeAction,
  userLoginAction,
  type AuthActionState
} from "@/lib/auth-actions";
import { WechatLoginPanel } from "./wechat-login-panel";

const initialState: AuthActionState = {};

export function UserLoginForm({
  next
}: {
  next?: string;
}) {
  const [mode, setMode] = useState<"wechat" | "email" | "phone" | "learner">("wechat");
  const [phone, setPhone] = useState("");
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [state, formAction, isPending] = useActionState(userLoginAction, initialState);
  const [phoneState, phoneFormAction, isPhonePending] = useActionState(
    phoneLoginAction,
    initialState
  );
  const [learnerState, learnerFormAction, isLearnerPending] = useActionState(
    learnerLoginAction,
    initialState
  );
  const forgotPasswordHref = next
    ? `/forgot-password?next=${encodeURIComponent(next)}`
    : "/forgot-password";
  const [codeState, codeFormAction, isCodePending] = useActionState(
    sendLoginPhoneCodeAction,
    initialState
  );

  useEffect(() => {
    if (codeState.success) {
      setCodeCountdown(60);
    }
  }, [codeState]);

  useEffect(() => {
    if (codeCountdown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCodeCountdown((value) => Math.max(value - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [codeCountdown]);

  return (
    <div className="flex flex-col gap-6">
      <fieldset
        aria-label="登录方式"
        className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 sm:grid-cols-4 [&_button]:min-w-0 [&_button]:gap-1 [&_button]:px-1 [&_button]:text-xs sm:[&_button]:text-sm"
        disabled={isPending || isPhonePending || isLearnerPending}
      >
        <Button
          type="button"
          variant={mode === "wechat" ? "default" : "ghost"}
          aria-pressed={mode === "wechat"}
          onClick={() => setMode("wechat")}
        >
          <FontAwesomeIcon aria-hidden="true" icon={faWeixin} />
          微信登录
        </Button>
        <Button
          type="button"
          variant={mode === "email" ? "default" : "ghost"}
          aria-pressed={mode === "email"}
          onClick={() => setMode("email")}
        >
          <Mail data-icon="inline-start" />
          邮箱登录
        </Button>
        <Button
          type="button"
          variant={mode === "phone" ? "default" : "ghost"}
          aria-pressed={mode === "phone"}
          onClick={() => setMode("phone")}
        >
          <Smartphone data-icon="inline-start" />
          手机登录
        </Button>
        <Button
          type="button"
          variant={mode === "learner" ? "default" : "ghost"}
          aria-pressed={mode === "learner"}
          onClick={() => setMode("learner")}
        >
          <GraduationCap data-icon="inline-start" />
          学习账号
        </Button>
      </fieldset>

      <div className="h-[320px] overflow-y-auto">
      {mode === "wechat" ? (
        <WechatLoginPanel next={next} />
      ) : mode === "email" ? (
        <form action={formAction} className="flex flex-col gap-6">
          {next ? <input name="next" type="hidden" value={next} /> : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">邮箱</FieldLabel>
              <Input id="email" name="email" placeholder="user@example.com" type="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">密码</FieldLabel>
              <Input id="password" name="password" placeholder="请输入密码" type="password" />
            </Field>
          </FieldGroup>
          <Link className="text-right text-sm font-medium text-foreground" href={forgotPasswordHref}>
            忘记密码？
          </Link>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button disabled={isPending} type="submit">
            {isPending ? "登录中..." : "登录"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </form>
      ) : mode === "phone" ? (
        <div className="flex flex-col gap-6">
          <form action={codeFormAction} className="hidden" id="login-phone-code-request">
            <input name="purpose" type="hidden" value="LOGIN" />
            <input name="phone" type="hidden" value={phone} />
          </form>

          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="login-phone">手机号</FieldLabel>
              <Input
                id="login-phone"
                name="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                placeholder="请输入手机号"
              />
            </Field>
            {codeState.error ? <p className="text-sm text-destructive">{codeState.error}</p> : null}
            {codeState.success ? (
              <p className="text-sm text-muted-foreground">{codeState.success}</p>
            ) : null}
          </div>

          <form action={phoneFormAction} className="flex flex-col gap-6">
            {next ? <input name="next" type="hidden" value={next} /> : null}
            <input name="phone" type="hidden" value={phone} />
            <Field>
              <FieldLabel htmlFor="login-phone-code">验证码</FieldLabel>
              <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                <Input
                  id="login-phone-code"
                  name="code"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="请输入短信验证码"
                />
                <Button
                  disabled={isCodePending || !phone || codeCountdown > 0}
                  form="login-phone-code-request"
                  type="submit"
                  variant="outline"
                >
                  {isCodePending ? "发送中..." : codeCountdown > 0 ? `${codeCountdown}秒` : "获取验证码"}
                </Button>
              </div>
            </Field>
            {phoneState.error ? <p className="text-sm text-destructive">{phoneState.error}</p> : null}
            <Button disabled={isPhonePending || !phone} type="submit">
              {isPhonePending ? "登录中..." : "登录"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </form>
        </div>
      ) : (
        <form action={learnerFormAction} className="flex flex-col gap-6">
          {next ? <input name="next" type="hidden" value={next} /> : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="learner-account-id">主账号 ID</FieldLabel>
              <Input
                autoComplete="username"
                id="learner-account-id"
                inputMode="numeric"
                maxLength={10}
                minLength={5}
                name="accountId"
                pattern="[1-9][0-9]{4,9}"
                placeholder="例如 10000"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="learner-subaccount-id">子账号 ID</FieldLabel>
              <Input
                id="learner-subaccount-id"
                inputMode="numeric"
                maxLength={3}
                minLength={3}
                name="learnerId"
                pattern="[0-9]{3}"
                placeholder="例如 100"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="learner-switch-password">切换密码</FieldLabel>
              <Input
                autoComplete="current-password"
                id="learner-switch-password"
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                name="switchPassword"
                pattern="[0-9]{6}"
                placeholder="请输入 6 位切换密码"
                type="password"
                required
              />
            </Field>
          </FieldGroup>
          {learnerState.error ? <p className="text-sm text-destructive">{learnerState.error}</p> : null}
          <Button disabled={isLearnerPending} type="submit">
            {isLearnerPending ? "登录中..." : "登录学习账号"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </form>
      )}

      </div>

    </div>
  );
}

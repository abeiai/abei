"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowRight, Mail, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  phoneLoginAction,
  registerAction,
  sendRegisterEmailCodeAction,
  sendLoginPhoneCodeAction,
  type AuthActionState
} from "@/lib/auth-actions";

const initialState: AuthActionState = {};

export function RegisterForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailCodeCountdown, setEmailCodeCountdown] = useState(0);
  const [state, formAction, isPending] = useActionState(registerAction, initialState);
  const [emailCodeState, emailCodeFormAction, isEmailCodePending] = useActionState(
    sendRegisterEmailCodeAction,
    initialState
  );
  const [phoneState, phoneFormAction, isPhonePending] = useActionState(
    phoneLoginAction,
    initialState
  );
  const [codeState, codeFormAction, isCodePending] = useActionState(
    sendLoginPhoneCodeAction,
    initialState
  );

  useEffect(() => {
    if (emailCodeState.success) {
      setEmailCodeCountdown(60);
    }
  }, [emailCodeState]);

  useEffect(() => {
    if (emailCodeCountdown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setEmailCodeCountdown((value) => Math.max(value - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [emailCodeCountdown]);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-center text-sm text-muted-foreground">新用户注册即送 100 点，永不过期</p>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1">
        <Button
          type="button"
          variant={mode === "email" ? "default" : "ghost"}
          onClick={() => setMode("email")}
        >
          <Mail data-icon="inline-start" />
          邮箱注册
        </Button>
        <Button
          type="button"
          variant={mode === "phone" ? "default" : "ghost"}
          onClick={() => setMode("phone")}
        >
          <Smartphone data-icon="inline-start" />
          手机注册
        </Button>
      </div>

      {mode === "email" ? (
        <div className="flex flex-col gap-6">
          <form action={emailCodeFormAction} className="hidden" id="register-email-code-request">
            <input name="email" type="hidden" value={email} />
          </form>

          <form action={formAction} className="flex flex-col gap-6">
            {next ? <input name="next" type="hidden" value={next} /> : null}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="nickname">昵称</FieldLabel>
                <Input id="nickname" name="nickname" placeholder="请输入昵称" />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">邮箱</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="user@example.com"
                  type="email"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="emailCode">邮箱验证码</FieldLabel>
                <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                  <Input
                    id="emailCode"
                    name="emailCode"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="请输入验证码"
                  />
                  <Button
                    disabled={isEmailCodePending || !email || emailCodeCountdown > 0}
                    form="register-email-code-request"
                    type="submit"
                    variant="outline"
                  >
                    {isEmailCodePending ? "发送中..." : emailCodeCountdown > 0 ? `${emailCodeCountdown}秒` : "获取验证码"}
                  </Button>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">密码</FieldLabel>
                <Input id="password" name="password" placeholder="至少 8 位字符" type="password" />
              </Field>
            </FieldGroup>
            {emailCodeState.error ? <p className="text-sm text-destructive">{emailCodeState.error}</p> : null}
            {emailCodeState.success ? (
              <p className="text-sm text-muted-foreground">{emailCodeState.success}</p>
            ) : null}
            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <Button disabled={isPending} type="submit">
              {isPending ? "创建中..." : "创建账号"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <form action={codeFormAction} className="flex flex-col gap-4">
            <input name="purpose" type="hidden" value="LOGIN" />
            <Field>
              <FieldLabel htmlFor="register-phone">手机号</FieldLabel>
              <Input
                id="register-phone"
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
            <Button disabled={isCodePending || !phone} type="submit" variant="outline">
              {isCodePending ? "发送中..." : "获取验证码"}
            </Button>
          </form>

          <form action={phoneFormAction} className="flex flex-col gap-6">
            {next ? <input name="next" type="hidden" value={next} /> : null}
            <input name="phone" type="hidden" value={phone} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="phone-nickname">昵称</FieldLabel>
                <Input id="phone-nickname" name="nickname" maxLength={32} placeholder="可选" />
              </Field>
              <Field>
                <FieldLabel htmlFor="register-phone-code">验证码</FieldLabel>
                <Input
                  id="register-phone-code"
                  name="code"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="请输入短信验证码"
                />
              </Field>
            </FieldGroup>
            {phoneState.error ? <p className="text-sm text-destructive">{phoneState.error}</p> : null}
            <Button disabled={isPhonePending || !phone} type="submit">
              {isPhonePending ? "创建中..." : "创建并登录"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </form>
        </div>
      )}

    </div>
  );
}

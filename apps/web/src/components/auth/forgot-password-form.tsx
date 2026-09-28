"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { ArrowRight, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  resetPasswordAction,
  sendResetPasswordEmailCodeAction,
  type AuthActionState
} from "@/lib/auth-actions";

const initialState: AuthActionState = {};

export function ForgotPasswordForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [state, formAction, isPending] = useActionState(resetPasswordAction, initialState);
  const [codeState, codeFormAction, isCodePending] = useActionState(
    sendResetPasswordEmailCodeAction,
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
      <form action={codeFormAction} className="hidden" id="reset-password-email-code-request">
        <input name="email" type="hidden" value={email} />
      </form>

      <form action={formAction} className="flex flex-col gap-6">
        {next ? <input name="next" type="hidden" value={next} /> : null}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reset-email">邮箱</FieldLabel>
            <Input
              id="reset-email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
              type="email"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="reset-email-code">邮箱验证码</FieldLabel>
            <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
              <Input
                id="reset-email-code"
                name="emailCode"
                inputMode="numeric"
                maxLength={8}
                placeholder="请输入验证码"
              />
              <Button
                disabled={isCodePending || !email || codeCountdown > 0}
                form="reset-password-email-code-request"
                type="submit"
                variant="outline"
              >
                {isCodePending ? "发送中..." : codeCountdown > 0 ? `${codeCountdown}秒` : "获取验证码"}
              </Button>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="reset-password">新密码</FieldLabel>
            <Input id="reset-password" name="password" placeholder="至少 8 位字符" type="password" />
          </Field>
          <Field>
            <FieldLabel htmlFor="reset-confirm-password">确认新密码</FieldLabel>
            <Input
              id="reset-confirm-password"
              name="confirmPassword"
              placeholder="请再次输入新密码"
              type="password"
            />
          </Field>
        </FieldGroup>
        {codeState.error ? <p className="text-sm text-destructive">{codeState.error}</p> : null}
        {codeState.success ? <p className="text-sm text-muted-foreground">{codeState.success}</p> : null}
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <Button disabled={isPending} type="submit">
          {isPending ? "提交中..." : "重置密码"}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </form>

      <Button asChild variant="outline">
        <Link href="/login">
          <Mail data-icon="inline-start" />
          返回登录
        </Link>
      </Button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { adminLoginAction, type AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = {};

export function AdminLoginForm() {
  const [state, formAction, isPending] = useActionState(adminLoginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="admin-email">管理员邮箱</FieldLabel>
          <Input id="admin-email" name="email" placeholder="admin@example.com" type="email" />
        </Field>
        <Field>
          <FieldLabel htmlFor="admin-password">管理员密码</FieldLabel>
          <Input id="admin-password" name="password" placeholder="请输入管理员密码" type="password" />
          <FieldDescription>管理员账号由 seed 从环境变量创建。</FieldDescription>
        </Field>
      </FieldGroup>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button disabled={isPending} type="submit">
        {isPending ? "登录中..." : "进入后台"}
        <ArrowRight data-icon="inline-end" />
      </Button>
      <Button asChild variant="outline">
        <Link href="/">返回首页</Link>
      </Button>
    </form>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Settings,
  Sparkles,
  UserPlus
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  configureSetupProviderAction,
  completeSetupAction,
  createFirstAdminAction,
  enableSetupModelAction,
  getCurrentAdminOrNull,
  getSetupStatus,
  testSetupProviderAction,
  updateSetupDefaultAliasAction,
  updateSetupSiteAction
} from "@/lib/onboarding-api";
import { getAdminAiModelAliases, getAdminAiProviderPresets } from "@/lib/ai-admin-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "初始化向导 - 学乐 AI",
  description: "首次启动学乐 AI 时配置管理员、站点和 AI Provider。"
};

function stateBadge(state: "PASS" | "WARN" | "FAIL") {
  if (state === "PASS") {
    return <Badge variant="secondary">已完成</Badge>;
  }

  if (state === "WARN") {
    return <Badge variant="outline">可稍后配置</Badge>;
  }

  return <Badge variant="muted">待完成</Badge>;
}

function setupMessage(searchParams: Record<string, string | undefined>) {
  if (searchParams.site) {
    return "站点信息已保存。";
  }

  if (searchParams.provider) {
    return "AI Provider 已保存，API Key 不会在页面明文展示。";
  }

  if (searchParams.test) {
    return `连接测试结果：${searchParams.test}`;
  }

  if (searchParams.model) {
    return "模型已启用。";
  }

  if (searchParams.alias) {
    return "默认模型已更新。";
  }

  return "";
}

export default async function AdminSetupPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const [status, admin] = await Promise.all([getSetupStatus(), getCurrentAdminOrNull()]);
  const canConfigure = Boolean(admin);
  const [providers, aliasPayload] = canConfigure
    ? await Promise.all([
        getAdminAiProviderPresets().catch(() => []),
        getAdminAiModelAliases().catch(() => ({ aliases: [], modelInstances: [] }))
      ])
    : [[], { aliases: [], modelInstances: [] }];
  const message = setupMessage(query);

  return (
    <main className="xueleai-admin-shell min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge>初始化向导</Badge>
            <h1 className="font-display text-5xl font-semibold leading-tight tracking-normal">
              完成首次启动配置
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              按步骤创建管理员、设置站点、配置 AI Provider，并绑定默认模型。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/admin/system/env-check">环境变量检查</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">返回前台</Link>
            </Button>
          </div>
        </header>

        {message ? (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6 text-sm">
              <CheckCircle2 data-icon="inline-start" />
              {message}
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {status.checks.map((check) => (
            <Card key={check.key}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardDescription>{check.label}</CardDescription>
                  {stateBadge(check.state)}
                </div>
                <CardTitle className="text-base">{check.required ? "必填项" : "可选项"}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{check.message}</CardContent>
            </Card>
          ))}
        </section>

        {!status.summary.hasAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus />
                1. 创建管理员
              </CardTitle>
              <CardDescription>系统尚未检测到管理员。该入口只在没有管理员时可用。</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createFirstAdminAction} className="grid gap-5 md:grid-cols-2">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="admin-name">管理员名称</FieldLabel>
                    <Input id="admin-name" name="name" placeholder="超级管理员" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="admin-email">管理员邮箱</FieldLabel>
                    <Input id="admin-email" name="email" placeholder="admin@example.com" required type="email" />
                  </Field>
                </FieldGroup>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="admin-password">管理员密码</FieldLabel>
                    <Input id="admin-password" minLength={8} name="password" required type="password" />
                    <FieldDescription>密码会哈希存储，不会明文写入数据库。</FieldDescription>
                  </Field>
                  <Button className="w-fit" type="submit">
                    创建管理员
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {status.summary.hasAdmin && !canConfigure ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound />
                登录后继续初始化
              </CardTitle>
              <CardDescription>已存在管理员账号，请先登录后台，再继续配置站点和 AI Provider。</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/admin/login">
                  管理员登录
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {canConfigure ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings />
                  2. 设置站点名称
                </CardTitle>
                <CardDescription>这些配置会写入系统设置，并用于前台标题、SEO 和后台识别。</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={updateSetupSiteAction} className="grid gap-5 md:grid-cols-2">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="siteName">站点名称</FieldLabel>
                      <Input id="siteName" name="siteName" placeholder="学乐 AI" required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="siteUrl">前台地址</FieldLabel>
                      <Input id="siteUrl" name="siteUrl" placeholder="http://localhost:3321" />
                    </Field>
                  </FieldGroup>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="siteDescription">站点描述</FieldLabel>
                      <Textarea
                        id="siteDescription"
                        name="siteDescription"
                        placeholder="面向中小学生家长和学生的 AI 学习材料工坊。"
                        rows={3}
                      />
                    </Field>
                    <Button className="w-fit" type="submit">保存站点信息</Button>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles />
                  3. 配置 AI Provider
                </CardTitle>
                <CardDescription>
                  可以先跳过。跳过后体验区会展示配置提示，不会绕过后台模型体系。
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-2">
                {providers.slice(0, 4).map((provider) => (
                  <div className="rounded-lg border border-border bg-background p-4" key={provider.id}>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{provider.displayName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{provider.defaultBaseUrl}</p>
                      </div>
                      <Badge variant={provider.instance?.status === "ENABLED" ? "secondary" : "outline"}>
                        {provider.instance?.statusName ?? "未启用"}
                      </Badge>
                    </div>
                    <form action={configureSetupProviderAction} className="grid gap-3">
                      <input name="providerId" type="hidden" value={provider.id} />
                      <Field>
                        <FieldLabel htmlFor={`${provider.id}-name`}>实例名称</FieldLabel>
                        <Input
                          id={`${provider.id}-name`}
                          name="name"
                          defaultValue={provider.instance?.name ?? provider.displayName}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${provider.id}-baseUrl`}>Base URL</FieldLabel>
                        <Input
                          id={`${provider.id}-baseUrl`}
                          name="baseUrl"
                          defaultValue={provider.instance?.baseUrl ?? provider.defaultBaseUrl}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${provider.id}-apiKey`}>API Key</FieldLabel>
                        <Input id={`${provider.id}-apiKey`} name="apiKey" placeholder="只用于保存，不会回显明文" type="password" />
                      </Field>
                      <label className="flex items-center gap-2 text-sm">
                        <input defaultChecked={provider.instance?.status === "ENABLED"} name="isEnabled" type="checkbox" />
                        启用 Provider
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" type="submit">保存 Provider</Button>
                        <Button
                          formAction={testSetupProviderAction}
                          size="sm"
                          type="submit"
                          variant="outline"
                        >
                          测试连接
                        </Button>
                      </div>
                    </form>
                    {provider.modelPresets[0] ? (
                      <form action={enableSetupModelAction} className="mt-4 grid gap-3 border-t border-border pt-4">
                        <input name="providerId" type="hidden" value={provider.id} />
                        <input name="modelPresetId" type="hidden" value={provider.modelPresets[0].id} />
                        <input name="displayName" type="hidden" value={provider.modelPresets[0].displayName} />
                        <input name="providerModelName" type="hidden" value={provider.modelPresets[0].providerModelName} />
                        <input name="capabilityTags" type="hidden" value={provider.modelPresets[0].capabilityTags.join(",")} />
                        <input name="inputPrice" type="hidden" value="1" />
                        <input name="outputPrice" type="hidden" value="4" />
                        <input name="isEnabled" type="hidden" value="on" />
                        <Button size="sm" type="submit" variant="outline">
                          启用推荐模型：{provider.modelPresets[0].displayName}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>4. 选择默认模型</CardTitle>
                <CardDescription>将一个已启用模型绑定到 default-chat，体验区和场景应用会优先使用该别名。</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={updateSetupDefaultAliasAction} className="grid gap-4 md:grid-cols-[1fr_auto]">
                  <Select name="modelInstanceId" defaultValue={aliasPayload.aliases.find((item) => item.aliasKey === "default-chat")?.modelInstanceId ?? ""}>
                    <option value="">请选择已启用模型</option>
                    {aliasPayload.modelInstances.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.providerName ?? model.providerPresetName ?? "Provider"} · {model.displayName}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit">保存默认模型</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>5. 完成初始化</CardTitle>
                <CardDescription>
                  AI Provider 和支付可以跳过，但生产上线前应补齐。完成后会写入系统设置，不再强制跳转向导。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={completeSetupAction} className="flex flex-col gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input defaultChecked={!status.summary.hasAiProvider} name="aiSkipped" type="checkbox" />
                    本次跳过 AI Provider 配置
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input defaultChecked={!status.summary.hasPaymentConfig} name="paymentSkipped" type="checkbox" />
                    本次跳过支付配置
                  </label>
                  {!status.requiredReady ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertCircle data-icon="inline-start" />
                      管理员、站点名称和基础 seed 是完成初始化的必填项。
                    </div>
                  ) : null}
                  <Button className="w-fit" disabled={!status.requiredReady} type="submit">
                    完成并进入后台
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}

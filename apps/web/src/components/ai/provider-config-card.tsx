import { KeyRound, TestTube2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AiProviderPreset } from "@/lib/ai-admin-api";
import { testAiProviderPresetAction, updateAiProviderPresetAction } from "@/lib/ai-admin-api";

export function ProviderConfigCard({ provider }: { provider: AiProviderPreset }) {
  const instance = provider.instance;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider 配置</CardTitle>
        <CardDescription>保存该供应商的默认端点、地域和 API Key。</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={updateAiProviderPresetAction} className="grid gap-5 lg:grid-cols-2">
          <input name="id" type="hidden" value={provider.id} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="provider-name">Provider 名称</FieldLabel>
              <Input id="provider-name" name="name" defaultValue={instance?.name ?? provider.displayName} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="provider-base-url">默认 Base URL</FieldLabel>
              <Input id="provider-base-url" name="baseUrl" defaultValue={instance?.baseUrl ?? provider.defaultBaseUrl} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="provider-websocket-url">默认 WebSocket URL</FieldLabel>
              <Input id="provider-websocket-url" name="webSocketUrl" defaultValue={instance?.webSocketUrl ?? provider.defaultWebSocketUrl ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="provider-region">默认地域</FieldLabel>
              <Input id="provider-region" name="region" defaultValue={instance?.region ?? provider.region?.split(",")[0] ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="provider-api-key">API Key</FieldLabel>
              <Input id="provider-api-key" name="apiKey" placeholder={instance?.hasApiKey ? "留空表示不更新密钥" : "请输入 API Key"} type="password" />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Adapter" value={provider.adapterType} />
              <Info label="环境变量名" value={provider.apiKeyEnvName} />
              <Info label="连接状态" value={instance?.statusName ?? "未启用"} />
              <Info label="测试结果" value={instance?.lastTestResult?.message ?? "尚未测试"} />
              <Info label="API Key" value={instance?.apiKeyPreview ?? "尚未配置"} />
              <Info label="预置版本" value={provider.presetVersion} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input defaultChecked={instance?.status === "ENABLED"} name="isEnabled" type="checkbox" />
              启用 Provider
            </label>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">
                <KeyRound data-icon="inline-start" />
                保存 Provider
              </Button>
              <Button formAction={testAiProviderPresetAction} type="submit" variant="outline">
                <TestTube2 data-icon="inline-start" />
                测试连接
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 break-all font-medium">{value}</p>
    </div>
  );
}

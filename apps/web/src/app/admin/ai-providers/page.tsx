import { KeyRound, Save } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createAiModelAction,
  createAiProviderAction,
  getAdminAiProviders,
  updateAiProviderAction,
  type AiProvider
} from "@/lib/ai-admin-api";

export const dynamic = "force-dynamic";

export default async function AdminAiProvidersPage() {
  const providers = await getAdminAiProviders();

  return (
    <AdminShell
      active="/admin/ai-providers"
      title="AI Provider 配置"
      description="配置 OpenAI-compatible Provider、模型名称和按 Token 计费参数。"
    >
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>新增 Provider</CardTitle>
            <CardDescription>API Key 会加密存储，后台只显示掩码。</CardDescription>
          </CardHeader>
          <CardContent>
            <ProviderForm action={createAiProviderAction} submitText="保存 Provider" />
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {providers.length > 0 ? (
            providers.map((provider) => (
              <Card key={provider.id}>
                <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col gap-2">
                    <CardTitle>{provider.name}</CardTitle>
                    <CardDescription>{provider.baseUrl}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={provider.isEnabled ? "secondary" : "muted"}>
                      {provider.isEnabled ? "已启用" : "已停用"}
                    </Badge>
                    <Badge variant="outline">{provider.type}</Badge>
                    <Badge variant="outline">
                      <KeyRound data-icon="inline-start" />
                      {provider.apiKeyPreview}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <ProviderForm
                    action={updateAiProviderAction}
                    provider={provider}
                    submitText="更新 Provider"
                  />
                </CardContent>
                <CardContent className="border-t border-border pt-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    {provider.models.map((model) => (
                      <div className="rounded-md border border-border bg-background p-4 text-sm" key={model.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{model.displayName}</p>
                          <Badge variant={model.isEnabled ? "secondary" : "muted"}>
                            {model.isEnabled ? "启用" : "停用"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-muted-foreground">{model.modelName}</p>
                        <p className="mt-2 text-muted-foreground">
                          输入 {model.inputPrice} / 输出 {model.outputPrice} 点 · fallback：
                          {model.fallbackModelId ?? "未配置"}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
                <CardContent className="border-t border-border pt-6">
                  <CardTitle className="mb-4 text-lg">新增模型</CardTitle>
                  <ModelForm provider={provider} />
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                暂无 AI Provider。未配置时前台体验区会展示模型配置提示。
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function ModelForm({ provider }: { provider: AiProvider }) {
  return (
    <form action={createAiModelAction} className="grid gap-4 lg:grid-cols-3">
      <input name="providerId" type="hidden" value={provider.id} />
      <Field>
        <FieldLabel htmlFor={`${provider.id}-new-display`}>展示名</FieldLabel>
        <Input id={`${provider.id}-new-display`} name="displayName" placeholder="备用模型" required />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${provider.id}-new-name`}>模型名称</FieldLabel>
        <Input id={`${provider.id}-new-name`} name="modelName" placeholder="gpt-4o-mini" required />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${provider.id}-fallback`}>Fallback 指向</FieldLabel>
        <select
          className="h-11 rounded-md border border-input bg-card px-3 text-sm"
          id={`${provider.id}-fallback`}
          name="fallbackModelId"
          defaultValue=""
        >
          <option value="">不配置</option>
          {provider.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.displayName}
            </option>
          ))}
        </select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${provider.id}-new-input-price`}>输入价格</FieldLabel>
        <Input id={`${provider.id}-new-input-price`} name="inputPrice" min="0" step="0.0001" type="number" defaultValue="1" />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${provider.id}-new-output-price`}>输出价格</FieldLabel>
        <Input id={`${provider.id}-new-output-price`} name="outputPrice" min="0" step="0.0001" type="number" defaultValue="4" />
      </Field>
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input defaultChecked name="supportsStreaming" type="checkbox" />
          支持流式
        </label>
        <label className="flex items-center gap-2">
          <input defaultChecked name="isEnabled" type="checkbox" />
          启用
        </label>
        <Button type="submit">新增模型</Button>
      </div>
    </form>
  );
}

function ProviderForm({
  action,
  provider,
  submitText
}: {
  action: (formData: FormData) => Promise<void>;
  provider?: AiProvider;
  submitText: string;
}) {
  const model = provider?.models[0];

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-2">
      <input name="id" type="hidden" value={provider?.id ?? ""} />
      <input name="modelId" type="hidden" value={model?.id ?? ""} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${provider?.id ?? "new"}-name`}>Provider 名称</FieldLabel>
          <Input
            id={`${provider?.id ?? "new"}-name`}
            name="name"
            defaultValue={provider?.name ?? ""}
            placeholder="默认 OpenAI-compatible Provider"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${provider?.id ?? "new"}-base-url`}>Base URL</FieldLabel>
          <Input
            id={`${provider?.id ?? "new"}-base-url`}
            name="baseUrl"
            defaultValue={provider?.baseUrl ?? ""}
            placeholder="https://api.example.com/v1"
            required
          />
          <FieldDescription>填写兼容 OpenAI Chat Completions 的 /v1 地址。</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${provider?.id ?? "new"}-api-key`}>API Key</FieldLabel>
          <Input
            id={`${provider?.id ?? "new"}-api-key`}
            name="apiKey"
            placeholder={provider ? "留空表示不更新密钥" : "请输入 Provider API Key"}
            required={!provider}
            type="password"
          />
          <FieldDescription>密钥不会明文保存，也不会在后台完整展示。</FieldDescription>
        </Field>
      </FieldGroup>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${provider?.id ?? "new"}-model-display`}>模型展示名</FieldLabel>
          <Input
            id={`${provider?.id ?? "new"}-model-display`}
            name="modelDisplayName"
            defaultValue={model?.displayName ?? ""}
            placeholder="文案生成模型"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${provider?.id ?? "new"}-model-name`}>模型名称</FieldLabel>
          <Input
            id={`${provider?.id ?? "new"}-model-name`}
            name="modelName"
            defaultValue={model?.modelName ?? ""}
            placeholder="gpt-4o-mini"
            required
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${provider?.id ?? "new"}-input-price`}>输入价格</FieldLabel>
            <Input
              id={`${provider?.id ?? "new"}-input-price`}
              min="0"
              name="inputPrice"
              step="0.0001"
              type="number"
              defaultValue={model?.inputPrice ?? "1"}
              required
            />
            <FieldDescription>每 1000 输入 token 扣点。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${provider?.id ?? "new"}-output-price`}>输出价格</FieldLabel>
            <Input
              id={`${provider?.id ?? "new"}-output-price`}
              min="0"
              name="outputPrice"
              step="0.0001"
              type="number"
              defaultValue={model?.outputPrice ?? "4"}
              required
            />
            <FieldDescription>每 1000 输出 token 扣点。</FieldDescription>
          </Field>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input defaultChecked={provider?.isEnabled ?? true} name="isEnabled" type="checkbox" />
            启用 Provider
          </label>
          <label className="flex items-center gap-2">
            <input defaultChecked={model?.isEnabled ?? true} name="modelEnabled" type="checkbox" />
            启用模型
          </label>
        </div>
        <Button className="w-fit" type="submit">
          <Save data-icon="inline-start" />
          {submitText}
        </Button>
      </FieldGroup>
    </form>
  );
}

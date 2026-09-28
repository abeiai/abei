"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Loader2, PackageSearch, Pencil, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createAiProviderPresetAction,
  deleteAiProviderPresetAction,
  updateAiProviderPresetAction,
  type AiProviderPreset
} from "@/lib/ai-admin-api";

type ModalState = { mode: "create" } | { mode: "edit"; provider: AiProviderPreset } | null;

export function ProviderPresetList({ providers }: { providers: AiProviderPreset[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteProvider, setDeleteProvider] = useState<AiProviderPreset | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function refresh(text: string) {
    setMessage(text);
    setModal(null);
    setDeleteProvider(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-end">
        <Button onClick={() => setModal({ mode: "create" })} type="button">
          <Plus data-icon="inline-start" />
          新增厂商
        </Button>
      </div>

      {message ? <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{message}</div> : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[260px]">厂商</TableHead>
              <TableHead className="min-w-[160px]">区域</TableHead>
              <TableHead className="min-w-[420px]">可用模型</TableHead>
              <TableHead className="w-[170px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => {
              const enabledModels = (provider.instance?.modelInstances ?? []).filter((model) => model.isEnabled);
              const configuredModelCount = provider.instance?.modelInstances.length ?? 0;
              const modelTotal = Math.max(provider.modelPresets.length, configuredModelCount);

              return (
                <TableRow key={provider.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                        <Building2 className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{provider.instance?.name ?? provider.displayName}</span>
                          <Badge variant={provider.instance?.status === "ENABLED" ? "secondary" : "muted"}>
                            {provider.instance?.statusName ?? "未启用"}
                          </Badge>
                          {provider.isBuiltIn ? <Badge variant="outline">内置</Badge> : <Badge variant="outline">自定义</Badge>}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {provider.providerKey} · {provider.adapterType} · {provider.modality}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {provider.instance?.region ?? provider.region ?? "未标注"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-1.5">
                          {enabledModels.length > 0 ? (
                            enabledModels.slice(0, 4).map((model) => (
                              <Badge key={model.id} variant="outline">
                                {model.displayName}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">暂无启用模型</span>
                          )}
                          {enabledModels.length > 4 ? <Badge variant="outline">+{enabledModels.length - 4}</Badge> : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          已启用 {enabledModels.length} 个，可配置 {modelTotal} 个
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/ai/providers/${provider.id}`}>
                          <PackageSearch data-icon="inline-start" />
                          模型管理
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => setModal({ mode: "edit", provider })} size="sm" type="button" variant="outline">
                        <Pencil data-icon="inline-start" />
                        编辑
                      </Button>
                      <Button onClick={() => setDeleteProvider(provider)} size="sm" type="button" variant="ghost">
                        <Trash2 data-icon="inline-start" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          暂无厂商，请点击右上角新增厂商。
        </div>
      ) : null}

      {modal ? <ProviderModal state={modal} onClose={() => setModal(null)} onSaved={refresh} /> : null}
      {deleteProvider ? <DeleteProviderModal provider={deleteProvider} onClose={() => setDeleteProvider(null)} onDeleted={refresh} /> : null}
    </div>
  );
}

function ProviderModal({
  state,
  onClose,
  onSaved
}: {
  state: Exclude<ModalState, null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const provider = state.mode === "edit" ? state.provider : null;
  const instance = provider?.instance ?? null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        if (state.mode === "create") {
          await createAiProviderPresetAction(formData);
          onSaved("厂商已新增。");
        } else {
          await updateAiProviderPresetAction(formData);
          onSaved("厂商配置已保存。");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存厂商失败。");
      }
    });
  }

  return (
    <ModalShell title={state.mode === "create" ? "新增厂商" : "编辑厂商"} onClose={onClose}>
      <form className="grid gap-5" onSubmit={submit}>
        {provider ? <input name="id" type="hidden" value={provider.id} /> : null}

        {state.mode === "create" ? (
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="displayName">厂商名称</FieldLabel>
              <Input id="displayName" name="displayName" placeholder="例如：OpenAI Compatible" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="providerKey">厂商标识</FieldLabel>
              <Input id="providerKey" name="providerKey" placeholder="留空自动生成" />
            </Field>
            <Field>
              <FieldLabel htmlFor="adapterType">Adapter</FieldLabel>
              <Select id="adapterType" name="adapterType" defaultValue="CUSTOM_OPENAI_COMPATIBLE">
                <option value="CUSTOM_OPENAI_COMPATIBLE">CUSTOM_OPENAI_COMPATIBLE</option>
                <option value="OPENAI_COMPATIBLE">OPENAI_COMPATIBLE</option>
                <option value="ANTHROPIC">ANTHROPIC</option>
                <option value="GEMINI">GEMINI</option>
                <option value="DASHSCOPE_AUDIO">DASHSCOPE_AUDIO</option>
                <option value="MINIMAX_AUDIO">MINIMAX_AUDIO</option>
                <option value="ELEVENLABS_AUDIO">ELEVENLABS_AUDIO</option>
                <option value="MINIMAX_VIDEO">MINIMAX_VIDEO</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="modality">模态</FieldLabel>
              <Select id="modality" name="modality" defaultValue="TEXT">
                <option value="TEXT">TEXT</option>
                <option value="MULTIMODAL">MULTIMODAL</option>
                <option value="AUDIO">AUDIO</option>
              </Select>
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="defaultBaseUrl">默认 Base URL</FieldLabel>
              <Input id="defaultBaseUrl" name="defaultBaseUrl" placeholder="https://api.example.com/v1" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="defaultWebSocketUrl">默认 WebSocket URL</FieldLabel>
              <Input id="defaultWebSocketUrl" name="defaultWebSocketUrl" placeholder="语音流式合成可填" />
            </Field>
            <Field>
              <FieldLabel htmlFor="apiKeyEnvName">环境变量名</FieldLabel>
              <Input id="apiKeyEnvName" name="apiKeyEnvName" placeholder="留空自动生成" />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="docsUrl">文档地址</FieldLabel>
              <Input id="docsUrl" name="docsUrl" placeholder="https://..." />
            </Field>
          </FieldGroup>
        ) : (
          <div className="rounded-md border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            厂商基础类型来自预置定义；这里编辑当前厂商实例的名称、区域、端点和 API Key。
          </div>
        )}

        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="name">显示名称</FieldLabel>
            <Input id="name" name="name" defaultValue={instance?.name ?? provider?.displayName ?? ""} placeholder="留空使用厂商名称" />
          </Field>
          <Field>
            <FieldLabel htmlFor="region">区域</FieldLabel>
            <Input id="region" name="region" defaultValue={instance?.region ?? provider?.region?.split(",")[0] ?? ""} placeholder="例如 cn-beijing" />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="baseUrl">Base URL</FieldLabel>
            <Input id="baseUrl" name="baseUrl" defaultValue={instance?.baseUrl ?? provider?.defaultBaseUrl ?? ""} placeholder="默认使用厂商 Base URL" />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="webSocketUrl">WebSocket URL</FieldLabel>
            <Input id="webSocketUrl" name="webSocketUrl" defaultValue={instance?.webSocketUrl ?? provider?.defaultWebSocketUrl ?? ""} placeholder="非语音 Provider 可留空" />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="apiKey">API Key</FieldLabel>
            <Input id="apiKey" name="apiKey" placeholder={instance?.hasApiKey ? "留空表示不更新密钥" : "请输入 API Key"} type="password" />
            <FieldDescription>{instance?.apiKeyPreview ?? "尚未配置 API Key"}</FieldDescription>
          </Field>
        </FieldGroup>

        <label className="flex items-center gap-2 text-sm">
          <input defaultChecked={instance?.status === "ENABLED"} name="isEnabled" type="checkbox" />
          启用厂商
        </label>

        {message ? <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">{message}</div> : null}

        <div className="flex justify-end gap-3">
          <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            保存
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function DeleteProviderModal({
  provider,
  onClose,
  onDeleted
}: {
  provider: AiProviderPreset;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    if (provider.isBuiltIn) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteAiProviderPresetAction(provider.id);
        onDeleted("厂商已删除。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "删除厂商失败。");
      }
    });
  }

  return (
    <ModalShell title="删除厂商" onClose={onClose}>
      <div className="grid gap-5">
        <div className="rounded-md border border-border bg-background p-4">
          <p className="font-medium">{provider.instance?.name ?? provider.displayName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{provider.providerKey}</p>
        </div>

        {provider.isBuiltIn ? (
          <p className="text-sm text-muted-foreground">内置厂商不能删除。如不再使用，请点击编辑并停用厂商。</p>
        ) : (
          <p className="text-sm text-muted-foreground">删除前请确认该厂商下没有可用模型和任务记录。该操作不可撤销。</p>
        )}

        {message ? <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">{message}</div> : null}

        <div className="flex justify-end gap-3">
          <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={provider.isBuiltIn || isPending} onClick={confirmDelete} type="button">
            {isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
            确认删除
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <X data-icon="inline-start" />
            关闭
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

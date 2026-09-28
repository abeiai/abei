"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Edit3, Loader2, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  checkAudioModelDeleteAction,
  deleteAudioModelAction,
  updateAudioModelAction,
  type AdminAudioModel,
  type AudioModelDeleteCheck,
  type AudioModelPricingMode,
  type AudioModelPricingUnit
} from "@/lib/audio-admin-api";
import { cn } from "@/lib/utils";

const pricingModeOptions: Array<{ value: AudioModelPricingMode; label: string }> = [
  { value: "CHARACTERS", label: "按字符数" },
  { value: "TOKENS", label: "按 tokens" },
  { value: "REQUEST", label: "按次" },
  { value: "IMAGES", label: "按张" },
  { value: "SECONDS", label: "按秒" }
];

const tokenUnitOptions: Array<{ value: Extract<AudioModelPricingUnit, "K_TOKENS" | "M_TOKENS">; label: string }> = [
  { value: "K_TOKENS", label: "k tokens" },
  { value: "M_TOKENS", label: "M tokens" }
];

const characterUnitOptions: Array<{ value: Extract<AudioModelPricingUnit, "CHARACTER" | "K_CHARACTERS" | "TEN_K_CHARACTERS">; label: string }> = [
  { value: "TEN_K_CHARACTERS", label: "万字符" },
  { value: "K_CHARACTERS", label: "千字符" },
  { value: "CHARACTER", label: "字符" }
];

const aliasOptions = [
  { value: "", label: "不调整别名" },
  { value: "speech-to-text", label: "语音转文字" },
  { value: "tts-default", label: "默认语音合成" },
  { value: "tts-fast", label: "快速语音合成" },
  { value: "voice-design-default", label: "默认声音设计" },
  { value: "voice-clone-default", label: "默认声音复刻" },
  { value: "audio-preview", label: "音频预览" }
];

export function AudioModelManager({ models }: { models: AdminAudioModel[] }) {
  const [editingModel, setEditingModel] = useState<AdminAudioModel | null>(null);
  const [deleteState, setDeleteState] = useState<{
    model: AdminAudioModel;
    check: AudioModelDeleteCheck;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleModel(model: AdminAudioModel) {
    const nextEnabled = !model.isEnabled;
    const formData = modelToFormData(model, {
      isEnabled: nextEnabled
    });

    setPendingModelId(model.id);
    startTransition(async () => {
      try {
        await updateAudioModelAction(formData);
        setMessage(nextEnabled ? "语音模型已启用。" : "语音模型已停用。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "语音模型状态更新失败。");
      } finally {
        setPendingModelId(null);
      }
    });
  }

  function openDelete(model: AdminAudioModel) {
    setPendingModelId(model.id);
    startTransition(async () => {
      try {
        const check = await checkAudioModelDeleteAction(model.id);
        setDeleteState({
          model,
          check
        });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "删除检查失败。");
      } finally {
        setPendingModelId(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>模型配置</CardTitle>
        <CardDescription>按列表维护语音模型启用状态、能力标签和定价，可绑定到语音识别、语音合成、声音设计和声音复刻场景。</CardDescription>
      </CardHeader>
      <CardContent>
        {message ? (
          <div className="mb-4 rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">展示名</TableHead>
                <TableHead className="min-w-[220px]">模型名</TableHead>
                <TableHead className="min-w-[240px]">能力标签</TableHead>
                <TableHead className="min-w-[190px]">定价</TableHead>
                <TableHead className="w-[120px]">是否启用</TableHead>
                <TableHead className="w-[150px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.length > 0 ? (
                models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell>
                      <span className="font-medium">{model.displayName}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <code className="w-fit rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                          {model.modelName}
                        </code>
                        <span className="max-w-[320px] truncate text-xs text-muted-foreground">
                          端点：{model.baseUrl || "Provider 默认"} · 密钥：{model.hasCustomApiKey ? "独立" : "Provider 默认"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {model.capabilityTags.length > 0 ? (
                          model.capabilityTags.slice(0, 8).map((tag) => (
                            <Badge key={tag} variant="muted">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">未设置</span>
                        )}
                        {model.capabilityTags.length > 8 ? <Badge variant="outline">+{model.capabilityTags.length - 8}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatPrice(model)}</TableCell>
                    <TableCell>
                      <button
                        aria-checked={model.isEnabled}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          model.isEnabled ? "bg-primary" : "bg-secondary"
                        )}
                        disabled={isPending && pendingModelId === model.id}
                        onClick={() => toggleModel(model)}
                        role="switch"
                        type="button"
                      >
                        <span
                          className={cn(
                            "inline-block size-5 rounded-full bg-background shadow-sm transition-transform",
                            model.isEnabled ? "translate-x-5" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => setEditingModel(model)} size="sm" type="button" variant="outline">
                          <Edit3 data-icon="inline-start" />
                          编辑
                        </Button>
                        <Button
                          disabled={isPending && pendingModelId === model.id}
                          onClick={() => openDelete(model)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {isPending && pendingModelId === model.id ? (
                            <Loader2 className="animate-spin" data-icon="inline-start" />
                          ) : (
                            <Trash2 data-icon="inline-start" />
                          )}
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    暂无语音模型。请确认语音 Provider 预置已同步，然后在本页统一启用模型。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {editingModel ? (
        <AudioModelEditModal
          model={editingModel}
          onClose={() => setEditingModel(null)}
          onSaved={() => {
            setEditingModel(null);
            setMessage("语音模型配置已保存。");
          }}
        />
      ) : null}
      {deleteState ? (
        <AudioModelDeleteModal
          onClose={() => setDeleteState(null)}
          onDeleted={() => {
            setDeleteState(null);
            setMessage("语音模型已删除。");
          }}
          state={deleteState}
        />
      ) : null}
    </Card>
  );
}

function AudioModelEditModal({
  model,
  onClose,
  onSaved
}: {
  model: AdminAudioModel;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pricingMode, setPricingMode] = useState<AudioModelPricingMode>(model.pricingMode || "CHARACTERS");
  const [pricingUnit, setPricingUnit] = useState<AudioModelPricingUnit>(
    model.pricingUnit || defaultPricingUnit(model.pricingMode || "CHARACTERS")
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePricingModeChange(value: AudioModelPricingMode) {
    setPricingMode(value);
    setPricingUnit(defaultPricingUnit(value));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("pricingMode", pricingMode);
    formData.set("pricingUnit", pricingUnit);

    if (pricingMode !== "TOKENS") {
      formData.set("outputPrice", "0");
    }

    startTransition(async () => {
      try {
        await updateAudioModelAction(formData);
        onSaved();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存语音模型失败。");
      }
    });
  }

  return (
    <ModalShell title="编辑语音模型" onClose={onClose}>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <input name="id" type="hidden" value={model.id} />
        {message ? (
          <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="audio-model-display-name">展示名</FieldLabel>
            <Input id="audio-model-display-name" name="displayName" defaultValue={model.displayName} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="audio-model-name">模型名</FieldLabel>
            <Input id="audio-model-name" name="modelName" defaultValue={model.modelName} required />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="audio-model-base-url">模型 Base URL</FieldLabel>
            <Input id="audio-model-base-url" name="baseUrl" defaultValue={model.baseUrl ?? ""} />
            <FieldDescription>留空表示使用语音 Provider 默认 Base URL。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="audio-model-websocket-url">模型 WebSocket URL</FieldLabel>
            <Input id="audio-model-websocket-url" name="webSocketUrl" defaultValue={model.webSocketUrl ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="audio-model-region">模型地域</FieldLabel>
            <Input id="audio-model-region" name="region" defaultValue={model.region ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="audio-model-api-key">模型独立 API Key</FieldLabel>
            <Input id="audio-model-api-key" name="apiKey" placeholder={model.hasCustomApiKey ? "留空表示不更新独立密钥" : "留空使用 Provider 默认密钥"} type="password" />
            <FieldDescription>当前：{model.apiKeyPreview}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>密钥策略</FieldLabel>
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-input px-3 text-sm">
              <input defaultChecked={false} name="clearApiKey" type="checkbox" />
              清除独立 API Key，改用 Provider 默认
            </label>
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="audio-model-capabilities">能力标签</FieldLabel>
            <Input id="audio-model-capabilities" name="capabilityTags" defaultValue={model.capabilityTags.join(",")} />
            <FieldDescription>多个标签用英文逗号分隔，例如 ASR, TTS, VOICE_CLONE。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="audio-model-pricing-mode">定价模式</FieldLabel>
            <Select
              id="audio-model-pricing-mode"
              name="pricingMode"
              onChange={(event) => handlePricingModeChange(event.target.value as AudioModelPricingMode)}
              value={pricingMode}
            >
              {pricingModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {pricingMode === "TOKENS" ? (
            <Field>
              <FieldLabel htmlFor="audio-model-token-unit">计费单位</FieldLabel>
              <Select
                id="audio-model-token-unit"
                name="pricingUnit"
                onChange={(event) => setPricingUnit(event.target.value as AudioModelPricingUnit)}
                value={pricingUnit}
              >
                {tokenUnitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : pricingMode === "CHARACTERS" ? (
            <Field>
              <FieldLabel htmlFor="audio-model-character-unit">计费单位</FieldLabel>
              <Select
                id="audio-model-character-unit"
                name="pricingUnit"
                onChange={(event) => setPricingUnit(event.target.value as AudioModelPricingUnit)}
                value={pricingUnit}
              >
                {characterUnitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input name="pricingUnit" type="hidden" value={pricingUnit} />
          )}
          <Field>
            <FieldLabel htmlFor="audio-model-input-price">{pricingMode === "TOKENS" ? "输入价格" : "单价"}</FieldLabel>
            <Input
              defaultValue={model.inputPrice}
              id="audio-model-input-price"
              min="0"
              name="inputPrice"
              step="0.000001"
              type="number"
            />
            <FieldDescription>单位：人民币 / {pricingUnitName(pricingUnit)}</FieldDescription>
          </Field>
          {pricingMode === "TOKENS" ? (
            <Field>
              <FieldLabel htmlFor="audio-model-output-price">输出价格</FieldLabel>
              <Input
                defaultValue={model.outputPrice}
                id="audio-model-output-price"
                min="0"
                name="outputPrice"
                step="0.000001"
                type="number"
              />
            </Field>
          ) : (
            <input name="outputPrice" type="hidden" value="0" />
          )}
          <Field>
            <FieldLabel htmlFor="audio-model-alias">用途别名</FieldLabel>
            <Select id="audio-model-alias" name="aliasKey" defaultValue="">
              {aliasOptions.map((option) => (
                <option key={option.value || "none"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="audio-model-alias-name">别名显示名</FieldLabel>
            <Input id="audio-model-alias-name" name="aliasDisplayName" placeholder="留空使用默认名称" />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="audio-model-alias-description">别名说明</FieldLabel>
            <Input id="audio-model-alias-description" name="aliasDescription" placeholder="可选说明" />
          </Field>
        </FieldGroup>
        <label className="flex items-center gap-2 text-sm">
          <input defaultChecked={model.isEnabled} name="isEnabled" type="checkbox" />
          启用模型
        </label>
        <div className="flex justify-end gap-3">
          <Button onClick={onClose} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
            保存
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function AudioModelDeleteModal({
  state,
  onClose,
  onDeleted
}: {
  state: {
    model: AdminAudioModel;
    check: AudioModelDeleteCheck;
  };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [countdown, setCountdown] = useState(5);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!state.check.canDelete) {
      return;
    }

    setCountdown(5);
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [state.check.canDelete, state.check.modelInstanceId]);

  function confirmDelete() {
    if (countdown > 0) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteAudioModelAction(state.model.id);
        onDeleted();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "删除语音模型失败。");
      }
    });
  }

  return (
    <ModalShell title="删除语音模型" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {message ? (
          <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}
        <div className="rounded-md border border-border bg-background p-4">
          <p className="font-medium">{state.model.displayName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.model.modelName}</p>
        </div>
        {!state.check.canDelete ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{state.check.message}</p>
            <div className="rounded-md border border-border">
              {state.check.boundScenarios.map((scenario) => (
                <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-b-0" key={`${scenario.slug}-${scenario.aliasKey}`}>
                  <span>{scenario.name}</span>
                  <span className="text-muted-foreground">{scenario.aliasKey ?? "未识别别名"}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose} type="button" variant="outline">
                我知道了
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              该语音模型没有绑定场景。删除会同时解除相关默认模型绑定，操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <Button onClick={onClose} type="button" variant="outline">
                取消
              </Button>
              <Button disabled={countdown > 0 || isPending} onClick={confirmDelete} type="button">
                {isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
                {countdown > 0 ? `确认删除（${countdown}s）` : "确认删除"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-lg font-medium">{title}</h2>
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

function modelToFormData(model: AdminAudioModel, overrides: Partial<AdminAudioModel> = {}) {
  const next = {
    ...model,
    ...overrides
  };
  const formData = new FormData();
  formData.set("id", next.id);
  formData.set("displayName", next.displayName);
  formData.set("modelName", next.modelName);
  formData.set("baseUrl", next.baseUrl ?? "");
  formData.set("webSocketUrl", next.webSocketUrl ?? "");
  formData.set("region", next.region ?? "");
  formData.set("capabilityTags", next.capabilityTags.join(","));
  formData.set("inputPrice", next.inputPrice);
  formData.set("outputPrice", next.outputPrice);
  formData.set("pricingMode", next.pricingMode || "CHARACTERS");
  formData.set("pricingUnit", next.pricingUnit || "TEN_K_CHARACTERS");

  if (next.isEnabled) {
    formData.set("isEnabled", "on");
  }

  return formData;
}

function formatPrice(model: AdminAudioModel) {
  if (model.pricingMode === "TOKENS") {
    return `输入 ¥${formatMoney(Number(model.inputPrice || 0))} / 输出 ¥${formatMoney(Number(model.outputPrice || 0))} / ${pricingUnitName(model.pricingUnit)}`;
  }

  return `¥${formatMoney(Number(model.inputPrice || 0))} / ${pricingUnitName(model.pricingUnit)}`;
}

function defaultPricingUnit(mode: AudioModelPricingMode): AudioModelPricingUnit {
  const units: Record<AudioModelPricingMode, AudioModelPricingUnit> = {
    TOKENS: "K_TOKENS",
    REQUEST: "REQUEST",
    CHARACTERS: "TEN_K_CHARACTERS",
    IMAGES: "IMAGE",
    SECONDS: "SECOND"
  };

  return units[mode];
}

function pricingUnitName(unit: AudioModelPricingUnit) {
  const names: Record<AudioModelPricingUnit, string> = {
    K_TOKENS: "k tokens",
    M_TOKENS: "M tokens",
    REQUEST: "次",
    CHARACTER: "字符",
    K_CHARACTERS: "千字符",
    TEN_K_CHARACTERS: "万字符",
    IMAGE: "张",
    SECOND: "秒"
  };

  return names[unit] ?? "万字符";
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toLocaleString("zh-CN", {
    maximumFractionDigits: 6
  });
}

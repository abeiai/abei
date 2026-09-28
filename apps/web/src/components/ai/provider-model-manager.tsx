"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Edit3, Loader2, Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  checkAiModelInstanceDeleteAction,
  createAiModelInstanceAction,
  deleteAiModelInstanceAction,
  enableAiModelPresetAction,
  updateAiModelInstanceAction,
  type AiModelInstanceDeleteCheck,
  type AiModelPricingConfig,
  type AiModelPricingMode,
  type AiModelPricingUnit,
  type AiProviderPreset
} from "@/lib/ai-admin-api";
import { cn } from "@/lib/utils";

type TokenPriceViewUnit = "K_TOKENS" | "M_TOKENS";

interface ModelRow {
  rowKey: string;
  modelPresetId: string | null;
  modelInstanceId: string | null;
  displayName: string;
  providerModelName: string;
  baseUrl: string;
  webSocketUrl: string;
  region: string;
  hasCustomApiKey: boolean;
  apiKeyPreview: string;
  capabilityTags: string[];
  inputPrice: string;
  outputPrice: string;
  pricingMode: AiModelPricingMode;
  pricingUnit: AiModelPricingUnit;
  pricingConfig: AiModelPricingConfig | null;
  isEnabled: boolean;
  isDeprecated: boolean;
  deprecatedMessage: string | null;
  isConfigured: boolean;
}

interface EditablePricingTier {
  id: string;
  label: string;
  minInputTokens: string;
  maxInputTokens: string;
  input: string;
  output: string;
  reasoningOutput: string;
  inputCacheHit: string;
  inputCacheHitExplicit: string;
  inputCacheCreation: string;
}

type VideoJobMode = "STANDARD" | "REALTIME" | "BATCH";
type VideoTaskType = "TEXT_TO_VIDEO" | "IMAGE_TO_VIDEO" | "REFERENCE_TO_VIDEO" | "VIDEO_EDIT" | "OTHER";

interface EditableVideoPricingVariant {
  id: string;
  label: string;
  resolution: string;
  jobMode: VideoJobMode;
  taskType: VideoTaskType;
  withAudio: boolean;
  input: string;
  output: string;
  note: string;
}

const pricingModeOptions: Array<{ value: AiModelPricingMode; label: string }> = [
  { value: "TOKENS", label: "标准 tokens" },
  { value: "TOKEN_CACHE", label: "缓存分价 tokens" },
  { value: "TOKEN_TIERED", label: "阶梯 tokens" },
  { value: "REQUEST", label: "按次" },
  { value: "CHARACTERS", label: "按字符数" },
  { value: "IMAGES", label: "按张" },
  { value: "SECONDS", label: "按秒" },
  { value: "VIDEO_SECONDS", label: "视频按秒" }
];

const tokenUnitOptions: Array<{ value: TokenPriceViewUnit; label: string }> = [
  { value: "K_TOKENS", label: "k tokens" },
  { value: "M_TOKENS", label: "M tokens" }
];

const videoResolutionOptions = ["480P", "720P", "768P", "1080P", "4K"] as const;

const videoJobModeOptions: Array<{ value: VideoJobMode; label: string }> = [
  { value: "STANDARD", label: "标准" },
  { value: "REALTIME", label: "实时" },
  { value: "BATCH", label: "批量" }
];

const videoTaskTypeOptions: Array<{ value: VideoTaskType; label: string }> = [
  { value: "TEXT_TO_VIDEO", label: "文生视频" },
  { value: "IMAGE_TO_VIDEO", label: "图生视频" },
  { value: "REFERENCE_TO_VIDEO", label: "参考生视频" },
  { value: "VIDEO_EDIT", label: "视频编辑" },
  { value: "OTHER", label: "其他" }
];

export function ProviderModelManager({ provider }: { provider: AiProviderPreset }) {
  const router = useRouter();
  const [tokenViewUnit, setTokenViewUnit] = useState<TokenPriceViewUnit>("K_TOKENS");
  const [editingRow, setEditingRow] = useState<ModelRow | null>(null);
  const [creatingRow, setCreatingRow] = useState<ModelRow | null>(null);
  const [deleteState, setDeleteState] = useState<{
    row: ModelRow;
    check: AiModelInstanceDeleteCheck;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRowKey, setPendingRowKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rows = useMemo(() => buildRows(provider), [provider]);

  function refreshAfterChange(text: string) {
    setMessage(text);
    router.refresh();
  }

  function toggleModel(row: ModelRow) {
    if (!row.modelPresetId && !row.modelInstanceId) {
      setMessage("该模型缺少预置信息，无法启用。");
      return;
    }

    const nextEnabled = !row.isEnabled;
    const formData = rowToFormData(provider.id, row, {
      isEnabled: nextEnabled
    });
    setPendingRowKey(row.rowKey);
    startTransition(async () => {
      try {
        if (row.modelInstanceId) {
          await updateAiModelInstanceAction(formData);
        } else if (!row.modelPresetId) {
          await createAiModelInstanceAction(formData);
        } else {
          await enableAiModelPresetAction(formData);
        }
        refreshAfterChange(nextEnabled ? "模型已启用。" : "模型已停用。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "模型状态更新失败。");
      } finally {
        setPendingRowKey(null);
      }
    });
  }

  function openDelete(row: ModelRow) {
    if (!row.modelInstanceId) {
      setMessage("该模型尚未启用，无需删除。");
      return;
    }

    setPendingRowKey(row.rowKey);
    startTransition(async () => {
      try {
        const check = await checkAiModelInstanceDeleteAction(row.modelInstanceId as string);
        setDeleteState({
          row,
          check
        });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "删除检查失败。");
      } finally {
        setPendingRowKey(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>可用模型</CardTitle>
          <CardDescription>按列表维护模型启用状态、能力标签和定价，可在 AI 配置的默认模型区域绑定到业务场景。</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-background p-1">
            {tokenUnitOptions.map((option) => (
              <button
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  tokenViewUnit === option.value ? "bg-primary text-primary-foreground hover:text-primary-foreground" : null
                )}
                key={option.value}
                onClick={() => setTokenViewUnit(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button onClick={() => setCreatingRow(blankModelRow(provider))} type="button">
            <Plus data-icon="inline-start" />
            新增模型
          </Button>
        </div>
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
                <TableHead className="min-w-[220px]">能力标签</TableHead>
                <TableHead className="min-w-[210px]">定价</TableHead>
                <TableHead className="w-[120px]">是否启用</TableHead>
                <TableHead className="w-[150px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.rowKey}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.displayName}</span>
                      </div>
                      {row.isDeprecated ? (
                        <span className="text-xs text-muted-foreground">
                          {row.deprecatedMessage ?? "该模型可能已过期"}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <code className="w-fit rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                        {row.providerModelName}
                      </code>
                      <span className="max-w-[320px] truncate text-xs text-muted-foreground">
                        端点：{row.baseUrl || "Provider 默认"} · 密钥：{row.hasCustomApiKey ? "独立" : "Provider 默认"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {row.capabilityTags.length > 0 ? (
                        row.capabilityTags.slice(0, 6).map((tag) => (
                          <Badge key={tag} variant="muted">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">未设置</span>
                      )}
                      {row.capabilityTags.length > 6 ? <Badge variant="outline">+{row.capabilityTags.length - 6}</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatPrice(row, tokenViewUnit)}
                  </TableCell>
                  <TableCell>
                    <button
                      aria-checked={row.isEnabled}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        row.isEnabled ? "bg-primary" : "bg-secondary"
                      )}
                      disabled={isPending && pendingRowKey === row.rowKey}
                      onClick={() => toggleModel(row)}
                      role="switch"
                      type="button"
                    >
                      <span
                        className={cn(
                          "inline-block size-5 rounded-full bg-background shadow-sm transition-transform",
                          row.isEnabled ? "translate-x-5" : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => setEditingRow(row)} size="sm" type="button" variant="outline">
                        <Edit3 data-icon="inline-start" />
                        编辑
                      </Button>
                      <Button
                        disabled={!row.modelInstanceId || (isPending && pendingRowKey === row.rowKey)}
                        onClick={() => openDelete(row)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {isPending && pendingRowKey === row.rowKey ? (
                          <Loader2 className="animate-spin" data-icon="inline-start" />
                        ) : (
                          <Trash2 data-icon="inline-start" />
                        )}
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {editingRow ? (
        <ModelEditModal
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            refreshAfterChange("模型配置已保存。");
          }}
          providerId={provider.id}
          row={editingRow}
        />
      ) : null}
      {creatingRow ? (
        <ModelEditModal
          onClose={() => setCreatingRow(null)}
          onSaved={() => {
            setCreatingRow(null);
            refreshAfterChange("模型已新增。");
          }}
          providerId={provider.id}
          row={creatingRow}
        />
      ) : null}
      {deleteState ? (
        <DeleteModelModal
          onClose={() => setDeleteState(null)}
          onDeleted={() => {
            setDeleteState(null);
            refreshAfterChange("模型已删除。");
          }}
          providerId={provider.id}
          state={deleteState}
        />
      ) : null}
    </Card>
  );
}

function ModelEditModal({
  providerId,
  row,
  onClose,
  onSaved
}: {
  providerId: string;
  row: ModelRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pricingMode, setPricingMode] = useState<AiModelPricingMode>(row.pricingMode);
  const [pricingUnit, setPricingUnit] = useState<AiModelPricingUnit>(row.pricingUnit);
  const [tiers, setTiers] = useState<EditablePricingTier[]>(() => editableTiersFromConfig(row.pricingConfig));
  const [videoVariants, setVideoVariants] = useState<EditableVideoPricingVariant[]>(() =>
    editableVideoVariantsFromConfig(row.pricingConfig)
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleModeChange(value: AiModelPricingMode) {
    setPricingMode(value);
    setPricingUnit(defaultPricingUnit(value));
    if (value === "TOKEN_TIERED" && tiers.length === 0) {
      setTiers([blankPricingTier()]);
    }
    if (value === "VIDEO_SECONDS" && videoVariants.length === 0) {
      setVideoVariants([blankVideoVariant()]);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const pricingConfig = pricingConfigFromForm(
      formData,
      pricingMode,
      pricingUnit,
      tiers,
      videoVariants,
      row.pricingConfig
    );
    const pricingSummary = pricingSummaryForForm(pricingConfig, pricingMode, pricingUnit, formData);

    formData.set("pricingMode", pricingMode);
    formData.set("pricingUnit", pricingSummary.pricingUnit);
    formData.set("inputPrice", pricingSummary.inputPrice);
    formData.set("outputPrice", pricingSummary.outputPrice);
    formData.set("pricingConfig", pricingConfig ? JSON.stringify(pricingConfig) : "");

    if (pricingMode !== "TOKENS") {
      formData.set("pricingUnit", pricingSummary.pricingUnit);
    }

    startTransition(async () => {
      try {
        if (row.modelInstanceId) {
          await updateAiModelInstanceAction(formData);
        } else {
          await enableAiModelPresetAction(formData);
        }
        onSaved();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存模型配置失败。");
      }
    });
  }

  return (
    <ModalShell title={row.modelInstanceId || row.modelPresetId ? "编辑模型" : "新增模型"} onClose={onClose}>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <input name="providerId" type="hidden" value={providerId} />
        <input name="modelPresetId" type="hidden" value={row.modelPresetId ?? ""} />
        <input name="id" type="hidden" value={row.modelInstanceId ?? ""} />
        {message ? (
          <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="model-display-name">展示名</FieldLabel>
            <Input id="model-display-name" name="displayName" defaultValue={row.displayName} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="model-provider-name">模型名</FieldLabel>
            <Input id="model-provider-name" name="providerModelName" defaultValue={row.providerModelName} required />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="model-base-url">模型 Base URL</FieldLabel>
            <Input id="model-base-url" name="baseUrl" defaultValue={row.baseUrl} />
            <FieldDescription>同一供应商不同模型可使用不同端点；留空表示使用 Provider 默认 Base URL。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="model-websocket-url">模型 WebSocket URL</FieldLabel>
            <Input id="model-websocket-url" name="webSocketUrl" defaultValue={row.webSocketUrl} />
          </Field>
          <Field>
            <FieldLabel htmlFor="model-region">模型地域</FieldLabel>
            <Input id="model-region" name="region" defaultValue={row.region} />
          </Field>
          <Field>
            <FieldLabel htmlFor="model-api-key">模型独立 API Key</FieldLabel>
            <Input id="model-api-key" name="apiKey" placeholder={row.hasCustomApiKey ? "留空表示不更新独立密钥" : "留空使用 Provider 默认密钥"} type="password" />
            <FieldDescription>当前：{row.apiKeyPreview}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>密钥策略</FieldLabel>
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-input px-3 text-sm">
              <input defaultChecked={false} name="clearApiKey" type="checkbox" />
              清除独立 API Key，改用 Provider 默认
            </label>
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="model-capabilities">能力标签</FieldLabel>
            <Input id="model-capabilities" name="capabilityTags" defaultValue={row.capabilityTags.join(",")} />
            <FieldDescription>多个标签用英文逗号分隔。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="model-pricing-mode">定价模式</FieldLabel>
            <Select
              id="model-pricing-mode"
              name="pricingMode"
              onChange={(event) => handleModeChange(event.target.value as AiModelPricingMode)}
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
              <FieldLabel htmlFor="model-pricing-unit">计费单位</FieldLabel>
              <Select
                id="model-pricing-unit"
                name="pricingUnit"
                onChange={(event) => setPricingUnit(event.target.value as AiModelPricingUnit)}
                value={pricingUnit}
              >
                {tokenUnitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : pricingMode === "TOKEN_CACHE" || pricingMode === "TOKEN_TIERED" ? (
            <input name="pricingUnit" type="hidden" value="M_TOKENS" />
          ) : pricingMode === "VIDEO_SECONDS" ? (
            <input name="pricingUnit" type="hidden" value="SECOND" />
          ) : (
            <input name="pricingUnit" type="hidden" value={pricingUnit} />
          )}
          {pricingMode === "TOKEN_CACHE" ? (
            <CachePricingFields config={row.pricingConfig} row={row} />
          ) : pricingMode === "TOKEN_TIERED" ? (
            <TieredPricingFields setTiers={setTiers} tiers={tiers} />
          ) : pricingMode === "VIDEO_SECONDS" ? (
            <VideoPricingFields setVideoVariants={setVideoVariants} videoVariants={videoVariants} />
          ) : (
            <BasicPricingFields pricingMode={pricingMode} row={row} />
          )}
        </FieldGroup>
        <label className="flex items-center gap-2 text-sm">
          <input defaultChecked={row.isEnabled} name="isEnabled" type="checkbox" />
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

function BasicPricingFields({ pricingMode, row }: { pricingMode: AiModelPricingMode; row: ModelRow }) {
  const hasSeparateOutputPrice = pricingMode === "TOKENS" || pricingMode === "IMAGES";

  return (
    <>
      <Field>
        <FieldLabel htmlFor="model-input-price">
          {pricingMode === "IMAGES" ? "输入图片单价" : pricingMode === "TOKENS" ? "输入价格" : "单价"}
        </FieldLabel>
        <Input
          defaultValue={row.inputPrice}
          id="model-input-price"
          min="0"
          name="inputPrice"
          step="0.000001"
          type="number"
        />
      </Field>
      {hasSeparateOutputPrice ? (
        <Field>
          <FieldLabel htmlFor="model-output-price">{pricingMode === "IMAGES" ? "输出图片单价" : "输出价格"}</FieldLabel>
          <Input
            defaultValue={row.outputPrice}
            id="model-output-price"
            min="0"
            name="outputPrice"
            step="0.000001"
            type="number"
          />
        </Field>
      ) : (
        <input name="outputPrice" type="hidden" value="0" />
      )}
    </>
  );
}

function CachePricingFields({ config, row }: { config: AiModelPricingConfig | null; row: ModelRow }) {
  const cacheConfig = config?.mode === "TOKEN_CACHE" ? config : null;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="model-cache-hit-price">缓存命中输入价</FieldLabel>
        <Input
          defaultValue={cacheConfig?.inputCacheHit ?? "0"}
          id="model-cache-hit-price"
          min="0"
          name="inputCacheHit"
          step="0.000001"
          type="number"
        />
        <FieldDescription>单位：人民币 / M tokens。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="model-cache-miss-price">缓存未命中输入价</FieldLabel>
        <Input
          defaultValue={cacheConfig?.inputCacheMiss ?? row.inputPrice}
          id="model-cache-miss-price"
          min="0"
          name="inputCacheMiss"
          step="0.000001"
          type="number"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="model-cache-output-price">输出价格</FieldLabel>
        <Input
          defaultValue={cacheConfig?.output ?? row.outputPrice}
          id="model-cache-output-price"
          min="0"
          name="cacheOutput"
          step="0.000001"
          type="number"
        />
      </Field>
      <input name="inputPrice" type="hidden" value={cacheConfig?.inputCacheMiss ?? row.inputPrice} />
      <input name="outputPrice" type="hidden" value={cacheConfig?.output ?? row.outputPrice} />
    </>
  );
}

function TieredPricingFields({
  tiers,
  setTiers
}: {
  tiers: EditablePricingTier[];
  setTiers: (tiers: EditablePricingTier[]) => void;
}) {
  return (
    <Field className="md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>阶梯价格</FieldLabel>
        <Button
          onClick={() => setTiers([...tiers, blankPricingTier()])}
          size="sm"
          type="button"
          variant="outline"
        >
          增加阶梯
        </Button>
      </div>
      <FieldDescription>按单次请求输入 Token 总量选中阶梯，单位：人民币 / M tokens。</FieldDescription>
      <div className="mt-3 flex flex-col gap-3">
        {tiers.map((tier, index) => (
          <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto]" key={tier.id}>
            <Input
              aria-label="阶梯名称"
              name={`tierLabel-${index}`}
              onChange={(event) => setTiers(replaceTier(tiers, index, { label: event.target.value }))}
              placeholder="阶梯名称"
              value={tier.label}
            />
            <Input
              aria-label="起始输入 tokens"
              min="0"
              name={`tierMin-${index}`}
              onChange={(event) => setTiers(replaceTier(tiers, index, { minInputTokens: event.target.value }))}
              placeholder="起始 tokens"
              type="number"
              value={tier.minInputTokens}
            />
            <Input
              aria-label="截止输入 tokens"
              min="0"
              name={`tierMax-${index}`}
              onChange={(event) => setTiers(replaceTier(tiers, index, { maxInputTokens: event.target.value }))}
              placeholder="空为不限"
              type="number"
              value={tier.maxInputTokens}
            />
            <Input
              aria-label="输入价格"
              min="0"
              name={`tierInput-${index}`}
              onChange={(event) => setTiers(replaceTier(tiers, index, { input: event.target.value }))}
              placeholder="输入价"
              step="0.000001"
              type="number"
              value={tier.input}
            />
            <Input
              aria-label="输出价格"
              min="0"
              name={`tierOutput-${index}`}
              onChange={(event) => setTiers(replaceTier(tiers, index, { output: event.target.value }))}
              placeholder="输出价"
              step="0.000001"
              type="number"
              value={tier.output}
            />
            <Button
              disabled={tiers.length <= 1}
              onClick={() => setTiers(tiers.filter((_, tierIndex) => tierIndex !== index))}
              size="sm"
              type="button"
              variant="ghost"
            >
              删除
            </Button>
            <Input
              aria-label="思考输出价格"
              className="md:col-span-2"
              min="0"
              name={`tierReasoningOutput-${index}`}
              onChange={(event) => setTiers(replaceTier(tiers, index, { reasoningOutput: event.target.value }))}
              placeholder="思考输出价，可空"
              step="0.000001"
              type="number"
              value={tier.reasoningOutput}
            />
            <Input
              aria-label="隐式缓存命中价格"
              min="0"
              onChange={(event) => setTiers(replaceTier(tiers, index, { inputCacheHit: event.target.value }))}
              placeholder="隐式缓存命中价，可空"
              step="0.000001"
              type="number"
              value={tier.inputCacheHit}
            />
            <Input
              aria-label="显式缓存命中价格"
              min="0"
              onChange={(event) => setTiers(replaceTier(tiers, index, { inputCacheHitExplicit: event.target.value }))}
              placeholder="显式缓存命中价，可空"
              step="0.000001"
              type="number"
              value={tier.inputCacheHitExplicit}
            />
            <Input
              aria-label="显式缓存创建价格"
              min="0"
              onChange={(event) => setTiers(replaceTier(tiers, index, { inputCacheCreation: event.target.value }))}
              placeholder="显式缓存创建价，可空"
              step="0.000001"
              type="number"
              value={tier.inputCacheCreation}
            />
          </div>
        ))}
      </div>
      <input name="inputPrice" type="hidden" value={tiers[0]?.input ?? "0"} />
      <input name="outputPrice" type="hidden" value={tiers[0]?.output ?? "0"} />
    </Field>
  );
}

function VideoPricingFields({
  videoVariants,
  setVideoVariants
}: {
  videoVariants: EditableVideoPricingVariant[];
  setVideoVariants: (variants: EditableVideoPricingVariant[]) => void;
}) {
  return (
    <Field className="md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>视频价格档位</FieldLabel>
        <Button
          onClick={() => setVideoVariants([...videoVariants, blankVideoVariant()])}
          size="sm"
          type="button"
          variant="outline"
        >
          增加档位
        </Button>
      </div>
      <FieldDescription>
        适用于按输出视频秒数计费的模型；如果官方区分输入和输出秒价，可同时填写输入价格。
      </FieldDescription>
      <div className="mt-3 flex flex-col gap-3">
        {videoVariants.map((variant, index) => (
          <div
            className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1.1fr_0.8fr_0.8fr_1fr_0.7fr_1fr_1fr_auto]"
            key={variant.id}
          >
            <Input
              aria-label="档位名称"
              name={`videoLabel-${index}`}
              onChange={(event) => setVideoVariants(replaceVideoVariant(videoVariants, index, { label: event.target.value }))}
              placeholder="档位名称"
              value={variant.label}
            />
            <Select
              aria-label="清晰度"
              name={`videoResolution-${index}`}
              onChange={(event) => setVideoVariants(replaceVideoVariant(videoVariants, index, { resolution: event.target.value }))}
              value={variant.resolution}
            >
              {videoResolutionOptions.map((resolution) => (
                <option key={resolution} value={resolution}>
                  {resolution}
                </option>
              ))}
            </Select>
            <Select
              aria-label="生成方式"
              name={`videoJobMode-${index}`}
              onChange={(event) => setVideoVariants(replaceVideoVariant(videoVariants, index, { jobMode: event.target.value as VideoJobMode }))}
              value={variant.jobMode}
            >
              {videoJobModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="任务类型"
              name={`videoTaskType-${index}`}
              onChange={(event) => setVideoVariants(replaceVideoVariant(videoVariants, index, { taskType: event.target.value as VideoTaskType }))}
              value={variant.taskType}
            >
              {videoTaskTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground">
              <input
                checked={variant.withAudio}
                name={`videoWithAudio-${index}`}
                onChange={(event) => setVideoVariants(replaceVideoVariant(videoVariants, index, { withAudio: event.target.checked }))}
                type="checkbox"
              />
              有声
            </label>
            <Input
              aria-label="输入价格"
              min="0"
              name={`videoInput-${index}`}
              onChange={(event) => setVideoVariants(replaceVideoVariant(videoVariants, index, { input: event.target.value }))}
              placeholder="输入元/秒"
              step="0.000001"
              type="number"
              value={variant.input}
            />
            <Input
              aria-label="输出价格"
              min="0"
              name={`videoOutput-${index}`}
              onChange={(event) => setVideoVariants(replaceVideoVariant(videoVariants, index, { output: event.target.value }))}
              placeholder="输出元/秒"
              step="0.000001"
              type="number"
              value={variant.output}
            />
            <Button
              disabled={videoVariants.length <= 1}
              onClick={() => setVideoVariants(videoVariants.filter((_, variantIndex) => variantIndex !== index))}
              size="sm"
              type="button"
              variant="ghost"
            >
              删除
            </Button>
            <Input
              aria-label="备注"
              className="md:col-span-8"
              name={`videoNote-${index}`}
              onChange={(event) => setVideoVariants(replaceVideoVariant(videoVariants, index, { note: event.target.value }))}
              placeholder="备注，例如：仅批量任务、含首尾帧、官方价格页版本"
              value={variant.note}
            />
          </div>
        ))}
      </div>
      <input name="inputPrice" type="hidden" value={videoVariants[0]?.input ?? "0"} />
      <input name="outputPrice" type="hidden" value={videoVariants[0]?.output ?? "0"} />
    </Field>
  );
}

function DeleteModelModal({
  providerId,
  state,
  onClose,
  onDeleted
}: {
  providerId: string;
  state: {
    row: ModelRow;
    check: AiModelInstanceDeleteCheck;
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
    if (!state.row.modelInstanceId || countdown > 0) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteAiModelInstanceAction(state.row.modelInstanceId as string, providerId);
        onDeleted();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "删除模型失败。");
      }
    });
  }

  return (
    <ModalShell title="删除模型" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {message ? (
          <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}
        <div className="rounded-md border border-border bg-background p-4">
          <p className="font-medium">{state.row.displayName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.row.providerModelName}</p>
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
              该模型没有绑定场景。删除会同时解除相关默认模型绑定，操作不可撤销。
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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-border bg-card shadow-lg">
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

function buildRows(provider: AiProviderPreset): ModelRow[] {
  const instances = provider.instance?.modelInstances ?? [];
  const providerBaseUrl = provider.instance?.baseUrl ?? provider.defaultBaseUrl;
  const providerWebSocketUrl = provider.instance?.webSocketUrl ?? provider.defaultWebSocketUrl ?? "";
  const providerRegion = provider.instance?.region ?? provider.region?.split(",")[0] ?? "";
  const presetRows = provider.modelPresets.map((preset) => {
    const instance = instances.find((item) => item.modelPresetId === preset.id);
    const capabilityTags = instance?.capabilityTags ?? preset.capabilityTags;
    const pricingConfig = instance?.pricingConfig ?? preset.pricingConfig ?? null;
    const pricingMode = inferPricingMode(pricingConfig, instance?.pricingMode, capabilityTags);

    return {
      rowKey: instance?.id ?? preset.id,
      modelPresetId: preset.id,
      modelInstanceId: instance?.id ?? null,
      displayName: instance?.displayName ?? preset.displayName,
      providerModelName: instance?.providerModelName ?? preset.providerModelName,
      baseUrl: instance?.baseUrl ?? providerBaseUrl,
      webSocketUrl: instance?.webSocketUrl ?? providerWebSocketUrl,
      region: instance?.region ?? providerRegion,
      hasCustomApiKey: instance?.hasCustomApiKey ?? false,
      apiKeyPreview: instance?.apiKeyPreview ?? "使用 Provider 默认",
      capabilityTags,
      inputPrice: instance?.inputPrice ?? "0",
      outputPrice: instance?.outputPrice ?? "0",
      pricingMode,
      pricingUnit: inferPricingUnit(pricingConfig, instance?.pricingUnit, pricingMode),
      pricingConfig,
      isEnabled: instance?.isEnabled ?? false,
      isDeprecated: preset.isDeprecated,
      deprecatedMessage: preset.deprecatedMessage,
      isConfigured: Boolean(instance)
    } satisfies ModelRow;
  });
  const presetIds = new Set(provider.modelPresets.map((preset) => preset.id));
  const orphanRows = instances
    .filter((instance) => !instance.modelPresetId || !presetIds.has(instance.modelPresetId))
    .map((instance) => {
      const pricingMode = inferPricingMode(instance.pricingConfig, instance.pricingMode, instance.capabilityTags);

      return {
        rowKey: instance.id,
        modelPresetId: instance.modelPresetId,
        modelInstanceId: instance.id,
        displayName: instance.displayName,
        providerModelName: instance.providerModelName,
        baseUrl: instance.baseUrl ?? providerBaseUrl,
        webSocketUrl: instance.webSocketUrl ?? providerWebSocketUrl,
        region: instance.region ?? providerRegion,
        hasCustomApiKey: instance.hasCustomApiKey,
        apiKeyPreview: instance.apiKeyPreview,
        capabilityTags: instance.capabilityTags,
        inputPrice: instance.inputPrice,
        outputPrice: instance.outputPrice,
        pricingMode,
        pricingUnit: inferPricingUnit(instance.pricingConfig, instance.pricingUnit, pricingMode),
        pricingConfig: instance.pricingConfig,
        isEnabled: instance.isEnabled,
        isDeprecated: false,
        deprecatedMessage: null,
        isConfigured: true
      } satisfies ModelRow;
    });

  return [...presetRows, ...orphanRows];
}

function blankModelRow(provider: AiProviderPreset): ModelRow {
  return {
    rowKey: `new-${provider.id}`,
    modelPresetId: null,
    modelInstanceId: null,
    displayName: "",
    providerModelName: "",
    baseUrl: provider.instance?.baseUrl ?? provider.defaultBaseUrl,
    webSocketUrl: provider.instance?.webSocketUrl ?? provider.defaultWebSocketUrl ?? "",
    region: provider.instance?.region ?? provider.region?.split(",")[0] ?? "",
    hasCustomApiKey: false,
    apiKeyPreview: "使用 Provider 默认",
    capabilityTags: [],
    inputPrice: "0",
    outputPrice: "0",
    pricingMode: "TOKENS",
    pricingUnit: "K_TOKENS",
    pricingConfig: null,
    isEnabled: true,
    isDeprecated: false,
    deprecatedMessage: null,
    isConfigured: false
  };
}

function inferPricingMode(
  pricingConfig: AiModelPricingConfig | null,
  storedMode: AiModelPricingMode | undefined,
  capabilityTags: string[]
): AiModelPricingMode {
  if (pricingConfig?.mode) {
    return pricingConfig.mode;
  }

  if (storedMode && storedMode !== "TOKENS") {
    return storedMode;
  }

  return capabilityTags.includes("VIDEO_GENERATION") ? "VIDEO_SECONDS" : storedMode ?? "TOKENS";
}

function inferPricingUnit(
  pricingConfig: AiModelPricingConfig | null,
  storedUnit: AiModelPricingUnit | undefined,
  pricingMode: AiModelPricingMode
): AiModelPricingUnit {
  if (pricingConfig?.mode === "TOKENS") {
    return pricingConfig.unit;
  }

  if (pricingConfig?.mode === "TOKEN_CACHE" || pricingConfig?.mode === "TOKEN_TIERED") {
    return "M_TOKENS";
  }

  if (pricingConfig?.mode === "VIDEO_SECONDS" || pricingMode === "VIDEO_SECONDS") {
    return "SECOND";
  }

  return storedUnit ?? defaultPricingUnit(pricingMode);
}

function rowToFormData(providerId: string, row: ModelRow, overrides: Partial<ModelRow> = {}) {
  const next = {
    ...row,
    ...overrides
  };
  const formData = new FormData();
  formData.set("providerId", providerId);
  formData.set("modelPresetId", next.modelPresetId ?? "");
  formData.set("id", next.modelInstanceId ?? "");
  formData.set("displayName", next.displayName);
  formData.set("providerModelName", next.providerModelName);
  formData.set("baseUrl", next.baseUrl);
  formData.set("webSocketUrl", next.webSocketUrl);
  formData.set("region", next.region);
  formData.set("capabilityTags", next.capabilityTags.join(","));
  formData.set("inputPrice", next.inputPrice);
  formData.set("outputPrice", next.outputPrice);
  formData.set("pricingMode", next.pricingMode);
  formData.set("pricingUnit", next.pricingUnit);
  formData.set("pricingConfig", next.pricingConfig ? JSON.stringify(next.pricingConfig) : "");

  if (next.isEnabled) {
    formData.set("isEnabled", "on");
  }

  return formData;
}

function formatPrice(row: ModelRow, tokenViewUnit: TokenPriceViewUnit) {
  if (row.pricingConfig?.mode === "TOKEN_CACHE") {
    const hit = convertTokenPrice(row.pricingConfig.inputCacheHit, "M_TOKENS", tokenViewUnit);
    const miss = convertTokenPrice(row.pricingConfig.inputCacheMiss, "M_TOKENS", tokenViewUnit);
    const output = convertTokenPrice(row.pricingConfig.output, "M_TOKENS", tokenViewUnit);
    const unitName = tokenViewUnit === "K_TOKENS" ? "k tokens" : "M tokens";

    return `命中 ¥${formatMoney(hit)} / 未命中 ¥${formatMoney(miss)} / 输出 ¥${formatMoney(output)} / ${unitName}`;
  }

  if (row.pricingConfig?.mode === "TOKEN_TIERED") {
    const unitName = tokenViewUnit === "K_TOKENS" ? "k tokens" : "M tokens";
    const tiers = row.pricingConfig.tiers
      .slice(0, 2)
      .map((tier) => {
        const input = convertTokenPrice(tier.input, "M_TOKENS", tokenViewUnit);
        const output = convertTokenPrice(tier.output, "M_TOKENS", tokenViewUnit);
        const cacheHit =
          tier.inputCacheHit === null || tier.inputCacheHit === undefined
            ? ""
            : ` / 缓存命中 ¥${formatMoney(convertTokenPrice(tier.inputCacheHit, "M_TOKENS", tokenViewUnit))}`;

        return `${tier.label}：输入 ¥${formatMoney(input)}${cacheHit} / 输出 ¥${formatMoney(output)}`;
      })
      .join("；");

    return `${tiers}${row.pricingConfig.tiers.length > 2 ? "；..." : ""} / ${unitName}`;
  }

  if (row.pricingConfig?.mode === "VIDEO_SECONDS") {
    const variants = row.pricingConfig.variants
      .slice(0, 2)
      .map((variant) => {
        const inputText = variant.input > 0 ? `输入 ¥${formatMoney(variant.input)} / ` : "";

        return `${variant.label}：${inputText}输出 ¥${formatMoney(variant.output)} / 秒`;
      })
      .join("；");

    return `${variants}${row.pricingConfig.variants.length > 2 ? "；..." : ""}`;
  }

  if (row.pricingMode === "TOKENS") {
    const inputPrice = convertTokenPrice(Number(row.inputPrice || 0), row.pricingUnit, tokenViewUnit);
    const outputPrice = convertTokenPrice(Number(row.outputPrice || 0), row.pricingUnit, tokenViewUnit);

    return `输入 ¥${formatMoney(inputPrice)} / 输出 ¥${formatMoney(outputPrice)} / ${tokenViewUnit === "K_TOKENS" ? "k tokens" : "M tokens"}`;
  }

  if (row.pricingMode === "VIDEO_SECONDS") {
    return "未设置视频价格";
  }

  return `¥${formatMoney(Number(row.inputPrice || 0))} / ${pricingUnitName(row.pricingUnit)}`;
}

function editableTiersFromConfig(config: AiModelPricingConfig | null): EditablePricingTier[] {
  if (config?.mode !== "TOKEN_TIERED") {
    return [blankPricingTier()];
  }

  return config.tiers.map((tier) => ({
    id: Math.random().toString(36).slice(2),
    label: tier.label,
    minInputTokens: String(tier.minInputTokens),
    maxInputTokens: tier.maxInputTokens === null ? "" : String(tier.maxInputTokens),
    input: String(tier.input),
    output: String(tier.output),
    reasoningOutput: tier.reasoningOutput === null || tier.reasoningOutput === undefined ? "" : String(tier.reasoningOutput),
    inputCacheHit: tier.inputCacheHit === null || tier.inputCacheHit === undefined ? "" : String(tier.inputCacheHit),
    inputCacheHitExplicit:
      tier.inputCacheHitExplicit === null || tier.inputCacheHitExplicit === undefined ? "" : String(tier.inputCacheHitExplicit),
    inputCacheCreation:
      tier.inputCacheCreation === null || tier.inputCacheCreation === undefined ? "" : String(tier.inputCacheCreation)
  }));
}

function blankPricingTier(): EditablePricingTier {
  return {
    id: Math.random().toString(36).slice(2),
    label: "输入 <= 128K",
    minInputTokens: "0",
    maxInputTokens: "128000",
    input: "0",
    output: "0",
    reasoningOutput: "",
    inputCacheHit: "",
    inputCacheHitExplicit: "",
    inputCacheCreation: ""
  };
}

function replaceTier(tiers: EditablePricingTier[], index: number, patch: Partial<EditablePricingTier>) {
  return tiers.map((tier, tierIndex) => (tierIndex === index ? { ...tier, ...patch } : tier));
}

function editableVideoVariantsFromConfig(config: AiModelPricingConfig | null): EditableVideoPricingVariant[] {
  if (config?.mode !== "VIDEO_SECONDS") {
    return [blankVideoVariant()];
  }

  return config.variants.map((variant) => ({
    id: Math.random().toString(36).slice(2),
    label: variant.label,
    resolution: variant.resolution,
    jobMode: variant.jobMode,
    taskType: variant.taskType,
    withAudio: variant.withAudio,
    input: String(variant.input),
    output: String(variant.output),
    note: variant.note ?? ""
  }));
}

function blankVideoVariant(): EditableVideoPricingVariant {
  return {
    id: Math.random().toString(36).slice(2),
    label: "720P 标准文生视频",
    resolution: "720P",
    jobMode: "STANDARD",
    taskType: "TEXT_TO_VIDEO",
    withAudio: false,
    input: "0",
    output: "0",
    note: ""
  };
}

function replaceVideoVariant(
  variants: EditableVideoPricingVariant[],
  index: number,
  patch: Partial<EditableVideoPricingVariant>
) {
  return variants.map((variant, variantIndex) => (variantIndex === index ? { ...variant, ...patch } : variant));
}

function videoVariantName(variant: EditableVideoPricingVariant) {
  const jobMode = videoJobModeOptions.find((option) => option.value === variant.jobMode)?.label ?? "标准";
  const taskType = videoTaskTypeOptions.find((option) => option.value === variant.taskType)?.label ?? "文生视频";

  return `${variant.resolution} ${jobMode}${taskType}${variant.withAudio ? " 有声" : ""}`;
}

function pricingConfigFromForm(
  formData: FormData,
  pricingMode: AiModelPricingMode,
  pricingUnit: AiModelPricingUnit,
  tiers: EditablePricingTier[],
  videoVariants: EditableVideoPricingVariant[],
  originalConfig: AiModelPricingConfig | null
): AiModelPricingConfig | null {
  if (pricingMode === "TOKEN_CACHE") {
    return {
      mode: "TOKEN_CACHE",
      currency: "CNY",
      unit: "M_TOKENS",
      inputCacheHit: numberFromForm(formData, "inputCacheHit"),
      inputCacheMiss: numberFromForm(formData, "inputCacheMiss"),
      output: numberFromForm(formData, "cacheOutput"),
      source: originalConfig?.mode === "TOKEN_CACHE" ? originalConfig.source : undefined,
      note: originalConfig?.mode === "TOKEN_CACHE" ? originalConfig.note : undefined
    };
  }

  if (pricingMode === "TOKEN_TIERED") {
    return {
      mode: "TOKEN_TIERED",
      currency: "CNY",
      unit: "M_TOKENS",
      tierBasis: "REQUEST_INPUT_TOKENS",
      tiers: tiers.map((tier) => ({
        label: tier.label.trim() || "默认阶梯",
        minInputTokens: integerFromText(tier.minInputTokens),
        maxInputTokens: tier.maxInputTokens.trim() ? integerFromText(tier.maxInputTokens) : null,
        input: numberFromText(tier.input),
        output: numberFromText(tier.output),
        reasoningOutput: tier.reasoningOutput.trim() ? numberFromText(tier.reasoningOutput) : null,
        inputCacheHit: tier.inputCacheHit.trim() ? numberFromText(tier.inputCacheHit) : null,
        inputCacheHitExplicit: tier.inputCacheHitExplicit.trim() ? numberFromText(tier.inputCacheHitExplicit) : null,
        inputCacheCreation: tier.inputCacheCreation.trim() ? numberFromText(tier.inputCacheCreation) : null
      })),
      source: originalConfig?.mode === "TOKEN_TIERED" ? originalConfig.source : undefined,
      note: originalConfig?.mode === "TOKEN_TIERED" ? originalConfig.note : undefined
    };
  }

  if (pricingMode === "TOKENS") {
    return {
      mode: "TOKENS",
      currency: "CNY",
      unit: pricingUnit === "M_TOKENS" ? "M_TOKENS" : "K_TOKENS",
      input: numberFromForm(formData, "inputPrice"),
      output: numberFromForm(formData, "outputPrice"),
      source: originalConfig?.mode === "TOKENS" ? originalConfig.source : undefined,
      note: originalConfig?.mode === "TOKENS" ? originalConfig.note : undefined
    };
  }

  if (pricingMode === "IMAGES") {
    return {
      mode: "IMAGES",
      currency: "CNY",
      unit: "IMAGE",
      input: numberFromForm(formData, "inputPrice"),
      output: numberFromForm(formData, "outputPrice"),
      source: originalConfig?.mode === "IMAGES" ? originalConfig.source : undefined,
      note: originalConfig?.mode === "IMAGES" ? originalConfig.note : undefined
    };
  }

  if (pricingMode === "VIDEO_SECONDS") {
    const variants = videoVariants.map((variant) => ({
      label: variant.label.trim() || videoVariantName(variant),
      resolution: variant.resolution,
      jobMode: variant.jobMode,
      taskType: variant.taskType,
      withAudio: variant.withAudio,
      input: numberFromText(variant.input),
      output: numberFromText(variant.output),
      note: variant.note.trim() || undefined
    }));

    return {
      mode: "VIDEO_SECONDS",
      currency: "CNY",
      unit: "SECOND",
      billingBasis: variants.some((variant) => variant.input > 0) ? "INPUT_OUTPUT_SECONDS" : "OUTPUT_SECONDS",
      variants,
      source: originalConfig?.mode === "VIDEO_SECONDS" ? originalConfig.source : undefined,
      note: originalConfig?.mode === "VIDEO_SECONDS" ? originalConfig.note : undefined
    };
  }

  return null;
}

function pricingSummaryForForm(
  pricingConfig: AiModelPricingConfig | null,
  pricingMode: AiModelPricingMode,
  pricingUnit: AiModelPricingUnit,
  formData: FormData
) {
  if (pricingConfig?.mode === "TOKEN_CACHE") {
    return {
      inputPrice: String(pricingConfig.inputCacheMiss),
      outputPrice: String(pricingConfig.output),
      pricingMode: "TOKEN_CACHE",
      pricingUnit: "M_TOKENS"
    };
  }

  if (pricingConfig?.mode === "TOKEN_TIERED") {
    const firstTier = pricingConfig.tiers[0];

    return {
      inputPrice: String(firstTier?.input ?? 0),
      outputPrice: String(firstTier?.output ?? 0),
      pricingMode: "TOKEN_TIERED",
      pricingUnit: "M_TOKENS"
    };
  }

  if (pricingConfig?.mode === "VIDEO_SECONDS") {
    const firstVariant = pricingConfig.variants[0];

    return {
      inputPrice: String(firstVariant?.input ?? 0),
      outputPrice: String(firstVariant?.output ?? 0),
      pricingMode: "VIDEO_SECONDS",
      pricingUnit: "SECOND"
    };
  }

  if (pricingConfig?.mode === "IMAGES") {
    return {
      inputPrice: String(pricingConfig.input),
      outputPrice: String(pricingConfig.output),
      pricingMode: "IMAGES",
      pricingUnit: "IMAGE"
    };
  }

  return {
    inputPrice: String(numberFromForm(formData, "inputPrice")),
    outputPrice: pricingMode === "TOKENS" || pricingMode === "IMAGES" ? String(numberFromForm(formData, "outputPrice")) : "0",
    pricingMode,
    pricingUnit
  };
}

function numberFromForm(formData: FormData, name: string) {
  return numberFromText(String(formData.get(name) ?? ""));
}

function numberFromText(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function integerFromText(value: string) {
  return Math.max(0, Math.round(numberFromText(value)));
}

function convertTokenPrice(value: number, fromUnit: AiModelPricingUnit, toUnit: TokenPriceViewUnit) {
  if (fromUnit === toUnit) {
    return value;
  }

  if (fromUnit === "K_TOKENS" && toUnit === "M_TOKENS") {
    return value * 1000;
  }

  if (fromUnit === "M_TOKENS" && toUnit === "K_TOKENS") {
    return value / 1000;
  }

  return value;
}

function defaultPricingUnit(mode: AiModelPricingMode): AiModelPricingUnit {
  const units: Record<AiModelPricingMode, AiModelPricingUnit> = {
    TOKENS: "K_TOKENS",
    TOKEN_CACHE: "M_TOKENS",
    TOKEN_TIERED: "M_TOKENS",
    REQUEST: "REQUEST",
    CHARACTERS: "CHARACTER",
    IMAGES: "IMAGE",
    SECONDS: "SECOND",
    VIDEO_SECONDS: "SECOND"
  };

  return units[mode];
}

function pricingUnitName(unit: AiModelPricingUnit) {
  const names: Record<AiModelPricingUnit, string> = {
    K_TOKENS: "k tokens",
    M_TOKENS: "M tokens",
    REQUEST: "次",
    CHARACTER: "字符",
    K_CHARACTERS: "千字符",
    TEN_K_CHARACTERS: "万字符",
    IMAGE: "张",
    SECOND: "秒"
  };

  return names[unit];
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toLocaleString("zh-CN", {
    maximumFractionDigits: 6
  });
}

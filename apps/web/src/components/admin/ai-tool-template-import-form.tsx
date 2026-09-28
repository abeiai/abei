"use client";

import { useState, useTransition } from "react";
import { Eye, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  importAiToolTemplateAction,
  previewAiToolTemplateImportAction,
  type AiToolTemplateImportResult,
  type AiToolTemplatePreview
} from "@/lib/ai-admin-api";

export function AiToolTemplateImportForm() {
  const [payload, setPayload] = useState("");
  const [preview, setPreview] = useState<AiToolTemplatePreview | null>(null);
  const [result, setResult] = useState<AiToolTemplateImportResult | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function buildFormData() {
    const formData = new FormData();
    formData.set("payload", payload);
    formData.set("skipConflicts", "on");

    return formData;
  }

  function runPreview() {
    setError("");
    setResult(null);
    startTransition(async () => {
      try {
        setPreview(await previewAiToolTemplateImportAction(buildFormData()));
      } catch (error) {
        setPreview(null);
        setError(error instanceof Error ? error.message : "预览失败");
      }
    });
  }

  function runImport() {
    setError("");
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await importAiToolTemplateAction(buildFormData()));
      } catch (error) {
        setError(error instanceof Error ? error.message : "导入失败");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="payload">模板 JSON</FieldLabel>
          <Textarea
            id="payload"
            name="payload"
            onChange={(event) => setPayload(event.target.value)}
            placeholder='{"templates":[{"name":"场景应用","slug":"scenario-app","category":{"name":"写作","slug":"writing"},"inputSchema":{"fields":[{"name":"input","label":"输入内容","type":"textarea","required":true}]},"promptTemplate":"请处理：{input}"}]}'
            rows={12}
            value={payload}
          />
          <FieldDescription>支持单个 template、templates 数组或导出的完整 JSON。</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap gap-3">
        <Button disabled={isPending || !payload.trim()} onClick={runPreview} type="button" variant="outline">
          <Eye data-icon="inline-start" />
          预览导入
        </Button>
        <Button disabled={isPending || !payload.trim()} onClick={runImport} type="button">
          <Upload data-icon="inline-start" />
          执行导入
        </Button>
      </div>
      {error ? (
        <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
          {error}
        </div>
      ) : null}
      {preview ? (
        <div className="rounded-md border border-border bg-background p-4 text-sm">
          <p className="font-medium">
            预览结果：可创建 {preview.createCount} 个，冲突 {preview.conflictCount} 个
          </p>
          <div className="mt-3 grid gap-2">
            {preview.items.map((item) => (
              <div className="flex items-center justify-between gap-3" key={item.slug}>
                <span>{item.name}</span>
                <span className="text-muted-foreground">{item.message}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {result ? (
        <div className="rounded-md border border-border bg-background p-4 text-sm">
          导入完成：新增 {result.createdCount} 个，跳过 {result.skippedCount} 个。
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { ImagePlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MediaAsset } from "@/lib/media-api";
import { cn } from "@/lib/utils";

type VditorHandle = {
  destroy: () => void;
  getValue: () => string;
  insertValue: (value: string, render?: boolean) => void;
};

interface VditorEditorProps {
  className?: string;
  defaultValue?: string;
  description?: string;
  label?: string;
  mediaAssets?: MediaAsset[];
  minHeight?: number;
  name: string;
  placeholder?: string;
  required?: boolean;
}

function imageMarkdown(asset: MediaAsset) {
  const alt = asset.originalName.replace(/\.[a-z0-9]+$/i, "") || "图片";

  return `\n\n![${alt}](${asset.url})\n\n`;
}

export function VditorEditor({
  className,
  defaultValue = "",
  description,
  label = "正文",
  mediaAssets = [],
  minHeight = 520,
  name,
  placeholder = "在这里开始撰写内容",
  required = false
}: VditorEditorProps) {
  const editorRef = useRef<VditorHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hiddenFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState(mediaAssets[0]?.id ?? "");

  const selectedMedia = useMemo(
    () => mediaAssets.find((asset) => asset.id === selectedMediaId) ?? null,
    [mediaAssets, selectedMediaId]
  );

  const syncHiddenValue = useCallback(() => {
    const nextValue = editorRef.current?.getValue() ?? hiddenFieldRef.current?.value ?? defaultValue;

    if (hiddenFieldRef.current) {
      hiddenFieldRef.current.value = nextValue;
    }

    return nextValue;
  }, [defaultValue]);

  useEffect(() => {
    let cancelled = false;

    setIsReady(false);
    setLoadError(false);

    void import("vditor")
      .then(({ default: Vditor }) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        const editor = new Vditor(containerRef.current, {
          after: () => {
            if (cancelled) {
              return;
            }

            syncHiddenValue();
            setIsReady(true);
          },
          cache: { enable: false },
          cdn: "/vendor/vditor",
          counter: { enable: true, type: "markdown" },
          height: minHeight,
          icon: "ant",
          input: (markdown: string) => {
            if (hiddenFieldRef.current) {
              hiddenFieldRef.current.value = markdown;
            }
          },
          lang: "zh_CN",
          mode: "ir",
          placeholder,
          preview: {
            hljs: { enable: false },
            markdown: {
              codeBlockPreview: false,
              mathBlockPreview: false
            },
            mode: "editor"
          },
          resize: { enable: true },
          toolbarConfig: { pin: true },
          value: defaultValue
        });

        editorRef.current = editor;
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
        }
      });

    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [defaultValue, minHeight, placeholder, syncHiddenValue]);

  useEffect(() => {
    const form = containerRef.current?.closest("form");

    if (!form) {
      return;
    }

    form.addEventListener("submit", syncHiddenValue);

    return () => {
      form.removeEventListener("submit", syncHiddenValue);
    };
  }, [syncHiddenValue]);

  function insertSelectedImage() {
    if (!selectedMedia || !editorRef.current) {
      return;
    }

    editorRef.current.insertValue(imageMarkdown(selectedMedia));
    syncHiddenValue();
  }

  if (loadError) {
    return (
      <Field className={className}>
        <FieldLabel>{label}</FieldLabel>
        <Textarea
          className="min-h-[520px] resize-y text-base leading-7"
          defaultValue={defaultValue}
          name={name}
          placeholder={placeholder}
          required={required}
        />
        <FieldDescription>Vditor 加载失败，已切换为普通正文输入框。</FieldDescription>
      </Field>
    );
  }

  return (
    <Field className={className}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <FieldLabel>{label}</FieldLabel>
          {description ? <FieldDescription>{description}</FieldDescription> : null}
        </div>
        {mediaAssets.length > 0 ? (
          <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-80 md:flex-row md:items-center">
            <Select value={selectedMediaId} onChange={(event) => setSelectedMediaId(event.target.value)}>
              {mediaAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.originalName}
                </option>
              ))}
            </Select>
            <Button type="button" variant="outline" onClick={insertSelectedImage} disabled={!isReady || !selectedMedia}>
              <ImagePlus data-icon="inline-start" />
              插入图片
            </Button>
          </div>
        ) : null}
      </div>
      <textarea ref={hiddenFieldRef} className="hidden" defaultValue={defaultValue} name={name} tabIndex={-1} />
      <div
        ref={containerRef}
        className={cn("xueleai-vditor min-h-[520px] overflow-hidden rounded-lg border border-input bg-card", className)}
      />
      {!isReady ? <FieldDescription>编辑器正在加载...</FieldDescription> : null}
    </Field>
  );
}

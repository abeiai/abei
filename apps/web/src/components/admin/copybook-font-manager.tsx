"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Plus, Save, Trash2, Type, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  deleteCopybookFontAction,
  updateCopybookFontAction,
  type CopybookFont
} from "@/lib/copybook-fonts-api";
import { copybookFontTemplateOptions, copybookTemplateLabel } from "@/lib/copybook-font-templates";

type FontModalState =
  | {
      type: "create";
    }
  | {
      font: CopybookFont;
      type: "edit";
    };

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

export function CopybookFontManager({ fonts }: { fonts: CopybookFont[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<FontModalState | null>(null);
  const [message, setMessage] = useState("");
  const [sortMessage, setSortMessage] = useState("");
  const [activeSortFontId, setActiveSortFontId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSortPending, startSortTransition] = useTransition();
  const orderedFonts = [...fonts].sort((current, next) => current.sortOrder - next.sortOrder || current.name.localeCompare(next.name, "zh-CN"));

  function closeModal() {
    if (!isPending) {
      setModal(null);
      setMessage("");
    }
  }

  function submitFont(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    if (modal?.type === "edit" && !hasSelectedFontFile(form)) {
      formData.delete("file");
    }

    setMessage("");
    startTransition(async () => {
      try {
        await saveCopybookFontViaApi(formData, modal);
        setModal(null);
        setSortMessage("");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "字体保存失败，请稍后重试。");
      }
    });
  }

  function submitSortOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const fontId = String(formData.get("id") ?? "");

    setSortMessage("");
    setActiveSortFontId(fontId);
    startSortTransition(async () => {
      try {
        await updateCopybookFontAction(formData);
        router.refresh();
      } catch (error) {
        setSortMessage(error instanceof Error ? error.message : "排序保存失败，请稍后重试。");
      } finally {
        setActiveSortFontId(null);
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <CardTitle>字体列表</CardTitle>
            <CardDescription>维护字帖字体的显示排序和适合模板。</CardDescription>
          </div>
          <Button onClick={() => setModal({ type: "create" })} type="button">
            <Plus data-icon="inline-start" />
            新增字体
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {fonts.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>字体名称</TableHead>
                    <TableHead>排序</TableHead>
                    <TableHead>适合模板</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderedFonts.map((font) => (
                    <TableRow key={font.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 items-center justify-center rounded-md bg-secondary">
                            <Type className="size-4" />
                          </span>
                          <span className="font-medium">{font.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <form className="flex items-center gap-2" onSubmit={submitSortOrder}>
                          <input name="id" type="hidden" value={font.id} />
                          <Input
                            aria-label={`${font.name}排序`}
                            className="h-8 w-24"
                            defaultValue={font.sortOrder}
                            max={999999}
                            min={0}
                            name="sortOrder"
                            type="number"
                          />
                          <Button disabled={isSortPending && activeSortFontId === font.id} size="sm" type="submit" variant="outline">
                            <Save data-icon="inline-start" />
                            保存
                          </Button>
                        </form>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-80 flex-wrap gap-1.5">
                          {font.suitableTemplates.length > 0 ? (
                            font.suitableTemplates.map((template) => (
                              <Badge key={template} variant="outline">
                                {copybookTemplateLabel(template)}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="muted">未指定</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => setModal({ font, type: "edit" })} size="sm" type="button" variant="outline">
                            <Edit3 data-icon="inline-start" />
                            编辑
                          </Button>
                          <form action={deleteCopybookFontAction}>
                            <input name="id" type="hidden" value={font.id} />
                            <Button size="sm" type="submit" variant="outline">
                              <Trash2 data-icon="inline-start" />
                              删除
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card p-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-secondary">
                <Type />
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-medium tracking-normal">暂无字体</h2>
                <p className="text-sm text-muted-foreground">新增字体后，可在这里维护名称、排序和适合模板。</p>
              </div>
            </div>
          )}
          {sortMessage ? <p className="text-sm text-destructive">{sortMessage}</p> : null}
        </CardContent>
      </Card>

      {modal ? (
        <FontModal isPending={isPending} message={message} modal={modal} onClose={closeModal} onSubmit={submitFont} />
      ) : null}
    </>
  );
}

async function saveCopybookFontViaApi(formData: FormData, modal: FontModalState | null) {
  if (!modal) {
    throw new Error("字体不存在");
  }

  const isEdit = modal.type === "edit";
  const id = String(formData.get("id") ?? "").trim();

  if (isEdit && !id) {
    throw new Error("字体不存在");
  }

  const response = await fetch(isEdit ? `/api/admin/fonts/${encodeURIComponent(id)}` : "/api/admin/fonts", {
    body: formData,
    cache: "no-store",
    method: isEdit ? "PATCH" : "POST"
  });
  const text = await response.text();
  let payload: ApiResponse<CopybookFont> | null;

  try {
    payload = JSON.parse(text) as ApiResponse<CopybookFont>;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.code !== 0 || !payload.data) {
    throw new Error(payload?.message || text.slice(0, 120) || "字体保存失败，请稍后重试。");
  }
}

function hasSelectedFontFile(form: HTMLFormElement) {
  const field = form.elements.namedItem("file");

  if (!(field instanceof HTMLInputElement) || field.type !== "file") {
    return false;
  }

  return Array.from(field.files ?? []).some((file) => file.size > 0);
}

function FontModal({
  isPending,
  message,
  modal,
  onClose,
  onSubmit
}: {
  isPending: boolean;
  message: string;
  modal: FontModalState;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const font = modal.type === "edit" ? modal.font : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">{font ? "编辑字体" : "新增字体"}</h2>
            <p className="text-sm text-muted-foreground">字体文件支持 ttf、otf、ttc、woff、woff2，单个文件不超过 60MB。</p>
          </div>
          <Button
            aria-label="关闭弹窗"
            className="size-9 px-0"
            disabled={isPending}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>

        <form className="grid gap-5 px-6 py-5" encType="multipart/form-data" onSubmit={onSubmit}>
          {font ? <input name="id" type="hidden" value={font.id} /> : null}
          <FieldGroup className="md:grid md:grid-cols-[minmax(0,1fr)_160px]">
            <Field>
              <FieldLabel htmlFor="font-name">字体名称</FieldLabel>
              <Input id="font-name" name="name" defaultValue={font?.name ?? ""} placeholder="例如：楷体描红" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="font-sort-order">排序</FieldLabel>
              <Input
                id="font-sort-order"
                name="sortOrder"
                defaultValue={font?.sortOrder ?? 100}
                min={0}
                max={999999}
                type="number"
              />
            </Field>
          </FieldGroup>
          <Field>
            <FieldLabel htmlFor="font-file">字体文件</FieldLabel>
            <Input
              id="font-file"
              name="file"
              type="file"
              accept=".ttf,.otf,.ttc,.woff,.woff2,font/ttf,font/otf,font/collection,font/woff,font/woff2"
              required={!font}
            />
            {font ? <FieldDescription>不选择文件时保留当前文件：{font.originalName}</FieldDescription> : null}
          </Field>
          <Field>
            <FieldLabel>适合模板</FieldLabel>
            <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
              <input name="suitableTemplates" type="hidden" value="" />
              {copybookFontTemplateOptions.map((template) => (
                <label className="flex items-center gap-2 text-sm" key={template.value}>
                  <input
                    defaultChecked={font?.suitableTemplates.includes(template.value) ?? template.value === "shengzi"}
                    name="suitableTemplates"
                    type="checkbox"
                    value={template.value}
                  />
                  {template.label}
                </label>
              ))}
            </div>
          </Field>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <div className="flex justify-end gap-2 border-t border-border pt-5">
            <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "保存中..." : font ? "保存字体" : "新增字体"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

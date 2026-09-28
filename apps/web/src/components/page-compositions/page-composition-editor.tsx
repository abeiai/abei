"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, GripVertical, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { CmsPage } from "@/lib/cms-api";
import type { ContentModule, ContentModuleType } from "@/lib/content-module-api";
import type { PageComposition, PageCompositionTargetType } from "@/lib/page-composition-api";

interface PageCompositionEditorProps {
  pages: CmsPage[];
  modules: ContentModule[];
  composition: PageComposition;
  targetType: PageCompositionTargetType;
  pageId: string;
}

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

const typeLabels: Record<ContentModuleType, string> = {
  SLIDESHOW: "幻灯模块",
  IMAGE_CARD_LIST: "图文卡片",
  SPLIT_IMAGE_TEXT: "左右图文"
};

export function PageCompositionEditor({
  pages,
  modules,
  composition,
  targetType,
  pageId
}: PageCompositionEditorProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(() => composition.items.map((item) => item.moduleId));
  const [isEnabled, setIsEnabled] = useState(composition.isEnabled);
  const [showHeader, setShowHeader] = useState(composition.showHeader);
  const [showFooter, setShowFooter] = useState(composition.showFooter);
  const [draggingId, setDraggingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const moduleById = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
  const selectedModules = selectedIds
    .map((id) => moduleById.get(id))
    .filter((module): module is ContentModule => Boolean(module));
  const poolModules = modules.filter((module) => !selectedIds.includes(module.id));

  function targetHref(nextType: PageCompositionTargetType, nextPageId = "") {
    const query = new URLSearchParams({
      targetType: nextType
    });

    if (nextType === "PAGE" && nextPageId) {
      query.set("pageId", nextPageId);
    }

    return `/admin/page-compositions?${query.toString()}`;
  }

  function addModule(moduleId: string) {
    if (!selectedIds.includes(moduleId)) {
      setSelectedIds((current) => [...current, moduleId]);
    }
  }

  function removeModule(moduleId: string) {
    setSelectedIds((current) => current.filter((id) => id !== moduleId));
  }

  function moveModule(moduleId: string, direction: -1 | 1) {
    setSelectedIds((current) => {
      const index = current.indexOf(moduleId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);

      return next;
    });
  }

  function dropModule(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId("");
      return;
    }

    setSelectedIds((current) => {
      const draggingIndex = current.indexOf(draggingId);
      const targetIndex = current.indexOf(targetId);

      if (draggingIndex < 0 || targetIndex < 0) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(draggingIndex, 1);
      next.splice(targetIndex, 0, item);

      return next;
    });
    setDraggingId("");
  }

  async function save() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/internal/admin/page-compositions/target", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          targetType,
          pageId: targetType === "PAGE" ? pageId : undefined,
          isEnabled,
          showHeader,
          showFooter,
          modules: selectedIds.map((moduleId) => ({ moduleId }))
        })
      });
      const payload = (await response.json()) as ApiResponse<PageComposition>;

      if (!response.ok || payload.code !== 0 || !payload.data) {
        throw new Error(payload.message || "保存失败");
      }

      setMessage("已保存编排");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <Card className="xl:sticky xl:top-6 xl:self-start">
        <CardHeader>
          <CardTitle>编排目标</CardTitle>
          <CardDescription>
            首页和单页可分别启用编排。单页正文仍由单页编辑器维护，启用后模块内容会作为页面主体展示。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <FieldGroup className="grid gap-4">
            <Field>
              <FieldLabel>语言</FieldLabel>
              <Select value="zh-CN" disabled>
                <option value="zh-CN">简体中文</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel>编排对象</FieldLabel>
              <Select
                value={targetType}
                onChange={(event) => {
                  const nextType = event.target.value as PageCompositionTargetType;
                  router.push(targetHref(nextType, nextType === "PAGE" ? pages[0]?.id ?? "" : ""));
                }}
              >
                <option value="HOME">首页</option>
                <option value="PAGE">单页</option>
              </Select>
              <FieldDescription>
                {targetType === "HOME" ? "管理首页模块顺序。" : "管理指定单页的模块顺序。"}
              </FieldDescription>
            </Field>
            {targetType === "PAGE" ? (
              <Field>
                <FieldLabel>单页</FieldLabel>
                <Select
                  value={pageId}
                  onChange={(event) => router.push(targetHref("PAGE", event.target.value))}
                  disabled={pages.length === 0}
                >
                  {pages.length > 0 ? (
                    pages.map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title}
                      </option>
                    ))
                  ) : (
                    <option value="">暂无单页</option>
                  )}
                </Select>
              </Field>
            ) : null}
            <Field>
              <FieldLabel>启用页面编排</FieldLabel>
              <Select value={isEnabled ? "1" : "0"} onChange={(event) => setIsEnabled(event.target.value === "1")}>
                <option value="1">启用</option>
                <option value="0">停用</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel>顶部菜单</FieldLabel>
              <Select value={showHeader ? "1" : "0"} onChange={(event) => setShowHeader(event.target.value === "1")}>
                <option value="1">显示</option>
                <option value="0">隐藏</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel>底部菜单</FieldLabel>
              <Select value={showFooter ? "1" : "0"} onChange={(event) => setShowFooter(event.target.value === "1")}>
                <option value="1">显示</option>
                <option value="0">隐藏</option>
              </Select>
            </Field>
          </FieldGroup>

          <div className="rounded-md border border-border p-4">
            <p className="font-medium">{composition.title || (targetType === "HOME" ? "首页" : "单页")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {targetType === "HOME" ? "zh-CN · 首页" : `zh-CN · ${selectedModules.length} 个模块`}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-2">
              <CardTitle>已选模块</CardTitle>
              <CardDescription>拖动左侧把手可以上下调整顺序，也可以使用上移、下移按钮。</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
              <Button type="button" disabled={saving} onClick={save}>
                <Save data-icon="inline-start" />
                {saving ? "保存中..." : "保存编排"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {selectedModules.length > 0 ? (
              selectedModules.map((module, index) => (
                <ModuleRow
                  key={module.id}
                  module={module}
                  index={index}
                  total={selectedModules.length}
                  dragging={draggingId === module.id}
                  onDragStart={() => setDraggingId(module.id)}
                  onDrop={() => dropModule(module.id)}
                  onMove={(direction) => moveModule(module.id, direction)}
                  onRemove={() => removeModule(module.id)}
                />
              ))
            ) : (
              <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-muted-foreground">
                <Box />
                <p className="font-medium">还没有选择模块</p>
                <p className="text-sm">从下方模块池添加模块后再保存编排。</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>模块池</CardTitle>
            <CardDescription>仅显示尚未加入当前页面的模块。模块内容请先到模块管理中维护。</CardDescription>
          </CardHeader>
          <CardContent>
            {poolModules.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {poolModules.map((module) => (
                  <div key={module.id} className="flex flex-col gap-3 rounded-md border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{module.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{module.slug}</p>
                      </div>
                      <Badge variant={module.isEnabled ? "secondary" : "muted"}>
                        {module.isEnabled ? "已启用" : "停用"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{typeLabels[module.type]}</Badge>
                      <Badge variant="muted">{module.items.length} 个条目</Badge>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => addModule(module.id)}>
                      添加到页面
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-muted-foreground">
                <Box />
                <p className="font-medium">没有更多可添加模块</p>
                <p className="text-sm">可以先去模块管理新增模块，或者调整当前页面已经选择的模块。</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ModuleRow({
  module,
  index,
  total,
  dragging,
  onDragStart,
  onDrop,
  onMove,
  onRemove
}: {
  module: ContentModule;
  index: number;
  total: number;
  dragging: boolean;
  onDragStart(): void;
  onDrop(): void;
  onMove(direction: -1 | 1): void;
  onRemove(): void;
}) {
  return (
    <div
      draggable
      className="grid gap-4 rounded-md border border-border p-4 md:grid-cols-[44px_1fr_auto]"
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      data-dragging={dragging ? "true" : undefined}
    >
      <button
        type="button"
        className="flex size-10 cursor-grab items-center justify-center rounded-md border border-dashed border-border text-muted-foreground"
        aria-label="拖动调整模块顺序"
      >
        <GripVertical />
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{module.name}</p>
          <Badge variant="outline">{typeLabels[module.type]}</Badge>
          <Badge variant={module.isEnabled ? "secondary" : "muted"}>
            {module.isEnabled ? "已启用" : "停用"}
          </Badge>
        </div>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          /{module.slug} · {module.items.length} 个条目
        </p>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
          上移
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={index === total - 1} onClick={() => onMove(1)}>
          下移
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          移除
        </Button>
      </div>
    </div>
  );
}

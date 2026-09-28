"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Palette } from "lucide-react";

import { ActionToast } from "@/components/ui/action-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateThemeTemplateAction, type ThemeTemplateActionState } from "@/lib/settings-api";
import { themeTemplates, type ThemeTemplateKey } from "@/lib/theme-templates";
import { cn } from "@/lib/utils";

const initialState: ThemeTemplateActionState = {};

export function ThemeTemplateManager({ activeThemeKey }: { activeThemeKey: ThemeTemplateKey }) {
  const [state, formAction, isPending] = useActionState(updateThemeTemplateAction, initialState);
  const [selectedThemeKey, setSelectedThemeKey] = useState<ThemeTemplateKey>(activeThemeKey);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <ActionToast state={state} />
      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <CardTitle>选择前台主题模板</CardTitle>
            <CardDescription>
              主题模板只控制前台视觉样式。菜单、CMS、页面编排、支付、用户和 AI 任务数据不会随主题切换改变。
            </CardDescription>
          </div>
          <Button disabled={isPending} type="submit">
            <Palette data-icon="inline-start" />
            {isPending ? "保存中..." : "保存主题"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 lg:grid-cols-2">
            {themeTemplates.map((theme) => {
              const isActive = theme.key === activeThemeKey;
              const isSelected = theme.key === selectedThemeKey;

              return (
                <label
                  className={cn(
                    "group cursor-pointer rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary",
                    isSelected && "border-primary bg-secondary/60"
                  )}
                  key={theme.key}
                >
                  <input
                    checked={isSelected}
                    className="sr-only"
                    name="activeThemeTemplate"
                    onChange={() => setSelectedThemeKey(theme.key)}
                    type="radio"
                    value={theme.key}
                  />
                  <span className="flex flex-col gap-5">
                    <span className="flex items-start justify-between gap-4">
                      <span className="flex min-w-0 flex-col gap-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xl font-semibold">{theme.name}</span>
                          {isActive ? (
                            <Badge>
                              <CheckCircle2 data-icon="inline-start" />
                              当前启用
                            </Badge>
                          ) : null}
                        </span>
                        <span className="text-sm leading-6 text-muted-foreground">{theme.tagline}</span>
                      </span>
                      <span className="flex shrink-0 overflow-hidden rounded-full border border-border">
                        {theme.previewColors.map((color) => (
                          <span className="size-7" key={color} style={{ backgroundColor: color }} />
                        ))}
                      </span>
                    </span>
                    <ThemePreview themeKey={theme.key} />
                    <span className="text-sm leading-6 text-muted-foreground">{theme.description}</span>
                    <span className="flex flex-wrap gap-2">
                      {theme.features.map((feature) => (
                        <Badge key={feature} variant="outline">
                          {feature}
                        </Badge>
                      ))}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function ThemePreview({ themeKey }: { themeKey: ThemeTemplateKey }) {
  if (themeKey === "blue-tech") {
    return (
      <span className="block overflow-hidden rounded-lg border border-[#c5daf4] bg-[#f3f8ff] p-4 text-[#07162f]">
        <span className="mb-4 block h-2 w-24 rounded-full bg-[#0b63f6]" />
        <span className="grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
          <span className="flex flex-col gap-2 rounded-lg border border-[#c5daf4] bg-white p-4 shadow-[0_16px_34px_rgba(14,89,168,0.12)]">
            <span className="text-lg font-semibold">蓝色科技首页</span>
            <span className="text-xs leading-5 text-[#5b6f8f]">冷白画布、蓝色主按钮、清晰卡片层级。</span>
            <span className="mt-2 w-fit rounded-full bg-[#0b63f6] px-4 py-2 text-xs font-medium text-white">开始体验</span>
          </span>
          <span className="grid gap-2">
            <span className="rounded-lg bg-[#e7f1ff] p-3 text-xs">AI 对话</span>
            <span className="rounded-lg bg-[#e7f1ff] p-3 text-xs">图片生成</span>
            <span className="rounded-lg bg-[#e7f1ff] p-3 text-xs">语音合成</span>
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className="block overflow-hidden rounded-lg border border-[#e5e7eb] bg-white p-4 text-[#0a0a0a]">
      <span className="mb-4 block h-2 w-24 rounded-full bg-[#0a0a0a]" />
      <span className="grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
        <span className="flex flex-col gap-2 rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <span className="text-lg font-semibold">MiniMax 风格首页</span>
          <span className="text-xs leading-5 text-[#5f5f5f]">白底、黑色胶囊 CTA、产品色卡片。</span>
          <span className="mt-2 w-fit rounded-full bg-[#0a0a0a] px-4 py-2 text-xs font-medium text-white">开始体验</span>
        </span>
        <span className="grid gap-2">
          <span className="rounded-2xl bg-[#ff5530] p-3 text-xs font-medium text-white">英文带学</span>
          <span className="rounded-2xl bg-[#1456f0] p-3 text-xs font-medium text-white">视频导学</span>
          <span className="rounded-2xl bg-[#f7f8fa] p-3 text-xs">AI 闪卡</span>
        </span>
      </span>
    </span>
  );
}

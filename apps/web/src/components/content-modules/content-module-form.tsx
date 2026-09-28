"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Image as ImageIcon, Plus, Save, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CmsArticle, CmsCategory, CmsPage } from "@/lib/cms-api";
import type {
  ContentModule,
  ContentModuleItem,
  ContentModuleLinkType,
  ContentModuleType
} from "@/lib/content-module-api";

type TextStyle = {
  text: string;
  fontFamily: string;
  fontSize: number;
  color?: string;
};

type ModuleItemDraft = {
  id?: string;
  title: string;
  imageUrl: string;
  imageAlt: string;
  linkType: ContentModuleLinkType;
  linkTarget: string;
  sortOrder: number;
  config: Record<string, unknown>;
};

type ModuleDraft = {
  id?: string;
  name: string;
  slug: string;
  type: ContentModuleType;
  description: string;
  isEnabled: boolean;
  sortOrder: number;
  settings: Record<string, unknown>;
  items: ModuleItemDraft[];
};

type LinkTarget = {
  id: string;
  label: string;
};

interface ContentModuleFormProps {
  module?: ContentModule;
  categories: CmsCategory[];
  pages: CmsPage[];
  articles: CmsArticle[];
}

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

const typeLabels: Record<ContentModuleType, string> = {
  SLIDESHOW: "幻灯模块",
  IMAGE_CARD_LIST: "图文卡片列表",
  SPLIT_IMAGE_TEXT: "左右图文"
};

const fontOptions = [
  { value: "system", label: "系统默认" },
  { value: "sans", label: "无衬线" },
  { value: "serif", label: "衬线" },
  { value: "mono", label: "等宽" }
];

const iconOptions = ["Sparkles", "Check", "Star", "Zap", "Shield", "Heart"];

function defaultText(text = "", fontSize = 18, color = ""): TextStyle {
  return {
    text,
    fontFamily: "system",
    fontSize,
    color
  };
}

function defaultSettings(type: ContentModuleType): Record<string, unknown> {
  if (type === "SLIDESHOW") {
    return {
      transition: "FADE",
      intervalSeconds: 5,
      opacity: 100
    };
  }

  if (type === "IMAGE_CARD_LIST") {
    return {
      cardsPerRow: 3,
      textPosition: "BELOW_IMAGE",
      fontSize: 18
    };
  }

  return {
    layout: "TEXT_LEFT_IMAGE_RIGHT",
    imageRatio: "16:9",
    imageUrl: "",
    imageAlt: "",
    textMode: "TITLE_TEXT",
    introText: defaultText("", 16),
    titleText: defaultText("", 28),
    descriptionText: defaultText("", 18),
    iconItems: [{ icon: "Sparkles", text: "" }]
  };
}

function defaultSlideItem(sortOrder: number): ModuleItemDraft {
  return {
    title: "",
    imageUrl: "",
    imageAlt: "",
    linkType: "NONE",
    linkTarget: "",
    sortOrder,
    config: {
      introText: defaultText("", 16, "#ffffff"),
      titleText: defaultText("", 32, "#ffffff"),
      descriptionText: defaultText("", 18, "#ffffff"),
      textPosition: "LEFT",
      buttonText: "",
      buttonLink: "",
      buttonBgColor: "#111111",
      buttonTextColor: "#ffffff"
    }
  };
}

function defaultCardItem(sortOrder: number): ModuleItemDraft {
  return {
    title: "",
    imageUrl: "",
    imageAlt: "",
    linkType: "NONE",
    linkTarget: "",
    sortOrder,
    config: {}
  };
}

function defaultSplitItem(sortOrder: number): ModuleItemDraft {
  return {
    title: "",
    imageUrl: "",
    imageAlt: "",
    linkType: "NONE",
    linkTarget: "",
    sortOrder,
    config: {
      layout: sortOrder % 2 === 0 ? "TEXT_LEFT_IMAGE_RIGHT" : "IMAGE_LEFT_TEXT_RIGHT",
      imageRatio: "16:9",
      textMode: "TITLE_TEXT",
      introText: defaultText("", 16),
      titleText: defaultText("", 28),
      descriptionText: defaultText("", 18),
      buttonText: "",
      buttonLink: "",
      buttonTextColor: "#ffffff",
      buttonBgColor: "#111827",
      iconItems: [{ icon: "Sparkles", text: "" }]
    }
  };
}

function legacySplitItem(settings: Record<string, unknown>): ModuleItemDraft {
  const item = defaultSplitItem(0);

  return {
    ...item,
    imageUrl: valueOf(settings, "imageUrl", ""),
    imageAlt: valueOf(settings, "imageAlt", ""),
    config: {
      ...item.config,
      layout: valueOf(settings, "layout", "TEXT_LEFT_IMAGE_RIGHT"),
      imageRatio: valueOf(settings, "imageRatio", "16:9"),
      textMode: valueOf(settings, "textMode", "TITLE_TEXT"),
      introText: textStyle(settings.introText, defaultText("", 16)),
      titleText: textStyle(settings.titleText, defaultText("", 28)),
      descriptionText: textStyle(settings.descriptionText, defaultText("", 18)),
      buttonText: valueOf(settings, "buttonText", ""),
      buttonLink: valueOf(settings, "buttonLink", ""),
      buttonTextColor: valueOf(settings, "buttonTextColor", "#ffffff"),
      buttonBgColor: valueOf(settings, "buttonBgColor", "#111827"),
      iconItems: Array.isArray(settings.iconItems) ? settings.iconItems : [{ icon: "Sparkles", text: "" }]
    }
  };
}

function normalizeItem(item: ContentModuleItem, index: number): ModuleItemDraft {
  return {
    id: item.id,
    title: item.title ?? "",
    imageUrl: item.imageUrl ?? "",
    imageAlt: item.imageAlt ?? "",
    linkType: linkType(item.linkType),
    linkTarget: item.linkTarget ?? "",
    sortOrder: item.sortOrder ?? index,
    config: item.config ?? {}
  };
}

function initialDraft(module?: ContentModule): ModuleDraft {
  if (!module) {
    return {
      name: "",
      slug: "",
      type: "SLIDESHOW",
      description: "",
      isEnabled: true,
      sortOrder: 0,
      settings: defaultSettings("SLIDESHOW"),
      items: [defaultSlideItem(0)]
    };
  }

  return {
    id: module.id,
    name: module.name,
    slug: module.slug,
    type: module.type,
    description: module.description ?? "",
    isEnabled: module.isEnabled,
    sortOrder: module.sortOrder,
    settings: {
      ...defaultSettings(module.type),
      ...(module.settings ?? {})
    },
    items:
      module.items.length > 0
        ? module.items.map(normalizeItem)
        : module.type === "SPLIT_IMAGE_TEXT"
          ? [legacySplitItem(module.settings ?? {})]
          : []
  };
}

function linkType(value: unknown): ContentModuleLinkType {
  return value === "CATEGORY" || value === "PAGE" || value === "ARTICLE" || value === "EXTERNAL"
    ? value
    : "NONE";
}

function textStyle(value: unknown, fallback = defaultText()): TextStyle {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const record = value as Record<string, unknown>;

  return {
    text: String(record.text ?? fallback.text),
    fontFamily: String(record.fontFamily ?? fallback.fontFamily),
    fontSize: Number(record.fontSize ?? fallback.fontSize),
    color: String(record.color ?? fallback.color ?? "")
  };
}

function valueOf(settings: Record<string, unknown>, key: string, fallback = "") {
  const value = settings[key];

  return value === undefined || value === null ? fallback : String(value);
}

function numberOf(value: unknown, fallback: number) {
  const next = Number(value);

  return Number.isFinite(next) ? next : fallback;
}

function colorOf(value: unknown, fallback: string) {
  const next = String(value ?? "").trim();

  return /^#[0-9a-fA-F]{6}$/.test(next) ? next : fallback;
}

export function ContentModuleForm({ module, categories, pages, articles }: ContentModuleFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<ModuleDraft>(() => initialDraft(module));
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState("");
  const [message, setMessage] = useState("");

  const linkTargets = useMemo(
    () => ({
      CATEGORY: categories.map((category) => ({ id: category.id, label: category.name })),
      PAGE: pages.map((page) => ({ id: page.id, label: page.title })),
      ARTICLE: articles.map((article) => ({ id: article.id, label: article.title }))
    }),
    [articles, categories, pages]
  );

  function patchDraft(values: Partial<ModuleDraft>) {
    setDraft((current) => ({
      ...current,
      ...values
    }));
  }

  function patchSettings(values: Record<string, unknown>) {
    setDraft((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...values
      }
    }));
  }

  function patchItem(index: number, values: Partial<ModuleItemDraft>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...values
            }
          : item
      )
    }));
  }

  function patchItemConfig(index: number, values: Record<string, unknown>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              config: {
                ...item.config,
                ...values
              }
            }
          : item
      )
    }));
  }

  function switchType(type: ContentModuleType) {
    setDraft((current) => ({
      ...current,
      type,
      settings: defaultSettings(type),
      items:
        type === "SLIDESHOW"
          ? [defaultSlideItem(0)]
          : type === "IMAGE_CARD_LIST"
            ? [defaultCardItem(0)]
            : [defaultSplitItem(0)]
    }));
  }

  async function uploadImage(file: File, onUploaded: (url: string) => void, key: string) {
    setUploadingKey(key);
    setMessage("");

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("sourceType", "USER_UPLOAD");
      const response = await fetch("/internal/admin/media/upload-json", {
        method: "POST",
        body: formData
      });
      const payload = await parseUploadResponse(response);

      if (!response.ok || payload.code !== 0 || !payload.data) {
        throw new Error(payload.message || "上传失败");
      }

      onUploaded(payload.data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploadingKey("");
    }
  }

  async function saveModule() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(draft.id ? `/internal/admin/modules/${draft.id}` : "/internal/admin/modules", {
        method: draft.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: draft.name,
          slug: draft.slug,
          type: draft.type,
          description: draft.description,
          settings: draft.settings,
          isEnabled: draft.isEnabled,
          sortOrder: draft.sortOrder,
          items: draft.items.map((item, index) => ({
            id: item.id,
            title: item.title,
            imageUrl: item.imageUrl,
            imageAlt: item.imageAlt,
            linkType: item.linkType,
            linkTarget: item.linkTarget,
            config: item.config,
            sortOrder: index
          }))
        })
      });
      const payload = (await response.json()) as ApiResponse<ContentModule>;

      if (!response.ok || payload.code !== 0 || !payload.data) {
        throw new Error(payload.message || "保存失败");
      }

      router.push("/admin/modules");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/modules")}>
          <ArrowLeft data-icon="inline-start" />
          返回列表
        </Button>
        <div className="flex items-center gap-3">
          {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
          <Button type="button" disabled={saving} onClick={saveModule}>
            <Save data-icon="inline-start" />
            {saving ? "保存中..." : "保存模块"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>模块基础信息</CardTitle>
          <CardDescription>模块 slug 用于前台按位置或标识读取，类型决定后续配置区的表单结构。</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 lg:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="moduleName">模块名称</FieldLabel>
              <Input
                id="moduleName"
                value={draft.name}
                onChange={(event) => patchDraft({ name: event.target.value })}
                placeholder="例如：首页顶部幻灯"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="moduleSlug">模块 slug</FieldLabel>
              <Input
                id="moduleSlug"
                value={draft.slug}
                onChange={(event) => patchDraft({ slug: event.target.value })}
                placeholder="home-hero-slider"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="moduleType">模块类型</FieldLabel>
              <Select
                id="moduleType"
                value={draft.type}
                onChange={(event) => switchType(event.target.value as ContentModuleType)}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="moduleStatus">启用状态</FieldLabel>
              <Select
                id="moduleStatus"
                value={draft.isEnabled ? "1" : "0"}
                onChange={(event) => patchDraft({ isEnabled: event.target.value === "1" })}
              >
                <option value="1">启用</option>
                <option value="0">停用</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="moduleSortOrder">排序</FieldLabel>
              <Input
                id="moduleSortOrder"
                type="number"
                value={draft.sortOrder}
                onChange={(event) => patchDraft({ sortOrder: Number(event.target.value) })}
              />
            </Field>
            <Field className="lg:col-span-2">
              <FieldLabel htmlFor="moduleDescription">说明</FieldLabel>
              <Textarea
                id="moduleDescription"
                value={draft.description}
                onChange={(event) => patchDraft({ description: event.target.value })}
                placeholder="后台备注，不影响前台展示"
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {draft.type === "SLIDESHOW" ? (
        <SlideshowEditor
          draft={draft}
          uploadingKey={uploadingKey}
          linkTargets={linkTargets}
          onAdd={() =>
            patchDraft({
              items: [...draft.items, defaultSlideItem(draft.items.length)]
            })
          }
          onRemove={(index) =>
            patchDraft({
              items: draft.items.filter((_, itemIndex) => itemIndex !== index)
            })
          }
          onPatchItem={patchItem}
          onPatchItemConfig={patchItemConfig}
          onPatchSettings={patchSettings}
          onUpload={uploadImage}
        />
      ) : null}

      {draft.type === "IMAGE_CARD_LIST" ? (
        <ImageCardListEditor
          draft={draft}
          uploadingKey={uploadingKey}
          linkTargets={linkTargets}
          onAdd={() =>
            patchDraft({
              items: [...draft.items, defaultCardItem(draft.items.length)]
            })
          }
          onRemove={(index) =>
            patchDraft({
              items: draft.items.filter((_, itemIndex) => itemIndex !== index)
            })
          }
          onPatchItem={patchItem}
          onPatchSettings={patchSettings}
          onUpload={uploadImage}
        />
      ) : null}

      {draft.type === "SPLIT_IMAGE_TEXT" ? (
        <SplitImageTextEditor
          draft={draft}
          uploadingKey={uploadingKey}
          onAdd={() =>
            patchDraft({
              items: [...draft.items, defaultSplitItem(draft.items.length)]
            })
          }
          onRemove={(index) =>
            patchDraft({
              items: draft.items.filter((_, itemIndex) => itemIndex !== index)
            })
          }
          onPatchItem={patchItem}
          onPatchItemConfig={patchItemConfig}
          onUpload={uploadImage}
        />
      ) : null}
    </div>
  );
}

async function parseUploadResponse(response: Response): Promise<ApiResponse<{ url: string }>> {
  const text = await response.text();

  if (!text) {
    return {
      code: response.ok ? 50002 : response.status,
      message: "上传失败",
      data: null
    };
  }

  try {
    return JSON.parse(text) as ApiResponse<{ url: string }>;
  } catch {
    return {
      code: response.ok ? 0 : response.status,
      message: text.slice(0, 120) || "上传失败",
      data: null
    };
  }
}

function SlideshowEditor({
  draft,
  uploadingKey,
  linkTargets,
  onAdd,
  onRemove,
  onPatchItem,
  onPatchItemConfig,
  onPatchSettings,
  onUpload
}: {
  draft: ModuleDraft;
  uploadingKey: string;
  linkTargets: Record<"CATEGORY" | "PAGE" | "ARTICLE", LinkTarget[]>;
  onAdd(): void;
  onRemove(index: number): void;
  onPatchItem(index: number, values: Partial<ModuleItemDraft>): void;
  onPatchItemConfig(index: number, values: Record<string, unknown>): void;
  onPatchSettings(values: Record<string, unknown>): void;
  onUpload(file: File, onUploaded: (url: string) => void, key: string): void;
}) {
  return (
    <Card>
      <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <CardTitle>幻灯配置</CardTitle>
          <CardDescription>支持淡入淡出、横向滑动和缩放切换，单张幻灯可设置文字和行动按钮。</CardDescription>
        </div>
        <Button type="button" onClick={onAdd}>
          <Plus data-icon="inline-start" />
          添加幻灯
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>切换方式</FieldLabel>
            <Select
              value={valueOf(draft.settings, "transition", "FADE")}
              onChange={(event) => onPatchSettings({ transition: event.target.value })}
            >
              <option value="FADE">淡入淡出</option>
              <option value="SLIDE">横向滑动</option>
              <option value="SCALE">缩放切换</option>
            </Select>
          </Field>
          <Field>
            <FieldLabel>切换秒数</FieldLabel>
            <Input
              type="number"
              min={2}
              max={30}
              value={valueOf(draft.settings, "intervalSeconds", "5")}
              onChange={(event) => onPatchSettings({ intervalSeconds: Number(event.target.value) })}
            />
          </Field>
          <Field>
            <FieldLabel>幻灯片透明度</FieldLabel>
            <Input
              type="number"
              min={0}
              max={100}
              value={valueOf(draft.settings, "opacity", "100")}
              onChange={(event) => onPatchSettings({ opacity: Number(event.target.value) })}
            />
            <FieldDescription>100% 为完全不透明。</FieldDescription>
          </Field>
        </FieldGroup>

        {draft.items.map((item, index) => (
          <Card key={item.id ?? index}>
            <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-lg">幻灯 {index + 1}</CardTitle>
                <CardDescription>图片、显示文字、站内外跳转和行动按钮。</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => onRemove(index)}>
                <Trash2 data-icon="inline-start" />
                删除
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <ImageUploader
                id={`slide-image-${index}`}
                imageUrl={item.imageUrl}
                uploading={uploadingKey === `slide-${index}`}
                onUpload={(file) => onUpload(file, (url) => onPatchItem(index, { imageUrl: url }), `slide-${index}`)}
              />
              <FieldGroup className="grid gap-4 lg:grid-cols-2">
                <Field>
                  <FieldLabel>图片 Alt 描述</FieldLabel>
                  <Input
                    value={item.imageAlt}
                    onChange={(event) => onPatchItem(index, { imageAlt: event.target.value })}
                    placeholder="用于图片可访问性和 SEO"
                  />
                </Field>
                <Field>
                  <FieldLabel>布局</FieldLabel>
                  <Select
                    value={String(item.config.textPosition ?? "LEFT")}
                    onChange={(event) => onPatchItemConfig(index, { textPosition: event.target.value })}
                  >
                    <option value="LEFT">左文右图</option>
                    <option value="RIGHT">左图右文</option>
                  </Select>
                </Field>
                <TextStyleFields
                  label="引导文字"
                  value={textStyle(item.config.introText, defaultText("", 16, "#ffffff"))}
                  showColor
                  onChange={(value) => onPatchItemConfig(index, { introText: value })}
                />
                <TextStyleFields
                  label="标题文字"
                  value={textStyle(item.config.titleText, defaultText("", 32, "#ffffff"))}
                  showColor
                  onChange={(value) => onPatchItemConfig(index, { titleText: value })}
                />
                <TextStyleFields
                  label="说明文字"
                  value={textStyle(item.config.descriptionText, defaultText("", 18, "#ffffff"))}
                  showColor
                  onChange={(value) => onPatchItemConfig(index, { descriptionText: value })}
                />
                <LinkFields
                  linkType={item.linkType}
                  linkTarget={item.linkTarget}
                  linkTargets={linkTargets}
                  onChange={(values) => onPatchItem(index, values)}
                />
                <Field>
                  <FieldLabel>行动按钮文字</FieldLabel>
                  <Input
                    value={String(item.config.buttonText ?? "")}
                    onChange={(event) => onPatchItemConfig(index, { buttonText: event.target.value })}
                    placeholder="不填则不显示按钮"
                  />
                </Field>
                <Field>
                  <FieldLabel>行动按钮链接</FieldLabel>
                  <Input
                    value={String(item.config.buttonLink ?? "")}
                    onChange={(event) => onPatchItemConfig(index, { buttonLink: event.target.value })}
                    placeholder="/articles 或 https://..."
                  />
                </Field>
                <Field>
                  <FieldLabel>按钮底色</FieldLabel>
                  <Input
                    type="color"
                    value={String(item.config.buttonBgColor ?? "#111111")}
                    onChange={(event) => onPatchItemConfig(index, { buttonBgColor: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>按钮文字颜色</FieldLabel>
                  <Input
                    type="color"
                    value={String(item.config.buttonTextColor ?? "#ffffff")}
                    onChange={(event) => onPatchItemConfig(index, { buttonTextColor: event.target.value })}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}

function ImageCardListEditor({
  draft,
  uploadingKey,
  linkTargets,
  onAdd,
  onRemove,
  onPatchItem,
  onPatchSettings,
  onUpload
}: {
  draft: ModuleDraft;
  uploadingKey: string;
  linkTargets: Record<"CATEGORY" | "PAGE" | "ARTICLE", LinkTarget[]>;
  onAdd(): void;
  onRemove(index: number): void;
  onPatchItem(index: number, values: Partial<ModuleItemDraft>): void;
  onPatchSettings(values: Record<string, unknown>): void;
  onUpload(file: File, onUploaded: (url: string) => void, key: string): void;
}) {
  return (
    <Card>
      <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <CardTitle>图文卡片列表</CardTitle>
          <CardDescription>配置每行卡片数、文字显示位置，并维护多个图片卡片。</CardDescription>
        </div>
        <Button type="button" onClick={onAdd}>
          <Plus data-icon="inline-start" />
          添加卡片
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <FieldGroup className="grid gap-4 md:grid-cols-3">
          <Field>
            <FieldLabel>每行卡片数</FieldLabel>
            <Input
              type="number"
              min={1}
              max={6}
              value={valueOf(draft.settings, "cardsPerRow", "3")}
              onChange={(event) => onPatchSettings({ cardsPerRow: Number(event.target.value) })}
            />
          </Field>
          <Field>
            <FieldLabel>文字位置</FieldLabel>
            <Select
              value={valueOf(draft.settings, "textPosition", "BELOW_IMAGE")}
              onChange={(event) => onPatchSettings({ textPosition: event.target.value })}
            >
              <option value="BELOW_IMAGE">图片下方</option>
              <option value="IMAGE_BOTTOM">图片底部</option>
              <option value="IMAGE_MIDDLE">图片中部</option>
            </Select>
          </Field>
          <Field>
            <FieldLabel>标题字号</FieldLabel>
            <Input
              type="number"
              min={12}
              max={40}
              value={valueOf(draft.settings, "fontSize", "18")}
              onChange={(event) => onPatchSettings({ fontSize: Number(event.target.value) })}
            />
          </Field>
        </FieldGroup>

        <div className="flex flex-col gap-4">
          {draft.items.map((item, index) => (
            <div key={item.id ?? index} className="grid gap-4 rounded-md border border-border p-4 lg:grid-cols-[260px_1fr_auto]">
              <div className="flex gap-3">
                <ImageUploader
                  compact
                  id={`card-image-${index}`}
                  imageUrl={item.imageUrl}
                  uploading={uploadingKey === `card-${index}`}
                  onUpload={(file) => onUpload(file, (url) => onPatchItem(index, { imageUrl: url }), `card-${index}`)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.title || "未填写标题"}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {item.imageAlt || "尚未填写图片 Alt 描述"}
                  </p>
                </div>
              </div>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>标题文字</FieldLabel>
                  <Input
                    value={item.title}
                    onChange={(event) => onPatchItem(index, { title: event.target.value })}
                    placeholder="卡片标题"
                  />
                </Field>
                <Field>
                  <FieldLabel>图片 Alt 描述</FieldLabel>
                  <Input
                    value={item.imageAlt}
                    onChange={(event) => onPatchItem(index, { imageAlt: event.target.value })}
                    placeholder="描述图片内容"
                  />
                </Field>
                <LinkFields
                  linkType={item.linkType}
                  linkTarget={item.linkTarget}
                  linkTargets={linkTargets}
                  onChange={(values) => onPatchItem(index, values)}
                />
              </FieldGroup>
              <div className="flex items-start justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => onRemove(index)}>
                  <Trash2 data-icon="inline-start" />
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SplitImageTextEditor({
  draft,
  uploadingKey,
  onAdd,
  onRemove,
  onPatchItem,
  onPatchItemConfig,
  onUpload
}: {
  draft: ModuleDraft;
  uploadingKey: string;
  onAdd(): void;
  onRemove(index: number): void;
  onPatchItem(index: number, values: Partial<ModuleItemDraft>): void;
  onPatchItemConfig(index: number, values: Record<string, unknown>): void;
  onUpload(file: File, onUploaded: (url: string) => void, key: string): void;
}) {
  return (
    <Card>
      <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <CardTitle>左右图文</CardTitle>
          <CardDescription>在同一个模块中维护多组左右图文，前台会按顺序连续展示。</CardDescription>
        </div>
        <Button type="button" onClick={onAdd}>
          <Plus data-icon="inline-start" />
          添加图文
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {draft.items.map((item, index) => {
          const textMode = String(item.config.textMode ?? "TITLE_TEXT");
          const iconItems = Array.isArray(item.config.iconItems)
            ? (item.config.iconItems as Array<{ icon?: string; text?: string }>)
            : [];
          const titleText = textStyle(item.config.titleText, defaultText("", 28));
          const imageLeft = String(item.config.layout ?? "TEXT_LEFT_IMAGE_RIGHT") === "IMAGE_LEFT_TEXT_RIGHT";

          function patchIconItem(iconIndex: number, values: { icon?: string; text?: string }) {
            onPatchItemConfig(index, {
              iconItems: iconItems.map((iconItem, itemIndex) =>
                itemIndex === iconIndex
                  ? {
                      ...iconItem,
                      ...values
                    }
                  : iconItem
              )
            });
          }

          const imageEditor = (
            <div className={imageLeft ? "order-1 lg:order-1" : "order-1 lg:order-2"}>
              <ImageUploader
                id={`split-image-${index}`}
                imageUrl={item.imageUrl}
                uploading={uploadingKey === `split-${index}`}
                onUpload={(file) => onUpload(file, (url) => onPatchItem(index, { imageUrl: url }), `split-${index}`)}
              />
            </div>
          );
          const textEditor = (
            <div className={imageLeft ? "order-2 flex flex-col gap-5 lg:order-2" : "order-2 flex flex-col gap-5 lg:order-1"}>
              {textMode === "TITLE_TEXT" ? (
                <FieldGroup className="grid gap-4">
                  <TextStyleFields
                    label="引导文字"
                    value={textStyle(item.config.introText, defaultText("", 16))}
                    onChange={(value) => onPatchItemConfig(index, { introText: value })}
                  />
                  <TextStyleFields
                    label="标题文字"
                    value={titleText}
                    onChange={(value) => {
                      onPatchItem(index, { title: value.text });
                      onPatchItemConfig(index, { titleText: value });
                    }}
                  />
                  <TextStyleFields
                    label="说明文字"
                    value={textStyle(item.config.descriptionText, defaultText("", 18))}
                    onChange={(value) => onPatchItemConfig(index, { descriptionText: value })}
                  />
                </FieldGroup>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">图标列表</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onPatchItemConfig(index, { iconItems: [...iconItems, { icon: "Sparkles", text: "" }] })}
                    >
                      <Plus data-icon="inline-start" />
                      添加图标项
                    </Button>
                  </div>
                  {iconItems.map((iconItem, iconIndex) => (
                    <div key={iconIndex} className="grid gap-4 rounded-md border border-border p-4 md:grid-cols-[180px_1fr_auto]">
                      <Field>
                        <FieldLabel>图标</FieldLabel>
                        <Select
                          value={iconItem.icon ?? "Sparkles"}
                          onChange={(event) => patchIconItem(iconIndex, { icon: event.target.value })}
                        >
                          {iconOptions.map((icon) => (
                            <option key={icon} value={icon}>
                              {icon}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>文字</FieldLabel>
                        <Input
                          value={iconItem.text ?? ""}
                          onChange={(event) => patchIconItem(iconIndex, { text: event.target.value })}
                          placeholder="图标列表文字"
                        />
                      </Field>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onPatchItemConfig(index, { iconItems: iconItems.filter((_, itemIndex) => itemIndex !== iconIndex) })}
                        >
                          <Trash2 data-icon="inline-start" />
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <FieldGroup className="grid gap-4 lg:grid-cols-2">
                <Field>
                  <FieldLabel>行动按钮文字</FieldLabel>
                  <Input
                    value={String(item.config.buttonText ?? "")}
                    onChange={(event) => onPatchItemConfig(index, { buttonText: event.target.value })}
                    placeholder="不填则不显示按钮"
                  />
                </Field>
                <Field>
                  <FieldLabel>行动按钮链接</FieldLabel>
                  <Input
                    value={String(item.config.buttonLink ?? "")}
                    onChange={(event) => onPatchItemConfig(index, { buttonLink: event.target.value })}
                    placeholder="/register 或 https://..."
                  />
                </Field>
                <Field>
                  <FieldLabel>文字颜色</FieldLabel>
                  <Input
                    type="color"
                    value={colorOf(item.config.buttonTextColor, "#ffffff")}
                    onChange={(event) => onPatchItemConfig(index, { buttonTextColor: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>按钮底色</FieldLabel>
                  <Input
                    type="color"
                    value={colorOf(item.config.buttonBgColor, "#111827")}
                    onChange={(event) => onPatchItemConfig(index, { buttonBgColor: event.target.value })}
                  />
                </Field>
              </FieldGroup>
            </div>
          );

          return (
            <Card key={item.id ?? index}>
              <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-lg">图文 {index + 1}</CardTitle>
                  <CardDescription>{titleText.text || "图片、左右方向和说明文字。"}</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onRemove(index)}>
                  <Trash2 data-icon="inline-start" />
                  删除
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <FieldGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Field>
                    <FieldLabel>布局</FieldLabel>
                    <Select
                      value={String(item.config.layout ?? "TEXT_LEFT_IMAGE_RIGHT")}
                      onChange={(event) => onPatchItemConfig(index, { layout: event.target.value })}
                    >
                      <option value="TEXT_LEFT_IMAGE_RIGHT">左文右图</option>
                      <option value="IMAGE_LEFT_TEXT_RIGHT">左图右文</option>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>图片比例</FieldLabel>
                    <Select
                      value={String(item.config.imageRatio ?? "16:9")}
                      onChange={(event) => onPatchItemConfig(index, { imageRatio: event.target.value })}
                    >
                      <option value="16:9">16:9</option>
                      <option value="4:3">4:3</option>
                      <option value="1:1">1:1</option>
                      <option value="3:4">3:4</option>
                      <option value="9:16">9:16</option>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>文字方式</FieldLabel>
                    <Select
                      value={textMode}
                      onChange={(event) => onPatchItemConfig(index, { textMode: event.target.value })}
                    >
                      <option value="TITLE_TEXT">标题文字</option>
                      <option value="ICON_LIST">图标列表</option>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>图片 Alt 描述</FieldLabel>
                    <Input
                      value={item.imageAlt}
                      onChange={(event) => onPatchItem(index, { imageAlt: event.target.value })}
                      placeholder="描述图片内容"
                    />
                  </Field>
                </FieldGroup>

                <div className="grid gap-5 lg:grid-cols-2">
                  {imageEditor}
                  {textEditor}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TextStyleFields({
  label,
  value,
  showColor = false,
  onChange
}: {
  label: string;
  value: TextStyle;
  showColor?: boolean;
  onChange(value: TextStyle): void;
}) {
  return (
    <div className={showColor ? "grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_150px_120px_110px]" : "grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_150px_120px]"}>
      <Field>
        <FieldLabel>{label}</FieldLabel>
        <Input value={value.text} onChange={(event) => onChange({ ...value, text: event.target.value })} />
      </Field>
      <Field>
        <FieldLabel>字体</FieldLabel>
        <Select
          value={value.fontFamily}
          onChange={(event) => onChange({ ...value, fontFamily: event.target.value })}
        >
          {fontOptions.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <FieldLabel>字号</FieldLabel>
        <Input
          type="number"
          min={10}
          max={72}
          value={value.fontSize}
          onChange={(event) => onChange({ ...value, fontSize: numberOf(event.target.value, value.fontSize) })}
        />
      </Field>
      {showColor ? (
        <Field>
          <FieldLabel>颜色</FieldLabel>
          <Input
            type="color"
            value={colorOf(value.color, "#ffffff")}
            onChange={(event) => onChange({ ...value, color: event.target.value })}
          />
        </Field>
      ) : null}
    </div>
  );
}

function LinkFields({
  linkType,
  linkTarget,
  linkTargets,
  onChange
}: {
  linkType: ContentModuleLinkType;
  linkTarget: string;
  linkTargets: Record<"CATEGORY" | "PAGE" | "ARTICLE", LinkTarget[]>;
  onChange(values: Partial<ModuleItemDraft>): void;
}) {
  return (
    <>
      <Field>
        <FieldLabel>跳转类型</FieldLabel>
        <Select
          value={linkType}
          onChange={(event) =>
            onChange({
              linkType: event.target.value as ContentModuleLinkType,
              linkTarget: ""
            })
          }
        >
          <option value="NONE">不跳转</option>
          <option value="CATEGORY">本站分类</option>
          <option value="PAGE">单页</option>
          <option value="ARTICLE">文章</option>
          <option value="EXTERNAL">站外链接</option>
        </Select>
      </Field>
      <Field>
        <FieldLabel>对应内容</FieldLabel>
        {linkType === "EXTERNAL" ? (
          <Input
            value={linkTarget}
            onChange={(event) => onChange({ linkTarget: event.target.value })}
            placeholder="https://..."
          />
        ) : linkType === "NONE" ? (
          <Input value="" placeholder="无需选择" disabled />
        ) : (
          <Select value={linkTarget} onChange={(event) => onChange({ linkTarget: event.target.value })}>
            <option value="">请选择</option>
            {linkTargets[linkType].map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </>
  );
}

function ImageUploader({
  id,
  imageUrl,
  uploading,
  compact = false,
  onUpload
}: {
  id: string;
  imageUrl: string;
  uploading: boolean;
  compact?: boolean;
  onUpload(file: File): void;
}) {
  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      <label
        className={
          compact
            ? "flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-secondary/40"
            : "flex min-h-52 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-secondary/40"
        }
        htmlFor={id}
      >
        {imageUrl ? (
          <img alt="模块图片预览" className="h-full w-full object-cover" src={imageUrl} />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon />
            点击上传图片
          </span>
        )}
      </label>
      <input
        accept="image/*"
        className="hidden"
        id={id}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";

          if (file) {
            onUpload(file);
          }
        }}
      />
      <div className="flex items-center gap-2">
        <Button asChild type="button" variant="outline" size="sm">
          <label htmlFor={id}>
            <Upload data-icon="inline-start" />
            {imageUrl ? "修改图片" : "上传图片"}
          </label>
        </Button>
        {uploading ? <Badge variant="secondary">上传中</Badge> : null}
      </div>
      {!compact ? <FieldDescription>上传后图片会进入媒体资源库，可继续在模块中引用。</FieldDescription> : null}
    </div>
  );
}

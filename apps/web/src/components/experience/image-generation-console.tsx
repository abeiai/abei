"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  History,
  Images,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  WandSparkles
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PublicUser } from "@/lib/auth-actions";
import type { ExperienceImageModel } from "@/lib/experience-api";
import type { UserOrganizationsResult } from "@/lib/organizations-api";
import { cn } from "@/lib/utils";

interface ImageGenerationConsoleProps {
  currentUser: PublicUser | null;
  initialOrganizationId?: string;
  models: ExperienceImageModel[];
  organizations: UserOrganizationsResult | null;
}

interface ReferenceImage {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}

interface GeneratedImage {
  id: string;
  url: string;
  alt: string;
}

interface ImageJob {
  id: string;
  prompt: string;
  modelId: string;
  modelName: string;
  providerName?: string;
  mode: string;
  ratio: string;
  resolution: string;
  width: number;
  height: number;
  count: number;
  createdAt: string;
  requestId?: string | null;
  references: ReferenceImage[];
  images: GeneratedImage[];
}

interface ImageGenerationApiResult {
  id: string;
  prompt: string;
  modelId: string;
  modelName: string;
  providerName: string;
  width: number;
  height: number;
  count: number;
  createdAt: string;
  requestId: string | null;
  images: GeneratedImage[];
}

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

const historyKey = "xueleai:experience-image:history";
const promptLimit = 2000;
const ratios = [
  { value: "smart", label: "智能", width: 1024, height: 1024 },
  { value: "21:9", label: "21:9", width: 1792, height: 768 },
  { value: "16:9", label: "16:9", width: 1536, height: 864 },
  { value: "3:2", label: "3:2", width: 1440, height: 960 },
  { value: "4:3", label: "4:3", width: 1344, height: 1008 },
  { value: "1:1", label: "1:1", width: 1024, height: 1024 },
  { value: "3:4", label: "3:4", width: 1008, height: 1344 },
  { value: "2:3", label: "2:3", width: 960, height: 1440 },
  { value: "9:16", label: "9:16", width: 864, height: 1536 }
] as const;
const modes = ["图片生成", "参考图生成", "风格延展"];
const resolutions = ["高清 2K", "超清 4K"];

export function ImageGenerationConsole({
  currentUser,
  initialOrganizationId = "",
  models,
  organizations
}: ImageGenerationConsoleProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [history, setHistory] = useState<ImageJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(models[0]?.id ?? "mock-image-lite");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(initialOrganizationId);
  const [mode, setMode] = useState(modes[0]);
  const [ratio, setRatio] = useState<(typeof ratios)[number]["value"]>("16:9");
  const [resolution, setResolution] = useState(resolutions[0]);
  const [width, setWidth] = useState(1536);
  const [height, setHeight] = useState(864);
  const [count, setCount] = useState(4);
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [status, setStatus] = useState("准备生成");
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? models[0],
    [models, selectedModelId]
  );
  const availableOrganizations = useMemo(
    () => (organizations?.enabled ? organizations.organizations.filter((organization) => organization.memberStatus === "ACTIVE") : []),
    [organizations]
  );
  const maxReferenceImages = selectedModel?.maxReferenceImages ?? 0;
  const maxOutputImages = Math.max(1, selectedModel?.maxOutputImages ?? 4);
  const selectedJob = history.find((job) => job.id === selectedJobId) ?? history[0] ?? null;
  const canAddReference = maxReferenceImages > references.length;
  const billingContext = selectedOrganizationId ? "ORGANIZATION" : "PERSONAL";

  useEffect(() => {
    setSelectedOrganizationId(initialOrganizationId);
  }, [initialOrganizationId]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      return;
    }

    if (!availableOrganizations.some((organization) => organization.id === selectedOrganizationId)) {
      setSelectedOrganizationId("");
    }
  }, [availableOrganizations, selectedOrganizationId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(historyKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;

      if (Array.isArray(parsed)) {
        setHistory(parsed.filter(isImageJob).slice(0, 40));
      }
    } catch {
      window.localStorage.removeItem(historyKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 40)));
  }, [history]);

  useEffect(() => {
    if (models.some((model) => model.id === selectedModelId)) {
      return;
    }

    setSelectedModelId(models[0]?.id ?? "mock-image-lite");
  }, [models, selectedModelId]);

  useEffect(() => {
    if (references.length <= maxReferenceImages) {
      return;
    }

    setReferences((items) => items.slice(0, maxReferenceImages));
  }, [maxReferenceImages, references.length]);

  useEffect(() => {
    if (count <= maxOutputImages) {
      return;
    }

    setCount(maxOutputImages);
  }, [count, maxOutputImages]);

  function applyRatio(value: (typeof ratios)[number]["value"]) {
    const preset = ratios.find((item) => item.value === value) ?? ratios[0];

    setRatio(value);
    setWidth(preset.width);
    setHeight(preset.height);
  }

  async function handleReferenceUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));

    if (files.length === 0 || maxReferenceImages === 0) {
      event.target.value = "";
      return;
    }

    const available = Math.max(0, maxReferenceImages - references.length);
    const nextFiles = files.slice(0, available);
    const loaded = await Promise.all(nextFiles.map(readReferenceImage));

    setReferences((items) => [...items, ...loaded]);
    event.target.value = "";
  }

  function removeReference(id: string) {
    setReferences((items) => items.filter((item) => item.id !== id));
  }

  async function generateImages() {
    const normalizedPrompt = prompt.trim();

    if (!normalizedPrompt) {
      setStatus("请先输入图片提示词");
      return;
    }

    const safeCount = Math.max(1, Math.min(count, maxOutputImages));
    const model = selectedModel ?? models[0];

    if (!model) {
      setStatus("暂无可用图片模型");
      return;
    }

    if (!model.isMock && !currentUser) {
      setStatus("请先登录后再体验真实图片生成");
      return;
    }

    setIsGenerating(true);
    setStatus(`${model.displayName} 正在生成...`);

    try {
      const job = model.isMock
        ? createMockImageJob(normalizedPrompt, model, safeCount)
        : await createProviderImageJob(normalizedPrompt, model, safeCount);

      setHistory((items) => [job, ...items].slice(0, 40));
      setSelectedJobId(job.id);
      setStatus(model.isMock ? "演示生成完成" : "真实图片生成完成");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "图片生成失败，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  }

  function createMockImageJob(normalizedPrompt: string, model: ExperienceImageModel, safeCount: number): ImageJob {
    const createdAt = new Date().toISOString();
    const images = Array.from({ length: safeCount }, (_, index) => ({
      id: createId("image"),
      url: createPreviewSvg(normalizedPrompt, width, height, index, ratio),
      alt: `${normalizedPrompt.slice(0, 60)} - ${index + 1}`
    }));

    return {
      id: createId("job"),
      prompt: normalizedPrompt,
      modelId: model.id,
      modelName: model.displayName,
      providerName: model.providerPresetName,
      mode,
      ratio,
      resolution,
      width,
      height,
      count: safeCount,
      createdAt,
      requestId: null,
      references,
      images
    };
  }

  async function createProviderImageJob(normalizedPrompt: string, model: ExperienceImageModel, safeCount: number): Promise<ImageJob> {
    const response = await fetch("/api/ai/image/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: normalizedPrompt,
        modelInstanceId: model.id,
        billingContext,
        ...(selectedOrganizationId ? { organizationId: selectedOrganizationId } : {}),
        width,
        height,
        count: safeCount,
        ratio,
        resolution,
        mode,
        referenceImages: references.map((item) => ({
          name: item.name,
          type: "image",
          mimeType: item.type || "image/png",
          size: item.size,
          dataUrl: item.dataUrl
        }))
      })
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<ImageGenerationApiResult> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      throw new Error(response.status === 401 ? "请先登录后再体验真实图片生成" : payload?.message || "图片生成失败，请稍后重试");
    }

    return {
      id: payload.data.id,
      prompt: payload.data.prompt,
      modelId: payload.data.modelId,
      modelName: payload.data.modelName,
      providerName: payload.data.providerName,
      mode,
      ratio,
      resolution,
      width: payload.data.width,
      height: payload.data.height,
      count: payload.data.count,
      createdAt: payload.data.createdAt,
      requestId: payload.data.requestId,
      references,
      images: payload.data.images
    };
  }

  function reuseJob(job: ImageJob) {
    setPrompt(job.prompt);
    setSelectedModelId(job.modelId);
    setMode(job.mode);
    setRatio(job.ratio as (typeof ratios)[number]["value"]);
    setResolution(job.resolution);
    setWidth(job.width);
    setHeight(job.height);
    setCount(job.count);
    setReferences(job.references);
    setSelectedJobId(job.id);
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] overflow-hidden bg-secondary/50 text-foreground">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200",
          sidebarCollapsed ? "w-[72px]" : "w-60 lg:w-[280px]"
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-5">
          <Link className="flex min-w-0 items-center gap-3" href="/experience/image">
            <Images className="size-7" />
            {!sidebarCollapsed ? <span className="truncate text-xl font-semibold">图片生成</span> : null}
          </Link>
          <button
            aria-label={sidebarCollapsed ? "展开历史" : "收起历史"}
            className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={() => setSidebarCollapsed((value) => !value)}
            type="button"
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>

        <div className="px-5">
          <Button className="w-full justify-center" onClick={() => setSelectedJobId(null)} variant="outline">
            <Plus data-icon="inline-start" />
            {!sidebarCollapsed ? "新建生成" : null}
          </Button>
        </div>

        <div className="mt-6 flex-1 overflow-y-auto px-4 pb-4">
          {!sidebarCollapsed ? (
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <History className="size-4" />
              <span>生成历史</span>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            {history.length > 0 ? (
              history.map((job) => (
                <button
                  className={cn(
                    "rounded-lg text-left transition hover:bg-secondary",
                    selectedJob?.id === job.id ? "bg-secondary" : "bg-transparent",
                    sidebarCollapsed ? "p-2" : "p-3"
                  )}
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  type="button"
                >
                  {sidebarCollapsed ? (
                    <img alt="" className="aspect-square rounded-md object-cover" src={job.images[0]?.url} />
                  ) : (
                    <div className="flex gap-3">
                      <img alt="" className="size-14 rounded-md object-cover" src={job.images[0]?.url} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{job.prompt}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatTime(job.createdAt)} · {job.modelName}</p>
                      </div>
                    </div>
                  )}
                </button>
              ))
            ) : !sidebarCollapsed ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                暂无历史。生成图片后会保存在当前浏览器。
              </p>
            ) : null}
          </div>
        </div>

      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 shrink-0 items-center justify-end border-b border-border bg-background px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {currentUser && availableOrganizations.length > 0 ? (
              <label className="flex min-w-0 text-sm md:w-64">
                <Select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)}>
                  <option value="">个人空间</option>
                  {availableOrganizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <label className="flex min-w-0 text-sm md:w-80">
              <Select value={selectedModelId} onChange={(event) => setSelectedModelId(event.target.value)}>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName} · {model.providerPresetName}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-64 pt-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-12">
            {selectedJob ? (
              <ImageJobView job={selectedJob} onReuse={() => reuseJob(selectedJob)} />
            ) : (
              <EmptyCanvas />
            )}

            {history.filter((job) => job.id !== selectedJob?.id).slice(0, 5).map((job) => (
              <ImageJobView compact key={job.id} job={job} onReuse={() => reuseJob(job)} />
            ))}
          </div>
        </div>

        <div
          className={cn(
            "pointer-events-none fixed bottom-0 left-0 right-0 z-20 px-5 pb-5 transition-[left] duration-200",
            sidebarCollapsed ? "md:left-[72px]" : "md:left-60 lg:left-[280px]"
          )}
        >
          <div className="pointer-events-auto mx-auto max-w-6xl rounded-2xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur">
            {references.length > 0 ? (
              <div className="mb-4 flex gap-3 overflow-x-auto">
                {references.map((item) => (
                  <div className="relative flex min-w-56 items-center gap-3 rounded-xl bg-secondary p-2" key={item.id}>
                    <img alt={item.name} className="size-14 rounded-md object-cover" src={item.dataUrl} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">图片 · {formatSize(item.size)}</p>
                    </div>
                    <button
                      aria-label="移除参考图"
                      className="absolute right-2 top-2 rounded-full bg-background p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => removeReference(item.id)}
                      type="button"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <Textarea
              className="min-h-20 resize-none border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0"
              maxLength={promptLimit}
              onChange={(event) => setPrompt(event.target.value.slice(0, promptLimit))}
              placeholder="描述你想生成的画面、风格、构图、颜色和用途..."
              value={prompt}
            />

            <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {maxReferenceImages > 0 ? (
                  <>
                    <input
                      accept="image/*"
                      className="hidden"
                      multiple
                      onChange={handleReferenceUpload}
                      ref={fileInputRef}
                      type="file"
                    />
                    <Button
                      disabled={!canAddReference}
                      onClick={() => fileInputRef.current?.click()}
                      title={`最多 ${maxReferenceImages} 张参考图`}
                      type="button"
                      variant="outline"
                    >
                      <Plus data-icon="inline-start" />
                      参考图 {references.length}/{maxReferenceImages}
                    </Button>
                  </>
                ) : null}
                <Select className="w-36" value={mode} onChange={(event) => setMode(event.target.value)}>
                  {modes.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </Select>
                <Select className="w-28" value={ratio} onChange={(event) => applyRatio(event.target.value as (typeof ratios)[number]["value"])}>
                  {ratios.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </Select>
                <Select className="w-32" value={resolution} onChange={(event) => setResolution(event.target.value)}>
                  {resolutions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </Select>
                <label className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm">
                  <span className="text-muted-foreground">张数</span>
                  <input
                    className="w-12 bg-transparent text-right outline-none"
                    max={maxOutputImages}
                    min={1}
                    onChange={(event) => setCount(Number(event.target.value) || 1)}
                    type="number"
                    value={count}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{width} x {height}px</span>
                  <span>·</span>
                  <span>{status}</span>
                </div>
                <Button className="rounded-full px-6" disabled={isGenerating} onClick={generateImages} type="button">
                  <Sparkles data-icon="inline-start" />
                  {isGenerating ? "生成中..." : "生成图片"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ImageJobView({ job, compact, onReuse }: { job: ImageJob; compact?: boolean; onReuse: () => void }) {
  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className={cn("leading-8", compact ? "line-clamp-2 text-base" : "text-lg")}>{job.prompt}</p>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span>{job.modelName}</span>
          <span>|</span>
          <span>{job.ratio}</span>
          <span>|</span>
          <span>{job.resolution}</span>
          <span>|</span>
          <span>{formatTime(job.createdAt)}</span>
        </div>
      </div>
      <div className={cn("grid overflow-hidden rounded-md border border-border bg-background", imageGridClass(job.images.length))}>
        {job.images.map((image) => (
          <img alt={image.alt} className="aspect-video h-full w-full object-cover" key={image.id} src={image.url} />
        ))}
      </div>
      {!compact ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onReuse} type="button" variant="outline">
            <RotateCcw data-icon="inline-start" />
            重新编辑
          </Button>
          <Button onClick={onReuse} type="button" variant="outline">
            <WandSparkles data-icon="inline-start" />
            再次生成
          </Button>
          <Button asChild type="button" variant="outline">
            <a download={`xueleai-image-${job.id}.svg`} href={job.images[0]?.url ?? "#"}>
              <Download data-icon="inline-start" />
              下载首图
            </a>
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function EmptyCanvas() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-background">
      <div className="max-w-md px-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary">
          <Images className="size-7" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold">开始生成图片</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          输入画面描述，选择模型、比例和分辨率；如果模型支持参考图，可以添加多张图片作为风格或主体参考。
        </p>
      </div>
    </div>
  );
}

function imageGridClass(count: number) {
  if (count <= 1) {
    return "grid-cols-1";
  }

  if (count === 2) {
    return "grid-cols-2";
  }

  return "grid-cols-2 lg:grid-cols-4";
}

function readReferenceImage(file: File): Promise<ReferenceImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("参考图读取失败"));
    reader.onload = () => {
      resolve({
        id: createId("ref"),
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: String(reader.result)
      });
    };
    reader.readAsDataURL(file);
  });
}

function createPreviewSvg(prompt: string, width: number, height: number, index: number, ratio: string) {
  const seed = hashText(`${prompt}-${index}-${ratio}`);
  const hue = seed % 360;
  const accent = (hue + 55 + index * 21) % 360;
  const lines = wrapText(prompt, 18).slice(0, 4);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    "<defs>",
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 72% 78%)"/><stop offset="1" stop-color="hsl(${accent} 78% 62%)"/></linearGradient>`,
    `<radialGradient id="r" cx="72%" cy="24%" r="70%"><stop stop-color="white" stop-opacity=".68"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>`,
    "</defs>",
    `<rect width="${width}" height="${height}" fill="url(#g)"/>`,
    `<rect width="${width}" height="${height}" fill="url(#r)"/>`,
    `<circle cx="${width * 0.18}" cy="${height * 0.26}" r="${Math.min(width, height) * 0.15}" fill="white" opacity=".22"/>`,
    `<circle cx="${width * 0.82}" cy="${height * 0.74}" r="${Math.min(width, height) * 0.22}" fill="black" opacity=".08"/>`,
    `<rect x="${width * 0.06}" y="${height * 0.61}" width="${width * 0.88}" height="${height * 0.24}" rx="28" fill="white" opacity=".72"/>`,
    `<text x="${width * 0.08}" y="${height * 0.69}" font-family="Inter, PingFang SC, Microsoft YaHei, sans-serif" font-size="${Math.max(26, Math.min(width, height) * 0.05)}" font-weight="700" fill="#18212f">AI SaaS 图片生成</text>`,
    ...lines.map((line, lineIndex) =>
      `<text x="${width * 0.08}" y="${height * (0.76 + lineIndex * 0.045)}" font-family="Inter, PingFang SC, Microsoft YaHei, sans-serif" font-size="${Math.max(18, Math.min(width, height) * 0.032)}" fill="#273244">${escapeXml(line)}</text>`
    ),
    "</svg>"
  ].join("");

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function wrapText(value: string, size: number) {
  const chars = Array.from(value);
  const lines: string[] = [];

  for (let index = 0; index < chars.length; index += size) {
    lines.push(chars.slice(index, index + size).join(""));
  }

  return lines;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hashText(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))}KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function isImageJob(value: unknown): value is ImageJob {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<ImageJob>;

  return Boolean(
    typeof item.id === "string" &&
      typeof item.prompt === "string" &&
      typeof item.modelId === "string" &&
      Array.isArray(item.images)
  );
}

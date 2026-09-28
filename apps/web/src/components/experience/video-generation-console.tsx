"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Film,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Video
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PublicUser } from "@/lib/auth-actions";
import type { ExperienceVideoModel } from "@/lib/experience-api";
import type { UserOrganizationsResult } from "@/lib/organizations-api";
import { cn } from "@/lib/utils";

interface VideoGenerationConsoleProps {
  currentUser: PublicUser | null;
  historyStorageKey: string;
  initialOrganizationId?: string;
  models: ExperienceVideoModel[];
  organizations: UserOrganizationsResult | null;
}

interface ReferenceFile {
  id: string;
  name: string;
  size: number;
  type: "image" | "video" | "audio";
  mimeType: string;
  dataUrl: string;
}

interface VideoJob {
  id: string;
  prompt: string;
  modelId: string;
  modelName: string;
  providerName?: string;
  ratio: string;
  resolution: string;
  duration: number;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  statusName: string;
  createdAt: string;
  requestId?: string | null;
  providerTaskId?: string | null;
  references: ReferenceFile[];
  videoUrl: string | null;
  errorMessage?: string | null;
}

interface VideoGenerationApiResult {
  id: string;
  prompt: string;
  modelId: string;
  modelName: string;
  providerName: string;
  ratio: string;
  resolution: string;
  duration: number;
  createdAt: string;
  requestId: string | null;
  providerTaskId: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  statusName: string;
  videoUrl: string | null;
  errorMessage: string | null;
}

interface VideoTaskApiResult {
  providerTaskId: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  statusName: string;
  videoUrl: string | null;
  errorMessage: string | null;
  requestId: string | null;
}

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

const legacyHistoryKey = "xueleai:experience-video:history";
const promptLimit = 2000;
const defaultRatios = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
const defaultResolutions = ["高清 720P", "高清 1080P"] as const;
const defaultDurations = [5, 10] as const;

export function VideoGenerationConsole({
  currentUser,
  historyStorageKey,
  initialOrganizationId = "",
  models,
  organizations
}: VideoGenerationConsoleProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [history, setHistory] = useState<VideoJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(models[0]?.id ?? "mock-video-t2v");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(initialOrganizationId);
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState(models[0]?.defaultResolution ?? "高清 720P");
  const [duration, setDuration] = useState<number>(models[0]?.defaultDuration ?? 5);
  const [promptRewrite, setPromptRewrite] = useState(false);
  const [references, setReferences] = useState<ReferenceFile[]>([]);
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
  const maxReferenceFiles = selectedModel?.maxReferenceFiles ?? 0;
  const acceptedReferenceTypes = selectedModel?.acceptedReferenceTypes ?? [];
  const selectedJob = history.find((job) => job.id === selectedJobId) ?? history[0] ?? null;
  const canAddReference = maxReferenceFiles > references.length;
  const accept = acceptedReferenceTypes.length > 0 ? acceptedReferenceTypes.join(",") : "image/*,video/*,audio/*";
  const billingContext = selectedOrganizationId ? "ORGANIZATION" : "PERSONAL";
  const ratioOptions = selectedModel?.supportedRatios?.length
    ? selectedModel.supportedRatios
    : [...defaultRatios];
  const durationOptions = selectedModel?.supportedDurations?.length
    ? selectedModel.supportedDurations
    : [...defaultDurations];
  const resolutionOptions = selectedModel?.supportedResolutions?.length
    ? selectedModel.supportedResolutions
    : [...defaultResolutions];

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
      window.localStorage.removeItem(legacyHistoryKey);
      const raw = window.localStorage.getItem(historyStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;

      if (Array.isArray(parsed)) {
        setHistory(parsed.filter(isVideoJob).slice(0, 40));
      }
    } catch {
      window.localStorage.removeItem(historyStorageKey);
    }
  }, [historyStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(historyStorageKey, JSON.stringify(history.slice(0, 40)));
  }, [history, historyStorageKey]);

  useEffect(() => {
    if (models.some((model) => model.id === selectedModelId)) {
      return;
    }

    setSelectedModelId(models[0]?.id ?? "mock-video-t2v");
  }, [models, selectedModelId]);

  useEffect(() => {
    const nextDuration = selectedModel?.defaultDuration ?? 5;
    const supportedDurations = selectedModel?.supportedDurations?.length
      ? selectedModel.supportedDurations
      : [...defaultDurations];
    setDuration((value) => (supportedDurations.includes(value) ? value : nextDuration));
    const supportedRatios = selectedModel?.supportedRatios?.length
      ? selectedModel.supportedRatios
      : [...defaultRatios];
    setRatio((value) => (supportedRatios.includes(value) ? value : "16:9"));
    const nextResolution = selectedModel?.defaultResolution ?? "高清 720P";
    const supportedResolutions = selectedModel?.supportedResolutions?.length
      ? selectedModel.supportedResolutions
      : [...defaultResolutions];
    setResolution((value) => (supportedResolutions.includes(value) ? value : nextResolution));
    setPromptRewrite(false);
  }, [selectedModel]);

  useEffect(() => {
    if (references.length <= maxReferenceFiles) {
      return;
    }

    setReferences((items) => items.slice(0, maxReferenceFiles));
  }, [maxReferenceFiles, references.length]);

  async function handleReferenceUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => acceptedFile(file, acceptedReferenceTypes));

    if (files.length === 0 || maxReferenceFiles === 0) {
      event.target.value = "";
      return;
    }

    const available = Math.max(0, maxReferenceFiles - references.length);
    const nextFiles = files.slice(0, available);
    const loaded = await Promise.all(nextFiles.map(readReferenceFile));

    setReferences((items) => [...items, ...loaded]);
    event.target.value = "";
  }

  function removeReference(id: string) {
    setReferences((items) => items.filter((item) => item.id !== id));
  }

  async function generateVideo() {
    const normalizedPrompt = prompt.trim();
    const model = selectedModel ?? models[0];

    if (!normalizedPrompt) {
      setStatus("请先输入视频提示词");
      return;
    }

    if (!model) {
      setStatus("暂无可用视频模型");
      return;
    }

    if (!model.isMock && !currentUser) {
      setStatus("请先登录后再体验真实视频生成");
      return;
    }

    setIsGenerating(true);
    setStatus(`${model.displayName} 正在提交任务...`);

    try {
      const job = model.isMock ? createMockVideoJob(normalizedPrompt, model) : await createProviderVideoJob(normalizedPrompt, model);

      setHistory((items) => [job, ...items].slice(0, 40));
      setSelectedJobId(job.id);

      if (job.status === "RUNNING" && job.providerTaskId) {
        await pollProviderVideoJob(job);
      } else {
        setStatus(job.statusName);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "视频生成失败，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  }

  function createMockVideoJob(normalizedPrompt: string, model: ExperienceVideoModel): VideoJob {
    return {
      id: createId("video-job"),
      prompt: normalizedPrompt,
      modelId: model.id,
      modelName: model.displayName,
      providerName: model.providerPresetName,
      ratio,
      resolution,
      duration,
      status: "SUCCEEDED",
      statusName: "演示任务完成",
      createdAt: new Date().toISOString(),
      requestId: null,
      providerTaskId: null,
      references,
      videoUrl: null,
      errorMessage: null
    };
  }

  async function createProviderVideoJob(normalizedPrompt: string, model: ExperienceVideoModel): Promise<VideoJob> {
    const response = await fetch("/api/ai/video/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: normalizedPrompt,
        modelInstanceId: model.id,
        billingContext,
        ...(selectedOrganizationId ? { organizationId: selectedOrganizationId } : {}),
        ratio,
        resolution,
        duration,
        promptRewrite,
        referenceFiles: references.map((item) => ({
          name: item.name,
          type: item.type,
          mimeType: item.mimeType,
          size: item.size,
          dataUrl: item.dataUrl
        }))
      })
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<VideoGenerationApiResult> | null;

    if (!response.ok || payload?.code !== 0 || !payload.data) {
      throw new Error(response.status === 401 ? "请先登录后再体验真实视频生成" : payload?.message || "视频生成失败，请稍后重试");
    }

    return {
      id: payload.data.id,
      prompt: payload.data.prompt,
      modelId: payload.data.modelId,
      modelName: payload.data.modelName,
      providerName: payload.data.providerName,
      ratio: payload.data.ratio,
      resolution: payload.data.resolution,
      duration: payload.data.duration,
      status: payload.data.status,
      statusName: payload.data.statusName,
      createdAt: payload.data.createdAt,
      requestId: payload.data.requestId,
      providerTaskId: payload.data.providerTaskId,
      references,
      videoUrl: payload.data.videoUrl,
      errorMessage: payload.data.errorMessage
    };
  }

  async function pollProviderVideoJob(job: VideoJob) {
    setStatus("视频任务生成中...");

    for (let attempt = 0; attempt < 80; attempt += 1) {
      await sleep(attempt < 6 ? 2500 : 5000);
      const response = await fetch(`/api/ai/video/tasks/${encodeURIComponent(job.id)}`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as ApiResponse<VideoTaskApiResult> | null;

      if (!response.ok || payload?.code !== 0 || !payload.data) {
        throw new Error(payload?.message || "视频任务查询失败，请稍后重试");
      }

      const nextJob: VideoJob = {
        ...job,
        status: payload.data.status,
        statusName: payload.data.statusName,
        videoUrl: payload.data.videoUrl ?? job.videoUrl,
        errorMessage: payload.data.errorMessage,
        requestId: payload.data.requestId ?? job.requestId
      };

      setHistory((items) => items.map((item) => (item.id === job.id ? nextJob : item)));
      setStatus(payload.data.statusName);

      if (payload.data.status !== "RUNNING") {
        return;
      }
    }

    setStatus("视频仍在生成中，可稍后从历史记录查看");
  }

  function reuseJob(job: VideoJob) {
    setPrompt(job.prompt);
    setSelectedModelId(job.modelId);
    setRatio(job.ratio);
    setResolution(job.resolution);
    setDuration(job.duration);
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
          <Link className="flex min-w-0 items-center gap-3" href="/experience/video">
            <Film className="size-7" />
            {!sidebarCollapsed ? <span className="truncate text-xl font-semibold">视频生成</span> : null}
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
                    <div className="flex aspect-square items-center justify-center rounded-md bg-secondary">
                      <Play className="size-5" />
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-secondary">
                        <Video className="size-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{job.prompt}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatTime(job.createdAt)} · {job.statusName}
                        </p>
                      </div>
                    </div>
                  )}
                </button>
              ))
            ) : !sidebarCollapsed ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                暂无历史。生成视频后会保存在当前浏览器。
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
            {selectedJob ? <VideoJobView job={selectedJob} onReuse={() => reuseJob(selectedJob)} /> : <EmptyCanvas />}

            {history.filter((job) => job.id !== selectedJob?.id).slice(0, 5).map((job) => (
              <VideoJobView compact key={job.id} job={job} onReuse={() => reuseJob(job)} />
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
                  <div className="relative flex min-w-60 items-center gap-3 rounded-xl bg-secondary p-2" key={item.id}>
                    {item.type === "image" ? (
                      <img alt={item.name} className="size-14 rounded-md object-cover" src={item.dataUrl} />
                    ) : (
                      <div className="flex size-14 items-center justify-center rounded-md bg-background">
                        <Upload className="size-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fileTypeName(item.type)} · {formatSize(item.size)}
                      </p>
                    </div>
                    <button
                      aria-label="移除参考文件"
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
              placeholder="描述视频主体、动作、镜头、风格、背景、节奏和用途..."
              value={prompt}
            />

            <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {maxReferenceFiles > 0 ? (
                  <>
                    <input
                      accept={accept}
                      className="hidden"
                      multiple
                      onChange={handleReferenceUpload}
                      ref={fileInputRef}
                      type="file"
                    />
                    <Button
                      disabled={!canAddReference}
                      onClick={() => fileInputRef.current?.click()}
                      title={`最多 ${maxReferenceFiles} 个参考文件`}
                      type="button"
                      variant="outline"
                    >
                      <Plus data-icon="inline-start" />
                      参考文件 {references.length}/{maxReferenceFiles}
                    </Button>
                  </>
                ) : null}
                <Select className="w-28" value={ratio} onChange={(event) => setRatio(event.target.value)}>
                  {ratioOptions.map((item) => (
                    <option key={item} value={item}>
                      {item === "adaptive" ? "自适应" : item}
                    </option>
                  ))}
                </Select>
                <Select className="w-32" value={resolution} onChange={(event) => setResolution(event.target.value)}>
                  {resolutionOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
                <Select className="w-24" value={String(duration)} onChange={(event) => setDuration(Number(event.target.value))}>
                  {durationOptions.map((item) => (
                    <option key={item} value={item}>
                      {item} 秒
                    </option>
                  ))}
                </Select>
                {selectedModel?.supportsPromptRewrite ? (
                  <label className="flex h-9 items-center gap-2 px-1 text-sm">
                    <button
                      aria-checked={promptRewrite}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                        promptRewrite ? "bg-primary" : "bg-secondary"
                      )}
                      onClick={() => setPromptRewrite((value) => !value)}
                      role="switch"
                      type="button"
                    >
                      <span
                        className={cn(
                          "size-4 rounded-full bg-background shadow-sm transition-transform",
                          promptRewrite ? "translate-x-4" : "translate-x-0.5"
                        )}
                      />
                    </button>
                    提示词重写
                  </label>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{selectedModel?.modelName ?? "未选择模型"}</span>
                  <span>·</span>
                  <span>{status}</span>
                </div>
                <Button className="rounded-full px-6" disabled={isGenerating} onClick={generateVideo} type="button">
                  <Sparkles data-icon="inline-start" />
                  {isGenerating ? "生成中..." : "生成视频"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function VideoJobView({ job, compact, onReuse }: { job: VideoJob; compact?: boolean; onReuse: () => void }) {
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
          <span>{job.duration} 秒</span>
          <span>|</span>
          <span>{job.statusName}</span>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        {job.videoUrl ? (
          <video className="aspect-video w-full bg-secondary object-contain" controls src={job.videoUrl} />
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-secondary text-muted-foreground">
            <Video className="size-10" />
            <p>{job.status === "FAILED" ? job.errorMessage || "生成失败" : job.statusName}</p>
          </div>
        )}
      </div>
      {!compact ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onReuse} type="button" variant="outline">
            <RotateCcw data-icon="inline-start" />
            重新编辑
          </Button>
          {job.videoUrl ? (
            <Button asChild type="button" variant="outline">
              <a download={`xueleai-video-${job.id}.mp4`} href={job.videoUrl}>
                <Download data-icon="inline-start" />
                下载视频
              </a>
            </Button>
          ) : null}
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
          <Film className="size-7" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold">开始生成视频</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          输入视频描述，选择模型、比例、清晰度和时长；如果模型支持参考文件，可以上传图片、视频或音频辅助生成。
        </p>
      </div>
    </div>
  );
}

function readReferenceFile(file: File): Promise<ReferenceFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const type = fileKind(file);

    reader.onerror = () => reject(new Error("参考文件读取失败"));
    reader.onload = () => {
      resolve({
        id: createId("ref"),
        name: file.name,
        size: file.size,
        type,
        mimeType: file.type,
        dataUrl: String(reader.result)
      });
    };
    reader.readAsDataURL(file);
  });
}

function acceptedFile(file: File, acceptedTypes: string[]) {
  if (file.size > 10 * 1024 * 1024) {
    return false;
  }

  if (acceptedTypes.length === 0) {
    return file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/");
  }

  return acceptedTypes.some((type) => {
    if (type === "image/*") {
      return file.type.startsWith("image/");
    }
    if (type === "video/*") {
      return file.type.startsWith("video/");
    }
    if (type === "audio/*") {
      return file.type.startsWith("audio/");
    }
    return file.type === type;
  });
}

function fileKind(file: File): ReferenceFile["type"] {
  if (file.type.startsWith("video/")) {
    return "video";
  }

  if (file.type.startsWith("audio/")) {
    return "audio";
  }

  return "image";
}

function fileTypeName(type: ReferenceFile["type"]) {
  const names: Record<ReferenceFile["type"], string> = {
    image: "图片",
    video: "视频",
    audio: "音频"
  };

  return names[type];
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

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isVideoJob(value: unknown): value is VideoJob {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<VideoJob>;

  return Boolean(
    typeof item.id === "string" &&
      typeof item.prompt === "string" &&
      typeof item.modelId === "string" &&
      typeof item.status === "string"
  );
}

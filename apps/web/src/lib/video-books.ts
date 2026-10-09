import type { ExperienceVideoModel } from "./experience-api";
import type { PictureBookGuide } from "./picture-book-guide";

export const videoBookMotions = [
  { id: "gentle", label: "轻柔动态", prompt: "保持原有插画风格和角色外观，角色自然眨眼，衣物和背景轻轻摆动，动作轻柔连贯。" },
  { id: "push", label: "镜头推进", prompt: "镜头从原始画面缓慢推进至主角，保持人物与场景一致，动作自然，运镜平稳。" },
  { id: "pan", label: "横向运镜", prompt: "镜头缓慢横向移动，展示绘本场景的细节，保持构图与角色一致，避免画面变形。" },
  { id: "story", label: "故事表演", prompt: "让画面中的角色根据本页描述自然表演，保持原有画风和角色身份，动作连贯，镜头稳定。" },
  { id: "custom", label: "自定义", prompt: "" }
] as const;
export type VideoBookMotion = typeof videoBookMotions[number]["id"];
export type VideoBookReference = { id: string; name: string; type: "image" | "audio" | "video"; mimeType: string; size: number; dataUrl: string };
export type VideoBookClip = {
  id: string; providerTaskId: string | null; status: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  videoUrl: string | null; errorMessage: string | null; modelName: string;
  ratio: string; duration: number; prompt: string; createdAt: string;
};
export type VideoBookPage = {
  pageNumber: number; imageUrl: string; cleanImageUrl: string | null; sourceText: string;
  description: string; prompt: string; motion: VideoBookMotion; references: VideoBookReference[]; clip: VideoBookClip | null;
};
export type VideoBookProject = {
  id: string; title: string; pdfUrl: string; sourceName: string; editing: boolean; removeText: boolean;
  modelId: string; ratio: string; resolution: string; duration: number; updatedAt: string; pages: VideoBookPage[];
  pollingPaused?: boolean;
};

// Only models whose adapter sends the image as first_frame belong in this tool.
export function videoBookModels(models: ExperienceVideoModel[]) {
  return models.filter(model => !model.isMock && model.modelName.includes("-i2v") && model.maxReferenceFiles >= 1 && model.acceptedReferenceTypes.includes("image/*"));
}

export function createVideoBookProject(guide: PictureBookGuide, model?: ExperienceVideoModel): VideoBookProject {
  return {
    id: guide.id, title: guide.title, pdfUrl: guide.pdfUrl, sourceName: guide.pdfName,
    editing: false, removeText: false, modelId: model?.id ?? "", ratio: model?.supportedRatios.includes("16:9") ? "16:9" : model?.supportedRatios[0] ?? "16:9",
    resolution: model?.defaultResolution ?? "高清 720P", duration: model?.defaultDuration ?? 5, updatedAt: new Date().toISOString(),
    pages: guide.pages.map(page => ({ pageNumber: page.pageNumber, imageUrl: page.imageUrl, cleanImageUrl: null, sourceText: page.sourceText,
      description: page.sourceText.slice(0, 1000), prompt: "", motion: "gentle", references: [], clip: null }))
  };
}

export function videoBookPrompt(page: VideoBookPage, removeText: boolean) {
  const motion = videoBookMotions.find(item => item.id === page.motion)?.prompt ?? "";
  const content = [page.description.trim(), motion, page.prompt.trim()].filter(Boolean).join("\n");
  if (!content) throw new Error("请填写本页描述或视频提示词");
  const prompt = ["以绘本页面作为视频首帧，保持角色、色彩与插画风格一致。", content,
    removeText ? "画面中不要添加文字、字幕或水印。" : "保留首帧原有画面，不增加额外文字或水印。"].join("\n");
  if (prompt.length > 2000) throw new Error("本页描述和提示词合计过长，请缩短至 1800 字以内");
  return prompt;
}

export function validateVideoBookReferences(references: VideoBookReference[], model: ExperienceVideoModel) {
  if (references.length + 1 > model.maxReferenceFiles) throw new Error(`当前模型最多允许 ${Math.max(0, model.maxReferenceFiles - 1)} 个附加参考文件，首帧已占用一个位置`);
  const seen = new Set<string>();
  for (const file of references) {
    if (!model.acceptedReferenceTypes.includes(`${file.type}/*`)) throw new Error(`当前模型不支持参考${file.type === "audio" ? "语音" : file.type === "image" ? "图片" : "视频"}，请移除文件或更换模型`);
    if (seen.has(file.type)) throw new Error("当前图生视频模型每种附加参考文件最多一个");
    seen.add(file.type);
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("每个参考文件须在 10MB 以内");
  }
}

export function videoBookFrame(page: VideoBookPage, removeText: boolean) {
  if (removeText && !page.cleanImageUrl) throw new Error("本页尚未去除文字，请先处理首帧");
  return removeText ? page.cleanImageUrl! : page.imageUrl;
}

export function videoBookAttachment(reference: VideoBookReference) {
  return { name: reference.name, type: reference.type, mimeType: reference.mimeType, size: reference.size, dataUrl: reference.dataUrl };
}

export function videoBookErrorMessage(message?: string | null) {
  if (message?.includes("Field required: input.media.0.url")) return "这次任务因首帧参数格式错误而失败，请点击「重试本页视频」重新生成。";
  return message ?? "";
}

export function pendingVideoBookPages(project: VideoBookProject) {
  return project.pages.filter(page => !page.clip || page.clip.status === "FAILED" || page.clip.status === "CANCELLED");
}

export function validateVideoBookSettings(project: VideoBookProject, model: ExperienceVideoModel) {
  if (!model.supportedRatios.includes(project.ratio) || !model.supportedDurations.includes(project.duration)
    || !model.supportedResolutions.includes(project.resolution)) throw new Error("视频模型的可用参数已变化，请重新选择比例、时长和分辨率");
}

export async function videoBookRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  if (encoded && new TextEncoder().encode(encoded).byteLength > 11 * 1024 * 1024) throw new Error("参考素材总量过大，请压缩文件后再生成");
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store", signal,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: encoded });
  const payload = await response.json().catch(cause => {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    return null;
  }) as { code?: number; message?: string; data?: T } | null;
  if (!response.ok || payload?.code !== 0 || payload.data == null) throw new VideoBookRequestError(response.status === 401 ? "登录已过期，请重新登录" : payload?.message || "视频制作请求失败，请稍后重试", payload?.code);
  return payload.data;
}

export class VideoBookRequestError extends Error {
  constructor(message: string, public readonly code?: number) { super(message); }
}

export function videoBookPollingError(results: PromiseSettledResult<unknown>[]) {
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  return failures.find(result => result.reason instanceof VideoBookRequestError && result.reason.code === 40401)?.reason ?? failures[0]?.reason;
}

export function waitForVideoBookPoll(signal?: AbortSignal, delayMs = 5000) {
  return new Promise<void>((resolve, reject) => {
    const stopped = () => new DOMException("已停止等待", "AbortError");
    if (signal?.aborted) { reject(stopped()); return; }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, delayMs);
    function abort() { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(stopped()); }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export function getVideoBookTask(clip: Pick<VideoBookClip, "id">, signal?: AbortSignal) {
  // The API resolves the local task before querying the provider.
  return videoBookRequest<Pick<VideoBookClip, "status" | "videoUrl" | "errorMessage">>(
    `/api/ai/video/tasks/${encodeURIComponent(clip.id)}`, undefined, signal
  );
}

export async function readVideoBookReference(file: File): Promise<VideoBookReference> {
  const type = file.type.split("/")[0];
  if (type !== "image" && type !== "audio" && type !== "video") throw new Error("请选择图片、音频或视频文件");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("每个参考文件须在 10MB 以内");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("参考文件读取失败"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  return { id: crypto.randomUUID(), name: file.name.slice(0, 200), type, mimeType: file.type, size: file.size, dataUrl };
}

export async function readVideoBookFrame(url: string, pageNumber: number, signal?: AbortSignal) {
  const response = await fetch(url, { credentials: "same-origin", signal });
  if (!response.ok) throw new Error("首帧图片读取失败，请重新导入绘本");
  const blob = await response.blob();
  const mimeType = blob.type.split(";")[0] || "image/png";
  return readVideoBookReference(new File([blob], `绘本第${pageNumber}页`, { type: mimeType }));
}

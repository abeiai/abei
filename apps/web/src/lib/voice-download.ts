import { boundedDialogueDownload, dialogueDownloadMaxBytes } from "./voice-dialogue-download";
import { dialogueFriendlyError } from "./voice-dialogue";

export type VoiceDownloadFormat = "mp3" | "wav";
export type VoiceDownloadTarget = { task: string } | { project: string; revision: number };

export function formatVoiceDownloadSize(bytes: number) {
  const unit = bytes < 1024 ? "B" : bytes < 1024 * 1024 ? "KB" : "MB";
  const divisor = unit === "B" ? 1 : unit === "KB" ? 1024 : 1024 * 1024;
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: unit === "B" ? 0 : 2 }).format(bytes / divisor)} ${unit}`;
}

export function voiceDownloadPath(query: URLSearchParams) {
  if ([...query.keys()].some(key => !["task", "project", "revision", "format"].includes(key) || query.getAll(key).length !== 1)) return null;
  const task = query.get("task");
  const project = query.get("project");
  const revision = query.get("revision");
  const format = query.get("format") ?? "mp3";
  if (format !== "mp3" && format !== "wav") return null;
  const id = (value: string | null) => value !== null && /^[\w-]{1,100}$/.test(value);
  const normalized = new URLSearchParams();
  if (id(task) && project === null && revision === null) normalized.set("task", task!);
  else if (id(project) && task === null && revision !== null && /^[1-9]\d*$/.test(revision) && Number.isSafeInteger(Number(revision))) {
    normalized.set("project", project!);
    normalized.set("revision", revision);
  } else return null;
  normalized.set("format", format);
  return `/audio/voice-download?${normalized}`;
}

const mimeFor = (format: VoiceDownloadFormat) => format === "wav" ? "audio/wav" : "audio/mpeg";
const filenameFrom = (response: Response, format: VoiceDownloadFormat) => {
  const match = /^attachment; filename="([\w-]{1,120}\.(mp3|wav))"$/.exec(response.headers.get("content-disposition") ?? "");
  return match?.[2] === format ? match[1] : `voice.${format}`;
};
const failure = (message: string, status = 502, code = 50002) => Response.json({ code, message, data: null }, { status, headers: { "Cache-Control": "no-store" } });

export async function proxyVoiceDownload(request: Request, options: { fetchImpl?: typeof fetch; apiBase?: string } = {}) {
  const query = new URL(request.url).searchParams;
  const path = voiceDownloadPath(query);
  if (!path) return failure("音频下载参数不正确", 400, 40001);
  const format = (query.get("format") ?? "mp3") as VoiceDownloadFormat;
  const headers = new Headers();
  for (const name of ["cookie", "authorization"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const response = await (options.fetchImpl ?? fetch)(`${options.apiBase ?? "http://localhost:3322/api"}${path}`, {
      headers, cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)])
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null) as { code?: number; message?: string } | null;
      return failure(dialogueFriendlyError(error?.message ?? "音频暂时无法下载，请稍后重试"), response.status, error?.code ?? 50002);
    }
    const length = response.headers.get("content-length");
    const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!response.body || mime !== mimeFor(format) || length !== null && (!Number.isSafeInteger(Number(length)) || Number(length) < 1 || Number(length) > dialogueDownloadMaxBytes)) {
      await response.body?.cancel().catch(() => undefined);
      return failure("音频文件格式或大小不正确，请稍后重试");
    }
    const outgoing = new Headers({ "Content-Type": mime, "Content-Disposition": `attachment; filename="${filenameFrom(response, format)}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    if (length !== null) outgoing.set("Content-Length", length);
    return new Response(boundedDialogueDownload(response.body), { headers: outgoing });
  } catch { return failure("音频导出暂时无法连接，请稍后重试"); }
}

export async function fetchVoiceDownload(href: string, format: VoiceDownloadFormat, signal?: AbortSignal, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(href, { signal, cache: "no-store", redirect: "error" });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(dialogueFriendlyError(error?.message ?? "音频下载失败，请稍后重试"));
  }
  if (!response.body || response.headers.get("content-type")?.split(";", 1)[0] !== mimeFor(format)) throw new Error("音频下载格式不正确");
  const blob = await new Response(boundedDialogueDownload(response.body), { headers: { "Content-Type": mimeFor(format) } }).blob();
  if (!blob.size) throw new Error("暂无可下载音频");
  return { blob, filename: filenameFrom(response, format) };
}

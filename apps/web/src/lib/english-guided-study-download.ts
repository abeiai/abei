import type { EnglishGuidedStudyMaterial } from "./english-guided-study-data";

export type CourseAudioDownloadKind = "narration" | "demonstration";

export function courseSubtitleDownload(material: EnglishGuidedStudyMaterial | null, kind: CourseAudioDownloadKind) {
  if (!material) return null;
  let cursor = 0;
  const nodes = material.narrationTimelineV2?.nodes;
  const track = material.readAlong;
  const cues = kind === "narration"
    ? !material.audioUrl ? [] : nodes?.length ? nodes.map(node => {
      const startSeconds = cursor;
      cursor += node.durationMs / 1000;
      return { text: node.audioUrl ? node.script : "", startSeconds, endSeconds: cursor };
    }) : [{ text: material.narration, startSeconds: 0, endSeconds: material.audioDurationSeconds }]
    : track?.audioUrl ? track.cues : [];
  if (!cues.length || cues.some((cue, index) => !cue.text.trim() || !Number.isFinite(cue.startSeconds)
    || !Number.isFinite(cue.endSeconds) || cue.startSeconds < 0 || cue.endSeconds <= cue.startSeconds
    || (index > 0 && cue.startSeconds < cues[index - 1]!.startSeconds))) return null;
  const timestamp = (seconds: number) => {
    const centiseconds = Math.round(seconds * 100);
    return `[${String(Math.floor(centiseconds / 6000)).padStart(2, "0")}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}]`;
  };
  const lines = cues.flatMap((cue, index) => {
    const line = `${timestamp(cue.startSeconds)}${cue.text.replace(/\s+/g, " ").trim()}`;
    const next = cues[index + 1];
    return !next || Math.round(cue.endSeconds * 100) < Math.round(next.startSeconds * 100)
      ? [line, timestamp(cue.endSeconds)] : [line];
  });
  // Match the corresponding audio basename so players can discover the LRC automatically.
  const name = kind === "demonstration" && track?.source === "UPLOAD" && track.audioName.trim()
    ? track.audioName.replace(/\.[^.]+$/, "")
    : `${material.title || "英文带学"}-${kind === "narration" ? "讲解语音" : "示范语音"}`;
  return { text: lines.join("\r\n") + "\r\n", filename: `${name.replace(/[<>:"/\\|?*\p{Cc}]/gu, "_")}.lrc` };
}

const maximumDownloadBytes = 100 * 1024 * 1024;
function boundedDownload(source: ReadableStream<Uint8Array>) {
  let receivedBytes = 0;
  return source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > maximumDownloadBytes) throw new Error("音频文件超过大小限制");
      controller.enqueue(chunk);
    }
  }));
}
const friendlyError = (message: unknown) => typeof message === "string" && /[\u4e00-\u9fff]/.test(message)
  && !/prisma|sql|jwt|stack|exception|trace|https?:\/\//i.test(message)
  ? message.slice(0, 240) : "音频下载失败，请稍后重试";
const failure = (message: string, status = 502, code = 50201) => Response.json({ code, message, data: null }, { status, headers: { "Cache-Control": "no-store" } });
const filenameFrom = (response: Response) => {
  const match = /filename\*=UTF-8''([^;\s]+)/i.exec(response.headers.get("content-disposition") ?? "");
  try { return match ? decodeURIComponent(match[1]!).replace(/[\p{Cc}/\\]/gu, "_") : "课件音频.mp3"; }
  catch { return "课件音频.mp3"; }
};

export async function proxyCourseAudioDownload(request: Request, id: string, kind: string, options: { fetchImpl?: typeof fetch; apiBase?: string } = {}) {
  if (!/^[\w-]{1,100}$/.test(id) || !["narration", "demonstration"].includes(kind)) return failure("音频下载参数不正确", 400, 40001);
  const headers = new Headers();
  for (const name of ["cookie", "authorization"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const response = await (options.fetchImpl ?? fetch)(`${options.apiBase ?? "http://localhost:3322/api"}/english-guided-study/materials/${id}/audio-download/${kind}`, {
      headers, cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(660_000)])
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null) as { code?: number; message?: string } | null;
      return failure(friendlyError(error?.message), response.status, error?.code ?? 50201);
    }
    const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    const length = response.headers.get("content-length");
    if (!response.body || !mime || !/^audio\/[\w.+-]+$/.test(mime) || length !== null && (!Number.isSafeInteger(Number(length)) || Number(length) <= 0 || Number(length) > maximumDownloadBytes)) {
      await response.body?.cancel().catch(() => undefined);
      return failure("音频文件格式或大小不正确");
    }
    const outgoing = new Headers({ "Content-Type": mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filenameFrom(response))}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    if (length !== null) outgoing.set("Content-Length", length);
    return new Response(boundedDownload(response.body), { headers: outgoing });
  } catch { return failure("音频合并或下载暂时无法完成，请稍后重试"); }
}

export async function fetchCourseAudioDownload(id: string, kind: CourseAudioDownloadKind, signal?: AbortSignal, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(`/api/english-guided-study/materials/${encodeURIComponent(id)}/audio-download/${kind}`, {
    cache: "no-store", redirect: "error", signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(660_000)])
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(friendlyError(error?.message));
  }
  const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (!response.body || !mime || !/^audio\/[\w.+-]+$/.test(mime)) throw new Error("音频下载格式不正确");
  const blob = await new Response(boundedDownload(response.body), { headers: { "Content-Type": mime } }).blob();
  if (!blob.size) throw new Error("暂无可下载音频");
  return { blob, filename: filenameFrom(response) };
}

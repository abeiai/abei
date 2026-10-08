import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AppException } from "../common/app-exception.js";
import { downloadTtsProviderAudio } from "../audio/video-guide-narration-storage.js";

export async function persistGuideAudio(payload: Record<string, unknown>, directory: string, taskId: string, url: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(taskId)) throw new AppException(40001, "语音任务标识无效", 400);
  const output = payload.output as { url?: string; audio?: { url?: string } } | undefined;
  const providerUrl = typeof payload.audioUrl === "string" ? payload.audioUrl : output?.url ?? output?.audio?.url;
  let buffer: Buffer;
  if (typeof payload.audioBase64 === "string") {
    const encoded = payload.audioBase64.replace(/^data:audio\/[\w.+-]+;base64,/i, "").replace(/\s/g, "");
    if (!encoded || encoded.length % 4 === 1 || !/^[a-z0-9+/]*={0,2}$/i.test(encoded) || encoded.length > 28 * 1024 * 1024) throw new AppException(50201, "语音数据无效，请重新生成", 502);
    buffer = Buffer.from(encoded, "base64");
  } else if (providerUrl) {
    buffer = await downloadTtsProviderAudio(providerUrl, 20 * 1024 * 1024);
  } else throw new AppException(50201, "语音模型未返回音频，请重新生成", 502);
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new AppException(50201, "语音文件大小无效，请重新生成", 502);
  const mimeType = typeof payload.audioMimeType === "string" ? payload.audioMimeType : "audio/mpeg";
  if (!["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/aac"].includes(mimeType)) throw new AppException(50201, "语音文件格式无效，请重新生成", 502);
  await writeFile(join(directory, `${taskId}.audio`), buffer, { mode: 0o600 });
  return { url, objectKey: `picture-book-guide/${taskId}`, storageProvider: "LOCAL" as const, mimeType, sizeBytes: buffer.length };
}

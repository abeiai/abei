import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { getPrismaClient } from "@xueleai/database";
import { DialogueAudioError, renderCourseAudioDownload } from "../audio/dialogue-audio.js";
import { AppException } from "../common/app-exception.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function courseAudioDownloadPlan(material: { audioUrl?: string | null; content: unknown }, kind: string) {
  if (kind !== "narration" && kind !== "demonstration") throw new AppException(40001, "音频下载参数不正确", 400);
  const content = record(material.content);
  const track = record(content.readAlong);
  const progress = record(kind === "narration" ? content.audioGenerationProgress : content.readAlongGenerationProgress);
  if (progress.status === "QUEUED" || progress.status === "RUNNING") throw new AppException(40901, "语音正在生成，请完成后再下载", 409);
  const original = kind === "demonstration" && track.source === "UPLOAD";
  const nodes = kind === "narration" ? record(content.narrationTimelineV2).nodes : track.nodes;
  const urls = original ? [track.audioUrl] : Array.isArray(nodes) && nodes.length ? nodes.map(node => record(node).audioUrl)
    : kind === "narration" && material.audioUrl ? [material.audioUrl] : [];
  if (!urls.length || urls.some(url => typeof url !== "string" || !url.trim())) throw new AppException(40001, "课件语音尚未生成或音频不完整", 400);
  return {
    urls: urls as string[], original,
    revision: createHash("sha256").update(JSON.stringify(["course-audio-v1", kind, original, urls])).digest("hex")
  };
}

@Injectable()
export class EnglishGuidedStudyDownloadService {
  private readonly prisma = getPrismaClient();
  private readonly render = renderCourseAudioDownload;
  private readonly pending = new Map<string, Promise<{ bytes: Buffer; mimeType: string }>>();

  async download(subject: ProfileSubject, id: string, kind: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const material = await this.prisma.englishGuidedStudyMaterial.findFirst({ where: {
      id, userId: subject.userId, ...(subject.mode === "LEARNER" ? { learnerId: subject.learnerId } : {})
    } });
    if (!material) throw new AppException(40401, "英文带学课件不存在", 404);
    const plan = courseAudioDownloadPlan(material, kind);
    const assets = await this.prisma.audioAsset.findMany({ where: { userId: subject.userId, url: { in: [...new Set(plan.urls)] } } });
    const sources = plan.urls.map(url => {
      const asset = assets.find(item => item.url === url && item.userId === subject.userId);
      if (!asset) throw new AppException(40401, "课件音频不完整或原文件不存在", 404);
      return asset;
    });
    signal?.throwIfAborted();
    const key = `${subject.userId}:${id}:${plan.revision}`;
    let pending = this.pending.get(key);
    if (!pending) {
      if (this.pending.size >= 2) throw new AppException(42901, "音频合并繁忙，请稍后重试", 429);
      // Complete the cached export even if the browser closes; subsequent downloads reuse it.
      pending = this.render({ userId: subject.userId, materialId: id, revision: plan.revision, sources, original: plan.original });
      this.pending.set(key, pending);
      void pending.finally(() => this.pending.delete(key)).catch(() => undefined);
    }
    try {
      const file = await pending;
      signal?.throwIfAborted();
      const extensions: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/ogg": "ogg", "audio/flac": "flac", "audio/webm": "webm" };
      const audioName = record(record(material.content).readAlong).audioName;
      const filename = plan.original && typeof audioName === "string" && audioName.trim()
        ? audioName
        : `${material.title || "英文带学"}-${kind === "narration" ? "讲解语音" : "示范语音"}.${extensions[file.mimeType] ?? "audio"}`;
      return { ...file, filename };
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new AppException(50201, error instanceof DialogueAudioError ? error.message : "音频合并或下载失败，请稍后重试", 502);
    }
  }
}

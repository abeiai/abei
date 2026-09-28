import { Injectable } from "@nestjs/common";
import { getPrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import { isVoiceExperienceAudioTask } from "./audio.service.js";
import { DialogueAudioError, renderVoiceDownload } from "./dialogue-audio.js";

export type VoiceDownloadQuery = ({ task: string; project?: never; revision?: never } | { project: string; revision: number; task?: never }) & { format: "mp3" | "wav" };

export function validateVoiceDownloadQuery(raw: Record<string, unknown>): VoiceDownloadQuery {
  const invalid = () => { throw new AppException(40001, "音频下载参数或版本不正确", 400); };
  if (Object.keys(raw).some(key => !["task", "project", "revision", "format"].includes(key))) invalid();
  const id = (value: unknown) => typeof value === "string" && /^[\w-]{1,100}$/.test(value);
  const format = raw.format ?? "mp3";
  if (format !== "mp3" && format !== "wav") throw new AppException(40001, "下载格式仅支持 MP3 或 WAV", 400);
  if (id(raw.task) && raw.project === undefined && raw.revision === undefined) return { task: raw.task as string, format };
  if (id(raw.project) && raw.task === undefined && typeof raw.revision === "string" && /^[1-9]\d*$/.test(raw.revision) && Number.isSafeInteger(Number(raw.revision))) {
    return { project: raw.project as string, revision: Number(raw.revision), format };
  }
  return invalid();
}

@Injectable()
export class VoiceDownloadService {
  private readonly prisma = getPrismaClient();
  private readonly render = renderVoiceDownload;
  private active = 0;

  async download(subject: ProfileSubject, query: VoiceDownloadQuery, signal?: AbortSignal) {
    const scope = { userId: subject.userId, learnerId: subject.learnerId };
    let asset;
    if (query.task) {
      const task = await this.prisma.audioTask.findFirst({ where: { id: query.task, ...scope, status: "SUCCEEDED", type: "TTS" },
        include: { scenario: { select: { slug: true } }, outputAudioAsset: true, dialogueBillingGeneration: true, _count: { select: { englishGuidedStudyMaterials: true } } } });
      if (!task || (task.scenarioId ? task.scenario?.slug !== "article-to-speech" : subject.mode === "LEARNER") || !isVoiceExperienceAudioTask({ type: task.type, providerPayload: task.providerPayload,
        englishGuidedStudyMaterialCount: task._count.englishGuidedStudyMaterials, dialogueGenerationId: task.audioDialogueGenerationId,
        isDialogueBilling: Boolean(task.dialogueBillingGeneration) })) throw new AppException(40401, "语音合成记录不存在", 404);
      asset = task.outputAudioAsset;
    } else {
      const project = await this.prisma.audioDialogueProject.findFirst({ where: { id: query.project, ...scope }, include: { outputAudioAsset: true } });
      if (!project) throw new AppException(40401, "多人配音记录不存在", 404);
      const scenario = project.scenarioId ? await this.prisma.aiScenario.findUnique({ where: { id: project.scenarioId }, select: { slug: true } }) : null;
      if (project.scenarioId ? scenario?.slug !== "article-to-speech" : subject.mode === "LEARNER") throw new AppException(40401, "多人配音记录不存在", 404);
      if (project.outputRevision !== query.revision) throw new AppException(40901, "音频版本已更新，请刷新后下载", 409);
      asset = project.outputAudioAsset;
    }
    if (!asset || asset.userId !== subject.userId || asset.type !== "TTS_OUTPUT") throw new AppException(40401, "暂无可下载音频", 404);
    if (this.active >= 2) throw new AppException(42901, "音频导出繁忙，请稍后重试", 429);
    this.active++;
    try {
      const result = await this.render({ userId: subject.userId, source: asset, format: query.format }, { signal });
      return { ...result, filename: `voice-${asset.id}.${query.format}` };
    } catch (error) {
      throw new AppException(50002, error instanceof DialogueAudioError ? error.message : "音频导出失败，请稍后重试", 502);
    } finally { this.active--; }
  }
}

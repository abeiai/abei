import { Inject, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { AiService } from "../ai/ai.service.js";
import { AudioService } from "../audio/audio.service.js";
import { AppException } from "../common/app-exception.js";
import type { UploadedFileLike } from "../media/media.service.js";
import { pictureBookAudiences } from "../picture-books/picture-book-audience.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import { buildGuidePrompt, editGuidePage, guideStyles, parseGuideScript, validateGuidePdf, type GuidePage } from "./picture-book-guide-content.js";
import { renderGuidePdf } from "./picture-book-guide-pdf.js";
import { persistGuideAudio } from "./picture-book-guide-audio.js";

type GuideRecord = Prisma.PictureBookGuideGetPayload<Record<string, never>>;
type Account = ProfileSubject & { mode: "ACCOUNT" };
const pagesOf = (record: GuideRecord) => record.pages as unknown as GuidePage[];
const unlocked = () => ({ OR: [{ operationToken: null }, { operationExpiresAt: { lt: new Date() } }] });
const busy = (record: GuideRecord) => Boolean(record.operationToken && record.operationExpiresAt && record.operationExpiresAt > new Date());

@Injectable()
export class PictureBookGuideService {
  private readonly prisma = getPrismaClient();
  constructor(@Inject(AiService) private readonly ai: AiService, @Inject(AudioService) private readonly audio: AudioService) {}

  options() { return { audiences: pictureBookAudiences, styles: guideStyles.map(({ value, label, guide, speed }) => ({ value, label, description: guide, speed })) }; }

  async upload(userId: string, file?: UploadedFileLike) {
    validateGuidePdf(file);
    const storageKey = randomUUID();
    const directory = this.directory(storageKey);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      const pages = await renderGuidePdf(file!.buffer, directory);
      await writeFile(join(directory, "source.pdf"), file!.buffer, { mode: 0o600 });
      // Multer filename metadata may contain UTF-8 bytes interpreted as Latin-1.
      const rawName = basename(file!.originalname.replaceAll("\\", "/"));
      const decodedName = Buffer.from(rawName, "latin1").toString("utf8");
      const pdfName = (/[\u0080-\u00ff]/.test(rawName) && !decodedName.includes("�") ? decodedName : rawName).slice(0, 200);
      const row = await this.prisma.pictureBookGuide.create({ data: { userId, storageKey, pdfName, pdfSizeBytes: file!.buffer.length,
        title: pdfName.replace(/\.pdf$/i, "").slice(0, 100) || "未命名绘本", pages: pages as unknown as Prisma.InputJsonValue } });
      return this.view(row);
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async list(userId: string) {
    const records = await this.prisma.pictureBookGuide.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 50 });
    return records.map(record => this.summary(record));
  }

  async get(userId: string, id: string) { return this.view(await this.record(userId, id)); }

  async file(userId: string, id: string, kind: "pdf" | "image" | "audio", pageNumber?: number, audioTaskId?: string) {
    const record = await this.record(userId, id);
    const page = kind === "pdf" ? null : this.page(record, pageNumber ?? 0);
    let selectedAudio = page;
    if (kind === "audio" && audioTaskId !== undefined) {
      if (typeof audioTaskId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(audioTaskId)) throw new AppException(40401, "本页带读语音不存在", 404);
      const task = await this.prisma.audioTask.findFirst({ where: { id: audioTaskId, userId, status: "SUCCEEDED" }, include: { outputAudioAsset: true } });
      const asset = task?.outputAudioAsset;
      const expectedUrl = `/api/picture-book-guide/${id}/pages/${page!.pageNumber}/audio?v=${audioTaskId}`;
      if (!asset || asset.userId !== userId || asset.storageProvider !== "LOCAL" || asset.objectKey !== `picture-book-guide/${audioTaskId}` || asset.url !== expectedUrl) throw new AppException(40401, "本页带读语音不存在", 404);
      selectedAudio = { ...page!, audioTaskId, audioMimeType: asset.mimeType };
    }
    if (kind === "audio" && (!selectedAudio?.audioTaskId || !selectedAudio.audioMimeType)) throw new AppException(40401, "本页带读语音不存在", 404);
    const filename = kind === "pdf" ? "source.pdf" : kind === "image" ? `page-${page!.pageNumber}.png` : this.audioFilename(selectedAudio!);
    try {
      return { buffer: await readFile(join(this.directory(record.storageKey), filename)), mimetype: kind === "pdf" ? "application/pdf" : kind === "image" ? "image/png" : selectedAudio!.audioMimeType || "audio/mpeg" };
    } catch { throw new AppException(40401, "绘本文件不存在，请重新上传或生成", 404); }
  }

  async settings(userId: string, id: string, dto: { audience: string; style: string; version: number }) {
    if (!pictureBookAudiences.some(item => item === dto.audience) || !guideStyles.some(item => item.value === dto.style)) throw new AppException(40001, "请选择有效的适用人群和带读风格", 400);
    const record = await this.record(userId, id);
    this.assertEditable(record, dto.version);
    if (record.audience === dto.audience && record.style === dto.style) return this.view(record);
    const pages = pagesOf(record).map(page => ({ ...page, script: "", audioTaskId: null, audioMimeType: null, audioVoice: null, audioSpeed: null }));
    return this.save(record, { audience: dto.audience, style: dto.style, pages: pages as unknown as Prisma.InputJsonValue });
  }

  async updatePage(userId: string, id: string, pageNumber: number, dto: { script: string; version: number }) {
    const record = await this.record(userId, id);
    this.assertEditable(record, dto.version);
    const page = this.page(record, pageNumber);
    const next = editGuidePage(page, dto.script);
    if (next === page) return this.view(record);
    const pages = pagesOf(record).map(item => item.pageNumber === pageNumber ? next : item);
    return this.save(record, { pages: pages as unknown as Prisma.InputJsonValue });
  }

  async generateScript(subject: Account, id: string, pageNumber: number, version?: number) {
    const record = await this.record(subject.userId, id);
    if (version !== undefined) this.assertEditable(record, version);
    const page = this.page(record, pageNumber);
    return this.generate(record, async () => {
      const scenario = await this.prisma.aiScenario.upsert({ where: { slug: "picture-book-guide" }, update: {}, create: {
        slug: "picture-book-guide", name: "绘本导读", description: "结合绘本 PDF 画面生成逐页带读文稿", promptTemplate: "{input}",
        requiredCapabilities: ["TEXT", "VISION"], costCredits: 0, isBuiltIn: true, isEnabled: true,
        modelBinding: { create: { defaultModelAlias: "vision" } }
      } });
      const image = await readFile(join(this.directory(record.storageKey), `page-${pageNumber}.png`));
      const chunks: string[] = [];
      const result = await this.ai.createTaskStream(subject, { scenarioId: scenario.id,
        input: buildGuidePrompt({ audience: record.audience, style: record.style, page, pageCount: pagesOf(record).length,
          previousScript: pagesOf(record).find(item => item.pageNumber === pageNumber - 1)?.script }),
        attachments: [{ name: `page-${pageNumber}.png`, type: "image", mimeType: "image/png", size: image.length, dataUrl: `data:image/png;base64,${image.toString("base64")}` }] }, event => {
          if (event.type === "delta" && typeof event.text === "string") chunks.push(event.text);
        });
      const output = chunks.join("") || result.output;
      if (result.status !== "SUCCEEDED" || !output) throw new AppException(50201, result.errorMessage || "本页带读文稿生成失败，请重试", 502);
      const script = parseGuideScript(output, pageNumber);
      return pagesOf(record).map(item => item.pageNumber === pageNumber ? editGuidePage(item, script) : item);
    });
  }

  async generateAudio(subject: Account, id: string, pageNumber: number, dto: { voice?: string; voiceAssetId?: string; speed?: number; version: number }) {
    const record = await this.record(subject.userId, id);
    this.assertEditable(record, dto.version);
    const page = this.page(record, pageNumber);
    if (pagesOf(record).some(item => !item.script.trim())) throw new AppException(40001, "请先完成全部页面的带读文稿，再生成语音", 400);
    const speed = dto.speed ?? guideStyles.find(item => item.value === record.style)!.speed;
    if (!Number.isFinite(speed) || speed < 0.5 || speed > 1.5) throw new AppException(40001, "请选择 0.5—1.5 倍的语速", 400);
    const voice = dto.voiceAssetId ? `voice:${dto.voiceAssetId}` : dto.voice ? `system:${dto.voice}` : "default";
    return this.generate(record, async token => {
      // Recover a settled child task if the request ended before the page was committed.
      if (page.audioTaskId && !page.audioMimeType && page.audioVoice === voice && page.audioSpeed === speed) {
        const previous = await this.prisma.audioTask.findFirst({ where: { id: page.audioTaskId, userId: subject.userId }, include: { outputAudioAsset: true } });
        if (previous?.status === "SUCCEEDED" && previous.outputAudioAsset) {
          await readFile(join(this.directory(record.storageKey), this.audioFilename(page)));
          return pagesOf(record).map(item => item.pageNumber === pageNumber ? { ...page, audioMimeType: previous.outputAudioAsset!.mimeType } : item);
        }
        if (previous && ["CREATED", "RESERVED", "PROCESSING"].includes(previous.status) && previous.updatedAt > new Date(Date.now() - 10 * 60 * 1000)) throw new AppException(40901, "本页语音任务仍在生成中，请稍后重试", 409);
      }
      const task = await this.audio.createTtsTask({ userId: subject.userId, learnerId: null }, { text: page.script, voice: dto.voice, voiceAssetId: dto.voiceAssetId, speed, format: "mp3", source: "TOOL", execute: true }, {
        onCreated: async taskId => {
          const pending = pagesOf(record).map(item => item.pageNumber === pageNumber ? { ...page, audioTaskId: taskId, audioMimeType: null, audioVoice: voice, audioSpeed: speed } : item);
          const result = await this.prisma.pictureBookGuide.updateMany({ where: { id, userId: subject.userId, operationToken: token, version: record.version + 1 }, data: { pages: pending as unknown as Prisma.InputJsonValue } });
          if (!result.count) throw new AppException(40901, "记录已更新，请刷新后重试", 409);
        },
        persistOutput: (taskId, payload) => persistGuideAudio(payload, this.directory(record.storageKey), taskId, `/api/picture-book-guide/${id}/pages/${pageNumber}/audio?v=${taskId}`)
      });
      if (task.status !== "SUCCEEDED" || !task.outputAudioAsset?.url) throw new AppException(50201, task.errorMessage || "本页带读语音生成失败，请重试", 502);
      const next: GuidePage = { ...page, audioTaskId: task.id, audioMimeType: task.outputAudioAsset.mimeType, audioVoice: voice, audioSpeed: speed };
      return pagesOf(record).map(item => item.pageNumber === pageNumber ? next : item);
    });
  }

  async remove(userId: string, id: string) {
    const record = await this.record(userId, id);
    this.assertEditable(record, record.version);
    const result = await this.prisma.pictureBookGuide.deleteMany({ where: { id, userId, version: record.version, ...unlocked() } });
    if (!result.count) throw new AppException(40901, "记录已更新，请刷新后重试", 409);
    await rm(this.directory(record.storageKey), { recursive: true, force: true });
    return { id };
  }

  private async record(userId: string, id: string) {
    const row = await this.prisma.pictureBookGuide.findFirst({ where: { id, userId } });
    if (!row) throw new AppException(40401, "绘本导读记录不存在", 404);
    return row;
  }
  private page(record: GuideRecord, pageNumber: number) {
    if (!Number.isSafeInteger(pageNumber)) throw new AppException(40001, "页码无效", 400);
    const page = pagesOf(record).find(item => item.pageNumber === pageNumber);
    if (!page) throw new AppException(40401, "绘本页面不存在", 404);
    return page;
  }
  private directory(storageKey: string) {
    if (!/^[a-f0-9-]{36}$/.test(storageKey)) throw new AppException(50001, "绘本存储信息无效", 500);
    const root = process.env.PICTURE_BOOK_GUIDE_STORAGE_DIR || resolve(process.env.UPLOAD_DIR || resolve(process.cwd(), "uploads"), "..", "private-picture-book-guides");
    return join(root, storageKey);
  }
  private audioFilename(page: GuidePage) {
    if (!page.audioTaskId || !/^[a-zA-Z0-9-]{1,80}$/.test(page.audioTaskId)) throw new AppException(40401, "本页带读语音不存在", 404);
    return `${page.audioTaskId}.audio`;
  }
  private assertEditable(record: GuideRecord, version: number) {
    if (busy(record)) throw new AppException(40901, "本绘本正在生成中，请稍后重试", 409);
    if (record.version !== version) throw new AppException(40901, "记录已在其他页面更新，请刷新后重试", 409);
  }
  private async save(record: GuideRecord, data: Prisma.PictureBookGuideUpdateManyMutationInput) {
    const result = await this.prisma.pictureBookGuide.updateMany({ where: { id: record.id, userId: record.userId, version: record.version, ...unlocked() }, data: { ...data, operationToken: null, operationExpiresAt: null, version: { increment: 1 } } });
    if (!result.count) throw new AppException(40901, "记录已更新或正在生成中，请刷新后重试", 409);
    return this.get(record.userId, record.id);
  }
  private async generate(record: GuideRecord, action: (token: string) => Promise<GuidePage[]>) {
    const token = randomUUID();
    const lease = await this.prisma.pictureBookGuide.updateMany({ where: { id: record.id, userId: record.userId, version: record.version, ...unlocked() }, data: { operationToken: token, operationExpiresAt: new Date(Date.now() + 10 * 60 * 1000), version: { increment: 1 } } });
    if (!lease.count) throw new AppException(40901, "本绘本正在生成中或已更新，请稍后重试", 409);
    try {
      const pages = await action(token);
      const result = await this.prisma.pictureBookGuide.updateMany({ where: { id: record.id, userId: record.userId, operationToken: token, version: record.version + 1, operationExpiresAt: { gt: new Date() } }, data: { pages: pages as unknown as Prisma.InputJsonValue, operationToken: null, operationExpiresAt: null, version: { increment: 1 } } });
      if (!result.count) throw new AppException(40901, "记录已更新，请刷新后重新生成", 409);
      return this.get(record.userId, record.id);
    } finally {
      await this.prisma.pictureBookGuide.updateMany({ where: { id: record.id, userId: record.userId, operationToken: token }, data: { operationToken: null, operationExpiresAt: null, version: { increment: 1 } } });
    }
  }
  private summary(record: GuideRecord) {
    const pages = pagesOf(record);
    const base = `/api/picture-book-guide/${encodeURIComponent(record.id)}`;
    return { id: record.id, title: record.title, pdfName: record.pdfName, pdfSizeBytes: record.pdfSizeBytes, pdfUrl: `${base}/pdf`, audience: record.audience, style: record.style,
      version: record.version, busy: busy(record), pageCount: pages.length, scriptCount: pages.filter(page => page.script.trim()).length, audioCount: pages.filter(page => page.audioTaskId && page.audioMimeType).length,
      createdAt: record.createdAt, updatedAt: record.updatedAt };
  }
  private view(record: GuideRecord) {
    const base = `/api/picture-book-guide/${encodeURIComponent(record.id)}`;
    return { ...this.summary(record), pages: pagesOf(record).map(page => ({ ...page, imageUrl: `${base}/pages/${page.pageNumber}/image`, audioUrl: page.audioTaskId && page.audioMimeType ? `${base}/pages/${page.pageNumber}/audio?v=${encodeURIComponent(page.audioTaskId)}` : null })) };
  }
}

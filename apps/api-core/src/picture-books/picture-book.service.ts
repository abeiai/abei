import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { getPrismaClient, type Prisma, type PrismaClient } from "@xueleai/database";
import { AiService } from "../ai/ai.service.js";
import { AudioService } from "../audio/audio.service.js";
import { AppException } from "../common/app-exception.js";
import { CourseReviewService } from "../courses/course-review.service.js";
import { snapshotCourseMaterial } from "../courses/course-domain.js";
import { MediaService, type UploadedFileLike } from "../media/media.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import { inspectPictureBookImage } from "./picture-book-image.js";
import { playbackFromSnapshot } from "./picture-book-playback.js";
import { buildOutlinePrompt, createBlankPages, normalizeOutline, selectPictureBookVoice, storyTaskText, updatePictureBookPage, type PictureBookCharacter, type PictureBookMessage, type PictureBookPage } from "./picture-book-plan.js";
import type { CreatePictureBookDto, CreatePictureBookCharacterDto, DiscussPictureBookDto, GeneratePictureBookAudioDto, GeneratePictureBookImageDto, UpdatePictureBookDto, UpdatePictureBookPageDto } from "./picture-book.dto.js";

const presets = [
  { id: "preset:rabbit", name: "小白兔米米", description: "圆脸白兔，粉色耳朵，穿蓝色背带裤；勇敢又有点害羞", imageUrl: null },
  { id: "preset:fox", name: "小狐狸橙橙", description: "橙色毛发，蓬松尾巴，穿绿色围巾；机灵、乐于助人", imageUrl: null },
  { id: "preset:bear", name: "小熊团团", description: "浅棕色小熊，圆耳朵，穿黄色雨衣；温柔、爱探索", imageUrl: null },
  { id: "preset:child", name: "阿禾", description: "黑色短发的中国小朋友，穿浅蓝上衣；好奇、富有想象力", imageUrl: null }
];

@Injectable()
export class PictureBookService {
  private readonly prisma: PrismaClient = getPrismaClient();

  constructor(private readonly aiService: AiService, private readonly audioService: AudioService, private readonly mediaService: MediaService, @Inject(CourseReviewService) private readonly courseReviewService: CourseReviewService) {}

  async list(userId: string) {
    const rows = await this.prisma.pictureBook.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 50 });
    return rows.map((row) => ({
      id: row.id, title: row.title, theme: row.theme, audience: row.audience, style: row.style,
      status: row.status, pageCount: row.pageCount, coverUrl: pagesOf(row.pages)[0]?.imageUrl ?? null,
      createdAt: row.createdAt, updatedAt: row.updatedAt
    }));
  }

  async create(userId: string, dto: CreatePictureBookDto) {
    return this.prisma.pictureBook.create({ data: {
      userId,
      title: dto.title?.trim() || "未命名绘本",
      brief: dto.brief.trim(),
      audience: dto.audience?.trim() || "",
      style: dto.style.trim(),
      pageCount: dto.pageCount,
      aspectRatio: dto.aspectRatio ?? "1:1",
      messages: [], characters: [], pages: []
    } });
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.pictureBook.findFirst({ where: { id, userId } });
    if (!row) throw new AppException(40401, "绘本作品不存在", HttpStatus.NOT_FOUND);
    return row;
  }

  async playback(subject: ProfileSubject, id: string) {
    const own = subject.mode === "ACCOUNT"
      ? await this.prisma.pictureBook.findFirst({ where: { id, userId: subject.userId } })
      : null;
    if (own) return playbackFromSnapshot(id, snapshotCourseMaterial("PICTURE_BOOK", own));

    const item = await this.prisma.courseRevisionItem.findFirst({
      where: {
        pictureBookId: id,
        revision: { approvedFor: { is: {
          publishedAt: { not: null },
          ...(subject.mode === "LEARNER" ? {
            learnerAuthorizations: { some: { learnerId: subject.learnerId } },
            OR: [
              { userId: subject.userId },
              { enrollments: { some: { userId: subject.userId } } }
            ]
          } : {})
        } } },
        publication: { approvedHash: { not: null }, status: "APPROVED" }
      },
      select: { publication: { select: { approvedHash: true, approvedSnapshot: true } } }
    });
    if (!item?.publication.approvedHash || !item.publication.approvedSnapshot) {
      throw new AppException(40401, "绘本作品不存在或尚未发布", HttpStatus.NOT_FOUND);
    }
    return playbackFromSnapshot(id, item.publication.approvedSnapshot);
  }

  async update(userId: string, id: string, dto: UpdatePictureBookDto) {
    return this.mutate(userId, id, (book) => {
      const characters = dto.characters?.slice(0, 8).map((item) => ({
        ...(item.id ? { id: item.id.trim() } : {}), name: item.name.trim(), description: item.description.trim(), imageUrl: safeImageUrl(item.imageUrl)
      }));
      const resetsPages = dto.pageCount !== undefined && dto.pageCount !== book.pageCount;
      if (resetsPages && pagesOf(book.pages).length) {
        throw new AppException(40901, "已有分镜时不能修改页数，请先创建新作品", HttpStatus.CONFLICT);
      }
      return {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience.trim() } : {}),
        ...(dto.style !== undefined ? { style: dto.style.trim() } : {}),
        ...(dto.aspectRatio !== undefined ? { aspectRatio: dto.aspectRatio } : {}),
        ...(dto.pageCount !== undefined ? { pageCount: dto.pageCount } : {}),
        ...(characters !== undefined ? { characters: characters as unknown as Prisma.InputJsonValue } : {})
      };
    });
  }

  async discuss(subject: ProfileSubject & { mode: "ACCOUNT" }, id: string, dto: DiscussPictureBookDto) {
    const book = await this.get(subject.userId, id);
    const userMessage: PictureBookMessage = { role: "user", content: dto.message.trim() };
    const messages = [...messagesOf(book.messages), userMessage].slice(-30);
    await this.mutate(subject.userId, id, (current) => ({
      messages: [...messagesOf(current.messages), userMessage].slice(-30) as unknown as Prisma.InputJsonValue
    }));
    const prompt = [
      "你是儿童绘本创作搭档。围绕用户需求讨论主题、适合人群、主要情节与角色。",
      "如果关键信息不够，优先提出一个具体问题；如果已足够，给出简短创作方向并建议进入分镜。不要直接输出完整绘本。使用简体中文。",
      `原始需求：${book.brief}`,
      `适合人群：${book.audience || "待讨论"}`,
      `讨论记录：\n${messages.map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.content}`).join("\n")}`
    ].join("\n\n");
    const answer = await this.runTextTask(subject, "picture-book-discuss", prompt);
    return this.mutate(subject.userId, id, (current) => ({
      messages: [...messagesOf(current.messages), { role: "assistant", content: answer }].slice(-30) as unknown as Prisma.InputJsonValue
    }));
  }

  async outline(subject: ProfileSubject & { mode: "ACCOUNT" }, id: string) {
    const book = await this.get(subject.userId, id);
    const prompt = buildOutlinePrompt({
      brief: book.brief, audience: book.audience, style: book.style, pageCount: book.pageCount,
      characters: charactersOf(book.characters), messages: messagesOf(book.messages)
    });
    const output = await this.runTextTask(subject, "picture-book-outline", prompt);
    let outline;
    try { outline = normalizeOutline(output, book.pageCount); }
    catch (error) {
      throw new AppException(50201, error instanceof Error ? error.message : "分镜解析失败", HttpStatus.BAD_GATEWAY);
    }
    return this.mutate(subject.userId, id, () => ({
      title: outline.title, theme: outline.theme, audience: outline.audience, plot: outline.plot,
      pages: outline.pages as unknown as Prisma.InputJsonValue, status: "EDITING"
    }));
  }

  async startBlank(userId: string, id: string) {
    return this.mutate(userId, id, (book) => ({
      pages: createBlankPages(book.pageCount, book.title) as unknown as Prisma.InputJsonValue,
      status: "EDITING"
    }));
  }

  async complete(userId: string, id: string) {
    return this.mutate(userId, id, (book) => {
      const pages = pagesOf(book.pages);
      const validLength = pages.length === book.pageCount || (pages.length === book.pageCount + 1 && pages[0]?.position === 0);
      if (!validLength || pages.some((page) => !page.caption.trim() || !page.imagePrompt.trim())) {
        throw new AppException(40001, "请先完成每页的展示文字与画面提示词", HttpStatus.BAD_REQUEST);
      }
      return { status: "COMPLETED" };
    });
  }

  async updatePage(userId: string, id: string, position: number, dto: UpdatePictureBookPageDto) {
    return this.mutate(userId, id, (book) => {
      const pages = pagesOf(book.pages);
      const index = pageIndex(pages, position);
      pages[index] = updatePictureBookPage(pages[index]!, dto);
      return { pages: pages as unknown as Prisma.InputJsonValue, status: "EDITING" };
    });
  }

  async generateImage(subject: ProfileSubject & { mode: "ACCOUNT" }, id: string, position: number, dto: GeneratePictureBookImageDto) {
    const book = await this.get(subject.userId, id);
    const page = pageOf(book.pages, position);
    this.mediaService.assertPictureBookR2Ready();
    const characterDescription = charactersOf(book.characters).map((item) => `${item.name}：${item.description}`).join("；");
    const prompt = [
      `儿童绘本插画，${book.style}风格。保持整本绘本角色外观一致。`,
      characterDescription ? `角色：${characterDescription}` : "",
      page.imagePrompt,
      "画面中不要出现文字、字幕、水印或边框。"
    ].filter(Boolean).join("\n").slice(0, 2000);
    const size = book.aspectRatio === "3:2" ? { width: 1536, height: 1024 }
      : book.aspectRatio === "2:3" ? { width: 1024, height: 1536 }
        : { width: 1024, height: 1024 };
    const referenceImages = await this.localCharacterReferences(subject.userId, charactersOf(book.characters));
    const result = await this.aiService.generateImage(subject, {
      prompt, modelInstanceId: dto.modelInstanceId, count: 1, referenceImages, ...size
    }, { pictureBookR2: true });
    const image = result.images[0];
    if (!image) throw new AppException(50201, "图片生成失败，请稍后重试", HttpStatus.BAD_GATEWAY);
    return this.mutate(subject.userId, id, (current) => {
      const pages = pagesOf(current.pages);
      const index = pageIndex(pages, position);
      if (pages[index]!.imagePrompt !== page.imagePrompt) throw new AppException(40901, "画面提示词已修改，请重新生成", HttpStatus.CONFLICT);
      pages[index] = { ...pages[index]!, imageUrl: image.url, imageTaskId: result.id };
      return { pages: pages as unknown as Prisma.InputJsonValue };
    });
  }

  async uploadPageImage(userId: string, id: string, position: number, file?: UploadedFileLike) {
    const book = await this.get(userId, id);
    pageOf(book.pages, position);
    const asset = await this.mediaService.uploadUserPictureBookImage(userId, inspectPictureBookImage(file));
    return this.mutate(userId, id, (current) => {
      const pages = pagesOf(current.pages);
      const index = pageIndex(pages, position);
      pages[index] = { ...pages[index]!, imageUrl: asset.url, imageTaskId: null };
      return { pages: pages as unknown as Prisma.InputJsonValue, status: "EDITING" };
    });
  }

  async generateAudio(subject: ProfileSubject & { mode: "ACCOUNT" }, id: string, position: number, dto: GeneratePictureBookAudioDto) {
    const book = await this.get(subject.userId, id);
    const page = pageOf(book.pages, position);
    this.mediaService.assertPictureBookR2Ready();
    const availableVoices = await this.audioService.listVoiceAssets(subject.userId);
    const selection = selectPictureBookVoice(dto, availableVoices);
    if (!selection) throw new AppException(40001, "暂无可用讲解音色，请先配置语音模型", HttpStatus.BAD_REQUEST);
    const task = await this.audioService.createTtsTask({ userId: subject.userId, learnerId: null }, {
      text: page.narration, ...selection,
      source: "TOOL", execute: true
    }, { forceS3Storage: true });
    const audioUrl = task.outputAudioAsset?.url;
    if (task.status !== "SUCCEEDED" || !audioUrl) {
      throw new AppException(50201, task.errorMessage || "讲解语音生成失败", HttpStatus.BAD_GATEWAY);
    }
    return this.mutate(subject.userId, id, (current) => {
      const pages = pagesOf(current.pages);
      const index = pageIndex(pages, position);
      if (pages[index]!.narration !== page.narration) throw new AppException(40901, "讲解文稿已修改，请重新生成", HttpStatus.CONFLICT);
      pages[index] = { ...pages[index]!, audioUrl, audioTaskId: task.id };
      return { pages: pages as unknown as Prisma.InputJsonValue };
    });
  }

  async listCharacters(userId: string) {
    const own = await this.prisma.pictureBookCharacter.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 100 });
    return [...presets, ...own];
  }

  async createCharacter(userId: string, dto: CreatePictureBookCharacterDto) {
    return this.prisma.pictureBookCharacter.create({ data: {
      userId, name: dto.name.trim(), description: dto.description.trim(), imageUrl: safeImageUrl(dto.imageUrl)
    } });
  }

  async generateCharacterImage(subject: ProfileSubject & { mode: "ACCOUNT" }, id: string, modelInstanceId: string) {
    const character = await this.prisma.pictureBookCharacter.findFirst({ where: { id, userId: subject.userId } });
    if (!character) throw new AppException(40401, "角色不存在", HttpStatus.NOT_FOUND);
    this.mediaService.assertPictureBookR2Ready();
    const result = await this.aiService.generateImage(subject, {
      prompt: `儿童绘本角色设定图，单个角色，干净浅色背景，正面半身，细节清楚，无文字。${character.name}：${character.description}`.slice(0, 2000),
      modelInstanceId, width: 1024, height: 1024, count: 1
    }, { pictureBookR2: true });
    const url = result.images[0]?.url;
    if (!url) throw new AppException(50201, "角色形象生成失败", HttpStatus.BAD_GATEWAY);
    return this.prisma.pictureBookCharacter.update({ where: { id }, data: { imageUrl: url } });
  }

  async uploadCharacterImage(userId: string, id: string, file?: UploadedFileLike) {
    const character = await this.prisma.pictureBookCharacter.findFirst({ where: { id, userId } });
    if (!character) throw new AppException(40401, "角色不存在", HttpStatus.NOT_FOUND);
    const asset = await this.mediaService.uploadUserPictureBookImage(userId, inspectPictureBookImage(file));
    return this.prisma.pictureBookCharacter.update({ where: { id }, data: { imageUrl: asset.url } });
  }

  private async localCharacterReferences(userId: string, selected: PictureBookCharacter[]) {
    const ids = selected.map((item) => item.id).filter((id): id is string => typeof id === "string" && !id.startsWith("preset:")).slice(0, 3);
    if (!ids.length) return [];
    const owned = await this.prisma.pictureBookCharacter.findMany({ where: { id: { in: ids }, userId } });
    const references = [];
    for (const id of ids) {
      const character = owned.find((item) => item.id === id);
      if (!character?.imageUrl) continue;
      const asset = await this.prisma.mediaAsset.findFirst({ where: {
        url: character.imageUrl, createdByUserId: userId, mediaType: "IMAGE"
      } });
      if (!asset) continue;
      const file = asset.storageProvider === "S3"
        ? await this.mediaService.readPictureBookStoredImage(asset.url)
        : await (async () => {
            const local = await this.mediaService.getLocalFile(asset.filename);
            return { buffer: await readFile(local.filepath), mimetype: local.mimeType };
          })();
      references.push({ name: `${character.name}.png`, type: "image", mimeType: file.mimetype, size: file.buffer.length,
        dataUrl: `data:${file.mimetype};base64,${file.buffer.toString("base64")}` });
    }
    return references;
  }

  private async runTextTask(subject: ProfileSubject & { mode: "ACCOUNT" }, kind: "picture-book-discuss" | "picture-book-outline", input: string) {
    const scenario = await this.prisma.aiScenario.upsert({
      where: { slug: kind },
      create: {
        slug: kind, name: kind === "picture-book-discuss" ? "绘本需求讨论" : "绘本分镜策划",
        description: "绘本创作专用文本生成场景", promptTemplate: "{input}", requiredCapabilities: ["TEXT"],
        costCredits: 0, isBuiltIn: true, isEnabled: true,
        modelBinding: { create: { defaultModelAlias: "default-chat", fallbackModelAlias: "fast-chat" } }
      },
      update: {}
    });
    const chunks: string[] = [];
    const result = await this.aiService.createTaskStream(subject, { scenarioId: scenario.id, input }, (event) => {
      if (event.type === "delta" && typeof event.text === "string") chunks.push(event.text);
    });
    const output = storyTaskText(chunks, result.output, kind === "picture-book-outline");
    if (result.status !== "SUCCEEDED" || !output) {
      throw new AppException(50201, result.errorMessage || "AI 暂时无法完成绘本策划", HttpStatus.BAD_GATEWAY);
    }
    return output;
  }

  private async mutate(userId: string, id: string, change: (book: Awaited<ReturnType<PictureBookService["get"]>>) => Prisma.PictureBookUpdateManyMutationInput) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.get(userId, id);
      const data = change(current);
      const result = await this.prisma.pictureBook.updateMany({
        where: { id, userId, version: current.version }, data: { ...data, version: { increment: 1 } }
      });
      if (result.count === 1) {
        await this.courseReviewService.recordMaterialChange("PICTURE_BOOK", id);
        return this.get(userId, id);
      }
    }
    throw new AppException(40901, "作品已被其他编辑更新，请刷新后重试", HttpStatus.CONFLICT);
  }
}

function pagesOf(value: unknown): PictureBookPage[] {
  return Array.isArray(value) ? value.map((item) => ({ ...item })) as PictureBookPage[] : [];
}

function messagesOf(value: unknown): PictureBookMessage[] {
  return Array.isArray(value) ? value as PictureBookMessage[] : [];
}

function charactersOf(value: unknown): PictureBookCharacter[] {
  return Array.isArray(value) ? value as PictureBookCharacter[] : [];
}

function pageIndex(pages: PictureBookPage[], position: number) {
  const index = pages.findIndex((page) => page.position === position);
  if (index < 0) throw new AppException(40401, "绘本页面不存在", HttpStatus.NOT_FOUND);
  return index;
}

function pageOf(value: unknown, position: number) {
  const pages = pagesOf(value);
  return pages[pageIndex(pages, position)]!;
}

function safeImageUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return value;
  } catch { /* relative URL below */ }
  if ((value.startsWith("/uploads/") || value.startsWith("/api/media/files/")) && !value.includes("..")) return value;
  throw new AppException(40001, "角色图片地址不正确", HttpStatus.BAD_REQUEST);
}

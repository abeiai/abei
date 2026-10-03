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
import { pictureBookImageSize } from "./picture-book-ratio.js";
import { customPictureBookStyleAssetId, selectedPictureBookStyle } from "./picture-book-styles.js";
import { SystemConfigService } from "../system-config/system-config.service.js";
import { playbackFromSnapshot } from "./picture-book-playback.js";
import { characterImageForStyle, characterStyleKey, mergeDiscussedCharacters, officialCharacter, officialCharacters, parseCharacterDiscussion } from "./picture-book-characters.js";
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

  constructor(private readonly aiService: AiService, private readonly audioService: AudioService, private readonly mediaService: MediaService, @Inject(CourseReviewService) private readonly courseReviewService: CourseReviewService, @Inject(SystemConfigService) private readonly systemConfigService: SystemConfigService) {}

  async list(userId: string) {
    const rows = await this.prisma.pictureBook.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 50 });
    return rows.map((row) => ({
      id: row.id, title: row.title, theme: row.theme, audience: row.audience, style: row.style,
      status: row.status, pageCount: row.pageCount, coverUrl: pagesOf(row.pages)[0]?.imageUrl ?? null,
      createdAt: row.createdAt, updatedAt: row.updatedAt
    }));
  }

  async create(userId: string, dto: CreatePictureBookDto) {
    await this.validateCustomStyle(userId, dto.style.trim());
    const characters = await this.resolveCharacters(userId, dto.characters ?? [], dto.style);
    return this.prisma.pictureBook.create({ data: {
      userId,
      title: dto.title?.trim() || "未命名绘本",
      brief: dto.brief.trim(),
      audience: dto.audience?.trim() || "",
      style: dto.style.trim(),
      pageCount: dto.pageCount,
      aspectRatio: dto.aspectRatio ?? "1:1",
      messages: [], characters: characters as unknown as Prisma.InputJsonValue, pages: []
    } });
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.pictureBook.findFirst({ where: { id, userId } });
    if (!row) throw new AppException(40401, "绘本作品不存在", HttpStatus.NOT_FOUND);
    const characters = await this.resolveCharacters(userId, charactersOf(row.characters), row.style);
    return { ...row, characters: characters as unknown as Prisma.JsonValue };
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

  async pageImage(subject: ProfileSubject, id: string, position: number) {
    const book = await this.playback(subject, id);
    const imageUrl = book.pages.find((page) => page.position === position)?.imageUrl;
    if (!imageUrl) throw new AppException(40401, "本页图片不存在", HttpStatus.NOT_FOUND);
    return this.mediaService.readPictureBookStoredImage(imageUrl);
  }

  async pageAudio(subject: ProfileSubject, id: string, position: number) {
    const book = await this.playback(subject, id);
    const audioUrl = book.pages.find((page) => page.position === position)?.audioUrl;
    if (!audioUrl) throw new AppException(40401, "本页语音不存在", HttpStatus.NOT_FOUND);
    return this.mediaService.readPictureBookStoredAudio(audioUrl);
  }

  async update(userId: string, id: string, dto: UpdatePictureBookDto) {
    if (dto.style !== undefined) await this.validateCustomStyle(userId, dto.style.trim());
    if (dto.characters) await this.resolveCharacters(userId, dto.characters, dto.style ?? "watercolor");
    return this.mutate(userId, id, (book) => {
      const characters = dto.characters?.slice(0, 9).map((item) => {
        const original = charactersOf(book.characters).find(role => role.id === item.id && role.name === item.name.trim());
        const legacy = original?.legacyImageUrl && original.legacyStyle && item.imageUrl === original.imageUrl
          ? { legacyImageUrl: original.legacyImageUrl, legacyStyle: original.legacyStyle } : {};
        return { ...(item.id ? { id: item.id.trim() } : {}), name: item.name.trim(), description: item.description.trim(), imageUrl: null, ...legacy };
      });
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
      "同时从用户的原始需求与最新沟通中提取已确认的全部出场角色，包含名字和外貌/性格描述；不要把助手尚未获得用户确认的建议当成出场角色。角色最多9个。",
      "已选的“小男孩”“小女孩”是形象占位名称。当用户给它们起名时，characters 仅输出新名字，并加 previousName 为原占位名，不重复输出原名称；已有其他角色改名也用 previousName 对应。用户说沿用已选形象时，保留其外貌描述且 definedAppearance=false，系统提供的既有外貌不视作用户新增外貌要求。",
      "严格只输出 JSON：{\"reply\":\"给用户的简短回复\",\"characters\":[{\"name\":\"角色名字\",\"description\":\"外貌与性格描述\",\"kind\":\"boy或girl或other\",\"definedAppearance\":false,\"replaceAppearance\":false}]}。definedAppearance 仅当用户明确指定了发型/毛色/服饰等外貌细节时为true，否则为false。replaceAppearance 仅当用户在最新沟通中明确要求修改已有角色外貌时为true；这时完整描述修改后的外貌。未要求修改的角色保持false。已有角色沿用其名字，不擅自改名。",
      `原始需求：${book.brief}`,
      `适合人群：${book.audience || "待讨论"}`,
      `已有出场角色：${charactersOf(book.characters).map(item => `${item.name}：${item.description}`).join("；") || "无"}`,
      `讨论记录：\n${messages.map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.content}`).join("\n")}`
    ].join("\n\n");
    const answer = await this.runTextTask(subject, "picture-book-discuss", prompt);
    let discussion;
    try { discussion = parseCharacterDiscussion(answer); }
    catch (error) { throw new AppException(50201, error instanceof Error ? error.message : "故事讨论解析失败", HttpStatus.BAD_GATEWAY); }
    return this.mutate(subject.userId, id, (current) => {
      if (JSON.stringify(current.characters) !== JSON.stringify(book.characters)) throw new AppException(40901, "角色已在其他页面修改，已保留新选择，请重新发送讨论", HttpStatus.CONFLICT);
      let characters;
      try { characters = mergeDiscussedCharacters(charactersOf(current.characters), discussion.characters); }
      catch (error) { throw new AppException(40001, error instanceof Error ? error.message : "角色信息无法更新，请重试", HttpStatus.BAD_REQUEST); }
      return {
        messages: [...messagesOf(current.messages), { role: "assistant", content: discussion.reply }].slice(-30) as unknown as Prisma.InputJsonValue,
        characters: characters as unknown as Prisma.InputJsonValue
      };
    });
  }

  async outline(subject: ProfileSubject & { mode: "ACCOUNT" }, id: string) {
    const book = await this.get(subject.userId, id);
    const prompt = buildOutlinePrompt({
      brief: book.brief, audience: book.audience, aspectRatio: book.aspectRatio,
      theme: book.theme, plot: book.plot, pageCount: book.pageCount,
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
    const styleImage = await this.styleReference(subject.userId, book.style);
    const characterDescription = charactersOf(book.characters).map((item) => `${item.name}：${item.description}`).join("；");
    const prompt = [
      "创作儿童绘本插画。第1张图片仅作为绘画风格参考，沿用其笔触、材质、配色和表现方式，不复制参考图中的人物、动物或场景。第2张及后续图片作为角色外观参考。保持整本绘本角色外观一致。",
      `目标画面比例：${book.aspectRatio}。`,
      characterDescription ? `角色：${characterDescription}` : "",
      page.imagePrompt,
      "画面中不要出现文字、字幕、水印或边框。"
    ].filter(Boolean).join("\n").slice(0, 2000);
    const size = pictureBookImageSize(book.aspectRatio);
    const referenceImages = [{ name: `风格参考图.${styleImage.mimetype === "image/webp" ? "webp" : styleImage.mimetype === "image/png" ? "png" : "jpg"}`, type: "image" as const, mimeType: styleImage.mimetype, size: styleImage.buffer.length, dataUrl: `data:${styleImage.mimetype};base64,${styleImage.buffer.toString("base64")}` }, ...await this.localCharacterReferences(subject.userId, charactersOf(book.characters), book.style)];
    const result = await this.aiService.generatePictureBookImage(subject, {
      prompt, modelInstanceId: dto.modelInstanceId, count: 1, referenceImages, ...size
    });
    const image = result.images[0];
    if (!image) throw new AppException(50201, "图片生成失败，请稍后重试", HttpStatus.BAD_GATEWAY);
    return this.mutate(subject.userId, id, (current) => {
      const pages = pagesOf(current.pages);
      const index = pageIndex(pages, position);
      if (current.style !== book.style) throw new AppException(40901, "画风已修改，请重新生成图片", HttpStatus.CONFLICT);
      if (JSON.stringify(current.characters) !== JSON.stringify(book.characters)) throw new AppException(40901, "角色形象已修改，请重新生成图片", HttpStatus.CONFLICT);
      if (pages[index]!.imagePrompt !== page.imagePrompt) throw new AppException(40901, "画面提示词已修改，请重新生成", HttpStatus.CONFLICT);
      pages[index] = { ...pages[index]!, imageUrl: image.url, imageTaskId: result.id };
      return { pages: pages as unknown as Prisma.InputJsonValue };
    });
  }

  async uploadStyleReference(userId: string, file?: UploadedFileLike) {
    const asset = await this.mediaService.uploadUserPictureBookImage(userId, inspectPictureBookImage(file), true);
    return { style: `custom:${asset.id}` };
  }

  private async ownedCustomStyleAsset(userId: string, assetId: string) {
    customPictureBookStyleAssetId(`custom:${assetId}`);
    const asset = await this.prisma.mediaAsset.findFirst({ where: {
      id: assetId, createdByUserId: userId, createdByAdminId: null, mediaType: "IMAGE", sourceType: "USER_UPLOAD", storageProvider: "S3"
    } });
    if (!asset) throw new AppException(40401, "自定义风格参考图不存在，请重新上传", HttpStatus.NOT_FOUND);
    return asset;
  }

  private async validateCustomStyle(userId: string, style: string) {
    const assetId = customPictureBookStyleAssetId(style);
    if (assetId) await this.ownedCustomStyleAsset(userId, assetId);
  }

  async customStyleImage(userId: string, assetId: string) {
    const asset = await this.ownedCustomStyleAsset(userId, assetId);
    return this.mediaService.readPictureBookStoredImage(asset.url);
  }

  private async styleReference(userId: string, value: string) {
    const assetId = customPictureBookStyleAssetId(value);
    if (assetId) return this.customStyleImage(userId, assetId);
    const style = selectedPictureBookStyle(value, await this.systemConfigService.pictureBookStyles());
    if (!style) throw new AppException(40001, "请重新选择绘画风格或上传风格参考图", HttpStatus.BAD_REQUEST);
    await this.systemConfigService.assertPictureBookStyleImage(style);
    if (style.imageUrl.startsWith("/picture-book-styles/")) {
      try { return { buffer: await readFile(new URL(`../../../web/public${style.imageUrl}`, import.meta.url)), mimetype: "image/webp" }; }
      catch { throw new AppException(50201, "风格参考图无法读取，请在后台重新上传参考图", HttpStatus.BAD_GATEWAY); }
    }
    return this.mediaService.readPictureBookStoredImage(style.imageUrl);
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

  private async resolveCharacters(userId: string, selected: PictureBookCharacter[], style: string) {
    const ids = selected.flatMap(item => item.id && !item.id.startsWith("preset:") ? [item.id] : []);
    const own = ids.length ? await this.prisma.pictureBookCharacter.findMany({ where: { id: { in: ids }, userId } }) : [];
    return selected.slice(0, 9).map(item => {
      const preset = item.id ? officialCharacter(item.id, style) ?? presets.find(role => role.id === item.id) : null;
      const owned = own.find(role => role.id === item.id);
      if (item.id && !preset && !owned) throw new AppException(40001, "角色不存在或无权使用，请重新选择形象", HttpStatus.BAD_REQUEST);
      const legacy = item.legacyImageUrl && item.legacyStyle ? { legacyImageUrl: item.legacyImageUrl, legacyStyle: item.legacyStyle } : {};
      const legacyImage = owned && item.legacyStyle && characterStyleKey(item.legacyStyle) === characterStyleKey(style) ? item.legacyImageUrl : null;
      return { ...(item.id ? { id: item.id } : {}), name: item.name, description: preset?.description ?? owned?.description ?? item.description,
        ...legacy, imageUrl: legacyImage ?? preset?.imageUrl ?? (owned ? characterImageForStyle(owned, style) : null) };
    });
  }

  async listCharacters(userId: string, style = "watercolor") {
    await this.validateCustomStyle(userId, style);
    const own = await this.prisma.pictureBookCharacter.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 100 });
    return [...officialCharacters.map(item => officialCharacter(item.id, style)!), ...own.map(item => ({ ...item, imageUrl: characterImageForStyle(item, style) }))];
  }

  async createCharacter(userId: string, dto: CreatePictureBookCharacterDto) {
    return this.prisma.pictureBookCharacter.create({ data: {
      userId, name: dto.name.trim(), description: dto.description.trim(), imageUrl: null
    } });
  }

  async generateCharacterImage(subject: ProfileSubject & { mode: "ACCOUNT" }, id: string, modelInstanceId?: string, style = "watercolor") {
    const preset = officialCharacter(id, "flat");
    const character = preset ?? await this.prisma.pictureBookCharacter.findFirst({ where: { id, userId: subject.userId } });
    if (!character) throw new AppException(40401, "角色不存在", HttpStatus.NOT_FOUND);
    this.mediaService.assertPictureBookR2Ready();
    const styleImage = await this.styleReference(subject.userId, style);
    const source = preset
      ? { buffer: await readFile(new URL(`../../../web/public/picture-book-characters/${id.slice(7)}/flat.webp`, import.meta.url)), mimetype: "image/webp" }
      : character.imageUrl ? await this.ownedCharacterImage(subject.userId, character.imageUrl) : null;
    const referenceImages = [imageReference(styleImage, "风格参考图"), ...(source ? [imageReference(source, "角色身份参考图")] : [])];
    const result = await this.aiService.generatePictureBookImage(subject, {
      prompt: `儿童绘本角色参考图。第1张仅参考绘画风格，不复制场景或人物；第2张如有则保持角色身份、发型、服装和标志颜色，只调整绘画表现。单个角色，干净米白背景，正面全身，头脚完整，细节清楚，无文字。${character.name}：${character.description}`.slice(0, 2000),
      modelInstanceId, width: 1024, height: 1024, count: 1, referenceImages
    });
    const url = result.images[0]?.url;
    if (!url) throw new AppException(50201, "角色形象生成失败", HttpStatus.BAD_GATEWAY);
    if (preset) {
      const created = await this.prisma.pictureBookCharacter.create({ data: { userId: subject.userId, name: preset.name, description: preset.description,
        imageUrl: url, styleImages: { [characterStyleKey(style)]: url } } });
      return { ...created, imageUrl: url };
    }
    return this.saveCharacterStyle(subject.userId, id, character.imageUrl, style, url, characterImageForStyle("styleImages" in character ? character : {}, style));
  }

  async uploadCharacterImage(userId: string, id: string, file?: UploadedFileLike, style = "watercolor") {
    const character = await this.prisma.pictureBookCharacter.findFirst({ where: { id, userId } });
    if (!character) throw new AppException(40401, "角色不存在", HttpStatus.NOT_FOUND);
    await this.validateCustomStyle(userId, style);
    const asset = await this.mediaService.uploadUserPictureBookImage(userId, inspectPictureBookImage(file), true);
    return this.saveCharacterStyle(userId, id, character.imageUrl, style, asset.url, characterImageForStyle(character, style), true);
  }

  private async saveCharacterStyle(userId: string, id: string, sourceUrl: string | null | undefined, style: string, url: string, expectedImage: string | null, uploaded = false) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.prisma.pictureBookCharacter.findFirst({ where: { id, userId } });
      if (!current) throw new AppException(40401, "角色不存在", HttpStatus.NOT_FOUND);
      if (current.imageUrl !== sourceUrl) throw new AppException(40901, "角色形象已修改，请重新生成", HttpStatus.CONFLICT);
      if (characterImageForStyle(current, style) !== expectedImage) throw new AppException(40901, "当前风格的角色形象已修改，请重试", HttpStatus.CONFLICT);
      const images = current.styleImages && typeof current.styleImages === "object" && !Array.isArray(current.styleImages) ? current.styleImages : {};
      const updated = await this.prisma.$transaction(async transaction => {
        const result = await transaction.pictureBookCharacter.updateMany({ where: { id, userId, updatedAt: current.updatedAt },
          data: { imageUrl: uploaded ? url : current.imageUrl ?? url, styleImages: { ...images, [characterStyleKey(style)]: url } } });
        if (result.count === 1) await transaction.pictureBook.updateMany({ where: { userId, characters: { array_contains: [{ id }] } }, data: { version: { increment: 1 } } });
        return result;
      });
      if (updated.count === 1) return { ...current, imageUrl: url };
    }
    throw new AppException(40901, "角色已更新，请刷新后重试", HttpStatus.CONFLICT);
  }

  private async ownedCharacterImage(userId: string, url: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { url, createdByUserId: userId, mediaType: "IMAGE" } });
    if (!asset) return null;
    if (asset.storageProvider === "S3") return this.mediaService.readPictureBookStoredImage(asset.url);
    const local = await this.mediaService.getLocalFile(asset.filename);
    return { buffer: await readFile(local.filepath), mimetype: local.mimeType };
  }

  private async localCharacterReferences(userId: string, selected: PictureBookCharacter[], style = "watercolor") {
    const ids = selected.flatMap(item => item.id && !item.id.startsWith("preset:") ? [item.id] : []).slice(0, 9);
    const owned = ids.length ? await this.prisma.pictureBookCharacter.findMany({ where: { id: { in: ids }, userId } }) : [];
    const references = [];
    for (const item of selected.slice(0, 9)) {
      const preset = item.id ? officialCharacter(item.id, style) : null;
      if (preset) {
        if (!preset.imageUrl) throw new AppException(40001, `${item.name}暂无当前风格形象，请上传或生成`, HttpStatus.BAD_REQUEST);
        const file = { buffer: await readFile(new URL(`../../../web/public/picture-book-characters/${preset.id.slice(7)}/${characterStyleKey(style)}.webp`, import.meta.url)), mimetype: "image/webp" };
        references.push(imageReference(file, item.name));
        continue;
      }
      const character = owned.find(role => role.id === item.id);
      if (!character) continue;
      const url = item.legacyStyle && characterStyleKey(item.legacyStyle) === characterStyleKey(style) ? item.legacyImageUrl ?? characterImageForStyle(character, style) : characterImageForStyle(character, style);
      if (!url) throw new AppException(40001, `${item.name}暂无当前风格形象，请上传或生成`, HttpStatus.BAD_REQUEST);
      const file = await this.ownedCharacterImage(userId, url);
      if (!file) throw new AppException(40001, `${item.name}参考图片不可用，请重新上传`, HttpStatus.BAD_REQUEST);
      references.push(imageReference(file, item.name));
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

function imageReference(file: { buffer: Buffer; mimetype: string }, name: string) {
  return { name: `${name}.webp`, type: "image" as const, mimeType: file.mimetype, size: file.buffer.length,
    dataUrl: `data:${file.mimetype};base64,${file.buffer.toString("base64")}` };
}

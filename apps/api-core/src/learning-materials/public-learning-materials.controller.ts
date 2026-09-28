import { createReadStream } from "node:fs";
import { Controller, Get, Inject, Param, Query, Res } from "@nestjs/common";
import { successResponse } from "../common/api-response.js";
import { LearningMaterialsService } from "./learning-materials.service.js";

interface WritableResponse {
  redirect(url: string): void;
  setHeader(name: string, value: string | number): void;
  status(code: number): { end(body?: string): void };
  end(body?: string | Buffer): void;
}

@Controller("public/textbooks")
export class PublicLearningMaterialsController {
  constructor(
    @Inject(LearningMaterialsService) private readonly learningMaterialsService: LearningMaterialsService
  ) {}

  @Get()
  async listTextbooks(@Query() query: Record<string, string | undefined>) {
    return successResponse(await this.learningMaterialsService.listPublicTextbooks(query));
  }

  @Get("sitemap-entries")
  async listTextbookSitemapEntries() {
    return successResponse(await this.learningMaterialsService.listPublicTextbookSitemapEntries());
  }

  @Get(":id/download/:format")
  async downloadTextbook(
    @Param("id") id: string,
    @Param("format") format: string,
    @Res() response: unknown
  ) {
    const download = await this.learningMaterialsService.getPublicTextbookDownload(id, format);
    const res = response as WritableResponse;

    if ("redirectUrl" in download) {
      res.redirect(download.redirectUrl);
      return;
    }

    res.setHeader("Content-Type", download.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${download.filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    res.end(download.content);
  }

  @Get(":id/cover")
  async getTextbookCover(@Param("id") id: string, @Res() response: unknown) {
    const cover = await this.learningMaterialsService.getPublicTextbookCover(id);
    const res = response as WritableResponse;

    if ("redirectUrl" in cover) {
      res.redirect(cover.redirectUrl);
      return;
    }

    res.setHeader("Content-Type", cover.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${cover.filename}"`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(cover.content);
  }

  @Get(":id/backup-pdf")
  async downloadBackupTextbookPdf(@Param("id") id: string, @Res() response: unknown) {
    const download = await this.learningMaterialsService.getPublicTextbookBackupDownload(id);
    const res = response as WritableResponse;

    res.setHeader("Content-Type", download.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${download.filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    createReadStream(download.filePath).pipe(res as WritableResponse & NodeJS.WritableStream);
  }

  @Get(":slug/markdown")
  async getTextbookMarkdown(@Param("slug") slug: string) {
    return successResponse(await this.learningMaterialsService.getPublicTextbookMarkdown(slug));
  }

  @Get(":id/markdown-assets/:filename")
  async getTextbookMarkdownAsset(
    @Param("id") id: string,
    @Param("filename") filename: string,
    @Res() response: unknown
  ) {
    const asset = await this.learningMaterialsService.getPublicTextbookMarkdownAsset(id, filename);
    const res = response as WritableResponse;

    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${asset.filename}"`);
    res.setHeader("Cache-Control", "public, max-age=86400");

    if ("filePath" in asset) {
      createReadStream(asset.filePath).pipe(res as WritableResponse & NodeJS.WritableStream);
      return;
    }

    res.end(asset.content);
  }

  @Get(":slug")
  async getTextbook(@Param("slug") slug: string) {
    return successResponse(await this.learningMaterialsService.getPublicTextbook(slug));
  }
}

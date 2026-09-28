import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { successResponse } from "../common/api-response.js";
import { writeAdminOperationLog } from "../security/admin-operation-log.js";
import type { HeaderRequestLike } from "../security/request-types.js";
import { CmsService } from "./cms.service.js";
import { CreateArticleDto, UpdateArticleDto } from "./dto/article.dto.js";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto.js";
import { CreatePageDto, UpdatePageDto } from "./dto/page.dto.js";
import { CreateTagDto, UpdateTagDto } from "./dto/tag.dto.js";

@Controller("cms")
export class CmsController {
  constructor(
    @Inject(CmsService) private readonly cmsService: CmsService,
    @Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService
  ) {}

  @Get("categories")
  async listCategories(@Req() request: unknown) {
    await this.requireAdmin(request);
    return successResponse(await this.cmsService.listCategories());
  }

  @Post("categories")
  async createCategory(@Req() request: unknown, @Body() dto: CreateCategoryDto) {
    const admin = await this.requireAdmin(request);
    const category = await this.cmsService.createCategory(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_CATEGORY",
      resourceType: "ARTICLE_CATEGORY",
      resourceId: category.id,
      description: `创建文章分类：${category.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(category);
  }

  @Patch("categories/:id")
  async updateCategory(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto
  ) {
    const admin = await this.requireAdmin(request);
    const category = await this.cmsService.updateCategory(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_CATEGORY",
      resourceType: "ARTICLE_CATEGORY",
      resourceId: category.id,
      description: `编辑文章分类：${category.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(category);
  }

  @Delete("categories/:id")
  async deleteCategory(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.requireAdmin(request);
    const result = await this.cmsService.deleteCategory(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_CATEGORY",
      resourceType: "ARTICLE_CATEGORY",
      resourceId: id,
      description: "删除文章分类",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Get("articles")
  async listArticles(@Req() request: unknown) {
    await this.requireAdmin(request);
    return successResponse(await this.cmsService.listArticles());
  }

  @Post("articles")
  async createArticle(@Req() request: unknown, @Body() dto: CreateArticleDto) {
    const admin = await this.requireAdmin(request);
    const article = await this.cmsService.createArticle(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_ARTICLE",
      resourceType: "ARTICLE",
      resourceId: article.id,
      description: `创建文章：${article.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(article);
  }

  @Patch("articles/:id")
  async updateArticle(
    @Req() request: unknown,
    @Param("id") id: string,
    @Body() dto: UpdateArticleDto
  ) {
    const admin = await this.requireAdmin(request);
    const article = await this.cmsService.updateArticle(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_ARTICLE",
      resourceType: "ARTICLE",
      resourceId: article.id,
      description: `编辑文章：${article.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(article);
  }

  @Delete("articles/:id")
  async deleteArticle(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.requireAdmin(request);
    const result = await this.cmsService.deleteArticle(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_ARTICLE",
      resourceType: "ARTICLE",
      resourceId: id,
      description: "删除文章",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Post("articles/:id/publish")
  async publishArticle(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.requireAdmin(request);
    const article = await this.cmsService.publishArticle(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "PUBLISH_ARTICLE",
      resourceType: "ARTICLE",
      resourceId: article.id,
      description: `发布文章：${article.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(article);
  }

  @Post("articles/:id/archive")
  async archiveArticle(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.requireAdmin(request);
    const article = await this.cmsService.archiveArticle(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "ARCHIVE_ARTICLE",
      resourceType: "ARTICLE",
      resourceId: article.id,
      description: `下架文章：${article.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(article);
  }

  @Get("articles/:id/preview")
  async previewArticle(@Req() request: unknown, @Param("id") id: string) {
    await this.requireAdmin(request);

    return successResponse(await this.cmsService.previewArticle(id));
  }

  @Get("tags")
  async listTags(@Req() request: unknown) {
    await this.requireAdmin(request);
    return successResponse(await this.cmsService.listTags());
  }

  @Post("tags")
  async createTag(@Req() request: unknown, @Body() dto: CreateTagDto) {
    const admin = await this.requireAdmin(request);
    const tag = await this.cmsService.createTag(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_TAG",
      resourceType: "TAG",
      resourceId: tag.id,
      description: `创建文章标签：${tag.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(tag);
  }

  @Patch("tags/:id")
  async updateTag(@Req() request: unknown, @Param("id") id: string, @Body() dto: UpdateTagDto) {
    const admin = await this.requireAdmin(request);
    const tag = await this.cmsService.updateTag(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_TAG",
      resourceType: "TAG",
      resourceId: tag.id,
      description: `编辑文章标签：${tag.name}`,
      request: request as HeaderRequestLike
    });

    return successResponse(tag);
  }

  @Delete("tags/:id")
  async deleteTag(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.requireAdmin(request);
    const result = await this.cmsService.deleteTag(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_TAG",
      resourceType: "TAG",
      resourceId: id,
      description: "删除文章标签",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Post("scheduled/publish-due")
  async publishDue(@Req() request: unknown) {
    const admin = await this.requireAdmin(request);
    const result = await this.cmsService.publishDueContent();

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "PUBLISH_DUE_CONTENT",
      resourceType: "CMS_SCHEDULE",
      resourceId: "due-content",
      description: `执行定时发布：文章 ${result.articles} 篇，单页 ${result.pages} 个`,
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Get("pages")
  async listPages(@Req() request: unknown) {
    await this.requireAdmin(request);
    return successResponse(await this.cmsService.listPages());
  }

  @Post("pages")
  async createPage(@Req() request: unknown, @Body() dto: CreatePageDto) {
    const admin = await this.requireAdmin(request);
    const page = await this.cmsService.createPage(dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "CREATE_PAGE",
      resourceType: "PAGE",
      resourceId: page.id,
      description: `创建单页：${page.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(page);
  }

  @Patch("pages/:id")
  async updatePage(@Req() request: unknown, @Param("id") id: string, @Body() dto: UpdatePageDto) {
    const admin = await this.requireAdmin(request);
    const page = await this.cmsService.updatePage(id, dto);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "UPDATE_PAGE",
      resourceType: "PAGE",
      resourceId: page.id,
      description: `编辑单页：${page.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(page);
  }

  @Delete("pages/:id")
  async deletePage(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.requireAdmin(request);
    const result = await this.cmsService.deletePage(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "DELETE_PAGE",
      resourceType: "PAGE",
      resourceId: id,
      description: "删除单页",
      request: request as HeaderRequestLike
    });

    return successResponse(result);
  }

  @Post("pages/:id/publish")
  async publishPage(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.requireAdmin(request);
    const page = await this.cmsService.publishPage(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "PUBLISH_PAGE",
      resourceType: "PAGE",
      resourceId: page.id,
      description: `发布单页：${page.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(page);
  }

  @Post("pages/:id/archive")
  async archivePage(@Req() request: unknown, @Param("id") id: string) {
    const admin = await this.requireAdmin(request);
    const page = await this.cmsService.archivePage(id);

    await writeAdminOperationLog({
      adminUserId: admin.id,
      action: "ARCHIVE_PAGE",
      resourceType: "PAGE",
      resourceId: page.id,
      description: `下架单页：${page.title}`,
      request: request as HeaderRequestLike
    });

    return successResponse(page);
  }

  private async requireAdmin(request: unknown) {
    return this.adminAuthService.me(request as never);
  }
}
